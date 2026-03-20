from __future__ import annotations

import io
import os
import traceback
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO

import xlsxwriter
from flask import Blueprint, jsonify, request, send_file, session

from ..db import create_connection
from ..services.progress import calc_progress_bulk

bp = Blueprint('common_api', __name__)


@bp.route('/api/save_outsourcing_payments', methods=['POST'])
def save_outsourcing_payments():
    data = request.get_json(silent=True) or {}
    contract_code = data.get('contractCode')
    rows = data.get('data', [])

    if not contract_code:
        return jsonify({'success': False, 'message': 'Missing contractCode'}), 400

    conn = create_connection()
    cursor = conn.cursor()

    try:
        # 1) 계약 코드의 외주 id 목록 조회로 보호
        cursor.execute(
            """
            SELECT id FROM outsourcing WHERE Contract_Code = %s
        """,
            (contract_code,),
        )
        valid_ids = {str(r[0]) for r in cursor.fetchall()}

        # 2) 기존 지급내역 전체 삭제 (계약 단위로 덮어쓰기)
        if valid_ids:
            cursor.execute(
                "DELETE omp FROM outSourcing_MoneyPayment AS omp JOIN outsourcing AS o ON o.id = omp.outsourcing_id WHERE o.Contract_Code = %s",
                (contract_code,),
            )

        # 3) 새 데이터 삽입
        insert_sql = (
            """
            INSERT INTO outSourcing_MoneyPayment
                (outsourcing_id, CompanyName, Division, Cost_VAT, Cost_NoVAT, PaymentDate, Remark)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
        )

        for row in rows:
            outsourcing_id = str(row.get('outsourcing_id') or '').strip()
            if outsourcing_id not in valid_ids:
                # 무효 id는 스킵
                continue

            company = (row.get('CompanyName') or '').strip()
            division = (row.get('Division') or '').strip()
            try:
                cost_vat = int(row.get('Cost_VAT') or 0)
            except Exception:
                cost_vat = 0

            # VAT 제외는 1.1로 나눠 반올림
            cost_no_vat = int(round(cost_vat / 1.1))

            # 날짜: yyyy-mm-dd 형식만 허용, 아니면 None
            payment_date = row.get('PaymentDate') or None
            if payment_date:
                try:
                    # 간단 검증: 길이와 구분자
                    parts = str(payment_date).split('-')
                    if len(parts) != 3 or any(len(p) != (4 if i == 0 else 2) for i, p in enumerate(parts)):
                        payment_date = None
                except Exception:
                    payment_date = None

            remark = (row.get('Remark') or '').strip()

            cursor.execute(
                insert_sql,
                (
                    outsourcing_id,
                    company,
                    division,
                    cost_vat,
                    cost_no_vat,
                    payment_date,
                    remark,
                ),
            )

        conn.commit()
        return jsonify({'success': True})

    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/get_price', methods=['GET'])
def get_price():
    item = request.args.get('item')
    year = request.args.get('year')

    if not item or not year:
        return jsonify({'error': 'Missing item or year parameter'}), 400

    try:
        year = int(year)
    except ValueError:
        return jsonify({'error': 'Year must be an integer'}), 400

    db = create_connection()
    cursor = db.cursor()

    query = 'SELECT price FROM RecordsPrice WHERE item = %s AND year = %s'
    cursor.execute(query, (item, year))
    result = cursor.fetchone()
    cursor.close()
    db.close()

    if result:
        return jsonify({'price': result[0]})
    return jsonify({'error': 'No price data found'}), 404


@bp.route('/get_expenses', methods=['GET'])
def get_expenses():
    position = request.args.get('position')
    year = request.args.get('year')
    contractcode = request.args.get('contractcode')

    if not position or not year:
        return jsonify({'error': 'Missing position or year parameter'}), 400
    try:
        year = int(year)
    except ValueError:
        return jsonify({'error': 'Year must be an integer'}), 400

    db = create_connection()
    cursor = db.cursor()

    try:
        if position == '외부인력':
            if not contractcode:
                return jsonify({'error': 'Missing contractcode parameter for external labor'}), 400

            cursor.execute('SELECT AVG(daily_rate) FROM external_labor_rates WHERE ContractCode = %s', (contractcode,))
            result = cursor.fetchone()

            if result and result[0] is not None:
                return jsonify({'Days': round(result[0], 2)})
            return jsonify({'error': 'No external labor data found'}), 404

        query = 'SELECT Days FROM EXPENSES WHERE Position = %s AND Year = %s'
        cursor.execute(query, (position, year))
        result = cursor.fetchone()

        if result:
            return jsonify({'Days': result[0]})
        return jsonify({'error': 'No data found'}), 404

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        db.close()


@bp.route('/api/save_task_quantity', methods=['POST'])
def save_task_quantity():
    data = request.get_json()
    contract_code = data.get('contractCode', '')
    task_data_A = data.get('taskA', [])
    department_bohal = data.get('departmentBohal', 0)
    if not task_data_A or not contract_code:
        return jsonify({'message': 'No data provided'}), 400

    department = task_data_A[0]['department']

    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT item, SummaryQuantity 
            FROM TaskQuantity 
            WHERE ContractCode = %s AND department = %s
        """,
            (contract_code, department),
        )
        existing_rows = cursor.fetchall()
        existing_items = {row['item']: row['SummaryQuantity'] for row in existing_rows}

        new_items = {row['item'] for row in task_data_A}
        deleted_items = set(existing_items.keys()) - new_items

        for item in deleted_items:
            cursor.execute(
                """
                DELETE FROM taskassignment 
                WHERE contractCode = %s AND work_item = %s AND department = %s
            """,
                (contract_code, item, department),
            )

        cursor.execute(
            """
            DELETE FROM TaskQuantity 
            WHERE ContractCode = %s AND department = %s
        """,
            (contract_code, department),
        )

        for row in task_data_A:
            if row['item'] and row['item'].strip() != '':
                summary_quantity = existing_items.get(row['item'], 0)

            bohal_val = row.get('bohal')
            if bohal_val is None or (isinstance(bohal_val, str) and bohal_val.strip() == ''):
                bohal_val = department_bohal or 0
            try:
                bohal_val = float(bohal_val)
            except Exception:
                bohal_val = 0.0
            if bohal_val < 0:
                bohal_val = 0.0
            if bohal_val > 100:
                bohal_val = 100.0
            bohal_val = round(bohal_val, 1)
            cal_bohal_val = float(row.get('cal_bohal', bohal_val / 100 if bohal_val else 0))

            cursor.execute(
                """
                INSERT INTO TaskQuantity 
                (ContractCode, department, item, quantity, unit, writingorder, SummaryQuantity, bohal, cal_bohal)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
                (
                    contract_code,
                    row['department'],
                    row['item'],
                    row['quantity'],
                    row['unit'],
                    row['number'],
                    summary_quantity if row['item'] in existing_items else 0,
                    bohal_val,
                    cal_bohal_val,
                ),
            )

        try:
            cursor.execute(
                """
                INSERT INTO project_depbohal (contractcode, department, bohal)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE bohal = VALUES(bohal)
            """,
                (contract_code, department, round(float(department_bohal or 0), 1)),
            )
        except Exception as ee:
            print(f"[project_depbohal 업서트 경고] {ee}")

        conn.commit()
        return jsonify({'message': 'Save successful'})

    except Exception as e:
        print(f"[TaskQuantity 저장 오류] {e}")
        conn.rollback()
        return jsonify({'message': f'Error: {str(e)}'}), 500

    finally:
        cursor.close()
        conn.close()


@bp.route('/api/save_budget_data', methods=['POST'])
def save_budget_data():
    data = request.get_json()
    assignment_data = data.get('assignmentData', [])
    summary_data = data.get('summaryData', [])
    expense_data = data.get('expenseData', [])

    conn = create_connection()
    cursor = conn.cursor()

    today_str = datetime.today().strftime('%Y%m%d')
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_lines = ['[저장 로그 파일]', f'날짜: {today_str}', '']
    contract_code = None

    for task in assignment_data:
        position = task['position']
        work_item = task['work_item']
        department = task['department']
        contract_code = task['contractCode']
        day_time = Decimal(str(task.get('day_time', 0) or 0))
        night_time = Decimal(str(task.get('night_time', 0) or 0))
        holiday = Decimal(str(task.get('holiday', 0) or 0))

        cursor.execute(
            """
            SELECT day_time, night_time, holiday
            FROM taskassignment
            WHERE position = %s AND work_item = %s AND ContractCode = %s AND department = %s
        """,
            (position, work_item, contract_code, department),
        )
        existing = cursor.fetchone()

        if existing:
            prev_day, prev_night, prev_holiday = existing
            prev_day = Decimal(str(prev_day or 0))
            prev_night = Decimal(str(prev_night or 0))
            prev_holiday = Decimal(str(prev_holiday or 0))

            delta_day = day_time - prev_day
            delta_night = night_time - prev_night
            delta_holiday = holiday - prev_holiday

            cursor.execute(
                """
                UPDATE taskassignment
                SET day_time = %s, night_time = %s, holiday = %s
                WHERE position = %s AND work_item = %s AND ContractCode = %s AND department = %s
            """,
                (day_time, night_time, holiday, position, work_item, contract_code, department),
            )

            for delta, typ in [(delta_day, 'day'), (delta_night, 'night'), (delta_holiday, 'holiday')]:
                if delta != 0:
                    cursor.execute(
                        """
                        INSERT INTO quantity_log (contract_code, department, log_date, process, quantity, MT, position, MT_TYPE, created_at, updated_at)
                        VALUES (%s, %s, CURRENT_TIMESTAMP, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """,
                        (contract_code, department, work_item, 0, delta, position, typ),
                    )
                    log_lines.append(
                        f"[QUANTITY_LOG] {now_str} | 부서:{department} | 공정:{work_item} | 직급:{position} | M/T:{delta:.2f} | TYPE:{typ}"
                    )
        else:
            if day_time != 0 or night_time != 0 or holiday != 0:
                cursor.execute(
                    """
                    INSERT INTO taskassignment (position, work_item, department, ContractCode, day_time, night_time, holiday)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                    (position, work_item, department, contract_code, day_time, night_time, holiday),
                )
                for value, typ in [(day_time, 'day'), (night_time, 'night'), (holiday, 'holiday')]:
                    if value != 0:
                        cursor.execute(
                            """
                            INSERT INTO quantity_log (contract_code, department, log_date, process, quantity, MT, position, MT_TYPE, created_at, updated_at)
                            VALUES (%s, %s, CURRENT_TIMESTAMP, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """,
                            (contract_code, department, work_item, 0, value, position, typ),
                        )
                        log_lines.append(
                            f"[QUANTITY_LOG] {now_str} | 부서:{department} | 공정:{work_item} | 직급:{position} | M/T:{value:.2f} | TYPE:{typ}"
                        )

    for summary in summary_data:
        contract_code = summary['contractCode']
        department = summary['department']
        item = summary['item']
        quantity = float(summary.get('SummaryQuantity', 0) or 0)
        cursor.execute(
            """
            SELECT SummaryQuantity FROM taskquantity
            WHERE ContractCode = %s AND department = %s AND item = %s
        """,
            (contract_code, department, item),
        )
        if cursor.fetchone():
            cursor.execute(
                """
                UPDATE taskquantity SET SummaryQuantity = %s
                WHERE ContractCode = %s AND department = %s AND item = %s
            """,
                (quantity, contract_code, department, item),
            )

    grouped = {}
    cc_set = set()
    dep_set = set()
    for exp in expense_data:
        key = (exp['use_account'], exp['history'], exp['type'], exp['department'], exp['ContractCode'])
        money = int(str(exp.get('money', 0)).replace(',', '').strip() or 0)
        grouped[key] = grouped.get(key, 0) + money
        cc_set.add(exp['ContractCode'])
        dep_set.add(exp['department'])

    existing_map = {}
    if cc_set and dep_set:
        cc_fmt = ','.join(['%s'] * len(cc_set))
        dep_fmt = ','.join(['%s'] * len(dep_set))
        cursor.execute(
            f"""
            SELECT use_account, history, type, department, ContractCode, money
            FROM useMoney
            WHERE ContractCode IN ({cc_fmt})
              AND department IN ({dep_fmt})
        """,
            tuple(cc_set) + tuple(dep_set),
        )
        for ua, hi, ty, dep, cc, m in cursor.fetchall():
            existing_map[(ua, hi, ty, dep, cc)] = int(m or 0)

    for key, money in grouped.items():
        ua, hi, ty, dep, cc = key
        prev = existing_map.get(key, None)
        if prev is None:
            cursor.execute(
                """
                INSERT INTO useMoney (use_account, history, type, department, money, ContractCode, update_date)
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """,
                (ua, hi, ty, dep, money, cc),
            )
            if money != 0:
                cursor.execute(
                    """
                    INSERT INTO usemoney_log (contractcode, use_account, history, log_date, type, department, money, createdate, updatedate, remarks)
                    VALUES (%s, %s, %s, CURRENT_TIMESTAMP, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '')
                """,
                    (cc, ua, hi, ty, dep, money),
                )
        else:
            delta = money - prev
            if delta != 0:
                cursor.execute(
                    """
                    UPDATE useMoney
                    SET money = %s, update_date = CURRENT_TIMESTAMP
                    WHERE use_account = %s AND history = %s AND type = %s AND department = %s AND ContractCode = %s
                """,
                    (money, ua, hi, ty, dep, cc),
                )
                cursor.execute(
                    """
                    INSERT INTO usemoney_log (contractcode, use_account, history, log_date, type, department, money, createdate, updatedate, remarks)
                    VALUES (%s, %s, %s, CURRENT_TIMESTAMP, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '')
                """,
                    (cc, ua, hi, ty, dep, delta),
                )

    to_delete = set(existing_map.keys()) - set(grouped.keys())
    for key in to_delete:
        ua, hi, ty, dep, cc = key
        prev = existing_map[key]
        cursor.execute(
            """
            DELETE FROM useMoney
            WHERE use_account = %s AND history = %s AND type = %s AND department = %s AND ContractCode = %s
        """,
            (ua, hi, ty, dep, cc),
        )
        if prev != 0:
            cursor.execute(
                """
                INSERT INTO usemoney_log (contractcode, use_account, history, log_date, type, department, money, createdate, updatedate, remarks)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '삭제 반영')
            """,
                (cc, ua, hi, ty, dep, -prev),
            )

    log_dir = os.path.join(os.getcwd(), 'Logs')
    os.makedirs(log_dir, exist_ok=True)
    log_filename = f"{today_str}_save_{contract_code}.txt" if contract_code else f"{today_str}_save.txt"
    with open(os.path.join(log_dir, log_filename), 'a', encoding='utf-8') as f:
        f.write(f"\n--- 작업 시각: {now_str} ---\n")
        for line in log_lines:
            f.write(line + "\n")

    conn.commit()
    conn.close()
    return jsonify({'message': 'Save successful'})


@bp.route('/api/get_expense_logs/<department>', methods=['GET'])
def get_expense_logs(department):
    contract_code = request.args.get('contract_code')
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT 
                ID,
                contractcode,
                use_account,
                history,
                log_date,
                type,
                department,
                money,
                remarks
            FROM usemoney_log
            WHERE department = %s 
            AND contractcode = %s
            ORDER BY log_date DESC
        """,
            (department, contract_code),
        )

        logs = cursor.fetchall()
        return jsonify(logs)

    except Exception as e:
        print(f"Error fetching expense logs: {str(e)}")
        return jsonify({'error': 'Failed to fetch expense logs'}), 500

    finally:
        cursor.close()
        conn.close()


@bp.route('/get_department_data/<department>', methods=['GET'])
def get_department_data(department):
    contract_code = request.args.get('contract_code')
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        quantity_query = """
        SELECT 
            tq.item,
            tq.quantity AS total_quantity,
            tq.unit,
            tq.SummaryQuantity AS assigned_quantity,
            COALESCE(tq.bohal, 0) AS bohal,
            CASE 
                WHEN tq.quantity > 0 THEN 
                    LEAST(100, tq.SummaryQuantity / tq.quantity * 100)
                ELSE 0 
            END AS progress,
            0 AS priority, -- 일반 항목의 우선순위
            tq.writingOrder AS writingOrder -- 정렬용
        FROM TaskQuantity tq
        WHERE tq.department = %s 
        AND tq.ContractCode = %s
        ORDER BY tq.writingOrder ASC
        """
        cursor.execute(quantity_query, (department, contract_code))
        quantity_data = cursor.fetchall()

        extra_query = """
        SELECT 
            '기타' AS item,
            NULL AS total_quantity,
            NULL AS unit,
            COALESCE(SUM(ql.quantity), 0) AS assigned_quantity,
            0 AS progress,
            1 AS priority, -- '기타' 항목의 우선순위
            NULL AS writingOrder -- 정렬용
        FROM quantity_log ql
        WHERE ql.process = '기타'
        AND ql.contract_code = %s
        AND ql.department = %s
        GROUP BY ql.process
        """
        cursor.execute(extra_query, (contract_code, department))
        extra_data = cursor.fetchall()

        combined_data = quantity_data + extra_data
        sorted_data = sorted(
            combined_data,
            key=lambda x: (x['priority'], x.get('writingOrder', float('inf')), x['item']),
        )

        time_query = """
        SELECT 
            ta.work_item as item,
            ta.position,
            COALESCE(ta.day_time, 0) as day_time,
            COALESCE(ta.night_time, 0) as night_time,
            COALESCE(ta.holiday, 0) as holiday
        FROM TaskAssignment ta
        WHERE ta.department = %s 
        AND ta.ContractCode = %s
        """
        cursor.execute(time_query, (department, contract_code))
        time_data = cursor.fetchall()

        return jsonify({'quantity_data': sorted_data, 'time_data': time_data})

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': 'Failed to fetch data'}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/get_expense_department_data/<department>', methods=['GET'])
def get_expense_department_data(department):
    contract_code = request.args.get('contract_code')
    conn = create_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
    SELECT use_account, history, type, department, money, update_date
    FROM useMoney
    WHERE ContractCode = %s AND department = %s
    ORDER BY update_date DESC
""",
        (contract_code, department),
    )

    expense_data = cursor.fetchall()
    columns = [col[0] for col in cursor.description]

    result = [dict(zip(columns, row)) for row in expense_data]
    cursor.close()
    conn.close()

    return jsonify(result)


