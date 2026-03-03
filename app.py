from __future__ import annotations

import os
from datetime import datetime, timedelta

from flask import Flask, request, session

from pms.blueprints import register_blueprints
from pms.middleware import init_address_lock, init_login_gate


def create_app() -> Flask:
    app = Flask(__name__, static_folder='static')

    # 기존 동작 유지: 재시작 시 세션키가 바뀌는 구조(원본과 동일)
    app.secret_key = os.urandom(24)

    app.config['TEMPLATES_AUTO_RELOAD'] = True
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    app.config['JSON_AS_ASCII'] = False  # JSON 응답에서 한글 깨짐 방지

    # 세션 유지시간(원본 설정 유지)
    app.permanent_session_lifetime = timedelta(minutes=120)

    # 공통 미들웨어/블루프린트 초기화
    init_address_lock(app)
    init_login_gate(app)
    register_blueprints(app)

    # 템플릿 필터
    @app.template_filter('format_currency')
    def format_currency(value):
        try:
            return '{:,.0f}'.format(value)
        except (TypeError, ValueError):
            return '0'

    # 요청 시작(세션 연장 + 로그)
    @app.before_request
    def _before_request():
        session.permanent = True
        request._start_time = datetime.now()
        user_name = session.get('user', {}).get('name', '비회원')
        print(f"{request._start_time.strftime('%H:%M:%S')} [요청 진입] 사용자: {user_name} - {request.method} {request.path}")

    # 요청 처리 후 로그
    @app.after_request
    def _after_request(response):
        end_time = datetime.now()
        user_name = session.get('user', {}).get('name', '비회원')
        if hasattr(request, '_start_time'):
            duration = (end_time - request._start_time).seconds
            print(
                f"{end_time.strftime('%H:%M:%S')} [응답 완료] 사용자: {user_name} - {request.method} {request.path} -> {response.status} ({duration}s)"
            )
        else:
            print(f"[응답 완료] {request.method} {request.path} -> {response.status} - 사용자: {user_name}")
        return response

    return app


# 기존 코드 호환: 외부에서 `from app import app` 형태를 사용 가능
app = create_app()


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, threaded=True, debug=True)

# 서버용
# (권장) 아래 주석 대신 run.py를 사용하세요.
#   - 실행: python run.py
#   - 백업도 같이(시작 시 1회): set PMS_BACKUP_ON_START=1 ; python run.py
#
# (레거시 형태로 유지)
# if __name__ == '__main__':
#     import threading
#     from waitress import serve
#     from pms.ops.backup import backup_all_tables
#
#     threading.Thread(target=backup_all_tables, daemon=True).start()
#     serve(app, host='0.0.0.0', port=5000, threads=20)
