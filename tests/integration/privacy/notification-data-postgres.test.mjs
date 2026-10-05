// Network-none disposable PG; synthetic identity claims, no signed Auth/APNs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {decodeNotificationDataPreview,decodeNotificationDataReceipt,decodeNotificationDataList} from '../../../lib/server/privacy/notification-data/protocol.ts';
import {collectNotificationDataExport} from '../../../lib/server/privacy/notification-data/export.ts';
import {completeNotificationDrain,decodeNotificationDataDraining} from '../../../lib/server/privacy/notification-data/drain.ts';
const migration='20261006030000_notification_data_exit.sql',src=readFileSync('supabase/migrations/'+migration,'utf8');
const enabled=process.env.VP_NOTIFICATION_EXIT_DB_TEST==='1';
const tripScope='notification-trip-data/1',deviceScope='notification-device-data/1',progressScope='notification-exit-progress/1';
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const claims=a=>`set request.jwt.claim.sub='${a.owner}';set request.jwt.claim.role='authenticated';set request.jwt.claims='${JSON.stringify({session_id:a.session,is_anonymous:false,role:'authenticated'})}';`;
const svcClaims="set request.jwt.claim.role='service_role';set request.jwt.claims='{\"role\":\"service_role\"}';";
const hash=v=>createHash('sha256').update(v,'utf8').digest('hex');
test('notification exit real PG replay and v2 owner/service contract',{skip:!enabled,timeout:300000},async t=>{
 const focus=process.env.VP_NOTIFICATION_EXIT_DB_FOCUS;assert.ok(focus===undefined||['eligibility-rollback','device-capacity'].includes(focus));
 const selected=focus==='eligibility-rollback'?new Set(['migration rollback restores old definitions, ACL and no exit schema','default ACL/RLS all denied, original settings unactivated, fixture grants only','disabled RPC has zero writes after current authority','begin_fenced retains original TTL/head/archive/session/quiet/recipient eligibility negatives','erasure rollback leaves original source rows, operations and request while no fence survives']):focus==='device-capacity'?new Set(['migration rollback restores old definitions, ACL and no exit schema','default ACL/RLS all denied, original settings unactivated, fixture grants only','disabled RPC has zero writes after current authority','device private token export has direct full columns, cross-Trip outbox and current source CAS','device erase fences operation/outbox parent and old binding, preserving original reminder/watch business rows','device registration operation source rows also count toward the capacity sentinel']):null;
 const caseTest=(name,fn)=>selected&&!selected.has(name)?Promise.resolve():t.test(name,fn);
 if(selected)t.diagnostic('Focused '+focus+' validation. Other cases are not registered, not claimed re-run; reuse the separately recorded full PG evidence for unchanged paths.');
 const container='vpj58-notice-exit-'+uuid().slice(0,8);
 assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);
 const context=JSON.parse((await command('docker',['context','inspect'])).stdout)[0];assert.ok(context.Endpoints.docker.Host.startsWith('unix:///'));
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);
 t.after(async()=>assert.equal((await command('docker',['rm','-f',container])).code,0));
 const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 const deny=async(q,code)=>{const r=await sql(container,q);assert.notEqual(r.code,0,r.stdout);assert.match(r.stderr,new RegExp(code));};
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<migration).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const oldFuncs=()=>db("select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'source',p.prosrc,'acl',p.proacl,'config',p.proconfig,'security',p.prosecdef) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in('pg_catalog','information_schema','notification_exit_private') and p.proname not in('privacy_notification_data_v1','privacy_notification_data_drain_v1');");
 const before=JSON.parse(await oldFuncs());
 await caseTest('migration rollback restores old definitions, ACL and no exit schema',async()=>{
  await db('begin;'+src+'rollback;');assert.equal(await db("select to_regnamespace('notification_exit_private') is null;"),'t');assert.deepEqual(JSON.parse(await oldFuncs()),before);
  await db('begin;'+src+'commit;');const after=JSON.parse(await oldFuncs());assert.equal(after.length,before.length);
  const changed=[];for(let i=0;i<before.length;i++){const {source,...a}=before[i],{source:next,...b}=after[i];assert.deepEqual(b,a);if(source!==next)changed.push(a.signature);}
  assert.deepEqual(changed.toSorted(),['dispatch_travel_notification_v2(uuid,text,jsonb)','poll_travel_notifications_v2(integer)','travel_reminders_v1(uuid,text,jsonb)','travel_reminders_v2(uuid,text,jsonb)'].toSorted());
 });
 assert.equal(await db("select to_regnamespace('notification_exit_private') is not null;"),'t','migration must install before behavioral cases');
 await caseTest('default ACL/RLS all denied, original settings unactivated, fixture grants only',async()=>{
  for(const role of ['anon','authenticated','service_role']){
   assert.equal(await db(`select has_schema_privilege('${role}','notification_exit_private','USAGE');`),'f');
   assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='notification_exit_private' or p.proname in('privacy_notification_data_v1','privacy_notification_data_drain_v1')) and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
   assert.equal(await db(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='notification_exit_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,DELETE'));`),'0');
   await deny(`set role ${role};select public.privacy_notification_data_v1(null,null,null);`,'permission denied');
  }
  assert.equal(await db("select enabled::text||':'||drain_enabled from notification_exit_private.settings;"),'false:false');
  assert.equal(await db('select enabled from notification_private.settings;'),'f');
  await db('grant execute on function public.privacy_notification_data_v1(text,text,bigint),public.travel_reminders_v2(uuid,text,jsonb) to authenticated;grant execute on function public.privacy_notification_data_drain_v1(text,jsonb),public.poll_travel_notifications_v2(integer),public.dispatch_travel_notification_v2(uuid,text,jsonb) to service_role;');
 });
 const user=async(f,action,input={})=>JSON.parse(await db(`begin;${claims(f.a)}set role authenticated;select public.travel_reminders_v2(${lit(f.trip)},${lit(action)},${lit(input)});commit;`));
 const svc=async(name,args)=>JSON.parse(await db(`begin;${svcClaims}set role service_role;select public.${name}(${args.map(lit).join(',')});commit;`));
 const reject=async(f,action,input,code)=>deny(`begin;${claims(f.a)}set role authenticated;select public.travel_reminders_v2(${lit(f.trip)},${lit(action)},${lit(input)});commit;`,code);
async function fixture({device=true}={}){
 const a={owner:uuid(),session:uuid()},trip=uuid(),deviceId=uuid(),token=uuid().replaceAll('-','')+uuid().replaceAll('-','');
 await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${a.owner}','${a.session}',1);insert into identity_private.mobile_attempts values('${a.owner}','${uuid()}','${a.session}',1);
 insert into public.trips(id,owner_id,title,head_version) values('${trip}','${a.owner}','Synthetic journey',1);
 insert into public.trip_days(trip_id,owner_id,day_id,trip_date,time_zone) values('${trip}','${a.owner}','Day_A',current_date+2,'Asia/Shanghai');
 insert into public.trip_version_snapshots(trip_id,owner_id,version,title,content) values('${trip}','${a.owner}',1,'Synthetic journey','{"title":"Synthetic journey","days":[{"id":"Day_A","date":"2026-10-07","timeZone":"Asia/Shanghai","items":[]}]}' ) on conflict(trip_id,version) do update set content=excluded.content;`);
 const f={a,trip,deviceId,token};
 if(device){await db("update notification_private.settings set enabled=true,environment='sandbox',topic='fixture.only';");await user(f,'register_device',{operationId:uuid(),deviceId,token,environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'});}
 f.source=(await user(f,'list')).nextSteps.find(x=>x.source.kind==='current_trip').source;
 f.request=(extra={})=>({operationId:uuid(),id:uuid(),baseVersion:1,purpose:'user_set_travel',source:f.source,reason:'My flight reminder',dueAt:new Date(Date.now()+60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),timeZone:'Asia/Shanghai',quietHours:{startMinute:0,endMinute:0},consent:true,...extra});
 return f;
}
async function scheduled(f,extra={}){const x=f.request(extra);const view=await user(f,'schedule',x);const notification=await db(`select id from notification_private.outbox where reminder_id='${x.id}';`);return {x,view,notification};}
async function due(s){await db(`update notification_private.reminders set due_at=clock_timestamp()-interval '1 second' where id='${s.x.id}';update public.travel_reminders set due_at=clock_timestamp()-interval '1 second' where id='${s.x.id}';`);}

async function supportFixture(){
 const future=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 const actors=Array.from({length:4},()=>({id:uuid(),session:uuid()})),[author,reviewer,mapper,owner]=actors;
 for(const a of actors)await db(`insert into auth.users(id) values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');insert into identity_private.mobile_accounts(owner_id) values('${a.id}');insert into knowledge_review_private.members(actor_id,active) values('${a.id}',true);`);
 await db('update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true;');
 const rpc=async(a,name,p)=>JSON.parse(await db(`begin;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.id}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';${name==='create_trip_proposal_patch'?"select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.":'select public.'}${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+(name==='create_trip_proposal_patch'?') r;commit;':');commit;')));
 const candidate=uuid(),statement={schemaVersion:'knowledge-statement/2',assertion:{subjectId:'test_gallery',predicate:'opens_during',objectId:'opening_hours',conditions:[],exclusions:[]},scope:{cities:['shanghai'],scene:'attraction',audience:'international_independent_traveler'},place:{names:{en:'Test Gallery',zh:'测试展馆'}},value:{startsAt:`${future}T01:00:00Z`,endsAt:`${future}T08:00:00Z`,timeZone:'Asia/Shanghai'},expressions:{en:{text:'Synthetic opening window',conditions:[],exclusions:[]},zh:{text:'合成开放时窗',conditions:[],exclusions:[]}},sources:[{sourceKey:'support-'+uuid(),revisionLabel:'one',publisher:'Fixture source',uri:'urn:vpj15:synthetic:support',locator:'Fixture only',snippet:'NO REAL SUPPLIER',usageDeclaration:'private synthetic fixture'}]};
 await rpc(author,'ops_review_workspace',{p_input:{action:'submit_statement',operationId:uuid(),candidateId:candidate,title:'Synthetic typed source',statement}});
 await rpc(reviewer,'ops_review_workspace',{p_input:{action:'review',operationId:uuid(),candidateId:candidate,expectedVersion:1,decision:'reviewed',note:'Independent fixture review'}});
 await rpc(reviewer,'ops_review_workspace',{p_input:{action:'publish_statement',operationId:uuid(),candidateId:candidate,expectedVersion:2,useBasis:'original_factual_summary',useNote:'synthetic only no deployment',expiresAt:new Date(Date.now()+86400000).toISOString()}});
 const st=JSON.parse(await db(`select jsonb_build_object('id',statement_id,'revision',revision,'hash',trip_support_private.hash(payload)) from knowledge_review_private.statements where candidate_id='${candidate}';`)),poi=uuid(),trip=uuid(),placeRef=uuid();
 await db(`insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values('${poi}','测试展馆','Test Gallery');insert into public.trips(id,owner_id,title,head_version) values('${trip}','${owner.id}','User intent not globally verified',0);insert into public.trip_place_references(id,trip_id,owner_id,reference_kind,canonical_poi_id) values('${placeRef}','${trip}','${owner.id}','canonical','${poi}');`);
 const basis=await rpc(owner,'knowledge_read_v1',{p_input:{city:'shanghai',scene:'attraction',locale:'en'}});assert.equal(basis.status,'available');
 const sourceRefs=JSON.parse(await db(`select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id) from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id='${candidate}';`)),digest=await db(`select trip_support_private.hash(${lit(sourceRefs)}::jsonb);`);
 const mapping=await rpc(mapper,'submit_trip_support_entity_mapping_v1',{p_input:{operationId:uuid(),canonicalPoiId:poi,statementId:st.id,expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:digest,basisMetadata:{city:'shanghai',scene:'attraction',locale:'en',sourceRefs}}});assert.equal(mapping.kind,'mapping_candidate',JSON.stringify(mapping));
 const mapped=await rpc(reviewer,'review_trip_support_entity_mapping_v1',{p_mapping:mapping.mappingId,p_expected_version:mapping.version,p_expected_digest:mapping.digest,p_decision:'approve'});assert.equal(mapped.kind,'mapping_reviewed');
 const proposed=await rpc(owner,'create_trip_proposal_patch',{p_trip_id:trip,p_patch:{expectedVersion:0,operations:[{kind:'upsert_day',dayId:'Day_A',date:`${future}`,timeZone:'Asia/Shanghai'},{kind:'upsert_item',itemId:'Item_A',dayId:'Day_A',title:'User selected gallery',startsAt:`${future}T02:00:00Z`,endsAt:`${future}T03:00:00Z`}]}});
 const proposalId=Array.isArray(proposed)?proposed[0].proposal_id:proposed.proposal_id;
 const read=JSON.parse(await db(`set request.jwt.claim.sub='${owner.id}';select to_jsonb(r) from public.read_trip_proposal_v2('${proposalId}') r;`)),itemHash=await db(`select trip_support_private.hash(trip_support_private.item(public.apply_trip_content_patch(public.trip_content_snapshot('${trip}','User intent not globally verified'),${lit(read.proposal.patch)}::jsonb),'Day_A','Item_A'));`);
 const prepared=await rpc(owner,'prepare_trip_item_support_v1',{p_input:{operationId:uuid(),tripId:trip,placeReferenceId:placeRef,dayId:'Day_A',itemId:'Item_A',proposalId,expectedProposalRevision:read.proposal.revision,expectedBaseVersion:0,expectedProposalDigest:read.digest,expectedItemDigest:itemHash,mappingId:mapped.mappingId,expectedMappingVersion:mapped.version,expectedMappingDigest:mapped.digest,city:'shanghai',scene:'attraction',locale:'en',scope:'opening_window_reference',expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:digest}});assert.equal(prepared.kind,'prepared',JSON.stringify(prepared));
 return {rpc,owner,reviewer,author,mapper,trip,proposalId,read,prepared,sourceRefs,poi,placeRef,candidate,statement};
}

 const actor=f=>({ownerId:f.a.owner,sessionId:f.a.session,mobileEpoch:1});
 const rawSQL=(f,action,raw,epoch=1)=>`begin;${claims(f.a)}set role authenticated;select public.privacy_notification_data_v1(${lit(action)},${lit(raw)},${lit(epoch)});commit;`;
 const call=(f,input,action=input.action,raw=JSON.stringify(input))=>db(rawSQL(f,action,raw)).then(JSON.parse);
 const bad=(f,input,code,action=input?.action,raw=JSON.stringify(input),epoch=1)=>deny(rawSQL(f,action,raw,epoch),code);
 const preview=(f,scope,ids,requestId=uuid())=>call(f,{action:'preview',scope,objectIds:ids.toSorted(),requestId});
 const mutation=(p,action='erase')=>({action,scope:p.scope,requestId:p.requestId,objectIds:p.objectIds,previewDigest:p.previewDigest,confirmed:true});
 const recover=(m,raw=JSON.stringify(m))=>({...m,action:'recover',mutationBytes:raw,previewDigest:undefined,confirmed:undefined});
 const serviceInput=(f,p,raw)=>({...actor(f),requestId:p.requestId,scope:p.scope,objectIds:p.objectIds,requestDigest:hash(raw)});
 const drain=(action,input)=>svc('privacy_notification_data_drain_v1',[action,input]);
 const exportBundle=(f,p)=>{const c=mutation(p,'export');return collectNotificationDataExport(c,JSON.stringify(c),actor(f),(a,b)=>call(f,JSON.parse(b),a,b),new AbortController().signal,async()=>true);};
 const finalized=async(f,p,raw)=>completeNotificationDrain(p,actor(f),raw,drain,new AbortController().signal,async()=>true);
 await caseTest('disabled RPC has zero writes after current authority',async()=>{
  const f=await fixture();await bad(f,{action:'list',scope:tripScope,cursor:null,limit:20},'NOTIFICATION_DATA_DISABLED');assert.equal(await db('select count(*) from notification_exit_private.requests;'),'0');
  await db('update notification_exit_private.settings set enabled=true,drain_enabled=true;');
 });
 await caseTest('direct NULL/extra key/unsorted/foreign role inputs are rejected before writes',async()=>{
  const f=await fixture(),a=uuid(),b=uuid();
  for(const input of [{action:'preview',scope:null,requestId:uuid(),objectIds:[f.trip]}, {action:'preview',scope:tripScope,requestId:uuid(),objectIds:null},
   {action:'preview',scope:tripScope,requestId:uuid(),objectIds:[b,a].toSorted().reverse()}, {action:'preview',scope:tripScope,requestId:uuid(),objectIds:[f.trip],ownerId:f.a.owner},
   {action:'list',scope:tripScope,cursor:null,limit:null}])await bad(f,input,'INVALID_INPUT');
  const p=await preview(f,tripScope,[f.trip]);for(const key of ['confirmed','previewDigest'])await bad(f,{...mutation(p),[key]:null},'INVALID_INPUT');
  await deny(`begin;${svcClaims}set role service_role;select public.privacy_notification_data_v1('preview','{}',1);commit;`,'permission denied');
  await deny(`begin;${claims(f.a)}set role authenticated;select public.privacy_notification_data_drain_v1('begin','{}');commit;`,'permission denied');
 });
 await caseTest('authentication/session/epoch/reauth precede any request feedback or cleanup',async()=>{
  const f=await fixture(),p=await preview(f,tripScope,[f.trip]),m=mutation(p);const count=await db('select count(*) from notification_exit_private.requests;');
  await bad({...f,a:{...f.a,session:uuid()}},recover(m),'SESSION_REPLACED');await bad(f,recover(m),'SESSION_REPLACED','recover',JSON.stringify(recover(m)),2);
  await db(`update auth.sessions set created_at=clock_timestamp()-interval '6 minutes' where id='${f.a.session}';`);await bad(f,recover(m),'REAUTHENTICATION_REQUIRED');
  await db(`update auth.sessions set created_at=clock_timestamp()+interval '1 minute' where id='${f.a.session}';`);await bad(f,recover(m),'REAUTHENTICATION_REQUIRED');
  assert.equal(await db('select count(*) from notification_exit_private.requests;'),count);assert.equal(await db(`select state from notification_exit_private.requests where request_id='${p.requestId}';`),'previewed');
 });
 await caseTest('complete Trip inventory decodes actual TS, includes legacy/full columns and fixed preview TTL',async()=>{
  const f=await fixture(),s=await scheduled(f);const p=await preview(f,tripScope,[f.trip]);assert.ok(decodeNotificationDataPreview(p,p,actor(f)));assert.equal(p.expiresAt,p.capturedAt+30000);
  assert.equal(p.items[0].reminders[0].id,s.x.id);assert.equal(p.items[0].travelReminders[0].reason,s.x.reason);assert.equal(p.items[0].operations.length,2);
  assert.deepEqual(await preview(f,tripScope,[f.trip],p.requestId),p);
  const b=await exportBundle(f,p);assert.equal(b.proof.rows,1);assert.deepEqual(b.items,p.items);
  for(const [table,key] of [['reminders','reminders'],['watches','watches'],['dismissals','dismissals'],['outbox','outbox'],['attempts','attempts'],['operations','operations'],['travel_reminders','travelReminders']]){
   if(!b.items[0][key].length)continue;
   const schema=table==='travel_reminders'?'public':'notification_private';const cols=JSON.parse(await db(`select jsonb_agg(attname order by attname) from pg_attribute where attrelid='${schema}.${table}'::regclass and attnum>0 and not attisdropped;`));assert.deepEqual(Object.keys(b.items[0][key][0]).toSorted(),cols);
  }
 });
 await caseTest('device private token export has direct full columns, cross-Trip outbox and current source CAS',async()=>{
  const f=await fixture(),s=await scheduled(f);await due(s);await svc('poll_travel_notifications_v2',[1]);
  // Bind the selected real outbox explicitly; poll may pick earlier fixtures.
  await db(`update notification_private.outbox set device_id='${f.deviceId}',device_revision=1 where id='${s.notification}';`);
  const p=await preview(f,deviceScope,[f.deviceId]);assert.ok(decodeNotificationDataPreview(p,p,actor(f)));assert.equal(p.items[0].device.token,f.token);assert.equal(p.items[0].outbox.length,1);
  const b=await exportBundle(f,p);assert.equal(b.items[0].device.token,f.token);
  const p2=await preview(f,deviceScope,[f.deviceId]);await db(`update notification_private.devices set revision=2 where id='${f.deviceId}';`);await bad(f,mutation(p2),'NOTIFICATION_DATA_SOURCE_CHANGED');
 });
 await caseTest('source CAS/head/archive change rejects erase atomically; Trip results remain untouched',async()=>{
  const f=await fixture(),s=await scheduled(f),p=await preview(f,tripScope,[f.trip]);await db(`update public.trips set head_version=2 where id='${f.trip}';`);await bad(f,mutation(p),'NOTIFICATION_DATA_SOURCE_CHANGED');
  assert.equal(await db(`select count(*) from notification_private.reminders where id='${s.x.id}';`),'1');assert.equal(await db(`select count(*) from notification_exit_private.fences where owner_id='${f.a.owner}';`),'0');
  const p2=await preview(f,tripScope,[f.trip]);await db(`insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${f.trip}','${f.a.owner}',2,'${uuid()}');`);await bad(f,mutation(p2),'NOTIFICATION_DATA_SOURCE_CHANGED');
 });
 await caseTest('owner erase always fences, never grants success from zero attempts; exact-byte same-op recovery',async()=>{
  const f=await fixture(),s=await scheduled(f),p=await preview(f,tripScope,[f.trip]),m=mutation(p),raw=JSON.stringify(m);const tripBefore=await db(`select to_jsonb(t) from public.trips t where id='${f.trip}';`);
  const d=await call(f,m);assert.ok(decodeNotificationDataDraining(d,p,actor(f),raw,Date.now()));assert.equal(d.state,'fenced');assert.equal(await db(`select count(*) from notification_private.reminders where id='${s.x.id}';`),'0');
  assert.equal(await db(`select to_jsonb(t) from public.trips t where id='${f.trip}';`),tripBefore);
  assert.deepEqual(await call(f,recover(m)),d);assert.deepEqual(await call(f,m),d);await bad(f,recover(m,' '+raw),'NOTIFICATION_DATA_REQUEST_CONFLICT');
  await reject(f,'schedule',s.x,'NOTIFICATION_DATA_ERASED_ID');await reject(f,'schedule',{...s.x,operationId:uuid()},'NOTIFICATION_DATA_ERASED_ID');
  await deny(`begin;${claims(f.a)}set role authenticated;select public.travel_reminders_v1('${f.trip}','create',${lit({id:s.x.id,baseVersion:1,dueAt:s.x.dueAt,expiresAt:s.x.expiresAt,timeZone:s.x.timeZone,reason:s.x.reason,purpose:'user_set_travel',consent:true})});commit;`,'NOTIFICATION_DATA_ERASED_ID');
  assert.deepEqual(await svc('dispatch_travel_notification_v2',[s.notification,'finish',{attemptId:uuid(),deviceRevision:1,outcome:{kind:'unknown',code:'ACK_UNKNOWN'}}]),{kind:'blocked'});
  const receipt=await finalized(f,p,raw);assert.ok(decodeNotificationDataReceipt(receipt,p,actor(f),hash(raw)));assert.equal(receipt.effects.reminders,1);assert.equal(receipt.effects.travelReminders,1);assert.equal(receipt.effects.operations,2);assert.equal(receipt.effects.devices,0);
  assert.ok(receipt.effects.fences>=5);assert.equal(receipt.effects.drainProof.waitMs,5000);assert.deepEqual(await call(f,recover(m)),receipt);
 });
 await caseTest('foreign recovery and absent recovery are indistinguishable unknown',async()=>{
  const owner=await fixture(),foreign=await fixture(),p=await preview(owner,tripScope,[owner.trip]),m=mutation(p);const a=await call(foreign,recover(m));const b=await call(foreign,recover({...m,requestId:uuid()}));
  assert.equal(a.kind,'unknown');assert.equal(b.kind,'unknown');assert.deepEqual(Object.keys(a).toSorted(),Object.keys(b).toSorted());assert.equal(a.ownerId,foreign.a.owner);
 });
 await caseTest('old begin returns no token, bounded begin_fenced retains lease/source qualification',async()=>{
  const f=await fixture(),s=await scheduled(f);await due(s);const aid=uuid();assert.deepEqual(await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId:aid}]),{kind:'blocked'});
  const g=await svc('dispatch_travel_notification_v2',[s.notification,'begin_fenced',{attemptId:aid}]);assert.equal(g.kind,'attempt');assert.ok(g.leaseBudgetMs>0&&g.leaseBudgetMs<=5000);assert.equal(g.token,f.token);
  const a=JSON.parse(await db(`select to_jsonb(a) from notification_private.attempts a where notification_id='${s.notification}';`));assert.equal(Date.parse(a.lease_expires_at)-Date.parse(a.authorized_at),g.leaseBudgetMs);
  const p=await preview(f,tripScope,[f.trip]);const d=await call(f,mutation(p));assert.equal(d.state,'fenced');assert.deepEqual(await svc('dispatch_travel_notification_v2',[s.notification,'read',{attemptId:aid}]),{kind:'blocked'});
  const r=await finalized(f,p,JSON.stringify(mutation(p)));assert.equal(r.effects.attempts,1);assert.equal(r.effects.providerUnknown,1);assert.equal(r.effects.activeGrants,1);
 });
 await caseTest('nonce generation CAS restarts full barrier; rollback leaves original challenge, owner fake elapsed rejected',async()=>{
  const f=await fixture(),p=await preview(f,tripScope,[f.trip]),m=mutation(p),raw=JSON.stringify(m);await call(f,m);const input=serviceInput(f,p,raw);
  const c1=await drain('begin',input),c2=await drain('begin',input);assert.equal(c2.generation,c1.generation+1);assert.notEqual(c2.nonce,c1.nonce);
  await deny(`begin;${svcClaims}set role service_role;select public.privacy_notification_data_drain_v1('finish',${lit({...input,generation:c1.generation,nonce:c1.nonce})});commit;`,'NOTIFICATION_DATA_DRAIN_CONFLICT');
  await deny(`begin;${svcClaims}set role service_role;select public.privacy_notification_data_drain_v1('finish',${lit({...input,generation:c2.generation,nonce:c2.nonce,elapsedMs:5000})});commit;`,'INVALID_INPUT');
  await db(`begin;${svcClaims}set role service_role;select public.privacy_notification_data_drain_v1('begin',${lit(input)});rollback;`);
  assert.equal(await db(`select drain_generation from notification_exit_private.requests where request_id='${p.requestId}';`),String(c2.generation));
  const before=process.hrtime.bigint();await completeNotificationDrain(p,actor(f),raw,drain,new AbortController().signal,async()=>true);assert.ok(process.hrtime.bigint()-before>=5000000000n);
 });
 await caseTest('device erase fences operation/outbox parent and old binding, preserving original reminder/watch business rows',async()=>{
  const f=await fixture(),s=await scheduled(f);await db(`update notification_private.outbox set device_id='${f.deviceId}',device_revision=1 where id='${s.notification}';`);const op=JSON.parse(await db(`select receipt from notification_private.operations where owner_id='${f.a.owner}' and action='register_device';`));
  const p=await preview(f,deviceScope,[f.deviceId]);await call(f,mutation(p));assert.equal(await db(`select count(*) from notification_private.reminders where id='${s.x.id}';`),'1');assert.equal(await db(`select count(*) from notification_private.outbox where id='${s.notification}';`),'0');
  await reject(f,'register_device',{operationId:op.operationId,deviceId:f.deviceId,token:f.token,environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'},'NOTIFICATION_DATA_ERASED_ID');
  await reject(f,'register_device',{operationId:uuid(),deviceId:f.deviceId,token:f.token,environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'},'NOTIFICATION_DATA_ERASED_ID');
  await deny(`insert into notification_private.outbox(id,reminder_id) values('${uuid()}','${s.x.id}');`,'NOTIFICATION_DATA_ERASED_ID');
  const retained=await preview(f,deviceScope,[f.deviceId]);assert.ok(decodeNotificationDataPreview(retained,retained,actor(f)));assert.equal(retained.items[0].device,null);assert.ok(retained.items[0].fences.some(x=>x.kind==='operation'));
  const receipt=await finalized(f,p,JSON.stringify(mutation(p)));assert.equal(receipt.effects.devices,1);assert.equal(receipt.effects.outbox,1);assert.equal(receipt.effects.reminders,0);
 });
 await caseTest('progress export includes every request/page field; erasure removes transient pages only and survives Trip deletion',async()=>{
  const f=await fixture(),s=await scheduled(f),p=await preview(f,tripScope,[f.trip]);await exportBundle(f,p);
  const q=await preview(f,progressScope,[p.requestId]);assert.ok(decodeNotificationDataPreview(q,q,actor(f)));assert.equal(q.items[0].pageProgress.length,1);assert.equal(q.items[0].pages,1);const b=await exportBundle(f,q);assert.equal(b.items[0].state,'exported');
  const e=await preview(f,progressScope,[p.requestId]),receipt=await call(f,mutation(e));assert.ok(decodeNotificationDataReceipt(receipt,e,actor(f)));assert.equal(receipt.effects.pageProgress,1);assert.equal(receipt.effects.reminders,0);assert.equal(receipt.effects.drainProof,null);
  const e2=await preview(f,progressScope,[p.requestId]);assert.equal(e2.items[0].progressErased,true);assert.equal(e2.items[0].pageProgress.length,0);
  const tp=await preview(f,tripScope,[f.trip]);await call(f,mutation(tp));await db(`delete from public.trips where id='${f.trip}';`);
  const kept=await preview(f,tripScope,[f.trip]);assert.ok(decodeNotificationDataPreview(kept,kept,actor(f)));assert.ok(kept.items[0].fences.length>0);
  const list=await call(f,{action:'list',scope:tripScope,cursor:null,limit:20});assert.equal(list.items[0].state,'retained');assert.equal(list.items[0].label,null);
 });

 await caseTest('ordered multipage export rejects missing/skipped pages and changing source cursors',async()=>{
  const f=await fixture(),ids=[];for(let i=0;i<6;i++)ids.push((await preview(f,tripScope,[f.trip])).requestId);ids.sort();
  const p=await preview(f,progressScope,ids),m=mutation(p,'export'),base={scope:p.scope,requestId:p.requestId,objectIds:p.objectIds,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest};
  await call(f,m,'export_start');await bad(f,{action:'proof',...base},'NOTIFICATION_DATA_INCOMPLETE');
  await bad(f,{action:'page',...base,cursor:{sourceDigest:p.sourceDigest,afterId:ids[4]},limit:5},'NOTIFICATION_DATA_CURSOR_CONFLICT');
  const one={action:'page',...base,cursor:null,limit:5};const page=await call(f,one);assert.equal(page.pageNumber,1);assert.deepEqual(await call(f,one),page);
  await bad(f,{action:'page',...base,cursor:{sourceDigest:'0'.repeat(64),afterId:ids[4]},limit:5},'NOTIFICATION_DATA_CURSOR_CONFLICT');
  const b=await exportBundle(f,p);assert.equal(b.proof.pages,2);assert.equal(b.proof.rows,6);assert.equal(await db(`select count(*) from notification_exit_private.pages where request_id='${p.requestId}';`),'2');
  const list={action:'list',scope:tripScope,cursor:null,limit:20},first=await call(f,list);assert.ok(decodeNotificationDataList(first,list,actor(f),Date.now()));
  await db(`update public.trips set title='Changed metadata' where id='${f.trip}';`);await bad(f,{...list,cursor:{sourceDigest:first.sourceDigest,afterId:first.items[0].objectId}},'NOTIFICATION_DATA_CURSOR_CONFLICT');
 });
 await caseTest('all attempts/outcomes and repeated dismissal IDs are inventoried by actual composite PK',async()=>{
  const f=await fixture(),s=await scheduled(f);await due(s);const aid=uuid(),g=await svc('dispatch_travel_notification_v2',[s.notification,'begin_fenced',{attemptId:aid}]);
  await svc('dispatch_travel_notification_v2',[s.notification,'finish',{attemptId:aid,deviceRevision:g.deviceRevision,outcome:{kind:'accepted',apnsId:aid,acceptedAt:new Date().toISOString()}}]);
  const step=uuid();for(const digest of ['a'.repeat(64),'b'.repeat(64)])await db(`insert into notification_private.dismissals(owner_id,trip_id,next_step_id,source_kind,source_id,semantic_digest) values('${f.a.owner}','${f.trip}','${step}','current_trip','${f.trip}','${digest}');`);
  const p=await preview(f,tripScope,[f.trip]);assert.ok(decodeNotificationDataPreview(p,p,actor(f)));assert.equal(p.items[0].dismissals.length,2);assert.equal(p.items[0].attempts[0].attempt_id,aid);
  const m=mutation(p);await call(f,m);const r=await finalized(f,p,JSON.stringify(m));assert.equal(r.effects.providerAccepted,1);assert.equal(r.effects.providerUnknown,0);assert.equal(r.effects.dismissals,2);
  const fences=JSON.parse(await db(`select jsonb_agg(object_id) from notification_exit_private.fences where owner_id='${f.a.owner}' and kind='dismissal';`));assert.equal(new Set(fences).size,2);
 });
 await caseTest('corrupt cross-owner parent/device/watch/attempt links fail complete projection without hidden omission',async()=>{
  const f=await fixture(),other=await fixture(),s=await scheduled(f);await db(`update notification_private.outbox set device_id='${other.deviceId}',device_revision=1 where id='${s.notification}';`);
  await bad(f,{action:'preview',scope:tripScope,requestId:uuid(),objectIds:[f.trip]},'NOTIFICATION_DATA_SOURCE_UNAVAILABLE');await bad(other,{action:'preview',scope:deviceScope,requestId:uuid(),objectIds:[other.deviceId]},'NOTIFICATION_DATA_SOURCE_UNAVAILABLE');
  await db(`update notification_private.outbox set device_id='${f.deviceId}',device_revision=1 where id='${s.notification}';insert into notification_private.attempts(notification_id,attempt_id,device_id,device_revision,state,authorized_at,lease_expires_at) values('${s.notification}','${uuid()}','${other.deviceId}',1,'attempting',clock_timestamp(),clock_timestamp()+interval '1 second');`);
  await bad(f,{action:'preview',scope:tripScope,requestId:uuid(),objectIds:[f.trip]},'NOTIFICATION_DATA_SOURCE_UNAVAILABLE');
 });
 await caseTest('byte and row sentinels reject before complete preview, proof or erase with zero requests/fences',async()=>{
  const f=await fixture();await db(`insert into public.travel_reminders(id,owner_id,trip_id,session_id,base_version,reason,due_at,expires_at,time_zone) select gen_random_uuid(),'${f.a.owner}','${f.trip}','${f.a.session}',1,repeat('x',200)||n,clock_timestamp()+n*interval '1 minute',clock_timestamp()+n*interval '1 minute'+interval '1 hour','Asia/Shanghai' from generate_series(1,2000) n;`);
  await bad(f,{action:'preview',scope:tripScope,requestId:uuid(),objectIds:[f.trip]},'NOTIFICATION_DATA_CAPACITY');assert.equal(await db(`select count(*) from notification_exit_private.requests where owner_id='${f.a.owner}';`),'0');
  await db(`insert into public.travel_reminders(id,owner_id,trip_id,session_id,base_version,reason,due_at,expires_at,time_zone) select gen_random_uuid(),'${f.a.owner}','${f.trip}','${f.a.session}',1,'row'||n,clock_timestamp()+n*interval '1 minute',clock_timestamp()+n*interval '1 minute'+interval '1 hour','Asia/Shanghai' from generate_series(2001,10001) n;`);
  await bad(f,{action:'preview',scope:tripScope,requestId:uuid(),objectIds:[f.trip]},'NOTIFICATION_DATA_CAPACITY');assert.equal(await db(`select count(*) from notification_exit_private.fences where owner_id='${f.a.owner}';`),'0');
 });
 await caseTest('erase/poll/begin/finish/read concurrent original roots serialize without deadlocks or revival',async()=>{
  const f=await fixture(),s=await scheduled(f);await due(s);await db(`update notification_private.outbox set state='suppressed' where state='scheduled' and id<>'${s.notification}';`);
  const p=await preview(f,tripScope,[f.trip]),m=mutation(p),aid=uuid();
  const [erased,grant,poll]=await Promise.allSettled([call(f,m),svc('dispatch_travel_notification_v2',[s.notification,'begin_fenced',{attemptId:aid}]),svc('poll_travel_notifications_v2',[1])]);
  assert.equal(grant.status,'fulfilled');assert.equal(poll.status,'fulfilled');assert.ok(['blocked','attempt'].includes(grant.value.kind));assert.ok(['candidate','idle'].includes(poll.value.kind));
  if(erased.status==='fulfilled'){assert.equal(erased.value.state,'fenced');assert.equal(grant.value.kind,'blocked');assert.equal(await db(`select count(*) from notification_private.attempts where notification_id='${s.notification}';`),'0');}
  else{assert.match(erased.reason.message,/NOTIFICATION_DATA_SOURCE_CHANGED/);assert.equal(await db(`select state from notification_exit_private.requests where request_id='${p.requestId}';`),'previewed');}
  if(grant.value.kind==='attempt'){
   const q=await preview(f,tripScope,[f.trip]);const outcome={kind:'unknown',code:'ACK_UNKNOWN'};
   const [erase2,finish,read]=await Promise.allSettled([call(f,mutation(q)),svc('dispatch_travel_notification_v2',[s.notification,'finish',{attemptId:aid,deviceRevision:grant.value.deviceRevision,outcome}]),svc('dispatch_travel_notification_v2',[s.notification,'read',{attemptId:aid}])]);
   assert.equal(finish.status,'fulfilled');assert.equal(read.status,'fulfilled');assert.ok(['blocked','receipt'].includes(finish.value.kind));assert.ok(['blocked','receipt'].includes(read.value.kind));
   if(erase2.status==='rejected')assert.match(erase2.reason.message,/NOTIFICATION_DATA_SOURCE_CHANGED/);else assert.equal(erase2.value.state,'fenced');
  }
  if(await db(`select count(*) from notification_private.reminders where id='${s.x.id}';`)==='1'){const q=await preview(f,tripScope,[f.trip]);await call(f,mutation(q));}
  assert.equal(await db(`select count(*) from notification_private.reminders where id='${s.x.id}';`),'0');assert.deepEqual(await svc('dispatch_travel_notification_v2',[s.notification,'begin_fenced',{attemptId:aid}]),{kind:'blocked'});
 });
 await caseTest('real qualified-watch semantic fence prevents poll fresh UUID regeneration after device erase',async()=>{
  const f=await supportFixture();const confirmed=await f.rpc(f.owner,'confirm_and_apply_supported_trip_proposal_v1',{p_proposal_id:f.proposalId,p_idempotency_key:'exit-watch-'+uuid(),p_digest:f.read.digest,p_support_selection:[{receiptId:f.prepared.receiptId,version:f.prepared.version,sourceDigest:f.prepared.sourceDigest}]});assert.equal(confirmed.kind,'confirmed');
  await db(`update identity_private.mobile_accounts set session_id='${f.owner.session}',epoch=1 where owner_id='${f.owner.id}';insert into identity_private.mobile_attempts values('${f.owner.id}','${uuid()}','${f.owner.session}',1);update notification_private.settings set enabled=true,environment='sandbox',topic='fixture.only';`);
  const nf={a:{owner:f.owner.id,session:f.owner.session},trip:f.trip},deviceId=uuid();await user(nf,'register_device',{operationId:uuid(),deviceId,token:uuid().replaceAll('-',''),environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'});
  const baseline=(await user(nf,'list')).nextSteps.find(x=>x.source.kind==='qualified_watch');assert.ok(baseline);
  const w={operationId:uuid(),id:uuid(),baseVersion:1,source:baseline.source,expiresAt:baseline.expiresAt,timeZone:'Asia/Shanghai',quietHours:{startMinute:0,endMinute:0},consent:true};await user(nf,'watch',w);
  await db(`update notification_private.watches set baseline_digest='${'0'.repeat(64)}',next_check_at=clock_timestamp() where id='${w.id}';`);await svc('poll_travel_notifications_v2',[1]);assert.equal(await db(`select count(*) from notification_private.outbox where watch_id='${w.id}';`),'1');
  await db(`update notification_private.outbox set device_id='${deviceId}',device_revision=1 where watch_id='${w.id}';`);
  const p=await preview(nf,deviceScope,[deviceId]);await call(nf,mutation(p));assert.ok(await db(`select notification_exit_private.has_fence('${nf.a.owner}','watch_semantic',notification_exit_private.pair_id('${nf.a.owner}','${w.id}','${baseline.source.contentDigest}'));`)==='t');
  // Synthetic repeated semantic transition; actual source RPC is unchanged.
  await db(`update notification_private.watches set baseline_digest='${'0'.repeat(64)}',next_check_at=clock_timestamp() where id='${w.id}';`);await svc('poll_travel_notifications_v2',[1]);assert.equal(await db(`select count(*) from notification_private.outbox where watch_id='${w.id}';`),'0');
  assert.equal(await db(`select baseline_digest from notification_private.watches where id='${w.id}';`),baseline.source.contentDigest);
 });


 await caseTest('begin_fenced retains original TTL/head/archive/session/quiet/recipient eligibility negatives',async()=>{
  for(const [name,change] of [
   ['head',(f,s)=>`update public.trips set head_version=2 where id='${f.trip}'`],
   ['archive',(f,s)=>`insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${f.trip}','${f.a.owner}',1,'${uuid()}')`],
   ['expiry',(f,s)=>`update notification_private.reminders set due_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' where id='${s.x.id}'`],
   ['session',(f,s)=>`update identity_private.mobile_accounts set epoch=2 where owner_id='${f.a.owner}'`],
   ['recipient',(f,s)=>`update notification_private.devices set active=false where id='${f.deviceId}'`],
   ['quiet',(f,s)=>`update notification_private.reminders set quiet_hours='{"startMinute":0,"endMinute":1439}' where id='${s.x.id}'`],
  ]){
   const f=await fixture(),s=await scheduled(f);await due(s);await db(change(f,s));const got=await svc('dispatch_travel_notification_v2',[s.notification,'begin_fenced',{attemptId:uuid()}]);assert.deepEqual(got,{kind:'blocked'},name);assert.equal(await db(`select count(*) from notification_private.attempts where notification_id='${s.notification}';`),'0',name);
  }
 });
 await caseTest('erasure rollback leaves original source rows, operations and request while no fence survives',async()=>{
  const f=await fixture(),s=await scheduled(f),p=await preview(f,tripScope,[f.trip]),raw=JSON.stringify(mutation(p));const before=await db(`select to_jsonb(r) from notification_private.reminders r where id='${s.x.id}';`);
  await db(`begin;${claims(f.a)}set role authenticated;select public.privacy_notification_data_v1('erase',${lit(raw)},1);rollback;`);
  assert.equal(await db(`select to_jsonb(r) from notification_private.reminders r where id='${s.x.id}';`),before);assert.equal(await db(`select state from notification_exit_private.requests where request_id='${p.requestId}';`),'previewed');assert.equal(await db(`select count(*) from notification_exit_private.fences where owner_id='${f.a.owner}';`),'0');
  const r=await user(f,'schedule',s.x);assert.deepEqual(r.mutationReceipt,s.view.mutationReceipt);
 });
 await caseTest('service finalization requires fresh owner/session/epoch and strict generation, no source effects on failure',async()=>{
  const f=await fixture(),p=await preview(f,tripScope,[f.trip]),m=mutation(p),raw=JSON.stringify(m);await call(f,m);const input=serviceInput(f,p,raw),c=await drain('begin',input);
  await deny(`begin;${svcClaims}set role service_role;select public.privacy_notification_data_drain_v1('finish',${lit({...input,generation:String(c.generation),nonce:c.nonce})});commit;`,'INVALID_INPUT');
  await db(`update identity_private.mobile_accounts set epoch=2 where owner_id='${f.a.owner}';`);
  await deny(`begin;${svcClaims}set role service_role;select public.privacy_notification_data_drain_v1('finish',${lit({...input,generation:c.generation,nonce:c.nonce})});commit;`,'SESSION_REPLACED');
  await deny(`begin;${svcClaims}set role service_role;select public.privacy_notification_data_drain_v1('begin',${lit({...input,requestId:uuid()})});commit;`,'SESSION_REPLACED');
  assert.equal(await db(`select state||':'||drain_generation from notification_exit_private.requests where request_id='${p.requestId}';`),'fenced:'+c.generation);
 });

 await caseTest('device registration operation source rows also count toward the capacity sentinel',async()=>{
  const f=await fixture();await db(`set statement_timeout='30s';insert into notification_private.operations(owner_id,operation_id,trip_id,action,request_digest,receipt) select '${f.a.owner}',id,'${f.trip}','register_device','${'a'.repeat(64)}',jsonb_build_object('operationId',id,'action','register_device','requestDigest','${'a'.repeat(64)}','resultId','${f.deviceId}','revision',1,'terminal',true,'outcome','applied') from (select gen_random_uuid() id from generate_series(1,10000)) q;`);
  await bad(f,{action:'preview',scope:deviceScope,requestId:uuid(),objectIds:[f.deviceId]},'NOTIFICATION_DATA_CAPACITY');assert.equal(await db(`select count(*) from notification_exit_private.requests where owner_id='${f.a.owner}';`),'0');assert.equal(await db(`select count(*) from notification_exit_private.fences where owner_id='${f.a.owner}';`),'0');
 });
 await caseTest('fixed expiry prevents new erase/export; drain and immutable recovery may finish after original TTL',async()=>{
  const f=await fixture(),p=await preview(f,tripScope,[f.trip]),m=mutation(p);await call(f,m);const other=await fixture(),q=await preview(other,tripScope,[other.trip]);
  // Actual wait advances wall time without modifying immutable record timestamps.
  await new Promise(r=>setTimeout(r,30100));assert.ok(Date.now()>p.expiresAt);
  await bad(other,mutation(q),'NOTIFICATION_DATA_EXPIRED');const receipt=await finalized(f,p,JSON.stringify(m));assert.ok(receipt.decidedAt>p.expiresAt);assert.ok(receipt.committedAt<p.expiresAt);assert.deepEqual(await call(f,recover(m)),receipt);

 });
});
