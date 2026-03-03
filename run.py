from __future__ import annotations

import os
import threading

from app import app


def main() -> None:
    # 선택: 서버 시작 시 1회 DB 백업
    if os.getenv('PMS_BACKUP_ON_START', '').strip() in {'1', 'true', 'True', 'YES', 'yes'}:
        from pms.ops.backup import backup_all_tables

        threading.Thread(target=backup_all_tables, daemon=True).start()

    # 자정(00:00) 일일 백업: 기본 켬(서버용)
    daily_enabled = os.getenv('PMS_DAILY_BACKUP', '1').strip() not in {'0', 'false', 'False', 'NO', 'no'}
    if daily_enabled:
        from pms.ops.backup import run_daily_backup_loop

        backup_time = os.getenv('PMS_DAILY_BACKUP_TIME', '00:00').strip() or '00:00'
        threading.Thread(
            target=run_daily_backup_loop,
            kwargs={'backup_time_hhmm': backup_time},
            daemon=True,
        ).start()

    # Waitress로 서비스
    from waitress import serve

    host = os.getenv('PMS_HOST', '0.0.0.0')
    port = int(os.getenv('PMS_PORT', '5000'))
    threads = int(os.getenv('PMS_THREADS', '20'))
    serve(app, host=host, port=port, threads=threads)


if __name__ == '__main__':
    main()
