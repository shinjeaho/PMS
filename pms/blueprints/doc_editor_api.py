from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from flask import Blueprint, jsonify, request, send_file, session

from ..db import create_connection

bp = Blueprint('doc_editor_api', __name__, url_prefix='/doc_editor_api')

BASE_DIR = Path(__file__).resolve().parents[2]
MEETING_UPLOAD_FOLDER = str(BASE_DIR / 'static' / 'uploads' / 'meeting_minutes')
MEETING_STATIC_ROOT = (BASE_DIR / 'static' / 'uploads' / 'meeting_minutes').resolve()


def _table_exists(cursor, table_name: str) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*) AS cnt
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = %s
        """,
        (table_name,),
    )
    row = cursor.fetchone()
    if isinstance(row, dict):
        return int(row.get('cnt') or 0) > 0
    return bool(row and row[0])


def _column_exists(cursor, table_name: str, column_name: str) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*) AS cnt
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s
        """,
        (table_name, column_name),
    )
    row = cursor.fetchone()
    if isinstance(row, dict):
        return int(row.get('cnt') or 0) > 0
    return bool(row and row[0])


def _column_collation(cursor, table_name: str, column_name: str) -> str | None:
    cursor.execute(
        """
        SELECT collation_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s
        LIMIT 1
        """,
        (table_name, column_name),
    )
    row = cursor.fetchone()
    if isinstance(row, dict):
        return row.get('collation_name') or row.get('COLLATION_NAME')
    if row and len(row) > 0:
        return row[0]
    return None


def _meeting_viewers_fk_column(cursor) -> str:
    if _column_exists(cursor, 'meeting_viewers', 'meeting_id'):
        return 'meeting_id'
    return 'record_id'


def _meeting_viewers_user_column(cursor) -> str:
    if _column_exists(cursor, 'meeting_viewers', 'user_name'):
        return 'user_name'
    if _column_exists(cursor, 'meeting_viewers', 'viewer_name'):
        return 'viewer_name'
    return 'user_name'


def _meeting_viewers_has_department(cursor) -> bool:
    return _column_exists(cursor, 'meeting_viewers', 'department')


def _meeting_viewers_has_position(cursor) -> bool:
    return _column_exists(cursor, 'meeting_viewers', 'position')


def _meeting_viewers_time_column(cursor) -> str | None:
    if _column_exists(cursor, 'meeting_viewers', 'viewed_at'):
        return 'viewed_at'
    if _column_exists(cursor, 'meeting_viewers', 'create_at'):
        return 'create_at'
    if _column_exists(cursor, 'meeting_viewers', 'created_at'):
        return 'created_at'
    return None


def _meeting_viewers_join_collation(cursor) -> str:
    user_col = _meeting_viewers_user_column(cursor)
    return (
        _column_collation(cursor, 'users', 'Name')
        or _column_collation(cursor, 'meeting_viewers', user_col)
        or 'utf8mb4_unicode_ci'
    )


def _sanitize_filename(filename: str) -> str:
    filename = re.sub(r"[^\w가-힣._-]", "", filename)
    return filename.replace(" ", "_")


def _is_allowed_meeting_attachment(filename: str) -> bool:
    ext = Path(filename or '').suffix.lower()
    return ext in {'.pdf', '.hwp', '.hwpx', '.xls', '.xlsx'}


def _get_viewer_info():
    user = session.get('user') or {}
    name = (user.get('name') or user.get('Name') or '').strip()
    department = (user.get('department') or user.get('Department') or '').strip()
    position = (user.get('position') or user.get('Position') or '').strip()

    if not department or not position:
        conn = create_connection()
        if conn is not None:
            cursor = conn.cursor(dictionary=True)
            try:
                user_id = (user.get('userID') or '').strip()
                row = None
                if user_id:
                    cursor.execute(
                        """
                        SELECT COALESCE(Department, '') AS department,
                               COALESCE(Position, '') AS position
                        FROM users
                        WHERE userID = %s
                        LIMIT 1
                        """,
                        (user_id,),
                    )
                    row = cursor.fetchone()

                if row is None and name and name != '알수없음':
                    cursor.execute(
                        """
                        SELECT COALESCE(Department, '') AS department,
                               COALESCE(Position, '') AS position
                        FROM users
                        WHERE Name = %s
                        LIMIT 1
                        """,
                        (name,),
                    )
                    row = cursor.fetchone()

                if row:
                    if not department:
                        department = (row.get('department') or '').strip()
                    if not position:
                        position = (row.get('position') or '').strip()
            except Exception:
                pass
            finally:
                cursor.close()
                conn.close()

    if not name:
        name = '알수없음'
    if not department:
        department = '-'
    if not position:
        position = '-'

    return {
        'name': name,
        'department': department,
        'position': position,
    }


