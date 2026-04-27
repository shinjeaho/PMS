from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any


STATUS_PROGRESS = '진행중'
STATUS_STOP = '용역중지'
STATUS_COMPLETE = '준공'
LEGACY_STOP_YEAR = 2025


def ensure_project_status_history_table(cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS project_status_history (
            id BIGINT NOT NULL AUTO_INCREMENT,
            project_id INT NOT NULL,
            contract_code VARCHAR(64) NOT NULL,
            status VARCHAR(20) NOT NULL,
            effective_date DATE NOT NULL,
            changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            changed_by VARCHAR(100) NULL,
            note VARCHAR(255) NULL,
            PRIMARY KEY (id),
            KEY idx_project_status_history_project_date (project_id, effective_date, id),
            KEY idx_project_status_history_contract_date (contract_code, effective_date, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        """
    )


def normalize_project_status(raw_status: Any) -> str:
    if raw_status is None:
        return STATUS_PROGRESS

    status = str(raw_status).strip()
    if not status:
        return STATUS_PROGRESS
    if status.startswith(STATUS_COMPLETE):
        return STATUS_COMPLETE
    if status.startswith(STATUS_STOP):
        return STATUS_STOP
    if status.startswith(STATUS_PROGRESS):
        return STATUS_PROGRESS
    return status


def extract_status_year(raw_status: Any) -> int | None:
    if raw_status is None:
        return None

    match = re.search(r'\((\d{2}|\d{4})\)', str(raw_status))
    if not match:
        return None

    year_text = match.group(1)
    if len(year_text) == 2:
        return 2000 + int(year_text)
    return int(year_text)


def extract_contract_code_year(contract_code: Any) -> int | None:
    if contract_code is None:
        return None

    match = re.match(r'\s*(\d{2}|\d{4})-', str(contract_code))
    if not match:
        return None

    year_text = match.group(1)
    if len(year_text) == 2:
        return 2000 + int(year_text)
    return int(year_text)


def coerce_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = str(value).strip()
    if not text:
        return None

    for fmt in ('%Y-%m-%d', '%Y/%m/%d', '%Y.%m.%d'):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None


def effective_date_from_year(year: int | None) -> date | None:
    if year is None:
        return None
    return date(int(year), 12, 31)


def build_effective_date(
    status: str,
    effective_year: int | None = None,
    project_start_date: Any = None,
    project_end_date: Any = None,
    contract_code: Any = None,
) -> date:
    normalized_status = normalize_project_status(status)
    year_date = effective_date_from_year(effective_year)
    if year_date is not None:
        return year_date

    if normalized_status == STATUS_PROGRESS:
        contract_year = extract_contract_code_year(contract_code)
        if contract_year is not None:
            return date(contract_year, 1, 1)
        return coerce_date(project_start_date) or date.today()

    if normalized_status == STATUS_STOP:
        return date(LEGACY_STOP_YEAR, 12, 31)

    if normalized_status == STATUS_COMPLETE:
        return coerce_date(project_end_date) or date.today()

    return date.today()


def infer_legacy_status_for_year(raw_status: Any, selected_year: int, end_date: Any = None) -> str:
    normalized_status = normalize_project_status(raw_status)
    encoded_year = extract_status_year(raw_status)

    if normalized_status == STATUS_COMPLETE:
        completion_year = encoded_year
        if completion_year is None:
            end_dt = coerce_date(end_date)
            completion_year = end_dt.year if end_dt else None
        if completion_year is not None and selected_year < completion_year:
            return STATUS_PROGRESS
        return STATUS_COMPLETE

    if normalized_status == STATUS_STOP:
        stop_year = encoded_year or LEGACY_STOP_YEAR
        if selected_year < stop_year:
            return STATUS_PROGRESS
        return STATUS_STOP

    return normalized_status


def ensure_initial_project_status_history(
    cursor,
    project_id: int,
    contract_code: str,
    project_start_date: Any,
    current_status: Any = None,
    project_end_date: Any = None,
) -> None:
    ensure_project_status_history_table(cursor)
    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM project_status_history WHERE project_id = %s",
        (project_id,),
    )
    row = cursor.fetchone()
    count = row.get('cnt') if isinstance(row, dict) else row[0]
    if count:
        return

    contract_year = extract_contract_code_year(contract_code)
    start_dt = date(contract_year, 1, 1) if contract_year is not None else (coerce_date(project_start_date) or date.today())
    cursor.execute(
        """
        INSERT INTO project_status_history (project_id, contract_code, status, effective_date, note)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (project_id, contract_code, STATUS_PROGRESS, start_dt, 'initial bootstrap'),
    )

    normalized_current = normalize_project_status(current_status)
    if normalized_current == STATUS_PROGRESS:
        return

    inferred_year = extract_status_year(current_status)
    inferred_effective_date = build_effective_date(
        normalized_current,
        effective_year=inferred_year,
        project_start_date=project_start_date,
        project_end_date=project_end_date,
        contract_code=contract_code,
    )
    if inferred_effective_date < start_dt:
        inferred_effective_date = start_dt

    cursor.execute(
        """
        INSERT INTO project_status_history (project_id, contract_code, status, effective_date, note)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (project_id, contract_code, normalized_current, inferred_effective_date, 'legacy current status bootstrap'),
    )


def record_project_status_history(
    cursor,
    project_id: int,
    contract_code: str,
    status: str,
    effective_date: date,
    changed_by: str | None = None,
    note: str | None = None,
) -> bool:
    ensure_project_status_history_table(cursor)

    normalized_status = normalize_project_status(status)
    cursor.execute(
        """
        SELECT id, status, effective_date
        FROM project_status_history
        WHERE project_id = %s
        ORDER BY effective_date DESC, id DESC
        LIMIT 1
        """,
        (project_id,),
    )
    last_row = cursor.fetchone()
    if last_row:
        last_status = normalize_project_status(last_row.get('status') if isinstance(last_row, dict) else last_row[1])
        last_effective = coerce_date(last_row.get('effective_date') if isinstance(last_row, dict) else last_row[2])
        if last_status == normalized_status and last_effective == effective_date:
            return False

    cursor.execute(
        """
        INSERT INTO project_status_history (
            project_id, contract_code, status, effective_date, changed_by, note
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (project_id, contract_code, normalized_status, effective_date, changed_by, note),
    )
    return True


def sync_project_status_history_contract_code(cursor, project_id: int, contract_code: str) -> None:
    ensure_project_status_history_table(cursor)
    cursor.execute(
        "UPDATE project_status_history SET contract_code = %s WHERE project_id = %s",
        (contract_code, project_id),
    )


def get_project_status_map_for_year(cursor, projects: list[dict[str, Any]], selected_year: int) -> dict[int, str]:
    ensure_project_status_history_table(cursor)

    project_ids = [project.get('projectID') for project in projects if project.get('projectID') is not None]
    if not project_ids:
        return {}

    format_strings = ','.join(['%s'] * len(project_ids))
    year_end = date(int(selected_year), 12, 31)
    cursor.execute(
        f"""
        SELECT project_id, status, effective_date, id
        FROM project_status_history
        WHERE project_id IN ({format_strings})
          AND effective_date <= %s
        ORDER BY project_id ASC, effective_date ASC, id ASC
        """,
        tuple(project_ids) + (year_end,),
    )

    status_map: dict[int, str] = {}
    for row in cursor.fetchall() or []:
        project_id = row.get('project_id') if isinstance(row, dict) else row[0]
        raw_status = row.get('status') if isinstance(row, dict) else row[1]
        if project_id is None:
            continue
        status_map[int(project_id)] = normalize_project_status(raw_status)

    for project in projects:
        project_id = project.get('projectID')
        if project_id is None or project_id in status_map:
            continue
        status_map[int(project_id)] = infer_legacy_status_for_year(
            project.get('project_status'),
            int(selected_year),
            project.get('EndDate'),
        )

    return status_map


def get_completed_project_ids_for_year(cursor, projects: list[dict[str, Any]], selected_year: int) -> set[int]:
    ensure_project_status_history_table(cursor)

    project_ids = [project.get('projectID') for project in projects if project.get('projectID') is not None]
    if not project_ids:
        return set()

    year_start = date(int(selected_year), 1, 1)
    year_end = date(int(selected_year), 12, 31)
    format_strings = ','.join(['%s'] * len(project_ids))
    cursor.execute(
        f"""
        SELECT DISTINCT project_id
        FROM project_status_history
        WHERE project_id IN ({format_strings})
          AND status = %s
          AND effective_date BETWEEN %s AND %s
        """,
        tuple(project_ids) + (STATUS_COMPLETE, year_start, year_end),
    )

    completed_ids = {
        int(row.get('project_id') if isinstance(row, dict) else row[0])
        for row in (cursor.fetchall() or [])
    }

    for project in projects:
        project_id = project.get('projectID')
        if project_id is None or project_id in completed_ids:
            continue

        legacy_year = extract_status_year(project.get('project_status'))
        if legacy_year is None and normalize_project_status(project.get('project_status')) == STATUS_COMPLETE:
            end_date = coerce_date(project.get('EndDate'))
            legacy_year = end_date.year if end_date else None
        if legacy_year == int(selected_year):
            completed_ids.add(int(project_id))

    return completed_ids