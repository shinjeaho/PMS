from __future__ import annotations

import hashlib
from datetime import datetime

import mysql.connector
from flask import Blueprint, request, render_template, jsonify, session

from ..db import create_connection
from ..services.progress import calc_progress, calc_progress_bulk

bp = Blueprint('business_year', __name__)


@bp.route('/api/get_projects/')
def get_projects():
    """선택된 연도의 프로젝트 데이터를 JSON으로 반환 (페이지네이션 적용)"""
    db = create_connection()
    if db is None:
        return jsonify({"error": "Database connection could not be established"}), 500

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        year = request.args.get('year', type=int)
        page = request.args.get('page', 1, type=int)
        per_page = 20

        if not year:
            return jsonify({"error": "Year is required"}), 400

        cursor.execute(
            """
            SELECT COUNT(*) AS count FROM Projects 
            WHERE YEAR(StartDate) = %s AND ContractCode NOT LIKE '%%검토%%'
            """,
            (year,),
        )
        total_projects = cursor.fetchone()['count']
        total_pages = max(1, (total_projects + per_page - 1) // per_page)

        if page > total_pages or page < 1:
            page = 1

        offset = (page - 1) * per_page

        cursor.execute(
            """
            SELECT ProjectID, ProjectName, ContractCode, yearProject, outsourcingCheck, project_status 
            FROM Projects 
            WHERE YEAR(StartDate) = %s 
            AND ContractCode NOT LIKE '%%검토%%'
            ORDER BY ContractCode DESC 
            LIMIT %s OFFSET %s
            """,
            (year, per_page, offset),
        )
        projects = cursor.fetchall()

        try:
            contract_codes = [
                p.get('ContractCode') for p in projects if isinstance(p, dict) and p.get('ContractCode')
            ]
            progress_map = calc_progress_bulk(contract_codes)
            for proj in projects:
                if isinstance(proj, dict):
                    code = proj.get('ContractCode')
                    proj['progress'] = progress_map.get(code, 0.0)

            risk_map = {}
            if contract_codes:
                try:
                    has_division = False
                    try:
                        cursor.execute("SHOW COLUMNS FROM project_risks LIKE 'division'")
                        has_division = cursor.fetchone() is not None
                    except Exception:
                        has_division = False

                    fmt = ','.join(['%s'] * len(contract_codes))
                    if has_division:
                        cursor.execute(
                            f"""
                            SELECT DISTINCT contractcode FROM project_risks
                            WHERE contractcode IN ({fmt})
                              AND (division IS NULL OR division <> '완료')
                            """,
                            tuple(contract_codes),
                        )
                    else:
                        cursor.execute(
                            f"""
                            SELECT DISTINCT contractcode FROM project_risks
                            WHERE contractcode IN ({fmt})
                            """,
                            tuple(contract_codes),
                        )
                    for r in cursor.fetchall() or []:
                        code = r.get('contractcode') if isinstance(r, dict) else None
                        if code:
                            risk_map[code] = True
                except Exception:
                    risk_map = {}
            for proj in projects:
                if isinstance(proj, dict):
                    code = proj.get('ContractCode')
                    proj['has_risk'] = bool(risk_map.get(code))
        except Exception:
            pass

        return jsonify({
            'projects': projects,
            'total_pages': total_pages,
            'current_page': page,
        })

    except mysql.connector.Error as e:
        print(f"Error executing SQL query: {e}")
        return jsonify({"error": "Failed to fetch data"}), 500
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()


@bp.route('/PMS_Business/<int:year>')
def business(year: int):
    db = create_connection()
    if db is None:
        return jsonify({"error": "Database connection could not be established"}), 500

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)

        cursor.execute("SELECT DISTINCT YEAR(StartDate) as year FROM Projects ORDER BY year DESC")
        available_years = [row['year'] for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT ProjectID, ProjectName, ContractCode, yearProject, outsourcingCheck 
            FROM Projects 
            WHERE YEAR(StartDate) = %s 
            AND ContractCode NOT LIKE '%%검토%%'
            ORDER BY ContractCode DESC
            """,
            (year,),
        )
        projects = cursor.fetchall()

        cursor.execute(
            """
            SELECT ProjectID, ProjectName, ContractCode, yearProject, outsourcingCheck 
            FROM Projects 
            WHERE ContractCode NOT LIKE '%%검토%%'
            ORDER BY ContractCode DESC
            """
        )
        all_projects = cursor.fetchall()

        cursor.execute(
            """
            SELECT userID, Name, Department, Auth, note,
                   COALESCE(dataauth, 0)   AS dataauth,
                   COALESCE(reportAUTH, 0) AS reportAUTH,
                   COALESCE(projectAUTH, 0) AS projectAUTH
            FROM users
            """
        )
        users = cursor.fetchall()

        for user in users:
            if user.get('note') is None:
                user['note'] = ''

    except mysql.connector.Error as e:
        print(f"Error executing SQL query: {e}")
        return jsonify({"error": "Failed to fetch data"}), 500
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()

    return render_template(
        'PMS_Business_Year.html',
        projects=projects,
        ALL_PROJECT=all_projects,
        selected_year=year,
        available_years=available_years,
        users=users,
        Auth=session.get('user', {}).get('auth', '비회원'),
    )


@bp.route('/api/project_progress/<contract_code>', methods=['GET'])
def api_project_progress(contract_code: str):
    try:
        progress = calc_progress(None, contract_code)
        return jsonify({'contract_code': contract_code, 'progress': round(float(progress), 2)})
    except Exception as e:
        return jsonify({'error': True, 'message': str(e)}), 500


@bp.route('/api/check_contract_code/<contract_code>', methods=['GET'])
def check_contract_code(contract_code: str):
    try:
        connection = create_connection()
        if connection is None:
            return jsonify({'error': True, 'message': '데이터베이스 연결에 실패했습니다.'}), 500

        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT COUNT(*) 
            FROM Projects 
            WHERE ContractCode = %s
            """,
            (contract_code,),
        )
        count = cursor.fetchone()[0]
        cursor.close()
        connection.close()

        return jsonify({
            'exists': count > 0,
            'message': '이미 존재하는 계약코드입니다.' if count > 0 else '사용 가능한 계약코드입니다.',
        })

    except mysql.connector.Error as e:
        print(f"Database error: {str(e)}")
        return jsonify({'error': True, 'message': '데이터베이스 조회 중 오류가 발생했습니다.'}), 500

    except Exception as e:
        print(f"Error checking contract code: {str(e)}")
        return jsonify({'error': True, 'message': '계약코드 확인 중 오류가 발생했습니다.'}), 500


