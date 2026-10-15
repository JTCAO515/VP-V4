import {createHash} from 'node:crypto';
import {exact,record} from '../guide/contract.ts';
import {uuid} from '../trip/scoped-edit/contract.ts';
import {TRIP_PRIVATE_SOURCE_KEYS,TRIP_PRIVACY_SCHEMAS,TRIP_BOUNDARY_ADDITIONS} from './privacy-contract.ts';
import {decodeTurnPreview,decodeTurnReceipt,validOperationRow} from '../privacy/turn-data/protocol.ts';
import {decodeConversationPreview,decodeConversationReceipt} from '../privacy/conversation-data/protocol.ts';
import {type TurnActor,type TurnCommand,TRIP_ERASED_KEYS as TURN_ERASED,TRIP_REDACTED_KEYS as TURN_REDACTED} from '../privacy/turn-data/contract.ts';
import {type ConversationActor,type ConversationCommand,TRIP_ERASED_KEYS as CONV_ERASED,TRIP_REDACTED_KEYS as CONV_REDACTED,counts} from '../privacy/conversation-data/contract.ts';
type Target='turn'|'conversation';type Row=Record<string,unknown>;
function normalizeGraph(v:unknown,tripId?:string):Row|null{
 if(!record(v)||!Array.isArray(v.tripTaskIds)||v.tripTaskIds.length===0||!v.tripTaskIds.every(uuid)||new Set(v.tripTaskIds).size!==v.tripTaskIds.length
 ||!Array.isArray(v.tripPrivacyTripIds)||!v.tripPrivacyTripIds.every(uuid)||new Set(v.tripPrivacyTripIds).size!==v.tripPrivacyTripIds.length||tripId&&!v.tripPrivacyTripIds.includes(tripId))return null;
 const {tripTaskIds,tripPrivacyTripIds,...legacy}=v;return legacy;
}
function normalizeCounts(v:unknown,keys:readonly string[],drop:readonly string[]):Row|null{
 if(!counts(v,keys))return null;const result={...v};for(const key of drop)delete result[key];return result;
}
function normalize(v:Row,target:Target,tripId?:string):Row|null{
 const result=structuredClone(v),erased=target==='turn'?TURN_ERASED:CONV_ERASED,redacted=target==='turn'?TURN_REDACTED:CONV_REDACTED;
 if(result.graph!==null&&Object.hasOwn(result,'graph')){const g=normalizeGraph(result.graph,tripId);if(!g)return null;result.graph=g;}
 for(const key of ['eraseCounts','erasedCounts'])if(result[key]!==null&&Object.hasOwn(result,key)){const c=normalizeCounts(result[key],erased,TRIP_PRIVATE_SOURCE_KEYS);if(!c)return null;result[key]=c;}
 for(const key of ['redactCounts','redactedCounts'])if(result[key]!==null&&Object.hasOwn(result,key)){const c=normalizeCounts(result[key],redacted,['tripObjectives']);if(!c)return null;result[key]=c;}
 if(record(result.decision)){const d=normalize(result.decision,target,tripId);if(!d)return null;result.decision=d;}
 if(record(result.boundaries))for(const [field,added] of Object.entries(TRIP_BOUNDARY_ADDITIONS)){
  const values=result.boundaries[field];if(!Array.isArray(values)||values.at(-1)!==added)return null;result.boundaries[field]=values.slice(0,-1);
 }
 return result;
}
/** Validate the explicit new fields, then reuse the complete original actor,
 * selection, proof, expiry, count and receipt checks. Unknown keys still reject. */
export function decodeTripPrivacyReply(value:unknown,target:Target,command:Record<string,unknown>,actor:TurnActor|ConversationActor,bytes:string,tripId:string,now:number):Row|null{
 if(!record(value)||value.schemaVersion!==TRIP_PRIVACY_SCHEMAS[target]||command.schemaVersion!==TRIP_PRIVACY_SCHEMAS[target])return null;
 const v=normalize(value,target,tripId);if(!v)return null;v.schemaVersion=target==='turn'?'turn-data/1':'conversation-data/1';
 const {schemaVersion,...original}=command;const digest=createHash('sha256').update(bytes).digest('hex');
 const valid=target==='turn'?(value.kind==='preview'?decodeTurnPreview(v,original as Exclude<TurnCommand,{action:'list'}>,actor,now):decodeTurnReceipt(v,original as Exclude<TurnCommand,{action:'list'}>,actor,digest,now))
 :(value.kind==='preview'?decodeConversationPreview(v,original as Exclude<ConversationCommand,{action:'list'}>,actor,now):decodeConversationReceipt(v,original as Exclude<ConversationCommand,{action:'list'}>,actor,digest,now));
 return valid?structuredClone(value):null;
}
export function validTripPrivacyOperationRow(v:unknown,owner:string,now:number):boolean{
 if(!record(v))return false;
 if(!record(v.graph)&&!(record(v.decision)&&record(v.decision.graph)))return validOperationRow(v,owner,now);
 const graph=record(v.graph)?v.graph:record(v.decision)?v.decision.graph:null;
 if(!record(graph)||!Object.hasOwn(graph,'tripTaskIds'))return validOperationRow(v,owner,now);
 const normalized=normalize(v,'turn');return !!normalized&&validOperationRow(normalized,owner,now);
}