@bp.route('/get_account_data', methods=['GET'])
def get_account_data():
    contract_code = request.args.get('contract_code')
    conn = create_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT account 
        FROM ExpenseRecords 
        WHERE ContractCode = %s
    """,
        (contract_code,),
    )

    account_data = cursor.fetchall()
    result = [{'account': row[0]} for row in account_data]

    cursor.close()
    conn.close()

    return jsonify(result)


@bp.route('/get_department_people', methods=['GET'])
def get_department_people():
    contract_code = request.args.get('contract_code')

    conn = create_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT DISTINCT Position 
        FROM exmanager
        WHERE ContractCode = %s
    """,
        (contract_code,),
    )

    position_data = cursor.fetchall()
    positions = [row[0] for row in position_data]
    conn.close()

    return jsonify(positions)


@bp.route('/get_worker_expense', methods=['GET'])
def get_worker_expense():
    contract_code = request.args.get('contract_code')
    year = request.args.get('year')

    if not contract_code or not year:
        return jsonify({'error': 'Missing contract_code or year parameter'}), 400
    try:
        year = int(year)
    except ValueError:
        return jsonify({'error': 'Year must be an integer'}), 400

    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT DISTINCT position 
            FROM TaskAssignment 
            WHERE ContractCode = %s AND (day_time > 0 OR night_time > 0 OR holiday > 0)
        """,
            (contract_code,),
        )
        positions = [row['position'] for row in cursor.fetchall()]

        result = {}
        for position in positions:
            cursor.execute(
                """
                SELECT Days 
                FROM EXPENSES 
                WHERE Position = %s AND Year = %s
            """,
                (position, year),
            )
            days_data = cursor.fetchone()
            days = days_data['Days'] if days_data else 0

            cursor.execute(
                """
                SELECT 
                    SUM(day_time) as total_day_time,
                    SUM(night_time) as total_night_time,
                    SUM(holiday) as total_holiday_time
                FROM TaskAssignment 
                WHERE ContractCode = %s AND position = %s
            """,
                (contract_code, position),
            )
            time_data = cursor.fetchone()

            result[position] = {
                'days': days,
                'total_day_time': float(time_data['total_day_time'] or 0),
                'total_night_time': float(time_data['total_night_time'] or 0),
                'total_holiday_time': float(time_data['total_holiday_time'] or 0),
            }

        cursor.execute(
            """
            SELECT SUM(money) as total_expense
            FROM useMoney
            WHERE ContractCode = %s
        """,
            (contract_code,),
        )
        expense_data = cursor.fetchone()

        total_expense = float(expense_data['total_expense'] or 0)

        result['total_expense'] = total_expense
    finally:
        cursor.close()
        conn.close()

    return jsonify(result)


@bp.route('/search')
def search():
    query = request.args.get('query', '')
    year = request.args.get('year', '')

    db = create_connection()
    cursor = db.cursor(dictionary=True)

    try:
        sql = """
            SELECT 
                ProjectID, 
                ProjectName, 
                ContractCode, 
                yearProject,
                LinkProjectCheck,
                outsourcingCheck
            FROM projects 
            WHERE (ProjectName LIKE %s OR ContractCode LIKE %s)
            AND YEAR(StartDate) = %s
        """
        search_term = f'%{query}%'
        cursor.execute(sql, (search_term, search_term, year))
        results = cursor.fetchall()
        return jsonify(results)

    finally:
        cursor.close()
        db.close()


@bp.route('/get_department_Set_data/<department>', methods=['GET'])
def get_department_Set_data(department):
    contract_code = request.args.get('contract_code')

    if not department or not contract_code:
        return jsonify({'error': 'Missing department or contract_code parameter'}), 400

    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT DISTINCT item 
            FROM TaskQuantity 
            WHERE ContractCode = %s AND department = %s
            ORDER BY item
        """,
            (contract_code, department),
        )

        items = cursor.fetchall()

        return jsonify(items)

    except Exception as e:
        print(f"Error fetching department items: {str(e)}")
        return jsonify({'error': 'Failed to fetch department items'}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/api/save_quantity_log', methods=['POST'])
def save_quantity_log():
    data = request.get_json()
    task_data = data.get('taskItemData', [])
    contract_code = data.get('contractCode', '')

    conn = create_connection()
    cursor = conn.cursor()

    try:
        for task in task_data:
            quantity = float(task['quantity']) if task.get('quantity') and float(task['quantity']) != 0 else 0.0

            cursor.execute(
                """
                INSERT INTO quantity_log 
                (contract_code, department, log_date, process, quantity, remarks, mt_type, MT, position)
                VALUES (%s, %s, CURDATE(), %s, %s, %s, %s, %s, %s)
                """,
                (
                    contract_code,
                    task['department'],
                    task['item'],
                    quantity,
                    None,
                    task['workTimeValue'],
                    float(task['time']),
                    task['position'],
                ),
            )

        conn.commit()
        return jsonify({'message': 'Log saved successfully'})

    except Exception as e:
        print(f"Error saving quantity log: {str(e)}")
        conn.rollback()
        return jsonify({'message': 'Error saving log'}), 500

    finally:
        conn.close()


@bp.route('/api/get_quantity_logs', methods=['GET'])
def get_quantity_logs():
    contract_code = request.args.get('contract_code')
    department = request.args.get('department')

    if not contract_code or not department:
        return jsonify({'error': 'Missing required parameters'}), 400

    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        query = """
            SELECT 
                id,
                DATE_FORMAT(log_date, '%Y-%m-%d') as log_date,
                process,
                quantity,
                mt_type,
                MT,
                position,
                COALESCE(remarks, '') as remarks
                FROM quantity_log 
                WHERE contract_code = %s AND department = %s
                ORDER BY created_at DESC, id DESC
            """

        cursor.execute(query, (contract_code, department))
        logs = cursor.fetchall()

        return jsonify(logs)

    except Exception as e:
        print(f"Error fetching quantity logs: {str(e)}")
        return jsonify({'error': 'Failed to fetch logs'}), 500

    finally:
        cursor.close()
        conn.close()


@bp.route('/api/get_available_months', methods=['GET'])
def get_available_months():
    contract_code = request.args.get('contract_code')
    department = request.args.get('department')

    conn = create_connection()
    cursor = conn.cursor()

    try:
        query = """
            SELECT DISTINCT DATE_FORMAT(log_date, '%Y-%m') as month
            FROM quantity_log
            WHERE contract_code = %s 
            AND department = %s
            ORDER BY month
        """

        cursor.execute(query, (contract_code, department))
        months = [row[0] for row in cursor.fetchall()]

        return jsonify(months)

    except Exception as e:
        print(f"Error fetching available months: {str(e)}")
        return jsonify({'error': 'Failed to fetch months'}), 500

    finally:
        cursor.close()
        conn.close()


@bp.route('/api/update_quantity_log', methods=['POST'])
def update_quantity_log():
    data = request.get_json()
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT process, quantity, mt_type, MT, position, contract_code, department
            FROM quantity_log 
            WHERE id = %s
        """,
            (data['id'],),
        )

        old_data = cursor.fetchone()

        current_time = datetime.now().strftime('%Y-%m-%d %H:%M')
        changes = []

        old_time_column = (
            'night_time'
            if old_data['mt_type'] == 'night'
            else 'day_time'
            if old_data['mt_type'] == 'day'
            else 'holiday'
        )

        cursor.execute(
            f"""
            UPDATE TaskAssignment
            SET {old_time_column} = {old_time_column} - %s
            WHERE position = %s 
            AND department = %s
            AND work_item = %s
            AND ContractCode = %s
        """,
            (
                old_data['MT'],
                old_data['position'],
                old_data['department'],
                old_data['process'],
                old_data['contract_code'],
            ),
        )

        if old_data['process'] != data['process']:
            changes.append(f"공정: {old_data['process']} → {data['process']}")

        if float(old_data['quantity'] or 0) != float(data['quantity'] or 0):
            changes.append(f"물량: {old_data['quantity']} → {data['quantity']}")

        if old_data['mt_type'] != data['mt_type']:
            type_map = {'day': '주간', 'night': '야간', 'holiday': '휴일'}
            old_type = type_map.get(old_data['mt_type'], old_data['mt_type'])
            new_type = type_map.get(data['mt_type'], data['mt_type'])
            changes.append(f"근무타입: {old_type} → {new_type}")

        if float(old_data['MT'] or 0) != float(data['mt'] or 0):
            changes.append(f"작업시간: {old_data['MT']} → {data['mt']}")

        if old_data['position'] != data['position']:
            changes.append(f"직위: {old_data['position']} → {data['position']}")

        remarks = " / ".join(changes) + f" ({current_time})" if changes else ""

        cursor.execute(
            """
            UPDATE quantity_log 
            SET process = %s,
                quantity = %s,
                mt_type = %s,
                MT = %s,
                position = %s,
                remarks = %s
            WHERE id = %s
        """,
            (
                data['process'],
                data['quantity'],
                data['mt_type'],
                data['mt'],
                data['position'],
                remarks,
                data['id'],
            ),
        )

        cursor.execute(
            """
            SELECT position, mt_type, COALESCE(SUM(MT), 0) as total_mt
            FROM quantity_log
            WHERE contract_code = %s 
            AND department = %s 
            AND process = %s
            AND position = %s
            GROUP BY position, mt_type
        """,
            (data['contract_code'], data['department'], data['process'], data['position']),
        )

        mt_totals = cursor.fetchall()

        for mt_total in mt_totals:
            cursor.execute(
                """
                SELECT COUNT(*) as count
                FROM TaskAssignment
                WHERE position = %s 
                AND department = %s
                AND work_item = %s
                AND ContractCode = %s
            """,
                (mt_total['position'], data['department'], data['process'], data['contract_code']),
            )

            exists = cursor.fetchone()['count'] > 0

            update_column = (
                'day_time'
                if mt_total['mt_type'] == 'day'
                else 'night_time'
                if mt_total['mt_type'] == 'night'
                else 'holiday'
            )

            if exists:
                cursor.execute(
                    f"""
                    UPDATE TaskAssignment
                    SET {update_column} = %s
                    WHERE position = %s 
                    AND department = %s
                    AND work_item = %s
                    AND ContractCode = %s
                """,
                    (
                        mt_total['total_mt'],
                        mt_total['position'],
                        data['department'],
                        data['process'],
                        data['contract_code'],
                    ),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO TaskAssignment (
                        position, department, work_item, ContractCode,
                        day_time, night_time, holiday
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s
                    )
                """,
                    (
                        mt_total['position'],
                        data['department'],
                        data['process'],
                        data['contract_code'],
                        mt_total['total_mt'] if mt_total['mt_type'] == 'day' else 0,
                        mt_total['total_mt'] if mt_total['mt_type'] == 'night' else 0,
                        mt_total['total_mt'] if mt_total['mt_type'] == 'holiday' else 0,
                    ),
                )

        cursor.execute(
            """
            UPDATE TaskAssignment
            SET day_time = 0,
                night_time = 0,
                holiday = 0
            WHERE position = %s 
            AND department = %s
            AND work_item = %s
            AND ContractCode = %s
            AND position NOT IN (
                SELECT DISTINCT position 
                FROM quantity_log 
                WHERE contract_code = %s 
                AND department = %s
                AND process = %s
            )
        """,
            (
                data['position'],
                data['department'],
                data['process'],
                data['contract_code'],
                data['contract_code'],
                data['department'],
                data['process'],
            ),
        )

        conn.commit()
        return jsonify({'success': True, 'message': '수정이 완료되었습니다.'})

    except Exception as e:
        print('\n=== 오류 발생 ===')
        print(f"Error updating logs: {str(e)}")
        print(f"Error type: {type(e)}")
        conn.rollback()
        return jsonify({'success': False, 'message': f'수정 중 오류가 발생했습니다: {str(e)}'})

    finally:
        cursor.close()
        conn.close()


