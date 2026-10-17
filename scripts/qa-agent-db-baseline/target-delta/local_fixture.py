"""Owned no-network synthetic targetlike seam for independent API consumers.

No DSN/target arguments. Each instance owns exactly one fresh Fixture/container.
Lifecycle: start -> build_before -> check -> install_local -> seed/call_sql -> close.
close must run in finally (or use the context manager); only this instance cleans up.
"""
import hashlib,json,re,sys,uuid
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE.parent))
from run import Fixture,lit,IMAGE
from propose import PIN,evidence,fixed,definition
from d2_compat import legacy,constraints
from d2_worker_compat import sources as worker_sources
from d3_transaction import candidate,capture_sql,SOURCE
class LocalFixture:
 def __init__(self):
  self._owned=Fixture();self._started=False;self._built=False;self._installed=False;self.cleanup='UNRUN';self.db='d3_targetlike';self._seeds=[]
 def __enter__(self):return self.start()
 def __exit__(self,*exc):self.close()
 @property
 def identity(self):return {'kind':'LOCAL_SYNTHETIC_ONLY','nonce':self._owned.nonce,'containerId':self._owned.cid,'image':IMAGE,'database':self.db,'targetReplica':False}
 def start(self):
  if self._started:raise RuntimeError('ALREADY_STARTED')
  try:self._owned.start();self._started=True;self._owned.sql('create database '+self.db+';');return self
  except BaseException:self.close();raise
 def call_sql(self,text,*,role=None,actor=None,session=None,anonymous=False,check=True):
  if not self._started:raise RuntimeError('NOT_STARTED')
  return self._owned.sql(text,self.db,role=role,actor=actor,session=session,anonymous=anonymous,check=check)
 def build_before(self):
  if self._built:raise RuntimeError('BEFORE_ALREADY_BUILT')
  sql=self.call_sql
  sql(fixed(PIN,'scripts/qa-agent-db-baseline/platform.sql'));sql(fixed(PIN,'scripts/qa-agent-db-baseline/baseline.sql'))
  local={x['name']:x for x in evidence('d0-local-catalog.json')['objects']}
  sql('drop trigger qa_link_mode_v1 on turn_private.service_task_turns;')
  for o in evidence('d0-comparison.json')['objects']:
   if o['classification']=='absent' and o['kind']=='function':sql('drop function '+o['name']+'('+local[o['name']]['definitions'][0]['signature']+');')
  for name in ('assistant_messages','assistant_goals','assistant_conversations','service_task_capacity','service_task_capacity_settings'):sql('drop table turn_private.'+name+';')
  sql('alter table turn_private.work drop column execution_mode;alter table turn_private.service_tasks drop column capacity_enforced;alter table turn_private.grounded_turns drop column selected_place_request;')
  old,_=legacy()
  for s in old.values():sql(re.sub(r'^create function','create or replace function',s,flags=re.I))
  worker_old,_,_=worker_sources()
  for s in worker_old.values():sql(s)
  sql('grant execute on function public.claim_turn_work() to service_role;revoke all on function public.claim_turn_work() from public,anon,authenticated;revoke all on function turn_private.task_history(uuid),turn_private.bound_task_history(),turn_private.lock_text_work(uuid,uuid) from public,anon,authenticated,service_role;create trigger bound_task_history before insert on turn_private.service_task_turns for each row execute function turn_private.bound_task_history();alter trigger baseline_require_task on turn_private.text_content rename to require_text_task;grant execute on function public.native_session_v2(text,uuid) to service_role;')
  for c in constraints():
   assert c['matchesD0']
   if c['table']!='turn_private.grounded_turns':sql('alter table '+c['table']+' drop constraint '+c['name']+';alter table '+c['table']+' add constraint '+c['name']+' '+c['repositoryDerivedDefinition']+';')
  # Match captured preexisting application ACL, rather than inheriting the narrower
  # fresh 7f fixture. This changes only the owned local representative.
  for o in evidence('d0-target-catalog.json')['objects']:
   if o['name'].startswith('auth.') or not o['definitions']:continue
   for d in o['definitions']:
    target='function '+o['name']+'('+d['signature']+')' if o['kind']=='function' else 'table '+o['name']
    sql('revoke all on '+target+' from public,anon,authenticated,service_role;')
    for grantee,grantor,privilege,grantable in d['acl'] or []:
     if grantee=='postgres':continue
     assert grantee in ('PUBLIC','anon','authenticated','service_role') and grantor=='postgres' and not grantable
     sql('grant '+privilege+' on '+target+' to '+grantee+';')
  # Explicit local sentinels exercise preservation, not fabricated target definitions.
  sql("alter table public.chat_threads add column d3_legacy_marker text default 'preserve';create index d3_legacy_marker on public.chat_threads(d3_legacy_marker);create policy d3_legacy_marker on public.chat_threads as restrictive for select to authenticated using (true);")
  self._built=True;self._before_state=self.snapshot();return self.check()
 def snapshot(self):return json.loads(self.call_sql('BEGIN READ ONLY;'+capture_sql()+';ROLLBACK;')[1])
 def check(self):
  if not self._built:raise RuntimeError('BEFORE_NOT_BUILT')
  state=self.snapshot();objects={o['name']:o for o in state['objects']};_,trace=legacy()
  if not self._installed:
   assert state==self._before_state,'LOCAL_BEFORE_DRIFT'
   assert all(objects[o['name']]['definitions'] is None for o in evidence('d0-comparison.json')['objects'] if o['classification']=='absent')
   for x in trace:assert objects[x['name']]['definitions'][0]['bodyHash']==x['bodyHash']
   assert all(c['name']!='execution_mode' for c in objects['turn_private.work']['definitions'][0]['columns'])
  assert self.call_sql('select enabled from turn_private.hosted_worker_control;')[1]=='f'
  return {'status':'PASS_LOCAL_STRUCTURE','phase':'after' if self._installed else 'before','identity':self.identity,'actualTarget':False}
 def install_local(self):
  if not self._built or self._installed:raise RuntimeError('INVALID_LOCAL_INSTALL_PHASE')
  self.check();self.call_sql('BEGIN;'+candidate()+'COMMIT;');self._installed=True;return self.check()
 def seed(self,scenario='qa_eligible'):
  if scenario not in ('legacy_eligible','qa_eligible','qa_invalid_session','qa_unknown_budget','event_scope_drift'):raise ValueError('UNKNOWN_SYNTHETIC_SCENARIO')
  if scenario!='legacy_eligible' and not self._installed:raise RuntimeError('LOCAL_INSTALL_REQUIRED')
  if scenario=='event_scope_drift':
   self.call_sql("create function turn_private.cancel_unclaimable_turn_v1(uuid,uuid) returns void language plpgsql as $$begin raise exception using errcode='P0999';end$$;")
   return {'kind':'LOCAL_SCOPE_DRIFT_SENTINEL','expectedSqlstate':'P0201','note':'throwing sentinel, never a success stub; use a dedicated instance'}
  ids={k:str(uuid.uuid4()) for k in ('owner','session','attempt','policy','thread','turn','task','scope','lease')};sql=self.call_sql
  sql('insert into auth.users values ('+lit(ids['owner'])+');insert into auth.sessions(id,user_id) values ('+lit(ids['session'])+','+lit(ids['owner'])+');')
  sql('select public.native_prepare_v2('+','.join(lit(ids[k]) for k in ('owner','session','attempt'))+');',role='service_role')
  actor={'role':'authenticated','actor':ids['owner'],'session':ids['session']}
  login=json.loads(sql("select public.native_session_v2('login',"+lit(ids['attempt'])+');',**actor)[1]);ids['epoch']=login['mobileEpoch']
  mode='current_input_v1' if scenario=='legacy_eligible' else 'qa_session_history_v1';text='Synthetic exact request 🧪\r\n  preserve '
  sql('insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values ('+lit(ids['policy'])+",'qwen','SYNTHETIC','https://example.invalid/qa','synthetic','synthetic','synthetic','synthetic','synthetic',repeat('a',64),'合成','Synthetic','retain_after_hide_v1',now()-interval '1 minute',now()+interval '1 hour',now()+interval '1 hour',"+lit(mode)+');')
  sql('select public.accept_text_policy('+lit(ids['policy'])+','+lit('a'*64)+');',**actor)
  sql('insert into public.chat_threads(id,owner_id) values ('+lit(ids['thread'])+','+lit(ids['owner'])+');',**actor)
  if scenario=='legacy_eligible':
   result=json.loads(sql('select public.start_text_turn('+','.join(map(lit,[ids['thread'],ids['turn'],ids['turn'],ids['policy'],'zh',text]))+');',**actor)[1])
  else:
   payload={'p_thread_id':ids['thread'],'p_turn_id':ids['turn'],'p_idempotency_key':ids['turn'],'p_policy_id':ids['policy'],'p_locale':'zh','p_text':text,'p_task_id':ids['task'],'p_relationship':'qa_followup'}
   result=json.loads(sql("select public.qa_native_session_v1('qa_submit_message_v1',"+str(ids['epoch'])+','+lit(json.dumps(payload))+'::jsonb);',**actor)[1])
  if scenario=='qa_unknown_budget':
   sql('update turn_private.work set state=\'leased\',lease_token='+lit(ids['lease'])+",expires_at=now()-interval '1 minute' where turn_id="+lit(ids['turn'])+';')
   sql('insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values ('+lit(ids['scope'])+','+lit(ids['owner'])+",'CNY',1000,1000,5,1,false,now()+interval '1 hour');insert into public.model_budget_provider_limits values ("+lit(ids['scope'])+",'qwen','synthetic','synthetic',1000,100,false);insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,status) values ("+','.join(lit(ids[k]) for k in ('scope','lease','task'))+",'qwen','synthetic','synthetic',100,'pending');")
  if scenario in ('qa_invalid_session','qa_unknown_budget'):sql('delete from auth.sessions where id='+lit(ids['session'])+';')
  record={'kind':'SYNTHETIC_ONLY','scenario':scenario,**ids,'text':text,'noticeHash':'a'*64,'endpoint':'https://example.invalid/qa','result':result};self._seeds.append(record);return record
 def close(self):
  self.cleanup='PASS' if self._owned.close() else 'UNKNOWN';self._started=False;return self.cleanup
