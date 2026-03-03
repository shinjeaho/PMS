from __future__ import annotations

import decimal
from decimal import Decimal

from ..db import create_connection


def calc_progress(cursor, contract_code):
    """상세페이지 ProgressOverview '계'와 동일한 방식으로 단일 프로젝트 진행률(%) 계산."""
    db2 = create_connection()
    if db2 is None:
        return 0.0
    cur = db2.cursor(dictionary=True)
    try:
        # 준공이면 즉시 100%
        cur.execute("SELECT project_status FROM Projects WHERE ContractCode = %s", (contract_code,))
        _row = cur.fetchone()
        if _row and _row.get('project_status') and '준공' in str(_row.get('project_status')):
            return 100.0

        # 부서 보할 맵
        cur.execute(
            """
            SELECT department, bohal FROM project_depbohal WHERE contractcode = %s
            """,
            (contract_code,),
        )
        dept_weight_map = {}
        for rw in cur.fetchall() or []:
            try:
                depn = rw.get('department')
                w = float(rw.get('bohal') or 0)
                if depn:
                    dept_weight_map[depn] = w
            except Exception:
                continue

        # TaskQuantity 부서 목록
        cur.execute("SELECT DISTINCT department FROM TaskQuantity WHERE ContractCode = %s", (contract_code,))
        depts = [r['department'] for r in cur.fetchall() if r and r.get('department')]

        dept_progress_map = {}

        # 외주: "외주 형태 - 회사명"별 processing 평균을 부서로 간주
        cur.execute(
            """
            SELECT outsourcing_company, outsourcing_type, processing
            FROM outsourcing
            WHERE (contract_code = %s OR Contract_Code = %s)
              AND (outsourcing_type IS NULL OR outsourcing_type NOT IN ('추가 제안','추가제안'))
            """,
            (contract_code, contract_code),
        )
        outs_rows = cur.fetchall() or []
        if outs_rows:
            company_vals = {}
            for r in outs_rows:
                comp = r.get('outsourcing_company')
                otype = (r.get('outsourcing_type') or '').strip()
                key = f"{otype} - {comp}" if otype and comp else comp
                val = r.get('processing')
                if not key or val is None:
                    continue
                try:
                    v = float(val)
                except Exception:
                    continue
                company_vals.setdefault(key, []).append(v)
            for comp_key, vals in company_vals.items():
                if vals:
                    dept_progress_map[comp_key] = round(sum(vals) / len(vals), 2)

        # 내부 부서 진행률 계산 (weightedProgress vs simpleProgress)
        for dept in depts:
            cur.execute(
                """
                SELECT quantity, SummaryQuantity, bohal
                FROM TaskQuantity
                WHERE ContractCode = %s AND department = %s
                """,
                (contract_code, dept),
            )
            rows = cur.fetchall() or []
            weighted_sum = 0.0
            simple_sum = 0.0
            simple_cnt = 0
            for row in rows:
                try:
                    total_q = float(row.get('quantity') or 0)
                    assigned_q = float(row.get('SummaryQuantity') or 0)
                    row_bohal = float(row.get('bohal') or 0)
                except Exception:
                    continue
                if total_q <= 0:
                    continue
                assigned_q = min(assigned_q, total_q)
                ratio = assigned_q / total_q
                simple_sum += ratio * 100
                simple_cnt += 1
                if row_bohal > 0:
                    weighted_sum += ratio * row_bohal
            dept_weighted = weighted_sum if weighted_sum > 0 else None
            dept_simple = (simple_sum / simple_cnt) if simple_cnt > 0 else None
            dept_effective = dept_weighted if dept_weighted is not None else dept_simple
            if dept_effective is not None:
                dept_progress_map[dept] = float(dept_effective)

        # 기여도 합산
        weights_present = any((w or 0) > 0 for w in dept_weight_map.values())
        if not weights_present:
            return 0.0
        contribution_sum = 0.0
        for d, prog in dept_progress_map.items():
            try:
                w = float(dept_weight_map.get(d, 0) or 0)
                if w <= 0:
                    continue
                contribution_sum += min(float(prog) * w / 100.0, w)
            except Exception:
                continue
        val = Decimal(str(min(contribution_sum, 100.0)))
        return float(val.quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP))
    finally:
        try:
            cur.close()
            db2.close()
        except Exception:
            pass