@bp.route('/api/search_projects', methods=['GET'])
def search_projects():
    try:
        search_term = request.args.get('term', '').strip()
        year = request.args.get('year', type=int)
        search_type = request.args.get('type', '')

        if not search_term:
            return jsonify({"projects": [], "current_page": 1, "total_pages": 1})

        connection = create_connection()
        if connection is None:
            return jsonify({"error": "Database connection failed"}), 500

        cursor = connection.cursor(dictionary=True)

        base_query = """
            FROM Projects 
            WHERE (ContractCode LIKE %s OR ProjectName LIKE %s)
        """
        params = [f"%{search_term}%", f"%{search_term}%"]

        if year:
            base_query += " AND YEAR(StartDate) = %s AND ContractCode NOT LIKE '%%검토%%'"
            params.append(year)

        if search_type == "yearly":
            base_query += " AND yearProject = 1"
        elif search_type == "examine":
            base_query += " AND ContractCode LIKE '%%검토%%'"

        query = f"""
            SELECT 
                ProjectID, 
                ContractCode, 
                ProjectName, 
                yearProject,
                project_status,
                outsourcingCheck
            {base_query}
            ORDER BY ContractCode ASC 
            LIMIT %s OFFSET %s
        """

        page = request.args.get("page", 1, type=int)
        per_page = 20
        offset = (page - 1) * per_page
        params.extend([per_page, offset])

        cursor.execute(query, params)
        results = cursor.fetchall()

        contract_codes = [
            (proj.get('ContractCode') or proj.get('contractCode') or proj.get('contract_code'))
            for proj in results if isinstance(proj, dict)
        ]
        progress_map = {}
        if contract_codes:
            try:
                progress_map = calc_progress_bulk(contract_codes) or {}
            except Exception:
                progress_map = {}
        for proj in results:
            code = None
            if isinstance(proj, dict):
                code = proj.get('ContractCode') or proj.get('contractCode') or proj.get('contract_code')
            proj['progress'] = float(progress_map.get(code, 0.0)) if code else 0.0

        risk_map = {}
        contract_codes_distinct = [c for c in set(contract_codes) if c]
        if contract_codes_distinct:
            try:
                has_division = False
                try:
                    cursor.execute("SHOW COLUMNS FROM project_risks LIKE 'division'")
                    has_division = cursor.fetchone() is not None
                except Exception:
                    has_division = False

                fmt = ','.join(['%s'] * len(contract_codes_distinct))
                if has_division:
                    cursor.execute(
                        f"""
                        SELECT DISTINCT contractcode FROM project_risks
                        WHERE contractcode IN ({fmt})
                          AND (division IS NULL OR division <> '완료')
                        """,
                        tuple(contract_codes_distinct),
                    )
                else:
                    cursor.execute(
                        f"""
                        SELECT DISTINCT contractcode FROM project_risks
                        WHERE contractcode IN ({fmt})
                        """,
                        tuple(contract_codes_distinct),
                    )
                for r in cursor.fetchall() or []:
                    code = r.get('contractcode') if isinstance(r, dict) else None
                    if code:
                        risk_map[code] = True
            except Exception:
                risk_map = {}
        for proj in results:
            if isinstance(proj, dict):
                code = proj.get('ContractCode') or proj.get('contractCode') or proj.get('contract_code')
                proj['has_risk'] = bool(risk_map.get(code))

        count_query = f"SELECT COUNT(*) as count {base_query}"
        cursor.execute(count_query, params[:-2])
        total_projects = cursor.fetchone()["count"]
        total_pages = max((total_projects + per_page - 1) // per_page, 1)

        cursor.close()
        connection.close()

        return jsonify({"projects": results, "current_page": page, "total_pages": total_pages})

    except Exception as e:
        print(f"Error searching projects: {str(e)}")
        return jsonify({"error": "검색 중 오류가 발생했습니다."}), 500


@bp.route('/save_staff', methods=['POST'])
def save_staff():
    data = request.get_json()
    db = create_connection()

    if db is None:
        return jsonify({"success": False, "message": "DB 연결 실패"}), 500

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        base_password = "1q2w3e4r!"
        default_password = hashlib.sha256(base_password.encode()).hexdigest()

        cursor.execute(
            """
            SELECT userID, Name, Password,
                   COALESCE(dataauth, 0)   AS dataauth,
                   COALESCE(reportAUTH, 0) AS reportAUTH,
                   COALESCE(projectAUTH, 0) AS projectAUTH
            FROM users
            """
        )
        existing_users = {
            (row['userID'], row['Name']): {
                'Password': row['Password'],
                'dataauth': int(row.get('dataauth', 0) or 0),
                'reportAUTH': int(row.get('reportAUTH', 0) or 0),
                'projectAUTH': int(row.get('projectAUTH', 0) or 0),
            }
            for row in cursor.fetchall()
        }

        cursor.execute("DELETE FROM users")

        for user in data:
            userID = user.get('userID')
            name = user.get('Name')
            if not userID or not name:
                continue

            prev = existing_users.get((userID, name))
            password = prev['Password'] if prev else default_password

            incoming = user.get('dataauth', None)
            if incoming is None:
                dataauth = prev['dataauth'] if prev is not None else 0
            else:
                try:
                    if isinstance(incoming, bool):
                        dataauth = 1 if incoming else 0
                    elif isinstance(incoming, (int, float)):
                        dataauth = 1 if int(incoming) == 1 else 0
                    elif isinstance(incoming, str):
                        dataauth = 1 if incoming.lower() in ('1', 'true', 'y', 'yes') else 0
                    else:
                        dataauth = 0
                except Exception:
                    dataauth = 0

            incoming_report = user.get('reportAUTH', None)
            if incoming_report is None:
                reportAUTH = prev['reportAUTH'] if prev is not None else 0
            else:
                try:
                    if isinstance(incoming_report, bool):
                        reportAUTH = 1 if incoming_report else 0
                    elif isinstance(incoming_report, (int, float)):
                        reportAUTH = 1 if int(incoming_report) == 1 else 0
                    elif isinstance(incoming_report, str):
                        reportAUTH = 1 if incoming_report.lower() in ('1', 'true', 'y', 'yes') else 0
                    else:
                        reportAUTH = 0
                except Exception:
                    reportAUTH = 0

            incoming_project = user.get('projectAUTH', None)
            if incoming_project is None:
                projectAUTH = prev['projectAUTH'] if prev is not None else 0
            else:
                try:
                    if isinstance(incoming_project, bool):
                        projectAUTH = 1 if incoming_project else 0
                    elif isinstance(incoming_project, (int, float)):
                        projectAUTH = 1 if int(incoming_project) == 1 else 0
                    elif isinstance(incoming_project, str):
                        projectAUTH = 1 if incoming_project.lower() in ('1', 'true', 'y', 'yes') else 0
                    else:
                        projectAUTH = 0
                except Exception:
                    projectAUTH = 0

            cursor.execute(
                """
                INSERT INTO users (userID, Password, Name, Department, Auth, note, dataauth, reportAUTH, projectAUTH, CreateDate, UpdateDate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    userID,
                    password,
                    name,
                    user.get('Department', ''),
                    user.get('Auth', ''),
                    user.get('note', ''),
                    dataauth,
                    reportAUTH,
                    projectAUTH,
                    now,
                    now,
                ),
            )

        db.commit()
        return jsonify({"success": True})

    except mysql.connector.Error as e:
        print("[DB ERROR]", e)
        return jsonify({"success": False, "message": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        db.close()
