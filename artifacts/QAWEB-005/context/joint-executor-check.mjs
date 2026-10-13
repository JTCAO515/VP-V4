// Synthetic composition check against the backend owner's actual executor file.
// Run: node artifacts/QAWEB-005/context/joint-executor-check.mjs /absolute/path/to/executor.ts
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createQaContextInvoker} from '../../../lib/server/qa-agent-context/executor-adapter.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const path=resolve(process.argv[2]??'lib/server/qa-agent/executor.ts');
const digest=()=>createHash('sha256').update(readFileSync(path)).digest('hex'),before=digest();
const {executeQaWork}=await import(pathToFileURL(path).href);
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const owner=id(1),turn=id(4),token=id(7),scope=id(8),policy=id(5),task=id(3),calls=[];
const raw={kind:'qa_input',schemaVersion:'qa-context/1',contextMode:'qa_session_history_v1',ownerId:owner,authSessionId:id(9),turnId:turn,threadId:id(2),serviceTaskId:task,policyId:policy,consentId:id(6),provider:'qwen',endpoint:'https://fixture.invalid/v1/chat/completions',text:'为什么？',locale:'zh',history:[{turnId:id(10),role:'user',content:'上海两日'},{turnId:id(10),role:'assistant',content:'方案一慢游；方案二看更多街区。'}],sourceTurnIds:[turn,id(10)],contextDigest:'a'.repeat(64)};
const result=await executeQaWork(owner,policy,{scopeId:scope,priceVersion:'fixture-1',reservedMicros:100,maxOutputTokens:128,timeoutMs:1000},{
 rpc:async(name,p,signal)=>{
  assert.equal(signal.aborted,false);calls.push(name);
  if(name==='qa_claim_work_v1')return {kind:'leased',turnId:turn,ownerId:owner,attempt:1,leaseToken:token,leaseMs:1000};
  if(name==='qa_read_work_v1')return raw;
  if(name==='reserve_model_budget'){assert.equal(p.p_attempt_id,token);assert.equal(p.p_task_id,turn);return {kind:'reserved'};}
  if(name==='qa_authorize_dispatch_v1'){assert.equal(p.p_scope_id,scope);assert.equal(p.p_lease_token,token);return {kind:'authorized'};}
  if(name==='finish_model_budget'){assert.equal(p.p_action,'settle');assert.equal(p.p_attempt_id,token);return {kind:'settled',overrun:false};}
  if(name==='qa_complete_work_v1'){assert.equal(p.p_kind,'answered');assert.equal(p.p_text,'Synthetic contextual answer');return {kind:'finished'};}
  throw Error(name);
 },
 invokeContext:createQaContextInvoker(),
 provider:{provider:'qwen',endpoint:raw.endpoint,price:()=>5,transport:async wire=>{
  calls.push('provider');const b=JSON.parse(wire.body);
  assert.deepEqual(b.messages.slice(1),[{role:'user',content:'上海两日'},{role:'assistant',content:'方案一慢游；方案二看更多街区。'},{role:'user',content:'为什么？'}]);
  return Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({outcome:'answered',text:'Synthetic contextual answer'})}}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}});
 }},
 recordUsage:async receipt=>{calls.push('recordUsage');assert.equal(receipt.attempt.attemptId,token);assert.equal(receipt.turnId,turn);assert.equal(receipt.usage.totalTokens,30);assert.equal(receipt.actualMicros,5);}
},new AbortController().signal);
assert.equal(result,'finished');assert.equal(calls.filter(x=>x==='provider').length,1);assert.ok(!calls.includes('dispatch_model_budget'));assert.equal(digest(),before);
console.log(JSON.stringify({result,calls,kind:'SYNTHETIC_CROSS_WORKTREE_INTEGRATION',executorSHA256:before}));
