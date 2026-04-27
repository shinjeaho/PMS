#!/usr/bin/env python3
"""
One-shot script to recompute `weekly_report` title/year/month/week_index according
to the ISO 8601 rule (Thursday-based week/year) and update DB.
Run from workspace root with the same env as the app.

Usage:
  python tools/recompute_weekly_titles.py

It will print counts and prompt before applying updates.
"""
from datetime import date
from pms.db import create_connection
from pms.blueprints.weekly_detail import _compute_week_meta


def main():
    conn = create_connection()
    if conn is None:
        print('DB connection failed')
        return

    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, week_start, title, year, month, week_index FROM weekly_report ORDER BY week_start")
        rows = cur.fetchall() or []
        updates = []
        for r in rows:
            ws = r.get('week_start')
            if isinstance(ws, str):
                from datetime import datetime
                ws_date = datetime.strptime(ws, '%Y-%m-%d').date()
            else:
                ws_date = ws
            meta = _compute_week_meta(ws_date)
            new_title = meta['title']
            new_year = meta['year']
            new_month = meta['month']
            new_week_index = meta['week_index']
            old_title = r.get('title') or ''
            old_year = int(r.get('year') or 0)
            old_month = int(r.get('month') or 0)
            old_week_index = int(r.get('week_index') or 0)
            if old_title != new_title or old_year != new_year or old_month != new_month or old_week_index != new_week_index:
                updates.append((new_title, new_year, new_month, new_week_index, int(r['id'])))

        if not updates:
            print('No title changes required.')
            return

        print(f'Will update {len(updates)} rows. Example:')
        for u in updates[:5]:
            print('  ', u)
        ans = input('Apply updates? [y/N]: ').strip().lower()
        if ans != 'y':
            print('Aborted.')
            return

        cur2 = conn.cursor()
        for new_title, new_year, new_month, new_week_index, rid in updates:
            cur2.execute(
                "UPDATE weekly_report SET title=%s, year=%s, month=%s, week_index=%s, updated_at=NOW() WHERE id=%s",
                (new_title, new_year, new_month, new_week_index, rid),
            )
        conn.commit()
        print('Updated', len(updates), 'rows.')
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass


if __name__ == '__main__':
    main()
