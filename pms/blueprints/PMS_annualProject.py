from __future__ import annotations

import io
import traceback
from datetime import date, datetime
from decimal import Decimal

import xlsxwriter
from flask import Blueprint, jsonify, render_template, request, send_file

from ..db import create_connection
from ..services.progress import calc_progress_bulk

bp = Blueprint('annual_project', __name__)


def _fetch_engineers_summary(cursor, selected_year):
    cursor.execute(
        """
        SELECT DISTINCT YEAR(StartDate) AS year
        FROM projects
        WHERE StartDate IS NOT NULL
          AND ContractCode NOT LIKE '%%검토%%'
          AND ContractCode NOT LIKE '%%-00'
          AND ContractCode NOT LIKE '%%-000'
        ORDER BY year DESC
        """
    )
    available_years = [row['year'] for row in cursor.fetchall() if row.get('year')]

    year_clause = ''
    params = []
    if selected_year:
        year_clause = 'AND YEAR(StartDate) = %s'
        params.append(selected_year)

    cursor.execute(
        f"""
        SELECT
            projectID,
            ContractCode,
            ProjectName,
            project_status
        FROM projects
        WHERE ContractCode NOT LIKE '%%검토%%'
          AND ContractCode NOT LIKE '%%-00'
          AND ContractCode NOT LIKE '%%-000'
          {year_clause}
        ORDER BY ContractCode DESC
        """,
        params,
    )
    results = cursor.fetchall()

    def _normalize_project_status(raw_status):
        if raw_status is None:
            return '진행중'
        status = str(raw_status).strip()
        if not status:
            return '진행중'
        if status.startswith('준공'):
            return '준공'
        if status == '용역중지':
            return '용역중지'
        if status == '진행중':
            return '진행중'
        return status

    contract_codes = [row['ContractCode'] for row in results]
    if not contract_codes:
        return [], 1, available_years

    format_strings = ','.join(['%s'] * len(contract_codes))
    cursor.execute(
        f"""
        SELECT contractcode, work_position, name
        FROM project_engineers
        WHERE contractcode IN ({format_strings})
        ORDER BY
            contractcode,
            FIELD(work_position, '사책', '분책', '분참'),
            name ASC
        """,
        contract_codes,
    )
    engineer_rows = cursor.fetchall() or []

    grouped = {}
    for row in engineer_rows:
        code = row.get('contractcode')
        name = (row.get('name') or '').strip()
        role = (row.get('work_position') or '').strip()
        if not code or not name:
            continue
        if code not in grouped:
            grouped[code] = {'chief': [], 'subchief': [], 'participants': []}
        if role == '사책':
            grouped[code]['chief'].append(name)
        elif role == '분책':
            grouped[code]['subchief'].append(name)
        elif role == '분참':
            grouped[code]['participants'].append(name)

    max_participants = 0
    for project in results:
        code = project['ContractCode']
        project['project_status'] = _normalize_project_status(project.get('project_status'))
        role_group = grouped.get(code, {'chief': [], 'subchief': [], 'participants': []})
        project['chief'] = role_group['chief']
        project['subchief'] = role_group['subchief']
        project['participants'] = role_group['participants']
        project['chief_count'] = len(role_group['chief'])
        project['subchief_count'] = len(role_group['subchief'])
        project['participant_count'] = len(role_group['participants'])
        total_count = (
            len(role_group['chief'])
            + len(role_group['subchief'])
            + len(role_group['participants'])
        )
        project['total_count'] = total_count
        if len(role_group['participants']) > max_participants:
            max_participants = len(role_group['participants'])

    if max_participants == 0:
        max_participants = 1

    return results, max_participants, available_years


@bp.route('/PMS_annualMoney')
def annual_money_legacy():
    selected_year = request.args.get('year', type=int)
    if not selected_year:
        selected_year = datetime.now().year
    return annual_project('money', selected_year)