def _get_session_user_name() -> str:
    user = session.get('user') or {}
    return (user.get('name') or user.get('Name') or '').strip()


def _backfill_meeting_viewers_profile(cursor, meeting_id: str | None = None) -> None:
    has_department = _meeting_viewers_has_department(cursor)
    has_position = _meeting_viewers_has_position(cursor)
    if not has_department and not has_position:
        return

    fk_col = _meeting_viewers_fk_column(cursor)
    user_col = _meeting_viewers_user_column(cursor)
    join_collation = _meeting_viewers_join_collation(cursor)
    params = []
    where_clause = ""
    if meeting_id:
        where_clause = f" AND mv.{fk_col} = %s"
        params.append(meeting_id)

    set_clauses = []
    if has_department:
        set_clauses.append("mv.department = COALESCE(NULLIF(TRIM(u.Department), ''), mv.department)")

    if has_position:
        set_clauses.append("mv.position = COALESCE(NULLIF(TRIM(u.Position), ''), mv.position)")

    cursor.execute(
        f"""
        UPDATE meeting_viewers mv
        JOIN users u ON (
            CONVERT(mv.{user_col} USING utf8mb4) COLLATE {join_collation}
            = CONVERT(u.Name USING utf8mb4) COLLATE {join_collation}
        )
        SET {', '.join(set_clauses)}
        WHERE 1=1
          {where_clause}
        """,
        tuple(params),
    )


@bp.route('/projects/suggest', methods=['GET'])
def suggest_projects():
    query = (request.args.get('q') or '').strip()
    if not query:
        return jsonify([])

    conn = create_connection()
    if conn is None:
        return jsonify({'error': 'DB connection failed'}), 500

    cursor = conn.cursor(dictionary=True)
    try:
        like = f"%{query}%"
        sql = """
            SELECT ProjectID AS projectId,
                   ContractCode AS contractCode,
                   ProjectName AS projectName
            FROM projects
            WHERE ContractCode LIKE %s OR ProjectName LIKE %s
            ORDER BY
                ContractCode DESC
            LIMIT 20
        """
        cursor.execute(sql, (like, like))
        results = cursor.fetchall() or []
        return jsonify(results)
    finally:
        cursor.close()
        conn.close()