@bp.route('/api/update_expense_log', methods=['POST'])
def update_expense_log():
    data = request.get_json()
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT use_account, history, type, money, department, contractcode
            FROM usemoney_log 
            WHERE id = %s
        """,
            (data['id'],),
        )

        old_data = cursor.fetchone()
        if not old_data:
            return jsonify({'success': False, 'message': '수정할 데이터를 찾을 수 없습니다.'}), 404

        cursor.execute(
            """
            SELECT *
            FROM useMoney
            WHERE use_account = %s 
            AND history = %s
            AND type = %s
            AND department = %s
            AND ContractCode = %s
        """,
            (
                old_data['use_account'],
                old_data['history'],
                old_data['type'],
                old_data['department'],
                old_data['contractcode'],
            ),
        )
        before_update = cursor.fetchone()

        cursor.execute(
            """
            UPDATE useMoney
            SET money = money - %s
            WHERE use_account = %s 
            AND history = %s
            AND type = %s
            AND department = %s
            AND ContractCode = %s
        """,
            (
                old_data['money'],
                old_data['use_account'],
                old_data['history'],
                old_data['type'],
                old_data['department'],
                old_data['contractcode'],
            ),
        )

        cursor.execute(
            """
            UPDATE usemoney_log 
            SET use_account = %s,
                history = %s,
                type = %s,
                money = %s,
                remarks = %s
            WHERE id = %s
        """,
            (
                data['use_account'],
                data['history'],
                data['type'],
                data['money'],
                data['remarks'],
                data['id'],
            ),
        )

        cursor.execute(
            """
            SELECT *
            FROM useMoney
            WHERE use_account = %s 
            AND history = %s
            AND type = %s
            AND department = %s
            AND ContractCode = %s
        """,
            (
                old_data['use_account'],
                old_data['history'],
                old_data['type'],
                old_data['department'],
                old_data['contractcode'],
            ),
        )

        current_money = cursor.fetchone()

        if current_money and current_money['money'] == 0:
            cursor.execute(
                """
                DELETE FROM useMoney
                WHERE use_account = %s 
                AND history = %s
                AND type = %s
                AND department = %s
                AND ContractCode = %s
            """,
                (
                    old_data['use_account'],
                    old_data['history'],
                    old_data['type'],
                    old_data['department'],
                    old_data['contractcode'],
                ),
            )

        cursor.execute(
            """
            SELECT *
            FROM useMoney
            WHERE use_account = %s 
            AND history = %s
            AND type = %s
            AND department = %s
            AND ContractCode = %s
        """,
            (data['use_account'], data['history'], data['type'], old_data['department'], old_data['contractcode']),
        )

        exists = cursor.fetchone()

        if exists:
            cursor.execute(
                """
                UPDATE useMoney
                SET money = money + %s
                WHERE use_account = %s 
                AND history = %s
                AND type = %s
                AND department = %s
                AND ContractCode = %s
            """,
                (
                    data['money'],
                    data['use_account'],
                    data['history'],
                    data['type'],
                    old_data['department'],
                    old_data['contractcode'],
                ),
            )
        else:
            cursor.execute(
                """
                INSERT INTO useMoney 
                (use_account, history, type, department, money, ContractCode)
                VALUES (%s, %s, %s, %s, %s, %s)
            """,
                (
                    data['use_account'],
                    data['history'],
                    data['type'],
                    old_data['department'],
                    data['money'],
                    old_data['contractcode'],
                ),
            )

        cursor.execute(
            """
            SELECT *
            FROM useMoney
            WHERE use_account = %s 
            AND history = %s
            AND type = %s
            AND department = %s
            AND ContractCode = %s
        """,
            (data['use_account'], data['history'], data['type'], old_data['department'], old_data['contractcode']),
        )
        final_state = cursor.fetchone()

        conn.commit()
        return jsonify({'success': True, 'message': '수정이 완료되었습니다.'})

    except Exception as e:
        print('\n=== 오류 발생 ===')
        print(f"Error updating expense logs: {str(e)}")
        print(f"Error type: {type(e)}")
        print(f"Error location: {e.__traceback__.tb_lineno}")
        conn.rollback()
        return jsonify({'success': False, 'message': f'수정 중 오류가 발생했습니다: {str(e)}'})

    finally:
        cursor.close()
        conn.close()


@bp.route('/api/get_project_changes/<contract_code>', methods=['GET'])
def get_project_changes(contract_code):
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT 
                Division as division,
                ContractDate as contract_date,
                Cost_VAT as cost_vat,
                Cost_NoVAT as cost_novat,
                Cost_ShareRate as cost_sharerate,
                Description as description,
                UpdateDate as update_date
            FROM BusinessChangeHistory 
            WHERE ContractCode = %s 
            ORDER BY id
        """,
            (contract_code,),
        )
        changes = cursor.fetchall()
        return jsonify(changes)
    finally:
        cursor.close()
        conn.close()


