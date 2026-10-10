// Disposable PostgreSQL with synthetic users/sessions/time/roles. No target grant.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {decodeBrief,decodeBriefOwnerState,decodeBriefAudit,decodeBriefDataBundle,decodeBriefLocator,decodeBriefReceipt,decodeBriefSourceOptions} from '../../../lib/server/service-cases/brief/contract.ts';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {observedBriefAuditSeed} from '../privacy/profile-data/brief-seed-diagnostics.mjs';
const enabled=process.env.VP_TRAVELER_BRIEF_DB_TEST==='1';
const container=process.env.VP_TRAVELER_BRIEF_TEST_CONTAINER||'vp223-'+uuid().slice(0,8);let created=false;
const migration='20261005060000_traveler_brief.sql';
const clockMigration='20261005081000_traveler_brief_export_clock.sql';
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=x=>x===null?'null':typeof x==='number'?String(x):"'"+(typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")+"'";
const claims=a=>`set request.jwt.claim.sub='${a.id}';set request.jwt.claim.role='authenticated';set request.jwt.claims='${JSON.stringify({session_id:a.session,is_anonymous:false,role:'authenticated'})}';`;
const invoke=(a,v,surface='owner',bytes=JSON.stringify(v))=>sql(container,`begin;${claims(a)}set role authenticated;select public.service_case_brief_v1(${lit(v)},${lit(bytes)},${lit(surface)});commit;`);
const call=async(a,v,surface='owner',bytes=JSON.stringify(v))=>{const r=await invoke(a,v,surface,bytes);assert.equal(r.code,0,r.stderr);const result=JSON.parse(r.stdout.trim());const decoder={owner_state:decodeBriefOwnerState,preview:decodeBrief,brief:decodeBrief,audit:decodeBriefAudit,bundle:decodeBriefDataBundle,locator:decodeBriefLocator,receipt:decodeBriefReceipt,source_options:decodeBriefSourceOptions}[result.kind];if(decoder)assert.ok(decoder(result),'closed TS wire rejected '+result.kind);return result;};
const rejects=async(a,v,code,surface='owner',bytes=JSON.stringify(v))=>{const r=await invoke(a,v,surface,bytes);assert.notEqual(r.code,0);assert.match(r.stderr,new RegExp(code));};
const old=async(a,v)=>JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.service_case_v1(${lit(v)});commit;`));
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
before(async()=>{
 if(!enabled)return;
 if(!process.env.VP_TRAVELER_BRIEF_TEST_CONTAINER){
  const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
  for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
  await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
  for(const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort()){
   const source=readFileSync('supabase/migrations/'+name,'utf8');
   if(name===migration){await db('begin;'+source+'rollback;');assert.equal(await db("select to_regnamespace('service_brief_private') is null;"),'t');}
   if(name===clockMigration){
    const definition=await db("select md5(pg_get_functiondef('service_brief_private.export(uuid,uuid,uuid)'::regprocedure));");
    const acl=await db("select proacl::text from pg_proc where oid='service_brief_private.export(uuid,uuid,uuid)'::regprocedure;");
    await db('begin;'+source+'rollback;');
    assert.equal(await db("select md5(pg_get_functiondef('service_brief_private.export(uuid,uuid,uuid)'::regprocedure));"),definition,'clock migration rollback preserves original function');
    await db('begin;'+source+'commit;');
    assert.equal(await db("select proacl::text from pg_proc where oid='service_brief_private.export(uuid,uuid,uuid)'::regprocedure;"),acl,'clock migration preserves original ACL');
   }else await db('begin;'+source+'commit;');
  }
 }
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const user=async()=>{const a={id:uuid(),session:uuid()};await db(`insert into auth.users values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${a.id}','${a.session}',1);insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.id}','${uuid()}','${a.session}',1);`);return a;};
async function operator({slots=1,active=true,enrolled=true}={}){
 const a=await user(),shift=uuid();await db(`insert into service_cases_private.staff(actor_id,label,active) values('${a.id}','Synthetic operator',${active});`);
 if(enrolled)await db(`insert into service_operations_private.operators values('${a.id}',true);insert into service_operations_private.shifts(id,actor_id,starts_at,ends_at,enabled) values('${shift}','${a.id}',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true);insert into service_operations_private.slots(shift_id,slot) select '${shift}',generate_series(1,${slots});`);
 return {...a,shift};
}
async function fixture(staff){
 const a=await user();staff??=await operator();const caseId=uuid();
 await old(a,{action:'create',caseId,category:'general',problem:'Synthetic help problem'});
 await old(a,{action:'grant',caseId,expectedRevision:0,recipientId:staff.id,durationMinutes:60,sharedFields:['problem']});
 const request={action:'request',operationId:uuid(),caseId,expectedRevision:0,grantRevision:1,urgency:'normal',trip:{kind:'unknown'}};
 return {a,staff,caseId,request};
}
const mutation=(f,action,revision,extra={})=>({action,operationId:uuid(),caseId:f.caseId,expectedRevision:revision,grantRevision:1,...extra});
const read=f=>call(f.a,{action:'read',caseId:f.caseId});
async function assigned(f){await serviceCall(f.a,f.request);await serviceCall(f.staff,mutation(f,'accept',1),'staff');await serviceCall(f.staff,mutation(f,'assign',2),'staff');}

const serviceCall=async(a,v,surface='owner')=>JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.service_case_operations_v1(${lit(v)},${lit(JSON.stringify(v))},${lit(surface)});commit;`));
const sources={profilePace:false,memories:[],intakeMessageId:null};
const preview=async(f,s=sources)=>call(f.a,{action:'preview',caseId:f.caseId,recipientId:f.staff.id,grantRevision:1,sources:s});
const shareInput=(f,p,keys=['problem'])=>({action:'share',operationId:uuid(),caseId:f.caseId,recipientId:f.staff.id,grantRevision:1,expectedRevision:p.revision,previewId:p.previewId,sourceDigest:p.sourceDigest,selectedKeys:keys,noticeVersion:'case-minimal-brief/1',confirmed:true});
const briefRead=(f,revision=1,a=f.staff)=>call(a,{action:'read',caseId:f.caseId,recipientId:f.staff.id,grantRevision:1,expectedRevision:revision},a===f.staff?'staff':'owner');
const pace=(a,v)=>db(`begin;${claims(a)}set role authenticated;select public.native_travel_pace_v1(${lit(v)});commit;`).then(JSON.parse);
const memory=async(a,text='Synthetic explicit preference')=>{
 const consent=JSON.parse(await db(`begin;${claims(a)}set role authenticated;select row_to_json(x) from public.create_memory_retrieval_consent() x;commit;`)).consent_id;
 const id=uuid(),receipt=uuid();
 await db(`begin;${claims(a)}set role authenticated;select public.create_explicit_memory_profile_v2('${id}','${receipt}','${consent}','preference',${lit(text)});commit;`);
 return {id,revision:1,consent,receipt};
};
const cleanupInput=(f,action,revision,grant=1)=>({action,operationId:uuid(),caseId:f.caseId,recipientId:f.staff.id,grantRevision:grant,expectedRevision:revision,confirmed:true});
run('append replay and rollback; new ACL/RLS deny, disabled switch, no enrollment',async()=>{
 for(const role of ['anon','authenticated','service_role']){
 assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='service_brief_private' or n.nspname='public' and p.proname='service_case_brief_v1') and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
 assert.equal(await db(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='service_brief_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,DELETE'));`),'0');
 }
 assert.equal(await db('select enabled from service_brief_private.settings;'),'f');
 assert.equal(await db('select count(*) from service_operations_private.operators;'),'0');
 const f=await fixture();await rejects(f.a,{action:'source_options',caseId:f.caseId},'permission denied');
 await db('grant execute on function public.service_case_brief_v1(jsonb,text,text),public.service_case_operations_v1(jsonb,text,text) to authenticated;');
 await rejects(f.a,{action:'source_options',caseId:f.caseId},'BRIEF_DISABLED');
 await db('update service_brief_private.settings set enabled=true;update service_operations_private.settings set enabled=true;');
});
run('preview alone denies staff; explicit selection produces exact sources and minimal audit',async()=>{
 const f=await fixture(),p=await preview(f),other=await user();
 assert.equal(p.fields.find(x=>x.key==='response_detail').state,'unknown');
 assert.ok(p.expiresAt-p.createdAt<=300000);assert.equal(p.fields.find(x=>x.key==='problem').provenance,'explicit');
 await rejects(f.staff,{action:'locate',caseId:f.caseId},'BRIEF_FORBIDDEN','staff');
 await rejects(other,{action:'audit',caseId:f.caseId},'CASE_FORBIDDEN');
 await rejects(f.staff,{action:'preview',caseId:f.caseId,recipientId:f.staff.id,grantRevision:1,sources},'CASE_FORBIDDEN','staff');
 const v=shareInput(f,p),receipt=await call(f.a,v);
 assert.equal(receipt.revision,1);const b=await briefRead(f);assert.deepEqual(b.fields.map(x=>x.key),['problem']);
 assert.deepEqual(await call(f.staff,{action:'locate',caseId:f.caseId},'staff'),Object.fromEntries(Object.entries(b).filter(([k])=>!['updatedAt','sourceDigest','fields','noticeVersion'].includes(k)).map(([k,v])=>[k,k==='kind'?'locator':v])));
 const audit=await call(f.a,{action:'audit',caseId:f.caseId});assert.equal(audit.revision,1);assert.equal(audit.complete,true);assert.ok(audit.events.some(x=>x.action==='read'));
 assert.equal(JSON.stringify(audit).includes('Synthetic help problem'),false);assert.equal(JSON.stringify(audit).includes('basisDigest'),false);
 assert.deepEqual((await call(f.a,{action:'read_operation',operationId:v.operationId})).receipt,receipt);
 await rejects(f.staff,{action:'read_operation',operationId:v.operationId},'CASE_FORBIDDEN','staff');
});
run('byte digest, whitespace reuse, current-head CAS, immutable receipt, abandon race',async()=>{
 const f=await fixture(),p=await preview(f),v=shareInput(f,p),bytes=JSON.stringify(v,null,2),r=await call(f.a,v,'owner',bytes);
 assert.equal(r.requestDigest,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(await call(f.a,v,'owner',bytes),r);
 await rejects(f.a,v,'IDEMPOTENCY_KEY_REUSE');
 await rejects(f.a,{...v,operationId:uuid()},'BRIEF_CONFLICT');
 assert.notEqual((await sql(container,`update service_brief_private.operations set receipt='{}' where operation_id='${v.operationId}';`)).code,0);
 const g=await fixture(),q=await preview(g),w=shareInput(g,q),raw=JSON.stringify(w);
 const [applied,abandoned]=await Promise.all([invoke(g.a,w),invoke(g.a,{action:'abandon',operationId:w.operationId,mutationBytes:raw})]);
 // NOWAIT can report busy; retry the same original operation only in this test.
 for(const res of [applied,abandoned])assert.ok(res.code===0||/BRIEF_BUSY/.test(res.stderr));
 const actual=await call(g.a,w),stop=await call(g.a,{action:'abandon',operationId:w.operationId,mutationBytes:raw});assert.deepEqual(actual,stop);
 const h=await fixture(),hp=await preview(h),hv=shareInput(h,hp),cancel=await call(h.a,{action:'abandon',operationId:hv.operationId,mutationBytes:JSON.stringify(hv)});
 assert.equal(cancel.outcome,'cancelled');assert.deepEqual(await call(h.a,hv),cancel);assert.equal(await db(`select count(*) from service_brief_private.briefs where case_id='${h.caseId}';`),'0');
});
run('pace and selected Memory authority; selected-only refs survive unselected pace change',async()=>{
 const f=await fixture();await pace(f.a,{action:'save',operationId:uuid(),expectedRevision:0,travelPace:'relaxed',noticeVersion:'local-planning-cross-trip-v1'});
 const m=await memory(f.a);const opts=await call(f.a,{action:'source_options',caseId:f.caseId});assert.equal(opts.profilePace.value,'relaxed');assert.equal(opts.memoryScope,'latest_three_preferences');assert.equal(opts.memories[0].source.receiptId,m.receipt);
 const p=await preview(f,{profilePace:true,memories:[{id:m.id,revision:1}],intakeMessageId:null}),v=shareInput(f,p,['memory:'+m.id]);await call(f.a,v);
 assert.deepEqual(JSON.parse(await db(`select sources from service_brief_private.briefs where case_id='${f.caseId}';`)),{profilePace:false,memories:[{id:m.id,revision:1}],intakeMessageId:null});
 assert.equal(await db(`select count(*) from service_brief_private.previews where case_id='${f.caseId}';`),'0');
 await pace(f.a,{action:'save',operationId:uuid(),expectedRevision:1,travelPace:'packed',noticeVersion:'local-planning-cross-trip-v1'});
 assert.deepEqual((await briefRead(f)).fields.map(x=>x.key),['memory:'+m.id]);
 assert.deepEqual((await call(f.a,{action:'read_operation',operationId:v.operationId})).receipt.action,'share');
 await db(`begin;${claims(f.a)}set role authenticated;select public.transition_memory_profile('${m.id}','paused');commit;`);
 await rejects(f.staff,{action:'locate',caseId:f.caseId},'BRIEF_FORBIDDEN','staff');await rejects(f.a,{action:'read_operation',operationId:v.operationId},'BRIEF_OPERATION_ERASED');
 assert.equal(await db(`select state from service_brief_private.briefs where case_id='${f.caseId}';`),'invalidated');
 assert.equal(await db(`select count(*) from service_brief_private.operations where operation_id='${v.operationId}' and erased and request_bytes is null and receipt is null and case_id is null;`),'1');
});
run('withdraw/delete and feature-off owner privacy; deletion receipt survives original Case deletion',async()=>{
 const f=await fixture(),p=await preview(f);await call(f.a,shareInput(f,p));await db('update service_brief_private.settings set enabled=false;');
 await rejects(f.staff,{action:'locate',caseId:f.caseId},'BRIEF_DISABLED','staff');
 const w=cleanupInput(f,'withdraw',1),wr=await call(f.a,w);assert.equal(wr.revision,2);
 assert.equal((await call(f.a,{action:'audit',caseId:f.caseId})).revision,2);
 const d=cleanupInput(f,'delete',2),dr=await call(f.a,d);assert.equal(dr.revision,3);assert.deepEqual((await call(f.a,{action:'read_operation',operationId:d.operationId})).receipt,dr);
 assert.deepEqual((await call(f.a,{action:'audit',caseId:f.caseId})).events,[]);
 const bundle=await call(f.a,{action:'export',requestId:uuid(),confirmed:true});assert.equal(bundle.allUserDataCompleted,false);assert.equal(bundle.coverage.sourceValues,'not_copied');
 assert.equal(JSON.stringify(bundle).includes('Synthetic help problem'),false);assert.equal(bundle.rows.find(x=>x.domain==='brief').value.sources,null);
 await db(`begin;${claims(f.a)}select service_operations_private.delete_case_v1('${f.caseId}',1);commit;`);
 assert.deepEqual((await call(f.a,{action:'read_operation',operationId:d.operationId})).receipt,dr);
 await rejects({...f.a,session:uuid()},{action:'read_operation',operationId:d.operationId},'UNAUTHENTICATED|SESSION_REPLACED');
 await db('update service_brief_private.settings set enabled=true;');
});

const ownerRPC=(a,name,args)=>db(`begin;${claims(a)}set role authenticated;select public.${name}(${args.map(lit).join(',')});commit;`).then(JSON.parse);
const intakeValue={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'lodging_budget_filter',durationDays:7,partySize:2,interests:['food','culture'],pace:'fast',lodgingBudget:{currency:'CNY',perNightMinorUnits:42000},dates:{startDate:'2026-10-10',endDate:'2026-10-16'},mobilityConstraints:['step-free']};
async function intakeFixture(f,tripId=null,headVersion=0,value=intakeValue,basis=[]){
 const trip=tripId||uuid(),policy=uuid(),conversation=uuid(),goal=uuid(),root=uuid(),message=uuid(),link=uuid();
 if(!tripId)await db(`insert into public.trips(id,owner_id,title,head_version) values('${trip}','${f.a.id}','Synthetic exact Case Trip',${headVersion});`);
 await db(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at) values('${policy}','qwen','synthetic','https://example.test/v1','test','test','test','test','test','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');insert into turn_private.text_consents(owner_id,policy_id) values('${f.a.id}','${policy}');`);
 // Original writers: legacy goal -> owner-confirmed link -> first typed follow-up.
 await ownerRPC(f.a,'submit_assistant_message_v1',[conversation,root,uuid(),policy,'en','Synthetic explicit goal','goal_start',goal,null,null,null,null]);
 await ownerRPC(f.a,'set_assistant_goal_trip_link_v1',[link,conversation,goal,root,1,0,'link',trip,headVersion,true]);
 await ownerRPC(f.a,'submit_assistant_travel_intake_v1',[conversation,goal,message,root,2,0,uuid(),policy,'en','Synthetic explicit structured intake','follow_up',value,basis]);
 if(!tripId){f.request.trip={kind:'bound',tripId:trip,headVersion};await serviceCall(f.a,f.request);}
 return {trip,policy,conversation,goal,root,message,link};
}
run('unique Case Trip intake via actual original goal/link/intake writers; explicit intake overrides profile',async()=>{
 const f=await fixture();const i=await intakeFixture(f);
 await pace(f.a,{action:'save',operationId:uuid(),expectedRevision:0,travelPace:'relaxed',noticeVersion:'local-planning-cross-trip-v1'});
 const opts=await call(f.a,{action:'source_options',caseId:f.caseId});assert.equal(opts.intake.messageId,i.message);assert.equal(opts.intake.fields.find(x=>x.key==='budget').value.perNightMinorUnits,42000);
 const p=await preview(f,{profilePace:true,memories:[],intakeMessageId:i.message});assert.equal(p.fields.find(x=>x.key==='travel_pace').value,'fast');assert.equal(p.fields.find(x=>x.key==='travel_pace').source.kind,'intake');
 const v=shareInput(f,p,['travel_pace','budget','requirements']);await call(f.a,v);const b=await briefRead(f);assert.deepEqual(b.fields.find(x=>x.key==='requirements').value,{city:'shanghai',durationDays:7,partySize:2,interests:['food','culture'],dates:{startDate:'2026-10-10',endDate:'2026-10-16'},mobilityConstraints:['step-free']});
 assert.equal(b.fields.find(x=>x.key==='budget').source.consentId,opts.intake.fields[0].source.consentId);
 // A real later ordinary message advances the frontier without changing immutable intake.
 await ownerRPC(f.a,'submit_assistant_message_v1',[i.conversation,uuid(),uuid(),i.policy,'en','Synthetic newer follow-up','follow_up',i.goal,2,null,i.message,null]);
 await rejects(f.staff,{action:'locate',caseId:f.caseId},'BRIEF_FORBIDDEN','staff');await rejects(f.a,{action:'read_operation',operationId:v.operationId},'BRIEF_OPERATION_ERASED');
 assert.equal((await call(f.a,{action:'source_options',caseId:f.caseId})).intake,null);
 assert.equal(await db(`select intake_revision from turn_private.assistant_travel_intakes where message_id='${i.message}';`),'1');
});
run('intake ambiguity/unrelated messages are unknown; null fields stay unknown and receipt/head rights requalify',async()=>{
 const f=await fixture(),i=await intakeFixture(f);await intakeFixture(f,i.trip);
 assert.equal((await call(f.a,{action:'source_options',caseId:f.caseId})).intake,null);
 await rejects(f.a,{action:'preview',caseId:f.caseId,recipientId:f.staff.id,grantRevision:1,sources:{...sources,intakeMessageId:i.message}},'BRIEF_STALE');
 for(const kind of ['receipt','trip_head','archive','consent','policy','link','goal']){
 const g=await fixture(),j=await intakeFixture(g,null,kind==='archive'?1:0),p=await preview(g,{...sources,intakeMessageId:j.message}),v=shareInput(g,p,['budget']);await call(g.a,v);
 if(kind==='receipt')await db(`delete from turn_private.assistant_goal_trip_receipts where operation_id='${j.link}';`);
 if(kind==='trip_head')await db(`update public.trips set head_version=1 where id='${j.trip}';`);
 if(kind==='archive')await db(`insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${j.trip}','${g.a.id}',1,'${uuid()}');`);
 if(kind==='consent')await db(`begin;${claims(g.a)}set role authenticated;select public.withdraw_text_policy('${j.policy}');commit;`);
 if(kind==='policy')await db(`update turn_private.text_policies set revoked_at=clock_timestamp() where id='${j.policy}';`);
 if(kind==='link')await ownerRPC(g.a,'set_assistant_goal_trip_link_v1',[uuid(),j.conversation,j.goal,null,2,1,'unlink',null,null,true]);
 if(kind==='goal')await ownerRPC(g.a,'submit_assistant_message_v1',[j.conversation,uuid(),uuid(),j.policy,'en','Synthetic goal amendment','amendment',j.goal,2,null,j.message,null]);
 await rejects(g.a,{action:'read_operation',operationId:v.operationId},'BRIEF_OPERATION_ERASED');await rejects(g.staff,{action:'locate',caseId:g.caseId},'BRIEF_FORBIDDEN|CASE_FORBIDDEN','staff');
 assert.equal(await db(`select count(*) from service_brief_private.briefs where case_id='${g.caseId}' and sources is null and selected_keys='[]' and source_digest is null;`),'1',kind);
 }
});
run('Case correction/grant replacement/revoke/expiry invalidates, while expired/revoked owner cleanup stays usable',async()=>{
 for(const kind of ['correction','replace','revoke','expiry']){
 const f=await fixture(),p=await preview(f),v=shareInput(f,p);await call(f.a,v);
 if(kind==='correction')await db(`update service_cases_private.cases set problem='Synthetic authoritative correction' where id='${f.caseId}';`);
 if(kind==='replace')await old(f.a,{action:'grant',caseId:f.caseId,expectedRevision:1,recipientId:f.staff.id,durationMinutes:60,sharedFields:['problem']});
 if(kind==='revoke')await old(f.a,{action:'revoke',caseId:f.caseId,expectedRevision:1});
 if(kind==='expiry')await db(`update service_cases_private.cases set expires_at=clock_timestamp()-interval '1 second' where id='${f.caseId}';`);
 await rejects(f.a,{action:'read_operation',operationId:v.operationId},'BRIEF_OPERATION_ERASED');
 const audit=await call(f.a,{action:'audit',caseId:f.caseId});assert.equal(audit.revision,2);
 const grant=kind==='replace'||kind==='revoke'?2:1;
 const r=await call(f.a,cleanupInput(f,'withdraw',audit.revision,grant));assert.equal(r.revision,3);
 const d=await call(f.a,cleanupInput(f,'delete',3,grant));assert.equal(d.revision,4);
 assert.equal((await call(f.a,{action:'audit',caseId:f.caseId})).events.length,0);
 }
});
run('latest three eligible explicit Memory candidates, foreign consent/receipt and inferred/hard sources excluded',async()=>{
 const f=await fixture(),mems=[];for(let k=0;k<4;k++)mems.push(await memory(f.a,'Synthetic preference '+k));
 const opts=await call(f.a,{action:'source_options',caseId:f.caseId});assert.equal(opts.memories.length,3);assert.equal(opts.memories.some(x=>x.source.id===mems[0].id),false);
 await rejects(f.a,{action:'preview',caseId:f.caseId,recipientId:f.staff.id,grantRevision:1,sources:{...sources,memories:[{id:mems[0].id,revision:1}]}},'BRIEF_STALE');
 const m=mems[3],p=await preview(f,{...sources,memories:[{id:m.id,revision:1}]}),v=shareInput(f,p,['memory:'+m.id]);await call(f.a,v);
 const other=await user();await db(`update public.memory_receipts set owner_id='${other.id}' where id='${m.receipt}';`);
 await rejects(f.a,{action:'read_operation',operationId:v.operationId},'BRIEF_OPERATION_ERASED');
 const invalid=await memory(f.a);await db(`update public.memory_profiles set state='inferred' where id='${invalid.id}';`);
 assert.equal((await call(f.a,{action:'source_options',caseId:f.caseId})).memories.some(x=>x.source.id===invalid.id),false);
});
run('recipient membership/shift/slot withdrawal erases old head and re-enrollment never revives it',async()=>{
 for(const kind of ['staff','operator','shift','slot']){
 const f=await fixture();await assigned(f);const p=await preview(f),v=shareInput(f,p);await call(f.a,v);
 const change=kind==='staff'?`update service_cases_private.staff set active=false where actor_id='${f.staff.id}';`:kind==='operator'?`update service_operations_private.operators set enabled=false where actor_id='${f.staff.id}';`:kind==='shift'?`update service_operations_private.shifts set enabled=false where id='${f.staff.shift}';`:`delete from service_operations_private.slots where case_id='${f.caseId}';`;
 await db(change);await rejects(f.a,{action:'read_operation',operationId:v.operationId},'BRIEF_OPERATION_ERASED');
 if(kind==='staff')await db(`update service_cases_private.staff set active=true where actor_id='${f.staff.id}';`);
 if(kind==='operator')await db(`update service_operations_private.operators set enabled=true where actor_id='${f.staff.id}';`);
 if(kind==='shift')await db(`update service_operations_private.shifts set enabled=true where id='${f.staff.shift}';`);
 await rejects(f.staff,{action:'locate',caseId:f.caseId},'BRIEF_FORBIDDEN|CASE_FORBIDDEN','staff');
 }
});
// Observe a real old-writer transaction holding its locks; no synthetic helper result.
async function whileHeld(change,action){
 const tag='vp223-'+uuid(),pending=sql(container,`set application_name='${tag}';begin;${change}select pg_sleep(0.7);commit;`);
 for(let n=0;n<60;n++){
 if(await db(`select count(*) from pg_stat_activity where application_name='${tag}' and wait_event='PgSleep';`)==='1')break;
 await new Promise(r=>setTimeout(r,10));if(n===59){const failed=await pending;throw Error('Writer barrier not observed: '+failed.stderr);}
 }
 const result=await action();const committed=await pending;assert.equal(committed.code,0,committed.stderr);return result;
}
run('real correction/revoke/read/delete/session/account lock races; original writers commit and old refs never revive',async()=>{
 for(const kind of ['memory','consent','grant','delete','session','account']){
 const f=await fixture(),m=await memory(f.a),p=await preview(f,{...sources,memories:[{id:m.id,revision:1}]}),v=shareInput(f,p,['memory:'+m.id]);await call(f.a,v);
 const q=kind==='memory'?`${claims(f.a)}set role authenticated;select public.transition_memory_profile('${m.id}','paused');`:kind==='consent'?`${claims(f.a)}set role authenticated;select public.revoke_memory_retrieval_consent('${m.consent}');`:kind==='grant'?`${claims(f.a)}set role authenticated;select public.service_case_v1(${lit({action:'revoke',caseId:f.caseId,expectedRevision:1})});`:kind==='delete'?`${claims(f.a)}select service_operations_private.delete_case_v1('${f.caseId}',1);`:kind==='session'?`update identity_private.mobile_accounts set session_id=null,epoch=epoch+1 where owner_id='${f.a.id}';`:`delete from auth.users where id='${f.a.id}';`;
 const concurrent=await whileHeld(q,()=>invoke(f.staff,{action:'read',caseId:f.caseId,recipientId:f.staff.id,grantRevision:1,expectedRevision:1},'staff'));
 assert.notEqual(concurrent.code,0);assert.match(concurrent.stderr,/BRIEF_BUSY|BRIEF_FORBIDDEN|CASE_FORBIDDEN/);
 await rejects(f.staff,{action:'locate',caseId:f.caseId},'BRIEF_FORBIDDEN|CASE_FORBIDDEN','staff');
 if(kind==='account')assert.equal(await db(`select count(*) from service_brief_private.operations where actor_id='${f.a.id}';`),'0');
 else if(kind!=='session')await rejects(f.a,{action:'read_operation',operationId:v.operationId},'BRIEF_OPERATION_ERASED');
 }
 // Reverse order: a genuine qualified staff read holds Case/source locks; the
 // unchanged Memory writer waits, commits after it, and synchronously erases refs.
 const f=await fixture(),m=await memory(f.a),p=await preview(f,{...sources,memories:[{id:m.id,revision:1}]}),v=shareInput(f,p,['memory:'+m.id]);await call(f.a,v);
 const readCmd={action:'read',caseId:f.caseId,recipientId:f.staff.id,grantRevision:1,expectedRevision:1};
 const result=await whileHeld(`${claims(f.staff)}set role authenticated;select public.service_case_brief_v1(${lit(readCmd)},${lit(JSON.stringify(readCmd))},'staff');`,()=>sql(container,`begin;${claims(f.a)}set role authenticated;select public.transition_memory_profile('${m.id}','paused');commit;`));
 assert.equal(result.code,0,result.stderr);await rejects(f.staff,{action:'locate',caseId:f.caseId},'BRIEF_FORBIDDEN','staff');
 assert.equal(await db('select deadlocks from pg_stat_database where datname=current_database();'),'0');
});
run('export exact 30s lease, reference-only projection, invalidation after source/audit/data change, complete bounds',async()=>{
 const f=await fixture(),m=await memory(f.a),p=await preview(f,{...sources,memories:[{id:m.id,revision:1}]}),v=shareInput(f,p,['memory:'+m.id]);await call(f.a,v);
 const req={action:'export',requestId:uuid(),confirmed:true},out=await call(f.a,req);assert.deepEqual(await call(f.a,req),out);assert.equal(out.expiresAt-out.capturedAt,30000);assert.equal(await db(`select expires_at-captured_at=interval '30 seconds' from service_brief_private.export_leases where owner_id='${f.a.id}' and session_id='${f.a.session}' and request_id='${req.requestId}';`),'t','SQL microsecond lease duration is exactly 30 seconds');assert.equal(out.corePackageEnrollment,'not_enrolled');
 assert.equal(JSON.stringify(out).includes('Synthetic explicit preference'),false);assert.equal(out.rows.find(x=>x.domain==='brief').value.sources.memories[0].id,m.id);
 await briefRead(f);await rejects(f.a,req,'BRIEF_STALE');
 const r2={...req,requestId:uuid()};await call(f.a,r2);await db(`begin;${claims(f.a)}set role authenticated;select public.revoke_memory_retrieval_consent('${m.consent}');commit;`);await rejects(f.a,r2,'BRIEF_STALE');
 const r3={...req,requestId:uuid()},clean=await call(f.a,r3);assert.equal(clean.rows.find(x=>x.domain==='brief').value.sources,null);
 await db(`update service_brief_private.export_leases set expires_at=clock_timestamp()-interval '1 second' where request_id='${r3.requestId}';`);await rejects(f.a,r3,'BRIEF_STALE');
 const g=await fixture();await db(`insert into service_brief_private.audit(case_id,owner_id,revision,actor_id,action,recipient_id,grant_revision,field_keys) select '${g.caseId}','${g.a.id}',0,'${g.a.id}','read','${g.staff.id}',1,'[]' from generate_series(1,201);`);
 await rejects(g.a,{action:'audit',caseId:g.caseId},'BRIEF_LIMIT');
 await observedBriefAuditSeed(container,`insert into service_brief_private.audit(case_id,owner_id,revision,actor_id,action,recipient_id,grant_revision,field_keys) select '${g.caseId}','${g.a.id}',0,'${g.a.id}','read','${g.staff.id}',1,'[]' from generate_series(1,9800);`);
 await rejects(g.a,{action:'export',requestId:uuid(),confirmed:true},'BRIEF_LIMIT');
 const h=await fixture();await db(`insert into service_brief_private.audit(case_id,owner_id,revision,actor_id,action,recipient_id,grant_revision,field_keys) select '${h.caseId}','${h.a.id}',0,'${h.a.id}','read','${h.staff.id}',1,'[]' from generate_series(1,2500);`);await rejects(h.a,{action:'export',requestId:uuid(),confirmed:true},'BRIEF_LIMIT');
});
run('canonical native credential-proof login replacement logout, original guard and Brief session erasure',async()=>{
 const a={id:uuid(),session:uuid()},attempt=uuid();
 await db(`insert into auth.users values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');`);
 await db(`begin;set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';set role service_role;select public.native_prepare_v2('${a.id}','${a.session}','${attempt}');commit;`);
 const login=await sql(container,`\\set VERBOSITY verbose
begin;${claims(a)}set role authenticated;select public.native_session_v2('login','${attempt}');commit;`);
 assert.equal(login.code,0,login.stderr);assert.equal(JSON.parse(login.stdout).sessionId,a.session);
 const staff=await operator(),caseId=uuid();await old(a,{action:'create',caseId,category:'general',problem:'Synthetic canonical login Case'});await old(a,{action:'grant',caseId,expectedRevision:0,recipientId:staff.id,durationMinutes:60,sharedFields:['problem']});
 const f={a,staff,caseId},p=await preview(f),v=shareInput(f,p);await call(a,v);
 const next={id:a.id,session:uuid()},attempt2=uuid();await db(`insert into auth.sessions(id,user_id) values('${next.session}','${a.id}');`);
 await db(`begin;set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';set role service_role;select public.native_prepare_v2('${a.id}','${next.session}','${attempt2}');commit;`);
 const replacement=await ownerRPC(next,'native_session_v2',['login',attempt2]);assert.equal(replacement.sessionId,next.session);
 await rejects(a,{action:'audit',caseId},'UNAUTHENTICATED|SESSION_REPLACED');await rejects(staff,{action:'locate',caseId},'BRIEF_FORBIDDEN','staff');
 await ownerRPC(next,'native_session_v2',['logout',null]);await rejects(next,{action:'audit',caseId},'UNAUTHENTICATED|SESSION_REPLACED');
});
run('owner_state metadata permits feature-off cleanup after audit overflow, revoked/expired, absent revision zero; staff and foreign owner deny',async()=>{
 const f=await fixture(),p=await preview(f);await call(f.a,shareInput(f,p));
 await db(`insert into service_brief_private.audit(case_id,owner_id,revision,actor_id,action,recipient_id,grant_revision,field_keys) select '${f.caseId}','${f.a.id}',1,'${f.a.id}','read','${f.staff.id}',1,'[]' from generate_series(1,201);update service_brief_private.settings set enabled=false;`);
 await rejects(f.a,{action:'audit',caseId:f.caseId},'BRIEF_LIMIT');
 const command={action:'owner_state',caseId:f.caseId},state=await call(f.a,command);
 assert.deepEqual(state,{schemaVersion:'traveler-brief/1',kind:'owner_state',caseId:f.caseId,ownerId:f.a.id,recipientId:f.staff.id,grantRevision:1,briefRevision:1,state:'shared'});
 const other=await user();await rejects(other,command,'CASE_FORBIDDEN');await rejects(f.staff,command,'CASE_FORBIDDEN','staff');
 await old(f.a,{action:'revoke',caseId:f.caseId,expectedRevision:1});const revoked=await call(f.a,command);assert.equal(revoked.grantRevision,2);assert.equal(revoked.briefRevision,2);assert.equal(revoked.recipientId,f.staff.id);
 await call(f.a,cleanupInput(f,'delete',revoked.briefRevision,revoked.grantRevision));assert.equal((await call(f.a,command)).state,'deleted');assert.equal((await call(f.a,{action:'audit',caseId:f.caseId})).events.length,0);
 const g=await fixture();await previewDisabledFixture(g); // Metadata also works before first share.
 const absent=await call(g.a,{action:'owner_state',caseId:g.caseId});assert.equal(absent.state,'absent');assert.equal(absent.briefRevision,0);
 await call(g.a,cleanupInput(g,'delete',0));assert.equal((await call(g.a,{action:'owner_state',caseId:g.caseId})).briefRevision,1);
 const a=await user(),cid=uuid();await old(a,{action:'create',caseId:cid,category:'general',problem:'Synthetic ungranted Case'});
 const ungranted=await call(a,{action:'owner_state',caseId:cid});assert.equal(ungranted.recipientId,null);assert.equal(ungranted.grantRevision,0);assert.equal(ungranted.state,'absent');
 await db(`delete from service_cases_private.cases where id='${cid}';`);await rejects(a,{action:'owner_state',caseId:cid},'CASE_FORBIDDEN');
 await db('update service_brief_private.settings set enabled=true;');
});
async function previewDisabledFixture(f){await db('update service_brief_private.settings set enabled=true;');const p=await preview(f);await db('update service_brief_private.settings set enabled=false;');return p;}
run('null intake fields remain unknown, originals never inferred; selected intake Memory dependencies and Trip deletion erase refs',async()=>{
 const f=await fixture(),nulls=Object.fromEntries(Object.keys(intakeValue).map(k=>[k,k==='schemaVersion'?intakeValue[k]:null]));const i=await intakeFixture(f,null,0,nulls);
 const p=await preview(f,{...sources,intakeMessageId:i.message});for(const key of ['travel_pace','budget','requirements','response_detail'])assert.equal(p.fields.find(x=>x.key===key).state,'unknown');
 await rejects(f.a,shareInput(f,p,['budget']),'BRIEF_FORBIDDEN');
 const g=await fixture(),m=await memory(g.a),j=await intakeFixture(g,null,0,intakeValue,[{id:m.id,revision:1}]),gp=await preview(g,{...sources,intakeMessageId:j.message}),v=shareInput(g,gp,['budget']);await call(g.a,v);
 await db(`begin;${claims(g.a)}set role authenticated;select public.transition_memory_profile('${m.id}','paused');commit;`);await rejects(g.a,{action:'read_operation',operationId:v.operationId},'BRIEF_OPERATION_ERASED');
 const h=await fixture(),k=await intakeFixture(h),hp=await preview(h,{...sources,intakeMessageId:k.message}),hv=shareInput(h,hp,['requirements']);await call(h.a,hv);
 await db(`begin;${claims(h.a)}set role authenticated;select public.request_trip_deletion_v1('${uuid()}','${k.trip}',0,true);commit;`);
 await rejects(h.a,{action:'read_operation',operationId:hv.operationId},'BRIEF_OPERATION_ERASED');await rejects(h.staff,{action:'locate',caseId:h.caseId},'BRIEF_FORBIDDEN|CASE_FORBIDDEN','staff');
 assert.deepEqual(JSON.parse(await db(`select intake->'lodgingBudget' from turn_private.assistant_travel_intakes where message_id='${k.message}';`)),intakeValue.lodgingBudget);
});
