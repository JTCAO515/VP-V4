import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {db,owned,name} from './kernel.mjs';
import {command} from '../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
const lit=v=>"'"+String(v).replaceAll("'","''")+"'";const out=new URL('.',import.meta.url);const results=[];
const base={schemaVersion:'journey-experience-measurement/1',purpose:'journey_experience_measurement'};
for(const externalCopy of [false,true]){
 const a={owner:uuid(),session:uuid(),attempt:uuid(),consent:uuid(),trip:uuid(),admission:uuid(),report:uuid(),operation:uuid()};
 try{
  await db(`insert into auth.users(id) values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into public.trips(id,owner_id,title,head_version) values('${a.trip}','${a.owner}','Synthetic erasure source',0);set role service_role;set request.jwt.claims='{"role":"service_role"}';select public.native_prepare_v2('${a.owner}','${a.session}','${a.attempt}');`);
  const context=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session,role:'authenticated',is_anonymous:false})}';`;
  await db(context+`select public.native_session_v2('login','${a.attempt}');`);const epoch=Number(await db(`select epoch from identity_private.mobile_accounts where owner_id='${a.owner}'`));
  const source={kind:'native_entry',logicalId:uuid(),entry:'e2',anchor:{kind:'trip',tripId:a.trip,tripVersion:0,medium:'pdf'}};
  // Synthetic existing retained rows exercise the erasure boundary. They are
  // not evidence of a configured collector or real opt-in/HTTP/GoTrue.
  await db(`begin;
insert into journey_measurement_private.consents_v1 values('${a.owner}','${a.consent}','${uuid()}',repeat('a',64),'${a.session}',${epoch},'journey-experience-measurement/2026-10-12',array['e2'],transaction_timestamp(),transaction_timestamp()+interval '30 days',null);
insert into journey_measurement_private.admissions_v1(owner_id,admission_id,request_metadata_digest,consent_id,entry,source_kind,source_id,source_revision,source_ref,clock_origin,task_id,goal_id,accepted_at,received_at,expires_at,session_id,mobile_epoch,first_ever) values('${a.owner}','${a.admission}',repeat('a',64),'${a.consent}','e2','native_entry','${source.logicalId}',null,${lit(JSON.stringify(source))}::jsonb,'{"kind":"unknown"}',null,null,null,transaction_timestamp(),transaction_timestamp()+interval '30 days','${a.session}',${epoch},'unknown');
insert into journey_measurement_private.reports_v1 values('${a.owner}','${a.report}',repeat('a',64),'${a.admission}','{"kind":"terminal","outcome":"technical_failure"}','{"kind":"unknown"}',transaction_timestamp(),transaction_timestamp()+interval '30 days');
${externalCopy?`insert into journey_measurement_private.copy_obligations_v1 values('${a.owner}','${uuid()}',1,'independent_journal',null,repeat('b',64),'unknown',transaction_timestamp(),transaction_timestamp()+interval '20 days');`:''}
commit;`);
  async function call(bytes,action){return JSON.parse(await db(context+`select public.native_journey_measurement_v1(${lit(action)},${lit(bytes)},${epoch});`));}
  const previewBytes=JSON.stringify({...base,action:'preview',operationId:a.operation});const preview=await call(previewBytes,'preview');assert.equal(preview.kind,'preview');
  const eraseBytes=JSON.stringify({...base,action:'erase',operationId:a.operation,sourceDigest:preview.sourceDigest,previewDigest:preview.previewDigest});
  const erased=await call(eraseBytes,'erase');assert.equal(erased.kind,'erasure');assert.equal(erased.consentRevoked,true);assert.equal(erased.allUserDataCompleted,false);assert.equal(erased.requestDigest,createHash('sha256').update(eraseBytes).digest('hex'));
  assert.equal(await db(`select (select count(*) from journey_measurement_private.consents_v1 where owner_id='${a.owner}')+(select count(*) from journey_measurement_private.admissions_v1 where owner_id='${a.owner}')+(select count(*) from journey_measurement_private.reports_v1 where owner_id='${a.owner}');`),'0');
  assert.equal(erased.lifecycle.state,externalCopy?'incomplete':'complete');assert.equal(erased.lifecycle.copyState,externalCopy?'unknown':'acknowledged');
  const recovered=await call(JSON.stringify({...base,action:'recover',operationId:a.operation,mutationBytes:eraseBytes}),'recover');
  assert.equal(recovered.requestDigest,erased.requestDigest);assert.equal(recovered.decidedAt,erased.decidedAt);assert.equal(recovered.expiresAt,erased.expiresAt);
  results.push({name:externalCopy?'external copy unknown preserves consent stop/incomplete and original receipt TTL':'self preview/CAS erase/recover clears retained payload, no receipt TTL refresh',result:'PASS'});
 }catch(error){writeFileSync(new URL('erasure-fail.json',out),JSON.stringify({results,error:String(error)},null,2)+'\n');throw error;}
 finally{await db(`delete from auth.users where id='${a.owner}';`);assert.equal(await db(`select count(*) from auth.users where id='${a.owner}'`),'0');}
}
writeFileSync(new URL('erasure-proof.json',out),JSON.stringify({candidateSha256:createHash('sha256').update(readFileSync(new URL('measurement.candidate.sql',out))).update(readFileSync(new URL('recovery.candidate.sql',out))).digest('hex'),results,scope:'actual own PG17 ordinary SQL Native session scoped erase, retained rows seeded synthetically',collection:'DEFAULT_DENIED',wholeLifecycle:'INCOMPLETE',managedEncryptedCopyPositive:'UNRUN',ownAccountCleanup:'PASS'},null,2)+'\n');console.log(results.length+' actual PG17 erasure/CAS/unknown-copy cases PASS');
