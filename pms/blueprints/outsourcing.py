from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..db import create_connection

bp = Blueprint('outsourcing', __name__)


@bp.route('/save_outsourcing', methods=['POST'])
def save_outsourcing():
    db = create_connection()
    cursor = db.cursor()

    try:
        data = request.json

        cursor.execute(
            """
            INSERT INTO outsourcing (
                outsourcing_type,
                outsourcing_company,
                outsourcing_cost,
                outsourcing_cost_NoVAT,
                change_Cost,
                change_Cost_NoVAT,
                outsourcing_quantity,
                contract_code
            ) VALUES (%s, %s, %s, %s, %s, %s, %s,%s)
        """,
            (
                data.get('outsourcing_type'),
                data.get('outsourcing_company'),
                data.get('outsourcing_cost'),
                data.get('outsourcing_cost_vat_excluded'),
                data.get('outsourcing_cost'),
                data.get('outsourcing_cost_vat_excluded'),
                data.get('outsourcing_quantity'),
                data.get('contract_code'),
            ),
        )

        _outs_type = (data.get('outsourcing_type') or '').strip()
        _company = (data.get('outsourcing_company') or (data.get('department') or '')).strip()
        department = f"{_outs_type} - {_company}" if _outs_type and _company else _company
        try:
            bohal_val = float(data.get('bohal'))
        except Exception:
            bohal_val = 0.0
        if bohal_val < 0:
            bohal_val = 0.0
        if bohal_val > 100:
            bohal_val = 100.0
        bohal_val = round(bohal_val, 1)

        if department:
            try:
                cursor.execute(
                    """
                    INSERT INTO project_depbohal (contractcode, department, bohal)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE bohal = VALUES(bohal)
                """,
                    (data.get('contract_code'), department, bohal_val),
                )
            except Exception as dep_err:
                print(f"[WARN] project_depbohal upsert 실패: {dep_err}")

        outsourcing_type = (data.get('outsourcing_type') or '').strip()

        if outsourcing_type == '전량 외주':
            cursor.execute(
                """
                UPDATE projects 
                SET outsourcingCheck = 1
                WHERE ContractCode = %s
            """,
                (data['contract_code'],),
            )
        elif '부분 외주' in outsourcing_type or '부분외주' in outsourcing_type:
            cursor.execute(
                """
                UPDATE projects 
                SET outsourcingCheck = 2
                WHERE ContractCode = %s
            """,
                (data['contract_code'],),
            )

        db.commit()

        return jsonify({'success': True, 'message': '외주 정보가 성공적으로 저장되었습니다.'})

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error saving outsourcing data: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()
        db.close()


@bp.route('/api/save_outsourcing_progress', methods=['POST'])
def save_outsourcing_progress():
    try:
        request_data = request.json
        contract_code = request_data.get('contractCode')
        data = request_data.get('data', [])

        if not contract_code or not data:
            return jsonify({'success': False, 'message': 'Missing contractCode or data'}), 400

        connection = create_connection()
        cursor = connection.cursor()

        for item in data:
            progress_rate = item.get('progressRate')
            outsourcing_company = item.get('outsourcingCompany')

            if progress_rate is None or not outsourcing_company:
                continue

            cursor.execute(
                """
                UPDATE outsourcing 
                SET processing = %s
                WHERE contract_code = %s AND outsourcing_company = %s
            """,
                (progress_rate, contract_code, outsourcing_company),
            )

        connection.commit()

        return jsonify({'success': True, 'message': 'Outsourcing progress updated successfully'})

    except Exception as e:
        print('Error:', str(e))
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'connection' in locals():
            connection.close()


@bp.route('/get_outsourcing')
def get_outsourcing():
    db = create_connection()
    cursor = db.cursor(dictionary=True)

    try:
        contract_code = request.args.get('contract_code')

        cursor.execute(
            """
            SELECT 
                id,
                outsourcing_type,
                outsourcing_company,
                change_Cost,
                change_Cost_NoVAT,
                outsourcing_quantity,
                processing
            FROM outsourcing 
            WHERE contract_code = %s
        """,
            (contract_code,),
        )

        results = cursor.fetchall()
        return jsonify(results)

    except Exception as e:
        print(f"[ERROR] Error fetching outsourcing data: {str(e)}")
        return jsonify([])

    finally:
        cursor.close()
        db.close()


