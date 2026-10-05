import test from 'node:test';
import assert from 'node:assert/strict';
import { executeScopedTripEdit, type ScopedExecutorPorts } from '../../../lib/server/turn/scoped-edit/executor.ts';
import { parseScopedModelOutput, SCOPED_TRIP_EDIT_PROMPT } from '../../../lib/server/turn/scoped-edit/model-output.ts';
import { candidatePatch, parseInput, promptInput, type ScopedInput } from '../../../lib/server/turn/scoped-edit/protocol.ts';
import { PROTOCOL_MODELS } from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now=Date.parse('2026-10-05T04:00:00.000Z');
const context={kind:'scoped_edit_context/1',contextId:id(5),contextDigest:'a'.repeat(64),tripId:id(6),baseVersion:3,
 scope:{dayIds:[],itemIds:['editable']},snapshot:{version:3,title:'Current Trip',days:[{id:'day1',date:'2026-10-06',items:[{id:'editable',dayId:'day1',title:'A'},{id:'locked',dayId:'day1',title:'B'},{id:'untouched',dayId:'day1',title:'C'}]},{id:'day2',date:'2026-10-07',items:[]}]},
 orderedItemIdsByDay:[{dayId:'day1',itemIds:['editable','locked','untouched']},{dayId:'day2',itemIds:[]}],lockedItemIds:['locked'],fixedItemIds:[],
 sourceBasis:{profileUpdatedAt:null,memoryBasisDigest:'b'.repeat(64),reservationBasisDigest:'c'.repeat(64),sourceDigest:'d'.repeat(64),lockRevision:0,fixedBindings:[]},expiresAt:'2026-10-05T04:05:00.000Z'};
