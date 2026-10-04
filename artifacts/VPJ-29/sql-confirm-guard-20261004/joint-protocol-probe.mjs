// Disposable network-none PG. Fixture role/policy grants never prove real rights/origin.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TRAFFIC_DB_TEST==='1';
const container='vp366-traffic-'+uuid().slice(0,8);let created=false;
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
run('real main history + new append compile/rollback; all roles denied and empty authority',async()=>{
 assert.equal(await db('select count(*) from traffic_private.producers_v1;'),'0');assert.equal(await db('select count(*) from traffic_private.policies_v1;'),'0');
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='traffic_private' or n.nspname='public' and p.proname in('foreground_traffic_policy_v1','foreground_traffic_producer_v1','read_foreground_traffic_v1','read_foreground_traffic_scope_v1','stop_foreground_traffic_v1')) and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
  assert.notEqual((await sql(container,`set role ${role};select * from traffic_private.receipts_v1;`)).code,0);
 }
 assert.equal(await db("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='traffic_private' and (p.proconfig is null or not 'search_path="+'""'+"'=any(p.proconfig));"),'0');
});
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
run('empty policy blocks dispatch; ordinary forwarding and forged role claim cannot produce',async()=>{
 const f=await fixture({policy:false});assert.equal((await f.policyRead()).kind,'unavailable');
 assert.notEqual((await sql(container,actorSql(f.actor)+"set role authenticated;select public.foreground_traffic_policy_v1('{}','{}');")).code,0);
 assert.equal(await db('select count(*) from place_quota_private.usage;'),'0');
});
run('server transport without user JWT has live actor scope, walking without TMC grant, exact request, owner read and stop',async()=>{
 const f=await fixture(),d=await f.begin();assert.equal(d.kind,'dispatch',JSON.stringify(d));
 assert.equal((await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:f.scope.mode})).kind,'request');
 assert.equal((await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:f.scope.mode})).kind,'unavailable');
 const done=await f.complete(d.dispatchId);assert.equal(done.kind,'receipt',JSON.stringify(done));assert.equal(done.receipt.r2Qualified,false);assert.equal(done.receipt.providerObservedAt,null);
 assert.equal((await f.read(done.receipt.receiptId)).kind,'receipt');
 assert.equal(await db(`select hits from place_quota_private.usage where actor_id='${f.actor.subject}' and window_seconds=86400;`),'1');
 const wrong={...f.actor,sessionId:uuid()};assert.equal((await rpc('service_role','public.foreground_traffic_policy_v1',[f.scope,wrong])).kind,'unavailable');
 const stop=await rpc('authenticated','public.stop_foreground_traffic_v1',[f.scope,0],f.actor);assert.equal(stop.kind,'stopped');assert.equal(stop.stopEpoch,1);assert.equal((await f.read(done.receipt.receiptId)).kind,'unavailable');
});
run('missing source association denies R2, policy change purges values but stop still works',async()=>{
 const f=await fixture(),d=await f.begin();await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:f.scope.mode});const done=await f.complete(d.dispatchId);
 assert.equal((await rpc('postgres','traffic_private.qualify_recovery_v1',[done.receipt.receiptId,f.scope,f.policyId,1,0],f.actor)).kind,'unavailable');
 await db(`update traffic_private.policies_v1 set revoked_at=clock_timestamp() where id='${f.policyId}';`);
 assert.equal(await db(`select count(*) from traffic_private.receipts_v1 where id='${done.receipt.receiptId}';`),'0');
 assert.equal((await rpc('authenticated','public.stop_foreground_traffic_v1',[f.scope,0],f.actor)).kind,'stopped');
});
run('unknown dispatch freezes durable window; native epoch/mapping/head drift denies current read',async()=>{
 const f=await fixture({mobile:true}),d=await f.begin();await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:f.scope.mode});assert.equal((await f.call('unknown',{dispatchId:d.dispatchId})).kind,'unknown');assert.equal((await f.begin()).kind,'unknown');
 await db(`update identity_private.mobile_accounts set epoch=2 where owner_id='${f.actor.subject}';`);assert.equal((await f.policyRead()).kind,'unavailable');
 const g=await fixture(),gd=await g.begin();await g.call('request',{dispatchId:gd.dispatchId,requestIndex:1,endpointKind:g.scope.mode});const done=await g.complete(gd.dispatchId);
 await db(`update public.provider_poi_mappings set matched_at=clock_timestamp() where canonical_poi_id='${g.poi2}';`);assert.equal((await g.read(done.receipt.receiptId)).kind,'unavailable');
});
run('original quota and restricted request share atomic day cap under actual concurrency',async()=>{
 const f=await fixture(),d=await f.begin();
 await db(`insert into place_quota_private.usage values('${f.actor.subject}','places',86400,to_timestamp(floor(extract(epoch from clock_timestamp())/86400)*86400),499);`);
 const [legacy,producer]=await Promise.all([
  rpc('authenticated','public.consume_place_quota_v1',['places',30,500],f.actor),
  f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:'walking'}),
 ]);
 assert.equal(Number(legacy.allowed)+Number(producer.kind==='request'),1);
 assert.equal(await db(`select hits from place_quota_private.usage where actor_id='${f.actor.subject}' and window_seconds=86400;`),'500');
});
run('endpoint before-dispatch refusal consumes nothing; TMC output requires its actual field rights',async()=>{
 const f=await fixture(),d=await f.begin();
 assert.equal((await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:'driving'})).kind,'unavailable');
 assert.equal(await db(`select count(*) from place_quota_private.usage where actor_id='${f.actor.subject}';`),'0');
 assert.equal((await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:'walking'})).kind,'request');
 assert.equal((await f.call('complete',{dispatchId:d.dispatchId,fetchedAt:new Date().toISOString(),selected:{mode:'walking',durationSeconds:300,distanceMeters:1000,tmc:{unknown:0,smooth:1000,slow:0,congested:0,severely_congested:0}},alternatives:[],previousReceiptId:null})).kind,'unavailable');
 assert.equal(await db(`select count(*) from traffic_private.receipts_v1 where dispatch_id='${d.dispatchId}';`),'0');
});
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
 const proposed=await call(f.actor,'create_trip_proposal_patch',{p_trip_id:f.trip,p_patch:{expectedVersion:1,operations:[{kind:'upsert_item',itemId:'Item_A',dayId:'Day_A',title:'Synthetic item'}]}});
 const proposalId=proposed[0].proposal_id;
 const read=JSON.parse(await db(`${actorSql(f.actor)}select to_jsonb(x) from public.read_trip_proposal_v2('${proposalId}') x;`));
 const itemDigest=await db(`select trip_support_private.hash(trip_support_private.item(public.apply_trip_content_patch(public.trip_content_snapshot('${f.trip}','Synthetic traffic'),${lit(read.proposal.patch)}::jsonb),'Day_A','Item_A'));`);
 const prepared=await call(f.actor,'prepare_trip_item_support_v1',{p_input:{operationId:uuid(),tripId:f.trip,placeReferenceId:f.destination,dayId:'Day_A',itemId:'Item_A',proposalId,expectedProposalRevision:read.proposal.revision,expectedBaseVersion:1,expectedProposalDigest:read.digest,expectedItemDigest:itemDigest,mappingId:mapped.mappingId,expectedMappingVersion:mapped.version,expectedMappingDigest:mapped.digest,city:'shanghai',scene:'attraction',locale:'en',scope:'address_reference',expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:digest}});assert.equal(prepared.kind,'prepared',JSON.stringify(prepared));assert.equal(prepared.applicability,'matched');
 const confirmed=await call(f.actor,'confirm_and_apply_supported_trip_proposal_v1',{p_proposal_id:proposalId,p_idempotency_key:'traffic-'+uuid(),p_digest:read.digest,p_support_selection:[{receiptId:prepared.receiptId,version:prepared.version,sourceDigest:prepared.sourceDigest}]});assert.equal(confirmed.kind,'confirmed',JSON.stringify(confirmed));
 f.scope.expectedHeadVersion=2;return{sourceId:refs[0].sourceRevisionId,reviewer,author};
}
run('actual reviewed ItemSupport chain qualifies changed receipt; deferred proof survives own Trip write and rejects source withdrawal',async()=>{
 const f=await fixture(),support=await installSupport(f);
 await db("update traffic_private.producers_v1 set expires_at=clock_timestamp()+interval '90 seconds' where role_oid='service_role'::regrole::oid;");
 const d=await f.begin();await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:'walking'});const first=await f.complete(d.dispatchId);
 assert.equal((await f.read(first.receipt.receiptId)).receipt.r2Qualified,true);
 // Advance only the fixture throttle, preserving real policy/receipt/source deadlines.
 await db(`update traffic_private.scopes_v1 set last_begin_at=clock_timestamp()-interval '61 seconds' where trip_id='${f.trip}';`);
 const next=await f.begin();await f.call('request',{dispatchId:next.dispatchId,requestIndex:1,endpointKind:'walking'});const changed=await f.complete(next.dispatchId,450,first.receipt.receiptId);assert.equal(changed.receipt.changeKind,'route_estimate_changed');
 const q=await rpc('postgres','traffic_private.qualify_recovery_v1',[changed.receipt.receiptId,f.scope,f.policyId,1,0],f.actor);assert.equal(q.kind,'qualified',JSON.stringify(q));assert.ok(q.proofBasis);assert.ok(Date.parse(q.expiresAt)<Date.parse(changed.receipt.expiresAt));assert.ok(!JSON.stringify(q.proofBasis).includes('NO REAL SUPPLIER'));
 const args=[changed.receipt.receiptId,f.scope,f.policyId,1,0,q.proofBasis].map(lit).join(',');
 assert.equal(await db(`begin;${actorSql(f.actor)}update public.trips set head_version=head_version+1 where id='${f.trip}';update public.trip_items set title='Confirmed change' where trip_id='${f.trip}';select traffic_private.validate_recovery_proof_v1(${args});rollback;`),'t');
 assert.equal(await db(`begin;${actorSql(support.author)}do $$begin perform public.ops_source_revision_withdraw_v1(${lit({operationId:uuid(),sourceRevisionId:support.sourceId,reason:'Synthetic same transaction withdrawal'})}::jsonb);end $$;${actorSql(f.actor)}select traffic_private.validate_recovery_proof_v1(${args});rollback;`),'f');
 assert.equal(await db(`begin;${actorSql(f.actor)}update traffic_private.receipts_v1 set selected=jsonb_set(selected,'{durationSeconds}','999') where id='${changed.receipt.receiptId}';select traffic_private.validate_recovery_proof_v1(${args});rollback;`),'f');
 assert.equal(await db(`begin;${actorSql(f.actor)}update traffic_private.scopes_v1 set epoch=epoch+1 where trip_id='${f.trip}';select traffic_private.validate_recovery_proof_v1(${args});rollback;`),'f');
 assert.equal(await db(`begin;${actorSql(f.actor)}update knowledge_review_private.members set active=false where actor_id='${support.reviewer.subject}';select traffic_private.validate_recovery_proof_v1(${args});rollback;`),'f');
});
run('owner scope read stops lost ACK without policy; no cross-owner epoch or implicit retry after receipt expiry',async()=>{
 const f=await fixture(),d=await f.begin();await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:'walking'});
 await db(`update traffic_private.dispatches_v1 set expires_at=clock_timestamp()-interval '1 second' where id='${d.dispatchId}';update traffic_private.scopes_v1 set last_begin_at=clock_timestamp()-interval '61 seconds' where trip_id='${f.trip}';`);
 assert.equal((await f.begin()).kind,'unknown');
 await db('select traffic_private.purge_expired_v1(500);');assert.equal((await f.begin()).kind,'unknown');
 await db(`update traffic_private.policies_v1 set revoked_at=clock_timestamp() where id='${f.policyId}';`);
 const current=await rpc('authenticated','public.read_foreground_traffic_scope_v1',[f.scope],f.actor);assert.deepEqual(current,{kind:'scope',stopEpoch:0,stopped:false});
 assert.equal((await rpc('authenticated','public.stop_foreground_traffic_v1',[f.scope,current.stopEpoch],f.actor)).kind,'stopped');
 assert.equal((await rpc('authenticated','public.stop_foreground_traffic_v1',[f.scope,current.stopEpoch],f.actor)).kind,'unavailable');
 const other={subject:uuid(),sessionId:uuid(),mobileEpoch:null};await db(`insert into auth.users(id) values('${other.subject}');insert into auth.sessions(id,user_id) values('${other.sessionId}','${other.subject}');`);
 assert.equal((await rpc('authenticated','public.read_foreground_traffic_scope_v1',[f.scope],other)).kind,'unavailable');
});
run('bounded expiry purge, source-policy expiry, session and Trip cascades erase new metadata',async()=>{
 const f=await fixture(),d=await f.begin();await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:'walking'});const r=await f.complete(d.dispatchId);
 await db(`update traffic_private.dispatches_v1 set expires_at=clock_timestamp()-interval '1 second' where id='${d.dispatchId}';`);assert.equal((await f.read(r.receipt.receiptId)).kind,'unavailable');
 assert.equal(await db('select traffic_private.purge_expired_v1(0);'),'0');assert.equal(await db('select traffic_private.purge_expired_v1(1);'),'1');
 assert.equal(await db(`select count(*) from traffic_private.receipts_v1 where id='${r.receipt.receiptId}';`),'0');
 const g=await fixture(),gd=await g.begin();await g.call('request',{dispatchId:gd.dispatchId,requestIndex:1,endpointKind:'walking'});const gr=await g.complete(gd.dispatchId);
 await db(`delete from auth.sessions where id='${g.actor.sessionId}';`);assert.equal(await db(`select count(*) from traffic_private.scopes_v1 where trip_id='${g.trip}';`),'0');assert.equal((await g.read(gr.receipt.receiptId)).kind,'unavailable');
 const h=await fixture(),hd=await h.begin();await h.call('request',{dispatchId:hd.dispatchId,requestIndex:1,endpointKind:'walking'});await h.complete(hd.dispatchId);
 await db(`delete from public.trips where id='${h.trip}';`);assert.equal(await db(`select count(*) from traffic_private.dispatches_v1 where trip_id='${h.trip}';`),'0');
});
run('D2 export uses exact real job lease generation session; bounded metadata contains no observation values',async()=>{
 const f=await fixture({mobile:true}),d=await f.begin();await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:'walking'});await f.complete(d.dispatchId);
 const req=uuid(),lease=uuid(),pid=uuid();
 await db(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) values('${pid}',1,true,'local','synthetic_unactivated',1000,60000,30000,1,10,65536,clock_timestamp()+interval '1 hour');
 insert into public.privacy_requests(id,owner_id,action,scope_version,status,execution_state) values('${req}','${f.actor.subject}','export','all-user-data-v1','requested','not_started');
 insert into export_private.core_jobs_v1(request_id,owner_id,session_id,session_epoch,policy_id,policy_snapshot,state,lease_id,lease_expires_at,expires_at) select '${req}','${f.actor.subject}','${f.actor.sessionId}',1,id,to_jsonb(p),'running','${lease}',clock_timestamp()+interval '1 minute',clock_timestamp()+interval '1 hour' from export_private.core_policies_v1 p where id='${pid}';`);
 const read=(request=req,l=lease,generation=1)=>rpc('postgres','traffic_private.export_metadata_v1',[request,l,generation,null,10]);
 const out=await read();assert.equal(out.kind,'metadata',JSON.stringify(out));assert.equal(out.items.length,1);assert.equal(out.items[0].id,d.dispatchId);assert.equal(out.allUserDataCompleted,false);assert.equal(out.items[0].selected,undefined);
 for(const args of [[uuid(),lease,1],[req,uuid(),1],[req,lease,2]])assert.equal((await read(...args)).kind,'unavailable');
 await db(`update identity_private.mobile_accounts set epoch=2 where owner_id='${f.actor.subject}';`);assert.equal((await read()).kind,'unavailable');
});

run('duration delta below 120 seconds or 20 percent remains unchanged',async()=>{
 const f=await fixture(),d=await f.begin();await f.call('request',{dispatchId:d.dispatchId,requestIndex:1,endpointKind:'walking'});const first=await f.complete(d.dispatchId,1000);
 await db(`update traffic_private.scopes_v1 set last_begin_at=clock_timestamp()-interval '61 seconds' where trip_id='${f.trip}';`);
 const next=await f.begin();await f.call('request',{dispatchId:next.dispatchId,requestIndex:1,endpointKind:'walking'});const changed=await f.complete(next.dispatchId,1120,first.receipt.receiptId);
 assert.equal(changed.receipt.changeKind,'unchanged');assert.equal(changed.receipt.durationDeltaSeconds,120);
 await db(`update traffic_private.scopes_v1 set last_begin_at=clock_timestamp()-interval '61 seconds' where trip_id='${f.trip}';`);
 const meaningful=await f.begin();await f.call('request',{dispatchId:meaningful.dispatchId,requestIndex:1,endpointKind:'walking'});const result=await f.complete(meaningful.dispatchId,1200,first.receipt.receiptId);assert.equal(result.receipt.changeKind,'route_estimate_changed');
});

// #220 protocol joint probe: actual fixed 030000 + 040000 source in an isolated
// source overlay. No unmerged #646, no fabricated empty reservation reader.
run('220 protocol joint source fixture prewrite/raw proof works, missing actual order authority rejects original confirmation',async()=>{
 const f=await fixture(),support=await installSupport(f);
 await db(`insert into public.trip_items(trip_id,owner_id,day_id,item_id,title) values('${f.trip}','${f.actor.subject}','Day_A','Optional_B','User optional');`);
 const firstDispatch=await f.begin();await f.call('request',{dispatchId:firstDispatch.dispatchId,requestIndex:1,endpointKind:'walking'});const first=await f.complete(firstDispatch.dispatchId);
 await db(`update traffic_private.scopes_v1 set last_begin_at=clock_timestamp()-interval '61 seconds' where trip_id='${f.trip}';`);
 const next=await f.begin();await f.call('request',{dispatchId:next.dispatchId,requestIndex:1,endpointKind:'walking'});const changed=await f.complete(next.dispatchId,450,first.receipt.receiptId);assert.equal(changed.receipt.changeKind,'route_estimate_changed');
 const ctxInput={operationId:uuid(),expectedHeadVersion:2,dayId:'Day_A',selectedItemIds:['Optional_B'],fixedItemIds:['Item_A'],reservationBindings:[],receiptId:changed.receipt.receiptId,scope:f.scope,locale:'en'};
 const sourceBasis=JSON.parse(await db(`${actorSql(f.actor)}select coalesce(recovery_private.transport_basis_v1('${changed.receipt.receiptId}',${lit(f.scope)}::jsonb),'null'::jsonb);`));assert.ok(sourceBasis);assert.ok(sourceBasis.proofBasis.receiptFingerprint);assert.ok(sourceBasis.proofBasis.dispatchFingerprint);
 const contextReply=await rpc('postgres','public.prepare_transport_recovery_v1',[f.trip,ctxInput],f.actor);assert.deepEqual(contextReply,{kind:'pending',reason:'RESERVATION_READER_UNAVAILABLE'});
 assert.equal(await db(`select count(*) from recovery_private.contexts_v1 where owner_id='${f.actor.subject}';`),'0');
 // Deliberate admin-only protocol seed; never claim public preparation qualified.
 const context=uuid(),operation=uuid(),patch={expectedVersion:2,operations:[{kind:'delete_item',dayId:'Day_A',itemId:'Optional_B'}]};
 const p=JSON.parse(await db(`${actorSql(f.actor)}select to_jsonb(x) from public.create_trip_proposal_patch('${f.trip}',${lit(patch)}::jsonb)x;`));
 const expiry=await db(`${actorSql(f.actor)}update public.trip_proposals set local_recovery=true,expires_at=date_trunc('milliseconds',clock_timestamp()+interval '30 seconds') where id='${p.proposal_id}' returning recovery_private.ms_v1(expires_at);`);
 const read=JSON.parse(await db(`${actorSql(f.actor)}select to_jsonb(x) from public.read_trip_proposal_v2('${p.proposal_id}')x;`));
 const input={operationId:operation,contextId:context,contextDigest:'a'.repeat(64),candidateId:'omit_one'},receipt={kind:'local_recovery_proposal/1',operationId:operation,contextId:context,contextDigest:'a'.repeat(64),candidateId:'omit_one',proposalId:p.proposal_id,proposalRevision:p.revision,baseVersion:2,expiresAt:expiry,reused:false};
 await db(`${actorSql(f.actor)}insert into recovery_private.contexts_v1(id,owner_id,trip_id,operation_id,input,base_version,snapshot,profile_basis,reservation_basis,traffic_basis,digest,expires_at) select '${context}','${f.actor.subject}','${f.trip}','${ctxInput.operationId}',${lit(ctxInput)}::jsonb,2,public.trip_content_snapshot(t.id,t.title),recovery_private.profile_v1('${f.actor.subject}'),'[]',${lit(sourceBasis)}::jsonb,'${'a'.repeat(64)}',( ${lit(sourceBasis.expiresAt)} )::timestamptz from public.trips t where id='${f.trip}';insert into recovery_private.operations_v1 values('${f.actor.subject}','${operation}','${f.trip}','${context}',${lit(input)}::jsonb,${lit(receipt)}::jsonb,'${p.proposal_id}');insert into recovery_private.lineage_v1 values('${p.proposal_id}','${f.actor.subject}','${f.trip}','${context}','${operation}',${lit(patch)}::jsonb,${lit(read.digest)});`);
 const pre=`select recovery_private.prewrite_transport_v1('${p.proposal_id}',${lit(read.digest)});`;
 const summary=JSON.parse(await db(`begin;${actorSql(f.actor)}${pre}select jsonb_build_object('root',root_proposal_id,'revision',proposal_revision,'base',base_version,'actor',actor_basis,'context',context_id,'current',recovery_private.transport_proof_current_v1(traffic_basis)) from recovery_private.transport_proofs_v1 where transaction_id=pg_current_xact_id() and proposal_id='${p.proposal_id}';rollback;`));
 assert.equal(summary.root,p.proposal_id);assert.equal(summary.revision,p.revision);assert.equal(summary.base,2);assert.equal(summary.actor.sessionId,f.actor.sessionId);assert.equal(summary.context,context);assert.equal(summary.current,true);
 assert.equal(await db(`begin;${actorSql(f.actor)}${pre}update public.trips set head_version=3 where id='${f.trip}';delete from public.trip_items where trip_id='${f.trip}' and item_id='Optional_B';select recovery_private.transport_proof_current_v1(traffic_basis) from recovery_private.transport_proofs_v1 where transaction_id=pg_current_xact_id();rollback;`),'t');
 assert.equal(await db(`begin;${actorSql(f.actor)}${pre}update traffic_private.receipts_v1 set selected=jsonb_set(selected,'{durationSeconds}','999') where id='${changed.receipt.receiptId}';select recovery_private.transport_proof_current_v1(traffic_basis) from recovery_private.transport_proofs_v1 where transaction_id=pg_current_xact_id();rollback;`),'f');
 const original=await db(`select jsonb_build_array(head_version,public.trip_content_snapshot(id,title),(select count(*) from public.trip_events where trip_id=t.id),(select count(*) from public.trip_idempotency where owner_id=t.owner_id)) from public.trips t where id='${f.trip}';`);
 const noOrders=await sql(container,`begin;${actorSql(f.actor)}select * from public.confirm_and_apply_trip_proposal('${p.proposal_id}','protocol-key',${lit(read.digest)});commit;`);assert.notEqual(noOrders.code,0);assert.match(noOrders.stderr,/RECOVERY_CONFIRM_GUARD/);
 assert.equal(await db(`select jsonb_build_array(head_version,public.trip_content_snapshot(id,title),(select count(*) from public.trip_events where trip_id=t.id),(select count(*) from public.trip_idempotency where owner_id=t.owner_id)) from public.trips t where id='${f.trip}';`),original);
 assert.equal(await db('select count(*) from recovery_private.transport_proofs_v1;'),'0');
});
