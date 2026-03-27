from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, session, url_for

from ..db import create_connection

bp = Blueprint('weekly_detail', __name__)


_BLOCKED_STYLE_KEYS = {
    'overflow',
    'overflow-x',
    'overflow-y',
    'height',
    'max-height',
    'min-height',
    'position',
}


def _sanitize_weekly_html(value: str | None) -> str:
    """주간보고 HTML에서 인쇄 레이아웃을 깨뜨리는 속성만 제거한다."""
    s = str(value or '')
    if not s:
        return ''

    # script/style 태그 제거
    s = re.sub(r'(?is)<\s*(script|style)\b[^>]*>.*?<\s*/\s*\1\s*>', '', s)

    # 이벤트 핸들러 제거(onclick 등)
    s = re.sub(r'(?is)\s+on[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)', '', s)

    def _style_filter(match: re.Match) -> str:
        raw = (match.group(1) or '').strip()
        kept: list[str] = []
        for part in raw.split(';'):
            if ':' not in part:
                continue
            key, val = part.split(':', 1)
            key_clean = key.strip().lower()
            val_clean = val.strip()
            if not key_clean:
                continue
            if key_clean in _BLOCKED_STYLE_KEYS:
                continue
            # 값에 overflow/scroll 키워드가 섞여 있으면 제거
            if re.search(r'(?i)overflow|scroll', val_clean):
                continue
            kept.append(f"{key_clean}: {val_clean}")
        if not kept:
            return ''
        return ' style="' + '; '.join(kept) + '"'

    s = re.sub(r'(?is)\s+style\s*=\s*"([^"]*)"', _style_filter, s)
    s = re.sub(r"(?is)\s+style\s*=\s*'([^']*)'", _style_filter, s)

    return s.strip()


def _sanitize_weekly_segments(schedule: dict | None, issues: dict | None) -> tuple[dict, dict]:
    src_schedule = schedule or {}
    src_issues = issues or {}
    cleaned_schedule = {
        'mon': _sanitize_weekly_html(src_schedule.get('mon')),
        'tue': _sanitize_weekly_html(src_schedule.get('tue')),
        'wed': _sanitize_weekly_html(src_schedule.get('wed')),
        'thu': _sanitize_weekly_html(src_schedule.get('thu')),
        'fri': _sanitize_weekly_html(src_schedule.get('fri')),
        'sat': _sanitize_weekly_html(src_schedule.get('sat')),
    }
    cleaned_issues = {
        'prev': _sanitize_weekly_html(src_issues.get('prev')),
        'curr': _sanitize_weekly_html(src_issues.get('curr')),
    }
    return cleaned_schedule, cleaned_issues


def _build_weekly_segments(department: str, week_start: date, schedule: dict | None, issues: dict | None) -> dict:
    cleaned_schedule, cleaned_issues = _sanitize_weekly_segments(schedule, issues)
    return {
        'department': department,
        'week_start': week_start.isoformat(),
        'schedule': cleaned_schedule,
        'issues': cleaned_issues,
    }


