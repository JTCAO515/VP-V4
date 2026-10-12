from pathlib import Path
out=Path(__file__).parent
root=out.parents[2]
s=(root/'tests/integration/turn/planning-v2-complete-worker-sql.test.mjs').read_text()
s=s[:s.index("run('administrator-synthetic")]
s=s.replace("import test,{before,after} from 'node:test';","import test from 'node:test';")
s=s.replace("import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';","import {command} from '../../../tests/integration/cost/fixtures/postgres-rpc.mjs';\nimport {name as container,owned} from './kernel.mjs';\nconst sql=(c,q)=>command('docker',['exec','-i',c,'psql','-h','/tmp/vpj13-7d19c5ea-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],\"set statement_timeout='30s';set lock_timeout='3s';set search_path=public;\\n\"+q);")
s=s.replace("const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj80-full-sql-'+uuid().slice(0,8);","const enabled=true;await owned();")
start=s.index('before(async()=>{');end=s.index('const run=',start);s=s[:start]+s[end:]
line=next(l for l in s.splitlines() if l.startswith("run('actual current SQL"));s=s.replace(line,'')
s=s.replace('async function prepared({recoverPlace=false,recoverOutput=false}={})','async function prepared({recoverPlace=false,recoverOutput=false,highlight=\'jingan\'}={})')
s=s.replace("output:{highlight:'jingan'}","output:{highlight}")
s=s.replace('const content=projected.content,digest=',"const factual=projected.content;const content=highlight==='peoples_square'?{...factual,options:[factual.options[1],factual.options[0]]}:factual;f.factual=factual;f.output=output;f.place=place;const digest=")
s=s.replace("const projection={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2", "const projection={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:null,partySize:2")
s=s.replace('async function fixture(){\n const a=await owner()', 'async function fixture(memory=false){\n const a=await owner(\'local_synthetic\',\'en\',\'First China idea without dates\',memory)')
s=s.replace("recoverOutput=false,highlight='jingan'", "recoverOutput=false,highlight='jingan',memory=false").replace('={}){const f=await fixture();assert.equal', '={}){const f=await fixture(memory);assert.equal')
s=s.replace("highlight='jingan',memory=false", "highlight='jingan',memory=false,provenanceAudit=false")
s=s.replace("for(const phase of ['configured','attempted','response_buffered'])assert.equal", """if(provenanceAudit){
 for(const changed of ['goal','delegation','intake']){
  const input=JSON.parse(payload.messages[1].content);input[changed]=changed==='intake'?{...input.intake,partySize:9}:'Different literal bytes';
  const altered={...payload,messages:[payload.messages[0],{role:'user',content:JSON.stringify(input)}]};
  const wire=JSON.parse(await db(`select turn_private.serialize_planning_v2_request_v1(${lit(f.b)}::jsonb,'${f.b.attempt}',${lit(altered)}::jsonb);`));
  const rejected=await adm('record_planning_intake_provider_destination_v1',{...f.tuple,p_destination:destination('configured'),p_request_id:f.b.attempt,p_request_digest:wire.requestDigest,p_payload_digest:wire.payloadDigest,p_payload_text:wire.body});
  assert.equal(rejected.kind,'blocked',changed);
  assert.equal(await db(`select count(*) from turn_private.planning_v2_collector_origins where scope_id='${f.b.scope}';`),'0');
 }
}
for(const phase of ['configured','attempted','response_buffered'])assert.equal""")
s+='''
const contentCall=(f,change={})=>'turn_private.journey_idea_result_content_v1('+[f.b.owner,f.b.task,f.b.turn,f.l.leaseToken,f.b.intakeDigest,f.b.planningDigest,f.b.scope,f.b.attempt,f.output.outputDigest,f.output.usageDigest,f.a.input.p_locale].map((v,i)=>lit(Object.hasOwn(change,i)?change[i]:v)).join(',')+')';
run('actual settled selection gives exact factual comparison and atomic original publication',async()=>{
 for(const highlight of ['jingan','peoples_square','none']){
  const f=await prepared({highlight});const actual=JSON.parse(await db('select '+contentCall(f)));
  assert.deepEqual(actual,f.complete.p_content);assert.deepEqual(actual.actions,[]);
  assert.deepEqual({...actual,options:f.factual.options},f.factual);
  assert.equal(await db('select turn_private.valid_planning_qualified_comparison_v1('+[f.b.owner,f.b.turn,f.l.leaseToken,f.b.intakeDigest,f.b.planningDigest,f.place,'en',f.factual].map(lit).join(',')+');'),'t');
  if(highlight==='peoples_square'){
   assert.equal(await db('select turn_private.valid_planning_qualified_comparison_v1('+[f.b.owner,f.b.turn,f.l.leaseToken,f.b.intakeDigest,f.b.planningDigest,f.place,'en',actual].map(lit).join(',')+');'),'f');
   assert.equal((await adm('complete_planning_intake_comparison_v1',{...f.complete,p_content:f.factual})).kind,'blocked');
  }
  assert.equal((await adm('complete_planning_intake_comparison_v1',f.complete)).kind,'published');
  assert.deepEqual(await adm('read_completed_planning_intake_receipt_v1',f.read),{kind:'published',taskId:f.b.task,turnId:f.b.turn,artifactId:f.l.artifactId,revision:1});
  assert.deepEqual(JSON.parse(await db(`select content from turn_private.result_revisions where artifact_id='${f.l.artifactId}' and revision=1;`)),actual);
 }
});
run('foreign tuple, wrong source/current lease/attempt/output/usage and mutated factual body deny',async()=>{
 const f=await prepared({highlight:'peoples_square'});
 for(const i of [0,1,2,3,6,7])assert.equal(await db('select '+contentCall(f,{[i]:uuid()})+' is null;'),'t');
 for(const i of [4,5,8,9])assert.equal(await db('select '+contentCall(f,{[i]:'0'.repeat(64)})+' is null;'),'t');
 assert.equal(await db('select '+contentCall(f,{10:'zh'})+' is null;'),'t');
 for(const content of [{...f.complete.p_content,title:'Forged'}, {...f.complete.p_content,actions:[{kind:'book'}]}, {...f.complete.p_content,options:[...f.complete.p_content.options].reverse()}])
  assert.equal((await adm('complete_planning_intake_comparison_v1',{...f.complete,p_content:content})).kind,'blocked');
});
run('original recovered attempt and new current work lease publish without another paid attempt',async()=>{
 const f=await prepared({highlight:'peoples_square',recoverOutput:true});assert.notEqual(f.b.lease,f.l.leaseToken);
 assert.deepEqual(JSON.parse(await db('select '+contentCall(f))),f.complete.p_content);
 assert.equal((await adm('complete_planning_intake_comparison_v1',f.complete)).kind,'published');
 assert.equal(await db(`select count(*) from public.model_budget_attempts where task_id='${f.b.task}';`),'1');
});
run('current source, hidden text, planning consent, profile and budget limits fail closed',async()=>{
 for(const kind of ['hidden','consent','profile','scope','limit','goal','task','trip']){
  const f=await prepared({highlight:'peoples_square'});const other=kind==='task'?await fixture():null;
  const mutations={hidden:`update turn_private.text_content set hidden_at=now() where turn_id='${f.b.turn}'`,consent:`update turn_private.planning_consents set revoked_at=now() where owner_id='${f.b.owner}'`,profile:`update turn_private.planning_v2_execution_profiles set enabled=false where id='${f.profile}'`,scope:`update public.model_budget_scopes set frozen=true where id='${f.b.scope}'`,limit:`update public.model_budget_provider_limits set enabled=false where scope_id='${f.b.scope}'`,goal:`update turn_private.assistant_goals set scope_version=scope_version+1 where id='${f.a.goal}'`,task:`update turn_private.service_tasks set last_turn_id='${other?.b.turn}' where id='${f.b.task}'`,trip:`update turn_private.assistant_goals set trip_terminal=true where id='${f.a.goal}'`};
  if(kind==='trip'){const rejected=await sql(container,mutations[kind]+';');assert.notEqual(rejected.code,0);assert.match(rejected.stderr,/SERVICE_TASK_CONFLICT/);continue;}
  await db(mutations[kind]+';');assert.equal(await db('select '+contentCall(f)+' is null;'),'t',kind);
  assert.equal((await adm('complete_planning_intake_comparison_v1',f.complete)).kind,'blocked',kind);
 }
});
'''
original=(root/'tests/integration/turn/planning-v2-complete-worker-sql.test.mjs').read_text()
s+=original[original.index('const snapshot=f=>'):original.index("run('fresh completed place")]
s+="""
run('withdrawn Memory source and unsettled model never produce a personalized content',async()=>{
 const f=await prepared({highlight:'peoples_square',memory:true});
 await memoryCall(f.a,'revoke_memory_retrieval_consent',{p_consent_id:f.a.memoryConsent});
 assert.equal(await db('select '+contentCall(f)+' is null;'),'t');
 assert.equal((await adm('complete_planning_intake_comparison_v1',f.complete)).kind,'blocked');
 const waiting=await fixture();waiting.output={outputDigest:'0'.repeat(64),usageDigest:'0'.repeat(64)};
 assert.equal(await db('select '+contentCall(waiting)+' is null;'),'t');
});
"""
s+="""
run('real destination rejects different literal/delegation/intake even with correctly recomputed caller hashes',async()=>{
 const f=await prepared({highlight:'peoples_square',provenanceAudit:true});
 assert.deepEqual(JSON.parse(await db('select '+contentCall(f))),f.complete.p_content);
});
"""
(out/'affected-proof.test.mjs').write_text(s)
