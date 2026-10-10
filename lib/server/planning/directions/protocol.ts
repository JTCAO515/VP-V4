import { isUuid } from '../../identity/request-guards.ts';
import { parseDirectionsIntake } from './contract.ts';
export type DirectionsAction='basis'|'intake'|'submit'|'choose'|'save'|'edit'|'bind';
type Row=Record<string,unknown>;
export const object=(v:unknown):v is Row=>typeof v==='object'&&v!==null&&!Array.isArray(v);
export const exact=(v:Row,ks:readonly string[])=>Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown):v is string=>typeof v==='string'&&isUuid(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=n&&!/[\u0000-\u001f]/.test(v);
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const memories=(v:unknown)=>Array.isArray(v)&&v.length<=3&&v.every(r=>object(r)&&exact(r,['id','revision'])&&uuid(r.id)&&integer(r.revision,1,999999999999999))&&new Set(v.map(r=>r.id.toLowerCase())).size===v.length;
const base=['artifactId','expectedRevision','operationId'];
const ids=new Set(['artifactId','operationId','conversationId','goalId','parentMessageId','messageId','messageKey','threadId','turnId','taskId','taskKey','planningPolicyId','tripId']);
function canonicalParams(v:Row):Row{return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,ids.has(k)&&typeof x==='string'?x.toLowerCase():k==='memoryBasis'&&Array.isArray(x)?x.map(r=>({...r,id:String(r.id).toLowerCase()})):x]));}
export function directionsParams(action:DirectionsAction,v:unknown):Row|null{
 if(!object(v))return null;
 if(action==='basis'||action==='intake')return exact(v,['conversationId','goalId'])&&uuid(v.conversationId)&&uuid(v.goalId)?canonicalParams(v):null;
 if(action==='submit'){
  const keys=['conversationId','goalId','expectedGoalVersion','parentMessageId','messageId','messageKey','threadId','turnId','taskId','taskKey','planningPolicyId','locale','text','memoryBasis','expectedSourceSequence','expectedIntakeRevision','expectedIntakeDigest','intake','useSavedPace','expectedProfileRevision'];
  if(!exact(v,keys)||!['conversationId','goalId','parentMessageId','messageId','messageKey','threadId','turnId','taskId','taskKey','planningPolicyId'].every(k=>uuid(v[k]))||v.taskId===v.turnId||v.messageId===v.parentMessageId
   ||!integer(v.expectedGoalVersion,1,9999)||!integer(v.expectedSourceSequence,1,999999)||!integer(v.expectedIntakeRevision,0,999)||!(v.expectedIntakeRevision===0?v.expectedIntakeDigest===null:digest(v.expectedIntakeDigest))
   ||!['zh','en'].includes(String(v.locale))||!text(v.text,4000)||!memories(v.memoryBasis)||!parseDirectionsIntake(v.intake)||typeof v.useSavedPace!=='boolean'
   ||!(v.expectedProfileRevision===null||integer(v.expectedProfileRevision,0,9007199254740990))||v.useSavedPace&&v.expectedProfileRevision===null)return null;
  return canonicalParams(v);
 }
 if(!uuid(v.artifactId)||!uuid(v.operationId)||!integer(v.expectedRevision,1,action==='bind'?1000:999))return null;
 if(action==='save')return exact(v,base)?canonicalParams(v):null;
 if(action==='choose')return exact(v,[...base,'directionId'])&&['depth','breadth'].includes(String(v.directionId))?canonicalParams(v):null;
 if(action==='bind')return exact(v,[...base,'tripId','expectedTripVersion','startDate'])&&uuid(v.tripId)&&integer(v.expectedTripVersion,0,2147483647)&&date(v.startDate)?canonicalParams(v):null;
 if(action==='edit'){
  if(!exact(v,[...base,'replacements'])||!Array.isArray(v.replacements)||!v.replacements.length||v.replacements.length>30)return null;
  for(const d of v.replacements)if(!object(d)||!exact(d,['ordinal','destination','activities'])||!integer(d.ordinal,1,30)||!text(d.destination,80)||!Array.isArray(d.activities)||!d.activities.length||d.activities.length>8||!d.activities.every(a=>text(a,160))||new Set(d.activities).size!==d.activities.length)return null;
  return new Set(v.replacements.map(d=>d.ordinal)).size===v.replacements.length?canonicalParams(v):null;
 }
 return null;
}
export function unavailable(v:unknown):boolean{return object(v)&&exact(v,['kind','reason'])&&v.kind==='unavailable'&&['blocked','intake_unrecorded','stale_basis'].includes(String(v.reason));}
function source(v:Row,p:Row):boolean{return v.conversationId===p.conversationId&&v.goalId===p.goalId&&uuid(v.inputMessageId)&&integer(v.goalVersion,1,10000)&&integer(v.inputSequence,1,1000000)&&integer(v.intakeRevision,1,1000)&&digest(v.intakeDigest);}
/** Shape checks only. SQL supplies and continually revalidates actual authority. */
export function directionsReceipt(action:DirectionsAction,v:unknown,p:Row):boolean{
 if(!object(v))return false;
 if(action==='basis')return exact(v,['kind','conversationId','goalId','goalVersion','parentMessageId','messageSequence','intakeRevision','intakeDigest','policyId'])&&v.kind==='directions_write_basis'&&v.conversationId===p.conversationId&&v.goalId===p.goalId&&uuid(v.parentMessageId)&&uuid(v.policyId)&&integer(v.goalVersion,1,9999)&&integer(v.messageSequence,1,999999)&&integer(v.intakeRevision,0,999)&&(v.intakeRevision===0?v.intakeDigest===null:digest(v.intakeDigest));
 if(action==='intake'){
  if(!exact(v,['kind','schemaVersion','conversationId','goalId','goalVersion','inputMessageId','inputSequence','intakeRevision','intakeDigest','intake','memoryBasis','tripId','tripVersion','profilePace'])||v.kind!=='directions_intake'||v.schemaVersion!=='travel-directions-current-basis/1'||!source(v,p)||!parseDirectionsIntake(v.intake)||!memories(v.memoryBasis)||(v.tripId===null?v.tripVersion!==null:!uuid(v.tripId)||!integer(v.tripVersion,0,2147483647)))return false;
  if(v.profilePace===null)return true;
  const x=v.profilePace;return object(x)&&exact(x,['schemaVersion','tripId','travelPace','source','sourceRevision','sourceOperationId','purpose'])&&x.schemaVersion==='task-travel-pace/1'&&x.tripId===v.tripId&&uuid(x.tripId)&&x.source==='profile'&&integer(x.sourceRevision,1,9007199254740990)&&uuid(x.sourceOperationId)&&x.purpose==='local_trip_planning'&&['relaxed','balanced','packed'].includes(String(x.travelPace));
 }
 if(!uuid(v.artifactId)||!integer(v.revision,1,1000)||typeof v.reused!=='boolean')return false;
 if(action==='submit')return exact(v,['kind','artifactId','revision','reused','taskId','turnId','conversationId','goalId','goalVersion','inputMessageId','inputSequence','intakeRevision','intakeDigest','current'])&&v.kind==='published'&&v.taskId===p.taskId&&v.turnId===p.turnId&&v.inputMessageId===p.messageId&&source(v,p)&&typeof v.current==='boolean'&&v.goalVersion===p.expectedGoalVersion&&Number(v.inputSequence)>Number(p.expectedSourceSequence)&&v.intakeRevision===Number(p.expectedIntakeRevision)+1;
 if(v.artifactId!==p.artifactId)return false;
 if(action==='bind')return exact(v,['kind','artifactId','revision','reused','tripId','tripVersion','proposalId','proposalRevision','proposalArtifactId','proposalArtifactRevision'])&&v.kind==='proposal_created'&&v.revision===p.expectedRevision&&v.tripId===p.tripId&&v.tripVersion===p.expectedTripVersion&&uuid(v.proposalId)&&integer(v.proposalRevision,1,1000)&&uuid(v.proposalArtifactId)&&integer(v.proposalArtifactRevision,1,1000);
 const kind=action==='choose'?'selected':action==='save'?'saved':'revised';
 return exact(v,['kind','artifactId','revision','reused'])&&v.kind===kind&&v.revision===Number(p.expectedRevision)+1;
}
