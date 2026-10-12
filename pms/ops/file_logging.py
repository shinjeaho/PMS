"""Immediate, date-separated UTF-8 console and committed-data logs."""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from flask import g, has_request_context, request, session

SEOUL = timezone(timedelta(hours=9))
_init_lock = threading.RLock()
_original_stderr = sys.stderr
_runtime_writer = None
_audit_writer = None


def seoul_now():
    return datetime.now(SEOUL)


class DailyTextWriter:
    def __init__(self, directory, prefix, clock=seoul_now):
        self.directory = Path(directory)
        self.prefix = prefix
        self.clock = clock
        self._lock = threading.RLock()
        self._day = None
        self._file = None

    def write(self, value):
        with self._lock:
            day = self.clock().strftime('%Y-%m-%d')
            if self._file is None or day != self._day:
                if self._file is not None:
                    self._file.close()
                self.directory.mkdir(parents=True, exist_ok=True)
                self._file = (self.directory / f'{self.prefix}_{day}.log').open('a', encoding='utf-8')
                self._day = day
            self._file.write(value)
            self._file.flush()

    def flush(self):
        with self._lock:
            if self._file is not None:
                self._file.flush()

    def close(self):
        with self._lock:
            if self._file is not None:
                self._file.close()
                self._file = None


def _report_failure(error):
    # Use the original stream so an unwritable log cannot recurse through TeeStream.
    try:
        _original_stderr.write(f'[PMS 로그 저장 실패] {error}\n')
        _original_stderr.flush()
    except Exception:
        pass


class TeeStream:
    def __init__(self, stream, writer):
        self.stream = stream
        self.writer = writer
        self._lock = threading.RLock()

    def write(self, value):
        with self._lock:
            result = self.stream.write(value)
            self.stream.flush()
            try:
                self.writer.write(value)
            except Exception as error:
                _report_failure(error)
            return result

    def flush(self):
        self.stream.flush()
        try:
            self.writer.flush()
        except Exception as error:
            _report_failure(error)

    def __getattr__(self, name):
        return getattr(self.stream, name)


def init_file_logging(app):
    """Install once per process, for both app.py and run.py entrypoints."""
    global _runtime_writer, _audit_writer
    directory = Path(os.getenv('PMS_LOG_DIR') or (Path(app.root_path) / 'Logs')).resolve()
    app.config['PMS_LOG_DIR'] = str(directory)
    with _init_lock:
        if _runtime_writer is not None:
            return
        directory.mkdir(parents=True, exist_ok=True)
        _runtime_writer = DailyTextWriter(directory, 'pms')
        _audit_writer = DailyTextWriter(directory, 'audit')
        original_out, original_err = sys.stdout, sys.stderr
        sys.stdout = TeeStream(original_out, _runtime_writer)
        sys.stderr = TeeStream(original_err, _runtime_writer)
        # Already-created console handlers may retain the original stderr object.
        loggers = [logging.getLogger(), app.logger]
        loggers.extend(value for value in logging.Logger.manager.loggerDict.values()
                       if isinstance(value, logging.Logger))
        for logger in loggers:
            for handler in logger.handlers:
                if isinstance(handler, logging.StreamHandler) and not isinstance(handler, logging.FileHandler):
                    if handler.stream is original_out:
                        handler.setStream(sys.stdout)
                    elif handler.stream is original_err:
                        handler.setStream(sys.stderr)


_SECRET_KEYS = ('password', 'passwd', 'secret', 'token', 'apikey', 'servicekey',
                'authorization', 'cookie', 'sessionkey', 'sessionid', 'credential')


def redact(value):
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            normalized = re.sub(r'[^a-z0-9]', '', str(key).lower())
            private = any(secret in normalized for secret in _SECRET_KEYS) or normalized in {'pw', 'pwd'} or '비밀번호' in str(key)
            result[str(key)] = '[비공개]' if private else redact(item)
        return result
    if isinstance(value, (list, tuple)):
        return [redact(item) for item in value]
    if isinstance(value, (bytes, bytearray, memoryview)):
        return f'[바이너리 {len(value)} bytes]'
    return value


