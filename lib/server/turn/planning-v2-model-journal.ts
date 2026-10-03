import { PROTOCOL_MODELS } from "../model-gateway/adapters/provider-protocol.ts";
import { parsePlanningV2ModelOutputReceipt, type PlanningV2ModelOutputReceipt } from "./planning-v2-model-output-receipt.ts";
import type { PlanningV2ModelRequestBinding } from "./planning-v2-model-request.ts";
export type PlanningV2JournalExpected = Readonly<{
  binding: PlanningV2ModelRequestBinding; requestId: string; requestDigest: string; payloadDigest: string;
  outputDigest: string | null; usageDigest: string | null;
}>;
type LocalObservation = Readonly<{schemaVersion:"planning-v2-local-observation/1";source:"local_observation";kind:"send_ack"|"response_received";requestId:string;requestDigest:string;observedAt:string}>;
export type PlanningV2ModelJournal = Readonly<{
  kind:"model_request_journal";schemaVersion:"planning-v2-model-journal/1";binding:PlanningV2ModelRequestBinding;
  requestId:string;requestDigest:string;payloadDigest:string;phase:"intent_saved"|"send_ack_recorded"|"response_recorded";
  revision:number;intentRecordedAt:string;sendAckRecordedAt:string|null;responseRecordedAt:string|null;unknownAt:string|null;
  sendAckObservation:LocalObservation|null;responseObservation:LocalObservation|null;outputWire:PlanningV2ModelOutputReceipt|null;
  providerOriginVerified:false;executionAvailable:false;readyForPublication:false;reconciliationRequired:true;
}>;
type Failure=Readonly<{kind:"blocked"|"conflict"}>;
const tupleKeys=["owner","task","turn","lease","textPolicy","planningPolicy","scope","attempt","provider","model","priceVersion","intakeDigest","planningDigest"] as const;
const readKeys=["kind","schemaVersion","binding","requestId","requestDigest","payloadDigest","phase","revision","intentRecordedAt","sendAckRecordedAt","responseRecordedAt","unknownAt","sendAckObservation","responseObservation","outputWire","providerOriginVerified","executionAvailable","readyForPublication","reconciliationRequired"];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,names:readonly string[])=>Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
function binding(v:unknown):v is PlanningV2ModelRequestBinding{
 return record(v)&&keys(v,tupleKeys)&&tupleKeys.every(k=>typeof v[k]==="string")&&tupleKeys.slice(0,8).every(k=>UUID.test(v[k] as string))
  &&v.provider==="qwen"&&v.model===PROTOCOL_MODELS.qwen&&/^[A-Za-z0-9._-]{1,100}$/.test(v.priceVersion as string)
  &&SHA.test(v.intakeDigest as string)&&SHA.test(v.planningDigest as string)&&v.task!==v.turn&&v.intakeDigest!==v.planningDigest;
}
function timestamp(v:unknown):v is string{return typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;}
function expected(v:unknown):v is PlanningV2JournalExpected{
 return record(v)&&keys(v,["binding","requestId","requestDigest","payloadDigest","outputDigest","usageDigest"])&&binding(v.binding)
  &&typeof v.requestId==="string"&&UUID.test(v.requestId)&&typeof v.requestDigest==="string"&&SHA.test(v.requestDigest)
  &&typeof v.payloadDigest==="string"&&SHA.test(v.payloadDigest)&&((v.outputDigest===null&&v.usageDigest===null)
   ||(typeof v.outputDigest==="string"&&SHA.test(v.outputDigest)&&typeof v.usageDigest==="string"&&SHA.test(v.usageDigest)));
}
function observation(v:unknown,kind:LocalObservation["kind"],e:PlanningV2JournalExpected):LocalObservation|null{
 if(!record(v)||!keys(v,["schemaVersion","source","kind","requestId","requestDigest","observedAt"])
  ||v.schemaVersion!=="planning-v2-local-observation/1"||v.source!=="local_observation"||v.kind!==kind
  ||v.requestId!==e.requestId||v.requestDigest!==e.requestDigest||!timestamp(v.observedAt))return null;
 return Object.freeze({schemaVersion:"planning-v2-local-observation/1",source:"local_observation",kind,requestId:e.requestId,requestDigest:e.requestDigest,observedAt:v.observedAt});
}
/** Local record data only. No transport, fallback, send or provider-origin inference. */
function parse(raw:unknown,captured:unknown,write:boolean):PlanningV2ModelJournal|Readonly<PlanningV2ModelJournal&{reused:boolean}>|Failure|null{
 if(!expected(captured)||!record(raw))return null;const e=captured;
 if(keys(raw,["kind"])&&(raw.kind==="blocked"||raw.kind==="conflict"))return Object.freeze({kind:raw.kind});
 if(!keys(raw,write?[...readKeys,"reused"]:readKeys)||raw.kind!=="model_request_journal"||raw.schemaVersion!=="planning-v2-model-journal/1"
  ||!binding(raw.binding)||raw.requestId!==e.requestId||raw.requestDigest!==e.requestDigest||raw.payloadDigest!==e.payloadDigest
  ||raw.providerOriginVerified!==false||raw.executionAvailable!==false||raw.readyForPublication!==false||raw.reconciliationRequired!==true
  ||(write&&typeof raw.reused!=="boolean")||!timestamp(raw.intentRecordedAt)||(raw.unknownAt!==null&&!timestamp(raw.unknownAt)))return null;
 const b=raw.binding;if(!tupleKeys.every(k=>b[k]===e.binding[k]))return null;
 if(raw.phase!=="intent_saved"&&raw.phase!=="send_ack_recorded"&&raw.phase!=="response_recorded")return null;
 const minimum=raw.phase==="intent_saved"?1:raw.phase==="send_ack_recorded"?2:3;
 if(typeof raw.revision!=="number"||!Number.isSafeInteger(raw.revision)||raw.revision<minimum+(raw.unknownAt===null?0:1))return null;
 let ack:LocalObservation|null=null,response:LocalObservation|null=null,output:PlanningV2ModelOutputReceipt|null=null;
 if(raw.phase==="intent_saved"){
  if(raw.sendAckRecordedAt!==null||raw.sendAckObservation!==null||raw.responseRecordedAt!==null||raw.responseObservation!==null||raw.outputWire!==null)return null;
 }else{
  ack=observation(raw.sendAckObservation,"send_ack",e);if(!timestamp(raw.sendAckRecordedAt)||!ack)return null;
  if(raw.phase==="send_ack_recorded"){
   if(raw.responseRecordedAt!==null||raw.responseObservation!==null||raw.outputWire!==null)return null;
  }else{
   response=observation(raw.responseObservation,"response_received",e);output=parsePlanningV2ModelOutputReceipt(raw.outputWire,e.binding);
   if(!timestamp(raw.responseRecordedAt)||!response||!output)return null;
  }
 }
 if(e.outputDigest!==null&&(!output||output.outputDigest!==e.outputDigest||output.usageDigest!==e.usageDigest))return null;
 const result=Object.freeze({kind:"model_request_journal" as const,schemaVersion:"planning-v2-model-journal/1" as const,
  binding:Object.freeze({...b}),requestId:e.requestId,requestDigest:e.requestDigest,payloadDigest:e.payloadDigest,phase:raw.phase,revision:raw.revision,
  intentRecordedAt:raw.intentRecordedAt,sendAckRecordedAt:raw.sendAckRecordedAt as string|null,responseRecordedAt:raw.responseRecordedAt as string|null,unknownAt:raw.unknownAt,
  sendAckObservation:ack,responseObservation:response,outputWire:output,providerOriginVerified:false as const,executionAvailable:false as const,readyForPublication:false as const,reconciliationRequired:true as const});
 return write?Object.freeze({...result,reused:raw.reused as boolean}):result;
}
export function parsePlanningV2ModelJournalRead(raw:unknown,captured:unknown):PlanningV2ModelJournal|Failure|null{return parse(raw,captured,false);}
export function parsePlanningV2ModelJournalWrite(raw:unknown,captured:unknown):Readonly<PlanningV2ModelJournal&{reused:boolean}>|Failure|null{return parse(raw,captured,true) as Readonly<PlanningV2ModelJournal&{reused:boolean}>|Failure|null;}
