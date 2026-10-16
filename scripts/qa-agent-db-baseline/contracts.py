"""Synthetic SQL claims only; never authenticates a real token or provider."""
import json,uuid
from run import lit
A='10000000-0000-4000-8000-000000000001';B='10000000-0000-4000-8000-000000000002'
SA='20000000-0000-4000-8000-000000000001';SB='20000000-0000-4000-8000-000000000002'
P='40000000-0000-4000-8000-000000000001';T='50000000-0000-4000-8000-000000000001';T2='50000000-0000-4000-8000-000000000002';TASK='60000000-0000-4000-8000-000000000001'
def exercise(f,db):
 checks=[]
 def mark(name):checks.append({'database':db,'check':name,'status':'PASS'})
 def sql(text,**kw):return f.sql(text,db,**kw)
 def rpc(name,args,actor=A,session=SA,role='authenticated',anonymous=False):
  _,out=sql('select public.'+name+'('+','.join(args)+');',role=role,actor=actor,session=session,anonymous=anonymous)
  return json.loads(out) if out else None
 def native(action,payload=None,epoch=1,**kw):return rpc('qa_native_session_v1',[lit(action),str(epoch),lit(json.dumps(payload or {}))+'::jsonb'],**kw)
 def reject(text,code='42501',**kw):
  r,_=sql(text,check=False,**kw);assert r.returncode!=0 and code.encode() in r.stderr
 sql("insert into auth.users values ('"+A+"'),('"+B+"');insert into auth.sessions(id,user_id) values ('"+SA+"','"+A+"'),('"+SB+"','"+B+"');")
 for owner,sid in [(A,SA),(B,SB)]:
  attempt=str(uuid.uuid4());rpc('native_prepare_v2',[lit(owner),lit(sid),lit(attempt)],role='service_role')
  first=rpc('native_session_v2',[lit('login'),lit(attempt)],actor=owner,session=sid)
  again=rpc('native_session_v2',[lit('login'),lit(attempt)],actor=owner,session=sid);assert first==again and first['mobileEpoch']==1
 mark('native login epoch and idempotent login; synthetic Auth seam')
 assert json.loads(sql("set local request.jwt.claim.sub='';select public.native_session_v2('session');",role='authenticated',actor=A,session=SA)[1])['subject']==A
 sql('insert into public.user_profiles(owner_id,display_name) values ('+lit(A)+",'Synthetic A'),("+lit(B)+",'Synthetic B');")
 assert sql('select count(*) from public.user_profiles;',role='authenticated',actor=A,session=SA)[1]=='1';mark('JSON claims fallback and native profile owner RLS')
 thread=native('create')['thread']['id'];assert native('read',{'p_thread_id':thread})['turns']==[]
 assert native('list')['threads'][0]['id']==thread;mark('create/list/read/reopen through original native RPC')
 missing={'p_thread_id':thread,'p_turn_id':T,'p_idempotency_key':T,'p_policy_id':P,'p_locale':'zh','p_text':'synthetic','p_task_id':TASK,'p_relationship':'qa_followup'}
 reject("select public.qa_native_session_v1('qa_submit_message_v1',1,"+lit(json.dumps(missing))+"::jsonb);",code='42883',role='authenticated',actor=A,session=SA)
 assert sql('select count(*) from public.turns;')[1]=='0';mark('unimplemented submit fails technically, creates no accepted turn')
 reject("select public.qa_native_session_v1('list',1,'{}');",role='anon')
 reject("select public.qa_native_session_v1('list',2,'{}');",code='P0001',role='authenticated',actor=A,session=SA)
 reject("select public.qa_native_session_v1('list',1,'{}');",code='P0001',role='authenticated',actor=A,session=SA,anonymous=True)
 reject("select public.qa_native_session_v1('read',1,"+lit(json.dumps({'p_thread_id':thread}))+"::jsonb);",code='P0001',role='authenticated',actor=B,session=SB)
 assert sql('select count(*) from public.chat_threads;',role='authenticated',actor=B,session=SB)[1]=='0';mark('anon/anonymous/stale epoch/cross-actor refusal and RLS')
 reject("insert into public.chat_threads(owner_id) values ('"+B+"');",role='authenticated',actor=A,session=SA)
 reject('select * from turn_private.text_content;',role='authenticated',actor=A,session=SA)
 reject('insert into public.trips(owner_id,title) values ('+lit(A)+",'synthetic');",role='authenticated',actor=A,session=SA);mark('no direct private-content or Trip writer privilege')
 sql("insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values ("+lit(P)+",'qwen','SYNTHETIC ONLY','https://example.invalid/fixture','synthetic','synthetic','synthetic','synthetic','synthetic',repeat('a',64),'合成','Synthetic','retain_after_hide_v1',now()-interval '1 minute',now()+interval '1 hour',now()+interval '1 hour','qa_session_history_v1');")
 assert native('qa_read_policy_v1',{'p_policy_id':P})['policy']['consentState']=='not_accepted'
 consent=native('qa_accept_policy_v1',{'p_policy_id':P,'p_notice_hash':'a'*64})['consentId'];mark('original policy notice and explicit consent port')
 sql("insert into public.turns(id,owner_id,thread_id,status) values ("+','.join(map(lit,[T,A,thread,'completed']))+");insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text,output_kind,output_text) values ("+','.join(map(lit,[T,A,thread,P,consent,'zh','合成问题🧪','answered','合成回答']))+");insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest) values ("+','.join(map(lit,[TASK,A,thread,T,T,P,consent]))+",1,repeat('b',64));insert into turn_private.service_task_turns values ("+','.join(map(lit,[T,TASK,A]))+",null,'new_goal',gen_random_uuid(),repeat('c',64));")
 first=native('qa_read_session_v1',{'p_thread_id':thread});again=native('qa_read_session_v1',{'p_thread_id':thread});assert first==again and first['messages'][0]['output']=='合成回答';mark('synthetic retained message persists across separate connections')
 sql("insert into public.turns(id,owner_id,thread_id,status) values ("+','.join(map(lit,[T2,A,thread,'accepted']))+");insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text) values ("+','.join(map(lit,[T2,A,thread,P,consent,'zh','合成续问🧪']))+");insert into turn_private.service_task_turns values ("+','.join(map(lit,[T2,TASK,A,T,'qa_followup']))+",gen_random_uuid(),repeat('d',64));update turn_private.service_tasks set last_turn_id="+lit(T2)+" where id="+lit(TASK)+";insert into turn_private.work(turn_id,owner_id,session_id,max_attempts,lease_ms) values ("+','.join(map(lit,[T2,A,SA]))+",1,1000);insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values (gen_random_uuid(),"+','.join(map(lit,[T2,consent,P]))+");")
 pending=native('qa_read_session_v1',{'p_thread_id':thread})['messages'][-1];assert pending['reconciliationRequired'] is True and pending['output'] is None and pending['outcome'] is None and pending['input']=='合成续问🧪';mark('unknown ACK stays unresolved; original text preserved')
 rpc('withdraw_text_policy',[lit(P)]);assert native('qa_read_session_v1',{'p_thread_id':thread})['kind']=='unavailable';mark('withdrawn consent hides retained session without deletion')
 assert sql('select count(*) from public.model_budget_scopes;')[1]=='0'
 reject('insert into public.model_budget_scopes default values;',role='authenticated',actor=A,session=SA);mark('budget defaults empty/disabled; client cannot grant funds')
 sql('delete from auth.sessions where id='+lit(SA)+';')
 reject("select public.qa_native_session_v1('list',1,'{}');",code='P0001',role='authenticated',actor=A,session=SA);mark('revoked session cannot reopen')
 return checks
