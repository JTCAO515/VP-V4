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
        original_sha=self.g.sha
        # The actual identity path is intentionally unavailable/unread. Map one
        # synthetic fixture reference only; other/wrong paths use real SHA256.
        self.hash_patch=patch.object(self.g,'sha',side_effect=lambda raw:p.IDENTITY if raw==self.fx.identity.encode() else original_sha(raw))
        self.hash_patch.start();self.addCleanup(self.hash_patch.stop)
        self.cfg={'version':p.VERSION,'authorizationDigest':p.AUTHORIZATION,'humanRecord':{'path':str(self.fx.root/('directive-v1-human-'+self.fx.window+'.json')),'sha256':'0'*64},'startFile':str(self.fx.root/('directive-v1-start-'+self.fx.window+'-1.json')),'identityPathSha256':p.IDENTITY,'preservedPins':self.fx.pins,'sourceLockSha256':p.sha((ROOT/'container-diagnostic/restore/source-lock.json').read_bytes()),'profileLockSha256':p.sha((HERE/'source-lock.json').read_bytes()),'windowBindingSha256':p.window_binding(self.fx.packet),'runtimeImage':p.IMAGE,'captureId':p.CAPTURE,'manifestSha256':p.MANIFEST,'scope':copy.deepcopy(p.SCOPE),'localOnly':True}
        self.human={'status':'DIRECTIVE_SCOPE_QUALIFIED_NOT_EXECUTED','profileVersion':p.VERSION,'fileDoesNotSelfAuthorize':True,'sourceEvidence':self.view,'windowId':self.fx.window,'windowBindingSha256':p.window_binding(self.fx.packet),'target':self.g.TARGET,'parentCaptureId':p.CAPTURE,'manifestSha256':p.MANIFEST,'identityPathSha256':p.IDENTITY,'scope':copy.deepcopy(p.SCOPE),'localOnly':True,'runtimeImage':p.IMAGE}
        self.cfg['humanRecord']['sha256']=self.write(Path(self.cfg['humanRecord']['path']),self.human)
        self.packet=copy.deepcopy(self.fx.packet);self.packet['humanAuthorizationSha256']=self.cfg['humanRecord']['sha256']
        self.start=copy.deepcopy(self.fx.start);self.start.update(humanAuthorizationSha256=self.cfg['humanRecord']['sha256'],identityPathSha256=p.IDENTITY)
        self.bind_start()
        # Source projection was actually verified once above. Integration cases
        # reuse that proof and test the unchanged window/claim algorithm only.
        module=self.g._directive_profile()
        self.source_patch=patch.object(module,'verify_sources',return_value=self.view);self.source_patch.start();self.addCleanup(self.source_patch.stop)
    def write(self,path,value):
        path.write_bytes(p.canonical(value));path.chmod(0o600);return p.sha(path.read_bytes())
    def bind_start(self):self.packet['mainStartReceiptSha256']=self.write(Path(self.cfg['startFile']),self.start)
    def valid(self,packet=None,when=None):return self.g.validate(packet or self.packet,self.code,when or self.fx.t,datetime.fromisoformat,legacy.locale,source_profile=self.cfg)
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
        facade=SimpleNamespace(code_hash=lambda:self.code,directiveBaseCodeHash=self.code,directiveTypedConfiguration=config,directiveSourceFingerprint=p.fingerprint(self.cfg))
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
        core=SimpleNamespace(code_hash=lambda:self.code,diagnostic_window=self.g,diagnostic_deadline=SimpleNamespace(Budget=object))
        config={'mode':'same-copy-typed-postdata/1','sourceLockSha256':self.cfg['sourceLockSha256'],'windowBindingSha256':self.cfg['windowBindingSha256']}
        digest=entry.qualified_hash(core,config,self.cfg)
        self.assertNotEqual(digest,self.code)
        with self.assertRaises(ValueError):entry.qualified_hash(core,{**config,'windowBindingSha256':'0'*64},self.cfg)
        with patch.object(self.g,'run',return_value={'fixture':True}) as gate,patch.object(entry.profile,'verify_sources',return_value=self.view):
            core.base=None;core.locale_profile=None;core.verify_manifest=None;core.replay=None
            self.assertEqual(entry.run(core,[],config,self.cfg),{'fixture':True})
            self.assertEqual(gate.call_args.kwargs['source_profile'],self.cfg)
            self.assertEqual(gate.call_args.args[0].directiveSourceFingerprint,entry.profile.fingerprint(self.cfg))

if __name__=='__main__':unittest.main(verbosity=2)
