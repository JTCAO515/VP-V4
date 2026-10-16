"""Synthetic canaries and real local pipes only; no PG/material/credentials."""
from datetime import datetime,timezone,timedelta
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

h=load('host_hints_test',ROOT/'host-permission-diagnostics.py')
b=load('bridge_hints_test',ROOT/'container-diagnostic/restore/bridge.py')
CANARY='PRIVATE_CANARY_97a1'
FRAME=('pg_restore: while PROCESSING TOC:\npg_restore: from TOC entry 712; 1 2 INDEX public '+CANARY+' '+CANARY+'\npg_restore: error: could not execute query: ERROR: permission denied for schema '+CANARY+'\nDETAIL: '+CANARY+'\nCommand was: ALTER TABLE '+CANARY+';\n').encode()
TYPED={'sqlstate':'42501','provenance':'PG_BACKEND_ERROR_RESPONSE_C_FIELD_ALLOWLIST'}

class HostHints(unittest.TestCase):
    def test_canary_frame_is_hint_only_and_c_remains_authority(self):
        value=h.summarize(FRAME,True,False,TYPED)
        self.assertEqual(value['typedPermissionClass'],'INSUFFICIENT_PRIVILEGE')
        self.assertEqual(value['objectClass'],'INDEX');self.assertEqual(value['permissionObjectClass'],'SCHEMA')
        self.assertFalse(value['clientHintsCorrelatedToTypedError'])
        self.assertEqual(value['commandClass'],'UNKNOWN_NOT_OBSERVED')
        self.assertEqual(value['failurePrivilegeContext'],'UNKNOWN_NOT_OBSERVED_AT_FAILURE')
        self.assertNotIn(CANARY,json.dumps(value))
        forged=h.summarize(FRAME,True,False,{**TYPED,'sqlstate':'P0001'})
        self.assertEqual(forged['typedPermissionClass'],'UNKNOWN')
    def test_ambiguous_frame_never_invents_object_or_context(self):
        for raw in (b'',FRAME+FRAME,FRAME.replace(b'INDEX public',b'INDEX "bad\nname"'),CANARY.encode()):
            value=h.summarize(raw,True,False,TYPED)
            self.assertEqual(value['clientHintStatus'],'UNKNOWN_FRAME')
            self.assertIsNone(value['objectClass']);self.assertNotIn(CANARY,json.dumps(value))
    def test_valid_permission_frame_without_toc_keeps_finite_hint(self):
        raw=('pg_restore: error: could not execute query: ERROR: permission denied for schema '+CANARY+'\nCommand was: ALTER TABLE '+CANARY+';\n').encode()
        value=h.summarize(raw,True,False,TYPED)
        self.assertEqual(value['clientHintStatus'],'CLIENT_FRAME_HINT_AVAILABLE_NO_TOC')
        self.assertEqual(value['clientFrameClass'],'VALID_ERROR_WITHOUT_TOC')
        self.assertEqual(value['clientErrorCategory'],'RESTORE_PERMISSION_DENIED')
        self.assertEqual(value['permissionObjectClass'],'SCHEMA');self.assertIsNone(value['tocEntryId'])
        self.assertFalse(value['clientHintsCorrelatedToTypedError']);self.assertNotIn(CANARY,json.dumps(value))
    def test_empty_rejected_and_unclassified_frames_are_distinct_unknowns(self):
        unclassified=('pg_restore: error: could not execute query: ERROR: '+CANARY+'\n').encode()
        for raw,expected in ((b'','EMPTY'),(FRAME+FRAME,'REJECTED'),(unclassified,'VALID_ERROR_WITHOUT_TOC')):
            value=h.summarize(raw,True,False,TYPED)
            self.assertEqual(value['clientFrameClass'],expected)
            self.assertIsNone(value['permissionObjectClass']);self.assertNotIn(CANARY,json.dumps(value))
    def test_invalid_encoding_never_yields_partial_hints(self):
        value=h.summarize(FRAME+b'\xff',True,False,TYPED)
        self.assertEqual(value['clientFrameClass'],'INVALID_ENCODING');self.assertIsNone(value['objectClass'])
    def test_no_toc_client_hint_cannot_spoof_typed_permission(self):
        raw=('pg_restore: error: could not execute query: ERROR: permission denied for schema '+CANARY+'\n').encode()
        value=h.summarize(raw,True,False,{**TYPED,'sqlstate':'P0001'})
        self.assertEqual(value['typedPermissionClass'],'UNKNOWN')
        self.assertEqual(value['permissionObjectClass'],'SCHEMA')
        self.assertFalse(value['clientHintsCorrelatedToTypedError'])
        self.assertEqual(value['failurePrivilegeContext'],'UNKNOWN_NOT_OBSERVED_AT_FAILURE')
        self.assertEqual(value['version'],'host-permission-hints/2')

    def test_nonfailed_client_does_not_publish_forged_frame_hint(self):
        value=h.summarize(FRAME,True,False,None,client_failed=False)
        self.assertEqual(value['clientHintStatus'],'NOT_FAILED_NO_CLIENT_HINT')
        self.assertIsNone(value['objectClass']);self.assertEqual(value['typedPermissionClass'],'UNKNOWN')

    def test_truncated_and_incomplete_remain_unknown(self):
        for raw,complete,overflow,status in [(FRAME,False,False,'UNKNOWN_INCOMPLETE'),(FRAME,True,True,'UNKNOWN_TRUNCATED'),(b'x'*(h.LIMIT+1),True,False,'UNKNOWN_TRUNCATED')]:
            value=h.summarize(raw,complete,overflow,TYPED)
            self.assertEqual(value['clientHintStatus'],status);self.assertIsNone(value['tocEntryId'])
    def test_live_data_deadline_does_not_prove_cleanup_deadline_live(self):
        # Read-only proof of an existing shared-Budget limitation; no reset/fix.
        clock=[1000.0]
        budget=b.deadline.Budget(4600,clock=lambda:clock[0])
        self.assertEqual(budget.cleanup_timeout(60),60)
        clock[0]=1061
        budget.check()
        with self.assertRaisesRegex(ValueError,'OWNED_CLEANUP_BUDGET_EXHAUSTED'):
            budget.cleanup_timeout(60)

    def test_pipe_drain_is_bounded_no_disk_and_erases_after_finish(self):
        proc=subprocess.Popen([sys.executable,'-c','import sys;sys.stderr.buffer.write(b"x"*200000)'],stderr=subprocess.PIPE)
        reader=h.BoundedStderr(proc.stderr);proc.wait(timeout=5)
        value=reader.finish(TYPED)
        self.assertEqual(value['clientHintStatus'],'UNKNOWN_TRUNCATED')
        self.assertFalse(reader.thread.is_alive());self.assertEqual(len(reader.raw),0)
    def test_inherited_open_pipe_does_not_block_cleanup(self):
        read,write=os.pipe();reader=h.BoundedStderr(os.fdopen(read,'rb'))
        try:
            value=reader.finish(TYPED)
            self.assertEqual(value['clientHintStatus'],'UNKNOWN_INCOMPLETE');self.assertFalse(reader.thread.is_alive())
        finally:os.close(write)