@bp.route('/api/get_design_reviews/<contract_code>', methods=['GET'])
def get_design_reviews(contract_code):
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT 
                Amount as amount,
                Description as description,
                UpdateDate as update_date,
                reviewDate as review_date,
                performanceReview as performance_review,
                Remark as remark
            FROM PerformanceEvaluationFee 
            WHERE ContractCode = %s 
            ORDER BY id
        """,
            (contract_code,),
        )

        reviews = cursor.fetchall()
        return jsonify(reviews)

    except Exception as e:
        print(f"Error fetching design reviews: {str(e)}")
        return jsonify({'error': 'Failed to fetch design reviews'}), 500

    finally:
        cursor.close()
        conn.close()


@bp.route('/api/get_project_receipts/<contract_code>', methods=['GET'])
def get_project_receipts(contract_code):
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT 
                Division as division,
                Amount as amount,
                Balance as balance,
                ReceiptDate as receipt_date,
                Description as description,
                UpdateDate as update_date,
                Amount_NoVAT as Amount_NoVAT
            FROM BusinessReceiptDetails 
            WHERE ContractCode = %s 
            ORDER BY COALESCE(saveNum, id)
        """,
            (contract_code,),
        )

        receipts = cursor.fetchall()
        return jsonify(receipts)

    except Exception as e:
        print(f"Error fetching project receipts: {str(e)}")
        return jsonify({'error': 'Failed to fetch project receipts'}), 500

    finally:
        cursor.close()
        conn.close()


