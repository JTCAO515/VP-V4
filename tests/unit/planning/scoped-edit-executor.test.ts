import test from 'node:test';
import assert from 'node:assert/strict';
import { executeScopedTripEdit, type ScopedExecutorPorts } from '../../../lib/server/turn/scoped-edit/executor.ts';
import { parseScopedModelOutput, SCOPED_TRIP_EDIT_PROMPT } from '../../../lib/server/turn/scoped-edit/model-output.ts';
import { candidatePatch, parseInput, promptInput, scopedRequestIdentity, type ScopedInput } from '../../../lib/server/turn/scoped-edit/protocol.ts';
import { scopedEditDiff } from '../../../lib/server/trip/scoped-edit/diff.ts';
import { previewScopedPatch } from '../../../lib/server/trip/scoped-edit/candidate-guard.ts';
import type { CandidateEdit } from '../../../lib/server/trip/scoped-edit/contract.ts';
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
 let calls=0, dispatches=0, saved:unknown=options.pendingOutputRecovery?{kind:'saved_output',binding,output:candidate,usage,actualMicros:120,accounting:'pending'}:null, settled=false, committed=false;
 const log:string[]=[];let savedUsage:unknown=null,savedOutcome:unknown=null,storedDecline:unknown=null;
 const input=JSON.parse(JSON.stringify(raw));
 const output=options.output??candidate;
 const ports:ScopedExecutorPorts={now:()=>now,price:()=>options.unknownPrice?null:options.knownZero?0:120,recordUsage:async()=>{log.push('usage');if(options.usageAckLost)throw Error('lost');},
 transport:async req=>{calls++;log.push('provider');const body=JSON.parse(req.body);assert.equal(body.messages[0].content,SCOPED_TRIP_EDIT_PROMPT);assert.equal(body.response_format.type,'json_object');assert.equal(body.stream,false);if(typeof options.afterProvider==='function')options.afterProvider();if(options.timeout)return new Promise(()=>{});return Response.json({model:options.wrongModel?'unapproved-model':PROTOCOL_MODELS.qwen,usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140},choices:[{index:0,finish_reason:options.safetyBlocked?'content_filter':'stop',message:{role:'assistant',content:JSON.stringify(output)}}]});},
 rpc:async(name,p)=>{
  log.push(name);
  if(name==='read_scoped_trip_edit_work_v1')return options.missingQualification?{kind:'pending'}:input;
  if(name==='authorize_scoped_trip_edit_effect_v1')return options.deny===p.p_effect?{kind:'pending'}:{kind:'authorized',effect:p.p_effect,binding:p.p_binding};
  if(name==='read_scoped_trip_edit_output_v1')return options.existingUnknown?{kind:'pending'}:saved??{kind:dispatches>0?'pending':'missing'};
  if(name==='record_scoped_trip_edit_usage_v1'){savedOutcome=p.p_outcome;savedUsage={kind:'saved_usage',binding:p.p_binding,usage:p.p_usage,actualMicros:p.p_actual_micros,outcome:p.p_outcome};if(options.metadataAckLost)throw Error('lost metadata ACK');return {kind:'usage_saved'};}
  if(name==='pause_scoped_trip_edit_work_v1'){
    const model=output as {kind:string;reason?:string};
    if(!settled||p.p_reason==='safety_refused'&&savedOutcome!=='safety_blocked'||p.p_reason!=='safety_refused'&&(model.kind!=='cannot_edit'||model.reason!==p.p_reason))return {kind:'pending'};
    storedDecline={kind:'declined',binding,receipt:{kind:'scoped_edit_declined/1',operationId:options.wrongDeclineAck?id(99):binding.operationId,tripId:binding.tripId,contextId:binding.contextId,contextDigest:binding.contextDigest,baseVersion:binding.baseVersion,reason:p.p_reason,reused:false}};
    if(options.declineAckLost)throw Error('lost decline ACK');return storedDecline;
  }
  if(name==='read_scoped_trip_edit_usage_v1')return savedUsage??{kind:'missing'};
  if(name==='scoped_trip_edit_budget_v1'){
   if(p.p_effect==='reserve')return {kind:'reserved'};
   if(p.p_effect==='dispatch'){if(dispatches++||options.alreadyDispatched)return {kind:'duplicate'};return {kind:'dispatched'};}
   if(p.p_outcome==='settle'){settled=true;if(saved)(saved as Record<string,unknown>).accounting='settled';if(options.settleAckLost)throw Error('lost accounting ACK');return {kind:'settled',overrun:false};}
   return {kind:'pending'};
  }
  if(name==='record_scoped_trip_edit_output_v1'){
   saved={kind:'saved_output',binding:p.p_binding,output:p.p_output,usage:p.p_usage,actualMicros:p.p_actual_micros,accounting:'pending'};
   if(options.staleAfterSave)input.context.sourceBasis.lockRevision++;
   if(options.outputAckLost)throw Error('lost');return saved;
  }
  if(name==='complete_scoped_trip_edit_work_v1'){assert.ok(settled);committed=true;if(options.completeAckLost)throw Error('lost');return completion();}
  if(name==='read_scoped_trip_edit_completion_v1')return storedDecline??(committed?completion():{kind:'pending'});
  throw Error('unexpected '+name);
 },};
 function completion(){const input=parseInput(raw,lease,now)!,patch=candidatePatch(input,(output as {edits:CandidateEdit[]}).edits),after=previewScopedPatch(input.context.snapshot,patch,{scope:context.scope,lockedItemIds:context.lockedItemIds,fixedItemIds:context.fixedItemIds});return {kind:'candidate_saved',binding,receipt:{kind:'scoped_edit_candidates/1',operationId:id(7),tripId:id(6),contextId:id(5),contextDigest:'a'.repeat(64),baseVersion:3,expiresAt:'2026-10-05T04:05:00.000Z',returnScope:context.scope,candidates:[{candidateId:id(10),edits:(output as {edits:CandidateEdit[]}).edits,diff:scopedEditDiff(input.context.snapshot,after)}],reused:false}};}

 return {ports,log,run:(signal=new AbortController().signal)=>executeScopedTripEdit(lease,ports,signal),get calls(){return calls;},get committed(){return committed;},get settled(){return settled;}};
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
test('one synthetic protocol JSON round settles usage before settled typed candidate publication',async()=>{const f=fixture();assert.equal(await f.run(),'persisted');assert.equal(f.calls,1);assert.equal(f.committed,true);assert.ok(f.log.indexOf('usage')<f.log.indexOf('complete_scoped_trip_edit_work_v1'));});
for(const deny of ['reserve','dispatch'])test(`missing ${deny} authority blocks provider dispatch`,async()=>{const f=fixture({deny});assert.equal(await f.run(),'pending');assert.equal(f.calls,0);assert.equal(f.committed,false);});
for(const option of ['missingQualification','existingUnknown','alreadyDispatched'])test(`${option} never replays provider`,async()=>{const f=fixture({[option]:true});assert.equal(await f.run(),'pending');assert.equal(f.calls,0);});
test('output save ACK loss reads same attempt; completion ACK loss reads same candidate',async()=>{const f=fixture({outputAckLost:true,completeAckLost:true});assert.equal(await f.run(),'persisted');assert.equal(f.calls,1);assert.equal(f.log.filter(x=>x==='complete_scoped_trip_edit_work_v1').length,1);});
for(const option of ['unknownPrice','usageAckLost','staleAfterSave'])test(`${option} does not falsely publish success`,async()=>{const f=fixture({[option]:true});assert.equal(await f.run(),'pending');assert.equal(f.calls,1);assert.equal(f.committed,false);});
test('invalid model fields preserve unknown accounting and cannot reach candidate',async()=>{const f=fixture({output:{...candidate,feasibility:'verified'}});assert.equal(await f.run(),'pending');assert.equal(f.committed,false);});
test('provider timeout has no automatic second call or completion',async()=>{const f=fixture({timeout:true});assert.equal(await f.run(),'pending');assert.equal(f.calls,1);assert.equal(f.committed,false);});
test('caller cancellation before execution touches no RPC or provider',async()=>{const f=fixture();const c=new AbortController();c.abort();assert.equal(await executeScopedTripEdit(lease,f.ports,c.signal),'unavailable');assert.equal(f.log.length,0);});