class HostPipeline(unittest.TestCase):
    def pipeline(self,mode,finish_raises=False):
        budget=b.deadline.Budget(b.deadline.monotonic()+180,wall_end=datetime.now(timezone.utc)+timedelta(seconds=180))
        record={'budget':budget,'session':None,'remote':budget.clock(),'received':budget.clock()}
        output=[];plan=object.__new__(b.Plan)
        script='import sys;sys.stdin.buffer.read();sys.stderr.buffer.write('+repr(FRAME)+');sys.exit(1)'
        command=[sys.executable,'-c',script,'-h','synthetic']
        def rpc(_,op,**kw):
            if op=='open':return {'session':'a'*32,'socket':'/private/tmp/qaw-session-fixture/session-fixture'}
            if finish_raises:raise ValueError('synthetic fence failure')
            return {'backendCommandStopped':True,'firstError':dict(TYPED)}
        with patch.object(b,'_copy',return_value=record),patch.object(b,'_plan',return_value={'clientHints':mode}),patch.object(b,'_envelope',return_value={}),patch.object(b,'_command',return_value=command),patch.object(b,'_rpc',side_effect=rpc),patch.object(b.Plan,'consumer',return_value=command):
            with self.assertRaisesRegex(ValueError,'TYPED_BACKEND_FENCE_UNKNOWN' if finish_raises else 'TYPED_POSTDATA_FAILED'):
                plan.pipeline(object(),[sys.executable,'-c','print("synthetic")'],command,False,output)
        return output,record
    def test_v2_real_pipe_failure_has_finite_hints_and_preserves_typed_error(self):
        output,record=self.pipeline(True)
        self.assertTrue(record['stopped']);self.assertEqual(output[0]['firstError'],TYPED)
        self.assertEqual(output[0]['hostPermissionHints']['objectClass'],'INDEX')
        self.assertNotIn(CANARY,json.dumps(output))
    def test_v1_keeps_original_diagnostic_shape(self):
        output,_=self.pipeline(False)
        self.assertNotIn('hostPermissionHints',output[0]);self.assertEqual(output[0]['firstError'],TYPED)
    def test_unknown_backend_fence_never_becomes_success(self):
        output,record=self.pipeline(True,True)
        self.assertEqual(output,[]);self.assertTrue(record['unknown'])

if __name__=='__main__':unittest.main(verbosity=2)
