"""Apply versioned database changes before serving application requests."""
from __future__ import annotations

VERSION = '20261012_project_updates_null'
LOCK_NAME = 'pms_startup_migrations'


def migrate(connection):
    cursor = connection.cursor()
    locked = False
    try:
        cursor.execute('SELECT GET_LOCK(%s, %s)', (LOCK_NAME, 30))
        row = cursor.fetchone()
        if not row or row[0] != 1:
            raise RuntimeError('Could not acquire the PMS database migration lock')
        locked = True
        cursor.execute('''CREATE TABLE IF NOT EXISTS pms_schema_migrations (
            version VARCHAR(128) PRIMARY KEY,
            applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )''')
        cursor.execute('SELECT version FROM pms_schema_migrations WHERE version = %s', (VERSION,))
        if cursor.fetchone() is not None:
            print('[DB migration] Already applied: ' + VERSION)
            return 0
        cursor.execute("SHOW COLUMNS FROM projects LIKE 'last_updated_at'")
        if cursor.fetchone() is None:
            cursor.execute(
                'ALTER TABLE projects ADD COLUMN last_updated_at DATETIME NULL DEFAULT NULL '
                "COMMENT 'Last successful project save, Asia/Seoul'"
            )
        cursor.execute(
            'UPDATE projects SET last_updated_at = NULL WHERE last_updated_at = %s',
            ('2026-10-07 00:00:00',),
        )
        cleared = cursor.rowcount
        cursor.execute('INSERT INTO pms_schema_migrations (version) VALUES (%s)', (VERSION,))
        connection.commit()
        print(f'[DB migration] Applied {VERSION}; cleared {cleared} baseline dates to NULL.')
        return cleared
    except Exception:
        connection.rollback()
        raise
    finally:
        try:
            if locked:
                cursor.execute('SELECT RELEASE_LOCK(%s)', (LOCK_NAME,))
                cursor.fetchone()
        finally:
            cursor.close()
            connection.close()


def run_startup_migrations():
    from ..db import create_connection
    connection = create_connection()
    if connection is None:
        raise RuntimeError('PMS startup migration failed: database connection unavailable')
    migrate(connection)