ACTION_NAMES = {
    'post_add_or_edit_project': '사업 추가·수정·복제', 'update_details': '사업 개요 저장',
    'update_project_status': '사업 현황 수정', 'delete_project': '사업 삭제',
    'save_personnel_budget': '예상 인건비 저장', 'save_expense_records': '예상 경비 저장',
    'save_layout': '사업 부서 배치 저장', 'save_task_quantity': '사업 물량·보할 저장',
    'delete_task_quantity_department': '사업 물량 부서 삭제',
    'save_budget_data': '실제 진행비·물량·경비 저장', 'save_quantity_log': '물량 기록 저장',
    'update_quantity_log': '물량 기록 수정', 'update_expense_log': '경비 기록 수정',
    'save_project_changes': '계약변경·수령·성과심사·참여기술자·이슈 저장',
    'save_comments': '사업 코멘트 저장', 'save_external_labor': '외부 인력 저장',
    'save_outsourcing': '외주 추가', 'update_outsourcing': '외주 수정·삭제',
    'save_outsourcing_progress': '외주 진행률 저장', 'save_outsourcing_payments': '외주 지급 저장',
    'save_estimated_budget': '검토사업 예산 저장', 'save_note': '검토사업 노트 저장',
    'save_examine_records': '검토사업 경비 저장', 'upload_files': '사업 파일 업로드',
    'delete_file': '사업 파일 삭제', 'upload_meeting_pdf': '회의록 업로드',
    'update_meeting_pdf': '회의록 수정', 'delete_meeting_file': '회의록 삭제',
    'delete_meeting_attachment': '회의록 첨부파일 삭제', 'save_staff': '직원 정보 저장',
    'save_users_dataauth': '직원 권한 저장', 'reset_password': '비밀번호 재설정',
    'insert_project': '엑셀 사업 등록', 'insert_engineers': '참여기술자 이관',
    'annual_project_engineers_save': '참여기술자 일괄 저장',
    'upsert_company_expense': '회사 경비 기준 저장', 'sync_api': '경쟁업체 계약 동기화',
    'save_expenses': '경비 기준정보 저장', 'save_prices': '인건비 기준정보 저장',
    'save_data': '엑셀 이관 데이터 저장', 'insert_engineer_transfer_data': '참여기술자 이관',
    'api_weekly_save': '업무보고 저장', 'api_weekly_save_split': '부서별 업무보고 저장',
    'api_weekly_submit': '업무보고 제출',
}
_PRIVATE_TABLES = {'sso_sessions', 'sso_settings', 'service_permissions', 'login_history',
                   'meeting_viewers', 'meeting_file_viewers', 'meeting_views'}
_WRITE = re.compile(r'^\s*(INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+INTO|UPDATE|DELETE(?:\s+\w+)?\s+FROM)\s+([`\w.]+)', re.I)


def request_metadata():
    user = session.get('user') or {}
    if not isinstance(user, dict):
        user = {'name': str(user)}
    if not getattr(g, 'audit_request_id', None):
        g.audit_request_id = uuid4().hex
    payload = request.get_json(silent=True) if request.is_json else request.form.to_dict(flat=False)
    files = [{'필드': key, '파일명': file.filename} for key in request.files for file in request.files.getlist(key)]
    endpoint = (request.endpoint or '').split('.')[-1]
    return {
        '요청ID': g.audit_request_id,
        '사용자': user.get('name') or user.get('Name') or '비회원',
        '사용자ID': user.get('userID') or user.get('userid') or '',
        '부서': user.get('Department') or user.get('department') or '',
        '항목': ACTION_NAMES.get(endpoint, endpoint),
        '경로': request.path, '메서드': request.method, '접속IP': request.remote_addr,
        '입력내용': redact(payload), '파일': files,
        '대상': identify_targets(payload, request.view_args or {}),
    }


