"""Only newly factory-created offline containers; never an existing PG."""
import importlib.util
import json
from pathlib import Path
import subprocess
import threading
import unittest
from unittest.mock import patch
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('adapter',HERE/'adapter.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ContainerSession(unittest.TestCase):
    def is_true(self,value):self.assertIs(value,True)
    def container(self):
        owner=m.SyntheticContainer()
        def cleanup():
            result=owner.close();self.is_true(result['containerRemoved'])
            if 'cleanup' in result:self.is_true(result['cleanup']);self.is_true(result['rootRemoved'])
        self.addCleanup(cleanup);return owner
    def test_typed_error_and_role_preserved(self):
        owner=self.container()
        result=owner.request('run',sql="do $$begin if current_user<>'qaw_diag_owner' or current_setting('application_name')<>'psql' then raise exception using errcode='42501',message='wrong context';end if;raise exception using errcode='P0001',message='42501 synthetic_secret';end$$;")
        self.assertEqual(result['firstError']['sqlstate'],'P0001')
        self.assertEqual(result['firstError']['provenance'],'PG_BACKEND_ERROR_RESPONSE_C_FIELD_ALLOWLIST')
        self.is_true(result['backendCommandStopped'])
        self.assertNotIn('synthetic_secret',json.dumps(result));self.assertNotIn('42501',json.dumps(result))
    def test_timeout_backend_exit(self):
        result=self.container().request('run',sql='select pg_sleep(10);',seconds=.4)
        self.assertEqual(result['status'],'INCOMPLETE_DEADLINE');self.is_true(result['backendCommandStopped'])
    def test_disconnect_is_not_stop_then_bound_cancel(self):
        result=self.container().request('disconnect')
        self.is_true(result['activeAfterDisconnect']);self.is_true(result['fence']['cancelSent']);self.is_true(result['fence']['backendStopped']);self.assertFalse(result['fence']['serverStopped'])
    def test_resistant_backend_requires_owned_postmaster_stop(self):
        result=self.container().request('resistant')
        self.is_true(result['activeAfterDisconnect']);self.is_true(result['fence']['serverStopped']);self.is_true(result['fence']['backendStopped'])
    def test_wrong_backend_refuses_then_correct_binding_stops(self):
        result=self.container().request('wrong-backend')
        self.assertEqual(result['rejected']['backendStopped'],'UNKNOWN');self.assertFalse(result['rejected']['cancelSent']);self.assertFalse(result['rejected']['serverStopped'])
        self.is_true(result['stillActiveAfterRefusal']);self.is_true(result['fence']['backendStopped'])
    def test_wrong_container_nonce_process_or_image_refuses_before_docker(self):
        owner=self.container()
        for field,value in [('container_id','0'*64),('nonce','0'*32),('image','sha256:'+'0'*64),('_process',object())]:
            old=getattr(owner,field);setattr(owner,field,value)
            try:
                with patch.object(m,'_docker') as docker:
                    with self.assertRaises(ValueError):owner.request('disconnect')
                    with self.assertRaises(ValueError):owner.close()
                    docker.assert_not_called()
            finally:setattr(owner,field,old)
        self.is_true(owner.request('run',sql='select 1;')['backendCommandStopped'])
    def test_server_nonce_mismatch_does_not_terminate_service(self):
        owner=self.container();r=m._receipt_for(owner)
        r['process'].stdin.write((json.dumps({'nonce':'wrong','op':'close'})+'\n').encode());r['process'].stdin.flush()
        with self.assertRaisesRegex(ValueError,'CONTAINER_SERVICE_FAILED'):m._read_reply(r,3)
        self.is_true(owner.request('run',sql='select 1;')['backendCommandStopped'])
    def test_unknown_reply_blocks_new_request_and_container_fence_removes(self):
        owner=self.container()
        with patch.object(m,'_read_reply',side_effect=ValueError('SYNTHETIC_REPLY_TIMEOUT')):
            with self.assertRaises(ValueError):owner.request('run',sql='select pg_sleep(10);',seconds=.4)
        with self.assertRaisesRegex(ValueError,'CONTAINER_INCOMPLETE_REQUEST_RETAINED'):owner.request('run',sql='select 1;')
        result=owner.close();self.is_true(result['containerRemoved']);self.assertEqual(result['backendCleanup'],'UNKNOWN')
    def test_epoch_conflict_never_removes_container(self):
        owner=self.container();actual=m._docker
        def changed(r,args):
            out=actual(r,args)
            if args[0]=='inspect':
                info=json.loads(out);info[0]['State']['StartedAt']='foreign';return json.dumps(info).encode()
            return out
        with patch.object(m,'_docker',side_effect=changed) as calls:
            with self.assertRaisesRegex(ValueError,'CONTAINER_EPOCH_CONFLICT'):owner.close()
            self.assertFalse(any(call.args[1][0]=='rm' for call in calls.call_args_list))

    def test_incompatible_runtime_handshake_cleans_only_created_container(self):
        created=[];actual=m._docker
        def track(r,args):
            out=actual(r,args)
            if args[0]=='create':created.append(out.decode().strip())
            return out
        with patch.object(m,'_docker',side_effect=track),patch.object(m,'_read_reply',return_value={'ready':True}):
            with self.assertRaisesRegex(ValueError,'SERVER_CAPABILITY_MISSING'):m.SyntheticContainer()
        self.assertEqual(len(created),1)
        result=subprocess.run(['docker','inspect',created[0]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        self.assertEqual(result.returncode,1)

class FactoryNegatives(unittest.TestCase):
    def test_image_preflight_rejects_before_create(self):
        with patch.object(m,'_docker',return_value=json.dumps([{'Id':'wrong'}]).encode()) as calls:
            with self.assertRaisesRegex(ValueError,'IMAGE_PREFLIGHT_FAILED'):m.SyntheticContainer()
            self.assertEqual([call.args[1][0] for call in calls.call_args_list],['image'])
    def test_subclass_and_unregistered_cannot_signal_or_create(self):
        class Forged(m.SyntheticContainer):
            def __init__(self):pass
        for owner in (Forged(),object.__new__(m.SyntheticContainer)):
            with patch.object(m,'_call') as calls:
                with self.assertRaises(ValueError):m.SyntheticContainer.close(owner)
                calls.assert_not_called()
        class Subclass(m.SyntheticContainer):pass
        with patch.object(m,'_call') as calls:
            with self.assertRaises(ValueError):Subclass()
            calls.assert_not_called()

if __name__=='__main__':unittest.main(verbosity=2)
