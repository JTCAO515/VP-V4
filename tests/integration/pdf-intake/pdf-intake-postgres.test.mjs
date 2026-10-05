// Network-none disposable PG; synthetic owned Auth/session/claims, explicit
// fixture-only grant. This proves SQL behavior, not target Auth/enrollment.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash,createCipheriv} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1';
// Paired TS ownership remains separate; import its actual accepted algorithm
// when supplied, rather than duplicating a JavaScript preview oracle here.
const wireRoot=process.env.VP_PDF_TS_WIRE_ROOT;
const reference=wireRoot?await import(pathToFileURL(resolve(wireRoot,'lib/server/intake/pdf/preview.ts')).href):null;
const container='vpj55-pdf-'+randomUUID().slice(0,8);let created=false;
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const json=v=>literal(JSON.stringify(v))+'::jsonb';
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';`;
const digest=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const deny=async(q,re)=>{const r=await sql(container,q);assert.notEqual(r.code,0,'expected denial');assert.match(r.stderr,re);};
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;grant usage on schema auth to authenticated;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
async function fixture(){
 const a={owner:randomUUID(),session:randomUUID(),trip:randomUUID(),epoch:1};
 await db(`insert into auth.users(id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${a.owner}',1,'${a.session}');insert into identity_private.mobile_attempts values('${a.owner}','${randomUUID()}','${a.session}',1);${claims(a)}insert into public.trips(id,owner_id,title) values('${a.trip}','${a.owner}','Synthetic PDF Trip');`);
 return a;
}
const cmd=(overrides={})=>({operationId:randomUUID(),expectedHeadVersion:0,contentHash:'a'.repeat(64),byteCount:12345,pageCount:2,extraction:'pdfkit_text',expiresAt:new Date(Date.now()+3600000).toISOString(),fields:[{kind:'date',value:'2026-10-08',locator:{page:1,line:3,sourceTextHash:'b'.repeat(64)}},{kind:'address',value:'广州·旅行 😀',locator:{page:2,line:9,sourceTextHash:'c'.repeat(64)}}],...overrides});
const callSQL=(a,action,input,raw=JSON.stringify(input))=>claims(a)+`set role authenticated;select public.pdf_intake_v1(${literal(action)},'${a.trip}',${literal(raw)},${a.epoch});`;
const call=async(a,action,input,raw)=>JSON.parse(await db(callSQL(a,action,input,raw)));
const preview=async(a,c)=>{
 const p=await call(a,'preview',c);
 if(reference){const snapshot=await snap(a),version=Number(await db(`select head_version from public.trips where id='${a.trip}';`));assert.deepEqual(p,reference.buildPdfPreview(a.trip,{...snapshot,version},c),'actual paired TS/SQL preview parity');}
 return p;
};
async function submit(a,c){const p=await preview(a,c);const input={command:c,reviewedPreviewDigest:p.previewDigest};const raw=JSON.stringify(input,null,2);return {p,c,input,raw,r:await call(a,'proposal',input,raw)};}
const operation=(a,id)=>call(a,'operation',{operationId:id});
const snap=async a=>JSON.parse(await db(claims(a)+`select public.trip_content_snapshot('${a.trip}',title) from public.trips where id='${a.trip}';`));
const confirmSQL=(a,p,id=randomUUID())=>claims(a)+`set role authenticated;select outcome from public.confirm_and_apply_trip_proposal('${p.proposalId}',${literal(id)},(select digest from public.read_trip_proposal_v2('${p.proposalId}')));`;

