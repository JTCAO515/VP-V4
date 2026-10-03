// Immutable actual PG -> production worker + HTTP byte delivery. Credential/transport
// gates are explicit synthetic fixtures; real authenticated/service ACL denial is separate.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
import {coreExportHTTP} from '../../../lib/server/privacy/export-http.ts';
import {runCoreExportJob} from '../../../lib/server/privacy/export-worker.ts';
import {parseExportJob} from '../../../lib/server/privacy/export-contract.ts';
import {decryptExportArtifact,parseExportKey} from '../../../lib/server/privacy/export-artifact.ts';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj36-ts-export-'+randomUUID().slice(0,8),migration='20261003170000_vpj36_core_export_d2.sql';let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const claims=a=>a?`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';`:"set request.jwt.claim.role='service_role';set request.jwt.claims='{\"role\":\"service_role\"}';";
const query=(a,action,input)=>claims(a)+`select public.privacy_core_export_v1('${action}',${literal(input)});`;
const call=async(a,action,input)=>JSON.parse(await db(query(a,action,input)));
const policy={enabled:true,environment:'staging',maxRunMs:60000,artifactTtlMs:60000,downloadTicketTtlMs:30000,maxPages:100,pageSize:100,maxBytes:50000};
const keyConfig={algorithm:'AES-256-GCM',keyId:'isolated-test-key',key:randomBytes(32).toString('base64url')};
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 if(process.env.VP_CORE_EXPORT_SQL_SOURCE)throw Error('Historical SQL source overrides are forbidden; use current checkout migrations.');
 const source=readFileSync('supabase/migrations/'+migration,'utf8');
 for(const f of [...new Set([...readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')),migration])].sort())await db('begin;'+(f===migration?source:readFileSync('supabase/migrations/'+f,'utf8'))+'commit;');
 // A synthetic local administrator seed is not target policy activation or a role grant.
 await db(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until)values('${randomUUID()}',1,true,'staging','${keyConfig.keyId}',60000,60000,30000,100,100,50000,clock_timestamp()+interval '1 hour');`);
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
let ready;
run('actual SQL authority and existing module exports interoperate with production worker encryption and strict receipt',async()=>{
 const a={owner:subject,session:sessionId,request:randomUUID()};
 await db(`insert into auth.users(id)values('${a.owner}');insert into auth.sessions(id,user_id)values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,epoch,session_id)values('${a.owner}',1,'${a.session}');insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch)values('${a.owner}','${randomUUID()}','${a.session}',1);${claims(a)}insert into public.trips(id,owner_id,title)values('${randomUUID()}','${a.owner}','My synthetic Trip');`);
 const queued=await call(a,'request',{requestId:a.request,confirmed:true});assert.ok(parseExportJob(queued,a.request));assert.equal(queued.state,'queued');
 const domain=async(action,input)=>call(null,action,input);
 const modules=async(name,input)=>{
  const params=Object.entries(input).map(([k,v])=>k+'=>'+(v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'")).join(',');
  return JSON.parse(await db(claims(null)+`select public.${name}(${params});`));
 };
 const receipt=await runCoreExportJob(a.request,randomUUID(),policy,parseExportKey(keyConfig),domain,modules,new AbortController().signal);
 assert.equal(receipt.state,'ready_partial');assert.equal(receipt.allUserDataCompleted,false);assert.ok(parseExportJob(receipt,a.request));
 assert.equal(receipt.modules.find(m=>m.module==='conversations').pages,7);
 assert.equal(receipt.modules.find(m=>m.module==='trip').rows,1);
 assert.equal(await db(`select status||':'||execution_state from public.privacy_requests where id='${a.request}';`),'requested:not_started');
 ready={a,receipt};
});
run('actual encrypted SQL artifact reaches protected HTTP only after real SQL one-use ACK (synthetic credentials)',async t=>{
 assert.ok(ready);
 const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',host='vp-v4-d2joint-jtcao515s-projects.vercel.app',f=await nativeFixture(t,database);
 const env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});Object.assign(process.env,env);
 const prior=globalThis.fetch,actions=[];
 t.mock.method(globalThis,'fetch',async(input,init)=>{const r=new Request(input,init);if(new URL(r.url).pathname.endsWith('/privacy_core_export_v1')){const body=await r.json();actions.push(body.p_action);try{return Response.json(await call(ready.a,body.p_action,body.p_input));}catch{return Response.json({message:'synthetic bridge SQL failure'},{status:409});}}return prior(input,init);});
 const configuration={policy:()=>JSON.stringify(policy),key:()=>JSON.stringify(keyConfig)};
 const base=`https://${host}/api/privacy/native/v1/exports/${ready.a.request}`;
 const ticketResponse=await coreExportHTTP(new Request(base+'/download-ticket',{method:'POST',headers:{authorization:'Bearer '+f.token}}),'ticket',ready.a.request,configuration);
 assert.equal(ticketResponse.status,200);const ticket=await ticketResponse.json();
 const req=()=>new Request(base+'/download',{headers:{authorization:'Bearer '+f.token,'X-Export-Download-Token':ticket.token,'X-Export-Operation-ID':ticket.operationId}});
 const downloaded=await coreExportHTTP(req(),'download',ready.a.request,configuration);assert.equal(downloaded.status,200);
 const bundle=await downloaded.json();assert.equal(bundle.coverage,'partial');assert.equal(bundle.data.trip.trips[0].title,'My synthetic Trip');assert.deepEqual(actions,['ticket','download_prepare','download_consume']);
 const retry=await coreExportHTTP(req(),'download',ready.a.request,configuration);assert.equal(retry.status,503);
});
run('real authenticated and service roles remain unable to EXECUTE new domain (no grants)',async()=>{
 for(const role of ['authenticated','service_role']){const r=await sql(container,`set role ${role};`+query(role==='authenticated'?ready.a:null,role==='authenticated'?'read':'execution_receipt',role==='authenticated'?{requestId:ready.a.request}:{requestId:ready.a.request,leaseId:randomUUID(),generation:1,expectedArtifactDigest:ready.receipt.artifactDigest}));assert.notEqual(r.code,0);assert.match(r.stderr,/permission denied for function privacy_core_export_v1/);}
});

