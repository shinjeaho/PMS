from __future__ import annotations

from datetime import datetime, date

from pms.db import create_connection


def calculate_d_day_value(end_date, status: str | None = None):
    try:
        if not end_date:
            return None
        if isinstance(end_date, str):
            s = end_date.strip()
            try:
                ed = datetime.strptime(s, '%Y-%m-%d').date()
            except Exception:
                try:
                    ed = datetime.fromisoformat(s).date()
                except Exception:
                    return None
        elif isinstance(end_date, datetime):
            ed = end_date.date()
        elif isinstance(end_date, date):
            ed = end_date
        else:
            return None

        today = date.today()
        diff = (ed - today).days
        return -diff if diff >= 0 else abs(diff)
    except Exception:
        return None


def auto_insert_risk_for_contract(cursor, contract_code: str):
    """D-Day = -40 (D-40) 시 성과심사 미처리 자동 리스크 등록 (원본 app.py 로직)."""
    try:
        if not contract_code:
            return
        cursor.execute("SELECT D_Day FROM Projects WHERE ContractCode = %s", (contract_code,))
        row = cursor.fetchone()
        if not row:
            return
        d_day_val = row[0] if isinstance(row, tuple) else (row.get('D_Day') if isinstance(row, dict) else None)
        if d_day_val != -40:
            return

        cursor.execute(
            """
            SELECT performanceReview
            FROM PerformanceEvaluationFee
            WHERE ContractCode = %s
            """,
            (contract_code,),
        )
        reviews = cursor.fetchall() or []
        if not reviews:
            return

        all_null_or_dash = True
        for r in reviews:
            val = None
            if isinstance(r, tuple):
                val = r[0]
            elif isinstance(r, dict):
                val = r.get('performanceReview')
            if not (val is None or (isinstance(val, str) and val.strip() == '-')):
                all_null_or_dash = False
                break
        if not all_null_or_dash:
            return

        cursor.execute(
            """
            SELECT 1 FROM project_risks
            WHERE contractcode = %s AND content = %s
            LIMIT 1
            """,
            (contract_code, '성과심사 처리 안됨.'),
        )
        if cursor.fetchone():
            return

        has_division = False
        try:
            cursor.execute("SHOW COLUMNS FROM project_risks LIKE 'division'")
            has_division = cursor.fetchone() is not None
        except Exception:
            has_division = False

        if has_division:
            cursor.execute(
                """
                INSERT INTO project_risks (contractcode, department, writer, write_date, content, division)
                VALUES (%s, %s, %s, CURDATE(), %s, %s)
                """,
                (contract_code, '시스템', '시스템', '성과심사 처리 안됨.', '진행중'),
            )
        else:
            cursor.execute(
                """
                INSERT INTO project_risks (contractcode, department, writer, write_date, content)
                VALUES (%s, %s, %s, CURDATE(), %s)
                """,
                (contract_code, '시스템', '시스템', '성과심사 처리 안됨.'),
            )
    except Exception as e:
        print(f"[WARN] auto_insert_risk_for_contract 실패: {e}")


def refresh_all_projects_dday() -> dict:
    """프로젝트 D_Day를 일괄 갱신.

    원본 동작(일부 화면/수정 로직)과 동일하게:
    - project_status에 '준공' 또는 '용역중지'가 포함되면 D-Day를 동결(갱신하지 않음)
    - 그 외 프로젝트는 endDate 기준으로 D_Day를 재계산
    - D-Day가 -40이 되는 경우 성과심사 미처리 자동 리스크 삽입을 시도
    """

    db = create_connection()
    if db is None:
        return {'success': False, 'message': 'DB 연결 실패'}

    updated = 0
    skipped_frozen = 0
    skipped_no_date = 0
    failed = 0

    try:
        cursor = db.cursor(dictionary=True)

        cursor.execute('SELECT contractCode, endDate, project_status FROM projects')
        rows = cursor.fetchall() or []

        for row in rows:
            try:
                contract_code = row.get('contractCode')
                end_date = row.get('endDate')
                status = row.get('project_status')

                if not contract_code:
                    continue

                status_str = str(status) if status is not None else ''
                is_frozen = ('준공' in status_str) or ('용역중지' in status_str)
                if is_frozen:
                    skipped_frozen += 1
                    continue

                if not end_date:
                    skipped_no_date += 1
                    continue

                d_val = calculate_d_day_value(end_date, status)
                if d_val is None:
                    skipped_no_date += 1
                    continue

                cursor.execute('UPDATE projects SET D_Day = %s WHERE contractCode = %s', (d_val, contract_code))
                auto_insert_risk_for_contract(cursor, contract_code)
                updated += 1
            except Exception as e:
                failed += 1
                print(f"[WARN] refresh_all_projects_dday row 실패: {e}")

        db.commit()
        return {
            'success': True,
            'updated': updated,
            'skipped_frozen': skipped_frozen,
            'skipped_no_date': skipped_no_date,
            'failed': failed,
        }

    except Exception as e:
        print(f"[ERROR] refresh_all_projects_dday 실패: {e}")
        try:
            db.rollback()
        except Exception:
            pass
        return {'success': False, 'message': str(e)}

    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            db.close()
        except Exception:
            pass