@bp.route('/meeting/next_number', methods=['GET'])
def next_meeting_number():
    conn = create_connection()
    if conn is None:
        return jsonify({'error': 'DB connection failed'}), 500

    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT MAX(CAST(SUBSTRING_INDEX(doc_number, '-', -1) AS UNSIGNED))
            FROM meeting_files
            """,
        )
        row = cursor.fetchone()
        max_num = int(row[0]) if row and row[0] is not None else 0
        next_num = max_num + 1
        doc_number = str(next_num)
        return jsonify({'docNumber': doc_number})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/meeting/upload_pdf', methods=['POST'])
def upload_meeting_pdf():
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'success': False, 'message': '파일이 선택되지 않았습니다.'}), 400

    filename_lower = file.filename.lower()
    if not filename_lower.endswith('.pdf'):
        return jsonify({'success': False, 'message': 'PDF 파일만 업로드할 수 있습니다.'}), 400

    attachment_files = [f for f in request.files.getlist('attachments') if f and f.filename]
    for attachment in attachment_files:
        if not _is_allowed_meeting_attachment(attachment.filename):
            return jsonify({'success': False, 'message': '첨부파일은 한글/엑셀/PDF 파일만 업로드할 수 있습니다.'}), 400

    doc_number = (request.form.get('docNumber') or '').strip()
    contractcode = (request.form.get('contractcode') or '').strip()
    project_name = (request.form.get('projectName') or '').strip()
    agenda_title = (request.form.get('agendaTitle') or request.form.get('title') or '').strip()
    meeting_date_start = (request.form.get('meetingDateStart') or '').strip()
    meeting_time_start = (request.form.get('meetingTimeStart') or '').strip()
    meeting_time_end = (request.form.get('meetingTimeEnd') or '').strip()

    meeting_datetime = (
        (f"{meeting_date_start} {meeting_time_start}:00" if meeting_date_start and meeting_time_start else '')
        or (request.form.get('meetingDateTimeStart') or '').strip()
        or (request.form.get('meetingDateTime') or '').strip()
        or None
    )

    meeting_end_datetime = (
        (f"{meeting_date_start} {meeting_time_end}:00" if meeting_date_start and meeting_time_end else '')
        or (request.form.get('meetingDateTimeEnd') or '').strip()
        or None
    )
    meeting_place = (request.form.get('meetingPlace') or '').strip() or None
    organizer = (request.form.get('organizer') or '').strip() or None
    attendees = (request.form.get('attendees') or '').strip() or None
    created_at = (request.form.get('createdAt') or '').strip() or datetime.now().strftime('%Y-%m-%d')
    author = (request.form.get('author') or '').strip()
    user_name = (request.form.get('userName') or '').strip()
    if not author:
        author = user_name

    year_folder = os.path.join(MEETING_UPLOAD_FOLDER, datetime.now().strftime('%Y'))
    os.makedirs(year_folder, exist_ok=True)

    safe_name = _sanitize_filename(file.filename)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    name_parts = [p for p in (doc_number, contractcode, timestamp, safe_name) if p]
    final_name = "_".join(name_parts)
    file_path = os.path.join(year_folder, final_name)
    attachment_folder = os.path.join(year_folder, 'attachments')
    os.makedirs(attachment_folder, exist_ok=True)
    saved_attachments = []

    try:
        if contractcode:
            conn = create_connection()
            if conn is None:
                return jsonify({'success': False, 'message': 'DB connection failed'}), 500
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    SELECT 1
                    FROM projects
                    WHERE ContractCode = %s
                    LIMIT 1
                    """,
                    (contractcode,),
                )
                project_exists = cursor.fetchone() is not None
            finally:
                cursor.close()
                conn.close()

            if not project_exists:
                return jsonify({'success': False, 'message': '일치하는 사업번호가 없습니다.'}), 400

        file.save(file_path)
        file_url = f"/static/uploads/meeting_minutes/{datetime.now().strftime('%Y')}/{final_name}"
        file_size = os.path.getsize(file_path)

        for attachment in attachment_files:
            safe_attachment_name = _sanitize_filename(attachment.filename)
            attachment_name_parts = [
                p for p in (doc_number, contractcode, timestamp, 'att', safe_attachment_name) if p
            ]
            final_attachment_name = "_".join(attachment_name_parts)
            attachment_path = os.path.join(attachment_folder, final_attachment_name)
            attachment.save(attachment_path)
            attachment_url = (
                f"/static/uploads/meeting_minutes/{datetime.now().strftime('%Y')}/attachments/{final_attachment_name}"
            )
            attachment_size = os.path.getsize(attachment_path)
            saved_attachments.append({
                'fileUrl': attachment_url,
                'originalName': attachment.filename,
                'fileSize': attachment_size,
            })

        conn = create_connection()
        if conn is None:
            return jsonify({'success': False, 'message': 'DB connection failed'}), 500
        cursor = conn.cursor()
        try:
            has_user_name_col = _column_exists(cursor, 'meeting_files', 'user_name')
            has_attachment_table = _table_exists(cursor, 'meeting_file_attachments')

            insert_cols = [
                'doc_number',
                'contractcode',
                'project_name',
                'agenda_title',
                'meeting_datetime',
                'meeting_end_datetime',
                'meeting_place',
                'organizer',
                'attendees',
                'created_at',
                'author',
                'file_path',
                'original_name',
                'file_size',
            ]
            insert_vals = [
                doc_number,
                contractcode or None,
                project_name or None,
                agenda_title or None,
                meeting_datetime,
                meeting_end_datetime,
                meeting_place,
                organizer,
                attendees,
                created_at,
                author or None,
                file_url,
                file.filename,
                file_size,
            ]
            if has_user_name_col:
                insert_cols.append('user_name')
                insert_vals.append(user_name or None)
            insert_cols.append('create_at')

            placeholders = ', '.join(['%s'] * len(insert_vals))
            sql = f"""
                INSERT INTO meeting_files
                ({', '.join(insert_cols)})
                VALUES ({placeholders}, NOW())
            """
            cursor.execute(sql, tuple(insert_vals))
            record_id = cursor.lastrowid

            if saved_attachments:
                for attachment in saved_attachments:
                    cursor.execute(
                        """
                        INSERT INTO meeting_file_attachments
                        (meeting_id, file_path, original_name, file_size, create_at)
                        VALUES (%s, %s, %s, %s, NOW())
                        """,
                        (
                            record_id,
                            attachment.get('fileUrl'),
                            attachment.get('originalName'),
                            attachment.get('fileSize'),
                        ),
                    )

            conn.commit()
        except Exception as e:
            conn.rollback()
            return jsonify({'success': False, 'message': str(e)}), 500
        finally:
            cursor.close()
            conn.close()

        return jsonify({
            'success': True,
            'fileUrl': file_url,
            'originalName': file.filename,
            'recordId': record_id,
            'title': agenda_title,
            'projectName': project_name,
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@bp.route('/meeting/update', methods=['POST'])
@bp.route('/meeting/update/', methods=['POST'])
def update_meeting_pdf():
    meeting_id = (request.form.get('meetingId') or '').strip()
    if not meeting_id:
        return jsonify({'success': False, 'message': 'meeting_id가 필요합니다.'}), 400

    file = request.files.get('file')
    if file and file.filename:
        filename_lower = file.filename.lower()
        if not filename_lower.endswith('.pdf'):
            return jsonify({'success': False, 'message': 'PDF 파일만 업로드할 수 있습니다.'}), 400
    else:
        file = None

    attachment_files = [f for f in request.files.getlist('attachments') if f and f.filename]
    for attachment in attachment_files:
        if not _is_allowed_meeting_attachment(attachment.filename):
            return jsonify({'success': False, 'message': '첨부파일은 한글/엑셀/PDF 파일만 업로드할 수 있습니다.'}), 400

    doc_number = (request.form.get('docNumber') or '').strip()
    contractcode = (request.form.get('contractcode') or '').strip()
    project_name = (request.form.get('projectName') or '').strip()
    agenda_title = (request.form.get('agendaTitle') or request.form.get('title') or '').strip()
    meeting_date_start = (request.form.get('meetingDateStart') or '').strip()
    meeting_time_start = (request.form.get('meetingTimeStart') or '').strip()
    meeting_time_end = (request.form.get('meetingTimeEnd') or '').strip()

    meeting_datetime = (
        (f"{meeting_date_start} {meeting_time_start}:00" if meeting_date_start and meeting_time_start else '')
        or (request.form.get('meetingDateTimeStart') or '').strip()
        or (request.form.get('meetingDateTime') or '').strip()
        or None
    )
    meeting_end_datetime = (
        (f"{meeting_date_start} {meeting_time_end}:00" if meeting_date_start and meeting_time_end else '')
        or (request.form.get('meetingDateTimeEnd') or '').strip()
        or None
    )

    meeting_place = (request.form.get('meetingPlace') or '').strip() or None
    organizer = (request.form.get('organizer') or '').strip() or None
    attendees = (request.form.get('attendees') or '').strip() or None
    created_at = (request.form.get('createdAt') or '').strip() or datetime.now().strftime('%Y-%m-%d')
    author = (request.form.get('author') or '').strip()
    user_name = (request.form.get('userName') or '').strip()
    if not author:
        author = user_name

    conn = create_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'DB connection failed'}), 500

    cursor = conn.cursor(dictionary=True)

    old_file_url = ''
    file_url = None
    file_size = None
    file_original_name = None
    new_pdf_disk_path = None
    saved_attachments = []
    attachment_saved_paths: list[str] = []

    try:
        current_user_name = _get_session_user_name()

        cursor.execute(
            """
            SELECT id, file_path, original_name, file_size, author
            FROM meeting_files
            WHERE id = %s
            LIMIT 1
            """,
            (meeting_id,),
        )
        existing = cursor.fetchone()
        if not existing:
            return jsonify({'success': False, 'message': '회의록 데이터를 찾을 수 없습니다.'}), 404

        existing_author = (existing.get('author') or '').strip()
        if not current_user_name:
            return jsonify({'success': False, 'message': '로그인 사용자 정보가 없어 수정할 수 없습니다.'}), 403
        if existing_author and existing_author != current_user_name:
            return jsonify({'success': False, 'message': '작성자만 수정할 수 있습니다.'}), 403

        old_file_url = (existing.get('file_path') or '').strip()

        current_year = datetime.now().strftime('%Y')
        year_folder = os.path.join(MEETING_UPLOAD_FOLDER, current_year)
        os.makedirs(year_folder, exist_ok=True)
        attachment_folder = os.path.join(year_folder, 'attachments')
        os.makedirs(attachment_folder, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        if file is not None:
            safe_name = _sanitize_filename(file.filename)
            name_parts = [p for p in (doc_number, contractcode, timestamp, safe_name) if p]
            final_name = "_".join(name_parts)
            new_pdf_disk_path = os.path.join(year_folder, final_name)
            file.save(new_pdf_disk_path)
            file_url = f"/static/uploads/meeting_minutes/{current_year}/{final_name}"
            file_size = os.path.getsize(new_pdf_disk_path)
            file_original_name = file.filename

        for attachment in attachment_files:
            safe_attachment_name = _sanitize_filename(attachment.filename)
            attachment_name_parts = [
                p for p in (doc_number, contractcode, timestamp, 'att', safe_attachment_name) if p
            ]
            final_attachment_name = "_".join(attachment_name_parts)
            attachment_path = os.path.join(attachment_folder, final_attachment_name)
            attachment.save(attachment_path)
            attachment_saved_paths.append(attachment_path)
            attachment_url = f"/static/uploads/meeting_minutes/{current_year}/attachments/{final_attachment_name}"
            attachment_size = os.path.getsize(attachment_path)
            saved_attachments.append({
                'fileUrl': attachment_url,
                'originalName': attachment.filename,
                'fileSize': attachment_size,
            })

        has_user_name_col = _column_exists(cursor, 'meeting_files', 'user_name')
        has_attachment_table = _table_exists(cursor, 'meeting_file_attachments')

        update_fields = [
            "doc_number = %s",
            "contractcode = %s",
            "project_name = %s",
            "agenda_title = %s",
            "meeting_datetime = %s",
            "meeting_end_datetime = %s",
            "meeting_place = %s",
            "organizer = %s",
            "attendees = %s",
            "created_at = %s",
            "author = %s",
        ]
        resolved_author = existing_author or current_user_name
        params = [
            doc_number,
            contractcode or None,
            project_name or None,
            agenda_title or None,
            meeting_datetime,
            meeting_end_datetime,
            meeting_place,
            organizer,
            attendees,
            created_at,
            resolved_author,
        ]

        if has_user_name_col:
            update_fields.append("user_name = %s")
            params.append(user_name or None)

        if file is not None:
            update_fields.extend(["file_path = %s", "original_name = %s", "file_size = %s"])
            params.extend([file_url, file_original_name, file_size])

        params.append(meeting_id)
        cursor.execute(
            f"""
            UPDATE meeting_files
            SET {', '.join(update_fields)}
            WHERE id = %s
            """,
            tuple(params),
        )

        if has_attachment_table and saved_attachments:
            for attachment in saved_attachments:
                cursor.execute(
                    """
                    INSERT INTO meeting_file_attachments
                    (meeting_id, file_path, original_name, file_size, create_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    """,
                    (
                        meeting_id,
                        attachment.get('fileUrl'),
                        attachment.get('originalName'),
                        attachment.get('fileSize'),
                    ),
                )

        if has_attachment_table:
            cursor.execute(
                """
                SELECT id, meeting_id, file_path,
                       original_name,
                       COALESCE(file_size, 0) AS file_size,
                       DATE_FORMAT(create_at, '%Y-%m-%d %H:%i') AS create_at
                FROM meeting_file_attachments
                WHERE meeting_id = %s
                ORDER BY id ASC
                """,
                (meeting_id,),
            )
            all_attachments = cursor.fetchall() or []
        else:
            all_attachments = []

        conn.commit()

        if file is not None and old_file_url and old_file_url != file_url:
            old_disk_path = os.path.normpath(os.path.join(BASE_DIR, old_file_url.lstrip('/')))
            try:
                if os.path.exists(old_disk_path):
                    os.remove(old_disk_path)
            except Exception:
                pass

        current_file_url = file_url or old_file_url
        current_original_name = file_original_name or existing.get('original_name') or '회의록.pdf'

        return jsonify({
            'success': True,
            'fileUrl': current_file_url,
            'originalName': current_original_name,
            'recordId': int(meeting_id),
            'title': agenda_title,
            'projectName': project_name,
            'attachments': all_attachments,
        })

    except Exception as e:
        conn.rollback()
        if new_pdf_disk_path:
            try:
                if os.path.exists(new_pdf_disk_path):
                    os.remove(new_pdf_disk_path)
            except Exception:
                pass
        for p in attachment_saved_paths:
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/meeting/list', methods=['GET'])
def list_meeting_files():
    conn = create_connection()
    if conn is None:
        return jsonify({'error': 'DB connection failed'}), 500

    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
                SELECT id, doc_number, contractcode, project_name,
                       agenda_title AS title,
                      DATE_FORMAT(meeting_datetime, '%Y-%m-%d %H:%i') AS meeting_datetime,
                      DATE_FORMAT(meeting_end_datetime, '%Y-%m-%d %H:%i') AS meeting_end_datetime,
                      meeting_place, organizer, attendees,
                       original_name, author,
                       DATE_FORMAT(COALESCE(created_at, DATE(create_at)), '%Y-%m-%d') AS created_at,
                       file_path, COALESCE(view_count, 0) AS view_count
            FROM meeting_files
            ORDER BY create_at DESC, id DESC
            """
        )
        items = cursor.fetchall() or []
        return jsonify({'items': items})
    finally:
        cursor.close()
        conn.close()


@bp.route('/meeting/attachments', methods=['GET'])
def list_meeting_attachments():
    meeting_id = request.args.get('meeting_id')
    if not meeting_id:
        return jsonify({'success': False, 'message': 'meeting_id가 필요합니다.'}), 400

    conn = create_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'DB connection failed'}), 500

    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, meeting_id, file_path,
                   original_name,
                   COALESCE(file_size, 0) AS file_size,
                   DATE_FORMAT(create_at, '%Y-%m-%d %H:%i') AS create_at
            FROM meeting_file_attachments
            WHERE meeting_id = %s
            ORDER BY id ASC
            """,
            (meeting_id,),
        )
        items = cursor.fetchall() or []
        return jsonify({'success': True, 'items': items})
    finally:
        cursor.close()
        conn.close()


