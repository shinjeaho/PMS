from __future__ import annotations

import os
from datetime import datetime

from flask import Blueprint, request, render_template, jsonify

from ..db import create_connection
from ..services.dday import calculate_d_day_value, auto_insert_risk_for_contract
from ..services.project_status import (
    ensure_initial_project_status_history,
    sync_project_status_history_contract_code,
)
from ..utils.files import UPLOAD_FOLDER, format_file_size

bp = Blueprint('project_form', __name__)


@bp.route('/addproject', methods=['GET'])
def get_add_or_edit_project():
    project_id = request.args.get('projectId')
    year = request.args.get('year', type=int)
    action = request.args.get('action')
    mode = request.args.get('mode')
    print(action, project_id)

    connection = create_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        project = None
        expenses = None
        project_files = []

        def normalize_reference_code(code):
            if code is None:
                return None
            text = str(code).strip()
            if not text or text.lower() in ['none', 'null', 'undefined', '-']:
                return None
            return text

        if project_id:
            cursor.execute("SELECT * FROM projects WHERE ProjectID = %s", (project_id,))
            project = cursor.fetchone()
            if not project:
                return "Project not found", 404

            for ref_field in ['referenceProject1', 'referenceProject2', 'referenceProject3', 'referenceProject4', 'referenceProject5']:
                if ref_field in project:
                    project[ref_field] = normalize_reference_code(project.get(ref_field))

            cursor.execute(
                """
                SELECT FileID, OriginalFileName, FileSize, FileType, UploadDate
                FROM ProjectFiles
                WHERE ContractCode = %s
                ORDER BY UploadDate DESC
                """,
                (project['ContractCode'],),
            )

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
    except Exception as e:
        print(f"Error: {e}")
    finally:
        cursor.close()
        connection.close()

    is_edit = bool(project_id) and action != 'clone'
    is_clone = (action == 'clone')

    return render_template(
        'PMS_addProject.html',
        project=project,
        expenses=expenses,
        is_edit=is_edit,
        is_clone=is_clone,
        project_id=project_id,
        files=project_files,
        action=action,
        mode=mode,
    )


