// Real disposable PostgreSQL; synthetic role/consent fixtures are not target Auth or APNs.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash,generateKeyPairSync} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_NOTICE_DB_TEST==='1',container=process.env.VP_NOTICE_TEST_CONTAINER||'vp221-'+uuid().slice(0,8);let created=false;
const migration='20261005030000_reminder_delivery.sql';
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const claims=a=>`set request.jwt.claim.sub='${a.owner}';set request.jwt.claim.role='authenticated';set request.jwt.claims='${JSON.stringify({session_id:a.session,is_anonymous:false,role:'authenticated'})}';`;
const svcClaims="set request.jwt.claim.role='service_role';set request.jwt.claims='{\"role\":\"service_role\"}';";
const user=async(f,action,input={})=>JSON.parse(await db(`begin;${claims(f.a)}set role authenticated;select public.travel_reminders_v2(${lit(f.trip)},${lit(action)},${lit(input)});commit;`));
const svc=async(name,args)=>{const input=name==='dispatch_travel_notification_v2'&&args[1]==='begin'?[args[0],'begin_fenced',args[2]]:args;return JSON.parse(await db(`begin;${svcClaims}set role service_role;select public.${name}(${input.map(lit).join(',')});commit;`));};
const reject=async(f,action,input,code)=>{const r=await sql(container,`begin;${claims(f.a)}set role authenticated;select public.travel_reminders_v2(${lit(f.trip)},${lit(action)},${lit(input)});commit;`);assert.notEqual(r.code,0);assert.match(r.stderr,new RegExp(code));};
const run=(n,fn)=>test(n,{skip:!enabled,timeout:120000},fn);
before(async()=>{
 if(!enabled)return;
 if(!process.env.VP_NOTICE_TEST_CONTAINER){
  const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
  for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
  await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   const source=readFileSync('supabase/migrations/'+f,'utf8');
   if(f===migration){await db('begin;'+source+'rollback;');assert.equal(await db("select to_regnamespace('notification_private') is null;"),'t');}
   await db('begin;'+source+'commit;');
  }
 }
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
run('full replay rollback and ACL/RLS default deny, SQL transport disabled',async()=>{
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='notification_private' or n.nspname='public' and p.proname in('travel_reminders_v2','poll_travel_notifications_v2','dispatch_travel_notification_v2','resolve_travel_notification_v2','notification_metadata_export_v1')) and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
  assert.equal(await db(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='notification_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,DELETE'));`),'0');
 }
 assert.equal(await db("select enabled from notification_private.settings;"),'f');
 // Disposable fixture grants only; no migration or target enrollment.
 await db('grant execute on function public.travel_reminders_v2(uuid,text,jsonb),public.resolve_travel_notification_v2(uuid) to authenticated;grant execute on function public.poll_travel_notifications_v2(integer),public.dispatch_travel_notification_v2(uuid,text,jsonb) to service_role;');
 assert.deepEqual(await svc('poll_travel_notifications_v2',[1]),{kind:'idle'});
 assert.deepEqual(await svc('dispatch_travel_notification_v2',[uuid(),'begin',{attemptId:uuid()}]),{kind:'blocked'});
});
async function fixture({device=true}={}){
 const a={owner:uuid(),session:uuid()},trip=uuid(),deviceId=uuid(),token=uuid().replaceAll('-','')+uuid().replaceAll('-','');
 await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${a.owner}','${a.session}',1);insert into identity_private.mobile_attempts values('${a.owner}','${uuid()}','${a.session}',1);
 insert into public.trips(id,owner_id,title,head_version) values('${trip}','${a.owner}','Synthetic journey',1);
 insert into public.trip_days(trip_id,owner_id,day_id,trip_date,time_zone) values('${trip}','${a.owner}','Day_A',current_date+2,'Asia/Shanghai');
 insert into public.trip_version_snapshots(trip_id,owner_id,version,title,content) values('${trip}','${a.owner}',1,'Synthetic journey','{"title":"Synthetic journey","days":[{"id":"Day_A","date":"2026-10-07","timeZone":"Asia/Shanghai","items":[]}]}' ) on conflict(trip_id,version) do update set content=excluded.content;`);
 const f={a,trip,deviceId,token};
 if(device){await db("update notification_private.settings set enabled=true,environment='sandbox',topic='fixture.only';");await user(f,'register_device',{operationId:uuid(),deviceId,token,environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'});}
 f.source=(await user(f,'list')).nextSteps.find(x=>x.source.kind==='current_trip').source;
 f.request=(extra={})=>({operationId:uuid(),id:uuid(),baseVersion:1,purpose:'user_set_travel',source:f.source,reason:'My flight reminder',dueAt:new Date(Date.now()+60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),timeZone:'Asia/Shanghai',quietHours:{startMinute:0,endMinute:0},consent:true,...extra});
 return f;
}
async function scheduled(f,extra={}){const x=f.request(extra);const view=await user(f,'schedule',x);const notification=await db(`select id from notification_private.outbox where reminder_id='${x.id}';`);return {x,view,notification};}
async function due(s){await db(`update notification_private.reminders set due_at=clock_timestamp()-interval '1 second' where id='${s.x.id}';update public.travel_reminders set due_at=clock_timestamp()-interval '1 second' where id='${s.x.id}';`);}
run('strict calendar/offset/zone/closed purpose rejects direct callers; IANA DST quiet hours',async()=>{
 const f=await fixture();for(const extra of [{dueAt:'2026-02-30T01:00:00Z'},{dueAt:'2026-10-07T24:00:00Z'},{dueAt:'2026-10-07T01:00:00+14:01'},{dueAt:'2026-10-07T01:00:00'},{timeZone:'Fake/Zone'},{purpose:'marketing'},{consent:false},{quietHours:{startMinute:1440,endMinute:0}}])await reject(f,'schedule',f.request(extra),'INVALID_INPUT');
 assert.equal(await db(`select notification_private.in_quiet('{"startMinute":60,"endMinute":120}','America/New_York','2026-11-01T05:30:00Z'),notification_private.in_quiet('{"startMinute":60,"endMinute":120}','America/New_York','2026-11-01T06:30:00Z');`),'t|t');
 assert.equal(await db(`select notification_private.in_quiet('{"startMinute":60,"endMinute":120}','America/New_York','2026-03-08T07:30:00Z');`),'f');
});
run('immutable exact full digest/replay and historical ACK cannot resurrect cancelled reminders',async()=>{
 const f=await fixture(),s=await scheduled(f);assert.equal(s.view.mutationReceipt.outcome,'applied');assert.equal(s.view.mutationReceipt.terminal,true);
 const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
 assert.equal(s.view.mutationReceipt.requestDigest,createHash('sha256').update(canonical({action:'schedule',input:s.x})).digest('hex'));
 await user(f,'cancel',{operationId:uuid(),id:s.x.id});await db(`update public.trips set head_version=2 where id='${f.trip}';`);
 const replay=await user(f,'schedule',s.x);assert.deepEqual(replay.mutationReceipt,s.view.mutationReceipt);assert.equal(replay.reminders.find(r=>r.id===s.x.id).status,'cancelled');
 await reject(f,'schedule',{...s.x,reason:'Different'},'IDEMPOTENCY_KEY_REUSE');
 assert.equal((await sql(container,`update notification_private.operations set receipt='{}';`)).code!==0,true);
});
run('same operation abandon is serialized: absent tombstone blocks late execute, applied stays applied',async()=>{
 const f=await fixture(),x=f.request();const command={action:'schedule',input:x};
 const abandoned=await user(f,'abandon',{command});assert.equal(abandoned.mutationReceipt.outcome,'cancelled');assert.equal(abandoned.mutationReceipt.revision,0);
 assert.deepEqual((await user(f,'schedule',x)).mutationReceipt,abandoned.mutationReceipt);assert.equal(await db(`select count(*) from notification_private.reminders where id='${x.id}';`),'0');
 const s=await scheduled(f);assert.deepEqual((await user(f,'abandon',{command:{action:'schedule',input:s.x}})).mutationReceipt,s.view.mutationReceipt);
 const y=f.request();const [execute,cancel]=await Promise.all([user(f,'schedule',y),user(f,'abandon',{command:{action:'schedule',input:y}})]);assert.deepEqual(execute.mutationReceipt,cancel.mutationReceipt);
 assert.equal(await db(`select count(*) from notification_private.reminders where id='${y.id}';`),execute.mutationReceipt.outcome==='applied'?'1':'0');
});
run('cross owner, false credential, stale mobile epoch and stolen device/token fail closed',async()=>{
 const f=await fixture(),other=await fixture();await reject({...f,a:other.a},'schedule',f.request(),'TRIP_NOT_FOUND');
 await reject({...f,a:{...f.a,session:uuid()}},'list',{},'UNAUTHENTICATED');
 await reject(other,'register_device',{operationId:uuid(),deviceId:f.deviceId,token:other.token,environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'},'SOURCE_UNAVAILABLE');
 await reject(other,'register_device',{operationId:uuid(),deviceId:uuid(),token:f.token,environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'},'SOURCE_UNAVAILABLE');
 await reject(f,'register_device',{operationId:uuid(),deviceId:f.deviceId,token:f.token,environment:'production',permission:'authorized',timeZone:'Asia/Shanghai'},'PROVIDER_UNAVAILABLE');
 const s=await scheduled(f);await db(`update identity_private.mobile_accounts set epoch=2 where owner_id='${f.a.owner}';`);await reject(f,'list',{},'SESSION_REPLACED');assert.equal(await db(`select state from notification_private.outbox where id='${s.notification}';`),'suppressed');
});
run('N1 dismissal survives content-identical head/timestamp changes, meaningful content creates new opaque ID',async()=>{
 const f=await fixture(),step=(await user(f,'list')).nextSteps.find(s=>s.source.kind==='current_trip');await user(f,'dismiss',{operationId:uuid(),nextStepId:step.id,source:step.source});assert.equal((await user(f,'list')).nextSteps.some(x=>x.id===step.id),false);
 await db(`insert into public.trip_version_snapshots(trip_id,owner_id,version,title,content) select trip_id,owner_id,2,title,content from public.trip_version_snapshots where trip_id='${f.trip}' and version=1;update public.trips set head_version=2,updated_at=clock_timestamp() where id='${f.trip}';`);assert.equal((await user(f,'list')).nextSteps.some(x=>x.source.kind==='current_trip'),false);
 await db(`update public.trip_version_snapshots set content=content||'{"title":"Meaningful new plan"}' where trip_id='${f.trip}' and version=2;`);assert.notEqual((await user(f,'list')).nextSteps.find(x=>x.source.kind==='current_trip').id,step.id);
});
run('cancel before begin blocks; begin before cancel preserves exact accepted outcome and never regrants',async()=>{
 const f=await fixture(),s=await scheduled(f);await due(s);await user(f,'cancel',{operationId:uuid(),id:s.x.id});assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId:uuid()}])).kind,'blocked');
 const next=await scheduled(f);await due(next);const attemptId=uuid(),grant=await svc('dispatch_travel_notification_v2',[next.notification,'begin',{attemptId}]);assert.equal(grant.kind,'attempt');assert.equal(grant.topic,'fixture.only');assert.deepEqual(Object.keys(grant).sort(),['kind','notificationId','attemptId','deviceRevision','token','environment','topic','expiresAt','authorizedAt','leaseExpiresAt','leaseBudgetMs'].sort());assert.ok(Number.isInteger(grant.leaseBudgetMs)&&grant.leaseBudgetMs>0&&grant.leaseBudgetMs<=5000&&grant.leaseBudgetMs<=Date.parse(grant.leaseExpiresAt)-Date.parse(grant.authorizedAt));assert.ok(Date.parse(grant.leaseExpiresAt)-Date.parse(grant.authorizedAt)<=5000);
 assert.equal((await svc('dispatch_travel_notification_v2',[next.notification,'begin',{attemptId}])).kind,'blocked');
 await user(f,'cancel',{operationId:uuid(),id:next.x.id});const outcome={kind:'accepted',apnsId:attemptId,acceptedAt:new Date().toISOString()};
 const receipt=await svc('dispatch_travel_notification_v2',[next.notification,'finish',{attemptId,deviceRevision:grant.deviceRevision,outcome}]);assert.equal(receipt.state,'accepted');assert.deepEqual(receipt.outcome,outcome);assert.equal((await user(f,'list')).reminders.find(r=>r.id===next.x.id).status,'cancelled');
 assert.deepEqual(await svc('dispatch_travel_notification_v2',[next.notification,'read',{attemptId}]),receipt);assert.equal((await svc('dispatch_travel_notification_v2',[next.notification,'begin',{attemptId:uuid()}])).kind,'blocked');
 const race=await scheduled(f);await due(race);const raceAttempt=uuid();
 const [cancelled,handoff]=await Promise.all([user(f,'cancel',{operationId:uuid(),id:race.x.id}),svc('dispatch_travel_notification_v2',[race.notification,'begin',{attemptId:raceAttempt}])]);
 assert.equal(cancelled.reminders.find(r=>r.id===race.x.id).status,'cancelled');assert.ok(['attempt','blocked'].includes(handoff.kind));
 assert.equal(await db(`select count(*) from notification_private.attempts where notification_id='${race.notification}';`),handoff.kind==='attempt'?'1':'0');
 assert.equal((await svc('dispatch_travel_notification_v2',[race.notification,'begin',{attemptId:uuid()}])).kind,'blocked');
 if(handoff.kind==='attempt')await svc('dispatch_travel_notification_v2',[race.notification,'finish',{attemptId:raceAttempt,deviceRevision:handoff.deviceRevision,outcome:{kind:'unknown',code:'ACK_UNKNOWN'}}]);
});
run('crashed lease resolves unknown, wrong tuple cannot finish, token-revoked cannot revoke a rotated token',async()=>{
 const f=await fixture(),s=await scheduled(f);await due(s);const attemptId=uuid(),grant=await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId}]);
 await db(`update notification_private.attempts set lease_expires_at=clock_timestamp()-interval '1 second' where notification_id='${s.notification}';`);
 assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'read',{attemptId}])).state,'unknown');assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId:uuid()}])).kind,'blocked');
 await user(f,'register_device',{operationId:uuid(),deviceId:f.deviceId,token:uuid().replaceAll('-',''),environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'});
 assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'finish',{attemptId:uuid(),deviceRevision:grant.deviceRevision,outcome:{kind:'error',code:'TOKEN_REVOKED'}}])).kind,'blocked');
 await svc('dispatch_travel_notification_v2',[s.notification,'finish',{attemptId,deviceRevision:grant.deviceRevision,outcome:{kind:'error',code:'TOKEN_REVOKED'}}]);assert.equal(await db(`select active from notification_private.devices where id='${f.deviceId}';`),'t');
 const matching=await scheduled(f);await due(matching);const aid=uuid(),g=await svc('dispatch_travel_notification_v2',[matching.notification,'begin',{attemptId:aid}]);assert.equal(g.kind,'attempt');
 await svc('dispatch_travel_notification_v2',[matching.notification,'finish',{attemptId:aid,deviceRevision:g.deviceRevision,outcome:{kind:'error',code:'TOKEN_REVOKED'}}]);
 assert.equal(await db(`select active::text||':'||permission from notification_private.devices where id='${f.deviceId}';`),'false:authorized');
});
run('head/archive/end/expiry/session/quiet/OS fences suppress stale work; generic tap exact basis',async()=>{
 for(const mutate of [f=>`update public.trips set head_version=2 where id='${f.trip}'`,f=>`insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${f.trip}','${f.a.owner}',1,'${uuid()}')`,f=>`update public.trip_days set trip_date=current_date-2 where trip_id='${f.trip}'`,f=>`delete from auth.sessions where id='${f.a.session}'`,f=>`update notification_private.devices set active=false where id='${f.deviceId}'`]){
  const f=await fixture(),s=await scheduled(f);await due(s);await db(mutate(f));assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId:uuid()}])).kind,'blocked');assert.equal(await db(`select state from notification_private.outbox where id='${s.notification}';`),'suppressed');
 }
 const f=await fixture(),s=await scheduled(f);await due(s);
 const current=JSON.parse(await db(`begin;${claims(f.a)}set role authenticated;select public.resolve_travel_notification_v2('${s.notification}');commit;`));assert.equal(current.current,true);assert.equal(current.tripVersion,1);assert.deepEqual(current.source,s.x.source);
 await db(`update notification_private.reminders set quiet_hours='{"startMinute":0,"endMinute":1439}' where id='${s.x.id}';`);assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId:uuid()}])).kind,'blocked');assert.equal(await db(`select state from notification_private.outbox where id='${s.notification}';`),'scheduled');
 await db(`update public.trips set head_version=2 where id='${f.trip}';`);assert.equal(JSON.parse(await db(`begin;${claims(f.a)}select public.resolve_travel_notification_v2('${s.notification}');commit;`)).current,false);
});
run('legacy v1 intent and complete/cancel stay compatible; metadata never copies registration token',async()=>{
 const f=await fixture(),s=await scheduled(f);const old=JSON.parse(await db(`begin;${claims(f.a)}set role authenticated;select public.travel_reminders_v1('${f.trip}','complete','{"id":"${s.x.id}"}');commit;`));assert.equal(old.version,1);assert.equal(old.delivery,'unavailable');assert.equal((await user(f,'list')).reminders.find(r=>r.id===s.x.id).status,'completed');await due(s);assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId:uuid()}])).kind,'blocked');
 assert.equal(await db(`select exists(select 1 from notification_private.operations where owner_id='${f.a.owner}' and to_jsonb(operations)::text like '%${f.token}%');`),'f');
});
run('actual TS strict codecs and scheduler consume actual PG source, disabled zeroRPC and one send only',async()=>{
 const root=process.env.VP_NOTICE_TS_ROOT;if(!root){assert.fail('VP_NOTICE_TS_ROOT must point to owned actual TS checkout for joint evidence');}
 const {runNotificationScheduler}=await import(pathToFileURL(resolve(root,'lib/server/notifications/scheduler.ts')));
 const {decodeNoticeView}=await import(pathToFileURL(resolve(root,'lib/server/notifications/codec.ts')));
 const f=await fixture(),s=await scheduled(f);assert.ok(decodeNoticeView(s.view,f.trip,{action:'schedule',input:s.x}));await due(s);
 let calls=0,sends=0;
 const rpc=async(name,p)=>{calls++;return svc(name,name==='poll_travel_notifications_v2'?[p.p_limit]:[p.p_notification,p.p_action,p.p_input]);};
 const transport={available:true,binding:{environment:'sandbox',topic:'fixture.only'},async send(x){sends++;assert.equal(x.notificationId,s.notification);assert.equal(x.token,f.token);assert.equal(x.topic,'fixture.only');return {kind:'accepted',apnsId:x.apnsId,acceptedAt:new Date().toISOString()};}};
 assert.equal(await runNotificationScheduler({rpc,transport},new AbortController().signal),'disabled');assert.equal(calls,0);
 // Other test fixtures can have due records. Disable their queued rows in this disposable fixture only.
 await db(`update notification_private.outbox set state='suppressed' where state='scheduled' and id<>'${s.notification}';`);
 assert.equal(await runNotificationScheduler({enabled:true,rpc,transport},new AbortController().signal),'accepted');assert.equal(sends,1);
 assert.equal(await runNotificationScheduler({enabled:true,rpc,transport},new AbortController().signal),'idle');assert.equal(sends,1);
 const mismatch=await scheduled(f);await due(mismatch);let exchanges=0;
 const {createApnsTransport}=await import(pathToFileURL(resolve(root,'lib/server/notifications/apns.ts')));
 const signing=generateKeyPairSync('ec',{namedCurve:'P-256'});
 const mismatched=createApnsTransport({enabled:true,configuration:{teamId:'ABCDEFGHIJ',keyId:'0123456789',topic:'different.fixture',environment:'sandbox',privateKey:signing.privateKey.export({format:'pem',type:'pkcs8'}).toString()},exchange:async()=>{exchanges++;throw Error('Mismatch must deny before provider exchange');}});
 assert.equal(await runNotificationScheduler({enabled:true,rpc,transport:mismatched},new AbortController().signal),'error');assert.equal(exchanges,0);
 assert.equal(await db(`select active::text||':'||permission from notification_private.devices where id='${f.deviceId}';`),'true:authorized');
 const mismatchRow=(await user(f,'list')).reminders.find(r=>r.id===mismatch.x.id);assert.deepEqual(mismatchRow.outcome,{kind:'error',code:'TRANSPORT_UNAVAILABLE'});
 const originalAttempt=await db(`select attempt_id from notification_private.attempts where notification_id='${mismatch.notification}';`);
 assert.equal((await svc('dispatch_travel_notification_v2',[mismatch.notification,'begin',{attemptId:uuid()}])).kind,'blocked');assert.equal(await db(`select attempt_id from notification_private.attempts where notification_id='${mismatch.notification}';`),originalAttempt);
});

