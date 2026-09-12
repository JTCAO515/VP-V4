import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopedTextWorker} from '../../../lib/server/turn/scoped-text-worker.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const ownerId='11111111-1111-4111-8111-111111111111',policyId='22222222-2222-4222-8222-222222222222';
const turnId='33333333-3333-4333-8333-333333333333',leaseToken='44444444-4444-4444-8444-444444444444';
const scopeId='55555555-5555-4555-8555-555555555555',otherId='66666666-6666-4666-8666-666666666666';
const config=()=>({environment:'staging',databaseUrl:'https://dzqdzetcctkhbrhlxxgn.supabase.co',ownerId,policyId,
 budget:{scopeId,priceVersion:'synthetic-v1',reservedMicros:1000,maxOutputTokens:512,timeoutMs:1000}});
const lease={kind:'leased',ownerId,turnId,leaseToken,attempt:1,leaseMs:120000};
const input={kind:'input',text:'Synthetic input',provider:'qwen',endpoint:'https://synthetic.invalid/inference',locale:'en',policyId};
const output=()=>Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({outcome:'answered',text:'Synthetic answer'})}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});
function fixture(){
 const calls=[],sent=[];
 const deps={credential:()=> 'synthetic-worker-credential',provider:{provider:'qwen',endpoint:input.endpoint,price:()=>20,transport:async request=>{sent.push(request);return output();}},fetch:async(url,options)=>{
  assert.equal(new URL(url).origin,config().databaseUrl);assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');
  assert.equal(options.headers.authorization,'Bearer synthetic-worker-credential');assert.equal(options.headers.apikey,'synthetic-worker-credential');
  const name=new URL(url).pathname.split('/').at(-1),params=JSON.parse(options.body);calls.push({name,params});
  const result={claim_text_work:lease,read_text_work:input,reserve_model_budget:{kind:'reserved'},dispatch_model_budget:{kind:'dispatched'},authorize_text_dispatch:{kind:'authorized'},finish_model_budget:{kind:'settled',overrun:false},complete_text_work:{kind:'finished'},finish_turn_work:{kind:'finished'}}[name];
  assert.ok(result,'no unknown RPC');return Response.json(result);
 }};
 return {deps,calls,sent};
}
test('scoped worker binds claim, policy and budget; snapshots operator configuration',async()=>{
 const f=fixture(),c=config(),worker=createScopedTextWorker(c,f.deps);c.ownerId=otherId;c.policyId=otherId;c.budget.scopeId=otherId;
 assert.equal(await worker(new AbortController().signal),'finished');
 assert.deepEqual(f.calls[0],{name:'claim_text_work',params:{p_owner_id:ownerId,p_policy_id:policyId}});
 assert.equal(f.calls.some(c=>c.name==='claim_turn_work'),false);
 for(const c of f.calls.filter(c=>c.name.endsWith('model_budget'))){assert.equal(c.params.p_owner_id,ownerId);assert.equal(c.params.p_scope_id,scopeId);}
 assert.equal(f.calls.filter(c=>c.name==='authorize_text_dispatch')[0].params.p_policy_id,policyId);
 assert.equal(f.calls.filter(c=>c.name==='complete_text_work').length,1);assert.equal(f.sent.length,1);
});
test('scoped worker rejects wrong environment, open config shapes and invalid bounds before I/O',async()=>{
 const f=fixture();
 for(const patch of [{environment:'production'},{databaseUrl:'https://other.supabase.co'},{ownerId:'invalid'},{policyId:''},{extra:true},{budget:{...config().budget,extra:true}},{budget:{...config().budget,priceVersion:'v1:2026'}},{budget:{...config().budget,reservedMicros:0}},{budget:{...config().budget,timeoutMs:60001}},{budget:{...config().budget,maxOutputTokens:4097}}])assert.throws(()=>createScopedTextWorker({...config(),...patch},f.deps));
 for(const databaseUrl of ['http://127.0.0.1/path','http://127.0.0.1?key=x','http://user:password@127.0.0.1','https://127.0.0.1','http://127.0.0.1.attacker.test'])assert.throws(()=>createScopedTextWorker({...config(),environment:'local',databaseUrl},f.deps));
 assert.equal(f.calls.length,0);
});
test('missing credential, deployed process and pre-aborted invocation never fetch',async t=>{
 const f=fixture(),controller=new AbortController();controller.abort();
 assert.equal(await createScopedTextWorker(config(),f.deps)(controller.signal),'unavailable');
 assert.equal(await createScopedTextWorker(config(),{...f.deps,credential:()=>null})(new AbortController().signal),'unavailable');
 const old=process.env.VERCEL_ENV;t.after(()=>old===undefined?delete process.env.VERCEL_ENV:process.env.VERCEL_ENV=old);
 process.env.VERCEL_ENV='preview';assert.equal(await createScopedTextWorker(config(),f.deps)(new AbortController().signal),'unavailable');
 assert.equal(f.calls.length,0);assert.equal(f.sent.length,0);
});
test('wrong claim owner or changed policy never reserves budget or sends content',async()=>{
 for(const stage of ['claim_text_work','read_text_work']){
  const f=fixture(),transport=f.deps.fetch;
  f.deps.fetch=async(url,options)=>new URL(url).pathname.endsWith('/'+stage)?Response.json(stage==='claim_text_work'?{...lease,ownerId:otherId}:{...input,policyId:otherId}):transport(url,options);
  assert.equal(await createScopedTextWorker(config(),f.deps)(new AbortController().signal),'unavailable');
  assert.equal(f.sent.length,0);assert.equal(f.calls.some(c=>c.name==='reserve_model_budget'),false);
 }
});
test('RPC redirects, error bodies, oversized bodies and malformed UTF-8 are unavailable without retry',async()=>{
 for(const reply of [()=>new Response('',{status:302,headers:{location:'https://attacker.test'}}),()=>Response.json({secret:'must not escape'},{status:503}),()=>new Response('x'.repeat(131073),{headers:{'content-type':'application/json'}}),()=>new Response(new Uint8Array([0xff]),{headers:{'content-type':'application/json'}})]){
  const f=fixture();let calls=0;f.deps.fetch=async()=>{calls++;return reply();};
  assert.equal(await createScopedTextWorker(config(),f.deps)(new AbortController().signal),'unavailable');assert.equal(calls,1);assert.equal(f.sent.length,0);
 }
});
test('cancellation while credentials or claim reply is pending prevents late continuation',{timeout:3000},async t=>{
 for(const stage of ['credential','claim']){
  const f=fixture(),controller=new AbortController();let arrived,release,cancelled=0;
  const seen=new Promise(r=>{arrived=r;}),held=new Promise(r=>{release=r;});t.after(()=>{controller.abort();release();});
  if(stage==='credential')f.deps.credential=async()=>{arrived();await held;return 'synthetic-worker-credential';};
  else f.deps.fetch=async()=>{arrived();await held;return new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}});};
  const pending=createScopedTextWorker(config(),f.deps)(controller.signal);await seen;controller.abort();assert.equal(await pending,'unavailable');
  release();await new Promise(r=>setImmediate(r));assert.equal(f.sent.length,0);assert.equal(f.calls.length,0);assert.equal(cancelled,stage==='claim'?1:0);
 }
});
test('cancellation of hostile response body returns without awaiting reader cancellation',{timeout:3000},async t=>{
 const f=fixture(),controller=new AbortController();let arrived,cancelled=0;
 const seen=new Promise(r=>{arrived=r;});t.after(()=>controller.abort());
 f.deps.fetch=async()=>({status:200,redirected:false,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({read:()=>{arrived();return new Promise(()=>{});},cancel:()=>{cancelled++;return new Promise(()=>{});},releaseLock:()=>{}})}});
 const pending=createScopedTextWorker(config(),f.deps)(controller.signal);await seen;controller.abort();assert.equal(await pending,'unavailable');assert.equal(cancelled,1);assert.equal(f.sent.length,0);
});
test('unknown completion acknowledgment is not retried or converted to another terminal',async()=>{
 const f=fixture(),transport=f.deps.fetch;let completions=0;
 f.deps.fetch=async(url,options)=>{if(new URL(url).pathname.endsWith('/complete_text_work')){completions++;throw Error('synthetic unknown ack');}return transport(url,options);};
 assert.equal(await createScopedTextWorker(config(),f.deps)(new AbortController().signal),'unavailable');
 assert.equal(completions,1);assert.equal(f.sent.length,1);assert.equal(f.calls.some(c=>c.name==='finish_turn_work'),false);
});