@bp.route('/PMS_annualManagment/<int:year>')
def annual_managment(year):
    db = create_connection()
    cursor = db.cursor(dictionary=True)
    try:
        department_options = [
            '기업부설연구소(연구소)',
            '공간정보사업부',
            'GIS사업부',
            'GIS사업지원부',
        ]
        selected_department = (request.args.get('department', '전체') or '전체').strip()
        if selected_department not in {'전체', *department_options}:
            selected_department = '전체'

        def _normalize_department(raw_department: str | None) -> str:
            dept = (raw_department or '').strip()
            if not dept:
                return ''
            if '연구소' in dept or '기업부설연구소' in dept:
                return '기업부설연구소(연구소)'
            if dept in {'공간정보사업부', 'GIS사업부', 'GIS사업지원부'}:
                return dept
            return dept

        cursor.execute(
            """
            SELECT DISTINCT YEAR(StartDate) AS year
            FROM projects
            WHERE StartDate IS NOT NULL
              AND ContractCode NOT LIKE '%%검토%%'
              AND ContractCode NOT LIKE '%%-00'
              AND ContractCode NOT LIKE '%%-000'
            ORDER BY year DESC
            """
        )
        available_years = [row['year'] for row in cursor.fetchall() if row.get('year')]

        cursor.execute(
            """
            SELECT
                projectID,
                ContractCode,
                ProjectName,
                StartDate,
                EndDate,
                D_Day
            FROM projects
            WHERE YEAR(StartDate) = %s
              AND ContractCode NOT LIKE '%%-00'
              AND ContractCode NOT LIKE '%%-000'
              AND ContractCode NOT LIKE '%%검토%%'
            ORDER BY ContractCode DESC
            """,
            (year,),
        )
        results = cursor.fetchall() or []

        if not results:
            return render_template(
                'PMS_annualManagment.html',
                year=year,
                selected_year=year,
                available_years=available_years,
                departments=department_options,
                selected_department=selected_department,
                positions=[],
                projects=[],
            )

        contract_codes = [row['ContractCode'] for row in results if row.get('ContractCode')]
        format_strings = ','.join(['%s'] * len(contract_codes))

        try:
            progress_map = calc_progress_bulk(contract_codes) or {}
        except Exception:
            progress_map = {}

        cursor.execute(
            """
            SELECT DISTINCT Position
            FROM expenses
            WHERE Year = %s
              AND Position IS NOT NULL
              AND TRIM(Position) <> ''
            ORDER BY Position ASC
            """,
            (year,),
        )
        standard_positions = [
            (row.get('Position') or '').strip()
            for row in (cursor.fetchall() or [])
            if (row.get('Position') or '').strip()
        ]

        cursor.execute(
            f"""
            SELECT
                ContractCode,
                department,
                Position,
                SUM(COALESCE(day_time, 0) / 8.0) AS day_md,
                SUM(COALESCE(night_time, 0) / 8.0) AS night_md,
                SUM(COALESCE(holiday, 0) / 8.0) AS holiday_md
            FROM taskassignment
            WHERE ContractCode IN ({format_strings})
            GROUP BY ContractCode, department, Position
            """,
            contract_codes,
        )
        md_rows = cursor.fetchall() or []

        cursor.execute(
            """
            SELECT Position, Days
            FROM expenses
            WHERE Year = %s
            """,
            (year,),
        )
        expense_day_rate_map = {
            (row.get('Position') or '').strip(): float(row.get('Days') or 0)
            for row in (cursor.fetchall() or [])
            if (row.get('Position') or '').strip()
        }

        cursor.execute(
            f"""
            SELECT ContractCode, AVG(daily_rate) AS avg_daily_rate
            FROM external_labor_rates
            WHERE ContractCode IN ({format_strings})
            GROUP BY ContractCode
            """,
            contract_codes,
        )
        external_rate_map = {
            (row.get('ContractCode') or '').strip(): float(row.get('avg_daily_rate') or 0)
            for row in (cursor.fetchall() or [])
            if (row.get('ContractCode') or '').strip()
        }

        cursor.execute(
            f"""
            SELECT ContractCode, department, SUM(COALESCE(money, 0)) AS total
            FROM usemoney
            WHERE ContractCode IN ({format_strings})
            GROUP BY ContractCode, department
            """,
            contract_codes,
        )
        expense_rows = cursor.fetchall() or []

        project_md_map: dict[str, dict[str, dict[str, float]]] = {}
        positions_from_data: list[str] = []
        project_labor_amount_map: dict[str, float] = {}
        project_expense_amount_map: dict[str, float] = {}

        for row in expense_rows:
            code = (row.get('ContractCode') or '').strip()
            normalized_department = _normalize_department(row.get('department'))
            if not code:
                continue
            if selected_department != '전체' and normalized_department != selected_department:
                continue
            project_expense_amount_map[code] = project_expense_amount_map.get(code, 0.0) + float(row.get('total') or 0)

        for row in md_rows:
            code = (row.get('ContractCode') or '').strip()
            normalized_department = _normalize_department(row.get('department'))
            if selected_department != '전체' and normalized_department != selected_department:
                continue

            position = (row.get('Position') or '').strip() or '미분류'
            if not code:
                continue
            if position not in positions_from_data:
                positions_from_data.append(position)

            day_md = float(row.get('day_md') or 0)
            night_md = float(row.get('night_md') or 0)
            holiday_md = float(row.get('holiday_md') or 0)

            if code not in project_md_map:
                project_md_map[code] = {}
            project_md_map[code][position] = {
                'day_md': day_md,
                'night_md': night_md,
                'holiday_md': holiday_md,
                'total_md': day_md + night_md + holiday_md,
            }

            position_rate = external_rate_map.get(code, 0.0) if position == '외부인력' else expense_day_rate_map.get(position, 0.0)
            labor_amount = (day_md * position_rate * 1.0) + (night_md * position_rate * 2.0) + (holiday_md * position_rate * 1.5)
            project_labor_amount_map[code] = project_labor_amount_map.get(code, 0.0) + labor_amount

        if selected_department != '전체':
            filtered_codes = set(project_md_map.keys())
            results = [project for project in results if project.get('ContractCode') in filtered_codes]

        preferred_positions = ['이사', '부장', '차장', '과장', '대리', '주임', '사원', '계약직']

        ordered_positions: list[str] = []
        for pos in preferred_positions:
            if pos not in ordered_positions:
                ordered_positions.append(pos)

        for pos in standard_positions:
            if pos and pos not in ordered_positions:
                ordered_positions.append(pos)
        for pos in sorted(positions_from_data):
            if pos and pos not in ordered_positions:
                ordered_positions.append(pos)

        for project in results:
            code = project['ContractCode']
            project['total_progress'] = float(progress_map.get(code, 0) or 0)
            md_stats = project_md_map.get(code, {})
            project['md_stats'] = md_stats
            project['total_md'] = sum(float((v or {}).get('total_md', 0) or 0) for v in md_stats.values())
            project['labor_amount'] = round(project_labor_amount_map.get(code, 0.0))
            project['expense_amount'] = round(project_expense_amount_map.get(code, 0.0))

        return render_template(
            'PMS_annualManagment.html',
            year=year,
            selected_year=year,
            available_years=available_years,
            departments=department_options,
            selected_department=selected_department,
            positions=ordered_positions,
            projects=results,
        )
    except Exception as e:
        print(f'[ERROR] 연도별 실제 MD 통합관리 조회 실패: {e}')
        return render_template(
            'PMS_annualManagment.html',
            year=year,
            selected_year=year,
            available_years=[],
            departments=[],
            selected_department='전체',
            positions=[],
            projects=[],
            error=str(e),
        )
    finally:
        cursor.close()
        db.close()