import {parseTurnCommand} from '../privacy/turn-data/contract.ts';
import {parseConversationCommand} from '../privacy/conversation-data/contract.ts';
import {integer} from '../trip/scoped-edit/contract.ts';
import type {ScopedEditRPC} from '../trip/scoped-edit/service.ts';
import {ScopedEditServiceError,mappedError} from '../trip/scoped-edit/service.ts';
export type TripPrivacyRequest=Readonly<{schemaVersion:'trip-service-task/1';action:'trip_privacy';target:Target;expectedEpoch:number;commandBytes:string;command:Record<string,unknown>}>;
function validVersionedCommand(v:unknown,target:Target,recovering=false):boolean{
 if(!record(v)||v.schemaVersion!==TRIP_PRIVACY_SCHEMAS[target]||v.scope!==(target==='turn'?'turn-sensitive-data/1':'conversation-sensitive-data/1')||!['preview','erase','recover'].includes(String(v.action)))return false;
 const {schemaVersion,...candidate}=v;
 if(v.action==='recover'){
  if(recovering||typeof v.mutationBytes!=='string'||Buffer.byteLength(v.mutationBytes)>8192)return false;let prior:unknown;try{prior=JSON.parse(v.mutationBytes);}catch{return false;}
  if(!validVersionedCommand(prior,target,true)||!record(prior))return false;const {schemaVersion,...old}=prior;candidate.mutationBytes=JSON.stringify(old);
 }
 return !!(target==='turn'?parseTurnCommand(candidate,recovering):parseConversationCommand(candidate,recovering));
}
export function parseTripPrivacyRequest(v:unknown):TripPrivacyRequest|null{
 if(!record(v)||!exact(v,['schemaVersion','action','target','expectedEpoch','commandBytes'])||v.schemaVersion!=='trip-service-task/1'||v.action!=='trip_privacy'||!['turn','conversation'].includes(String(v.target))||!(typeof v.expectedEpoch==='number'&&Number.isSafeInteger(v.expectedEpoch)&&v.expectedEpoch>0)||typeof v.commandBytes!=='string'||Buffer.byteLength(v.commandBytes)>16384)return null;
 let command:unknown;try{command=JSON.parse(v.commandBytes);}catch{return null;}
 if(!validVersionedCommand(command,v.target as Target)||!record(command))return null;
 return {...v,command} as TripPrivacyRequest;
}
export async function runTripPrivacyRequest(tripId:string,input:TripPrivacyRequest,rpc:ScopedEditRPC,ownerId:string,now:()=>number=Date.now):Promise<Row>{
 const state=await rpc('native_session_v2',{p_action:'session'});const actor=state.data;
 if(state.error||!record(actor)||actor.version!==2||actor.subject!==ownerId||!uuid(actor.sessionId)||!(typeof actor.mobileEpoch==='number'&&Number.isSafeInteger(actor.mobileEpoch)&&actor.mobileEpoch>0)||actor.mobileEpoch!==input.expectedEpoch)throw new ScopedEditServiceError('UNAUTHENTICATED');
 const r=await rpc('privacy_trip_service_task_v1',{p_trip_id:tripId,p_target:input.target,p_action:input.command.action,p_input_bytes:input.commandBytes,p_expected_epoch:input.expectedEpoch});
 if(r.error)throw new ScopedEditServiceError(mappedError(r.error.message));
 const decoded=decodeTripPrivacyReply(r.data,input.target,input.command,{ownerId,sessionId:actor.sessionId,mobileEpoch:actor.mobileEpoch},input.command.action==='recover'?String(input.command.mutationBytes):input.commandBytes,tripId,now());
 if(!decoded)throw new ScopedEditServiceError('TRIP_PRIVACY_ACK_UNKNOWN');return decoded;
}
