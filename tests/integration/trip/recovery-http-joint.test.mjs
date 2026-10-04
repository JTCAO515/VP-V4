// Production recovery + original confirmation handlers, real disposable PostgreSQL.
// Synthetic JWT/admin transport; default ordinary ACL is separately tested. No target claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {NextRequest} from 'next/server.js';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
import {localRecoveryHTTP} from '../../../lib/server/today/recovery/http.ts';
import {nativeTripHTTP} from '../../../lib/server/trip/native-http.ts';
const literal=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const tables=new Set(['create_trip_proposal_patch','read_trip_proposal_v2','confirm_and_apply_trip_proposal']);
test('actual SQL/HTTP source qualification and original confirmation; missing reader is pending without invented order scope',{skip:process.env.VP_TURN_DB_TEST!=='1',timeout:120000},async t=>{
 const container='vpj29-http-'+uuid().slice(0,8);let created=false;
 const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${subject}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:sessionId})}';`;
 const query=(name,params)=>`select ${tables.has(name)?"coalesce(jsonb_agg(to_jsonb(r)),'[]')":'public.'+name+'('+Object.entries(params).map(([key,v])=>key+'=>'+literal(v)).join(',')+')'}${tables.has(name)?' from public.'+name+'('+Object.entries(params).map(([key,v])=>key+'=>'+literal(v)).join(',')+') r':''};`;
 const call=async(name,params)=>JSON.parse(await db(`begin;${claims}${query(name,params)}commit;`));
 try{
  const started=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(started.code,0,started.stderr);created=true;
  for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(resolve=>setTimeout(resolve,100));}
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
  await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
  const trip=uuid();
  await db(`insert into auth.users(id) values('${subject}');insert into auth.sessions(id,user_id) values('${sessionId}','${subject}');
   insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${subject}',1,'${sessionId}');insert into identity_private.mobile_attempts values('${subject}','${uuid()}','${sessionId}',1);
   ${claims}insert into public.trips(id,owner_id,title) values('${trip}','${subject}','Recovery joint');`);
  const initial=(await call('create_trip_proposal_patch',{p_trip_id:trip,p_patch:{expectedVersion:0,operations:[{kind:'upsert_day',dayId:'DayA',date:'2026-10-04',timeZone:'Asia/Shanghai'},
   {kind:'upsert_item',dayId:'DayA',itemId:'OptionalA',title:'Optional stop A'},{kind:'upsert_item',dayId:'DayA',itemId:'OptionalB',title:'Optional stop B'},
   {kind:'upsert_item',dayId:'DayA',itemId:'FixedDinner',title:'Fixed dinner',startsAt:'2026-10-04T09:00:00Z',endsAt:'2026-10-04T10:00:00Z'}]}}))[0];
  const initialRead=(await call('read_trip_proposal_v2',{p_proposal_id:initial.proposal_id}))[0];
  assert.equal((await call('confirm_and_apply_trip_proposal',{p_proposal_id:initial.proposal_id,p_idempotency_key:uuid(),p_digest:initialRead.digest}))[0].outcome,'applied');
  const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',host='vp-v4-recoveryjoint-jtcao515s-projects.vercel.app';
  const auth=await nativeFixture(t,database),env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',KNOWLEDGE_STAGING_READ:'1',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:auth.config.publishableKey};
  const priorEnv=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const[k,v]of Object.entries(priorEnv))v===undefined?delete process.env[k]:process.env[k]=v;});
  const previous=globalThis.fetch;let loseACK=false;const seen=[];
  const allowedRPC=new Set(['native_session_v2','prepare_local_recovery_v1','submit_local_recovery_v1','read_local_recovery_operation_v1','read_trip_proposal_v2','confirm_and_apply_trip_proposal']);
  t.mock.method(globalThis,'fetch',async(value,init)=>{
   const request=new Request(value,init),url=new URL(request.url),path=url.pathname;seen.push(path);
   if(path.startsWith('/rest/v1/rpc/')){
    const name=path.split('/').at(-1),params=await request.json();assert.ok(allowedRPC.has(name));
    const r=await sql(container,`begin;${claims}${query(name,params)}commit;`);
    if(r.code!==0)return Response.json({message:r.stderr,code:'42501'},{status:403});
    if(loseACK&&name==='submit_local_recovery_v1'){loseACK=false;throw Error('Synthetic lost HTTP ACK after actual SQL commit');}
    return Response.json(JSON.parse(r.stdout.trim()));
   }
   if(path.startsWith('/rest/v1/')){
    const table=path.slice('/rest/v1/'.length);
    assert.ok(['trips','trip_events','trip_audit_events','trip_version_snapshots','trip_archives','trip_proposals','trip_idempotency','memory_consumer_receipts','user_profiles'].includes(table));
    let where=`owner_id='${subject}'`;
    if(['trips'].includes(table))where+=` and id='${trip}'`;
    else if(!['user_profiles','trip_idempotency','memory_consumer_receipts'].includes(table))where+=` and trip_id='${trip}'`;
    const version=url.searchParams.get('version');if(version?.startsWith('eq.'))where+=` and version=${Number(version.slice(3))}`;
    const id=url.searchParams.get('id');if(id?.startsWith('eq.'))where+=` and id=${literal(id.slice(3))}`;
    const one=['trips','trip_archives','user_profiles'].includes(table)||version?.startsWith('eq.')||table==='trip_proposals'&&id?.startsWith('eq.');
    return Response.json(JSON.parse(await db(`select ${one?"coalesce((select to_jsonb(r) from public."+table+" r where "+where+" limit 1),'null')":"coalesce(jsonb_agg(to_jsonb(r)),'[]') from public."+table+" r where "+where};`)));
   }
   return previous(value,init);
  });
  const request=(body,suffix='recovery')=>new NextRequest(`https://${host}/api/trips/native/v2/${trip}/${suffix}`,{method:'POST',headers:{authorization:'Bearer '+auth.token},body:JSON.stringify(body)});
  const input={operationId:uuid(),expectedHeadVersion:1,dayId:'DayA',selectedItemIds:['OptionalA','OptionalB'],fixedItemIds:['FixedDinner'],reservationBindings:[],report:{source:'user_report',kind:'fatigue',observedAt:new Date().toISOString()},locale:'en'};
  const result=await localRecoveryHTTP(request({operation:'preview',input}),trip,true),preview=(await result.json()).data;assert.equal(result.status,200);
  const installed=await db("select to_regprocedure('public.read_reservation_references_v1(uuid,integer,uuid,uuid,integer)') is not null;");
  if(installed!=='t'){
   assert.equal(preview.status,'pending');assert.equal(preview.reason,'RESERVATION_READER_UNAVAILABLE');assert.deepEqual(preview.candidates,[]);
   assert.equal(await db(`select count(*) from recovery_private.contexts_v1 where trip_id='${trip}';`),'0');
   assert.equal(await db(`select head_version from public.trips where id='${trip}';`),'1');
   assert.ok(!seen.some(p=>p.endsWith('/submit_local_recovery_v1')));
   return; // Actual absent-reader outcome; successful-source chain is explicitly unrun at this base.
  }
  assert.equal(preview.status,'candidates',JSON.stringify(preview));assert.equal(preview.candidates.length,2);
  const selection={operationId:uuid(),contextId:preview.contextId,contextDigest:preview.contextDigest,candidateId:'omit_one'};
  loseACK=true;const lost=await localRecoveryHTTP(request({operation:'select',input:selection}),trip,true);
  assert.equal(lost.status,503);assert.equal((await lost.json()).operationId,selection.operationId);
  const recovered=await localRecoveryHTTP(request({operation:'receipt',operationId:selection.operationId}),trip,true);assert.equal(recovered.status,200);
  const original=(await recovered.json()).data.proposal;assert.equal(original.dayDiffs[0].items[0].itemId,'OptionalA');
  const confirm={proposalId:original.id,idempotencyKey:uuid(),digest:original.digest};
  const applied=await nativeTripHTTP(request(confirm,'confirm'),'confirm',trip);assert.equal(applied.status,200);assert.equal((await applied.json()).outcome,'applied');
  const retried=await nativeTripHTTP(request(confirm,'confirm'),'confirm',trip);assert.equal(retried.status,200);assert.equal((await retried.json()).outcome,'already_applied');
  const receipt=await localRecoveryHTTP(request({operation:'receipt',operationId:selection.operationId}),trip,true);assert.equal(receipt.status,200);
  const settled=(await receipt.json()).data;assert.equal(settled.operation.state,'applied');assert.equal(settled.operation.receipt.proposalId,original.id);assert.equal(settled.operation.resultingVersion,2);
  assert.equal(await db(`select count(*) from public.trip_events where proposal_id='${original.id}';`),'1');
  assert.equal(await db(`select count(*) from public.trip_items where trip_id='${trip}' and item_id in('FixedDinner','OptionalB');`),'2');
  assert.ok(seen.every(p=>!p.includes('model')&&!p.includes('maps')));
 }finally{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);}
});
