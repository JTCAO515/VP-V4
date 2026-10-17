"""Finite synthetic representative only; no target, DSN or provider interface."""
import hashlib,json,subprocess,sys,uuid
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent))
from run import Fixture,IMAGE,lit
from assemble import function
from propose import ROOT,OUT,PIN,D0,evidence,fixed,proposal,package,postflight
A='10000000-0000-4000-8000-000000000001';B='10000000-0000-4000-8000-000000000002'
SA='20000000-0000-4000-8000-000000000001';SB='20000000-0000-4000-8000-000000000002'
P='40000000-0000-4000-8000-000000000001';H='30000000-0000-4000-8000-000000000001'
T='50000000-0000-4000-8000-000000000001';T2='50000000-0000-4000-8000-000000000002';TASK='60000000-0000-4000-8000-000000000001';C='70000000-0000-4000-8000-000000000001'
def main():
 plan,body,target=proposal();selected={e['name'] for e in plan['newDefinitions']}
 report={'status':'FAIL','scope':'synthetic representative, NOT target replica or full Native QA write acceptance','image':IMAGE,'fixed7f':PIN,'fixedD0':D0,'checks':[],'cleanup':'UNKNOWN','target':'UNRUN','provider':'UNRUN','realAuth':'UNRUN','sourceHashes':{}}
 f=Fixture();db='d1_representative'
 def sql(s,**kw):return f.sql(s,db,**kw)
 def mark(s):report['checks'].append({'name':s,'status':'PASS'})
 query=fixed(D0,'artifacts/QAWEB/db-rebuild-20261017/d0-catalog.sql')
 def catalog():return json.loads(sql(query)[1])['objects']
 def rows():
  # Application data reads below are exclusively from this owned synthetic DB.
  names=[o['name'] for o in catalog() if o['kind']=='table' and o['definitions']]
  return {n:sql("select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text),''),'UTF8')),'hex') from "+n+' r;')[1] for n in names}
 def native(action,payload=None,actor=A,session=SA,epoch=1):
  return json.loads(sql('select public.qa_native_session_v1('+lit(action)+','+str(epoch)+','+lit(json.dumps(payload or {}))+'::jsonb);',role='authenticated',actor=actor,session=session)[1])
 try:
  for p in sorted(HERE.parent.iterdir()):
   if p.is_file() and p.suffix in ('.py','.sql','.json'):
    assert p.read_text()==fixed(PIN,str(p.relative_to(ROOT))), 'FROZEN_7F_CHANGED'
  for p in HERE.glob('*.py'):report['sourceHashes'][str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
  report['candidateBodySha256']=hashlib.sha256(body.encode()).hexdigest()
  f.start();report.update(containerId=f.cid,nonce=f.nonce);f.sql('create database '+db+';')
  sql(fixed(PIN,'scripts/qa-agent-db-baseline/platform.sql'))
  sql(fixed(PIN,'scripts/qa-agent-db-baseline/baseline.sql'))
  # Remove all D0-absent objects to make a finite legacy representative.
  local={x['name']:x for x in evidence('d0-local-catalog.json')['objects']}
  missing=[x for x in evidence('d0-comparison.json')['objects'] if x['classification']=='absent']
  sql('drop trigger qa_link_mode_v1 on turn_private.service_task_turns;')
  for o in missing:
   if o['kind']=='function':sql('drop function '+o['name']+'('+local[o['name']]['definitions'][0]['signature']+');')
  for n in ('assistant_messages','assistant_goals','assistant_conversations','service_task_capacity','service_task_capacity_settings'):
   sql('drop table turn_private.'+n+';')
  sql('alter table turn_private.work drop column execution_mode;alter table turn_private.service_tasks drop column capacity_enforced;alter table turn_private.grounded_turns drop column selected_place_request;')
  for c in target['turn_private.grounded_turns']['definitions'][0]['columns']:
   if c['name'] in ('unanswered_needs','place_subject_id','place_name','place_resolution'):
    sql('alter table turn_private.grounded_turns add column '+c['name']+' '+c['type']+';')
  old=fixed(PIN,'supabase/migrations/20260912190000_vpj_16_grounded_turn.sql')
  for n in ('public.read_text_turn','turn_private.require_text_task'):
   source=function(old,n);op=__import__('re').search(r'\bas\s+(\$[a-zA-Z0-9_]*\$)',source,__import__('re').I);start=op.end();end=source.index(op[1],start)
   assert hashlib.sha256(source[start:end].encode()).hexdigest()==target[n]['definitions'][0]['bodyHash']
   sql(__import__('re').sub(r'^create (?:or replace )?function','create or replace function',source,flags=__import__('re').I))
  sql('grant execute on function public.native_session_v2(text,uuid) to service_role;')
  # Deliberately explicit synthetic extras, never represented as recovered target definitions.
  sql("alter table public.chat_threads add column d1_legacy_marker text default 'preserve';create index d1_legacy_index on public.chat_threads(d1_legacy_marker);create policy d1_legacy_policy on public.chat_threads as restrictive for select to authenticated using (true);create function public.d1_legacy_trigger() returns trigger language plpgsql as $$begin return new;end$$;create trigger d1_legacy_trigger before update on public.chat_threads for each row execute function public.d1_legacy_trigger();")
  mark('representative omits all 26 absent objects and three absent columns; adds typed target extra columns and explicit synthetic legacy sentinels')
  sql("insert into auth.users values ('"+A+"'),('"+B+"');insert into auth.sessions(id,user_id) values ('"+SA+"','"+A+"'),('"+SB+"','"+B+"');")
  for owner,sid in ((A,SA),(B,SB)):
   attempt=str(uuid.uuid4());sql('select public.native_prepare_v2('+','.join(map(lit,[owner,sid,attempt]))+');',role='service_role')
   login=json.loads(sql('select public.native_session_v2(\'login\','+lit(attempt)+');',role='authenticated',actor=owner,session=sid)[1]);assert login['mobileEpoch']==1
  sql("insert into public.chat_threads(id,owner_id,status) values ('"+H+"','"+A+"','archived');insert into public.turns(id,owner_id,thread_id,status) values ('"+T+"','"+A+"','"+H+"','cancelled'),('"+T2+"','"+A+"','"+H+"','accepted');")
  sql("insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values ('"+P+"','qwen','SYNTHETIC','https://example.invalid/synthetic','synthetic','synthetic','synthetic','synthetic','synthetic',repeat('a',64),'合成','synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 hour',now()+interval '1 hour','current_input_v1');insert into turn_private.text_consents(owner_id,policy_id,consent_id,revoked_at) values ('"+A+"','"+P+"','"+C+"',now());")
  unknown='未确认 ACK 🧪\r\n  preserve exact bytes '
  sql("insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text,hidden_at) values ('"+T+"','"+A+"','"+H+"','"+P+"','"+C+"','zh','hidden tombstone',now()),('"+T2+"','"+A+"','"+H+"','"+P+"','"+C+"','zh',"+lit(unknown)+",null);")
  sql("insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest) values ('"+TASK+"','"+A+"','"+H+"','"+T+"','"+T2+"','"+P+"','"+C+"',1,repeat('b',64));insert into turn_private.service_task_turns(turn_id,task_id,owner_id,parent_turn_id,relationship,idempotency_key,request_digest) values ('"+T+"','"+TASK+"','"+A+"',null,'new_goal','"+T+"',repeat('c',64)),('"+T2+"','"+TASK+"','"+A+"','"+T+"','clarification','"+T2+"',repeat('d',64));")
  scope='80000000-0000-4000-8000-000000000001'
  sql("insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values ('"+scope+"','"+A+"','CNY',1000,1000,5,1,false,now()+interval '1 hour');insert into public.model_budget_provider_limits values ('"+scope+"','qwen','synthetic','synthetic',1000,100,false);insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,status) values ('"+scope+"','"+T2+"','"+TASK+"','qwen','synthetic','synthetic',100,'pending');")
  before=catalog();before_rows=rows()
  # Matching synthetic before-pin still stops at the permanent unresolved gate.
  blocked,_=sql(package(plan,body,{o['name']:o for o in before}),check=False)
  assert blocked.returncode!=0 and b'P0104' in blocked.stderr
  drifted={o['name']:o for o in before};drifted.pop('auth.uid')
  blocked,_=sql(package(plan,body,drifted),check=False)
  assert blocked.returncode!=0 and b'P0103' in blocked.stderr
  assert catalog()==before and rows()==before_rows
  mark('matching synthetic preflight still refuses unresolved target candidate with no catalog or row changes')
  sql('begin;'+body+'rollback;');assert catalog()==before and rows()==before_rows
  mark('transaction rollback removes new definitions and preserves all existing metadata and synthetic rows')
  # Only this owned local DB exercises definitions; no package activation or real target runner exists.
  sql('begin;'+body+postflight(plan,{o['name']:o for o in before})+'commit;');after=catalog()
  assert [o for o in before if o['name'] not in selected]==[o for o in after if o['name'] not in selected]
  assert rows()==before_rows
  meta={o['name']:o for o in after}
  for e in plan['newDefinitions']:
   d=meta[e['name']]['definitions'];assert len(d)==1 and d[0]['bodyHash']==e['bodyHashAfter'] and d[0]['owner']=='postgres'
   assert {x[0] for x in d[0]['acl']}=={'postgres'}
  mark('18 additive revoked definitions match source body hashes; all existing catalog, identities, archived/hidden/revoked rows, unknown bytes, Task lineage and pending budget unchanged')
  report['beforeRowsSha256']=hashlib.sha256(json.dumps(before_rows,sort_keys=True).encode()).hexdigest()
  # Local-only read/create capability experiment, not a target exposure recommendation.
  for n in ('public.qa_read_session_v1','public.qa_list_sessions_v1','public.qa_native_session_v1'):
   sql('grant execute on function '+n+'('+local[n]['definitions'][0]['signature']+') to authenticated;')
  thread=native('create')['thread']['id'];assert native('read',{'p_thread_id':thread})['turns']==[]
  assert [x['id'] for x in native('list')['threads']]==[thread]
  assert native('list',actor=B,session=SB)['threads']==[]
  for actor,session,epoch in ((B,SB,1),(A,SA,2)):
   r,_=sql("select public.qa_native_session_v1('read',"+str(epoch)+','+lit(json.dumps({'p_thread_id':thread}))+');',role='authenticated',actor=actor,session=session,check=False);assert r.returncode!=0
  assert sql("select has_function_privilege('service_role','public.native_session_v2(text,uuid)','EXECUTE');")[1]=='t'
  mark('local-only Native create/list/read/reopen, archived exclusion, cross-actor and stale-epoch refusal with existing native service permission retained')
  post_rows=rows()
  # Safe STOP retains postchange records; never drop columns/functions/data to fake rollback.
  for e in plan['newDefinitions']:sql('revoke all on function '+e['name']+'('+e['signature']+') from public,anon,authenticated,service_role;')
  assert rows()==post_rows
  r,_=sql("select public.qa_native_session_v1('list',1,'{}');",role='authenticated',actor=A,session=SA,check=False);assert r.returncode!=0 and b'42501' in r.stderr
  assert sql('select count(*) from public.chat_threads where id='+lit(thread)+';')[1]=='1'
  assert sql('select encode(sha256(convert_to(input_text,\'UTF8\')),\'hex\') from turn_private.text_content where turn_id='+lit(T2)+';')[1]==hashlib.sha256(unknown.encode()).hexdigest()
  assert sql('select enabled from turn_private.hosted_worker_control;')[1]=='f'
  mark('safe STOP revokes only new entrypoints, retains postchange thread and exact unknown bytes; worker remains disabled')
  report['status']='PASS_D1_BOUNDED_REPRESENTATIVE'
 except BaseException as e:report['error']=str(e) if isinstance(e,(AssertionError,RuntimeError)) else type(e).__name__
 finally:
  try:report['cleanup']='PASS' if f.close() else 'UNKNOWN'
  except BaseException:report['cleanup']='UNKNOWN';report['status']='FAIL'
  path=OUT/('d1-run-'+f.nonce+'.json');path.write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps({'status':report['status'],'checks':len(report['checks']),'cleanup':report['cleanup'],'error':report.get('error'),'evidence':str(path)}))
 return 0 if report['status']=='PASS_D1_BOUNDED_REPRESENTATIVE' and report['cleanup']=='PASS' else 1
if __name__=='__main__':
 if sys.argv[1:]!=['--run']:raise SystemExit('EXPLICIT_LOCAL_SYNTHETIC_RUN_REQUIRED')
 raise SystemExit(main())
