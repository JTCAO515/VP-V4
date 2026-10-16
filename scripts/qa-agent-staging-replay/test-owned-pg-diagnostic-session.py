"""Physical tests use only newly created nonce-private PG17, never system/shared PG."""
import importlib.util
import gc
import weakref
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

    def test_replaced_process_and_identity_reject_every_signal_entry(self):
        owner=self.server()
        class FakeProcess:
            def __init__(self):self.signals=[]
            def poll(self):return None
            def send_signal(self,value):self.signals.append(value)
            def wait(self,timeout):return 0
        fake=FakeProcess();original=owner._process;identity=owner.identity
        for change in ('process','identity','method'):
            with self.subTest(change=change):
                if change=='process':owner._process=fake
                elif change=='identity':owner.identity={**identity,'systemId':'foreign'}
                else:owner.verify=lambda *args:None
                try:
                    self.assertEqual(owner.fence(None)['backendStopped'],'UNKNOWN')
                    for operation in (lambda:owner.close(),lambda:owner._construction_cleanup(),lambda:m.DiagnosticSession(owner),lambda:m.BoundProxy(owner,None,None)):
                        with self.assertRaises(ValueError):operation()
                    self.assertEqual(fake.signals,[])
                    self.assertIsNone(original.poll())
                finally:
                    owner._process=original;owner.identity=identity
                    owner.__dict__.pop('verify',None)

    def test_registered_startup_failure_reclaims_original_child(self):
        children=[];popen=m.subprocess.Popen
        def track(*args,**kwargs):
            child=popen(*args,**kwargs)
            if str(m.PG/'postgres')==args[0][0] and args[0][1]=='-D':children.append((child,Path(args[0][2]).parent))
            return child
        with patch.object(m.subprocess,'Popen',side_effect=track),patch.object(m.OwnedSyntheticServer,'_read_identity',side_effect=ValueError('SYNTHETIC_STARTUP_FAILURE')):
            with self.assertRaisesRegex(ValueError,'SYNTHETIC_STARTUP_FAILURE'):m.OwnedSyntheticServer()
        self.assertEqual(len(children),1)
        self.assertIsNotNone(children[0][0].poll());self.assertFalse(children[0][1].exists())

    def test_writable_closed_flag_cannot_authorize_live_directory_removal(self):
        owner=self.server();owner.closed=True
        try:
            with patch.object(m.shutil,'rmtree') as removal:
                try:owner.close()
                except ValueError:pass
                removal.assert_not_called()
            self.assertTrue(owner.root.exists());self.assertIsNone(owner._process.poll())
            self.assertFalse(owner.cleanup_confirmed)
        finally:owner.closed=False;owner.cleanup_confirmed=False

    def test_stopped_child_wrong_nonce_or_replaced_root_cannot_authorize_removal(self):
        owner=self.server();m._stop_factory_child(owner,5)
        marker=owner.marker.read_bytes()
        owner.marker.write_text('{"nonce":"foreign"}')
        try:
            with patch.object(m.shutil,'rmtree') as removal:
                try:owner.close()
                except ValueError:pass
                removal.assert_not_called()
        finally:owner.marker.write_bytes(marker);owner.cleanup_confirmed=False
        moved=owner.root.with_name(owner.root.name+'-held');owner.root.rename(moved);owner.root.mkdir(mode=0o700)
        (owner.root/'owner.json').write_bytes(marker);(owner.root/'owner.json').chmod(0o600)
        try:
            with patch.object(m.shutil,'rmtree') as removal:
                try:owner.close()
                except ValueError:pass
                removal.assert_not_called()
        finally:
            (owner.root/'owner.json').unlink();owner.root.rmdir();moved.rename(owner.root);owner.cleanup_confirmed=False

    def test_gc_of_registered_owner_never_recursively_deletes_directory(self):
        owner=m.OwnedSyntheticServer();root=owner.root
        m._stop_factory_child(owner,5) # no live process survives this GC test
        reference=weakref.ref(owner)
        try:
            del owner;gc.collect()
            self.assertIsNone(reference());self.assertTrue(root.exists())
        finally:
            # This test retains exact ownership of its stopped fixture root.
            if root.exists():m.shutil.rmtree(root)

    def test_explicit_factory_bootstrap_and_absolute_budget_reused(self):
        owner=m.OwnedSyntheticServer(bootstrap_admin='synthetic_original_admin')
        self.addCleanup(owner.close)
        end=m.datetime.now(m.timezone.utc)+m.timedelta(seconds=3)
        budget=m.deadline.Budget(time.monotonic()+3,reserve=0,wall_end=end)
        original=(budget.window_end,budget.data_end,budget.wall_end)
        session=m.DiagnosticSession(owner,budget=budget)
        self.assertIs(session.budget,budget)
        result=session.run_synthetic("do $$begin if current_user<>'synthetic_original_admin' then raise exception using errcode='42501';end if;end$$;")
        self.assertIsNone(result['firstError']);self.assertIs(result['backendCommandStopped'],True)
        self.assertEqual((budget.window_end,budget.data_end,budget.wall_end),original)
        budget.expired=True;before=set(owner.root.iterdir())
        with self.assertRaises(m.deadline.WindowExpired):m.DiagnosticSession(owner,budget=budget)
        self.assertIsNone(owner.active_session);self.assertEqual(set(owner.root.iterdir()),before)

    def test_bad_factory_settings_cannot_create_process(self):
        with patch.object(m.subprocess,'Popen') as spawn:
            with self.assertRaises(ValueError):m.OwnedSyntheticServer(bootstrap_admin='bad role')
            with self.assertRaises(ValueError):m.OwnedSyntheticServer(locale_options=('--pgdata=/foreign',))
            spawn.assert_not_called()


