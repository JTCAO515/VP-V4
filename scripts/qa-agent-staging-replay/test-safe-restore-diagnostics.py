import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('diag',HERE/'safe-restore-diagnostics.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)


class SafeDiagnostics(unittest.TestCase):
    def test_permission_context_is_allowlisted_without_sql_or_names(self):
        raw=b'''pg_restore: from TOC entry 3844; 0 0 EVENT TRIGGER - confidential_name confidential_role
pg_restore: error: could not execute query: ERROR:  permission denied to create event trigger
Command was: CREATE EVENT TRIGGER confidential_name ON ddl_command_end EXECUTE FUNCTION hidden_fn('secret-token');
'''
        d=m.diagnostic(raw,['pg_restore','--section=post-data'])
        self.assertEqual(d,{'category':'RESTORE_PERMISSION_DENIED','sqlstate':None,'tocEntryId':3844,'objectClass':'EVENT TRIGGER','permissionObjectClass':None,'operation':'CREATE EVENT TRIGGER','phase':'post-data'})
        self.assertNotIn('confidential',str(d));self.assertNotIn('secret',str(d))

    def test_verbose_actual_sqlstate_and_unknown_names_never_echo(self):
        raw=b'pg_restore: error: could not execute query: ERROR:  42501: permission denied for function private_fn_secret\nDETAIL: private-user-row\nCommand was: GRANT EXECUTE ON FUNCTION private_fn_secret TO hidden_role;'
        d=m.diagnostic(raw,['pg_restore','--section=post-data'])
        self.assertEqual(d['sqlstate'],'42501');self.assertEqual(d['permissionObjectClass'],'FUNCTION');self.assertEqual(d['operation'],'GRANT')
        self.assertNotIn('private',str(d));self.assertNotIn('hidden',str(d))
        d=m.diagnostic(b'unknown: secret-password-sql',['pg_restore'])
        self.assertIsNone(d['sqlstate']);self.assertIsNone(d['objectClass']);self.assertIsNone(d['tocEntryId'])

    def test_failure_in_pipeline_keeps_category_and_cleans_children(self):
        records=[]
        producer=[sys.executable,'-c','import sys;sys.stdout.write("synthetic-pipe")']
        consumer=[sys.executable,'-c','import sys;sys.stdin.read();sys.stderr.write("ERROR: 42501: permission denied for function hidden_name\\nCommand was: GRANT secret-value\\n");sys.exit(1)']
        with self.assertRaisesRegex(ValueError,'^RESTORE_PERMISSION_DENIED$'):m.pipeline(producer,consumer,False,records)
        self.assertEqual(len(records),1);self.assertEqual(records[0]['sqlstate'],'42501');self.assertNotIn('hidden',str(records));self.assertNotIn('secret',str(records))

    def test_success_preserves_output_and_has_no_failure_record(self):
        records=[]
        result=m.pipeline([sys.executable,'-c','print("fixture")'],[sys.executable,'-c','import sys;sys.stdout.write(sys.stdin.read())'],True,records)
        self.assertEqual(result,b'fixture\n');self.assertEqual(records,[])


if __name__=='__main__':unittest.main(verbosity=2)
