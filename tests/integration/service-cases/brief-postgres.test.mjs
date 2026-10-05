// Disposable PostgreSQL with synthetic users/sessions/time/roles. No target grant.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TRAVELER_BRIEF_DB_TEST==='1';
const container=process.env.VP_TRAVELER_BRIEF_TEST_CONTAINER||'vp223-'+uuid().slice(0,8);let created=false;
const migration='20261005060000_traveler_brief.sql';
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=x=>x===null?'null':typeof x==='number'?String(x):"'"+(typeof x==='object'?JSON.stringify(x):x).replaceAll("'","''")+"'";
const claims=a=>`set request.jwt.claim.sub='${a.id}';set request.jwt.claim.role='authenticated';set request.jwt.claims='${JSON.stringify({session_id:a.session,is_anonymous:false,role:'authenticated'})}';`;
const invoke=(a,v,surface='owner',bytes=JSON.stringify(v))=>sql(container,`begin;${claims(a)}set role authenticated;select public.service_case_brief_v1(${lit(v)},${lit(bytes)},${lit(surface)});commit;`);
const call=async(a,v,surface='owner',bytes=JSON.stringify(v))=>{const r=await invoke(a,v,surface,bytes);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
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
   await db('begin;'+source+'commit;');
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
