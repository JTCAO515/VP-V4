"""Authority, clock-domain and no-signal negatives; no real operator files."""
from contextlib import contextmanager
from datetime import datetime,timezone,timedelta
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
core=load('contract_core',ROOT/'controlled-snapshot-restore.py')
bridge=load('contract_bridge',HERE/'bridge.py')

def configuration():return {'mode':bridge.MODE,'sourceLockSha256':hashlib.sha256((HERE/'source-lock.json').read_bytes()).hexdigest(),'windowBindingSha256':'1'*64}
def budget(seconds=20,**kw):return core.diagnostic_deadline.Budget(time.monotonic()+120+seconds,wall_end=datetime.now(timezone.utc)+timedelta(seconds=120+seconds),**kw)

@contextmanager
def owned(seconds=20,**kw):
    b=budget(seconds,**kw);plan=bridge.Plan(configuration(),b)
    with b.bind(core.base,core.replay,core.safe_diagnostics):
        original=core.base.OwnCluster
        class Copy(original):
            def __init__(self):super().__init__('supabase_admin');plan.new_copy(self)
            def docker(self,args,data=None):
                if args and args[0]=='run':return plan.launch(self,args,lambda routed:super(Copy,self).docker(routed,data))
                return super().docker(args,data)
            def start(self):super().start();plan.ready(self)
        plan.bind_class(Copy);db=Copy();db.start()
        yield plan,db,b
    if not b.cleanup_ok:raise AssertionError('owned fixture cleanup failed')

class Admission(unittest.TestCase):
    def test_missing_expired_or_fake_original_budget_rejects_before_input_io(self):
        for b in (None,object(),budget(-1)):
            with patch.object(core,'verify_manifest') as manifest,patch.object(core.base,'run') as io:
                with self.assertRaises(ValueError):core.restore_bundle('NEVER_READ','NEVER_READ',{},window_budget=b,typed_diagnostic=configuration())
                manifest.assert_not_called();io.assert_not_called()
    def test_missing_or_changed_pin_set_fails_before_manifest(self):
        for config in ({},dict(configuration(),sourceLockSha256='0'*64),dict(configuration(),imageId='arbitrary'),dict(configuration(),windowBindingSha256='')):
            with patch.object(core,'verify_manifest') as manifest:
                with self.assertRaises(ValueError):core.restore_bundle('NEVER_READ','NEVER_READ',{},window_budget=budget(),typed_diagnostic=config)
                manifest.assert_not_called()
    def test_old_window_entry_stays_unconfigured_before_private_reads(self):
        with patch.object(core.diagnostic_window,'read_private') as reads,patch.object(core.base,'run') as io:
            with self.assertRaises(ValueError):core.main(['--restore-diagnostic-window-from-direct-record','OLD_795_NOT_READ','NO_MANIFEST','NO_IDENTITY','NO_PLAN'])
            reads.assert_not_called();io.assert_not_called()
    def test_clock_domain_delay_cannot_extend_original_deadline(self):
        clock=[500.0];wall=[datetime.now(timezone.utc)]
        b=core.diagnostic_deadline.Budget(670,clock=lambda:clock[0],wall_end=wall[0]+timedelta(seconds=170),wall_clock=lambda:wall[0])
        snapshot=b.export_for_remote(100.0,500.0)
        self.assertEqual(snapshot['windowEnd']-snapshot['reserve'],150.0)
        clock[0]=520;self.assertEqual(b.export_for_remote(100.0,500.0),snapshot)
        self.assertEqual(b.reserve,120);self.assertIsNone(b.cleanup_end)
        for anchor in (float('inf'),float('nan')):
            with self.assertRaises(ValueError):b.export_for_remote(anchor,500.0)
        wall[0]+=timedelta(seconds=200)
        with self.assertRaises(core.diagnostic_deadline.WindowExpired):b.export_for_remote(100.0,500.0)
        wall[0]-=timedelta(seconds=200)
        with self.assertRaises(core.diagnostic_deadline.WindowExpired):b.export_for_remote(100.0,500.0)
        cleanup=b.export_cleanup_for_remote(100.0,500.0);clock[0]+=2
        self.assertEqual(b.export_cleanup_for_remote(100.0,500.0),cleanup)

