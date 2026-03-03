from __future__ import annotations

import os
from dataclasses import dataclass

import mysql.connector
from mysql.connector import Error


@dataclass(frozen=True)
class DBConfig:
    host: str
    user: str
    password: str
    database: str


def get_db_config(profile: str | None = None) -> DBConfig:
    """DB 설정을 반환.

    - 기본값: 기존과 동일(localhost / root / 0000 / PMS)
    - 60번용: PMS_DB_PROFILE=server60 일 때 할 일.txt에 남아있던 설정 적용
    - 어떤 프로필이든 PMS_DB_* 환경변수로 개별 항목을 덮어쓸 수 있음
    """

    selected = profile or os.getenv('PMS_DB_PROFILE', 'default')

    profiles: dict[str, DBConfig] = {
        'default': DBConfig(
            host='localhost',
            user='root',
            password='0000',
            database='PMS',
        ),
        # 60번용(legacy note: 할 일.txt)
        'server60': DBConfig(
            host='localhost',
            user='root',
            password='tkadls142!',
            database='pms',
        ),
    }

    base = profiles.get(selected, profiles['default'])

    # 환경변수로 최종 덮어쓰기(우선순위 최고)
    return DBConfig(
        host=os.getenv('PMS_DB_HOST', base.host),
        user=os.getenv('PMS_DB_USER', base.user),
        password=os.getenv('PMS_DB_PASSWORD', base.password),
        database=os.getenv('PMS_DB_NAME', base.database),
    )


def create_connection():
    """기존 app.py 설정을 유지한 DB 연결.

    환경변수로 덮어쓸 수 있게만 해두고, 기본값은 기존과 동일.
    """
    connection = None
    config = get_db_config()
    try:
        connection = mysql.connector.connect(
            host=config.host,
            user=config.user,
            password=config.password,
            database=config.database,
        )
    except Error as e:
        print(f"The error '{e}' occurred")
    return connection
