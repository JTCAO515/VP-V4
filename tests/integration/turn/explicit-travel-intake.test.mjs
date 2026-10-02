import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {NextRequest} from 'next/server.js';
import {nativeTravelIntakeHTTP} from '../../../lib/server/turn/native-travel-intake-http.ts';
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
const projection={schemaVersion:'stay-area-intake/1',city:null,comparisonTarget:null,durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:null};
test('explicit intake is ordinary-owner, atomic, versioned and current only at exact qualified basis',{
 skip:process.env.VP_EXPLICIT_TRAVEL_INTAKE!=='true',timeout:180000,
},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());assert.equal(e.api,'http://127.0.0.1:64751');
 const call=async(path,token,method='GET',body)=>{const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.match(r.headers.get('content-type')||'',/application\/json/,'Expected JSON '+path+' '+r.status);return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};};
 const login=async u=>{const attemptId=uuid(),r=await call('/api/auth/native/v2/credentials',null,'POST',{email:u.email,password:u.password,attemptId});assert.equal(r.status,200);
  assert.equal((await call('/api/auth/native/v2/login',r.body.accessToken,'POST',{attemptId})).status,200);return r.body.accessToken;};
 const owner=await login(e.users[0]),other=await login(e.users[1]),base='/api/chat/native/v5';
 for(const token of [owner,other])assert.equal((await call(base+'/consent',token,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const state=identityLocalEnv(),client=createClient(state.API_URL,state.PUBLISHABLE_KEY||state.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+owner}}});
 const rpc=async(name,p)=>{const r=await client.rpc(name,p);assert.ifError(r.error);return r.data;};
 const conversationId=uuid(),goalId=uuid(),root={conversationId,goalId,messageId:uuid(),idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Explicit ten-day trip with partner',relationship:'goal_start',parentMessageId:null,expectedGoalVersion:null,expectedIntakeRevision:0,intake:projection,memoryBasis:[]};
 const endpoint=base+'/travel-intake',read=()=>call(endpoint+'?conversationId='+conversationId+'&goalId='+goalId,owner),write=body=>call(endpoint,owner,'POST',body);
 let r=await write(root);assert.equal(r.status,201,JSON.stringify(r));assert.equal(r.body.goalVersion,1);assert.equal(r.body.intakeRevision,1);assert.equal(r.body.current,true);assert.equal(r.body.readyForProvider,false);
 const firstDigest=r.body.contextDigest;
 assert.equal((await write(root)).status,200);assert.equal((await write(root)).body.messageId,root.messageId);
 assert.equal((await write({...root,intake:{...projection,pace:'fast'}})).status,409,'same key cannot change full explicit projection');
 r=await read();assert.equal(r.status,200);assert.equal(r.cache,'private, no-store');assert.deepEqual(r.body.readiness,{kind:'waiting_user',questions:['city','comparison_target']});
 assert.deepEqual(r.body.intake,projection);assert.equal(r.body.contextDigest,firstDigest);assert.deepEqual(r.body.memoryBasis,[]);
 assert.equal((await call(endpoint+'?conversationId='+conversationId+'&goalId='+goalId,other)).status,403);
 assert.equal((await call(endpoint+'?conversationId='+conversationId+'&goalId='+goalId,null)).status,401);
 assert.equal((await call(endpoint+'?conversationId='+conversationId+'&goalId='+goalId+'&goalId='+goalId,owner)).status,400);
 // Entire user projection is resubmitted. Multiple selected fields change explicitly; other values stay exact.
 let current={...root,messageId:uuid(),idempotencyKey:uuid(),relationship:'amendment',parentMessageId:root.messageId,expectedGoalVersion:1,expectedIntakeRevision:1,
  text:'Choose Shanghai transport comparison',intake:{...projection,city:'shanghai',comparisonTarget:'area_transport'}};
 r=await write(current);assert.equal(r.status,201,JSON.stringify(r));assert.equal(r.body.goalVersion,2);assert.equal(r.body.intakeRevision,2);assert.notEqual(r.body.contextDigest,firstDigest);
 r=await read();assert.equal(r.body.readiness.kind,'ready');assert.ok(r.body.readiness.unknown.includes('lodgingBudget'));assert.equal(r.body.readyForProvider,false);
 for(const k of ['durationDays','partySize','interests','pace','dates','mobilityConstraints'])assert.deepEqual(r.body.intake[k],projection[k]);
 const oldReceipt=(await write(root)).body;assert.equal(oldReceipt.current,false);assert.equal(oldReceipt.reused,true);
 for(const k of ['contextDigest','intake','memoryBasis','readiness'])assert.equal(Object.hasOwn(oldReceipt,k),false,'historical receipt has no current basis/content');
 const missing={...current,intake:{...current.intake}};delete missing.intake.partySize;assert.equal((await write(missing)).status,400);
 // A typed Memory failure after the legacy message insert must roll back message/goal/sequence atomically.
 const before=e.sql(`select jsonb_build_array(g.scope_version,g.current_text,a.next_sequence,(select count(*) from turn_private.assistant_messages where goal_id=g.id),(select count(*) from turn_private.assistant_travel_intakes where goal_id=g.id)) from turn_private.assistant_goals g join turn_private.assistant_conversations a on a.id=g.conversation_id where g.id='${goalId}';`);
 const fail={...current,messageId:uuid(),idempotencyKey:uuid(),parentMessageId:current.messageId,expectedGoalVersion:2,expectedIntakeRevision:2,memoryBasis:[{id:uuid(),revision:1}]};
 assert.equal((await write(fail)).status,409);
 const after=e.sql(`select jsonb_build_array(g.scope_version,g.current_text,a.next_sequence,(select count(*) from turn_private.assistant_messages where goal_id=g.id),(select count(*) from turn_private.assistant_travel_intakes where goal_id=g.id)) from turn_private.assistant_goals g join turn_private.assistant_conversations a on a.id=g.conversation_id where g.id='${goalId}';`);assert.equal(before,after);
 const racers=['balanced','fast'].map(pace=>({...current,messageId:uuid(),idempotencyKey:uuid(),parentMessageId:current.messageId,expectedGoalVersion:2,expectedIntakeRevision:2,intake:{...current.intake,pace}}));
 const raced=await Promise.all(racers.map(write));assert.deepEqual(raced.map(x=>x.status).sort(),[201,409]);current=racers[raced.findIndex(x=>x.status===201)];
 let source=(await read()).body;assert.equal(source.goalVersion,3);assert.equal(source.intakeRevision,3);assert.equal(source.messageId,current.messageId);
 // Explicit null clear and budget readiness are distinct from transport-first unknown budget.
 const amend=async changes=>{const body={...current,messageId:uuid(),idempotencyKey:uuid(),parentMessageId:source.messageId,expectedGoalVersion:source.goalVersion,expectedIntakeRevision:source.intakeRevision,intake:{...source.intake,...changes}};
  const result=await write(body);assert.equal(result.status,201,JSON.stringify(result));current=body;source=(await read()).body;return source;};
 source=await amend({pace:null,comparisonTarget:'lodging_budget_filter'});assert.equal(source.intake.pace,null);assert.deepEqual(source.readiness,{kind:'waiting_user',questions:['lodging_budget']});
 source=await amend({lodgingBudget:{currency:'CNY',perNightMinorUnits:50000}});assert.deepEqual(source.readiness,{kind:'unavailable',reason:'budget_filter_not_integrated'});
 source=await amend({city:'beijing',comparisonTarget:'area_transport'});assert.deepEqual(source.readiness,{kind:'unavailable',reason:'city_not_covered'});
 const atReadBoundary=async(path,writeBasis,change)=>{
  const patch={NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:state.PUBLISHABLE_KEY||state.ANON_KEY,
   VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:e.policyId};
  const prior=new Map(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);
  const original=globalThis.fetch;let injected=false;
  const replaced=t.mock.method(globalThis,'fetch',async(input,init)=>{
   const request=new Request(input,init),response=await original(input,init);
   const rpcPath=writeBasis?'/read_assistant_travel_intake_write_basis_v1':'/read_assistant_travel_intake_v1';
   if(new URL(request.url).pathname.endsWith(rpcPath)&&!injected){injected=true;await change();}
   return response;
  });
  try{const r=await nativeTravelIntakeHTTP(new NextRequest(e.api+path,{headers:{Authorization:'Bearer '+owner}}),writeBasis);
   assert.equal(injected,true,'a genuine first ordinary RPC response must precede the concurrent correction');return {status:r.status,body:await r.json()};}
  finally{replaced.mock.restore();for(const[k,v]of prior)v===undefined?delete process.env[k]:process.env[k]=v;}
 };
 const consent=(await rpc('create_memory_retrieval_consent',{}))[0].consent_id,memory=uuid();
 await rpc('create_explicit_memory_profile_v2',{p_memory_id:memory,p_receipt_id:uuid(),p_consent_id:consent,p_constraint_kind:'preference',p_summary:'Synthetic context reference; never parsed into a field'});
 const memoryBody={...current,messageId:uuid(),idempotencyKey:uuid(),parentMessageId:source.messageId,expectedGoalVersion:source.goalVersion,expectedIntakeRevision:source.intakeRevision,intake:{...source.intake,city:'shanghai'},memoryBasis:[{id:memory,revision:1}]};
 r=await write(memoryBody);assert.equal(r.status,201,JSON.stringify(r));current=memoryBody;source=(await read()).body;assert.equal(source.readiness.kind,'ready');assert.equal(source.intake.pace,null,'Memory reference does not infer saved pace');
 const memoryDigest=source.contextDigest;
 const memoryBoundary=await atReadBoundary(endpoint+'?conversationId='+conversationId+'&goalId='+goalId,false,
  ()=>rpc('transition_memory_profile',{p_memory_id:memory,p_next_state:'paused'}));
 assert.deepEqual(memoryBoundary,{status:200,body:{version:5,kind:'unavailable',reason:'stale_basis',readyForProvider:false}},'Memory correction between real before/after reads cannot expose stale fields');
 await rpc('transition_memory_profile',{p_memory_id:memory,p_next_state:'explicit'});
 r=await read();assert.deepEqual(r.body,{version:5,kind:'unavailable',reason:'stale_basis',readyForProvider:false});
 const staleReplay=(await write(memoryBody)).body;assert.equal(staleReplay.current,false);assert.equal(Object.hasOwn(staleReplay,'contextDigest'),false);
 const newMemoryBody={...memoryBody,messageId:uuid(),idempotencyKey:uuid(),parentMessageId:source.messageId,expectedGoalVersion:source.goalVersion,expectedIntakeRevision:source.intakeRevision,memoryBasis:[{id:memory,revision:3}]};
 r=await write(newMemoryBody);assert.equal(r.status,201);source=(await read()).body;assert.notEqual(source.contextDigest,memoryDigest);
 await rpc('revoke_memory_retrieval_consent',{p_consent_id:consent});r=await read();assert.deepEqual(r.body,{version:5,kind:'unavailable',reason:'stale_basis',readyForProvider:false});
 const writeBasisPath=endpoint+'/write-basis?conversationId='+conversationId+'&goalId='+goalId;
 const writeBasis=(await call(writeBasisPath,owner)).body;
 assert.deepEqual(Object.keys(writeBasis).sort(),['version','kind','conversationId','goalId','goalVersion','parentMessageId','messageSequence','intakeRevision','policyId','readyForProvider'].sort());
 assert.equal(writeBasis.kind,'travel_intake_write_basis');assert.equal(writeBasis.parentMessageId,newMemoryBody.messageId);
 for(const key of ['intake','projection','memoryBasis','contextDigest','readiness'])assert.equal(Object.hasOwn(writeBasis,key),false);
 assert.equal((await call(writeBasisPath,other)).status,403);
 const restored={...newMemoryBody,messageId:uuid(),idempotencyKey:uuid(),parentMessageId:writeBasis.parentMessageId,expectedGoalVersion:writeBasis.goalVersion,expectedIntakeRevision:writeBasis.intakeRevision,
  intake:{...projection,city:'shanghai',comparisonTarget:'area_transport'},memoryBasis:[]};
 assert.equal((await write(restored)).status,201,'explicit full new input and [] recover without resurrecting revoked Memory');
 assert.equal((await read()).body.readiness.kind,'ready');assert.deepEqual((await read()).body.memoryBasis,[]);
 const expiredBasis={...restored,messageId:uuid(),idempotencyKey:uuid()};assert.equal((await write(expiredBasis)).status,409,'read-basis metadata is CAS, not a durable edit grant');
 // A legacy amendment has no typed adoption; its source never reuses a prior projection.
 const legacyGoal=uuid(),legacyConversation=uuid(),legacyRoot=uuid();
 assert.equal((await call(base+'/conversation',owner,'POST',{conversationId:legacyConversation,goalId:legacyGoal,messageId:legacyRoot,idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Untyped legacy goal',relationship:'goal_start',parentMessageId:null,expectedGoalVersion:null,taskId:null,turnId:null})).status,201);
 assert.deepEqual((await call(endpoint+'?conversationId='+legacyConversation+'&goalId='+legacyGoal,owner)).body,{version:5,kind:'unavailable',reason:'intake_unrecorded',readyForProvider:false});
 const adoption={...root,conversationId:legacyConversation,goalId:legacyGoal,messageId:uuid(),idempotencyKey:uuid(),relationship:'follow_up',parentMessageId:legacyRoot,expectedGoalVersion:1,intake:{...projection,city:'shanghai',comparisonTarget:'area_transport'}};
 assert.equal((await write(adoption)).status,201);
 const legacyCorrection=uuid();
 assert.equal((await call(base+'/conversation',owner,'POST',{conversationId:legacyConversation,goalId:legacyGoal,messageId:legacyCorrection,idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Unstructured correction',relationship:'amendment',parentMessageId:adoption.messageId,expectedGoalVersion:1,taskId:null,turnId:null})).status,201);
 assert.deepEqual((await call(endpoint+'?conversationId='+legacyConversation+'&goalId='+legacyGoal,owner)).body,{version:5,kind:'unavailable',reason:'stale_basis',readyForProvider:false});
 const linkedTrip=uuid();assert.ifError((await client.from('trips').insert({id:linkedTrip,owner_id:e.users[0].id,title:'Synthetic basis reference only'})).error);
 await rpc('set_assistant_goal_trip_link_v1',{p_operation_id:uuid(),p_conversation_id:legacyConversation,p_goal_id:legacyGoal,p_source_message_id:legacyCorrection,p_expected_goal_scope_version:2,p_expected_link_version:0,p_action:'link',p_trip_id:linkedTrip,p_expected_trip_version:0,p_confirmed:true});
 const historicalParent=(await call(endpoint+'/write-basis?conversationId='+legacyConversation+'&goalId='+legacyGoal,owner)).body;
 assert.equal(historicalParent.goalVersion,3);assert.equal(historicalParent.parentMessageId,legacyCorrection);assert.equal(historicalParent.intakeRevision,1);
 const linkedCorrection={...adoption,messageId:uuid(),idempotencyKey:uuid(),relationship:'amendment',parentMessageId:historicalParent.parentMessageId,expectedGoalVersion:historicalParent.goalVersion,expectedIntakeRevision:historicalParent.intakeRevision};
 assert.equal((await write(linkedCorrection)).status,201,'legacy writer accepts real latest parent at older historical scope without lowering its rules');
 assert.equal((await call(endpoint+'?conversationId='+legacyConversation+'&goalId='+legacyGoal,owner)).body.goalVersion,4);
 assert.equal(e.sql(`select head_version from public.trips where id='${linkedTrip}';`),'0','intake/link metadata never patches a Trip');
 const basisRace=await atReadBoundary(endpoint+'/write-basis?conversationId='+legacyConversation+'&goalId='+legacyGoal,true,
  ()=>rpc('submit_assistant_message_v1',{p_conversation_id:legacyConversation,p_message_id:uuid(),p_idempotency_key:uuid(),p_policy_id:e.policyId,p_locale:'en',p_text:'Concurrent explicit source change',p_relationship:'amendment',p_goal_id:legacyGoal,p_expected_goal_version:4,p_task_id:null,p_parent_message_id:linkedCorrection.messageId,p_turn_id:null}));
 assert.deepEqual(basisRace,{status:409,body:{error:{code:'SERVICE_TASK_CONFLICT'}}},'write metadata cannot combine two real source generations');

 // Explicit service export is bounded; no ordinary grant or guessed export completion.
 const exportPage=JSON.parse(e.sql(`set request.jwt.claim.role='service_role';set role service_role;select public.assistant_travel_intake_export_owner_v1('${e.users[0].id}',null,1);`));assert.equal(exportPage.items.length,1);assert.equal(exportPage.hasMore,true);
 assert.equal((await client.rpc('assistant_travel_intake_export_owner_v1',{p_owner:e.users[0].id,p_limit:1})).error!==null,true);
 for(const role of ['anon','authenticated','service_role'])assert.equal(e.sql(`select has_table_privilege('${role}','turn_private.assistant_travel_intakes','select');`),'f');
 assert.equal(e.sql(`select count(*) from turn_private.work where owner_id='${e.users[0].id}';`),'0');assert.equal(e.counts.http,0);
 assert.equal((await call(base+'/consent',owner,'DELETE',{policyId:e.policyId})).status,200);
 r=await read();assert.equal(r.status,403);assert.equal((await call(writeBasisPath,owner)).status,403);assert.deepEqual(r.body,{error:{code:'DATA_POLICY_BLOCKED'}});
 const replacement=await login(e.users[0]);assert.equal((await call(endpoint+'?conversationId='+legacyConversation+'&goalId='+legacyGoal,owner)).status,401);assert.equal((await call(writeBasisPath,owner)).status,401);assert.ok(replacement);
 // Exact conversation FK cascades remove all its typed versions; no unrelated actor rows are touched.
 e.sql(`delete from turn_private.assistant_conversations where id='${conversationId}' and owner_id='${e.users[0].id}';`);
 assert.equal(e.sql(`select count(*) from turn_private.assistant_travel_intakes where conversation_id='${conversationId}';`),'0');
 t.diagnostic('EXPLICIT_INTAKE_AUTH_HTTP_SQL_PASS: synthetic input only; no task/provider/publication');
});
