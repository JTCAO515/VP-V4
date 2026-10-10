import assert from'node:assert/strict';import{randomUUID as uuid}from'node:crypto';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
process.env.VP_RESULT_DATA_SQL_CONTAINER='vpj08-events-sql-20261010';const{fixture,claims}=await import('../../../tests/integration/privacy/result-data-sql/ownproof/runtime.mjs');
async function db(q){const r=await sql('vpj08-events-sql-20261010',q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();}
const a=await fixture({linked:true});const call=async(action,input,worker=false)=>JSON.parse(await db(`begin;${worker?"set request.jwt.claim.role='service_role';":claims(a)}select public.privacy_linked_trip_delete_v1('${action}','${JSON.stringify(input)}');commit;`));
const p=await call('preview',{tripId:a.trip,expectedVersion:1});assert.deepEqual(p.conflicts,[]);const graph=JSON.parse(await db(`select graph from privacy_private.linked_delete_plans_v1 where id='${p.planId}';`));assert.equal(graph.assistantDelivery.rows.length,3);
const request=uuid();await call('confirm',{requestId:request,planId:p.planId,scopeDigest:p.scopeDigest,expectedVersion:1,confirmed:true,selection:p.selection});
// Existing original worker policy is enabled only in this disconnected
// administrator synthetic fixture; no provider, target config or role grant.
await db('insert into privacy_private.linked_delete_worker_settings_v1(singleton,enabled,max_lease_ms) values(true,true,15000) on conflict(singleton) do update set enabled=true;');
const lease=await call('claim',{requestId:request,operationId:uuid()},true);assert.equal(lease.kind,'leased');
const result=await call('execute',{requestId:request,leaseId:lease.leaseId},true);assert.equal(result.state,'completed',JSON.stringify(result));
assert.equal(await db(`select count(*) from public.trips where id='${a.trip}';`),'0');assert.equal(await db(`select count(*) from turn_private.assistant_events_v1 where owner_id='${a.owner}' and source_kind<>'retired';`),'0');assert.equal(await db(`select count(*) from turn_private.assistant_events_v1 where task_id='${a.task}' or turn_id='${a.turn}' or artifact_id='${a.artifact}';`),'0');
console.log('actual original linked Trip preview/graph CAS/confirm/leased original executor/execution-xid retirement PASS; disconnected synthetic policy only, not target authorization');
