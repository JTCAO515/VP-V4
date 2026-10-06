// Disposable SQL-claims fixtures; fixture grants are never target enrollment or signed Auth.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid, createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { command, sql } from '../../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_ARCHIVE_DATA_DB_TEST==='1';
const migration='20261006050000_archive_data.sql', scope='archived-trip-data/1';
const lit=v=>"'"+String(v).replaceAll("'","''")+"'", json=v=>lit(JSON.stringify(v))+'::jsonb';
const digest=v=>createHash('sha256').update(v).digest('hex');
const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};`;
const actorDTO=a=>({ownerId:a.owner,sessionId:a.session,mobileEpoch:a.epoch??1});
const select=r=>({scope:r.scope,requestId:r.requestId,tripId:r.tripId,tripVersion:r.tripVersion,objectIds:r.objectIds});
const consent=(r,action='erase')=>({action,...select(r),previewDigest:r.previewDigest,confirmed:true});
const internal=(r,action)=>({action,...select(r),sourceDigest:r.sourceDigest,previewDigest:r.previewDigest});

test('archive selected source/export/progress exit SQL', {skip:!enabled,timeout:300000},async t=>{
 const container='vpj58-archive-'+uuid().slice(0,8);
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
 const oldFunctions=()=>db("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'source',p.prosrc,'acl',p.proacl,'config',p.proconfig,'security',p.prosecdef) order by n.nspname,p.oid::regprocedure::text),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in('pg_catalog','information_schema','archive_data_private') and p.proname<>'privacy_archive_data_v1';");
 const oldTables=()=>db("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity,'columns',(select jsonb_agg(jsonb_build_object('name',attname,'type',atttypid::regtype::text,'notNull',attnotnull) order by attnum) from pg_attribute a where a.attrelid=c.oid and attnum>0 and not attisdropped)) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','archive_data_private');");
 const beforeFunctions=await oldFunctions(),beforeTables=await oldTables(),src=readFileSync('supabase/migrations/'+migration,'utf8');
 await t.test('transactional migration rollback; old code/schema/RLS/ACL byte preservation',async()=>{
  await db('begin;'+src+'rollback;');assert.equal(await db("select to_regnamespace('archive_data_private') is null;"),'t');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;'+src+'commit;');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
 });
 await t.test('RPC helpers/private schema/tables default revoke and RLS; separate owned fixture grant',async()=>{
  for(const role of ['anon','authenticated','service_role']){
   assert.equal(await db(`select has_schema_privilege('${role}','archive_data_private','USAGE');`),'f');
   assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='archive_data_private' or p.proname='privacy_archive_data_v1') and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
   assert.equal(await db(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='archive_data_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,DELETE'));`),'0');
   await deny(`set role ${role};select public.privacy_archive_data_v1(null,null,null);`,'permission denied');
  }
  await db('grant execute on function public.privacy_archive_data_v1(text,text,bigint) to authenticated;');
  // Existing lifecycle fixture grant is separately owned, never target enrollment.
  await db('grant execute on function public.trip_lifecycle_v1(text,jsonb,text) to authenticated;');
 });
 async function actor(){const a={owner:uuid(),session:uuid(),epoch:1};await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${a.owner}','${a.session}',1);insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${a.session}',1);`);return a;}
 const query=(a,v,action=v?.action,bytes=JSON.stringify(v),epoch=a.epoch)=>`begin;${claims(a)}set role authenticated;select public.privacy_archive_data_v1(${action===null?'null':lit(action)},${bytes===null?'null':lit(bytes)},${epoch===null?'null':epoch});commit;`;
 const call=async(a,v,action,bytes)=>JSON.parse(await db(query(a,v,action,bytes)));
 const reject=(a,v,code,action,bytes,epoch)=>deny(query(a,v,action,bytes,epoch),code);
 const progressScope='archive-export-progress/1';
 const list=(a,s=scope,cursor=null)=>call(a,{action:'list',scope:s,cursor,limit:20});
 const preview=(a,trip,req=uuid())=>call(a,{action:'preview',scope,requestId:req,tripId:trip.id,tripVersion:trip.version,objectIds:[]});
 const progressPreview=(a,ids,req=uuid())=>call(a,{action:'preview',scope:progressScope,requestId:req,tripId:null,tripVersion:null,objectIds:[...ids].sort()});
 const exportStart=(a,r,bytes)=>call(a,consent(r,'export'),'export_start',bytes);
 const page=(a,r,section,cursor=null)=>call(a,{...internal(r,'page'),section,cursor,limit:50});
 const proof=(a,r)=>call(a,internal(r,'proof'));
 const recover=(a,r,bytes)=>call(a,{action:'recover',...select(r),mutationBytes:bytes});
 const state=()=>db("select jsonb_build_object('requests',(select jsonb_agg(to_jsonb(r) order by request_id) from archive_data_private.requests_v1 r),'progress',(select jsonb_agg(to_jsonb(r) order by request_id,section) from archive_data_private.progress_v1 r));");
 const lifecycle=async(a,action,input={},raw=null)=>JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.trip_lifecycle_v1(${lit(action)},${json(input)},${raw===null?'null':lit(raw)});commit;`));
 const lcCommand=async(a,action,id,extra={})=>{const r=await lifecycle(a,'read');return {action,tripId:id,operationId:uuid(),expectedRevision:r.revision,expectedActiveTripId:r.capacity.activeTripId,expectedSessionId:a.session,confirmed:true,...extra};};
 const lcExecute=(a,c)=>lifecycle(a,'execute',c,JSON.stringify(c));
 async function trip(a,versions=2){
  const id=uuid();assert.equal((await lcExecute(a,await lcCommand(a,'create',id,{title:'Draft'}))).status,'applied');
  for(let n=1;n<=versions;n++){
   const p=JSON.parse(await db(claims(a)+`select row_to_json(r) from public.create_trip_proposal_patch('${id}',jsonb_build_object('expectedVersion',${n-1},'operations',jsonb_build_array(jsonb_build_object('kind','set_title','title','Safe ${n}')))) r;`));
   const h=await db(claims(a)+`select digest from public.read_trip_proposal_v2('${p.proposal_id}');`);
   assert.match(await db(claims(a)+`select * from public.confirm_and_apply_trip_proposal('${p.proposal_id}','${uuid()}','${h}');`),new RegExp('applied\\|'+n));
  }
  assert.equal((await lcExecute(a,await lcCommand(a,'archive',id,{expectedHeadVersion:versions,preference:{action:'skip'}}))).status,'applied');
  return {id,version:versions};
 }
 async function collect(a,r){
  const bytes=JSON.stringify(consent(r,'export'))+'\n',start=await exportStart(a,r,bytes);const sections=[];let pages=0,rows=0;
  for(const section of start.sections){let cursor=null,items=[];do{const x=await page(a,r,section,cursor);items.push(...x.items);pages++;rows+=x.items.length;cursor=x.nextCursor;}while(cursor);sections.push({section,items});}
  const end=await proof(a,r);assert.equal(end.coverage,'complete');assert.equal(end.pages,pages);assert.equal(end.rows,rows);
  return {bytes,start,sections,end};
 }
 // Corruption injection runs ONLY as postgres in this owned, network-none fixture.
 // It tests fail-closed readers; no production grant/trigger/permission is changed.
 const corrupt=q=>db(`begin;set local session_replication_role=replica;${q}commit;`);
 const business=()=>db(`create temp table source_digests(name text,digest text);
 do $$declare r record;d text;begin for r in select schemaname,tablename from pg_tables where schemaname not in('pg_catalog','information_schema','archive_data_private') and schemaname not like 'pg_temp%' order by schemaname,tablename loop
 execute format($q$select md5(coalesce(string_agg(to_jsonb(x)::text,'' order by to_jsonb(x)::text),'')) from %I.%I x$q$,r.schemaname,r.tablename) into d;insert into source_digests values(r.schemaname||'.'||r.tablename,d);end loop;end$$;
 select jsonb_agg(jsonb_build_object('table',name,'digest',digest) order by name) from source_digests;`);
 await t.test('ordinary authority/epoch/reauth first; closed commands and zero writes',async()=>{
  const a=await actor(),b=await actor(),before=await business(),metadata=await state();
  await deny('set role authenticated;select public.privacy_archive_data_v1(null,null,null);','UNAUTHENTICATED');
  await reject(a,null,'SESSION_REPLACED',null,null,2);await reject(a,null,'SESSION_REPLACED',null,null,null);
  for(const delta of ["-interval '6 minutes'","+interval '1 minute'"]){await db(`update auth.sessions set created_at=clock_timestamp()${delta} where id='${b.session}';`);await reject(b,null,'REAUTHENTICATION_REQUIRED',null,null);}
  await db(`update auth.sessions set created_at=clock_timestamp() where id='${b.session}';`);
  const v={action:'preview',scope,requestId:uuid(),tripId:uuid(),tripVersion:1,objectIds:[]};
  for(const bad of [null,{},[],{...v,action:['preview']},{...v,scope:null},{...v,tripVersion:'1'},{...v,tripVersion:0},{...v,tripVersion:2147483648},{...v,tripId:v.tripId.toUpperCase()},{...v,requestId:v.requestId.toUpperCase()},{...v,ownerId:a.owner},{...v,objectIds:[uuid()]},{...v,action:'erase',previewDigest:'a'.repeat(64),confirmed:true}])await reject(a,bad,'INVALID_INPUT',bad?.action??'preview');
  await reject(a,v,'INVALID_INPUT','preview','{');await reject(a,v,'INVALID_INPUT','preview',' '.repeat(8193));
  assert.equal(await state(),metadata);
  // Session fixture refresh is the only expected non-RPC business delta.
  assert.equal(await db(`select count(*) from trip_lifecycle_private.owner_heads_v1 where owner_id in('${a.owner}','${b.owner}');`),'0');
  assert.ok(before);
 });
 await t.test('real confirmed/archive source, safe head/history, explicit gaps and no bodies in preview',async()=>{
  const a=await actor(),tr=await trip(a),before=await business(),r=await preview(a,tr),again=await preview(a,tr,r.requestId);
  assert.deepEqual(r,again);assert.equal(r.expiresAt,r.capturedAt+30000);assert.equal(r.snapshotVersionGaps,0);
  assert.deepEqual(r.counts,{trip:1,snapshots:3,operations:2,progress:0});assert.ok(!('sections' in r)&&!('content' in r));
  const exported=await collect(a,r);const head=exported.sections[0].items[0];
  assert.equal(head.confirmationState,'confirmed');assert.equal(head.title,'Safe 2');assert.deepEqual(head.content,{days:[]});
  assert.equal(exported.sections[1].items.at(-1).title,head.title);assert.deepEqual(exported.sections[1].items.at(-1).content,head.content);
  assert.equal(exported.sections[2].items.length,2);for(const row of exported.sections[2].items){assert.deepEqual(Object.keys(row).sort(),['operationId','sessionId','receipt','erasedReason'].sort());assert.equal(row.receipt.tripId,tr.id);assert.ok(!('request_bytes' in row));}
  assert.equal(await business(),before);const validated=await call(a,consent(r,'validate'));assert.equal(validated.current,true);assert.equal(validated.requestDigest,digest(exported.bytes));
  const gapOwner=await actor(),gapTrip=await trip(gapOwner);await corrupt(`delete from public.trip_version_snapshots where trip_id='${gapTrip.id}' and version=1;`);
  assert.equal((await preview(gapOwner,gapTrip)).snapshotVersionGaps,1);
 });
 await t.test('foreign/missing indistinguishable, immutable selection and original bytes',async()=>{
  const a=await actor(),b=await actor(),tr=await trip(a),r=await preview(a,tr),metadata=await state();
  for(const id of [tr.id,uuid()])await reject(b,{action:'preview',...select(r),requestId:uuid(),tripId:id},'ARCHIVE_SOURCE_UNAVAILABLE');
  const bytes=JSON.stringify(consent(r,'export'))+' ',start=await exportStart(a,r,bytes);assert.equal(start.requestDigest,digest(bytes));assert.deepEqual(await exportStart(a,r,bytes),start);
  await reject(a,consent(r,'export'),'ARCHIVE_CONFLICT','export_start',bytes.trim());await reject(a,{...internal(r,'proof'),tripVersion:1},'ARCHIVE_CONFLICT');
  assert.equal((await proof(a,r)).coverage,'partial');assert.ok(metadata);
  const own=await progressPreview(a,[r.requestId]);const eraseBytes=JSON.stringify(consent(own));const foreign=await recover(b,own,eraseBytes);
  assert.equal(foreign.kind,'unknown');
  const unknownId=uuid(),outer={...select(own),requestId:unknownId};const unknownBytes=JSON.stringify({action:'erase',...outer,previewDigest:own.previewDigest,confirmed:true});
  const absent=await call(b,{action:'recover',...outer,mutationBytes:unknownBytes});assert.equal(absent.kind,'unknown');assert.deepEqual({...absent,requestId:foreign.requestId,requestDigest:foreign.requestDigest},foreign);
 });
 await t.test('independent ordered pagination, exact-last replay, no skips/restarts and complete proof',async()=>{
  const a=await actor(),tr=await trip(a),receipt=await lcExecute(a,await lcCommand(a,'activate',tr.id,{expectedHeadVersion:tr.version}));
  assert.equal(receipt.status,'declined');
  // 54 genuine-shaped historical receipts, all finite and selected by original trip_id.
  await corrupt(`insert into trip_lifecycle_private.operations_v1(owner_id,operation_id,session_id,request_bytes,request_digest,trip_id,receipt)
  select '${a.owner}',id,'${a.session}','fixture-original',repeat('a',64),'${tr.id}',${json(receipt)}||jsonb_build_object('operationId',id)
  from (select gen_random_uuid() id from generate_series(1,54)) q;`);
  const r=await preview(a,tr),start=await exportStart(a,r);assert.equal(start.kind,'started');
  const first=await page(a,r,'operations');assert.equal(first.items.length,50);assert.equal(first.hasMore,true);assert.deepEqual(await page(a,r,'operations'),first);
  const unchanged=await state();await reject(a,{...internal(r,'page'),section:'operations',cursor:{sourceDigest:r.sourceDigest,afterKey:first.items[0].operationId},limit:50},'ARCHIVE_CONFLICT');
  await reject(a,{...internal(r,'page'),section:'operations',cursor:first.nextCursor,limit:49},'INVALID_INPUT');assert.equal(await state(),unchanged);
  const last=await page(a,r,'operations',first.nextCursor);assert.equal(last.items.length,7);assert.equal(last.sectionComplete,true);assert.deepEqual(await page(a,r,'operations',first.nextCursor),last);
  await reject(a,{...internal(r,'page'),section:'operations',cursor:null,limit:50},'ARCHIVE_CONFLICT');assert.equal((await proof(a,r)).coverage,'partial');
  await page(a,r,'trip');await page(a,r,'snapshots');const end=await proof(a,r);assert.equal(end.coverage,'complete');assert.equal(end.pages,4);assert.equal(end.rows,61);
  const flat=await progressPreview(a,[r.requestId]);await exportStart(a,flat);const x=(await page(a,flat,'progress')).items[0];assert.equal(x.state,'exported');assert.equal(x.progress.length,3);assert.deepEqual(x.progress.map(p=>p.section),['trip','snapshots','operations']);
 });
 await t.test('head/title/owner/archive mismatch, snapshot changes and queued deletion invalidate',async()=>{
  const a=await actor(),tr=await trip(a),r=await preview(a,tr);await exportStart(a,r);
  await corrupt(`update public.trip_version_snapshots set title='Different' where trip_id='${tr.id}' and version=2;`);const before=await state();
  await reject(a,internal(r,'proof'),'ARCHIVE_SOURCE_UNAVAILABLE');assert.equal(await state(),before);
  await corrupt(`update public.trip_version_snapshots set title='Safe 2' where trip_id='${tr.id}' and version=2;update public.trip_version_snapshots set content=content||'{"private":"hidden"}' where trip_id='${tr.id}' and version=1;`);
  await reject(a,internal(r,'proof'),'ARCHIVE_SOURCE_CHANGED');assert.equal(await state(),before);
  const live=await preview(a,tr);await collect(a,live);
  await corrupt(`insert into privacy_private.trip_deletions(request_id,owner_id,trip_id,expected_version,state) values('${uuid()}','${a.owner}','${tr.id}',2,'queued');`);
  await reject(a,consent(live,'validate'),'ARCHIVE_SOURCE_UNAVAILABLE');assert.equal((await list(a)).items.length,0);
  const b=await actor(),badTrip=await trip(b);await corrupt(`update public.trip_archives set archived_version=1 where trip_id='${badTrip.id}';`);await reject(b,{action:'preview',scope,requestId:uuid(),tripId:badTrip.id,tripVersion:2,objectIds:[]},'ARCHIVE_SOURCE_UNAVAILABLE');
  const c=await actor(),ct=await trip(c),foreign=await actor();await corrupt(`update public.trip_version_snapshots set owner_id='${foreign.owner}' where trip_id='${ct.id}' and version=1;`);await reject(c,{action:'preview',scope,requestId:uuid(),tripId:ct.id,tripVersion:2,objectIds:[]},'ARCHIVE_SOURCE_UNAVAILABLE');
  const d=await actor(),dt=await trip(d);assert.equal(await db("select attnotnull from pg_attribute where attrelid='public.trip_version_snapshots'::regclass and attname='content';"),'t');
  await corrupt(`delete from public.trip_version_snapshots where trip_id='${dt.id}' and version=2;`);await reject(d,{action:'preview',scope,requestId:uuid(),tripId:dt.id,tripVersion:2,objectIds:[]},'ARCHIVE_SOURCE_UNAVAILABLE');
 });
 await t.test('finite own inventory, selected metadata erase, immutable fences/receipt, no business writes',async()=>{
  const a=await actor(),tr=await trip(a),r=await preview(a,tr);await collect(a,r);
  const own=await progressPreview(a,[r.requestId]),bytes=JSON.stringify(consent(own))+'\n',businessBefore=await business();
  const receipt=await call(a,consent(own),undefined,bytes);assert.equal(receipt.effects.clearedProgress,3);assert.equal(receipt.effects.retainedFences,1);assert.equal(receipt.effects.sourceTrip,'not_modified');
  assert.equal(await business(),businessBefore);assert.deepEqual(await recover(a,own,bytes),receipt);assert.deepEqual(await call(a,consent(own),undefined,bytes),receipt);
  await reject(a,consent(own),'ARCHIVE_CONFLICT');await reject(a,consent(r,'export'),'ARCHIVE_CONFLICT','export_start');await reject(a,consent(r,'validate'),'ARCHIVE_CONFLICT');
  const inv=await list(a,progressScope);assert.equal(inv.items.length,2);assert.ok(inv.items.every(x=>x.progressErased));
  const next=await progressPreview(a,[own.requestId]);await exportStart(a,next);const item=(await page(a,next,'progress')).items[0];assert.equal(item.progress.length,0);assert.equal(item.receipt.requestDigest,digest(bytes));
  assert.deepEqual(Object.keys(item.receipt).sort(),['requestDigest','decidedAt','clearedProgress','sourceTrip','externalCopies'].sort());assert.ok(!('binding' in item.receipt));
  // Committed receipt survives absolute TTL and source changes, with original time.
  await db(`update auth.sessions set created_at=clock_timestamp()-interval '6 minutes' where id='${a.session}';`);await reject(a,{action:'recover',...select(own),mutationBytes:bytes},'REAUTHENTICATION_REQUIRED');
  await db(`update auth.sessions set created_at=clock_timestamp() where id='${a.session}';`);assert.deepEqual(await recover(a,own,bytes),receipt);
 });
 await t.test('progress list includes expired/deleted-trip/history-session fences, full digest cursor CAS',async()=>{
  const a=await actor(),tr=await trip(a),base=await preview(a,tr);
  await corrupt(`insert into archive_data_private.requests_v1(request_id,owner_id,session_id,mobile_epoch,scope,trip_id,trip_version,object_ids,source_digest,preview_digest,captured_at,expires_at)
  select gen_random_uuid(),'${a.owner}','${a.session}',1,'archived-trip-data/1','${uuid()}',1,'{}',repeat('a',64),repeat('b',64),1,30001 from generate_series(1,24);`);
  const first=await list(a,progressScope);assert.equal(first.items.length,20);assert.equal(first.hasMore,true);const last=await list(a,progressScope,first.nextCursor);assert.equal(last.items.length,5);assert.equal(last.sourceDigest,first.sourceDigest);
  assert.deepEqual([...first.items,...last.items].map(x=>x.objectId),[...first.items,...last.items].map(x=>x.objectId).sort());
  await corrupt(`update archive_data_private.requests_v1 set preview_digest=repeat('c',64) where request_id='${base.requestId}';`);await reject(a,{action:'list',scope:progressScope,cursor:first.nextCursor,limit:20},'ARCHIVE_SOURCE_CHANGED');
  const id=first.items.find(x=>x.objectId!==base.requestId).objectId;await reject(a,{action:'preview',scope,requestId:id,tripId:tr.id,tripVersion:tr.version,objectIds:[]},'ARCHIVE_CONFLICT');
 });
 await t.test('empty operation terminal page; unknown confirmation uses original query; previous-only excluded',async()=>{
  const a=await actor(),tr=await trip(a);await corrupt(`delete from trip_lifecycle_private.operations_v1 where owner_id='${a.owner}' and trip_id='${tr.id}';delete from public.trip_idempotency where owner_id='${a.owner}';`);
  const r=await preview(a,tr);assert.equal(r.counts.operations,0);const out=await collect(a,r);assert.equal(out.sections[0].items[0].confirmationState,'unknown');assert.equal(out.sections[2].items.length,0);assert.equal(out.end.pages,3);
  const b=await actor(),bt=await trip(b);const sample=JSON.parse(await db(`select receipt from trip_lifecycle_private.operations_v1 where owner_id='${b.owner}' limit 1;`));
  await corrupt(`insert into trip_lifecycle_private.operations_v1(owner_id,operation_id,session_id,request_bytes,request_digest,trip_id,previous_active_trip_id,receipt)
  values('${b.owner}','${uuid()}','${b.session}','fixture',repeat('a',64),'${uuid()}','${bt.id}',${json(sample)});`);
  assert.equal((await preview(b,bt)).counts.operations,2);
 });
 await t.test('historical sessions discoverable, current epoch required; original cascade retained',async()=>{
  const a=await actor(),tr=await trip(a),r=await preview(a,tr);await collect(a,r);const old=a.session;
  a.session=uuid();a.epoch=2;
  await db(`insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');update identity_private.mobile_accounts set session_id='${a.session}',epoch=2 where owner_id='${a.owner}';insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${a.session}',2);`);
  const own=await progressPreview(a,[r.requestId]);await exportStart(a,own);const item=(await page(a,own,'progress')).items[0];assert.equal(item.sessionId,old);assert.equal(item.mobileEpoch,1);
  await reject(a,consent(r,'validate'),'ARCHIVE_CONFLICT');const clear=await progressPreview(a,[r.requestId]);await call(a,consent(clear));
  assert.equal(await db(`select count(*) from archive_data_private.requests_v1 where request_id='${r.requestId}';`),'1');
  await db(`delete from auth.sessions where id='${old}';`);assert.equal(await db(`select count(*) from archive_data_private.requests_v1 where request_id='${r.requestId}';`),'0');
  assert.equal(await db(`select count(*) from archive_data_private.requests_v1 where owner_id='${a.owner}';`),'2');
  await db(`delete from auth.users where id='${a.owner}';`);assert.equal(await db(`select count(*) from archive_data_private.requests_v1 where owner_id='${a.owner}';`),'0');
  assert.equal(await db(`select count(*) from archive_data_private.progress_v1 where request_id in('${r.requestId}','${own.requestId}','${clear.requestId}');`),'0');
 });
 await t.test('fixed expiry/nonrenewal, post-source/post-effect fresh deadlines roll back atomically',async()=>{
  const a=await actor(),tr=await trip(a),r=await preview(a,tr);
  await corrupt(`update archive_data_private.requests_v1 set captured_at=captured_at-31000,expires_at=expires_at-31000 where request_id='${r.requestId}';`);
  const before=await state();await reject(a,{action:'preview',...select(r)},'ARCHIVE_EXPIRED');await reject(a,consent(r,'export'),'ARCHIVE_EXPIRED','export_start');assert.equal(await state(),before);
  const sourceRequest=await preview(a,tr);
  const original=await db("select pg_get_functiondef('archive_data_private.archive_source_v1(uuid,uuid,integer)'::regprocedure);");
  await db(`alter table archive_data_private.requests_v1 disable trigger archive_data_immutable_v1;
  with deadline as(select floor(extract(epoch from clock_timestamp())*1000)::bigint+1200 e)
  update archive_data_private.requests_v1 set captured_at=deadline.e-30000,expires_at=deadline.e from deadline where request_id='${sourceRequest.requestId}';
  alter table archive_data_private.requests_v1 enable trigger archive_data_immutable_v1;`);
  await db(original.replace('return result_n;',`perform pg_sleep(greatest(0,(select expires_at from archive_data_private.requests_v1 where request_id='${sourceRequest.requestId}')::numeric/1000-extract(epoch from clock_timestamp()))+0.05);return result_n;`));
  try{const beforeSource=await state();await reject(a,consent(sourceRequest,'export'),'ARCHIVE_EXPIRED','export_start');assert.equal(await state(),beforeSource);}finally{await db(original);}
  const exported=await preview(a,tr);await collect(a,exported);const er=await progressPreview(a,[exported.requestId]);
  await db(`alter table archive_data_private.requests_v1 disable trigger archive_data_immutable_v1;
  with deadline as(select floor(extract(epoch from clock_timestamp())*1000)::bigint+1200 e)
  update archive_data_private.requests_v1 set captured_at=deadline.e-30000,expires_at=deadline.e from deadline where request_id='${er.requestId}';
  alter table archive_data_private.requests_v1 enable trigger archive_data_immutable_v1;
  create function archive_data_private.fixture_late_effect() returns trigger language plpgsql as $$begin
  perform pg_sleep(greatest(0,NEW.expires_at::numeric/1000-extract(epoch from clock_timestamp()))+0.05);return NEW;end$$;
  create trigger own_late_effect before update on archive_data_private.requests_v1 for each row
  when(NEW.state='erased' and OLD.state='previewed') execute function archive_data_private.fixture_late_effect();`);
  try{const beforeEffect=await state();await reject(a,consent(er),'ARCHIVE_EXPIRED');assert.equal(await state(),beforeEffect);
  assert.equal((await recover(a,er,JSON.stringify(consent(er)))).kind,'unknown');}finally{await db('drop trigger own_late_effect on archive_data_private.requests_v1;drop function archive_data_private.fixture_late_effect();');}
 });
 await t.test('10000+sentinel inventory/snapshot/operation bounds and no overflow writes',async()=>{
  const a=await actor(),tr=await trip(a),r=await preview(a,tr);await exportStart(a,r);
  await corrupt(`insert into archive_data_private.requests_v1(request_id,owner_id,session_id,mobile_epoch,scope,trip_id,trip_version,object_ids,source_digest,preview_digest,captured_at,expires_at)
  select gen_random_uuid(),'${a.owner}','${a.session}',1,'archived-trip-data/1','${uuid()}',1,'{}',repeat('a',64),repeat('b',64),1,30001 from generate_series(1,10000);`);
  const before=await state();await reject(a,{action:'list',scope:progressScope,cursor:null,limit:20},'ARCHIVE_CAPACITY');
  await reject(a,{action:'preview',scope,requestId:uuid(),tripId:tr.id,tripVersion:2,objectIds:[]},'ARCHIVE_CAPACITY');assert.equal(await state(),before);
  const b=await actor(),bt=await trip(b),br=await preview(b,bt);await exportStart(b,br);
  const op=JSON.parse(await db(`select receipt from trip_lifecycle_private.operations_v1 where owner_id='${b.owner}' limit 1;`));
  await corrupt(`insert into trip_lifecycle_private.operations_v1(owner_id,operation_id,session_id,request_bytes,request_digest,trip_id,receipt)
  select '${b.owner}',id,'${b.session}','fixture',repeat('a',64),'${bt.id}',${json(op)}||jsonb_build_object('operationId',id)
  from (select gen_random_uuid() id from generate_series(1,10001)) q;`);
  const unchanged=await state();await reject(b,internal(br,'proof'),'ARCHIVE_CAPACITY');assert.equal(await state(),unchanged);
  const c=await actor(),ct=await trip(c),cr=await preview(c,ct);await exportStart(c,cr);
  await corrupt(`update public.trips set head_version=2147483647 where id='${ct.id}';update public.trip_archives set archived_version=2147483647 where trip_id='${ct.id}';
  update public.trip_version_snapshots set version=2147483647 where trip_id='${ct.id}' and version=2;
  insert into public.trip_version_snapshots(trip_id,owner_id,version,title,content) select '${ct.id}','${c.owner}',n,'Historical','{"days":[]}' from generate_series(3,10003) n;`);
  await reject(c,{action:'preview',scope,requestId:uuid(),tripId:ct.id,tripVersion:2147483647,objectIds:[]},'ARCHIVE_CAPACITY');
  await reject(c,{action:'preview',scope:progressScope,requestId:uuid(),tripId:null,tripVersion:null,objectIds:Array.from({length:21},()=>uuid()).sort()},'INVALID_INPUT');
  const d=await actor();await corrupt(`create temp table bulk_archive_ids as select gen_random_uuid() id from generate_series(1,10001);
  insert into public.trips(id,owner_id,title,head_version) select id,'${d.owner}','Archived',1 from bulk_archive_ids;
  insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) select id,'${d.owner}',1,gen_random_uuid() from bulk_archive_ids;`);
  await reject(d,{action:'list',scope,cursor:null,limit:20},'ARCHIVE_CAPACITY');
 });
 await t.test('whole final wrapper UTF8 byte bound; source/progress oversize refuses without truncation',async()=>{
  const a=await actor(),tr=await trip(a),r=await preview(a,tr);await exportStart(a,r);
  await corrupt(`update public.trip_version_snapshots set content=jsonb_build_object('days','[]'::jsonb,'hidden',repeat('界',340000)) where trip_id='${tr.id}' and version=1;`);
  const before=await state();await reject(a,internal(r,'proof'),'ARCHIVE_CAPACITY');assert.equal(await state(),before);
  const b=await actor(),bt=await trip(b),br=await preview(b,bt);await exportStart(b,br);
  // Deliberately oversize a flat fixture row; no truncated prefix can be exported.
  await corrupt(`update archive_data_private.progress_v1 set pages=1,last_limit=50,last_cursor=jsonb_build_object('sourceDigest',repeat('a',64),'afterKey',repeat('界',333333)) where request_id='${br.requestId}' and section='trip';`);
  await reject(b,{action:'preview',scope:progressScope,requestId:uuid(),tripId:null,tripVersion:null,objectIds:[br.requestId]},'ARCHIVE_CAPACITY');
  // Valid safe row content: tune historical snapshots to just below the
  // source limit while the WHOLE bundle wrapper (binding/boundaries/proof) exceeds it.
  const c=await actor(),ct=await trip(c);
  const sourceObject=JSON.parse(await db(`select archive_data_private.archive_source_v1('${c.owner}','${ct.id}',2);`));
  // Keep the byte-bound fixture distinct from a very large single-array workload:
  // the unchanged safe projection appends each JSON item. Spread identical byte
  // coverage across both stored historical versions, using legal 160-char UTF-8
  // titles. Neither the 5s statement budget nor any runtime guard is relaxed.
  const histories=[0,1].map(version=>({version,rawItems:[],safeItems:[]}));
  for(const h of histories)sourceObject.sections[1].items[h.version].content={days:[{id:'d',date:'2026-10-06',items:h.safeItems}]};
  let sourceBytes=Buffer.byteLength(JSON.stringify(sourceObject));
  for(let i=0;;i++){
   const h=histories[i%histories.length],raw={id:'i'+i,title:'界'.repeat(160)},safe={...raw,dayId:'d'},delta=Buffer.byteLength(JSON.stringify(safe))+(h.rawItems.length?1:0);
   if(sourceBytes+delta>999950){
    const overhead=delta-Buffer.byteLength(raw.title),chars=Math.floor((999950-sourceBytes-overhead)/3);
    if(chars>0){raw.title='界'.repeat(chars);safe.title=raw.title;h.rawItems.push(raw);h.safeItems.push(safe);sourceBytes+=overhead+chars*3;}
    break;
   }
   h.rawItems.push(raw);h.safeItems.push(safe);sourceBytes+=delta;
  }
  assert.ok(sourceBytes>999700&&sourceBytes<1000000,String(sourceBytes));
  assert.ok(histories.every(h=>h.rawItems.length<1000&&h.rawItems.every(item=>item.title.length>=1&&item.title.length<=160)));
  await corrupt(histories.map(h=>`update public.trip_version_snapshots set content=${json({days:[{id:'d',date:'2026-10-06',items:h.rawItems}]})} where trip_id='${ct.id}' and version=${h.version};`).join('\n'));
  const sourceStarted=performance.now();
  const sourceSize=Number(await db(`select octet_length(notification_private.canonical(archive_data_private.archive_source_v1('${c.owner}','${ct.id}',2)));`));assert.equal(sourceSize,sourceBytes);
  t.diagnostic(JSON.stringify({wrapperCapacityFixture:{versions:histories.map(h=>h.version),items:histories.map(h=>h.rawItems.length),sourceBytes:sourceSize,sourceQueryMs:Math.round(performance.now()-sourceStarted),statementBudgetMs:5000}}));
  const beforeWrapper=await state();await reject(c,{action:'preview',scope,requestId:uuid(),tripId:ct.id,tripVersion:2,objectIds:[]},'ARCHIVE_CAPACITY');assert.equal(await state(),beforeWrapper);
 });
 await t.test('source/account/session/request NOWAIT fences; foreign recovery unaffected; concurrent erase CAS',async()=>{
  const a=await actor(),tr=await trip(a),r=await preview(a,tr);await collect(a,r);const e=await progressPreview(a,[r.requestId]),bytes=JSON.stringify(consent(e));
  async function held(lockSQL,body){
   const marker=uuid();const holding=command('docker',['exec','-i',container,'psql','-h','/tmp/vpj59-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],`set application_name=${lit(marker)};begin;${lockSQL}select pg_sleep(1);rollback;`);
   let locked=false;for(let i=0;i<30;i++){if(await db(`select count(*) from pg_stat_activity where application_name=${lit(marker)} and wait_event='PgSleep';`)==='1'){locked=true;break;}await new Promise(r=>setTimeout(r,10));}
   assert.equal(locked,true);try{await body();}finally{assert.equal((await holding).code,0);}
  }
  for(const lockSQL of [`select pg_advisory_xact_lock(hashtextextended('${a.owner}',34));`,`select 1 from identity_private.mobile_accounts where owner_id='${a.owner}' for update;`,`select 1 from auth.sessions where id='${a.session}' for update;`,`select 1 from public.trips where id='${tr.id}' for update;`,`select 1 from public.trip_proposals where trip_id='${tr.id}' for update;`,`select 1 from public.trip_version_snapshots where trip_id='${tr.id}' for update;`,`select 1 from public.trip_archives where trip_id='${tr.id}' for update;`,`select 1 from trip_lifecycle_private.operations_v1 where owner_id='${a.owner}' and trip_id='${tr.id}' for update;`])await held(lockSQL,()=>reject(a,consent(r,'validate'),'ARCHIVE_CONFLICT'));
  const b=await actor();await held(`select pg_advisory_xact_lock(hashtextextended('archive-request:${e.requestId}',0));select 1 from archive_data_private.requests_v1 where request_id='${e.requestId}' for update;`,async()=>assert.equal((await recover(b,e,bytes)).kind,'unknown'));
  const results=await Promise.all([sql(container,query(a,consent(e))),sql(container,query(a,consent(e)))]);assert.ok(results.some(x=>x.code===0));for(const x of results)if(x.code!==0)assert.match(x.stderr,/ARCHIVE_CONFLICT/);
  const receipt=await recover(a,e,bytes);assert.equal(receipt.effects.clearedProgress,3);assert.equal(await db('select deadlocks from pg_stat_database where datname=current_database();'),'0');
 });
 const producerRoot=process.env.VP_ARCHIVE_DATA_TS_ROOT??process.cwd();
 if(existsSync(producerRoot+'/lib/server/privacy/archive-data/protocol.ts'))await t.test('actual SQL payloads through sole TS strict decoder and complete collector',async()=>{
  const mod=await import(pathToFileURL(producerRoot+'/lib/server/privacy/archive-data/protocol.ts'));
  const {collectArchiveExport}=await import(pathToFileURL(producerRoot+'/lib/server/privacy/archive-data/export.ts'));
  const {ARCHIVE_BOUNDARIES}=await import(pathToFileURL(producerRoot+'/lib/server/privacy/archive-data/contract.ts'));
  const a=await actor(),tr=await trip(a),r=await preview(a,tr);assert.deepEqual(r.boundaries,ARCHIVE_BOUNDARIES[scope]);
  assert.ok(mod.decodeArchivePreview(r,select(r),actorDTO(a),Date.now()));assert.ok(mod.decodeArchiveList(await list(a),{action:'list',scope,cursor:null,limit:20},actorDTO(a),Date.now()));
  const c=consent(r,'export'),bytes=JSON.stringify(c)+'  ',bundle=await collectArchiveExport(c,bytes,actorDTO(a),(action,raw)=>call(a,JSON.parse(raw),action,raw),new AbortController().signal,async()=>true);
  assert.ok(mod.decodeArchiveBundle(bundle,c,actorDTO(a),Date.now()));assert.equal(bundle.proof.coverage,'complete');
  const validated=await call(a,consent(r,'validate'));assert.ok(mod.decodeArchiveValidated(validated,consent(r,'validate'),actorDTO(a),Date.now()));assert.equal(validated.requestDigest,digest(bytes));
  const e=await progressPreview(a,[r.requestId]),ec=consent(e),eb=JSON.stringify(ec),receipt=await call(a,ec);assert.ok(mod.decodeArchiveReceipt(receipt,ec,actorDTO(a),digest(eb),Date.now()));
  const own=await progressPreview(a,[e.requestId]),oc=consent(own,'export'),ob=JSON.stringify(oc),flat=await collectArchiveExport(oc,ob,actorDTO(a),(action,raw)=>call(a,JSON.parse(raw),action,raw),new AbortController().signal,async()=>true);
  assert.ok(mod.decodeArchiveBundle(flat,oc,actorDTO(a),Date.now()));assert.equal(flat.sections[0].items[0].receipt.requestDigest,digest(eb));
 });
 await t.test('actual absolute 30s expiration; exact immutable terminal receipt recovers without source/TTL renewal',async()=>{
  const a=await actor(),tr=await trip(a),r=await preview(a,tr);await collect(a,r);const e=await progressPreview(a,[r.requestId]),bytes=JSON.stringify(consent(e))+' ',receipt=await call(a,consent(e),undefined,bytes);
  const before=await state();const remaining=Math.max(r.expiresAt,e.expiresAt)-Date.now()+100;assert.ok(remaining<=30100&&remaining>0);await new Promise(resolve=>setTimeout(resolve,remaining));
  assert.deepEqual(await recover(a,e,bytes),receipt);assert.deepEqual(await call(a,consent(e),undefined,bytes),receipt);assert.equal(await state(),before);
  await reject(a,{action:'preview',...select(r)},'ARCHIVE_EXPIRED');await reject(a,consent(r,'export'),'ARCHIVE_EXPIRED','export_start');await reject(a,consent(r,'validate'),'ARCHIVE_EXPIRED');
  await reject(a,{action:'recover',...select(e),mutationBytes:bytes.trim()},'ARCHIVE_CONFLICT');assert.equal((await list(a,progressScope)).items.length,2);
 });
 await t.test('immutable request/receipt; own drop/replay leaves ALL original source code/schema/ACL unchanged',async()=>{
  const a=await actor(),tr=await trip(a),r=await preview(a,tr);await deny(`update archive_data_private.requests_v1 set expires_at=expires_at+1 where request_id='${r.requestId}';`,'ARCHIVE_CONFLICT');
  await db('revoke execute on function public.trip_lifecycle_v1(text,jsonb,text) from authenticated;');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;drop function public.privacy_archive_data_v1(text,text,bigint);drop schema archive_data_private cascade;commit;');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;'+src+'commit;');assert.equal(await db("select has_function_privilege('authenticated','public.privacy_archive_data_v1(text,text,bigint)','EXECUTE');"),'f');
 });
});
