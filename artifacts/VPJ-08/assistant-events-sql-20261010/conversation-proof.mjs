import assert from'node:assert/strict';import{randomUUID as uuid}from'node:crypto';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
process.env.VP_RESULT_DATA_SQL_CONTAINER='vpj08-events-sql-20261010';const{fixture,claims}=await import('../../../tests/integration/privacy/result-data-sql/ownproof/runtime.mjs');
async function db(q){const r=await sql('vpj08-events-sql-20261010',q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();}
const a=await fixture();const selection={scope:'conversation-sensitive-data/1',requestId:uuid(),rootKind:'conversation',rootId:a.conversation,objectIds:[]};
const call=async(c)=>JSON.parse(await db(`begin;${claims(a)}select public.privacy_conversation_data_v1('${c.action}','${JSON.stringify(c)}',1);commit;`));
const p=await call({action:'preview',...selection});assert.equal(p.eligible,true,JSON.stringify(p));
const source=JSON.parse(await db(`select conversation_data_private.source_v1('${a.owner}','conversation','${a.conversation}');`));assert.equal(source.assistantDelivery.rows.length,3);
const r=await call({action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true});assert.equal(r.state,'erased',JSON.stringify(r));
assert.equal(await db(`select count(*) from turn_private.assistant_events_v1 where owner_id='${a.owner}';`),'0');assert.equal(await db(`select count(*) from turn_private.assistant_event_heads_v1 where owner_id='${a.owner}';`),'0');assert.equal(await db(`select count(*) from public.trips where id='${a.trip}';`),'1');
const page=JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.read_assistant_events_v1('${a.policy}','${a.conversation}',0,50);commit;`));assert.deepEqual(page,{kind:'unavailable'});
console.log('actual original Conversation qualified preview/source-boundCAS/erase/full-parent cascade/retained Trip/denied replay PASS; SQL-claims admin invocation, not signedAuth');
