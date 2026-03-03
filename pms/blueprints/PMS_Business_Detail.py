from __future__ import annotations

from decimal import Decimal

import pymysql
from flask import Blueprint, jsonify, render_template, request

from ..db import create_connection
from ..services.progress import calc_progress_bulk
from ..utils.files import format_file_size


bp = Blueprint('business_detail', __name__)


@bp.route('/project_detail/<int:project_id>', methods=['GET'])
def project_detail(project_id: int):
    db = create_connection()
    cursor = db.cursor()

    # 프로젝트 기본 정보 조회
    cursor.execute("SELECT * FROM projects WHERE ProjectID = %s", (project_id,))
    project_tuple = cursor.fetchone()

    if project_tuple is None:
        cursor.close()
        db.close()
        return "Project not found", 404

    columns = [col[0] for col in cursor.description]
    project_dict = dict(zip(columns, project_tuple))

    # 참조사업 정보 조회
    reference_projects: dict[str, dict[str, object]] = {}
    reference_fields = [
        'referenceProject1',
        'referenceProject2',
        'referenceProject3',
        'referenceProject4',
        'referenceProject5',
    ]

    for field in reference_fields:
        if project_dict.get(field):
            cursor.execute(
                """
                SELECT ProjectID, ProjectName
                FROM projects
                WHERE ContractCode = %s
                """,
                (project_dict[field],),
            )
            ref_project = cursor.fetchone()
            if ref_project:
                reference_projects[project_dict[field]] = {
                    'project_id': ref_project[0],
                    'project_name': ref_project[1],
                }

    # ChangeProjectCost가 있는지 확인하고 있다면 ProjectCost 업데이트
    if project_dict.get('ChangeProjectCost'):
        project_dict['ProjectCost'] = project_dict['ChangeProjectCost']
        project_dict['ChangeProjectCost'] = round(float(project_dict['ChangeProjectCost']) / 1.1)
    else:
        project_dict['ChangeProjectCost'] = project_dict['ProjectCost_NoVAT']

    # None 값을 빈 문자열로 변환
    for key, value in list(project_dict.items()):
        if value is None:
            project_dict[key] = ''

    # state 테이블에서 부서 정보 조회
    cursor.execute(
        """
        SELECT first_dept, second_dept
        FROM state
        WHERE ContractCode = %s
        """,
        (project_dict['ContractCode'],),
    )
    departments = cursor.fetchone()

    first_expense_list: list[dict[str, object]] = []
    second_expense_list: list[dict[str, object]] = []

    if departments:
        first_dept, second_dept = departments

        # [1] 첫 번째 부서 예산 데이터
        cursor.execute(
            """
            SELECT *
            FROM exmanager
            WHERE ContractCode = %s AND Position != "총 계" AND department = %s
            ORDER BY CASE
                WHEN Position = '이사' THEN 1
                WHEN Position = '부장' THEN 2
                WHEN Position = '차장' THEN 3
                WHEN Position = '과장' THEN 4
                WHEN Position = '대리' THEN 5
                WHEN Position = '주임' THEN 6
                WHEN Position = '사원' THEN 7
                WHEN Position = '계약직' THEN 8
                ELSE 9
            END
            """,
            (project_dict['ContractCode'], first_dept),
        )
        first_budget = cursor.fetchall()

        # [2] 첫 번째 부서 경비 데이터
        cursor.execute(
            """
            SELECT *
            FROM expenserecords
            WHERE ContractCode = %s AND department = %s
            """,
            (project_dict['ContractCode'], first_dept),
        )
        first_records = cursor.fetchall()

        account_order = {
            '복리후생비/식대': 1,
            '복리후생비/음료 외': 2,
            '여비교통비/(출장)숙박': 3,
            '여비교통비/주차료': 4,
            '여비교통비/대중교통': 5,
            '소모품비/현장물품': 6,
            '소모품비/기타소모품': 7,
            '차량유지비/주유': 8,
            '차량유지비/차량수리 외': 9,
            '도서인쇄비/출력 및 제본': 10,
            '운반비/등기우편 외': 11,
            '지급수수료/증명서발급': 12,
            '기타/그 외 기타': 99,
        }

        def process_expense_data(records):
            seen_accounts: dict[str, float] = {}
            for row in records:
                account = row[1]
                amount = row[5]
                if amount is None:
                    amount = 0.0
                elif isinstance(amount, Decimal):
                    amount = float(amount)
                else:
                    amount = float(Decimal(amount))

                if account in seen_accounts:
                    seen_accounts[account] += amount
                else:
                    seen_accounts[account] = amount

            if not records:
                return [{"account": "기타", "amount": 0.0}]
            return sorted(
                [{"account": key, "amount": value} for key, value in seen_accounts.items()],
                key=lambda x: account_order.get(x["account"], 100),
            )

        first_expense_list = process_expense_data(first_records)

        # [3] 두 번째 부서 예산/경비 데이터
        cursor.execute(
            """
            SELECT *
            FROM exmanager
            WHERE ContractCode = %s AND Position != "총 계" AND department = %s
            """,
            (project_dict['ContractCode'], second_dept),
        )
        second_budget = cursor.fetchall()

        cursor.execute(
            """
            SELECT *
            FROM expenserecords
            WHERE ContractCode = %s AND department = %s
            """,
            (project_dict['ContractCode'], second_dept),
        )
        second_records = cursor.fetchall()

        second_expense_list = process_expense_data(second_records)

    else:
        first_budget = []
        first_records = []
        second_budget = []
        second_records = []
        first_dept = None
        second_dept = None

    # RecordsPrice 테이블 데이터 조회 (기준 데이터)
    cursor.execute(
        """
        SELECT ITEM
        FROM RecordsPrice
        WHERE YEAR = %s
        ORDER BY CASE
            WHEN ITEM = '복리후생비/식대' THEN 1
            WHEN ITEM = '복리후생비/음료 외' THEN 2
            WHEN ITEM = '여비교통비/(출장)숙박' THEN 3
            WHEN ITEM = '여비교통비/주차료' THEN 4
            WHEN ITEM = '여비교통비/대중교통' THEN 5
            WHEN ITEM = '소모품비/현장물품' THEN 6
            WHEN ITEM = '소모품비/기타소모품' THEN 7
            WHEN ITEM = '차량유지비/주유' THEN 8
            WHEN ITEM = '차량유지비/차량수리 외' THEN 9
            WHEN ITEM = '도서인쇄비/출력 및 제본' THEN 10
            WHEN ITEM = '운반비/등기우편 외' THEN 11
            WHEN ITEM = '지급수수료/증명서발급' THEN 12
            WHEN ITEM = '기타/그 외 기타' THEN 99
            ELSE 14
        END
        """,
        (2024,),
    )
    records_price = [item[0] for item in cursor.fetchall()]

    # TaskQuantity 테이블에서 department 값 가져오기
    cursor.execute(
        """
        SELECT DISTINCT department
        FROM TaskQuantity
        WHERE ContractCode = %s
        """,
        (project_dict['ContractCode'],),
    )
    department = [row[0] for row in cursor.fetchall()]

    # outsourcing 테이블에서 outsourcing_type 값 확인
    cursor.execute(
        """
        SELECT DISTINCT outsourcing_type
        FROM outsourcing
        WHERE Contract_Code = %s
        """,
        (project_dict['ContractCode'],),
    )
    outsourcing_result = cursor.fetchall()

    # outsourcing에 값이 있으면 '외주' 추가
    if outsourcing_result:
        department.append('외주')

    # 전체 평균 진행률 계산: 공용 함수로 통일 (외주 '추가제안' 자동 제외)
    try:
        progress_map = calc_progress_bulk([project_dict['ContractCode']])
        total_progress = float(progress_map.get(project_dict['ContractCode'], 0.0))
    except Exception:
        total_progress = 0.0

    # 부서별 보할(project_depbohal)
    try:
        cursor.execute(
            """
            SELECT department, COALESCE(bohal, 0) AS bohal
            FROM project_depbohal
            WHERE contractcode = %s
            """,
            (project_dict['ContractCode'],),
        )
        _rows = cursor.fetchall() or []
        department_bohal = {str(r[0]): float(r[1] or 0) for r in _rows if r and r[0]}
    except Exception:
        department_bohal = {}

    # 프로젝트 관련 파일 목록 조회
    cursor.execute(
        """
        SELECT FileID, OriginalFileName, FileSize, FileType, UploadDate
        FROM ProjectFiles
        WHERE ContractCode = %s
        ORDER BY UploadDate DESC
        """,
        (project_dict['ContractCode'],),
    )

    project_files = []
    for file in cursor.fetchall():
        project_files.append(
            {
                'id': file[0],
                'name': file[1],
                'size': format_file_size(file[2]),
                'type': file[3],
                'date': file[4].strftime('%Y-%m-%d %H:%M:%S'),
            }
        )

    # 코멘트 조회
    cursor.execute(
        """
        SELECT comment, department
        FROM Project_comment
        WHERE contractcode = %s
        ORDER BY input_num ASC
        """,
        (project_dict['ContractCode'],),
    )
    comments = [{"comment": row[0], "department": row[1]} for row in cursor.fetchall()]

    # 외부인력 단가 조회
    cursor.execute(
        """
        SELECT position, monthly_rate, daily_rate, contract_date
        FROM external_labor_rates
        WHERE contractcode = %s
        ORDER BY daily_rate ASC
        """,
        (project_dict['ContractCode'],),
    )
    external = cursor.fetchall()

    # 외주 지급내역 조회
    cursor.execute(
        """
        SELECT
          omp.outsourcing_id,
          omp.CompanyName,
          omp.Division,
          omp.Cost_VAT,
          omp.Cost_NoVAT,
          omp.PaymentDate,
          omp.Remark
        FROM outSourcing_MoneyPayment AS omp
        JOIN outsourcing AS o ON o.id = omp.outsourcing_id
        WHERE o.contract_code = %s
        ORDER BY o.id, omp.Division
        """,
        (project_dict['ContractCode'],),
    )
    _rows = cursor.fetchall()
    _cols = [desc[0] for desc in cursor.description]
    outsourcing_payments = [dict(zip(_cols, row)) for row in _rows]

    # 성과심사비 데이터 조회
    cursor.execute(
        """
        SELECT Amount, Description
        FROM performanceevaluationfee
        WHERE ContractCode = %s
        """,
        (project_dict['ContractCode'],),
    )

    performance_rows = cursor.fetchall() or []
    performance_data = [
        {"amount": r[0], "description": r[1]}
        for r in performance_rows
        if r is not None and len(r) >= 2
    ]

    has_actual_payment = any(item["description"] == "실납부액" for item in performance_data)
    has_no_review = any(item["description"] == "성과심사 없음" for item in performance_data)

    filtered_performance_data = []
    if has_no_review:
        filtered_performance_data = [
            item for item in performance_data if item["description"] == "성과심사 없음"
        ]
    else:
        for item in performance_data:
            if item["description"] in ["당초 내역서", "발주처 납부"]:
                filtered_performance_data.append(item)

        if not has_actual_payment:
            revised = next((it for it in performance_data if it["description"] == "변경 내역서"), None)
            if revised:
                filtered_performance_data.append(revised)

        if has_actual_payment:
            for item in performance_data:
                if item["description"] == "실납부액":
                    filtered_performance_data.append(item)

    performance_result = {"filtered_data": filtered_performance_data}

    cursor.close()
    db.close()

    return render_template(
        'PMS_Business_Detail.html',
        project=project_dict,
        project_files=project_files,
        first_dept=first_dept,
        second_dept=second_dept,
        first_budget=first_budget,
        first_records=first_records,
        first_expense_list=first_expense_list,
        second_expense_list=second_expense_list,
        second_budget=second_budget,
        second_records=second_records,
        department=department,
        records_price=records_price,
        reference_projects=reference_projects,
        comments=comments,
        total_progress=total_progress,
        department_bohal=department_bohal,
        external=external,
        performance_result=performance_result,
        outsourcing_payments=outsourcing_payments,
    )


