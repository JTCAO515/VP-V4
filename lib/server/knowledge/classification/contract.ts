import {isSourceUri,type SourceDeclaration} from '../review/source-assertion.ts';
export const CLASSIFICATION_EXCLUSIONS=['classification_only','no_price_or_inventory_claim','no_guest_eligibility_claim'] as const;
export const CLASSIFICATION_ACTIONS=['submit','review','publish','revoke','submit_mapping','review_mapping','revoke_mapping'] as const;
export type ClassificationAction=typeof CLASSIFICATION_ACTIONS[number];
export type HotelClassificationStatement=Readonly<{schemaVersion:'knowledge-lodging-classification/1';assertion:Readonly<{subjectId:string;predicate:'classified_as';objectId:'hotel';conditions:readonly [];exclusions:typeof CLASSIFICATION_EXCLUSIONS}>;scope:Readonly<{cities:readonly [string];scene:'lodging_classification';audience:'international_independent_traveler'}>;expressions:Readonly<Record<'zh'|'en',Readonly<{text:string;conditions:readonly [];exclusions:readonly [string,string,string]}>>>;sources:readonly SourceDeclaration[]}>;
export type ClassificationOperation=Readonly<Record<string,unknown>&{action:ClassificationAction;operationId:string}>;
const cities=['shanghai','beijing','guangzhou','chongqing'];
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const closed=(v:unknown,k:readonly string[]):v is Record<string,unknown>=>object(v)&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const timestamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v.replace(/(?:\.(\d{1,3}))?Z$/,(_,d)=>'.'+(d??'').padEnd(3,'0')+'Z');
export function isHotelClassificationStatement(v:unknown):v is HotelClassificationStatement{
 if(!closed(v,['schemaVersion','assertion','scope','expressions','sources'])||v.schemaVersion!=='knowledge-lodging-classification/1')return false;
 const a=v.assertion,s=v.scope,e=v.expressions;
 if(!closed(a,['subjectId','predicate','objectId','conditions','exclusions'])||typeof a.subjectId!=='string'||!/^[a-z][a-z0-9_-]{0,127}$/.test(a.subjectId)||a.predicate!=='classified_as'||a.objectId!=='hotel'||!Array.isArray(a.conditions)||a.conditions.length!==0||!Array.isArray(a.exclusions)||a.exclusions.length!==3||a.exclusions.some((x,i)=>x!==CLASSIFICATION_EXCLUSIONS[i]))return false;
 if(!closed(s,['cities','scene','audience'])||s.scene!=='lodging_classification'||s.audience!=='international_independent_traveler'||!Array.isArray(s.cities)||s.cities.length!==1||!cities.includes(s.cities[0]))return false;
 if(!closed(e,['zh','en']))return false;for(const lang of ['zh','en']){const p=e[lang];if(!closed(p,['text','conditions','exclusions'])||!text(p.text,1000)||!Array.isArray(p.conditions)||p.conditions.length!==0||!Array.isArray(p.exclusions)||p.exclusions.length!==3||!p.exclusions.every(x=>text(x,240)))return false;}
 if(!Array.isArray(v.sources)||v.sources.length<1||v.sources.length>3)return false;
 const seen=new Set<string>();return v.sources.every(s=>{if(!closed(s,['sourceKey','revisionLabel','publisher','uri','locator','snippet','usageDeclaration'])||typeof s.sourceKey!=='string'||!/^[a-z][a-z0-9_-]{0,127}$/.test(s.sourceKey)||!text(s.revisionLabel,120)||!text(s.publisher,160)||!isSourceUri(s.uri)||!text(s.locator,240)||!text(s.snippet,2000)||!text(s.usageDeclaration,500))return false;const key=s.sourceKey+':'+s.revisionLabel;if(seen.has(key))return false;seen.add(key);return true;});
}
export function isClassificationOperation(v:unknown):v is ClassificationOperation{
 if(!object(v)||!uuid(v.operationId)||typeof v.action!=='string'||!CLASSIFICATION_ACTIONS.includes(v.action as ClassificationAction)||new TextEncoder().encode(JSON.stringify(v)).byteLength>24000)return false;
 switch(v.action){
 case 'submit':return closed(v,['action','operationId','candidateId','title','statement'])&&uuid(v.candidateId)&&text(v.title,160)&&isHotelClassificationStatement(v.statement);
 case 'review':return closed(v,['action','operationId','candidateId','expectedVersion','decision','note'])&&uuid(v.candidateId)&&v.expectedVersion===1&&['reviewed','rejected'].includes(String(v.decision))&&typeof v.decision==='string'&&text(v.note,400);
 case 'publish':return closed(v,['action','operationId','candidateId','expectedVersion','expiresAt','useBasis','useNote'])&&uuid(v.candidateId)&&v.expectedVersion===2&&timestamp(v.expiresAt)&&['original_factual_summary','explicit_licence'].includes(String(v.useBasis))&&typeof v.useBasis==='string'&&text(v.useNote,1000);
 case 'revoke':return closed(v,['action','operationId','candidateId','expectedPublicationVersion','note'])&&uuid(v.candidateId)&&v.expectedPublicationVersion===1&&text(v.note,400);
 case 'submit_mapping':return closed(v,['action','operationId','canonicalPoiId','statementId','expectedStatementRevision','expectedPayloadHash','expectedSourceDigest','expectedPublicationVersion','expectedRightsDigest','city'])&&uuid(v.canonicalPoiId)&&uuid(v.statementId)&&v.expectedStatementRevision===1&&v.expectedPublicationVersion===1&&hash(v.expectedPayloadHash)&&hash(v.expectedSourceDigest)&&hash(v.expectedRightsDigest)&&typeof v.city==='string'&&cities.includes(v.city);
 case 'review_mapping':return closed(v,['action','operationId','mappingId','expectedVersion','expectedDigest','decision','note'])&&uuid(v.mappingId)&&v.expectedVersion===1&&hash(v.expectedDigest)&&typeof v.decision==='string'&&['approved','rejected'].includes(v.decision)&&text(v.note,400);
 case 'revoke_mapping':return closed(v,['action','operationId','mappingId','expectedVersion','note'])&&uuid(v.mappingId)&&v.expectedVersion===2&&text(v.note,400);
 }return false;
}
/** Closed server acknowledgements, matched to the exact submitted operation. */
export function decodeClassificationReply(v:unknown,input:ClassificationOperation):Record<string,unknown>|null{
 if(closed(v,['kind'])&&['blocked','conflict','stale'].includes(String(v.kind)))return v;
 if(!object(v)||v.operationId!==input.operationId)return null;
 if(input.action==='submit'||input.action==='review'){
  if(!closed(v,['kind','operationId','candidateId','statementId','statementRevision','payloadHash','sourceDigest','status','version','reviewerMemberRevision'])||v.kind!=='lodging_classification_candidate'||v.candidateId!==input.candidateId||!uuid(v.statementId)||v.statementRevision!==1||!hash(v.payloadHash)||!hash(v.sourceDigest))return null;
  return input.action==='submit'?v.status==='pending'&&v.version===1&&v.reviewerMemberRevision===null?v:null:v.status===input.decision&&v.version===2&&Number.isSafeInteger(v.reviewerMemberRevision)&&Number(v.reviewerMemberRevision)>0?v:null;
 }
 if(input.action==='publish'||input.action==='revoke')return closed(v,['kind','operationId','candidateId','statementId','statementRevision','factId','publicationVersion','state','sourceDigest','rightsDigest','expiresAt'])&&v.kind==='lodging_classification_publication'&&v.candidateId===input.candidateId&&uuid(v.statementId)&&uuid(v.factId)&&v.statementRevision===1&&v.publicationVersion===(input.action==='publish'?1:2)&&v.state===(input.action==='publish'?'published':'revoked')&&hash(v.sourceDigest)&&hash(v.rightsDigest)&&timestamp(v.expiresAt)?v:null;
 if(!closed(v,['kind','operationId','mappingId','canonicalPoiId','statementId','version','status','digest','sourceDigest','rightsDigest'])||v.kind!=='lodging_classification_mapping'||![v.mappingId,v.canonicalPoiId,v.statementId].every(uuid)||!hash(v.digest)||!hash(v.sourceDigest)||!hash(v.rightsDigest))return null;
 if(input.action==='submit_mapping')return v.canonicalPoiId===input.canonicalPoiId&&v.statementId===input.statementId&&v.status==='pending'&&v.version===1?v:null;
 return v.mappingId===input.mappingId&&v.version===(input.action==='review_mapping'?2:3)&&v.status===(input.action==='review_mapping'?input.decision:'revoked')?v:null;
}
