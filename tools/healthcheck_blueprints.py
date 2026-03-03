from __future__ import annotations

import re
import sys
from pathlib import Path


def extract_url_for_endpoints(templates_root: Path) -> dict[str, set[str]]:
    """Return {template_rel_path: {endpoint_names...}} extracted from url_for('...') calls."""
    pattern = re.compile(r"url_for\(\s*['\"]([^'\"]+)['\"]")
    results: dict[str, set[str]] = {}

    for path in templates_root.rglob('*.html'):
        try:
            text = path.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue

        endpoints = set(pattern.findall(text))
        if endpoints:
            results[str(path.relative_to(templates_root))] = endpoints

    return results


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]

    # Import app (expects app.py to expose `app`)
    sys.path.insert(0, str(repo_root))
    import app as app_module  # type: ignore

    flask_app = app_module.app

    print('== Blueprint/Route Healthcheck ==')
    print('app.name:', flask_app.name)

    rules = sorted(flask_app.url_map.iter_rules(), key=lambda r: (r.rule, sorted(r.methods or [])))
    print('total routes:', len(rules))

    # Summarize by blueprint prefix
    by_bp: dict[str, int] = {}
    for rule in rules:
        endpoint = rule.endpoint
        bp = endpoint.split('.', 1)[0] if '.' in endpoint else '(app)'
        by_bp[bp] = by_bp.get(bp, 0) + 1

    print('\n-- routes by blueprint --')
    for bp, cnt in sorted(by_bp.items(), key=lambda x: (-x[1], x[0])):
        print(f'{bp}: {cnt}')

    # Check template url_for endpoints
    templates_root = repo_root / 'templates'
    template_refs = extract_url_for_endpoints(templates_root)

    missing: list[tuple[str, str]] = []
    for rel, endpoints in sorted(template_refs.items()):
        for ep in sorted(endpoints):
            # allow static (always present) and blueprint-less builtins
            if ep == 'static':
                continue
            if ep not in flask_app.view_functions:
                missing.append((rel, ep))

    print('\n-- template url_for endpoint check --')
    if not missing:
        print('OK: no missing endpoints referenced from templates')
    else:
        print('MISSING endpoints referenced by templates:')
        for rel, ep in missing:
            print(f'  - {rel}: {ep}')

    # Basic smoke: GET / and GET /login without DB dependency
    flask_app.testing = True
    client = flask_app.test_client()

    def _req(path: str):
        resp = client.get(path)
        return resp.status_code, resp.headers.get('Location')

    print('\n-- smoke GET --')
    for path in ['/', '/login']:
        code, loc = _req(path)
        print(f'GET {path}: {code}' + (f' -> {loc}' if loc else ''))

    # Exit non-zero only if template references are broken (fast feedback)
    return 1 if missing else 0


if __name__ == '__main__':
    raise SystemExit(main())
