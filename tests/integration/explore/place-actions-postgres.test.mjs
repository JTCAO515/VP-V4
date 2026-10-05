// Disposable network-none PG. Fixture role/policy grants never prove real rights/origin.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_PLACE_ACTION_DB_TEST==='1';
const container='vp365-actions-'+uuid().slice(0,8);let created=false;
const migration='20261005010000_vpj20_place_actions.sql';
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const actorSql=a=>`set request.jwt.claim.sub='${a.subject}';set request.jwt.claims='${JSON.stringify({session_id:a.sessionId,is_anonymous:false,role:'authenticated'})}';set request.jwt.claim.role='authenticated';`;
const rpc=async(role,name,args,a=null)=>JSON.parse(await db(`begin;${a?actorSql(a):''}set role ${role};select ${name}(${args.map(lit).join(',')});commit;`));
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 let ready=false;for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
  const content=readFileSync('supabase/migrations/'+f,'utf8');
  if(f===migration){await db('begin;'+content+'rollback;');assert.equal(await db("select to_regnamespace('place_actions_private') is null;"),'t');}
  await db('begin;'+content+'commit;');
 }
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
run('full migration replay, rollback and default ACL deny every new authority',async()=>{
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='place_actions_private' or n.nspname='public' and p.proname in('read_place_action_context_v1','execute_place_action_v1')) and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
  assert.notEqual((await sql(container,`set role ${role};select * from place_actions_private.operations;`)).code,0);
 }
 assert.equal(await db("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='place_actions_private' or n.nspname='public' and p.proname in('read_place_action_context_v1','execute_place_action_v1')) and (p.proconfig is null or not 'search_path="+'""'+"'=any(p.proconfig));"),'0');
 // This grant is confined to the disposable synthetic test instance.
 await db('grant execute on function public.read_place_action_context_v1(uuid,jsonb),public.execute_place_action_v1(uuid,jsonb) to authenticated;');
});
async function fixture({mobile=false,reference=false}={}){
 const actor={subject:uuid(),sessionId:uuid()},trip=uuid(),poi=uuid(),providerPoiId=uuid(),ref=uuid();
 await db(`insert into auth.users(id) values('${actor.subject}');insert into auth.sessions(id,user_id) values('${actor.sessionId}','${actor.subject}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${actor.subject}',${mobile?lit(actor.sessionId):'null'},${mobile?1:0});${mobile?`insert into identity_private.mobile_attempts values('${actor.subject}','${uuid()}','${actor.sessionId}',1);`:''}
 insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values('${poi}','测试地点','Fixture place');
 insert into public.provider_poi_mappings(canonical_poi_id,provider,provider_poi_id,raw_name) values('${poi}','amap','${providerPoiId}','NO PROVIDER BODY');
 insert into public.trips(id,owner_id,title,head_version) values('${trip}','${actor.subject}','Synthetic place actions',1);
 insert into public.trip_days(trip_id,owner_id,day_id,trip_date) values('${trip}','${actor.subject}','Day_A','2026-10-05');
 ${reference?`insert into public.trip_place_references(id,trip_id,owner_id,reference_kind,canonical_poi_id) values('${ref}','${trip}','${actor.subject}','canonical','${poi}');`:''}`);
 const selection={canonicalPoiId:poi,provider:'amap',providerPoiId};
 const context=(version=1,loc='en')=>rpc('authenticated','public.read_place_action_context_v1',[trip,{action:'context',expectedTripVersion:version,selection,locale:loc}],actor);
 const execute=v=>rpc('authenticated','public.execute_place_action_v1',[trip,v],actor);
 const base=await context();assert.equal(base.kind,'place_action_context',JSON.stringify(base));
 const mutation=(action='save',extra={})=>({action,operationId:uuid(),expectedTripVersion:1,selection,expectedMappingDigest:base.mappingDigest,...(action==='save'?{expectedSaveRevision:0}:{}),...extra});
 return {actor,trip,poi,ref,selection,context,execute,base,mutation};
}
async function rejected(f,v,error,actor=f.actor,trip=f.trip){
 const r=await sql(container,`begin;${actorSql(actor)}set role authenticated;select public.execute_place_action_v1(${lit(trip)},${lit(v)});commit;`);
 assert.notEqual(r.code,0,JSON.stringify(v));assert.match(r.stderr,new RegExp(error));
}
run('context digest stable without clocks, no provider body, exact selection and status',async()=>{
 const f=await fixture(),b=await f.context();assert.equal(b.contextDigest,f.base.contextDigest);assert.equal(b.referenceId,null);assert.equal(b.saved,null);
 assert.equal(b.sourceCandidatesStatus,'unavailable');assert.deepEqual(b.sourceCandidates,[]);assert.ok(Date.parse(b.expiresAt)-Date.parse(b.evaluatedAt)<=30000);assert.equal(b.displayTitle,'Fixture place');assert.equal(JSON.stringify(b).includes('NO PROVIDER BODY'),false);
 await db('update knowledge_review_private.publication_settings set enabled=true;');assert.equal((await f.context()).sourceCandidatesStatus,'complete');
 assert.equal((await f.context(0)).reason,'STALE_TRIP_VERSION');
 await db(`update public.provider_poi_mappings set matched_at=clock_timestamp() where canonical_poi_id='${f.poi}';`);assert.notEqual((await f.context()).mappingDigest,b.mappingDigest);
 await rejected(f,f.mutation(),'MAPPING_CHANGED');
 await db(`delete from public.provider_poi_mappings where canonical_poi_id='${f.poi}';`);assert.equal((await f.context()).reason,'MAPPING_CHANGED');
});
run('CAS saves canonical oldest reference, unsave retains all references after mapping withdrawal',async()=>{
 const f=await fixture({reference:true}),request=f.mutation();const saved=await f.execute(request);assert.equal(saved.referenceId,f.ref);assert.equal(saved.savedRevision,1);assert.equal(saved.savedStatus,'saved');
 assert.equal((await f.context()).saved.revision,1);assert.equal(await db(`select count(*) from public.trip_place_references where trip_id='${f.trip}';`),'1');
 await rejected(f,f.mutation(),'CAS_CONFLICT');
 await db(`delete from public.provider_poi_mappings where canonical_poi_id='${f.poi}';`);
 const unsave=f.mutation('unsave',{referenceId:saved.referenceId,expectedSaveRevision:1});const out=await f.execute(unsave);assert.equal(out.savedStatus,'unsaved');assert.equal(out.savedRevision,2);
 assert.equal(await db(`select count(*) from public.trip_place_references where id='${f.ref}';`),'1');
 assert.deepEqual(await f.execute({action:'receipt',request}),saved);assert.deepEqual(await f.execute(request),saved);
 await rejected(f,unsave.action==='unsave'?{...unsave,operationId:uuid()}:unsave,'CAS_CONFLICT');
});
run('lost ACK, exact full request replay survives head/archive/map drift; mismatch never reexecutes',async()=>{
 const f=await fixture(),v=f.mutation(),first=await f.execute(v);assert.equal(first.historicalOnly,true);assert.equal(first.currentEligibilityRequiresRead,true);assert.match(first.requestDigest,/^[a-f0-9]{64}$/);
 await db(`update public.trips set head_version=2 where id='${f.trip}';insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${f.trip}','${f.actor.subject}',2,'${uuid()}');`);
 assert.deepEqual(await f.execute(v),first);assert.deepEqual(await f.execute({action:'receipt',request:v}),first);
 await rejected(f,{...v,expectedTripVersion:2},'IDEMPOTENCY_KEY_REUSE');await rejected(f,{...v,action:'save',selection:{...v.selection,providerPoiId:'different'}},'IDEMPOTENCY_KEY_REUSE');
 await rejected(f,{...v,operationId:uuid()},'PLACE_ACTION_UNAVAILABLE');
 const absent=await f.execute({action:'receipt',request:{...v,operationId:uuid()}});assert.equal(absent.kind,'receipt_absent');
 const other=await fixture();await rejected(f,{action:'receipt',request:v},'FORBIDDEN',other.actor);
});
run('ordinary session, native epoch and actual owner prevent forged/crossowner mutation',async()=>{
 const f=await fixture(),other=await fixture();await rejected(f,f.mutation(),'FORBIDDEN',other.actor);
 const bad={...f.actor,sessionId:uuid()};await rejected(f,f.mutation(),'UNAUTHENTICATED',bad);
 const n=await fixture({mobile:true}),v=n.mutation(),out=await n.execute(v);assert.equal(out.savedStatus,'saved');
 await db(`update identity_private.mobile_accounts set epoch=2 where owner_id='${n.actor.subject}';`);await rejected(n,{action:'receipt',request:v},'SESSION_REPLACED');
 const r=await sql(container,`begin;${actorSql(f.actor)}set request.jwt.claim.role='service_role';set role authenticated;select public.execute_place_action_v1(${lit(f.trip)},${lit(f.mutation())});commit;`);assert.match(r.stderr,/UNAUTHENTICATED/);
});
run('strict closed input mirrors int32, UUID, Unicode, calendar, offset and 24h wire',async()=>{
 const f=await fixture();for(const v of [{...f.mutation(),extra:true},{...f.mutation(),expectedTripVersion:1.5},{...f.mutation(),expectedSaveRevision:2147483648},{...f.mutation(),selection:{...f.selection,providerPoiId:' x '}},{...f.mutation(),selection:{...f.selection,providerPoiId:'😀'.repeat(65)}},{...f.mutation(),selection:{...f.selection,canonicalPoiId:f.poi.toUpperCase()}}])await rejected(f,v,'INVALID_INPUT');
 const add=f.mutation('add',{dayId:'Day_A',itemId:'New_A',startsAt:'2026-10-05T10:00:00+08:00',endsAt:'2026-10-05T11:00:00+08:00',locale:'en'});
 for(const [startsAt,endsAt] of [['2026-02-30T10:00:00Z',add.endsAt],['2026-10-05T24:00:00Z',add.endsAt],['2026-10-05T10:00:00+14:01',add.endsAt],['2026-10-05T10:00:60Z',add.endsAt],[add.startsAt,'2026-10-06T11:00:01+08:00']])await rejected(f,{...add,startsAt,endsAt},'INVALID_INPUT');
 // JSONB integral numeric equality, preserving Unicode codepoints without normalization.
 assert.equal(await db(`select place_actions_private.valid_v1(${lit({...f.mutation(),selection:{...f.selection,providerPoiId:'é'}})}::jsonb);`),'t');
 assert.equal(await db(`select place_actions_private.revision_v1('1.0');`),'t');
});
run('actual original proposal creation is atomic with receipt, does not save or write Trip',async()=>{
 const f=await fixture(),v=f.mutation('add',{dayId:'Day_A',itemId:'New_A',startsAt:'2026-10-05T10:00:00+08:00',endsAt:'2026-10-05T11:00:00+08:00',locale:'en'});
 const out=await f.execute(v);assert.ok(out.proposal.proposalId);assert.equal(out.proposal.baseTripVersion,1);assert.equal(out.savedRevision,null);assert.equal(out.savedStatus,null);
 assert.equal(await db(`select head_version from public.trips where id='${f.trip}';`),'1');assert.equal(await db(`select count(*) from public.trip_items where trip_id='${f.trip}';`),'0');assert.equal(await db(`select count(*) from place_actions_private.saved_places where trip_id='${f.trip}';`),'0');
 const patch=JSON.parse(await db(`select patch from public.trip_proposals where id='${out.proposal.proposalId}';`));assert.equal(patch.operations[0].title,'Fixture place');assert.equal(patch.operations.length,1);assert.equal(patch.operations[0].kind,'upsert_item');
 assert.deepEqual(await f.execute({action:'receipt',request:v}),out);await rejected(f,{...v,operationId:uuid(),itemId:'New_B'},'PROPOSAL_NOT_CONFIRMABLE');
 assert.equal(await db(`select count(*) from place_actions_private.operations where trip_id='${f.trip}';`),'1');
 const g=await fixture();await rejected(g,{...v,operationId:uuid(),selection:g.selection,expectedMappingDigest:g.base.mappingDigest,dayId:'No_Day'},'INVALID_INPUT');assert.equal(await db(`select count(*) from public.trip_place_references where trip_id='${g.trip}';`),'0');
});
run('actual same-key and CAS concurrency create only one effect',async()=>{
 const f=await fixture(),v=f.mutation();const [a,b]=await Promise.all([f.execute(v),f.execute(v)]);assert.deepEqual(a,b);assert.equal(a.savedRevision,1);
 assert.equal(await db(`select count(*) from place_actions_private.operations where trip_id='${f.trip}';`),'1');
 const attempts=await Promise.all([sql(container,`begin;${actorSql(f.actor)}set role authenticated;select public.execute_place_action_v1(${lit(f.trip)},${lit(f.mutation('save',{expectedSaveRevision:1}))});commit;`),sql(container,`begin;${actorSql(f.actor)}set role authenticated;select public.execute_place_action_v1(${lit(f.trip)},${lit(f.mutation('save',{expectedSaveRevision:1}))});commit;`)]);assert.equal(attempts.filter(x=>x.code===0).length,1);assert.match(attempts.find(x=>x.code!==0).stderr,/CAS_CONFLICT/);
});
run('Trip and account delete cascades remove both private metadata domains',async()=>{
 const f=await fixture();await f.execute(f.mutation());await db(`delete from public.trips where id='${f.trip}';`);assert.equal(await db(`select count(*) from place_actions_private.operations where trip_id='${f.trip}';`),'0');assert.equal(await db(`select count(*) from place_actions_private.saved_places where trip_id='${f.trip}';`),'0');
 const g=await fixture();await g.execute(g.mutation());await db(`delete from auth.users where id='${g.actor.subject}';`);assert.equal(await db(`select count(*) from place_actions_private.operations where owner_id='${g.actor.subject}';`),'0');assert.equal(await db(`select count(*) from place_actions_private.saved_places where owner_id='${g.actor.subject}';`),'0');
});
async function publishMapped(f){
 const [author,reviewer,mapper]=Array.from({length:3},()=>({subject:uuid(),sessionId:uuid()}));
 for(const a of [author,reviewer,mapper])await db(`insert into auth.users(id) values('${a.subject}');insert into auth.sessions(id,user_id) values('${a.sessionId}','${a.subject}');insert into identity_private.mobile_accounts(owner_id) values('${a.subject}');insert into knowledge_review_private.members(actor_id,active) values('${a.subject}',true);`);
 await db('update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true;');
 const call=(a,name,args)=>rpc('postgres','public.'+name,args,a);
 const candidate=uuid(),statement={schemaVersion:'knowledge-statement/2',assertion:{subjectId:'test_gallery',predicate:'located_at',objectId:'place_address',conditions:[],exclusions:[]},scope:{cities:['shanghai'],scene:'attraction',audience:'international_independent_traveler'},place:{names:{en:'Fixture place',zh:'测试地点'}},value:{lines:['Synthetic address'],countryCode:'CN'},expressions:{en:{text:'Synthetic address',conditions:[],exclusions:[]},zh:{text:'合成地址',conditions:[],exclusions:[]}},sources:[{sourceKey:'place-'+uuid(),revisionLabel:'one',publisher:'Fixture source',uri:'urn:vpj15:synthetic:place',locator:'Fixture only',snippet:'NO SOURCE BODY',usageDeclaration:'private synthetic fixture'}]};
 await call(author,'ops_review_workspace',[{action:'submit_statement',operationId:uuid(),candidateId:candidate,title:'Synthetic address',statement}]);
 await call(reviewer,'ops_review_workspace',[{action:'review',operationId:uuid(),candidateId:candidate,expectedVersion:1,decision:'reviewed',note:'Independent fixture review'}]);
 await call(reviewer,'ops_review_workspace',[{action:'publish_statement',operationId:uuid(),candidateId:candidate,expectedVersion:2,useBasis:'original_factual_summary',useNote:'synthetic only',expiresAt:new Date(Date.now()+86400000).toISOString()}]);
 const st=JSON.parse(await db(`select jsonb_build_object('id',statement_id,'revision',revision,'hash',trip_support_private.hash(payload)) from knowledge_review_private.statements where candidate_id='${candidate}';`));
 const refs=JSON.parse(await db(`select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id) from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id='${candidate}';`));
 const digest=await db(`select trip_support_private.hash(${lit(refs)}::jsonb);`);
 const mapping=await call(mapper,'submit_trip_support_entity_mapping_v1',[{operationId:uuid(),canonicalPoiId:f.poi,statementId:st.id,expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:digest,basisMetadata:{city:'shanghai',scene:'attraction',locale:'en',sourceRefs:refs}}]);assert.equal(mapping.kind,'mapping_candidate',JSON.stringify(mapping));
 const mapped=await call(reviewer,'review_trip_support_entity_mapping_v1',[mapping.mappingId,mapping.version,mapping.digest,'approve']);assert.equal(mapped.kind,'mapping_reviewed');
 return {sourceId:refs[0].sourceRevisionId,author,reviewer,candidate,mappingId:mapping.mappingId};
}
run('real reviewed publication/entity mapping produces qualified locale claim and source withdrawal removes it',async()=>{
 const f=await fixture(),p=await publishMapped(f);const ctx=await f.context();assert.equal(ctx.sourceCandidatesStatus,'complete');assert.equal(ctx.sourceCandidates.length,1);assert.equal(ctx.sourceCandidates[0].mappingId,p.mappingId);assert.equal(ctx.sourceCandidates[0].claim.claimType,'address');assert.equal(ctx.sourceCandidates[0].scope,'address_reference');assert.equal(JSON.stringify(ctx).includes('NO SOURCE BODY'),false);
 assert.deepEqual((await f.context(1,'zh')).sourceCandidates,[]);
 // The new context agrees with the existing exact-reference reader on current evidence.
 const saved=await f.execute(f.mutation());const old=await rpc('postgres','public.read_trip_item_support_candidates_v1',[f.trip,1,saved.referenceId,'shanghai','attraction','en',null,24],f.actor);assert.equal(old.kind,'candidates');assert.deepEqual(old.entries[0].claim,ctx.sourceCandidates[0].claim);
 await db(`begin;${actorSql(p.author)}select public.ops_source_revision_withdraw_v1(${lit({operationId:uuid(),sourceRevisionId:p.sourceId,reason:'Fixture withdrawal'})}::jsonb);commit;`);
 const current=await f.context();assert.deepEqual(current.sourceCandidates,[]);assert.notEqual(current.contextDigest,ctx.contextDigest);assert.equal(current.sourceCandidatesStatus,'complete');
});
run('current fact expiry bounds context and live reviewer loss invalidates source eligibility',async()=>{
 const f=await fixture(),p=await publishMapped(f);
 await db(`update knowledge_review_private.publications set expires_at=clock_timestamp()+interval '15 seconds' where candidate_id='${p.candidate}';`);
 const ctx=await f.context();assert.equal(ctx.sourceCandidates.length,1);assert.ok(Date.parse(ctx.expiresAt)-Date.parse(ctx.evaluatedAt)<15000);
 await db(`update knowledge_review_private.members set active=false where actor_id='${p.reviewer.subject}';`);assert.deepEqual((await f.context()).sourceCandidates,[]);
});
run('exact existing export job lease, generation, cursor source revision; unenrolled core scope stays partial',async()=>{
 const f=await fixture({mobile:true});await f.execute(f.mutation());
 const req=uuid(),lease=uuid(),pid=uuid();
 await db(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) values('${pid}',1,true,'local','synthetic_unactivated',1000,60000,30000,1,10,65536,clock_timestamp()+interval '1 hour');
 insert into public.privacy_requests(id,owner_id,action,scope_version,status,execution_state) values('${req}','${f.actor.subject}','export','all-user-data-v1','requested','not_started');
 insert into export_private.core_jobs_v1(request_id,owner_id,session_id,session_epoch,policy_id,policy_snapshot,state,lease_id,lease_expires_at,expires_at) select '${req}','${f.actor.subject}','${f.actor.sessionId}',1,id,to_jsonb(p),'running','${lease}',clock_timestamp()+interval '1 minute',clock_timestamp()+interval '1 hour' from export_private.core_policies_v1 p where id='${pid}';`);
 const read=(r=req,l=lease,g=1,c=null)=>rpc('postgres','place_actions_private.export_metadata_v1',[r,l,g,c,1]);
 const first=await read();assert.equal(first.kind,'metadata',JSON.stringify(first));assert.equal(first.schemaVersion,'place-actions-metadata/1');assert.equal(first.allUserDataCompleted,false);assert.equal(first.hasMore,true);assert.equal(first.items[0].domain,'operation');assert.equal(JSON.stringify(first).includes('NO PROVIDER BODY'),false);
 const second=await read(req,lease,1,first.nextCursor);assert.equal(second.sourceRevision,first.sourceRevision);assert.equal(second.items[0].domain,'saved');assert.equal(second.hasMore,false);
 for(const args of [[uuid(),lease,1],[req,uuid(),1],[req,lease,2]])assert.equal((await read(...args)).kind,'unavailable');
 const saved=(await f.context()).saved;await f.execute(f.mutation('unsave',{referenceId:saved.referenceId,expectedSaveRevision:1}));assert.equal((await read(req,lease,1,first.nextCursor)).kind,'stale');
 assert.equal(await db(`select scope from export_private.core_jobs_v1 where request_id='${req}';`),'core-export-d2/1');assert.equal(await db(`select modules from export_private.core_jobs_v1 where request_id='${req}';`),'[]');
 await db(`update identity_private.mobile_accounts set epoch=2 where owner_id='${f.actor.subject}';`);assert.equal((await read()).kind,'unavailable');
});
run('existing timed Trip items normalize into the strict shared snapshot wire without source edits',async()=>{
 const f=await fixture();await db(`insert into public.trip_items(trip_id,owner_id,day_id,item_id,title,starts_at,ends_at) values('${f.trip}','${f.actor.subject}','Day_A','Existing','Fixture existing','2026-10-05T10:00:00+08:00','2026-10-05T11:00:00+08:00');`);
 const c=await f.context(),item=c.snapshot.days[0].items[0];assert.equal(item.startsAt,'2026-10-05T02:00:00.000Z');assert.equal(item.endsAt,'2026-10-05T03:00:00.000Z');
 assert.equal(c.snapshot.version,1);assert.equal(await db(`select head_version from public.trips where id='${f.trip}';`),'1');
});
run('abandon fences late execute, reads exact cancelled history; successful operation is never undone',async()=>{
 const f=await fixture(),v=f.mutation(),cancelled=await f.execute({action:'abandon',request:v});assert.equal(cancelled.kind,'place_action_cancelled');assert.equal(cancelled.tripVersion,v.expectedTripVersion);assert.equal(cancelled.mappingDigest,v.expectedMappingDigest);assert.equal(Object.keys(cancelled).length,10);assert.equal(cancelled.operationId,v.operationId);assert.equal(cancelled.action,v.action);assert.equal(cancelled.historicalOnly,true);
 assert.deepEqual(await f.execute(v),cancelled);assert.deepEqual(await f.execute({action:'receipt',request:v}),cancelled);assert.deepEqual(await f.execute({action:'abandon',request:v}),cancelled);assert.equal(await db(`select count(*) from place_actions_private.saved_places where trip_id='${f.trip}';`),'0');
 await rejected(f,{action:'abandon',request:{...v,expectedSaveRevision:1}},'IDEMPOTENCY_KEY_REUSE');const other=await fixture();await rejected(f,{action:'abandon',request:v},'FORBIDDEN',other.actor);
 const g=await fixture(),savedRequest=g.mutation(),saved=await g.execute(savedRequest);assert.deepEqual(await g.execute({action:'abandon',request:savedRequest}),saved);assert.equal((await g.context()).saved.status,'saved');
 await db(`insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${f.trip}','${f.actor.subject}',1,'${uuid()}');`);const archivedRequest=f.mutation();assert.equal((await f.execute({action:'abandon',request:archivedRequest})).kind,'place_action_cancelled');
});
run('actual execute vs abandon race has one durable terminal and at most one effect',async()=>{
 for(let i=0;i<3;i++){
  const f=await fixture(),v=f.mutation();const [execute,abandon]=await Promise.all(i%2?[f.execute(v),f.execute({action:'abandon',request:v})]:[f.execute({action:'abandon',request:v}),f.execute(v)]);assert.deepEqual(execute,abandon);
  const effects=await db(`select count(*) from place_actions_private.saved_places where trip_id='${f.trip}';`);assert.equal(effects,execute.kind==='place_action_receipt'?'1':'0');
  assert.equal(await db(`select count(*) from place_actions_private.operations where trip_id='${f.trip}';`),'1');assert.deepEqual(await f.execute({action:'receipt',request:v}),execute);
 }
});
run('saved reload returns original persisted identity after withdrawal and supports exact unsave',async()=>{
 await db('grant execute on function public.read_place_action_context_v1(uuid,jsonb),public.execute_place_action_v1(uuid,jsonb) to authenticated;');
 const f=await fixture(),v=f.mutation(),receipt=await f.execute(v),savedInput={action:'saved',expectedTripVersion:1,locale:'en',limit:100,cursor:null};
 const read=(input=savedInput,a=f.actor)=>rpc('authenticated','public.read_place_action_context_v1',[f.trip,input],a);
 const first=await read();assert.equal(first.kind,'saved_place_actions');assert.equal(first.hasMore,false);assert.equal(first.nextCursor,null);assert.equal(Object.keys(first).length,7);assert.equal(first.items[0].mappingStatus,'current');assert.equal(first.items[0].displayTitle,'Fixture place');assert.deepEqual(first.items[0].selection,v.selection);
 await db(`update public.provider_poi_mappings set matched_at=clock_timestamp() where canonical_poi_id='${f.poi}';`);const staleLabel=await read();assert.equal(staleLabel.items[0].mappingStatus,'changed');assert.equal(staleLabel.items[0].displayTitle,null);
 await db(`update public.provider_poi_mappings set provider_poi_id='replacement' where canonical_poi_id='${f.poi}';`);
 const changed=await read();assert.equal(changed.items[0].mappingStatus,'unavailable');assert.equal(changed.items[0].displayTitle,null);assert.deepEqual(changed.items[0].selection,v.selection);assert.notEqual(changed.contextDigest,first.contextDigest);
 await db(`delete from public.provider_poi_mappings where canonical_poi_id='${f.poi}';`);
 const withdrawn=await read();assert.equal(withdrawn.items.length,1);assert.equal(withdrawn.items[0].referenceId,receipt.referenceId);assert.equal(withdrawn.items[0].mappingDigest,v.expectedMappingDigest);assert.equal(withdrawn.items[0].displayTitle,null);
 const row=withdrawn.items[0];const unsave={action:'unsave',operationId:uuid(),expectedTripVersion:withdrawn.tripVersion,selection:row.selection,expectedMappingDigest:row.mappingDigest,referenceId:row.referenceId,expectedSaveRevision:row.revision};
 for(const selection of [{...row.selection,provider:'tencent'},{...row.selection,providerPoiId:'forged-provider-id'}])await rejected(f,{...unsave,operationId:uuid(),selection},'CAS_CONFLICT');
 assert.equal(await db(`select revision from place_actions_private.saved_places where trip_id='${f.trip}';`),'1');assert.equal(await db(`select count(*) from place_actions_private.operations where trip_id='${f.trip}';`),'1');
 const forgot=await f.execute(unsave);assert.equal(forgot.savedStatus,'unsaved');assert.deepEqual(forgot.selection,row.selection);assert.deepEqual((await read()).items,[]);
 const other=await fixture();const bad=await sql(container,`begin;${actorSql(other.actor)}set role authenticated;select public.read_place_action_context_v1(${lit(f.trip)},${lit(savedInput)});commit;`);assert.match(bad.stderr,/FORBIDDEN/);
 const denied=await sql(container,`begin;${actorSql({...f.actor,sessionId:uuid()})}set role authenticated;select public.read_place_action_context_v1(${lit(f.trip)},${lit(savedInput)});commit;`);assert.match(denied.stderr,/UNAUTHENTICATED/);
});
run('saved pages expose completeness, exact cursor and current mapping drift; resave stores latest original identity',async()=>{
 const f=await fixture(),v=f.mutation();const one=await f.execute(v);const poi2=uuid(),provider2=uuid();await db(`insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values('${poi2}','第二地点','Second fixture');insert into public.provider_poi_mappings(canonical_poi_id,provider,provider_poi_id,raw_name) values('${poi2}','amap','${provider2}','NO PROVIDER BODY');`);
 const selection={canonicalPoiId:poi2,provider:'amap',providerPoiId:provider2};const context=await rpc('authenticated','public.read_place_action_context_v1',[f.trip,{action:'context',expectedTripVersion:1,selection,locale:'en'}],f.actor);await f.execute({...f.mutation(),selection,expectedMappingDigest:context.mappingDigest});
 const input={action:'saved',expectedTripVersion:1,locale:'en',limit:1,cursor:null},read=c=>rpc('authenticated','public.read_place_action_context_v1',[f.trip,{...input,cursor:c??null}],f.actor);
 const first=await read();assert.equal(first.items.length,1);assert.equal(first.hasMore,true);assert.equal(first.nextCursor.afterCanonicalPoiId,first.items[0].selection.canonicalPoiId);
 const second=await read(first.nextCursor);assert.equal(second.hasMore,false);assert.equal(second.nextCursor,null);assert.equal(second.contextDigest,first.contextDigest);assert.ok(second.items[0].selection.canonicalPoiId>first.items[0].selection.canonicalPoiId);
 await db(`update public.provider_poi_mappings set matched_at=clock_timestamp() where canonical_poi_id='${f.poi}';`);assert.equal((await read(first.nextCursor)).reason,'MAPPING_CHANGED');
 const changed=await read();assert.equal(changed.items.find(x=>x.selection.canonicalPoiId===f.poi)?.mappingStatus??(await read(changed.nextCursor)).items[0].mappingStatus,'changed');
 // Re-save intentionally adopts a new explicit provider ID, never guessed by the list reader.
 await db(`update public.provider_poi_mappings set provider_poi_id='new-explicit-id' where canonical_poi_id='${f.poi}';`);
 const newSelection={...f.selection,providerPoiId:'new-explicit-id'},newContext=await rpc('authenticated','public.read_place_action_context_v1',[f.trip,{action:'context',expectedTripVersion:1,selection:newSelection,locale:'en'}],f.actor);
 const saved=await f.execute({...f.mutation('save',{expectedSaveRevision:one.savedRevision}),selection:newSelection,expectedMappingDigest:newContext.mappingDigest});assert.equal(saved.savedRevision,2);
 const all=await rpc('authenticated','public.read_place_action_context_v1',[f.trip,{...input,limit:100}],f.actor);assert.deepEqual(all.items.find(x=>x.selection.canonicalPoiId===f.poi).selection,newSelection);
});
run('saved metadata export contains original selection and cursor remains bound to new selection writes',async()=>{
 const f=await fixture({mobile:true});const v=f.mutation();await f.execute(v);
 // The private export projection remains denied to every API role, with stored selection only.
 const stored=JSON.parse(await db(`select selection from place_actions_private.saved_places where trip_id='${f.trip}';`));assert.deepEqual(stored,v.selection);
 const req=uuid(),lease=uuid(),pid=uuid();await db('update export_private.core_policies_v1 set enabled=false;');
 await db(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) values('${pid}',1,true,'local','synthetic_unactivated',1000,60000,30000,1,10,65536,clock_timestamp()+interval '1 hour');insert into public.privacy_requests(id,owner_id,action,scope_version,status,execution_state) values('${req}','${f.actor.subject}','export','all-user-data-v1','requested','not_started');insert into export_private.core_jobs_v1(request_id,owner_id,session_id,session_epoch,policy_id,policy_snapshot,state,lease_id,lease_expires_at,expires_at) select '${req}','${f.actor.subject}','${f.actor.sessionId}',1,id,to_jsonb(p),'running','${lease}',clock_timestamp()+interval '1 minute',clock_timestamp()+interval '1 hour' from export_private.core_policies_v1 p where id='${pid}';`);
 const out=await rpc('postgres','place_actions_private.export_metadata_v1',[req,lease,1,null,100]);assert.equal(out.kind,'metadata');assert.equal(out.allUserDataCompleted,false);assert.deepEqual(out.items.find(x=>x.domain==='saved').selection,v.selection);assert.equal(JSON.stringify(out).includes('NO PROVIDER BODY'),false);
});
