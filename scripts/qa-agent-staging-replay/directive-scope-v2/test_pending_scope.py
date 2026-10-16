"""Synthetic source records and temp files only; no real protected IO."""
import copy
from datetime import datetime,timezone,timedelta
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
p=load('pending_profile_test',HERE/'profile.py');e=load('pending_entry_test',HERE/'entry.py');b=load('pending_bootstrap_test',HERE/'bootstrap.py')
g=load('pending_gate_test',ROOT/'reviewed-diagnostic-window.py')

def fixture():
    event='Sentinel_'+'a'*32;actor='synthetic-actor';sent=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
    msg={'message_id':event,'author':'user','author_id':actor,'sent_at':sent,'content':{'text':'SYNTHETIC NEW SCOPE ONLY'}}
    def api(payload):return {'isError':False,'structuredContent':payload,'content':[{'type':'text','text':json.dumps(payload)}]}
    upstream=api({'partial':False,'before':[],'message':msg,'after':[]})
    raws={'upstreamRead':p.canonical(upstream)}
    body=' '.join((p.BESTJ,p.ROOM,event,p.sha(raws['upstreamRead'])))
    first={'type':'functionCallOutput','namespace':'cloud_threads','name':'send_message','id':'synthetic-native-id','output':{'truncated':False,'text':'<codex_delegation><source_thread_id>'+p.BESTJ+'</source_thread_id><input>'+body+'</input></codex_delegation>'}}
    raws['firstHop']=p.canonical(first);raws['macRead']=p.canonical({'schemaVersion':1,'thread':{'id':p.MAC,'kind':'codex'},'turns':[{'id':'synthetic-turn','items':[first]}]})
    raws['upstreamContext']=p.canonical({'record.kind':'full_context_two_hop_evidence_index','humanRawKind':'parent_reported_official_user_message_read_raw','parentProvidedRoom':p.ROOM,'files':{label:{'path':'/synthetic/'+key,'sha256':p.sha(raws[key]),'bytes':len(raws[key])} for label,key in [('parentProvidedApiRaw','upstreamRead'),('bestjMacRecord','firstHop'),('officialMacRead','macRead')]}})
    raws['secondHop']=p.canonical({'record.kind':'runtime_tool_arguments_and_result_capture','tool':'codex_app.send_message_to_thread','sourceThreadId':p.MAC,'arguments':{'threadId':p.MAIN,'prompt':event+' '+p.sha(raws['firstHop'])},'result':{'isError':False,'content':[{'type':'text','text':json.dumps({'threadId':p.MAIN})}]}})
    old_ids=['Sentinel_9fd068e678a0819187991a0a17138244','Sentinel_e4ac0f273c108191a5dfc74e481efce9']
    old=[{'message_id':identifier,'author':'user','author_id':actor} for identifier in old_ids]
    raws['actorReference']=p.canonical(api({'partial':False,'before':[old[0]],'message':old[1],'after':[]}))
    pins={k:{'path':'/synthetic/'+k,'bytes':len(v),'sha256':p.sha(v)} for k,v in raws.items()}
    binding={'directiveId':event,'directiveTextSha256':p.sha(msg['content']['text'].encode()),'actorSha256':p.sha(actor.encode()),'sentAt':sent,'pins':{k:v for k,v in pins.items() if k!='actorReference'}}
    return binding,raws,pins['actorReference']