test('bounded thinking stays task-policy bound through claim, fresh authorization, budget and completion',async()=>{
 for(const authorized of [true,false]){
  const f=fixture(),transport=f.deps.fetch;
  f.deps.provider.inputMode='task_history_v1';f.deps.provider.thinkingBudgetTokens=256;
  f.deps.fetch=async(url,options)=>{
   const name=new URL(url).pathname.split('/').at(-1),params=JSON.parse(options.body);
   if(name==='claim_text_task_work'){f.calls.push({name,params});return Response.json(lease);}
   if(name==='read_text_work'){f.calls.push({name,params});return Response.json({...input,kind:'task_input',history:[],contextDigest:'a'.repeat(64)});}
   if(name==='authorize_text_task_dispatch'){f.calls.push({name,params});return Response.json({kind:authorized?'authorized':'denied'});}
   return transport(url,options);
  };
  assert.equal(await createScopedTextWorker(config(),f.deps)(new AbortController().signal),'finished');
  assert.equal(f.calls[0].name,'claim_text_task_work');
  assert.equal(f.calls.find(c=>c.name==='authorize_text_task_dispatch').params.p_policy_id,policyId);
  assert.equal(f.sent.length,authorized?1:0);
  if(authorized){const body=JSON.parse(f.sent[0].body);assert.equal(body.max_completion_tokens,512);assert.equal(body.thinking_budget,256);assert.equal(body.max_tokens,undefined);}
  const terminal=f.calls.find(c=>c.name==='complete_text_work');assert.equal(terminal.params.p_kind,authorized?'answered':'blocked');
 }
 const f=fixture();
 for(const patch of [{thinkingBudgetTokens:256},{inputMode:'task_history_v1',thinkingBudgetTokens:512},{inputMode:'task_history_v1',thinkingBudgetTokens:256,provider:'glm'}])assert.throws(()=>createScopedTextWorker(config(),{...f.deps,provider:{...f.deps.provider,...patch}}));
 assert.equal(f.calls.length,0);
});
