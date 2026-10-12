import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch

from flask import Flask, session

from pms.ops import file_logging as logs


class FileLoggingTest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.secret_key = 'test-only'
        self.raw = Mock()
        self.raw.cursor.return_value.rowcount = 1
        self.writer = Mock()

    def context(self, method='POST', **kwargs):
        return self.app.test_request_context('/api/save_task_quantity', method=method, **kwargs)

    def test_console_is_preserved_and_written_immediately(self):
        with tempfile.TemporaryDirectory() as folder:
            writer = logs.DailyTextWriter(folder, 'pms', lambda: datetime(2026, 10, 12))
            console = io.StringIO()
            tee = logs.TeeStream(console, writer)
            tee.write('개발 - 요청 완료\n')
            self.assertEqual(console.getvalue(), '개발 - 요청 완료\n')
            self.assertEqual(Path(folder, 'pms_2026-10-12.log').read_text(encoding='utf-8'), console.getvalue())
            writer.close()

    def test_daily_rotation_restart_append_and_concurrent_lines(self):
        with tempfile.TemporaryDirectory() as folder:
            now = [datetime(2026, 10, 12, 23, 59, 59)]
            writer = logs.DailyTextWriter(folder, 'audit', lambda: now[0])
            writer.write('first\n')
            now[0] = datetime(2026, 10, 13)
            with ThreadPoolExecutor(max_workers=8) as executor:
                list(executor.map(lambda i: writer.write(f'line-{i}\n'), range(100)))
            writer.close()
            restarted = logs.DailyTextWriter(folder, 'audit', lambda: now[0])
            restarted.write('restart\n'); restarted.close()
            self.assertEqual(Path(folder, 'audit_2026-10-12.log').read_text(), 'first\n')
            lines = Path(folder, 'audit_2026-10-13.log').read_text().splitlines()
            self.assertEqual(len(lines), 101)
            self.assertEqual(len(set(lines)), 101)

    def test_only_successful_commit_records_actor_target_and_values(self):
        with self.context(json={'contractCode':'26-TEST', 'quantity':15}), patch.object(logs, '_audit_writer', self.writer):
            session['user'] = {'name':'개발', 'userID':'dev', 'Department':'GIS'}
            connection = logs.audit_connection(self.raw)
            cursor = connection.cursor(dictionary=True)
            cursor.execute('UPDATE taskquantity SET quantity=%s WHERE ContractCode=%s', (15, '26-TEST'))
            self.writer.write.assert_not_called()
            connection.commit()
            record = json.loads(self.writer.write.call_args.args[0].split(' | 내용: ', 1)[1])
            self.assertEqual(record['사용자'], '개발')
            self.assertEqual(record['대상']['contractCode'], ['26-TEST'])
            self.assertEqual(record['DB변경'][0]['값'], [15, '26-TEST'])
            self.assertEqual(record['DB변경'][0]['반영행수'], 1)
            self.assertEqual(record['시각'][-6:], '+09:00')
            connection.commit()
            self.writer.write.assert_called_once()

    def test_rollback_close_and_failed_commit_never_record_success(self):
        with self.context(), patch.object(logs, '_audit_writer', self.writer):
            connection = logs.audit_connection(self.raw)
            cursor = connection.cursor()
            cursor.execute('DELETE FROM outsourcing WHERE id=%s', (1,))
            connection.rollback(); connection.commit()
            self.writer.write.assert_not_called()
            cursor.execute('UPDATE projects SET ProjectName=%s WHERE ProjectID=%s', ('name',1))
            self.raw.commit.side_effect = RuntimeError('failed commit')
            with self.assertRaises(RuntimeError):
                connection.commit()
            connection.close()
            self.writer.write.assert_not_called()

    def test_failed_statement_and_read_only_request_are_not_audited(self):
        with self.context(), patch.object(logs, '_audit_writer', self.writer):
            connection = logs.audit_connection(self.raw)
            self.raw.cursor.return_value.execute.side_effect = RuntimeError('failed write')
            with self.assertRaises(RuntimeError):
                connection.cursor().execute('UPDATE projects SET ProjectName=%s', ('test',))
            connection.commit()
            self.writer.write.assert_not_called()
        with self.context(method='GET'):
            self.assertIs(logs.audit_connection(self.raw), self.raw)

    def test_secrets_redacted_and_staff_password_bindings_are_never_written(self):
        payload = {'name':'staff', 'password':'plain-secret', 'nested':{'api_key':'key-secret'}, '비밀번호':'hidden-secret'}
        with self.context(json=payload), patch.object(logs, '_audit_writer', self.writer):
            connection = logs.audit_connection(self.raw)
            connection.cursor().execute('INSERT INTO users (Name,Password) VALUES (%s,%s)', ('staff','hash-secret'))
            connection.commit()
            text = self.writer.write.call_args.args[0]
            for secret in ['plain-secret','key-secret','hidden-secret','hash-secret']:
                self.assertNotIn(secret, text)
            self.assertIn('staff', text)

    def test_batch_and_delete_alias_are_captured(self):
        with self.context(), patch.object(logs, '_audit_writer', self.writer):
            connection = logs.audit_connection(self.raw)
            cursor = connection.cursor()
            cursor.executemany('INSERT INTO quantity_log (quantity) VALUES (%s)', [(1,), (2,)])
            cursor.execute('DELETE omp FROM outSourcing_MoneyPayment AS omp JOIN outsourcing o ON o.id=omp.outsourcing_id WHERE o.contract_code=%s', ('26-TEST',))
            connection.commit()
            record = json.loads(self.writer.write.call_args.args[0].split(' | 내용: ', 1)[1])
            self.assertEqual(record['DB변경'][0]['값'], [[1],[2]])
            self.assertEqual(record['DB변경'][1]['테이블'], 'outsourcing_moneypayment')

    def test_audit_disk_failure_does_not_turn_committed_save_into_failure(self):
        with self.context(), patch.object(logs, '_audit_writer', self.writer), patch.object(logs, '_original_stderr', io.StringIO()) as errors:
            self.writer.write.side_effect = OSError('disk full')
            connection = logs.audit_connection(self.raw)
            connection.cursor().execute('UPDATE projects SET last_updated_at=NOW()')
            connection.commit()
            self.raw.commit.assert_called_once()
            self.assertIn('로그 저장 실패', errors.getvalue())

    def test_application_route_writes_runtime_and_committed_audit_files(self):
        code = '''
import logging
from unittest.mock import Mock, patch
logging.basicConfig(level=logging.INFO)
from app import app
raw = Mock()
raw.cursor.return_value.rowcount = 1
with app.test_client() as client, patch('pms.db.mysql.connector.connect', return_value=raw):
    with client.session_transaction() as user_session:
        user_session['user'] = {'name':'Tester', 'userID':'test-user'}
    payload = {'contractCode':'TEST-NO-REAL-WRITE', 'data':[{'progressRate':35, 'outsourcingCompany':'Test company'}]}
    response = client.post('/api/save_outsourcing_progress', json=payload)
    assert response.status_code == 200 and response.json['success']
    raw.commit.side_effect = RuntimeError('simulated failure')
    response = client.post('/api/save_outsourcing_progress', json=payload)
    assert response.status_code == 500
    logging.warning('captured-logging-warning')
    print('captured-console-line')
'''
        with tempfile.TemporaryDirectory() as folder:
            environment = {**os.environ, 'PMS_LOG_DIR': folder, 'PYTHONIOENCODING': 'utf-8', 'PMS_AUTO_MIGRATE': '0'}
            result = subprocess.run([sys.executable, '-c', code], env=environment,
                                    capture_output=True, text=True, encoding='utf-8', timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            runtime = ''.join(path.read_text(encoding='utf-8') for path in Path(folder).glob('pms_*.log'))
            self.assertIn('captured-console-line', runtime)
            self.assertIn('captured-logging-warning', runtime)
            self.assertIn('/api/save_outsourcing_progress', runtime)
            audit = ''.join(path.read_text(encoding='utf-8') for path in Path(folder).glob('audit_*.log')).splitlines()
            self.assertEqual(len(audit), 1)
            record = json.loads(audit[0].split(' | 내용: ', 1)[1])
            self.assertEqual(record['사용자'], 'Tester')
            self.assertEqual(record['항목'], '외주 진행률 저장')
            self.assertEqual(record['DB변경'][0]['값'], [35, 'TEST-NO-REAL-WRITE', 'Test company'])


if __name__ == '__main__':
    unittest.main()
