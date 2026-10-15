import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {canonicalPlaceAskHTTP} from '../../../lib/server/knowledge/place-ask/http.ts';
import {database} from './database.mjs';
import {fixedSource} from './fixed-source.mjs';
import {adapter,productionServer} from './adapter.mjs';

// Explicitly fail when invoked without the reviewed input/dependencies. This is
// a native17 integration entry, not a default unit-suite or SKIP-as-PASS path.
test('actual v7 HTTP / Supabase SDK / private PG17 ordinary-role admission and recovery',async t=>{
 const cleanup=[],owned={after:fn=>cleanup.push(fn)};
 t.after(async()=>{for(const fn of cleanup.reverse())await fn();});
 const source=await fixedSource(owned,process.env.CANONICAL_SQL_CHECKPOINT);
 const db=await database(owned,{bin:process.env.VP_WIKI_PG_BIN,module:process.env.VP_WIKI_PG_MODULE,...source});
 const ports=source.canonicalFixturePorts(db.connect);owned.after(()=>ports.close());
 const transport=await adapter(owned,ports);
 const app=await productionServer(owned,{handler:canonicalPlaceAskHTTP,NextRequest});
 const env={VISEPANDA_PLACE_ACTIONS_ENABLED:'true',VISEPANDA_NATIVE_LOCAL_TEXT:'true',NEXT_PUBLIC_SUPABASE_URL:transport.origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:transport.key,VERCEL_ENV:undefined,VISEPANDA_NATIVE_STAGING:undefined,VISEPANDA_NATIVE_PRODUCTION:undefined,VISEPANDA_NATIVE_LOCAL_TASK_POLICY:undefined};
 const saved=Object.fromEntries([...Object.keys(env),'VISEPANDA_NATIVE_LOCAL_TEXT_POLICY'].map(k=>[k,process.env[k]]));
 for(const[k,v]of Object.entries(env))v===undefined?delete process.env[k]:process.env[k]=v;
 owned.after(()=>{for(const[k,v]of Object.entries(saved))v===undefined?delete process.env[k]:process.env[k]=v;});
 await ports.query('update turn_private.service_task_capacity_settings set enabled=true where singleton');
 const prepare=async actor=>{
  await ports.query('update identity_private.mobile_accounts set session_id=$2,epoch=1 where owner_id=$1',[actor.id,actor.session]);
  await ports.query('insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values($1,$2,$3,1)',[actor.id,randomUUID(),actor.session]);
  return transport.register(actor);
 };
 const counts=async f=>(await ports.query(`select (select count(*)::int from public.turns where owner_id=$1) turns,(select count(*)::int from turn_private.service_tasks where owner_id=$1) tasks,(select count(*)::int from turn_private.service_task_turns where owner_id=$1) links,(select count(*)::int from turn_private.service_task_capacity where owner_id=$1) reservations`,[f.owner.id])).rows[0];
 const tripSnapshot=async f=>(await ports.query("select jsonb_build_object('trip',to_jsonb(t),'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.day_id) from public.trip_days d where d.trip_id=t.id),'[]'::jsonb),'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.item_id) from public.trip_items i where i.trip_id=t.id),'[]'::jsonb),'references',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.trip_place_references r where r.trip_id=t.id),'[]'::jsonb)) value from public.trips t where id=$1",[f.trip])).rows[0].value;
 for(const mode of ['accepted','lost-ack','unknown-sdk','source-withdrawn','consent-withdrawn','actor-switched'])await t.test(mode,async()=>{
  const f=await ports.fixture(),token=await prepare(f.owner);process.env.VISEPANDA_NATIVE_LOCAL_TEXT_POLICY=f.policy;
  const beforeTrip=await tripSnapshot(f),bytes=JSON.stringify(f.request,null,1)+'\n',digest=createHash('sha256').update(bytes,'utf8').digest('hex');
  if(mode==='lost-ack'||mode==='unknown-sdk'||mode==='actor-switched')transport.faults.push({action:'selected_submit',kind:mode==='unknown-sdk'?'malformed':'lost',...(mode==='actor-switched'?{afterCommit:()=>ports.query('update identity_private.mobile_accounts set session_id=null where owner_id=$1',[f.owner.id])}:{})});
  const headers={'content-type':'application/json',authorization:'Bearer '+token};
  if(mode==='accepted') {
   const parts=token.split('.');const payload=JSON.parse(Buffer.from(parts[1],'base64url'));payload.sub=randomUUID();parts[1]=Buffer.from(JSON.stringify(payload)).toString('base64url');
   const denied=await fetch(app+'/api/chat/native/v7/place-ask',{method:'POST',headers:{...headers,authorization:'Bearer '+parts.join('.')},body:bytes});assert.equal(denied.status,401);assert.deepEqual(await counts(f),{turns:0,tasks:0,links:0,reservations:0});
  }
  const post=await fetch(app+'/api/chat/native/v7/place-ask',{method:'POST',headers,body:bytes});
  const dto=await post.json(),uncertain=['lost-ack','unknown-sdk','actor-switched'].includes(mode);
  assert.equal(post.status,uncertain?200:201);assert.equal(dto.kind,uncertain?'unknown':'accepted');
  const operation={operationId:f.submission.idempotencyKey,scopeKind:'thread',scopeId:f.submission.threadId,messageId:null,turnId:f.submission.turnId};assert.deepEqual(dto.operation,operation);
  assert.deepEqual(await counts(f),{turns:1,tasks:1,links:1,reservations:1});
  const root=(await ports.query('select g.selected_place_request proof,c.input_text,s.id task_id,s.expected_result,k.state capacity_state from turn_private.grounded_turns g join turn_private.text_content c on c.turn_id=g.turn_id join turn_private.service_tasks s on s.id=g.task_id join turn_private.service_task_capacity k on k.task_id=s.id where g.turn_id=$1',[f.submission.turnId])).rows[0];
  assert.equal(root.proof.requestDigest,digest);assert.equal(root.input_text,f.submission.text);assert.equal(root.task_id,f.submission.serviceTask.id);assert.equal(root.expected_result,'text_answer');assert.equal(root.capacity_state,'reserved');assert.deepEqual(root.proof.expectation,f.expectation);
  if(!uncertain)assert.deepEqual(dto.originalReceipt,root.proof.originalReceipt);
  if(mode==='source-withdrawn')await ports.privileged(f.reviewer,'ops_review_workspace',{p_input:{action:'revoke_statement',operationId:randomUUID(),candidateId:f.source.candidate,expectedPublicationVersion:1,note:'C0 source withdrawal'}});
  if(mode==='consent-withdrawn')await ports.query('update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id=$1 and policy_id=$2',[f.owner.id,f.policy]);
  const query=new URLSearchParams(Object.entries(operation).filter(([,v])=>v!==null));
  const get=await fetch(app+'/api/chat/native/v7/place-ask?'+query,{headers}),recovered=await get.json();
  if(mode==='actor-switched')assert.equal(recovered.kind,'unavailable');
  else{
   assert.equal(get.status,200);assert.equal(recovered.kind,'recovered');assert.deepEqual(recovered.operation,operation);assert.deepEqual(recovered.receipt.originalReceipt,root.proof.originalReceipt);
   assert.equal(recovered.receipt.binding.requestDigest,digest);assert.equal(recovered.receipt.binding.turnId,f.submission.turnId);assert.equal(recovered.receipt.binding.serviceTaskId,f.submission.serviceTask.id);assert.deepEqual(recovered.receipt.binding.expectation,f.expectation);
   assert.equal(recovered.current.kind,['source-withdrawn','consent-withdrawn'].includes(mode)?'unavailable':'pending');
   assert.deepEqual(recovered,await ports.actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'selected_read',operation}}));
  }
  const requests=transport.events.filter(e=>e.owner===f.owner.id&&e.action==='selected_submit');assert.equal(requests.length,1,'unknown or revoked state never triggers another POST');
  assert.deepEqual(await counts(f),{turns:1,tasks:1,links:1,reservations:1});assert.deepEqual(await tripSnapshot(f),beforeTrip,'original Trip is unchanged');
 });
 console.log(JSON.stringify({marker:'C0_HTTP_SDK_REAL_PG_ORDINARY_ROLE',checkpoint:source.checkpoint,sourcePins:source.pins,database:db.settings,identity:'synthetic registered-token Auth/REST adapter; NOT GoTrue/PostgREST/target/provider'}));
});
