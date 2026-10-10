import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{randomUUID as uuid}from'node:crypto';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
process.env.VP_RESULT_DATA_SQL_CONTAINER='vpj08-events-sql-20261010';const{fixture,claims,selected,eraseFor}=await import('../../../tests/integration/privacy/result-data-sql/ownproof/runtime.mjs');
const root='artifacts/VPJ-08/assistant-events-sql-20261010/';async function db(q){const r=await sql('vpj08-events-sql-20261010',q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();}
await db('begin;'+readFileSync(root+'events-witness.candidate.sql','utf8').replaceAll('create function','create or replace function')+'commit;');
console.log('own fixture exact reviewed candidate guards applied (no product target)');
const a=await fixture();const call=async(command)=>JSON.parse(await db(`begin;${claims(a)}select public.privacy_result_data_v1('${command.action}','${JSON.stringify(command)}',1);commit;`));
const selection=selected(a);const preview=await call({action:'preview',...selection});assert.equal(preview.eligible,true,JSON.stringify(preview));
const source=JSON.parse(await db(`select result_data_private.source_v1('${a.owner}','${a.artifact}');`));assert.equal(source.assistantDelivery.rows.length,1);assert.equal(source.assistantDelivery.rows[0].sequence,3);
const receipt=await call(eraseFor(selection,preview));assert.equal(receipt.state,'erased',JSON.stringify(receipt));assert.equal(receipt.decision.sourceResult,'erased');
const page=JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.read_assistant_events_v1('${a.policy}','${a.conversation}',0,50);commit;`));assert.deepEqual(page.events.map(x=>x.type),['task_status','task_status','source_retired','source_retired']);assert.equal(page.lastSequence,4);
assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${a.artifact}';`),'0');assert.equal(await db(`select count(*) from turn_private.assistant_conversations where id='${a.conversation}';`),'1');assert.equal(await db(`select count(*) from public.turns where id='${a.turn}';`),'1');
assert.equal(await db(`select count(*) from turn_private.assistant_events_v1 where artifact_id='${a.artifact}';`),'0');
console.log('actual original Result preview→source-boundCAS→erase→ordinal retirement→retained conversation/task replay PASS; SQL-claims admin invocation, no executeACL/signedAuth proof');