class CopyContracts(unittest.TestCase):
    def test_wrong_copy_nonce_role_or_foreign_object_never_issues_control_or_signal(self):
        with owned() as (plan,db,b):
            for field,value in [('name','foreign-copy'),('nonce','0'*32),('admin','foreign_role'),('locale','foreign_locale')]:
                old=getattr(db,field);setattr(db,field,value)
                try:
                    with patch.object(bridge,'_run') as io:
                        with self.assertRaises(ValueError):plan.pipeline(db,['never'],[],False,[])
                        with self.assertRaises(ValueError):bridge._Cleanup(plan,db).cleanup(b)
                        io.assert_not_called()
                finally:setattr(db,field,old)
            with patch.object(bridge,'_run') as io:
                with self.assertRaises(ValueError):plan.ready(object())
                io.assert_not_called()
            self.assertEqual(db.sql('select 1;'),'1')
    def test_wrong_runtime_container_identity_prevents_cleanup_signal(self):
        with owned() as (plan,db,b):
            actual=bridge._docker
            def mismatched(r,args,*a,**kw):
                value=actual(r,args,*a,**kw)
                if args[0]=='inspect':
                    info=json.loads(value);info[0]['Id']='0'*64;return json.dumps(info).encode()
                return value
            with patch.object(bridge,'_docker',side_effect=mismatched) as operations:
                with self.assertRaises(ValueError):bridge._Cleanup(plan,db).cleanup(b)
                self.assertFalse(any(call.args[1][0] in ('rm','kill') for call in operations.call_args_list))
            self.assertEqual(db.sql('select 1;'),'1')
    def test_parent_utc_jump_stops_before_open_and_cleanup_still_works(self):
        wall=[datetime.now(timezone.utc)]
        with owned(wall_clock=lambda:wall[0]) as (plan,db,b):
            wall[0]=b.wall_end+timedelta(seconds=1)
            with patch.object(bridge,'_run') as io:
                with self.assertRaises(core.diagnostic_deadline.WindowExpired):plan.pipeline(db,['never'],db.command('pg_restore')+['--exit-on-error','--section=post-data'],False,[])
                io.assert_not_called()
            self.assertTrue(b.expired)
    def test_snapshot_change_and_open_finish_replays_are_refused(self):
        with owned() as (plan,db,b):
            r=bridge._copy(plan,db);env=bridge._envelope(r)
            with self.assertRaises(ValueError):bridge._rpc(r,'initialize',budget=env)
            changed={**env,'windowEnd':env['windowEnd']+100}
            with self.assertRaises(ValueError):bridge._rpc(r,'open',budget=changed)
            opened=bridge._rpc(r,'open',budget=env);r['session']=opened['session']
            with self.assertRaises(ValueError):bridge._rpc(r,'open',budget=env)
            command=db.command('psql')+['-X','-q','-At','-v','ON_ERROR_STOP=1'];command[command.index('-h')+1]=opened['socket']
            bridge._run(r,command,b'select 1;')
            result=bridge._rpc(r,'finish',cleanup=True,session=r['session'],cleanupEnd=b.export_cleanup_for_remote(r['remote'],r['received']))
            r['stopped']=result['backendCommandStopped'];self.assertIs(r['stopped'],True)
            with self.assertRaises(ValueError):bridge._rpc(r,'finish',cleanup=True,session=r['session'],cleanupEnd=b.export_cleanup_for_remote(r['remote'],r['received']))
    def test_late_snapshot_is_refused_inside_container_even_without_parent_transport(self):
        with owned(seconds=3) as (plan,db,b):
            r=bridge._copy(plan,db);env=bridge._envelope(r)
            while b.remaining()>0:time.sleep(min(.05,b.remaining()))
            # Negative-only direct transport to our own copy: prove the child
            # refuses an expired original snapshot as well as the parent.
            request=json.dumps({'op':'open','nonce':db.nonce,'budget':env}).encode()+b'\n'
            output=subprocess.run(['docker','--context',db.context,'exec','-i',r['id'],'python3','-I','/opt/qaw/client.py'],input=request,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=3)
            self.assertEqual(json.loads(output.stdout),{'error':'OWNED_RUNTIME_OPERATION_FAILED'})

if __name__=='__main__':unittest.main(verbosity=2)
