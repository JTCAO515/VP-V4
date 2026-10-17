"""Offline D1 proposal only. No database/network/DSN input or execution mode."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'artifacts/QAWEB/db-rebuild-20261017'
PIN='7f0352ac99affbb00c67e77ca1ff1b7196b769af'
D0='0762e867cbc3801448b0f6c8caa4fef5dbc766ca'
def fixed(commit,path):return subprocess.check_output(['git','show',commit+':'+path],cwd=ROOT).decode()
def evidence(name):return json.loads(fixed(D0,'artifacts/QAWEB/db-rebuild-20261017/'+name))
def digest(s):return hashlib.sha256(s.encode()).hexdigest()
def lit(s):return "'"+s.replace("'","''")+"'"
def definition(sql,name):
 matches=list(re.finditer(r'^create (?:or replace )?function '+re.escape(name)+r'\s*\(',sql,re.I|re.M));assert len(matches)==1,name
 start=matches[0].start();op=re.search(r'\bas\s+(\$[a-zA-Z0-9_]*\$)',sql[start:],re.I);assert op
 end=sql.index(op[1],start+op.end())+len(op[1]);end=sql.index(';',end)+1
 return re.sub(r'^create or replace function','create function',sql[start:end],flags=re.I)
def proposal():
 target=evidence('d0-target-catalog.json');local=evidence('d0-local-catalog.json');comparison=evidence('d0-comparison.json')
 by_local={x['name']:x for x in local['objects']};by_target={x['name']:x for x in target['objects']}
 baseline=fixed(PIN,'scripts/qa-agent-db-baseline/baseline.sql')
 # Only original missing QA definitions. No private anchor tables or non-QA entrypoints.
 selected=[x['name'] for x in comparison['objects'] if x['classification']=='absent' and x['kind']=='function' and x['name'].split('.')[1].startswith('qa_')]
 assert len(selected)==18
 entries=[];ddl=[]
 for name in selected:
  source=definition(baseline,name);meta=by_local[name]['definitions'];assert len(meta)==1
  sig=name+'('+meta[0]['signature']+')'
  deps=sorted(set(re.findall(r'\b(?:public|turn_private|identity_private|auth)\.[a-z_][a-z0-9_]*',source))-{name})
  entries.append({'name':name,'before':'absent','signature':meta[0]['signature'],'bodyHashAfter':meta[0]['bodyHash'],'ddlSha256':digest(source),'source':PIN,'directReferences':deps,'referenceMethod':'lexical source references; not complete dynamic dependency proof','newOwner':'postgres','clientExposure':'NONE: PUBLIC/anon/authenticated/service_role revoked'})
  ddl += [source,'alter function '+sig+' owner to postgres;','revoke all on function '+sig+' from public,anon,authenticated,service_role;']
 # Order direct dependencies before consumers, fail if dependency cycle appears.
 ordered=[];pending={e['name']:e for e in entries}
 while pending:
  ready=sorted(n for n,e in pending.items() if not (set(e['directReferences'])&pending.keys()))
  assert ready,'DEPENDENCY_CYCLE'
  for n in ready:ordered.append(pending.pop(n))
 by_name=dict(zip(selected,[ddl[i:i+3] for i in range(0,len(ddl),3)]))
 body='\n\n'.join('\n'.join(by_name[e['name']]) for e in ordered)+'\n'
 blockers=[
  {'id':'B1','objects':['public.cancel_chat_turn','public.start_chat_turn'],'missing':'D0 body hashes do not match scanned same-name repository dollar-quoted definitions; need accepted source provenance or separately authorized bounded definition investigation, plus signature/default/search_path/ACL verification','risk':'Existing cancellation/admission lineage, deletion and accounting semantics cannot be inferred from hashes.'},
  {'id':'B2','objects':['turn_private.text_policies','turn_private.service_tasks','turn_private.grounded_turns'],'missing':'Exact approved constraint semantics matching D0 hashes; three differing constraints and additive column historical semantics','risk':'Do not narrow valid legacy values, invent backfills or remove target-only columns.'},
  {'id':'B3','objects':['turn_private.cancel_unclaimable_turn_v1','turn_private.assistant_event_link_v1','turn_private.assistant_conversations','turn_private.assistant_goals','turn_private.assistant_messages'],'missing':'Minimal actual cancellation/event closure compatible with existing target and accepted owners','risk':'Do not deploy empty fixture anchor tables or success stubs; qa_claim_work_v1 remains unusable.'},
  {'id':'B4','objects':['auth','public','turn_private','identity_private'],'missing':'Fresh bounded schema ACL and role inheritance/attributes, managed Auth required-column/type and session semantics, concurrency/write ownership interval','risk':'Object ACL equality is not effective execution authority; D0 postgres role is not target-write authorization.'},
  {'id':'B5','objects':['public.read_text_turn','turn_private.require_text_task','public.native_session_v2'],'missing':'Two body hashes match repository grounded-turn definitions; compatibility with new QA history and target extra shapes plus existing native_session_v2 service_role EXECUTE must be preserved','risk':'Do not replace old bodies or revoke existing service caller merely to match fixture.'},
  {'id':'B6','objects':['turn_private.work','turn_private.service_tasks','turn_private.grounded_turns'],'missing':'work.execution_mode, service_tasks.capacity_enforced, grounded_turns.selected_place_request are absent; exact future additive definition and historical/default semantics need evidence','risk':'No automatic ALTER/BACKFILL in this candidate.'},
  {'id':'B7','objects':selected,'missing':'Exact source candidate review, fresh pre/post pins, explicit target write lease and commit outcome handling','risk':'Source direction and old A-D do not grant E/apply; no COMMIT or activation emitted.'}
 ]
 object_plan=[]
 for x in comparison['objects']:
  action='retain-managed-auth' if x['name'].startswith('auth.') else ('propose-create-revoked' if x['name'] in selected else ('reuse-no-ddl' if x['classification']=='reuse-exact' else 'hold-no-ddl'))
  object_plan.append({**x,'action':action})
 plan={'status':'SOURCE_CANDIDATE_BLOCKED_FOR_TARGET','fixedSource':PIN,'fixedD0':D0,'project':'dzqdzetcctkhbrhlxxgn','default':'offline JSON proposal; --emit writes only fixed artifact directory','targetExecutionSupported':False,'targetReady':False,'commitIncluded':False,'newDefinitions':ordered,'objects':object_plan,'blockers':blockers,'rollback':'transaction failure -> ROLLBACK; after acknowledged commit safe STOP retaining all postchange rows; unknown commit -> no blind retry, rollback claim or deletion; reconcile authoritative catalog/receipt under new exact scope','sourceCandidateOnly':True}
 return plan,body,by_target
def catalog_query():
 return fixed(D0,'artifacts/QAWEB/db-rebuild-20261017/d0-catalog.sql').replace('BEGIN READ ONLY;\n','').replace('\nROLLBACK;\n','').rstrip().rstrip(';')
def postflight(plan,target):
 selected={e['name'] for e in plan['newDefinitions']}
 expected={n:v for n,v in target.items() if n not in selected}
 local={o['name']:o for o in evidence('d0-local-catalog.json')['objects']}
 for n in selected:
  expected[n]=local[n]
  expected[n]['definitions'][0]['acl']=[['postgres','postgres','EXECUTE',False]]
 encoded=json.dumps([expected[n] for n in sorted(expected)],separators=(',',':'))
 return "do $d1post$ declare observed jsonb; begin select q.snapshot into observed from ("+catalog_query()+") q; if observed->'objects' is distinct from "+lit(encoded)+"::jsonb then raise exception using message='D1_POST_CATALOG_MISMATCH',errcode='P0105';end if;end $d1post$;\n"
def package(plan,body,target):
 query=fixed(D0,'artifacts/QAWEB/db-rebuild-20261017/d0-catalog.sql').replace('BEGIN READ ONLY;\n','').replace('\nROLLBACK;\n','').rstrip().rstrip(';')
 expected=json.dumps([target[n] for n in sorted(target)],separators=(',',':'))
 pre="""do $d1$ declare observed jsonb; begin
 if current_user<>'postgres' or current_setting('server_version_num')::int/10000<>17 then raise exception using message='D1_ROLE_OR_VERSION_MISMATCH',errcode='P0101'; end if;
 if exists(select 1 from (values ('anon'),('authenticated'),('service_role')) r(name) where not exists(select 1 from pg_catalog.pg_roles p where p.rolname=r.name)) then raise exception using message='D1_REQUIRED_ROLE_MISSING',errcode='P0102';end if;
 select q.snapshot into observed from (QUERY) q;
 if observed->'objects' is distinct from EXPECTED::jsonb then raise exception using message='D1_BEFORE_CATALOG_DRIFT',errcode='P0103';end if;
 raise exception using message='D1_BLOCKED_B1_B2_B3_B4_B5_B6_B7_NO_TARGET_LEASE',errcode='P0104';
end $d1$;
""".replace('QUERY',query).replace('EXPECTED',lit(expected))
 # Fail closed even if executed accidentally. Never edit this gate into an apply script.
 return "-- SOURCE PROPOSAL ONLY; unresolved blockers; NO target execution lease.\nBEGIN;\nSET LOCAL statement_timeout='15s';\nSET LOCAL lock_timeout='2s';\nSET LOCAL idle_in_transaction_session_timeout='30s';\n"+pre+body+postflight(plan,target)+"\n-- No activation or COMMIT generated. Data-preservation checks remain local synthetic only; schema/role completeness is blocked by B4.\nROLLBACK;\n"
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--emit',action='store_true');args=parser.parse_args()
 plan,body,target=proposal()
 if args.emit:
  (OUT/'d1-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
  (OUT/'d1-candidate.sql').write_text(package(plan,body,target))
 print(json.dumps({'status':plan['status'],'newDefinitions':len(plan['newDefinitions']),'blockers':len(plan['blockers']),'targetReady':False,'emitted':args.emit}))
if __name__=='__main__':main()
