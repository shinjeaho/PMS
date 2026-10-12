"""Record successful project saves in the caller's transaction."""


def touch_projects(cursor, contract_codes=(), *, project_id=None):
    """Use Seoul time; never commit separately from the saved project data."""
    if isinstance(contract_codes, str):
        contract_codes = (contract_codes,)
    codes = sorted({str(code).strip() for code in (contract_codes or ()) if code and str(code).strip()})
    if codes:
        placeholders = ','.join(['%s'] * len(codes))
        cursor.execute(
            f'UPDATE projects SET last_updated_at = UTC_TIMESTAMP() + INTERVAL 9 HOUR '
            f'WHERE ContractCode IN ({placeholders})',
            tuple(codes),
        )
    elif project_id is not None:
        cursor.execute(
            'UPDATE projects SET last_updated_at = UTC_TIMESTAMP() + INTERVAL 9 HOUR '
            'WHERE ProjectID = %s',
            (project_id,),
        )
