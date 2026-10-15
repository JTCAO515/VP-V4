import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {nativeDatabase} from './native-db.mjs';
test('new RPC exact role matrix and private aliases preserve all negative capabilities',{skip:!process.env.VP_TRIP_PG_BIN,timeout:180000},async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');
 const declared={
 'public.submit_trip_service_task_v1(uuid,jsonb,jsonb)':'authenticated',
 'public.continue_trip_service_task_v1(uuid,uuid,uuid,uuid,text,text)':'authenticated',
 'public.cancel_trip_service_task_v1(uuid)':'authenticated',
 'public.trip_service_task_owner_v1(uuid,text,jsonb)':'authenticated',
 'public.privacy_trip_service_task_v1(uuid,text,text,text,bigint)':'authenticated',
 'public.trip_service_task_worker_v1(text,jsonb)':'service_role',
 'public.complete_text_work_before_trip_v1(uuid,uuid,text,text)':null,
 'public.submit_service_task_turn_before_trip_v1(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid)':null,
 };
 const rows=[];
 for(const [signature,allowed] of Object.entries(declared)){
 const row=(await db(`select '${signature}' signature,pg_get_userbyid(proowner) owner,prosecdef secdef,proconfig config,proacl::text acl,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service_role from pg_proc where oid='${signature}'::regprocedure`))[0];
 assert.equal(row.owner,'postgres');assert.equal(row.secdef,true);assert.ok(row.config.includes('search_path=""'));for(const role of ['anon','authenticated','service_role'])assert.equal(row[role],role===allowed,signature+' '+role);rows.push(row);
 }
 const privateLeaks=(await db("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='turn_private' and (p.proname like 'trip_privacy_%' or p.proname in('trip_service_task_runtime_v1','require_trip_runtime_v1','complete_trip_clarification_v1','complete_trip_failure_v1','lock_trip_account_v1')) and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))"))[0].n;assert.equal(privateLeaks,0);
 writeFileSync('artifacts/AGENT-008/trip-settlement-20261015/final-role-vector.json',JSON.stringify({rpc:rows,privateLeaks,fixtureGrant:false},null,2)+'\n');
});