class FactoryProvenance(unittest.TestCase):
    def test_unregistered_subclass_never_signals_during_construction_cleanup(self):
        class FakeProcess:
            def __init__(self):self.signals=[]
            def poll(self):return None
            def send_signal(self,value):self.signals.append(value)
            def wait(self,timeout):return 0
        class Forged(m.OwnedSyntheticServer):
            def __init__(self):pass
            def verify(self,*args):pass
        owner=Forged();fake=FakeProcess();owner._process=fake
        with tempfile.TemporaryDirectory() as directory:
            owner.tmp=tempfile.TemporaryDirectory(dir=directory)
            try:m.OwnedSyntheticServer._construction_cleanup(owner)
            except ValueError:pass
        self.assertEqual(fake.signals,[])

    def test_forged_exact_type_and_subclass_refuse_all_public_entries(self):
        class Forged(m.OwnedSyntheticServer):
            def __init__(self):pass
            def verify(self,*args):pass
            def matching_backend(self,*args):return {'state':'active'}
        class FakeProcess:
            def __init__(self):self.signals=[]
            def poll(self):return None
            def send_signal(self,value):self.signals.append(value)
            def wait(self,timeout):return 0
        for owner in (Forged(),object.__new__(m.OwnedSyntheticServer)):
            owner.lifecycle_lock=threading.RLock();fake=FakeProcess();owner._process=fake
            owner.tmp=tempfile.TemporaryDirectory();owner.closed=False
            try:
                self.assertEqual(m.OwnedSyntheticServer.fence(owner,None)['backendStopped'],'UNKNOWN')
                for operation in (lambda:m.OwnedSyntheticServer.close(owner),lambda:m.OwnedSyntheticServer._construction_cleanup(owner),lambda:m.DiagnosticSession(owner),lambda:m.BoundProxy(owner,None,None)):
                    with self.assertRaises(ValueError):operation()
                self.assertEqual(fake.signals,[])
            finally:owner.tmp.cleanup()

    def test_subclass_cannot_acquire_receipt_by_calling_factory_initializer(self):
        class Subclass(m.OwnedSyntheticServer):pass
        with patch.object(m.subprocess,'Popen') as popen:
            with self.assertRaisesRegex(ValueError,'OWN_FACTORY_EXACT_TYPE_REQUIRED'):Subclass()
            popen.assert_not_called()


if __name__=='__main__':unittest.main(verbosity=2)