@bp.route('/PMS_annualProject/<mode>/<int:year>')
def annual_project(mode, year):
    """
    연도별 비용산출 통합자료 상세페이지 (템플릿 렌더링)
    각 프로젝트의 시작연도에 맞는 인건비(Days)를 적용하여 실제 인건비를 계산합니다.
    """
    db = create_connection()
    cursor = db.cursor(dictionary=True)
    try:
        template_name = 'PMS_annualMoney.html' if mode == 'money' else 'PMS_annualProject.html'

        cursor.execute(
            """
            SELECT DISTINCT YEAR(StartDate) AS year
            FROM projects
            WHERE StartDate IS NOT NULL
              AND ContractCode NOT LIKE '%%검토%%'
              AND ContractCode NOT LIKE '%%-00'
              AND ContractCode NOT LIKE '%%-000'
            ORDER BY year DESC
            """
        )
        available_years = [row['year'] for row in cursor.fetchall() if row.get('year')]

        if mode == 'complete':
            year_2digit = str(year)[2:]

            cursor.execute(
                """
                SELECT
                    projectID,
                    ContractCode,
                    ProjectName,
                    ProjectCost,
                    ProjectCost_NoVAT,
                    ContributionRate,
                    AcademicResearchRate,
                    OperationalRate,
                    EquipmentRate,
                    StartDate,
                    EndDate,
                    ChangeProjectCost,
                    project_status,
                    yearProject,
                    D_Day,
                    orderPlace
                FROM projects
                WHERE (
                    project_status LIKE CONCAT('준공(', %s, ')') OR
                    project_status LIKE CONCAT('준공(', %s, ')')
                )
                AND ContractCode NOT LIKE '%%-00'
                AND ContractCode NOT LIKE '%%검토%%'
                ORDER BY ContractCode DESC
                """,
                (year, year_2digit),
            )
            results = cursor.fetchall()
        else:
            cursor.execute(
                """
                SELECT
                    projectID,
                    ContractCode,
                    ProjectName,
                    ProjectCost,
                    ProjectCost_NoVAT,
                    ContributionRate,
                    AcademicResearchRate,
                    OperationalRate,
                    EquipmentRate,
                    StartDate,
                    EndDate,
                    ChangeProjectCost,
                    project_status,
                    yearProject,
                    D_Day,
                    orderPlace
                FROM projects
                WHERE YEAR(StartDate) = %s
                  AND ContractCode NOT LIKE '%%-00'
                  AND ContractCode NOT LIKE '%%검토%%'
                ORDER BY ContractCode DESC
                """,
                (year,),
            )
            results = cursor.fetchall()

        contract_codes_all = [row['ContractCode'] for row in results]
        contract_codes = [row['ContractCode'] for row in results]
        if not contract_codes:
            return render_template(
                template_name,
                year=year,
                selected_year=year,
                available_years=available_years,
                mode=mode,
                projects=[],
            )

        format_strings = ','.join(['%s'] * len(contract_codes))

        try:
            progress_map = calc_progress_bulk(contract_codes_all) or {}
        except Exception:
            progress_map = {}

        risk_map = {}
        try:
            has_division = False
            try:
                cursor.execute("SHOW COLUMNS FROM project_risks LIKE 'division'")
                has_division = cursor.fetchone() is not None
            except Exception:
                has_division = False

            if has_division:
                cursor.execute(
                    f"""
                    SELECT DISTINCT contractcode
                    FROM project_risks
                    WHERE contractcode IN ({format_strings})
                      AND (division IS NULL OR division <> '완료')
                    """,
                    contract_codes_all,
                )
            else:
                cursor.execute(
                    f"""
                    SELECT DISTINCT contractcode
                    FROM project_risks
                    WHERE contractcode IN ({format_strings})
                    """,
                    contract_codes_all,
                )

            for r in cursor.fetchall() or []:
                code = r.get('contractcode') if isinstance(r, dict) else (r[0] if isinstance(r, tuple) else None)
                if code:
                    risk_map[code] = True
        except Exception:
            risk_map = {}

        perf_review_map = {}
        try:
            cursor.execute(
                f"""
                SELECT ContractCode, performanceReview, reviewDate, UpdateDate
                FROM performanceevaluationfee
                WHERE ContractCode IN ({format_strings})
                ORDER BY ContractCode, COALESCE(reviewDate, UpdateDate) DESC
                """,
                contract_codes_all,
            )
            rows = cursor.fetchall() or []

            def _normalize_review_status(v):
                if v is None:
                    return None
                s = str(v).strip()
                if not s:
                    return None
                if s.lower() == 'none':
                    return None
                if s == '-':
                    return None
                return s

            def _review_score(s):
                if not s:
                    return 0
                if s == '완료':
                    return 30
                if s == '접수':
                    return 20
                if s == '없음':
                    return 10
                return 5

            for r in rows:
                if not isinstance(r, dict):
                    continue
                code = r.get('ContractCode')
                if not code:
                    continue

                status_val = _normalize_review_status(r.get('performanceReview'))
                if not status_val:
                    continue

                prev = perf_review_map.get(code)
                if (prev is None) or (_review_score(status_val) > _review_score(prev)):
                    perf_review_map[code] = status_val
        except Exception:
            perf_review_map = {}

        cursor.execute(
            f"""
            SELECT e.ContractCode, SUM(e.amount) as total
            FROM exmanager e
            JOIN state s ON e.ContractCode = s.contractCode
            WHERE e.ContractCode IN ({format_strings})
            AND (e.department = s.first_dept OR e.department = s.second_dept)
            GROUP BY e.ContractCode
            """,
            contract_codes,
        )
        exmanager_map = {row['ContractCode']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"""
            SELECT e.ContractCode, SUM(e.amount) as total
            FROM expenserecords e
            JOIN state s ON e.ContractCode = s.contractCode
            WHERE e.ContractCode IN ({format_strings})
            AND (e.department = s.first_dept OR e.department = s.second_dept)
            GROUP BY e.ContractCode
            """,
            contract_codes,
        )
        expenserecords_map = {row['ContractCode']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"SELECT contract_code, SUM(outsourcing_cost_NoVAT) as total FROM outsourcing WHERE contract_code IN ({format_strings}) GROUP BY contract_code",
            contract_codes,
        )
        outsourcing_map = {row['contract_code']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"""
            SELECT o.contract_code, SUM(omp.Cost_NoVAT) AS total
            FROM outSourcing_MoneyPayment AS omp
            JOIN outsourcing AS o ON o.id = omp.outsourcing_id
            WHERE o.contract_code IN ({format_strings})
            GROUP BY o.contract_code
            """,
            contract_codes_all,
        )
        outsourcing_paid_map = {row['contract_code']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"""
            SELECT ContractCode, division, SUM(amount) as total, ReceiptDate
            FROM businessreceiptdetails
            WHERE ContractCode IN ({format_strings})
            GROUP BY ContractCode, division, ReceiptDate
            ORDER BY ContractCode, ReceiptDate ASC
            """,
            contract_codes,
        )
        receipt_data = cursor.fetchall()

        taskassignment_map = {}
        for project in results:
            code = project['ContractCode']

            start_date = project['StartDate']
            if isinstance(start_date, (datetime, date)):
                year_for_expense = start_date.year
            else:
                year_for_expense = int(str(start_date)[:4])

            cursor.execute(
                """
                SELECT AVG(daily_rate) AS avg_daily_rate
                FROM external_labor_rates
                WHERE ContractCode = %s
                """,
                (code,),
            )
            avg_daily_rate = cursor.fetchone()['avg_daily_rate'] or 0

            cursor.execute(
                """
                SELECT
                    t.ContractCode,
                    SUM(
                        (t.day_time / 8 *
                            CASE WHEN t.position = '외부인력' THEN %s ELSE e.Days END * 1.0
                        ) +
                        (t.night_time / 8 *
                            CASE WHEN t.position = '외부인력' THEN %s ELSE e.Days END * 2.0
                        ) +
                        (t.holiday / 8 *
                            CASE WHEN t.position = '외부인력' THEN %s ELSE e.Days END * 1.5
                        )
                    ) AS total
                FROM taskassignment t
                LEFT JOIN expenses e
                    ON t.Position = e.Position AND e.Year = %s
                WHERE t.ContractCode = %s
                GROUP BY t.ContractCode
                """,
                (avg_daily_rate, avg_daily_rate, avg_daily_rate, year_for_expense, code),
            )

            row = cursor.fetchone()
            taskassignment_map[code] = float(row['total'] or 0) if row else 0

        cursor.execute(
            f"SELECT ContractCode, SUM(money) as total FROM usemoney WHERE ContractCode IN ({format_strings}) GROUP BY ContractCode",
            contract_codes_all,
        )
        usemoney_map = {row['ContractCode']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"SELECT contract_code, SUM(change_Cost_NoVAT) as total FROM outsourcing WHERE contract_code IN ({format_strings}) GROUP BY contract_code",
            contract_codes_all,
        )
        outsourcing_real_map = {row['contract_code']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"""
            SELECT ContractCode, Description, SUM(Amount) as total
            FROM performanceevaluationfee
            WHERE ContractCode IN ({format_strings})
            GROUP BY ContractCode, Description
            """,
            contract_codes_all,
        )

        performance_est_map = {}
        performance_act_map = {}

        for row in cursor.fetchall():
            code = row['ContractCode']
            desc = row['Description']
            total = float(row['total'] or 0)

            if desc == '당초 내역서':
                performance_est_map[code] = total
            elif desc in ('변경 내역서', '실납부액'):
                performance_act_map[code] = total
            elif desc in ('발주처 납부', '성과심사 없음'):
                performance_est_map[code] = total
                performance_act_map[code] = total

        for project in results:
            code = project['ContractCode']

            estimated_labor = exmanager_map.get(code, 0)
            estimated_expense = expenserecords_map.get(code, 0)
            estimated_other = outsourcing_map.get(code, 0)
            estimated_performance = performance_est_map.get(code, 0)

            actual_labor = taskassignment_map.get(code, 0)
            actual_expense = usemoney_map.get(code, 0)
            actual_other = outsourcing_real_map.get(code, 0)
            actual_performance = performance_act_map.get(code, 0)

            project['estimated_labor'] = estimated_labor
            project['estimated_expense'] = estimated_expense
            project['estimated_other'] = estimated_other
            project['estimated_performance'] = estimated_performance
            project['estimated_total'] = estimated_labor + estimated_expense + estimated_other + estimated_performance

            project['actual_labor'] = round(actual_labor)
            project['actual_expense'] = actual_expense
            project['actual_other'] = actual_other
            project['actual_performance'] = actual_performance
            project['actual_total'] = actual_labor + actual_expense + actual_other + actual_performance

            paid = outsourcing_paid_map.get(code, 0.0)
            project['outsourcing_paid'] = paid
            project['outsourcing_balance'] = actual_other - paid

            project_receipts = [
                {
                    'division': row['division'],
                    'amount': float(row['total'] or 0),
                    'receipt_date': row['ReceiptDate'].strftime('%Y-%m-%d') if row['ReceiptDate'] else None,
                }
                for row in receipt_data
                if row['ContractCode'] == code
            ]
            project['receipt_details'] = project_receipts

            try:
                project['total_progress'] = float(progress_map.get(code, 0.0))
            except Exception:
                project['total_progress'] = 0.0
            project['performance_review'] = perf_review_map.get(code)
            project['has_risk'] = bool(risk_map.get(code))

        return render_template(
            template_name,
            year=year,
            selected_year=year,
            available_years=available_years,
            mode=mode,
            projects=results,
        )
    except Exception as e:
        print(f'[ERROR] 연도별 통합자료 조회 실패: {e}')
        return render_template(
            template_name,
            year=year,
            selected_year=year,
            available_years=available_years if 'available_years' in locals() else [],
            projects=[],
            mode=mode,
            error=str(e),
        )
    finally:
        cursor.close()
        db.close()


