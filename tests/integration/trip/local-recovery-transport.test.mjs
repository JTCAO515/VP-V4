// #220 full original writer integration on actual main reservation schema.
// #366 fixture reuse: synthetic admin actor/producer/rights, never real provider acceptance.
// Disposable network-none PG. Fixture role/policy grants never prove real rights/origin.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1';
const container='vpj29-transport-'+uuid().slice(0,8);let created=false;
const migration='20261004040000_foreground_traffic_authority.sql';
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const actorSql=a=>`set request.jwt.claim.sub='${a.subject}';set request.jwt.claims='${JSON.stringify({role:"authenticated",is_anonymous:false,session_id:a.sessionId})}';set request.jwt.claim.role='authenticated';`;
const rpc=async(role,name,args,a=null)=>JSON.parse(await db(`begin;${a?actorSql(a):''}set role ${role};select ${name}(${args.map(lit).join(',')});commit;`));
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 let ready=false;for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
  const content=readFileSync('supabase/migrations/'+f,'utf8');
  if(f===migration){await db('begin;'+content+'rollback;');assert.equal(await db("select to_regnamespace('traffic_private') is null;"),'t');}
  await db('begin;'+content+'commit;');
 }
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
async function fixture({tmc=false,mobile=false,policy=true}={}){
 const actor={subject:uuid(),sessionId:uuid(),mobileEpoch:mobile?1:null},trip=uuid(),origin=uuid(),destination=uuid(),poi1=uuid(),poi2=uuid(),policyId=uuid();
 await db(`insert into auth.users(id) values('${actor.subject}');insert into auth.sessions(id,user_id) values('${actor.sessionId}','${actor.subject}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${actor.subject}',${mobile?lit(actor.sessionId):'null'},${mobile?1:0});${mobile?`insert into identity_private.mobile_attempts values('${actor.subject}','${uuid()}','${actor.sessionId}',1);`:''}
 insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values('${poi1}','测试起点','Fixture origin'),('${poi2}','测试终点','Fixture destination');
 insert into public.provider_poi_mappings(canonical_poi_id,provider,provider_poi_id,raw_name) values('${poi1}','amap','${uuid()}','Fixture'),('${poi2}','amap','${uuid()}','Fixture');
 insert into public.trips(id,owner_id,title,head_version) values('${trip}','${actor.subject}','Synthetic traffic',1);
 insert into public.trip_days(trip_id,owner_id,day_id,trip_date) values('${trip}','${actor.subject}','Day_A','2026-10-04');
 insert into public.trip_items(trip_id,owner_id,day_id,item_id,title) values('${trip}','${actor.subject}','Day_A','Item_A','Synthetic item');
 insert into public.trip_place_references(id,trip_id,owner_id,reference_kind,canonical_poi_id) values('${origin}','${trip}','${actor.subject}','canonical','${poi1}'),('${destination}','${trip}','${actor.subject}','canonical','${poi2}');`);
 const account='fixture_'+uuid().replaceAll('-','');
 await db(`insert into traffic_private.producers_v1(role_oid,account_scope,enabled,expires_at) values('service_role'::regrole::oid,'${account}',true,clock_timestamp()+interval '1 hour') on conflict(role_oid) do update set account_scope=excluded.account_scope,enabled=true,expires_at=excluded.expires_at;
 grant execute on function public.foreground_traffic_policy_v1(jsonb,jsonb),public.foreground_traffic_producer_v1(text,jsonb,jsonb) to service_role;
 grant execute on function public.read_foreground_traffic_v1(uuid,jsonb),public.read_foreground_traffic_scope_v1(jsonb),public.stop_foreground_traffic_v1(jsonb,bigint) to authenticated;`);
 const fields=['duration','distance','derived_change','receipt_metadata',...(tmc?['tmc']:[])],now=Date.now();
 const wire={policyId:'synthetic_policy',sourceId:'synthetic_source',licenceVersion:'fixture_only',dataClass:'c0_public',grants:fields.flatMap(field=>['display','cache','persist'].map(action=>({field,region:'cn',action,purpose:action==='persist'?'trip_planning':'explore'}))),effectiveAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),termsRecheckAt:new Date(now+3600000).toISOString(),trialEndsAt:null,derivative:'allowed',shareAlike:'not_required',combination:'denied',redistribution:'denied',training:'denied',retention:'durable'};
 if(policy)await db(`insert into traffic_private.policies_v1(id,revision,account_scope,source_version,mode,endpoint_modes,policy,retention_seconds,source_expires_at,enabled) values('${policyId}',1,'${account}','fixture_v1','${tmc?'driving':'walking'}',array['${tmc?'driving':'walking'}'],${lit(wire)}::jsonb,300,clock_timestamp()+interval '1 hour',true);`);
 const scope={tripId:trip,expectedHeadVersion:1,dayId:'Day_A',itemId:'Item_A',originPlaceReferenceId:origin,destinationPlaceReferenceId:destination,mode:tmc?'driving':'walking',departure:'now'};
 const call=(action,input)=>rpc('service_role','public.foreground_traffic_producer_v1',[action,input,actor]);
 const policyRead=()=>rpc('service_role','public.foreground_traffic_policy_v1',[scope,actor]);
 const begin=async operationId=>{const p=await policyRead();assert.equal(p.kind,'policy',JSON.stringify(p));return call('begin',{operationId:operationId??uuid(),scope,policyId:p.policyId,policyRevision:p.policyRevision,stopEpoch:p.stopEpoch,operation:'check',endpoints:p.endpoints});};
 const complete=async(d,duration=300,previous=null)=>call('complete',{dispatchId:d,fetchedAt:await db("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');"),selected:{mode:scope.mode,durationSeconds:duration,distanceMeters:1000,tmc:tmc?{unknown:0,smooth:1000,slow:0,congested:0,severely_congested:0}:null},alternatives:[],previousReceiptId:previous});
 const read=id=>rpc('authenticated','public.read_foreground_traffic_v1',[id,scope],actor);
 return{actor,trip,origin,destination,poi2,policyId,wire,scope,call,policyRead,begin,complete,read};
}
async function installSupport(f){
 const [author,reviewer,mapper]=Array.from({length:3},()=>({subject:uuid(),sessionId:uuid(),mobileEpoch:null}));
 for(const a of [author,reviewer,mapper])await db(`insert into auth.users(id) values('${a.subject}');insert into auth.sessions(id,user_id) values('${a.sessionId}','${a.subject}');insert into identity_private.mobile_accounts(owner_id) values('${a.subject}');insert into knowledge_review_private.members(actor_id,active) values('${a.subject}',true);`);
 await db('update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true;');
 const call=async(a,name,p)=>JSON.parse(await db(`begin;${actorSql(a)}select ${name==='create_trip_proposal_patch'?"coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.":'public.'}${name}(${Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')})${name==='create_trip_proposal_patch'?' x':''};commit;`));
 const candidate=uuid(),statement={schemaVersion:'knowledge-statement/2',assertion:{subjectId:'test_gallery',predicate:'located_at',objectId:'place_address',conditions:[],exclusions:[]},scope:{cities:['shanghai'],scene:'attraction',audience:'international_independent_traveler'},place:{names:{en:'Test Gallery',zh:'测试展馆'}},value:{lines:['Synthetic address'],countryCode:'CN'},expressions:{en:{text:'Synthetic address',conditions:[],exclusions:[]},zh:{text:'合成地址',conditions:[],exclusions:[]}},sources:[{sourceKey:'traffic-'+uuid(),revisionLabel:'one',publisher:'Fixture source',uri:'urn:vpj15:synthetic:traffic',locator:'Fixture only',snippet:'NO REAL SUPPLIER',usageDeclaration:'private synthetic fixture'}]};
 await call(author,'ops_review_workspace',{p_input:{action:'submit_statement',operationId:uuid(),candidateId:candidate,title:'Synthetic address',statement}});
 await call(reviewer,'ops_review_workspace',{p_input:{action:'review',operationId:uuid(),candidateId:candidate,expectedVersion:1,decision:'reviewed',note:'Independent fixture review'}});
 await call(reviewer,'ops_review_workspace',{p_input:{action:'publish_statement',operationId:uuid(),candidateId:candidate,expectedVersion:2,useBasis:'original_factual_summary',useNote:'synthetic only',expiresAt:new Date(Date.now()+86400000).toISOString()}});
 const st=JSON.parse(await db(`select jsonb_build_object('id',statement_id,'revision',revision,'hash',trip_support_private.hash(payload)) from knowledge_review_private.statements where candidate_id='${candidate}';`));
 const refs=JSON.parse(await db(`select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id) from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id='${candidate}';`));
 const digest=await db(`select trip_support_private.hash(${lit(refs)}::jsonb);`);
 const mapping=await call(mapper,'submit_trip_support_entity_mapping_v1',{p_input:{operationId:uuid(),canonicalPoiId:f.poi2,statementId:st.id,expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:digest,basisMetadata:{city:'shanghai',scene:'attraction',locale:'en',sourceRefs:refs}}});assert.equal(mapping.kind,'mapping_candidate',JSON.stringify(mapping));
 const mapped=await call(reviewer,'review_trip_support_entity_mapping_v1',{p_mapping:mapping.mappingId,p_expected_version:mapping.version,p_expected_digest:mapping.digest,p_decision:'approve'});assert.equal(mapped.kind,'mapping_reviewed');
 const proposed=await call(f.actor,'create_trip_proposal_patch',{p_trip_id:f.trip,p_patch:{expectedVersion:1,operations:[{kind:'upsert_item',itemId:'Item_A',dayId:'Day_A',title:'Synthetic item'},{kind:'upsert_item',itemId:'Optional_B',dayId:'Day_A',title:'Optional item'}]}});
 const proposalId=proposed[0].proposal_id;
 const read=JSON.parse(await db(`${actorSql(f.actor)}select to_jsonb(x) from public.read_trip_proposal_v2('${proposalId}') x;`));
 const itemDigest=await db(`select trip_support_private.hash(trip_support_private.item(public.apply_trip_content_patch(public.trip_content_snapshot('${f.trip}','Synthetic traffic'),${lit(read.proposal.patch)}::jsonb),'Day_A','Item_A'));`);
 const prepared=await call(f.actor,'prepare_trip_item_support_v1',{p_input:{operationId:uuid(),tripId:f.trip,placeReferenceId:f.destination,dayId:'Day_A',itemId:'Item_A',proposalId,expectedProposalRevision:read.proposal.revision,expectedBaseVersion:1,expectedProposalDigest:read.digest,expectedItemDigest:itemDigest,mappingId:mapped.mappingId,expectedMappingVersion:mapped.version,expectedMappingDigest:mapped.digest,city:'shanghai',scene:'attraction',locale:'en',scope:'address_reference',expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:digest}});assert.equal(prepared.kind,'prepared',JSON.stringify(prepared));assert.equal(prepared.applicability,'matched');
 const confirmed=await call(f.actor,'confirm_and_apply_supported_trip_proposal_v1',{p_proposal_id:proposalId,p_idempotency_key:'traffic-'+uuid(),p_digest:read.digest,p_support_selection:[{receiptId:prepared.receiptId,version:prepared.version,sourceDigest:prepared.sourceDigest}]});assert.equal(confirmed.kind,'confirmed',JSON.stringify(confirmed));
 f.scope.expectedHeadVersion=2;return{sourceId:refs[0].sourceRevisionId,reviewer,author};
}

