import importlib.util
import io
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent


def load(name):
    s=importlib.util.spec_from_file_location(name,HERE/(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


fixtures=load('test-reviewed-diagnostic-window')


class DeadlineIntegration(unittest.TestCase):
    def test_clock_crosses_window_between_decrypt_and_postdata_no_later_io(self):
        fx=fixtures.DiagnosticWindow('runTest');fx.setUp();self.addCleanup(fx.doCleanups)
        d=fixtures.d;core=load('controlled-snapshot-restore');events=[];clock=[0.0]
        class Process:
            def __init__(self,args,**kw):self.args=args;self.returncode=None;self.stdout=io.BytesIO();self.stdin=None
            def communicate(self,input=None,timeout=None):
                if self.args[0].startswith('synthetic-'):
                    events.append(self.args[0]);clock[0]+=1
                self.returncode=0
                return (b'FileVault is On.' if self.args[0]=='fdesetup' else b'',b'')
            def poll(self):return self.returncode
            def wait(self,timeout=None):self.returncode=0;return 0
            def kill(self):self.returncode=-9
        def raw_run(args,**kw):
            p=Process(args);a,b=p.communicate(input=kw.get('input'),timeout=kw.get('timeout'));return subprocess.CompletedProcess(args,0,a,b)
        fake=SimpleNamespace(Popen=Process,run=raw_run,PIPE=subprocess.PIPE,DEVNULL=subprocess.DEVNULL,TimeoutExpired=subprocess.TimeoutExpired)
        def restore_engine(*args):
            core.base.run(['synthetic-decrypt'])
            clock[0]=3601.0 # shared window elapsed during another phase
            core.base.run(['synthetic-postdata'])
            core.base.run(['synthetic-replay-sql'])
            return {'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS','reason':'FIXTURE_STOP'}
        profile={'databaseFacts':{'encoding':'UTF8','collate':'en_US.UTF-8','ctype':'en_US.UTF-8','localeProvider':'i'},'icuLocale':'en-US','icuRules':None,'collationVersion':'153.121','actualCollationVersion':'153.121'}
        manifest={'verification':{'metadata':{'versions':[]},'databaseFacts':profile['databaseFacts']}}
        mp=fx.archives/'captured.json';mp.write_text('{}');mp.chmod(0o600)
        fx.packet.update(manifestPath=str(mp),replayMode=core.replay.CANDIDATE_MODE,replayManifestSha256=core.replay.CANDIDATE_MANIFEST_HASH)
        ap=fx.root/'packet.json';ap.write_text(__import__('json').dumps(fx.packet));ap.chmod(0o600)
        original_read=d.read_private
        def read(p,expected=None,**kw):return (manifest,d.MANIFEST_SHA) if Path(p)==mp else original_read(p,expected,**kw)
        deadline=load('diagnostic-window-deadline') if (HERE/'diagnostic-window-deadline.py').exists() else None
        if deadline:self.addCleanup(patch.stopall);patch.object(deadline,'monotonic',lambda:clock[0]).start()
        scope=SimpleNamespace(code_hash=lambda:fx.code,base=core.base,locale_profile=core.locale_profile,verify_manifest=lambda manifest:None,replay=core.replay,restore_bundle=core.restore_bundle,diagnostic_deadline=deadline)
        with patch.object(d,'read_private',side_effect=read),patch.object(d,'validate',return_value=profile),patch.object(core.base,'subprocess',fake),patch.object(core.base.capture,'now',return_value=fx.t),patch.object(core.base,'validate_approval'),patch.object(core,'verify_manifest',return_value=(manifest,{'sequences':[]})),patch.object(core.replay,'load_plan',return_value=({'mode':core.replay.CANDIDATE_MODE,'baselineVersions':[]},[])),patch.object(core.base,'restore_bundle',side_effect=restore_engine):
            result=d.run(scope,[str(ap),str(mp),fx.identity,'candidate-plan'])
        self.assertEqual(events,['synthetic-decrypt'])
        self.assertTrue(result['status'].startswith('FAIL'))
        self.assertEqual(result['cleanup'],'PASS')
        self.assertFalse((fx.archives/d.active_name()).exists())


class DeadlineGuards(unittest.TestCase):
    def test_inflight_command_capped_and_no_data_after_expiry(self):
        deadline=load('diagnostic-window-deadline');clock=[0.0];caps=[];processes=[]
        class RawProcess:
            def __init__(self,args,**kw):self.args=args;self.returncode=None;processes.append(self)
            def communicate(self,input=None,timeout=None):
                caps.append(timeout);clock[0]+=timeout
                raise subprocess.TimeoutExpired(self.args,timeout)
            def poll(self):return self.returncode
            def kill(self):self.returncode=-9
            def wait(self,timeout=None):return self.returncode
        raw=SimpleNamespace(Popen=RawProcess,PIPE=subprocess.PIPE)
        budget=deadline.Budget(10,clock=lambda:clock[0],reserve=2)
        proxy=deadline.Subprocess(raw,budget)
        with self.assertRaises(deadline.WindowExpired):proxy.run(['owned-host-command'],timeout=600)
        self.assertEqual(caps,[8.0]);self.assertEqual(processes[0].returncode,-9)
        with self.assertRaises(deadline.WindowExpired):proxy.run(['late-sql'])
        self.assertEqual(len(processes),1)
        clock[0]=0 # even a fake clock rewind never reopens an expired attempt
        with self.assertRaises(deadline.WindowExpired):proxy.run(['reopened-sql'])

    def fence(self,conflict=False,created=True):
        deadline=load('diagnostic-window-deadline');clock=[20.0];commands=[];running=[True]
        db=SimpleNamespace(name='qaw-restore-owned',nonce='owned-nonce',context='desktop-linux',created=created,_deadline_run_issued=True)
        def raw_run(args,**kw):
            commands.append(args);self.assertLessEqual(kw['timeout'],15)
            tail=args[3:]
            if tail==['inspect',db.name]:
                value=[{'Id':'c'*64,'Name':'/'+db.name,'Config':{'Labels':{'qaw.restore.owner':'other-owner' if conflict else db.nonce}}}]
                return subprocess.CompletedProcess(args,0,__import__('json').dumps(value).encode(),b'')
            if tail==['rm','-f','c'*64]:running[0]=False;return subprocess.CompletedProcess(args,0,b'c'*64,b'')
            if tail==['inspect','c'*64] and not running[0]:return subprocess.CompletedProcess(args,1,b'[]',b'Error: No such object: '+b'c'*64)
            raise AssertionError('unexpected cleanup operation')
        budget=deadline.Budget(10,clock=lambda:clock[0],reserve=2);budget.raw_subprocess=SimpleNamespace(run=raw_run)
        return deadline,budget,db,commands,running

    def test_after_deadline_cleanup_fences_container_not_just_exec_client(self):
        deadline,budget,db,commands,running=self.fence()
        with self.assertRaises(deadline.WindowExpired):budget.check()
        self.assertTrue(running[0]) # killing an exec client does not stop this
        budget.cleanup_owned(db)
        self.assertFalse(running[0]);self.assertTrue(db._deadline_cleanup_pass)
        self.assertEqual([a[3:] for a in commands],[['inspect',db.name],['rm','-f','c'*64],['inspect','c'*64]])

    def test_label_conflict_never_removes_foreign_container_and_cleanup_unknown(self):
        _,budget,db,commands,running=self.fence(conflict=True)
        with self.assertRaisesRegex(ValueError,'OWNED_DEADLINE_CLEANUP_UNKNOWN'):budget.cleanup_owned(db)
        self.assertTrue(running[0]);self.assertFalse(budget.cleanup_ok)
        self.assertEqual(len(commands),1)

    def test_launch_timeout_before_created_flag_still_fences_own_nonce(self):
        _,budget,db,commands,running=self.fence(created=False)
        budget.cleanup_owned(db)
        self.assertFalse(running[0]);self.assertTrue(db._deadline_cleanup_pass)

    def test_unknown_cleanup_keeps_future_active_consumption_guard(self):
        fx=fixtures.DiagnosticWindow('runTest');fx.setUp();self.addCleanup(fx.doCleanups)
        d=fixtures.d;fx.valid();d.claim(fx.packet,fx.code)
        d.finish(fx.packet,fx.code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'FAIL','reason':'WINDOW_DATA_DEADLINE_EXPIRED'})
        self.assertTrue((fx.archives/d.active_name()).exists())
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_ALREADY_ACTIVE_OR_CONSUMED'):d.claim({**fx.packet,'attempt':2},fx.code)

    def test_private_module_budget_restores_all_references_and_hash_is_cancellable(self):
        deadline=load('diagnostic-window-deadline');core=load('controlled-snapshot-restore')
        import tempfile,hashlib,time
        modules=[core.base,core.base.capture,core.replay,core.safe_diagnostics]
        prior=[m.subprocess for m in modules];cluster=core.base.OwnCluster;file_hash=core.base.file_hash
        with tempfile.TemporaryDirectory(dir=HERE.parents[1]/'artifacts/QAWEB/staging-replay',prefix='deadline-hash-fixture-') as tmp:
            p=Path(tmp)/'fake-ciphertext';p.write_bytes(b'not real ciphertext')
            budget=deadline.Budget(time.monotonic()+10,reserve=1)
            result=budget.execute(lambda:{'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS','digest':core.base.file_hash(p)},core.base,core.replay,core.safe_diagnostics)
            self.assertEqual(result['digest'],hashlib.sha256(p.read_bytes()).hexdigest())
            self.assertEqual(result['cleanup'],'PASS');self.assertEqual(len(budget.processes),1)
        self.assertEqual([m.subprocess for m in modules],prior)
        self.assertIs(core.base.OwnCluster,cluster);self.assertIs(core.base.file_hash,file_hash)

    def test_subprocess_and_sql_paths_share_same_proxy_budget(self):
        deadline=load('diagnostic-window-deadline');core=load('controlled-snapshot-restore');clock=[0.0];calls=[]
        class RawProcess:
            def __init__(self,args,**kw):self.args=args;self.returncode=None;self.stdout=io.BytesIO()
            def communicate(self,input=None,timeout=None):calls.append((self.args[0],timeout));clock[0]+=1;self.returncode=0;return b'',b''
            def poll(self):return self.returncode
            def wait(self,timeout=None):self.returncode=0;return 0
            def kill(self):self.returncode=-9
        fake=SimpleNamespace(Popen=RawProcess,PIPE=subprocess.PIPE,DEVNULL=subprocess.DEVNULL)
        budget=deadline.Budget(8,clock=lambda:clock[0],reserve=2)
        modules=[core.base,core.base.capture,core.replay,core.safe_diagnostics]
        with patch.object(core.base,'subprocess',fake),patch.object(core.base.capture,'subprocess',fake),patch.object(core.replay,'subprocess',fake),patch.object(core.safe_diagnostics,'subprocess',fake):
            with budget.bind(core.base,core.replay,core.safe_diagnostics):
                core.base.run(['schema-sql'],timeout=60)
                core.base.capture.subprocess.run(['cipher-check'],timeout=600)
                core.replay.subprocess.run(['replay-source'],timeout=10)
                self.assertEqual(calls,[('schema-sql',6),('cipher-check',5),('replay-source',4)])
                clock[0]=6
                with self.assertRaises(deadline.WindowExpired):core.base.run(['late-sql'])
        self.assertEqual(len(calls),3)

    def test_execute_unknown_nonce_fence_propagates_to_active_window_guard(self):
        fx=fixtures.DiagnosticWindow('runTest');fx.setUp();self.addCleanup(fx.doCleanups)
        d=fixtures.d;fx.valid();d.claim(fx.packet,fx.code)
        _,budget,db,commands,running=self.fence(conflict=True)
        core=load('controlled-snapshot-restore');raw=budget.raw_subprocess;budget.clusters.append(db)
        with patch.object(core.base,'subprocess',raw):
            result=budget.execute(lambda:{'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS','reason':'FIXTURE_STOP'},core.base,core.replay,core.safe_diagnostics)
        self.assertEqual(result['cleanup'],'FAIL');self.assertEqual(result['windowDeadline']['ownedCleanupFence'],'UNKNOWN')
        self.assertTrue(running[0]);self.assertEqual(len(commands),1)
        d.finish(fx.packet,fx.code,result)
        self.assertTrue((fx.archives/d.active_name()).exists())

    def test_absolute_deadline_is_anchored_once_not_per_phase(self):
        deadline=load('diagnostic-window-deadline');from datetime import datetime,timezone,timedelta
        now=datetime.now(timezone.utc);clock=[100.0]
        with patch.object(deadline,'monotonic',lambda:clock[0]):budget=deadline.from_window((now+timedelta(hours=1)).isoformat(),now,datetime.fromisoformat)
        self.assertEqual(budget.window_end,3700)
        clock[0]=3500;self.assertEqual(budget.timeout(600),80)
        clock[0]=3580
        with self.assertRaises(deadline.WindowExpired):budget.timeout(600)


if __name__=='__main__':unittest.main(verbosity=2)
