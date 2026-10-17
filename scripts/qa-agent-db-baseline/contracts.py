"""Original SQL ports, synthetic Auth and provider outcome; no external services."""
import json,uuid
from pathlib import Path
from run import lit
A='10000000-0000-4000-8000-000000000001';B='10000000-0000-4000-8000-000000000002'
SA='20000000-0000-4000-8000-000000000001';SB='20000000-0000-4000-8000-000000000002'
P='40000000-0000-4000-8000-000000000001';T='50000000-0000-4000-8000-000000000001';T2='50000000-0000-4000-8000-000000000002';TASK='60000000-0000-4000-8000-000000000001';SCOPE='80000000-0000-4000-8000-000000000099'
MODEL='qwen3.7-plus-2026-05-26';PRICE='synthetic-price';ENDPOINT='https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'
def exercise(f,db):
 checks=[]
 def mark(name):checks.append({'database':db,'check':name,'status':'PASS'})
 def sql(text,**kw):return f.sql(text,db,**kw)
 def rpc(name,args,actor=A,session=SA,role='authenticated',anonymous=False):
  _,out=sql('select public.'+name+'('+','.join(args)+');',role=role,actor=actor,session=session,anonymous=anonymous)
  return json.loads(out) if out else None
 def service(name,args):return rpc(name,args,actor=None,session=None,role='service_role')
 def native(action,payload=None,epoch=1,**kw):return rpc('qa_native_session_v1',[lit(action),str(epoch),lit(json.dumps(payload or {}))+'::jsonb'],**kw)
 def reject(text,code='42501',**kw):
  r,_=sql(text,check=False,**kw);assert r.returncode!=0 and code.encode() in r.stderr
 def payload(thread,turn,text):return {'p_thread_id':thread,'p_turn_id':turn,'p_idempotency_key':turn,'p_policy_id':P,'p_locale':'zh','p_text':text,'p_task_id':TASK,'p_relationship':'qa_followup'}
 def deny_native(action,value,actor=A,session=SA):reject('select public.qa_native_session_v1('+lit(action)+',1,'+lit(json.dumps(value))+'::jsonb);',code='P0001',role='authenticated',actor=actor,session=session)
 ports=json.loads(Path(__file__).with_name('service-ports.json').read_text())['publicRpcPorts']
 names=','.join(lit(port['name']) for port in ports)
 catalog=json.loads(sql("select json_agg(json_build_object('name',p.proname,'args',coalesce(p.proargnames,'{}'::text[]),'auth',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ("+names+");")[1])
 by_name={row['name']:row for row in catalog};assert len(catalog)==len(ports)
 for port in ports:
  row=by_name[port['name']];assert row['args']==[param['name'] for param in port['parameters']]
  expected=port['caller']=='authenticated';assert row['auth']==expected and row['service']!=expected and row['anon'] is False
 mark('21 original RPC named-argument and role ABI matches fixed service contract')
 sql("insert into auth.users values ('"+A+"'),('"+B+"');insert into auth.sessions(id,user_id) values ('"+SA+"','"+A+"'),('"+SB+"','"+B+"');")
 for owner,sid in [(A,SA),(B,SB)]:
  attempt=str(uuid.uuid4());service('native_prepare_v2',[lit(owner),lit(sid),lit(attempt)])
  first=rpc('native_session_v2',[lit('login'),lit(attempt)],actor=owner,session=sid)
  again=rpc('native_session_v2',[lit('login'),lit(attempt)],actor=owner,session=sid);assert first==again and first['mobileEpoch']==1
 mark('native login epoch/idempotent login through original functions; synthetic Auth')
 assert json.loads(sql("set local request.jwt.claim.sub='';select public.native_session_v2('session');",role='authenticated',actor=A,session=SA)[1])['subject']==A
 sql('insert into public.user_profiles(owner_id,display_name) values ('+lit(A)+",'Synthetic A'),("+lit(B)+",'Synthetic B');")
 assert sql('select count(*) from public.user_profiles;',role='authenticated',actor=A,session=SA)[1]=='1';mark('JSON claims fallback and profile owner RLS')
 thread=native('create')['thread']['id'];assert native('read',{'p_thread_id':thread})['turns']==[]
 assert native('list')['threads'][0]['id']==thread;mark('native create/list/read/reopen')
 reject("select public.qa_native_session_v1('list',1,'{}');",role='anon')
 reject("select public.qa_native_session_v1('list',2,'{}');",code='P0001',role='authenticated',actor=A,session=SA)
 reject("select public.qa_native_session_v1('list',1,'{}');",code='P0001',role='authenticated',actor=A,session=SA,anonymous=True)
 deny_native('read',{'p_thread_id':thread},B,SB)
 assert sql('select count(*) from public.chat_threads;',role='authenticated',actor=B,session=SB)[1]=='0';mark('anon/anonymous/stale epoch/cross-actor refusal')
 reject("insert into public.chat_threads(owner_id) values ('"+B+"');",role='authenticated',actor=A,session=SA)
 reject('select * from turn_private.text_content;',role='authenticated',actor=A,session=SA)
 reject('insert into public.trips(owner_id,title) values ('+lit(A)+",'synthetic');",role='authenticated',actor=A,session=SA)
 reject('select public.native_prepare_v2('+','.join(map(lit,[A,SA,str(uuid.uuid4())]))+');',role='authenticated',actor=A,session=SA);mark('minimal roles: no client private-content/Trip writer/trusted prepare')
 deny_native('qa_submit_message_v1',payload(thread,T,'合成问题🧪'));assert sql('select count(*) from public.turns;')[1]=='0';mark('missing policy/consent cannot admit or create a Turn')
 sql("insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values ("+lit(P)+",'qwen','SYNTHETIC ONLY',"+lit(ENDPOINT)+",'synthetic','synthetic','synthetic','synthetic','synthetic',repeat('a',64),'合成','Synthetic','retain_after_hide_v1',now()-interval '1 minute',now()+interval '1 hour',now()+interval '1 hour','qa_session_history_v1');")
 assert native('qa_read_policy_v1',{'p_policy_id':P})['policy']['consentState']=='not_accepted'
 native('qa_accept_policy_v1',{'p_policy_id':P,'p_notice_hash':'a'*64});native('qa_accept_policy_v1',{'p_policy_id':P,'p_notice_hash':'a'*64},actor=B,session=SB);mark('exact notice policy and explicit consent')
 message=payload(thread,T,'合成问题🧪');accepted=native('qa_submit_message_v1',message);assert accepted['kind']=='accepted' and accepted['reused'] is False
 again=native('qa_submit_message_v1',message);assert again['reused'] is True and again['turnId']==T
 deny_native('qa_submit_message_v1',{**message,'p_text':'changed'})
 deny_native('qa_submit_message_v1',{**message,'p_text':message['p_text']+' '})
 deny_native('qa_submit_message_v1',{**message,'p_text':message['p_text'].replace('🧪','🧬')})
 deny_native('qa_submit_message_v1',payload(thread,str(uuid.uuid4()),'x'*4001))
 deny_native('qa_submit_message_v1',message,B,SB)
 assert sql('select count(*) from turn_private.work;')[1]=='1';mark('atomic admission and exact text idempotency; no duplicate queue')
 assert service('read_hosted_worker_status',[])['enabled'] is False
 heartbeat=[lit(str(uuid.uuid4())),lit('synthetic-build'),"clock_timestamp()",lit('started'),'null','0','0','0','0','null']
 assert service('hosted_worker_heartbeat',heartbeat)=={'kind':'ok','enabled':False};mark('original worker heartbeat port remains disabled without activation')
 ready_args=[str(1),lit(MODEL),lit(PRICE),lit(ENDPOINT),lit(A),lit(P),lit(SCOPE),lit('a'*64)]
 assert service('qa_ready_groups_v3',ready_args)['kind']=='disabled';mark('worker control default disabled')
 sql("update turn_private.hosted_worker_control set enabled=true,reason='synthetic fixture';")
 for n in range(1,7):
  sid=SCOPE if n==6 else '80000000-0000-4000-8000-'+str(n).zfill(12)
  model=MODEL if n==6 else 'wrong-model'
  sql("insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values ("+lit(sid)+','+lit(A)+",'CNY',1000,1000,10,5,true,now()+interval '1 hour');insert into public.model_budget_provider_limits values ("+lit(sid)+",'qwen',"+lit(model)+','+lit(PRICE)+",1000,100,true);")
 groups=service('qa_ready_groups_v3',ready_args);assert len(groups['groups'])==1 and groups['groups'][0]['scopes'][0]['scopeId']==SCOPE
 assert service('qa_ready_groups_v3',[*ready_args[:-1],lit('b'*64)])['groups']==[];mark('ready exact tuple matched before LIMIT')
 def claim_dispatch(turn):
  claim=service('qa_claim_work_v1',[lit(A),lit(P)]);assert claim['kind']=='leased' and claim['turnId']==turn
  lease=claim['leaseToken'];data=service('qa_read_work_v1',[lit(turn),lit(lease)]);assert data['kind']=='qa_input' and data['serviceTaskId']==TASK
  args=list(map(lit,[SCOPE,A,turn,lease,'qwen',MODEL,PRICE]))+['100']
  assert service('reserve_model_budget',[lit(SCOPE),lit(B),*args[2:]])['kind']=='unavailable'
  assert service('reserve_model_budget',args[:-1]+['101'])['kind']=='exhausted'
  assert service('reserve_model_budget',args)['kind']=='reserved'
  assert sql('select task_id from public.model_budget_attempts where attempt_id='+lit(lease)+';')[1]==TASK
  assert service('reserve_model_budget',args)['kind']=='duplicate'
  assert service('reserve_model_budget',args[:-1]+['101'])['kind']=='conflict'
  assert service('qa_complete_work_v1',list(map(lit,[turn,lease,'answered','synthetic answer'])))['kind']=='blocked'
  dispatch=list(map(lit,[turn,lease,SCOPE,P,'qwen',data['contextDigest'],A]))
  assert service('qa_authorize_dispatch_v2',dispatch+[lit('b'*64)])['kind']=='blocked'
  wrong_digest=dispatch.copy();wrong_digest[5]=lit('0'*64)
  assert service('qa_authorize_dispatch_v2',wrong_digest+[lit('a'*64)])['kind']=='blocked'
  assert service('qa_authorize_dispatch_v2',dispatch+[lit('a'*64)])['kind']=='authorized'
  assert service('qa_authorize_dispatch_v2',dispatch+[lit('a'*64)])['kind']=='blocked'
  return lease,data
 lease,data=claim_dispatch(T);assert data['history']==[]
 reject('select public.qa_claim_work_v1('+lit(A)+','+lit(P)+');',role='authenticated',actor=A,session=SA)
 assert service('qa_complete_work_v1',list(map(lit,[T,lease,'answered','合成回答'])))['kind']=='blocked';mark('reserve/dispatch tuple and service ACL; no answer before settled usage')
 finish=list(map(lit,[SCOPE,A,lease,'settle']))+['7'];assert service('finish_model_budget',finish)['kind']=='settled'
 assert service('finish_model_budget',finish)['kind']=='duplicate';assert service('finish_model_budget',finish[:-1]+['8'])['kind']=='conflict'
 assert service('qa_complete_work_v1',list(map(lit,[T,lease,'answered','合成回答'])))['kind']=='finished'
 first=native('qa_read_session_v1',{'p_thread_id':thread});again=native('qa_read_session_v1',{'p_thread_id':thread});assert first==again and first['messages'][0]['output']=='合成回答';mark('synthetic usage settle→complete→durable answer reopen, no seeded answer')
 follow=payload(thread,T2,'合成续问🧪');assert native('qa_submit_message_v1',follow)['reused'] is False
 assert native('qa_submit_message_v1',message)['reused'] is True
 lease2,data2=claim_dispatch(T2);assert len(data2['history'])==2 and data2['history'][1]['content']=='合成回答';mark('same Task/parent preserved and bounded prior context')
 assert service('finish_model_budget',list(map(lit,[SCOPE,A,lease2,'pending']))+['null'])['kind']=='pending'
 sql('update turn_private.work set expires_at=clock_timestamp()-interval \'1 second\' where turn_id='+lit(T2)+';')
 assert service('qa_claim_work_v1',[lit(A),lit(P)])['kind']=='reconciliation_required'
 pending=native('qa_read_session_v1',{'p_thread_id':thread})['messages'][-1];assert pending['reconciliationRequired'] and pending['output'] is None and pending['input']=='合成续问🧪'
 assert native('qa_submit_message_v1',follow)['reused'] is True
 deny_native('qa_submit_message_v1',payload(thread,str(uuid.uuid4()),'new request while uncertain'))
 assert service('finish_model_budget',list(map(lit,[SCOPE,A,lease2,'release']))+['null'])['kind']=='conflict';mark('unknown dispatch/ACK retains bytes and pending budget; no requeue/release')
 rpc('withdraw_text_policy',[lit(P)]);assert native('qa_read_session_v1',{'p_thread_id':thread})['kind']=='unavailable'
 cancellation={'p_action':'cancel','p_thread_id':thread,'p_request_id':T2}
 stopped=native('qa_cancellation_v1',cancellation);assert stopped['state']=='cancelled' and stopped['ack']=='observed'
 assert sql('select status from public.model_budget_attempts where attempt_id='+lit(lease2)+';')[1]=='pending';mark('withdrawal protects content; cancellation needs no new consent and never settles cost')
 assert native('qa_cancellation_v1',{'p_action':'read','p_thread_id':thread,'p_request_id':str(uuid.uuid4())})['ack']=='unknown';mark('missing request receipt is unknown, not not_submitted')
 sql('delete from auth.sessions where id='+lit(SA)+';')
 reject("select public.qa_native_session_v1('list',1,'{}');",code='P0001',role='authenticated',actor=A,session=SA);mark('revoked session cannot reopen')
 return checks