@bp.route('/api/save_project_changes', methods=['POST'])
def save_project_changes():
    conn = create_connection()
    cursor = conn.cursor()

    try:
        data = request.get_json()
        contract_code = data['contract_code']
        current_date = datetime.now().date()

        cursor.execute(
            """
            DELETE FROM BusinessChangeHistory
            WHERE ContractCode = %s
        """,
            (contract_code,),
        )

        for change in data['changes']:
            contract_date = None
            if change['contract_date']:
                date_str = change['contract_date'].replace('.', '').strip()
                try:
                    parsed_date = datetime.strptime(date_str, '%Y %m %d')
                    contract_date = parsed_date.strftime('%Y-%m-%d')
                except ValueError:
                    print(f"Invalid date format: {change['contract_date']}")
                    continue

            cursor.execute(
                """
                INSERT INTO BusinessChangeHistory 
                (Division, ContractDate, Cost_VAT, Cost_NoVAT, Cost_ShareRate, Description, ContractCode, UpdateDate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
                (
                    change['division'],
                    contract_date,
                    change['cost_vat'],
                    change['cost_novat'],
                    change['cost_sharerate'],
                    change['description'],
                    contract_code,
                    current_date,
                ),
            )

            if change['division'] == '당초':
                cost_vat = change['cost_vat']
                cost_novat = round(cost_vat / 1.1)

                cursor.execute(
                    """
                    UPDATE projects 
                    SET changeProjectCost = %s,
                        projectCost = %s,
                        projectCost_NoVAT = %s
                    WHERE ContractCode = %s
                """,
                    (cost_vat, cost_vat, cost_novat, contract_code),
                )
            else:
                cursor.execute(
                    """
                    UPDATE projects 
                    SET changeProjectCost = %s
                    WHERE ContractCode = %s
                """,
                    (change['cost_vat'], contract_code),
                )

        cursor.execute(
            """
            DELETE FROM PerformanceEvaluationFee
            WHERE ContractCode = %s
        """,
            (contract_code,),
        )

        for review in data['reviews']:
            review_date = None
            if review.get('review_date'):
                try:
                    date_str = review['review_date'].replace('.', '').strip()
                    parsed_date = datetime.strptime(date_str, '%Y %m %d')
                    review_date = parsed_date.strftime('%Y-%m-%d')
                except ValueError:
                    print(f"Invalid review date: {review['review_date']}")
                    review_date = None

            cursor.execute(
                """
                INSERT INTO PerformanceEvaluationFee 
                (Amount, Description, ContractCode, UpdateDate, reviewDate, performanceReview, Remark)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
                (
                    review.get('amount', 0),
                    review.get('description', ''),
                    contract_code,
                    current_date,
                    review_date,
                    review.get('performance_review'),
                    review.get('remark'),
                ),
            )

        cursor.execute(
            """
            DELETE FROM BusinessReceiptDetails 
            WHERE ContractCode = %s
        """,
            (contract_code,),
        )

        for index, receipt in enumerate(data['receipts'], start=1):
            receipt_date = None
            if receipt['receipt_date']:
                date_str = receipt['receipt_date'].replace('.', '').strip()
                try:
                    parsed_date = datetime.strptime(date_str, '%Y %m %d')
                    receipt_date = parsed_date.strftime('%Y-%m-%d')
                except ValueError:
                    print(f"Invalid date format: {receipt['receipt_date']}")
                    continue

            cursor.execute(
                """
                INSERT INTO BusinessReceiptDetails 
                (saveNum, Division, Amount, Balance, ReceiptDate, Description, ContractCode, UpdateDate, Amount_NoVAT)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
                (
                    index,
                    receipt['division'],
                    receipt['amount'],
                    receipt['balance'],
                    receipt_date,
                    receipt['description'],
                    contract_code,
                    current_date,
                    receipt['Amount_NoVAT'],
                ),
            )

        engineers = data.get('engineers', []) or []
        saved_count = 0
        try:
            cursor.execute('DELETE FROM project_engineers WHERE contractcode = %s', (contract_code,))
            if engineers:
                insert_sql = (
                    'INSERT INTO project_engineers '
                    '(contractcode, WorkField, work_position, department, name, position, remark) '
                    'VALUES (%s, %s, %s, %s, %s, %s, %s)'
                )
                for eng in engineers:
                    work_field = (eng.get('WorkField') or eng.get('field') or '').strip()
                    work_position = (eng.get('work_position') or '').strip()
                    department = (eng.get('department') or '').strip()
                    name = (eng.get('name') or '').strip()
                    position = (eng.get('position') or '').strip()
                    remark = (eng.get('remark') or '').strip()
                    if not name:
                        continue
                    cursor.execute(
                        insert_sql,
                        (contract_code, work_field, work_position, department, name, position, remark),
                    )
                    saved_count += 1
        except Exception as eng_err:
            print(f"[WARN] project_engineers 저장 중 오류: {eng_err}")

        risks = data.get('risks', []) or []
        risks_saved = 0
        try:
            cursor.execute('DELETE FROM project_risks WHERE contractcode = %s', (contract_code,))
            if risks:
                has_division = False
                try:
                    cursor.execute("SHOW COLUMNS FROM project_risks LIKE 'division'")
                    has_division = cursor.fetchone() is not None
                except Exception:
                    has_division = False

                if has_division:
                    risk_insert_sql = (
                        'INSERT INTO project_risks '
                        '(contractcode, division, department, writer, write_date, content) '
                        'VALUES (%s, %s, %s, %s, %s, %s)'
                    )
                else:
                    risk_insert_sql = (
                        'INSERT INTO project_risks '
                        '(contractcode, department, writer, write_date, content) '
                        'VALUES (%s, %s, %s, %s, %s)'
                    )
                for r in risks:
                    division = (r.get('division') or '').strip()
                    department = (r.get('department') or '').strip()
                    writer = (r.get('writer') or '').strip()
                    content = (r.get('content') or '').strip()
                    raw_date = (r.get('write_date') or '').strip()

                    parsed_write_date = None
                    if raw_date:
                        try:
                            cleaned = raw_date.replace('.', '').replace('/', ' ').strip()
                            if len(cleaned.split()) == 3 and cleaned.count(' ') == 2:
                                dt = datetime.strptime(cleaned, '%Y %m %d')
                                parsed_write_date = dt.strftime('%Y-%m-%d')
                            else:
                                dt = datetime.strptime(raw_date, '%Y-%m-%d')
                                parsed_write_date = dt.strftime('%Y-%m-%d')
                        except Exception:
                            parsed_write_date = current_date.strftime('%Y-%m-%d')
                    else:
                        parsed_write_date = current_date.strftime('%Y-%m-%d')

                    if not any([department, writer, content]):
                        continue

                    if has_division:
                        cursor.execute(
                            risk_insert_sql,
                            (contract_code, division, department, writer, parsed_write_date, content),
                        )
                    else:
                        cursor.execute(
                            risk_insert_sql,
                            (contract_code, department, writer, parsed_write_date, content),
                        )
                    risks_saved += 1
        except Exception as risk_err:
            print(f"[WARN] project_risks 저장 중 오류: {risk_err}")

        conn.commit()
        return jsonify(
            {
                'success': True,
                'message': '저장되었습니다.',
                'engineers_saved': saved_count,
                'risks_saved': risks_saved,
            }
        )

    except Exception as e:
        conn.rollback()
        print(f"Error saving project changes: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()
        conn.close()


@bp.route('/api/get_latest_change', methods=['GET'])
def get_latest_change():
    contract_code = request.args.get('contract_code')

    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT *
            FROM BusinessChangeHistory 
            WHERE ContractCode = %s AND Division = '당초'
        """,
            (contract_code,),
        )
        initial_change = cursor.fetchone()

        cursor.execute(
            """
            SELECT *
            FROM BusinessChangeHistory 
            WHERE ContractCode = %s AND Division != '당초'
            ORDER BY 
                CAST(REGEXP_REPLACE(Division, '[^0-9]', '') AS UNSIGNED) DESC,
                ContractDate DESC,
                UpdateDate DESC
            LIMIT 1
        """,
            (contract_code,),
        )
        latest_change = cursor.fetchone()

        return jsonify({'initial': initial_change if initial_change else {}, 'latest': latest_change if latest_change else {}})

    except Exception as e:
        print(f"Error fetching changes: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/api/get_project_engineers', methods=['GET'])
def get_project_engineers():
    contract_code = request.args.get('contract_code')
    if not contract_code:
        return jsonify({'success': False, 'message': 'contract_code required', 'engineers': []}), 400
    conn = create_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'DB connection failed', 'engineers': []}), 500
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT contractcode, WorkField, work_position, department, name, position, remark
            FROM project_engineers
            WHERE contractcode = %s
            ORDER BY
                CASE
                    WHEN WorkField LIKE '사업총괄%' THEN 0
                    ELSE 1
                END,
                WorkField ASC,
                FIELD(work_position, 'PM', '공정별 책임자', '참여기술자'),
                name ASC;
            """,
            (contract_code,),
        )
        rows = cursor.fetchall() or []
        print(rows)
        for r in rows:
            if 'WorkField' not in r:
                r['WorkField'] = ''
        return jsonify({'success': True, 'engineers': rows})
    except Exception as e:
        print(f"[ERROR] get_project_engineers 실패: {e}")
        return jsonify({'success': False, 'message': str(e), 'engineers': []}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/api/get_project_risks/<contract_code>', methods=['GET'])
def get_project_risks(contract_code):
    conn = create_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'DB connection failed', 'risks': []}), 500
    cursor = conn.cursor(dictionary=True)
    try:
        has_division = False
        try:
            cursor.execute("SHOW COLUMNS FROM project_risks LIKE 'division'")
            has_division = cursor.fetchone() is not None
        except Exception:
            has_division = False

        if has_division:
            cursor.execute(
                """
                SELECT id, contractcode, division, department, writer, write_date, content
                FROM project_risks
                WHERE contractcode = %s
                ORDER BY id ASC
                """,
                (contract_code,),
            )
        else:
            cursor.execute(
                """
                SELECT id, contractcode, department, writer, write_date, content
                FROM project_risks
                WHERE contractcode = %s
                ORDER BY id ASC
                """,
                (contract_code,),
            )
        rows = cursor.fetchall() or []
        for r in rows:
            dt = r.get('write_date')
            if dt:
                try:
                    if isinstance(dt, datetime):
                        r['write_date'] = dt.strftime('%Y-%m-%d')
                    elif isinstance(dt, str):
                        if len(dt) == 10 and dt[4] == '-' and dt[7] == '-':
                            pass
                        else:
                            cleaned = dt.replace('.', '').strip()
                            parsed = datetime.strptime(cleaned, '%Y %m %d')
                            r['write_date'] = parsed.strftime('%Y-%m-%d')
                except Exception:
                    r['write_date'] = None
        return jsonify({'success': True, 'risks': rows})
    except Exception as e:
        print(f"[ERROR] get_project_risks 실패: {e}")
        return jsonify({'success': False, 'message': str(e), 'risks': []}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/api/get_latest_review/<contract_code>')
def get_latest_review(contract_code):
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT *
            FROM PerformanceEvaluationFee 
            WHERE ContractCode = %s
            ORDER BY 
                CAST(REGEXP_REPLACE(Division, '[^0-9]', '') AS UNSIGNED) DESC,
                UpdateDate DESC
            LIMIT 1
        """,
            (contract_code,),
        )

        latest_review = cursor.fetchone()
        return jsonify(latest_review if latest_review else {})

    except Exception as e:
        print(f"Error fetching latest review: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/api/get_latest_receipt/<contract_code>')
def get_latest_receipt(contract_code):
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT *
            FROM BusinessReceiptDetails 
            WHERE ContractCode = %s
            ORDER BY 
                CAST(REGEXP_REPLACE(Division, '[^0-9]', '') AS UNSIGNED) DESC,
                ReceiptDate DESC,
                UpdateDate DESC
            LIMIT 1
        """,
            (contract_code,),
        )

        latest_receipt = cursor.fetchone()
        return jsonify(latest_receipt if latest_receipt else {})

    except Exception as e:
        print(f"Error fetching latest receipt: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@bp.route('/get_real_labor_cost', methods=['GET'])
def get_real_labor_cost():
    contract_code = request.args.get('contract_code')
    year = request.args.get('year')

    db = create_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT COUNT(*) AS external_count 
            FROM external_labor_rates 
            WHERE ContractCode = %s
        """,
            (contract_code,),
        )
        external_count = cursor.fetchone()['external_count']

        if external_count > 0:
            cursor.execute(
                """
                SELECT AVG(daily_rate) AS avg_daily_rate 
                FROM external_labor_rates 
                WHERE ContractCode = %s
            """,
                (contract_code,),
            )
            avg_daily_rate = cursor.fetchone()['avg_daily_rate'] or 0
        else:
            avg_daily_rate = 0

        cursor.execute(
            """
            SELECT 
                ta.position,
                ta.department,
                SUM(COALESCE(ta.day_time, 0)) as total_day_time,
                SUM(COALESCE(ta.night_time, 0)) as total_night_time,
                SUM(COALESCE(ta.holiday, 0)) as total_holiday_time,
                CASE 
                    WHEN ta.department = '연구소' THEN 0  -- 연구소는 금액 0 처리
                    WHEN ta.position = '외부인력' THEN %s  -- 외부인력의 경우 평균 daily_rate 사용
                    ELSE e.Days  -- 내부 인력은 expenses 테이블의 Days 사용
                END as daily_rate
            FROM TaskAssignment ta
            LEFT JOIN expenses e ON ta.position = e.Position
            WHERE ta.ContractCode = %s
            AND (e.Year = %s OR ta.position = '외부인력')  -- 외부인력은 expenses 연도 조건 무시
            GROUP BY ta.position, ta.department, e.Days
            ORDER BY 
                CASE ta.position
                    WHEN '이사' THEN 1
                    WHEN '부장' THEN 2
                    WHEN '차장' THEN 3
                    WHEN '과장' THEN 4
                    WHEN '대리' THEN 5
                    WHEN '주임' THEN 6
                    WHEN '사원' THEN 7
                    WHEN '계약직' THEN 8
                    WHEN '외부인력' THEN 9
                    ELSE 10
                END
        """,
            (avg_daily_rate, contract_code, year),
        )

        labor_data = cursor.fetchall()

        for row in labor_data:
            row['total_day_time'] = float(row['total_day_time'])
            row['total_night_time'] = float(row['total_night_time'])
            row['total_holiday_time'] = float(row['total_holiday_time'])
            row['daily_rate'] = float(row['daily_rate'])

        return jsonify(labor_data if labor_data else [])

    except Exception as e:
        print(f"Error fetching labor cost data: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        db.close()


@bp.route('/get_real_expenses', methods=['GET'])
def get_real_expenses():
    contract_code = request.args.get('contract_code')

    db = create_connection()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT 
                use_account as expense_item,
                money as amount,
                update_date
            FROM usemoney 
            WHERE ContractCode = %s
            ORDER BY update_date DESC
        """,
            (contract_code,),
        )

        expenses = cursor.fetchall()

        return jsonify(expenses if expenses else [])

    except Exception as e:
        print(f"Error fetching real expenses: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        db.close()


@bp.route('/api/yearly_projects')
def api_yearly_projects():
    """ 차수사업, 검토사업 모아보기 (페이지네이션 포함) """
    db = create_connection()
    if db is None:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = db.cursor(dictionary=True)

        project_type = request.args.get('type', '')
        page = request.args.get('page', 1, type=int)
        per_page = 20

        if project_type == 'yearly':
            cursor.execute("SELECT COUNT(*) AS count FROM Projects WHERE yearProject = 1 AND ContractCode NOT LIKE '%검토%'")
        elif project_type == 'examine':
            cursor.execute("SELECT COUNT(*) AS count FROM Projects WHERE ContractCode LIKE '%검토%'")
        else:
            cursor.execute('SELECT COUNT(*) AS count FROM Projects')

        total_projects = cursor.fetchone()['count']
        total_pages = max(1, (total_projects + per_page - 1) // per_page)

        offset = (page - 1) * per_page

        if project_type == 'yearly':
            cursor.execute(
                """
                SELECT ProjectID, ProjectName, ContractCode, yearProject, outsourcingCheck, project_status
                FROM Projects
                WHERE yearProject = 1 AND ContractCode NOT LIKE '%검토%'
                ORDER BY ContractCode DESC 
                LIMIT %s OFFSET %s
            """,
                (per_page, offset),
            )
        elif project_type == 'examine':
            cursor.execute(
                """
                SELECT ProjectID, ProjectName, ContractCode, yearProject, outsourcingCheck, project_status
                FROM Projects WHERE ContractCode LIKE '%검토%'
                ORDER BY ContractCode DESC 
                LIMIT %s OFFSET %s
            """,
                (per_page, offset),
            )
        else:
            cursor.execute(
                """
                SELECT ProjectID, ProjectName, ContractCode, yearProject, outsourcingCheck, project_status
                FROM Projects 
                ORDER BY ContractCode DESC 
                LIMIT %s OFFSET %s
            """,
                (per_page, offset),
            )

        projects = cursor.fetchall()

        try:
            contract_codes = [
                p.get('ContractCode') for p in projects
                if isinstance(p, dict) and p.get('ContractCode')
            ]

            if contract_codes:
                fmt = ','.join(['%s'] * len(contract_codes))
                examine_map = {}
                outsourcing_map = {}

                try:
                    cursor.execute(
                        f"""
                        SELECT contract_code,
                               MAX(
                                   CASE
                                       WHEN REPLACE(outsourcing_type, ' ', '') = '전량외주' THEN 1
                                       WHEN REPLACE(outsourcing_type, ' ', '') = '부분외주' THEN 2
                                       ELSE 0
                                   END
                               ) AS outsourcing_check
                        FROM examine_outsourcing
                        WHERE contract_code IN ({fmt})
                        GROUP BY contract_code
                        """,
                        contract_codes,
                    )
                    for row in cursor.fetchall() or []:
                        code = row.get('contract_code') if isinstance(row, dict) else None
                        if code:
                            examine_map[code] = int(row.get('outsourcing_check') or 0)
                except Exception:
                    examine_map = {}

                try:
                    cursor.execute(
                        f"""
                        SELECT contract_code,
                               MAX(
                                   CASE
                                       WHEN REPLACE(outsourcing_type, ' ', '') = '전량외주' THEN 1
                                       WHEN REPLACE(outsourcing_type, ' ', '') = '부분외주' THEN 2
                                       ELSE 0
                                   END
                               ) AS outsourcing_check
                        FROM outsourcing
                        WHERE contract_code IN ({fmt})
                        GROUP BY contract_code
                        """,
                        contract_codes,
                    )
                    for row in cursor.fetchall() or []:
                        code = row.get('contract_code') if isinstance(row, dict) else None
                        if code:
                            outsourcing_map[code] = int(row.get('outsourcing_check') or 0)
                except Exception:
                    outsourcing_map = {}

                for proj in projects:
                    if not isinstance(proj, dict):
                        continue
                    code = proj.get('ContractCode')
                    raw = proj.get('outsourcingCheck')
                    try:
                        current = int(raw) if raw not in (None, '') else 0
                    except Exception:
                        current = 0
                    if current:
                        continue

                    if project_type in ('yearly', 'examine'):
                        continue

                    if project_type == 'examine':
                        derived = examine_map.get(code, 0) or outsourcing_map.get(code, 0)
                    elif project_type == 'yearly':
                        derived = outsourcing_map.get(code, 0) or examine_map.get(code, 0)
                    else:
                        derived = outsourcing_map.get(code, 0) or examine_map.get(code, 0)

                    if derived:
                        proj['outsourcingCheck'] = derived
        except Exception:
            pass

        try:
            checks = [p.get('outsourcingCheck') for p in projects if isinstance(p, dict)]
            print(f"[yearly_projects] type={project_type} page={page} outsourcingCheck={checks}")
        except Exception as e:
            print(f"[yearly_projects] logging error: {e}")

        try:
            contract_codes = [p.get('ContractCode') for p in projects if isinstance(p, dict) and p.get('ContractCode')]
            progress_map = calc_progress_bulk(contract_codes)
            for proj in projects:
                if isinstance(proj, dict):
                    code = proj.get('ContractCode')
                    proj['progress'] = progress_map.get(code, 0.0)
        except Exception:
            pass

    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({'error': 'Failed to fetch data'}), 500
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()

    return jsonify({'projects': projects, 'total_pages': total_pages, 'current_page': page})


@bp.route('/get_task_quantity')
def get_task_quantity():
    department = request.args.get('department')
    contract_code = request.args.get('contract_code')

    try:
        conn = create_connection()
        cursor = conn.cursor()
        query = """
            SELECT item, quantity, unit, COALESCE(bohal, 0) AS bohal
            FROM taskquantity 
            WHERE ContractCode = %s AND department = %s
            ORDER BY writingorder ASC
        """
        cursor.execute(query, (contract_code, department))
        data = cursor.fetchall()
        cursor.close()

        return jsonify(data)

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify([])


@bp.route('/get_department_bohal')
def get_department_bohal():
    contract_code = request.args.get('contract_code')
    department = request.args.get('department')
    if not contract_code or not department:
        return jsonify({'bohal': 0})
    try:
        conn = create_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT bohal FROM project_depbohal
            WHERE contractcode = %s AND department = %s
            """,
            (contract_code, department),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        if row:
            return jsonify({'bohal': float(row[0] or 0)})
        return jsonify({'bohal': 0})
    except Exception as e:
        print(f"[get_department_bohal 오류] {e}")
        return jsonify({'bohal': 0})


@bp.route('/api/save_comments', methods=['POST'])
def save_comments():
    db = create_connection()
    cursor = db.cursor()

    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'message': '데이터가 없습니다.'}), 400

        current_date = datetime.now().date()
        contract_code = data[0].get('contractcode')

        existing_map = {}
        cursor.execute(
            """
            SELECT input_num, department, comment
            FROM Project_comment
            WHERE contractcode = %s
        """,
            (contract_code,),
        )
        for row in cursor.fetchall():
            try:
                idx = int(row[0])
            except Exception:
                continue
            existing_map[idx] = {
                'department': (row[1] or '').strip() if row[1] is not None else '',
                'comment': row[2] or '',
            }

        session_dept = session.get('user', {}).get('department', '') or ''

        def normalize_dept(d):
            if not d:
                return ''
            s = str(d).strip()
            if s in ('총무부', '경영지원부', '임원실'):
                return '경영본부'
            return s

        session_norm = normalize_dept(session_dept)

        cursor.execute(
            """
            DELETE FROM Project_comment 
            WHERE contractcode = %s
        """,
            (contract_code,),
        )

        for comment in data:
            try:
                input_num = int(comment.get('input_num') or 0)
            except Exception:
                input_num = 0

            raw_dept = comment.get('department')
            if raw_dept is None:
                dept_val = ''
            else:
                dept_str = str(raw_dept).strip()
                if dept_str == '' or dept_str.upper() in ('NULL', 'NONE'):
                    dept_val = existing_map.get(input_num, {}).get('department', session_dept or '')
                else:
                    dept_val = dept_str

            norm_dept = normalize_dept(dept_val)

            incoming_text = comment.get('comment') or ''

            if session_norm and session_norm != norm_dept:
                comment_text = existing_map.get(input_num, {}).get('comment', '')
            else:
                comment_text = incoming_text

            cursor.execute(
                """
                INSERT INTO Project_comment (
                    contractcode,
                    Create_date,
                    department,
                    comment,
                    input_num
                ) VALUES (%s, %s, %s, %s, %s)
            """,
                (
                    comment.get('contractcode', contract_code),
                    current_date,
                    dept_val,
                    comment_text,
                    input_num,
                ),
            )

        db.commit()
        return jsonify({'success': True, 'message': '코멘트가 성공적으로 저장되었습니다.'})

    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()
        db.close()