def identify_targets(*values):
    targets = {}
    def collect(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if str(key).lower().replace('_', '') in {'contractcode', 'projectid', 'fileid', 'meetingid', 'userid', 'year', 'weekstart'}:
                    if isinstance(item, (str, int)) and str(item):
                        targets.setdefault(str(key), set()).add(str(item))
                else:
                    collect(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                collect(item)
    for value in values:
        collect(value)
    return {key: sorted(items) for key, items in targets.items()}


def write_audit(metadata, operations):
    if not operations or _audit_writer is None:
        return
    try:
        moment = seoul_now().isoformat(timespec='milliseconds')
        content = {**metadata, '시각': moment, '결과': 'DB 저장 완료', 'DB변경': operations}
        line = f"{moment} | 누가: {metadata['사용자']} ({metadata['사용자ID']}) | 항목: {metadata['항목']} | 내용: "
        _audit_writer.write(line + json.dumps(content, ensure_ascii=False, default=str) + '\n')
    except Exception as error:
        # The database is already committed: logging failure must not pretend saving failed.
        _report_failure(error)


class AuditCursor:
    def __init__(self, cursor, connection):
        self._cursor = cursor
        self._connection = connection

    def _record(self, sql, params, batch=False):
        match = _WRITE.match(sql) if isinstance(sql, str) else None
        if not match:
            return
        table = match[2].replace('`', '').split('.')[-1].lower()
        if table in _PRIVATE_TABLES:
            return
        operation = match[1].split()[0].upper()
        entry = {'작업': {'INSERT':'추가', 'REPLACE':'교체', 'UPDATE':'수정', 'DELETE':'삭제'}[operation],
                 '테이블': table, '반영행수': self._cursor.rowcount}
        # Staff statements bind password hashes positionally; never record those SQL/params.
        if table != 'users':
            entry['SQL'] = ' '.join(sql.split())
            entry['값'] = redact(params)
            if batch:
                entry['일괄처리'] = True
        self._connection._operations.append(entry)

    def execute(self, operation, params=None, *args, **kwargs):
        result = self._cursor.execute(operation, params, *args, **kwargs)
        self._record(operation, params)
        return result

    def executemany(self, operation, seq_params):
        params = list(seq_params)
        result = self._cursor.executemany(operation, params)
        self._record(operation, params, batch=True)
        return result

    def __getattr__(self, name):
        return getattr(self._cursor, name)

    def __iter__(self):
        return iter(self._cursor)

    def __enter__(self):
        self._cursor.__enter__()
        return self

    def __exit__(self, *args):
        return self._cursor.__exit__(*args)


class AuditConnection:
    def __init__(self, connection, metadata):
        self._connection = connection
        self._metadata = metadata
        self._operations = []

    def cursor(self, *args, **kwargs):
        return AuditCursor(self._connection.cursor(*args, **kwargs), self)

    def commit(self):
        result = self._connection.commit()
        operations, self._operations = self._operations, []
        write_audit(self._metadata, operations)
        return result

    def rollback(self):
        try:
            return self._connection.rollback()
        finally:
            self._operations.clear()

    def close(self):
        self._operations.clear()
        return self._connection.close()

    def __getattr__(self, name):
        return getattr(self._connection, name)

    def __enter__(self):
        self._connection.__enter__()
        return self

    def __exit__(self, *args):
        self._operations.clear()
        return self._connection.__exit__(*args)


def audit_connection(connection):
    if connection is None or not has_request_context() or request.method not in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        return connection
    if (request.endpoint or '').startswith('auth.'):
        return connection
    if (request.endpoint or '').split('.')[-1] == 'increment_meeting_view':
        return connection
    return AuditConnection(connection, request_metadata())
