import{ensureFixture}from'./fixture.mjs';
// Actual disposable PostgreSQL + real migration/RPC/trigger tests. SQL claims are
// fixture authority, distinct from signed GoTrue/JWT HTTP acceptance.
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid}from'node:crypto';import{readFileSync}from'node:fs';
import{db,container}from'./replay.mjs';import{sql}from'../../cost/fixtures/postgres-rpc.mjs';
export const lit=x=>"'"+String(x).replaceAll("'","''")+"'";const json=x=>lit(JSON.stringify(x))+'::jsonb';
const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};`;
const actor=async(mobile=true)=>{let a={owner:uuid(),session:uuid()};await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id)values('${a.session}','${a.owner}');${mobile?`insert into identity_private.mobile_accounts(owner_id,session_id,epoch)values('${a.owner}','${a.session}',1);insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch)values('${a.owner}','${uuid()}','${a.session}',1);`:''}`);return a;};
const web=(a,rev=null)=>db(`begin;${claims(a)}set role authenticated;select * from public.${rev===null?'save_user_profile':'save_user_profile_v2'}('Synthetic name','packed','en','USD','mile','fahrenheit','17:32:11'${rev===null?'':','+rev});commit;`);
const pace=(a,c)=>db(`begin;${claims(a)}set role authenticated;select public.native_travel_pace_v1(${json(c)});commit;`).then(JSON.parse);
const rpc=(a,c,bytes=JSON.stringify(c))=>db(`begin;${claims(a)}set role authenticated;select public.privacy_profile_data_v1(${lit(c.action)},${lit(bytes)},1);commit;`).then(JSON.parse);
const profile=a=>db(`select to_jsonb(p) from public.user_profiles p where owner_id='${a.owner}'`).then(s=>s?JSON.parse(s):null);
const selection=a=>({scope:'profile-sensitive-data/1',requestId:uuid(),profileId:a.owner,objectIds:[]});
const mutation=(s,p)=>({action:'erase',...s,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true});
const fail=(p,code)=>assert.rejects(p,new RegExp(code));
let state;
test('actual Profile SQL transaction and source graph',{skip:process.env.VP_PROFILE_DATA_SQL!=='1'},async t=>{
 let rpcGranted=false;
 await ensureFixture(t,async()=>{
  if(!rpcGranted)return;
  await db('revoke all on function public.privacy_profile_data_v1(text,text,bigint) from authenticated;');
  assert.equal(await db("select has_function_privilege('authenticated','public.privacy_profile_data_v1(text,text,bigint)','EXECUTE')"),'f');
  console.log('Fixture RPC revoke PASS');
 });
 assert.equal(await db("select has_function_privilege('authenticated','public.privacy_profile_data_v1(text,text,bigint)','EXECUTE')"),'f');
 await db('grant execute on function public.privacy_profile_data_v1(text,text,bigint) to authenticated;');
 rpcGranted=true;
 await t.test('default private/RPC denies and exact immutable original Native implementation',async()=>{
  assert.equal(await db("select has_function_privilege('anon','public.privacy_profile_data_v1(text,text,bigint)','EXECUTE') or has_function_privilege('service_role','public.privacy_profile_data_v1(text,text,bigint)','EXECUTE')"),'f');
  assert.equal(await db("select bool_and(relrowsecurity) from pg_class where relnamespace='profile_data_private'::regnamespace and relkind='r'"),'t');
  assert.equal(await db("select bool_or(has_table_privilege('service_role',oid,'INSERT,UPDATE,DELETE')) from pg_class where relnamespace='profile_data_private'::regnamespace and relkind='r'"),'f');
  assert.equal(await db('select profile_data_private.schema_v1()'),'t');
 });
 await t.test('absent Profile stays absent; first Native save inventories only actual pace; malformed wire types rejected',async()=>{
  let a=await actor();let empty=await rpc(a,{action:'list',scope:'profile-sensitive-data/1',cursor:null,limit:20});assert.deepEqual(empty.items,[]);assert.equal(await profile(a),null);await fail(rpc(a,{action:'preview',...selection(a)}),'PROFILE_NOT_FOUND');
  await pace(a,{action:'save',operationId:uuid(),expectedRevision:0,travelPace:'relaxed',noticeVersion:'local-planning-cross-trip-v1'});assert.deepEqual((await profile(a)).profile_saved_fields,['travel_pace']);
  assert.equal(await db(`select profile_data_private.input_v1('{"action":"list","scope":null,"cursor":null,"limit":20}','list')`),'f');
  let bad={action:'erase',...selection(a),sourceDigest:1111111111111111,previewDigest:'a'.repeat(64),confirmed:true};assert.equal(await db(`select profile_data_private.input_v1(${json(bad)},'erase')`),'f');
 });
 await t.test('ordinary Web without mobile enrollment saves with original guard and v2 CAS',async()=>{
  let a=await actor(false);await web(a);assert.equal((await profile(a)).profile_revision,1);await web(a,1);assert.equal((await profile(a)).profile_revision,2);await fail(web(a,1),'PROFILE_CONFLICT');
 });
 await t.test('all original fields, request and Undo -> fixed30s clear, dual permanent floors, row retained',async()=>{
  let a=await actor();await web(a);let p=await profile(a);let old={action:'save',operationId:uuid(),expectedRevision:p.pace_revision,travelPace:'relaxed',noticeVersion:'local-planning-cross-trip-v1'};
  await pace(a,old);p=await profile(a);let s=selection(a),v=await rpc(a,{action:'preview',...s});assert.equal(v.expiresAt-v.capturedAt,30000);assert.equal(v.profile.displayName,'Synthetic name');assert.deepEqual(v.profile.paceRequest,old);assert.ok(v.profile.paceUndo);assert.equal(v.summary.profileRevision,p.profile_revision);assert.equal(v.eligible,true);
  let c=mutation(s,v),bytes=' '+JSON.stringify(c)+'\n';let r=await rpc(a,c,bytes);let after=await profile(a);
  assert.equal(after.owner_id,p.owner_id);assert.equal(after.created_at,p.created_at);assert.deepEqual([after.display_name,after.travel_pace,after.locale,after.currency,after.distance_unit,after.temperature_unit,after.default_departure_time],[null,'balanced','zh','CNY','kilometre','celsius','09:00:00']);
  assert.deepEqual([after.pace_state,after.pace_notice,after.pace_operation,after.pace_request,after.pace_undo],['revoked',null,null,null,null]);assert.deepEqual(after.profile_saved_fields,[]);assert.equal(after.profile_revision,p.profile_revision+1);assert.equal(after.pace_revision,p.pace_revision+1);
  const list=await rpc(a,{action:'list',scope:s.scope,cursor:null,limit:20});assert.deepEqual(list.items[0].summary.presentFields,[]);assert.equal(list.items[0].summary.profileErasureFloor,after.profile_revision);assert.equal(list.items[0].summary.paceErasureFloor,after.pace_revision);
  state={a,s,c,bytes,r,p,after,old};
 });
 await t.test('old native replay/Undo/Web7/v2 stale requests cannot revive; fresh writes remain legitimate',async()=>{
  let{a,old,after}=state;await fail(pace(a,old),'PACE_CONFLICT');await fail(pace(a,{action:'undo',operationId:uuid(),expectedRevision:after.pace_revision}),'PACE_CONFLICT');await fail(web(a),'PROFILE_WRITE_FENCE');await fail(web(a,after.profile_revision-1),'PROFILE_CONFLICT');
  const fresh={action:'save',operationId:uuid(),expectedRevision:after.pace_revision,travelPace:'packed',noticeVersion:'local-planning-cross-trip-v1'};const saved=await pace(a,fresh);assert.equal(saved.state,'explicit');assert.equal((await pace(a,fresh)).reused,true);assert.deepEqual((await profile(a)).profile_saved_fields,['travel_pace']);
  const undone=await pace(a,{action:'undo',operationId:uuid(),expectedRevision:saved.revision});assert.equal(undone.state,'revoked');const p=await profile(a);await web(a,p.profile_revision);assert.equal((await profile(a)).profile_revision,p.profile_revision+1);
 });
 await t.test('immutable original-byte recover and progress metadata erasure preserve source/receipt/floors',async()=>{
  let{a,s,c,bytes,r}=state;let recovered=await rpc(a,{action:'recover',...s,mutationBytes:bytes});assert.deepEqual(recovered,r);await fail(rpc(a,{action:'recover',...s,mutationBytes:JSON.stringify(c)}),'PROFILE_REQUEST_REUSE');
  let before=await profile(a),ps={scope:'profile-delete-progress/1',requestId:uuid(),profileId:null,objectIds:[s.requestId]};let preview=await rpc(a,{action:'preview',...ps});let receipt=await rpc(a,mutation(ps,preview));assert.equal(receipt.decision.retainedFences,1);assert.equal(receipt.decision.clearedPreviews,0);assert.deepEqual(await profile(a),before);assert.deepEqual(await rpc(a,{action:'recover',...s,mutationBytes:bytes}),r);
  assert.equal(await db(`select count(*) from profile_data_private.proofs_v1`),'0');
 });
 await t.test('source CAS rejects every saved-field and reverse-row edit; failed erase makes no effects',async()=>{
  let a=await actor();await web(a);let s=selection(a),v=await rpc(a,{action:'preview',...s});let p=await profile(a);await web(a,p.profile_revision);let now=await profile(a);await fail(rpc(a,mutation(s,v)),'PROFILE_CONFLICT');assert.deepEqual(await profile(a),now);
 });
 await t.test('raw service/GUC restoration and watermark reset are refused; delete/recreate cannot ABA',async()=>{
  let{a}=state;const p=await profile(a);await fail(db(`begin;${claims(a)}set role service_role;set profile_data.writer='true';update public.user_profiles set display_name='revived' where owner_id='${a.owner}';commit;`),'PROFILE_WRITE_FENCE');
  await fail(db(`update profile_data_private.watermarks_v1 set profile_revision=0 where owner_id='${a.owner}'`),'PROFILE_WRITE_FENCE');await fail(db(`delete from profile_data_private.watermarks_v1 where owner_id='${a.owner}'`),'PROFILE_WRITE_FENCE');
  await db(`begin;${claims(a)}set role service_role;delete from public.user_profiles where owner_id='${a.owner}';commit;`);const missingList=await rpc(a,{action:'list',scope:'profile-sensitive-data/1',cursor:null,limit:20});assert.ok(missingList.items[0].summary.profileErasureFloor>0);assert.equal((await pace(a,{action:'read'})).revision,p.pace_revision);await fail(web(a,p.profile_revision-1),'PROFILE_CONFLICT');await web(a,p.profile_revision);assert.equal((await profile(a)).profile_revision,p.profile_revision+1);await fail(pace(a,state.old),'PACE_CONFLICT');
 }); await t.test('original Brief trigger invalidates shared Case and erases all affected previews/operation bytes, mixed scoped/recovery rows retained stale',async()=>{
  let a=await actor();await web(a);let p=await profile(a);await pace(a,{action:'save',operationId:uuid(),expectedRevision:p.pace_revision,travelPace:'relaxed',noticeVersion:'local-planning-cross-trip-v1'});
  let trip=uuid(),cid=uuid(),pv=uuid(),otherPv=uuid(),op=uuid(),sc=uuid(),rc=uuid(),peer=uuid();
  await db(`begin;${claims(a)}insert into auth.users values('${peer}');insert into public.trips(id,owner_id,title)values('${trip}','${a.owner}','Retained mixed Trip');
   insert into service_cases_private.cases(id,owner_id,category,problem)values('${cid}','${a.owner}','general','Retained mixed Case');
   insert into service_brief_private.briefs(case_id,owner_id,recipient_id,grant_revision,state,selected_keys,sources,source_digest,expires_at)values('${cid}','${a.owner}','${peer}',0,'shared','["travel_pace"]','{"profilePace":true,"memories":[],"intakeMessageId":null}','${'a'.repeat(64)}',now()+interval '1 hour');
   insert into service_brief_private.previews(id,case_id,owner_id,session_id,revision,recipient_id,grant_revision,sources,source_digest,expires_at)values
   ('${pv}','${cid}','${a.owner}','${a.session}',1,'${peer}',0,'{"profilePace":true,"memories":[],"intakeMessageId":null}','${'a'.repeat(64)}',clock_timestamp()+interval '1 minute'),
   ('${otherPv}','${cid}','${a.owner}','${a.session}',1,'${peer}',0,'{"profilePace":false,"memories":[],"intakeMessageId":null}','${'b'.repeat(64)}',clock_timestamp()+interval '1 minute');
   insert into service_brief_private.operations(actor_id,session_id,surface,operation_id,case_id,request_digest,request_bytes,receipt)values('${a.owner}','${a.session}','owner','${op}','${cid}','${'c'.repeat(64)}',convert_to('{"action":"share"}','UTF8'),'{"action":"share"}');
   insert into scoped_edit_private.contexts_v1(id,owner_id,trip_id,base_version,input,snapshot,actor_basis,source_basis,locked_ids,fixed_ids,digest,expires_at)select '${sc}','${a.owner}','${trip}',0,'{}',public.trip_content_snapshot('${trip}','Retained mixed Trip'),'{}',scoped_edit_private.source_v1('${a.owner}','${trip}',0),'[]','[]','${'d'.repeat(64)}',now()+interval '5 minutes';
   insert into recovery_private.contexts_v1(id,owner_id,trip_id,operation_id,input,base_version,snapshot,profile_basis,reservation_basis,traffic_basis,digest,expires_at)select '${rc}','${a.owner}','${trip}','${uuid()}','{}',0,public.trip_content_snapshot('${trip}','Retained mixed Trip'),recovery_private.profile_v1('${a.owner}'),'[]','{}','${'e'.repeat(64)}',now()+interval '5 minutes';commit;`);
  const preserved=()=>db(`select jsonb_build_object('case',(select to_jsonb(c) from service_cases_private.cases c where id='${cid}'),'scoped',(select to_jsonb(c) from scoped_edit_private.contexts_v1 c where id='${sc}'),'recovery',(select to_jsonb(c) from recovery_private.contexts_v1 c where id='${rc}'),'trip',(select to_jsonb(c) from public.trips c where id='${trip}'));`);let before=await preserved();
  let s=selection(a),v=await rpc(a,{action:'preview',...s});assert.deepEqual(v.copies.briefPreviews,[pv,otherPv].sort());assert.deepEqual(v.copies.sharedBriefs,[cid]);assert.deepEqual(v.copies.scopedEditContexts,[sc]);assert.deepEqual(v.copies.recoveryContexts,[rc]);
  let r=await rpc(a,mutation(s,v));assert.deepEqual(r.decision.briefCasesInvalidated,[cid]);assert.deepEqual(r.decision.retainedCopies.scopedEditContexts,[sc]);assert.equal(await preserved(),before);
  assert.equal(await db(`select state||':'||revision from service_brief_private.briefs where case_id='${cid}'`),'invalidated:1');assert.equal(await db(`select count(*) from service_brief_private.previews where case_id='${cid}'`),'0');assert.equal(await db(`select erased and case_id is null and request_bytes is null and receipt is null from service_brief_private.operations where operation_id='${op}'`),'t');
  assert.equal(await db(`${claims(a)}select source_basis is distinct from scoped_edit_private.source_v1('${a.owner}','${trip}',0) from scoped_edit_private.contexts_v1 where id='${sc}'`),'t');assert.equal(await db(`${claims(a)}select profile_basis is distinct from recovery_private.profile_v1('${a.owner}') from recovery_private.contexts_v1 where id='${rc}'`),'t');
 });
 await t.test('complete confirmed Trip/events/snapshots/proposal/Memory/Auth and financial rows unchanged',async()=>{
  let a=await actor();await web(a);let trip=uuid();await db(`begin;${claims(a)}insert into public.trips(id,owner_id,title)values('${trip}','${a.owner}','Original confirmed Trip');commit;`);
  let proposal=JSON.parse(await db(`begin;${claims(a)}select row_to_json(x) from public.create_trip_proposal_patch('${trip}','{"expectedVersion":0,"operations":[{"kind":"set_title","title":"Confirmed retained Trip"}]}')x;commit;`));let digest=await db(`${claims(a)}select digest from public.read_trip_proposal_v2('${proposal.proposal_id}')`);await db(`begin;${claims(a)}select * from public.confirm_and_apply_trip_proposal('${proposal.proposal_id}','${uuid()}','${digest}');commit;`);
  let consent=JSON.parse(await db(`${claims(a)}select public.native_memory_command_v1(${json({action:'consentCreate',operationId:uuid()})})`));let memory=uuid();await db(`${claims(a)}select public.native_memory_command_v1(${json({action:'create',operationId:uuid(),memoryId:memory,receiptId:uuid(),consentId:consent.consentId,constraintKind:'preference',summary:'Explicit retained Memory',saveLongTerm:true})})`);
  const inv=()=>db(`select jsonb_build_object('auth',(select to_jsonb(x) from auth.users x where id='${a.owner}'),'sessions',(select jsonb_agg(to_jsonb(x)) from auth.sessions x where user_id='${a.owner}'),'account',(select to_jsonb(x) from identity_private.mobile_accounts x where owner_id='${a.owner}'),'attempts',(select jsonb_agg(to_jsonb(x)) from identity_private.mobile_attempts x where owner_id='${a.owner}'),'trip',(select to_jsonb(x) from public.trips x where id='${trip}'),'snapshots',(select jsonb_agg(to_jsonb(x) order by version) from public.trip_version_snapshots x where trip_id='${trip}'),'events',(select jsonb_agg(to_jsonb(x) order by id) from public.trip_events x where trip_id='${trip}'),'proposals',(select jsonb_agg(to_jsonb(x) order by id) from public.trip_proposals x where trip_id='${trip}'),'memory',(select to_jsonb(x) from public.memory_profiles x where id='${memory}'),'receipts',(select jsonb_agg(to_jsonb(x) order by id) from public.memory_receipts x where memory_id='${memory}'),'consent',(select to_jsonb(x) from public.memory_consents x where id='${consent.consentId}'),'financial',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.model_budget_scopes x where owner_id='${a.owner}'));`);let before=await inv();let s=selection(a),v=await rpc(a,{action:'preview',...s});await rpc(a,mutation(s,v));assert.equal(await inv(),before);
 });
 await t.test('full progress20+5 pagination and self-exit retain original fences, expired receipts recover',async()=>{
  let a=await actor();await web(a);let ids=[];
  for(let i=0;i<25;i++){let s=selection(a);ids.push(s.requestId);await rpc(a,{action:'preview',...s});}
  ids.sort();let page=await rpc(a,{action:'list',scope:'profile-delete-progress/1',cursor:null,limit:20});assert.equal(page.items.length,20);assert.equal(page.hasMore,true);let next=await rpc(a,{action:'list',scope:'profile-delete-progress/1',cursor:page.nextCursor,limit:20});assert.equal(next.items.length,5);assert.equal(next.hasMore,false);assert.deepEqual([...page.items,...next.items].map(x=>x.requestId),ids);
  let s={scope:'profile-delete-progress/1',requestId:uuid(),profileId:null,objectIds:ids.slice(0,20)},v=await rpc(a,{action:'preview',...s});let c=mutation(s,v),bytes=JSON.stringify(c),r=await rpc(a,c);assert.equal(r.decision.clearedPreviews,20);
  let self={scope:s.scope,requestId:uuid(),profileId:null,objectIds:[s.requestId]},p=await rpc(a,{action:'preview',...self});let out=await rpc(a,mutation(self,p));assert.equal(out.decision.retainedFences,1);assert.equal((await rpc(a,{action:'recover',...s,mutationBytes:bytes})).decision.requestDigest,r.decision.requestDigest);
  assert.equal(await db(`select count(*) from profile_data_private.operations_v1 where owner_id='${a.owner}'`),'27');
 });
 await t.test('actual leased scoped Profile use blocks clear, complete mixed publication remains and becomes stale',async()=>{
  let a=await actor();await web(a);let trip=uuid(),ctx=uuid(),op=uuid(),policy=uuid(),planning=uuid(),scope=uuid(),thread=uuid(),turn=uuid(),task=uuid(),consent=uuid(),lease=uuid();
  await db(`begin;${claims(a)}insert into public.trips(id,owner_id,title)values('${trip}','${a.owner}','Retained worker Trip');
   insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)values('${policy}','qwen','fixture','https://fixture.invalid/v1','local','local','local','fixture','fixture','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
   insert into turn_private.text_consents(owner_id,policy_id,consent_id)values('${a.owner}','${policy}','${consent}');
   insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)values('${planning}','${policy}','local_synthetic','fixture','${'b'.repeat(64)}','合成','Synthetic',now()-interval '1 hour',now()+interval '1 day');
   insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,expires_at)values('${scope}','${a.owner}','CNY',100,100,1,1,now()+interval '1 day');
   insert into scoped_edit_private.worker_settings_v1(policy_id,planning_policy_id,notice_hash,scope_id,model,price_version,reserved_micros,timeout_ms,max_output_tokens,allow_profile,configuration_id,configuration_version,source_use,expires_at)values('${policy}','${planning}','${'c'.repeat(64)}','${scope}','qwen3.7-plus-2026-05-26','fixture',1,1000,100,true,'${uuid()}',1,'scoped_trip_edit_v1',now()+interval '1 day');
   insert into public.chat_threads(id,owner_id,status)values('${thread}','${a.owner}','active');insert into public.turns(id,owner_id,thread_id,status)values('${turn}','${a.owner}','${thread}','planning');
   insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)values('${task}','${a.owner}','${thread}','${turn}','${turn}','${policy}','${consent}',1,'${'d'.repeat(64)}');
   insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text)values('${turn}','${a.owner}','${thread}','${policy}','${consent}','en','Synthetic retained mixed request');
   insert into scoped_edit_private.contexts_v1(id,owner_id,trip_id,base_version,input,snapshot,actor_basis,source_basis,locked_ids,fixed_ids,digest,expires_at)select '${ctx}','${a.owner}','${trip}',0,'{}',public.trip_content_snapshot('${trip}','Retained worker Trip'),recovery_private.actor_basis_v1(),scoped_edit_private.source_v1('${a.owner}','${trip}',0),'[]','[]','${'e'.repeat(64)}',now()+interval '5 minutes';
   insert into scoped_edit_private.operations_v1(owner_id,operation_id,trip_id,mutation,digest,actor_basis,context_id)select '${a.owner}','${op}','${trip}','{}','${'f'.repeat(64)}',actor_basis,id from scoped_edit_private.contexts_v1 where id='${ctx}';
   insert into turn_private.work(turn_id,owner_id,session_id,state,max_attempts,lease_ms,lease_token,expires_at,execution_mode)values('${turn}','${a.owner}','${a.session}','leased',1,1000,'${lease}',now()+interval '1 minute','scoped_trip_edit_v1');
   insert into scoped_edit_private.work_v1(turn_id,owner_id,trip_id,task_id,operation_id,context_id,policy_id,scope_id)values('${turn}','${a.owner}','${trip}','${task}','${op}','${ctx}','${policy}','${scope}');commit;`);
  let s=selection(a),v=await rpc(a,{action:'preview',...s});assert.deepEqual(v.conflicts,['ACTIVE_PROFILE_USE']);assert.deepEqual(v.copies.scopedEditWork,[turn]);let before=await profile(a);await fail(rpc(a,mutation(s,v)),'PROFILE_CONFLICT');assert.deepEqual(await profile(a),before);
  await db(`begin;${claims(a)}update turn_private.work set state='completed',lease_token=null,expires_at=null where turn_id='${turn}';update turn_private.text_content set output_kind='answered',output_text='Synthetic retained mixed output' where turn_id='${turn}';commit;`);
  const inv=()=>db(`select jsonb_build_object('context',(select to_jsonb(c) from scoped_edit_private.contexts_v1 c where id='${ctx}'),'operation',(select to_jsonb(c) from scoped_edit_private.operations_v1 c where operation_id='${op}'),'publication',(select to_jsonb(c) from turn_private.text_content c where turn_id='${turn}'),'work',(select to_jsonb(c) from scoped_edit_private.work_v1 c where turn_id='${turn}'),'accounting',(select to_jsonb(c) from public.model_budget_scopes c where id='${scope}'));`);let complete=await inv();s=selection(a);v=await rpc(a,{action:'preview',...s});assert.equal(v.eligible,true);let r=await rpc(a,mutation(s,v));assert.deepEqual(r.decision.retainedCopies.scopedEditWork,[turn]);assert.equal(await inv(),complete);assert.equal(await db(`${claims(a)}select source_basis is distinct from scoped_edit_private.source_v1('${a.owner}','${trip}',0) from scoped_edit_private.contexts_v1 where id='${ctx}'`),'t');
 });
 await t.test('actual opaque Profile core copy blocks; missing Profile handler is not falsely inventoried; expired copy still CAS',async()=>{
  let a=await actor();await web(a);let policy=uuid(),job=uuid(),lease=uuid();
  const names=['trip','conversations','results','profile','memory','turn','user_artifact','brief','entitlements'];const modules=names.map(module=>({module,status:module==='profile'?'complete':'unavailable',reason:module==='profile'?'NONE':'HANDLER_MISSING',pages:module==='profile'?1:0,rows:module==='profile'?1:0,digest:module==='profile'?'a'.repeat(64):null}));
  await db(`begin;${claims(a)}insert into export_private.core_policies_v1(id,revision,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until)values('${policy}',1,'local','fixture-key',1000,1000,1000,10,20,1000,now()+interval '1 day');
   insert into public.privacy_requests(id,owner_id,action,scope_version,status,execution_state)values('${job}','${a.owner}','export','all-user-data-v1','requested','not_started');
   insert into export_private.core_jobs_v1(request_id,owner_id,session_id,session_epoch,policy_id,policy_snapshot,state,modules,expires_at)select '${job}','${a.owner}','${a.session}',1,id,to_jsonb(p),'ready_partial',${json(modules)},now()-interval '1 hour' from export_private.core_policies_v1 p where id='${policy}';
   insert into export_private.core_artifacts_v1(request_id,owner_id,generation,lease_id,key_id,nonce,tag,ciphertext,plaintext_digest,plaintext_bytes,ciphertext_digest,aad,expires_at)values('${job}','${a.owner}',1,'${lease}','fixture-key',decode('${uuid().replaceAll('-','').slice(0,24)}','hex'),decode('${'00'.repeat(16)}','hex'),'\\x61','${'a'.repeat(64)}',1,'${'b'.repeat(64)}','opaque-fixture',now()-interval '1 hour');commit;`);
  let s=selection(a),v=await rpc(a,{action:'preview',...s});assert.deepEqual(v.copies.coreExports,[job]);assert.deepEqual(v.conflicts,['CORE_EXPORT_COPY']);assert.equal(v.eligible,false);await fail(rpc(a,mutation(s,v)),'PROFILE_CONFLICT');
  await db(`begin;${claims(a)}delete from export_private.core_artifacts_v1 where request_id='${job}';update export_private.core_jobs_v1 set modules=${json(names.map(module=>({module,status:'unavailable',reason:'HANDLER_MISSING',pages:0,rows:0,digest:null})))} where request_id='${job}';commit;`);
  let q=await rpc(a,{action:'preview',...selection(a)});assert.deepEqual(q.copies.coreExports,[]);assert.deepEqual(q.conflicts,[]);
 });
 await t.test('clear serializes against real old Native save/Undo/Web RPC transactions without weakening old errors',async()=>{
  let a=await actor();await web(a);let p=await profile(a);await pace(a,{action:'save',operationId:uuid(),expectedRevision:p.pace_revision,travelPace:'relaxed',noticeVersion:'local-planning-cross-trip-v1'});p=await profile(a);let s=selection(a),v=await rpc(a,{action:'preview',...s}),c=mutation(s,v);
  const clearing=sql(container,`begin;${claims(a)}set role authenticated;select public.privacy_profile_data_v1('erase',${lit(JSON.stringify(c))},1);select pg_sleep(0.8);commit;`);
  await new Promise(r=>setTimeout(r,150));const attempts=await Promise.allSettled([pace(a,{action:'save',operationId:uuid(),expectedRevision:p.pace_revision,travelPace:'packed',noticeVersion:'local-planning-cross-trip-v1'}),pace(a,{action:'undo',operationId:uuid(),expectedRevision:p.pace_revision}),web(a)]);const cleared=await clearing;assert.equal(cleared.code,0,cleared.stderr);for(let i=0;i<attempts.length;i++){assert.equal(attempts[i].status,'rejected');assert.match(attempts[i].reason.message,i===2?/PROFILE_WRITE_FENCE/:/PACE_CONFLICT/);}let after=await profile(a);assert.equal(after.profile_revision,p.profile_revision+1);assert.equal(after.pace_revision,p.pace_revision+1);assert.equal(after.pace_request,null);
  const old=selection(a),view=await rpc(a,{action:'preview',...old});const writing=sql(container,`begin;${claims(a)}set role authenticated;select * from public.save_user_profile_v2('Fresh name','packed','en','USD','mile','fahrenheit','12:00:00',${after.profile_revision});select pg_sleep(0.8);commit;`);await new Promise(r=>setTimeout(r,150));await fail(rpc(a,mutation(old,view)),'PROFILE_CONFLICT');assert.equal((await writing).code,0);await fail(rpc(a,mutation(old,view)),'PROFILE_CONFLICT');
 });
 await t.test('whole owner progress capacity rejects before insertion; no partial list and no privileged cleanup floor bypass',async()=>{
  let a=await actor();await web(a);let s=selection(a);await rpc(a,{action:'preview',...s});
  await db(`begin;set statement_timeout='30s';insert into profile_data_private.proofs_v1 values(pg_current_xact_id(),'${a.owner}','executor',null,null);
   insert into profile_data_private.operations_v1(request_id,owner_id,session_id,mobile_epoch,scope,profile_id,object_ids,source_digest,preview_digest,captured_at,expires_at,state,summary,copies,conflicts)
    select gen_random_uuid(),owner_id,session_id,mobile_epoch,scope,profile_id,object_ids,source_digest,preview_digest,captured_at,expires_at,state,summary,copies,conflicts from profile_data_private.operations_v1 cross join generate_series(1,9999) where request_id='${s.requestId}';
   delete from profile_data_private.proofs_v1 where transaction_id=pg_current_xact_id();commit;`);
  await fail(rpc(a,{action:'preview',...selection(a)}),'PROFILE_SCOPE_TOO_LARGE');await fail(rpc(a,{action:'list',scope:'profile-delete-progress/1',cursor:null,limit:20}),'PROFILE_SCOPE_TOO_LARGE');assert.equal(await db(`select count(*) from profile_data_private.operations_v1 where owner_id='${a.owner}'`),'10000');await fail(db(`delete from profile_data_private.operations_v1 where owner_id='${a.owner}'`),'PROFILE_WRITE_FENCE');
 });
 await t.test('actual30s expiry before effects rolls back source, progress and floor',async()=>{
  let a=await actor();await web(a);let s=selection(a),v=await rpc(a,{action:'preview',...s});let before=await profile(a);
  const q=`begin;${claims(a)}set role authenticated;select pg_sleep(30.1);select public.privacy_profile_data_v1('erase',${lit(JSON.stringify(mutation(s,v)))},1);commit;`;
  const r=await sql(container,q.replace('select pg_sleep(30.1);',"set statement_timeout='40s';select pg_sleep(30.1);"));assert.notEqual(r.code,0);assert.match(r.stderr,/PROFILE_EXPIRED/);assert.deepEqual(await profile(a),before);assert.equal(await db(`select state from profile_data_private.operations_v1 where request_id='${s.requestId}'`),'previewed');
 });
 await t.test('controlled fixture delay after real effects uses actual clock and rolls source/floors/receipt back; original terminal receipt recovers afterTTL',async()=>{
  let a=await actor();await web(a);let s=selection(a),v=await rpc(a,{action:'preview',...s});
  const inv=()=>db(`select jsonb_build_object('profile',(select to_jsonb(p) from public.user_profiles p where owner_id='${a.owner}'),'floor',(select to_jsonb(w) from profile_data_private.watermarks_v1 w where owner_id='${a.owner}'),'operation',(select to_jsonb(o) from profile_data_private.operations_v1 o where request_id='${s.requestId}'));`);let before=await inv();
  // Timing instrumentation in the owned disposable DB only. Every original
  // source mutation/guard executes, then a real 30.1s sleep precedes final clock.
  const original=await db("select pg_get_functiondef('profile_data_private.verify_effects_v1(jsonb)'::regprocedure)");
  await db(original.replace('begin\n for edge',"begin\n perform pg_sleep(30.1);\n for edge"));
  try{const result=await sql(container,`begin;set statement_timeout='40s';${claims(a)}set role authenticated;select public.privacy_profile_data_v1('erase',${lit(JSON.stringify(mutation(s,v)))},1);commit;`);assert.notEqual(result.code,0);assert.match(result.stderr,/PROFILE_EXPIRED/);}finally{await db(original);}
  assert.equal(await inv(),before);assert.deepEqual(await rpc(state.a,{action:'recover',...state.s,mutationBytes:state.bytes}),state.r);
 });
 await t.test('fresh authority/session and foreign selection negatives rollback and disclose no foreign source',async()=>{
  let a=await actor(),b=await actor();await web(a);await web(b);await fail(rpc(a,{action:'preview',scope:'profile-sensitive-data/1',requestId:uuid(),profileId:b.owner,objectIds:[]}),'FORBIDDEN');let s=selection(a),v=await rpc(a,{action:'preview',...s});let before=await profile(a);await db(`update auth.sessions set created_at=now()-interval '6 minutes' where id='${a.session}'`);await fail(rpc(a,mutation(s,v)),'REAUTHENTICATION_REQUIRED');assert.deepEqual(await profile(a),before);
 });
 await t.test('unknown application source shape and inbound FK drift remain fail-closed',async()=>{
  let a=await actor();await web(a);const s=selection(a);await fail(db(`begin;alter table public.user_profiles add column unexpected text;${claims(a)}set role authenticated;select public.privacy_profile_data_v1('preview',${lit(JSON.stringify({action:'preview',...s}))},1);commit;`),'PROFILE_SOURCE_UNAVAILABLE');
  await fail(db(`begin;create table public.profile_unapproved_fk(owner_id uuid references public.user_profiles(owner_id));${claims(a)}set role authenticated;select public.privacy_profile_data_v1('preview',${lit(JSON.stringify({action:'preview',...s}))},1);commit;`),'PROFILE_SOURCE_UNAVAILABLE');assert.equal(await db('select profile_data_private.schema_v1()'),'t');
 });

});
