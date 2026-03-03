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


def _sanitize_filename(filename: str) -> str:
    filename = re.sub(r"[^\w가-힣._-]", "", filename)
    return filename.replace(" ", "_")


def _get_viewer_info():
    user = session.get('user') or {}
    name = (user.get('name') or user.get('Name') or '').strip()
    department = (user.get('department') or user.get('Department') or '').strip()
    position = (user.get('position') or user.get('Position') or '').strip()

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

    try:
        file.save(file_path)
        file_url = f"/static/uploads/meeting_minutes/{datetime.now().strftime('%Y')}/{final_name}"
        file_size = os.path.getsize(file_path)

        conn = create_connection()
        if conn is None:
            return jsonify({'success': False, 'message': 'DB connection failed'}), 500
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO meeting_files
                (doc_number, contractcode, project_name, agenda_title, meeting_datetime, meeting_end_datetime, meeting_place, organizer, attendees, created_at, author, file_path, original_name, file_size, user_name, create_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """,
                (
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
                    user_name or None,
                ),
            )
            record_id = cursor.lastrowid
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
            cursor.execute(
                """
                SELECT id
                FROM meeting_viewers
                WHERE meeting_id = %s
                  AND user_name = %s
                  AND department = %s
                LIMIT 1
                """,
                (record_id, viewer['name'], viewer['department']),
            )
            existing = cursor.fetchone()

            if not existing:
                cursor.execute(
                    """
                    INSERT INTO meeting_viewers
                    (meeting_id, user_name, department, position, viewed_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    """,
                    (record_id, viewer['name'], viewer['department'], viewer['position']),
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
        except Exception:
            conn.rollback()
            cursor.execute(
                """
                UPDATE meeting_files
                SET view_count = COALESCE(view_count, 0) + 1
                WHERE id = %s
                """,
                (record_id,),
            )
            conn.commit()

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
            cursor.execute(
                """
                SELECT user_name, department, position,
                       DATE_FORMAT(viewed_at, '%Y-%m-%d %H:%i') AS viewed_at
                FROM meeting_viewers
                WHERE meeting_id = %s
                ORDER BY viewed_at DESC, id DESC
                """,
                (meeting_id,),
            )
            items = cursor.fetchall() or []
            return jsonify({'success': True, 'items': items})
        except Exception:
            return jsonify({'success': True, 'items': []})
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
        cursor.execute("SELECT file_path FROM meeting_files WHERE id = %s", (record_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'success': False, 'message': '파일을 찾을 수 없습니다.'}), 404

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