async function supportFixture(){
 const future=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 const actors=Array.from({length:4},()=>({id:uuid(),session:uuid()})),[author,reviewer,mapper,owner]=actors;
 for(const a of actors)await db(`insert into auth.users(id) values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');insert into identity_private.mobile_accounts(owner_id) values('${a.id}');insert into knowledge_review_private.members(actor_id,active) values('${a.id}',true);`);
 await db('update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true;');
 const rpc=async(a,name,p)=>JSON.parse(await db(`begin;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.id}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';${name==='create_trip_proposal_patch'?"select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.":'select public.'}${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+(name==='create_trip_proposal_patch'?') r;commit;':');commit;')));
 const candidate=uuid(),statement={schemaVersion:'knowledge-statement/2',assertion:{subjectId:'test_gallery',predicate:'opens_during',objectId:'opening_hours',conditions:[],exclusions:[]},scope:{cities:['shanghai'],scene:'attraction',audience:'international_independent_traveler'},place:{names:{en:'Test Gallery',zh:'测试展馆'}},value:{startsAt:`${future}T01:00:00Z`,endsAt:`${future}T08:00:00Z`,timeZone:'Asia/Shanghai'},expressions:{en:{text:'Synthetic opening window',conditions:[],exclusions:[]},zh:{text:'合成开放时窗',conditions:[],exclusions:[]}},sources:[{sourceKey:'support-'+uuid(),revisionLabel:'one',publisher:'Fixture source',uri:'urn:vpj15:synthetic:support',locator:'Fixture only',snippet:'NO REAL SUPPLIER',usageDeclaration:'private synthetic fixture'}]};
 await rpc(author,'ops_review_workspace',{p_input:{action:'submit_statement',operationId:uuid(),candidateId:candidate,title:'Synthetic typed source',statement}});
 await rpc(reviewer,'ops_review_workspace',{p_input:{action:'review',operationId:uuid(),candidateId:candidate,expectedVersion:1,decision:'reviewed',note:'Independent fixture review'}});
 await rpc(reviewer,'ops_review_workspace',{p_input:{action:'publish_statement',operationId:uuid(),candidateId:candidate,expectedVersion:2,useBasis:'original_factual_summary',useNote:'synthetic only no deployment',expiresAt:new Date(Date.now()+86400000).toISOString()}});
 const st=JSON.parse(await db(`select jsonb_build_object('id',statement_id,'revision',revision,'hash',trip_support_private.hash(payload)) from knowledge_review_private.statements where candidate_id='${candidate}';`)),poi=uuid(),trip=uuid(),placeRef=uuid();
 await db(`insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values('${poi}','测试展馆','Test Gallery');insert into public.trips(id,owner_id,title,head_version) values('${trip}','${owner.id}','User intent not globally verified',0);insert into public.trip_place_references(id,trip_id,owner_id,reference_kind,canonical_poi_id) values('${placeRef}','${trip}','${owner.id}','canonical','${poi}');`);
 const basis=await rpc(owner,'knowledge_read_v1',{p_input:{city:'shanghai',scene:'attraction',locale:'en'}});assert.equal(basis.status,'available');
 const sourceRefs=JSON.parse(await db(`select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id) from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id='${candidate}';`)),digest=await db(`select trip_support_private.hash(${lit(sourceRefs)}::jsonb);`);
 const mapping=await rpc(mapper,'submit_trip_support_entity_mapping_v1',{p_input:{operationId:uuid(),canonicalPoiId:poi,statementId:st.id,expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:digest,basisMetadata:{city:'shanghai',scene:'attraction',locale:'en',sourceRefs}}});assert.equal(mapping.kind,'mapping_candidate',JSON.stringify(mapping));
 const mapped=await rpc(reviewer,'review_trip_support_entity_mapping_v1',{p_mapping:mapping.mappingId,p_expected_version:mapping.version,p_expected_digest:mapping.digest,p_decision:'approve'});assert.equal(mapped.kind,'mapping_reviewed');
 const proposed=await rpc(owner,'create_trip_proposal_patch',{p_trip_id:trip,p_patch:{expectedVersion:0,operations:[{kind:'upsert_day',dayId:'Day_A',date:`${future}`,timeZone:'Asia/Shanghai'},{kind:'upsert_item',itemId:'Item_A',dayId:'Day_A',title:'User selected gallery',startsAt:`${future}T02:00:00Z`,endsAt:`${future}T03:00:00Z`}]}});
 const proposalId=Array.isArray(proposed)?proposed[0].proposal_id:proposed.proposal_id;
 const read=JSON.parse(await db(`set request.jwt.claim.sub='${owner.id}';select to_jsonb(r) from public.read_trip_proposal_v2('${proposalId}') r;`)),itemHash=await db(`select trip_support_private.hash(trip_support_private.item(public.apply_trip_content_patch(public.trip_content_snapshot('${trip}','User intent not globally verified'),${lit(read.proposal.patch)}::jsonb),'Day_A','Item_A'));`);
 const prepared=await rpc(owner,'prepare_trip_item_support_v1',{p_input:{operationId:uuid(),tripId:trip,placeReferenceId:placeRef,dayId:'Day_A',itemId:'Item_A',proposalId,expectedProposalRevision:read.proposal.revision,expectedBaseVersion:0,expectedProposalDigest:read.digest,expectedItemDigest:itemHash,mappingId:mapped.mappingId,expectedMappingVersion:mapped.version,expectedMappingDigest:mapped.digest,city:'shanghai',scene:'attraction',locale:'en',scope:'opening_window_reference',expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:digest}});assert.equal(prepared.kind,'prepared',JSON.stringify(prepared));
 return {rpc,owner,reviewer,author,mapper,trip,proposalId,read,prepared,sourceRefs,poi,placeRef,candidate,statement};
}

run('actual reviewed support baseline ignores revision/time refresh; exact approved acked recheck emits once and stops',async()=>{
 await db("update notification_private.settings set enabled=true,environment='sandbox',topic='fixture.only';");
 const f=await supportFixture();const confirmed=await f.rpc(f.owner,'confirm_and_apply_supported_trip_proposal_v1',{p_proposal_id:f.proposalId,p_idempotency_key:'notice-'+uuid(),p_digest:f.read.digest,p_support_selection:[{receiptId:f.prepared.receiptId,version:f.prepared.version,sourceDigest:f.prepared.sourceDigest}]});assert.equal(confirmed.kind,'confirmed');
 await db(`update identity_private.mobile_accounts set session_id='${f.owner.session}',epoch=1 where owner_id='${f.owner.id}';insert into identity_private.mobile_attempts values('${f.owner.id}','${uuid()}','${f.owner.session}',1);`);
 const nf={a:{owner:f.owner.id,session:f.owner.session},trip:f.trip},deviceId=uuid();await user(nf,'register_device',{operationId:uuid(),deviceId,token:uuid().replaceAll('-',''),environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'});
 const baseline=(await user(nf,'list')).nextSteps.find(x=>x.source.kind==='qualified_watch');assert.ok(baseline);assert.equal(baseline.reasonCode,'watch_available');
 const watch={operationId:uuid(),id:uuid(),baseVersion:1,source:baseline.source,expiresAt:baseline.expiresAt,timeZone:'Asia/Shanghai',quietHours:{startMinute:0,endMinute:0},consent:true};await user(nf,'watch',watch);
 const supportId=confirmed.supports[0].supportId;
 // Actual typed_claim includes asOf/evidence receipt timestamps. Refreshing those
 // fields and publication TTL must not change content semantics or the user's TTL.
 await db(`update knowledge_review_private.candidates set reviewed_at=reviewed_at+interval '1 second' where id='${f.candidate}';update knowledge_review_private.publications set expires_at=expires_at+interval '1 hour' where candidate_id='${f.candidate}';`);
 const refreshed=(await user(nf,'list')).nextSteps.find(x=>x.source.sourceId===supportId);assert.equal(refreshed.source.contentDigest,baseline.source.contentDigest);assert.equal(refreshed.expiresAt,baseline.expiresAt);
 await svc('poll_travel_notifications_v2',[1]);assert.equal(await db(`select count(*) from notification_private.outbox where watch_id='${watch.id}';`),'0');
 assert.equal(await db(`select notification_private.stamp(expires_at) from notification_private.watches where id='${watch.id}';`),watch.expiresAt);
 await db(`update notification_private.watches set next_check_at=clock_timestamp() where id='${watch.id}';update trip_support_private.item_supports set version=version+1,created_at=clock_timestamp() where id='${supportId}';`);
 await svc('poll_travel_notifications_v2',[1]);assert.equal(await db(`select count(*) from notification_private.outbox where watch_id='${watch.id}';`),'0');
 // Source withdrawal alone (and a pending review set) has no send eligibility.
 await f.rpc(f.author,'ops_source_revision_withdraw_v1',{p_input:{operationId:uuid(),sourceRevisionId:f.sourceRefs[0].sourceRevisionId,reason:'Synthetic source rights removal'}});
 const source=JSON.parse(await db(`select jsonb_build_object('label',revision_label,'hash',snippet_hash,'at',withdrawn_at) from knowledge_review_private.source_revisions where id='${f.sourceRefs[0].sourceRevisionId}';`));
 const captured=await f.rpc(f.mapper,'capture_source_impact_v1',{p_operation:uuid(),p_source:f.sourceRefs[0].sourceRevisionId,p_expected_label:source.label,p_expected_hash:source.hash,p_expected_withdrawn_at:source.at,p_kind:'withdrawn',p_replacement:null,p_limit:100});assert.equal(captured.kind,'captured');
 assert.equal(await db(`select notification_private.source('${f.owner.id}',t,'qualified_watch','${supportId}',true) is null from public.trips t where id='${f.trip}';`),'t');
 const reviewed=await f.rpc(f.reviewer,'review_source_impact_v1',{p_set:captured.setId,p_expected_version:captured.version,p_expected_digest:captured.digest,p_decision:'approve'});assert.equal(reviewed.kind,'reviewed');
 const leased=await f.rpc(f.mapper,'claim_trip_support_impact_delivery_v1',{p_limit:1,p_lease_ms:15000});assert.equal(leased.kind,'leased');
 const applied=await f.rpc(f.mapper,'apply_reviewed_trip_support_delivery_v1',{p_delivery:leased.deliveryId,p_lease:leased.leaseToken,p_expected_attempt:leased.attempt,p_expected_digest:leased.sourceDigest});assert.equal(applied.kind,'applied');
 await db(`update notification_private.watches set next_check_at=clock_timestamp() where id='${watch.id}';`);
 await svc('poll_travel_notifications_v2',[1]);assert.equal(await db(`select count(*) from notification_private.outbox where watch_id='${watch.id}';`),'1');
 assert.equal(await db(`select stop_reason||':'||status from notification_private.watches where id='${watch.id}';`),'recheck:cancelled');
 const notice=await db(`select id from notification_private.outbox where watch_id='${watch.id}';`),attemptId=uuid();
 assert.equal((await svc('dispatch_travel_notification_v2',[notice,'begin',{attemptId}])).kind,'attempt');
 assert.equal((await user(nf,'list')).nextSteps.find(x=>x.source.kind==='qualified_watch').reasonCode,'watch_changed');
 await svc('dispatch_travel_notification_v2',[notice,'finish',{attemptId,deviceRevision:1,outcome:{kind:'unknown',code:'ACK_UNKNOWN'}}]);
 await svc('poll_travel_notifications_v2',[1]);assert.equal(await db(`select count(*) from notification_private.outbox where watch_id='${watch.id}';`),'1');
 // Revoking the reviewer independently removes metadata qualification, without old payload fallback.
 await db(`update knowledge_review_private.members set active=false where actor_id='${f.reviewer.id}';`);
 assert.equal(await db(`select notification_private.source('${f.owner.id}',t,'qualified_watch','${supportId}',true) is null from public.trips t where id='${f.trip}';`),'t');
});
run('quiet oldest record does not block another owner; crashed attempt becomes truthful unknown without retry',async()=>{
 const a=await fixture(),old=await scheduled(a);await due(old);await db(`update notification_private.reminders set quiet_hours='{"startMinute":0,"endMinute":1439}' where id='${old.x.id}';`);
 const b=await fixture(),ready=await scheduled(b);await due(ready);await db(`update notification_private.outbox set state='suppressed' where state='scheduled' and id not in('${old.notification}','${ready.notification}');`);
 assert.equal((await svc('poll_travel_notifications_v2',[1])).notificationId,ready.notification);
 const attemptId=uuid();await svc('dispatch_travel_notification_v2',[ready.notification,'begin',{attemptId}]);await db(`update notification_private.attempts set lease_expires_at=clock_timestamp()-interval '1 second' where notification_id='${ready.notification}';`);
 const row=(await user(b,'list')).reminders.find(x=>x.id===ready.x.id);assert.equal(row.deliveryState,'unknown');assert.deepEqual(row.outcome,{kind:'unknown',code:'ACK_UNKNOWN'});
 await svc('poll_travel_notifications_v2',[1]);assert.equal(await db(`select state from notification_private.attempts where notification_id='${ready.notification}';`),'unknown');assert.equal((await svc('dispatch_travel_notification_v2',[ready.notification,'begin',{attemptId:uuid()}])).kind,'blocked');
});

run('actual export adapter uses exact job lease, generation and stable source cursor; omits token/body/worker lease',async()=>{
 const f=await fixture(),s=await scheduled(f),req=uuid(),lease=uuid(),pid=uuid();await db('update export_private.core_policies_v1 set enabled=false;');
 await db(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) values('${pid}',1,true,'local','synthetic_unactivated',1000,60000,30000,1,10,65536,clock_timestamp()+interval '1 hour');insert into public.privacy_requests(id,owner_id,action,scope_version,status,execution_state) values('${req}','${f.a.owner}','export','all-user-data-v1','requested','not_started');insert into export_private.core_jobs_v1(request_id,owner_id,session_id,session_epoch,policy_id,policy_snapshot,state,lease_id,lease_expires_at,expires_at) select '${req}','${f.a.owner}','${f.a.session}',1,id,to_jsonb(p),'running','${lease}',clock_timestamp()+interval '1 minute',clock_timestamp()+interval '1 hour' from export_private.core_policies_v1 p where id='${pid}';grant execute on function public.notification_metadata_export_v1(uuid,uuid,integer,jsonb,integer) to service_role;`);
 const read=(l=lease,g=1,c=null)=>svc('notification_metadata_export_v1',[req,l,g,c,1]);
 const first=await read();assert.equal(first.kind,'metadata');assert.equal(first.allUserDataCompleted,false);assert.equal(first.hasMore,true);assert.equal(JSON.stringify(first).includes(f.token),false);
 for(const args of [[uuid(),1],[lease,2]])assert.equal((await read(...args)).kind,'unavailable');
 const {notificationExportHandler}=await import(pathToFileURL(resolve(process.env.VP_NOTICE_TS_ROOT,'lib/server/notifications/export.ts')));
 const handler=notificationExportHandler({requestId:req,ownerId:f.a.owner,leaseId:lease,generation:1},async(name,p)=>svc(name,[p.p_request,p.p_lease,p.p_generation,p.p_cursor,p.p_limit]));
 const page=await handler.page('notifications',null,100,new AbortController().signal);assert.equal(page.sectionComplete,true);assert.ok(page.items.some(x=>x.domain==='reminder'));assert.ok(page.items.some(x=>x.domain==='operation'));assert.equal(JSON.stringify(page).includes(f.token),false);assert.equal(JSON.stringify(page).includes('session_id'),false);assert.equal(JSON.stringify(page).includes(lease),false);
 await user(f,'cancel',{operationId:uuid(),id:s.x.id});assert.equal((await read(lease,1,first.nextCursor)).kind,'stale');
 assert.equal(await db(`select scope||':'||modules::text from export_private.core_jobs_v1 where request_id='${req}';`),'core-export-d2/1:[]');
 await db(`update export_private.core_jobs_v1 set lease_expires_at=clock_timestamp()-interval '1 second' where request_id='${req}';`);assert.equal((await read()).kind,'unavailable');
});
run('owned Trip/account cascades remove new records; rollback flag blocks grants and preserves existing receipts',async()=>{
 const f=await fixture(),s=await scheduled(f);await user(f,'cancel',{operationId:uuid(),id:s.x.id});await db('update notification_private.settings set enabled=false;');assert.equal((await svc('poll_travel_notifications_v2',[1])).kind,'idle');assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId:uuid()}])).kind,'blocked');assert.deepEqual((await user(f,'schedule',s.x)).mutationReceipt,s.view.mutationReceipt);
 await db(`delete from public.trips where id='${f.trip}';`);assert.equal(await db(`select count(*) from notification_private.reminders where trip_id='${f.trip}';`),'0');assert.equal(await db(`select count(*) from notification_private.operations where trip_id='${f.trip}';`),'0');assert.equal(await db(`select count(*) from notification_private.outbox where id='${s.notification}';`),'0');assert.equal(await db(`select count(*) from notification_private.devices where owner_id='${f.a.owner}';`),'1');
 await db(`delete from auth.users where id='${f.a.owner}';`);assert.equal(await db(`select count(*) from notification_private.devices where owner_id='${f.a.owner}';`),'0');
});

