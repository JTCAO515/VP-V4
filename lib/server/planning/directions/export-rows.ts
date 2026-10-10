import { parseDirectionsIntake } from './contract.ts';
import { directionsReceipt } from './protocol.ts';
export const DIRECTION_EXPORT_ANCHORS={directionIntakes:'messageId',directionSources:'artifactId',directionOperations:'operationId'} as const;
export type DirectionExportSection=keyof typeof DIRECTION_EXPORT_ANCHORS;
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,ks:readonly string[])=>Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const int=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const time=(v:unknown)=>typeof v==='string'&&v.length<=64&&Number.isFinite(Date.parse(v));
const intakeKeys=['messageId','intakeRevision','goalId','conversationId','taskId','taskTurnId','messageSequence','goalVersion','policyId','consentId','planningPolicyId','planningConsentId','idempotencyKey','requestBytesDigest','intake','memoryBasis','createdAt'];
const sourceKeys=['artifactId','messageId','taskTurnId','sourceDigest','initialContentDigest','initialOutputDigest','previousArtifactId','previousRevision','publicationKey','createdAt'];
const operationKeys=['operationId','sessionId','action','requestBytesDigest','erased','artifactId','sourceMessageId','taskTurnId','expectedRevision','resultRevision','sourceDigest','outputContentDigest','tripId','proposalId','proposalArtifactId','receipt','createdAt'];
const scrubbed=['artifactId','sourceMessageId','taskTurnId','expectedRevision','resultRevision','sourceDigest','outputContentDigest','tripId','proposalId','proposalArtifactId','receipt'];
/** Exact SQL projection only; rejects whole malformed pages rather than losing rows. */
export function validDirectionExportRow(section:DirectionExportSection,v:unknown):boolean{
 if(!obj(v)||!time(v.createdAt))return false;
 if(section==='directionIntakes')return exact(v,intakeKeys)&&['messageId','goalId','conversationId','taskId','taskTurnId','policyId','consentId','planningPolicyId','planningConsentId','idempotencyKey'].every(k=>uuid(v[k]))
  &&int(v.intakeRevision,1,1000)&&int(v.goalVersion,1,10000)&&int(v.messageSequence,1,1000000)&&digest(v.requestBytesDigest)&&parseDirectionsIntake(v.intake)!==null
  &&Array.isArray(v.memoryBasis)&&v.memoryBasis.length<=3&&v.memoryBasis.every(r=>obj(r)&&exact(r,['id','revision'])&&uuid(r.id)&&int(r.revision,1,9007199254740990))&&new Set(v.memoryBasis.map(r=>r.id)).size===v.memoryBasis.length;
 if(section==='directionSources')return exact(v,sourceKeys)&&['artifactId','messageId','taskTurnId','publicationKey'].every(k=>uuid(v[k]))&&['sourceDigest','initialContentDigest','initialOutputDigest'].every(k=>digest(v[k]))
  &&(v.previousArtifactId===null?v.previousRevision===null:uuid(v.previousArtifactId)&&v.previousArtifactId!==v.artifactId&&int(v.previousRevision,1,1000));
 if(!exact(v,operationKeys)||!uuid(v.operationId)||!uuid(v.sessionId)||!['choose','save','edit','bind'].includes(String(v.action))||!digest(v.requestBytesDigest)||typeof v.erased!=='boolean')return false;
 if(v.erased)return scrubbed.every(k=>v[k]===null);
 if(!['artifactId','sourceMessageId','taskTurnId'].every(k=>uuid(v[k]))||!int(v.expectedRevision,1,1000)||!int(v.resultRevision,1,1000)||!digest(v.sourceDigest)||!obj(v.receipt))return false;
 const receipt=v.receipt;
 const action=v.action as 'choose'|'save'|'edit'|'bind';
 const params={artifactId:v.artifactId,expectedRevision:v.expectedRevision,operationId:v.operationId,...(action==='bind'?{tripId:v.tripId,expectedTripVersion:receipt.tripVersion}:{})};
 if(!directionsReceipt(action,receipt,params)||receipt.revision!==v.resultRevision)return false;
 return action==='bind'?v.resultRevision===v.expectedRevision&&v.outputContentDigest===null&&['tripId','proposalId','proposalArtifactId'].every(k=>uuid(v[k])&&receipt[k]===v[k])
  :v.expectedRevision<1000&&v.resultRevision===v.expectedRevision+1&&digest(v.outputContentDigest)&&['tripId','proposalId','proposalArtifactId'].every(k=>v[k]===null);
}
