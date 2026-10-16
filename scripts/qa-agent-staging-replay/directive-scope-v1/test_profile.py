"""Private non-secret source proof + synthetic metadata-only gate tests.
Never opens ciphertext/identity or runs PG. Real source bytes are not committed.
"""
import copy
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone,timedelta
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid
import sys
import time
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
p=load('tested_profile',HERE/'profile.py');entry=load('tested_entry',HERE/'entry.py')
legacy=load('legacy_fixture',ROOT/'test-reviewed-diagnostic-window.py')

class StaticRejection(unittest.TestCase):
    def test_missing_unknown_profile_never_reads_private_or_claims(self):
        g=load('unconfigured_gate',ROOT/'reviewed-diagnostic-window.py')
        for profile in ({},None,{'version':'legacy90d'}, {'version':p.VERSION}):
            with patch.object(g,'read_private') as read,patch.object(g,'claim') as claim:
                with self.assertRaises(ValueError):g.run(None,['NEVER_READ']*4,source_profile=profile)
                read.assert_not_called();claim.assert_not_called()
    def test_legacy_90d_binding_unchanged(self):
        g=load('legacy_pin',ROOT/'reviewed-diagnostic-window.py')
        self.assertEqual(g.BESTJ_QUESTION_MESSAGE_ID,'Sentinel_90d9e98b22488191ac8a1eb87cff898e')
        with patch.object(g,'QUESTION_ITEM_ID',None),patch.object(g,'QUESTION_MESSAGE_ID',p.CONTEXTS[0]),patch.object(g,'ANSWER_MESSAGE_ID',p.DIRECTIVES[0]):self.assertFalse(g.message_reference_configured())
    def test_fake_native_name_is_not_a_semantic_projection(self):
        good={'type':'functionCallOutput','namespace':'cloud_threads','name':'send_message','id':'synthetic-native','output':{'truncated':False}}
        self.assertEqual(p.native_first(good)['nativeName'],'cloud_threads.send_message')
        for changes in ({'name':'send_message_to_thread'},{'namespace':'codex_app'},{'type':'mcpToolCall'}):
            with self.assertRaisesRegex(ValueError,'DIRECTIVE_NATIVE_FIRST_HOP_REQUIRED'):p.native_first({**good,**changes})

