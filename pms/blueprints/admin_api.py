from __future__ import annotations

import hashlib

from flask import Blueprint, jsonify, request

from ..db import create_connection
from ..services.dday import calculate_d_day_value, auto_insert_risk_for_contract

bp = Blueprint('admin_api', __name__)


@bp.route('/reset_password', methods=['POST'])
def reset_password():
    data = request.get_json()
    db = create_connection()
    if db is None:
        return jsonify({'success': False, 'message': 'DB 연결 실패'}), 500

    try:
        cursor = db.cursor()
        default_pw = '1q2w3e4r!'
        hashed_pw = hashlib.sha256(default_pw.encode()).hexdigest()

        for user in data:
            userID = user.get('userID')
            name = user.get('name')
            if not userID or not name:
                continue

            cursor.execute(
                """
                UPDATE users
                SET Password = %s, UpdateDate = NOW()
                WHERE userID = %s AND Name = %s
                """,
                (hashed_pw, userID, name),
            )

        db.commit()
        return jsonify({'success': True})

    except Exception as e:
        print('[비밀번호 초기화 오류]', e)
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()
        db.close()


@bp.route('/api/users_dataauth', methods=['GET'])
def get_users_dataauth():
    db = create_connection()
    if db is None:
        return jsonify({'success': False, 'message': 'DB 연결 실패'}), 500

    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT userID, Name, Department, Auth, note, COALESCE(dataauth, 0) AS dataauth
            FROM users
            ORDER BY Name ASC
            """
        )
        rows = cursor.fetchall()
        return jsonify({'success': True, 'users': rows})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        try:
            cursor.close()
            db.close()
        except Exception:
            pass


@bp.route('/api/save_users_dataauth', methods=['POST'])
def save_users_dataauth():
    data = request.get_json(silent=True) or {}
    updates = data.get('updates', [])

    if not isinstance(updates, list):
        return jsonify({'success': False, 'message': '잘못된 요청 형식'}), 400

    db = create_connection()
    if db is None:
        return jsonify({'success': False, 'message': 'DB 연결 실패'}), 500

    try:
        cursor = db.cursor()
        for item in updates:
            user_id = item.get('userID')
            val = item.get('dataauth')
            if user_id is None or val is None:
                continue
            val_num = 1 if (val is True or str(val).lower() in ('1', 'true', 't', 'y', 'yes')) else 0
            cursor.execute(
                'UPDATE users SET dataauth = %s, UpdateDate = NOW() WHERE userID = %s',
                (val_num, user_id),
            )
        db.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        try:
            cursor.close()
            db.close()
        except Exception:
            pass


@bp.route('/update_project_status', methods=['POST'])
def update_project_status():
    data = request.get_json()
    db = create_connection()
    if db is None:
        return jsonify({'success': False, 'message': 'DB 연결 실패'}), 500

    try:
        cursor = db.cursor(dictionary=True)

        contractCode = data.get('contractCode')
        status = data.get('project_status')

        if not contractCode or not status:
            return jsonify({'success': False, 'message': '필수 항목 누락'}), 400

        cursor.execute('SELECT endDate FROM projects WHERE contractCode = %s', (contractCode,))
        row = cursor.fetchone()
        end_date = None
        if row:
            end_date = row.get('endDate') if isinstance(row, dict) else row[0]

        cursor.execute(
            """
            UPDATE projects
            SET project_status = %s
            WHERE contractCode = %s
            """,
            (status, contractCode),
        )

        d_val = calculate_d_day_value(end_date, status)
        if d_val is not None:
            cursor.execute('UPDATE projects SET D_Day = %s WHERE contractCode = %s', (d_val, contractCode))
            auto_insert_risk_for_contract(cursor, contractCode)

        db.commit()
        return jsonify({'success': True})

    except Exception as e:
        print('[프로젝트 현황 업데이트 오류]', e)
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()
        db.close()


@bp.route('/api/delete_project/<contract_code>', methods=['DELETE'])
def delete_project(contract_code):
    """프로젝트 및 관련 테이블 데이터 일괄 삭제 API"""
    related_tables = {
        'businesschangehistory': 'ContractCode',
        'businessreceiptdetails': 'ContractCode',
        'exmanager': 'ContractCode',
        'expenserecords': 'ContractCode',
        'outsourcing': 'contract_code',
        'performanceevaluationfee': 'ContractCode',
        'projectfiles': 'ContractCode',
        'quantity_log': 'contract_code',
        'state': 'contractCode',
        'taskassignment': 'ContractCode',
        'taskquantity': 'ContractCode',
        'usemoney': 'ContractCode',
        'usemoney_log': 'contractcode',
        'examine_exmanager': 'ContractCode',
        'examine_expenserecords': 'ContractCode',
        'examine_note': 'ContractCode',
        'examine_outsourcing': 'Contract_Code',
    }

    db = create_connection()
    cursor = db.cursor()
    try:
        for table, column in related_tables.items():
            cursor.execute(f'DELETE FROM {table} WHERE {column} = %s', (contract_code,))

        cursor.execute('DELETE FROM projects WHERE ContractCode = %s', (contract_code,))

        db.commit()
        return jsonify({'success': True, 'message': '프로젝트 및 관련 데이터가 삭제되었습니다.'})
    except Exception as e:
        db.rollback()
        print(f'[ERROR] 프로젝트 삭제 실패: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        cursor.close()
        db.close()