@bp.route('/addproject', methods=['POST'])
def post_add_or_edit_project():
    if request.content_type != 'application/json':
        return jsonify({"success": False, "message": "Invalid Content-Type. Expected 'application/json'."}), 415

    try:
        try:
            project_info = request.get_json()
        except Exception:
            return jsonify({"message": "Invalid JSON data"}), 401

        if not project_info:
            return jsonify({"message": "No data provided"}), 402

        connection = create_connection()
        cursor = connection.cursor()

        try:
            project_id = project_info.get('projectID')
            action = project_info.get('action')
            mode = project_info.get('projectMode')

            reference_projects = project_info.get('referenceProjects', [])
            referenceProject1 = reference_projects[0]['referenceCode'] if len(reference_projects) > 0 else None
            referenceProject2 = reference_projects[1]['referenceCode'] if len(reference_projects) > 1 else None
            referenceProject3 = reference_projects[2]['referenceCode'] if len(reference_projects) > 2 else None
            referenceProject4 = reference_projects[3]['referenceCode'] if len(reference_projects) > 3 else None
            referenceProject5 = reference_projects[4]['referenceCode'] if len(reference_projects) > 4 else None

            required_fields = [
                'contractCode',
                'projectName',
                'projectCost',
                'ProjectCost_NoVAT',
                'startDate',
                'orderPlace',
                'contributionRate',
                'projectDetails',
                'academicResearchRate',
                'operationalRate',
                'equipmentRate',
            ]
            missing_fields = [field for field in required_fields if field not in project_info]
            if missing_fields:
                return jsonify({
                    'message': f"필수 필드가 누락되었습니다: {', '.join(missing_fields)}",
                    'fields': missing_fields,
                }), 400

            raw_types = project_info.get('projectType', [])
            if isinstance(raw_types, str):
                raw_types = [raw_types]
            types_set = set(raw_types or [])

            has_single = ('단일사업' in types_set) or ('신규사업' in types_set)
            has_year = ('연차사업' in types_set)
            has_carry = ('이월사업' in types_set)

            if has_single and has_year:
                return jsonify({
                    'success': False,
                    'message': '계약형식 조합 오류: 단일사업과 연차사업은 함께 선택할 수 없습니다.',
                }), 400

            year_project_val = 0
            if has_year and has_carry:
                year_project_val = 4
            elif has_single and has_carry:
                year_project_val = 3
            elif has_year:
                year_project_val = 1
            elif has_carry:
                year_project_val = 2
            else:
                year_project_val = 0

            project_data = {
                'contractCode': project_info['contractCode'],
                'projectName': project_info['projectName'],
                'projectCost': project_info['projectCost'],
                'ProjectCost_NoVAT': project_info['ProjectCost_NoVAT'],
                'startDate': project_info['startDate'],
                'endDate': project_info.get('endDate'),
                'orderPlace': project_info['orderPlace'],
                'manager': project_info.get('manager'),
                'contributionRate': project_info['contributionRate'],
                'projectDetails': project_info['projectDetails'].replace('\r\n', '\n'),
                'academicResearchRate': project_info['academicResearchRate'],
                'operationalRate': project_info['operationalRate'],
                'equipmentRate': project_info['equipmentRate'],
                'safetyRate': project_info.get('safetyRate'),
                'yearProject': year_project_val,
                'procurementType': project_info.get('procurementType'),
                'BidPrice': project_info.get('BidPrice'),
                'BidPrice_NoVAT': project_info.get('BidPrice_NoVAT'),
            }

            try:
                project_data['contributionRate'] = round(float(project_data['contributionRate']), 2)
            except Exception:
                pass

            try:
                print(f"[DEBUG] procurementType: {project_data.get('procurementType')}")
            except Exception:
                pass

            try:
                share_amount = float(project_data['ProjectCost_NoVAT']) * (float(project_data['contributionRate']) / 100)
            except Exception:
                share_amount = 0.0
            print(action)

            if action == 'clone':
                cursor.execute(
                    """
                    INSERT INTO projects (
                        contractCode, projectName, projectCost, ProjectCost_NoVAT, startDate, endDate,ChangeProjectCost,
                        orderPlace, manager, contributionRate, projectDetails,
                        academicResearchRate, operationalRate, equipmentRate, safetyRate, yearProject, procurementType,
                        BidPrice, BidPrice_NoVAT,
                        referenceProject1, referenceProject2, referenceProject3, referenceProject4, referenceProject5,
                        D_Day
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        project_data['contractCode'],
                        project_data['projectName'],
                        project_data['projectCost'],
                        project_data['ProjectCost_NoVAT'],
                        project_data['startDate'],
                        project_data['endDate'],
                        project_data['projectCost'],
                        project_data['orderPlace'],
                        project_data['manager'],
                        project_data['contributionRate'],
                        project_data['projectDetails'],
                        project_data['academicResearchRate'],
                        project_data['operationalRate'],
                        project_data['equipmentRate'],
                        project_data['safetyRate'],
                        project_data['yearProject'],
                        project_data['procurementType'],
                        project_data['BidPrice'],
                        project_data['BidPrice_NoVAT'],
                        referenceProject1,
                        referenceProject2,
                        referenceProject3,
                        referenceProject4,
                        referenceProject5,
                        calculate_d_day_value(project_data['endDate'], None),
                    ),
                )
                project_id = cursor.lastrowid

                auto_insert_risk_for_contract(cursor, project_data['contractCode'])

                cursor.execute(
                    """
                    INSERT INTO BusinessChangeHistory (
                        Division, ContractDate, Cost_VAT, Cost_NoVAT, Cost_ShareRate, 
                        ContractCode, UpdateDate
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_DATE())
                    """,
                    (
                        '당초',
                        project_data['startDate'],
                        project_data['projectCost'],
                        project_data['ProjectCost_NoVAT'],
                        share_amount,
                        project_data['contractCode'],
                    ),
                )

                file_list = project_info.get('files', [])
                contract_code = project_info.get('contractCode')
                for file in file_list:
                    try:
                        filename = file['filename']
                        original_filename = file['original']
                        file_url = file['path']
                        file_size = file['size']
                        file_type = file['type']

                        if '/temp/' in file_url:
                            year_dir = datetime.now().strftime('%Y')
                            temp_path = os.path.join(UPLOAD_FOLDER, 'temp', year_dir, filename)
                            final_folder = os.path.join(UPLOAD_FOLDER, year_dir)
                            final_path = os.path.join(final_folder, filename)
                            os.makedirs(final_folder, exist_ok=True)
                            if os.path.exists(temp_path):
                                os.rename(temp_path, final_path)
                                file_url = f"/static/uploads/{year_dir}/{filename}"

                        cursor.execute(
                            """
                            INSERT INTO ProjectFiles 
                            (ContractCode, FileName, OriginalFileName, FilePath, FileSize, FileType, UploadDate)
                            VALUES (%s, %s, %s, %s, %s, %s, NOW())
                            """,
                            (contract_code, filename, original_filename, file_url, file_size, file_type),
                        )
                    except Exception as e:
                        print(f"[ERROR] Failed to save file {file.get('filename')}: {str(e)}")

                connection.commit()
                return jsonify({
                    'success': True,
                    'message': 'Project cloned successfully!',
                    'mode': 'clone',
                    'projectCode': project_data['contractCode'],
                    'projectID': project_id,
                }), 201

            elif project_id:
                cursor.execute(
                    "SELECT contractCode, project_status, endDate, startDate FROM projects WHERE ProjectID = %s",
                    (project_id,),
                )
                old_contract_code_row = cursor.fetchone()
                if not old_contract_code_row:
                    return jsonify({'message': 'Project not found for updating'}), 404
                old_contract_code = old_contract_code_row[0]
                current_status = old_contract_code_row[1] if len(old_contract_code_row) > 1 else None
                current_end = old_contract_code_row[2] if len(old_contract_code_row) > 2 else None
                current_start = old_contract_code_row[3] if len(old_contract_code_row) > 3 else None

                new_status = current_status
                new_end_date = project_data['endDate'] if project_data['endDate'] is not None else current_end
                d_day_val = None
                status_str = str(new_status) if new_status is not None else ''
                is_frozen = ('준공' in status_str) or ('용역중지' in status_str)
                if not is_frozen:
                    d_day_val = calculate_d_day_value(new_end_date, new_status)

                cursor.execute(
                    """
                    UPDATE projects
                    SET contractCode = %s, projectName = %s,
                        startDate = %s, endDate = %s, orderPlace = %s, manager = %s,
                        contributionRate = %s, projectDetails = %s,
                        academicResearchRate = %s, operationalRate = %s, equipmentRate = %s, 
                        safetyRate = %s, yearProject = %s, procurementType = %s,
                        D_Day = COALESCE(%s, D_Day),
                        referenceProject1 = %s, referenceProject2 = %s, referenceProject3 = %s, 
                        referenceProject4 = %s, referenceProject5 = %s
                    WHERE ProjectID = %s
                    """,
                    (
                        project_data['contractCode'],
                        project_data['projectName'],
                        project_data['startDate'],
                        project_data['endDate'],
                        project_data['orderPlace'],
                        project_data['manager'],
                        project_data['contributionRate'],
                        project_data['projectDetails'],
                        project_data['academicResearchRate'],
                        project_data['operationalRate'],
                        project_data['equipmentRate'],
                        project_data['safetyRate'],
                        project_data['yearProject'],
                        project_data['procurementType'],
                        d_day_val,
                        referenceProject1,
                        referenceProject2,
                        referenceProject3,
                        referenceProject4,
                        referenceProject5,
                        project_id,
                    ),
                )

                ensure_initial_project_status_history(
                    cursor,
                    project_id,
                    old_contract_code,
                    current_start,
                    current_status=current_status,
                    project_end_date=current_end,
                )
                sync_project_status_history_contract_code(cursor, project_id, project_data['contractCode'])

                auto_insert_risk_for_contract(cursor, project_data['contractCode'])

                if mode == 'examine':
                    cursor.execute(
                        """
                        UPDATE projects
                        SET projectCost = %s, ProjectCost_NoVAT = %s,
                            BidPrice = %s, BidPrice_NoVAT = %s
                        WHERE ProjectID = %s
                        """,
                        (
                            project_data['projectCost'],
                            project_data['ProjectCost_NoVAT'],
                            project_data['BidPrice'],
                            project_data['BidPrice_NoVAT'],
                            project_id,
                        ),
                    )

                related_tables = {
                    'businesschangehistory': 'ContractCode',
                    'businessreceiptdetails': 'ContractCode',
                    'exmanager': 'ContractCode',
                    'expenserecords': 'ContractCode',
                    'outsourcing': 'contract_code',
                    'performanceevaluationfee': 'ContractCode',
                    'projectfiles': 'ContractCode',
                    'project_depbohal': 'contractcode',
                    'quantity_log': 'contract_code',
                    'state': 'contractCode',
                    'clone_state': 'contractCode',
                    'taskassignment': 'ContractCode',
                    'taskquantity': 'ContractCode',
                    'usemoney': 'ContractCode',
                    'usemoney_log': 'contractcode',
                    'project_risks': 'contractcode',
                    'project_engineers': 'contractcode',
                    'project_comment': 'contractcode',
                    'external_labor_rates': 'contractcode',
                    'examine_exmanager': 'ContractCode',
                    'examine_expenserecords': 'ContractCode',
                    'examine_note': 'ContractCode',
                    'examine_outsourcing': 'Contract_Code',
                }
                for table, column in related_tables.items():
                    cursor.execute(
                        f"UPDATE {table} SET {column} = %s WHERE {column} = %s",
                        (project_data['contractCode'], old_contract_code),
                    )

                cursor.execute(
                    """
                    UPDATE businesschangehistory
                    SET Cost_VAT = %s, Cost_NoVAT = %s, Cost_ShareRate = %s
                    WHERE ContractCode = %s AND Division = '당초'
                    """,
                    (
                        project_data['projectCost'],
                        project_data['ProjectCost_NoVAT'],
                        share_amount,
                        project_data['contractCode'],
                    ),
                )

                connection.commit()
                return jsonify({
                    'success': True,
                    'message': 'Project updated successfully!',
                    'mode': mode,
                    'projectId': project_id,
                }), 200

            else:
                cursor.execute(
                    """
                    INSERT INTO projects (
                        contractCode, projectName, projectCost, ProjectCost_NoVAT, startDate, endDate, ChangeProjectCost,
                        orderPlace, manager, contributionRate, projectDetails,
                        academicResearchRate, operationalRate, equipmentRate, safetyRate, yearProject, procurementType,
                        BidPrice, BidPrice_NoVAT,
                        referenceProject1, referenceProject2, referenceProject3, referenceProject4, referenceProject5,
                        D_Day
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        project_data['contractCode'],
                        project_data['projectName'],
                        project_data['projectCost'],
                        project_data['ProjectCost_NoVAT'],
                        project_data['startDate'],
                        project_data['endDate'],
                        project_data['projectCost'],
                        project_data['orderPlace'],
                        project_data['manager'],
                        project_data['contributionRate'],
                        project_data['projectDetails'],
                        project_data['academicResearchRate'],
                        project_data['operationalRate'],
                        project_data['equipmentRate'],
                        project_data['safetyRate'],
                        project_data['yearProject'],
                        project_data['procurementType'],
                        project_data['BidPrice'],
                        project_data['BidPrice_NoVAT'],
                        referenceProject1,
                        referenceProject2,
                        referenceProject3,
                        referenceProject4,
                        referenceProject5,
                        calculate_d_day_value(project_data['endDate'], None),
                    ),
                )
                project_id = cursor.lastrowid

                ensure_initial_project_status_history(
                    cursor,
                    project_id,
                    project_data['contractCode'],
                    project_data['startDate'],
                    current_status=None,
                    project_end_date=project_data['endDate'],
                )

                Project_type = False if ('검토' in project_data['contractCode']) else True

                cursor.execute(
                    """
                    INSERT INTO BusinessChangeHistory (
                        Division, ContractDate, Cost_VAT, Cost_NoVAT, Cost_ShareRate, 
                        ContractCode, UpdateDate
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_DATE())
                    """,
                    (
                        '당초',
                        project_data['startDate'],
                        project_data['projectCost'],
                        project_data['ProjectCost_NoVAT'],
                        share_amount,
                        project_data['contractCode'],
                    ),
                )

                file_list = project_info.get('files', [])
                contract_code = project_info.get('contractCode')
                for file in file_list:
                    try:
                        filename = file['filename']
                        original_filename = file['original']
                        file_url = file['path']
                        file_size = file['size']
                        file_type = file['type']

                        if '/temp/' in file_url:
                            year_dir = datetime.now().strftime('%Y')
                            temp_path = os.path.join(UPLOAD_FOLDER, 'temp', year_dir, filename)
                            final_folder = os.path.join(UPLOAD_FOLDER, year_dir)
                            final_path = os.path.join(final_folder, filename)
                            os.makedirs(final_folder, exist_ok=True)
                            if os.path.exists(temp_path):
                                os.rename(temp_path, final_path)
                                file_url = f"/static/uploads/{year_dir}/{filename}"

                        cursor.execute(
                            """
                            INSERT INTO ProjectFiles 
                            (ContractCode, FileName, OriginalFileName, FilePath, FileSize, FileType, UploadDate)
                            VALUES (%s, %s, %s, %s, %s, %s, NOW())
                            """,
                            (contract_code, filename, original_filename, file_url, file_size, file_type),
                        )
                    except Exception as e:
                        print(f"[ERROR] Failed to save file {file.get('filename')}: {str(e)}")

                connection.commit()
                return jsonify({
                    'success': True,
                    'message': 'Project added successfully!',
                    'mode': 'new',
                    'type': Project_type,
                    'projectCode': project_data['contractCode'],
                    'projectID': project_id,
                }), 201

        except Exception as e:
            connection.rollback()
            print(f"[ERROR] Database Error: {e}")
            return jsonify({'success': False, 'message': 'Database error occurred', 'error': str(e)}), 500

        finally:
            cursor.close()
            connection.close()

    except Exception as e:
        print(f"[ERROR] Unexpected Error: {e}")
        return jsonify({'success': False, 'message': 'Unexpected error occurred', 'error': str(e)}), 500