@bp.route('/PMS_annualProject/status/<status>')
def annual_project_by_status(status):
    """
    상태별 비용산출 통합자료 상세페이지 (템플릿 렌더링)
    각 프로젝트의 시작연도에 맞는 인건비(Days)를 적용하여 실제 인건비를 계산합니다.
    """
    db = create_connection()
    cursor = db.cursor(dictionary=True)
    try:
        if status == 'progress':
            where_clause = "(project_status = '진행중' OR project_status IS NULL) AND ContractCode NOT LIKE '%%검토%%' AND ContractCode NOT LIKE '%%-00' AND ContractCode NOT LIKE '%%-000'"
        elif status == 'complete':
            where_clause = "project_status LIKE '준공%' AND ContractCode NOT LIKE '%%검토%%' AND ContractCode NOT LIKE '%%-00' AND ContractCode NOT LIKE '%%-000'"
        elif status == 'stop':
            where_clause = "project_status = '용역중지' AND ContractCode NOT LIKE '%%검토%%' AND ContractCode NOT LIKE '%%-00' AND ContractCode NOT LIKE '%%-000'"
        elif status == 'engineers':
            selected_year = request.args.get('year', type=int)
            results, max_participants, available_years = _fetch_engineers_summary(cursor, selected_year)

            return render_template(
                'PMS_annualProject_engineers.html',
                projects=results,
                max_participants=max_participants,
                available_years=available_years,
                selected_year=selected_year,
            )
        else:
            return render_template('PMS_annualProject.html', year=status, projects=[], error='잘못된 status 값입니다.')

        cursor.execute(
            f"""
            SELECT
                projectID,
                ContractCode,
                ProjectName,
                ProjectCost,
                ProjectCost_NoVAT,
                ContributionRate,
                AcademicResearchRate,
                OperationalRate,
                EquipmentRate,
                StartDate,
                EndDate,
                ChangeProjectCost,
                project_status,
                yearProject,
                D_Day,
                orderPlace
            FROM projects
            WHERE {where_clause}
            ORDER BY ContractCode DESC
            """
        )
        results = cursor.fetchall()

        contract_codes_all = [row['ContractCode'] for row in results]
        contract_codes = [row['ContractCode'] for row in results]
        if not contract_codes:
            return render_template('PMS_annualProject.html', year=status, mode=status, projects=[])

        format_strings = ','.join(['%s'] * len(contract_codes))

        try:
            progress_map = calc_progress_bulk(contract_codes_all) or {}
        except Exception:
            progress_map = {}

        risk_map = {}
        try:
            has_division = False
            try:
                cursor.execute("SHOW COLUMNS FROM project_risks LIKE 'division'")
                has_division = cursor.fetchone() is not None
            except Exception:
                has_division = False

            if has_division:
                cursor.execute(
                    f"""
                    SELECT DISTINCT contractcode
                    FROM project_risks
                    WHERE contractcode IN ({format_strings})
                      AND (division IS NULL OR division <> '완료')
                    """,
                    contract_codes_all,
                )
            else:
                cursor.execute(
                    f"""
                    SELECT DISTINCT contractcode
                    FROM project_risks
                    WHERE contractcode IN ({format_strings})
                    """,
                    contract_codes_all,
                )

            for r in cursor.fetchall() or []:
                code = r.get('contractcode') if isinstance(r, dict) else (r[0] if isinstance(r, tuple) else None)
                if code:
                    risk_map[code] = True
        except Exception:
            risk_map = {}

        perf_review_map = {}
        try:
            cursor.execute(
                f"""
                SELECT ContractCode, performanceReview, reviewDate, UpdateDate
                FROM performanceevaluationfee
                WHERE ContractCode IN ({format_strings})
                ORDER BY ContractCode, COALESCE(reviewDate, UpdateDate) DESC
                """,
                contract_codes_all,
            )
            rows = cursor.fetchall() or []

            def _normalize_review_status(v):
                if v is None:
                    return None
                s = str(v).strip()
                if not s:
                    return None
                if s.lower() == 'none':
                    return None
                if s == '-':
                    return None
                return s

            def _review_score(s):
                if not s:
                    return 0
                if s == '완료':
                    return 30
                if s == '접수':
                    return 20
                if s == '없음':
                    return 10
                return 5

            for r in rows:
                if not isinstance(r, dict):
                    continue
                code = r.get('ContractCode')
                if not code:
                    continue

                status_val = _normalize_review_status(r.get('performanceReview'))
                if not status_val:
                    continue

                prev = perf_review_map.get(code)
                if (prev is None) or (_review_score(status_val) > _review_score(prev)):
                    perf_review_map[code] = status_val
        except Exception:
            perf_review_map = {}

        cursor.execute(
            f"""
            SELECT e.ContractCode, SUM(e.amount) as total
            FROM exmanager e
            JOIN state s ON e.ContractCode = s.contractCode
            WHERE e.ContractCode IN ({format_strings})
            AND (e.department = s.first_dept OR e.department = s.second_dept)
            GROUP BY e.ContractCode
            """,
            contract_codes,
        )
        exmanager_map = {row['ContractCode']: float(row['total'] or 0) for row in cursor.fetchall()}

        taskassignment_map = {}
        for project in results:
            code = project['ContractCode']

            start_date = project['StartDate']
            if isinstance(start_date, (datetime, date)):
                year_for_expense = start_date.year
            else:
                year_for_expense = int(str(start_date)[:4])

            cursor.execute(
                """
                SELECT AVG(daily_rate) AS avg_daily_rate
                FROM external_labor_rates
                WHERE ContractCode = %s
                """,
                (code,),
            )
            avg_daily_rate = cursor.fetchone()['avg_daily_rate'] or 0

            cursor.execute(
                """
                SELECT
                    t.ContractCode,
                    SUM(
                        (t.day_time / 8 *
                            CASE WHEN t.position = '외부인력' THEN %s ELSE e.Days END * 1.0
                        ) +
                        (t.night_time / 8 *
                            CASE WHEN t.position = '외부인력' THEN %s ELSE e.Days END * 2.0
                        ) +
                        (t.holiday / 8 *
                            CASE WHEN t.position = '외부인력' THEN %s ELSE e.Days END * 1.5
                        )
                    ) AS total
                FROM taskassignment t
                LEFT JOIN expenses e
                    ON t.Position = e.Position AND e.Year = %s
                WHERE t.ContractCode = %s
                GROUP BY t.ContractCode
                """,
                (avg_daily_rate, avg_daily_rate, avg_daily_rate, year_for_expense, code),
            )

            row = cursor.fetchone()
            taskassignment_map[code] = float(row['total'] or 0) if row else 0

        cursor.execute(
            f"""
            SELECT e.ContractCode, SUM(e.amount) as total
            FROM expenserecords e
            JOIN state s ON e.ContractCode = s.contractCode
            WHERE e.ContractCode IN ({format_strings})
            AND (e.department = s.first_dept OR e.department = s.second_dept)
            GROUP BY e.ContractCode
            """,
            contract_codes,
        )
        expenserecords_map = {row['ContractCode']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"SELECT contract_code, SUM(outsourcing_cost_NoVAT) as total FROM outsourcing WHERE contract_code IN ({format_strings}) GROUP BY contract_code",
            contract_codes_all,
        )
        outsourcing_map = {row['contract_code']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"""
            SELECT ContractCode, division, SUM(amount) as total, ReceiptDate
            FROM businessreceiptdetails
            WHERE ContractCode IN ({format_strings})
            GROUP BY ContractCode, division, ReceiptDate
            ORDER BY ContractCode, ReceiptDate ASC
            """,
            contract_codes_all,
        )
        receipt_data = cursor.fetchall()

        cursor.execute(
            f"""
            SELECT o.contract_code, SUM(omp.Cost_NoVAT) AS total
            FROM outSourcing_MoneyPayment AS omp
            JOIN outsourcing AS o ON o.id = omp.outsourcing_id
            WHERE o.contract_code IN ({format_strings})
            GROUP BY o.contract_code
            """,
            contract_codes_all,
        )
        outsourcing_paid_map = {row['contract_code']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"SELECT ContractCode, SUM(money) as total FROM usemoney WHERE ContractCode IN ({format_strings}) GROUP BY ContractCode",
            contract_codes_all,
        )
        usemoney_map = {row['ContractCode']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"SELECT contract_code, SUM(change_Cost_NoVAT) as total FROM outsourcing WHERE contract_code IN ({format_strings}) GROUP BY contract_code",
            contract_codes_all,
        )
        outsourcing_real_map = {row['contract_code']: float(row['total'] or 0) for row in cursor.fetchall()}

        cursor.execute(
            f"""
            SELECT ContractCode, Description, SUM(Amount) as total
            FROM performanceevaluationfee
            WHERE ContractCode IN ({format_strings})
            GROUP BY ContractCode, Description
            """,
            contract_codes_all,
        )

        performance_est_map = {}
        performance_act_map = {}

        for row in cursor.fetchall():
            code = row['ContractCode']
            desc = row['Description']
            total = float(row['total'] or 0)

            if desc == '당초 내역서':
                performance_est_map[code] = total
            elif desc in ('변경 내역서', '실납부액'):
                performance_act_map[code] = total
            elif desc in ('발주처 납부', '성과심사 없음'):
                performance_est_map[code] = total
                performance_act_map[code] = total

        for project in results:
            code = project['ContractCode']

            estimated_labor = exmanager_map.get(code, 0)
            estimated_expense = expenserecords_map.get(code, 0)
            estimated_other = outsourcing_map.get(code, 0)
            estimated_performance = performance_est_map.get(code, 0)

            actual_labor = taskassignment_map.get(code, 0)
            actual_expense = usemoney_map.get(code, 0)
            actual_other = outsourcing_real_map.get(code, 0)
            actual_performance = performance_act_map.get(code, 0)

            project['estimated_labor'] = estimated_labor
            project['estimated_expense'] = estimated_expense
            project['estimated_other'] = estimated_other
            project['estimated_performance'] = estimated_performance
            project['estimated_total'] = estimated_labor + estimated_expense + estimated_other + estimated_performance

            project['actual_labor'] = round(actual_labor)
            project['actual_expense'] = actual_expense
            project['actual_other'] = actual_other
            project['actual_performance'] = actual_performance
            project['actual_total'] = actual_labor + actual_expense + actual_other + actual_performance

            project_receipts = [
                {
                    'division': row['division'],
                    'amount': float(row['total'] or 0),
                    'receipt_date': row['ReceiptDate'].strftime('%Y-%m-%d') if row['ReceiptDate'] else None,
                }
                for row in receipt_data
                if row['ContractCode'] == code
            ]
            project['receipt_details'] = project_receipts

            paid = outsourcing_paid_map.get(code, 0.0)
            project['outsourcing_paid'] = paid
            project['outsourcing_balance'] = actual_other - paid

            try:
                project['total_progress'] = float(progress_map.get(code, 0.0))
            except Exception:
                project['total_progress'] = 0.0
            project['performance_review'] = perf_review_map.get(code)
            project['has_risk'] = bool(risk_map.get(code))

        return render_template('PMS_annualProject.html', year=status, mode=status, projects=results)
    except Exception as e:
        print(f'[ERROR] 상태별 통합자료 조회 실패: {e}')
        if status == 'engineers':
            return render_template(
                'PMS_annualProject_engineers.html',
                projects=[],
                max_participants=1,
                available_years=[],
                selected_year=request.args.get('year', type=int),
                error=str(e),
            )
        return render_template('PMS_annualProject.html', year=status, mode=status, projects=[], error=str(e))
    finally:
        cursor.close()
        db.close()


