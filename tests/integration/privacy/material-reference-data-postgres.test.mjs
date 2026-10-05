// Owned network-none disposable PG. Synthetic Auth/session claims, fixture-only
// RPC grants. This is SQL behavior, not signed GoTrue or target enrollment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_MATERIAL_DB_TEST==='1';
const migration='20261006020000_material_reference_data.sql';
const src=readFileSync('supabase/migrations/'+migration,'utf8');
const lit=v=>"'"+String(v).replaceAll("'","''")+"'";
const json=v=>lit(JSON.stringify(v))+'::jsonb';
const hash=v=>createHash('sha256').update(v,'utf8').digest('hex');
const res='reservation-reference-data/1',pdf='pdf-intake-data/1',progress='material-exit-progress/1';
const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';`;
const wireRoot=process.env.VP_MATERIAL_TS_WIRE_ROOT;
const protocol=wireRoot?await import(pathToFileURL(resolve(wireRoot,'lib/server/privacy/material-references/protocol.ts')).href):null;
const collect=wireRoot?await import(pathToFileURL(resolve(wireRoot,'lib/server/privacy/material-references/export.ts')).href):null;

test('material owner exit full PG replay, authority, CAS, erasure and receipt',{skip:!enabled,timeout:300000},async t=>{
 const container='vpj58-material-'+uuid().slice(0,8);
 assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);
 const context=JSON.parse((await command('docker',['context','inspect'])).stdout)[0];assert.ok(context.Endpoints.docker.Host.startsWith('unix:///'));
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);
 t.after(async()=>assert.equal((await command('docker',['rm','-f',container])).code,0));
 const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 const deny=async(q,code)=>{const r=await sql(container,q);assert.notEqual(r.code,0,r.stdout);assert.match(r.stderr,new RegExp(code));};
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<migration).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const oldFunctions=()=>db("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'source',p.prosrc,'acl',p.proacl,'config',p.proconfig,'security',p.prosecdef) order by n.nspname,p.oid::regprocedure::text),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in('pg_catalog','information_schema','material_exit_private') and p.proname<>'privacy_material_reference_v1';");
 const oldTables=()=>db("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity,'columns',(select jsonb_agg(jsonb_build_object('name',attname,'type',atttypid::regtype::text,'notNull',attnotnull) order by attnum) from pg_attribute a where a.attrelid=c.oid and attnum>0 and not attisdropped)) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','material_exit_private');");
 const beforeFunctions=await oldFunctions(),beforeTables=await oldTables();
 await t.test('transactional migration rollback, original function bodies/ACL and tables unchanged',async()=>{
  await db('begin;'+src+'rollback;');assert.equal(await db("select to_regnamespace('material_exit_private') is null;"),'t');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;'+src+'commit;');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
 });
 assert.equal(await db("select to_regnamespace('material_exit_private') is not null;"),'t','migration must install before behavior tests');
 await t.test('RLS/ACL disabled for every ordinary/service role before isolated grant',async()=>{
  for(const role of ['anon','authenticated','service_role']){
   assert.equal(await db(`select has_schema_privilege('${role}','material_exit_private','USAGE');`),'f');
   assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='material_exit_private' or p.proname='privacy_material_reference_v1') and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
   assert.equal(await db(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='material_exit_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,DELETE'));`),'0');
   await deny(`set role ${role};select public.privacy_material_reference_v1(null,null,null);`,'permission denied');
  }
  await db('grant execute on function public.privacy_material_reference_v1(text,text,bigint) to authenticated;');
 });
 async function actor(){const a={owner:uuid(),session:uuid(),trip:uuid(),epoch:1};await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${a.owner}','${a.session}',1);insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${a.session}',1);${claims(a)}insert into public.trips(id,owner_id,title) values('${a.trip}','${a.owner}','Synthetic material Trip');`);return a;}
 const rawSQL=(a,action,raw,epoch=a.epoch)=>`begin;${claims(a)}set role authenticated;select public.privacy_material_reference_v1(${lit(action)},${raw===null?'null':lit(raw)},${epoch===null?'null':epoch});commit;`;
 const call=async(a,input,action=input.action,raw=JSON.stringify(input))=>JSON.parse(await db(rawSQL(a,action,raw)));
 const reject=(a,input,code,action=input?.action,raw=JSON.stringify(input),epoch=a.epoch)=>deny(rawSQL(a,action,raw,epoch),code);
 const preview=(a,scope,ids,requestId=uuid())=>call(a,{action:'preview',scope,tripId:a.trip,objectIds:ids.toSorted(),requestId});
 const selection=r=>({scope:r.scope,tripId:r.tripId,objectIds:r.objectIds,requestId:r.requestId});
 const mutation=(r,action)=>({action,...selection(r),previewDigest:r.previewDigest,confirmed:true});
 const recovery=(r,raw)=>({action:'recover',...selection(r),mutationBytes:raw});
 const page=(a,r,cursor=null)=>call(a,{action:'page',...selection(r),sourceDigest:r.sourceDigest,previewDigest:r.previewDigest,cursor,limit:5});
 const proof=(a,r)=>call(a,{action:'proof',...selection(r),sourceDigest:r.sourceDigest,previewDigest:r.previewDigest});
 const state=()=>db("select jsonb_build_object('requests',(select coalesce(jsonb_agg(to_jsonb(r) order by request_id),'[]') from material_exit_private.requests_v1 r),'progress',(select coalesce(jsonb_agg(to_jsonb(r) order by request_id),'[]') from material_exit_private.progress_v1 r),'fences',(select coalesce(jsonb_agg(to_jsonb(r) order by owner_id,kind,object_id),'[]') from material_exit_private.reservation_fences_v1 r));");
 const fields=code=>({kind:'lodging',supplier:'booking',externalReference:code,title:'Synthetic hotel 😀',startsAt:null,endsAt:null,timeZone:null,address:'Synthetic sensitive address',terms:'Synthetic secret terms',status:'reserved'});
 const reservationInput=(id=uuid(),op=uuid(),code=uuid())=>({operationId:op,referenceId:id,expectedTripVersion:0,expectedRevision:0,fields:fields(code),source:{kind:'user_reported',localMaterialId:uuid(),localContentHash:'a'.repeat(64),locator:'Synthetic original location'},explicitlyConfirmed:true});
 const confirmSQL=(a,c)=>claims(a)+`select public.confirm_reservation_reference_v1('${a.trip}',${json(c)});`;
 const reservation=async(a,c=reservationInput())=>{const r=JSON.parse(await db(confirmSQL(a,c)));assert.equal(r.kind,'reservation_confirmation/1');return c;};
 const pdfCommand=(extra={})=>({operationId:uuid(),expectedHeadVersion:0,contentHash:'a'.repeat(64),byteCount:12345,pageCount:2,extraction:'pdfkit_text',expiresAt:new Date(Date.now()+3600000).toISOString(),fields:[{kind:'date',value:'2026-10-08',locator:{page:1,line:3,sourceTextHash:'b'.repeat(64)}},{kind:'address',value:'广州·旅行 😀',locator:{page:2,line:9,sourceTextHash:'c'.repeat(64)}}],...extra});
 const pdfSQL=(a,action,c,raw=JSON.stringify(c))=>claims(a)+`select public.pdf_intake_v1(${lit(action)},'${a.trip}',${lit(raw)},${a.epoch});`;
 const pdfSubmit=async(a,c=pdfCommand())=>{const p=JSON.parse(await db(pdfSQL(a,'preview',c)));const input={command:c,reviewedPreviewDigest:p.previewDigest};const r=JSON.parse(await db(pdfSQL(a,'proposal',input)));assert.equal(r.kind,'pdf_intake_proposal/1');return {c,r,input};};
 await t.test('authority/epoch/reauth precede all feedback; NULL and nonclosed inputs have zero effects',async()=>{
  const a=await actor(),c=await reservation(a),p=await preview(a,res,[c.referenceId]);const before=await state();
  await deny("set role authenticated;select public.privacy_material_reference_v1('erase',null,1);",'UNAUTHENTICATED');
  const m=mutation(p,'erase');for(const input of [null,{},[],{...m,action:null},{...m,confirmed:null},{...m,confirmed:false},{...m,objectIds:[]},{...m,objectIds:[c.referenceId,c.referenceId]},{...m,objectIds:[c.referenceId.toUpperCase()]},{...m,ownerId:a.owner},{...m,leaseId:uuid()},{...m,scope:null},{...m,previewDigest:null}])await reject(a,input,'INVALID_INPUT','erase');
  await reject(a,m,'INVALID_INPUT','erase',' '.repeat(8193));await reject(a,m,'INVALID_INPUT','erase','{"action":');
  await reject(a,m,'SESSION_REPLACED','erase',JSON.stringify(m),null);
  await reject({...a,epoch:2},m,'SESSION_REPLACED');
  for(const delta of ["-interval '6 minutes'","+interval '1 minute'"]){await db(`update auth.sessions set created_at=clock_timestamp()${delta} where id='${a.session}';`);await reject(a,m,'REAUTHENTICATION_REQUIRED');}
  await db(`update auth.sessions set created_at=clock_timestamp() where id='${a.session}';`);
  assert.equal(await state(),before);assert.equal(await db(`select count(*) from reservation_private.current_v1 where owner_id='${a.owner}';`),'1');
 });
 await t.test('ordinary owner list is real, keyset bounded and current digest cursor bound',async()=>{
  const a=await actor(),b=await actor(),ids=[];for(let n=0;n<22;n++)ids.push((await reservation(a)).referenceId);await reservation(b);
  const input={action:'list',scope:res,tripId:a.trip,cursor:null,limit:20},r=await call(a,input);assert.equal(r.items.length,20);assert.equal(r.expiresAt-r.capturedAt,30000);assert.equal(r.hasMore,true);assert.equal(r.items[0].label,'Synthetic hotel 😀');assert.equal(r.allUserDataCompleted,false);
  if(protocol)assert.ok(protocol.decodeMaterialList(r,input,{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},Date.now()));
  const end=await call(a,{...input,cursor:r.nextCursor});assert.equal(end.items.length,2);assert.equal(end.hasMore,false);
  await reject(b,input,'MATERIAL_TRIP_UNAVAILABLE');await reject(a,{...input,cursor:{sourceDigest:r.sourceDigest,afterId:uuid()}},'MATERIAL_CURSOR_CONFLICT');
  await reservation(a);await reject(a,{...input,cursor:r.nextCursor},'MATERIAL_CURSOR_CONFLICT');
 });
 await t.test('preview immutable selection, full sensitive digest CAS and no business writes',async()=>{
  const a=await actor(),c=await reservation(a),d=await reservation(a),before=await db(`select to_jsonb(t) from public.trips t where id='${a.trip}';`),p=await preview(a,res,[c.referenceId]);
  assert.equal(p.expiresAt-p.capturedAt,30000);assert.equal(p.requiresExplicitConfirmation,true);assert.equal(p.items[0].historical,true);assert.equal(p.items[0].current.evidenceTier,'user_reported');
  assert.deepEqual(await preview(a,res,[c.referenceId],p.requestId),p);assert.equal(await db(`select to_jsonb(t) from public.trips t where id='${a.trip}';`),before);
  if(protocol)assert.ok(protocol.decodeMaterialPreview(p,selection(p),{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},Date.now()));
  await reject(a,{action:'preview',...selection(p),objectIds:[d.referenceId]},'MATERIAL_REQUEST_CONFLICT');
  await db(`update reservation_private.current_v1 set fields=jsonb_set(fields,'{terms}','"Changed actual sensitive source"') where owner_id='${a.owner}' and reference_id='${c.referenceId}';`);
  await reject(a,mutation(p,'erase'),'MATERIAL_SOURCE_CHANGED');assert.equal(await db(`select count(*) from material_exit_private.reservation_fences_v1 where owner_id='${a.owner}';`),'0');
 });
 await t.test('actual page traversal only completes proof; replay/cursor/bytes/TTL remain exact',async()=>{
  const a=await actor(),ids=[];for(let n=0;n<7;n++)ids.push((await reservation(a)).referenceId);const p=await preview(a,res,ids),m=mutation(p,'export'),raw=JSON.stringify(m,null,2),s=await call(a,m,'export_start',raw);
  assert.equal(s.requestDigest,hash(raw));assert.deepEqual(s.limits,{pageSize:5,maxPages:4,maxRows:20,maxBytes:1000000});assert.equal((await proof(a,p)).coverage,'partial');
  const first=await page(a,p);assert.equal(first.items.length,5);assert.equal(first.pageNumber,1);assert.deepEqual(await page(a,p),first);
  await reject(a,{action:'page',...selection(p),sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,cursor:{sourceDigest:p.sourceDigest,afterId:ids.toSorted()[0]},limit:5},'MATERIAL_CURSOR_CONFLICT');
  const last=await page(a,p,first.nextCursor);assert.equal(last.items.length,2);assert.equal(last.sectionComplete,true);assert.deepEqual(await page(a,p,first.nextCursor),last);assert.equal((await proof(a,p)).coverage,'complete');
  if(collect){const fresh=await preview(a,res,ids),fm=mutation(fresh,'export'),fr=JSON.stringify(fm,null,2);const bundle=await collect.collectMaterialExport(fm,fr,{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},async(action,bytes)=>call(a,JSON.parse(bytes),action,bytes),new AbortController().signal,async()=>true);assert.equal(bundle.proof.rows,7);}
  // Immutable request decisions bind original bytes, including whitespace.
  await reject(a,m,'MATERIAL_REQUEST_CONFLICT','export_start',JSON.stringify(m));
  const short=await preview(a,res,[ids[0]]);await db(`select pg_sleep(0.03);`);
  // Fixture cannot overwrite immutable TTL. Advance time with a genuine short PDF below.
  assert.equal(short.expiresAt-short.capturedAt,30000);
 });
 await t.test('reservation erase fences both IDs first; original same-ID replay denied, new ID works; receipt exact bytes after TTL',async()=>{
  const a=await actor(),c=await reservation(a),p=await preview(a,res,[c.referenceId]),m=mutation(p,'erase'),raw=JSON.stringify(m,null,2);
  const financialInput={ownerId:a.owner,appAccountToken:a.owner,environment:'Sandbox',transactionId:'synthetic_'+a.owner,productId:'synthetic.journey.pass',purchaseAt:new Date().toISOString(),catalogVersion:1,policyVersion:'synthetic-v1',capacitySnapshot:{source:'synthetic only',taskLimit:3}};await db(`set request.jwt.claim.role='service_role';select public.storekit_apply_verified_v1(${json(financialInput)});`);
  const finance=()=>db(`select jsonb_agg(to_jsonb(x) order by transaction_id) from public.storekit_grants x where owner_id='${a.owner}';`),beforeFinance=await finance();
  const beforeTrip=await db(`select to_jsonb(t) from public.trips t where id='${a.trip}';`);const receipt=await call(a,m,'erase',raw);
  assert.equal(receipt.effects.objects,1);assert.equal(receipt.effects.temporaryRecords,1);assert.equal(receipt.effects.tripMutation,'none');assert.equal(receipt.effects.externalOrders,'not_contacted');assert.equal(receipt.effects.financialRecords,'not_modified');assert.equal(await finance(),beforeFinance,'actual installed synthetic financial records unchanged');
  assert.equal(await db(`select count(*) from reservation_private.current_v1 where owner_id='${a.owner}';`),'0');assert.equal(await db(`select count(*) from reservation_private.events_v1 where owner_id='${a.owner}';`),'0');assert.equal(await db(`select count(*) from material_exit_private.reservation_fences_v1 where owner_id='${a.owner}';`),'2');assert.equal(await db(`select to_jsonb(t) from public.trips t where id='${a.trip}';`),beforeTrip);
  await deny(confirmSQL(a,c),'MATERIAL_ERASED_ID');await deny(confirmSQL(a,{...c,referenceId:uuid()}),'MATERIAL_ERASED_ID');await deny(confirmSQL(a,{...c,operationId:uuid()}),'MATERIAL_ERASED_ID');await reservation(a);
  assert.deepEqual(await call(a,recovery(p,raw)),receipt);await reject(a,recovery(p,JSON.stringify(m)),'MATERIAL_REQUEST_CONFLICT');
  const unknown=await call(a,{...recovery(p,raw),requestId:uuid(),mutationBytes:JSON.stringify({...m,requestId:uuid()})}).catch(()=>null);assert.equal(unknown,null,'mismatched wrapper must reject');
  const absent={...m,requestId:uuid()};const u=await call(a,{action:'recover',...selection(absent),mutationBytes:JSON.stringify(absent)});assert.equal(u.kind,'unknown');assert.equal(u.allUserDataCompleted,false);
  if(protocol)assert.ok(protocol.decodeMaterialReceipt(receipt,selection(p),{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},hash(raw),Date.now()+31000));
 });
 await t.test('progress inventory exports actual operation fences; own progress erase retains request/receipt/fences',async()=>{
  const a=await actor(),c=await reservation(a),p=await preview(a,res,[c.referenceId]),m=mutation(p,'erase'),raw=JSON.stringify(m),receipt=await call(a,m);
  const list=await call(a,{action:'list',scope:progress,tripId:a.trip,cursor:null,limit:20});assert.deepEqual(list.items.map(x=>x.objectId),[p.requestId]);
  const q=await preview(a,progress,[p.requestId]);if(protocol)assert.ok(protocol.decodeMaterialPreview(q,selection(q),{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},Date.now()));assert.equal(q.items[0].state,'erased');assert.deepEqual(q.items[0].referenceOperationIds,[c.operationId]);
  const x=await preview(a,progress,[q.requestId]),xm=mutation(x,'export');await call(a,xm,'export_start');await page(a,x);assert.equal((await proof(a,x)).coverage,'complete');
  const e=await preview(a,progress,[x.requestId]);assert.equal((await call(a,mutation(e,'erase'))).effects.temporaryRecords,1);
  const after=await preview(a,progress,[x.requestId]);assert.equal(after.items[0].progressErased,true);assert.equal(after.items[0].pages,0);assert.equal(after.items[0].requestDigest,hash(JSON.stringify(xm)));assert.deepEqual(await call(a,recovery(p,raw)),receipt);
  await reject(a,{action:'preview',scope:progress,tripId:a.trip,requestId:q.requestId,objectIds:[q.requestId]},'INVALID_INPUT');
  assert.equal(await db(`select count(*) from material_exit_private.reservation_fences_v1 where owner_id='${a.owner}';`),'2');
 });
 await t.test('live PDF source expiry bounds preview and expired metadata remains safely erasable',async()=>{
  const a=await actor(),s=await pdfSubmit(a,pdfCommand({expiresAt:new Date(Date.now()+2000).toISOString()}));const p=await preview(a,pdf,[s.c.operationId]);assert.equal(p.expiresAt,Date.parse(s.c.expiresAt));assert.equal(p.items[0].fields.length,2);assert.ok(p.expiresAt-p.capturedAt<30000);
  if(protocol)assert.ok(protocol.decodeMaterialPreview(p,selection(p),{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},Date.now()));
  await db('select pg_sleep(2.1);');await reject(a,mutation(p,'erase'),'MATERIAL_EXPIRED');
  const expired=await preview(a,pdf,[s.c.operationId]);assert.equal(expired.items[0].fields,null);assert.equal(expired.items[0].contentHash,null);assert.equal(expired.items[0].operation.state,'expired');
  const receipt=await call(a,mutation(expired,'erase'));assert.equal(receipt.effects.temporaryRecords,1);assert.equal(receipt.effects.unappliedProposals,1);
  assert.equal(await db(`select input_bytes is null and command is null and cancelled from pdf_intake_private.operations_v1 where owner_id='${a.owner}' and operation_id='${s.c.operationId}';`),'t');assert.equal(await db(`select patch='{}'::jsonb and pdf_intake and status='expired' from public.trip_proposals where id='${s.r.proposalId}';`),'t');
  assert.deepEqual(await call(a,recovery(expired,JSON.stringify(mutation(expired,'erase')))),receipt);
  const b=await actor(),live=await pdfSubmit(b,pdfCommand({expiresAt:new Date(Date.now()+2000).toISOString()})),short=await preview(b,pdf,[live.c.operationId]),sm=mutation(short,'erase'),sr=JSON.stringify(sm,null,2),saved=await call(b,sm,'erase',sr);await db('select pg_sleep(2.1);');assert.ok(Date.now()>saved.expiresAt);assert.deepEqual(await call(b,recovery(short,sr)),saved,'committed receipt actually recovers after original preview TTL');
 });
 await t.test('PDF real installed confirmation stays applied after privacy erase; no fabricated confirmed state',async()=>{
  const a=await actor(),s=await pdfSubmit(a);const p=await preview(a,pdf,[s.c.operationId]);assert.equal(p.items[0].operation.state,'pending');
  const result=await db(claims(a)+`select outcome from public.confirm_and_apply_trip_proposal('${s.r.proposalId}','${uuid()}',(select digest from public.read_trip_proposal_v2('${s.r.proposalId}')));`);assert.equal(result,'applied');
  const before=await db(`select jsonb_build_object('trip',(select to_jsonb(x) from public.trips x where id='${a.trip}'),'proposal',(select to_jsonb(x) from public.trip_proposals x where id='${s.r.proposalId}'),'events',(select jsonb_agg(to_jsonb(x)) from public.trip_events x where trip_id='${a.trip}'));`);
  const confirmed=await preview(a,pdf,[s.c.operationId]);assert.equal(confirmed.items[0].operation.state,'confirmed');assert.ok(confirmed.items[0].operation.confirmationEventId);assert.equal(confirmed.items[0].fields,null);
  const receipt=await call(a,mutation(confirmed,'erase'));assert.equal(receipt.effects.temporaryRecords,0);assert.equal(receipt.effects.unappliedProposals,0);
  assert.equal(await db(`select jsonb_build_object('trip',(select to_jsonb(x) from public.trips x where id='${a.trip}'),'proposal',(select to_jsonb(x) from public.trip_proposals x where id='${s.r.proposalId}'),'events',(select jsonb_agg(to_jsonb(x)) from public.trip_events x where trip_id='${a.trip}'));`),before);
  const still=await preview(a,pdf,[s.c.operationId]);assert.equal(still.items[0].operation.state,'confirmed');if(protocol)assert.ok(protocol.decodeMaterialPreview(still,selection(still),{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},Date.now()));
 });
 await t.test('actual archived Trip metadata exit bypasses business admission; current owner/session remains required',async()=>{
  const a=await actor(),first=await pdfSubmit(a);assert.equal(await db(claims(a)+`select outcome from public.confirm_and_apply_trip_proposal('${first.r.proposalId}','${uuid()}',(select digest from public.read_trip_proposal_v2('${first.r.proposalId}')));`),'applied');
  const c=pdfCommand({expectedHeadVersion:1});c.fields[0].value='2026-10-09';const s=await pdfSubmit(a,c);await db(claims(a)+`select public.archive_trip_v1('${a.trip}',1,'${uuid()}',true);`);
  const p=await preview(a,pdf,[s.c.operationId]);assert.equal(p.items[0].fields,null);assert.equal((await call(a,mutation(p,'erase'))).kind,'receipt');
 });
 await t.test('full sensitive PDF patch/replay state invalidates CAS even when safe projection identical',async()=>{
  const a=await actor(),s=await pdfSubmit(a),p=await preview(a,pdf,[s.c.operationId]);
  await db(claims(a)+`update public.trip_proposals set status='rejected' where id='${s.r.proposalId}';`);await reject(a,mutation(p,'erase'),'MATERIAL_SOURCE_CHANGED');assert.equal(await db(`select input_bytes is not null from pdf_intake_private.operations_v1 where owner_id='${a.owner}';`),'t');
 });
 await t.test('digest covers hidden expired PDF bytes/patch; applied status without installed proof is never success',async()=>{
  const a=await actor(),s=await pdfSubmit(a,pdfCommand({expiresAt:new Date(Date.now()+600).toISOString()}));await db('select pg_sleep(0.65);');const p=await preview(a,pdf,[s.c.operationId]);assert.equal(p.items[0].fields,null);
  await db(`select pdf_intake_private.erase_v1('${a.owner}','${s.c.operationId}',false);`);const current=await preview(a,pdf,[s.c.operationId]);assert.deepEqual(current.items,p.items,'safe projection unchanged while actual sensitive bytes/patch changed');assert.notEqual(current.sourceDigest,p.sourceDigest);await reject(a,mutation(p,'erase'),'MATERIAL_SOURCE_CHANGED');
  const b=await actor(),bad=await pdfSubmit(b);await db(claims(b)+`update public.trip_proposals set status='applied' where id='${bad.r.proposalId}';`);
  const list=await call(b,{action:'list',scope:pdf,tripId:b.trip,cursor:null,limit:20});assert.equal(list.items[0].sourceState,'rejected');await reject(b,{action:'preview',scope:pdf,tripId:b.trip,requestId:uuid(),objectIds:[bad.c.operationId]},'MATERIAL_SOURCE_INVALID');
 });
 await t.test('twenty selected rows require four real pages; twenty-one selections are denied',async()=>{
  const a=await actor(),ids=[];for(let n=0;n<20;n++)ids.push((await reservation(a)).referenceId);const p=await preview(a,res,ids);await call(a,mutation(p,'export'),'export_start');let cursor=null;for(let n=0;n<4;n++){const r=await page(a,p,cursor);assert.equal(r.pageNumber,n+1);assert.equal(r.items.length,5);cursor=r.nextCursor;}const done=await proof(a,p);assert.equal(done.coverage,'complete');assert.equal(done.rows,20);assert.equal(done.pages,4);
  await reject(a,{action:'preview',scope:res,tripId:a.trip,requestId:uuid(),objectIds:[...ids,uuid()].toSorted()},'INVALID_INPUT');
 });
 await t.test('late receipt write failure rolls selected erasure and fences back atomically',async()=>{
  const a=await actor(),c=await reservation(a),p=await preview(a,res,[c.referenceId]);
  await db(`create function material_exit_private.fixture_fault() returns trigger language plpgsql as $$begin if NEW.decision='erase' then raise exception 'OWN_FIXTURE_LATE_FAILURE';end if;return NEW;end$$;create trigger material_fixture_fault before update on material_exit_private.requests_v1 for each row execute function material_exit_private.fixture_fault();`);
  const before=await state();await reject(a,mutation(p,'erase'),'OWN_FIXTURE_LATE_FAILURE');assert.equal(await state(),before);assert.equal(await db(`select count(*) from reservation_private.current_v1 where owner_id='${a.owner}';`),'1');
  await db('drop trigger material_fixture_fault on material_exit_private.requests_v1;drop function material_exit_private.fixture_fault();');
 });
 async function sleeping(name){for(let n=0;n<100;n++){if(await db(`select exists(select 1 from pg_stat_activity where application_name=${lit(name)} and wait_event='PgSleep');`)==='t')return;await new Promise(r=>setTimeout(r,10));}assert.fail('owned holder not observed');}
 await t.test('real concurrent writer/source/account locks reject without effects; no NOWAIT success claim',async()=>{
  const a=await actor(),c=await reservation(a),p=await preview(a,res,[c.referenceId]);const before=await state();
  for(const [name,lock] of [['account',`select 1 from identity_private.mobile_accounts where owner_id='${a.owner}' for update;`],['source',`select 1 from reservation_private.current_v1 where owner_id='${a.owner}' for update;`],['trip',`select 1 from public.trips where id='${a.trip}' for update;`]]){
   const holder=sql(container,`set application_name='material-${name}-holder';begin;${lock}select pg_sleep(0.6);commit;`);await sleeping('material-'+name+'-holder');await reject(a,mutation(p,'erase'),'could not obtain lock|MATERIAL_LOCK_CONFLICT');assert.equal((await holder).code,0);assert.equal(await state(),before);
  }
  const changed={...c,operationId:uuid(),expectedRevision:1,fields:{...c.fields,status:'amended'}};const holder=sql(container,`set application_name='material-business-holder';begin;${confirmSQL(a,changed)}select pg_sleep(0.6);commit;`);await sleeping('material-business-holder');await reject(a,mutation(p,'erase'),'could not obtain lock|MATERIAL_LOCK_CONFLICT');assert.equal((await holder).code,0);await reject(a,mutation(p,'erase'),'MATERIAL_SOURCE_CHANGED');
 });
 await t.test('history overflow, mismatched selections and byte/page cap fail without partial effects',async()=>{
  const a=await actor(),c=await reservation(a);for(let revision=1;revision<101;revision++)await reservation(a,{...c,operationId:uuid(),expectedRevision:revision,fields:{...c.fields,terms:'Revision '+revision}});
  await reject(a,{action:'preview',scope:res,tripId:a.trip,requestId:uuid(),objectIds:[c.referenceId]},'MATERIAL_CAPACITY');assert.equal(await db(`select count(*) from material_exit_private.requests_v1 where owner_id='${a.owner}';`),'0');
  const b=await actor(),d=await reservation(b);await reject(b,{action:'preview',scope:res,tripId:b.trip,requestId:uuid(),objectIds:[c.referenceId,d.referenceId].toSorted()},'MATERIAL_SOURCE_MISSING');
  const p=await preview(b,res,[d.referenceId]);await call(b,mutation(p,'export'),'export_start');await db(`update material_exit_private.progress_v1 set bytes=1000000 where request_id='${p.requestId}';`);const before=await state();await reject(b,{action:'page',...selection(p),sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,cursor:null,limit:5},'MATERIAL_CAPACITY');assert.equal(await state(),before);assert.equal((await proof(b,p)).coverage,'partial');
  await db(`update material_exit_private.progress_v1 set bytes=0,pages=4 where request_id='${p.requestId}';`);await reject(b,{action:'page',...selection(p),sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,cursor:null,limit:5},'MATERIAL_PROGRESS_INVALID');
 });
 await t.test('new-session metadata is safe; old authority and Trip deletion fence reject before effects',async()=>{
  const a=await actor(),s=await pdfSubmit(a),p=await preview(a,pdf,[s.c.operationId]),next=uuid();
  await db(`insert into auth.sessions(id,user_id) values('${next}','${a.owner}');update identity_private.mobile_accounts set epoch=2,session_id='${next}' where owner_id='${a.owner}';insert into identity_private.mobile_attempts values('${a.owner}','${uuid()}','${next}',2);`);
  const before=await state();await reject(a,mutation(p,'erase'),'SESSION_REPLACED');assert.equal(await state(),before);
  const current={...a,session:next,epoch:2},safe=await preview(current,pdf,[s.c.operationId]);assert.equal(safe.items[0].fields,null);assert.equal(safe.items[0].contentHash,null);assert.equal(safe.items[0].sessionEpoch,1);
  if(protocol)assert.ok(protocol.decodeMaterialPreview(safe,selection(safe),{ownerId:a.owner,sessionId:next,mobileEpoch:2},Date.now()));
  await db(claims(current)+`select public.request_trip_deletion_v1('${uuid()}','${a.trip}',0,true);`);const fenced=await state();await reject(current,mutation(safe,'erase'),'MATERIAL_TRIP_UNAVAILABLE');assert.equal(await state(),fenced);
 });
 await t.test('root account cascade does not recreate state; minimal reference fences survive Trip cascade',async()=>{
  const a=await actor(),c=await reservation(a),p=await preview(a,res,[c.referenceId]),m=mutation(p,'erase'),raw=JSON.stringify(m),receipt=await call(a,m);
  await db(`delete from public.trips where id='${a.trip}';`);assert.equal(await db(`select count(*) from material_exit_private.requests_v1 where owner_id='${a.owner}';`),'1');assert.equal(await db(`select count(*) from material_exit_private.reservation_fences_v1 where owner_id='${a.owner}';`),'2');
  assert.deepEqual(await call(a,recovery(p,raw)),receipt,'installed receipt survives Trip deletion without new mutation rights');
  const newTrip=uuid();await db(claims(a)+`insert into public.trips(id,owner_id,title) values('${newTrip}','${a.owner}','Other synthetic Trip');`);const newMaterial=await reservation({...a,trip:newTrip});await reject({...a,trip:newTrip},{action:'preview',scope:res,requestId:p.requestId,tripId:newTrip,objectIds:[newMaterial.referenceId]},'MATERIAL_REQUEST_CONFLICT');
  await db(`delete from auth.users where id='${a.owner}';`);assert.equal(await db(`select count(*) from material_exit_private.reservation_fences_v1 where owner_id='${a.owner}';`),'0');
 });
 await t.test('owned applied rollback removes only new API/schema/triggers; original source/ACL stay exact',async()=>{
  assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;drop function public.privacy_material_reference_v1(text,text,bigint);drop schema material_exit_private cascade;commit;');assert.equal(await db("select to_regnamespace('material_exit_private') is null;"),'t');assert.equal(await oldFunctions(),beforeFunctions);assert.equal(await oldTables(),beforeTables);
  await db('begin;'+src+'commit;');assert.equal(await db("select has_function_privilege('authenticated','public.privacy_material_reference_v1(text,text,bigint)','EXECUTE');"),'f');
 });
});
