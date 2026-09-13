import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {runTextWorker} from '../../../lib/server/turn/text-worker.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';

test('v5 worker never downgrades missing gaps into a new legacy partial',async()=>{
 for(const raw of [
  {intent:'rail_boarding_documents',requestScope:'additional_needs'},
  {intent:'rail_boarding_documents',requestScope:'additional_needs',unansweredNeeds:['an invented request']},
  {intent:'rail_boarding_documents',requestScope:'additional_needs',unansweredNeeds:['what if I lose it?']},
 ]){
  const calls=[],turnId=randomUUID(),ownerId=randomUUID(),leaseToken=randomUUID(),policyId=randomUUID();
  const endpoint='https://fixture.invalid/chat/completions';
  const input={kind:'intent_input',text:'Which ordinary booking ID is required, and what if I lose it?',locale:'en',policyId,provider:'qwen',endpoint,contextDigest:'a'.repeat(64)};
  const result=await runTextWorker(async name=>{assert.equal(name,'claim_turn_work');return {kind:'leased',turnId,ownerId,leaseToken,attempt:1,leaseMs:10000};},
   async(name,params)=>{if(name==='read_grounded_work')return input;if(name==='authorize_grounded_dispatch')return {kind:'authorized'};calls.push({name,params});return {kind:'finished'};},
   async name=>({kind:({reserve_model_budget:'reserved',dispatch_model_budget:'dispatched',finish_model_budget:'settled'})[name],overrun:false}),
   {scopeId:randomUUID(),priceVersion:'synthetic',reservedMicros:100,maxOutputTokens:256,timeoutMs:5000},
   {inputMode:'knowledge_intent_v1',provider:'qwen',endpoint,price:()=>5,transport:async()=>Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(raw)}}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}})},new AbortController().signal);
  assert.equal(result,'finished');assert.equal(calls.length,1);
  if(raw.unansweredNeeds?.[0]==='what if I lose it?'){
   assert.equal(calls[0].name,'complete_grounded_work_with_needs');assert.equal(calls[0].params.p_unanswered_needs,JSON.stringify(raw.unansweredNeeds));
  }else{
   assert.equal(calls[0].params.p_intent,'technical_failure');assert.equal(calls[0].params.p_request_scope,'unknown');
  }
 }
});