@bp.route('/project_detail/<int:project_id>', methods=['POST'])
def update_details(project_id: int):
    if request.content_type != 'application/json':
        return jsonify({"message": "Unsupported Media Type"}), 415

    project_info = request.get_json()
    if not project_info:
        return jsonify({"message": "No data provided"}), 400

    try:
        contractCode = project_info['contractCode']
        projectName = project_info['projectName']
        projectCost = project_info['projectCost'].replace(',', '')
        ProjectCost_NoVAT = project_info['projectCost_NoVAT'].replace(',', '')
        startDate = project_info['startDate']
        endDate = project_info.get('endDate')
        orderPlace = project_info['orderPlace']
        manager = project_info['manager']
        contributionRate = project_info['contributionRate']
        projectDetails = project_info['projectDetails']
        academicResearchRate = project_info.get('academicResearchRate')
        operationalRate = project_info.get('operationalRate')
        equipmentRate = project_info.get('equipmentRate')

        if not endDate:
            endDate = None
        if not academicResearchRate or academicResearchRate == '-':
            academicResearchRate = None
        if not operationalRate or operationalRate == '-':
            operationalRate = None
        if not equipmentRate or equipmentRate == '-':
            equipmentRate = None

        connection = create_connection()
        cursor = connection.cursor()

        query = """
        UPDATE projects SET
            contractCode = %s, projectName = %s, projectCost = %s,
            projectCost_NoVAT = %s, startDate = %s, endDate = %s, orderPlace = %s,
            manager = %s, contributionRate = %s, projectDetails = %s,
            academicResearchRate = %s, operationalRate = %s, equipmentRate = %s
        WHERE ProjectID = %s
        """

        values = (
            contractCode,
            projectName,
            projectCost,
            ProjectCost_NoVAT,
            startDate,
            endDate,
            orderPlace,
            manager,
            contributionRate,
            projectDetails,
            academicResearchRate,
            operationalRate,
            equipmentRate,
            project_id,
        )

        cursor.execute(query, values)
        connection.commit()
        return jsonify({"message": "Update successful", "project_id": project_id})
    except pymysql.MySQLError as e:
        return jsonify({"message": f"Failed to update project details. Error: {e}"}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'connection' in locals():
            connection.close()


@bp.route('/api/save_personnel_budget', methods=['POST'])
def save_personnel_budget():
    """인건비 저장 (clone 기능 제거: exmanager만 사용)."""
    data = request.get_json()
    project_id = data.get('ProjectID')
    budget_data = data.get('BudgetData', [])

    if not budget_data:
        return jsonify({'message': 'No personnel budget data received'}), 400

    table_name = 'exmanager'

    conn = create_connection()
    cursor = conn.cursor()

    try:
        agg = {}
        unique_contract_departments = set()
        for row in budget_data:
            cc = str(row.get('ContractCode', '')).strip()
            dept = str(row.get('department', '')).strip()
            pos = str(row.get('Position', '')).strip()
            if not cc or not dept or not pos:
                continue
            if pos in ('총 계', '선택하세요'):
                continue

            key = (cc, dept, pos)
            unique_contract_departments.add((cc, dept))

            md = Decimal(str(row.get('M_D') or 0))
            person = Decimal(str(row.get('person') or 0))
            amount = Decimal(str(row.get('amount') or 0))

            if key not in agg:
                agg[key] = {'M_D': md, 'person': person, 'amount': amount}
            else:
                agg[key]['M_D'] += md
                agg[key]['person'] += person
                agg[key]['amount'] += amount

        for cc, dept in unique_contract_departments:
            cursor.execute(
                f"""
                DELETE FROM {table_name}
                WHERE ContractCode = %s AND department = %s AND ProjectID = %s
                """,
                (cc, dept, project_id),
            )

        for (cc, dept, pos), vals in agg.items():
            cursor.execute(
                f"""
                INSERT INTO {table_name} (ContractCode, Position, department, M_D, person, amount, ProjectID)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (cc, pos, dept, vals['M_D'], vals['person'], vals['amount'], project_id),
            )

        conn.commit()
        return jsonify({'message': 'Personnel budget saved successfully'})

    except Exception as e:
        conn.rollback()
        return jsonify({'message': f'Error processing personnel budget: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/api/save_expense_records', methods=['POST'])
def save_expense_records():
    """경비 저장 (clone 기능 제거: expenserecords만 사용)."""
    data = request.get_json()
    project_id = data.get('ProjectID')
    records_data = data.get('RecordsData', [])
    delete_departments = [d.strip() for d in data.get('deleteDepartments', []) if isinstance(d, str) and d.strip()]
    contract_code_from_body = data.get('ContractCode')

    table_name = 'expenserecords'

    if not records_data and delete_departments and project_id and contract_code_from_body:
        conn = create_connection()
        cursor = conn.cursor()
        try:
            for department in delete_departments:
                cursor.execute(
                    f"""
                    DELETE FROM {table_name}
                    WHERE ContractCode = %s AND TRIM(department) = TRIM(%s) AND ProjectID = %s
                    """,
                    (contract_code_from_body, department, project_id),
                )
            conn.commit()
        except Exception as e:
            conn.rollback()
            return jsonify({'message': f'Error deleting expense records: {str(e)}'}), 500
        finally:
            cursor.close()
            conn.close()

        return jsonify({'message': 'Expense records saved successfully'})

    if not records_data:
        return jsonify({'message': 'No expense records received'}), 400

    conn = create_connection()
    cursor = conn.cursor()

    try:
        unique_departments = {record['department'].strip() for record in records_data}

        for department in unique_departments:
            contract_code = next(
                record['ContractCode'] for record in records_data if record['department'].strip() == department
            )
            cursor.execute(
                f"""
                DELETE FROM {table_name}
                WHERE ContractCode = %s AND TRIM(department) = TRIM(%s) AND ProjectID = %s
                """,
                (contract_code, department, project_id),
            )

        for record in records_data:
            person_count = int(record.get('person_count', 0))
            cursor.execute(
                f"""
                INSERT INTO {table_name} (
                    ContractCode, account, department,
                    people_count, frequency, amount,
                    ProjectID, days, unit_price, note
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    record['ContractCode'],
                    record['account'],
                    record['department'],
                    person_count,
                    record['frequency'],
                    record['amount'],
                    project_id,
                    record['days'],
                    record['unit_price'],
                    record['note'],
                ),
            )

        conn.commit()

    except Exception:
        conn.rollback()
        return jsonify({'message': 'Error processing expense records'}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({'message': 'Expense records saved successfully'})


@bp.route('/api/save_layout', methods=['POST'])
def save_layout():
    try:
        data = request.get_json()
        conn = create_connection()
        cursor = conn.cursor()

        table_name = 'state'

        cursor.execute(
            f"""
            SELECT COUNT(*)
            FROM {table_name}
            WHERE ContractCode = %s
            """,
            (data['contract_code'],),
        )
        exists = cursor.fetchone()[0] > 0

        if exists:
            cursor.execute(
                f"""
                UPDATE {table_name}
                SET first_dept = %s,
                    second_dept = %s,
                    first_layout_active = %s,
                    second_layout_active = %s,
                    active_Layout_count = %s
                WHERE ContractCode = %s
                """,
                (
                    data['first_dept'],
                    data['second_dept'],
                    data['first_layout_active'],
                    data['second_layout_active'],
                    data['active_Layout_count'],
                    data['contract_code'],
                ),
            )
        else:
            cursor.execute(
                f"""
                INSERT INTO {table_name} (
                    ContractCode,
                    first_dept,
                    second_dept,
                    first_layout_active,
                    second_layout_active,
                    active_Layout_count
                ) VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    data['contract_code'],
                    data['first_dept'],
                    data['second_dept'],
                    data['first_layout_active'],
                    data['second_layout_active'],
                    data['active_Layout_count'],
                ),
            )

        conn.commit()
        return jsonify({'success': True, 'message': '저장되었습니다.'})

    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return jsonify({'success': False, 'message': str(e)})

    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


@bp.route('/get_layout_state/<contract_code>', methods=['GET'])
def get_layout_state(contract_code: str):
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                first_dept,
                second_dept,
                first_layout_active,
                second_layout_active,
                active_Layout_count
            FROM state
            WHERE ContractCode = %s
            """,
            (contract_code,),
        )
        state_result = cursor.fetchone()

        examine_data = state_result if state_result else {
            'first_dept': None,
            'second_dept': None,
            'first_layout_active': 1,
            'second_layout_active': 1,
            'active_layout_count': 2,
        }

        return jsonify({"examine": examine_data})

    except Exception:
        return jsonify({"error": "Failed to fetch layout state"}), 500

    finally:
        cursor.close()
        conn.close()