const notice="a".repeat(64);
const projection={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]};
const sourceRPC=async(a,name,p)=>JSON.parse(await db(`begin;${claims(a)}set role authenticated;select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;'));
async function taskOwner(environment='staging',goalText='First China visit, ten days with partner, food and photography, relaxed pace.'){
 const a={owner:uuid(),session:uuid(),policy:uuid(),planningPolicy:uuid(),conversation:uuid(),goal:uuid(),source:uuid()};
 await db(`insert into auth.users(id) values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${a.policy}','qwen','synthetic only','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','test','test','${notice}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${a.planningPolicy}','${a.policy}','${environment}','test','${notice}','合成','Synthetic',now()-interval '1 hour',now()+interval '1 day');`);
 await sourceRPC(a,'accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice});await sourceRPC(a,'accept_planning_policy_v1',{p_policy_id:a.planningPolicy,p_notice_hash:notice});
 a.input={p_conversation_id:a.conversation,p_goal_id:a.goal,p_message_id:a.source,p_parent_message_id:null,p_expected_goal_version:null,p_expected_intake_revision:0,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:goalText,p_relationship:'goal_start',p_intake:projection,p_memory_basis:[]};
 a.receipt=await sourceRPC(a,'submit_assistant_travel_intake_v1',a.input);return a;
}

run('actual accepted Task result basis exposes generic N1; Memory/consent changes block source and dispatch',async()=>{
 const a=await taskOwner('local_synthetic'),trip=uuid(),memory=uuid(),consent=uuid(),memoryReceipt=uuid();
 await db(`insert into public.trips(id,owner_id,title) values('${trip}','${a.owner}','Synthetic task-linked trip');insert into public.trip_days(trip_id,owner_id,day_id,trip_date,time_zone) values('${trip}','${a.owner}','Day_A',current_date+2,'Asia/Shanghai');begin;insert into public.memory_consents(id,owner_id,status) values('${consent}','${a.owner}','granted');insert into public.memory_profiles(id,owner_id,source_receipt_id,consent_id,state,constraint_kind,summary) values('${memory}','${a.owner}','${memoryReceipt}','${consent}','explicit','preference','Synthetic explicit basis');insert into public.memory_receipts(id,owner_id,memory_id,event_state,source_kind) values('${memoryReceipt}','${a.owner}','${memory}','explicit','user_confirmed');commit;`);
 await sourceRPC(a,'set_assistant_goal_trip_link_v1',{p_operation_id:uuid(),p_conversation_id:a.conversation,p_goal_id:a.goal,p_source_message_id:a.source,p_expected_goal_scope_version:1,p_expected_link_version:0,p_action:'link',p_trip_id:trip,p_expected_trip_version:0,p_confirmed:true});
 const task=uuid(),turn=uuid(),thread=uuid(),message=uuid();
 await sourceRPC(a,'submit_service_task_turn',{p_thread_id:thread,p_turn_id:turn,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'Explicit task result request',p_task_id:task,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null});
 await sourceRPC(a,'submit_assistant_message_v1',{p_conversation_id:a.conversation,p_message_id:message,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'Task result',p_relationship:'follow_up',p_goal_id:a.goal,p_expected_goal_version:2,p_task_id:task,p_parent_message_id:a.source,p_turn_id:null});
 await db(`update turn_private.text_content set output_kind='answered',output_text='Synthetic accepted result' where turn_id='${turn}';select turn_private.terminal('${turn}','completed',1);`);
 const content={schemaVersion:'comparison/1',title:'Areas',summary:'Synthetic result',options:[{id:'a',title:'A',tradeoff:'Test A'},{id:'b',title:'B',tradeoff:'Test B'}],actions:[]},artifact=uuid();
 // Existing publisher, original request/Task/goal/Trip link authority; no fabricated current=true helper.
 await svc('publish_result_artifact_v2',[a.owner,artifact,0,uuid(),task,a.goal,message,trip,0,2,[{id:memory,revision:1}],content,[]]);
 await db(`update identity_private.mobile_accounts set session_id='${a.session}',epoch=1 where owner_id='${a.owner}';insert into identity_private.mobile_attempts values('${a.owner}','${uuid()}','${a.session}',1);update notification_private.settings set enabled=true,topic='fixture.only',environment='sandbox';`);
 const f={a,trip};await user(f,'register_device',{operationId:uuid(),deviceId:uuid(),token:uuid().replaceAll('-',''),environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'});
 const ef=await supportFixture(),evidence=JSON.parse(await db(`select jsonb_build_object('factId',pp.fact_id,'assertionId',st.statement_id,'assertionRevision',st.revision,'city','shanghai','scene','attraction') from knowledge_review_private.publications pp join knowledge_review_private.statements st using(candidate_id) where st.candidate_id='${ef.candidate}';`)),evidencedArtifact=uuid();
 await svc('publish_result_artifact_v2',[a.owner,evidencedArtifact,0,uuid(),task,a.goal,message,trip,0,2,[],content,[evidence]]);
 const evidenceStep=(await user(f,'list')).nextSteps.find(x=>x.source.sourceId===evidencedArtifact);assert.ok(evidenceStep);
 await ef.rpc(ef.author,'ops_source_revision_withdraw_v1',{p_input:{operationId:uuid(),sourceRevisionId:ef.sourceRefs[0].sourceRevisionId,reason:'Synthetic retained result evidence withdrawal'}});
 assert.equal((await user(f,'list')).nextSteps.some(x=>x.source.sourceId===evidencedArtifact),false);
 const next=(await user(f,'list')).nextSteps.find(x=>x.source.sourceId===artifact);assert.ok(next);assert.equal(next.reasonCode,'result_ready');assert.equal(next.reason,null);
 const x={operationId:uuid(),id:uuid(),baseVersion:0,purpose:'accepted_task_result',source:next.source,reason:null,dueAt:new Date(Date.now()+60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),timeZone:'Asia/Shanghai',quietHours:{startMinute:0,endMinute:0},consent:true};await user(f,'schedule',x);
 const notification=await db(`select id from notification_private.outbox where reminder_id='${x.id}';`);await db(`update notification_private.reminders set due_at=clock_timestamp()-interval '1 second' where id='${x.id}';update public.memory_profiles set revision=2 where id='${memory}';`);
 assert.equal((await user(f,'list')).nextSteps.some(x=>x.source.kind==='task_result'),false);assert.equal((await svc('dispatch_travel_notification_v2',[notification,'begin',{attemptId:uuid()}])).kind,'blocked');
 await db(`update public.memory_consents set status='revoked' where id='${consent}';`);assert.equal(await db(`select notification_private.source('${a.owner}',t,'task_result','${artifact}') is null from public.trips t where id='${trip}';`),'t');
});

run('explicit revoke retains actual authorized OS declaration while disabling recipient; expiry and truncation stay truthful',async()=>{
 const f=await fixture(),s=await scheduled(f);await due(s);const out=await user(f,'revoke_device',{operationId:uuid(),deviceId:f.deviceId,permission:'authorized'});assert.equal(out.device.permission,'authorized');assert.equal(out.device.active,false);assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId:uuid()}])).kind,'blocked');
 const g=await fixture(),expired=await scheduled(g);await due(expired);await db(`update notification_private.reminders set expires_at=clock_timestamp()-interval '0.5 second' where id='${expired.x.id}';`);assert.equal((await svc('dispatch_travel_notification_v2',[expired.notification,'begin',{attemptId:uuid()}])).kind,'blocked');
 await db(`insert into public.travel_reminders(id,owner_id,trip_id,session_id,base_version,reason,due_at,expires_at,time_zone) values('${uuid()}','${g.a.owner}','${g.trip}','${g.a.session}',1,repeat('😀',200),clock_timestamp()+interval '1 minute',clock_timestamp()+interval '1 hour','Asia/Shanghai');`);
 const view=await user(g,'list');assert.equal(view.complete,false);assert.equal(view.nextSteps.some(x=>x.reason&&x.reason.length>240),false);
 const sid=await db(`select id from public.travel_reminders where trip_id='${g.trip}' and char_length(reason)=200;`);await db(`insert into notification_private.dismissals(owner_id,trip_id,next_step_id,source_kind,source_id,semantic_digest) values('${g.a.owner}','${g.trip}','${uuid()}','user_reminder','${sid}','${'a'.repeat(64)}');`);
});
