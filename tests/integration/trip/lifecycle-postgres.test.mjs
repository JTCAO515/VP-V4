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
 const bulkLegacyOwner=await owner(),bulkLegacyTrip=uuid();await db(`insert into public.trips(id,owner_id,title) values('${bulkLegacyTrip}','${bulkLegacyOwner.owner}','Pre-migration legacy');`);
 const paginatedLegacyOwner=await owner();await db(`insert into public.trips(owner_id,title) select '${paginatedLegacyOwner.owner}','Legacy page '||n from generate_series(1,55) n;`);
 await confirm(legacyOwner,legacy);
 const resultSignatures=['public.read_trip_result_reference_v1(uuid)','public.read_trip_result_reference_v2(uuid)','public.read_result_artifacts_v1(uuid,integer)','public.read_result_artifact_v2(uuid,integer)','turn_private.comparison_common_basis_state(turn_private.result_artifacts,turn_private.result_revisions)','turn_private.result_state_v2(turn_private.result_artifacts,turn_private.result_revisions)','turn_private.publish_result_v2(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb,jsonb,boolean)'];
 const readerState=()=>db(`select jsonb_object_agg(proname,jsonb_build_object('body',prosrc,'acl',proacl)) from pg_proc where oid=any(array[${resultSignatures.map(x=>literal(x)+'::regprocedure').join(',')}]);`).then(JSON.parse);
 const originalReaders=await readerState();
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
 await t.test('bulk Trip INSERT validates statement capacity, legacy, RLS and concurrent rollback',async()=>{
  const rows=(a,n)=>Array.from({length:n},()=>({id:uuid(),owner:a.owner}));
  const insertion=values=>`insert into public.trips(id,owner_id,title) values ${values.map(x=>`('${x.id}','${x.owner}','Bulk new draft')`).join(',')};`;
  const countRows=(table,a)=>db(`select count(*) from ${table} where owner_id='${a.owner}';`);
  for(const n of [2,3]){
   const a=await owner(),values=rows(a,n),before=await read(a);await db(claims(a)+'set role authenticated;'+insertion(values));
   const snapshot=await read(a);assert.equal(snapshot.capacity.draftCount,n);assert.equal(snapshot.capacity.legacyCount,0);assert.equal(snapshot.revision,before.revision+1);
   assert.equal(await countRows('public.trips',a),String(n));assert.equal(await countRows('trip_lifecycle_private.states_v1',a),String(n));
   assert.equal(await db(`select count(*) from public.trip_version_snapshots where owner_id='${a.owner}' and version=0 and content->'days'='[]'::jsonb;`),String(n));
  }
  const full=await owner(),beforeFull=await read(full);await deny(claims(full)+'set role authenticated;'+insertion(rows(full,4)),'TRIP_CAPACITY');
  assert.deepEqual(await read(full),beforeFull);for(const table of ['public.trips','public.trip_version_snapshots','trip_lifecycle_private.states_v1'])assert.equal(await countRows(table,full),'0','four-row statement fully rolls back '+table);
  const legacyBefore=await read(bulkLegacyOwner);assert.equal(legacyBefore.capacity.legacyCount,1);await deny(claims(bulkLegacyOwner)+'set role authenticated;'+insertion(rows(bulkLegacyOwner,2)),'LEGACY_RECONCILIATION_REQUIRED');assert.deepEqual(await read(bulkLegacyOwner),legacyBefore);assert.equal(await countRows('trip_lifecycle_private.states_v1',bulkLegacyOwner),'0','old rows are never automatically classified');
  const mixA=await owner(),mixB=await owner();await db(insertion([...rows(mixA,2),...rows(mixB,2)]));for(const a of [mixA,mixB]){const s=await read(a);assert.equal(s.capacity.draftCount,2);assert.equal(s.revision,1);}
  const atomicA=await owner(),atomicB=await owner(),aa=await read(atomicA),bb=await read(atomicB);await deny(insertion([...rows(atomicA,3),...rows(atomicB,4)]),'TRIP_CAPACITY');assert.deepEqual(await read(atomicA),aa);assert.deepEqual(await read(atomicB),bb);for(const a of [atomicA,atomicB]){assert.equal(await countRows('public.trips',a),'0');assert.equal(await countRows('trip_lifecycle_private.states_v1',a),'0');}
  const actor=await owner(),foreign=await owner(),actorBefore=await read(actor),foreignBefore=await read(foreign);await deny(claims(actor)+'set role authenticated;'+insertion([...rows(actor,1),...rows(foreign,1)]),'row-level security');assert.deepEqual(await read(actor),actorBefore);assert.deepEqual(await read(foreign),foreignBefore);
  const raced=await owner(),first=rows(raced,2),second=rows(raced,2);const outcomes=await Promise.all([sql(container,claims(raced)+'set role authenticated;'+insertion(first)),sql(container,claims(raced)+'set role authenticated;'+insertion(second))]);assert.equal(outcomes.filter(x=>x.code===0).length,1);for(const x of outcomes)if(x.code!==0){assert.match(x.stderr,/TRIP_CAPACITY|LIFECYCLE_LOCK_CONFLICT|could not obtain lock/);assert.doesNotMatch(x.stderr,/LEGACY_RECONCILIATION_REQUIRED|deadlock/);}
  assert.equal((await read(raced)).capacity.draftCount,2);assert.equal(await countRows('public.trips',raced),'2');assert.equal(await countRows('public.trip_version_snapshots',raced),'2');assert.equal(await countRows('trip_lifecycle_private.states_v1',raced),'2');assert.equal(await db("select deadlocks from pg_stat_database where datname=current_database();"),'0');
 });
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
  const p=paginatedLegacyOwner; // Real historical rows seeded before the migration.
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
 await t.test('archive historical exact references retain original readers and refuse withdrawn sources',async()=>{
  const after=await readerState();
  for(const [name,value] of Object.entries(originalReaders)){
   assert.deepEqual(after[name].acl,value.acl,'original ACL preserved: '+name);
   if(!name.startsWith('read_trip_result_reference'))assert.equal(after[name].body,value.body,'original domain/reader/publisher body preserved: '+name);
  }
  const oldV1="  if exists(select 1 from public.trip_archives archive where archive.trip_id=p_trip_id and archive.owner_id=u)\n    then return jsonb_build_object('kind','empty'); end if;";
  assert.equal(after.read_trip_result_reference_v1.body.replace(/  -- VPJ61_ARCHIVE_V1_BEGIN[\s\S]*?  -- VPJ61_ARCHIVE_V1_END/,oldV1),originalReaders.read_trip_result_reference_v1.body,'v1 nonarchive body exact original');
  assert.equal(after.read_trip_result_reference_v2.body.replace(/\n -- VPJ61_ARCHIVE_V2_BEGIN[\s\S]*? -- VPJ61_ARCHIVE_V2_END/,'').replace("or exists(select 1 from privacy_private.trip_deletions where trip_id=p_trip_id)","or exists(select 1 from public.trip_archives where trip_id=p_trip_id) or exists(select 1 from privacy_private.trip_deletions where trip_id=p_trip_id)"),originalReaders.read_trip_result_reference_v2.body,'v2 nonarchive body exact original');
  const rpc=async(a,name,params)=>JSON.parse(await db((a?claims(a):service)+`select public.${name}(${Object.entries(params).map(([k,v])=>k+'=>'+(v===null?'null':typeof v==='object'?json(v):typeof v==='number'||typeof v==='boolean'?String(v):literal(v))).join(',')});`));
  async function saved(withMemory=false){
   const a=await owner(),trip=uuid(),policy=uuid(),planningPolicy=uuid(),conversation=uuid(),goal=uuid(),source=uuid(),hash='a'.repeat(64);
   await db(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at) values('${policy}','qwen','synthetic only','https://synthetic.invalid/inference','fixture','fixture','fixture','test','test','${hash}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at) values('${planningPolicy}','${policy}','local_synthetic','test','${hash}','合成','Synthetic',now()-interval '1 hour',now()+interval '1 day');`);
   await rpc(a,'accept_text_policy',{p_policy_id:policy,p_notice_hash:hash});await rpc(a,'accept_planning_policy_v1',{p_policy_id:planningPolicy,p_notice_hash:hash});
   const intake={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]};
   await rpc(a,'submit_assistant_travel_intake_v1',{p_conversation_id:conversation,p_goal_id:goal,p_message_id:source,p_parent_message_id:null,p_expected_goal_version:null,p_expected_intake_revision:0,p_idempotency_key:uuid(),p_policy_id:policy,p_locale:'en',p_text:'Synthetic travel goal',p_relationship:'goal_start',p_intake:intake,p_memory_basis:[]});
   await execute(a,await commandFor(a,'create',trip,{title:'Saved result Trip'}));await confirm(a,trip);
   await rpc(a,'set_assistant_goal_trip_link_v1',{p_operation_id:uuid(),p_conversation_id:conversation,p_goal_id:goal,p_source_message_id:source,p_expected_goal_scope_version:1,p_expected_link_version:0,p_action:'link',p_trip_id:trip,p_expected_trip_version:1,p_confirmed:true});
   const task=uuid(),turn=uuid(),thread=uuid(),message=uuid();
   await rpc(a,'submit_service_task_turn',{p_thread_id:thread,p_turn_id:turn,p_idempotency_key:uuid(),p_policy_id:policy,p_locale:'en',p_text:'Synthetic completed saved result',p_task_id:task,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null});
   await rpc(a,'submit_assistant_message_v1',{p_conversation_id:conversation,p_message_id:message,p_idempotency_key:uuid(),p_policy_id:policy,p_locale:'en',p_text:'Saved result',p_relationship:'follow_up',p_goal_id:goal,p_expected_goal_version:2,p_task_id:task,p_parent_message_id:source,p_turn_id:null});
   await db(`update turn_private.text_content set output_kind='answered',output_text='Synthetic completed output' where turn_id='${turn}';select turn_private.terminal('${turn}','completed',1);`);
   let memory=null,basis=[];
   if(withMemory){memory={id:uuid(),consent:uuid(),receipt:uuid()};await db(claims(a)+`begin;insert into public.memory_consents(id,owner_id,status) values('${memory.consent}','${a.owner}','granted');insert into public.memory_profiles(id,owner_id,source_receipt_id,consent_id,state,constraint_kind,summary) values('${memory.id}','${a.owner}','${memory.receipt}','${memory.consent}','explicit','preference','Synthetic saved preference');insert into public.memory_receipts(id,owner_id,memory_id,event_state,source_kind) values('${memory.receipt}','${a.owner}','${memory.id}','explicit','user_confirmed');commit;`);basis=[{id:memory.id,revision:Number(await db(`select revision from public.memory_profiles where id='${memory.id}';`))}];}
   const content={schemaVersion:'comparison/1',title:'Saved areas',summary:'Historical screening',options:[{id:'one',title:'One',tradeoff:'Unknown detail'},{id:'two',title:'Two',tradeoff:'Unknown detail'}],actions:[]};
   const publish=async(content,id=uuid())=>{await rpc(null,'publish_result_artifact_v2',{p_owner_id:a.owner,p_artifact_id:id,p_expected_revision:0,p_idempotency_key:uuid(),p_task_id:task,p_goal_id:goal,p_input_message_id:message,p_trip_id:trip,p_trip_version:1,p_goal_version:2,p_memory_basis:basis,p_content:content,p_evidence_basis:[]});return id;};
   const id=await publish(content);
   return {a,trip,policy,task,turn,goal,source,memory,id,publish};
  }
  const ref=(f,v)=>rpc(f.a,'read_trip_result_reference_v'+v,{p_trip_id:f.trip});
  const exact=(f,id=f.id,v=2,revision=1)=>rpc(f.a,v===2?'read_result_artifact_v2':'read_result_artifacts_v1',{p_artifact_id:id,p_revision:revision});
  const f=await saved();
  for(const v of [1,2])assert.deepEqual(await ref(f,v),{kind:'result_reference',artifactId:f.id,revision:1,tripId:f.trip});
  const decision=await f.publish({schemaVersion:'decision/1',title:'Saved choice',summary:'Pending owner choice',comparisonRef:{artifactId:f.id,revision:1},state:'pending',chosenOptionId:null,actions:[]});
  const snapshot=JSON.parse(await db(`select content||jsonb_build_object('version',1) from public.trip_version_snapshots where trip_id='${f.trip}' and version=1;`));
  const {translationPrompt}=await import('../../../lib/server/media-translation/text/contract.ts');
  const translationTurn=uuid();await rpc(f.a,'submit_text_turn',{p_thread_id:uuid(),p_turn_id:translationTurn,p_idempotency_key:uuid(),p_policy_id:f.policy,p_locale:'zh',p_text:translationPrompt({sourceLocale:'en',targetLocale:'zh',text:'Gate 3'})});
  await db(`update turn_private.text_content set output_kind='answered',output_text='{"translation":"3号门","backTranslation":"Gate 3"}' where turn_id='${translationTurn}';select turn_private.terminal('${translationTurn}','completed',1);`);
  const practical=await f.publish({schemaVersion:'practical/1',kind:'translation',sourceTurnId:translationTurn,sourceLocale:'en',targetLocale:'zh',translation:'3号门',backTranslation:'Gate 3',actions:[]});
  await db(`update turn_private.text_content set output_text=${literal(JSON.stringify(snapshot))} where turn_id='${f.turn}';`);
  const taskDraft=await f.publish({schemaVersion:'journey-draft/1',title:'Task saved draft',summary:'Synthetic completed task draft',draft:snapshot,source:{kind:'task_output',taskTurnId:f.turn},actions:[]});
  const draft=await f.publish({schemaVersion:'journey-draft/1',title:'Saved Trip',summary:'Snapshot',draft:snapshot,source:{kind:'trip_snapshot',tripId:f.trip,tripVersion:1},actions:[]});
  const proposal=JSON.parse(await db(claims(f.a)+`select row_to_json(r) from public.create_trip_proposal_patch('${f.trip}','{"expectedVersion":1,"operations":[{"kind":"set_title","title":"Pending preview"}]}') r;`));
  const preview=JSON.parse(await db(`select public.apply_trip_content_patch(s.content,p.patch)||jsonb_build_object('version',2) from public.trip_version_snapshots s join public.trip_proposals p on p.trip_id=s.trip_id where p.id='${proposal.proposal_id}' and s.version=1;`));
  const previewId=await f.publish({schemaVersion:'journey-draft/1',title:'Pending preview',summary:'Never confirmed',draft:preview,source:{kind:'proposal_preview',proposalId:proposal.proposal_id,proposalRevision:proposal.revision},actions:[]});
  const proposalId=await f.publish({schemaVersion:'change-proposal-reference/1',proposalId:proposal.proposal_id,proposalRevision:proposal.revision,actions:[]});
  await execute(f.a,await commandFor(f.a,'archive',f.trip,{expectedHeadVersion:1,preference:{action:'skip'}}));
  const v1=await ref(f,1),v2=await ref(f,2);assert.equal(v1.artifactId,f.id);assert.equal(v1.archiveHistorical,true);assert.equal(v2.artifactId,draft);assert.equal(v2.archiveHistorical,true);
  for(const id of [f.id,decision,practical,taskDraft,draft]){const result=await exact(f,id);assert.equal(result.kind,'result_artifact');assert.equal(result.current,false);assert.equal(result.historicalReadable,true);assert.equal(result.source.tripId,f.trip);assert.equal(result.artifactId,id);}
  assert.equal((await exact(f,previewId)).current,false,'original exact preview reader is unchanged');assert.equal((await exact(f,proposalId)).kind,'unavailable','proposal execution/reference qualification remains denied');
  assert.equal((await rpc(f.a,'choose_result_decision_v2',{p_artifact_id:decision,p_expected_revision:1,p_operation_id:uuid(),p_option_id:'one'})).kind,'unavailable','historical decision cannot execute');
  assert.equal((await exact(f,uuid())).kind,'empty');assert.equal((await exact(f,f.id,2,2)).kind,'empty');
  const foreign=await owner();assert.equal((await rpc(foreign,'read_trip_result_reference_v2',{p_trip_id:f.trip})).kind,'empty');assert.equal((await rpc(foreign,'read_result_artifact_v2',{p_artifact_id:f.id,p_revision:1})).kind,'empty');
  await db(`delete from turn_private.result_artifacts where id in ('${f.id}','${draft}','${practical}','${taskDraft}');`);
  assert.equal(await db(`select count(*) from turn_private.result_artifacts where owner_id='${f.a.owner}' and trip_id='${f.trip}';`),'2','only pending proposal/preview stored candidates remain');
  for(const v of [1,2])assert.equal((await ref(f,v)).kind,'unavailable','stored but unreadable proposal candidates cannot become an empty result');
  const empty={a:await owner(),trip:uuid()};await execute(empty.a,await commandFor(empty.a,'create',empty.trip,{title:'No saved result'}));await confirm(empty.a,empty.trip);await execute(empty.a,await commandFor(empty.a,'archive',empty.trip,{expectedHeadVersion:1,preference:{action:'skip'}}));for(const v of [1,2])assert.equal((await ref(empty,v)).kind,'empty','no saved candidate remains empty');
  // Separate stored real-publisher fixtures make each withdrawn basis terminal,
  // so a healthy fallback cannot hide a rejected source in this check.
  for(const mode of ['consent','memory','source','withdrawal','deletion']){
   const x=await saved(mode==='memory');await execute(x.a,await commandFor(x.a,'archive',x.trip,{expectedHeadVersion:1,preference:{action:'skip'}}));assert.equal((await ref(x,2)).archiveHistorical,true);
   if(mode==='consent')await db(`update turn_private.text_consents set revoked_at=now() where owner_id='${x.a.owner}' and policy_id='${x.policy}';`);
   if(mode==='memory')await db(claims(x.a)+`select * from public.transition_memory_profile('${x.memory.id}','deleted');`);
   if(mode==='source')await db(`update turn_private.text_content set hidden_at=now() where turn_id='${x.turn}';`);
   if(mode==='withdrawal')await rpc(null,'withdraw_result_artifact_v1',{p_owner_id:x.a.owner,p_artifact_id:x.id,p_expected_revision:1});
   if(mode==='deletion')await db(claims(x.a)+`insert into privacy_private.trip_deletions(request_id,owner_id,trip_id,expected_version) values('${uuid()}','${x.a.owner}','${x.trip}',1);`);
   assert.equal((await exact(x)).kind,'unavailable',mode+' original exact reader rejects');
   assert.equal((await ref(x,1)).kind,'unavailable',mode+' v1 rejects');assert.equal((await ref(x,2)).kind,mode==='deletion'?'empty':'unavailable',mode+' preserves v2 original deletion response');
  }
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
