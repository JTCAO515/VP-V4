import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{randomUUID as uuid}from'node:crypto';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
process.env.VP_RESULT_DATA_SQL_CONTAINER='vpj08-events-sql-20261010';
const{fixture,claims}=await import('../../../tests/integration/privacy/result-data-sql/ownproof/runtime.mjs');
const root='artifacts/VPJ-08/assistant-events-sql-20261010/';
async function db(q){const r=await sql('vpj08-events-sql-20261010',q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();}
await db('begin;'+readFileSync(root+'events-witness.candidate.sql','utf8')+'commit;');
const a=await fixture();const page=async(after=0)=>JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.read_assistant_events_v1('${a.policy}','${a.conversation}',${after},50);commit;`));
const before=await page();assert.equal(before.lastSequence,3);
const denied=await sql('vpj08-events-sql-20261010',`begin;select turn_private.retire_assistant_event_v1('${a.conversation}',1);rollback;`);assert.notEqual(denied.code,0);assert.match(denied.stderr,/ASSISTANT_EVENT_ERASE_AUTHORITY/);
// Administrator synthetic original xid-proof, deliberately distinct from
// original privacy handler/CAS acceptance (catalog pin still fail closed).
const proof=`insert into conversation_data_private.transaction_proofs_v1(transaction_id,owner_id,request_id,source_digest,graph,expires_at) values(pg_current_xact_id(),'${a.owner}','${uuid()}','${'a'.repeat(64)}',jsonb_build_object('turnIds',jsonb_build_array('${a.turn}')),floor(extract(epoch from clock_timestamp())*1000)::bigint+30000);`;
await db(`begin;${proof}delete from public.chat_turn_events where turn_id='${a.turn}' and sequence=1;delete from conversation_data_private.transaction_proofs_v1 where transaction_id=pg_current_xact_id();commit;`);
const after=await page();assert.deepEqual(after.events.map(x=>x.sequence),[1,2,3,4]);assert.deepEqual(after.events[0],{eventId:a.conversation+':1',sequence:1,type:'source_retired',retiredSequence:1});assert.deepEqual(after.events[3],{eventId:a.conversation+':4',sequence:4,type:'source_retired',retiredSequence:1});
assert.equal((await page(1)).lastSequence,4);assert.deepEqual((await page(3)).events,[after.events[3]]);
const scrub=JSON.parse(await db(`select to_jsonb(e) from turn_private.assistant_events_v1 e where conversation_id='${a.conversation}' and sequence=1;`));for(const k of['task_id','turn_id','status','tool','action_state','artifact_id','revision'])assert.equal(scrub[k],null);assert.equal(scrub.source_key,'ordinal:1');assert.equal(scrub.source_kind,'retired');
await db(`begin;${proof}select turn_private.retire_assistant_event_v1('${a.conversation}',1);delete from conversation_data_private.transaction_proofs_v1 where transaction_id=pg_current_xact_id();commit;`);assert.equal((await page()).lastSequence,4);
console.log('retirement closed-shape/scrub/zero/deleted-anchor/already-acked/idempotency 7 assertions PASS; administrator synthetic xid-proof, original handler CAS UNRUN');
