import copy
from contextlib import ExitStack
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone,timedelta
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent


def load(name):
    s=importlib.util.spec_from_file_location(name,HERE/(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


d=load('reviewed-diagnostic-window');locale=load('owned-locale-profile')


class DiagnosticWindow(unittest.TestCase):
    def setUp(self):
        self.stack=ExitStack();self.addCleanup(self.stack.close)
        tmp=self.stack.enter_context(tempfile.TemporaryDirectory(dir=HERE.parents[1]/'artifacts/QAWEB/staging-replay',prefix='future-window-test-'))
        self.root=Path(tmp);self.archives=self.root/'archives';self.archives.mkdir(mode=0o700);os.chmod(self.root,0o700)
        for name,value in [('ROOT',self.root),('ARCHIVES',self.archives),('HUMAN_FILE',self.root/'new-human.json'),('START_FILE',self.root/'new-start.json')]:self.stack.enter_context(patch.object(d,name,value))
        self.t=datetime.now(timezone.utc);self.code='a'*64;self.commit='1'*40;self.window=str(uuid.uuid4())
        self.identity=str(self.root/'same-identity-never-read');identity_sha=d.sha(self.identity.encode())
        old_start={'status':'MAIN_REVIEWED_EXECUTION_START','approvalId':d.CAPTURE_ID,'target':d.TARGET,'humanAuthorizationRecordSha256':d.OLD_HUMAN_SHA,'validFrom':(self.t-timedelta(hours=2)).isoformat(),'validUntil':(self.t-timedelta(hours=1)).isoformat(),'codeHashes':{'capture':'c'*64,'restore-replay':'e'*64}}
        retry_start={**old_start,'codeHashes':{'restore-replay-retry':'f'*64}}
        pins={}
        for name,value in [('originalStart',old_start),('retry1Start',retry_start)]:
            path,digest=self.write(name+'.json',value);pins[name]={'path':path,'sha256':digest}
        capture={'approvalId':d.CAPTURE_ID,'mode':'shared-readonly-snapshot/1','codeSha256':'c'*64}
        claim={'status':'CONSUMED_BEFORE_ARCHIVE_READ','approvalId':d.CAPTURE_ID,'target':d.TARGET,'manifestSha256':d.MANIFEST_SHA,'stage':'restore-replay','codeSha256':'e'*64}
        retry_claim={**claim,'stage':'restore-replay-retry-1','codeSha256':'f'*64}
        for name,value in [('captureClaim',capture),('restoreClaim',claim),('retry1Claim',retry_claim)]:
            filename={'captureClaim':'approval-'+d.CAPTURE_ID+'.used.json','restoreClaim':'approval-'+d.CAPTURE_ID+'.restore-replay.used.json','retry1Claim':'approval-'+d.CAPTURE_ID+'.restore-replay-retry-1.used.json'}[name]
            path,digest=self.write(filename,value,parent=self.archives);pins[name]={'path':path,'sha256':digest}
        for name,c,start in [('initialFailure',claim,'originalStart'),('retry1Failure',retry_claim,'retry1Start')]:
            value={'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS','oneTimeRestoreClaim':c,'directHumanAuthorization':{'mainStartReceiptSha256':pins[start]['sha256']}}
            path,digest=self.write(name+'.json',value);pins[name]={'path':path,'sha256':digest}
        self.pins=pins;self.old_bytes={name:Path(pin['path']).read_bytes() for name,pin in pins.items()}
        question=['request_user_input_async','fixture-new-direct-human-question',0]
        human={'status':'DIRECT_HUMAN_DIAGNOSTIC_WINDOW_APPROVED_NOT_EXECUTED','source':'Direct current Main conversation request_user_input_async reply','questionItemId':question,'humanQuestion':'fixture new60min max2 same capture no DDL arrangements','humanAnswer':'fixture approval','fileDoesNotSelfAuthorize':True,'windowId':self.window,'target':d.TARGET,'parentCaptureId':d.CAPTURE_ID,'manifestSha256':d.MANIFEST_SHA,'identityPathSha256':identity_sha,'scope':{'minutes':60,'maximumCopies':2,'noOtherPlannedDdlChanges':True,'ordinaryDmlContinues':True,'reuseOriginalCapture':True,'localRehearsalAfterFullRestorePass':True,'newCapture':False,'newIdentity':False,'newLiveGrants':False,'provider':False,'targetE':False}}
        _,human_sha=self.write('new-human.json',human)
        for name,value in [('HUMAN_SHA256',human_sha),('QUESTION_ITEM_ID',question),('IDENTITY_PATH_SHA256',identity_sha),('PRESERVED_PINS',pins)]:self.stack.enter_context(patch.object(d,name,value))
        meta={'sourceProject':d.TARGET,'database':'postgres','owner':'postgres','serverVersion':'17.6','observedAt':self.t.isoformat(),'captureManifestSha256':d.MANIFEST_SHA,'captureApprovalId':d.CAPTURE_ID,'targetWritten':False,'userRowsRead':False,'encoding':'UTF8','collate':'en_US.UTF-8','ctype':'en_US.UTF-8','localeProvider':'i','locale':'en-US','icuRules':None,'collationVersion':'153.121','actualCollationVersion':'153.121'}
        meta_path,meta_sha=self.write('locale.json',meta)
        self.packet={'approvedBy':'JT','proposalOnly':False,'actions':d.ACTIONS,'windowId':self.window,'attempt':1,'maximumCopies':2,'target':d.TARGET,'parentCaptureId':d.CAPTURE_ID,'manifestSha256':d.MANIFEST_SHA,'codeSha256':self.code,'identityPath':self.identity,'retainUntil':d.RETAIN,'noNewCaptureKeyGrantProviderOrE':True,'windowStart':self.t.isoformat(),'windowEnd':(self.t+timedelta(hours=1)).isoformat(),'reviewedSourceCommit':self.commit,'humanAuthorizationSha256':human_sha,'parentFailureSha256':pins['retry1Failure']['sha256'],'localeSupplementPath':meta_path,'localeSupplementSha256':meta_sha}
        self.start={'actions':d.ACTIONS,'status':'MAIN_REVIEWED_DIAGNOSTIC_WINDOW_START','issuedBy':'Main','humanAuthorizationSha256':human_sha,'windowId':self.window,'attempt':1,'target':d.TARGET,'codeSha256':self.code,'parentCaptureId':d.CAPTURE_ID,'manifestSha256':d.MANIFEST_SHA,'identityPathSha256':identity_sha,'maximumCopies':2,'noActualAttemptInFlight':True,'preservedEvidenceDigest':d.preserved_digest(),'windowStart':self.packet['windowStart'],'windowEnd':self.packet['windowEnd'],'reviewedSourceCommit':self.commit,'localeSupplementSha256':meta_sha,'sameCapturePointLocaleUnchanged':True}
        self.rebind()

    def write(self,name,value,parent=None):
        p=(parent or self.root)/name;p.write_text(json.dumps(value,sort_keys=True));p.chmod(0o600);return str(p),d.sha(p.read_bytes())

    def rebind(self):_,self.packet['mainStartReceiptSha256']=self.write('new-start.json',self.start)

    def valid(self,packet=None,code=None,when=None):return d.validate(packet or self.packet,code or self.code,when or self.t,datetime.fromisoformat,locale)

    def bestj_record(self):
        human=json.loads(d.HUMAN_FILE.read_text());evidence=[];receipts=[];upstream=None
        for index,(sender,target) in enumerate(((d.BESTJ_THREAD_ID,d.MAC_RELAY_THREAD_ID),(d.MAC_RELAY_THREAD_ID,d.MAIN_THREAD_ID))):
            value={'origin':'official_received_codex_delegation','toolName':'send_message_to_thread','sourceThreadId':sender,'targetThreadId':target,'originalHumanSourceThreadId':d.BESTJ_THREAD_ID,'originalQuestionItemId':d.QUESTION_ITEM_ID,'originalHumanQuestion':human['humanQuestion'],'originalHumanAnswer':human['humanAnswer'],'authorizer':'JT','relayIsAuthorization':False,'upstreamRelayEvidenceSha256':upstream}
            path,digest=self.write('official-relay-'+str(index)+'.json',value)
            evidence.append(value);receipts.append({'path':path,'sha256':digest});upstream=digest
        human.update(source=d.BESTJ_RELAY_SOURCE,sourceThreadId=d.BESTJ_THREAD_ID,relayThreadId=d.MAC_RELAY_THREAD_ID,relayTargetThreadId=d.MAIN_THREAD_ID,authorizer='JT',relayIsAuthorization=False,officialRelayEvidence=receipts)
        return human,evidence

    def pin_human_for_source_test(self,human):
        _,digest=self.write('new-human.json',human)
        self.stack.enter_context(patch.object(d,'HUMAN_SHA256',digest))
        self.packet['humanAuthorizationSha256']=digest;self.start['humanAuthorizationSha256']=digest;self.rebind()

    def test_human_sources_main_direct_and_fixed_bestj_official_relay(self):
        self.valid()
        human,evidence=self.bestj_record();self.pin_human_for_source_test(human);self.valid()

    def test_main_direct_accepts_absent_or_consistent_optional_metadata(self):
        self.valid()
        human=json.loads(d.HUMAN_FILE.read_text())
        human.update(authorizer='JT',relayIsAuthorization=False,sourceThreadId=d.MAIN_THREAD_ID,relayTargetThreadId=d.MAIN_THREAD_ID)
        self.pin_human_for_source_test(human);self.valid()

    def test_main_direct_rejects_explicit_authorizer_or_relay_contradictions(self):
        human=json.loads(d.HUMAN_FILE.read_text())
        for field,value in [('authorizer','BestJ'),('authorizer',None),('relayIsAuthorization',True),('relayIsAuthorization',0),('relayIsAuthorization','False'),('relayIsAuthorization',None),('relayThreadId',d.MAC_RELAY_THREAD_ID),('relayThreadId',d.MAIN_THREAD_ID),('relayThreadId',None),('officialRelayEvidence',[]),('officialRelayEvidence',None)]:
            with self.subTest(field=field,value=value):
                self.pin_human_for_source_test({**human,field:value})
                with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_DIRECT_MAIN_SOURCE_CONFLICT'):self.valid()

    def test_main_direct_source_metadata_cannot_claim_a_foreign_thread(self):
        original=json.loads(d.HUMAN_FILE.read_text())
        for field,value in [('sourceThreadId',d.MAC_RELAY_THREAD_ID),('sourceThreadId',d.BESTJ_THREAD_ID),('relayTargetThreadId',str(uuid.uuid4()))]:
            self.pin_human_for_source_test({**original,field:value})
            with self.subTest(field=field,value=value),self.assertRaisesRegex(ValueError,'DIAGNOSTIC_DIRECT_MAIN_SOURCE_CONFLICT'):self.valid()

    def test_bestj_human_source_rejects_foreign_thread_target_or_owner_authorization(self):
        original,_=self.bestj_record()
        for field,value in [('sourceThreadId',str(uuid.uuid4())),('sourceThreadId',d.MAC_RELAY_THREAD_ID),('relayThreadId',str(uuid.uuid4())),('relayTargetThreadId',str(uuid.uuid4())),('source','arbitrary owner relay'),('authorizer','BestJ'),('relayIsAuthorization',True),('humanQuestion',''),('humanQuestion','  '),('humanAnswer',''),('questionItemId',['request_user_input_async','old-question',0]),('questionItemId',['request_user_input_async','call_xeZ1HzPXM8vRQalSkY7wGJHz',0])]:
            with self.subTest(field=field,value=value):
                self.pin_human_for_source_test({**original,field:value})
                with self.assertRaises(ValueError):self.valid()

    def test_bestj_relay_evidence_requires_official_full_exact_original_reply(self):
        human,original=self.bestj_record()
        for hop in (0,1):
            for field,value in [('origin','owner-written-note'),('toolName','non-official-message'),('sourceThreadId',str(uuid.uuid4())),('targetThreadId',str(uuid.uuid4())),('originalHumanSourceThreadId',d.MAC_RELAY_THREAD_ID),('originalQuestionItemId',['request_user_input_async','old-question',0]),('originalHumanQuestion','summary only'),('originalHumanAnswer','BestJ approved'),('authorizer','BestJ'),('relayIsAuthorization',True),('upstreamRelayEvidenceSha256','0'*64)]:
                with self.subTest(hop=hop,field=field,value=value):
                    receipts=copy.deepcopy(human['officialRelayEvidence'])
                    path,digest=self.write('official-relay-'+str(hop)+'.json',{**original[hop],field:value})
                    receipts[hop]={'path':path,'sha256':digest}
                    self.pin_human_for_source_test({**human,'officialRelayEvidence':receipts})
                    with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_OFFICIAL_RELAY_FULL_HUMAN_REPLY_REQUIRED'):self.valid()
                    self.write('official-relay-'+str(hop)+'.json',original[hop])
        self.pin_human_for_source_test({k:v for k,v in human.items() if k!='officialRelayEvidence'})
        with self.assertRaises(ValueError):self.valid()

    def test_bestj_relay_rejects_missing_reordered_or_changed_official_hop(self):
        human,evidence=self.bestj_record()
        for receipts in [human['officialRelayEvidence'][:1],list(reversed(human['officialRelayEvidence'])),human['officialRelayEvidence']*2]:
            self.pin_human_for_source_test({**human,'officialRelayEvidence':receipts})
            with self.assertRaises(ValueError):self.valid()
        self.pin_human_for_source_test(human)
        p=Path(human['officialRelayEvidence'][0]['path']);p.write_text(p.read_text()+' ')
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_EVIDENCE_SHA_CHANGED'):self.valid()

    def test_bestj_self_written_record_without_new_real_pins_cannot_enable(self):
        human,evidence=self.bestj_record();self.write('new-human.json',human)
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_EVIDENCE_SHA_CHANGED'):self.valid()
        with patch.object(d,'HUMAN_SHA256',None),patch.object(d,'read_private',side_effect=AssertionError('NO IO')):
            with self.assertRaisesRegex(ValueError,'NEW_DIAGNOSTIC_HUMAN_PINS_UNCONFIGURED'):self.valid()
        with patch.object(d,'HUMAN_SHA256',d.OLD_HUMAN_SHA):
            with self.assertRaisesRegex(ValueError,'NEW_DIAGNOSTIC_HUMAN_PINS_UNCONFIGURED'):self.valid()

    def ordinary_bestj_record(self):
        human,evidence=self.bestj_record()
        question='Sentinel_90d9e98b22488191ac8a1eb87cff898e';answer='Sentinel_'+'a'*32;room='6acd9506863c81958e1176881961131c'
        self.stack.enter_context(patch.object(d,'QUESTION_ITEM_ID',None))
        self.stack.enter_context(patch.object(d,'QUESTION_MESSAGE_ID',question,create=True))
        self.stack.enter_context(patch.object(d,'ANSWER_MESSAGE_ID',answer,create=True))
        receipts=[];upstream=None
        for i,record in enumerate(evidence):
            record.pop('originalQuestionItemId')
            record.update(originalQuestionMessageId=question,originalAnswerMessageId=answer,originalRoomId=room,originalQuestionTransport='user_message.send_message',upstreamRelayEvidenceSha256=upstream)
            path,digest=self.write('ordinary-relay-'+str(i)+'.json',record)
            receipts.append({'path':path,'sha256':digest});upstream=digest
        human.pop('questionItemId')
        human.update(source=getattr(d,'BESTJ_MESSAGE_SOURCE','Direct JT reply to fixed BestJ user_message.send_message question via official BestJ-to-Mac-to-Main relay'),questionMessageId=question,answerMessageId=answer,roomId=room,officialRelayEvidence=receipts)
        return human,evidence

    def test_ordinary_bestj_message_shape_accepts_no_async_question_item(self):
        human,evidence=self.ordinary_bestj_record();self.assertNotIn('questionItemId',human)
        self.pin_human_for_source_test(human);self.valid()

    def test_ordinary_message_rejects_foreign_refs_missing_answer_and_fake_async(self):
        original,_=self.ordinary_bestj_record()
        for field,value in [('roomId','foreign-room'),('sourceThreadId',d.MAC_RELAY_THREAD_ID),('relayThreadId',str(uuid.uuid4())),('relayTargetThreadId',str(uuid.uuid4())),('questionMessageId','Sentinel_'+'b'*32),('answerMessageId',None),('answerMessageId',original['questionMessageId']),('humanQuestion',''),('humanAnswer',''),('authorizer','BestJ'),('relayIsAuthorization',True),('questionItemId',None),('questionItemId',['request_user_input_async','invented',0])]:
            with self.subTest(field=field,value=value):
                self.pin_human_for_source_test({**original,field:value})
                with self.assertRaises(ValueError):self.valid()

    def test_ordinary_receipts_require_both_original_messages_room_and_complete_reply(self):
        human,original=self.ordinary_bestj_record()
        for hop in (0,1):
            for field,value in [('originalQuestionMessageId','Sentinel_'+'b'*32),('originalAnswerMessageId',None),('originalAnswerMessageId',human['questionMessageId']),('originalRoomId','foreign-room'),('originalQuestionTransport','request_user_input_async'),('originalHumanQuestion','summary'),('originalHumanAnswer','BestJ opinion'),('originalHumanSourceThreadId',d.MAC_RELAY_THREAD_ID),('targetThreadId',str(uuid.uuid4())),('toolName','owner-relay'),('upstreamRelayEvidenceSha256','0'*64),('originalQuestionItemId',None)]:
                with self.subTest(hop=hop,field=field):
                    receipts=copy.deepcopy(human['officialRelayEvidence'])
                    path,digest=self.write('ordinary-relay-'+str(hop)+'.json',{**original[hop],field:value});receipts[hop]={'path':path,'sha256':digest}
                    self.pin_human_for_source_test({**human,'officialRelayEvidence':receipts})
                    with self.assertRaises(ValueError):self.valid()
                    self.write('ordinary-relay-'+str(hop)+'.json',original[hop])
        for receipts in [human['officialRelayEvidence'][:1],list(reversed(human['officialRelayEvidence']))]:
            self.pin_human_for_source_test({**human,'officialRelayEvidence':receipts})
            with self.assertRaises(ValueError):self.valid()
        self.pin_human_for_source_test(human)
        p=Path(human['officialRelayEvidence'][0]['path']);p.write_text(p.read_text()+' ')
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_EVIDENCE_SHA_CHANGED'):self.valid()

    def test_ordinary_pins_are_distinct_and_cannot_enable_async_or_old_auth(self):
        human,_=self.ordinary_bestj_record()
        for source in [d.DIRECT_MAIN_SOURCE,d.BESTJ_RELAY_SOURCE]:
            self.pin_human_for_source_test({**human,'source':source,'questionItemId':['request_user_input_async','invented',0]})
            with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_ASYNC_REFERENCES_REQUIRED'):self.valid()
        self.pin_human_for_source_test(human)
        for answer in [None,human['questionMessageId'],'not-a-real-Sentinel-reference']:
            with patch.object(d,'ANSWER_MESSAGE_ID',answer),self.assertRaisesRegex(ValueError,'NEW_DIAGNOSTIC_HUMAN_PINS_UNCONFIGURED'):self.valid()
        with patch.object(d,'QUESTION_ITEM_ID',['request_user_input_async','invented',0]),self.assertRaises(ValueError):self.valid()
        with patch.object(d,'HUMAN_SHA256',d.OLD_HUMAN_SHA),self.assertRaises(ValueError):self.valid()

    def test_ordinary_owner_written_record_needs_real_pins_and_accepted_not_approval(self):
        human,_=self.ordinary_bestj_record();self.write('new-human.json',human)
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_EVIDENCE_SHA_CHANGED'):self.valid()
        self.pin_human_for_source_test({**human,'status':'accepted'})
        with self.assertRaises(ValueError):self.valid()
        with patch.object(d,'ANSWER_MESSAGE_ID',None),patch.object(d,'read_private',side_effect=AssertionError('NO DATA IO')):
            with self.assertRaisesRegex(ValueError,'NEW_DIAGNOSTIC_HUMAN_PINS_UNCONFIGURED'):self.valid()

    def test_unconfigured_entry_rejects_before_any_file_secret_or_clone_io(self):
        core=load('controlled-snapshot-restore')
        with patch.object(core.diagnostic_window,'HUMAN_SHA256',None),patch.object(Path,'read_bytes',side_effect=AssertionError('NO IO')),patch.object(Path,'read_text',side_effect=AssertionError('NO IO')),patch.object(core,'restore_bundle',side_effect=AssertionError('NO CLONE')):
            with self.assertRaisesRegex(ValueError,'NEW_DIAGNOSTIC_HUMAN_PINS_UNCONFIGURED'):
                core.main(['--restore-diagnostic-window-from-direct-record','packet','manifest','identity','plan'])
        with patch.object(d,'HUMAN_SHA256',d.OLD_HUMAN_SHA),self.assertRaisesRegex(ValueError,'NEW_DIAGNOSTIC_HUMAN_PINS_UNCONFIGURED'):d.require_configured()

    def test_first_scope_and_unknown_bundle_caps_pins_expiration(self):
        self.valid()
        for field,value in [('proposalOnly',True),('approvedBy',None),('actions',d.ACTIONS+['target-upgrade']),('manifestSha256','0'*64),('parentCaptureId',str(uuid.uuid4())),('identityPath','different'),('attempt',3),('attempt',True),('maximumCopies',3),('maximumCopies',2.0),('codeSha256','b'*64),('humanAuthorizationSha256',d.OLD_HUMAN_SHA),('windowId',d.CAPTURE_ID)]:
            with self.subTest(field=field),self.assertRaises(ValueError):self.valid({**self.packet,field:value})
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_WINDOW_EXPIRED_OR_UNAPPROVED'):self.valid(when=self.t+timedelta(minutes=31))
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_FRESH_READONLY_LOCALE_REQUIRED'):self.valid(when=self.t+timedelta(minutes=6))
        with self.assertRaises(ValueError):self.valid({**self.packet,'windowEnd':(self.t+timedelta(hours=2)).isoformat()})
        p=Path(d.HUMAN_FILE);p.write_text(p.read_text()+' ')
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_EVIDENCE_SHA_CHANGED'):self.valid()

    def test_original_chain_preserved_and_hash_mutation_rejected(self):
        self.valid();d.claim(self.packet,self.code);d.finish(self.packet,self.code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS'})
        for key,pin in self.pins.items():self.assertEqual(Path(pin['path']).read_bytes(),self.old_bytes[key])
        p=Path(self.pins['retry1Claim']['path']);p.write_text(p.read_text()+' ')
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_EVIDENCE_SHA_CHANGED'):self.valid()

    def test_claim_concurrency_repeat_and_failure_cleanup_guard(self):
        self.valid();barrier=threading.Barrier(8)
        def contender(_):
            barrier.wait()
            try:return d.claim(self.packet,self.code)
            except ValueError as e:return str(e)
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(contender,range(8)))
        self.assertEqual(sum(isinstance(x,dict) for x in results),1)
        self.assertEqual(results.count('DIAGNOSTIC_ALREADY_ACTIVE_OR_CONSUMED'),7)
        d.finish(self.packet,self.code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'FAIL'})
        self.assertTrue((self.archives/d.active_name()).exists())
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_ALREADY_ACTIVE_OR_CONSUMED'):d.claim({**self.packet,'attempt':2},self.code)

    def second(self,outcome=None):
        self.valid();d.claim(self.packet,self.code)
        d.finish(self.packet,self.code,outcome or {'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS','failedStage':'schema post-data','reason':'RESTORE_PERMISSION_DENIED','safeRestoreDiagnostics':[{'objectClass':'CONSTRAINT','permissionObjectClass':'SCHEMA'}]})
        result,result_sha=d.read_private(self.archives/d.filename(self.window,1,'result'))
        new_code='b'*64;new_commit='2'*40
        self.packet.update(attempt=2,codeSha256=new_code,reviewedSourceCommit=new_commit,parentFailureSha256=result_sha)
        self.start.update(attempt=2,codeSha256=new_code,reviewedSourceCommit=new_commit)
        diagnosis={'status':'MAIN_PRIOR_FAILURE_DIAGNOSED','priorResultSha256':result_sha,'priorFailureFingerprint':d.failure_fingerprint(result),'newEvidenceSha256':'d'*64,'causeIdentified':True}
        dp,ds=self.write('new-diagnosis.json',diagnosis)
        tp,ts=self.write('repair-tests.json',{'status':'PASS_REQUIRED_REPAIR_TESTS','codeSha256':new_code,'reviewedSourceCommit':new_commit,'diagnosisEvidenceSha256':ds})
        self.start['repair']={'status':'MAIN_DIAGNOSED_FIXED_REVIEWED_PRIOR_FAILURE','priorResultSha256':result_sha,'priorFailureFingerprint':d.failure_fingerprint(result),'reviewedRepairCommit':new_commit,'newEvidenceDiagnosesPriorFailure':True,'independentSourceReviewPassed':True,'diagnosisEvidencePath':dp,'diagnosisEvidenceSha256':ds,'testsEvidencePath':tp,'testsEvidenceSha256':ts}
        self.rebind();return new_code

    def test_second_only_changed_reviewed_repair_after_failed_cleanup(self):
        code=self.second();self.valid(code=code)
        for field,value in [('codeSha256','a'*64),('reviewedSourceCommit','1'*40),('parentFailureSha256','0'*64),('windowStart',(self.t+timedelta(minutes=1)).isoformat()),('windowEnd',(self.t+timedelta(hours=1,minutes=1)).isoformat())]:
            packet={**self.packet,field:value};start={**self.start,field:value};_,packet['mainStartReceiptSha256']=self.write('new-start.json',start)
            with self.subTest(field=field),self.assertRaises(ValueError):self.valid(packet,code=packet['codeSha256'])
        self.rebind();d.claim(self.packet,code);d.finish(self.packet,code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS'})
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_ALREADY_ACTIVE_OR_CONSUMED'):d.claim(self.packet,code)
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_COPY_CAP_REQUIRED'):self.valid({**self.packet,'attempt':3},code=code)

    def test_second_denies_pass_or_incomplete_cleanup_and_missing_review(self):
        code=self.second({'status':'PASS_LOCAL_BUNDLE_RESTORE_ONLY','cleanup':'PASS'})
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_SECOND_REQUIRES_REAL_FAILED_CLEANUP'):self.valid(code=code)

    def test_second_unknown_consumption_chain_is_rejected(self):
        code=self.second()
        p=self.archives/d.filename(self.window,1,'used');value=json.loads(p.read_text());value['codeSha256']='0'*64;p.write_text(json.dumps(value));p.chmod(0o600)
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_PRIOR_CONSUMPTION_CHAIN_REQUIRED'):self.valid(code=code)

    def test_second_unknown_cleanup_or_missing_consumed_parent_rejects(self):
        code=self.second({'status':'FAIL_LOCAL_RESTORE','cleanup':'UNKNOWN'})
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_SECOND_REQUIRES_REAL_FAILED_CLEANUP'):self.valid(code=code)

    def test_second_denies_unidentified_cause_or_unreviewed_repair(self):
        code=self.second();self.start['repair']['independentSourceReviewPassed']=False;self.rebind()
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_FIXED_FAILURE_REVIEW_REQUIRED'):self.valid(code=code)
        self.start['repair']['independentSourceReviewPassed']=True
        path=self.start['repair']['diagnosisEvidencePath'];value=json.loads(Path(path).read_text());value['causeIdentified']=False
        _,self.start['repair']['diagnosisEvidenceSha256']=self.write('new-diagnosis.json',value);self.rebind()
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_NEW_CAUSAL_EVIDENCE_REQUIRED'):self.valid(code=code)

    def test_second_parent_failure_cleanup_and_concurrent_attempts(self):
        code=self.second();self.valid(code=code);barrier=threading.Barrier(8)
        def contender(_):
            barrier.wait()
            try:return d.claim(self.packet,code)
            except ValueError as e:return str(e)
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(contender,range(8)))
        self.assertEqual(sum(isinstance(x,dict) for x in results),1)
        self.assertEqual(results.count('DIAGNOSTIC_ALREADY_ACTIVE_OR_CONSUMED'),7)
        d.finish(self.packet,code,{'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS'})
        with self.assertRaises(ValueError):d.claim(self.packet,code)

    def test_legacy_cli_cannot_use_new_candidate_pin(self):
        core=load('controlled-snapshot-restore')
        packet={'approvalId':str(uuid.uuid4()),'mode':core.MODE,'codeSha256':core.code_hash()}
        with patch.object(Path,'read_text',return_value=json.dumps(packet)),patch.object(core,'verify_manifest'),patch.object(core.replay,'load_plan',return_value=({'mode':core.replay.CANDIDATE_MODE,'manifestSha256':core.replay.CANDIDATE_MANIFEST_HASH},[])),patch.object(core,'restore_bundle',side_effect=AssertionError('NO COPY')):
            with self.assertRaisesRegex(ValueError,'LEGACY_REPLAY_PLAN_SCOPE_REQUIRED'):
                core.main(['--restore-replay-from-direct-record','packet','manifest','identity','candidate'])

    def test_adapter_snapshots_caller_before_postdata_without_replay_on_failure(self):
        core=load('controlled-snapshot-restore');events=[]
        class Owned:
            def __init__(_,admin=None,facts=None):_.created=True
            def sql(_,sql):
                events.append('separate-caller-connection')
                return json.dumps({'roleClass':'postgres','effectiveSuperuser':False,'sessionUserIsBootstrap':True})
            def close(_):_.created=False;events.append('cleanup')
        def fake_restore(*args):
            core.base.OwnCluster('supabase_admin')
            core.base.pipeline(['fake-producer'],['pg_restore','--section=post-data'])
            return {'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS','reason':'FIXTURE_FAILURE'}
        with patch.object(core,'verify_manifest',return_value=({'verification':{}},{'sequences':[]})),patch.object(core.base,'OwnCluster',Owned),patch.object(core.base,'restore_bundle',side_effect=fake_restore),patch.object(core.safe_diagnostics,'pipeline',side_effect=lambda *args:events.append('postdata-pipeline')),patch.object(core.replay,'replay_owned',side_effect=AssertionError('no replay after failed restore')):
            result=core.restore_bundle(self.root,self.root/'identity',{},observe_caller=True)
            self.assertEqual(result['cleanup'],'PASS');self.assertEqual(events,['separate-caller-connection','postdata-pipeline','cleanup'])
            self.assertFalse(result['prePostDataCaller'][0]['effectiveSuperuser'])
            self.assertEqual(result['prePostDataCaller'][0]['scope'],'SEPARATE_PRE_POSTDATA_CONNECTION_NOT_PG_RESTORE_RUNTIME_CALLER')

    def test_pre_postdata_caller_snapshot_is_boolean_enum_only(self):
        class Db:
            def sql(_,sql):
                self.assertNotIn('rolconfig',sql);self.assertNotIn('pg_class',sql);self.assertNotIn('prosrc',sql)
                return json.dumps({'roleClass':'bootstrap','effectiveSuperuser':True,'sessionUserIsBootstrap':True})
        self.assertEqual(d.caller_snapshot(Db())['scope'],'SEPARATE_PRE_POSTDATA_CONNECTION_NOT_PG_RESTORE_RUNTIME_CALLER')
        class Bad:
            def sql(_,sql):return json.dumps({'roleClass':'secret-name','effectiveSuperuser':True,'sessionUserIsBootstrap':True})
        with self.assertRaisesRegex(ValueError,'DIAGNOSTIC_CALLER_ENUM_REQUIRED'):d.caller_snapshot(Bad())


if __name__=='__main__':unittest.main(verbosity=2)