run('append replay, RLS and default deny before isolated enrollment',async()=>{
 assert.equal(await db("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='pdf_intake_private' and c.relkind='r' and not c.relrowsecurity;"),'0');
 assert.equal(await db("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values('anon'),('authenticated'),('service_role'))r(role) where (n.nspname='pdf_intake_private' or p.proname in('pdf_intake_v1','pdf_intake_export_v1','pdf_intake_prune_v1')) and has_function_privilege(r.role,p.oid,'EXECUTE');"),'0');
 const a=await fixture();await deny(callSQL(a,'operation',{operationId:randomUUID()}),/permission denied/);
 await db('grant execute on function public.pdf_intake_v1(text,uuid,text,bigint) to authenticated;');
 assert.equal((await operation(a,randomUUID())).state,'absent');
});
run('canonical bytes Unicode arrays numeric forms and UTF16 bounds',async()=>{
 for(const v of [{z:'广州😀"\\/\u2028',a:[1,0,'é']},cmd(),[null,true,false,1.0,20]])assert.equal(await db(`select pdf_intake_private.canonical_v1(${json(v)});`),canonical(v));
 assert.equal(await db(`select pdf_intake_private.canonical_v1('1.000'::jsonb);`),'1');
 assert.equal(await db(`select pdf_intake_private.canonical_v1('-0.000'::jsonb);`),'0');
 const a=await fixture(),c=cmd();c.fields[1].value='😀'.repeat(48);assert.equal((await preview(a,c)).commandDigest,digest(canonical(c)));
 const ordinary=cmd();const decimal=JSON.stringify(ordinary).replace('"pageCount":2','"pageCount":2.0').replace('"expectedHeadVersion":0','"expectedHeadVersion":0.0').replace('"page":1','"page":1.0');assert.deepEqual(await call(a,'preview',ordinary,decimal),await preview(a,ordinary));
 const four=cmd();four.fields.splice(0,0,{kind:'amount',value:'USD 129.50',locator:{page:1,line:10,sourceTextHash:'d'.repeat(64)}});four.fields.push({kind:'status',value:'User says reserved',locator:{page:2,line:20,sourceTextHash:'e'.repeat(64)}});await preview(a,four);
 c.fields[1].value+='a';await deny(callSQL(a,'preview',c),/INVALID_INPUT/);
 for(const value of [' x','x\u00a0','x\n','\ufeffx']){c.fields[1].value=value;await deny(callSQL(a,'preview',c),/INVALID_INPUT/);}
});

run('TTL worker and session/Trip/account lifecycle erase payload and temporary patch, preserve denial',async()=>{
 await db('grant execute on function public.pdf_intake_prune_v1(integer) to service_role;');
 const expiry=await fixture(),short=cmd({expiresAt:new Date(Date.now()+1500).toISOString()}),s=await submit(expiry,short);
 await new Promise(r=>setTimeout(r,1550));await db("set request.jwt.claim.role='service_role';set role service_role;select public.pdf_intake_prune_v1(100);");
 assert.equal((await operation(expiry,short.operationId)).state,'expired');
 assert.equal(await db(`select input_bytes is null and command is null and request_digest is not null from pdf_intake_private.operations_v1 where owner_id='${expiry.owner}';`),'t');
 assert.equal(await db(`select patch='{}'::jsonb and pdf_intake from public.trip_proposals where id='${s.r.proposalId}';`),'t');
 await deny(callSQL(expiry,'proposal',s.input,s.raw),/PROPOSAL_NOT_CONFIRMABLE/);assert.notEqual(await db(confirmSQL(expiry,s.r)),'applied');
 for(const mode of ['replacement','logout','delete_session','trip_request','trip','account']){
  const a=await fixture(),s=await submit(a,cmd());
  if(mode==='replacement'){
   const next=randomUUID();await db(`insert into auth.sessions(id,user_id) values('${next}','${a.owner}');update identity_private.mobile_accounts set epoch=2,session_id='${next}' where owner_id='${a.owner}';insert into identity_private.mobile_attempts values('${a.owner}','${randomUUID()}','${next}',2);`);
   await deny(callSQL(a,'operation',{operationId:s.c.operationId}),/SESSION_REPLACED/);
   await deny(callSQL({...a,session:next,epoch:2},'operation',{operationId:s.c.operationId}),/IDEMPOTENCY_KEY_REUSE/);
  }
  if(mode==='logout')await db(`update identity_private.mobile_accounts set epoch=2,session_id=null where owner_id='${a.owner}';`);
  if(mode==='delete_session')await db(`delete from auth.sessions where id='${a.session}';`);
  if(mode==='trip_request')await db(claims(a)+`select public.request_trip_deletion_v1('${randomUUID()}','${a.trip}',0,true);`);
  if(mode==='trip')await db(`delete from public.trips where id='${a.trip}';`);
  if(mode==='account')await db(`delete from auth.users where id='${a.owner}';`);
  if(mode==='trip'||mode==='account')assert.equal(await db(`select count(*) from pdf_intake_private.operations_v1 where owner_id='${a.owner}';`),'0');
  else {
   assert.equal(await db(`select input_bytes is null and command is null from pdf_intake_private.operations_v1 where owner_id='${a.owner}';`),'t');
   assert.equal(await db(`select patch='{}'::jsonb and pdf_intake from public.trip_proposals where id='${s.r.proposalId}';`),'t');
  }
 }
});

