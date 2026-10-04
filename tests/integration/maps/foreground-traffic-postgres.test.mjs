// Disposable network-none PG. Fixture role/policy grants never prove real rights/origin.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TRAFFIC_DB_TEST==='1';
const container='vp366-traffic-'+uuid().slice(0,8);let created=false;
const migration='20261004040000_foreground_traffic_authority.sql';
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const actorSql=a=>`set request.jwt.claim.sub='${a.subject}';set request.jwt.claims='${JSON.stringify({session_id:a.sessionId})}';set request.jwt.claim.role='authenticated';`;
const rpc=async(role,name,args,a=null)=>JSON.parse(await db(`begin;${a?actorSql(a):''}set role ${role};select ${name}(${args.map(lit).join(',')});commit;`));
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 let ready=false;for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
  const content=readFileSync('supabase/migrations/'+f,'utf8');
  if(f===migration){await db('begin;'+content+'rollback;');assert.equal(await db("select to_regnamespace('traffic_private') is null;"),'t');}
  await db('begin;'+content+'commit;');
 }
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
run('real main history + new append compile/rollback; all roles denied and empty authority',async()=>{
 assert.equal(await db('select count(*) from traffic_private.producers_v1;'),'0');assert.equal(await db('select count(*) from traffic_private.policies_v1;'),'0');
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='traffic_private' or n.nspname='public' and p.proname in('foreground_traffic_policy_v1','foreground_traffic_producer_v1','read_foreground_traffic_v1','stop_foreground_traffic_v1')) and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
  assert.notEqual((await sql(container,`set role ${role};select * from traffic_private.receipts_v1;`)).code,0);
 }
 assert.equal(await db("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='traffic_private' and (p.proconfig is null or not 'search_path="+'""'+"'=any(p.proconfig));"),'0');
});
async function fixture({tmc=false,mobile=false,policy=true}={}){
 const actor={subject:uuid(),sessionId:uuid(),mobileEpoch:mobile?1:null},trip=uuid(),origin=uuid(),destination=uuid(),poi1=uuid(),poi2=uuid(),policyId=uuid();
 await db(`insert into auth.users(id) values('${actor.subject}');insert into auth.sessions(id,user_id) values('${actor.sessionId}','${actor.subject}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${actor.subject}',${mobile?lit(actor.sessionId):'null'},${mobile?1:0});${mobile?`insert into identity_private.mobile_attempts values('${actor.subject}','${uuid()}','${actor.sessionId}',1);`:''}
 insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values('${poi1}','测试起点','Fixture origin'),('${poi2}','测试终点','Fixture destination');
 insert into public.provider_poi_mappings(canonical_poi_id,provider,provider_poi_id,raw_name) values('${poi1}','amap','${uuid()}','Fixture'),('${poi2}','amap','${uuid()}','Fixture');
 insert into public.trips(id,owner_id,title,head_version) values('${trip}','${actor.subject}','Synthetic traffic',1);
 insert into public.trip_days(trip_id,owner_id,day_id,trip_date) values('${trip}','${actor.subject}','Day_A','2026-10-04');
 insert into public.trip_items(trip_id,owner_id,day_id,item_id,title) values('${trip}','${actor.subject}','Day_A','Item_A','Synthetic item');
 insert into public.trip_place_references(id,trip_id,owner_id,reference_kind,canonical_poi_id) values('${origin}','${trip}','${actor.subject}','canonical','${poi1}'),('${destination}','${trip}','${actor.subject}','canonical','${poi2}');`);
 const account='fixture_'+uuid().replaceAll('-','');
 await db(`insert into traffic_private.producers_v1(role_oid,account_scope,enabled,expires_at) values('service_role'::regrole::oid,'${account}',true,clock_timestamp()+interval '1 hour') on conflict(role_oid) do update set account_scope=excluded.account_scope,enabled=true,expires_at=excluded.expires_at;
 grant execute on function public.foreground_traffic_policy_v1(jsonb,jsonb),public.foreground_traffic_producer_v1(text,jsonb,jsonb) to service_role;
 grant execute on function public.read_foreground_traffic_v1(uuid,jsonb),public.stop_foreground_traffic_v1(jsonb,bigint) to authenticated;`);
 const fields=['duration','distance','derived_change','receipt_metadata',...(tmc?['tmc']:[])],now=Date.now();
 const wire={policyId:'synthetic_policy',sourceId:'synthetic_source',licenceVersion:'fixture_only',dataClass:'c0_public',grants:fields.flatMap(field=>['display','cache','persist'].map(action=>({field,region:'cn',action,purpose:action==='persist'?'trip_planning':'explore'}))),effectiveAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),termsRecheckAt:new Date(now+3600000).toISOString(),trialEndsAt:null,derivative:'allowed',shareAlike:'not_required',combination:'denied',redistribution:'denied',training:'denied',retention:'durable'};
 if(policy)await db(`insert into traffic_private.policies_v1(id,revision,account_scope,source_version,mode,policy,retention_seconds,source_expires_at,enabled) values('${policyId}',1,'${account}','fixture_v1','${tmc?'driving':'walking'}',${lit(wire)}::jsonb,300,clock_timestamp()+interval '1 hour',true);`);
 const scope={tripId:trip,expectedHeadVersion:1,dayId:'Day_A',itemId:'Item_A',originPlaceReferenceId:origin,destinationPlaceReferenceId:destination,mode:tmc?'driving':'walking',departure:'now'};
 const call=(action,input)=>rpc('service_role','public.foreground_traffic_producer_v1',[action,input,actor]);
 const policyRead=()=>rpc('service_role','public.foreground_traffic_policy_v1',[scope,actor]);
 const begin=async operationId=>{const p=await policyRead();assert.equal(p.kind,'policy',JSON.stringify(p));return call('begin',{operationId:operationId??uuid(),scope,policyId:p.policyId,policyRevision:p.policyRevision,stopEpoch:p.stopEpoch,operation:'check',endpoints:p.endpoints});};
 const complete=async(d,duration=300,previous=null)=>call('complete',{dispatchId:d,fetchedAt:await db("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');"),selected:{mode:scope.mode,durationSeconds:duration,distanceMeters:1000,tmc:tmc?{unknown:0,smooth:1000,slow:0,congested:0,severely_congested:0}:null},alternatives:[],previousReceiptId:previous});
 const read=id=>rpc('authenticated','public.read_foreground_traffic_v1',[id,scope],actor);
 return{actor,trip,origin,destination,poi2,policyId,wire,scope,call,policyRead,begin,complete,read};
}
run('empty policy blocks dispatch; ordinary forwarding and forged role claim cannot produce',async()=>{
 const f=await fixture({policy:false});assert.equal((await f.policyRead()).kind,'unavailable');
 assert.notEqual((await sql(container,actorSql(f.actor)+"set role authenticated;select public.foreground_traffic_policy_v1('{}','{}');")).code,0);
 assert.equal(await db('select count(*) from place_quota_private.usage;'),'0');
});
run('server transport without user JWT has live actor scope, walking without TMC grant, exact request, owner read and stop',async()=>{
 const f=await fixture(),d=await f.begin();assert.equal(d.kind,'dispatch',JSON.stringify(d));
 assert.equal((await f.call('request',{dispatchId:d.dispatchId,requestIndex:1})).kind,'request');
 assert.equal((await f.call('request',{dispatchId:d.dispatchId,requestIndex:1})).kind,'unavailable');
 const done=await f.complete(d.dispatchId);assert.equal(done.kind,'receipt',JSON.stringify(done));assert.equal(done.receipt.r2Qualified,false);assert.equal(done.receipt.providerObservedAt,null);
 assert.equal((await f.read(done.receipt.receiptId)).kind,'receipt');
 assert.equal(await db(`select hits from place_quota_private.usage where actor_id='${f.actor.subject}' and window_seconds=86400;`),'1');
 const wrong={...f.actor,sessionId:uuid()};assert.equal((await rpc('service_role','public.foreground_traffic_policy_v1',[f.scope,wrong])).kind,'unavailable');
 const stop=await rpc('authenticated','public.stop_foreground_traffic_v1',[f.scope,0],f.actor);assert.equal(stop.kind,'stopped');assert.equal(stop.stopEpoch,1);assert.equal((await f.read(done.receipt.receiptId)).kind,'unavailable');
});
run('missing source association denies R2, policy change purges values but stop still works',async()=>{
 const f=await fixture(),d=await f.begin();await f.call('request',{dispatchId:d.dispatchId,requestIndex:1});const done=await f.complete(d.dispatchId);
 assert.equal((await rpc('postgres','traffic_private.qualify_recovery_v1',[done.receipt.receiptId,f.scope,f.policyId,1,0],f.actor)).kind,'unavailable');
 await db(`update traffic_private.policies_v1 set revoked_at=clock_timestamp() where id='${f.policyId}';`);
 assert.equal(await db(`select count(*) from traffic_private.receipts_v1 where id='${done.receipt.receiptId}';`),'0');
 assert.equal((await rpc('authenticated','public.stop_foreground_traffic_v1',[f.scope,0],f.actor)).kind,'stopped');
});
run('unknown dispatch freezes durable window; native epoch/mapping/head drift denies current read',async()=>{
 const f=await fixture({mobile:true}),d=await f.begin();await f.call('request',{dispatchId:d.dispatchId,requestIndex:1});assert.equal((await f.call('unknown',{dispatchId:d.dispatchId})).kind,'unknown');assert.equal((await f.begin()).kind,'unknown');
 await db(`update identity_private.mobile_accounts set epoch=2 where owner_id='${f.actor.subject}';`);assert.equal((await f.policyRead()).kind,'unavailable');
 const g=await fixture(),gd=await g.begin();await g.call('request',{dispatchId:gd.dispatchId,requestIndex:1});const done=await g.complete(gd.dispatchId);
 await db(`update public.provider_poi_mappings set matched_at=clock_timestamp() where canonical_poi_id='${g.poi2}';`);assert.equal((await g.read(done.receipt.receiptId)).kind,'unavailable');
});