const binding={ownerId:id(1),taskId:id(2),turnId:id(3),leaseToken:id(4),operationId:id(7),contextId:id(5),contextDigest:'a'.repeat(64),sourceDigest:'d'.repeat(64),tripId:id(6),baseVersion:3,policyId:id(8),scopeId:id(9),attemptId:id(10),provider:'qwen',model:PROTOCOL_MODELS.qwen,priceVersion:'reviewed-1'};
const raw={kind:'scoped_edit_input/1',binding,context,text:'请把A移到第二天',locale:'zh',profile:null,memory:[],endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',reservedMicros:1000,timeoutMs:1000,maxOutputTokens:1024};
const lease={ownerId:id(1),turnId:id(3),leaseToken:id(4),attempt:1,leaseMs:30000};
const candidate={kind:'candidate',edits:[{kind:'move_item',itemId:'editable',toDayId:'day2'}]} as const;
const usage={inputTokens:100,outputTokens:40,totalTokens:140,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'};
function fixture(options:Record<string,unknown>={}) {
 let calls=0, dispatches=0, saved:unknown=null, settled=false, committed=false;
 const log:string[]=[];
 const input=JSON.parse(JSON.stringify(raw));
 const output=options.output??candidate;
 const ports:ScopedExecutorPorts={now:()=>now,price:()=>options.unknownPrice?null:120,recordUsage:async()=>{log.push('usage');if(options.usageAckLost)throw Error('lost');},
 transport:async req=>{calls++;log.push('provider');const body=JSON.parse(req.body);assert.equal(body.messages[0].content,SCOPED_TRIP_EDIT_PROMPT);assert.equal(body.response_format.type,'json_object');assert.equal(body.stream,false);if(options.cancel)req.signal.dispatchEvent(new Event('abort'));if(options.timeout)return new Promise(()=>{});return Response.json({model:PROTOCOL_MODELS.qwen,usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140},choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]});},
 rpc:async(name,p)=>{
  log.push(name);
  if(name==='read_scoped_trip_edit_work_v1')return options.missingQualification?{kind:'pending'}:input;
  if(name==='authorize_scoped_trip_edit_effect_v1')return options.deny===p.p_effect?{kind:'pending'}:{kind:'authorized',effect:p.p_effect,binding:p.p_binding};
  if(name==='read_scoped_trip_edit_output_v1')return options.existingUnknown?{kind:'pending'}:saved??{kind:'missing'};
  if(name==='scoped_trip_edit_budget_v1'){
   if(p.p_effect==='reserve')return {kind:'reserved'};
   if(p.p_effect==='dispatch'){if(dispatches++||options.alreadyDispatched)return {kind:'duplicate'};return {kind:'dispatched'};}
   if(p.p_outcome==='settle'){settled=true;if(saved)(saved as Record<string,unknown>).accounting='settled';return {kind:'settled',overrun:false};}
   return {kind:'pending'};
  }
  if(name==='record_scoped_trip_edit_output_v1'){
   saved={kind:'saved_output',binding:p.p_binding,output:p.p_output,usage:p.p_usage,actualMicros:p.p_actual_micros,accounting:'pending'};
   if(options.staleAfterSave)input.context.sourceBasis.lockRevision++;
   if(options.outputAckLost)throw Error('lost');return saved;
  }
  if(name==='complete_scoped_trip_edit_work_v1'){assert.ok(settled);committed=true;if(options.completeAckLost)throw Error('lost');return completion();}
  if(name==='read_scoped_trip_edit_completion_v1')return committed?completion():{kind:'pending'};
  throw Error('unexpected '+name);
 },};
 function completion(){return {kind:'completed',binding,receipt:{kind:'scoped_edit_proposal/1',operationId:id(7),tripId:id(6),contextId:id(5),contextDigest:'a'.repeat(64),proposalId:id(11),proposalRevision:1,proposalDigest:'trip-v2:'+'e'.repeat(64),baseVersion:3,expiresAt:'2026-10-05T04:05:00.000Z',returnScope:context.scope,diff:{changes:[],preservedItemIds:['locked','untouched'],transferImpact:'pending',walkingImprovement:'unverified',externalOrderEffect:'none'},reused:false}};}
 return {ports,log,run:()=>executeScopedTripEdit(lease,ports,new AbortController().signal),get calls(){return calls;},get committed(){return committed;}};
}
test('closed output refuses extra fields, source or identity claims, unsupported operations and >16 edits',()=>{
 assert.ok(parseScopedModelOutput(candidate));
 for(const x of [{...candidate,source:'verified'},{...candidate,ownerId:id(1)},{kind:'candidate',edits:[{kind:'set_title',title:'Other'}]},{kind:'candidate',edits:Array(17).fill(candidate.edits[0])},{kind:'candidate',edits:[]},{kind:'cannot_edit',reason:'walking_improved'}])assert.equal(parseScopedModelOutput(x),null);
});
test('SQL current context must match exact owner lease version scope source and TTL',()=>{
 assert.ok(parseInput(raw,lease,now));
 for(const mutate of [(x:typeof raw)=>{x.binding.ownerId=id(22);},(x:typeof raw)=>{x.binding.sourceDigest='f'.repeat(64);},(x:typeof raw)=>{x.context.expiresAt='2026-10-05T03:59:00.000Z';},(x:typeof raw)=>{x.binding.baseVersion=4;}]){const v=structuredClone(raw);mutate(v);assert.equal(parseInput(v,lease,now),null);}
});
test('prompt carries explicit Ask and current data without authority tuple',()=>{const input=parseInput(raw,lease,now)!;const prompt=promptInput(input);assert.ok(prompt.includes(raw.text));assert.equal(prompt.includes(binding.ownerId),false);assert.equal(prompt.includes(binding.attemptId),false);});
test('local candidate preserves unselected and locked items; rejects their edits',()=>{
 const input=parseInput(raw,lease,now)!;
 assert.equal(candidatePatch(input,candidate.edits).expectedVersion,3);
 for(const itemId of ['locked','untouched','missing'])assert.throws(()=>candidatePatch(input,[{kind:'set_time',itemId,startsAt:'2026-10-06T12:00:00+08:00',endsAt:null}]));
});
test('one real protocol JSON round settles usage before original proposal publication',async()=>{const f=fixture();assert.equal(await f.run(),'persisted');assert.equal(f.calls,1);assert.equal(f.committed,true);assert.ok(f.log.indexOf('usage')<f.log.indexOf('complete_scoped_trip_edit_work_v1'));});
for(const deny of ['reserve','dispatch'])test(`missing ${deny} authority blocks provider dispatch`,async()=>{const f=fixture({deny});assert.equal(await f.run(),'pending');assert.equal(f.calls,0);assert.equal(f.committed,false);});
for(const option of ['missingQualification','existingUnknown','alreadyDispatched'])test(`${option} never replays provider`,async()=>{const f=fixture({[option]:true});assert.equal(await f.run(),'pending');assert.equal(f.calls,0);});
test('output save ACK loss reads same attempt; completion ACK loss reads same proposal',async()=>{const f=fixture({outputAckLost:true,completeAckLost:true});assert.equal(await f.run(),'persisted');assert.equal(f.calls,1);assert.equal(f.log.filter(x=>x==='complete_scoped_trip_edit_work_v1').length,1);});
for(const option of ['unknownPrice','usageAckLost','staleAfterSave'])test(`${option} does not falsely publish success`,async()=>{const f=fixture({[option]:true});assert.equal(await f.run(),'pending');assert.equal(f.calls,1);assert.equal(f.committed,false);});
test('invalid model fields preserve unknown accounting and cannot reach proposal',async()=>{const f=fixture({output:{...candidate,feasibility:'verified'}});assert.equal(await f.run(),'pending');assert.equal(f.committed,false);});
test('provider timeout has no automatic second call or completion',async()=>{const f=fixture({timeout:true});assert.equal(await f.run(),'pending');assert.equal(f.calls,1);assert.equal(f.committed,false);});
test('caller cancellation before execution touches no RPC or provider',async()=>{const f=fixture();const c=new AbortController();c.abort();assert.equal(await executeScopedTripEdit(lease,f.ports,c.signal),'unavailable');assert.equal(f.log.length,0);});