@bp.route('/meeting/file', methods=['GET'])
@bp.route('/meeting/file/<record_id>/<path:display_name>', methods=['GET'])
def get_meeting_file(record_id: str | None = None, display_name: str | None = None):
    if not record_id:
        record_id = (request.args.get('id') or '').strip()
    if not record_id:
        return jsonify({'success': False, 'message': 'id가 필요합니다.'}), 400

    conn = create_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'DB connection failed'}), 500

    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT file_path, original_name
            FROM meeting_files
            WHERE id = %s
            LIMIT 1
            """,
            (record_id,),
        )
        row = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

    if not row:
        return jsonify({'success': False, 'message': '파일을 찾을 수 없습니다.'}), 404

    file_url = (row.get('file_path') or '').strip()
    if not file_url:
        return jsonify({'success': False, 'message': '파일 경로가 없습니다.'}), 404

    relative_path = file_url.lstrip('/')
    absolute_path = (BASE_DIR / relative_path).resolve()

    if not str(absolute_path).startswith(str(MEETING_STATIC_ROOT)):
        return jsonify({'success': False, 'message': '허용되지 않은 경로입니다.'}), 400

    if not absolute_path.exists() or not absolute_path.is_file():
        return jsonify({'success': False, 'message': '파일이 존재하지 않습니다.'}), 404

    original_name = (row.get('original_name') or absolute_path.name).strip() or absolute_path.name

    response = send_file(
        str(absolute_path),
        mimetype='application/pdf',
        as_attachment=False,
        download_name=original_name,
        conditional=True,
    )
    ascii_name = re.sub(r'[^A-Za-z0-9._-]', '_', original_name).strip('._') or 'meeting.pdf'
    encoded_name = quote(original_name)
    response.headers['Content-Disposition'] = (
        f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded_name}"
    )
    return response


@bp.route('/meeting/view', methods=['POST'])
def increment_meeting_view():
    data = request.get_json() or {}
    record_id = data.get('id')
    if not record_id:
        return jsonify({'success': False, 'message': 'id가 필요합니다.'}), 400

    viewer = _get_viewer_info()

    conn = create_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'DB connection failed'}), 500

    cursor = conn.cursor(dictionary=True)
    try:
        try:
            fk_col = _meeting_viewers_fk_column(cursor)
            user_col = _meeting_viewers_user_column(cursor)
            has_department = _meeting_viewers_has_department(cursor)
            has_position = _meeting_viewers_has_position(cursor)
            time_col = _meeting_viewers_time_column(cursor)

            department_select = "COALESCE(NULLIF(TRIM(department), ''), '-') AS department" if has_department else "'-' AS department"
            position_select = "COALESCE(NULLIF(TRIM(position), ''), '-') AS position" if has_position else "'-' AS position"
            cursor.execute(
                """
                                SELECT id,
                                             """ + department_select + """,
                                             """ + position_select + """
                FROM meeting_viewers
                WHERE """ + fk_col + """ = %s
                                    AND """ + user_col + """ = %s
                LIMIT 1
                """,
                                (record_id, viewer['name']),
            )
            existing = cursor.fetchone()

            if not existing:
                insert_cols = [fk_col, user_col]
                insert_values = ["%s", "%s"]
                insert_params = [record_id, viewer['name']]

                if has_department:
                    insert_cols.append('department')
                    insert_values.append('%s')
                    insert_params.append(viewer['department'])

                if has_position:
                    insert_cols.append('position')
                    insert_values.append('%s')
                    insert_params.append(viewer['position'])

                if time_col == 'viewed_at':
                    insert_cols.append('viewed_at')
                    insert_values.append('NOW()')

                cursor.execute(
                    """
                    INSERT INTO meeting_viewers
                    (""" + ', '.join(insert_cols) + """)
                    VALUES (""" + ', '.join(insert_values) + """)
                    """,
                    tuple(insert_params),
                )
                cursor.execute(
                    """
                    UPDATE meeting_files
                    SET view_count = COALESCE(view_count, 0) + 1
                    WHERE id = %s
                    """,
                    (record_id,),
                )
                conn.commit()
            else:
                if time_col == 'viewed_at':
                    cursor.execute(
                        """
                        UPDATE meeting_viewers
                        SET viewed_at = NOW()
                        WHERE id = %s
                        """,
                        (existing['id'],),
                    )

                if (
                    has_department and ((existing.get('department') or '-').strip() in ('', '-')) and viewer['department'] != '-'
                ) or (
                    has_position and ((existing.get('position') or '-').strip() in ('', '-')) and viewer['position'] != '-'
                ):
                    update_set = []
                    update_params = []
                    if has_department:
                        update_set.append(
                            """
                            department = CASE
                                WHEN department IS NULL OR TRIM(department) = '' OR department = '-'
                                    THEN %s ELSE department END
                            """
                        )
                        update_params.append(viewer['department'])

                    if has_position:
                        update_set.append(
                            """
                            position = CASE
                                WHEN position IS NULL OR TRIM(position) = '' OR position = '-'
                                    THEN %s ELSE position END
                            """
                        )
                        update_params.append(viewer['position'])

                    cursor.execute(
                        """
                        UPDATE meeting_viewers
                        SET """ + ', '.join(update_set) + """
                        WHERE id = %s
                        """,
                        tuple(update_params + [existing['id']]),
                    )
                conn.commit()
        except Exception as e:
            conn.rollback()
            return jsonify({'success': False, 'message': str(e)}), 500

        cursor.execute(
            """
            SELECT COALESCE(view_count, 0) AS view_count
            FROM meeting_files
            WHERE id = %s
            """,
            (record_id,),
        )
        row = cursor.fetchone()
        return jsonify({'success': True, 'view_count': row.get('view_count', 0) if row else 0})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/meeting/viewers', methods=['GET'])
def list_meeting_viewers():
    meeting_id = request.args.get('meeting_id')
    if not meeting_id:
        return jsonify({'success': False, 'message': 'meeting_id가 필요합니다.'}), 400

    conn = create_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'DB connection failed'}), 500

    cursor = conn.cursor(dictionary=True)
    try:
        try:
            fk_col = _meeting_viewers_fk_column(cursor)
            user_col = _meeting_viewers_user_column(cursor)
            has_department = _meeting_viewers_has_department(cursor)
            has_position = _meeting_viewers_has_position(cursor)
            time_col = _meeting_viewers_time_column(cursor)

            user_select = f"{user_col} AS user_name"
            department_select = "COALESCE(NULLIF(TRIM(department), ''), '-') AS department" if has_department else "'-' AS department"
            position_select = "COALESCE(NULLIF(TRIM(position), ''), '-') AS position" if has_position else "'-' AS position"
            if time_col:
                time_select = f"DATE_FORMAT({time_col}, '%Y-%m-%d %H:%i') AS viewed_at"
                order_clause = f"ORDER BY {time_col} DESC, id DESC"
            else:
                time_select = "'-' AS viewed_at"
                order_clause = "ORDER BY id DESC"

            _backfill_meeting_viewers_profile(cursor, str(meeting_id))
            conn.commit()

            cursor.execute(
                """
                SELECT """ + user_select + """,
                       """ + department_select + """,
                       """ + position_select + """,
                       """ + time_select + """
                FROM meeting_viewers
                WHERE """ + fk_col + """ = %s
                """ + order_clause + """
                """,
                (meeting_id,),
            )
            items = cursor.fetchall() or []
            return jsonify({'success': True, 'items': items})
        except Exception as e:
            return jsonify({'success': False, 'items': [], 'message': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/meeting/delete_file', methods=['POST'])
def delete_meeting_file():
    data = request.get_json() or {}
    record_id = data.get('id')
    if not record_id:
        return jsonify({'success': False, 'message': 'id가 필요합니다.'}), 400

    conn = create_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'DB connection failed'}), 500
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT file_path, author FROM meeting_files WHERE id = %s", (record_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'success': False, 'message': '파일을 찾을 수 없습니다.'}), 404

        attachment_rows = []
        cursor.execute(
            "SELECT file_path FROM meeting_file_attachments WHERE meeting_id = %s",
            (record_id,),
        )
        attachment_rows = cursor.fetchall() or []

        cursor.execute("DELETE FROM meeting_files WHERE id = %s", (record_id,))
        conn.commit()

        file_url = row.get('file_path')
        if file_url:
            file_path = os.path.normpath(os.path.join(BASE_DIR, file_url.lstrip('/')))
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception:
                pass

        return jsonify({'success': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/meeting/delete_attachment', methods=['POST'])
def delete_meeting_attachment():
    data = request.get_json() or {}
    attachment_id = data.get('id')
    if not attachment_id:
        return jsonify({'success': False, 'message': 'attachment id가 필요합니다.'}), 400

    conn = create_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'DB connection failed'}), 500

    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT a.id, a.file_path, m.author
            FROM meeting_file_attachments a
            JOIN meeting_files m ON m.id = a.meeting_id
            WHERE a.id = %s
            LIMIT 1
            """,
            (attachment_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({'success': False, 'message': '첨부파일을 찾을 수 없습니다.'}), 404

        current_user_name = _get_session_user_name()
        existing_author = (row.get('author') or '').strip()
        if not current_user_name:
            return jsonify({'success': False, 'message': '로그인 사용자 정보가 없어 삭제할 수 없습니다.'}), 403
        if existing_author and existing_author != current_user_name:
            return jsonify({'success': False, 'message': '작성자만 삭제할 수 있습니다.'}), 403

        cursor.execute(
            "DELETE FROM meeting_file_attachments WHERE id = %s",
            (attachment_id,),
        )
        conn.commit()

        attachment_url = (row or {}).get('file_path')
        if attachment_url:
            attachment_path = os.path.normpath(os.path.join(BASE_DIR, attachment_url.lstrip('/')))
            try:
                if os.path.exists(attachment_path):
                    os.remove(attachment_path)
            except Exception:
                pass

        return jsonify({'success': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        cursor.close()
        conn.close()