test('same original operation recovery never triggers another provider call',async()=>{const f=fixture({completeAckLost:true});assert.equal(await f.run(),'persisted');assert.equal(await f.run(),'persisted');assert.equal(f.calls,1);});
test('cancellation during provider output fences candidate publication',async()=>{const controller=new AbortController(),f=fixture({afterProvider:()=>controller.abort()});assert.equal(await f.run(controller.signal),'pending');assert.equal(f.calls,1);assert.equal(f.committed,false);});
test('closed existing-source candidate edits reject invented title, id and source fields',()=>{
 for(const edit of [{kind:'remove_item',itemId:'editable'},{kind:'replace_item',itemId:'editable',sourceItemId:'untouched'},{kind:'add_item',sourceItemId:'untouched',toDayId:'day1'}])assert.ok(parseScopedModelOutput({kind:'candidate',edits:[edit]}));
 for(const edit of [{kind:'add_item',sourceItemId:'untouched',toDayId:'day1',title:'fake place'},{kind:'replace_item',itemId:'editable',sourceItemId:'untouched',source:'verified'},{kind:'add_item',itemId:'invented',toDayId:'day1'}])assert.equal(parseScopedModelOutput({kind:'candidate',edits:[edit]}),null);
});
test('remove and replace use current selected source; add needs explicit selected day',()=>{
 const input=parseInput(raw,lease,now)!;
 assert.ok(candidatePatch(input,[{kind:'remove_item',itemId:'editable'}]));
 assert.ok(candidatePatch(input,[{kind:'replace_item',itemId:'editable',sourceItemId:'untouched'}]));
 assert.throws(()=>candidatePatch(input,[{kind:'replace_item',itemId:'editable',sourceItemId:'unknown'}]));
 assert.throws(()=>candidatePatch(input,[{kind:'add_item',sourceItemId:'untouched',toDayId:'day1'}]));
 const dayScope=structuredClone(input) as unknown as ScopedInput;
 const selected={...dayScope,context:{...dayScope.context,scope:{dayIds:['day1'],itemIds:[]}}};
 const patch=candidatePatch(selected,[{kind:'add_item',sourceItemId:'untouched',toDayId:'day1'}]);
 assert.match((patch.operations[0] as {itemId:string}).itemId,/^edit-[a-f0-9]{32}$/);
 assert.deepEqual(candidatePatch(selected,[{kind:'add_item',sourceItemId:'untouched',toDayId:'day1'}]),patch);
});

