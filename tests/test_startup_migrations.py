import unittest
from unittest.mock import Mock

from pms.ops.migrations import migrate, VERSION


class StartupMigrationTest(unittest.TestCase):
    def test_missing_column_is_added_and_baseline_only_is_cleared(self):
        connection = Mock()
        cursor = connection.cursor.return_value
        cursor.fetchone.side_effect = [(1,), None, None, (1,)]
        cursor.rowcount = 668
        self.assertEqual(migrate(connection), 668)
        statements = [call.args for call in cursor.execute.call_args_list]
        self.assertTrue(any('ADD COLUMN last_updated_at DATETIME NULL DEFAULT NULL' in args[0] for args in statements))
        update = next(args for args in statements if args[0].startswith('UPDATE projects'))
        self.assertEqual(update[1], ('2026-10-07 00:00:00',))
        self.assertIn('SET last_updated_at = NULL WHERE last_updated_at = %s', update[0])
        connection.commit.assert_called_once()
        connection.close.assert_called_once()

    def test_applied_version_does_not_reset_real_dates(self):
        connection = Mock()
        cursor = connection.cursor.return_value
        cursor.fetchone.side_effect = [(1,), (VERSION,), (1,)]
        self.assertEqual(migrate(connection), 0)
        self.assertFalse(any('UPDATE projects' in call.args[0] or 'ALTER TABLE' in call.args[0]
                             for call in cursor.execute.call_args_list))
        connection.commit.assert_not_called()

    def test_failure_rolls_back_does_not_mark_version_and_releases_lock(self):
        connection = Mock()
        cursor = connection.cursor.return_value
        cursor.fetchone.side_effect = [(1,), None, ('last_updated_at',), (1,)]
        def execute(sql, params=None):
            if sql.startswith('UPDATE projects'):
                raise RuntimeError('DB permission denied')
        cursor.execute.side_effect = execute
        with self.assertRaises(RuntimeError):
            migrate(connection)
        connection.rollback.assert_called_once()
        connection.commit.assert_not_called()
        self.assertFalse(any('INSERT INTO pms_schema_migrations' in call.args[0] for call in cursor.execute.call_args_list))
        self.assertTrue(any('RELEASE_LOCK' in call.args[0] for call in cursor.execute.call_args_list))
        connection.close.assert_called_once()

    def test_lock_timeout_does_not_change_database(self):
        connection = Mock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = (0,)
        with self.assertRaises(RuntimeError):
            migrate(connection)
        self.assertEqual(cursor.execute.call_count, 1)
        connection.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
