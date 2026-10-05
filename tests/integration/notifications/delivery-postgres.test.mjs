// Real disposable PostgreSQL; synthetic role/consent fixtures are not target Auth or APNs.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
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
const svc=async(name,args)=>JSON.parse(await db(`begin;${svcClaims}set role service_role;select public.${name}(${args.map(lit).join(',')});commit;`));
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
  assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='notification_private' or n.nspname='public' and p.proname in('travel_reminders_v2','poll_travel_notifications_v2','dispatch_travel_notification_v2','resolve_travel_notification_v2')) and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
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
 const next=await scheduled(f);await due(next);const attemptId=uuid(),grant=await svc('dispatch_travel_notification_v2',[next.notification,'begin',{attemptId}]);assert.equal(grant.kind,'attempt');assert.ok(Date.parse(grant.leaseExpiresAt)-Date.parse(grant.authorizedAt)<=5000);
 assert.equal((await svc('dispatch_travel_notification_v2',[next.notification,'begin',{attemptId}])).kind,'blocked');
 await user(f,'cancel',{operationId:uuid(),id:next.x.id});const outcome={kind:'accepted',apnsId:attemptId,acceptedAt:new Date().toISOString()};
 const receipt=await svc('dispatch_travel_notification_v2',[next.notification,'finish',{attemptId,deviceRevision:grant.deviceRevision,outcome}]);assert.equal(receipt.state,'accepted');assert.deepEqual(receipt.outcome,outcome);assert.equal((await user(f,'list')).reminders.find(r=>r.id===next.x.id).status,'cancelled');
 assert.deepEqual(await svc('dispatch_travel_notification_v2',[next.notification,'read',{attemptId}]),receipt);assert.equal((await svc('dispatch_travel_notification_v2',[next.notification,'begin',{attemptId:uuid()}])).kind,'blocked');
});
run('crashed lease resolves unknown, wrong tuple cannot finish, token-revoked cannot revoke a rotated token',async()=>{
 const f=await fixture(),s=await scheduled(f);await due(s);const attemptId=uuid(),grant=await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId}]);
 await db(`update notification_private.attempts set lease_expires_at=clock_timestamp()-interval '1 second' where notification_id='${s.notification}';`);
 assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'read',{attemptId}])).state,'unknown');assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'begin',{attemptId:uuid()}])).kind,'blocked');
 await user(f,'register_device',{operationId:uuid(),deviceId:f.deviceId,token:uuid().replaceAll('-',''),environment:'sandbox',permission:'authorized',timeZone:'Asia/Shanghai'});
 assert.equal((await svc('dispatch_travel_notification_v2',[s.notification,'finish',{attemptId:uuid(),deviceRevision:grant.deviceRevision,outcome:{kind:'error',code:'TOKEN_REVOKED'}}])).kind,'blocked');
 await svc('dispatch_travel_notification_v2',[s.notification,'finish',{attemptId,deviceRevision:grant.deviceRevision,outcome:{kind:'error',code:'TOKEN_REVOKED'}}]);assert.equal(await db(`select active from notification_private.devices where id='${f.deviceId}';`),'t');
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
 const transport={available:true,async send(x){sends++;assert.equal(x.notificationId,s.notification);assert.equal(x.token,f.token);return {kind:'accepted',apnsId:x.apnsId,acceptedAt:new Date().toISOString()};}};
 assert.equal(await runNotificationScheduler({rpc,transport},new AbortController().signal),'disabled');assert.equal(calls,0);
 // Other test fixtures can have due records. Disable their queued rows in this disposable fixture only.
 await db(`update notification_private.outbox set state='suppressed' where state='scheduled' and id<>'${s.notification}';`);
 assert.equal(await runNotificationScheduler({enabled:true,rpc,transport},new AbortController().signal),'accepted');assert.equal(sends,1);
 assert.equal(await runNotificationScheduler({enabled:true,rpc,transport},new AbortController().signal),'idle');assert.equal(sends,1);
});
