import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {db,owned} from './kernel.mjs';
const lit=v=>"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
await owned();const a={owner:uuid(),foreign:uuid(),trip:uuid(),session:uuid(),attempt:uuid()};
const results=[];
try{
 await db(`insert into auth.users(id) values('${a.owner}'),('${a.foreign}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into public.trips(id,owner_id,title,head_version) values('${a.trip}','${a.owner}','Synthetic same-Trip source',0);
 set role service_role;set request.jwt.claims='{"role":"service_role"}';select public.native_prepare_v2('${a.owner}','${a.session}','${a.attempt}');`);
 const context=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session,role:'authenticated',is_anonymous:false})}';`;
 await db(context+`select public.native_session_v2('login','${a.attempt}');`);
 for(const medium of ['pdf','screenshot']){
  const source={kind:'native_entry',logicalId:uuid(),entry:'e2',anchor:{kind:'trip',tripId:a.trip,tripVersion:0,medium}};
  assert.equal(await db(`select journey_measurement_private.source_shape_v1(${lit(source)}::jsonb);`),'t');
  assert.equal(await db(context+`select journey_measurement_private.native_anchor_v1('${a.owner}','e2',${lit(source)}::jsonb);`),'t');
  assert.equal(await db(context+`select journey_measurement_private.native_anchor_v1('${a.foreign}','e2',${lit(source)}::jsonb);`),'f');
  const stale={...source,anchor:{...source.anchor,tripVersion:1}};
  assert.equal(await db(context+`select journey_measurement_private.native_anchor_v1('${a.owner}','e2',${lit(stale)}::jsonb);`),'f');
  results.push({name:medium+' pre-result current Trip anchor; foreign/stale rejects',result:'PASS'});
 }
 const noTrip={kind:'native_entry',logicalId:uuid(),entry:'e2',anchor:{kind:'local_import',medium:'pdf'}};
 assert.equal(await db(`select journey_measurement_private.source_shape_v1(${lit(noTrip)}::jsonb);`),'f');results.push({name:'no-Trip/local_import branch rejected',result:'PASS'});
 const goal=uuid();const e3={kind:'native_entry',logicalId:goal,entry:'e3',anchor:{kind:'goal',conversationId:uuid(),goalId:goal,goalVersion:1,parentMessageId:uuid(),inputSequence:1}};
 assert.equal(await db(`select journey_measurement_private.source_shape_v1(${lit(e3)}::jsonb);`),'t');
 assert.equal(await db(`select journey_measurement_private.source_shape_v1(${lit({...e3,logicalId:uuid()})}::jsonb);`),'f');
 assert.equal(await db(context+`select journey_measurement_private.native_anchor_v1('${a.owner}','e3',${lit(e3)}::jsonb);`),'f');
 results.push({name:'E3 logicalId equals Goal, missing full source rejects',result:'PASS'});
 assert.equal(await db(`select journey_measurement_private.source_shape_v1(${lit({...e3,anchor:{...e3.anchor,freeText:'forbidden'}})}::jsonb);`),'f');results.push({name:'closed anchor raw fields reject',result:'PASS'});
 // This source qualification is independent of result availability. Neither a
 // PDF operation nor a result/Task was created to seed the denominator.
 assert.equal(await db(`select (select count(*) from pdf_intake_private.operations_v1 where owner_id='${a.owner}')+(select count(*) from turn_private.service_tasks where owner_id='${a.owner}')+(select count(*) from turn_private.result_artifacts where owner_id='${a.owner}');`),'0');
 results.push({name:'E2 acceptance source has zero successful operations/Tasks/results',result:'PASS'});
}catch(error){writeFileSync(new URL('ticket-source-fail.json',import.meta.url),JSON.stringify({results,error:String(error)},null,2)+'\n');throw error;}
finally{await db(`delete from auth.users where id in('${a.owner}','${a.foreign}');`);assert.equal(await db(`select count(*) from auth.users where id in('${a.owner}','${a.foreign}');`),'0');}
writeFileSync(new URL('ticket-source-proof.json',import.meta.url),JSON.stringify({candidateSha256:createHash('sha256').update(readFileSync(new URL('measurement.candidate.sql',import.meta.url))).digest('hex'),results,scope:'actual PG17 private source qualification, not configured lifecycle or authenticated HTTP',ownSyntheticCleanup:'PASS',unrun:['positive E3 original input writer tuple','Native guarded selection/render source association','complete lifecycle']},null,2)+'\n');
console.log(results.length+' actual PG17 ticket source proofs PASS');
