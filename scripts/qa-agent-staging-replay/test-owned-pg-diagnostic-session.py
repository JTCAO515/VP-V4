"""Physical tests use only newly created nonce-private PG17, never system/shared PG."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('session',HERE/'owned-pg-diagnostic-session.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)


class OwnedSession(unittest.TestCase):
    def server(self):
        owner=m.OwnedSyntheticServer()
        def close_and_verify():
            owner.close();self.assertTrue(owner.cleanup_confirmed);self.assertFalse(owner.root.exists())
        self.addCleanup(close_and_verify);return owner
    def disconnected(self,owner,sql,seconds=.3):
        session=m.DiagnosticSession(owner,seconds=seconds);session.start()
        child=subprocess.Popen(owner.command(session.directory),env=owner.env,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        child.communicate(input=sql.encode(),timeout=3);session.thread.join(timeout=2)
        self.assertFalse(session.thread.is_alive());self.assertIsNotNone(session.proxy.binding)
        return session
    def test_socket_close_does_not_stop_backend_but_bound_cancel_confirms_exit(self):
        owner=self.server()
        session=self.disconnected(owner,'select pg_sleep(10);')
        binding=session.proxy.binding
        self.assertIsNotNone(owner.matching_backend(binding)) # actual RED mechanism
        result=owner.fence(binding)
        self.assertTrue(result['ownershipVerified']);self.assertTrue(result['cancelSent'])
        self.assertIs(result['backendStopped'],True);self.assertFalse(result['serverStopped'])
        self.assertIsNone(owner.backend(binding['pid']))
        self.assertNotIn('cancelKey',json.dumps(result))
    def test_cancel_resistant_backend_requires_exclusive_owned_postmaster_fence(self):
        owner=self.server()
        owner.setup_synthetic("create function public.synthetic_resist_cancel() returns void language plpgsql as $$begin loop begin perform pg_sleep(10);exception when query_canceled then null;end;end loop;end$$;")
        session=self.disconnected(owner,'select public.synthetic_resist_cancel();')
        self.assertIsNotNone(owner.matching_backend(session.proxy.binding))
        result=owner.fence(session.proxy.binding)
        self.assertTrue(result['cancelSent']);self.assertTrue(result['serverStopped'])
        self.assertIs(result['backendStopped'],True)
        self.assertFalse(owner.is_live())
    def test_foreign_nonce_server_epoch_or_backend_lifetime_never_signals(self):
        owner=self.server();session=self.disconnected(owner,'select pg_sleep(10);');binding=session.proxy.binding
        for field,value in [('nonce','foreign'),('serverIdentity',{'systemId':'foreign'}),('started','foreign-start')]:
            old=binding.facts[field];binding.facts[field]=value
            try:
                result=owner.fence(binding)
                self.assertEqual(result['backendStopped'],'UNKNOWN');self.assertFalse(result['cancelSent']);self.assertFalse(result['serverStopped'])
            finally:binding.facts[field]=old
            self.assertTrue(owner.is_live());self.assertIsNotNone(owner.matching_backend(binding))
        result=owner.fence(binding);self.assertIs(result['backendStopped'],True)
    def test_typed_failure_preserves_protocol_provenance_and_no_secret_output(self):
        owner=self.server()
        result=m.DiagnosticSession(owner).run_synthetic("do $$begin raise exception using errcode='P0001',message='42501: ERROR: synthetic_secret';end$$;")
        self.assertEqual(result['firstError']['sqlstate'],'P0001')
        self.assertEqual(result['firstError']['provenance'],'PG_BACKEND_ERROR_RESPONSE_C_FIELD_ALLOWLIST')
        self.assertIs(result['backendFence']['backendStopped'],True)
        text=json.dumps(result);self.assertNotIn('synthetic_secret',text);self.assertNotIn('cancelKey',text);self.assertNotIn('42501',text)
    def test_foreign_server_binding_never_cancels_or_stops_either_server(self):
        first=self.server();second=self.server();session=self.disconnected(first,'select pg_sleep(10);')
        result=second.fence(session.proxy.binding)
        self.assertEqual(result['backendStopped'],'UNKNOWN');self.assertFalse(result['cancelSent']);self.assertFalse(result['serverStopped'])
        self.assertTrue(first.is_live());self.assertTrue(second.is_live())
        self.assertIsNotNone(first.matching_backend(session.proxy.binding))
        self.assertIs(first.fence(session.proxy.binding)['backendStopped'],True)
    def test_orchestrated_timeout_confirms_backend_stop_without_fabricated_error(self):
        owner=self.server();result=m.DiagnosticSession(owner,seconds=.3).run_synthetic('select pg_sleep(10);')
        self.assertIsNone(result['firstError']);self.assertEqual(result['status'],'INCOMPLETE_DEADLINE')
        self.assertIs(result['backendCommandStopped'],True);self.assertTrue(result['backendFence']['ownershipVerified'])
    def test_original_role_and_application_name_not_rewritten(self):
        owner=self.server()
        result=m.DiagnosticSession(owner).run_synthetic("do $$begin if current_user<>'qaw_diag_owner' or current_setting('application_name')<>'psql' then raise exception 'synthetic context changed';end if;end$$;")
        self.assertIsNone(result['firstError']);self.assertEqual(result['status'],'NO_TYPED_ERROR_OBSERVED');self.assertIs(result['backendCommandStopped'],True)

    def test_no_shared_socket_or_parallel_session_attachment(self):
        owner=self.server()
        with self.assertRaisesRegex(ValueError,'OWN_SOCKET_PATH_REQUIRED'):owner.command(Path('/private/tmp'))
        session=m.DiagnosticSession(owner)
        with self.assertRaisesRegex(ValueError,'OWN_SERVER_SESSION_ALREADY_ACTIVE'):m.DiagnosticSession(owner)
        self.assertTrue(owner.is_live())

    def test_unknown_fence_preserves_active_session_and_blocks_next_session(self):
        owner=self.server();session=self.disconnected(owner,'select pg_sleep(10);');identity=owner.identity
        owner.identity={**identity,'systemId':'foreign'}
        try:
            result=session.finish()
            self.assertEqual(result['status'],'INCOMPLETE_BACKEND_FENCE');self.assertEqual(result['backendCommandStopped'],'UNKNOWN')
            self.assertIsNotNone(owner.active_session)
            with self.assertRaises(ValueError):m.DiagnosticSession(owner)
        finally:owner.identity=identity
        self.assertIs(owner.fence(session.proxy.binding)['backendStopped'],True)

    def test_control_identity_mismatch_preserves_unknown_without_process_kill(self):
        owner=self.server();session=self.disconnected(owner,'select pg_sleep(10);');binding=session.proxy.binding
        identity=owner.identity;owner.identity={**identity,'systemId':'foreign'}
        try:
            result=owner.fence(binding);self.assertEqual(result['backendStopped'],'UNKNOWN')
            self.assertFalse(result['cancelSent']);self.assertTrue(owner.is_live())
        finally:owner.identity=identity
        self.assertIs(owner.fence(binding)['backendStopped'],True)


if __name__=='__main__':unittest.main(verbosity=2)
