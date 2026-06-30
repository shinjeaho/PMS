from __future__ import annotations

from urllib.parse import urlparse

from flask import request, redirect, url_for, session

from .config import ADDRESS_LOCK_SNIPPET


def init_address_lock(app):
    @app.after_request
    def inject_address_lock(response):
        try:
            ctype = (response.headers.get('Content-Type') or '').lower()
            if 'text/html' in ctype:
                html = response.get_data(as_text=True)
                if '</head>' in html:
                    html = html.replace('</head>', ADDRESS_LOCK_SNIPPET + '</head>', 1)
                    response.set_data(html)
        except Exception as e:
            app.logger.warning(f'address-lock inject failed: {e}')
        return response


def init_login_gate(app):
    detail_prefixes = (
        '/project_detail/',
        '/project_examine/',
        '/weekly_report/',
    )

    def _is_same_host_referrer(url: str | None) -> bool:
        if not url:
            return False
        try:
            ref = urlparse(url)
            host = (request.host or '').lower()
            return (ref.netloc or '').lower() == host
        except Exception:
            return False

    def _normalize_internal_target(url: str | None) -> str | None:
        if not url:
            return None
        try:
            parsed = urlparse(url)
            if parsed.scheme or parsed.netloc:
                return None
            path = parsed.path or '/'
            if not path.startswith('/'):
                path = '/' + path
            qs = ('?' + parsed.query) if parsed.query else ''
            frag = ('#' + parsed.fragment) if parsed.fragment else ''
            return f'{path}{qs}{frag}'
        except Exception:
            return None

    def _remember_previous_page() -> None:
        if request.method != 'GET':
            return

        path = request.path or '/'
        # API/정적/로그인/내비게이션 보조 경로는 추적 대상 제외
        if (
            path.startswith('/api/')
            or path.startswith('/static/')
            or path.startswith('/go_back')
            or path.startswith('/login')
            or path.startswith('/logout')
        ):
            return

        is_detail = any(path.startswith(p) for p in detail_prefixes)

        # 일반 페이지는 항상 최신 위치로 갱신
        if not is_detail:
            session['last_non_detail_page'] = request.full_path.rstrip('?')
            return

        # 상세 진입 시에는 referrer가 내부 경로일 때만 "직전 페이지"로 저장
        ref = request.referrer or ''
        if not _is_same_host_referrer(ref):
            return

        parsed = urlparse(ref)
        ref_path = parsed.path or '/'
        if ref_path == path:
            return
        if any(ref_path.startswith(p) for p in detail_prefixes):
            return
        if ref_path.startswith('/api/') or ref_path.startswith('/static/'):
            return

        target = _normalize_internal_target(ref)
        if target:
            session['last_detail_entry_page'] = target

    @app.route('/go_back', methods=['GET'])
    def go_back():
        target = (
            session.get('last_detail_entry_page')
            or session.get('last_non_detail_page')
            or url_for('index')
        )
        safe_target = _normalize_internal_target(str(target))
        if not safe_target:
            safe_target = url_for('index')
        return redirect(safe_target)

    @app.before_request
    def require_login_for_every_route():
        # blueprint 적용 후 endpoint는 "bp_name.func" 형태가 됨
        allowed_prefixes = {
            'auth.',
            'static',
        }
        ep = request.endpoint or ''
        if any(ep.startswith(p) for p in allowed_prefixes):
            return None
        if 'user' not in session:
            return redirect(url_for('auth.login'))
        _remember_previous_page()
        return None
