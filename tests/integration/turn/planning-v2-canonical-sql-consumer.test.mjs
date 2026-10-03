// Formal current-checkout migrations, golden constants and TS modules only.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {createPlanningV2ModelRequest as createRequest} from '../../../lib/server/turn/planning-v2-model-request.ts';
import {createPlanningV2ModelOutputReceipt as createOutput,parsePlanningV2ModelOutputReceipt as parseOutput} from '../../../lib/server/turn/planning-v2-model-output-receipt.ts';
import {PLANNING_COMPARISON_PROMPT} from '../../../lib/server/model-gateway/prompt/planning-comparison.ts';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj79-canonical-'+randomUUID().slice(0,8);
let created=false,tuple,requestId,vectors,boundary,binding;
const fields=['owner','task','turn','lease','textPolicy','planningPolicy','scope','attempt','provider','model','priceVersion','intakeDigest','planningDigest'];
const lit=v=>v===null?'null':"'"+(typeof v==='string'?v:JSON.stringify(v)).replaceAll("'","''")+"'";
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const payload=text=>({model:binding.model,messages:[{role:'system',content:PLANNING_COMPARISON_PROMPT},{role:'user',content:text}],stream:false,max_tokens:128,enable_thinking:false,response_format:{type:'json_object'}});
const input=text=>({schemaVersion:'planning-v2-model-request/1',binding,requestId,payload:payload(text)});
const serialize=async(p,t=binding,id=requestId)=>JSON.parse((await db(`select turn_private.serialize_planning_v2_request_v1(${lit(t)}::jsonb,${lit(id)}::uuid,${lit(p)}::jsonb);`))||'null');
const validate=(w,t=binding)=>db(`select turn_private.validate_planning_v2_output_v1(${lit(w)}::jsonb,${lit(t)}::jsonb);`);
before(async()=>{
 if(!enabled)return;
 const s=readFileSync('tests/contract/turn/planning-v2-model-request.test.ts','utf8');
 tuple=JSON.parse(s.slice(s.indexOf('const tuple = ')+14,s.indexOf(';\nconst requestId')));
 requestId=JSON.parse(s.slice(s.indexOf('const requestId = ')+18,s.indexOf(';\n// Independently')));
 vectors=JSON.parse(s.slice(s.indexOf('const vectors = ')+16,s.indexOf(';\nconst byteLimitVector')));
 boundary=JSON.parse(s.slice(s.indexOf('const byteLimitVector = ')+24,s.indexOf(';\nconst sha')));
 binding=Object.fromEntries(fields.map((k,i)=>[k,tuple[i]]));
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 let ready=false;for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
run('actual SQL serializer matches independent hardcoded UTF8 vectors and inclusive65536 hashes byte for byte',async t=>{
 for(const v of vectors){const actual=await serialize(payload(v.text)),ts=createRequest(input(v.text),binding);assert.ok(ts);assert.deepEqual(actual,ts);assert.equal(actual.body,v.body);assert.equal(actual.payloadDigest,v.payloadDigest);assert.equal(actual.requestDigest,v.requestDigest);assert.equal(Buffer.byteLength(actual.body,'utf8'),v.byteLength);
  const reordered=Object.fromEntries(Object.entries(payload(v.text)).reverse());assert.deepEqual(await serialize(reordered),actual);
 }
 const room=65536-Buffer.byteLength(JSON.stringify(payload('')),'utf8'),text='\u0001'.repeat(Math.floor(room/6))+'x'.repeat(room%6),actual=await serialize(payload(text));
 assert.equal(Buffer.byteLength(actual.body,'utf8'),65536);assert.deepEqual(actual,createRequest(input(text),binding));assert.equal(actual.payloadDigest,boundary.payloadDigest);assert.equal(actual.requestDigest,boundary.requestDigest);assert.equal(await serialize(payload(text+'x')),null);
 t.diagnostic(JSON.stringify({sources:'all current-checkout migrations and golden constants',vectors:vectors.length,exactBoundaryBytes:65536,network:'none'}));
});
run('actual SQL returns NULL for invalid closed fields/canonical tuple and cannot accept unsupported Unicode',async()=>{
 const p=payload('synthetic'),upper='ABCDEF00-0000-0000-0000-000000000001';
 for(const key of fields.slice(0,8))assert.equal(await serialize(p,{...binding,[key]:upper}),null,key);
 for(const bad of [{...p,headers:{}},{...p,max_tokens:0},{...p,max_tokens:8193},{...p,stream:'false'},{...p,enable_thinking:[false]},{...p,response_format:{type:'json_object',extra:true}},{...p,messages:[p.messages[0],{role:'user',content:'x',extra:true}]}])assert.equal(await serialize(bad),null);
 assert.equal(await serialize(payload('x'.repeat(32769))),null);assert.equal(await serialize(payload(' ')),null);
 // JSONB cannot represent NUL/unpaired surrogates: server rejects at SQL cast; TS rejects before serialization.
 for(const text of ['\0','\ud800','\udc00']){assert.equal(createRequest(input(text),binding),null);const r=await sql(container,`select turn_private.serialize_planning_v2_request_v1(${lit(binding)}::jsonb,${lit(requestId)}::uuid,${lit(payload(text))}::jsonb);`);assert.notEqual(r.code,0);assert.match(r.stderr,/Unicode|surrogate|unsupported|invalid/i);}
 const lower='abcdef00-0000-0000-0000-000000000001';assert.equal(createRequest({...input('x'),requestId:lower.toUpperCase()},binding),null);
 // Typed PostgreSQL uuid normalizes spelling before function entry; returned/hash UUID is canonical.
 const canonical=await serialize(p,binding,lower.toUpperCase());assert.equal(canonical.requestId,lower);assert.deepEqual(canonical,createRequest({...input('synthetic'),requestId:lower},binding));
});
run('actual SQL independently validates TS output/usage digests and rejects tamper without API EXECUTE',async()=>{
 const observedAt='2026-10-03T00:00:00.123Z',usageReceipt={schemaVersion:'validated-planning-usage/1',attempt:{scopeId:binding.scope,ownerId:binding.owner,taskId:binding.task,attemptId:binding.attempt,provider:'qwen',model:binding.model,priceVersion:binding.priceVersion,reservedMicros:10,timeoutMs:1000},turnId:binding.turn,policyId:binding.planningPolicy,usage:{inputTokens:12,outputTokens:8,totalTokens:20,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'},actualMicros:0,observedAt};
 const raw={schemaVersion:'planning-v2-model-output/1',binding,usageReceipt,output:{highlight:'none'},observedAt},w=createOutput(raw,binding);assert.ok(w);assert.ok(parseOutput(w,binding));assert.equal(await validate(w),'t');
 const positive=createOutput({...raw,output:{highlight:'jingan'},usageReceipt:{...usageReceipt,actualMicros:7,usage:{...usageReceipt.usage,cachedInputTokens:0,uncachedInputTokens:12,reasoningTokens:0}}},binding);assert.ok(positive);assert.equal(await validate(positive),'t');
 for(const bad of [{...w,output:{highlight:'jingan'}},{...w,output:{highlight:['none']}},{...w,extra:true},{...w,executionAvailable:true},{...w,usageDigest:'0'.repeat(64)},{...w,binding:{...binding,attempt:'abcdef00-0000-0000-0000-000000000001'}},{...w,usageReceipt:{...usageReceipt,actualMicros:null}},{...w,usageReceipt:{...usageReceipt,attempt:{...usageReceipt.attempt,provider:['qwen']}}},{...w,usageReceipt:{...usageReceipt,usage:{...usageReceipt.usage,totalTokens:21}}}]){assert.equal(parseOutput(bad,binding),null);assert.equal(await validate(bad),'f');}
 for(const role of ['anon','authenticated','service_role'])for(const f of ['serialize_planning_v2_request_v1(jsonb,uuid,jsonb)','validate_planning_v2_output_v1(jsonb,jsonb)'])assert.equal(await db(`select has_function_privilege('${role}','turn_private.${f}','EXECUTE');`),'f');
});