class ActualSources(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:cls.raw=p.read_sources()
        except OSError:raise unittest.SkipTest('Explicit private non-secret source bundle unavailable on this host; never fabricate it')
        cls.view=p.verify_sources(cls.raw)
    def test_real_source_is_truthfully_projected_without_private_actor_output(self):
        view=self.view
        self.assertEqual(view['allReturnedMessagesBound'],5)
        self.assertEqual(view['contexts'][0]['kind'],'progress_report_not_approval_question')
        self.assertIsNone(view['directives'][1]['replyTo']);self.assertIsNone(view['directives'][1]['replyRoot'])
        self.assertEqual([x['nativeName'] for x in view['nativeFirstHops']],['cloud_threads.send_message']*2)
        self.assertEqual([x['nativeName'] for x in view['nativeSecondHops']],['codex_app.send_message_to_thread']*2)
        api=json.loads(self.raw['context.parentProvidedApiRaw'])['structuredContent'];actor=api['message']['author_id']
        self.assertFalse(actor in json.dumps(view),'private actor must not be emitted');self.assertEqual(view['authorizationDigest'],p.AUTHORIZATION)
    def test_actor_room_id_text_null_and_raw_hop_tampering_rejected(self):
        for key in self.raw:
            bad=dict(self.raw);bad[key]=self.raw[key]+b' '
            with self.subTest(file=key),self.assertRaisesRegex(ValueError,'DIRECTIVE_RAW_PIN_CONFLICT'):p.verify_sources(bad)
        mutations=[('author_id','fake-actor'),('message_id','Sentinel_90d9e98b22488191ac8a1eb87cff898e'),('reply_to_id','fake-explicit-reply'),('reply_root_message_id','fake-root')]
        for key,value in mutations:
            api=json.loads(self.raw['context.parentProvidedApiRaw']);api['structuredContent']['message'][key]=value
            bad=dict(self.raw);bad['context.parentProvidedApiRaw']=p.canonical(api)
            with self.subTest(field=key),self.assertRaises(ValueError):p.verify_sources(bad)
    def test_targeted_room_native_transport_text_and_hop_mismatches(self):
        variants=[('context.indexComplete',lambda d:d.update(parentProvidedRoom='foreign-room')),
                  ('scope.incoming',lambda d:d.update(namespace='codex_app')),
                  ('scope.outgoing',lambda d:d['arguments'].update(threadId='foreign-thread')),
                  ('context.secondHopRuntimeCapture',lambda d:d.update(tool='fake.tool')),
                  ('context.parentProvidedApiRaw',lambda d:d['structuredContent']['message']['content'].update(text='fake text'))]
        for key,mutate in variants:
            value=json.loads(self.raw[key]);mutate(value);bad=dict(self.raw);bad[key]=p.canonical(value)
            with self.subTest(role=key),self.assertRaises(ValueError):p.verify_sources(bad)

class SyntheticGate(ActualSources):
    # Reuse only the original test fixture builder, not any actual metadata.
    def setUp(self):
        self.fx=legacy.DiagnosticWindow('runTest');self.fx.setUp();self.addCleanup(self.fx.doCleanups)
        self.g=legacy.d;self.code=self.fx.code
        deadline=load('fixture_start',ROOT/'diagnostic-window-deadline.py').shared_runtime()
        self.original_budget,anchor,instant=p.provenance.new_start_budget()
        self.fx.t=instant
        self.fx.packet.update(windowStartMonotonic=anchor,windowStart=instant.isoformat(),windowEnd=self.original_budget.wall_end.isoformat())
        self.fx.start.update(windowStart=instant.isoformat(),windowEnd=self.original_budget.wall_end.isoformat())
        original_sha=self.g.sha
        # The actual identity path is intentionally unavailable/unread. Map one
        # synthetic fixture reference only; other/wrong paths use real SHA256.
        self.hash_patch=patch.object(self.g,'sha',side_effect=lambda raw:p.IDENTITY if raw==self.fx.identity.encode() else original_sha(raw))
        self.hash_patch.start();self.addCleanup(self.hash_patch.stop)
        self.cfg={'version':p.VERSION,'authorizationDigest':p.AUTHORIZATION,'humanRecord':{'path':str(self.fx.root/('directive-v1-human-'+self.fx.window+'.json')),'sha256':'0'*64},'startFile':str(self.fx.root/('directive-v1-start-'+self.fx.window+'-1.json')),'identityPathSha256':p.IDENTITY,'preservedPins':self.fx.pins,'sourceLockSha256':p.sha((ROOT/'container-diagnostic/restore/source-lock.json').read_bytes()),'profileLockSha256':p.sha((HERE/'source-lock.json').read_bytes()),'windowBindingSha256':p.window_binding(self.fx.packet),'runtimeImage':p.IMAGE,'captureId':p.CAPTURE,'manifestSha256':p.MANIFEST,'scope':copy.deepcopy(p.SCOPE),'localOnly':True}
        self.human={'status':'DIRECTIVE_SCOPE_QUALIFIED_NOT_EXECUTED','profileVersion':p.VERSION,'fileDoesNotSelfAuthorize':True,'sourceEvidence':self.view,'windowId':self.fx.window,'windowBindingSha256':p.window_binding(self.fx.packet),'target':self.g.TARGET,'parentCaptureId':p.CAPTURE,'manifestSha256':p.MANIFEST,'identityPathSha256':p.IDENTITY,'scope':copy.deepcopy(p.SCOPE),'localOnly':True,'runtimeImage':p.IMAGE}
        self.cfg['humanRecord']['sha256']=self.write(Path(self.cfg['humanRecord']['path']),self.human)
        self.packet=copy.deepcopy(self.fx.packet);self.packet['humanAuthorizationSha256']=self.cfg['humanRecord']['sha256']
        self.start=copy.deepcopy(self.fx.start);self.start.update(humanAuthorizationSha256=self.cfg['humanRecord']['sha256'],identityPathSha256=p.IDENTITY,windowStartMonotonic=self.packet['windowStartMonotonic'])
        self.bind_start()
        # Source projection was actually verified once above. Integration cases
        # reuse that proof and test the unchanged window/claim algorithm only.
        module=self.g._directive_profile()
        self.source_patch=patch.object(module,'verify_sources',return_value=self.view);self.source_patch.start();self.addCleanup(self.source_patch.stop)
    def write(self,path,value):
        path.write_bytes(p.canonical(value));path.chmod(0o600);return p.sha(path.read_bytes())
    def bind_start(self):self.packet['mainStartReceiptSha256']=self.write(Path(self.cfg['startFile']),self.start)
    def valid(self,packet=None,when=None):return self.g.validate(packet or self.packet,self.code,when or self.fx.t,datetime.fromisoformat,legacy.locale,source_profile=self.cfg)
    def run_inputs(self):
        config={'mode':'same-copy-typed-postdata/1','sourceLockSha256':self.cfg['sourceLockSha256'],'windowBindingSha256':self.cfg['windowBindingSha256']}
        digest=p.qualified_code_hash(self.code,config,self.cfg)
        self.packet.update(codeSha256=digest,manifestPath=str(self.fx.archives/'never-manifest.json'))
        self.start.update(codeSha256=digest,attempt=self.packet['attempt'],reviewedSourceCommit=self.packet['reviewedSourceCommit'],windowId=self.packet['windowId'],windowStart=self.packet['windowStart'],windowEnd=self.packet['windowEnd'])
        self.bind_start()
        ap=self.fx.root/('directive-v1-packet-'+self.packet['windowId']+'.json')
        packet_sha=self.write(ap,self.packet)
        # Explicit minimal non-secret header for new run preflight. It does not
        # constitute START or a claim, and is bound to the actual packet bytes.
        keys=('approvedBy','proposalOnly','windowId','windowStart','windowEnd','windowStartMonotonic','attempt','maximumCopies','target','parentCaptureId','manifestSha256','codeSha256','humanAuthorizationSha256','reviewedSourceCommit','parentFailureSha256','mainStartReceiptSha256','actions','retainUntil','noNewCaptureKeyGrantProviderOrE')
        header={k:self.packet[k] for k in keys}
        header.update(version=p.HEADER_VERSION,authorizationDigest=p.AUTHORIZATION,packetSha256=packet_sha,identityPathSha256=p.IDENTITY)
        self.write(ap.with_suffix('.execution-header.json'),header)
        deadline=load('run_deadline',ROOT/'diagnostic-window-deadline.py').shared_runtime()
        if not hasattr(self,'original_budget'):
            self.original_budget=deadline.from_window(self.packet['windowEnd'],datetime.fromisoformat(self.packet['windowStart']),datetime.fromisoformat,anchor=self.packet['windowStartMonotonic'])
        start_budget=self.original_budget
        facade=SimpleNamespace(directiveStartBudget=start_budget,code_hash=lambda:digest,directiveBaseCodeHash=self.code,directiveTypedConfiguration=config,directiveSourceFingerprint=p.fingerprint(self.cfg),diagnostic_deadline=deadline,base=SimpleNamespace(capture=SimpleNamespace(now=lambda:self.fx.t,stamp=datetime.fromisoformat)),locale_profile=legacy.locale)
        return facade,[str(ap),self.packet['manifestPath'],self.fx.identity,'never-plan']
    def refuse_operator_reads(self,path,*args,**kwargs):
        path=Path(path)
        allowed={self.fx.archives/p.authority_name(),self.fx.archives/self.g.filename(self.fx.window,1,'used'),self.fx.archives/self.g.filename(self.fx.window,1,'result')}
        if path not in allowed:
            self.protected_reads.append(str(path));raise ValueError('PROTECTED_OPERATOR_READ_BEFORE_PREFLIGHT')
        return self.original_reader(path,*args,**kwargs)
    def run_refusal(self,expected):
        facade,args=self.run_inputs();self.protected_reads=[];self.original_reader=self.g.read_private
        with patch.object(self.g,'read_private',side_effect=self.refuse_operator_reads),patch.object(self.g,'claim') as claim:
            with self.assertRaisesRegex(ValueError,expected):self.g.run(facade,args,source_profile=self.cfg)
            claim.assert_not_called();self.assertEqual(self.protected_reads,[])
    def test_run_correct_hash_bad_source_has_zero_operator_reads(self):
        facade,args=self.run_inputs();bad=dict(self.raw);bad['context.parentProvidedApiRaw']=b'changed'
        with patch.object(self.g._directive_profile(),'verify_sources',side_effect=lambda:p.verify_sources(bad)),patch.object(self.g,'read_private',wraps=self.g.read_private) as read,patch.object(self.g,'claim') as claim:
            with self.assertRaisesRegex(ValueError,'DIRECTIVE_RAW_PIN_CONFLICT'):self.g.run(facade,args,source_profile=self.cfg)
            read.assert_not_called();claim.assert_not_called()
    def test_run_same_grant_new_uuid_refused_before_operator_reads(self):
        self.g.claim(self.packet,self.code,self.cfg);self.g.finish(self.packet,self.code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS'},self.cfg)
        self.packet['windowId']=str(uuid.uuid4());self.cfg['windowBindingSha256']=p.window_binding(self.packet)
        self.run_refusal('DIRECTIVE_AUTHORIZATION_ALREADY_BOUND')
    def test_run_active_duplicate_refused_before_operator_reads(self):
        self.write(self.fx.archives/self.g.active_name(),{'active':'synthetic'})
        self.run_refusal('DIRECTIVE_CAPTURE_ALREADY_ACTIVE')
    def test_run_expired_window_refused_before_operator_reads(self):
        self.packet['windowStart']=(self.fx.t-timedelta(hours=2)).isoformat();self.packet['windowEnd']=(self.fx.t-timedelta(hours=1)).isoformat()
        self.cfg['windowBindingSha256']=p.window_binding(self.packet)
        self.run_refusal('DIRECTIVE_WINDOW_EXPIRED')
    def test_run_successful_closed_window_refuses_second_before_operator_reads(self):
        self.g.claim(self.packet,self.code,self.cfg);self.g.finish(self.packet,self.code,{'status':'PASS_LOCAL_BUNDLE_RESTORE_ONLY','cleanup':'PASS'},self.cfg)
        facade,args=self.run_inputs()
        self.g._directive_profile().start_budget(facade,json.loads(p.header_path(args[0]).read_text()))
        result=self.fx.archives/self.g.filename(self.fx.window,1,'result')
        self.packet.update(attempt=2,parentFailureSha256=p.sha(result.read_bytes()),reviewedSourceCommit='2'*40)
        self.run_refusal('DIRECTIVE_SECOND_WINDOW_NOT_ELIGIBLE')
    def test_start_budget_cannot_be_replaced_extended_or_omitted(self):
        facade,args=self.run_inputs();header=json.loads(p.header_path(args[0]).read_text());b=facade.directiveStartBudget
        self.assertIs(p.start_budget(facade,header),b)
        for field,value in [('window_end',b.window_end+5),('data_end',b.data_end+5),('reserve',0),('cleanup_seconds',120)]:
            original=getattr(b,field);setattr(b,field,value)
            try:
                with self.subTest(field=field),self.assertRaisesRegex(ValueError,'DIRECTIVE_START_DEADLINE_CONFLICT'):p.start_budget(facade,header)
            finally:setattr(b,field,original)
        facade.directiveStartBudget=None
        with self.assertRaisesRegex(ValueError,'DIRECTIVE_START_BUDGET_REQUIRED'):p.start_budget(facade,header)
        facade.directiveStartBudget=facade.diagnostic_deadline.from_window(self.packet['windowEnd'],datetime.fromisoformat(self.packet['windowStart']),datetime.fromisoformat,anchor=self.packet['windowStartMonotonic'])
        with self.assertRaisesRegex(ValueError,'DIRECTIVE_START_BUDGET_REPLACED'):p.start_budget(facade,header,b)
    def test_second_attempt_requires_live_original_clock_owner(self):
        facade,args=self.run_inputs();header=json.loads(p.header_path(args[0]).read_text())
        header['attempt']=2
        with self.assertRaisesRegex(ValueError,'DIRECTIVE_ORIGINAL_CLOCK_OWNER_UNAVAILABLE'):
            p.start_budget(facade,header)
        header['attempt']=1;b=p.start_budget(facade,header)
        header['attempt']=2
        self.assertIs(p.start_budget(facade,header),b)
        # Same scalars and exact Budget class do not prove an original owner.
        d=facade.diagnostic_deadline
        facade.directiveStartBudget=d.from_window(header['windowEnd'],datetime.fromisoformat(self.packet['windowStart']),datetime.fromisoformat,anchor=header['windowStartMonotonic'])
        with self.assertRaisesRegex(ValueError,'DIRECTIVE_START_PROVENANCE_REQUIRED'):
            p.start_budget(facade,header)
        facade.directiveStartBudget=b
        with patch.object(p.os,'getpid',return_value=-1):
            with self.assertRaisesRegex(ValueError,'DIRECTIVE_START_CREATOR_PROCESS_CONFLICT'):
                p.start_budget(facade,header)
        self.assertIs(p.start_budget(facade,header),b)

    def test_new_factory_cannot_rebind_old_start_header(self):
        facade,args=self.run_inputs();header=json.loads(p.header_path(args[0]).read_text())
        facade.directiveStartBudget,_,_=p.provenance.new_start_budget()
        with self.assertRaisesRegex(ValueError,'DIRECTIVE_START_(DEADLINE_CONFLICT|ORIGIN_BINDING_CONFLICT)'):
            p.start_budget(facade,header)

    def test_pre_registration_fork_and_rebuilt_attempt1_read_nothing(self):
        facade,args=self.run_inputs();d=facade.diagnostic_deadline
        original=facade.directiveStartBudget
        rebuilt=d.from_window(self.packet['windowEnd'],datetime.fromisoformat(self.packet['windowStart']),datetime.fromisoformat,anchor=self.packet['windowStartMonotonic'])
        module=self.g._directive_profile()
        for kind in ('rebuilt','fork'):
            with self.subTest(kind=kind):
                facade.directiveStartBudget=rebuilt if kind=='rebuilt' else original
                with patch.object(p.provenance.os,'getpid',return_value=-1 if kind=='fork' else p.provenance.os.getpid()),patch.object(module,'verify_sources') as sources,patch.object(module,'require_configured') as configured,patch.object(module,'_read_header') as header,patch.object(self.g,'read_private') as private,patch.object(self.g,'open_root') as opened,patch.object(self.g,'claim') as claim:
                    with self.assertRaisesRegex(ValueError,'DIRECTIVE_START_(PROVENANCE_REQUIRED|CREATOR_PROCESS_CONFLICT)'):
                        self.g.run(facade,args,source_profile=self.cfg)
                    for spy in (sources,configured,header,private,opened,claim):spy.assert_not_called()
                core=SimpleNamespace(diagnostic_deadline=d)
                with patch.object(entry,'qualified_hash') as qualified:
                    with self.assertRaisesRegex(ValueError,'DIRECTIVE_START_(PROVENANCE_REQUIRED|CREATOR_PROCESS_CONFLICT)'):
                        if kind=='fork':
                            with patch.object(p.provenance.os,'getpid',return_value=-1):entry.run(core,[],{}, {},start_budget=original)
                        else:entry.run(core,[],{}, {},start_budget=rebuilt)
                    qualified.assert_not_called()

    def test_finalization_delay_and_utc_rollback_cannot_extend_start_mono_end(self):
        d=load('start_cap_budget',ROOT/'diagnostic-window-deadline.py').shared_runtime()
        wall0=datetime.now(timezone.utc);mono=[1000.0];wall=[wall0]
        clock=lambda:mono[0];utc_now=lambda:wall[0]
        with patch.object(d,'monotonic',clock),patch.object(d,'utc_now',utc_now):
            b,anchor,instant=p.provenance.new_start_budget()
            facade=SimpleNamespace(diagnostic_deadline=d,directiveStartBudget=b,base=SimpleNamespace(capture=SimpleNamespace(stamp=datetime.fromisoformat)))
            header={'windowId':str(uuid.uuid4()),'attempt':1,'windowStartMonotonic':anchor,'windowStart':instant.isoformat(),'windowEnd':b.wall_end.isoformat()}
            for elapsed,utc_advance in ((10,5),(120,120),(120,20)):
                mono[0]=1000+elapsed;wall[0]=wall0+timedelta(seconds=utc_advance)
                self.assertIs(p.start_budget(facade,header),b)
                self.assertEqual(b.window_end,4600);self.assertLessEqual(b.remaining(),3480-elapsed)
            mono[0]=4480;wall[0]=wall0+timedelta(seconds=20)
            with self.assertRaises(d.WindowExpired):p.start_budget(facade,header)
    def test_run_header_tamper_rejected_before_human_or_material_reads(self):
        facade,args=self.run_inputs();ap=Path(args[0]);header_path=p.header_path(ap)
        header=json.loads(header_path.read_text());header['packetSha256']='0'*64;self.write(header_path,header)
        original=self.g.read_private;seen=[]
        def read(path,*a,**kw):
            seen.append(Path(path));return original(path,*a,**kw)
        with patch.object(self.g,'read_private',side_effect=read),patch.object(self.g,'claim') as claim:
            with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_EVIDENCE_SHA_CHANGED'):self.g.run(facade,args,source_profile=self.cfg)
            self.assertEqual(seen,[ap]);claim.assert_not_called()
    def test_run_existing_used_slot_rejected_without_packet_read(self):
        self.write(self.fx.archives/self.g.filename(self.fx.window,1,'used'),{'historical':'795-or-consumed'})
        self.run_refusal('DIAGNOSTIC_ALREADY_ACTIVE_OR_CONSUMED')
    def test_valid_attempt2_reaches_original_causal_guard_not_material(self):
        self.g.claim(self.packet,self.code,self.cfg);self.g.finish(self.packet,self.code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS'},self.cfg)
        facade,args=self.run_inputs()
        self.g._directive_profile().start_budget(facade,json.loads(p.header_path(args[0]).read_text()))
        result=self.fx.archives/self.g.filename(self.fx.window,1,'result')
        self.packet.update(attempt=2,parentFailureSha256=p.sha(result.read_bytes()),reviewedSourceCommit='2'*40)
        self.cfg['startFile']=str(self.fx.root/('directive-v1-start-'+self.fx.window+'-2.json'))
        facade,args=self.run_inputs();original=self.g.read_private;seen=[]
        def read(path,*a,**kw):
            seen.append(Path(path));return original(path,*a,**kw)
        with patch.object(self.g,'read_private',side_effect=read),patch.object(self.g,'claim') as claim:
            with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_FIXED_FAILURE_REVIEW_REQUIRED'):self.g.run(facade,args,source_profile=self.cfg)
            self.assertNotIn(Path(args[1]),seen);self.assertNotIn(Path(args[2]),seen);claim.assert_not_called()
    def test_preflight_serializes_duplicate_runs_without_consumption(self):
        facade,args=self.run_inputs();environment=SimpleNamespace(ROOT=self.g.ROOT,ARCHIVES=self.g.ARCHIVES,RETAIN=self.g.RETAIN,ACTIONS=self.g.ACTIONS,PRESERVED_KEYS=self.g.PRESERVED_KEYS,read_private=self.g.read_private,open_root=self.g.open_root,active_name=self.g.active_name,filename=self.g.filename,canonical_uuid=self.g.canonical_uuid,binding_keys=self.g.bindings)
        module=self.g._directive_profile()
        with module.run_preflight(environment,facade,args,self.cfg) as lease:
            self.assertEqual(module.lease_header(lease,facade,args,self.cfg)['windowId'],self.fx.window)
            self.run_refusal('DIRECTIVE_PREFLIGHT_BUSY')
            self.assertFalse((self.fx.archives/p.authority_name()).exists())
            self.assertFalse((self.fx.archives/self.g.active_name()).exists())
        with module.run_preflight(environment,facade,args,self.cfg):pass
    def test_valid_run_binds_packet_and_releases_short_lock_after_atomic_claim(self):
        self.packet.update(replayMode='synthetic-candidate',replayManifestSha256='7'*64)
        facade,args=self.run_inputs();reader=self.g.read_private;calls=[]
        manifest={'verification':{'databaseFacts':{'encoding':'UTF8','collate':'en_US.UTF-8','ctype':'en_US.UTF-8','localeProvider':'i'}}}
        def read(path,*a,**kw):
            if Path(path)==Path(args[1]):
                self.assertEqual(a[0],self.g.MANIFEST_SHA);return manifest,self.g.MANIFEST_SHA
            return reader(path,*a,**kw)
        facade.verify_manifest=lambda value:self.assertIs(value,manifest)
        facade.replay=SimpleNamespace(CANDIDATE_MODE='synthetic-candidate',CANDIDATE_MANIFEST_HASH='7'*64,load_plan=lambda path:({'mode':'synthetic-candidate'},[]))
        facade.base.code_hash=lambda:'8'*64
        facade.base.validate_approval=lambda *a:calls.append('base-preflight')
        facade.base.run=lambda *a:b'FileVault is On.'
        def restore(*a,**kw):
            import os,fcntl
            self.assertTrue((self.fx.archives/p.authority_name()).exists())
            self.assertTrue((self.fx.archives/self.g.filename(self.fx.window,1,'used')).exists())
            fd=os.open(self.fx.archives/('diagnostic-parent-'+p.CAPTURE+'.preflight.lock'),os.O_RDWR)
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            finally:os.close(fd)
            self.assertIs(kw['window_budget'],facade.directiveStartBudget)
            calls.append('restore-stub');return {'status':'PASS_LOCAL_BUNDLE_RESTORE_ONLY','cleanup':'PASS'}
        facade.restore_bundle=restore
        with patch.object(self.g,'read_private',side_effect=read),patch.object(facade.diagnostic_deadline,'from_window',side_effect=AssertionError('must reuse START Budget')):result=self.g.run(facade,args,source_profile=self.cfg)
        self.assertEqual(result['status'],'PASS_LOCAL_BUNDLE_RESTORE_ONLY')
        self.assertEqual(calls,['base-preflight','base-preflight','restore-stub'])
        self.assertFalse((self.fx.archives/self.g.active_name()).exists())
        self.assertTrue((self.fx.archives/p.authority_name()).exists())
    def test_forged_internal_preflight_token_cannot_read_operator(self):
        facade,args=self.run_inputs()
        with patch.object(self.g,'read_private') as read:
            with self.assertRaises(ValueError):self.g._run_after_preflight(facade,args,self.cfg,SimpleNamespace(verified=True))
            read.assert_not_called()
    def test_valid_profile_uses_unchanged_window_contract(self):
        self.assertEqual(self.valid()['icuLocale'],'en-US')
        self.assertEqual(self.g.BESTJ_QUESTION_MESSAGE_ID,'Sentinel_90d9e98b22488191ac8a1eb87cff898e')
        for key,value in [('maximumCopies',1),('attempt',3),('target','wrong'),('parentCaptureId',str(uuid.uuid4())),('identityPath','wrong-reference'),('codeSha256','b'*64)]:
            with self.subTest(field=key),self.assertRaises(ValueError):self.valid({**self.packet,key:value})
        with self.assertRaises(ValueError):self.valid(when=self.fx.t+timedelta(minutes=31))
    def test_bad_profile_material_source_image_count_rejects_before_operator_reads(self):
        variants=[('captureId','wrong'),('manifestSha256','0'*64),('identityPathSha256','0'*64),('runtimeImage','sha256:'+'0'*64),('sourceLockSha256','0'*64),('profileLockSha256','0'*64),('localOnly',False),('version','legacy90d'),('authorizationDigest','0'*64),('scope',{**p.SCOPE,'maximumCopies':1})]
        for key,value in variants:
            with self.subTest(field=key),patch.object(self.g,'read_private') as read,patch.object(self.g,'claim') as claim:
                with self.assertRaises(ValueError):self.g.run(None,['NEVER']*4,source_profile={**self.cfg,key:value})
                read.assert_not_called();claim.assert_not_called()
    def test_direct_gate_cannot_use_unsalted_old_code_hash(self):
        config={'mode':'same-copy-typed-postdata/1','sourceLockSha256':self.cfg['sourceLockSha256'],'windowBindingSha256':self.cfg['windowBindingSha256']}
        facade=SimpleNamespace(diagnostic_deadline=load('hash_guard_budget',ROOT/'diagnostic-window-deadline.py').shared_runtime(),directiveStartBudget=self.original_budget,code_hash=lambda:self.code,directiveBaseCodeHash=self.code,directiveTypedConfiguration=config,directiveSourceFingerprint=p.fingerprint(self.cfg))
        with patch.object(self.g,'read_private') as read,patch.object(self.g,'claim') as claim:
            with self.assertRaisesRegex(ValueError,'DIRECTIVE_QUALIFIED_CODE_HASH_CONFLICT'):self.g.run(facade,['NEVER']*4,source_profile=self.cfg)
            read.assert_not_called();claim.assert_not_called()
    def test_fake_context_old90d_and_null_rewrite_cannot_qualify(self):
        for field in ('old-context','old-model-directive','fake-reply','fake-native'):
            human=copy.deepcopy(self.human)
            if field=='old-context':human['sourceEvidence']['contexts'][0]['messageId']='Sentinel_90d9e98b22488191ac8a1eb87cff898e'
            elif field=='old-model-directive':human['sourceEvidence']['directives'][0]['messageId']='Sentinel_2a9bb5b4e52c8191bcad390653b70c78'
            elif field=='fake-reply':human['sourceEvidence']['directives'][1]['replyTo']='invented'
            else:human['sourceEvidence']['nativeFirstHops'][0]['nativeName']='send_message_to_thread'
            with self.subTest(field=field),self.assertRaises(ValueError):p.validate_record(human,self.cfg)
    def test_same_authorization_cannot_start_another_window_and_marker_persists(self):
        self.valid();self.g.claim(self.packet,self.code,self.cfg)
        auth=self.fx.archives/p.authority_name();original=auth.read_bytes()
        self.g.finish(self.packet,self.code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS'},self.cfg)
        self.assertFalse((self.fx.archives/self.g.active_name()).exists());self.assertEqual(auth.read_bytes(),original)
        self.assertTrue((self.fx.archives/self.g.filename(self.fx.window,1,'used')).exists())
        with self.assertRaises(ValueError):self.g.claim(self.packet,self.code,self.cfg)
        changed={**self.packet,'windowId':str(uuid.uuid4())};cfg=copy.deepcopy(self.cfg)
        cfg['windowBindingSha256']=p.window_binding(changed)
        human={**self.human,'windowId':changed['windowId'],'windowBindingSha256':cfg['windowBindingSha256']}
        cfg['humanRecord']['path']=str(self.fx.root/('directive-v1-human-'+changed['windowId']+'.json'))
        cfg['humanRecord']['sha256']=self.write(Path(cfg['humanRecord']['path']),human)
        changed['humanAuthorizationSha256']=cfg['humanRecord']['sha256']
        cfg['startFile']=str(self.fx.root/('directive-v1-start-'+changed['windowId']+'-1.json'))
        start={**self.start,'windowId':changed['windowId'],'humanAuthorizationSha256':cfg['humanRecord']['sha256']}
        changed['mainStartReceiptSha256']=self.write(Path(cfg['startFile']),start)
        self.g.validate(changed,self.code,self.fx.t,datetime.fromisoformat,legacy.locale,source_profile=cfg)
        with self.assertRaisesRegex(ValueError,'DIRECTIVE_AUTHORIZATION_ALREADY_BOUND'):self.g.claim(changed,self.code,cfg)
        self.assertFalse((self.fx.archives/self.g.active_name()).exists());self.assertEqual(auth.read_bytes(),original)
    def test_simultaneous_duplicate_start_only_one_claims(self):
        def call():
            try:self.g.claim(self.packet,self.code,self.cfg);return 'claimed'
            except ValueError:return 'rejected'
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:call(),range(2)))
        self.assertEqual(sorted(results),['claimed','rejected'])
        self.assertTrue((self.fx.archives/p.authority_name()).exists())
        self.g.finish(self.packet,self.code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS'},self.cfg)
    def test_bad_claim_frame_rejects_before_archive_root_open(self):
        for key,value in [('parentCaptureId','wrong'),('identityPath','wrong'),('codeSha256','b'*64),('attempt',3),('maximumCopies',1),('windowId','795')]:
            with self.subTest(field=key),patch.object(self.g,'open_root') as opened:
                with self.assertRaises(ValueError):self.g.claim({**self.packet,key:value},self.code,self.cfg)
                opened.assert_not_called()
    def test_unknown_cleanup_keeps_original_active_guard(self):
        self.g.claim(self.packet,self.code,self.cfg)
        self.g.finish(self.packet,self.code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'UNKNOWN'},self.cfg)
        self.assertTrue((self.fx.archives/self.g.active_name()).exists())
        with self.assertRaises(ValueError):self.g.claim({**self.packet,'attempt':2},self.code,self.cfg)
    def test_second_attempt_still_requires_real_causal_repair(self):
        self.g.claim(self.packet,self.code,self.cfg);self.g.finish(self.packet,self.code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS'},self.cfg)
        result=self.fx.archives/self.g.filename(self.fx.window,1,'result')
        self.code='b'*64;self.packet.update(attempt=2,codeSha256=self.code,reviewedSourceCommit='2'*40,parentFailureSha256=p.sha(result.read_bytes()))
        self.start.update(attempt=2,codeSha256=self.code,reviewedSourceCommit='2'*40)
        self.cfg['startFile']=str(self.fx.root/('directive-v1-start-'+self.fx.window+'-2.json'));self.bind_start()
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_FIXED_FAILURE_REVIEW_REQUIRED'):self.valid()
    def test_existing_used_slot_is_not_reset(self):
        used=self.fx.archives/self.g.filename(self.fx.window,1,'used');used.write_text('{"historical":"used"}');used.chmod(0o600)
        before=used.read_bytes()
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_ALREADY_ACTIVE_OR_CONSUMED'):self.g.claim(self.packet,self.code,self.cfg)
        self.assertEqual(used.read_bytes(),before);self.assertFalse((self.fx.archives/p.authority_name()).exists())
    def test_entry_qualified_hash_binds_real_profile_and_keeps_original_budget(self):
        d=load('entry_budget',ROOT/'diagnostic-window-deadline.py').shared_runtime()
        core=SimpleNamespace(code_hash=lambda:self.code,diagnostic_window=self.g,diagnostic_deadline=d)
        start_budget=self.original_budget
        config={'mode':'same-copy-typed-postdata/1','sourceLockSha256':self.cfg['sourceLockSha256'],'windowBindingSha256':self.cfg['windowBindingSha256']}
        digest=entry.qualified_hash(core,config,self.cfg)
        self.assertNotEqual(digest,self.code)
        with self.assertRaises(ValueError):entry.qualified_hash(core,{**config,'windowBindingSha256':'0'*64},self.cfg)
        with patch.object(self.g,'run',return_value={'fixture':True}) as gate,patch.object(entry.profile,'verify_sources',return_value=self.view):
            core.base=None;core.locale_profile=None;core.verify_manifest=None;core.replay=None
            self.assertEqual(entry.run(core,[],config,self.cfg,start_budget=start_budget),{'fixture':True})
            self.assertEqual(gate.call_args.kwargs['source_profile'],self.cfg)
            self.assertEqual(gate.call_args.args[0].directiveSourceFingerprint,entry.profile.fingerprint(self.cfg))

if __name__=='__main__':unittest.main(verbosity=2)
