// Actual current-checkout PG -> production Memory consumer. Administrator synthetic
// positives and real API EXECUTE denial are separate; no target/grant/Auth activation.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {runCoreExportJob} from '../../../lib/server/privacy/export-worker.ts';
import {parseExportKey,decryptExportArtifact} from '../../../lib/server/privacy/export-artifact.ts';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vp-d4-consumer-'+randomUUID().slice(0,8);let created=false;
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const claims=a=>a?`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';`:"set request.jwt.claim.role='service_role';set request.jwt.claims='{\"role\":\"service_role\"}';";
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const query=(a,action,input)=>claims(a)+`select public.privacy_core_export_v1('${action}',${literal(input)});`;
const call=async(a,action,input)=>JSON.parse(await db(query(a,action,input)));
const native=async(a,input)=>JSON.parse(await db(claims(a)+`select public.native_memory_command_v1(${literal(input)});`));
const policy={enabled:true,environment:'local',maxRunMs:90000,artifactTtlMs:60000,downloadTicketTtlMs:30000,maxPages:100,pageSize:2,maxBytes:100000};
const key=parseExportKey({algorithm:'AES-256-GCM',keyId:'local-d4-key',key:randomBytes(32).toString('base64url')});
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role()returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 await db(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until)values('${randomUUID()}',1,true,'local','local-d4-key',90000,60000,30000,100,2,100000,clock_timestamp()+interval '1 hour');`);
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
async function fixture(){
 const a={owner:randomUUID(),session:randomUUID(),request:randomUUID(),trip:randomUUID()};
 await db(`insert into auth.users(id)values('${a.owner}');insert into auth.sessions(id,user_id)values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,epoch,session_id)values('${a.owner}',1,'${a.session}');insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch)values('${a.owner}','${randomUUID()}','${a.session}',1);${claims(a)}insert into public.trips(id,owner_id,title)values('${a.trip}','${a.owner}','Synthetic D4 Trip');`);
 const consent=await native(a,{action:'consentCreate',operationId:randomUUID()});
 const create={action:'create',operationId:randomUUID(),memoryId:randomUUID(),receiptId:randomUUID(),consentId:consent.consentId,constraintKind:'preference',summary:'Prior private Undo body',saveLongTerm:true};await native(a,create);
 await native(a,{action:'update',operationId:randomUUID(),memoryId:create.memoryId,sourceReceiptId:create.receiptId,expectedRevision:1,summary:'Current user Memory 😀',saveLongTerm:true});
 const proposal=randomUUID();await db(`${claims(a)}insert into public.trip_proposals(id,owner_id,trip_id,revision,base_trip_version,status,patch,expires_at)values('${proposal}','${a.owner}','${a.trip}',1,0,'pending','{"expectedVersion":0,"operations":[{"kind":"set_title","title":"Synthetic"}]}'::jsonb,clock_timestamp()+interval '1 hour');insert into public.memory_consumer_receipts(owner_id,memory_id,source_receipt_id,consumer_kind,proposal_id,constraint_kind)values('${a.owner}','${create.memoryId}','${create.receiptId}','proposal','${proposal}','preference');`);
 await call(a,'request',{requestId:a.request,confirmed:true});
 const modules=async(name,input)=>{const params=Object.entries(input).map(([k,v])=>k+'=>'+(v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'")).join(',');return JSON.parse(await db(claims(null)+`select public.${name}(${params});`));};
 return {a,create,modules};
}
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
let ready;
run('real6 source rows/page ledger interoperate with full producer and exact protected artifact',async()=>{
 const f=await fixture();let lastLease;
 const domain=async(action,input)=>{const out=await call(null,action,input);if(action==='claim')lastLease=out;return out;};
 const receipt=await runCoreExportJob(f.a.request,randomUUID(),policy,key,domain,f.modules,new AbortController().signal);
 assert.equal(receipt.state,'ready_partial');const memory=receipt.modules.find(m=>m.module==='memory');assert.equal(memory.reason,'LIVE_TRAVERSAL');assert.ok(memory.pages>6);assert.equal(memory.rows,9);
 const ledger=JSON.parse(await db(`select jsonb_build_object('pages',sum(pages),'rows',sum(rows),'terminal',count(*)filter(where terminal))from export_private.memory_section_progress_v1 where request_id='${f.a.request}';`));
 assert.deepEqual(ledger,{pages:memory.pages,rows:memory.rows,terminal:6});
 const operationId=randomUUID(),tokenHash='a'.repeat(64);await call(f.a,'ticket',{requestId:f.a.request,operationId,tokenHash,ticketTtlMs:30000});
 const download=await call(f.a,'download_prepare',{requestId:f.a.request,operationId,tokenHash});
 const bytes=decryptExportArtifact(download.artifact,{requestId:f.a.request,ownerId:f.a.owner,leaseId:lastLease.leaseId,generation:receipt.generation,expiresAt:lastLease.expiresAt},key);assert.ok(bytes);
 const data=JSON.parse(bytes.toString()).data.memory;
 for(const section of ['profiles','consents','receipts','consumerReferences','commands','undoMetadata'])assert.ok(data[section].length>0);
 assert.equal(data.profiles[0].summary,'Current user Memory 😀');assert.equal(data.consumerReferences[0].consumerKind,'proposal');
 assert.equal(bytes.toString().includes('Prior private Undo body'),false);assert.equal(bytes.toString().includes('input_digest'),false);
 ready={...f,receipt,operationId,tokenHash};
});
run('source drift after ready denies every controlled download despite valid original artifact',async()=>{
 assert.ok(ready);
 await native(ready.a,{action:'state',operationId:randomUUID(),memoryId:ready.create.memoryId,sourceReceiptId:ready.create.receiptId,expectedRevision:2,state:'deleted'});
 assert.equal((await call(ready.a,'download_prepare',{requestId:ready.a.request,operationId:ready.operationId,tokenHash:ready.tokenHash})).kind,'unavailable');
 assert.equal((await call(ready.a,'download_consume',{requestId:ready.a.request,operationId:ready.operationId,tokenHash:ready.tokenHash,generation:ready.receipt.generation,artifactDigest:ready.receipt.artifactDigest})).kind,'unavailable');
});
run('mutation during producer collection fails closed before ciphertext commit',async()=>{
 const f=await fixture();let changed=false,commits=0;
 const domain=async(action,input)=>{const out=await call(null,action,input);if(action==='commit')commits++;if(action==='memory_page'&&!changed){changed=true;await native(f.a,{action:'revoke',operationId:randomUUID(),memoryId:f.create.memoryId,sourceReceiptId:f.create.receiptId,expectedRevision:2});}return out;};
 const result=await runCoreExportJob(f.a.request,randomUUID(),policy,key,domain,f.modules,new AbortController().signal);
 assert.equal(result.kind,'unavailable');assert.equal(commits,0);assert.equal(await db(`select count(*)from export_private.core_artifacts_v1 where request_id='${f.a.request}';`),'0');
});
run('actual API EXECUTE denial is separate from administrator-only synthetic successes',async()=>{
 for(const role of ['authenticated','service_role']){const denied=await sql(container,`set role ${role};`+query(role==='authenticated'?ready.a:null,'memory_page',{requestId:ready.a.request,leaseId:randomUUID(),generation:1,section:'profiles',cursor:null,limit:2}));assert.notEqual(denied.code,0);assert.match(denied.stderr,/permission denied for function privacy_core_export_v1/);}
});
