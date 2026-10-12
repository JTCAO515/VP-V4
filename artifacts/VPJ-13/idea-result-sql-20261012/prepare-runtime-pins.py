from pathlib import Path
import json,hashlib,difflib
out=Path(__file__).parent
before=json.loads((out/'catalog-before.json').read_text());after=json.loads((out/'catalog-after.json').read_text())
sigs=['public.complete_planning_intake_comparison_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,text,jsonb)','turn_private.valid_current_v2_completion_proof(uuid)','turn_private.journey_idea_result_content_v1(uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,text,text)']
keys=['owner','acl','securityDefiner','config','language','volatility','strict','parallel','kind','identity','arguments','result','md5']
expected={s:{k:next(f for f in after if f['signature']==s)[k] for k in keys} for s in sigs}
f=next(f for f in before if f['signature']=='turn_data_private.runtime_supported_v1()');b=f['definition']
assert 'declare r record;p pg_proc;begin' in b
a=b.replace('declare r record;p pg_proc;begin','declare r record;p pg_proc;actual_idea jsonb;begin',1)
block='''
 -- Fixed reviewed E1 full-body and metadata pins, never runtime hash adoption.
 for r in select key signature,value expected from jsonb_each('''+"'"+json.dumps(expected,separators=(',',':')).replace("'","''")+"'::jsonb) loop\n"+'''  if to_regprocedure(r.signature) is null then return false;end if;
  select jsonb_build_object('owner',pg_get_userbyid(f.proowner),'acl',f.proacl::text,'securityDefiner',f.prosecdef,
   'config',f.proconfig,'language',l.lanname,'volatility',f.provolatile,'strict',f.proisstrict,'parallel',f.proparallel,
   'kind',f.prokind,'identity',pg_get_function_identity_arguments(f.oid),'arguments',pg_get_function_arguments(f.oid),
   'result',pg_get_function_result(f.oid),'md5',md5(pg_get_functiondef(f.oid))) into actual_idea
  from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=r.signature::regprocedure;
  if actual_idea is distinct from r.expected then return false;end if;
 end loop;
'''
a=a.replace(' -- Managed Auth has two exact supported definitions:',block+' -- Managed Auth has two exact supported definitions:',1)
(out/'turn_data_private-runtime_supported_v1.before.sql').write_text(b)
(out/'turn_data_private-runtime_supported_v1.after.sql').write_text(a)
(out/'turn_data_private-runtime_supported_v1.patch').write_text(''.join(difflib.unified_diff(b.splitlines(True),a.splitlines(True),fromfile='runtime.before',tofile='runtime.after')))
(out/'runtime-static-pins.json').write_text(json.dumps(expected,indent=2)+'\n')
(out/'idea-result-full.candidate.sql').write_text((out/'idea-result-core.candidate.sql').read_text()+'\n'+a)
