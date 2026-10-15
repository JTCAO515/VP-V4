import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts} from './fixture.mjs';
import {produceTripCandidate} from './producer-fixture.mjs';
import {decodeTurnExportPage,turnExportHandler} from '../../../lib/server/privacy/turn-data/export.ts';
import {exportCanonical} from '../../../lib/server/privacy/export-dispatcher.ts';
const flags={skip:!process.env.VP_TRIP_PG_BIN,timeout:180000};
test('original export request/lease → versioned Trip source/page → strict current TS handler; no real artifact/key',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 const {a,task}=await produceTripCandidate(f,db);
 const coreACL=(await db("select has_function_privilege('authenticated','public.privacy_core_export_v1(text,jsonb)','EXECUTE') auth,has_function_privilege('service_role','public.privacy_core_export_v1(text,jsonb)','EXECUTE') service"))[0];assert.deepEqual(coreACL,{auth:false,service:false});console.log('C0 export enrollment: original D2 fixture explicit GRANT, production ACL unchanged');
 // Same explicit C0 local policy enrollment used by the original D2 suite.
 // key_id is an opaque synthetic label: no key material or encryption is used.
 await db(`grant execute on function public.privacy_core_export_v1(text,jsonb) to authenticated,service_role;insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) values('${uuid()}',1,true,'local','agent008-page-fixture',90000,600000,300000,1000,100,8388608,clock_timestamp()+interval '1 hour');`);
 const requestId=uuid();await f.call(a,'privacy_core_export_v1',['request',{requestId,confirmed:true}]);
 const lease=await f.rawService('privacy_core_export_v1',{p_action:'claim',p_input:{requestId,operationId:uuid(),maxRunMs:90000,expectedEnvironment:'local',expectedKeyId:'agent008-page-fixture'}});assert.equal(lease.kind,'privacy_export_lease/1');
 const bind={requestId,leaseId:lease.leaseId,generation:lease.generation};
 const page=await f.rawService('privacy_core_export_v1',{p_action:'turn_page',p_input:{...bind,section:'snapshot',cursor:null,limit:100}});
 console.log('Trip export page',page.schemaVersion,page.items?.[0]?.sources?.map(g=>[g.relation,g.rows.length]));
 assert.equal(page.schemaVersion,'turn-trip-core-export/1');assert.equal(decodeTurnExportPage(page,100,a.owner,Date.now()),null);assert.ok(decodeTurnExportPage(page,100,a.owner,Date.now(),true));
 assert.equal(createHash('sha256').update(exportCanonical({snapshot:page.items})).digest('hex'),page.sourceDigest);
 const handler=turnExportHandler({...lease,ownerId:a.owner},async(action,p)=>{assert.equal(action,'turn_page');return f.rawService('privacy_core_export_v1',{p_action:action,p_input:p});});
 assert.ok(await handler.page('snapshot',null,100,new AbortController().signal));
 for(const invalid of [{...page,schemaVersion:'turn-trip-core-export/future'},{...page,unsafe:'extra'}, {...page,items:[{...page.items[0],sources:page.items[0].sources.slice(0,-1)}]}])assert.equal(decodeTurnExportPage(invalid,100,a.owner,Date.now(),true),null);
 const modules=['trip','conversations','results','profile','memory','turn','user_artifact','brief','entitlements'].map(module=>module==='turn'?{module,status:'complete',reason:'NONE',pages:1,rows:1,digest:page.sourceDigest}:{module,status:'unavailable',reason:'HANDLER_MISSING',pages:0,rows:0,digest:null});
 const json="'"+JSON.stringify(modules).replaceAll("'","''")+"'::jsonb";
 const qualifies=(await db(`set request.jwt.claim.role='service_role';select export_private.turn_commit_qualifies_v1(j,${json},'${lease.leaseId}',${lease.generation}) v from export_private.core_jobs_v1 j where request_id='${requestId}'`))[0].v;assert.equal(qualifies,true);
 await db(`update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id='${a.owner}' and policy_id='${a.policy}'`);
 await assert.rejects(f.rawService('privacy_core_export_v1',{p_action:'turn_page',p_input:{...bind,section:'snapshot',cursor:null,limit:100}}),/TURN_SOURCE|DATA_POLICY|CONSENT/);
 assert.equal((await db(`select state from turn_private.service_task_capacity where task_id='${task.taskId}'`))[0].state,'released');
});
