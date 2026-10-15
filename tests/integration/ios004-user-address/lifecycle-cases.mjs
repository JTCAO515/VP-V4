// Existing disabled lifecycle worker tested with synthetic SQL claims, not an activation grant.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export async function lifecycleCases(c,fixture){
 const call=async(action,input)=>(await c.query('select public.privacy_linked_trip_delete_v1($1,$2) value',[action,input])).rows[0].value;
 await c.query("select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[fixture.owner,JSON.stringify({role:'authenticated',is_anonymous:false,session_id:fixture.session})]);
 assert.equal((await c.query("select has_function_privilege('authenticated','public.privacy_linked_trip_delete_v1(text,jsonb)','EXECUTE') value")).rows[0].value,false,'existing disabled ACL remains disabled');
 const preview=await call('preview',{tripId:fixture.trip,expectedVersion:5});assert.deepEqual(preview.conflicts,[]);
 const requestId=randomUUID(),queued=await call('confirm',{requestId,planId:preview.planId,scopeDigest:preview.scopeDigest,expectedVersion:5,confirmed:true,selection:preview.selection});assert.equal(queued.state,'queued');
 await c.query("insert into privacy_private.linked_delete_worker_settings_v1(singleton,enabled,max_lease_ms) values(true,true,30000)");
 await c.query("select set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
 const lease=await call('claim',{requestId,operationId:randomUUID()});assert.equal(lease.kind,'leased');
 const erased=await call('execute',{requestId,leaseId:lease.leaseId});assert.equal(erased.state,'completed');
 assert.deepEqual(await call('execute',{requestId,leaseId:lease.leaseId}),erased,'unknown ACK replays the original erasure receipt');
 for(const table of ['trips','trip_version_snapshots','trip_items','trip_days']){
  const field=table==='trips'?'id':'trip_id';assert.equal(Number((await c.query(`select count(*) value from public.${table} where ${field}=$1`,[fixture.trip])).rows[0].value),0);
 }
 console.log('PASS original linked-delete SQL claims lifecycle erases address snapshots; receipt replay; existing ordinary/worker ACL remains disabled');
}