@bp.route('/api/save_external_labor', methods=['POST'])
def save_external_labor():
    try:
        data = request.json
        contract_code = data['contractcode']
        labor_data = data['data']

        db = create_connection()
        cursor = db.cursor()

        try:
            for row in labor_data:
                contract_date = None
                if row['contract_date']:
                    try:
                        contract_date = (
                            datetime.strptime(row['contract_date'].replace('.', '').strip(), '%Y %m %d')
                            .strftime('%Y-%m-%d')
                        )
                    except ValueError:
                        print(f"[ERROR] Invalid date format: {row['contract_date']}")
                        continue

                cursor.execute(
                    """
                    SELECT COUNT(*) FROM external_labor_rates 
                    WHERE position = %s AND ContractCode = %s
                """,
                    (row['position'], contract_code),
                )
                exists = cursor.fetchone()[0] > 0

                if exists:
                    cursor.execute(
                        """
                        UPDATE external_labor_rates 
                        SET monthly_rate = %s, daily_rate = %s, contract_date = %s
                        WHERE position = %s AND ContractCode = %s
                    """,
                        (row['monthly_rate'], row['daily_rate'], contract_date, row['position'], contract_code),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO external_labor_rates (position, monthly_rate, daily_rate, contract_date, ContractCode)
                        VALUES (%s, %s, %s, %s, %s)
                    """,
                        (row['position'], row['monthly_rate'], row['daily_rate'], contract_date, contract_code),
                    )

            db.commit()
            return jsonify({'success': True})

        finally:
            cursor.close()
            db.close()

    except Exception as e:
        print('[ERROR] Exception occurred while saving external labor data:', str(e))
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/download_project_data', methods=['POST'])
def download_project_data():
    try:
        data = request.get_json()
        start_date = data.get('startDate')
        end_date = data.get('endDate')
        department = data.get('selectedDepartment')
        selected_projects = data.get('selectedProjects', [])

        if not start_date or not end_date or not department or not selected_projects:
            return jsonify({'error': True, 'message': '필수 데이터가 누락되었습니다.'}), 400

        contract_codes = [project['contractCode'] for project in selected_projects]

        connection = create_connection()
        if connection is None:
            return jsonify({'error': True, 'message': '데이터베이스 연결에 실패했습니다.'}), 500

        cursor = connection.cursor(dictionary=True)

        query = f"""
            SELECT 
                contract_code,
                department,
                process,
                position,
                MT_TYPE,
                SUM(quantity) AS quantity,
                SUM(COALESCE(MT, 0)) AS MT,
                SUM(COALESCE(MT, 0)) / 8 AS MD,
                remarks,
                created_at
            FROM 
                quantity_log
            WHERE 
                contract_code IN ({', '.join(['%s'] * len(contract_codes))})
                AND department = %s
                AND DATE(created_at) BETWEEN %s AND %s
            GROUP BY 
                contract_code, department, process, position, MT_TYPE, remarks, created_at
            ORDER BY 
                contract_code ASC, department ASC, process ASC, created_at ASC
        """
        cursor.execute(query, (*contract_codes, department, start_date, end_date))
        results = cursor.fetchall()

        if not results:
            return jsonify({'error': True, 'message': '데이터가 없어 파일 생성에 실패하였습니다. 조건을 확인하세요.'}), 200

        output = BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})

        header_format = workbook.add_format({'bold': True, 'bg_color': '#D3D3D3', 'align': 'center'})
        merge_format = workbook.add_format({'bold': True, 'align': 'center', 'valign': 'vcenter'})

        worksheet = workbook.add_worksheet('주간_다운로드')
        row_num = 0

        worksheet.set_column(0, 0, 10)
        worksheet.set_column(1, 1, 20)
        worksheet.set_column(2, 2, 15)
        worksheet.set_column(3, 3, 10)
        worksheet.set_column(4, 4, 10)
        worksheet.set_column(5, 5, 20)
        worksheet.set_column(6, 6, 50)
        worksheet.set_column(7, 7, 30)
        worksheet.set_column(8, 8, 20)

        for contract_code in {row['contract_code'] for row in results}:
            worksheet.merge_range(row_num, 0, row_num, 8, f"사업명: {contract_code}", merge_format)
            row_num += 1

            headers = ['부서', '공정', '직급', 'MD', 'MT', '근로시간', '비고', '작성일자', '작업물량']
            for col_num, header in enumerate(headers):
                worksheet.write(row_num, col_num, header, header_format)
            row_num += 1

            department_data = [row for row in results if row['contract_code'] == contract_code]

            for department in {row['department'] for row in department_data}:
                department_rows = [row for row in department_data if row['department'] == department]

                department_first_row = row_num
                for process in {row['process'] for row in department_rows}:
                    process_rows = [row for row in department_rows if row['process'] == process]

                    process_first_row = row_num
                    for row_data in process_rows:
                        worksheet.write(row_num, 0, department)
                        worksheet.write(row_num, 1, process)
                        worksheet.write(row_num, 2, row_data['position'])
                        worksheet.write(row_num, 3, round(row_data['MD'], 2))
                        worksheet.write(row_num, 4, row_data['MT'])
                        worksheet.write(row_num, 5, row_data['MT_TYPE'])
                        worksheet.write(row_num, 6, row_data['remarks'])
                        worksheet.write(row_num, 7, row_data['created_at'].strftime('%Y-%m-%d %H:%M:%S'))
                        worksheet.write(row_num, 8, row_data['quantity'])
                        row_num += 1

                    if len(process_rows) > 1:
                        worksheet.merge_range(process_first_row, 1, row_num - 1, 1, process, merge_format)

                if len(department_rows) > 1:
                    worksheet.merge_range(department_first_row, 0, row_num - 1, 0, department, merge_format)

        workbook.close()
        output.seek(0)

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'주간_다운로드_{start_date}_to_{end_date}.xlsx',
        )

    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()
        return jsonify({'error': True, 'message': '오류가 발생했습니다.'}), 500

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'connection' in locals():
            connection.close()
