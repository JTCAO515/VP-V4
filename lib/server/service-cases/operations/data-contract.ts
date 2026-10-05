import {decodeServiceReceipt,exact,integer,milliseconds,parseServiceInput,record,uuid} from './contract.ts';
export type ServiceDataInput =
  | Readonly<{action:'delete';operationId:string;caseId:string;grantRevision:number;confirmed:true}>
  | Readonly<{action:'read_operation';operationId:string}>
  | Readonly<{action:'abandon';operationId:string;mutationBytes:string}>
  | Readonly<{action:'export';requestId:string;confirmed:true}>;
export type ServiceDataReceipt = Readonly<{schemaVersion:'service-case-data/1';kind:'receipt';operationId:string;requestDigest:string;outcome:'deleted'|'cancelled';createdAt:number;allUserDataCompleted:false}>;
export type ServiceDataBundle = Readonly<{
 schemaVersion:'service-case-data/1';kind:'bundle';requestId:string;ownerId:string;sessionId:string;
 capturedAt:number;expiresAt:number;sourceDigest:string;corePackageEnrollment:'not_enrolled';allUserDataCompleted:false;
 coverage:Readonly<{case:'complete';grant_audit:'complete';service:'complete';minutes:'complete';service_audit:'complete';operation:'complete';brief:'unavailable';attachments:'unavailable'}>;
 rows:readonly Readonly<{key:string;domain:'case'|'grant_audit'|'service'|'minutes'|'service_audit'|'operation';value:Record<string,unknown>}>[];
}>;
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function parseServiceDataInput(v:unknown):ServiceDataInput|null{
 if(!record(v))return null;
 if(v.action==='read_operation')return exact(v,['action','operationId'])&&uuid(v.operationId)?v as ServiceDataInput:null;
 if(v.action==='abandon'){
  if(!exact(v,['action','operationId','mutationBytes'])||!uuid(v.operationId)||typeof v.mutationBytes!=='string'||v.mutationBytes.length>24000)return null;
  let original:unknown;try{original=JSON.parse(v.mutationBytes);}catch{return null;}
  if(!record(original)||original.action!=='delete')return null;
  const command=parseServiceDataInput(original);return command?.action==='delete'&&command.operationId===v.operationId?v as ServiceDataInput:null;
 }
 if(v.action==='export')return exact(v,['action','requestId','confirmed'])&&uuid(v.requestId)&&v.confirmed===true?v as ServiceDataInput:null;
 return v.action==='delete'&&exact(v,['action','operationId','caseId','grantRevision','confirmed'])&&uuid(v.operationId)&&uuid(v.caseId)&&integer(v.grantRevision)&&v.confirmed===true?v as ServiceDataInput:null;
}
export function decodeServiceDataReceipt(v:unknown):ServiceDataReceipt|null{
 return record(v)&&exact(v,['schemaVersion','kind','operationId','requestDigest','outcome','createdAt','allUserDataCompleted'])&&v.schemaVersion==='service-case-data/1'&&v.kind==='receipt'&&uuid(v.operationId)&&digest(v.requestDigest)&&['deleted','cancelled'].includes(String(v.outcome))&&milliseconds(v.createdAt)&&v.allUserDataCompleted===false?v as ServiceDataReceipt:null;
}
export function decodeServiceDataBundle(v:unknown):ServiceDataBundle|null{
 if(!record(v)||!exact(v,['schemaVersion','kind','requestId','ownerId','sessionId','capturedAt','expiresAt','sourceDigest','corePackageEnrollment','allUserDataCompleted','coverage','rows'])||v.schemaVersion!=='service-case-data/1'||v.kind!=='bundle'||![v.requestId,v.ownerId,v.sessionId].every(uuid)||!milliseconds(v.capturedAt)||!milliseconds(v.expiresAt)||v.expiresAt<=v.capturedAt||v.expiresAt-v.capturedAt>30000||!digest(v.sourceDigest)||v.corePackageEnrollment!=='not_enrolled'||v.allUserDataCompleted!==false)return null;
 const domains=['case','grant_audit','service','minutes','service_audit','operation'];
 if(!record(v.coverage)||!exact(v.coverage,[...domains,'brief','attachments'])||!domains.every(k=>(v.coverage as Record<string,unknown>)[k]==='complete')||v.coverage.brief!=='unavailable'||v.coverage.attachments!=='unavailable'||!Array.isArray(v.rows)||v.rows.length>10000)return null;
 if(!v.rows.every(validServiceDataRow)||new Set(v.rows.map(r=>r.key)).size!==v.rows.length)return null;
 return v as ServiceDataBundle;
}
/** Future table columns cannot silently enter a user download. */
export function validServiceDataRow(r:unknown):boolean{
 if(!record(r)||!exact(r,['key','domain','value'])||typeof r.key!=='string'||!r.key.length||r.key.length>180||!record(r.value))return false;
 const fields:Record<string,readonly string[]>={
  case:['caseId','category','problem','revision','recipientId','expiresAt','revoked','createdAt'],
  grant_audit:['caseId','revision','action','actorId','recipientId','expiresAt','createdAt'],
  service:['caseId','revision','grantRevision','status','urgency','tripId','tripVersion','proposalId','staffId','staffLabel','acceptedAt','shiftEndsAt','evidence','updatedAt'],
  minutes:['caseId','operationId','staffId','startedAt','endedAt'],
  service_audit:['caseId','revision','actorId','action','status','createdAt'],
  operation:['operationId','actorId','surface','caseId','grantRevision','requestDigest','receipt','createdAt','erased','requestBytes'],
 };
 if(r.domain==='operation'&&decodeServiceDataReceipt(r.value))return true;
 if(typeof r.domain!=='string'||!Object.hasOwn(fields,r.domain)||!exact(r.value,fields[r.domain]))return false;
 if(r.domain!=='operation')return true;
 if(r.value.erased===true)return r.value.requestBytes===null&&r.value.receipt===null&&r.value.caseId===null;
 if(r.value.erased!==false||!decodeServiceReceipt(r.value.receipt)||typeof r.value.requestBytes!=='string'||r.value.requestBytes.length>24000)return false;
 try{const input=parseServiceInput(JSON.parse(r.value.requestBytes));return !!input&&'operationId'in input&&input.action!=='read_operation'&&input.action!=='abandon';}catch{return false;}
}
