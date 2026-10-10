import assert from'node:assert/strict';import{randomUUID as uuid}from'node:crypto';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
process.env.VP_RESULT_DATA_SQL_CONTAINER='vpj08-events-sql-20261010';const{fixture,claims}=await import('../../../tests/integration/privacy/result-data-sql/ownproof/runtime.mjs');
async function db(q){const r=await sql('vpj08-events-sql-20261010',q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();}
const a=await fixture();
const admission=()=>{const thread=uuid(),turn=uuid(),task=uuid(),message=uuid();return `begin;${claims(a)}select public.submit_service_task_turn('${thread}','${turn}','${uuid()}','${a.policy}','en','Canonical next task','${task}',1,'new_goal',null);select public.submit_assistant_message_v1('${a.conversation}','${message}','${uuid()}','${a.policy}','en','Canonical followup','follow_up','${a.goal}',1,'${task}','${a.rootMessage}',null);update turn_private.text_content set output_kind='answered',output_text='Synthetic canonical answer' where turn_id='${turn}';select turn_private.terminal('${turn}','completed',1);commit;`;};
for(let n=0;n<26;n++)await db(admission());
const page=async(after=0)=>JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.read_assistant_events_v1('${a.policy}','${a.conversation}',${after},50);commit;`));
const p1=await page();assert.equal(p1.events.length,50);assert.equal(p1.lastSequence,50);assert.equal(p1.hasMore,true);assert.deepEqual(p1.events.map(x=>x.sequence),Array.from({length:50},(_,i)=>i+1));const p2=await page(50);assert.equal(p2.events.length,5);assert.equal(p2.lastSequence,55);assert.equal(p2.hasMore,false);
// Actual canonical source append in one rolled-back admission must leave both
// original source and counter/index allocation absent. Next commit reuses 56.
await db(admission().replace('commit;','rollback;'));assert.equal((await page(55)).lastSequence,55);await db(admission());assert.deepEqual((await page(55)).events.map(x=>x.sequence),[56,57]);
console.log('canonical 50+1 qualified paging/second page/real source rollback/reuse contiguous 4 assertions PASS');
