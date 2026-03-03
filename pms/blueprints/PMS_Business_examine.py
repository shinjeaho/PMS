from __future__ import annotations

from decimal import Decimal

from flask import Blueprint, jsonify, render_template, request

from ..db import create_connection
from ..utils.files import format_file_size


bp = Blueprint('business_examine', __name__)


@bp.route('/project_examine/<int:project_id>', methods=['GET'])
def project_examine(project_id: int):
    db = create_connection()
    cursor = db.cursor(dictionary=True)

    # 프로젝트 기본 정보 조회
    cursor.execute("SELECT * FROM projects WHERE ProjectID = %s", (project_id,))
    examine_project = cursor.fetchone()

    if examine_project is None:
        cursor.close()
        db.close()
        return "Project not found", 404

    contract_code = examine_project['ContractCode']

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
        if examine_project.get(field):
            cursor.execute(
                """
                SELECT ProjectID, ProjectName
                FROM projects
                WHERE ContractCode = %s
                """,
                (examine_project[field],),
            )
            ref_project = cursor.fetchone()
            if ref_project:
                reference_projects[examine_project[field]] = {
                    'project_id': ref_project['ProjectID'],
                    'project_name': ref_project['ProjectName'],
                }

    # 첨부파일 조회
    cursor.execute(
        """
        SELECT FileID, OriginalFileName, FileSize, FileType, UploadDate
        FROM ProjectFiles
        WHERE ContractCode = %s
        ORDER BY UploadDate DESC
        """,
        (contract_code,),
    )
    project_files = []
    for file in cursor.fetchall():
        project_files.append(
            {
                'id': file['FileID'],
                'name': file['OriginalFileName'],
                'size': format_file_size(file['FileSize']),
                'type': file['FileType'],
                'date': file['UploadDate'].strftime('%Y-%m-%d %H:%M:%S'),
            }
        )

    # 부서 정보 조회
    cursor.execute(
        """
        SELECT first_dept, second_dept
        FROM state
        WHERE ContractCode = %s
        """,
        (contract_code,),
    )
    state_departments = cursor.fetchone() or {'first_dept': None, 'second_dept': None}

    # 외주/비교(기존 동작 유지): clone_state에서 부서 정보 조회
    cursor.execute(
        """
        SELECT first_dept, second_dept
        FROM clone_state
        WHERE ContractCode = %s
        """,
        (contract_code,),
    )
    clone_departments = cursor.fetchone() or {'first_dept': None, 'second_dept': None}

    first_dept = state_departments.get('first_dept')
    second_dept = state_departments.get('second_dept')
    out_first_dept = clone_departments.get('first_dept')
    out_second_dept = clone_departments.get('second_dept')

    # 인건비 조회 함수
    def fetch_examine_budget(contract_code: str, dept_name: str | None, mode: int):
        if not dept_name:
            return []
        cursor.execute(
            """
            SELECT * FROM examine_exmanager
            WHERE ContractCode = %s AND Position != "총 계" AND department = %s AND mode = %s
            ORDER BY CASE
                WHEN Position = '이사' THEN 1
                WHEN Position = '부장' THEN 2
                WHEN Position = '차장' THEN 3
                WHEN Position = '과장' THEN 4
                WHEN Position = '대리' THEN 5
                WHEN Position = '주임' THEN 6
                WHEN Position = '사원' THEN 7
                WHEN Position = '계약직' THEN 8
                ELSE 99
            END
            """,
            (contract_code, dept_name, mode),
        )
        return cursor.fetchall()

    # 경비 조회 함수
    def fetch_examine_expenses(contract_code: str, dept_name: str | None, mode: int):
        if not dept_name:
            return []
        cursor.execute(
            """
            SELECT * FROM examine_expenserecords
            WHERE ContractCode = %s AND department = %s AND mode = %s
            """,
            (contract_code, dept_name, mode),
        )
        return cursor.fetchall()

    # 경비 리스트 정렬 우선순위
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

    # 외주 투입현황 조회
    cursor.execute(
        """
        SELECT
            contract_code,
            outsourcing_type,
            outsourcing_company,
            outsourcing_cost,
            outsourcing_quantity,
            outsourcing_cost_NoVAT
        FROM examine_outsourcing
        WHERE contract_code = %s
        """,
        (contract_code,),
    )
    examine_outsourcing = cursor.fetchall()

    def process_expense_data(records: list[dict]):
        seen_accounts: dict[str, float] = {}
        for row in records:
            account = row['account']
            amount = row['amount']
            if amount is None:
                amount_f = 0.0
            elif isinstance(amount, Decimal):
                amount_f = float(amount)
            else:
                amount_f = float(Decimal(amount))

            if account in seen_accounts:
                seen_accounts[account] += amount_f
            else:
                seen_accounts[account] = amount_f

        if not records:
            return [{"account": "기타", "amount": 0.0}]

        return sorted(
            [{"account": key, "amount": value} for key, value in seen_accounts.items()],
            key=lambda x: account_order.get(x["account"], 100),
        )

    # 직영 인건비
    first_budget = fetch_examine_budget(contract_code, first_dept, 0)
    second_budget = fetch_examine_budget(contract_code, second_dept, 0)

    # 외주 인건비
    out_first_budget = fetch_examine_budget(contract_code, out_first_dept, 1)
    out_second_budget = fetch_examine_budget(contract_code, out_second_dept, 1)

    # 직영 경비
    first_records = fetch_examine_expenses(contract_code, first_dept, 0)
    second_records = fetch_examine_expenses(contract_code, second_dept, 0)

    # 외주 경비
    out_first_records = fetch_examine_expenses(contract_code, out_first_dept, 1)
    out_second_records = fetch_examine_expenses(contract_code, out_second_dept, 1)

    # 경비 항목별 합산 리스트 생성
    first_expense_list = process_expense_data(first_records)
    second_expense_list = process_expense_data(second_records)
    out_first_expense_list = process_expense_data(out_first_records)
    out_second_expense_list = process_expense_data(out_second_records)

    cursor.execute(
        """
        SELECT department, note
        FROM examine_note
        WHERE contractcode = %s
        """,
        (contract_code,),
    )
    notes = cursor.fetchall()

    year = examine_project['StartDate'].year if examine_project.get('StartDate') else None
    expenses = None
    if year:
        cursor.execute(
            """
            SELECT AcademicResearchRate, OperationalRate, EquipmentRate
            FROM CompanyExpenses
            WHERE year = %s
            """,
            (year,),
        )
        expenses = cursor.fetchone()

    cursor.close()
    db.close()

    return render_template(
        'PMS_Business_examine.html',
        examine=examine_project,
        reference_projects=reference_projects,
        project_files=project_files,
        note=notes,
        expenses=expenses,
        first_records=first_records,
        second_records=second_records,
        out_first_records=out_first_records,
        out_second_records=out_second_records,
        first_expense_list=first_expense_list,
        second_expense_list=second_expense_list,
        out_first_expense_list=out_first_expense_list,
        out_second_expense_list=out_second_expense_list,
        first_budget=first_budget,
        second_budget=second_budget,
        out_first_budget=out_first_budget,
        out_second_budget=out_second_budget,
        outsourcing=examine_outsourcing,
    )


