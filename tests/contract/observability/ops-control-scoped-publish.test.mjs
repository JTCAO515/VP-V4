import test from 'node:test';
import assert from 'node:assert/strict';
import {executeScopedTripEdit} from '../../../lib/server/turn/scoped-edit/executor.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now=Date.parse('2026-10-05T04:00:00.000Z');
const context={kind:'scoped_edit_context/1',contextId:id(5),contextDigest:'a'.repeat(64),tripId:id(6),baseVersion:3,
 scope:{dayIds:[],itemIds:['editable']},snapshot:{version:3,title:'Current Trip',days:[{id:'day1',date:'2026-10-06',items:[{id:'editable',dayId:'day1',title:'A'},{id:'locked',dayId:'day1',title:'B'},{id:'untouched',dayId:'day1',title:'C'}]},{id:'day2',date:'2026-10-07',items:[]}]},
 orderedItemIdsByDay:[{dayId:'day1',itemIds:['editable','locked','untouched']},{dayId:'day2',itemIds:[]}],lockedItemIds:['locked'],fixedItemIds:[],
 sourceBasis:{profileUpdatedAt:null,memoryBasisDigest:'b'.repeat(64),reservationBasisDigest:'c'.repeat(64),sourceDigest:'d'.repeat(64),lockRevision:0,fixedBindings:[]},expiresAt:'2026-10-05T04:05:00.000Z'};
const binding={ownerId:id(1),taskId:id(2),turnId:id(3),leaseToken:id(4),operationId:id(7),contextId:id(5),contextDigest:'a'.repeat(64),sourceDigest:'d'.repeat(64),tripId:id(6),baseVersion:3,policyId:id(8),scopeId:id(9),attemptId:id(10),provider:'qwen',model:PROTOCOL_MODELS.qwen,priceVersion:'reviewed-1'};
const raw={kind:'scoped_edit_input/1',binding,context,text:'请把A移到第二天',locale:'zh',profile:null,memory:[],endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',reservedMicros:1000,timeoutMs:1000,maxOutputTokens:1024};
const lease={ownerId:id(1),turnId:id(3),leaseToken:id(4),attempt:1,leaseMs:30000};
const candidate={kind:'candidate',edits:[{kind:'move_item',itemId:'editable',toDayId:'day2'}]};
const usage={inputTokens:100,outputTokens:40,totalTokens:140,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'};

for(const code of ['OPS_CONTROL_DISABLED','OPS_SCOPE_UNAVAILABLE'])test(`settled scoped output publish ${code} pauses original operation without provider or new completion`,async()=>{
 const log=[];let providerCalls=0;
 const reason=code==='OPS_CONTROL_DISABLED'?'ops_control_disabled':'ops_scope_unavailable';
 const receipt={kind:'scoped_edit_pending/1',operationId:binding.operationId,tripId:binding.tripId,contextId:binding.contextId,contextDigest:binding.contextDigest,baseVersion:binding.baseVersion,reason,reused:false};
 const ports={now:()=>now,price:()=>120,recordUsage:async()=>assert.fail('already settled'),transport:async()=>{providerCalls++;assert.fail('must not replay provider');},rpc:async(name,params)=>{
  log.push(name);
  if(name==='read_scoped_trip_edit_work_v1')return raw;
  if(name==='read_scoped_trip_edit_output_v1')return {kind:'saved_output',binding,output:candidate,usage,actualMicros:120,accounting:'settled'};
  if(name==='authorize_scoped_trip_edit_effect_v1'){assert.equal(params.p_effect,'publish');return {kind:'blocked',code};}
  if(name==='pause_scoped_trip_edit_work_v1'){assert.deepEqual(params,{p_binding:binding,p_reason:reason});return {kind:'ops_paused',binding,receipt};}
  assert.fail(`Unexpected RPC ${name}`);
 }};
 assert.equal(await executeScopedTripEdit(lease,ports,new AbortController().signal),'ops_paused');
 assert.equal(providerCalls,0);assert.equal(log.filter(x=>x==='pause_scoped_trip_edit_work_v1').length,1);assert.equal(log.includes('complete_scoped_trip_edit_work_v1'),false);
});
