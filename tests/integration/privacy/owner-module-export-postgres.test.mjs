// Owned isolated SQL claims fixtures, never target enrollment or signed Auth proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_COVERAGE_DB_TEST==='1';
const migration='20261006010000_owner_module_export.sql';
const lit=v=>"'"+String(v).replaceAll("'","''")+"'";
const json=v=>lit(JSON.stringify(v))+'::jsonb';
const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';`;
const nscope='notification-metadata/1',lscope='trip-lifecycle-metadata/1';
const expectedKeys=(kind)=>['schemaVersion','kind','requestId','scope','ownerId','sessionId','mobileEpoch','sourceDigest','capturedAt','expiresAt','allUserDataCompleted',...(kind==='started'?['sections','limits']:kind==='page'?['section','items','hasMore','nextCursor','sectionComplete','pageNumber']:['coverage','pages','rows'])].sort();

test('VPJ-58 isolated full replay, owner metadata pagination, proof and adversarial bounds',{skip:!enabled,timeout:300000},async t=>{
 const container='vpj58-owner-export-'+uuid().slice(0,8);
 assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);
 const context=JSON.parse((await command('docker',['context','inspect'])).stdout)[0];assert.ok(context.Endpoints.docker.Host.startsWith('unix:///'));
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);
 t.after(async()=>assert.equal((await command('docker',['rm','-f',container])).code,0));
 const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 const deny=async(q,code)=>{const r=await sql(container,q);assert.notEqual(r.code,0,r.stdout);assert.match(r.stderr,new RegExp(code));return r.stderr;};
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;create schema extensions;create extension pgcrypto with schema extensions;");
 const oldFunctions=()=>db("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'source',p.prosrc,'acl',p.proacl,'config',p.proconfig,'security',p.prosecdef) order by n.nspname,p.oid::regprocedure::text),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in('pg_catalog','information_schema','coverage_export_private') and p.proname<>'privacy_coverage_module_export_v1';");
 const oldTables=()=>db("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity,'columns',(select jsonb_agg(jsonb_build_object('name',attname,'type',atttypid::regtype::text,'notNull',attnotnull) order by attnum) from pg_attribute a where a.attrelid=c.oid and attnum>0 and not attisdropped)) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','coverage_export_private');");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<migration).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const sourceData=()=>db(`create temp table own_source_digests_v1(name text,digest text);
 do $$declare r record;d text;begin
  for r in select schemaname,tablename from pg_tables where schemaname not in('pg_catalog','information_schema','coverage_export_private') and schemaname not like 'pg_temp%' order by schemaname,tablename loop
   execute format($query$select md5(coalesce(string_agg(to_jsonb(x)::text,'' order by to_jsonb(x)::text),'')) from %I.%I x$query$,r.schemaname,r.tablename) into d;
   insert into own_source_digests_v1 values(r.schemaname||'.'||r.tablename,d);
  end loop;
 end$$;select jsonb_agg(jsonb_build_object('table',name,'digest',digest) order by name) from own_source_digests_v1;`);
 const beforeFunctions=await oldFunctions(),beforeTables=await oldTables();
 const src=readFileSync('supabase/migrations/'+migration,'utf8');
 await t.test('full-chain transactional rollback and unchanged old functions/tables/ACL',async()=>{
  await db('begin;'+src+'rollback;');assert.equal(await db("select to_regnamespace('coverage_export_private') is null;"),'t');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;'+src+'commit;');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
 });
 assert.equal(await db("select to_regprocedure('public.privacy_coverage_module_export_v1(jsonb)') is not null;"),'t');
 await t.test('API ACL/RLS default deny before separate fixture grant',async()=>{
  for(const role of ['anon','authenticated','service_role']){
   assert.equal(await db(`select has_schema_privilege('${role}','coverage_export_private','USAGE');`),'f');
   assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='coverage_export_private' or p.proname='privacy_coverage_module_export_v1') and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
   assert.equal(await db(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='coverage_export_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,DELETE'));`),'0');
   await deny(`set role ${role};select public.privacy_coverage_module_export_v1(null);`,'permission denied');
  }
  await db('grant execute on function public.privacy_coverage_module_export_v1(jsonb) to authenticated;');
  for(const role of ['anon','service_role'])assert.equal(await db(`select has_function_privilege('${role}','public.privacy_coverage_module_export_v1(jsonb)','EXECUTE');`),'f');
  assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
 });
 async function actor(){const a={owner:uuid(),session:uuid()};await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${a.owner}','${a.session}',1);insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${a.session}',1);`);return a;}
 const call=async(a,input)=>JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.privacy_coverage_module_export_v1(${json(input)});commit;`));
 const reject=(a,input,code,raw)=>deny(`begin;${claims(a)}set role authenticated;select public.privacy_coverage_module_export_v1(${raw??json(input)});commit;`,code);
 const start=(a,scope=nscope,requestId=uuid())=>call(a,{action:'start',requestId,scope,confirmed:true});
 const page=(a,r,section,cursor=null,limit=r.limits.pageSize)=>call(a,{action:'page',requestId:r.requestId,scope:r.scope,section,cursor,limit});
 const proof=(a,r)=>call(a,{action:'proof',requestId:r.requestId,scope:r.scope});
 const state=()=>db("select jsonb_build_object('requests',(select coalesce(jsonb_agg(to_jsonb(r) order by request_id),'[]') from coverage_export_private.requests_v1 r),'sections',(select coalesce(jsonb_agg(to_jsonb(r) order by request_id,section),'[]') from coverage_export_private.sections_v1 r),'fences',(select coalesce(jsonb_agg(to_jsonb(r) order by request_id),'[]') from coverage_export_private.request_fences_v1 r));");
 const deviceRows=async(a,n)=>db(`insert into notification_private.devices(id,owner_id,session_id,epoch,revision,token,environment,topic,permission,time_zone,active) select gen_random_uuid(),'${a.owner}','${a.session}',1,1,replace('${a.owner}','-','')||lpad(to_hex(n),32,'0'),'sandbox','own.fixture','authorized','Asia/Shanghai',true from generate_series(1,${n}) n;`);
 const opRows=async(a,n)=>db(`insert into trip_lifecycle_private.operations_v1(owner_id,operation_id,erased_reason) select '${a.owner}',gen_random_uuid(),'FORBIDDEN' from generate_series(1,${n});`);
 await t.test('authority before UUID/source/cleanup; strict direct SQL NULL and exact DTOs',async()=>{
  const a=await actor(),requestId=uuid();const before=await state();
  await deny("set role authenticated;select public.privacy_coverage_module_export_v1(null);",'UNAUTHENTICATED');
  const request={action:'start',requestId,scope:nscope,confirmed:true};
  for(const v of [null,[],{}, {...request,action:null},{...request,scope:null},{...request,requestId:null},{...request,confirmed:null},{...request,confirmed:false},{...request,ownerId:a.owner},{...request,leaseId:uuid()}])await reject(a,v,'INVALID_INPUT');
  await reject(a,null,'INVALID_INPUT','null');
  const pg={action:'page',requestId,scope:lscope,section:'trips',cursor:null,limit:50};
  for(const v of [{...pg,section:null},{...pg,limit:null},{...pg,limit:'1'},{...pg,limit:1.5},{...pg,limit:0},{...pg,limit:51},{...pg,cursor:{}},{...pg,cursor:{sourceDigest:null,afterId:uuid()}}])await reject(a,v,'INVALID_INPUT');
  assert.equal(await state(),before);
 });
 await t.test('sensitive reauth uses server session creation; cannot refresh iat or future date',async()=>{
  const a=await actor();for(const delta of ["-interval '6 minutes'","+interval '1 minute'"]){await db(`update auth.sessions set created_at=clock_timestamp()${delta} where id='${a.session}';`);await reject(a,{action:'start',requestId:uuid(),scope:nscope,confirmed:true},'REAUTHENTICATION_REQUIRED');}
  assert.equal(await db(`select count(*) from coverage_export_private.requests_v1 where owner_id='${a.owner}';`),'0');
 });
 await t.test('fixed 30s start exact retry; partial proof is never delivery; safe projection',async()=>{
  const a=await actor();await deviceRows(a,3);const beforeData=await sourceData();const r=await start(a);assert.deepEqual(Object.keys(r).sort(),expectedKeys('started'));assert.equal(r.expiresAt-r.capturedAt,30000);assert.equal(r.mobileEpoch,1);assert.equal(r.allUserDataCompleted,false);assert.deepEqual(r.sections,['notifications']);assert.deepEqual(r.limits,{pageSize:100,maxPages:100,maxRows:10000,maxBytes:1000000});assert.match(r.sourceDigest,/^[a-f0-9]{64}$/);
  assert.deepEqual(await start(a,nscope,r.requestId),r);const p=await proof(a,r);assert.deepEqual(Object.keys(p).sort(),expectedKeys('proof'));assert.equal(p.coverage,'partial');assert.equal(p.pages,0);assert.equal(p.rows,0);
  const first=await page(a,r,'notifications',null,2);assert.deepEqual(Object.keys(first).sort(),expectedKeys('page'));assert.equal(first.pageNumber,1);assert.equal(first.hasMore,true);assert.equal(first.sectionComplete,false);assert.deepEqual(await page(a,r,'notifications',null,2),first);
  for(const row of first.items){assert.deepEqual(Object.keys(row).sort(),['key','domain','deviceId','revision','permission','active','environment','timeZone'].sort());assert.ok(!JSON.stringify(row).includes('token'));}
  const last=await page(a,r,'notifications',first.nextCursor,2);assert.equal(last.pageNumber,2);assert.equal(last.items.length,1);assert.equal(last.nextCursor,null);assert.equal(last.sectionComplete,true);assert.deepEqual(await page(a,r,'notifications',first.nextCursor,2),last);
  const done=await proof(a,r);assert.equal(done.coverage,'complete');assert.equal(done.pages,2);assert.equal(done.rows,3);assert.equal(done.sourceDigest,r.sourceDigest);assert.equal(done.expiresAt,r.expiresAt);assert.equal(await sourceData(),beforeData);
 });
 await t.test('empty sources require null-to-terminal traversal of all sections',async()=>{
  const a=await actor(),r=await start(a,lscope);assert.deepEqual(r.limits,{pageSize:50,maxPages:400,maxRows:20000,maxBytes:1000000});
  await page(a,r,'trips');assert.equal((await proof(a,r)).coverage,'partial');const p=await page(a,r,'operations');assert.deepEqual(p.items,[]);assert.equal(p.sectionComplete,true);assert.equal((await proof(a,r)).coverage,'complete');
  await db(`delete from coverage_export_private.sections_v1 where request_id='${r.requestId}' and section='trips';`);assert.equal((await proof(a,r)).coverage,'partial');
 });
 await t.test('lifecycle metadata and operations only, both-section digest and counts',async()=>{
  const a=await actor(),trip=uuid();await db(claims(a)+`insert into public.trips(id,owner_id,title) values('${trip}','${a.owner}','Owner title only');`);await opRows(a,55);
  const beforeData=await sourceData();const r=await start(a,lscope);assert.deepEqual(r.sections,['trips','operations']);
  const tripPage=await page(a,r,'trips');assert.equal(tripPage.items[0].tripId,trip);assert.deepEqual(Object.keys(tripPage.items[0]).sort(),['tripId','title','headVersion','state','archivedVersion','archivedAt'].sort());assert.ok(!JSON.stringify(tripPage.items).includes('days'));
  const first=await page(a,r,'operations');assert.equal(first.items.length,50);assert.equal(first.nextCursor.sourceDigest,r.sourceDigest);assert.deepEqual(Object.keys(first.items[0]).sort(),['operationId','sessionId','receipt','erasedReason'].sort());const last=await page(a,r,'operations',first.nextCursor);assert.equal(last.items.length,5);
  const p=await proof(a,r);assert.equal(p.coverage,'complete');assert.equal(p.pages,3);assert.equal(p.rows,56);assert.equal(await sourceData(),beforeData);
 });
 await t.test('global key cross-owner/unknown deny equal; same owner cross-scope conflicts',async()=>{
  const a=await actor(),b=await actor(),r=await start(a);const before=await state();
  const unknown=await reject(b,{action:'proof',requestId:uuid(),scope:nscope},'FORBIDDEN');const foreign=await reject(b,{action:'proof',requestId:r.requestId,scope:nscope},'FORBIDDEN');assert.match(unknown,/ERROR:  FORBIDDEN/);assert.match(foreign,/ERROR:  FORBIDDEN/);
  await reject(b,{action:'start',requestId:r.requestId,scope:lscope,confirmed:true},'FORBIDDEN');await reject(a,{action:'start',requestId:r.requestId,scope:lscope,confirmed:true},'COVERAGE_REQUEST_CONFLICT');assert.equal(await state(),before);
  const ownOther=await start(a);assert.notEqual(ownOther.sourceDigest,r.sourceDigest);
 });
 await t.test('skipped/foreign/wrong-source/changed-limit/reordered cursors reject without counts',async()=>{
  const a=await actor(),b=await actor();await deviceRows(a,4);await deviceRows(b,2);const r=await start(a),s=await start(b);const other=await page(b,s,'notifications',null,1);const one=await page(a,r,'notifications',null,1);const two=await page(a,r,'notifications',one.nextCursor,1);const before=await state();
  const input={action:'page',requestId:r.requestId,scope:nscope,section:'notifications',cursor:two.nextCursor,limit:1};
  await reject(a,{...input,cursor:other.nextCursor},'COVERAGE_CURSOR_CONFLICT');await reject(a,{...input,cursor:{...two.nextCursor,afterKey:'device:'+uuid()}},'COVERAGE_CURSOR_CONFLICT');await reject(a,{...input,cursor:one.nextCursor,limit:2},'COVERAGE_CURSOR_CONFLICT');await reject(a,{...input,cursor:null},'COVERAGE_CURSOR_CONFLICT');await reject(a,{...input,cursor:{...two.nextCursor,sourceDigest:'a'.repeat(64)}},'COVERAGE_CURSOR_CONFLICT');
  assert.equal(await state(),before);const p=await proof(a,r);assert.equal(p.pages,2);assert.equal(p.rows,2);
 });
 await t.test('changed source/removed anchor rejects start/page/proof without storing payload',async()=>{
  const a=await actor();await deviceRows(a,2);const r=await start(a);const p=await page(a,r,'notifications',null,1);await db(`delete from notification_private.devices where id='${p.items[0].deviceId}';`);const before=await state();
  await reject(a,{action:'page',requestId:r.requestId,scope:nscope,section:'notifications',cursor:p.nextCursor,limit:1},'COVERAGE_SOURCE_CHANGED');await reject(a,{action:'proof',requestId:r.requestId,scope:nscope},'COVERAGE_SOURCE_CHANGED');await reject(a,{action:'start',requestId:r.requestId,scope:nscope,confirmed:true},'COVERAGE_SOURCE_CHANGED');assert.equal(await state(),before);
  const l=await actor(),trip=uuid();await db(claims(l)+`insert into public.trips(id,owner_id,title) values('${trip}','${l.owner}','First');`);const lr=await start(l,lscope);await db(claims(l)+`update public.trips set title='Changed' where id='${trip}';`);await reject(l,{action:'proof',requestId:lr.requestId,scope:lscope},'COVERAGE_SOURCE_CHANGED');
 });
 await t.test('fixed expiry cannot renew before or after cleanup, unauthorized cleanup has no effect',async()=>{
  const a=await actor(),r=await start(a);await page(a,r,'notifications');await db(`update coverage_export_private.requests_v1 set captured_at=captured_at-31000,expires_at=expires_at-31000 where request_id='${r.requestId}';update coverage_export_private.request_fences_v1 set expires_at=expires_at-31000 where request_id='${r.requestId}';`);
  const before=await state();for(const action of ['start','proof','page'])await reject(a,{action,requestId:r.requestId,scope:nscope,...(action==='start'?{confirmed:true}:action==='page'?{section:'notifications',cursor:null,limit:100}:{})},'COVERAGE_EXPIRED');assert.equal(await state(),before);
  await deny("set role authenticated;select public.privacy_coverage_module_export_v1('{}');",'UNAUTHENTICATED');assert.equal(await state(),before);
  const next=await start(a);assert.notEqual(next.requestId,r.requestId);assert.equal(await db(`select count(*) from coverage_export_private.requests_v1 where request_id='${r.requestId}';`),'0');assert.equal(await db(`select count(*) from coverage_export_private.sections_v1 where request_id='${r.requestId}';`),'0');assert.equal(await db(`select count(*) from coverage_export_private.request_fences_v1 where request_id='${r.requestId}';`),'1');await reject(a,{action:'start',requestId:r.requestId,scope:nscope,confirmed:true},'COVERAGE_EXPIRED');
 });
 await t.test('mobile epoch/current session required; session and owner FK erase progress/fences',async()=>{
  const a=await actor(),r=await start(a);await db(`update identity_private.mobile_accounts set epoch=2 where owner_id='${a.owner}';`);const before=await state();await reject(a,{action:'proof',requestId:r.requestId,scope:nscope},'SESSION_REPLACED');assert.equal(await state(),before);
  await db(`delete from auth.sessions where id='${a.session}';`);for(const table of ['requests_v1','sections_v1','request_fences_v1'])assert.equal(await db(`select count(*) from coverage_export_private.${table} where request_id='${r.requestId}';`),'0');
  const b=await actor(),br=await start(b);await db(`delete from auth.users where id='${b.owner}';`);for(const table of ['requests_v1','sections_v1','request_fences_v1'])assert.equal(await db(`select count(*) from coverage_export_private.${table} where request_id='${br.requestId}';`),'0');
  const c=await actor(),cr=await start(c),next=uuid();await db(`insert into auth.sessions(id,user_id) values('${next}','${c.owner}');update identity_private.mobile_accounts set session_id='${next}',epoch=2 where owner_id='${c.owner}';insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${c.owner}','${uuid()}','${next}',2);`);await reject(c,{action:'proof',requestId:cr.requestId,scope:nscope},'SESSION_REPLACED');await reject({...c,session:next},{action:'proof',requestId:cr.requestId,scope:nscope},'SESSION_REPLACED');
 });
 await t.test('sentinel notification/lifecycle row overflow never hashes or admits',async()=>{
  const a=await actor();await deviceRows(a,10001);await reject(a,{action:'start',requestId:uuid(),scope:nscope,confirmed:true},'COVERAGE_CAPACITY');assert.equal(await db(`select count(*) from coverage_export_private.requests_v1 where owner_id='${a.owner}';`),'0');
  const b=await actor();await opRows(b,10001);await reject(b,{action:'start',requestId:uuid(),scope:lscope,confirmed:true},'COVERAGE_CAPACITY');assert.equal(await db(`select count(*) from coverage_export_private.requests_v1 where owner_id='${b.owner}';`),'0');
 });
 await t.test('aggregate 1MB cap, page budget, transactional effect rollback',async()=>{
  const a=await actor();await db(`insert into trip_lifecycle_private.operations_v1(owner_id,operation_id,session_id,request_bytes,request_digest,receipt) select '${a.owner}',gen_random_uuid(),'${a.session}','fixture',repeat('a',64),jsonb_build_object('fixture',repeat('x',600000)) from generate_series(1,2);`);await reject(a,{action:'start',requestId:uuid(),scope:lscope,confirmed:true},'COVERAGE_CAPACITY');
  const b=await actor();await deviceRows(b,102);const r=await start(b);let cursor=null;for(let i=0;i<100;i++){const p=await page(b,r,'notifications',cursor,1);cursor=p.nextCursor;}const before=await state();await reject(b,{action:'page',requestId:r.requestId,scope:nscope,section:'notifications',cursor,limit:1},'COVERAGE_CAPACITY');assert.equal(await state(),before);assert.equal((await proof(b,r)).coverage,'partial');
  const c=await actor();await db("create function private.coverage_fixture_fault() returns trigger language plpgsql as $$begin raise exception 'OWN_FIXTURE_AFTER_WRITE';end$$;create trigger coverage_fixture_fault before insert on coverage_export_private.sections_v1 for each row execute function private.coverage_fixture_fault();");const beforeFault=await state();await reject(c,{action:'start',requestId:uuid(),scope:nscope,confirmed:true},'OWN_FIXTURE_AFTER_WRITE');assert.equal(await state(),beforeFault);await db('drop trigger coverage_fixture_fault on coverage_export_private.sections_v1;drop function private.coverage_fixture_fault();');
 });
 await t.test('applied rollback removes only the owned schema/RPC and restores default deny on replay',async()=>{
  await db('begin;drop function public.privacy_coverage_module_export_v1(jsonb);drop schema coverage_export_private cascade;commit;');
  assert.equal(await db("select to_regnamespace('coverage_export_private') is null;"),'t');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;'+src+'commit;');assert.equal(await db("select has_function_privilege('authenticated','public.privacy_coverage_module_export_v1(jsonb)','EXECUTE');"),'f');
 });
 await t.test('source-free inventory and all original code/ACL unchanged after own fixtures',async()=>{
  const columns=await db("select string_agg(column_name,',' order by ordinal_position) from information_schema.columns where table_schema='coverage_export_private' and table_name='requests_v1';");assert.equal(columns,'request_id,owner_id,session_id,mobile_epoch,scope,source_digest,captured_at,expires_at');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
 });
});
