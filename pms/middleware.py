from __future__ import annotations

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
        return None