const ownerRpc=(f,name,args)=>rpc('postgres','public.'+name,args,f.actor);
async function ready({order=false,short=false,mobile=false}={}){
 const f=await fixture({mobile}),support=await installSupport(f);
 if(short)await db("update traffic_private.producers_v1 set expires_at=clock_timestamp()+interval '4 seconds' where role_oid='service_role'::regrole::oid;");
 const firstDispatch=await f.begin();await f.call('request',{dispatchId:firstDispatch.dispatchId,requestIndex:1,endpointKind:'walking'});const first=await f.complete(firstDispatch.dispatchId);
 await db(`update traffic_private.scopes_v1 set last_begin_at=clock_timestamp()-interval '61 seconds' where trip_id='${f.trip}';`);
 const next=await f.begin();await f.call('request',{dispatchId:next.dispatchId,requestIndex:1,endpointKind:'walking'});const changed=await f.complete(next.dispatchId,450,first.receipt.receiptId);assert.equal(changed.receipt.changeKind,'route_estimate_changed');
 const input={operationId:uuid(),expectedHeadVersion:2,dayId:'Day_A',selectedItemIds:['Optional_B'],fixedItemIds:['Item_A'],reservationBindings:[],receiptId:changed.receipt.receiptId,scope:f.scope,locale:'en'};
 let reference=null;
 if(order){reference=uuid();const command={operationId:uuid(),referenceId:reference,expectedTripVersion:2,expectedRevision:0,fields:{kind:'activity',supplier:'official',externalReference:null,title:'Explicit user fixed',startsAt:null,endsAt:null,timeZone:null,address:null,terms:null,status:'reserved'},source:{kind:'user_reported',localMaterialId:null,localContentHash:null,locator:null},explicitlyConfirmed:true};assert.equal((await ownerRpc(f,'confirm_reservation_reference_v1',[f.trip,command])).kind,'reservation_confirmation/1');input.reservationBindings=[{referenceId:reference,revision:1,dayId:'Day_A',itemId:'Item_A'}];}
 const context=await ownerRpc(f,'prepare_transport_recovery_v1',[f.trip,input]);assert.equal(context.kind,'local_recovery_context/1',JSON.stringify(context));assert.deepEqual(context.input,input);assert.equal(context.input.report,undefined);assert.ok(Date.parse(context.expiresAt)<=Date.parse(changed.receipt.expiresAt));
 assert.deepEqual(await ownerRpc(f,'prepare_transport_recovery_v1',[f.trip,input]),context);
 const selection={operationId:uuid(),contextId:context.contextId,contextDigest:context.contextDigest,candidateId:'omit_one'},receipt=await ownerRpc(f,'submit_local_recovery_v1',[f.trip,selection]);assert.equal(receipt.kind,'local_recovery_proposal/1',JSON.stringify(receipt));
 const read=JSON.parse(await db(`${actorSql(f.actor)}select to_jsonb(x) from public.read_trip_proposal_v2('${receipt.proposalId}') x;`));
 const key=uuid(),confirmSql=`select * from public.confirm_and_apply_trip_proposal('${receipt.proposalId}','${key}',${lit(read.digest)});`;
 return {...f,support,context,input,selection,receipt,read,key,confirmSql,reference,changed};
}
const state=f=>db(`select jsonb_build_array(t.head_version,public.trip_content_snapshot(t.id,t.title),(select count(*) from public.trip_events where trip_id=t.id),(select count(*) from public.trip_version_snapshots where trip_id=t.id),(select count(*) from public.trip_idempotency where owner_id=t.owner_id),(select count(*) from public.trip_audit_events where trip_id=t.id)) from public.trips t where t.id='${f.trip}';`);
const confirm=f=>db(`begin;${actorSql(f.actor)}${f.confirmSql}commit;`);
async function noWrite(f,body,pattern=/RECOVERY_(TRANSPORT|CONFIRM)_GUARD|SESSION_REPLACED/){
 const before=await state(f),r=await sql(container,`begin;${actorSql(f.actor)}${f.confirmSql}${body}commit;`);assert.notEqual(r.code,0);assert.match(r.stderr,pattern);assert.equal(await state(f),before);assert.equal(await db(`select count(*) from recovery_private.transport_proofs_v1 where owner_id='${f.actor.subject}';`),'0');
}
run('R2 actual reservation basis/qualified address source to public preparation/selection/original concurrent confirmation and same operation read',async()=>{
 const f=await ready({order:true}),original=JSON.parse(await db(`select public.trip_content_snapshot(id,title) from public.trips where id='${f.trip}';`));assert.equal(f.context.reservationBasis.length,1);assert.equal(f.context.reservationBasis[0].referenceId,f.reference);assert.equal(f.context.reservationBasis[0].evidenceTier,'user_reported');
 const replies=await Promise.all([confirm(f),confirm(f)]);assert.deepEqual(replies.sort(),['already_applied|3','applied|3']);
 original.days[0].items=original.days[0].items.filter(i=>i.id!=='Optional_B');assert.deepEqual(JSON.parse(await db(`select public.trip_content_snapshot(id,title) from public.trips where id='${f.trip}';`)),original);
 const op=await ownerRpc(f,'read_local_recovery_operation_v1',[f.trip,f.selection.operationId]);assert.equal(op.state,'applied');assert.equal(op.resultingVersion,3);assert.equal(op.receipt.proposalId,f.receipt.proposalId);
 assert.equal(await db(`select count(*) from public.trip_events where proposal_id='${f.receipt.proposalId}';`),'1');assert.equal(await db(`select count(*) from recovery_private.transport_proofs_v1 where owner_id='${f.actor.subject}';`),'0');
 assert.equal(await db(`select hits from place_quota_private.usage where actor_id='${f.actor.subject}' and window_seconds=86400;`),'2');
 assert.equal((await ownerRpc(f,'submit_local_recovery_v1',[f.trip,f.selection])).proposalId,f.receipt.proposalId);
});
run('R2 original writer deferred guard rolls back same transaction stop/policy/member/source/receipt changes',async()=>{
 for(const mode of ['stop','policy','member','source','receipt']){
  const f=await ready();let change;
  if(mode==='stop')change=`do $$begin perform public.stop_foreground_traffic_v1(${lit({...f.scope,expectedHeadVersion:3})}::jsonb,0);end $$;`;
  if(mode==='policy')change=`update traffic_private.policies_v1 set revoked_at=clock_timestamp() where id='${f.policyId}';`;
  if(mode==='member')change=`update knowledge_review_private.members set active=false where actor_id='${f.support.reviewer.subject}';`;
  if(mode==='source')change=`${actorSql(f.support.author)}do $$begin perform public.ops_source_revision_withdraw_v1(${lit({operationId:uuid(),sourceRevisionId:f.support.sourceId,reason:'Synthetic same transaction withdrawal'})}::jsonb);end $$;${actorSql(f.actor)}`;
  if(mode==='receipt')change=`update traffic_private.receipts_v1 set selected=jsonb_set(selected,'{durationSeconds}','999') where id='${f.changed.receipt.receiptId}';`;
  await noWrite(f,change);assert.equal((await ownerRpc(f,'read_local_recovery_operation_v1',[f.trip,f.selection.operationId])).state,'pending');
 }
});
run('R2 shortest qualified deadline expires at original commit and rolls back actual Trip/idempotency/proof',async()=>{
 const f=await ready({short:true}),seconds=(Date.parse(f.receipt.expiresAt)-Date.now())/1000+0.15;assert.ok(seconds>0 && seconds<5);await noWrite(f,`select pg_sleep(${seconds});`);
 assert.equal((await ownerRpc(f,'read_local_recovery_operation_v1',[f.trip,f.selection.operationId])).state,'expired');
});
run('R2 mobile epoch mutation and concurrent reservation change cannot bypass original source/owner scope',async()=>{
 const mobile=await ready({mobile:true});await noWrite(mobile,`update identity_private.mobile_accounts set epoch=2 where owner_id='${mobile.actor.subject}';`);
 const f=await ready(),reference=uuid(),command={operationId:uuid(),referenceId:reference,expectedTripVersion:2,expectedRevision:0,fields:{kind:'activity',supplier:'official',externalReference:null,title:'New fixed user intent',startsAt:null,endsAt:null,timeZone:null,address:null,terms:null,status:'reserved'},source:{kind:'user_reported',localMaterialId:null,localContentHash:null,locator:null},explicitlyConfirmed:true};
 const [applied,order]=await Promise.all([sql(container,`begin;${actorSql(f.actor)}${f.confirmSql}commit;`),ownerRpc(f,'confirm_reservation_reference_v1',[f.trip,command])]);
 if(order.kind==='reservation_confirmation/1'){assert.notEqual(applied.code,0);assert.match(applied.stderr,/RECOVERY_CONFIRM_GUARD/);assert.equal(await db(`select head_version from public.trips where id='${f.trip}';`),'2');}
 else {assert.ok(['unavailable','conflict'].includes(order.kind),JSON.stringify(order));assert.equal(applied.code,0,applied.stderr);assert.equal(await db(`select head_version from public.trips where id='${f.trip}';`),'3');}
 assert.equal(await db(`select count(*) from recovery_private.transport_proofs_v1 where owner_id='${f.actor.subject}';`),'0');
});