def _compute_week_title(week_start: date) -> str:
    """제목: YY년 M월 N주차
    규칙: 주차는 '해당 월 내부의 첫 월요일'을 1주차의 시작으로 간주.
    즉, 그 달의 1일이 월요일이면 그 날이 1주차 시작이고, 그렇지 않으면 그 달의 첫 월요일이 1주차 시작이다.
    """
    yy = str(week_start.year)[-2:]
    month = week_start.month

    first_day = date(week_start.year, month, 1)
    # 첫 월요일(같은 달 내부)을 찾음
    dow = first_day.weekday()  # 0=Mon .. 6=Sun
    days_to_first_monday = (0 - dow) % 7
    first_month_monday = first_day + timedelta(days=days_to_first_monday)
    # 만약 week_start가 first_month_monday 이전이라면 0으로 처리(현실적으로 드물음)
    delta_days = (week_start - first_month_monday).days
    week_index = (delta_days // 7) + 1 if delta_days >= 0 else 0

    return f"{yy}년{month}월{week_index}주차"


def _list_weekly_reports(year: int | None):
    items: list[dict] = []
    conn = create_connection()
    if conn is None:
        return items

    cur = conn.cursor(dictionary=True)
    try:
        if year is not None:
            cur.execute(
                """
                SELECT r.week_start, MAX(r.title) AS title
                  FROM weekly_report r
                 WHERE r.year = %s
                   AND EXISTS (SELECT 1 FROM weekly_entry e WHERE e.report_id = r.id)
                 GROUP BY r.week_start
                 ORDER BY r.week_start DESC
                """,
                (year,),
            )
        else:
            cur.execute(
                """
                SELECT r.week_start, MAX(r.title) AS title
                  FROM weekly_report r
                 WHERE EXISTS (SELECT 1 FROM weekly_entry e WHERE e.report_id = r.id)
                 GROUP BY r.week_start
                 ORDER BY r.week_start DESC
                """
            )

        rows = cur.fetchall() or []
        for row in rows:
            ws = row.get('week_start')
            title = row.get('title')
            if isinstance(ws, datetime):
                ws_date = ws.date()
            else:
                ws_date = ws

            # Always compute title from week_start using current rules to avoid
            # showing stale DB values that were computed with old logic.
            if isinstance(ws_date, date):
                title = _compute_week_title(ws_date)

            items.append(
                {
                    'week_start': ws_date.isoformat() if isinstance(ws_date, date) else str(ws),
                    'title': title or '',
                }
            )
    except Exception as e:
        print('[weekly_reports] query error:', e)
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

    return items


@bp.route('/api/weekly_reports', methods=['GET'])
def api_weekly_reports():
    try:
        year = request.args.get('year', type=int)
        weeks = _list_weekly_reports(year)
        return jsonify({'weeks': weeks})
    except Exception as e:
        return jsonify({'weeks': [], 'error': str(e)}), 200


DEPT_ORDER = [
    '경영지원부',
    '총무부',
    '공공사업부',
    '공정관리부',
    'GIS사업부',
    '공간정보사업부',
    '기업부설연구소',
    'BIT',
    'BIT 공정관리부',
]


def _canon_dept(name: str | None) -> str:
    n = (name or '').strip()
    alias = {
        'GIS사업지원부': 'GIS사업부',
        'GIS지원사업부': 'GIS사업부',
        'BIT공정관리부': 'BIT 공정관리부',
        '연구소': '기업부설연구소',
        '기업부설연구소(연구소)': '기업부설연구소',
    }
    return alias.get(n, n)


def _merge_html(a: str | None, b: str | None) -> str:
    a = a or ''
    b = b or ''
    if not a:
        return b
    if not b:
        return a
    return a + '<br>' + b


def _compute_week_range(week_start: date) -> str:
    end = week_start + timedelta(days=6)
    if end.month != week_start.month:
        return f"{week_start.month}/{week_start.day}~{end.month}/{end.day}"
    return f"{week_start.month}/{week_start.day}~{end.day}"


def _compute_week_meta(week_start: date):
    y = week_start.year
    m = week_start.month
    first_day = date(y, m, 1)
    dow = first_day.weekday()  # 0=Mon .. 6=Sun
    days_to_first_monday = (0 - dow) % 7
    first_month_monday = first_day + timedelta(days=days_to_first_monday)
    delta_days = (week_start - first_month_monday).days
    week_index = (delta_days // 7) + 1 if delta_days >= 0 else 0

    if m == 12:
        days_in_month = 31
    else:
        days_in_month = (date(y, m + 1, 1) - timedelta(days=1)).day
    crosses_next_month = (week_start.day + 6) > days_in_month

    title = _compute_week_title(week_start)
    return {
        'year': y,
        'month': m,
        'week_index': week_index,
        'crosses_next_month': 1 if crosses_next_month else 0,
        'title': title,
    }


def _get_weekly_detail(week_start: date):
    conn = create_connection()
    if conn is None:
        return {'week': {}, 'departments': []}

    cur = conn.cursor(dictionary=True)
    result = {'week': {}, 'departments': []}
    try:
        meta = _compute_week_meta(week_start)
        result['week'] = {
            'week_start': week_start.isoformat(),
            'title': meta['title'],
            'year': meta['year'],
            'month': meta['month'],
            'week_index': meta['week_index'],
            'range': _compute_week_range(week_start),
        }

        cur.execute(
            """
            SELECT r.id AS report_id,
                   r.department,
                   r.updated_at AS report_updated_at,
                   e.summary_segments,
                   e.updated_at AS entry_updated_at
              FROM weekly_report r
              LEFT JOIN weekly_entry e ON e.report_id = r.id
             WHERE r.week_start = %s
             ORDER BY COALESCE(e.updated_at, r.updated_at) DESC, r.id DESC
            """,
            (week_start,),
        )

        rows = cur.fetchall() or []
        data_by_dept: dict[str, dict] = {}
        for rw in rows:
            dept = _canon_dept(rw.get('department') or '')
            seg = rw.get('summary_segments')

            schedule = {'mon': '', 'tue': '', 'wed': '', 'thu': '', 'fri': '', 'sat': ''}
            issues = {'prev': '', 'curr': ''}

            try:
                if isinstance(seg, str):
                    j = json.loads(seg)
                else:
                    j = seg
                if isinstance(j, dict):
                    sch = j.get('schedule') or {}
                    iss = j.get('issues') or {}
                    schedule = {
                        'mon': _sanitize_weekly_html(sch.get('mon') or ''),
                        'tue': _sanitize_weekly_html(sch.get('tue') or ''),
                        'wed': _sanitize_weekly_html(sch.get('wed') or ''),
                        'thu': _sanitize_weekly_html(sch.get('thu') or ''),
                        'fri': _sanitize_weekly_html(sch.get('fri') or ''),
                        'sat': _sanitize_weekly_html(sch.get('sat') or ''),
                    }
                    issues = {
                        'prev': _sanitize_weekly_html(iss.get('prev') or ''),
                        'curr': _sanitize_weekly_html(iss.get('curr') or ''),
                    }
            except Exception:
                pass

            if dept not in data_by_dept:
                data_by_dept[dept] = {'department': dept, 'schedule': schedule, 'issues': issues}

        if '경영본부' in data_by_dept:
            origin = data_by_dept['경영본부']
            if '경영지원부' not in data_by_dept:
                data_by_dept['경영지원부'] = {
                    'department': '경영지원부',
                    'schedule': dict(origin['schedule']),
                    'issues': dict(origin['issues']),
                }
            if '총무부' not in data_by_dept:
                data_by_dept['총무부'] = {
                    'department': '총무부',
                    'schedule': dict(origin['schedule']),
                    'issues': dict(origin['issues']),
                }
            del data_by_dept['경영본부']

        for dept in DEPT_ORDER:
            if dept in data_by_dept:
                result['departments'].append(data_by_dept[dept])
            else:
                result['departments'].append(
                    {
                        'department': dept,
                        'schedule': {'mon': '', 'tue': '', 'wed': '', 'thu': '', 'fri': '', 'sat': ''},
                        'issues': {'prev': '', 'curr': ''},
                    }
                )
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

    return result


@bp.route('/api/weekly_detail', methods=['GET'])
def api_weekly_detail():
    ws = request.args.get('week_start', type=str)
    if not ws:
        return jsonify({'ok': False, 'message': 'week_start가 필요합니다.'}), 400

    try:
        week_start = datetime.strptime(ws, '%Y-%m-%d').date()
    except Exception:
        return jsonify({'ok': False, 'message': '잘못된 날짜 포맷입니다.'}), 400

    data = _get_weekly_detail(week_start)
    return jsonify({'ok': True, **data})


@bp.route('/weekly_report/<week_start>', methods=['GET'])
def weekly_report_page(week_start):
    try:
        ws = datetime.strptime(week_start, '%Y-%m-%d').date()
    except Exception:
        return redirect(url_for('index'))

    meta = _compute_week_meta(ws)
    return render_template(
        'weekly_detail.html',
        week_start=ws.isoformat(),
        week_title=meta['title'],
        week_range=_compute_week_range(ws),
    )


def _ensure_weekly_report(conn, week_start: date, department: str, created_by: str) -> int:
    canon_department = _canon_dept(department)
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            SELECT id, department
              FROM weekly_report
             WHERE week_start=%s
             ORDER BY updated_at DESC, id DESC
            """,
            (week_start,),
        )
        rows = cur.fetchall() or []

        keep_id = None
        for r in rows:
            if _canon_dept(r.get('department') or '') == canon_department:
                keep_id = int(r['id'])
                if (r.get('department') or '') != canon_department:
                    cur.execute(
                        "UPDATE weekly_report SET department=%s, updated_at=NOW() WHERE id=%s",
                        (canon_department, keep_id),
                    )
                    conn.commit()
                break

        if keep_id is not None:
            dup_ids = [
                int(r['id'])
                for r in rows
                if _canon_dept(r.get('department') or '') == canon_department and int(r['id']) != keep_id
            ]
            for rid in dup_ids:
                cur.execute("DELETE FROM weekly_entry WHERE report_id=%s", (rid,))
                cur.execute("DELETE FROM weekly_report WHERE id=%s", (rid,))
            if dup_ids:
                conn.commit()
            return keep_id

        meta = _compute_week_meta(week_start)
        cur.execute(
            """
            INSERT INTO weekly_report
                (week_start, year, month, week_index, crosses_next_month,
                 department, title, status, created_by, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'draft', %s, NOW(), NOW())
            """,
            (
                week_start,
                meta['year'],
                meta['month'],
                meta['week_index'],
                meta['crosses_next_month'],
                canon_department,
                meta['title'],
                created_by,
            ),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        try:
            cur.close()
        except Exception:
            pass


def _replace_weekly_entry(conn, report_id: int, segments: dict, created_by: str) -> int:
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM weekly_entry WHERE report_id=%s", (report_id,))
        cur.execute(
            """
            INSERT INTO weekly_entry
                (report_id, title, summary_segments, detail_segments,
                 priority, tags_text, attachments_count, created_by, created_at, updated_at)
            VALUES (%s, %s, %s, %s, NULL, NULL, 0, %s, NOW(), NOW())
            """,
            (
                report_id,
                '주간 보고',
                json.dumps(segments, ensure_ascii=False),
                json.dumps(None),
                created_by,
            ),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        try:
            cur.close()
        except Exception:
            pass


def _parse_week_start(s: str) -> date:
    return datetime.strptime(s.strip(), '%Y-%m-%d').date()


def _get_session_user():
    return session.get('user') or {}


def _weekly_payload_lengths(payload: dict) -> dict:
    try:
        schedule = (payload or {}).get('schedule') or {}
        issues = (payload or {}).get('issues') or {}
        return {
            'schedule': {k: len(str(schedule.get(k) or '')) for k in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat')},
            'issues': {k: len(str(issues.get(k) or '')) for k in ('prev', 'curr')},
        }
    except Exception:
        return {'schedule': {}, 'issues': {}}


def _log_weekly_api(prefix: str, payload: dict, user: dict, department: str, created_by: str, report_id=None):
    try:
        current_app.logger.info(
            "[%s] week_start=%s dept=%s userID=%s by=%s lens=%s report_id=%s",
            prefix,
            (payload or {}).get('week_start'),
            department,
            (user or {}).get('userID') or (user or {}).get('id') or '',
            created_by,
            _weekly_payload_lengths(payload),
            report_id,
        )
    except Exception as e:
        try:
            print(f"[WEEKLY_LOG_FAIL] {prefix}: {e}")
        except Exception:
            pass


@bp.route('/api/weekly/save', methods=['POST'])
def api_weekly_save():
    user = _get_session_user()
    if not user:
        return jsonify({'ok': False, 'message': '로그인이 필요합니다.'}), 401

    try:
        payload = request.get_json(force=True) or {}
        week_start_str = payload.get('week_start')
        schedule = payload.get('schedule') or {}
        issues = payload.get('issues') or {}

        if not week_start_str:
            return jsonify({'ok': False, 'message': 'week_start가 필요합니다.'}), 400

        week_start = _parse_week_start(week_start_str)
        department = _canon_dept((user.get('Department') or user.get('department') or '').strip())
        created_by = (user.get('Name') or user.get('name') or user.get('userID') or 'unknown')
        if not department:
            return jsonify({'ok': False, 'message': '세션에 부서 정보가 없습니다. 로그아웃 후 다시 로그인 해주세요.'}), 400

        _log_weekly_api('WEEKLY_SAVE_IN', payload, user, department, created_by)

        conn = create_connection()
        if conn is None:
            return jsonify({'ok': False, 'message': 'DB 연결 실패'}), 500

        report_id = _ensure_weekly_report(conn, week_start, department, created_by)
        segments = _build_weekly_segments(department, week_start, schedule, issues)
        _replace_weekly_entry(conn, report_id, segments, created_by)
        _log_weekly_api('WEEKLY_SAVE_OK', payload, user, department, created_by, report_id=report_id)
        try:
            conn.close()
        except Exception:
            pass

        return jsonify({'ok': True, 'report_id': report_id})

    except Exception as e:
        try:
            current_app.logger.exception('[WEEKLY_SAVE_ERR] %s', e)
        except Exception:
            pass
        return jsonify({'ok': False, 'message': f'오류: {e}'}), 500


@bp.route('/api/weekly/save_split', methods=['POST'])
def api_weekly_save_split():
    user = _get_session_user()
    if not user:
        return jsonify({'ok': False, 'message': '로그인이 필요합니다.'}), 401

    try:
        payload = request.get_json(force=True) or {}
        week_start_str = payload.get('week_start')
        departments_payload = payload.get('departments')
        if not week_start_str:
            return jsonify({'ok': False, 'message': 'week_start가 필요합니다.'}), 400

        week_start = _parse_week_start(week_start_str)
        department = _canon_dept((user.get('Department') or user.get('department') or '').strip())
        created_by = (user.get('Name') or user.get('name') or user.get('userID') or 'unknown')
        is_admin_name = created_by == '관리자'
        if not department and not is_admin_name:
            return jsonify({'ok': False, 'message': '세션에 부서 정보가 없습니다. 로그아웃 후 다시 로그인 해주세요.'}), 400

        if not is_admin_name:
            return jsonify({'ok': False, 'message': '권한이 없습니다.'}), 403

        if not isinstance(departments_payload, list) or not departments_payload:
            return jsonify({'ok': False, 'message': 'departments가 비어 있습니다.'}), 400

        _log_weekly_api('WEEKLY_SAVE_SPLIT_IN', payload, user, department, created_by)

        conn = create_connection()
        if conn is None:
            return jsonify({'ok': False, 'message': 'DB 연결 실패'}), 500

        report_ids = []
        for item in departments_payload:
            if not isinstance(item, dict):
                continue
            dept_name = _canon_dept((item.get('department') or '').strip())
            if not dept_name:
                continue
            dept_schedule = item.get('schedule') or {}
            dept_issues = item.get('issues') or {}

            report_id = _ensure_weekly_report(conn, week_start, dept_name, created_by)
            segments = _build_weekly_segments(dept_name, week_start, dept_schedule, dept_issues)
            _replace_weekly_entry(conn, report_id, segments, created_by)
            report_ids.append(report_id)

        try:
            conn.close()
        except Exception:
            pass

        _log_weekly_api('WEEKLY_SAVE_SPLIT_OK', payload, user, department, created_by, report_id=report_ids[-1] if report_ids else None)
        return jsonify({'ok': True, 'report_ids': report_ids})

    except Exception as e:
        try:
            current_app.logger.exception('[WEEKLY_SAVE_SPLIT_ERR] %s', e)
        except Exception:
            pass
        return jsonify({'ok': False, 'message': f'오류: {e}'}), 500


@bp.route('/api/weekly/submit', methods=['POST'])
def api_weekly_submit():
    user = _get_session_user()
    if not user:
        return jsonify({'ok': False, 'message': '로그인이 필요합니다.'}), 401

    try:
        payload = request.get_json(force=True) or {}
        week_start_str = payload.get('week_start')
        schedule = payload.get('schedule') or {}
        issues = payload.get('issues') or {}
        departments_payload = payload.get('departments')
        if not week_start_str:
            return jsonify({'ok': False, 'message': 'week_start가 필요합니다.'}), 400

        week_start = _parse_week_start(week_start_str)
        department = _canon_dept((user.get('Department') or user.get('department') or '').strip())
        created_by = (user.get('Name') or user.get('name') or user.get('userID') or 'unknown')
        is_admin_name = created_by == '관리자'
        if not department and not is_admin_name:
            return jsonify({'ok': False, 'message': '세션에 부서 정보가 없습니다. 로그아웃 후 다시 로그인 해주세요.'}), 400

        _log_weekly_api('WEEKLY_SUBMIT_IN', payload, user, department, created_by)

        conn = create_connection()
        if conn is None:
            return jsonify({'ok': False, 'message': 'DB 연결 실패'}), 500

        if is_admin_name and isinstance(departments_payload, list):
            if not departments_payload:
                return jsonify({'ok': False, 'message': 'departments가 비어 있습니다.'}), 400

            report_ids = []
            for item in departments_payload:
                if not isinstance(item, dict):
                    continue
                dept_name = _canon_dept((item.get('department') or '').strip())
                if not dept_name:
                    continue
                dept_schedule = item.get('schedule') or {}
                dept_issues = item.get('issues') or {}

                report_id = _ensure_weekly_report(conn, week_start, dept_name, created_by)
                segments = _build_weekly_segments(dept_name, week_start, dept_schedule, dept_issues)
                _replace_weekly_entry(conn, report_id, segments, created_by)
                report_ids.append(report_id)

            if report_ids:
                cur = conn.cursor()
                for rid in report_ids:
                    cur.execute(
                        "UPDATE weekly_report SET status='published', published_at=NOW(), updated_at=NOW() WHERE id=%s",
                        (rid,),
                    )
                conn.commit()
                try:
                    cur.close()
                except Exception:
                    pass

            _log_weekly_api('WEEKLY_SUBMIT_OK', payload, user, department, created_by, report_id=report_ids[-1] if report_ids else None)
            try:
                conn.close()
            except Exception:
                pass

            return jsonify({'ok': True, 'report_ids': report_ids})

        report_id = _ensure_weekly_report(conn, week_start, department, created_by)
        segments = _build_weekly_segments(department, week_start, schedule, issues)
        _replace_weekly_entry(conn, report_id, segments, created_by)

        cur = conn.cursor()
        cur.execute(
            "UPDATE weekly_report SET status='published', published_at=NOW(), updated_at=NOW() WHERE id=%s",
            (report_id,),
        )
        conn.commit()

        _log_weekly_api('WEEKLY_SUBMIT_OK', payload, user, department, created_by, report_id=report_id)
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

        return jsonify({'ok': True, 'report_id': report_id})

    except Exception as e:
        try:
            current_app.logger.exception('[WEEKLY_SUBMIT_ERR] %s', e)
        except Exception:
            pass
        return jsonify({'ok': False, 'message': f'오류: {e}'}), 500
