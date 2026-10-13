import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('components/qa-agent/api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sid='11111111-1111-4111-8111-111111111111', rid='22222222-2222-4222-8222-222222222222';
function fixture(data,status=200,jsonError=false){
 const seen=[],exports={};vm.runInNewContext(source,{exports,AbortSignal,Error,TypeError,fetch:async(url,init)=>{seen.push({url,init});return {status,ok:status>=200&&status<300,json:async()=>{if(jsonError)throw new SyntaxError("Malformed synthetic JSON");return data;}};}});return {api:exports.qaApi,permits:exports.permitsQaSubmission,retry:exports.retryableHistoryError,ApiError:exports.ApiError,seen};
}
const wire=data=>({version:'qa-agent/1',...data});
const saved=overrides=>({requestId:rid,turnId:rid,sessionId:sid,input:'original bytes ',text:'Saved answer',status:'answered',createdAt:'2026-10-13T00:00:00Z',...overrides});
test('accepted receipt stays pending and transport uses same-origin cookies without auth headers',async()=>{
 const {api,seen}=fixture(wire({requestId:rid,turnId:rid,sessionId:sid,status:'pending',reused:false}));
 const result=await api.send(sid,{requestId:rid,text:'original bytes '},new AbortController().signal);
 assert.equal(result.message.status,'pending');assert.equal(result.message.answer,null);
 assert.equal(seen[0].init.credentials,'same-origin');assert.equal(seen[0].init.cache,'no-store');assert.equal(seen[0].init.headers.authorization,undefined);
 assert.deepEqual(JSON.parse(seen[0].init.body),{requestId:rid,text:'original bytes '});
});
test('version, owner/session, request, terminal-without-answer and unknown outcome fail closed',async()=>{
 for(const data of [wire({message:saved({sessionId:rid})}),wire({message:saved({requestId:sid})}),wire({message:saved({text:null})}),wire({message:saved({status:'invented'})}),wire({message:saved({status:'pending',text:'fake answer'})}),{version:'other',message:saved()}]){
  const {api}=fixture(data);await assert.rejects(api.recover(sid,rid,new AbortController().signal),e=>e.code==='INVALID_RESPONSE');
 }
});
test('unknown ACK stays unknown and explicit original request recovery is GET only',async()=>{
 const {api,seen}=fixture(wire({error:{code:'PROVIDER_UNAVAILABLE',ack:'unknown'}}),503);
 await assert.rejects(api.recover(sid,rid,new AbortController().signal),e=>e.status===503&&e.ack==='unknown');
 assert.equal(seen.length,1);assert.equal(seen[0].init.method,'GET');assert.ok(seen[0].url.endsWith(`/messages/${rid}`));
});
test('policy consent is never inferred and server denial is preserved',async()=>{
 const notice={id:sid,noticeHash:'a'.repeat(64),noticeZh:'真实说明',noticeEn:'Actual notice',contextMode:'current_input_v1',maxTurns:null,consentState:'not_accepted'};
 const {api}=fixture(wire({policy:notice}));assert.equal((await api.policy(new AbortController().signal)).consented,false);
 const denied=fixture(wire({error:{code:'DATA_POLICY_BLOCKED',ack:'not_submitted'}}),403);
 await assert.rejects(denied.api.send(sid,{requestId:rid,text:'Original'},new AbortController().signal),e=>e.code==='DATA_POLICY_BLOCKED'&&e.ack==='not_submitted');
 const missing=fixture(wire({policy:{...notice,consentState:undefined}}));await assert.rejects(missing.api.policy(new AbortController().signal));
});

test('only accepted versioned QA session policy permits submission',async()=>{
 const base={id:sid,noticeHash:'a'.repeat(64),noticeZh:'当前会话的有界历史',noticeEn:'Bounded history of the current session',contextMode:'qa_session_history_v1',maxTurns:8,consentState:'accepted'};
 const allowed=fixture(wire({policy:base}));assert.equal(allowed.permits(await allowed.api.policy(new AbortController().signal)),true);
 for(const contextMode of ['current_input_v1','task_history_v1','qa_session_history_v1']) {
  for(const consentState of ['accepted','not_accepted','withdrawn']) {
   const f=fixture(wire({policy:{...base,contextMode,maxTurns:contextMode==='qa_session_history_v1'?8:null,consentState}}));
   assert.equal(f.permits(await f.api.policy(new AbortController().signal)),contextMode==='qa_session_history_v1'&&consentState==='accepted');
  }
 }
 const unknown=fixture(wire({policy:{...base,contextMode:'qa_session_history_v2'}}));await assert.rejects(unknown.api.policy(new AbortController().signal));
});
test('missing, mismatched and unknown quota authority fail closed; limit denial retains not_submitted',async()=>{
 const base={id:sid,noticeHash:'a'.repeat(64),noticeZh:'有界历史',noticeEn:'Bounded history',contextMode:'qa_session_history_v1',consentState:'accepted'};
 for(const maxTurns of [undefined,null,0,7,9,'8']) {
  const f=fixture(wire({policy:{...base,maxTurns}}));await assert.rejects(f.api.policy(new AbortController().signal),e=>e.code==='INVALID_RESPONSE');
 }
 const allowed=fixture(wire({policy:{...base,maxTurns:8}}));assert.equal((await allowed.api.policy(new AbortController().signal)).maxTurns,8);
 const legacy=fixture(wire({policy:{...base,contextMode:'current_input_v1',maxTurns:8}}));await assert.rejects(legacy.api.policy(new AbortController().signal));
 const denied=fixture(wire({error:{code:'QA_CONTEXT_LIMIT',ack:'not_submitted'}}),409);
 await assert.rejects(denied.api.send(sid,{requestId:rid,text:'Ninth'},new AbortController().signal),e=>e.status===409&&e.code==='QA_CONTEXT_LIMIT'&&e.ack==='not_submitted');
});
test('only temporary history errors retry; permission and successful malformed wire stop',async()=>{
 const f=fixture({});
 for(const status of [408,429,500,502,503,504]) assert.equal(f.retry(new f.ApiError(status)),true);
 for(const [status,code] of [[401,'UNAUTHENTICATED'],[403,'FORBIDDEN'],[503,'DATA_POLICY_BLOCKED'],[502,'INVALID_RESPONSE'],[200,'PROVIDER_UNAVAILABLE'],[409,'QA_CONTEXT_LIMIT']]) assert.equal(f.retry(new f.ApiError(status,code)),false);
 assert.equal(f.retry(new TypeError('Synthetic network failure')),true);
 const timeout=new Error('Synthetic timeout');timeout.name='TimeoutError';assert.equal(f.retry(timeout),true);
 assert.equal(f.retry(new Error('Unknown failure')),false);
 const malformed=fixture({},200,true);await assert.rejects(malformed.api.recover(sid,rid,new AbortController().signal),error=>error.code==='INVALID_RESPONSE'&&!malformed.retry(error));
 const gateway=fixture({},503,true);await assert.rejects(gateway.api.recover(sid,rid,new AbortController().signal),error=>gateway.retry(error));
});