test('wrong-model usage remains unknown rather than being assigned a tariff',async()=>{const f=fixture({wrongModel:true});assert.equal(await f.run(),'pending');assert.equal(f.calls,1);assert.equal(f.log.includes('usage'),false);assert.equal(f.committed,false);});
test('a verified zero tariff is distinct from unknown cost',async()=>{const f=fixture({knownZero:true});assert.equal(await f.run(),'persisted');assert.equal(f.calls,1);assert.equal(f.log.includes('usage'),true);});

test('already saved known output reconciles the original pending budget without provider dispatch',async()=>{const f=fixture({pendingOutputRecovery:true});assert.equal(await f.run(),'persisted');assert.equal(f.calls,0);assert.equal(f.log.includes('usage'),true);assert.equal(f.log.includes('record_scoped_trip_edit_output_v1'),false);});
test('lost settlement ACK reads settled accounting on the original attempt without another call',async()=>{const f=fixture({settleAckLost:true});assert.equal(await f.run(),'pending');assert.equal(f.calls,1);assert.equal(await f.run(),'persisted');assert.equal(f.calls,1);});

test('canonical request identity ignores binding property order and lease renewal',()=>{
 const input=parseInput(raw,lease,now)!,first=scopedRequestIdentity(input);
 const reversed={...input,binding:Object.fromEntries(Object.entries(input.binding).reverse()) as typeof input.binding};
 assert.deepEqual(scopedRequestIdentity(reversed),first);
 assert.deepEqual(scopedRequestIdentity({...input,binding:{...input.binding,leaseToken:id(30)}}),first);
 assert.notEqual(scopedRequestIdentity({...input,binding:{...input.binding,attemptId:id(31)}}).requestDigest,first.requestDigest);
});

test('validated safety-blocked usage settles cost without publishing unavailable content',async()=>{const f=fixture({safetyBlocked:true});assert.equal(await f.run(),'declined');assert.equal(f.calls,1);assert.equal(f.settled,true);assert.equal(f.committed,false);assert.equal(f.log.includes('record_scoped_trip_edit_usage_v1'),true);});
test('lost usage metadata ACK reads the original receipt before cost settlement',async()=>{const f=fixture({metadataAckLost:true});assert.equal(await f.run(),'persisted');assert.equal(f.calls,1);assert.equal(f.settled,true);});

for(const reason of ['unsupported_request','no_change'])test(`settled ${reason} is a durable decline, distinct from pending or user cancellation`,async()=>{const f=fixture({output:{kind:'cannot_edit',reason}});assert.equal(await f.run(),'declined');assert.equal(f.calls,1);assert.equal(f.settled,true);assert.equal(f.committed,false);});
test('lost decline ACK reads the same operation without another provider call',async()=>{const f=fixture({safetyBlocked:true,declineAckLost:true});assert.equal(await f.run(),'declined');assert.equal(f.calls,1);});
test('wrong operation in decline ACK cannot claim completion',async()=>{const f=fixture({output:{kind:'cannot_edit',reason:'no_change'},wrongDeclineAck:true});assert.equal(await f.run(),'pending');assert.equal(f.calls,1);});

test('lost safety-blocked settlement ACK reconciles and declines the original operation without another call',async()=>{const f=fixture({safetyBlocked:true,settleAckLost:true});assert.equal(await f.run(),'pending');assert.equal(await f.run(),'declined');assert.equal(f.calls,1);assert.equal(f.committed,false);});
