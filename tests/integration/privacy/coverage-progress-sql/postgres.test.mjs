// Disposable SQL-claims fixtures; fixture grants are never target enrollment or signed Auth.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid, createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { command, sql } from '../../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_COVERAGE_PROGRESS_DB_TEST==='1';
const migration='20261006040000_coverage_progress_data.sql', scope='coverage-progress-data/1';
const lit=v=>"'"+String(v).replaceAll("'","''")+"'", json=v=>lit(JSON.stringify(v))+'::jsonb';
const digest=v=>createHash('sha256').update(v).digest('hex');
const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};`;
const actorDTO=a=>({ownerId:a.owner,sessionId:a.session,mobileEpoch:a.epoch??1});
const select=r=>({scope:r.scope,requestId:r.requestId,objectIds:r.objectIds});
const consent=(r,action='erase')=>({action,...select(r),previewDigest:r.previewDigest,confirmed:true});
const internal=(r,action)=>({action,...select(r),sourceDigest:r.sourceDigest,previewDigest:r.previewDigest});

test('coverage progress append-only full-chain owner exit SQL', {skip:!enabled,timeout:300000},async t=>{
 const container='vpj58-progress-'+uuid().slice(0,8);
 assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);
 const context=JSON.parse((await command('docker',['context','inspect'])).stdout)[0];assert.ok(context.Endpoints.docker.Host.startsWith('unix:///'));
 const started=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(started.code,0,started.stderr);
 t.after(async()=>assert.equal((await command('docker',['rm','-f',container])).code,0));
 const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 const deny=async(q,code)=>{const r=await sql(container,q);assert.notEqual(r.code,0,r.stdout);assert.match(r.stderr,new RegExp(code));return r.stderr;};
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<migration).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const oldFunctions=()=>db("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'source',p.prosrc,'acl',p.proacl,'config',p.proconfig,'security',p.prosecdef) order by n.nspname,p.oid::regprocedure::text),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in('pg_catalog','information_schema','coverage_progress_private') and p.proname<>'privacy_coverage_progress_v1';");
 const oldTables=()=>db("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity,'columns',(select jsonb_agg(jsonb_build_object('name',attname,'type',atttypid::regtype::text,'notNull',attnotnull) order by attnum) from pg_attribute a where a.attrelid=c.oid and attnum>0 and not attisdropped)) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','coverage_progress_private');");
 const beforeFunctions=await oldFunctions(),beforeTables=await oldTables(),src=readFileSync('supabase/migrations/'+migration,'utf8');
 await t.test('transactional migration rollback; old code/schema/RLS/ACL byte preservation',async()=>{
  await db('begin;'+src+'rollback;');assert.equal(await db("select to_regnamespace('coverage_progress_private') is null;"),'t');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;'+src+'commit;');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
 });
 await t.test('RPC helpers/private schema/tables default revoke and RLS; separate owned fixture grant',async()=>{
  for(const role of ['anon','authenticated','service_role']){
   assert.equal(await db(`select has_schema_privilege('${role}','coverage_progress_private','USAGE');`),'f');
   assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='coverage_progress_private' or p.proname='privacy_coverage_progress_v1') and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
   assert.equal(await db(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='coverage_progress_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,DELETE'));`),'0');
   await deny(`set role ${role};select public.privacy_coverage_progress_v1(null,null,null);`,'permission denied');
  }
  await db('grant execute on function public.privacy_coverage_progress_v1(text,text,bigint) to authenticated;');
  // Original collector fixture grant is independently required and owned here.
  await db('grant execute on function public.privacy_coverage_module_export_v1(jsonb) to authenticated;');
 });
 async function actor(){const a={owner:uuid(),session:uuid(),epoch:1};await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${a.owner}','${a.session}',1);insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${a.session}',1);`);return a;}
 const query=(a,v,action=v?.action,bytes=JSON.stringify(v),epoch=a.epoch)=>`begin;${claims(a)}set role authenticated;select public.privacy_coverage_progress_v1(${action===null?'null':lit(action)},${bytes===null?'null':lit(bytes)},${epoch===null?'null':epoch});commit;`;
 const call=async(a,v,action,bytes)=>JSON.parse(await db(query(a,v,action,bytes)));
 const reject=(a,v,code,action,bytes,epoch)=>deny(query(a,v,action,bytes,epoch),code);
 const old=async(a,v)=>JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.privacy_coverage_module_export_v1(${json(v)});commit;`));
 const collector=(a,kind='notification-metadata/1',req=uuid())=>old(a,{action:'start',scope:kind,requestId:req,confirmed:true});
 const preview=(a,ids,req=uuid())=>call(a,{action:'preview',scope,requestId:req,objectIds:[...ids].sort()});
 const list=(a,cursor=null)=>call(a,{action:'list',scope,cursor,limit:20});
 const page=(a,r,cursor=null)=>call(a,{...internal(r,'page'),cursor,limit:5});
 const proof=(a,r)=>call(a,internal(r,'proof'));
 const exportStart=(a,r,bytes)=>call(a,consent(r,'export'),'export_start',bytes);
 const recover=(a,r,bytes)=>call(a,{action:'recover',...select(r),mutationBytes:bytes});
 const state=()=>db("select jsonb_build_object('collector',(select jsonb_agg(to_jsonb(r) order by request_id) from coverage_export_private.requests_v1 r),'sections',(select jsonb_agg(to_jsonb(r) order by request_id,section) from coverage_export_private.sections_v1 r),'fences',(select jsonb_agg(to_jsonb(r) order by request_id) from coverage_export_private.request_fences_v1 r),'exit',(select jsonb_agg(to_jsonb(r) order by request_id) from coverage_progress_private.requests_v1 r),'pages',(select jsonb_agg(to_jsonb(r) order by request_id) from coverage_progress_private.pages_v1 r));");
 // Digest every unrelated business/source table: erasure must change metadata alone.
 const sourceData=()=>db(`create temp table own_source_digests_v1(name text,digest text);
 do $$declare r record;d text;begin for r in select schemaname,tablename from pg_tables where schemaname not in('pg_catalog','information_schema','coverage_export_private','coverage_progress_private') and schemaname not like 'pg_temp%' order by schemaname,tablename loop
 execute format($q$select md5(coalesce(string_agg(to_jsonb(x)::text,'' order by to_jsonb(x)::text),'')) from %I.%I x$q$,r.schemaname,r.tablename) into d;insert into own_source_digests_v1 values(r.schemaname||'.'||r.tablename,d);end loop;end$$;
 select jsonb_agg(jsonb_build_object('table',name,'digest',digest) order by name) from own_source_digests_v1;`);
 await t.test('authority/epoch/reauth precede input/CAS/lookup and leave zero writes',async()=>{
  const a=await actor(),b=await actor(),c=await collector(a),before=await state();
  await deny("set role authenticated;select public.privacy_coverage_progress_v1(null,null,null);",'UNAUTHENTICATED');
  await reject(a,null,'SESSION_REPLACED',null,null,2);await reject(a,null,'SESSION_REPLACED',null,null,null);
  for(const delta of ["-interval '6 minutes'","+interval '1 minute'"]){await db(`update auth.sessions set created_at=clock_timestamp()${delta} where id='${b.session}';`);await reject(b,null,'REAUTHENTICATION_REQUIRED',null,null);}
  const v={action:'preview',scope,requestId:uuid(),objectIds:[c.requestId]};
  for(const bad of [null,{},[],{...v,action:null},{...v,scope:null},{...v,scope:'bad'},{...v,objectIds:[]},{...v,objectIds:[c.requestId,c.requestId]},{...v,objectIds:[v.requestId]},{...v,requestId:v.requestId.toUpperCase()},{...v,ownerId:a.owner},{...v,leaseId:uuid()}])await reject(a,bad,'INVALID_INPUT',bad?.action??'preview');
  await reject(a,v,'INVALID_INPUT','preview','{');await reject(a,v,'INVALID_INPUT','preview',' '.repeat(8193));
  assert.equal(await state(),before);
 });
 await t.test('read-only full inventory includes retained/current/historical sessions and is bounded/paginated',async()=>{
  const a=await actor();let cursor=null;const ids=[];
  // Direct owned metadata fixture avoids unrelated old collector expiry sweeping.
  const c=await collector(a),at=c.capturedAt;
  for(let i=0;i<24;i++){const id=uuid();ids.push(id);await db(`insert into coverage_export_private.request_fences_v1 values('${id}','${a.owner}','${a.session}','notification-metadata/1',${at-1});`);}
  const before=await state(),first=await list(a);assert.equal(first.items.length,20);assert.equal(first.hasMore,true);cursor=first.nextCursor;const last=await list(a,cursor);
  assert.equal(last.items.length,5);assert.equal(last.hasMore,false);assert.equal(last.nextCursor,null);assert.equal(last.sourceDigest,first.sourceDigest);
  assert.deepEqual([...first.items,...last.items].map(x=>x.objectId),[...ids,c.requestId].sort());assert.equal(await state(),before);
  await reject(a,{action:'list',scope,cursor:{sourceDigest:first.sourceDigest,afterId:uuid()},limit:20},'COVERAGE_PROGRESS_CURSOR_CONFLICT');
  await preview(a,[c.requestId]);await reject(a,{action:'list',scope,cursor,limit:20},'COVERAGE_PROGRESS_SOURCE_CHANGED');
 });
 await t.test('complete closed preview; same-ID retry TTL; no nested snapshots; old/global collisions',async()=>{
  const a=await actor(),b=await actor(),c=await collector(a,'trip-lifecycle-metadata/1'),r=await preview(a,[c.requestId]);
  assert.deepEqual(await preview(a,[c.requestId],r.requestId),r);assert.equal(r.expiresAt,r.capturedAt+30000);
  assert.equal(r.requiresExplicitConfirmation,true);assert.equal(r.allUserDataCompleted,false);assert.equal(r.items.length,1);
  assert.deepEqual(Object.keys(r.items[0]).sort(),['objectId','domain','request','sections','fence'].sort());assert.deepEqual(r.items[0].sections.map(p=>p.section),['operations','trips']);
  for(const key of ['request','fence'])assert.equal(r.items[0][key].requestId,c.requestId);
  await reject(a,{action:'preview',scope,requestId:c.requestId,objectIds:[r.requestId]},'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE');
  await reject(b,{action:'preview',scope,requestId:r.requestId,objectIds:[c.requestId]},'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE');
  await reject(b,{action:'preview',scope,requestId:uuid(),objectIds:[c.requestId]},'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE');
  await reject(a,{action:'preview',scope,requestId:r.requestId,objectIds:[uuid()]},'COVERAGE_PROGRESS_REQUEST_CONFLICT');
  const own=await preview(a,[r.requestId]);assert.deepEqual(Object.keys(own.items[0].request).sort(),['requestId','ownerId','sessionId','mobileEpoch','scope','objectIds','sourceDigest','previewDigest','capturedAt','expiresAt','decision','requestDigest','decidedAt','effects'].sort());assert.equal(own.items[0].progress,null);
  await db(`insert into coverage_export_private.request_fences_v1 values('${r.requestId}','${a.owner}','${a.session}','notification-metadata/1',${r.expiresAt});`);
  await reject(a,{action:'preview',scope,requestId:uuid(),objectIds:[r.requestId]},'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE');
  const columns=await db("select string_agg(column_name,',' order by ordinal_position) from information_schema.columns where table_schema='coverage_progress_private' and table_name='requests_v1';");assert.equal(columns,'request_id,owner_id,session_id,mobile_epoch,scope,object_ids,source_digest,preview_digest,captured_at,expires_at,decision,request_digest,decided_at,effects');
 });
 await t.test('exact export bytes, last-page retry, ordered cursors, complete proof, own page inventory',async()=>{
  const a=await actor(),ids=[];for(let i=0;i<7;i++)ids.push((await collector(a)).requestId);
  const r=await preview(a,ids),bytes=JSON.stringify(consent(r,'export'))+' ',start=await exportStart(a,r,bytes);assert.equal(start.requestDigest,digest(bytes));assert.deepEqual(await exportStart(a,r,bytes),start);
  await reject(a,consent(r,'export'),'COVERAGE_PROGRESS_REQUEST_CONFLICT','export_start',bytes.trim());
  assert.equal((await proof(a,r)).coverage,'partial');const first=await page(a,r);assert.equal(first.pageNumber,1);assert.equal(first.items.length,5);assert.deepEqual(await page(a,r),first);
  const before=await state();for(const cursor of [{sourceDigest:r.sourceDigest,afterId:ids[0]},{sourceDigest:'a'.repeat(64),afterId:r.objectIds[4]}])await reject(a,{...internal(r,'page'),cursor,limit:5},'COVERAGE_PROGRESS_CURSOR_CONFLICT');
  await reject(a,{...internal(r,'page'),cursor:first.nextCursor,limit:4},'INVALID_INPUT');assert.equal(await state(),before);
  const last=await page(a,r,first.nextCursor);assert.equal(last.items.length,2);assert.equal(last.sectionComplete,true);assert.equal(last.nextCursor,null);assert.deepEqual(await page(a,r,first.nextCursor),last);
  await reject(a,{...internal(r,'page'),cursor:null,limit:5},'COVERAGE_PROGRESS_CURSOR_CONFLICT');const done=await proof(a,r);assert.equal(done.coverage,'complete');assert.equal(done.rows,7);assert.equal(done.pages,2);
  const own=await preview(a,[r.requestId]);assert.equal(own.items[0].request.decision,'export');assert.equal(own.items[0].progress.pages,2);assert.equal(own.items[0].progress.rows,7);
 });
 await t.test('collector advance/cleanup and selected exit page advance invalidate source CAS without effects',async()=>{
  const a=await actor(),c=await collector(a),r=await preview(a,[c.requestId]);await old(a,{action:'page',requestId:c.requestId,scope:c.scope,section:'notifications',cursor:null,limit:100});
  const before=await state();await reject(a,consent(r),'COVERAGE_PROGRESS_SOURCE_CHANGED');assert.equal(await state(),before);
  const fresh=await preview(a,[c.requestId]),ex=await exportStart(a,fresh),selected=await preview(a,[fresh.requestId]);await page(a,fresh);
  const after=await state();await reject(a,consent(selected),'COVERAGE_PROGRESS_SOURCE_CHANGED');assert.equal(await state(),after);
  assert.equal(ex.kind,'started');
 });
 await t.test('atomic selected erase, retained fences and own minimal receipt, no sweeping/source writes',async()=>{
  const a=await actor(),c=await collector(a,'trip-lifecycle-metadata/1'),other=await collector(a),r=await preview(a,[c.requestId]);
  const business=await sourceData(),bytes=JSON.stringify(consent(r))+' ',receipt=await call(a,consent(r),'erase',bytes);
  assert.deepEqual(receipt.effects,{collectorRequests:1,collectorSections:2,exitPages:0,retainedFences:1,sourceData:'not_modified',sessionAccountFences:'retained',externalCopies:'not_erased'});
  assert.equal(receipt.committedAt,receipt.decidedAt);assert.equal(receipt.requestDigest,digest(bytes));assert.equal(await sourceData(),business);assert.deepEqual(await recover(a,r,bytes),receipt);assert.deepEqual(await call(a,consent(r),'erase',bytes),receipt);
  await reject(a,consent(r),'COVERAGE_PROGRESS_REQUEST_CONFLICT','erase',bytes.trim());assert.equal(await db(`select count(*) from coverage_export_private.requests_v1 where request_id='${other.requestId}';`),'1');
  assert.equal(await db(`select count(*) from coverage_export_private.request_fences_v1 where request_id='${c.requestId}';`),'1');
  const retained=await preview(a,[c.requestId]);assert.equal(retained.items[0].request,null);assert.deepEqual(retained.items[0].sections,[]);
  const own=await preview(a,[r.requestId]);assert.deepEqual(own.items[0].request.effects,receipt.effects);assert.equal(own.items[0].request.decision,'erase');
  // Erased old IDs cannot renew even while their immutable original fence is live.
  await deny(`begin;${claims(a)}set role authenticated;select public.privacy_coverage_module_export_v1(${json({action:'start',scope:c.scope,requestId:c.requestId,confirmed:true})});commit;`,'duplicate key|COVERAGE_EXPIRED');
  assert.equal(await db(`select count(*) from coverage_export_private.requests_v1 where request_id='${c.requestId}';`),'0');
 });
 await t.test('selected new page cleanup prevents same-ID export/page revival, retaining own bindings',async()=>{
  const a=await actor(),c=await collector(a),r=await preview(a,[c.requestId]);await exportStart(a,r);await page(a,r);
  const er=await preview(a,[r.requestId]),rec=await call(a,consent(er));assert.equal(rec.effects.exitPages,1);assert.equal(rec.effects.collectorRequests,0);
  await reject(a,consent(r,'export'),'COVERAGE_PROGRESS_REQUEST_CONFLICT','export_start');await reject(a,internal(r,'proof'),'COVERAGE_PROGRESS_REQUEST_CONFLICT');
  assert.equal(await db(`select count(*) from coverage_progress_private.requests_v1 where request_id='${r.requestId}';`),'1');const selected=await preview(a,[r.requestId]);assert.equal(selected.items[0].progress,null);
  assert.equal(await db(`select count(*) from coverage_export_private.requests_v1 where request_id='${c.requestId}';`),'1');
 });
 await t.test('foreign/absent recover exact unknown and lock indistinguishability; owned mismatches reject',async()=>{
  const a=await actor(),b=await actor(),c=await collector(a),r=await preview(a,[c.requestId]),bytes=JSON.stringify(consent(r));await call(a,consent(r));
  const foreign=await recover(b,r,bytes);assert.deepEqual(foreign,{schemaVersion:scope,kind:'unknown',scope,requestId:r.requestId,objectIds:r.objectIds,...actorDTO(b),requestDigest:digest(bytes),allUserDataCompleted:false});
  const unknown={...r,requestId:uuid()},ub=JSON.stringify(consent(unknown));const absent=await recover(b,unknown,ub);assert.deepEqual({...absent,requestId:foreign.requestId,requestDigest:foreign.requestDigest},foreign);
  await reject(a,{action:'recover',...select(r),mutationBytes:bytes+' '},'COVERAGE_PROGRESS_REQUEST_CONFLICT');
  const changed={...r,objectIds:[uuid()]};await reject(a,{action:'recover',...select(changed),mutationBytes:JSON.stringify(consent(changed))},'COVERAGE_PROGRESS_REQUEST_CONFLICT');
  const before=await state();assert.equal((await recover(b,r,bytes)).kind,'unknown');assert.equal(await state(),before);
 });
 await t.test('historical collector metadata available under new current session; old business cannot resume',async()=>{
  const a=await actor(),c=await collector(a),oldSession=a.session;a.session=uuid();a.epoch=2;
  await db(`insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');update identity_private.mobile_accounts set session_id='${a.session}',epoch=2 where owner_id='${a.owner}';insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${a.session}',2);`);
  const r=await preview(a,[c.requestId]);assert.equal(r.items[0].request.sessionId,oldSession);assert.equal(r.sessionId,a.session);assert.equal(r.mobileEpoch,2);
  await call(a,consent(r));assert.equal(await db(`select count(*) from coverage_export_private.request_fences_v1 where request_id='${c.requestId}';`),'1');
  await deny(`begin;${claims(a)}set role authenticated;select public.privacy_coverage_module_export_v1(${json({action:'start',scope:c.scope,requestId:c.requestId,confirmed:true})});commit;`,'SESSION_REPLACED');
  await db(`delete from auth.sessions where id='${oldSession}';`);assert.equal(await db(`select count(*) from coverage_export_private.request_fences_v1 where request_id='${c.requestId}';`),'0');
 });
 await t.test('TTL fixed, undecided nonrenewal, expired immutable receipt recovery, session/account cascade',async()=>{
  const a=await actor(),c=await collector(a),r=await preview(a,[c.requestId]);
  // Faithful clock expiry fixture uses the same immutable values and a future call timestamp.
  await db(`alter table coverage_progress_private.requests_v1 disable trigger coverage_progress_immutable_v1;update coverage_progress_private.requests_v1 set captured_at=captured_at-31000,expires_at=expires_at-31000 where request_id='${r.requestId}';alter table coverage_progress_private.requests_v1 enable trigger coverage_progress_immutable_v1;`);
  const before=await state();await reject(a,{action:'preview',...select(r)},'COVERAGE_PROGRESS_EXPIRED');await reject(a,consent(r),'COVERAGE_PROGRESS_EXPIRED');assert.equal(await state(),before);
  const live=await preview(a,[c.requestId]),bytes=JSON.stringify(consent(live)),receipt=await call(a,consent(live));
  // Recovery bypasses live TTL but never bypasses current authority or exact bytes.
  await db(`alter table coverage_progress_private.requests_v1 disable trigger coverage_progress_immutable_v1;update coverage_progress_private.requests_v1 set captured_at=captured_at-31000,expires_at=expires_at-31000,decided_at=decided_at-31000 where request_id='${live.requestId}';alter table coverage_progress_private.requests_v1 enable trigger coverage_progress_immutable_v1;`);
  const expired=await recover(a,live,bytes);assert.equal(expired.requestDigest,receipt.requestDigest);assert.equal(expired.decidedAt,receipt.decidedAt-31000);
  await reject(a,{action:'recover',...select(live),mutationBytes:bytes},'SESSION_REPLACED',undefined,undefined,2);
  await db(`delete from auth.sessions where id='${a.session}';`);assert.equal(await db(`select count(*) from coverage_progress_private.requests_v1 where owner_id='${a.owner}';`),'0');assert.equal(await db(`select count(*) from coverage_export_private.request_fences_v1 where owner_id='${a.owner}';`),'0');
  const b=await actor(),bc=await collector(b),br=await preview(b,[bc.requestId]);await exportStart(b,br);await db(`delete from auth.users where id='${b.owner}';`);assert.equal(await db(`select count(*) from coverage_progress_private.pages_v1 where request_id='${br.requestId}';`),'0');
 });
 await t.test('capacity sentinel/selection/cursor/page counter limits and transactional erase fault rollback',async()=>{
  const a=await actor(),c=await collector(a),r=await preview(a,[c.requestId]);
  await reject(a,{action:'preview',scope,requestId:uuid(),objectIds:Array.from({length:21},()=>uuid()).sort()},'INVALID_INPUT');
  await db(`insert into coverage_export_private.request_fences_v1 select gen_random_uuid(),'${a.owner}','${a.session}','notification-metadata/1',${c.expiresAt} from generate_series(1,10001);`);await reject(a,{action:'list',scope,cursor:null,limit:20},'COVERAGE_PROGRESS_CAPACITY');
  const b=await actor(),bc=await collector(b),br=await preview(b,[bc.requestId]);await exportStart(b,br);
  await db(`update coverage_progress_private.pages_v1 set pages=4,last_limit=5,last_cursor='{}'::jsonb where request_id='${br.requestId}';`);await reject(b,{...internal(br,'page'),cursor:null,limit:5},'COVERAGE_PROGRESS_CAPACITY');assert.equal((await proof(b,br)).coverage,'partial');
  const before=await state();await db("create function coverage_progress_private.fixture_fault() returns trigger language plpgsql as $$begin raise exception 'OWN_ERASE_FAULT';end$$;create trigger own_erase_fault before update on coverage_progress_private.requests_v1 for each row execute function coverage_progress_private.fixture_fault();");
  await reject(a,consent(r),'OWN_ERASE_FAULT');assert.equal(await state(),before);await db('drop trigger own_erase_fault on coverage_progress_private.requests_v1;drop function coverage_progress_private.fixture_fault();');
 });
 await t.test('advisory/root/selected-row NOWAIT conflicts, real concurrent decisions serialize atomically',async()=>{
  const a=await actor(),c=await collector(a),r=await preview(a,[c.requestId]);
  async function held(lockSQL,body){
   const marker=uuid();const holding=command('docker',['exec','-i',container,'psql','-h','/tmp/vpj59-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],`set application_name=${lit(marker)};begin;${lockSQL}select pg_sleep(1.5);rollback;`);
   for(let i=0;i<30;i++){if(await db(`select count(*) from pg_stat_activity where application_name=${lit(marker)} and wait_event='PgSleep';`)==='1')break;await new Promise(r=>setTimeout(r,10));}
   await body();assert.equal((await holding).code,0);
  }
  for(const lockSQL of [`select pg_advisory_xact_lock(hashtextextended('${a.owner}',34));`,`select pg_advisory_xact_lock(hashtextextended('coverage-request:${c.requestId}',0));`,`select 1 from identity_private.mobile_accounts where owner_id='${a.owner}' for update;`,`select 1 from coverage_export_private.requests_v1 where request_id='${c.requestId}' for update;`])await held(lockSQL,()=>reject(a,consent(r),'COVERAGE_PROGRESS_LOCK_CONFLICT'));
  const b=await actor();await held(`select pg_advisory_xact_lock(hashtextextended('coverage-request:${r.requestId}',0));select 1 from coverage_progress_private.requests_v1 where request_id='${r.requestId}' for update;`,async()=>assert.equal((await recover(b,r,JSON.stringify(consent(r)))).kind,'unknown'));
  const results=await Promise.all([sql(container,query(a,consent(r))),sql(container,query(a,consent(r)))]);
  assert.ok(results.some(x=>x.code===0));for(const x of results)if(x.code!==0)assert.match(x.stderr,/COVERAGE_PROGRESS_LOCK_CONFLICT/);
  const receipt=await recover(a,r,JSON.stringify(consent(r)));assert.equal(receipt.effects.collectorRequests,1);assert.equal(await db(`select count(*) from coverage_export_private.requests_v1 where request_id='${c.requestId}';`),'0');
 });

 await t.test('whole wrapper 1MB bound; metadata-only cursor source change; expired unselected no sweep',async()=>{
  const a=await actor(),c=await collector(a),r=await preview(a,[c.requestId]),listing=await list(a);
  await db(`update coverage_export_private.sections_v1 set bytes=1 where request_id='${c.requestId}';`);
  await reject(a,{action:'list',scope,cursor:{sourceDigest:listing.sourceDigest,afterId:c.requestId},limit:20},'COVERAGE_PROGRESS_SOURCE_CHANGED');
  await db(`update coverage_export_private.sections_v1 set last_cursor=jsonb_build_object('oversize',repeat('x',1000001)) where request_id='${c.requestId}';`);
  const before=await state();await reject(a,{action:'preview',scope,requestId:uuid(),objectIds:[c.requestId]},'COVERAGE_PROGRESS_CAPACITY');assert.equal(await state(),before);
  const b=await actor(),bc=await collector(b),untouched=await collector(b),br=await preview(b,[bc.requestId]);
  await db(`update coverage_export_private.requests_v1 set captured_at=captured_at-31000,expires_at=expires_at-31000 where request_id='${untouched.requestId}';update coverage_export_private.request_fences_v1 set expires_at=expires_at-31000 where request_id='${untouched.requestId}';`);
  await call(b,consent(br));assert.equal(await db(`select count(*) from coverage_export_private.requests_v1 where request_id='${untouched.requestId}';`),'1');
 });
 const producerRoot=process.env.VP_COVERAGE_PROGRESS_TS_ROOT??process.cwd();
 if(existsSync(producerRoot+'/lib/server/privacy/coverage-progress/protocol.ts'))await t.test('actual SQL projections through sole TS closed decoder and export controller (SQL claims fixture)',async()=>{
  const mod=await import(pathToFileURL(producerRoot+'/lib/server/privacy/coverage-progress/protocol.ts'));
  const {collectCoverageProgressExport}=await import(pathToFileURL(producerRoot+'/lib/server/privacy/coverage-progress/export.ts'));
  const {COVERAGE_PROGRESS_BOUNDARIES}=await import(pathToFileURL(producerRoot+'/lib/server/privacy/coverage-progress/contract.ts'));
  const a=await actor(),ids=[];for(let i=0;i<7;i++)ids.push((await collector(a,i%2?'trip-lifecycle-metadata/1':'notification-metadata/1')).requestId);
  const r=await preview(a,ids);assert.deepEqual(r.boundaries,COVERAGE_PROGRESS_BOUNDARIES[scope]);assert.ok(mod.decodeCoverageProgressPreview(r,select(r),actorDTO(a)));
  const command=consent(r,'export'),bytes=JSON.stringify(command)+'  ',signal=new AbortController().signal;
  const bundle=await collectCoverageProgressExport(command,bytes,actorDTO(a),(act,raw)=>call(a,JSON.parse(raw),act,raw),signal,async()=>true);
  assert.ok(mod.decodeCoverageProgressBundle(bundle,select(r),actorDTO(a)));assert.equal(bundle.items.length,7);assert.equal(bundle.proof.coverage,'complete');
  const self=await preview(a,[r.requestId]);assert.ok(mod.decodeCoverageProgressPreview(self,select(self),actorDTO(a)));
  const erased=await call(a,consent(self));assert.ok(mod.decodeCoverageProgressReceipt(erased,select(self),actorDTO(a),digest(JSON.stringify(consent(self)))));
  const receiptExport=await preview(a,[self.requestId]);assert.ok(mod.decodeCoverageProgressPreview(receiptExport,select(receiptExport),actorDTO(a)));
  const inventory=await list(a);assert.ok(mod.decodeCoverageProgressList(inventory,{action:'list',scope,cursor:null,limit:20},actorDTO(a),Date.now()));
 });
 await t.test('immutable minimal requests; own applied rollback only and default revoke on replay',async()=>{
  const a=await actor(),c=await collector(a),r=await preview(a,[c.requestId]);await deny(`update coverage_progress_private.requests_v1 set expires_at=expires_at+1 where request_id='${r.requestId}';`,'COVERAGE_PROGRESS_REQUEST_CONFLICT');
  // Compare original functions/schema after independently undoing only our fixture grant.
  await db('revoke execute on function public.privacy_coverage_module_export_v1(jsonb) from authenticated;');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;drop function public.privacy_coverage_progress_v1(text,text,bigint);drop schema coverage_progress_private cascade;commit;');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;'+src+'commit;');assert.equal(await db("select has_function_privilege('authenticated','public.privacy_coverage_progress_v1(text,text,bigint)','EXECUTE');"),'f');
 });
});
