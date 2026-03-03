from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file

from ..db import create_connection

bp = Blueprint('project_files', __name__)


BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_FOLDER = str(BASE_DIR / 'static' / 'uploads')
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'hwp', 'hwpx', 'zip'}


def _ensure_upload_folder() -> None:
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def custom_secure_filename(filename: str) -> str:
    filename = re.sub(r'[^\w가-힣._-]', '', filename)
    return filename.replace(' ', '_')


@bp.route('/temp_upload_files', methods=['POST'])
def temp_upload_files():
    try:
        _ensure_upload_folder()
        files = request.files.getlist('files')
        contract_code = request.form.get('contractCode') or 'temp'
        if not files or not files[0].filename:
            return jsonify({'success': False, 'message': '파일이 선택되지 않았습니다.'}), 400

        uploaded_files = []
        bad_extensions: list[str] = []
        for file in files:
            if file and allowed_file(file.filename):
                original_filename = custom_secure_filename(file.filename)
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                filename = f"{timestamp}_{original_filename}_{contract_code}"

                temp_root = os.path.join(UPLOAD_FOLDER, 'temp')
                os.makedirs(temp_root, exist_ok=True)

                year_folder = os.path.join(temp_root, datetime.now().strftime('%Y'))
                os.makedirs(year_folder, exist_ok=True)

                file_path = os.path.join(year_folder, filename)
                file_url = f"/static/uploads/temp/{datetime.now().strftime('%Y')}/{filename}"
                file.save(file_path)
                file_size = os.path.getsize(file_path)

                uploaded_files.append(
                    {
                        'filename': filename,
                        'original': original_filename,
                        'path': file_url,
                        'size': file_size,
                        'type': file.content_type,
                    }
                )
            else:
                print(f"[DEBUG] Skipped file {getattr(file, 'filename', '')} - not allowed")
                return (
                    jsonify(
                        {
                            'success': False,
                            'message': '업로드가 불가능한 확장자입니다.',
                            'invalidFiles': bad_extensions,
                        }
                    ),
                    400,
                )

        if not uploaded_files:
            return jsonify({'success': False, 'message': '업로드 실패'}), 400

        return jsonify({'success': True, 'files': uploaded_files})

    except Exception as e:
        print(f"[ERROR] Temp upload failed: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500


@bp.route('/upload_files', methods=['POST'])
def upload_files():
    _ensure_upload_folder()
    db = create_connection()
    cursor = db.cursor()

    try:
        files = request.files.getlist('files')
        contract_code = request.form.get('contractCode')

        if not files or not files[0].filename:
            return jsonify({'success': False, 'message': '파일이 선택되지 않았습니다.'}), 400

        uploaded_files = []
        for file in files:
            if file and allowed_file(file.filename):
                try:
                    original_filename = custom_secure_filename(file.filename)
                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                    filename = f"{timestamp}_{original_filename}_{contract_code}"

                    year_folder = os.path.join(UPLOAD_FOLDER, datetime.now().strftime('%Y'))
                    os.makedirs(year_folder, exist_ok=True)

                    file_path = os.path.join(year_folder, filename)
                    file_url = f"/static/uploads/{datetime.now().strftime('%Y')}/{filename}"

                    file.save(file_path)
                    file_size = os.path.getsize(file_path)

                    cursor.execute(
                        """
                        INSERT INTO ProjectFiles 
                        (ContractCode, FileName, OriginalFileName, FilePath, FileSize, FileType, UploadDate)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """,
                        (
                            contract_code,
                            filename,
                            original_filename,
                            file_url,
                            file_size,
                            file.content_type,
                        ),
                    )

                    uploaded_files.append(file_url)

                except Exception as e:
                    print(f"[ERROR] Error processing file {file.filename}: {str(e)}")
                    raise
            else:
                print(f"[DEBUG] Skipped file {getattr(file, 'filename', '')} - not allowed")

        db.commit()
        if len(uploaded_files) == 0:
            return (
                jsonify({'success': False, 'message': '허용되지 않는 파일 형식이거나 업로드에 실패했습니다.'}),
                400,
            )

        return jsonify({'success': True, 'message': '파일이 성공적으로 업로드되었습니다.', 'files': uploaded_files})

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Upload failed: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()
        db.close()


@bp.route('/static/uploads/<year>/<filename>')
def serve_pdf(year, filename):
    _ensure_upload_folder()
    file_path = os.path.join(UPLOAD_FOLDER, year, filename)
    try:
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        print(f"[ERROR] Could not serve file: {e}")
        return 'File not found', 404


@bp.route('/get_files', methods=['GET'])
def get_files():
    db = create_connection()
    cursor = db.cursor(dictionary=True)

    try:
        contract_code = request.args.get('contractCode')

        cursor.execute('SELECT * FROM ProjectFiles')
        _ = cursor.fetchall()

        cursor.execute(
            """
            SELECT FileID, OriginalFileName, FilePath, FileSize, FileType, UploadDate
            FROM ProjectFiles
            WHERE ContractCode = %s
            ORDER BY UploadDate DESC
        """,
            (contract_code,),
        )

        files = cursor.fetchall()

        formatted_files = []
        for file in files:
            formatted_file = {
                'FileID': file['FileID'],
                'OriginalFileName': file['OriginalFileName'],
                'FilePath': file['FilePath'],
                'FileSize': format_file_size(file['FileSize']),
                'UploadDate': file['UploadDate'].strftime('%Y-%m-%d %H:%M:%S'),
            }
            formatted_files.append(formatted_file)

        return jsonify(formatted_files)

    except Exception as e:
        print(f"[ERROR] Error getting files: {str(e)}")
        return jsonify({'error': str(e)}), 500

    finally:
        cursor.close()
        db.close()


@bp.route('/delete_file/<int:file_id>', methods=['DELETE'])
def delete_file(file_id: int):
    db = create_connection()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT FilePath, OriginalFileName 
            FROM ProjectFiles 
            WHERE FileID = %s
        """,
            (file_id,),
        )

        file_info = cursor.fetchone()
        if not file_info:
            return jsonify({'success': False, 'message': 'File not found'}), 404

        actual_path = os.path.join(str(BASE_DIR), file_info['FilePath'].lstrip('/'))

        if os.path.exists(actual_path):
            os.remove(actual_path)
            print(f"[INFO] File deleted from filesystem: {actual_path}")
        else:
            print(f"[WARNING] File not found in filesystem: {actual_path}")

        cursor.execute('DELETE FROM ProjectFiles WHERE FileID = %s', (file_id,))
        db.commit()

        return jsonify({'success': True, 'message': 'File deleted successfully'})

    except Exception as e:
        print(f"[ERROR] Error deleting file: {str(e)}")
        db.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()
        db.close()


def format_file_size(size):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} TB"


@bp.route('/open_file/<int:file_id>')
def open_file(file_id: int):
    db = create_connection()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT FilePath, OriginalFileName, FileType 
            FROM ProjectFiles 
            WHERE FileID = %s
        """,
            (file_id,),
        )

        file_info = cursor.fetchone()

        if not file_info:
            return 'File not found', 404

        actual_path = os.path.join(str(BASE_DIR), file_info['FilePath'].lstrip('/'))

        if not os.path.exists(actual_path):
            print(f"[ERROR] File not found at path: {actual_path}")
            return 'File not found', 404

        if (file_info['FileType'] or '').lower() == 'application/pdf':
            return send_file(
                actual_path,
                mimetype='application/pdf',
                as_attachment=False,
                download_name=file_info['OriginalFileName'],
            )

        return send_file(
            actual_path,
            mimetype=file_info['FileType'],
            as_attachment=True,
            download_name=file_info['OriginalFileName'],
        )

    except Exception as e:
        print(f"[ERROR] Error in open_file: {str(e)}")
        return str(e), 500

    finally:
        cursor.close()
        db.close()
