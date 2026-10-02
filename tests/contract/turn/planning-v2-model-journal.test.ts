import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanningV2ModelJournalRead as read, parsePlanningV2ModelJournalWrite as write } from "../../../lib/server/turn/planning-v2-model-journal.ts";
import { createPlanningV2ModelOutputReceipt as createOutput } from "../../../lib/server/turn/planning-v2-model-output-receipt.ts";
import { PROTOCOL_MODELS } from "../../../lib/server/model-gateway/adapters/provider-protocol.ts";
const id=(n:number)=>`00000000-0000-0000-0000-${n.toString().padStart(12,"0")}`;
function fixture(phase:"intent_saved"|"send_ack_recorded"|"response_recorded"="intent_saved"){
 const binding={owner:id(1),task:id(2),turn:id(3),lease:id(4),textPolicy:id(5),planningPolicy:id(6),scope:id(7),attempt:id(8),provider:"qwen" as const,model:PROTOCOL_MODELS.qwen,priceVersion:"synthetic-v1",intakeDigest:"a".repeat(64),planningDigest:"b".repeat(64)};
 const expected={binding,requestId:id(9),requestDigest:"c".repeat(64),payloadDigest:"d".repeat(64),outputDigest:null as string|null,usageDigest:null as string|null};
 const observedAt="2026-10-03T00:00:00.001Z",usageReceipt={schemaVersion:"validated-planning-usage/1",attempt:{scopeId:binding.scope,ownerId:binding.owner,taskId:binding.task,attemptId:binding.attempt,provider:"qwen",model:binding.model,priceVersion:binding.priceVersion,reservedMicros:10,timeoutMs:1000},turnId:binding.turn,policyId:binding.planningPolicy,usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:"unknown"},actualMicros:0,observedAt};
 const output=createOutput({schemaVersion:"planning-v2-model-output/1",binding,usageReceipt,output:{highlight:"none"},observedAt},binding);assert.ok(output);
 const observation=(kind:"send_ack"|"response_received")=>({schemaVersion:"planning-v2-local-observation/1",source:"local_observation",kind,requestId:expected.requestId,requestDigest:expected.requestDigest,observedAt});
 const ack=phase!=="intent_saved",response=phase==="response_recorded";
 const raw={kind:"model_request_journal",schemaVersion:"planning-v2-model-journal/1",binding,requestId:expected.requestId,requestDigest:expected.requestDigest,payloadDigest:expected.payloadDigest,phase,revision:response?3:ack?2:1,intentRecordedAt:observedAt,sendAckRecordedAt:ack?observedAt:null,responseRecordedAt:response?observedAt:null,unknownAt:null as string|null,sendAckObservation:ack?observation("send_ack"):null,responseObservation:response?observation("response_received"):null,outputWire:response?output:null,providerOriginVerified:false,executionAvailable:false,readyForPublication:false,reconciliationRequired:true};
 return {raw,expected,output,observedAt};
}
test("closed read19/write20 phase records retain local-only flags/nulls and exact output digest readback",()=>{
 for(const phase of ["intent_saved","send_ack_recorded","response_recorded"] as const){const {raw,expected,output}=fixture(phase),r=read(raw,expected);assert.ok(r&&r.kind==="model_request_journal");assert.equal(Object.keys(r).length,19);assert.equal(r.providerOriginVerified,false);assert.equal(r.reconciliationRequired,true);
  const w=write({...raw,reused:true},expected);assert.ok(w&&w.kind==="model_request_journal");assert.equal(Object.keys(w).length,20);assert.equal(w.reused,true);
  const exact={...expected,outputDigest:output.outputDigest,usageDigest:output.usageDigest};assert.equal(read(raw,exact)!==null,phase==="response_recorded");
  assert.ok(read({...raw,revision:raw.revision+1,unknownAt:raw.intentRecordedAt},expected));
 }
 for(const kind of ["blocked","conflict"]){assert.deepEqual(read({kind},fixture().expected),{kind});assert.deepEqual(write({kind},fixture().expected),{kind});}
});
test("unknown keys/coercions/flags/old request or lease/malformed server times cannot become eligible data",()=>{
 const {raw,expected,observedAt}=fixture();
 for(const bad of [{...raw,extra:true},{...raw,reused:false},{...raw,providerOriginVerified:true},{...raw,reconciliationRequired:false},{...raw,executionAvailable:true},{...raw,readyForPublication:[false]},{...raw,phase:["intent_saved"]},{...raw,revision:0},{...raw,revision:Number.MAX_SAFE_INTEGER+1},{...raw,sendAckRecordedAt:observedAt},{...raw,intentRecordedAt:"2026-10-03T00:00:00.123456Z"},{...raw,intentRecordedAt:"2026-10-03T00:00:00.001+00:00"},{...raw,intentRecordedAt:"2026-02-30T00:00:00.001Z"},{kind:"blocked",requestId:id(9)}])assert.equal(read(bad,expected),null);
 for(const k of Object.keys(expected.binding))assert.equal(read({...raw,binding:{...raw.binding,[k]:k.endsWith("Digest")?"f".repeat(64):"other"}},expected),null,k);
 for(const k of ["requestId","requestDigest","payloadDigest"])assert.equal(read({...raw,[k]:k==="requestId"?id(99):"e".repeat(64)},expected),null);
 assert.equal(write(raw,expected),null);assert.equal(write({...raw,reused:[true]},expected),null);assert.equal(read(raw,{...expected,outputDigest:"a".repeat(64)}),null);
});
test("local observation and output wire remain closed/currently correlated and detached without origin promotion",()=>{
 const {raw,expected}=fixture("response_recorded");assert.ok(raw.sendAckObservation&&raw.responseObservation&&raw.outputWire);
 for(const bad of [{...raw,sendAckObservation:null},{...raw,responseRecordedAt:null},{...raw,responseObservation:{...raw.responseObservation,source:"provider"}},{...raw,responseObservation:{...raw.responseObservation,requestId:id(99)}},{...raw,responseObservation:{...raw.responseObservation,kind:["response_received"]}},{...raw,responseObservation:{...raw.responseObservation,extra:true}},{...raw,outputWire:{...raw.outputWire,output:{highlight:"jingan"}}},{...raw,outputWire:{...raw.outputWire,binding:{...raw.binding,attempt:id(99)}}},{...raw,outputWire:{...raw.outputWire,executionAvailable:true}}])assert.equal(read(bad,expected),null);
 const captured=read(raw,expected);assert.ok(captured&&captured.kind==="model_request_journal");raw.responseObservation.observedAt="changed";raw.binding.lease=id(99);assert.equal(captured.responseObservation?.observedAt,"2026-10-03T00:00:00.001Z");assert.equal(captured.binding.lease,id(4));assert.ok(Object.isFrozen(captured));assert.ok(Object.isFrozen(captured.outputWire));
});
