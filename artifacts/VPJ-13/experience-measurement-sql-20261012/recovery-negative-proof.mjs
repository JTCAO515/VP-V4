import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {db,owned,name} from './kernel.mjs';
import {command} from '../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
await owned();const results=[];const owner=randomUUID(),op=randomUUID(),sameInstance=randomUUID();
assert.equal(await db(`select journey_measurement_private.core_recovery_binding_v1('${JSON.stringify({latest:true,floor:0,source:'backup'})}'::jsonb,'{}');`),'f');results.push({name:'caller/latest flag and restored control data cannot authenticate source',result:'PASS'});
assert.equal(await db('select journey_measurement_private.ready_v1();'),'f');results.push({name:'uninstalled independent live source keeps collection disabled',result:'PASS'});
for(const [label,context,frame] of [
 ['whole database',{mode:'whole_database'},{}],
 ['same source/target instance',{mode:'scoped_restore',source:{instanceId:sameInstance},targetInstanceId:sameInstance},{}],
 ['missing independently acquired journal',{mode:'scoped_restore'},{}],
 ['expired journal',{mode:'scoped_restore',ownerId:owner,scope:'journey-experience-measurement/1'}, {expiresAt:1}],
 ['foreign owner',{mode:'scoped_restore',ownerId:owner}, {ownerId:randomUUID(),expiresAt:Date.now()+10000}],
 ['wrong layout/pins',{mode:'scoped_restore',layoutDigest:'a'.repeat(64),pinsDigest:'b'.repeat(64)}, {layoutDigest:'c'.repeat(64),pinsDigest:'d'.repeat(64),expiresAt:Date.now()+10000}]
]){
 await owned();const r=await command('docker',['exec','-i',name,'psql','-h','/tmp/vpj13-b38420ad-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],`begin;set request.jwt.claim.role='service_role';select journey_measurement_private.reconcile_recovery_v1(null::export_private.core_jobs_v1,${literal(context)},${literal(frame)});rollback;`);
 assert.notEqual(r.code,0,label);assert.match(r.stderr,/MEASUREMENT_RECOVERY_DENIED/);results.push({name:label+' denies before data writes',result:'PASS'});
}
// Actual protected floor is derived inside SQL from the erasure authority time.
// A caller floor cannot be installed by the public Native command union.
await db(`begin;insert into auth.users(id) values('${owner}');select journey_measurement_private.record_floor_v1('${owner}','${op}','erasure',transaction_timestamp(),transaction_timestamp()+interval '20 days');
select journey_measurement_private.record_floor_v1('${owner}','${op}','erasure',clock_timestamp(),clock_timestamp()+interval '20 days');
select count(*) from journey_measurement_private.journals_v1 where owner_id='${owner}';rollback;`).then(v=>assert.equal(v,'1'));
results.push({name:'persistent immutable floor event duplicate does not mint or renew another event',result:'PASS'});
assert.equal(await db("select bool_and(not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='journey_measurement_private' and p.proname in('issue_recovery_v1','reconcile_recovery_v1','record_floor_v1');"),'t');results.push({name:'issuer/reconcile/floor have no Native or blanket service execute grant',result:'PASS'});
writeFileSync(new URL('recovery-negative-proof.json',import.meta.url),JSON.stringify({candidateSha256:createHash('sha256').update(readFileSync(new URL('measurement.candidate.sql',import.meta.url))).update(readFileSync(new URL('recovery.candidate.sql',import.meta.url))).digest('hex'),results,scope:'actual own PG17 denial/retained event proof',productionLiveSource:'UNAVAILABLE',syntheticProtectedAcquisitionPositive:'UNRUN',fullLifecycle:'INCOMPLETE',collection:'DEFAULT_DENIED'},null,2)+'\n');
console.log(results.length+' actual PG17 recovery negatives PASS; no live source/collection claim');