class Pending(unittest.TestCase):
    def test_default_entry_factory_and_gate_refuse_before_protected_io(self):
        with patch.object(e.profile,'read_sources') as sources,patch.object(e.profile.provenance,'new_start_budget') as factory,patch.object(g,'read_private') as reads,patch.object(g,'claim') as claim:
            for call in (lambda:e.new_start_budget(),lambda:e.run(None,[],{}, {'version':p.VERSION}),lambda:g.run(None,[],source_profile={'version':p.VERSION})):
                with self.assertRaisesRegex(ValueError,'SCOPE_V2_UNCONFIGURED'):call()
            for spy in (sources,factory,reads,claim):spy.assert_not_called()
    def test_default_bootstrap_zero_io_factory_or_records(self):
        with patch.object(b,'prepare') as prepare,patch.object(b,'read_pin') as reads,patch.object(b,'write_once') as writes,patch.object(b.entry,'new_start_budget') as factory,patch.object(b.subprocess,'check_output') as commands:
            with self.assertRaisesRegex(ValueError,'BOOTSTRAP_V2_UNCONFIGURED'):b.run(None,'/never')
            for spy in (prepare,reads,writes,factory,commands):spy.assert_not_called()
    def test_caller_approved_flag_cannot_configure(self):
        with patch.object(p,'BINDING',{'approved':True}):
            with self.assertRaisesRegex(ValueError,'SCOPE_V2_UNCONFIGURED'):p.require_binding()
    def test_old_events_rejected_even_with_new_pins(self):
        binding,raw,old=fixture()
        for identifier in p.OLD_EVENTS:
            with patch.object(p,'BINDING',{**binding,'directiveId':identifier}):
                with self.assertRaisesRegex(ValueError,'OLD_OR_INVALID_EVENT'):p.verify_sources(raw)
    def test_synthetic_new_event_requires_exact_native_actor_room_chain(self):
        binding,raw,old=fixture()
        with patch.object(p,'BINDING',binding),patch.object(p,'fixed_actor_pin',return_value=old):
            self.assertEqual(p.verify_sources(raw)['eventId'],binding['directiveId'])
            for key in raw:
                broken={**raw,key:raw[key]+b' '}
                with self.assertRaisesRegex(ValueError,'RAW_PIN_CONFLICT'):p.verify_sources(broken)
    def test_repin_cannot_change_native_or_actor_semantics(self):
        binding,raw,old=fixture()
        for key,mutate in [('firstHop',lambda v:v.update(namespace='fake')),('macRead',lambda v:v['thread'].update(id='wrong')),('upstreamRead',lambda v:v['structuredContent']['message'].update(author_id='foreign'))]:
            changed=json.loads(raw[key]);mutate(changed);newraw={**raw,key:p.canonical(changed)};new=copy.deepcopy(binding);new['pins'][key].update(bytes=len(newraw[key]),sha256=p.sha(newraw[key]))
            with patch.object(p,'BINDING',new),patch.object(p,'fixed_actor_pin',return_value=old):
                with self.assertRaises(ValueError):p.verify_sources(newraw)
    def test_native_sender_and_context_room_are_not_payload_tokens(self):
        binding,raw,old=fixture();first=json.loads(raw['firstHop'])
        first['output']['text']='<codex_delegation>\n<source_thread_id>'+p.BESTJ+'</source_thread_id>\n<input>'+binding['directiveId']+' '+p.sha(raw['upstreamRead'])+'</input>\n</codex_delegation>'
        raw['firstHop']=p.canonical(first)
        snapshot=json.loads(raw['macRead']);snapshot['turns'][0]['items']=[first];raw['macRead']=p.canonical(snapshot)
        context=json.loads(raw['upstreamContext'])
        for label,key in [('bestjMacRecord','firstHop'),('officialMacRead','macRead')]:context['files'][label].update(sha256=p.sha(raw[key]),bytes=len(raw[key]))
        raw['upstreamContext']=p.canonical(context)
        second=json.loads(raw['secondHop']);second['arguments']['prompt']=binding['directiveId']+' '+p.sha(raw['firstHop']);raw['secondHop']=p.canonical(second)
        for key in binding['pins']:binding['pins'][key].update(bytes=len(raw[key]),sha256=p.sha(raw[key]))
        with patch.object(p,'BINDING',binding),patch.object(p,'fixed_actor_pin',return_value=old):
            self.assertEqual(p.verify_sources(raw)['room'],p.ROOM)

    def test_repin_foreign_nested_truncated_and_wrong_room_delivery_refused(self):
        for kind in ('foreign','selfDeclaredSender','quoted','nested','truncated','missingEnd','wrongMac','nestedReceipt','duplicateReceipt','wrongRoom'):
            with self.subTest(kind=kind):
                binding,raw,old=fixture();first=json.loads(raw['firstHop']);snapshot=json.loads(raw['macRead']);context=json.loads(raw['upstreamContext'])
                native=first['output']['text']
                if kind in ('foreign','selfDeclaredSender'):
                    first['output']['text']=native.replace('<source_thread_id>'+p.BESTJ,'<source_thread_id>00000000-0000-4000-8000-000000000001',1)
                    if kind=='selfDeclaredSender':first['source_sender']=p.BESTJ
                elif kind=='quoted':first['output']['text']='quoted receipt: '+native
                elif kind=='nested':first['output']['text']=native.replace('<input>','<input>'+native,1)
                elif kind=='truncated':first['output']['truncated']=True
                elif kind=='missingEnd':first['output']['text']=native.removesuffix('</codex_delegation>')
                snapshot['turns'][0]['items']=[first]
                if kind=='wrongMac':snapshot['thread']['id']='wrong-thread'
                if kind=='nestedReceipt':snapshot['turns'][0]['items']=[{'type':'message','quoted':first}]
                if kind=='duplicateReceipt':snapshot['turns'][0]['items']=[first,first]
                if kind=='wrongRoom':context['parentProvidedRoom']='foreign-room'
                raw['firstHop']=p.canonical(first);raw['macRead']=p.canonical(snapshot)
                for label,key in [('parentProvidedApiRaw','upstreamRead'),('bestjMacRecord','firstHop'),('officialMacRead','macRead')]:context['files'][label].update(sha256=p.sha(raw[key]),bytes=len(raw[key]))
                raw['upstreamContext']=p.canonical(context)
                second=json.loads(raw['secondHop']);second['arguments']['prompt']=binding['directiveId']+' '+p.sha(raw['firstHop']);raw['secondHop']=p.canonical(second)
                for key in binding['pins']:binding['pins'][key].update(bytes=len(raw[key]),sha256=p.sha(raw[key]))
                with patch.object(p,'BINDING',binding),patch.object(p,'fixed_actor_pin',return_value=old):
                    with self.assertRaises(ValueError):p.verify_sources(raw)

    def test_grant_key_stable_across_version_and_pins_and_window(self):
        binding,raw,old=fixture()
        with patch.object(p,'BINDING',binding):
            original=p.authorization();name=p.authority_name()
            with patch.object(p,'VERSION','synthetic-other-version'):self.assertEqual(p.authorization(),original)
            binding['pins']['upstreamRead']['sha256']='f'*64
            self.assertEqual(p.authorization(),original);self.assertEqual(p.authority_name(),name)
            with tempfile.TemporaryDirectory() as tmp:
                (Path(tmp)/name).write_text('{}')
                packet={'attempt':1,'windowId':'synthetic-window','windowStart':'a','windowEnd':'b','windowStartMonotonic':1}
                profile={'humanRecord':{'sha256':'1'*64},'windowBindingSha256':'2'*64}
                with self.assertRaisesRegex(ValueError,'AUTHORIZATION_ALREADY_BOUND'):p.check_authority_claim(SimpleNamespace(ARCHIVES=Path(tmp)),profile,packet)
    def test_stable_event_ledger_consumes_once_and_binds_second_window(self):
        binding,raw,old=fixture()
        with patch.object(p,'BINDING',binding),tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();root.chmod(0o700)
            gate=SimpleNamespace(ARCHIVES=root,exclusive=g.exclusive,read_private=g.read_private)
            packet={'attempt':1,'windowId':'synthetic-window','windowStart':'a','windowEnd':'b','windowStartMonotonic':1}
            profile={'humanRecord':{'sha256':'1'*64},'windowBindingSha256':'2'*64}
            fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
            try:p.bind_authority_claim(gate,profile,packet,fd)
            finally:os.close(fd)
            original=(root/p.authority_name()).read_bytes()
            with self.assertRaisesRegex(ValueError,'AUTHORIZATION_ALREADY_BOUND'):p.check_authority_claim(gate,profile,{**packet,'windowId':'another'})
            p.check_authority_claim(gate,profile,{**packet,'attempt':2})
            with self.assertRaisesRegex(ValueError,'AUTHORIZATION_WINDOW_CONFLICT'):p.check_authority_claim(gate,profile,{**packet,'attempt':2,'windowId':'another'})
            self.assertEqual((root/p.authority_name()).read_bytes(),original)

    def test_bootstrap_writes_then_hands_same_budget_to_controller_interface(self):
        binding,raw,old=fixture()
        with tempfile.TemporaryDirectory() as tmp,patch.object(b.p,'BINDING',binding):
            root=Path(tmp).resolve();root.chmod(0o700)
            dest={k:root/('directive-v2-'+k+'.json') for k in ('human','locale','start','packet','header','second-start','second-packet','repair')}
            core=SimpleNamespace(diagnostic_window=SimpleNamespace(RETAIN='2099-01-01T00:00:00+00:00',TARGET='synthetic-target',ARCHIVES=root,active_name=lambda:'active'),base=SimpleNamespace(capture=SimpleNamespace(stamp=datetime.fromisoformat)))
            packet={k:None for k in b.p.HEADER_PACKET_FIELDS};packet.update(attempt=1,maximumCopies=2,target='synthetic-target',parentCaptureId=b.p.CAPTURE,manifestSha256=b.p.MANIFEST,manifestPath='synthetic-manifest',identityPath='synthetic-identity')
            values={'packet':packet,'source':{'sourceLockSha256':'1'*64},'receipt':{},'freshLocale':{'synthetic':True}}
            budget,mono,instant=b.entry.profile.provenance.new_start_budget()
            seen={}
            def constructor(*args):seen['budget']=args[1];seen['header']=args[2];return 'synthetic-controller-interface'
            module=SimpleNamespace(Controller=constructor)
            with patch.object(b,'ready'),patch.object(b,'prepare',return_value=(core,values,{'synthetic':True},dest)),patch.object(b.entry,'new_start_budget',return_value=(budget,mono,instant)),patch.object(b.entry,'qualified_hash',return_value='2'*64),patch.object(b,'load',return_value=module):
                selected,controller=b.build_controller({'driverSha256':'3'*64,'replayPlanPath':'synthetic-replay'},root)
            self.assertIs(seen['budget'],budget);self.assertEqual(controller,'synthetic-controller-interface')
            self.assertEqual(seen['header']['windowStartMonotonic'],mono)
            self.assertEqual(json.loads(dest['start'].read_text())['windowStartMonotonic'],mono)
            self.assertEqual(json.loads(dest['packet'].read_text())['windowEnd'],budget.wall_end.isoformat())
            self.assertTrue(all(dest[k].exists() for k in ('human','locale','start','packet','header')))
            self.assertFalse(dest['repair'].exists())
    def test_shared_gate_algorithms_are_retained_except_explicit_selector(self):
        # AST checks concern unchanged gate/claim predicates, not real data IO.
        import ast,subprocess
        current=ast.parse((ROOT/'reviewed-diagnostic-window.py').read_text())
        prior=ast.parse(subprocess.check_output(['git','show','d8176175:scripts/qa-agent-staging-replay/reviewed-diagnostic-window.py']))
        class Normalize(ast.NodeTransformer):
            def visit_Call(self,node):
                self.generic_visit(node)
                if isinstance(node.func,ast.Name) and node.func.id=='_directive_profile':node.args=[]
                # Default direct-human branches still use JT; delegated label
                # selection is separately tested in delegated-scope-v1.
                if isinstance(node.func,ast.Name) and node.func.id=='_approval_label':return ast.Constant(value='JT')
                return node
        names=['validate','claim','finish','check_preserved','bindings','failure_fingerprint']
        for name in names:
            before=next(n for n in prior.body if isinstance(n,ast.FunctionDef) and n.name==name)
            after=next(n for n in current.body if isinstance(n,ast.FunctionDef) and n.name==name)
            self.assertEqual(ast.dump(Normalize().visit(before)),ast.dump(Normalize().visit(after)))

    def test_atomic_writer_refuses_overwrite_and_expiry(self):
        binding,raw,old=fixture()
        with patch.object(b.p,'BINDING',binding),tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();root.chmod(0o700);file=root/'fixture.json';budget=b.entry.profile.provenance.new_start_budget()[0]
            b.write_once(file,{'synthetic':True},budget);before=file.read_bytes()
            with self.assertRaises(FileExistsError):b.write_once(file,{'overwrite':True},budget)
            self.assertEqual(file.read_bytes(),before)
            budget.expired=True
            with self.assertRaises(b.entry.profile.provenance.deadline.WindowExpired):b.write_once(root/'never.json',{},budget)
            self.assertFalse((root/'never.json').exists())

if __name__=='__main__':unittest.main(verbosity=2)
