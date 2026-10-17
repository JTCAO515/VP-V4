"""Fixed-source provenance and least-privilege proposal. Offline only."""
import hashlib,json,re
from propose import PIN,D0,OUT,evidence,fixed,definition,proposal
SOURCES={
 'public.cancel_chat_turn':('20260909033302_vpj_02_repair_local_rpc_runtime.sql','20260909223841_vpj_04_native_mobile_sessions.sql'),
 'public.start_chat_turn':('20260911200339_vpj_07_service_task_records.sql','20260917064821_vpj_04_reapply_mobile_guard_start_chat.sql'),
 'public.read_text_turn':('20260912190000_vpj_16_grounded_turn.sql',None),
 'turn_private.require_text_task':('20260912190000_vpj_16_grounded_turn.sql',None)}
def body(sql):
 m=re.search(r'\bas\s+(\$[a-zA-Z0-9_]*\$)',sql,re.I);start=m.end();end=sql.index(m[1],start)
 return sql[start:end],start,end
def legacy():
 target={o['name']:o for o in evidence('d0-target-catalog.json')['objects']};result={};proof=[]
 for name,(source,transform) in SOURCES.items():
  raw=fixed(PIN,'supabase/migrations/'+source);sql=definition(raw,name);old,a,b=body(sql);revised=old
  if transform:
   migration=fixed(PIN,'supabase/migrations/'+transform)
   assert "regexp_replace(f.prosrc, '(\\mBEGIN\\M)', '\\1 PERFORM identity_private.guard_mobile_rpc_v2();', 'i')" in migration
   revised=re.sub(r'\bBEGIN\b',lambda m:m[0]+' PERFORM identity_private.guard_mobile_rpc_v2();',old,count=1,flags=re.I)
   if name=='public.cancel_chat_turn':assert hashlib.md5(old.encode()).hexdigest()=='1047fd7accd4b7d031caab4a67f49acb'
  actual=hashlib.sha256(revised.encode()).hexdigest();assert actual==target[name]['definitions'][0]['bodyHash'],name
  result[name]=sql[:a]+revised+sql[b:]
  proof.append({'name':name,'source':source,'sourceCommit':PIN,'sourceSha256':hashlib.sha256(raw.encode()).hexdigest(),'transformationMigration':transform,'bodyHash':actual,'matchesD0':True,'action':'preserve existing body; only require_text_task QA extension may be separately proposed'})
 return result,proof
def grants(plan):
 ports=json.loads(fixed(PIN,'scripts/qa-agent-db-baseline/port-coverage.json'))['ports'];callers={p['name']:p['caller'] for p in ports}
 lines=[];matrix=[]
 for e in plan['newDefinitions']:
  name=e['name'];caller=callers.get(name.split('.')[1]) if name.startswith('public.') else None
  role='authenticated' if caller=='authenticated' else ('service_role' if caller and caller.startswith('service_role') else None)
  if role:lines.append('grant execute on function '+name+'('+e['signature']+') to '+role+';')
  matrix.append({'name':name,'authenticated':role=='authenticated','service_role':role=='service_role','anon':False,'PUBLIC':False,'owner':'postgres','existingObject':False})
 return '\n'.join(lines)+'\n',matrix
def constraints():
 # Exact known PostgreSQL deparse strings from accepted source; verify SHA against D0.
 expressions={
  ('turn_private.text_policies','text_policies_context_mode_check'):"CHECK ((context_mode = ANY (ARRAY['current_input_v1'::text, 'task_history_v1'::text, 'knowledge_intent_v1'::text])))",
  ('turn_private.service_tasks','service_tasks_expected_result_check'):"CHECK ((expected_result = ANY (ARRAY['text_answer'::text, 'reviewed_answer'::text])))",
  ('turn_private.service_task_turns','service_task_turns_relationship_check'):"CHECK ((relationship = ANY (ARRAY['new_goal'::text, 'clarification'::text, 'repair'::text])))",
  ('turn_private.grounded_turns','grounded_turns_intent_check'):"CHECK (((knowledge_review_private.question_definition(intent) IS NOT NULL) OR (intent = ANY (ARRAY['clarification'::text, 'unsupported'::text, 'technical_failure'::text, 'blocked'::text]))))"}
 target={o['name']:o for o in evidence('d0-target-catalog.json')['objects']};out=[]
 for (table,name),expr in expressions.items():
  h=hashlib.sha256(expr.encode()).hexdigest();expected=next(c['definitionHash'] for c in target[table]['definitions'][0]['constraints'] if c['name']==name)
  out.append({'table':table,'name':name,'repositoryDerivedDefinition':expr,'computedHash':h,'targetHash':expected,'matchesD0':h==expected,'action':'preserve' if table.endswith(('service_tasks','grounded_turns')) else 'QA superset candidate; target execution gated'})
 return out
def main():
 _,trace=legacy();plan,_,_=proposal();acl,matrix=grants(plan);con=constraints()
 report={'status':'SOURCE_COMPATIBILITY_CANDIDATE_ONLY','fixedSource':PIN,'fixedD0':D0,'targetReady':False,'functions':trace,'constraints':con,'newFunctionAcl':matrix,'existingObjectAclChanges':[],'unresolved':['global claimer and lock_text_work QA isolation','bound_task_history/task_history metadata and live dependency identity','cancellation event helper closure for invalid session branch','schema ACL and role inheritance','fresh pins, concurrency interval, target write and activation leases']}
 (OUT/'d2-compatibility.json').write_text(json.dumps(report,indent=2)+'\n')
 (OUT/'d2-grants-proposal.sql').write_text("-- SOURCE ONLY. Never execute independently; all D1/D2 gates unresolved.\nBEGIN;\nDO $$BEGIN RAISE EXCEPTION 'D2_NO_TARGET_LEASE_OR_DEPENDENCY_PROOF';END$$;\n"+acl+'ROLLBACK;\n')
 print(json.dumps({'functionsMatched':len(trace),'constraintsMatched':sum(c['matchesD0'] for c in con),'newAuthGrants':sum(x['authenticated'] for x in matrix),'newServiceGrants':sum(x['service_role'] for x in matrix),'targetReady':False}))
if __name__=='__main__':main()