const worker="set request.jwt.claim.role='service_role';set request.jwt.claims='{\"role\":\"service_role\"}';";
const exportCall=async(a,action,input)=>JSON.parse(await db((a?claims(a):worker)+`select public.privacy_core_export_v1('${action}',${json(input)});`));
async function lease(a){const request=randomUUID();await exportCall(a,'request',{requestId:request,confirmed:true});return exportCall(null,'claim',{requestId:request,operationId:randomUUID(),maxRunMs:90000,expectedEnvironment:'local',expectedKeyId:'synthetic-pdf-key'});}
const exportInput=l=>({version:'pdf-intake-export/1',requestId:l.requestId,leaseId:l.leaseId,generation:l.generation,cursor:null,limit:100});
const exportSQL=input=>worker+`set role service_role;select public.pdf_intake_export_v1(${json(input)});`;
const exportPage=async l=>JSON.parse(await db(exportSQL(exportInput(l))));
async function exportCommit(a,l,modules,data={}){
 const key=randomBytes(32),nonce=randomBytes(12),plain=Buffer.from(canonical({schemaVersion:'privacy-core-export/1',requestId:l.requestId,coverage:'partial',allUserDataCompleted:false,data,modules}));
 const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(canonical(['privacy-core-export/1',l.requestId,a.owner,l.generation])));
 const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
 const artifact={schemaVersion:'privacy-export-artifact/1',keyId:'synthetic-pdf-key',nonce:nonce.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url'),plaintextDigest:digest(plain),plaintextBytes:plain.length,expiresAt:new Date(Date.now()+300000).toISOString()};
 return {requestId:l.requestId,leaseId:l.leaseId,generation:l.generation,artifact,modules,coverage:'partial'};
}
run('new exact export lease owner pages, actual cursor/source invalidation, no old completion retrofit',async()=>{
 await db(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) values('${randomUUID()}',1,true,'local','synthetic-pdf-key',90000,600000,300000,1000,100,8388608,clock_timestamp()+interval '1 day');grant execute on function public.pdf_intake_export_v1(jsonb) to service_role;`);
 const a=await fixture(),b=await fixture(),s=await submit(a,cmd());await submit(b,cmd());const l=await lease(a),input=exportInput(l),p=await exportPage(l);
 assert.equal(p.items.length,1);assert.equal(p.items[0].operationId,s.c.operationId);assert.deepEqual(p.items[0].fields,s.c.fields);assert.equal(p.items[0].rawPdfIncluded,false);assert.equal(p.allUserDataCompleted,false);assert.deepEqual(await exportPage(l),p);
 assert.equal(JSON.parse(await db(exportSQL({...input,leaseId:randomUUID()}))).kind,'unavailable');
 await deny(exportSQL({...input,cursor:randomUUID()}),/INVALID_EXPORT_CURSOR/);await deny(exportSQL({...input,limit:99}),/EXPORT_SOURCE_CURSOR_CONFLICT/);
 const modules=['trip','conversations','results','profile','memory','turn','user_artifact','brief','entitlements'].map(module=>({module,status:'unavailable',reason:'HANDLER_MISSING',pages:0,rows:0,digest:null}));
 const hasCommit=async(l,modules)=>db(`select pdf_intake_private.export_commit_v1(j,${json(modules)},'${l.leaseId}',${l.generation}) from export_private.core_jobs_v1 j where request_id='${l.requestId}';`);
 modules[6]={module:'user_artifact',status:'complete',reason:'NONE',pages:1,rows:1,digest:digest('fixture pages')};assert.equal(await hasCommit(l,modules),'t');
 const unenrolled=await lease(b);assert.equal(await hasCommit(unenrolled,modules),'f');const fake=await exportCommit(b,unenrolled,modules);
 await deny(worker+`select public.privacy_core_export_v1('commit',${json(fake)});`,/INVALID_OUTPUT/);
 const partial=structuredClone(modules);partial[6]={module:'user_artifact',status:'unavailable',reason:'HANDLER_MISSING',pages:0,rows:0,digest:null};assert.equal(await hasCommit(unenrolled,partial),'t');
 const oldArtifact=await exportCommit(b,unenrolled,partial);assert.equal((await exportCall(null,'commit',oldArtifact)).state,'ready_partial');
 assert.equal((await exportPage(unenrolled)).kind,'unavailable');assert.equal(await db(`select pdf_export_version is null from export_private.core_jobs_v1 where request_id='${unenrolled.requestId}';`),'t');
 const artifact=await exportCommit(a,l,modules,{user_artifact:p.items});assert.equal((await exportCall(null,'commit',artifact)).state,'ready_partial');
 assert.equal((await exportCall(null,'commit',artifact)).state,'ready_partial','exact old commit ACK can recover');
 await call(a,'cancel',{operationId:s.c.operationId});assert.equal((await exportCall(null,'validate',{requestId:l.requestId,leaseId:l.leaseId,generation:l.generation})).current,false);assert.equal((await exportPage(l)).kind,'unavailable');
 assert.equal((await exportCall(a,'read',{requestId:l.requestId})).kind,'unavailable','ready controlled artifact invalidates on real source erasure');
});

run('concurrent cancel/confirm and privacy/source contention abort without deadlock or partial apply',async()=>{
 const a=await fixture(),s=await submit(a,cmd());
 const results=await Promise.all([sql(container,confirmSQL(a,s.r)),sql(container,callSQL(a,'cancel',{operationId:s.c.operationId}))]);
 for(const r of results)if(r.code!==0){assert.match(r.stderr,/LIFECYCLE_LOCK_CONFLICT|could not obtain lock|PROPOSAL_NOT_CONFIRMABLE|CONFIRMATION_DIGEST_MISMATCH/);assert.doesNotMatch(r.stderr,/deadlock/);}
 const recovered=await operation(a,s.c.operationId),snapshot=await snap(a);assert.ok(['confirmed','cancelled'].includes(recovered.state));assert.equal(snapshot.days.length,recovered.state==='confirmed'?1:0);
 assert.equal(await db('select deadlocks from pg_stat_database where datname=current_database();'),'0');
 const b=await fixture(),bs=await submit(b,cmd()),l=await lease(b);const holder=sql(container,`set application_name='pdf_export_holder';begin;${exportSQL(exportInput(l))}select pg_sleep(0.5);commit;`);
 for(let n=0;n<60;n++){if(await db("select exists(select 1 from pg_stat_activity where application_name='pdf_export_holder' and wait_event_type='Timeout');")==='t')break;if(n===59)assert.fail('holder unobserved');await new Promise(r=>setTimeout(r,10));}
 await deny(callSQL(b,'cancel',{operationId:bs.c.operationId}),/LIFECYCLE_LOCK_CONFLICT|could not obtain lock/);const end=await holder;assert.equal(end.code,0,end.stderr);assert.equal((await operation(b,bs.c.operationId)).state,'pending');
});
run('durable original-byte idempotency, original explicit writer and historical receipt',async()=>{
 const a=await fixture(),c=cmd(),s=await submit(a,c);assert.equal(s.r.requestDigest,digest(s.raw));assert.equal(s.r.commandDigest,digest(canonical(c)));
 assert.deepEqual((await snap(a)).days,[]);assert.equal((await operation(a,c.operationId)).state,'pending');
 assert.equal((await call(a,'proposal',s.input,s.raw)).reused,true);
 await deny(callSQL(a,'proposal',s.input,JSON.stringify(s.input)),/IDEMPOTENCY_KEY_REUSE/);
 assert.equal(await db(confirmSQL(a,s.r)),'applied');const recovered=await operation(a,c.operationId);assert.equal(recovered.state,'confirmed');assert.equal(recovered.resultingVersion,1);assert.match(recovered.confirmationEventId,/^[0-9a-f-]{36}$/);
 assert.equal(await db(`select input_bytes is null and command is null from pdf_intake_private.operations_v1 where owner_id='${a.owner}';`),'t');
 const p=JSON.parse(await db(claims(a)+`select row_to_json(p) from public.create_trip_proposal_patch('${a.trip}',${json({expectedVersion:1,operations:[{kind:'set_title',title:'Later title'}]})})p;`));
 assert.equal(await db(confirmSQL(a,{proposalId:p.proposal_id})),'applied');assert.deepEqual(await operation(a,c.operationId),recovered);
 assert.equal((await call(a,'cancel',{operationId:c.operationId})).state,'confirmed');
});
run('preview parity, repeat duplicate, conflicts preserve existing fixed items and order',async()=>{
 const a=await fixture();await db(`insert into public.trip_days(trip_id,owner_id,day_id,trip_date,time_zone) values('${a.trip}','${a.owner}','d1','2026-10-08','Etc/UTC');insert into public.trip_items(trip_id,owner_id,day_id,item_id,title,starts_at,ends_at,manual_order) values('${a.trip}','${a.owner}','d1','z','Fixed reservation','2026-10-08T10:00:00Z','2026-10-08T11:00:00Z',0),('${a.trip}','${a.owner}','d1','a','Second',null,null,1);`);
 const before=await snap(a),c=cmd(),s=await submit(a,c);assert.equal(s.p.patch.operations.at(-1).kind,'reorder_items');
 assert.equal(await db(confirmSQL(a,s.r)),'applied');const first=await snap(a);assert.deepEqual(first.days[0].items.slice(0,2),before.days[0].items);
 const repeat={...c,operationId:randomUUID(),expectedHeadVersion:1};assert.equal((await preview(a,repeat)).relation,'duplicate');
 const conflict={...repeat,operationId:randomUUID(),fields:structuredClone(c.fields)};conflict.fields[1].value='Changed address';const cs=await submit(a,conflict);assert.equal(cs.p.relation,'conflict');assert.equal(await db(confirmSQL(a,cs.r)),'applied');
 const withoutSlot=items=>items.map(({manualOrder,...i})=>i);assert.deepEqual(withoutSlot((await snap(a)).days[0].items.slice(0,3)),withoutSlot(first.days[0].items));
});
run('owner epoch Trip head digest limits cancel tombstone and marker successor denial',async()=>{
 const a=await fixture(),b=await fixture(),c=cmd();const p=await preview(a,c);
 await deny(callSQL({...b,trip:a.trip},'preview',c),/FORBIDDEN/);await deny(callSQL({...a,epoch:2},'preview',c),/SESSION_REPLACED/);
 await deny(callSQL(a,'preview',{...c,expectedHeadVersion:1}),/STALE_TRIP_VERSION/);
 await deny(callSQL(a,'proposal',{command:c,reviewedPreviewDigest:'0'.repeat(64)}),/PDF_PREVIEW_MISMATCH/);
 for(const bad of [{...c,pageCount:11},{...c,byteCount:20000001},{...c,extra:true},{...c,fields:[c.fields[1]]}])await deny(callSQL(a,'preview',bad),/INVALID_INPUT/);
 assert.equal((await call(a,'cancel',{operationId:c.operationId})).state,'cancelled');await deny(callSQL(a,'proposal',{command:c,reviewedPreviewDigest:p.previewDigest}),/CANCELLED/);
 const s=await submit(a,cmd());await deny(claims(a)+`select * from public.revise_trip_proposal_patch('${s.r.proposalId}',${json(s.p.patch)});`,/PDF_SUCCESSOR_FORBIDDEN/);
 await deny(claims(a)+`insert into public.trip_events(trip_id,owner_id,resulting_version,proposal_id,event_type) values('${a.trip}','${a.owner}',1,'${s.r.proposalId}','proposal_applied');`,/PDF_CONFIRM_GUARD/);
 await deny(`update public.trip_proposals set expires_at=expires_at+interval '1 day' where id='${s.r.proposalId}';`,/PDF_PROPOSAL_IMMUTABLE/);
 assert.equal((await call(a,'cancel',{operationId:s.c.operationId})).state,'cancelled');assert.notEqual(await db(confirmSQL(a,s.r)),'applied');
});
