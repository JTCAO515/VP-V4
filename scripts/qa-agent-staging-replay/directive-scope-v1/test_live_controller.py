"""Synthetic-only controller fixture; never loads a real plan or calls real entry.
--session is a test harness, not a production controller mode or bypass switch.
"""
from datetime import datetime
import hashlib
import importlib.util
import json
import io
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
import uuid
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('tested_live_controller',HERE/'live-controller.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

class Fixture:
    def __init__(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        d=c.entry.profile.provenance.deadline
        self.budget,anchor,instant=c.entry.new_start_budget();self.pid=os.getpid();self.budget_id=id(self.budget)
        self.window=str(uuid.uuid4()) # synthetic only; no actual START/claim files
        header={'attempt':1,'windowId':self.window,'windowStartMonotonic':anchor,'windowStart':instant.isoformat(),'windowEnd':self.budget.wall_end.isoformat()}
        self.core=SimpleNamespace(diagnostic_deadline=d,base=SimpleNamespace(capture=SimpleNamespace(stamp=datetime.fromisoformat)),code_hash=lambda:'1'*64)
        self.args=[str(self.root/x) for x in ('first.json','never-manifest','never-identity','never-replay')]
        self.profile={'windowBindingSha256':'2'*64,'startFile':str(self.root/'first-start.json'),'scope':{'localOnly':True},'sourceLockSha256':'3'*64,'profileLockSha256':'4'*64}
        self.config={'mode':'same-copy-typed-postdata/2','windowBindingSha256':'2'*64,'sourceLockSha256':'3'*64}
        self.control=c.Controller(self.core,self.budget,header,self.args,self.config,self.profile,self.root/'second.json',self.root/'second-start.json',self.root/'repair.json')
        for name in (*self.control._lock_names,'container-diagnostic/restore/source-lock.json'):
            target=self.root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((HERE.parent/name).read_bytes())
        self.control._root=self.root
        self.seen=[];self.first_cleanup='PASS';self.interrupt=False;self.start_cleanup=True
        self.mock=patch.object(c.entry,'run',side_effect=self.fake_entry);self.mock.start()
    def close(self):self.mock.stop();self.tmp.cleanup()
    def fake_entry(self,core,args,configuration,profile,start_budget=None):
        # This is explicitly a synthetic gate, not evidence of real permission.
        assert start_budget is self.budget and id(start_budget)==self.budget_id and os.getpid()==self.pid
        if self.interrupt:raise KeyboardInterrupt()
        attempt=1 if args[0]==self.args[0] else 2
        self.seen.append((os.getpid(),id(start_budget),attempt))
        if attempt==2:
            packet=json.loads((self.root/'second.json').read_text())
            if packet!={'syntheticCausalRepair':True,'windowId':self.window}:raise ValueError('SYNTHETIC_GATE_CAUSAL_OR_WINDOW_REFUSAL')
        if self.start_cleanup:self.budget.cleanup_timeout(60)
        return {'status':'FAIL_SYNTHETIC_ONLY','cleanup':self.first_cleanup if attempt==1 else 'PASS','diagnosticWindowClaim':{'windowId':self.window,'attempt':attempt}}
    def repair(self,causal=True,wrong_window=False,wrong_scope=False):
        file=self.root/c.REPAIR_FILES[0];file.write_bytes(file.read_bytes()+b'\n# synthetic repair\n')
        (self.root/'second.json').write_text(json.dumps({'syntheticCausalRepair':causal,'windowId':'wrong' if wrong_window else self.window}))
        profile={**self.profile,'startFile':str(self.root/'second-start.json'),'sourceLockSha256':'5'*64,'profileLockSha256':'6'*64}
        if wrong_scope:profile['scope']={'localOnly':False}
        descriptor={'configuration':{**self.config,'sourceLockSha256':'5'*64},'sourceProfile':profile,'sourceSha256':{name:c.digest((self.root/name).read_bytes()) for name in c.REPAIR_FILES}}
        lockpath=self.root/'container-diagnostic/restore/source-lock.json';lock=json.loads(lockpath.read_text());lock.update(descriptor['sourceSha256']);lockpath.write_text(json.dumps(lock))
        raw=json.dumps(descriptor).encode();file=self.root/'repair.json';file.write_bytes(raw);file.chmod(0o600)
        return {'action':'repair','sha256':c.digest(raw)}

class ControllerTests(unittest.TestCase):
    def setUp(self):self.f=Fixture();self.addCleanup(self.f.close)
    def first(self):return self.f.control.handle({'action':'run_first'})
    def test_hold_is_not_second_admission_and_no_third_dispatch(self):
        self.assertEqual(self.first()['state'],'HOLD')
        self.assertEqual(self.f.control.tick()['state'],'HOLD')
        self.assertEqual(self.f.control.handle(self.f.repair())['state'],'CLEANUP_PHASE_REENTRY_INELIGIBLE')
        self.assertEqual(self.f.control.handle({'action':'run_first'})['entryInvocations'],1)
        self.assertEqual(self.f.seen,[(self.f.pid,self.f.budget_id,1)])
    def test_repair_rejection_precedes_causal_or_window_descriptor_read(self):
        self.first()
        with patch.object(self.f.control,'_repair') as read:
            result=self.f.control.handle({'action':'repair','sha256':'0'*64})
            self.assertEqual(result['state'],'CLEANUP_PHASE_REENTRY_INELIGIBLE');read.assert_not_called()
        self.assertEqual(len(self.f.seen),1)
    def test_unknown_cleanup_never_holds_or_enters_second(self):
        self.f.first_cleanup='UNKNOWN';self.assertEqual(self.first()['state'],'CLOSED_UNKNOWN')
        self.f.control.handle(self.f.repair());self.assertEqual(len(self.f.seen),1)
    def test_expired_wait_does_not_pause_deadline(self):
        self.first();self.f.budget.expired=True
        self.assertEqual(self.f.control.tick()['state'],'EXPIRED');self.assertEqual(len(self.f.seen),1)
    def test_reconstructed_budget_rejected_without_cleanup_of_foreign_object(self):
        self.f.control._budget=object()
        self.assertEqual(self.first()['controllerCleanup'],'UNKNOWN_OWNER');self.assertEqual(self.f.seen,[])
    def test_fork_pid_refused_without_parent_resource_cleanup(self):
        with patch.object(c.os,'getpid',return_value=-1),patch.object(self.f.budget,'cleanup_all') as cleanup:
            self.assertEqual(self.first()['controllerCleanup'],'UNKNOWN_OWNER');cleanup.assert_not_called()
        self.assertEqual(self.f.seen,[])
    def test_abort_preserves_historical_first_and_closes(self):
        self.first();result=self.f.control.handle({'action':'abort'})
        self.assertEqual(result['state'],'ABORTED');self.assertEqual(len(self.f.seen),1)
    def test_interrupt_closes_and_never_retries(self):
        self.f.interrupt=True;self.assertEqual(self.first()['state'],'REFUSED_OR_INTERRUPTED')
        self.assertEqual(self.f.control.invocations,1)
    def test_arbitrary_paths_or_commands_never_enter(self):
        result=self.f.control.handle({'action':'run_first','path':'/forbidden'})
        self.assertEqual(result['state'],'REFUSED_OR_INTERRUPTED');self.assertEqual(self.f.seen,[])
    def test_runtime_input_change_is_ineligible(self):
        self.first();file=self.f.root/'diagnostic-window-deadline.py';file.write_bytes(file.read_bytes()+b'\n# forbidden\n')
        self.assertEqual(self.f.control.tick()['state'],'REFUSED_OR_INTERRUPTED');self.assertEqual(len(self.f.seen),1)
    def test_missing_descriptor_cannot_trigger_second_entry(self):
        self.first();self.assertEqual(self.f.control.handle({'action':'repair','sha256':'0'*64})['state'],'CLEANUP_PHASE_REENTRY_INELIGIBLE')
        self.assertEqual(len(self.f.seen),1)
    def test_transport_eof_and_oversized_command_close_without_entry(self):
        read,write=os.pipe();os.write(write,b'x'*(c.MAX_COMMAND+1));os.close(write)
        try:
            output=io.StringIO();c.serve(self.f.control,read,output)
            self.assertEqual(self.f.control.state,'REFUSED_OR_INTERRUPTED');self.assertEqual(self.f.seen,[])
        finally:os.close(read)
    def test_transport_eof_after_hold_preserves_failure_and_closes(self):
        self.first();read,write=os.pipe();os.close(write)
        try:
            output=io.StringIO();c.serve(self.f.control,read,output)
            self.assertEqual(self.f.control.state,'EOF_CLOSED');self.assertEqual(len(self.f.seen),1)
            self.assertEqual(self.f.control.snapshot()['lastEntryOutcome'],'FAIL')
        finally:os.close(read)
    def test_loaded_core_change_is_ineligible(self):
        self.first();self.f.core.code_hash=lambda:'7'*64
        self.assertEqual(self.f.control.tick()['state'],'REFUSED_OR_INTERRUPTED');self.assertEqual(len(self.f.seen),1)
    def test_hold_cleanup_expiry_closes_without_late_cleanup_io(self):
        d=self.f.core.diagnostic_deadline;clock=[1000.0]
        with patch.object(d,'monotonic',lambda:clock[0]):
            f=Fixture()
            try:
                self.assertEqual(f.control.handle({'action':'run_first'})['state'],'HOLD')
                end=f.budget.cleanup_end;clock[0]=1061;f.budget.check()
                with patch.object(f.budget,'cleanup_all') as cleanup:
                    result=f.control.tick()
                    self.assertEqual(result['state'],'HOLD_CLEANUP_EXPIRED')
                    self.assertEqual(result['controllerCleanup'],'PASS');cleanup.assert_not_called()
                self.assertEqual(f.budget.cleanup_end,end);self.assertEqual(len(f.seen),1)
            finally:f.close()
    def test_idle_transport_exits_at_original_cleanup_cap_and_keeps_marker(self):
        d=self.f.core.diagnostic_deadline;clock=[1000.0]
        with patch.object(d,'monotonic',lambda:clock[0]):
            f=Fixture();read,write=os.pipe()
            try:
                f.control.handle({'action':'run_first'})
                marker=f.root/'old-used.json';marker.write_bytes(b'preserve')
                def elapsed(*args):clock[0]=1061;return [],[],[]
                with patch.object(c.select,'select',side_effect=elapsed):c.serve(f.control,read,io.StringIO())
                self.assertEqual(f.control.state,'HOLD_CLEANUP_EXPIRED')
                self.assertEqual(marker.read_bytes(),b'preserve');self.assertEqual(len(f.seen),1)
            finally:os.close(read);os.close(write);f.close()
    def test_cleanup_phase_rejects_repair_before_descriptor_or_entry(self):
        self.first();end=self.f.budget.cleanup_end
        with patch.object(self.f.control,'_repair') as repair:
            result=self.f.control.handle({'action':'repair','sha256':'0'*64})
            self.assertEqual(result['state'],'CLEANUP_PHASE_REENTRY_INELIGIBLE');repair.assert_not_called()
        self.assertEqual(self.f.budget.cleanup_end,end);self.assertEqual(len(self.f.seen),1)
    def test_abort_after_data_expiry_remains_abort_and_uses_confirmed_cleanup(self):
        self.first();self.f.budget.expired=True
        with patch.object(self.f.budget,'cleanup_all') as cleanup:
            result=self.f.control.handle({'action':'abort'})
            self.assertEqual(result['state'],'ABORTED');cleanup.assert_not_called()
    def test_unknown_expired_cleanup_does_not_start_another_cleanup_clock(self):
        self.f.budget.cleanup_end=self.f.budget.clock()-1
        with patch.object(self.f.budget,'cleanup_all') as cleanup:
            result=self.f.control.handle({'action':'abort'})
            self.assertEqual(result['state'],'CLOSED_UNKNOWN');cleanup.assert_not_called()
    def test_missing_cleanup_cap_cannot_hold_or_dispatch_again(self):
        self.f.start_cleanup=False
        self.assertEqual(self.first()['state'],'HOLD_CLEANUP_UNAVAILABLE')
        self.f.control.handle({'action':'repair','sha256':'0'*64})
        self.assertEqual(len(self.f.seen),1)
    def test_cleanup_deadline_reset_is_refused(self):
        self.first();self.f.budget.cleanup_timeout(60);self.f.control.tick()
        self.f.budget.cleanup_end=None
        result=self.f.control.tick()
        self.assertEqual(result['state'],'CLOSED_UNKNOWN');self.assertEqual(len(self.f.seen),1)

    def test_restart_does_not_adopt_consumed_second_slot(self):
        # A new interpreter cannot import the factory registry/original object.
        d=self.f.core.diagnostic_deadline
        rebuilt=d.Budget(self.f.budget.window_end,wall_end=self.f.budget.wall_end)
        with self.assertRaisesRegex(ValueError,'DIRECTIVE_START_PROVENANCE_REQUIRED'):
            c.entry.profile.provenance.verify_start_provenance(rebuilt)


def session():
    f=Fixture()
    try:
        # Predefined synthetic repair only; no input paths/source/evidence supplied.
        command=f.repair()
        # Restore initial bytes until first FAIL; explicit repair action selects
        # already-created synthetic source delta through the fixture's writer.
        changed=(f.root/c.REPAIR_FILES[0]).read_bytes()
        (f.root/c.REPAIR_FILES[0]).write_bytes((HERE.parent/c.REPAIR_FILES[0]).read_bytes())
        original=f.control._repair
        def activate(expected):
            (f.root/c.REPAIR_FILES[0]).write_bytes(changed)
            return original(expected)
        f.control._repair=activate
        print(json.dumps({'syntheticOnly':True,'pid':f.pid,'originalBudgetObjectId':f.budget_id,'repairCommand':command}),flush=True)
        c.serve(f.control,sys.stdin.fileno(),sys.stdout)
        print(json.dumps({'syntheticOnly':True,'observedCalls':[{'pid':pid,'budgetObjectId':bid,'attempt':attempt} for pid,bid,attempt in f.seen],'sameOriginalObject':all(pid==f.pid and bid==f.budget_id for pid,bid,_ in f.seen),'final':f.control.snapshot()}),flush=True)
    finally:f.close()

if __name__=='__main__':
    if sys.argv[1:]==['--session']:session()
    else:unittest.main(verbosity=2)
