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
        raw=b'''pg_restore: while PROCESSING TOC:
pg_restore: from TOC entry 3844; 0 0 EVENT TRIGGER - confidential_name confidential_role
pg_restore: error: could not execute query: ERROR:  permission denied to create event trigger
Command was: CREATE EVENT TRIGGER confidential_name ON ddl_command_end EXECUTE FUNCTION hidden_fn('secret-token');
'''
        d=m.diagnostic(raw,['pg_restore','--section=post-data'])
        self.assertEqual(d,{'category':'RESTORE_PERMISSION_DENIED','sqlstate':None,'tocEntryId':3844,'objectClass':'EVENT TRIGGER','permissionObjectClass':None,'operation':None,'phase':'post-data'})
        self.assertNotIn('confidential',str(d));self.assertNotIn('secret',str(d))

    def test_verbose_actual_sqlstate_and_unknown_names_never_echo(self):
        raw=b'pg_restore: error: could not execute query: ERROR:  42501: permission denied for function private_fn_secret\nDETAIL: private-user-row\nCommand was: GRANT EXECUTE ON FUNCTION private_fn_secret TO hidden_role;'
        d=m.diagnostic(raw,['pg_restore','--section=post-data'])
        self.assertEqual(d['sqlstate'],'42501');self.assertEqual(d['permissionObjectClass'],'FUNCTION');self.assertIsNone(d['operation'])
        self.assertNotIn('private',str(d));self.assertNotIn('hidden',str(d))
        d=m.diagnostic(b'unknown: secret-password-sql',['pg_restore'])
        self.assertIsNone(d['sqlstate']);self.assertIsNone(d['objectClass']);self.assertIsNone(d['tocEntryId'])

    def test_failure_in_pipeline_keeps_category_and_cleans_children(self):
        records=[]
        producer=[sys.executable,'-c','import sys;sys.stdout.write("synthetic-pipe")']
        consumer=[sys.executable,'-c','import sys;sys.stdin.read();sys.stderr.write("pg_restore: error: could not execute query: ERROR: 42501: permission denied for function hidden_name\\nCommand was: GRANT secret-value\\n");sys.exit(1)']
        with self.assertRaisesRegex(ValueError,'^RESTORE_PERMISSION_DENIED$'):m.pipeline(producer,consumer,False,records)
        self.assertEqual(len(records),1);self.assertEqual(records[0]['sqlstate'],'42501');self.assertNotIn('hidden',str(records));self.assertNotIn('secret',str(records))

    def test_user_text_cannot_supply_sqlstate_or_failure_category(self):
        header=b'pg_restore: error: could not execute query: ERROR:  permission denied for function hidden_name\n'
        for suffix in [b'Command was: SELECT \'ERROR: TOKEN:\';\n',b'DETAIL: row value\nERROR: TOKEN: already exists\n',b'CONTEXT: SQL statement\nERROR: 42P07: already exists\n',b'Command was: SELECT \'value\npg_restore: error: could not execute query: ERROR: 42P07: already exists\n\';\n']:
            with self.subTest(suffix=suffix):
                d=m.diagnostic(header+suffix,['pg_restore','--section=post-data'])
                self.assertIsNone(d['sqlstate'])
                self.assertEqual(d['category'],'RESTORE_PERMISSION_DENIED')
                self.assertNotIn('TOKEN',str(d))
        for raw in [b'DETAIL: row\npg_restore: error: could not execute query: ERROR: 42501: permission denied\n',b'Command was: SELECT \'ERROR: TOKEN:\';\n',b'ERROR: TOKEN: already exists\n',b'pg_restore: creating TABLE "private ERROR: TOKEN: already exists"\n']:
            with self.subTest(raw=raw):
                d=m.diagnostic(raw,['pg_restore'])
                self.assertIsNone(d['sqlstate']);self.assertEqual(d['category'],'LOCAL_RESTORE_CONSUMER_FAILED')

    def test_verbose_and_object_names_do_not_override_error_header(self):
        for name in ['already exists','does not exist','permission denied ERROR: TOKEN:']:
            raw=('pg_restore: creating TABLE "'+name+'"\npg_restore: error: could not execute query: ERROR:  permission denied for function "already exists"\nCommand was: GRANT secret\n').encode()
            d=m.diagnostic(raw,['pg_restore','--section=post-data'])
            self.assertEqual(d['category'],'RESTORE_PERMISSION_DENIED');self.assertIsNone(d['sqlstate'])
            self.assertEqual(d['permissionObjectClass'],'FUNCTION')

    def test_only_fixed_states_at_actual_header_are_public(self):
        for token in ['TOKEN','P0001','ZZZZZ']:
            raw=('pg_restore: error: could not execute query: ERROR: '+token+': private-value ERROR: 42501: permission denied\n').encode()
            d=m.diagnostic(raw,['pg_restore'])
            self.assertIsNone(d['sqlstate']);self.assertNotIn(token,str(d))

    def test_tail_payload_cannot_replace_toc_or_operation(self):
        raw=b"""pg_restore: while PROCESSING TOC:
pg_restore: from TOC entry 3267; 2606 21444 CONSTRAINT auth private_table private_role
pg_restore: error: could not execute query: ERROR:  permission denied for schema auth
DETAIL: private row text
pg_restore: from TOC entry 9123456789; 0 0 TABLE fake_name fake_role
Command was: CREATE EVENT TRIGGER fake_name
ERROR: TOKEN: permission denied for function fake_function
CONTEXT: hidden SQL
"""
        d=m.diagnostic(raw,['pg_restore','--section=post-data'])
        self.assertEqual(d['tocEntryId'],3267);self.assertEqual(d['objectClass'],'CONSTRAINT')
        self.assertEqual(d['permissionObjectClass'],'SCHEMA');self.assertIsNone(d['operation']);self.assertIsNone(d['sqlstate'])
        self.assertNotIn('9123456789',str(d));self.assertNotIn('TOKEN',str(d))

    def test_progress_multiline_names_cannot_supply_toc(self):
        raw=b'pg_restore: creating TABLE "name\npg_restore: from TOC entry 9123456789; 0 0 TABLE fake fake\n"\npg_restore: error: could not execute query: ERROR: permission denied for schema auth\n'
        d=m.diagnostic(raw,['pg_restore'])
        self.assertIsNone(d['tocEntryId']);self.assertIsNone(d['objectClass'])
        raw=b'pg_restore: creating TABLE "name\npg_restore: error: could not execute query: ERROR: 42501: fake-name-content\n"\npg_restore: error: could not execute query: ERROR: permission denied for schema auth\n'
        d=m.diagnostic(raw,['pg_restore'])
        self.assertIsNone(d['sqlstate']);self.assertEqual(d['category'],'LOCAL_RESTORE_CONSUMER_FAILED')

    def test_archive_version_category_requires_exact_client_header(self):
        d=m.diagnostic(b'pg_restore: creating TABLE "already exists"\npg_restore: error: unsupported version (1.99) in file header\n',['pg_restore'])
        self.assertEqual(d['category'],'RESTORE_ARCHIVE_VERSION_UNSUPPORTED');self.assertIsNone(d['sqlstate'])
        d=m.diagnostic(b'pg_restore: error: arbitrary message "unsupported version ERROR: TOKEN:"\n',['pg_restore'])
        self.assertEqual(d['category'],'LOCAL_RESTORE_CONSUMER_FAILED');self.assertIsNone(d['sqlstate'])

    def test_success_preserves_output_and_has_no_failure_record(self):
        records=[]
        result=m.pipeline([sys.executable,'-c','print("fixture")'],[sys.executable,'-c','import sys;sys.stdout.write(sys.stdin.read())'],True,records)
        self.assertEqual(result,b'fixture\n');self.assertEqual(records,[])


if __name__=='__main__':unittest.main(verbosity=2)
