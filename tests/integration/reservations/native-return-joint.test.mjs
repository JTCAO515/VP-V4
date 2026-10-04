// Actual current ledger SQL + production handler, synthetic signed token and
// admin SQL transport only. Default ordinary-role denial is tested separately.
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';import {NextRequest} from 'next/server.js';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
import {reservationReturnHTTP} from '../../../lib/server/reservations/http.ts';
const enabled=process.env.VP_TURN_DB_TEST==='1',literal=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
test('actual current ledger/HTTP binds ACK and lost-response recovery; amendments cancel history without supplier or Trip writes',{skip:!enabled,timeout:120000},async t=>{
 const container='vpj24-http-'+uuid().slice(0,8);let created=false;
 const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 const trip=uuid(),reference=uuid(),claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${subject}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:sessionId})}';`;
 try{
  const started=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(started.code,0,started.stderr);created=true;
  for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(resolve=>setTimeout(resolve,100));}
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
  await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
  await db(`insert into auth.users(id) values('${subject}');insert into auth.sessions(id,user_id) values('${sessionId}','${subject}');
   insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${subject}',1,'${sessionId}');insert into identity_private.mobile_attempts values('${subject}','${uuid()}','${sessionId}',1);
   ${claims}insert into public.trips(id,owner_id,title) values('${trip}','${subject}','Synthetic reservation Trip');`);
  const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',host='vp-v4-reservationjoint-jtcao515s-projects.vercel.app';
  const auth=await nativeFixture(t,database),env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',KNOWLEDGE_STAGING_READ:'1',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:auth.config.publishableKey};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const[k,v]of Object.entries(previous))v===undefined?delete process.env[k]:process.env[k]=v;});
  const prior=globalThis.fetch;let lost=false,deny=false;
  t.mock.method(globalThis,'fetch',async(value,init)=>{
   const request=new Request(value,init),path=new URL(request.url).pathname;
   if(path.startsWith('/rest/v1/rpc/')){
    const name=path.split('/').at(-1),params=await request.json();
    assert.ok(['native_session_v2','confirm_reservation_reference_v1','read_reservation_references_v1','read_reservation_operation_v1'].includes(name));
    const executed=await sql(container,(deny&&name.includes('reservation')?'set role authenticated;':'')+claims+`select public.${name}(${Object.entries(params).map(([key,v])=>key+' => '+literal(v)).join(',')});`);
    if(executed.code!==0)return Response.json({message:executed.stderr,code:'42501'},{status:403});
    if(lost&&name==='confirm_reservation_reference_v1'){lost=false;throw Error('Synthetic lost ACK');}
    return Response.json(JSON.parse(executed.stdout.trim()));
   }
   if(path==='/rest/v1/trips')return Response.json(JSON.parse(await db(claims+`select row_to_json(t) from public.trips t where id='${trip}';`)));
   if(path==='/rest/v1/trip_version_snapshots')return Response.json(JSON.parse(await db(claims+`select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.trip_version_snapshots s where trip_id='${trip}';`)));
   if(path.startsWith('/rest/v1/'))return Response.json([]);
   return prior(value,init);
  });
  const input={operationId:uuid(),referenceId:reference,expectedTripVersion:0,expectedRevision:0,explicitlyConfirmed:true,
   fields:{kind:'lodging',supplier:'booking',externalReference:'Opaque-123',title:'User-checked stay',startsAt:'2026-10-10T07:00:00Z',endsAt:'2026-10-12T03:00:00Z',timeZone:'Asia/Shanghai',address:'Corrected user address',terms:null,status:'reserved'},
   source:{kind:'user_reported',localMaterialId:uuid(),localContentHash:'a'.repeat(64),locator:'Local image L3'}};
  const request=body=>new NextRequest(`https://${host}/api/trips/native/v2/${trip}/reservations`,{method:'POST',headers:{authorization:'Bearer '+auth.token},body:JSON.stringify(body)});
  const readBody={operation:'read',expectedTripVersion:0,afterReferenceId:null,limit:20};
  const preview=await reservationReturnHTTP(request({operation:'preview',input}),trip,true);assert.equal(preview.status,200);assert.equal((await preview.json()).data.relation,'new');
  lost=true;assert.equal((await reservationReturnHTTP(request({operation:'confirm',input}),trip,true)).status,503);
  const recovered=await reservationReturnHTTP(request({operation:'receipt',operationId:input.operationId}),trip,true);assert.equal(recovered.status,200);const recovery=(await recovered.json()).data;
  assert.equal(recovery.result,'applied');assert.deepEqual(recovery.command,input);assert.equal(recovery.receipt.evidenceTier,'user_reported');
  const replay=await reservationReturnHTTP(request({operation:'confirm',input}),trip,true);assert.equal(replay.status,200);assert.deepEqual((await replay.json()).data.command,input);
  const list=await reservationReturnHTTP(request(readBody),trip,true);assert.equal(list.status,200);const initial=(await list.json()).data;assert.equal(initial.items.length,1);assert.equal(initial.planningConstraints[0].supplierVerified,false);
  const cancel={...input,operationId:uuid(),expectedRevision:1,fields:{...input.fields,status:'cancelled'}};
  const confirmedCancel=await reservationReturnHTTP(request({operation:'confirm',input:cancel}),trip,true);assert.equal(confirmedCancel.status,200);
  const old=(await (await reservationReturnHTTP(request({operation:'receipt',operationId:input.operationId}),trip,true)).json()).data;
  assert.equal(old.result,'superseded');assert.equal(old.command,null);assert.equal(old.receipt,null);assert.equal(old.current.fields.status,'cancelled');
  const final=(await (await reservationReturnHTTP(request(readBody),trip,true)).json()).data;assert.equal(final.planningConstraints[0].applies,false);
  deny=true;assert.equal((await reservationReturnHTTP(request(readBody),trip,true)).status,503);deny=false;
  assert.equal(await db(`select head_version from public.trips where id='${trip}';`),'0');
  assert.equal(await db(`select count(*) from public.trip_proposals where trip_id='${trip}';`),'0');
 }finally{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);}
});
