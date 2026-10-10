import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
process.env.VP_RESULT_DATA_SQL_CONTAINER='vpj08-events-sql-20261010';
const {fixture,claims}=await import('../../../tests/integration/privacy/result-data-sql/ownproof/runtime.mjs');
const root='artifacts/VPJ-08/assistant-events-sql-20261010/';
async function db(q){const r=await sql('vpj08-events-sql-20261010',q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();}
await db('begin;'+readFileSync(root+'events-reader.candidate.sql','utf8')+readFileSync(root+'events-lifecycle.candidate.sql','utf8')+'commit;');
const a=await fixture();
const page=async(after=0)=>JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.read_assistant_events_v1('${a.policy}','${a.conversation}',${after},50);commit;`));
const p=await page();assert.equal(p.kind,'assistant_events',JSON.stringify(p));assert.deepEqual(p.events.map(x=>x.type),['task_status','task_status','artifact_ready']);assert.deepEqual(p.events.map(x=>x.sequence),[1,2,3]);assert.equal(p.events[2].availability,'recheck');assert.equal(p.hasMore,false);
await db(`select turn_private.collect_assistant_turn_events_v1('${a.turn}');select turn_private.append_assistant_event_v1('result_event',(select id::text from turn_private.result_events where artifact_id='${a.artifact}' limit 1));`);
assert.equal((await page()).lastSequence,3);
await db(`begin;select turn_private.collect_assistant_turn_events_v1('${a.turn}');rollback;`);assert.equal((await page()).lastSequence,3);
for(const cursor of[4,999999999999999]){const r=await sql('vpj08-events-sql-20261010',`begin;${claims(a)}set role authenticated;select public.read_assistant_events_v1('${a.policy}','${a.conversation}',${cursor},50);rollback;`);assert.notEqual(r.code,0);assert.match(r.stderr,/INVALID_INPUT/);}
const other=await fixture();const foreign=JSON.parse(await db(`begin;${claims(other)}set role authenticated;select public.read_assistant_events_v1('${other.policy}','${a.conversation}',999,50);commit;`));assert.deepEqual(foreign,{kind:'unavailable'});
writeFileSync(root+'core-proof.json',JSON.stringify({provenance:'own actual PostgreSQL canonical synthetic source; SQL claims, not signed Auth/target/provider',events:p,results:['canonical link-before-event/text-content/order PASS','status+result same source append PASS','retained-source dedup PASS','rollback duplicate no allocation PASS','future cursor fail closed PASS','foreign conversation no cursor disclosure PASS']},null,2)+'\n');
console.log('canonical source reader 6 assertions PASS');
