import importlib.util
from pathlib import Path
import types
import unittest
from unittest.mock import patch
import sys
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('probe', HERE / 'metadata-probe.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ProbeTests(unittest.TestCase):
    def test_only_explicit_metadata_mode(self):
        for args in ([], ['--execute'], ['--probe-metadata', '--role=postgres']):
            with self.assertRaises(ValueError):
                m.main(args)

    def test_parse_not_execute_and_fail_closed(self):
        raw = 'export PGHOST="db.' + m.plan.REF + '.supabase.co"\nexport PGUSER="cli_login_postgres"\nexport PGPASSWORD="' + 'z' * 32 + '"\n'
        self.assertEqual(m.parse_credentials(raw), 'z' * 32)
        for altered in (raw.replace(m.plan.REF, 'wrong'), raw.replace('cli_login_postgres', 'postgres'), raw.replace('z' * 32, '$(unsafe)')):
            with self.assertRaises(ValueError):
                m.parse_credentials(altered)

    def test_no_secret_from_process_error(self):
        for stderr, expected in [('ERROR: 42501\nSYNTHETIC_SECRET', 'SQLSTATE_42501'),
                                 ('anything SYNTHETIC_SECRET', 'PROCESS_NONZERO')]:
            with patch.object(m.subprocess, 'run', return_value=types.SimpleNamespace(returncode=1, stdout='SYNTHETIC_SECRET', stderr=stderr)):
                with self.assertRaises(ValueError) as error:
                    m.checked(['no-execution'])
                self.assertEqual(str(error.exception), expected)

    def test_sql_catalog_only_no_role_switch(self):
        sql = (HERE / 'metadata-probe.sql').read_text().lower()
        for forbidden in ('set role', 'pg_authid', 'rolpassword', 'copy ', 'insert ', 'update ', 'delete ', 'create ', 'alter ', 'drop ', 'from auth.', 'from public.', 'from turn_private.'):
            self.assertNotIn(forbidden, sql)
        self.assertIn('begin read only;', sql)
        self.assertTrue(sql.rstrip().endswith('rollback;'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