@bp.route('/api/complete_projects_years')
def get_complete_projects_years():
    try:
        db = create_connection()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                CASE
                    WHEN project_status LIKE '준공(%' THEN
                        TRIM(TRAILING ')' FROM SUBSTRING(project_status, 4))
                END as year,
                COUNT(*) as count
            FROM projects
            WHERE project_status LIKE '준공%'
              AND ContractCode NOT LIKE '%%검토%%'
              AND ContractCode NOT LIKE '%%-00'
              AND ContractCode NOT LIKE '%%-000'
            GROUP BY year
            ORDER BY year DESC
            """
        )

        results = cursor.fetchall()

        processed_results = []
        for row in results:
            try:
                year_str = str(row['year']).strip()

                if len(year_str) == 2 and year_str.isdigit():
                    year_val = int('20' + year_str)
                elif len(year_str) == 4 and year_str.isdigit():
                    year_val = int(year_str)
                else:
                    continue

                processed_results.append({'year': year_val, 'count': row['count']})

            except (ValueError, TypeError):
                continue

        year_totals = {}
        for item in processed_results:
            year_val = item['year']
            count = item['count']
            if year_val in year_totals:
                year_totals[year_val] += count
            else:
                year_totals[year_val] = count

        final_results = [{'year': year_val, 'count': count} for year_val, count in sorted(year_totals.items(), reverse=True)]

        return jsonify(final_results)

    except Exception as e:
        print(f'[ERROR] 준공사업 연도별 통계 조회 실패: {e}')
        return jsonify([]), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'db' in locals():
            db.close()


@bp.route('/api/export_annual_project', methods=['POST'])
def export_annual_project():
    try:
        data = request.get_json()
        processed_projects = data.get('processedProjects', [])
        total = data.get('total', {})
        year = data.get('year', datetime.now().year)
        current_year = datetime.now().year

        if not processed_projects:
            return jsonify({'error': True, 'message': '내보낼 데이터가 없습니다.'}), 400

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})

        header_format = workbook.add_format(
            {'bold': True, 'bg_color': '#4472C4', 'font_color': 'white', 'align': 'center', 'valign': 'vcenter', 'border': 1}
        )

        category_end_format = workbook.add_format(
            {
                'bold': True,
                'bg_color': '#4472C4',
                'font_color': 'white',
                'align': 'center',
                'valign': 'vcenter',
                'border': 1,
                'right': 2,
            }
        )

        money_format = workbook.add_format({'num_format': '#,##0', 'align': 'right', 'border': 1})

        date_format = workbook.add_format({'num_format': 'yyyy-mm-dd', 'align': 'center', 'border': 1})

        profit_positive_format = workbook.add_format({'num_format': '#,##0', 'align': 'right', 'border': 1, 'font_color': 'black'})
        profit_negative_format = workbook.add_format({'num_format': '#,##0', 'align': 'right', 'border': 1, 'font_color': 'red'})

        margin_positive_format = workbook.add_format({'num_format': '0.000%', 'align': 'center', 'border': 1, 'font_color': 'black'})
        margin_negative_format = workbook.add_format({'num_format': '0.000%', 'align': 'center', 'border': 1, 'font_color': 'red'})

        current_year_receipt_format = workbook.add_format(
            {'num_format': '#,##0', 'align': 'right', 'border': 1, 'font_color': 'red', 'bold': True}
        )
        normal_receipt_format = workbook.add_format({'num_format': '#,##0', 'align': 'right', 'border': 1, 'font_color': 'black'})

        progress2nd_positive_format = workbook.add_format(
            {'num_format': '#,##0', 'align': 'right', 'border': 1, 'font_color': 'red', 'bold': True}
        )
        progress2nd_zero_format = workbook.add_format({'num_format': '#,##0', 'align': 'right', 'border': 1, 'font_color': 'black'})

        text_format = workbook.add_format({'align': 'left', 'border': 1})
        center_format = workbook.add_format({'align': 'center', 'border': 1})

        worksheet = workbook.add_worksheet(f'{year}년_연도별통합자료')

        worksheet.set_column('A:A', 10)
        worksheet.set_column('B:B', 20)
        worksheet.set_column('C:C', 40)
        worksheet.set_column('D:D', 25)
        worksheet.set_column('E:F', 12)
        worksheet.set_column('G:G', 8)
        worksheet.set_column('H:I', 20)
        worksheet.set_column('J:R', 13)
        worksheet.set_column('S:AA', 13)
        worksheet.set_column('AB:AE', 15)

        worksheet.merge_range(1, 0, 1, 8, '구분', category_end_format)
        worksheet.merge_range(1, 9, 1, 17, '예상진행비', category_end_format)
        worksheet.merge_range(1, 18, 1, 26, '실제진행비', category_end_format)
        worksheet.merge_range(1, 27, 1, 30, '사업비 수령내역', category_end_format)

        detailed_headers = [
            'No.',
            '사업번호',
            '사업명',
            '발주처',
            '계약일자',
            '준공일자',
            'D-Day',
            '사업비(총괄,VAT포함)',
            '사업비(총괄,VAT제외)',
            '사업비(지분,VAT포함)',
            '사업비(지분,VAT제외)',
            '제경비',
            '자체인건비',
            '자체경비',
            '외주경비',
            '성과심사비',
            '손익금액',
            '손익비율',
            '사업비(지분,VAT포함)',
            '사업비(지분,VAT제외)',
            '제경비',
            '자체인건비',
            '자체경비',
            '외주경비',
            '성과심사비',
            '손익금액',
            '손익비율',
            '선금',
            '1차기성금',
            '2차기성금',
            '준공금',
        ]

        section_ends = [8, 17, 26, 30]

        for col, header in enumerate(detailed_headers):
            if col in section_ends:
                end_header_format = workbook.add_format(
                    {
                        'bold': True,
                        'bg_color': '#4472C4',
                        'font_color': 'white',
                        'align': 'center',
                        'valign': 'vcenter',
                        'border': 1,
                        'right': 2,
                    }
                )
                worksheet.write(2, col, header, end_header_format)
            else:
                worksheet.write(2, col, header, header_format)

        row = 3
        for idx, project in enumerate(processed_projects, 1):

            def check_current_year_receipt(receipt_details, division_keyword):
                if not receipt_details:
                    return False
                for receipt in receipt_details:
                    if receipt.get('division', '').find(division_keyword) != -1 and receipt.get('receipt_date'):
                        try:
                            receipt_year = datetime.strptime(receipt['receipt_date'], '%Y-%m-%d').year
                            if receipt_year == current_year:
                                return True
                        except Exception:
                            continue
                return False

            has_current_year_advance = check_current_year_receipt(project.get('receipt_details', []), '선금')
            has_current_year_completion = check_current_year_receipt(project.get('receipt_details', []), '준공')

            estimated_profit = project.get('estimated_profit', 0)
            estimated_margin = float(project.get('estimated_margin', 0))
            actual_profit = project.get('actual_profit', 0)
            actual_margin = float(project.get('actual_margin', 0))

            est_profit_format = profit_negative_format if estimated_profit < 0 else profit_positive_format
            act_profit_format = profit_negative_format if actual_profit < 0 else profit_positive_format

            money_end_format = workbook.add_format({'num_format': '#,##0', 'align': 'right', 'border': 1, 'right': 2})

            col = 0

            worksheet.write(row, col, idx, center_format)
            col += 1
            worksheet.write(row, col, project.get('ContractCode', ''), text_format)
            col += 1
            worksheet.write(row, col, project.get('ProjectName', ''), text_format)
            col += 1
            worksheet.write(row, col, project.get('orderPlace', ''), text_format)
            col += 1

            start_date = project.get('StartDate', '')
            if start_date:
                try:
                    date_obj = datetime.strptime(start_date, '%a, %d %b %Y %H:%M:%S GMT')
                    worksheet.write_datetime(row, col, date_obj, date_format)
                except Exception:
                    worksheet.write(row, col, start_date, center_format)
            else:
                worksheet.write(row, col, '', center_format)
            col += 1

            end_date = project.get('EndDate', '')
            if end_date:
                try:
                    date_obj = datetime.strptime(end_date, '%a, %d %b %Y %H:%M:%S GMT')
                    worksheet.write_datetime(row, col, date_obj, date_format)
                except Exception:
                    worksheet.write(row, col, end_date, center_format)
            else:
                worksheet.write(row, col, '', center_format)
            col += 1

            d_day_val = project.get('D_Day', None)
            d_day_text = ''
            try:
                if d_day_val is not None and str(d_day_val) != '':
                    d_day_int = int(float(d_day_val))
                    if d_day_int == 0:
                        d_day_text = 'D-0'
                    elif d_day_int > 0:
                        d_day_text = f'D+{abs(d_day_int)}'
                    else:
                        d_day_text = f'D-{abs(d_day_int)}'
            except Exception:
                d_day_text = str(d_day_val) if d_day_val is not None else ''
            worksheet.write(row, col, d_day_text, center_format)
            col += 1

            worksheet.write(row, col, project.get('ProjectCost', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('ProjectCost_NoVAT', 0), money_end_format)
            col += 1

            worksheet.write(row, col, project.get('contractCostShareVAT', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('contractCostShare', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('EX_company_money', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('estimated_labor', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('estimated_expense', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('estimated_other', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('estimated_performance', 0), money_format)
            col += 1
            worksheet.write(row, col, estimated_profit, est_profit_format)
            col += 1

            est_margin_end_format = workbook.add_format(
                {
                    'num_format': '0.000%',
                    'align': 'center',
                    'border': 1,
                    'right': 2,
                    'font_color': 'red' if estimated_margin < 0 else 'black',
                }
            )
            worksheet.write(row, col, estimated_margin / 100, est_margin_end_format)
            col += 1

            worksheet.write(row, col, project.get('realCostShare_VAT', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('realCostShare', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('AC_company_money', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('actual_labor', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('actual_expense', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('actual_other', 0), money_format)
            col += 1
            worksheet.write(row, col, project.get('actual_performance', 0), money_format)
            col += 1
            worksheet.write(row, col, actual_profit, act_profit_format)
            col += 1

            act_margin_end_format = workbook.add_format(
                {
                    'num_format': '0.000%',
                    'align': 'center',
                    'border': 1,
                    'right': 2,
                    'font_color': 'red' if actual_margin < 0 else 'black',
                }
            )
            worksheet.write(row, col, actual_margin / 100, act_margin_end_format)
            col += 1

            advance_format = current_year_receipt_format if has_current_year_advance else normal_receipt_format
            worksheet.write(row, col, project.get('advanceTotal', 0), advance_format)
            col += 1

            worksheet.write(row, col, project.get('progress1stTotal', 0), normal_receipt_format)
            col += 1

            progress2nd_total = project.get('progress2ndTotal', 0)
            progress2nd_format = progress2nd_positive_format if progress2nd_total > 0 else progress2nd_zero_format
            worksheet.write(row, col, progress2nd_total, progress2nd_format)
            col += 1

            completion_end_format = workbook.add_format(
                {
                    'num_format': '#,##0',
                    'align': 'right',
                    'border': 1,
                    'right': 2,
                    'font_color': 'red' if has_current_year_completion else 'black',
                    'bold': True if has_current_year_completion else False,
                }
            )
            worksheet.write(row, col, project.get('completionTotal', 0), completion_end_format)
            col += 1

            row += 1

        total_format = workbook.add_format({'bold': True, 'bg_color': '#E7E6E6', 'num_format': '#,##0', 'align': 'right', 'border': 1})

        total_end_format = workbook.add_format(
            {'bold': True, 'bg_color': '#E7E6E6', 'num_format': '#,##0', 'align': 'right', 'border': 1, 'right': 2}
        )

        total_est_profit = total.get('estimated_profit', 0)
        total_act_profit = total.get('actual_profit', 0)

        total_est_profit_format = workbook.add_format(
            {
                'bold': True,
                'bg_color': '#E7E6E6',
                'num_format': '#,##0',
                'align': 'right',
                'border': 1,
                'font_color': 'red' if total_est_profit < 0 else 'black',
            }
        )

        total_act_profit_format = workbook.add_format(
            {
                'bold': True,
                'bg_color': '#E7E6E6',
                'num_format': '#,##0',
                'align': 'right',
                'border': 1,
                'font_color': 'red' if total_act_profit < 0 else 'black',
            }
        )

        col = 0
        worksheet.write(row, col, '총계', total_format)
        col += 1
        worksheet.write(row, col, '', total_format)
        col += 1
        worksheet.write(row, col, '', total_format)
        col += 1
        worksheet.write(row, col, '', total_format)
        col += 1
        worksheet.write(row, col, '', total_format)
        col += 1
        worksheet.write(row, col, '', total_format)
        col += 1
        worksheet.write(row, col, '', total_format)
        col += 1
        worksheet.write(row, col, total.get('ProjectCost', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('ProjectCost_NoVAT', 0), total_end_format)
        col += 1

        worksheet.write(row, col, total.get('contractCostShareVAT', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('contractCostShare', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('EX_money', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('estimated_labor', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('estimated_expense', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('estimated_other', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('estimated_performance', 0), total_format)
        col += 1
        worksheet.write(row, col, total_est_profit, total_est_profit_format)
        col += 1
        worksheet.write(row, col, '', total_end_format)
        col += 1

        worksheet.write(row, col, total.get('realCostShare_VAT', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('realCostShare', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('AC_money', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('actual_labor', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('actual_expense', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('actual_other', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('actual_performance', 0), total_format)
        col += 1
        worksheet.write(row, col, total_act_profit, total_act_profit_format)
        col += 1
        worksheet.write(row, col, '', total_end_format)
        col += 1

        total_progress2nd = total.get('progress2ndTotal', 0)
        total_progress2nd_format = workbook.add_format(
            {
                'bold': True,
                'bg_color': '#E7E6E6',
                'num_format': '#,##0',
                'align': 'right',
                'border': 1,
                'font_color': 'red' if total_progress2nd > 0 else 'black',
            }
        )

        worksheet.write(row, col, total.get('advanceTotal', 0), total_format)
        col += 1
        worksheet.write(row, col, total.get('progress1stTotal', 0), total_format)
        col += 1
        worksheet.write(row, col, total_progress2nd, total_progress2nd_format)
        col += 1
        worksheet.write(row, col, total.get('completionTotal', 0), total_end_format)
        col += 1

        workbook.close()
        output.seek(0)

        filename = f"{year}년_연도별통합자료_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename,
        )

    except Exception as e:
        print(f'Error: {e}')
        traceback.print_exc()
        return jsonify({'error': True, 'message': '엑셀 파일 생성 중 오류가 발생했습니다.'}), 500


@bp.route('/api/companyExpense/<int:year>')
def get_company_expense(year):
    db = create_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT DISTINCT `year`
            FROM companyexpenses
            ORDER BY `year` DESC
            """
        )
        years_rows = cursor.fetchall()
        years = [row['year'] for row in years_rows]

        cursor.execute(
            """
            SELECT AcademicResearchRate, OperationalRate, EquipmentRate
            FROM companyexpenses
            WHERE `year` = %s
            LIMIT 1
            """,
            (year,),
        )
        row = cursor.fetchone()

        if row:

            def to_float(v):
                return float(v) if isinstance(v, (int, float, Decimal)) and v is not None else None

            data = [
                {'item': '사전비용', 'price': to_float(row.get('AcademicResearchRate'))},
                {'item': '운영비용', 'price': to_float(row.get('OperationalRate'))},
                {'item': '공정비용', 'price': to_float(row.get('EquipmentRate'))},
            ]
        else:
            data = [
                {'item': '사전비용', 'price': None},
                {'item': '운영비용', 'price': None},
                {'item': '공정비용', 'price': None},
            ]

        return jsonify({'years': years, 'data': data})

    except Exception as e:
        return jsonify({'error': True, 'message': str(e)}), 500
    finally:
        cursor.close()
        db.close()


