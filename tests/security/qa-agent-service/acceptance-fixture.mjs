import {randomUUID} from 'node:crypto';
import {acceptanceDigest,openQaAcceptanceJournal} from '../../../lib/server/qa-agent/acceptance-journal.ts';
import {createQaWorker} from '../../../lib/server/qa-agent/worker.ts';
import {readApprovedQaTarget} from '../../../lib/server/qa-agent/target.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';

// Original worker/executor/HTTP transport, all network dependencies synthetic.
export const sourceCommit='575941ae37b6ff0c6b3c74ea485ceedbe40cf52b';
export const endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
export const config={schemaVersion:'qa-agent-worker/2',projectRef:'dzqdzetcctkhbrhlxxgn',databaseUrl:'https://dzqdzetcctkhbrhlxxgn.supabase.co',
 ownerId:'11111111-1111-4111-8111-111111111111',policyId:'22222222-2222-4222-8222-222222222222',
 budget:{scopeId:'55555555-5555-4555-8555-555555555555',priceVersion:'synthetic-only',reservedMicros:2,maxOutputTokens:512,timeoutMs:1000},
 provider:{provider:'qwen',endpoint,configurationId:'66666666-6666-4666-8666-666666666666',configurationVersion:1,timeoutMs:1000},
 pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null}};
export const qaBinding={schemaVersion:'qa-runtime-binding/1',projectRef:config.projectRef,ownerId:config.ownerId,policyId:config.policyId,scopeId:config.budget.scopeId,noticeHash:'a'.repeat(64)};
export function grantFor(now=Date.now()) {
 return {schemaVersion:'qa-acceptance-grant/1',runId:randomUUID(),binding:{projectRef:config.projectRef,ownerId:config.ownerId,policyId:config.policyId,
 scopeId:config.budget.scopeId,noticeHash:qaBinding.noticeHash,configurationId:config.provider.configurationId,configurationVersion:1,sourceCommit,jobDigest:acceptanceDigest(config)},
 activatedAt:now-1000,expiresAt:now+60000,maxPhysicalAttempts:2,concurrency:1,retries:0};
}
export function acceptanceWorker({path,grant,behavior='success',beforeProvider,afterProvider,onDispatchAuthorized,turnId=randomUUID(),attemptId=randomUUID(),job=config,rootSource=sourceCommit,uncontrolled=false}={}) {
 const events=[],finish=[];let physical=0,claims=0;
 const deps={qaBinding,workerCredential:()=> 'sb_secret_synthetic_worker',providerCredential:()=> 'synthetic-only',qwenEndpoint:endpoint,
 recordDestination:async r=>events.push(r.phase),recordUsage:async()=>events.push('usage'),
 ...(!uncontrolled?{acceptance:{control:openQaAcceptanceJournal(path,grant),sourceCommit:rootSource}}:{}),
 fetch:async(url,init)=>{
  if(String(url)===endpoint){
   await beforeProvider?.();physical++;events.push('physical');await afterProvider?.();
   if(behavior==='provider-error')throw Error('Synthetic provider failure');
   return Response.json({synthetic:true});
  }
  if(new URL(url).origin!==config.databaseUrl)throw Error('No network allowed');
  const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(init.body);events.push(name);
  if(name==='qa_claim_work_v1')claims++;
  if(behavior==='dispatch-ack-unknown'&&name==='qa_authorize_dispatch_v2')throw Error('Synthetic lost dispatch ACK');
  if(behavior==='settle-ack-unknown'&&name==='finish_model_budget'&&body.p_action==='settle')throw Error('Synthetic lost settlement ACK');
  if(behavior==='completion-ack-unknown'&&name==='qa_complete_work_v1')throw Error('Synthetic lost completion ACK');
  if(name==='qa_authorize_dispatch_v2')await onDispatchAuthorized?.();
  if(name==='finish_model_budget')finish.push(body.p_action);
  const rows={qa_claim_work_v1:{kind:behavior==='empty'?'empty':'leased',turnId,ownerId:config.ownerId,attempt:1,leaseToken:attemptId,leaseMs:120000},
   qa_read_work_v1:{kind:'qa_input',schemaVersion:'qa-context/1',contextMode:'qa_session_history_v1',ownerId:config.ownerId,authSessionId:attemptId,
    turnId,threadId:config.provider.configurationId,serviceTaskId:config.provider.configurationId,policyId:config.policyId,consentId:config.budget.scopeId,provider:'qwen',endpoint,locale:'en'},
   reserve_model_budget:{kind:'reserved'},qa_authorize_dispatch_v2:{kind:'authorized'},finish_model_budget:{kind:body.p_action==='settle'?'settled':body.p_action,overrun:false},qa_complete_work_v1:{kind:'finished'}};
  if(!rows[name])throw Error('Unexpected synthetic RPC');return Response.json(rows[name]);
 },invokeContext:async args=>{
  await args.rpc('qa_authorize_dispatch_v1',{p_turn_id:turnId,p_lease_token:attemptId,p_scope_id:config.budget.scopeId,p_policy_id:config.policyId,p_provider:'qwen',p_context_digest:'b'.repeat(64)},args.signal);
  const request={provider:'qwen',endpoint,method:'POST',body:JSON.stringify({model:PROTOCOL_MODELS.qwen,messages:[{role:'user',content:'Synthetic only'}],enable_thinking:false,max_tokens:512}),signal:args.signal};
  await args.transport(request);
  if(behavior==='duplicate-send')await args.transport(request);
  const output=behavior==='usage-over-cap'?513:10;
  return {kind:'protocol_validated',provider:'qwen',model:PROTOCOL_MODELS.qwen,output:JSON.stringify({outcome:'answered',text:'Synthetic saved answer'}),
   usage:behavior==='usage-unknown'?null:{inputTokens:10,outputTokens:output,totalTokens:10+output,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'}};
 }};
 const worker=createQaWorker(job,deps,readApprovedQaTarget(config.projectRef));
 return {run:(signal=new AbortController().signal)=>worker(signal),events,finish,get physical(){return physical;},get claims(){return claims;}};
}
