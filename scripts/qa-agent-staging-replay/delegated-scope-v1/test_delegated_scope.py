"""Synthetic delegated-source and ledger fixtures; no material or real ledger IO."""
import copy
import html
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent;ROOT=HERE.parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
p=load('delegated_fixture_profile',HERE/'profile.py');e=load('delegated_fixture_entry',HERE/'entry.py');b=load('delegated_fixture_bootstrap',HERE/'bootstrap.py');g=load('delegated_fixture_gate',ROOT/'reviewed-diagnostic-window.py')

def fixture(native='fco_synthetic_first',body_suffix='',sender=None):
    raw={}
    def put(key,value):raw[key]=p.canonical(value)
    def pin(key):return {'path':'/synthetic/'+key,'sha256':p.sha(raw[key]),'bytes':len(raw[key])}
    texts=['synthetic delegation one','synthetic delegation two']
    users=[{'message_id':identifier,'author':'user','author_id':'synthetic_actor','content':{'text':text}} for identifier,text in zip(p.DELEGATION_EVENTS,texts)]
    payload={'partial':False,'before':[{'message_id':'context-a'},users[0]],'message':users[1],'after':[{'message_id':'context-b'},{'message_id':'context-c'}]}
    put('delegationRaw',{'isError':False,'structuredContent':payload,'content':[{'type':'text','text':json.dumps(payload)}]})
    put('delegationContext',{'record.kind':'full_context_two_hop_evidence_index','parentProvidedRoom':p.ROOM,'humanRawKind':'parent_reported_official_user_message_read_raw','files':{'parentProvidedApiRaw':pin('delegationRaw')}})
    put('proposal',{'minutes':60,'maximumAttempts':2,'automaticRetry':False,'material':{'captureId':p.CAPTURE,'manifestSha256':p.MANIFEST,'retainedAgeArchives':4}})
    proposal=p.sha(raw['proposal'])
    body='synthetic decision '+p.DECISION_NO+' '+proposal+' '+' '.join(p.DELEGATION_EVENTS)+body_suffix
    def native_record(identifier,source,text,namespace,name):
        return {'type':'functionCallOutput','id':identifier,'namespace':namespace,'name':name,'output':{'truncated':False,'text':'<codex_delegation><source_thread_id>'+source+'</source_thread_id><input>'+text+'</input></codex_delegation>'}}
    first=native_record(native,sender or p.BESTJ,body,'cloud_threads','send_message');put('firstHop',first);raw['firstHopText']=first['output']['text'].encode()
    put('macRead',{'thread':{'id':p.MAC,'kind':'codex'},'turns':[{'items':[first]}]})
    prompt='synthetic forwarding\n'+first['output']['text'];raw['secondPrompt']=prompt.encode()
    put('secondHop',{'record.kind':'runtime_tool_arguments_and_result_capture','tool':'codex_app.send_message_to_thread','sourceThreadId':p.MAC,'nativeCallId':'NOT_EXPOSED_BY_ORCHESTRATOR; not fabricated','arguments':{'threadId':p.MAIN,'prompt':prompt},'result':{'isError':False,'content':[{'text':json.dumps({'threadId':p.MAIN})}]}})
    put('mainReceived',native_record('fco_synthetic_received',p.MAC,html.escape(prompt,quote=False),'codex_app','send_message_to_thread'))
    put('mainAck',{'type':'agentMessage','id':'synthetic-ack','text':'synthetic consumed only','phase':'commentary'})
    put('ackIndex',{'record.kind':'official_Main_received_and_consumed_decision_records','decisionId':p.DECISION_NO,'readTool':'codex_app.read_thread','threadId':p.MAIN,'actualStartClaimed':False,'received':pin('mainReceived'),'consumptionAck':pin('mainAck')})
    files={label:pin(key) for label,key in [('officialMacRead','macRead'),('firstHop','firstHop'),('firstHopExactText','firstHopText'),('secondHop','secondHop'),('secondHopExactPrompt','secondPrompt')]}
    put('baseIndex',{'record.kind':'delegated_bestj_product_decision_two_hop_evidence','decisionId':p.DECISION_NO,'authorityType':p.AUTHORITY_DESCRIPTION,'sourceThread':p.BESTJ,'relayThread':p.MAC,'targetThread':p.MAIN,'proposalSha256':proposal,'humanDelegationRefs':list(p.DELEGATION_EVENTS),'files':files})
    put('contextIndex',{'record.kind':'delegated_bestj_product_decision_context_index','decisionId':p.DECISION_NO,'authorityType':p.AUTHORITY_DESCRIPTION,'sourceThreadId':p.BESTJ,'relayThreadId':p.MAC,'targetThreadId':p.MAIN,'firstHopNativeRecordId':native,'mainReceivedNativeRecordId':'fco_synthetic_received','secondHopNativeCallId':'NOT_EXPOSED','parentProvidedRoom':p.ROOM,'humanRawKind':'parent_reported_official_user_message_read_raw','proposalSha256':proposal,'files':files,'originalHumanRaw':pin('delegationRaw'),'originalHumanContextIndex':pin('delegationContext'),'mainReceiveAndConsumptionIndex':pin('ackIndex')})
    binding={'authorityKind':p.KIND,'decisionNo':p.DECISION_NO,'proposalSha256':proposal,'decisionNativeId':native,'decisionBodySha256':p.sha(body.encode()),'pins':{key:pin(key) for key in raw}}
    constants={'PROPOSAL_SHA':proposal,'DELEGATION_RAW_SHA':p.sha(raw['delegationRaw']),'DELEGATION_CONTEXT_SHA':p.sha(raw['delegationContext']),'DELEGATION_TEXT_HASHES':tuple(p.sha(text.encode()) for text in texts)}
    return binding,raw,constants

