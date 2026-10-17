"""Private driver contract tests using only synthetic paths/clock/state.
Pass a fixed driver source path; never invoke its __main__ or actual data entry.
"""
import contextlib
from datetime import datetime,timezone,timedelta
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
DRIVER=Path(sys.argv.pop(1)).resolve()
ROOT=Path(__file__).resolve().parent.parent

def load(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

class DriverContract(unittest.TestCase):
    def test_active_or_consumed_guard_precedes_all_historical_bodies(self):
        for kind in ('active','authority'):
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as tmp:
                m=load('driver_guard_'+kind,DRIVER);root=Path(tmp);archives=root/'archives';archives.mkdir(mode=0o700)
                (archives/(kind+'.json')).write_text('{}')
                pins={str(i):{'path':str(root/('old-'+str(i)+'.json')),'sha256':'1'*64} for i in range(7)}
                source={'preservedPins':pins};human={'sourceEvidence':{'synthetic':True}};packet={'identityPath':'synthetic-reference'}
                files={}
                for name,value in [('source-profile.prepared.json',source),('human-qualification.prepared.json',human),('execution-packet.prepared.json',packet),('main-START.prepared.json',{})]:
                    raw=json.dumps({'value':value}).encode();p=root/name;p.write_bytes(raw);p.chmod(0o600);files[name]={'path':str(p),'sha256':hashlib.sha256(raw).hexdigest()}
                plan={'executionCheckout':str(root),'executionCommit':m.HEAD,'files':files,'attempt':1,'automaticRetry':False,'replayPlanPath':'synthetic'}
                raw=json.dumps(plan).encode();planpath=root/'plan.json';planpath.write_bytes(raw);planpath.chmod(0o600)
                seen=[]
                gate=SimpleNamespace(ARCHIVES=archives,active_name=lambda:'active.json',read_private=lambda *a:seen.append(a))
                profile=SimpleNamespace(IDENTITY=hashlib.sha256(b'synthetic-reference').hexdigest(),IMAGE='synthetic-image',verify_locks=lambda source:None,verify_sources=lambda:{'synthetic':True},authority_name=lambda:'authority.json')
                core=SimpleNamespace(diagnostic_window=gate,replay=SimpleNamespace(load_plan=lambda path:None))
                entry=SimpleNamespace(profile=profile)
                def command(args):
                    if args[0]=='git':return m.HEAD if 'rev-parse' in args else ''
                    if args[0]=='fdesetup':return 'FileVault is On.'
                    return json.dumps([{'Id':profile.IMAGE,'Config':{}}])
                with patch.object(m,'PLAN',planpath),patch.object(m,'load',side_effect=lambda name,path:core if name=='operator_core' else entry),patch.object(m,'command',side_effect=command),patch.dict(os.environ):
                    os.environ.pop('DOCKER_HOST',None);os.environ.pop('DOCKER_CONTEXT',None)
                    with self.assertRaisesRegex(ValueError,'GUARD_NOT_CLEAR'):m.prepare(hashlib.sha256(raw).hexdigest())
                self.assertEqual(seen,[],'historical body read before known guard rejection')
    def test_start_budget_survives_finalization_delay_and_utc_rollback(self):
        for elapsed,utc_advance in ((10,5),(120,120)):
            with self.subTest(elapsed=elapsed,utc_advance=utc_advance),tempfile.TemporaryDirectory() as tmp:
                m=load('driver_clock',DRIVER);root=Path(tmp)
                d=load('driver_budget',ROOT/'diagnostic-window-deadline.py').shared_runtime()
                mono=[1000.0];origin=datetime(2026,10,16,16,0,tzinfo=timezone.utc);wall=[origin]
                clock=lambda:mono[0];utc=lambda:wall[0]
                class Date:
                    @staticmethod
                    def now(tz):return wall[0]
                profile=SimpleNamespace(IMAGE='synthetic-image',IDENTITY='2'*64,window_binding=lambda packet:'3'*64,execution_header=lambda *a:{'synthetic':True})
                seen={};writes=[]
                def run(*args,**kwargs):
                    seen['budget']=kwargs.get('start_budget');return {'status':'SYNTHETIC_ONLY','cleanup':'PASS'}
                entry=SimpleNamespace(profile=profile,qualified_hash=lambda *args:'4'*64,run=run)
                core=SimpleNamespace(diagnostic_deadline=d,base=SimpleNamespace(capture=SimpleNamespace(stamp=datetime.fromisoformat)),diagnostic_window=SimpleNamespace(RETAIN='2026-10-20T23:59:59+08:00'))
                plan={'destinations':{k:str(root/(k+'.json')) for k in ('human','locale','start','packet','header')},'sourceProfileActualPath':str(root/'source.json'),'typedConfigurationActualPath':str(root/'typed.json'),'resultPath':str(root/'result.json'),'replayPlanPath':'synthetic','issuerThreadId':'synthetic-main','executorThreadId':'synthetic-executor'}
                values={'execution-packet.prepared.json':{'manifestPath':'synthetic','identityPath':'synthetic'},'human-qualification.prepared.json':{},'source-profile.prepared.json':{'humanRecord':{},'sourceLockSha256':'5'*64},'main-START.prepared.json':{}}
                def write(path,value):
                    writes.append((path,json.loads(json.dumps(value))))
                    if len(writes)==1:mono[0]=1000+elapsed;wall[0]=origin+timedelta(seconds=utc_advance)
                    return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
                with patch.object(m,'prepare',return_value=(plan,values,core,entry,{})),patch.object(m,'datetime',Date),patch.object(m.time,'monotonic',clock),patch.object(d,'monotonic',clock),patch.object(d,'utc_now',utc),patch.object(m,'write_once',side_effect=write),contextlib.redirect_stdout(io.StringIO()):
                    m.start('synthetic-plan-sha',hashlib.sha256(DRIVER.read_bytes()).hexdigest())
                    b=seen.get('budget');self.assertIsNotNone(b,'driver passed no START Budget')
                    self.assertEqual(b.window_end,4600);self.assertEqual(b.data_end,4480)
                    self.assertLessEqual(b.remaining(),3480-elapsed)
                    packet=next(value for path,value in writes if path==plan['destinations']['packet'])
                    self.assertEqual(packet['windowStartMonotonic'],1000)
                    # e671 entry's old reconstruction would yield4605 in the
                    # rollback case. The passed original object never does.
                    late=d.from_window(packet['windowEnd'],wall[0],datetime.fromisoformat,anchor=mono[0])
                    self.assertEqual(late.window_end,4600+elapsed-utc_advance)

if __name__=='__main__':unittest.main(verbosity=2)
