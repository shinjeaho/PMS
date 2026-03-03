from __future__ import annotations

import os
from datetime import datetime

from werkzeug.utils import secure_filename


UPLOAD_FOLDER = 'static/uploads'


def ensure_upload_folders() -> None:
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)


def allowed_file(filename: str) -> bool:
    return '.' in filename


def custom_secure_filename(filename: str) -> str:
    # 기존 구현은 app.py에 있었고 secure_filename 기반으로 동작
    return secure_filename(filename)


def format_file_size(size):
    try:
        size = float(size)
    except Exception:
        return str(size)

    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024.0:
            return f"{size:3.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} PB"


def temp_to_final_path(filename: str) -> tuple[str, str, str]:
    """temp 업로드 파일을 연도 폴더로 이동하기 위한 경로 계산.

    반환: (temp_path, final_folder, final_path)
    """
    year_dir = datetime.now().strftime('%Y')
    temp_path = os.path.join(UPLOAD_FOLDER, 'temp', year_dir, filename)
    final_folder = os.path.join(UPLOAD_FOLDER, year_dir)
    final_path = os.path.join(final_folder, filename)
    return temp_path, final_folder, final_path
