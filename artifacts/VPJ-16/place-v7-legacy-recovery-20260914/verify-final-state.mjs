import fs from 'node:fs';import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(n,root),'utf8'));
assert.ok(read('place-run.json').finishedAt);assert.equal(read('combined-accounting.json').coverage,'PASS');
const runs=['../place-v7-isolated-20260914/place-run.json','../place-v7-legacy-continuation-20260914/place-run.json','place-run.json'].map(read);
const tasks=runs.flatMap(r=>r.tasks),ids=tasks.map(t=>t.request.turnId);assert.equal(ids.length,132);assert.ok(ids.every(x=>/^[0-9a-f-]{36}$/.test(x)));
try{
 const {query}=await import('./transport.mjs');
 const result=JSON.parse(query(`set role postgres;begin read only;select jsonb_build_object('ownedMobileSessionsClosed',(select count(*)=2 and bool_and(session_id is null) from identity_private.mobile_accounts where owner_id in ('fe70fac7-d312-494c-bde1-4c37c3942722','7d063756-e5d8-4a6b-94a3-5134b0b04443')),'work',(select jsonb_agg(jsonb_build_object('turnId',w.turn_id,'workState',w.state,'turnState',t.status,'outcome',g.original_outcome,'leaseCleared',w.lease_token is null and w.expires_at is null) order by w.turn_id) from turn_private.work w join public.turns t on t.id=w.turn_id join turn_private.grounded_turns g on g.turn_id=w.turn_id where w.turn_id in ('${ids.join("','")}')),'attempts',(select count(*) from public.model_budget_attempts),'unresolved',(select count(*) from public.model_budget_attempts where status not in ('settled','released')),'reader',(select enabled from knowledge_review_private.publication_settings),'ops',(select enabled from knowledge_review_private.settings),'activeMembers',(select count(*) from knowledge_review_private.members where active));rollback;`));
 fs.writeFileSync(new URL('final-state-observation.json',root),JSON.stringify({at:new Date().toISOString(),...result},null,2)+'\n',{mode:0o600});
 assert.equal(result.ownedMobileSessionsClosed,true);assert.equal(result.work.length,132);assert.equal(new Set(result.work.map(x=>x.turnId)).size,132);
 const expected=new Map(tasks.map(t=>[t.request.turnId,t.expected.outcome]));
 // Existing migrations: blocked -> public unavailable -> internal failed. This is a
 // terminal supported refusal, distinct from a model/transport technical failure.
 for(const row of result.work){const outcome=expected.get(row.turnId);assert.ok(['answered','partial','clarification','blocked'].includes(outcome));assert.equal(row.outcome,outcome);assert.equal(row.turnState,outcome==='blocked'?'unavailable':'completed');assert.equal(row.workState,outcome==='blocked'?'failed':'completed');assert.equal(row.leaseCleared,true);}
 assert.equal(result.attempts,491);assert.equal(result.unresolved,0);assert.equal(result.reader,false);assert.equal(result.ops,false);assert.equal(result.activeMembers,0);
 const counts={};for(const row of result.work)counts[row.workState]=(counts[row.workState]??0)+1;
 const proof={at:new Date().toISOString(),status:'PASS',ownedMobileSessionsClosed:true,workRows:132,allWorkTerminalAsExpected:true,workStateCounts:counts,allLeasesCleared:true,attempts:491,unresolved:0,reader:false,ops:false,activeMembers:0,initialVerifierMismatch:'All-completed assumption incorrectly included expected blocked/unavailable outcomes; original observation and verifier preserved.',contractSources:['supabase/migrations/20260914041000_vpj_16_place_questions.sql:166','supabase/migrations/20260910171836_vpj_07_text_authorization.sql:214']};
 fs.writeFileSync(new URL('final-state-verification.json',root),JSON.stringify(proof,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify(proof));
}catch(e){console.log(JSON.stringify({status:'FAIL',errorType:e.name}));process.exitCode=1;}