@bp.route('/api/annual_project_engineers')
def annual_project_engineers_api():
    selected_year = request.args.get('year', type=int)
    db = create_connection()
    cursor = db.cursor(dictionary=True)
    try:
        projects, max_participants, available_years = _fetch_engineers_summary(cursor, selected_year)
        return jsonify(
            {
                'success': True,
                'projects': projects,
                'max_participants': max_participants,
                'available_years': available_years,
                'selected_year': selected_year,
            }
        )
    except Exception as e:
        print(f'[ERROR] 참여기술자 조회 실패: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        cursor.close()
        db.close()


@bp.route('/api/annual_project_engineers/save', methods=['POST'])
def annual_project_engineers_save():
    data = request.get_json(silent=True) or {}
    projects = data.get('projects') or []
    if not isinstance(projects, list):
        return jsonify({'success': False, 'message': 'invalid payload'}), 400

    db = create_connection()
    cursor = db.cursor()
    try:
        insert_sql = (
            'INSERT INTO project_engineers '
            '(contractcode, WorkField, work_position, department, name, position, remark) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s)'
        )

        for project in projects:
            contract_code = str(project.get('contractcode') or '').strip()
            if not contract_code:
                continue

            cursor.execute('DELETE FROM project_engineers WHERE contractcode = %s', (contract_code,))

            def _insert_names(role, names):
                for name in names:
                    cleaned = str(name or '').strip()
                    if not cleaned:
                        continue
                    cursor.execute(
                        insert_sql,
                        (contract_code, '', role, '', cleaned, '', ''),
                    )

            _insert_names('사책', project.get('chief') or [])
            _insert_names('분책', project.get('subchief') or [])
            _insert_names('분참', project.get('participants') or [])

        db.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.rollback()
        print(f'[ERROR] 참여기술자 저장 실패: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        cursor.close()
        db.close()


@bp.route('/api/companyExpense/<int:year>', methods=['POST'])
def upsert_company_expense(year):
    """
    요청 바디(JSON):
    {
      "AcademicResearchRate": 1.23,
      "OperationalRate": 2.34,
      "EquipmentRate": 3.45
    }
    """

    def to_float_or_none(v):
        if v is None or v == '':
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None

    payload = request.get_json(silent=True) or {}
    ar = to_float_or_none(payload.get('AcademicResearchRate'))
    op = to_float_or_none(payload.get('OperationalRate'))
    eq = to_float_or_none(payload.get('EquipmentRate'))

    db = create_connection()
    cursor = db.cursor()
    try:
        sql = """
            INSERT INTO companyexpenses
                (`year`, AcademicResearchRate, OperationalRate, EquipmentRate)
            VALUES (%s, %s, %s, %s)
            AS new
            ON DUPLICATE KEY UPDATE
                AcademicResearchRate = COALESCE(new.AcademicResearchRate, companyexpenses.AcademicResearchRate),
                OperationalRate      = COALESCE(new.OperationalRate,      companyexpenses.OperationalRate),
                EquipmentRate        = COALESCE(new.EquipmentRate,        companyexpenses.EquipmentRate)
        """
        cursor.execute(sql, (year, ar, op, eq))
        db.commit()

        return jsonify({'ok': True, 'message': '저장되었습니다.'})

    except Exception as e:
        db.rollback()
        return jsonify({'ok': False, 'message': str(e)}), 500
    finally:
        cursor.close()
        db.close()