@bp.route('/update_outsourcing', methods=['POST'])
def update_outsourcing():
    try:
        updates = request.json.get('updates', [])

        if not updates:
            return jsonify({'success': False, 'message': 'No data provided'}), 400

        db = create_connection()
        cursor = db.cursor()

        updated_count = 0
        inserted_count = 0
        skipped_items = []

        try:
            contract_codes = {item.get('contract_code') for item in updates if item.get('contract_code')}
            for cc in contract_codes:
                cursor.execute(
                    """
                    DELETE FROM project_depbohal
                    WHERE contractcode = %s
                      AND (
                        department IN (
                            SELECT TRIM(outsourcing_company)
                            FROM outsourcing
                            WHERE contract_code = %s
                        )
                        OR department IN (
                            SELECT CONCAT(TRIM(outsourcing_type), ' - ', TRIM(outsourcing_company))
                            FROM outsourcing
                            WHERE contract_code = %s
                        )
                      )
                    """,
                    (cc, cc, cc),
                )
        except Exception as del_err:
            print(f"[WARN] 외주 보할 초기화 실패(contractcode={cc}): {del_err}")

        for item in updates:
            contract_code = item.get('contract_code')
            if not contract_code:
                continue

            if item['outsourcing_type'] == '삭제':
                cursor.execute(
                    'DELETE FROM outsourcing WHERE contract_code = %s AND id = %s',
                    (contract_code, item['id']),
                )
                skipped_items.append(item)
                continue

            cursor.execute(
                'SELECT outsourcing_cost, outsourcing_cost_NoVAT FROM outsourcing WHERE id = %s AND contract_code = %s',
                (item['id'], contract_code),
            )
            existing_data = cursor.fetchone()

            if existing_data:
                existing_outsourcing_cost = existing_data[0]
                existing_outsourcing_cost_NoVAT = existing_data[1]

                change_cost_novat = (
                    round(item['outsourcing_cost'] / 1.1)
                    if item['outsourcing_cost'] != existing_outsourcing_cost
                    else existing_outsourcing_cost_NoVAT
                )

                cursor.execute(
                    """
                    UPDATE outsourcing
                    SET outsourcing_type = %s,
                        outsourcing_company = %s,
                        outsourcing_quantity = %s,
                        change_Cost = %s,
                        change_Cost_NoVAT = %s
                    WHERE id = %s AND contract_code = %s
                """,
                    (
                        item['outsourcing_type'],
                        item['outsourcing_company'],
                        item['outsourcing_quantity'],
                        item['outsourcing_cost'],
                        change_cost_novat,
                        item['id'],
                        contract_code,
                    ),
                )
                updated_count += 1
            else:
                cursor.execute(
                    """
                    INSERT INTO outsourcing (
                        id, outsourcing_type, outsourcing_company, outsourcing_cost,
                        outsourcing_cost_NoVAT, outsourcing_quantity, contract_code, change_Cost_NoVAT
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                    (
                        item['id'],
                        item['outsourcing_type'],
                        item['outsourcing_company'],
                        item['outsourcing_cost'],
                        round(item['outsourcing_cost'] / 1.1),
                        item['outsourcing_quantity'],
                        contract_code,
                        round(item['outsourcing_cost'] / 1.1),
                    ),
                )
                inserted_count += 1

            if (item.get('outsourcing_type') or '').strip() != '추가 제안':
                try:
                    _otype = (item.get('outsourcing_type') or '').strip()
                    _company = (item.get('outsourcing_company') or '').strip()
                    department = f"{_otype} - {_company}" if _otype and _company else _company
                    try:
                        bohal_val = float(item.get('bohal') or 0)
                    except Exception:
                        bohal_val = 0.0
                    if bohal_val < 0:
                        bohal_val = 0.0
                    if bohal_val > 100:
                        bohal_val = 100.0
                    bohal_val = round(bohal_val, 1)
                    if department:
                        cursor.execute(
                            """
                            INSERT INTO project_depbohal (contractcode, department, bohal)
                            VALUES (%s, %s, %s)
                            ON DUPLICATE KEY UPDATE bohal = VALUES(bohal)
                            """,
                            (contract_code, department, bohal_val),
                        )
                except Exception as dep_err:
                    print(f"[WARN] project_depbohal upsert 실패(update_outsourcing): {dep_err}")

        cursor.execute(
            """
            SELECT 
                MAX(
                    CASE 
                        WHEN outsourcing_type IN ('전량외주', '전량 외주') THEN 1
                        WHEN outsourcing_type IN ('부분외주', '부분 외주') THEN 2
                        ELSE 0
                    END
                )
            FROM outsourcing
            WHERE contract_code = %s
            """,
            (updates[0]['contract_code'],),
        )
        outsourcing_check_value = cursor.fetchone()[0] or 0

        cursor.execute(
            'UPDATE projects SET outsourcingCheck = %s WHERE ContractCode = %s',
            (outsourcing_check_value, updates[0]['contract_code']),
        )

        db.commit()

        return jsonify(
            {
                'success': True,
                'message': 'Outsourcing data updated successfully',
                'details': {
                    'updated_count': updated_count,
                    'inserted_count': inserted_count,
                    'skipped_items': skipped_items,
                },
            }
        )

    except Exception as e:
        if 'db' in locals() and db:
            db.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'db' in locals():
            db.close()


@bp.route('/get_outsourcingCompanyList', methods=['GET'])
def get_outsourcing_money():
    contract_code = request.args.get('contract_code')
    flag = request.args.get('flag', 'false').lower()

    if not contract_code:
        return jsonify({'error': 'contract_code가 필요합니다!'}), 400

    try:
        db = create_connection()
        cursor = db.cursor()

        cost_column = 'change_Cost_NoVAT' if flag == 'true' else 'outsourcing_cost_NoVAT'

        cursor.execute(
            f"""
        SELECT id, outsourcing_company, {cost_column}, outsourcing_type
        FROM outsourcing
        WHERE contract_code = %s 
        ORDER BY id
            """,
            (contract_code,),
        )

        rows = cursor.fetchall()
        db.close()

        result_list = [
            {
                'id': row[0],
                'company': row[1],
                'cost': float(row[2]) if row[2] else 0.0,
                'type': row[3],
            }
            for row in rows
        ]

        return jsonify({'outsourcing_items': result_list})

    except Exception as e:
        print(f" 서버 오류 발생: {e}")
        return jsonify({'error': str(e)}), 500
