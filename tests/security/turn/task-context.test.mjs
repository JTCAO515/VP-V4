import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {CostGuard} from '../../../lib/server/model-gateway/budget/index.ts';
import {invokeTextProviderProtocol,invokeProviderProtocol,PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
import {TEXT_TASK_SYSTEM_PROMPT,TEXT_TASK_PROMPT_REF,TEXT_TURN_PROMPT_REF} from '../../../lib/server/model-gateway/prompt/text-turn.ts';
const endpoint='https://synthetic.invalid/inference',policyId=randomUUID(),contextDigest='a'.repeat(64);
const history=[{role:'user',content:'Which side is the door on?'},{role:'assistant',content:'Are you facing north or south?'}];
const raw=()=>({kind:'task_input',text:'North.',locale:'en',policyId,provider:'qwen',endpoint,history,contextDigest});
const guard=()=>new CostGuard({windowMs:120000,perUserAttempts:1,perTaskAttempts:1,turnDeadlineMs:120000,maxModelSteps:1,maxToolSteps:1}).startTurn({userId:randomUUID(),taskId:randomUUID()});
const lease=()=>({turnId:randomUUID(),leaseToken:randomUUID()});
const binding={provider:'qwen',endpoint,maxOutputTokens:1000,timeoutMs:1000,inputMode:'task_history_v1'};
const reply=()=>Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({outcome:'answered',text:'Synthetic answer.'})}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});
test('context dispatch uses ordered typed history and digest-bound fresh authorization',async()=>{
 const calls=[];let sent;
 const rpc=async(name,params)=>{calls.push({name,params});return name==='read_text_work'?raw():{kind:'authorized'};};
 const result=await invokeTextProviderProtocol(lease(),binding,rpc,guard(),async req=>{sent=JSON.parse(req.body);return reply();},new AbortController().signal);
 assert.equal(result.kind,'protocol_validated');assert.equal(calls[1].name,'authorize_text_task_dispatch');assert.equal(calls[1].params.p_context_digest,contextDigest);
 assert.deepEqual(sent.messages,[{role:'system',content:TEXT_TASK_SYSTEM_PROMPT},...history,{role:'user',content:'North.'}]);
 assert.notEqual(TEXT_TASK_PROMPT_REF.digest,TEXT_TURN_PROMPT_REF.digest);assert.equal(sent.response_format.type,'json_object');
});
test('wrong mode, malformed roles, excess turns and stale dispatch authorization never send',async()=>{
 const invalid=[{...raw(),kind:'input'},{...raw(),contextDigest:undefined},{...raw(),history:[{role:'system',content:'untrusted'}]},
  {...raw(),history:[...history,...history,...history,...history]}, {...raw(),history:[{role:'user',content:'😀'.repeat(2001)},history[1]]},
  {...raw(),history:[{...history[0],extra:true},history[1]]}];
 for(const input of invalid){let sent=0;const r=await invokeTextProviderProtocol(lease(),binding,async()=>input,guard(),async()=>{sent++;return reply();},new AbortController().signal);assert.equal(r.kind,'unavailable');assert.equal(sent,0);}
 let sent=0;const stale=await invokeTextProviderProtocol(lease(),binding,async name=>name==='read_text_work'?raw():{kind:'blocked'},guard(),async()=>{sent++;return reply();},new AbortController().signal);
 assert.equal(stale.code,'DATA_POLICY_BLOCKED');assert.equal(sent,0);
 const old=await invokeTextProviderProtocol(lease(),{...binding,inputMode:undefined},async()=>raw(),guard(),async()=>{sent++;return reply();},new AbortController().signal);assert.equal(old.code,'DATA_POLICY_BLOCKED');assert.equal(sent,0);
});
test('maximal escaped context is bounded by serialized bytes, and public C2 entry stays denied',async()=>{
 const maximal={...raw(),text:'x'+'\u0001'.repeat(3999),history:Array.from({length:6},(_,i)=>({role:i%2?'assistant':'user',content:'x'+'\u0001'.repeat((i%2?8000:4000)-1)}))};
 let bytes=0;const r=await invokeTextProviderProtocol(lease(),binding,async name=>name==='read_text_work'?maximal:{kind:'authorized'},guard(),async req=>{bytes=Buffer.byteLength(req.body);return reply();},new AbortController().signal);
 assert.equal(r.kind,'protocol_validated');assert.ok(bytes>240000 && bytes<=262144);
 let sent=0;const denied=await invokeProviderProtocol({requestId:randomUUID(),provider:'qwen',dataClass:'c2_sensitive',task:'text_task_v2',input:'x',history,maxOutputTokens:1000,timeoutMs:1000},guard(),async()=>{sent++;return reply();},new AbortController().signal);
 assert.equal(denied.code,'DATA_POLICY_BLOCKED');assert.equal(sent,0);
});