def calc_progress_bulk(contract_codes):
    """여러 ContractCode에 대해 상세페이지와 동일한 공식을 일괄 적용.

    반환: {ContractCode: progress(소수2)}
    """
    if not contract_codes:
        return {}
    conn = create_connection()
    if conn is None:
        return {}
    cur = conn.cursor(dictionary=True)
    try:
        fmt = ','.join(['%s'] * len(contract_codes))
        sql = f"""
            WITH dept_raw AS (
                SELECT 
                    ContractCode,
                    department,
                    CASE WHEN COALESCE(quantity,0) > 0 
                         THEN LEAST(COALESCE(SummaryQuantity,0), COALESCE(quantity,0)) / COALESCE(quantity,1)
                         ELSE NULL END AS ratio,
                    COALESCE(bohal,0) AS row_bohal
                FROM TaskQuantity
                WHERE ContractCode IN ({fmt})
            ),
            dept_prog AS (
                SELECT 
                    ContractCode,
                    department,
                    SUM(CASE WHEN row_bohal > 0 AND ratio IS NOT NULL THEN ratio * row_bohal ELSE 0 END) AS weighted_sum,
                    AVG(CASE WHEN ratio IS NOT NULL THEN ratio * 100 ELSE NULL END) AS simple_avg
                FROM dept_raw
                GROUP BY ContractCode, department
            ),
            dept_final AS (
                SELECT 
                    ContractCode,
                    department,
                    CASE WHEN weighted_sum > 0 THEN weighted_sum ELSE simple_avg END AS dept_avg
                FROM dept_prog
            ),
            outs_prog AS (
                SELECT 
                    contract_code AS ContractCode,
                    CONCAT(COALESCE(outsourcing_type,''),' - ', COALESCE(outsourcing_company,'')) AS department,
                    AVG(COALESCE(processing,0)) AS dept_avg
                FROM outsourcing
                WHERE contract_code IN ({fmt})
                    AND (outsourcing_type IS NULL OR outsourcing_type NOT IN ('추가 제안','추가제안'))
                GROUP BY contract_code, CONCAT(COALESCE(outsourcing_type,''),' - ', COALESCE(outsourcing_company,''))
            ),
            all_prog AS (
                SELECT * FROM dept_final
                UNION ALL
                SELECT * FROM outs_prog
            ),
            weights AS (
                SELECT contractcode, department, bohal
                FROM project_depbohal
                WHERE contractcode IN ({fmt})
            ),
            combined AS (
                SELECT ap.ContractCode, ap.department, ap.dept_avg, COALESCE(w.bohal,0) AS bohal
                FROM all_prog ap
                LEFT JOIN weights w
                  ON w.contractcode = ap.ContractCode AND w.department = ap.department
            )
            SELECT ContractCode,
                   ROUND(
                       CASE WHEN SUM(CASE WHEN bohal > 0 THEN 1 ELSE 0 END) > 0 THEN
                           LEAST(SUM(LEAST(dept_avg * bohal / 100.0, bohal)), 100.0)
                       ELSE 0.0 END,
                       2
                   ) AS progress
            FROM combined
            GROUP BY ContractCode
        """
        params = tuple(contract_codes) + tuple(contract_codes) + tuple(contract_codes)
        cur.execute(sql, params)
        rows = cur.fetchall()
        progress_map = {
            row['ContractCode']: round(float(row['progress'] or 0.0) + 1e-12, 2) for row in rows
        }

        # 준공 프로젝트는 진행률 고정 100%
        try:
            cur.execute(
                f"SELECT ContractCode, project_status FROM Projects WHERE ContractCode IN ({fmt})",
                tuple(contract_codes),
            )
            st_rows = cur.fetchall() or []
            for r in st_rows:
                code = r.get('ContractCode') if isinstance(r, dict) else None
                st = r.get('project_status') if isinstance(r, dict) else None
                if code and st and '준공' in str(st):
                    progress_map[code] = 100.0
        except Exception:
            pass

        return progress_map
    except Exception:
        return {}
    finally:
        cur.close()
        conn.close()
