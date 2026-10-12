"""Verify project save timestamps commit and roll back with saved data."""
import unittest
from unittest.mock import Mock, patch

from flask import Flask

from pms.blueprints import PMS_Business_Detail as detail
from pms.services.project_updates import touch_projects


class ProjectUpdateTest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(detail.bp)
        self.connection = Mock()
        self.cursor = self.connection.cursor.return_value
        self.cursor.fetchone.return_value = (1,)
        self.payload = dict(contract_code='26-TEST', first_dept='GIS', second_dept='',
                            first_layout_active=True, second_layout_active=False,
                            active_Layout_count=1)

    def save(self):
        with patch.object(detail, 'create_connection', return_value=self.connection):
            return self.app.test_client().post('/api/save_layout', json=self.payload)

    def test_success_touches_before_commit(self):
        response = self.save()
        self.assertTrue(response.json['success'])
        calls = self.connection.mock_calls
        timestamp = next(i for i, call in enumerate(calls)
                         if call[0] == 'cursor().execute' and 'last_updated_at' in call.args[0])
        commit = next(i for i, call in enumerate(calls) if call[0] == 'commit')
        self.assertLess(timestamp, commit)
        self.assertEqual(calls[timestamp].args[1], ('26-TEST',))
        self.connection.rollback.assert_not_called()

    def test_failed_save_does_not_touch_or_commit(self):
        def execute(sql, params):
            if 'UPDATE state' in sql:
                raise RuntimeError('save failed')
        self.cursor.execute.side_effect = execute
        self.assertFalse(self.save().json['success'])
        self.connection.commit.assert_not_called()
        self.connection.rollback.assert_called_once()
        self.assertFalse(any('last_updated_at' in call.args[0]
                             for call in self.cursor.execute.call_args_list))

    def test_timestamp_failure_rolls_back_save(self):
        def execute(sql, params):
            if 'last_updated_at' in sql:
                raise RuntimeError('timestamp failed')
        self.cursor.execute.side_effect = execute
        self.assertFalse(self.save().json['success'])
        self.connection.commit.assert_not_called()
        self.connection.rollback.assert_called_once()

    def test_multiple_projects_are_deduplicated_and_parameterized(self):
        cursor = Mock()
        touch_projects(cursor, [' B ', 'A', 'B', None, '', "C'quoted"])
        sql, params = cursor.execute.call_args.args
        self.assertEqual(params, ('A', 'B', "C'quoted"))
        self.assertNotIn("C'quoted", sql)
        self.assertIn('UTC_TIMESTAMP() + INTERVAL 9 HOUR', sql)

    def test_project_id_and_empty_codes(self):
        cursor = Mock()
        touch_projects(cursor, None)
        cursor.execute.assert_not_called()
        touch_projects(cursor, project_id=42)
        self.assertEqual(cursor.execute.call_args.args[1], (42,))
        self.assertIn('WHERE ProjectID = %s', cursor.execute.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
