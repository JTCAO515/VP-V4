import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {db,owned,name} from './kernel.mjs';
import {command} from '../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
const results=[];const owner=randomUUID(),session=randomUUID(),attempt=randomUUID();
const literal=s=>"'"+s.replaceAll("'","''")+"'";
await owned();
await db(`insert into auth.users(id) values('${owner}');insert into identity_private.mobile_accounts(owner_id) values('${owner}');insert into auth.sessions(id,user_id) values('${session}','${owner}');
set role service_role;set request.jwt.claims='{"role":"service_role"}';select public.native_prepare_v2('${owner}','${session}','${attempt}');`);
const actorPrefix=`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${owner}';set request.jwt.claims='${JSON.stringify({session_id:session,role:'authenticated',is_anonymous:false})}';`;
await db(actorPrefix+`select public.native_session_v2('login','${attempt}');commit;`);
const epoch=Number(await db(`select epoch from identity_private.mobile_accounts where owner_id='${owner}';`));
const base={schemaVersion:'journey-experience-measurement/1',purpose:'journey_experience_measurement'};
async function call(action,payload,expectedEpoch=epoch){await owned();return command('docker',['exec','-i',name,'psql','-h','/tmp/vpj13-b38420ad-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],actorPrefix+`select public.native_journey_measurement_v1(${literal(action)},${literal(JSON.stringify({...base,action,...payload}))},${expectedEpoch});commit;`);}
try{
 const p=await call('policy',{});assert.equal(p.code,0,p.stderr);const value=JSON.parse(p.stdout.trim());assert.equal(value.enabled,false);assert.equal(value.consent,null);assert.equal(value.ownerId,owner);assert.equal(value.sessionId,session);assert.equal(value.mobileEpoch,epoch);results.push({name:'ordinary SQL-native-session owner/default-off/no existing consent',result:'PASS'});
 for(const [label,action,payload,error,expectedEpoch] of [
  ['unconfigured consent refuses','consent',{operationId:randomUUID(),noticeVersion:'journey-experience-measurement/2026-10-12',entries:['e1']},'MEASUREMENT_UNAVAILABLE',epoch],
  ['wrong purpose rejects','policy',{purpose:'research'},'INVALID_INPUT',epoch],
  ['caller actor rejects','policy',{ownerId:randomUUID()},'INVALID_INPUT',epoch],
  ['replaced epoch rejects','policy',{},'SESSION_REPLACED',epoch+1]
 ]){const r=await call(action,payload,expectedEpoch);assert.notEqual(r.code,0,label);assert.match(r.stderr,new RegExp(error),label);results.push({name:label,result:'PASS'});}
 assert.equal(await db('select count(*) from journey_measurement_private.consents_v1;'),'0');results.push({name:'denials created zero consent rows',result:'PASS'});
 const guards=await db('select profile_data_private.schema_v1(),conversation_data_private.schema_supported_v1(),result_data_private.schema_supported_v1(),turn_data_private.schema_supported_v1();');
 results.push({name:'uncomposed original global schema guards',result:guards==='t|t|t|t'?'PASS':'FAIL',actual:guards,reason:'Initial module candidate requires exact static-after composition before product append; not waived'});
}catch(error){writeFileSync(new URL('auth-defaults-fail.json',import.meta.url),JSON.stringify({results,error:String(error)},null,2)+'\n');throw error;}
finally{await db(`delete from auth.users where id='${owner}';`);assert.equal(await db(`select count(*) from auth.users where id='${owner}'`),'0');}
writeFileSync(new URL('auth-defaults.json',import.meta.url),JSON.stringify({candidateSha256:createHash('sha256').update(readFileSync(new URL('measurement.candidate.sql',import.meta.url))).digest('hex'),results,authEvidence:'actual SQL native session fixture; not GoTrue/JWT cryptographic validation or HTTP',ownSyntheticAccountCleanup:'PASS',fullLifecycle:'INCOMPLETE'},null,2)+'\n');
console.log(JSON.stringify(results));