run('actual SQL failed terminal receipt decodes as failure with timestamp and no artifact',async()=>{
 const requestId=randomUUID();await call(ready.a,'request',{requestId,confirmed:true});
 const lease=await call(null,'claim',{requestId,operationId:randomUUID(),maxRunMs:60000,expectedEnvironment:'staging',expectedKeyId:keyConfig.keyId});
 const receipt=await call(null,'fail',{requestId,leaseId:lease.leaseId,generation:lease.generation,reason:'SOURCE_UNAVAILABLE'});
 assert.equal(receipt.state,'failed');assert.ok(receipt.completedAt);assert.equal(receipt.artifactDigest,null);assert.deepEqual(receipt.modules,[]);
 assert.deepEqual(parseExportJob(receipt,requestId),receipt);
 const ownerRead=await call(ready.a,'read',{requestId});assert.ok(parseExportJob(ownerRead,requestId));
});

run('real SQL commit accepts partial SOURCE_UNAVAILABLE after existing conversation pages',async()=>{
 const requestId=randomUUID();await call(ready.a,'request',{requestId,confirmed:true});
 const modules=async(name,input)=>{
  if(name==='assistant_message_source_export_owner_v2')throw Error('synthetic later source unavailable');
  const params=Object.entries(input).map(([k,v])=>k+'=>'+(v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'")).join(',');
  return JSON.parse(await db(claims(null)+`select public.${name}(${params});`));
 };
 const receipt=await runCoreExportJob(requestId,randomUUID(),policy,parseExportKey(keyConfig),(action,input)=>call(null,action,input),modules,new AbortController().signal);
 assert.equal(receipt.state,'ready_partial','actual partial SOURCE_UNAVAILABLE commit must succeed');
 const conversation=receipt.modules.find(m=>m.module==='conversations');assert.equal(conversation.status,'partial');assert.equal(conversation.reason,'SOURCE_UNAVAILABLE');assert.ok(conversation.pages>0);
});
