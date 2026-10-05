// Disposable PostgreSQL with synthetic users/sessions/time/roles. No target grant.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_SERVICE_OPERATIONS_DB_TEST==='1';
const container=process.env.VP_SERVICE_OPERATIONS_TEST_CONTAINER||'vp224-'+uuid().slice(0,8);let created=false;
const migration='20261005050000_service_operations.sql';
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=x=>x===null?'null':typeof x==='number'?String(x):"'"+(typeof x==='object'?JSON.stringify(x):x).replaceAll("'","''")+"'";
const claims=a=>`set request.jwt.claim.sub='${a.id}';set request.jwt.claim.role='authenticated';set request.jwt.claims='${JSON.stringify({session_id:a.session,is_anonymous:false,role:'authenticated'})}';`;
const invoke=(a,v,surface='owner',bytes=JSON.stringify(v))=>sql(container,`begin;${claims(a)}set role authenticated;select public.service_case_operations_v1(${lit(v)},${lit(bytes)},${lit(surface)});commit;`);
const call=async(a,v,surface='owner',bytes=JSON.stringify(v))=>{const r=await invoke(a,v,surface,bytes);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const rejects=async(a,v,code,surface='owner',bytes=JSON.stringify(v))=>{const r=await invoke(a,v,surface,bytes);assert.notEqual(r.code,0);assert.match(r.stderr,new RegExp(code));};
const old=async(a,v)=>JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.service_case_v1(${lit(v)});commit;`));
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
before(async()=>{
 if(!enabled)return;
 if(!process.env.VP_SERVICE_OPERATIONS_TEST_CONTAINER){
  const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
  for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
  await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
  for(const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort()){
   const source=readFileSync('supabase/migrations/'+name,'utf8');
   if(name===migration){await db('begin;'+source+'rollback;');assert.equal(await db("select to_regnamespace('service_operations_private') is null;"),'t');}
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
async function assigned(f){await call(f.a,f.request);await call(f.staff,mutation(f,'accept',1),'staff');await call(f.staff,mutation(f,'assign',2),'staff');}
run('full replay rollback, private RLS/ACL deny, empty operators and disabled RPC',async()=>{
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='service_operations_private' or n.nspname='public' and p.proname in('service_case_operations_v1','service_case_export_v1','service_case_data_v1')) and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
  assert.equal(await db(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='service_operations_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,DELETE'));`),'0');
 }
 assert.equal(await db('select enabled from service_operations_private.settings;'),'f');assert.equal(await db('select count(*) from service_operations_private.operators;'),'0');
 const a=await user(),v={action:'workspace'};await rejects(a,v,'permission denied');
 // Grants and enabling below exist only in this disposable fixture, after deny proof.
 await db('grant execute on function public.service_case_operations_v1(jsonb,text,text),public.service_case_data_v1(jsonb,text) to authenticated;grant execute on function public.service_case_export_v1(text,jsonb) to service_role;');
 await rejects(a,v,'SERVICE_OPERATIONS_DISABLED');await db('update service_operations_private.settings set enabled=true;');
 assert.equal((await call(a,v)).capacity.state,'unknown');
});
run('existing grants only, no guessed staff, no Trip/Brief reads, strict closed commands',async()=>{
 const f=await fixture(),other=await user();await rejects(other,f.request,'CASE_FORBIDDEN');
 await rejects(f.a,{...f.request,staffId:f.staff.id},'INVALID_INPUT');await rejects(f.a,{...f.request,urgency:'emergency'},'INVALID_INPUT');await rejects(f.a,f.request,'INVALID_INPUT','owner',JSON.stringify({...f.request,urgency:'urgent'}));
 await call(f.a,f.request);const v=await read(f);assert.equal(v.status,'queued');assert.equal(v.staff,null);assert.equal(v.manualMinutesScope,'recorded_only');assert.deepEqual(v.brief,{kind:'unknown'});
 const staffView=await call(f.staff,{action:'workspace'},'staff');assert.equal(staffView.complete,true);assert.deepEqual(staffView.cases[0].trip,{kind:'unknown'});assert.equal(staffView.cases[0].proposal,null);
 await rejects(f.staff,mutation(f,'update',1,{status:'resolved',minutes:null,evidence:[],proposal:{proposalId:uuid(),tripId:uuid(),baseVersion:1}}),'INVALID_INPUT','staff');
 await rejects({...f.a,session:uuid()},{action:'workspace'},'SESSION_REPLACED');
 await db(`update identity_private.mobile_accounts set epoch=2,session_id='${uuid()}' where owner_id='${f.a.id}';`);await rejects(f.a,{action:'workspace'},'SESSION_REPLACED');
});
run('exact UTF8 bytes, changed whitespace reuse409, immutable receipt and no cross session/surface',async()=>{
 const f=await fixture(),bytes=JSON.stringify(f.request,null,2),receipt=await call(f.a,f.request,'owner',bytes);
 assert.equal(receipt.requestDigest,createHash('sha256').update(bytes,'utf8').digest('hex'));assert.deepEqual(await call(f.a,f.request,'owner',bytes),receipt);
 await rejects(f.a,f.request,'IDEMPOTENCY_KEY_REUSE');assert.deepEqual((await call(f.a,{action:'read_operation',operationId:f.request.operationId})).receipt,receipt);
 assert.equal((await call(f.staff,{action:'read_operation',operationId:f.request.operationId},'staff')).receipt,null);
 assert.notEqual((await sql(container,`update service_operations_private.operations set receipt='{}' where operation_id='${f.request.operationId}';`)).code,0);
});
run('unknown ACK abandon fence and execute race share original operation bytes',async()=>{
 const f=await fixture(),bytes=JSON.stringify(f.request);const abandoned=await call(f.a,{action:'abandon',operationId:f.request.operationId,mutationBytes:bytes});assert.equal(abandoned.outcome,'cancelled');assert.deepEqual(await call(f.a,f.request),abandoned);assert.equal(await db(`select count(*) from service_operations_private.services where case_id='${f.caseId}';`),'0');
 const g=await fixture();const [apply,stop]=await Promise.all([call(g.a,g.request),call(g.a,{action:'abandon',operationId:g.request.operationId,mutationBytes:JSON.stringify(g.request)})]);assert.deepEqual(apply,stop);
 assert.equal(await db(`select count(*) from service_operations_private.services where case_id='${g.caseId}';`),apply.outcome==='applied'?'1':'0');
});
run('one actual slot accepts exactly one Case, inactive/unenrolled/no slots reject',async()=>{
 const staff=await operator(),f=await fixture(staff),g=await fixture(staff);await call(f.a,f.request);await call(g.a,g.request);
 const results=await Promise.all([invoke(staff,mutation(f,'accept',1),'staff'),invoke(staff,mutation(g,'accept',1),'staff')]);assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0).stderr,/CASE_CAPACITY_UNAVAILABLE/);
 assert.equal(await db(`select count(*) from service_operations_private.slots where shift_id='${staff.shift}' and case_id is not null;`),'1');
 const noRole=await fixture(await operator({enrolled:false}));await call(noRole.a,noRole.request);await rejects(noRole.staff,mutation(noRole,'accept',1),'CASE_FORBIDDEN','staff');
 const noSlot=await fixture(await operator({slots:0}));await call(noSlot.a,noSlot.request);await rejects(noSlot.staff,mutation(noSlot,'accept',1),'CASE_CAPACITY_UNAVAILABLE','staff');
});
run('recorded seconds aggregate to minutes, reject future/overlap and contact-only resolution',async()=>{
 const f=await fixture();await assigned(f);
 // Synthetic elapsed clock fixture, never represented as real staffed minutes.
 await db(`update service_operations_private.services set accepted_at=clock_timestamp()-interval '5 minutes' where case_id='${f.caseId}';`);
 const clock=Number(await db('select service_operations_private.ms(clock_timestamp());')),start=clock-120000,end=clock-59000;
 const interval={startedAt:start,endedAt:end},evidence=[{kind:'contacted_provider',note:'Synthetic contact recorded',reference:'fixture:contact',observedAt:clock-1000}];
 await rejects(f.staff,mutation(f,'update',3,{status:'resolved',evidence,minutes:interval,proposal:null}),'INVALID_INPUT','staff');
 await rejects(f.staff,mutation(f,'update',3,{status:'waiting_external',evidence,minutes:{startedAt:clock-1000,endedAt:clock+100000},proposal:null}),'CASE_MINUTES_INVALID','staff');
 await call(f.staff,mutation(f,'update',3,{status:'waiting_external',evidence,minutes:interval,proposal:null}),'staff');assert.equal((await read(f)).manualMinutes,1);
 const tutorial=[{kind:'tutorial',note:'Synthetic tutorial supplied',reference:'fixture:tutorial',observedAt:clock}];
 await rejects(f.staff,mutation(f,'update',4,{status:'resolved',evidence:tutorial,minutes:interval,proposal:null}),'CASE_MINUTES_INVALID','staff');
 await call(f.staff,mutation(f,'update',4,{status:'resolved',evidence:tutorial,minutes:null,proposal:null}),'staff');assert.equal((await read(f)).status,'resolved');assert.equal(await db(`select case_id is null from service_operations_private.slots where shift_id='${f.staff.shift}';`),'t');
});
run('legacy revoke/replace wipes source bytes and refs, owner cancel receipt survives fresh read',async()=>{
 const f=await fixture();await assigned(f);const accept=JSON.parse(await db(`select receipt from service_operations_private.operations where case_id='${f.caseId}' and surface='staff' order by created_at limit 1;`));
 await old(f.a,{action:'revoke',caseId:f.caseId,expectedRevision:1});await rejects(f.staff,{action:'read',caseId:f.caseId},'CASE_FORBIDDEN','staff');await rejects(f.staff,{action:'read_operation',operationId:accept.operationId},'CASE_FORBIDDEN','staff');await rejects(f.a,{action:'read_operation',operationId:f.request.operationId},'CASE_OPERATION_ERASED');
 assert.equal(await db(`select count(*) from service_operations_private.operations where owner_id='${f.a.id}' and (request_bytes is not null or receipt is not null or case_id is not null);`),'0');assert.equal((await read(f)).status,'cancelled');
 const g=await fixture();await assigned(g);const cancel=mutation(g,'cancel',3),receipt=await call(g.a,cancel);assert.equal(receipt.grantRevision,2);assert.deepEqual((await call(g.a,{action:'read_operation',operationId:cancel.operationId})).receipt,receipt);assert.deepEqual(await call(g.a,cancel),receipt);assert.equal((await read(g)).status,'cancelled');
});
run('TTL releases capacity and scrubs through bounded maintenance, old staff receipt never replays',async()=>{
 const f=await fixture();await assigned(f);await db(`update service_cases_private.cases set expires_at=clock_timestamp()-interval '1 second' where id='${f.caseId}';`);
 await rejects(f.staff,{action:'read',caseId:f.caseId},'CASE_FORBIDDEN','staff');assert.equal((await call(f.a,{action:'workspace'})).capacity.state,'available');
 assert.equal(await db('select service_operations_private.expire_cases(100);'),'1');assert.equal(await db(`select count(*) from service_operations_private.operations where owner_id='${f.a.id}' and not erased;`),'0');
});
run('owner binds original pending Proposal only; staff gets no Trip and archive retains service',async()=>{
 const f=await fixture(),trip=uuid();await db(`insert into public.trips(id,owner_id,title,head_version) values('${trip}','${f.a.id}','Synthetic Trip',1);`);f.request.trip={kind:'bound',tripId:trip,headVersion:1};await assigned(f);
 const proposal=JSON.parse(await db(`begin;${claims(f.a)}set role authenticated;select row_to_json(x) from public.create_trip_proposal_patch('${trip}','{"expectedVersion":1,"operations":[{"kind":"set_title","title":"Synthetic new title"}]}') x;commit;`));
 const select=mutation(f,'select_proposal',3,{proposal:{proposalId:proposal.proposal_id,tripId:trip,baseVersion:1}});await call(f.a,select);assert.equal((await read(f)).proposal.proposalId,proposal.proposal_id);assert.deepEqual((await call(f.staff,{action:'read',caseId:f.caseId},'staff')).trip,{kind:'unknown'});
 assert.equal(await db(`select head_version from public.trips where id='${trip}';`),'1');await db(`insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${trip}','${f.a.id}',1,'${uuid()}');`);assert.equal((await read(f)).status,'assigned');
});
run('Trip deletion erases binding/evidence/operations but keeps Case; explicit Case delete cascades',async()=>{
 const f=await fixture(),trip=uuid();await db(`insert into public.trips(id,owner_id,title,head_version) values('${trip}','${f.a.id}','Synthetic Trip',1);`);f.request.trip={kind:'bound',tripId:trip,headVersion:1};await assigned(f);
 await db(`begin;${claims(f.a)}set role authenticated;select public.request_trip_deletion_v1('${uuid()}','${trip}',1,true);commit;`);const v=await read(f);assert.equal(v.status,'cancelled');assert.deepEqual(v.trip,{kind:'unknown'});assert.deepEqual(v.evidence,[]);
 await db(`begin;${claims(f.a)}select service_operations_private.delete_case_v1('${f.caseId}',2);commit;`);assert.equal(await db(`select count(*) from service_operations_private.services where case_id='${f.caseId}';`),'0');assert.equal(await db(`select count(*) from service_operations_private.operations where owner_id='${f.a.id}' and not erased;`),'0');
});
run('workspace beyond 50 fails explicitly instead of silently truncating',async()=>{
 const a=await user();await db(`insert into service_cases_private.cases(id,owner_id,category,problem) select gen_random_uuid(),'${a.id}','general','Synthetic bounded case' from generate_series(1,51);insert into service_operations_private.services(case_id,owner_id,grant_revision,status,urgency) select id,owner_id,revision,'cancelled','normal' from service_cases_private.cases where owner_id='${a.id}';`);await rejects(a,{action:'workspace'},'CASE_WORKSPACE_LIMIT');
});
run('versioned export exact lease, unenrolled partial, cursor replay and source-change invalidation',async()=>{
 const f=await fixture();await assigned(f);
 await db(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) values('${uuid()}',1,true,'local','synthetic-service-key',90000,600000,300000,1000,100,8388608,clock_timestamp()+interval '1 day');`);
 const req=uuid();await db(`begin;${claims(f.a)}select public.privacy_core_export_v1('request',${lit({requestId:req,confirmed:true})});commit;`);
 const svc=(name,action,input)=>db(`begin;set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';set role service_role;select public.${name}(${lit(action)},${lit(input)});commit;`).then(JSON.parse);
 // Core grant is a fixture for obtaining the original exact worker lease only.
 await db('grant execute on function public.privacy_core_export_v1(text,jsonb) to service_role;');
 const lease=await svc('privacy_core_export_v1','claim',{requestId:req,operationId:uuid(),maxRunMs:90000,expectedEnvironment:'local',expectedKeyId:'synthetic-service-key'});
 const binding={requestId:req,leaseId:lease.leaseId,generation:lease.generation};
 const service=(a,v)=>svc('service_case_export_v1',a,{...binding,...v});
 assert.equal((await service('coverage',{})).coverage,'partial');
 assert.equal((await service('enroll',{})).kind,'enrolled');
 let cursor=null,total=0,pages=0;
 do{const input={cursor,limit:2};const page=await service('page',input);assert.equal(page.kind,'page');assert.deepEqual(await service('page',input),page);total+=page.items.length;pages++;cursor=page.nextCursor;}while(cursor);
 assert.ok(total>=9);assert.ok(pages>=4);const coverage=await service('coverage',{});assert.equal(coverage.coverage,'complete');assert.equal(coverage.allUserDataCompleted,false);
 assert.equal(await db(`select scope from export_private.core_jobs_v1 where request_id='${req}';`),'core-export-d2/1');
 assert.equal((await svc('service_case_export_v1','page',{...binding,leaseId:uuid(),cursor:null,limit:2})).kind,'unavailable');
 await call(f.a,mutation(f,'cancel',3));assert.equal((await service('coverage',{})).coverage,'partial');assert.equal((await service('page',{cursor:null,limit:2})).coverage,'partial');
 await db(`delete from auth.users where id='${f.a.id}';`);assert.equal(await db(`select count(*) from service_operations_private.operations where owner_id='${f.a.id}';`),'0');assert.equal(await db(`select count(*) from service_operations_private.export_progress where owner_id='${f.a.id}';`),'0');
});
const dataInvoke=(a,v,bytes=JSON.stringify(v))=>sql(container,`begin;${claims(a)}set role authenticated;select public.service_case_data_v1(${lit(v)},${lit(bytes)});commit;`);
const dataCall=async(a,v,bytes=JSON.stringify(v))=>{const r=await dataInvoke(a,v,bytes);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const dataReject=async(a,v,code,bytes=JSON.stringify(v))=>{const r=await dataInvoke(a,v,bytes);assert.notEqual(r.code,0);assert.match(r.stderr,new RegExp(code));};
run('explicit owner deletion CAS, irreversible minimal receipt and original-byte late request fence',async()=>{
 const f=await fixture();await assigned(f);const v={action:'delete',operationId:uuid(),caseId:f.caseId,grantRevision:1,confirmed:true},bytes=JSON.stringify(v,null,2);
 await dataReject(f.staff,v,'CASE_FORBIDDEN');await dataReject(f.a,{...v,confirmed:false},'INVALID_INPUT');await dataReject(f.a,{...v,grantRevision:0},'CASE_CONFLICT');
 const receipt=await dataCall(f.a,v,bytes);assert.deepEqual(Object.keys(receipt).sort(),['schemaVersion','kind','operationId','requestDigest','outcome','createdAt','allUserDataCompleted'].sort());assert.equal(receipt.outcome,'deleted');assert.equal(receipt.requestDigest,createHash('sha256').update(bytes).digest('hex'));
 assert.deepEqual((await dataCall(f.a,{action:'read_operation',operationId:v.operationId})).receipt,receipt);assert.deepEqual(await dataCall(f.a,v,bytes),receipt);await dataReject(f.a,v,'IDEMPOTENCY_KEY_REUSE');
 assert.deepEqual(await dataCall(f.a,{action:'abandon',operationId:v.operationId,mutationBytes:bytes}),receipt);assert.equal(await db(`select count(*) from service_cases_private.cases where id='${f.caseId}';`),'0');assert.equal((await dataCall(f.staff,{action:'read_operation',operationId:v.operationId})).receipt,null);
 const g=await fixture();await call(g.a,g.request);const d={action:'delete',operationId:uuid(),caseId:g.caseId,grantRevision:1,confirmed:true};const cancel=await dataCall(g.a,{action:'abandon',operationId:d.operationId,mutationBytes:JSON.stringify(d)});assert.equal(cancel.outcome,'cancelled');assert.deepEqual(await dataCall(g.a,d),cancel);assert.equal(await db(`select count(*) from service_cases_private.cases where id='${g.caseId}';`),'1');
 const h=await fixture(),r={action:'delete',operationId:uuid(),caseId:h.caseId,grantRevision:1,confirmed:true};const [execute,stop]=await Promise.all([dataCall(h.a,r),dataCall(h.a,{action:'abandon',operationId:r.operationId,mutationBytes:JSON.stringify(r)})]);assert.deepEqual(execute,stop);assert.equal(await db(`select count(*) from service_cases_private.cases where id='${h.caseId}';`),execute.outcome==='deleted'?'0':'1');
});
run('owner export companion source digest, closed columns, no staff session, bounds and source erasure',async()=>{
 const f=await fixture();await assigned(f);const input={action:'export',requestId:uuid(),confirmed:true};
 const bundle=await dataCall(f.a,input),fresh=await dataCall(f.a,input);assert.equal(bundle.sourceDigest,fresh.sourceDigest);assert.equal(bundle.ownerId,f.a.id);assert.equal(bundle.sessionId,f.a.session);assert.equal(bundle.corePackageEnrollment,'not_enrolled');assert.equal(bundle.allUserDataCompleted,false);assert.equal(bundle.coverage.brief,'unavailable');assert.equal(bundle.coverage.attachments,'unavailable');assert.ok(bundle.expiresAt-bundle.capturedAt<=30000);assert.equal(JSON.stringify(bundle).includes(f.staff.session),false);
 const outsider=await user();assert.deepEqual((await dataCall(outsider,input)).rows,[]);
 await old(f.a,{action:'revoke',caseId:f.caseId,expectedRevision:1});const erased=await dataCall(f.a,input);assert.notEqual(erased.sourceDigest,bundle.sourceDigest);for(const row of erased.rows.filter(r=>r.domain==='operation'&&r.value.erased))assert.equal(row.value.requestBytes,null);
 const large=await fixture();await call(large.a,large.request);const massive=Array.from({length:100},()=>({kind:'tutorial',note:'X'.repeat(1000),reference:'R'.repeat(300),observedAt:Date.now()}));await db(`update service_operations_private.services set evidence=${lit(massive)} where case_id='${large.caseId}';`);
 // Explicit safe column export remains bounded when several service evidence rows accumulate.
 for(let n=0;n<4;n++){const x=await fixture(large.staff);await call(x.a,x.request);await db(`update service_cases_private.cases set owner_id='${large.a.id}' where id='${x.caseId}';update service_operations_private.services set owner_id='${large.a.id}',evidence=${lit(massive)} where case_id='${x.caseId}';`);}
 await dataReject(large.a,{action:'export',requestId:uuid(),confirmed:true},'CASE_WORKSPACE_LIMIT');
});
run('membership/shift/slot withdrawn after commit denies staff body and receipt replay',async()=>{
 for(const kind of ['member','shift','slot']){
  const f=await fixture();await assigned(f);const op=await db(`select operation_id from service_operations_private.operations where case_id='${f.caseId}' and surface='staff' limit 1;`);
  await db(kind==='member'?`update service_cases_private.staff set active=false where actor_id='${f.staff.id}';`:kind==='shift'?`update service_operations_private.shifts set enabled=false where id='${f.staff.shift}';`:`delete from service_operations_private.slots where shift_id='${f.staff.shift}';`);
  await rejects(f.staff,{action:'read',caseId:f.caseId},'CASE_FORBIDDEN','staff');await rejects(f.staff,{action:'read_operation',operationId:op},'CASE_FORBIDDEN','staff');
 }
});
run('business switch off preserves independent owner data recovery/export/delete and isolation',async()=>{
 const f=await fixture();await call(f.a,f.request);await db('update service_operations_private.settings set enabled=false;');
 await rejects(f.a,{action:'workspace'},'SERVICE_OPERATIONS_DISABLED');const bundle=await dataCall(f.a,{action:'export',requestId:uuid(),confirmed:true});assert.equal(bundle.rows.filter(x=>x.domain==='case').length,1);
 const input={action:'delete',operationId:uuid(),caseId:f.caseId,grantRevision:1,confirmed:true};await dataReject(f.staff,input,'CASE_FORBIDDEN');const receipt=await dataCall(f.a,input);assert.equal(receipt.outcome,'deleted');assert.deepEqual((await dataCall(f.a,{action:'read_operation',operationId:input.operationId})).receipt,receipt);
 await db('update service_operations_private.settings set enabled=true;');
});
run('old grant revoke races acceptance on shared Case lock; replacement never revives old staff',async()=>{
 const f=await fixture();await call(f.a,f.request);
 const [accepted]=await Promise.all([invoke(f.staff,mutation(f,'accept',1),'staff'),old(f.a,{action:'revoke',caseId:f.caseId,expectedRevision:1})]);
 assert.ok(accepted.code===0||/CASE_FORBIDDEN/.test(accepted.stderr));const projection=await read(f);assert.equal(projection.status,'cancelled');assert.equal(await db(`select count(*) from service_operations_private.slots where case_id='${f.caseId}';`),'0');await rejects(f.staff,{action:'read',caseId:f.caseId},'CASE_FORBIDDEN','staff');
 const g=await fixture();await assigned(g);const newer=await operator();await old(g.a,{action:'grant',caseId:g.caseId,expectedRevision:1,recipientId:newer.id,durationMinutes:60,sharedFields:['problem']});await rejects(g.staff,{action:'read',caseId:g.caseId},'CASE_FORBIDDEN','staff');await rejects(newer,{action:'read',caseId:g.caseId},'CASE_FORBIDDEN','staff');assert.equal((await read(g)).status,'cancelled');
});
