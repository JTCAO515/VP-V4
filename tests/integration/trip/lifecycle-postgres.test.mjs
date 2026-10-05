// One disposable PostgreSQL, full accepted migration chain. Synthetic Auth tables
// and administrator claims are SQL evidence, never signed Auth/target acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_ARCHIVE_DB_TEST==='1';
const migration='20261005040000_vpj61_trip_lifecycle.sql';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const json=v=>literal(JSON.stringify(v))+'::jsonb';
const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';`;
const service="set request.jwt.claim.role='service_role';set request.jwt.claim.sub='';set request.jwt.claims='{\"role\":\"service_role\"}';";
const sha=v=>createHash('sha256').update(v).digest('hex');

test('VPJ-61 SQL lifecycle, existing writers, locks, erasure and versioned export', {skip:!enabled,timeout:300000}, async t=>{
 const container='vpj61-lifecycle-'+uuid().slice(0,8);
 assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);
 const context=JSON.parse((await command('docker',['context','inspect'])).stdout)[0];
 assert.ok(context.Endpoints.docker.Host.startsWith('unix:///'));
 const started=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(started.code,0,started.stderr);
 t.after(async()=>assert.equal((await command('docker',['rm','-f',container])).code,0));
 const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 const deny=async(q,expected)=>{const r=await sql(container,q);assert.notEqual(r.code,0,r.stdout);assert.match(r.stderr,new RegExp(expected));return r;};
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;create schema extensions;create extension pgcrypto with schema extensions;");
 // Existing legacy data is seeded BEFORE the new enforcement migration.
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<migration).sort())await db('begin;'+readFileSync('supabase/migrations/'+file,'utf8')+'commit;');
 async function owner(mobile=true){const a={owner:uuid(),session:uuid()};await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${a.owner}',1,'${a.session}');${mobile?`insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${a.session}',1);`:''}`);return a;}
 const legacyOwner=await owner(), legacy=uuid(),legacyDraft=uuid();
 await db(claims(legacyOwner)+`insert into public.trips(id,owner_id,title) values('${legacy}','${legacyOwner.owner}','Historical'),('${legacyDraft}','${legacyOwner.owner}','Unconfirmed legacy');`);
 const confirmed=new Map();
 async function confirm(a,id,title='Saved Trip'){const proposal=JSON.parse(await db(claims(a)+`select row_to_json(r) from public.create_trip_proposal_patch('${id}',jsonb_build_object('expectedVersion',(select head_version from public.trips where id='${id}'),'operations',jsonb_build_array(jsonb_build_object('kind','set_title','title',${literal(title)})))) r;`));const digest=await db(claims(a)+`select digest from public.read_trip_proposal_v2('${proposal.proposal_id}');`);const key=uuid();const receipt=await db(claims(a)+`select * from public.confirm_and_apply_trip_proposal('${proposal.proposal_id}','${key}','${digest}');`);const result={id:proposal.proposal_id,digest,key,receipt};confirmed.set(id,result);return result;}
 await confirm(legacyOwner,legacy);
 const originalArchive=await db("select md5(prosrc) from pg_proc where oid='public.archive_trip_v1(uuid,integer,uuid,boolean)'::regprocedure;");
 const originalExport=await db("select md5(prosrc) from pg_proc where oid='public.privacy_core_export_v1(text,jsonb)'::regprocedure;");
 await db('begin;'+readFileSync('supabase/migrations/'+migration,'utf8')+'commit;');
 assert.equal(await db("select md5(prosrc) from pg_proc where oid='public.archive_trip_v1(uuid,integer,uuid,boolean)'::regprocedure;"),originalArchive);
 assert.equal(await db("select md5(prosrc) from pg_proc where oid='public.privacy_core_export_v1(text,jsonb)'::regprocedure;"),originalExport);
 const call=async(a,action,input={},raw)=>JSON.parse(await db(claims(a)+`select public.trip_lifecycle_v1('${action}',${json(input)},${raw===undefined?'null':literal(raw)});`));
 const read=a=>call(a,'read');
 const commandFor=async(a,action,tripId,extra={})=>{const s=await read(a);return {action,operationId:uuid(),expectedRevision:s.revision,expectedActiveTripId:s.capacity.activeTripId,expectedSessionId:a.session,confirmed:true,tripId,...extra};};
 const execute=(a,c,raw=JSON.stringify(c))=>call(a,'execute',c,raw);
 await t.test('ACL/RLS/default-deny and legacy reconciliation',async()=>{
  assert.equal(await db("select count(*) from pg_tables where schemaname='trip_lifecycle_private' and not rowsecurity;"),'0');
  assert.equal(await db("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values('anon'),('authenticated'),('service_role')) roles(r) where (n.nspname='trip_lifecycle_private' or p.proname in('trip_lifecycle_v1','trip_lifecycle_export_v2')) and has_function_privilege(roles.r,p.oid,'EXECUTE');"),'0');
  for(const role of ['anon','authenticated','service_role'])await deny(`set role ${role};select public.trip_lifecycle_v1('read','{}');`,'permission denied');
  const s=await read(legacyOwner);assert.equal(s.capacity.legacyCount,2);assert.equal(s.capacity.activeTripId,null);assert.equal(s.revision,0);
  const blocked=await execute(legacyOwner,await commandFor(legacyOwner,'create',uuid(),{title:'Next'}));assert.equal(blocked.reason,'LEGACY_RECONCILIATION_REQUIRED');assert.equal(blocked.revision,0);
  const retained=await execute(legacyOwner,await commandFor(legacyOwner,'reconcile',legacy,{expectedHeadVersion:1,state:'retained'}));assert.equal(retained.state,'retained');
  const bad=await execute(legacyOwner,await commandFor(legacyOwner,'reconcile',legacyDraft,{expectedHeadVersion:0,state:'retained'}));assert.equal(bad.reason,'PROPOSAL_NOT_CONFIRMABLE');
  await execute(legacyOwner,await commandFor(legacyOwner,'reconcile',legacyDraft,{expectedHeadVersion:0,state:'draft'}));
  assert.equal((await read(legacyOwner)).capacity.legacyCount,0);
 });
 const a=await owner(),b=await owner(),web=await owner(false);let trip,active,second;
 await t.test('canonical input, exact raw replay, durable rejection and unknown abandon',async()=>{
  trip=uuid();const c=await commandFor(a,'create',trip,{title:'New Trip'});const raw=JSON.stringify(c,null,2);const r=await execute(a,c,raw);
  assert.equal(r.status,'applied');assert.equal(r.requestDigest,sha(raw));assert.equal(r.revision,c.expectedRevision+1);
  assert.deepEqual(await execute(a,c,raw),r);assert.deepEqual((await call(a,'recover',{operationId:c.operationId})).receipt,r);
  await deny(claims(a)+`select public.trip_lifecycle_v1('execute',${json(c)},${literal(JSON.stringify(c))});`,'LIFECYCLE_OPERATION_REUSE');
  assert.deepEqual((await call(a,'recover',{operationId:c.operationId})).receipt,r);
  await deny(claims(a)+`select public.trip_lifecycle_v1('execute',${json({...c,extra:true})},${literal(JSON.stringify({...c,extra:true}))});`,'INVALID_INPUT');
  const reused=await execute(a,await commandFor(a,'create',trip,{title:'Again'}));assert.equal(reused.reason,'IDEMPOTENCY_KEY_REUSE');
  const stale=await commandFor(a,'create',uuid(),{title:'Stale'});stale.expectedRevision=0;const declined=await execute(a,stale);assert.equal(declined.reason,'LIFECYCLE_CONFLICT');assert.deepEqual(await execute(a,stale),declined);
  const pending=await commandFor(a,'create',uuid(),{title:'Cancelled'});assert.equal((await call(a,'recover',{operationId:pending.operationId})).receipt,null);
  const abandoned=await call(a,'abandon',pending,JSON.stringify(pending));assert.equal(abandoned.reason,'USER_ABANDONED');assert.deepEqual(await execute(a,pending),abandoned);
  assert.deepEqual(await call(a,'abandon',c,raw),r);
  const foreign=await commandFor(b,'archive',trip,{expectedHeadVersion:1,preference:{action:'skip'}});await deny(claims(b)+`select public.trip_lifecycle_v1('execute',${json(foreign)},${literal(JSON.stringify(foreign))});`,'FORBIDDEN');
  assert.equal((await read(web)).sessionId,web.session,'ordinary Web sessions coexist');
  assert.equal((await execute(web,await commandFor(web,'create',uuid(),{title:'vacation v'}))).status,'applied','PostgreSQL whitespace syntax must not strip the letter v');
  const title=await commandFor(a,'create',uuid(),{title:'😀'.repeat(81)});await deny(claims(a)+`select public.trip_lifecycle_v1('execute',${json(title)},${literal(JSON.stringify(title))});`,'INVALID_INPUT');
 });
 await t.test('old direct create shares capacity, actual producer confirm, active swaps and rollback',async()=>{
  await confirm(a,trip);active=trip;assert.equal((await execute(a,await commandFor(a,'activate',trip,{expectedHeadVersion:1}))).state,'active');
  second=uuid();await db(claims(a)+`insert into public.trips(id,owner_id,title) values('${second}','${a.owner}','Old Native insertion');`);await confirm(a,second);
  const s=await read(a);assert.equal(s.capacity.draftCount,1);assert.equal((await execute(a,await commandFor(a,'activate',second,{expectedHeadVersion:1}))).capacity.draftCount,1);active=second;
  const fail=await execute(a,await commandFor(a,'reconcile',trip,{expectedHeadVersion:1,state:'retained'}));assert.equal(fail.reason,'LIFECYCLE_CONFLICT','new drafts cannot hide as retained');
  for(let i=0;i<2;i++)await execute(a,await commandFor(a,'create',uuid(),{title:'Draft'}));
  await deny(claims(a)+`insert into public.trips(owner_id,title) values('${a.owner}','Fourth draft');`,'TRIP_CAPACITY');
  const r=await execute(a,await commandFor(a,'create',uuid(),{title:'Over'}));assert.equal(r.reason,'TRIP_CAPACITY');
  assert.equal((await read(a)).capacity.activeTripId,second);
  assert.deepEqual(JSON.parse(await db(`select content->'days' from public.trip_version_snapshots where trip_id='${second}' and version=0;`)),[]);
 });
 let archiveReceipt,archiveCommand,memory;
 await t.test('original archive atomic failure, keep/skip qualification, services retained and erasure',async()=>{
  const m={id:uuid(),receipt:uuid(),consent:uuid()};memory=m;
  await db(claims(a)+`begin;insert into public.memory_consents(id,owner_id,status) values('${m.consent}','${a.owner}','granted');insert into public.memory_profiles(id,owner_id,source_receipt_id,consent_id,state,constraint_kind,summary) values('${m.id}','${a.owner}','${m.receipt}','${m.consent}','explicit','preference','Explicit preference');insert into public.memory_receipts(id,owner_id,memory_id,event_state,source_kind) values('${m.receipt}','${a.owner}','${m.id}','explicit','user_confirmed');commit;`);
  const revision=Number(await db(`select revision from public.memory_profiles where id='${m.id}';`));
  const refs=[{memoryId:m.id,revision,sourceReceiptId:m.receipt,consentId:m.consent}];
  const caseId=uuid(),turnId=uuid();await db(claims(a)+`insert into service_cases_private.cases(id,owner_id,category,problem) values('${caseId}','${a.owner}','general','Synthetic unresolved service');insert into public.turns(id,owner_id,trip_id,status) values('${turnId}','${a.owner}','${second}','accepted');`);
  const services=await db(`select row_to_json(c) from service_cases_private.cases c where id='${caseId}';select row_to_json(t) from public.turns t where id='${turnId}';`);
  const before=await read(a);archiveCommand=await commandFor(a,'archive',second,{expectedHeadVersion:1,preference:{action:'keep',memoryRefs:refs}});
  await db("create function private.lifecycle_fault() returns trigger language plpgsql as $$begin if new.action='trip_archived' then raise exception 'FAULT_AFTER_ARCHIVE';end if;return new;end$$;create trigger lifecycle_fault before insert on private.audit_events for each row execute function private.lifecycle_fault();");
  await deny(claims(a)+`select public.trip_lifecycle_v1('execute',${json(archiveCommand)},${literal(JSON.stringify(archiveCommand))});`,'FAULT_AFTER_ARCHIVE');
  assert.deepEqual(await read(a),before);assert.equal((await call(a,'recover',{operationId:archiveCommand.operationId})).receipt,null);
  await db('drop trigger lifecycle_fault on private.audit_events;drop function private.lifecycle_fault();');
  await db("create function private.lifecycle_fault() returns trigger language plpgsql as $$begin if new.action='trip_archived' then raise exception 'MEMORY_CONFLICT';end if;return new;end$$;create trigger lifecycle_fault before insert on private.audit_events for each row execute function private.lifecycle_fault();");
  const lateBusiness={...archiveCommand,operationId:uuid()};const rejected=await execute(a,lateBusiness);assert.equal(rejected.reason,'MEMORY_CONFLICT');assert.deepEqual(await read(a),before,'subtransaction retains original Active/revision after late business fault');
  await db('drop trigger lifecycle_fault on private.audit_events;drop function private.lifecycle_fault();');
  assert.deepEqual(await execute(a,lateBusiness),rejected,'terminal rejection never later applies');
  const bad=await commandFor(a,'archive',second,{expectedHeadVersion:1,preference:{action:'keep',memoryRefs:[{...refs[0],revision:revision+1}]}});
  const declined=await execute(a,bad);assert.equal(declined.reason,'MEMORY_CONFLICT');assert.deepEqual(await read(a),before);assert.deepEqual(await execute(a,bad),declined);
  archiveReceipt=await execute(a,archiveCommand);assert.equal(archiveReceipt.state,'archived');assert.equal(archiveReceipt.preference,'kept');assert.equal(archiveReceipt.revision,before.revision+1);assert.equal(archiveReceipt.capacity.activeTripId,null);
  assert.equal(await db(`select row_to_json(c) from service_cases_private.cases c where id='${caseId}';select row_to_json(t) from public.turns t where id='${turnId}';`),services);
  assert.equal((await read(a)).serviceStatus,'unavailable');
  const original=confirmed.get(second);assert.equal(await db(claims(a)+`select * from public.confirm_and_apply_trip_proposal('${original.id}','${original.key}','${original.digest}');`),original.receipt.replace(/^applied\|/,'already_applied|'),'original confirmed replay remains readable after archive');
  await deny(`update trip_lifecycle_private.operations_v1 set receipt='{}' where owner_id='${a.owner}' and operation_id='${archiveCommand.operationId}';`,'LIFECYCLE_OPERATION_REUSE');
  // Existing content guard still blocks a new confirmed write after archive.
  await deny(claims(a)+`update public.trips set head_version=2 where id='${second}';`,'PROPOSAL_NOT_CONFIRMABLE');
  const old=await read(a);await db(claims(a)+`select * from public.archive_trip_v1('${trip}',1,'${uuid()}',true);`);const current=await read(a);assert.equal(current.revision,old.revision+1);assert.equal(current.capacity.draftCount,2);
  const swapOp=await db(`select operation_id from trip_lifecycle_private.operations_v1 where owner_id='${a.owner}' and trip_id='${second}' and previous_active_trip_id='${trip}' and receipt->>'action'='activate';`);
  assert.ok(swapOp);await db(claims(a)+`select public.request_trip_deletion_v1('${uuid()}','${trip}',1,true);`);
  await deny(claims(a)+`select public.trip_lifecycle_v1('recover',${json({operationId:swapOp})});`,'FORBIDDEN');
  assert.equal(await db(`select session_id is null and receipt is null and request_bytes is null and previous_active_trip_id is null from trip_lifecycle_private.operations_v1 where owner_id='${a.owner}' and operation_id='${swapOp}';`),'t','deleting previous Active erases another Trip operation without a replayable session');
  await db(claims(a)+`select * from public.transition_memory_profile('${m.id}','deleted');`);
  await deny(claims(a)+`select public.trip_lifecycle_v1('recover',${json({operationId:archiveCommand.operationId})});`,'MEMORY_CONFLICT');
  assert.equal(await db(`select request_bytes is null and request_digest is null and receipt is null and trip_id is null and previous_active_trip_id is null from trip_lifecycle_private.operations_v1 where owner_id='${a.owner}' and operation_id='${archiveCommand.operationId}';`),'t');
  assert.equal(await db(`select count(*) from trip_lifecycle_private.memory_edges_v1 where owner_id='${a.owner}';`),'0');
 });
 await t.test('paginated revision fences real head/delete mutations and old replay survives archive',async()=>{
  const p=await owner();
  // Seed historical data through a pre-migration-style fixture, NOT a user path.
  await db(`alter table public.trips disable trigger a_lifecycle_trip_change_v1;alter table public.trips disable trigger lifecycle_trip_inserted_v1;insert into public.trips(owner_id,title) select '${p.owner}','Legacy page '||n from generate_series(1,55) n;alter table public.trips enable trigger a_lifecycle_trip_change_v1;alter table public.trips enable trigger lifecycle_trip_inserted_v1;`);
  const page=await read(p);assert.equal(page.trips.length,50);assert.equal(page.capacity.legacyCount,55);assert.equal(page.nextTripId,page.trips.at(-1).tripId);
  const last=await call(p,'read',{afterTripId:page.nextTripId,expectedRevision:page.revision});assert.equal(last.trips.length,5);assert.equal(last.nextTripId,null);
  await confirm(p,page.trips[0].tripId);await deny(claims(p)+`select public.trip_lifecycle_v1('read',${json({afterTripId:page.nextTripId,expectedRevision:page.revision})});`,'LIFECYCLE_CONFLICT');
  const c=await commandFor(p,'reconcile',page.trips[0].tripId,{expectedHeadVersion:1,state:'retained'});const receipt=await execute(p,c);
  const before=await read(p);await db(claims(p)+`delete from public.trips where id='${page.trips[0].tripId}';`);assert.equal((await read(p)).revision,before.revision+1);
  await deny(claims(p)+`select public.trip_lifecycle_v1('execute',${json(c)},${literal(JSON.stringify(c))});`,'FORBIDDEN');
  assert.equal(await db(`select receipt is null and request_bytes is null from trip_lifecycle_private.operations_v1 where owner_id='${p.owner}' and operation_id='${receipt.operationId}';`),'t');
 });
 await t.test('real lock conflicts remain unknown, same-op concurrent create, account replacement and rollback',async()=>{
  const p=await owner(),id=uuid(),c=await commandFor(p,'create',id,{title:'Race'});
  const q=claims(p)+`select public.trip_lifecycle_v1('execute',${json(c)},${literal(JSON.stringify(c))});`;
  const results=await Promise.all([sql(container,q),sql(container,q)]);
  for(const r of results)if(r.code!==0)assert.match(r.stderr,/LIFECYCLE_LOCK_CONFLICT|could not obtain lock/);
  assert.ok(results.some(r=>r.code===0));assert.equal((await execute(p,c)).status,'applied');assert.equal((await read(p)).capacity.draftCount,1);
  async function hold(sqlText,whileHeld){
   const marker='lifecycle-hold-'+uuid();const running=sql(container,`set application_name='${marker}';begin;${sqlText};select pg_sleep(0.8);commit;`);
   let held=false;for(let i=0;i<40;i++){if(await db(`select count(*) from pg_stat_activity where application_name='${marker}' and wait_event='PgSleep';`)==='1'){held=true;break;}await new Promise(r=>setTimeout(r,10));}
   assert.ok(held,'barrier acquired real DB lock');await whileHeld();assert.equal((await running).code,0);
  }
  const unknown=await commandFor(p,'create',uuid(),{title:'Held account'});
  await hold(`select 1 from identity_private.mobile_accounts where owner_id='${p.owner}' for update`,async()=>{
   await deny(claims(p)+`select public.trip_lifecycle_v1('execute',${json(unknown)},${literal(JSON.stringify(unknown))});`,'could not obtain lock');
  });
  assert.equal((await call(p,'recover',{operationId:unknown.operationId})).receipt,null);assert.equal((await execute(p,unknown)).status,'applied');
  await confirm(p,id);const ac=await commandFor(p,'activate',id,{expectedHeadVersion:1});
  await hold(`select 1 from public.trips where id='${id}' for update`,async()=>{
   await deny(claims(p)+`select public.trip_lifecycle_v1('execute',${json(ac)},${literal(JSON.stringify(ac))});`,'could not obtain lock');
  });assert.equal((await execute(p,ac)).status,'applied');
  const archive=await commandFor(p,'archive',id,{expectedHeadVersion:1,preference:{action:'skip'}});
  await hold(`select pg_advisory_xact_lock(hashtextextended('trip-archive:${p.owner}',0))`,async()=>{
   await deny(claims(p)+`select public.trip_lifecycle_v1('execute',${json(archive)},${literal(JSON.stringify(archive))});`,'LIFECYCLE_LOCK_CONFLICT');
  });assert.equal((await execute(p,archive)).status,'applied');
  // Linked-delete uses owner advisory seed 34 before account. Collision fails
  // without turning a concurrent transition into a permanent business decline.
  const after=await commandFor(p,'create',uuid(),{title:'Deletion lock'});
  await hold(`select pg_advisory_xact_lock(hashtextextended('${p.owner}',34))`,async()=>{
   await deny(claims(p)+`insert into public.trips(owner_id,title) values('${p.owner}','Direct old create');`,'LIFECYCLE_LOCK_CONFLICT');
   await deny(claims(p)+`select public.trip_lifecycle_v1('execute',${json(after)},${literal(JSON.stringify(after))});`,'LIFECYCLE_LOCK_CONFLICT');
  });assert.equal((await call(p,'recover',{operationId:after.operationId})).receipt,null);
  const replacement=uuid(),attempt=uuid();await db(`insert into auth.sessions(id,user_id) values('${replacement}','${p.owner}');insert into identity_private.mobile_login_proofs(session_id,owner_id,attempt_id,expires_at) values('${replacement}','${p.owner}','${attempt}',now()+interval '1 minute');`);
  const next={...p,session:replacement};await db(claims(next)+`select public.native_session_v2('login','${attempt}');`);
  await deny(claims(p)+`select public.trip_lifecycle_v1('execute',${json(after)},${literal(JSON.stringify(after))});`,'SESSION_REPLACED');
  await deny(claims(next)+`select public.trip_lifecycle_v1('recover',${json({operationId:c.operationId})});`,'FORBIDDEN');
  assert.equal(await db("select deadlocks from pg_stat_database where datname=current_database();"),'0');
 });
 await t.test('actual old create/confirm/archive/delete/replacement transactions race the lifecycle entry',async()=>{
  async function barrier(text,fn){const marker='vpj61-old-'+uuid();const running=sql(container,`set application_name='${marker}';begin;${text};select pg_sleep(0.5);commit;`);let held=false;for(let i=0;i<50;i++){if(await db(`select count(*) from pg_stat_activity where application_name='${marker}' and wait_event='PgSleep';`)==='1'){held=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(held);await fn();const r=await running;assert.equal(r.code,0,r.stderr);}
  const p=await owner(),id=uuid(),racing=await commandFor(p,'create',uuid(),{title:'Concurrent new create'});
  const unknown=c=>deny(claims(p)+`select public.trip_lifecycle_v1('execute',${json(c)},${literal(JSON.stringify(c))});`,'LIFECYCLE_LOCK_CONFLICT|could not obtain lock');
  await barrier(claims(p)+`insert into public.trips(id,owner_id,title) values('${id}','${p.owner}','Original insert')`,()=>unknown(racing));
  assert.equal((await call(p,'recover',{operationId:racing.operationId})).receipt,null);assert.equal((await execute(p,racing)).reason,'LIFECYCLE_CONFLICT');
  const prop=JSON.parse(await db(claims(p)+`select row_to_json(r) from public.create_trip_proposal_patch('${id}','{"expectedVersion":0,"operations":[{"kind":"set_title","title":"Confirmed original"}]}') r;`));
  const digest=await db(claims(p)+`select digest from public.read_trip_proposal_v2('${prop.proposal_id}');`),key=uuid();
  const activation=await commandFor(p,'activate',id,{expectedHeadVersion:0});
  await barrier(claims(p)+`select * from public.confirm_and_apply_trip_proposal('${prop.proposal_id}','${key}','${digest}')`,()=>unknown(activation));
  assert.equal((await execute(p,activation)).reason,'LIFECYCLE_CONFLICT');
  await execute(p,await commandFor(p,'activate',id,{expectedHeadVersion:1}));
  const fresh=await commandFor(p,'create',uuid(),{title:'Archive race'});
  await barrier(claims(p)+`select * from public.archive_trip_v1('${id}',1,'${uuid()}',true)`,()=>unknown(fresh));
  assert.equal((await read(p)).capacity.activeTripId,null);assert.equal((await execute(p,fresh)).reason,'LIFECYCLE_CONFLICT');
  const deletion=uuid(),before=await read(p);
  await barrier(claims(p)+`select public.request_trip_deletion_v1('${deletion}','${id}',1,true)`,async()=>unknown(await commandForOtherScope(p)));
  async function commandForOtherScope(actor){return {action:'create',operationId:uuid(),expectedRevision:before.revision,expectedActiveTripId:null,expectedSessionId:actor.session,confirmed:true,tripId:uuid(),title:'Delete race'};}
  assert.equal((await read(p)).trips.some(x=>x.tripId===id),false);
  assert.equal(await db(`select count(*) from trip_lifecycle_private.operations_v1 where owner_id='${p.owner}' and trip_id='${id}' and request_bytes is not null;`),'0');
  await barrier(service+`select public.execute_trip_deletion_v1('${deletion}')`,async()=>unknown(await commandForOtherScope(p)));
  assert.equal(await db(`select count(*) from public.trips where id='${id}';`),'0');
  const replacement=uuid(),attempt=uuid();await db(`insert into auth.sessions(id,user_id) values('${replacement}','${p.owner}');insert into identity_private.mobile_login_proofs(session_id,owner_id,attempt_id,expires_at) values('${replacement}','${p.owner}','${attempt}',now()+interval '1 minute');`);
  const next={...p,session:replacement},pending=await commandFor(p,'create',uuid(),{title:'Session race'});
  await barrier(claims(next)+`select public.native_session_v2('login','${attempt}')`,()=>unknown(pending));
  await deny(claims(p)+`select public.trip_lifecycle_v1('execute',${json(pending)},${literal(JSON.stringify(pending))});`,'SESSION_REPLACED');
  assert.equal(await db("select deadlocks from pg_stat_database where datname=current_database();"),'0');
 });
 await t.test('v2 export exact lease enrollment, old decoder preservation, source fence and delete cascade',async()=>{
  await db(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) values('${uuid()}',1,true,'local','synthetic',90000,600000,300000,1000,100,8388608,now()+interval '1 day');`);
  const p=await owner(),tripId=uuid(),request=uuid();await execute(p,await commandFor(p,'create',tripId,{title:'Exported Trip'}));
  await db(claims(p)+`select public.privacy_core_export_v1('request',${json({requestId:request,confirmed:true})});`);
  const lease=JSON.parse(await db(service+`select public.privacy_core_export_v1('claim',${json({requestId:request,operationId:uuid(),maxRunMs:90000,expectedEnvironment:'local',expectedKeyId:'synthetic'})});`));
  const binding={requestId:request,leaseId:lease.leaseId,generation:lease.generation};
  const exp=async(action,input)=>JSON.parse(await db(service+`select public.trip_lifecycle_export_v2('${action}',${json(input)});`));
  assert.equal((await exp('proof',binding)).coverage,'partial');
  assert.equal((await exp('enroll',binding)).enrolled,true);
  const page=await exp('page',{...binding,section:'trips',cursor:null,limit:50});assert.equal(page.schemaVersion,'trip-lifecycle-export/2');assert.equal(page.items[0].lifecycle.state,'draft');
  assert.deepEqual(await exp('page',{...binding,section:'trips',cursor:null,limit:50}),page);
  const ops=await exp('page',{...binding,section:'operations',cursor:null,limit:50});assert.equal(ops.items.length,1);assert.equal(JSON.stringify(ops).includes('request_bytes'),false);
  assert.equal((await exp('proof',binding)).coverage,'complete');
  const old=JSON.parse(await db(service+`select public.privacy_core_export_v1('trip_page',${json({...binding,afterTripId:null,limit:50})});`));assert.equal(old.schemaVersion,'trip-core-export/1');assert.equal('lifecycle' in old.items[0],false);
  assert.equal((await exp('proof',{...binding,leaseId:uuid()})).kind,'unavailable');
  await confirm(p,tripId);assert.equal((await exp('proof',binding)).coverage,'partial');
  await db(`delete from auth.users where id='${p.owner}';`);assert.equal(await db(`select count(*) from trip_lifecycle_private.operations_v1 where owner_id='${p.owner}';`),'0');
 });
});
