// Candidate until Main leases the shared restart helper + CI registration and SQL reader lands.
// No synthetic replacement of Auth, session, policy, replay RPC or outbox permitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeTextEnvironment} from '../native-text-environment.mjs';
import {identityLocalEnv} from '../../identity/local-supabase.mjs';
import {waitUntil} from '../../identity/database-barrier.mjs';
import {decodeAssistantEvents} from '../../../../lib/server/turn/assistant-events/protocol.ts';

test('real registered Auth/session/policy and durable task/artifact replay survives loss/restart and denies revoked scope',{
 skip:process.env.VP_NATIVE_ASSISTANT_EVENTS_INTEGRATION!=='true',timeout:240000,
},async t=>{
 const e=await createNativeTextEnvironment({continuous:true});t.after(()=>e.cleanup());
 assert.equal(typeof e.restartNativeAPI,'function','Main-approved original helper restart lease required');
 assert.equal(e.sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='read_assistant_events_v1';"),'1','real appended SQL reader required, never inject a replacement');
 const local=identityLocalEnv(),service=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const call=async(path,token,method='GET',body)=>fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const ok=async(path,token,method='GET',body)=>{const r=await call(path,token,method,body);const data=await r.json();assert.ok(r.ok,JSON.stringify({path,status:r.status,code:typeof data?.error?.code==='string'?data.error.code:'UNKNOWN'}));return data;};
 const login=async user=>{const attemptId=uuid(),r=await ok('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});await ok('/api/auth/native/v2/login',r.accessToken,'POST',{attemptId});return r.accessToken;};
 const owner=await login(e.users[0]),other=await login(e.users[1]);
 for(const token of [owner,other])await ok('/api/chat/native/v5/consent',token,'POST',{policyId:e.policyId,noticeHash:e.noticeHash});
 const conversation=uuid(),goal=uuid(),root=uuid(),message=uuid(),task=uuid(),turn=uuid(),artifact=uuid();
 const base={conversationId:conversation,goalId:goal,messageId:root,idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Owned synthetic assistant event chain',relationship:'goal_start',expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
 await ok('/api/chat/native/v5/conversation',owner,'POST',base);
 const input={threadId:uuid(),turnId:turn,idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Owned synthetic retained task',serviceTask:{id:task,scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
 await ok('/api/chat/native/v2/turns',owner,'POST',input);
 await ok('/api/chat/native/v5/conversation',owner,'POST',{...base,messageId:message,idempotencyKey:uuid(),taskId:task,parentMessageId:root,relationship:'follow_up',expectedGoalVersion:1});
 await waitUntil(()=>Promise.resolve(e.sql(`select status from public.turns where id='${turn}';`)==='completed'),30000,'original synthetic worker task completion');
 const attempts=()=>e.sql(`select count(*) from public.model_budget_attempts where task_id='${task}';`);
 const attemptsBefore=attempts(),originalTurnEvents=e.sql(`select count(*) from public.chat_turn_events where turn_id='${turn}';`);
 const content={schemaVersion:'comparison/1',title:'Owned comparison',summary:'Synthetic only',options:[{id:'a',title:'A',tradeoff:'Unknown'},{id:'b',title:'B',tradeoff:'Unknown'}],actions:[]};
 const publish={p_owner_id:e.users[0].id,p_artifact_id:artifact,p_expected_revision:0,p_idempotency_key:uuid(),p_task_id:task,p_goal_id:goal,p_input_message_id:message,p_trip_id:null,p_trip_version:null,p_goal_version:1,p_memory_basis:[],p_content:content};
 const svc=async(name,args)=>{const r=await service.rpc(name,args);assert.ifError(r.error);return r.data;};
 await svc('publish_comparison_result_v1',publish);
 await svc('publish_comparison_result_v1',publish); // original idempotent publication must add no replay row
 const replayPath='/api/chat/native/v5/assistant-events/'+conversation;
 const replay=async(after=0,token=owner,extra={})=>fetch(e.api+replayPath,{headers:{Authorization:'Bearer '+token,'Last-Event-ID':String(after),...extra}});
 const decode=async(r,after)=>{
  assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/event-stream/);assert.equal(r.headers.get('cache-control'),'private, no-store');
  const text=await r.text();assert.ok(Buffer.byteLength(text)<=65536);
  const frames=text.trim().split('\n\n').filter(Boolean).map(block=>({id:/^id: (.+)$/m.exec(block)?.[1],event:/^event: (.+)$/m.exec(block)?.[1],data:JSON.parse(/^data: (.+)$/m.exec(block)[1])}));
  const checkpoint=frames.at(-1);assert.equal(checkpoint.event,'checkpoint');assert.equal(checkpoint.id,undefined);assert.equal(checkpoint.data.conversationId,conversation);
  const events=frames.slice(0,-1).map(frame=>{assert.equal(frame.event,'assistant');assert.equal(frame.id,String(frame.data.sequence));const {schemaVersion,conversationId,...event}=frame.data;assert.equal(schemaVersion,'assistant-events/1');assert.equal(conversationId,conversation);return event;});
  return decodeAssistantEvents({kind:'assistant_events',schemaVersion:'assistant-events/1',conversationId:conversation,afterSequence:after,lastSequence:checkpoint.data.afterSequence,hasMore:checkpoint.data.hasMore,events},conversation,after);
 };
 const first=await decode(await replay(),0);assert.ok(first.events.some(x=>x.type==='task_status'&&x.taskId===task));assert.ok(first.events.some(x=>x.type==='artifact_ready'&&x.artifactId===artifact));
 // Deliberately lose a complete delivered page before acknowledging: at-least-once stable IDs.
 assert.deepEqual(await decode(await replay(),0),first);
 const cursorDir=mkdtempSync(join(tmpdir(),'vpj08-event-cursor-'));t.after(()=>rmSync(cursorDir,{recursive:true,force:true}));
 const cursorPath=join(cursorDir,'cursor.json');writeFileSync(cursorPath,JSON.stringify({conversationId:conversation,afterSequence:first.lastSequence}),{mode:0o600});
 await e.restartNativeAPI();await e.restartServiceWorkers();
 const restored=JSON.parse(readFileSync(cursorPath,'utf8'));assert.equal(restored.conversationId,conversation);
 assert.equal((await decode(await replay(restored.afterSequence),restored.afterSequence)).events.length,0);
 assert.deepEqual(await decode(await replay(),0),first,'new server process returns the same original persisted event IDs');
 // Original writer supplies revisions; merged cursor must paginate actual persisted rows.
 for(let revision=1;revision<=51;revision++)await svc('publish_comparison_result_v1',{...publish,p_expected_revision:revision,p_idempotency_key:uuid()});
 const page=await decode(await replay(first.lastSequence),first.lastSequence);assert.equal(page.events.length,50);assert.equal(page.hasMore,true);
 const tail=await decode(await replay(page.lastSequence),page.lastSequence);assert.equal(tail.events.length,1);assert.equal(tail.events[0].revision,52);
 assert.equal(new Set([...page.events,...tail.events].map(x=>x.eventId)).size,51);
 await svc('withdraw_result_artifact_v1',{p_owner_id:e.users[0].id,p_artifact_id:artifact,p_expected_revision:52});
 const withdrawn=await decode(await replay(tail.lastSequence),tail.lastSequence);assert.equal(withdrawn.events[0].type,'artifact_invalidated');assert.equal(withdrawn.events[0].availability,'unavailable');
 const historical=await decode(await replay(),0);assert.ok(historical.events.filter(x=>x.artifactId===artifact).every(x=>x.availability==='unavailable'));
 assert.equal((await replay(0,other)).status,403);assert.equal((await replay(withdrawn.lastSequence+1)).status,400);assert.equal((await replay(0,owner,{Cookie:'synthetic=only'})).status,400);
 assert.equal(attempts(),attemptsBefore,'event readers/restarts do not consume another logical task');assert.equal(e.sql(`select count(*) from public.chat_turn_events where turn_id='${turn}';`),originalTurnEvents,'reader never appends original source events');
 // Original signed, confirmed sensitive-source erasure must scrub delivery metadata
 // while allowing a genuinely new Task in the same retained conversation.
 const sourceScope={scope:'turn-sensitive-data/1',requestId:uuid(),turnId:turn,objectIds:[]};
 const privilege=role=>e.sql(`select has_function_privilege('${role}','public.privacy_turn_data_v1(text,text,bigint)','execute');`);
 const denied=await call('/api/privacy/native/v1/turn-data',owner,'POST',{action:'preview',...sourceScope});
 assert.equal(denied.status,503,'original production RPC defaults deny even with current signed owner');
 for(const role of ['anon','authenticated','service_role'])assert.equal(privilege(role),'f');
 // Main-authorized existing original fixture convention, this uniquely owned
 // disposable DB only. No production migration/role/pin or D2 grant is changed.
 e.sql('grant execute on function public.privacy_turn_data_v1(text,text,bigint) to authenticated;');
 assert.equal(privilege('authenticated'),'t');
 for(const role of ['anon','service_role'])assert.equal(privilege(role),'f');
 t.diagnostic('Original default deny and three-role negatives PASS; only exact Turn RPC granted authenticated inside owned disposable fixture, no D2/target grants.');
 const previewRequest={action:'preview',...sourceScope},previewHTTP=await call('/api/privacy/native/v1/turn-data',owner,'POST',previewRequest),preview=await previewHTTP.json();
 if(!previewHTTP.ok){
  const signed=createClient(local.API_URL,local.PUBLISHABLE_KEY||local.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+owner}}});
  const session=await signed.rpc('native_session_v2',{p_action:'session'});
  const original=await signed.rpc('privacy_turn_data_v1',{p_action:'preview',p_input_bytes:JSON.stringify(previewRequest),p_expected_epoch:session.data.mobileEpoch});
  t.diagnostic(JSON.stringify({phase:'original_signed_turn_preview',httpStatus:previewHTTP.status,httpCode:preview.error?.code,rpcCode:original.error?.code,rpcMessage:original.error?.message?.match(/^(?:TURN_[A-Z_]+|permission denied for (?:function|table|schema) [A-Za-z0-9_.]+)$/)?.[0]??null,kind:original.data?.kind,keys:original.data?Object.keys(original.data):[],eligible:original.data?.eligible,conflicts:original.data?.conflicts,runtimeGuards:JSON.parse(e.sql("select jsonb_build_object('turnRuntime',turn_data_private.runtime_supported_v1(),'turnSchema',turn_data_private.schema_supported_v1(),'resultSchema',result_data_private.schema_supported_v1(),'conversationSchema',conversation_data_private.schema_supported_v1());"))}));
 }
 assert.equal(previewHTTP.status,200,'original signed source preview');
 assert.equal(preview.data.eligible,true,JSON.stringify({eligible:preview.data.eligible,conflicts:preview.data.conflicts}));
 const erased=await ok('/api/privacy/native/v1/turn-data',owner,'POST',{action:'erase',...sourceScope,sourceDigest:preview.data.sourceDigest,previewDigest:preview.data.previewDigest,confirmed:true});
 assert.equal(erased.data.kind,'receipt');assert.equal(erased.data.state,'erased');
 const freshTask=uuid(),freshTurn=uuid();
 await ok('/api/chat/native/v2/turns',owner,'POST',{...input,threadId:uuid(),turnId:freshTurn,idempotencyKey:uuid(),text:'Owned legitimate fresh task after source retirement',serviceTask:{...input.serviceTask,id:freshTask}});
 await ok('/api/chat/native/v5/conversation',owner,'POST',{...base,messageId:uuid(),idempotencyKey:uuid(),taskId:freshTask,parentMessageId:root,relationship:'follow_up',expectedGoalVersion:1});
 await waitUntil(()=>Promise.resolve(e.sql(`select status from public.turns where id='${freshTurn}';`)==='completed'),30000,'fresh original worker completion after retirement');
 const drain=async after=>{const rows=[];for(let pages=0;pages<10;pages++){const p=await decode(await replay(after),after);rows.push(...p.events);after=p.lastSequence;if(!p.hasMore)return rows;}throw Error('Owned retirement page bound exceeded');};
 const fromZero=await drain(0),fromDeletedAnchor=await drain(first.events[0].sequence);
 assert.ok(fromZero.some(x=>x.type==='source_retired'&&x.sequence===x.retiredSequence));
 assert.ok(fromDeletedAnchor.some(x=>x.type==='source_retired'&&x.retiredSequence===first.events[0].sequence),'later notification reaches previously acknowledged source');
 for(const rows of [fromZero,fromDeletedAnchor]){
  assert.ok(rows.some(x=>x.type==='task_status'&&x.taskId===freshTask),'same retained conversation remains recoverable');
  assert.ok(rows.every(x=>x.type==='source_retired'||x.taskId!==task),'old metadata cannot revive');
  for(const row of rows.filter(x=>x.type==='source_retired'))assert.deepEqual(Object.keys(row).sort(),['eventId','sequence','type','retiredSequence'].sort());
 }
 assert.equal(attempts(),attemptsBefore,'original accounting survives erasure/read without new old-task consumption');
 await ok('/api/chat/native/v5/consent',owner,'DELETE',{policyId:e.policyId});const revoked=await replay();assert.equal(revoked.status,403);assert.doesNotMatch(await revoked.text(),/eventId|id:/);
 await login(e.users[0]);assert.equal((await replay()).status,401,'original native session replacement denies old bearer');
 console.log('VPJ08_REAL_AUTH_SQL_HTTP_RESTART_PASS: disposable local original worker with synthetic model only; Native/device/provider/backup UNRUN');
});
