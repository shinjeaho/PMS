from __future__ import annotations

import os
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timedelta

from pms.db import get_db_config


@dataclass(frozen=True)
class BackupConfig:
    host: str
    user: str
    password: str
    database: str
    backups_root: str


def _default_backups_root() -> str:
    # repo root/app.py 기준으로 ./backups
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir))
    return os.path.join(base_dir, 'backups')


def get_backup_config() -> BackupConfig:
    db = get_db_config()
    return BackupConfig(
        host=db.host,
        user=db.user,
        password=db.password,
        database=db.database,
        backups_root=os.getenv('PMS_BACKUPS_ROOT', _default_backups_root()),
    )


def backup_all_tables(config: BackupConfig | None = None) -> str:
    """DB 전체를 mysqldump로 백업하고 백업 파일 경로를 반환.

    주의: mysqldump가 PATH에 있어야 합니다.
    """

    config = config or get_backup_config()

    today = datetime.now().strftime('%Y-%m-%d')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    backup_dir = os.path.join(config.backups_root, today)
    os.makedirs(backup_dir, exist_ok=True)

    backup_file = os.path.join(backup_dir, f"{config.database}_backup.sql")
    log_file = os.path.join(config.backups_root, 'backup_log.txt')

    cmd: list[str] = [
        'mysqldump',
        '-h',
        config.host,
        '-u',
        config.user,
    ]

    if config.password:
        cmd.append(f"--password={config.password}")

    cmd.append(config.database)

    try:
        with open(backup_file, 'wb') as out:
            subprocess.run(cmd, stdout=out, stderr=subprocess.PIPE, check=True)
        message = f"{timestamp} - Backup completed: {backup_file}\n"
        print(message.strip())
    except subprocess.CalledProcessError as exc:
        stderr = ''
        try:
            stderr = exc.stderr.decode('utf-8', errors='replace') if exc.stderr else ''
        except Exception:
            stderr = ''

        message = f"{timestamp} - Backup failed: {exc}\n"
        if stderr:
            message = message.rstrip('\n') + f" | stderr={stderr.strip()}\n"
        print(message.strip())
    except FileNotFoundError as exc:
        message = (
            f"{timestamp} - Backup failed: mysqldump not found ({exc}). "
            "Install MySQL client tools and ensure mysqldump is in PATH.\n"
        )
        print(message.strip())

    # 로그 남기기 (실패/성공 모두 기록)
    try:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        with open(log_file, 'a', encoding='utf-8') as log:
            log.write(message)
    except Exception:
        # 로깅 실패는 백업 실패로 간주하지 않음
        pass

    return backup_file


def _last_daily_run_path(backups_root: str) -> str:
    return os.path.join(backups_root, 'last_daily_run.txt')


def read_last_daily_run(backups_root: str) -> str | None:
    path = _last_daily_run_path(backups_root)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            value = (f.read() or '').strip()
        return value or None
    except FileNotFoundError:
        return None


def write_last_daily_run(backups_root: str, date_str: str) -> None:
    path = _last_daily_run_path(backups_root)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(date_str)


def run_daily_backup_loop(
    backup_time_hhmm: str = '00:00',
    backups_root: str | None = None,
) -> None:
    """매일 지정 시각(HH:MM)에 1회 백업.

    - 중복 실행 방지: backups/last_daily_run.txt에 YYYY-MM-DD 기록
    - 실행 여부 제어는 호출 측(run.py)에서 환경변수로 결정
    """

    try:
        hh, mm = backup_time_hhmm.split(':', 1)
        target_hour = int(hh)
        target_minute = int(mm)
        if not (0 <= target_hour <= 23 and 0 <= target_minute <= 59):
            raise ValueError
    except Exception:
        raise ValueError(f"Invalid backup_time_hhmm: {backup_time_hhmm} (expected HH:MM)")

    config = get_backup_config()
    root = backups_root or config.backups_root

    while True:
        now = datetime.now()
        target = datetime(now.year, now.month, now.day, target_hour, target_minute)
        if target <= now:
            target = target + timedelta(days=1)

        time.sleep(max(1.0, (target - now).total_seconds()))

        # 깨어난 직후: 오늘 날짜 기준으로 1회만 실행
        now2 = datetime.now()
        today2 = now2.strftime('%Y-%m-%d')
        if read_last_daily_run(root) == today2:
            continue

        print(f"{now2.strftime('%Y-%m-%d %H:%M:%S')} - Daily job start (D-day refresh -> backup)")

        # 1) D-day 일괄 갱신
        try:
            from pms.services.dday import refresh_all_projects_dday

            result = refresh_all_projects_dday()
            print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - D-day refresh result: {result}")
        except Exception as e:
            print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - D-day refresh failed: {e}")

        # 2) 백업
        backup_all_tables(BackupConfig(
            host=config.host,
            user=config.user,
            password=config.password,
            database=config.database,
            backups_root=root,
        ))
        write_last_daily_run(root, today2)


if __name__ == '__main__':
    backup_all_tables()