class Delegated(unittest.TestCase):
    def test_default_and_delegation_alone_are_not_new_authority(self):
        with patch.object(e.profile,'read_sources') as reads,patch.object(e.profile.provenance,'new_start_budget') as factory,patch.object(g,'read_private') as private,patch.object(g,'open_root') as opened:
            for call in (lambda:e.new_start_budget(),lambda:e.run(None,[],{},{}),lambda:g.run(None,[],source_profile={'version':p.VERSION})):
                with self.assertRaisesRegex(ValueError,'DELEGATED_SCOPE_UNCONFIGURED'):call()
            for spy in (reads,factory,private,opened):spy.assert_not_called()
        binding,raw,constants=fixture();binding['decisionNativeId']=None
        with patch.multiple(p,**constants):
            with self.assertRaisesRegex(ValueError,'DELEGATED_SCOPE_UNCONFIGURED'):p.verify_sources(raw,binding)
    def test_exact_delegated_kind_not_fake_new_human(self):
        binding,raw,constants=fixture()
        with patch.multiple(p,**constants):
            value=p.verify_sources(raw,binding)
            self.assertEqual(value['authorityKind'],p.KIND);self.assertIsNone(value['newHumanEvent'])
            self.assertEqual(value['delegationEventIds'],list(p.DELEGATION_EVENTS))
            self.assertEqual(value['secondNativeCallId'],'NOT_EXPOSED_NOT_FABRICATED')
    def test_wrong_outer_sender_repin_still_refuses(self):
        binding,raw,constants=fixture(sender='00000000-0000-4000-8000-000000000001')
        with patch.multiple(p,**constants):
            with self.assertRaisesRegex(ValueError,'NATIVE_SENDER_CONFLICT'):p.verify_sources(raw,binding)
    def test_missing_or_fake_platform_event_refused(self):
        binding,raw,constants=fixture()
        with patch.multiple(p,**constants):
            for identifier in ('',p.DECISION_NO,p.DELEGATION_EVENTS[0]):
                with self.assertRaisesRegex(ValueError,'NATIVE_EVENT_REQUIRED_NOT_HUMAN'):p.verify_sources(raw,{**binding,'decisionNativeId':identifier})
    def test_fake_human_kind_cannot_select_delegated_authority(self):
        binding,raw,constants=fixture()
        with patch.multiple(p,**constants):
            with self.assertRaisesRegex(ValueError,'FIXED_DECISION_SCOPE_CONFLICT'):p.verify_sources(raw,{**binding,'authorityKind':'NEW_JT_USER_APPROVAL'})

    def test_raw_tamper_or_truncation_never_qualifies(self):
        binding,raw,constants=fixture()
        with patch.multiple(p,**constants):
            for key in raw:
                with self.assertRaisesRegex(ValueError,'SOURCE_HASH_CONFLICT'):p.verify_sources({**raw,key:raw[key]+b' '},binding)
            first=json.loads(raw['firstHop']);first['output']['truncated']=True
            with self.assertRaisesRegex(ValueError,'FULL_NATIVE_OUTPUT_REQUIRED'):p.envelope(first,p.BESTJ)
    def test_business_decision_is_stable_across_retransmission_version_path(self):
        one,raw,constants=fixture();two,raw2,_=fixture(native='fco_synthetic_retransmission')
        with patch.multiple(p,**constants):
            p.verify_sources(raw,one);p.verify_sources(raw2,two)
            self.assertEqual(p.authorization(one),p.authorization(two));self.assertEqual(p.commitment(one),p.commitment(two))
            before=p.authorization(one)
            with patch.object(p,'VERSION','another-code-version'),patch.object(p,'HERE',Path('/other/cwd/profile')):self.assertEqual(p.authorization(two),before)
    def test_same_decision_consumed_once_body_scope_immutable_old_used_preserved(self):
        binding,raw,constants=fixture();changed,_,_=fixture(body_suffix=' changed body')
        with patch.multiple(p,**constants),patch.object(p,'BINDING',binding),tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();root.chmod(0o700);gate=SimpleNamespace(ARCHIVES=root,read_private=g.read_private,exclusive=g.exclusive)
            old=root/'diagnostic-authority-old-used.json';old.write_bytes(b'OLD_USED_PERMANENT');before=old.read_bytes()
            packet={'attempt':1,'windowId':'synthetic-window','windowStart':'a','windowEnd':'b','windowStartMonotonic':1}
            profile={'humanRecord':{'sha256':'1'*64},'windowBindingSha256':'2'*64}
            fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
            try:p.bind_authority_claim(gate,profile,packet,fd)
            finally:os.close(fd)
            with self.assertRaisesRegex(ValueError,'AUTHORIZATION_ALREADY_BOUND'):p.check_authority_claim(gate,profile,{**packet,'windowId':'new-uuid'})
            with patch.object(p,'BINDING',changed):
                self.assertEqual(p.authorization(),p.authorization(binding))
                with self.assertRaisesRegex(ValueError,'BODY_OR_SCOPE_CHANGED'):p.check_authority_claim(gate,profile,packet)
            with patch.object(p,'SCOPE',{**p.SCOPE,'minutes':61}):
                with self.assertRaisesRegex(ValueError,'BODY_OR_SCOPE_CHANGED'):p.check_authority_claim(gate,profile,packet)
            self.assertEqual(old.read_bytes(),before)
    def test_direct_profiles_keep_jt_label_and_do_not_fall_back(self):
        self.assertEqual(g._approval_label(None),'JT');self.assertEqual(g._approval_label({'version':'jt-next-bounded-scope/v2'}),'JT')
        with self.assertRaisesRegex(ValueError,'DELEGATED_SCOPE_UNCONFIGURED'):g._approval_label({'version':p.VERSION})
    def test_bootstrap_unconfigured_is_zero_io(self):
        with patch.object(b,'prepare') as prepare,patch.object(b,'write_once') as write,patch.object(b.entry,'new_start_budget') as factory:
            with self.assertRaises(ValueError):b.run(None,'/never')
            for spy in (prepare,write,factory):spy.assert_not_called()

if __name__=='__main__':unittest.main(verbosity=2)