@bp.route('/api/save_estimated_budget', methods=['POST'])
def save_estimated_budget():
    data = request.get_json() or {}
    contract_code = data.get('contractCode')
    project_id = data.get('projectId')
    exmanager = data.get('exmanager', [])
    expenserecords = data.get('expenserecords', [])
    outsourcing = data.get('outsourcing', [])

    db = create_connection()
    cursor = db.cursor()

    try:
        departments_to_clear_exmanager = set()
        departments_to_clear_expenserecords = set()

        for row in exmanager:
            departments_to_clear_exmanager.add((row['department'], int(row['mode'])))

        for row in expenserecords:
            departments_to_clear_expenserecords.add((row['department'], int(row['mode'])))

        # 인건비 삭제
        for dept, mode in departments_to_clear_exmanager:
            cursor.execute(
                "DELETE FROM examine_exmanager WHERE ContractCode = %s AND department = %s AND mode = %s",
                (contract_code, dept, mode),
            )

        # 경비 삭제
        for dept, mode in departments_to_clear_expenserecords:
            cursor.execute(
                "DELETE FROM examine_expenserecords WHERE ContractCode = %s AND department = %s AND mode = %s",
                (contract_code, dept, mode),
            )

        # 외주 데이터는 contract_code 기준으로 전체 삭제
        cursor.execute("DELETE FROM examine_outsourcing WHERE contract_code = %s", (contract_code,))

        # 인건비 저장
        for row in exmanager:
            if row['Position'] in ('총 계', '선택하세요'):
                continue
            cursor.execute(
                """
                INSERT INTO examine_exmanager
                (ContractCode, Position, department, M_D, person, amount, ProjectID, mode)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    row['ContractCode'],
                    row['Position'],
                    row['department'],
                    Decimal(str(row['M_D'])),
                    Decimal(str(row['person'])),
                    Decimal(str(row['amount'])),
                    int(row['ProjectID']),
                    int(row['mode']),
                ),
            )

        # 경비 저장
        for row in expenserecords:
            if row['account'] in ('총 계', '선택하세요'):
                continue
            cursor.execute(
                """
                INSERT INTO examine_expenserecords
                (ProjectID, ContractCode, department, account, people_count, frequency, days, unit_price, amount, note, mode)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    int(row['ProjectID']),
                    row['ContractCode'],
                    row['department'],
                    row['account'],
                    int(row['people_count']),
                    int(row['frequency']),
                    int(row['days']),
                    Decimal(str(row['unit_price'])),
                    Decimal(str(row['amount'])),
                    row['note'],
                    int(row['mode']),
                ),
            )

        # 외주 예상비 저장
        for row in outsourcing:
            if row['outsourcing_type'] in ('총 계', '선택하세요'):
                continue
            cursor.execute(
                """
                INSERT INTO examine_outsourcing
                (contract_code, outsourcing_type, outsourcing_company, outsourcing_quantity, outsourcing_cost_NoVAT, outsourcing_cost)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    row['contract_code'],
                    row['outsourcing_type'],
                    row['outsourcing_company'],
                    row['outsourcing_quantity'],
                    int(row['outsourcing_cost_NoVAT']),
                    int(row['outsourcing_cost']),
                ),
            )

        # 검토사업 외주 구분 업데이트
        outsourcing_check_value = 0
        for row in outsourcing:
            raw_type = (row.get('outsourcing_type') or '').replace(' ', '')
            if raw_type in ('전량외주',):
                outsourcing_check_value = 1
                break
            if raw_type in ('부분외주',):
                outsourcing_check_value = max(outsourcing_check_value, 2)

        cursor.execute(
            "UPDATE Projects SET outsourcingCheck = %s WHERE ContractCode = %s",
            (outsourcing_check_value, contract_code),
        )

        db.commit()
        return jsonify({'success': True, 'message': '예상 진행비 저장 완료'})

    except Exception as e:
        db.rollback()
        print('[ERROR] 저장 실패:', e)
        return jsonify({'success': False, 'message': '저장 중 오류 발생'})

    finally:
        cursor.close()
        db.close()


@bp.route('/api/save_note', methods=['POST'])
def save_note():
    data = request.get_json() or {}
    notes = data.get('notes', [])

    if not notes:
        return jsonify({'status': 'no data'}), 400

    contractcode = notes[0].get('contractcode', '').strip()
    if not contractcode:
        return jsonify({'error': 'contractcode is missing'}), 400

    db = create_connection()
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM examine_note WHERE contractcode = %s", (contractcode,))
    count = cursor.fetchone()[0]

    if count > 0:
        cursor.execute("DELETE FROM examine_note WHERE contractcode = %s", (contractcode,))

    for note in notes:
        department = note.get('department', '').strip()
        note_text = note.get('note', '').strip()

        if department or note_text:
            cursor.execute(
                """
                INSERT INTO examine_note (department, note, contractcode, createDate)
                VALUES (%s, %s, %s, NOW())
                """,
                (department, note_text, contractcode),
            )

    db.commit()
    cursor.close()
    db.close()
    return jsonify({'status': 'success'})


@bp.route('/api/save_examine_records', methods=['POST'])
def save_examine_records():
    """경비 저장"""
    data = request.get_json() or {}
    project_id = data.get('project_id')
    records_data = data.get('records', [])
    if not records_data:
        return jsonify({'message': 'No expense records received'}), 400

    table_name = "examine_expenserecords"

    conn = create_connection()
    cursor = conn.cursor()

    try:
        unique_departments = {record['department'].strip() for record in records_data}

        # 기존 데이터 삭제
        for department in unique_departments:
            contract_code = next(
                record['contractcode'] for record in records_data if record['department'].strip() == department
            )
            cursor.execute(
                f"""
                DELETE FROM {table_name}
                WHERE ContractCode = %s AND TRIM(department) = TRIM(%s) AND ProjectID = %s
                """,
                (contract_code, department, project_id),
            )

        # 새로운 데이터 삽입
        for record in records_data:
            cursor.execute(
                f"""
                INSERT INTO {table_name} (
                    ContractCode, account, department,
                    people_count, frequency, days,
                    unit_price, amount, note, ProjectID, mode
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    record['contractcode'],
                    record['account'],
                    record['department'],
                    int(record.get('people_count', 0)),
                    int(record.get('frequency', 0)),
                    int(record.get('days', 0)),
                    float(record.get('unit_price', 0)),
                    float(record.get('amount', 0)),
                    record.get('note', ''),
                    project_id,
                    int(record.get('mode', 0)),
                ),
            )

        conn.commit()

    except Exception as e:
        print(f"Error: {str(e)}")
        conn.rollback()
        return jsonify({'message': 'Error processing expense records'}), 500

    finally:
        conn.close()

    return jsonify({'success': True, 'message': 'Expense records saved successfully'})
