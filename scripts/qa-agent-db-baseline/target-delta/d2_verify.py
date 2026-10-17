"""Bounded synthetic compatibility: known legacy bodies -> minimal QA admission."""
import hashlib,json,re,sys,uuid
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE.parent))
from run import Fixture,IMAGE,lit
from propose import PIN,D0,OUT,ROOT,evidence,fixed,proposal,definition
from d2_compat import legacy,grants,constraints
A='10000000-0000-4000-8000-000000000001';B='10000000-0000-4000-8000-000000000002';SA='20000000-0000-4000-8000-000000000001';SB='20000000-0000-4000-8000-000000000002';P='40000000-0000-4000-8000-000000000001';T='50000000-0000-4000-8000-000000000001';TASK='60000000-0000-4000-8000-000000000001'
def main():
 f=Fixture();db='d2_compat';plan,ddl,target=proposal();old,trace=legacy();acl,matrix=grants(plan)
 report={'status':'FAIL','scope':'known legacy functions/constraints and synthetic admission; NOT target replica or worker acceptance','checks':[],'cleanup':'UNKNOWN','target':'UNRUN','provider':'UNRUN','workerDispatch':'UNRUN','sourceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [HERE/'d2_verify.py',HERE/'d2_compat.py',HERE/'propose.py']}}
 def sql(s,**kw):return f.sql(s,db,**kw)
 def mark(s):report['checks'].append({'name':s,'status':'PASS'})
 def native(action,payload=None,actor=A,session=SA,check=True):
  r,out=sql('select public.qa_native_session_v1('+lit(action)+',1,'+lit(json.dumps(payload or {}))+'::jsonb);',role='authenticated',actor=actor,session=session,check=check)
  return json.loads(out) if check else r
 def cat():return json.loads(sql(fixed(D0,'artifacts/QAWEB/db-rebuild-20261017/d0-catalog.sql'))[1])['objects']
 try:
  f.start();report.update(containerId=f.cid,nonce=f.nonce,image=IMAGE);f.sql('create database '+db+';')
  sql(fixed(PIN,'scripts/qa-agent-db-baseline/platform.sql'));sql(fixed(PIN,'scripts/qa-agent-db-baseline/baseline.sql'))
  local={x['name']:x for x in evidence('d0-local-catalog.json')['objects']}
  sql('drop trigger qa_link_mode_v1 on turn_private.service_task_turns;')
  for o in evidence('d0-comparison.json')['objects']:
   if o['classification']=='absent' and o['kind']=='function':sql('drop function '+o['name']+'('+local[o['name']]['definitions'][0]['signature']+');')
  for n in ('assistant_messages','assistant_goals','assistant_conversations','service_task_capacity','service_task_capacity_settings'):sql('drop table turn_private.'+n+';')
  sql('alter table turn_private.work drop column execution_mode;alter table turn_private.service_tasks drop column capacity_enforced;alter table turn_private.grounded_turns drop column selected_place_request;')
  for n,s in old.items():sql(re.sub(r'^create function','create or replace function',s,flags=re.I))
  sql('grant execute on function public.native_session_v2(text,uuid) to service_role;')
  for c in constraints():
   assert c['matchesD0']
   if c['table']=='turn_private.grounded_turns':continue # External resolver metadata remains outside observed scope.
   sql('alter table '+c['table']+' drop constraint '+c['name']+';alter table '+c['table']+' add constraint '+c['name']+' '+c['repositoryDerivedDefinition']+';')
  actual={x['name']:x for x in cat()}
  for t in trace:assert actual[t['name']]['definitions'][0]['bodyHash']==t['bodyHash']
  for c in constraints():
   if c['table']!='turn_private.grounded_turns':assert next(k['definitionHash'] for k in actual[c['table']]['definitions'][0]['constraints'] if k['name']==c['name'])==c['targetHash']
  mark('four legacy function bodies and three locally instantiated constraints exactly match D0; fourth constraint source hash matches without resolver stub')
  sql("insert into auth.users values ('"+A+"'),('"+B+"');insert into auth.sessions(id,user_id) values ('"+SA+"','"+A+"'),('"+SB+"','"+B+"');")
  for owner,sid in ((A,SA),(B,SB)):
   attempt=str(uuid.uuid4());sql('select public.native_prepare_v2('+','.join(map(lit,[owner,sid,attempt]))+');',role='service_role')
   sql("select public.native_session_v2('login',"+lit(attempt)+');',role='authenticated',actor=owner,session=sid)
  # Retained legacy records exist before either constraint expansion or function change.
  lp,lh,lt,lt2,lk,lc,ls=[str(uuid.uuid4()) for _ in range(7)]
  sql("insert into public.chat_threads(id,owner_id,status) values ("+lit(lh)+','+lit(A)+",'archived');insert into public.turns(id,owner_id,thread_id,status) values ("+lit(lt)+','+lit(A)+','+lit(lh)+",'cancelled'),("+lit(lt2)+','+lit(A)+','+lit(lh)+",'accepted');")
  sql("insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values ("+lit(lp)+",'qwen','SYNTHETIC','https://example.invalid/legacy','synthetic','synthetic','synthetic','synthetic','synthetic',repeat('f',64),'旧','Legacy','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 hour',now()+interval '1 hour','current_input_v1');insert into turn_private.text_consents(owner_id,policy_id,consent_id,revoked_at) values ("+','.join(map(lit,[A,lp,lc]))+",now());")
  for turn,hidden in ((lt,'now()'),(lt2,'null')):
   sql('insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text,hidden_at) values ('+','.join(map(lit,[turn,A,lh,lp,lc,'zh','legacy unknown 🧪\r\n  exact']))+','+hidden+');')
  sql('insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest) values ('+','.join(map(lit,[lk,A,lh,lt,lt2,lp,lc]))+",1,repeat('c',64));insert into turn_private.service_task_turns(turn_id,task_id,owner_id,parent_turn_id,relationship,idempotency_key,request_digest) values ("+','.join(map(lit,[lt,lk,A]))+",null,'new_goal',"+lit(lt)+",repeat('a',64)),("+','.join(map(lit,[lt2,lk,A,lt,'clarification',lt2]))+",repeat('b',64));")
  sql('insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values ('+lit(ls)+','+lit(A)+",'CNY',1000,1000,5,1,false,now()+interval '1 hour');insert into public.model_budget_provider_limits values ("+lit(ls)+",'qwen','synthetic','synthetic',1000,100,false);insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,status) values ("+','.join(map(lit,[ls,lt2,lk]))+",'qwen','synthetic','synthetic',100,'pending');")
  preserved={'public.chat_threads':'id='+lit(lh),'public.turns':'thread_id='+lit(lh),'turn_private.text_content':'thread_id='+lit(lh),'turn_private.service_tasks':'id='+lit(lk),'turn_private.service_task_turns':'task_id='+lit(lk),'turn_private.text_policies':'id='+lit(lp),'turn_private.text_consents':'policy_id='+lit(lp),'public.model_budget_attempts':'scope_id='+lit(ls),'auth.users':'true','auth.sessions':'true','identity_private.mobile_accounts':'true'}
  def legacy_rows():return {n:sql("select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text),''),'UTF8')),'hex') from "+n+' r where '+where+';')[1] for n,where in preserved.items()}
  retained=legacy_rows()
  # Exact candidate subset extends two finite sets and the original task-required guard.
  qa=fixed(PIN,'scripts/qa-agent-db-baseline/baseline.sql')
  extension="alter table turn_private.text_policies drop constraint text_policies_context_mode_check;alter table turn_private.text_policies add constraint text_policies_context_mode_check check(context_mode in ('current_input_v1','task_history_v1','knowledge_intent_v1','qa_session_history_v1'));alter table turn_private.service_task_turns drop constraint service_task_turns_relationship_check;alter table turn_private.service_task_turns add constraint service_task_turns_relationship_check check(relationship in ('new_goal','clarification','repair','qa_followup','qa_correction'));"
  extension+=re.sub(r'^create function','create or replace function',definition(qa,'turn_private.require_text_task'),flags=re.I)
  extension+="create trigger qa_link_mode_v1 before insert or update on turn_private.service_task_turns for each row execute function turn_private.qa_link_mode_v1();"
  before=cat();sql('begin;'+ddl+extension+acl+'rollback;');assert cat()==before and legacy_rows()==retained
  mark('full local admission candidate including least-privilege grants rolls back to exact before metadata')
  sql('begin;'+ddl+extension+acl+'commit;')
  assert legacy_rows()==retained
  after={x['name']:x for x in cat()}
  changed={e['name'] for e in plan['newDefinitions']}|{'turn_private.text_policies','turn_private.service_task_turns','turn_private.require_text_task'}
  assert [o for o in before if o['name'] not in changed]==[after[o['name']] for o in before if o['name'] not in changed]
  for m in matrix:
   d=after[m['name']]['definitions'][0];actual_roles={a[0] for a in d['acl']};assert actual_roles=={'postgres'}|{r for r in ('authenticated','service_role') if m[r]}
  assert after['public.native_session_v2']['definitions'][0]['acl']==actual['public.native_session_v2']['definitions'][0]['acl']
  mark('7 authenticated and 6 service grants only on new functions; 5 internal-only, anon/PUBLIC denied; existing ACL and unrelated captured objects preserved')
  h=native('create')['thread']['id'];assert native('read',{'p_thread_id':h})['turns']==[]
  sql("insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values ('"+P+"','qwen','SYNTHETIC','https://example.invalid/qa','synthetic','synthetic','synthetic','synthetic','synthetic',repeat('a',64),'合成','Synthetic','retain_after_hide_v1',now()-interval '1 minute',now()+interval '1 hour',now()+interval '1 hour','qa_session_history_v1');")
  data={'p_thread_id':h,'p_turn_id':T,'p_idempotency_key':T,'p_policy_id':P,'p_locale':'zh','p_text':'unknown ACK 🧪\r\n exact ','p_task_id':TASK,'p_relationship':'qa_followup'}
  assert native('qa_submit_message_v1',data,check=False).returncode!=0
  native('qa_accept_policy_v1',{'p_policy_id':P,'p_notice_hash':'a'*64})
  # Direct legacy start_text_turn cannot bypass the newly extended task guard.
  bypass,_=sql('select public.start_text_turn('+','.join(map(lit,[h,str(uuid.uuid4()),str(uuid.uuid4()),P,'zh','bypass']))+');',role='authenticated',actor=A,session=SA,check=False);assert bypass.returncode!=0
  r=native('qa_submit_message_v1',data);assert r['kind']=='accepted' and r['reused'] is False
  assert native('qa_submit_message_v1',data)['reused'] is True
  assert native('qa_submit_message_v1',{**data,'p_text':data['p_text']+' '},check=False).returncode!=0
  assert native('qa_submit_message_v1',data,actor=B,session=SB,check=False).returncode!=0
  other_policy=str(uuid.uuid4())
  sql('insert into turn_private.text_policies select '+lit(other_policy)+'::uuid,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,revoked_at,context_mode from turn_private.text_policies where id='+lit(P)+';')
  native('qa_accept_policy_v1',{'p_policy_id':other_policy,'p_notice_hash':'a'*64})
  assert native('qa_submit_message_v1',{**data,'p_policy_id':other_policy},check=False).returncode!=0
  read=native('qa_read_session_v1',{'p_thread_id':h});assert read['kind']=='session' and read['messages'][0]['input']==data['p_text']
  assert sql('select count(*) from public.turns where thread_id='+lit(h)+';')[1]=='1'
  assert sql('select task_id from turn_private.service_task_turns where turn_id='+lit(T)+';')[1]==TASK
  mark('ordinary Native admission/replay/reopen with matched old guarded start/read functions; consent, byte-change, cross-actor and direct legacy admission bypass denied')
  snapshot=sql("select md5((select jsonb_agg(to_jsonb(x))::text from turn_private.text_content x)||(select jsonb_agg(to_jsonb(x))::text from turn_private.service_task_turns x));")[1]
  for e in plan['newDefinitions']:sql('revoke all on function '+e['name']+'('+e['signature']+') from public,anon,authenticated,service_role;')
  assert sql("select md5((select jsonb_agg(to_jsonb(x))::text from turn_private.text_content x)||(select jsonb_agg(to_jsonb(x))::text from turn_private.service_task_turns x));")[1]==snapshot
  assert native('list',check=False).returncode!=0
  assert sql('select enabled from turn_private.hosted_worker_control;')[1]=='f'
  assert legacy_rows()==retained
  mark('safe STOP preserves exact new request and Task linkage; worker disabled and no claim/dispatch/provider invoked')
  # Preserve exact tested source subset as an explicitly gated proposal, never a target runner.
  (OUT/'d2-admission-proposal.sql').write_text("-- LOCAL-VALIDATED SOURCE SUBSET ONLY. Missing global-worker/trigger/schema proofs; no target lease.\nBEGIN;\nDO $$BEGIN RAISE EXCEPTION 'D2_DEPENDENCIES_UNVERIFIED';END$$;\n"+ddl+extension+acl+'\nROLLBACK;\n')
  report['status']='PASS_D2_BOUNDED_ADMISSION';report['proposalSha256']=hashlib.sha256((OUT/'d2-admission-proposal.sql').read_bytes()).hexdigest()
 except BaseException as e:report['error']=str(e) if isinstance(e,(RuntimeError,AssertionError)) else type(e).__name__
 finally:
  try:report['cleanup']='PASS' if f.close() else 'UNKNOWN'
  except BaseException:report['cleanup']='UNKNOWN';report['status']='FAIL'
  path=OUT/('d2-run-'+f.nonce+'.json');path.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':report['status'],'checks':len(report['checks']),'cleanup':report['cleanup'],'error':report.get('error'),'evidence':str(path)}))
 return 0 if report['status']=='PASS_D2_BOUNDED_ADMISSION' and report['cleanup']=='PASS' else 1
if __name__=='__main__':
 if sys.argv[1:]!=['--run']:raise SystemExit('EXPLICIT_SYNTHETIC_RUN_REQUIRED')
 raise SystemExit(main())
