import {assertTripSnapshot,type TripSnapshot} from '../trip/patch/contract.ts';
import {parseChangeProposalReference,type ChangeProposalReference} from './change-proposal-reference.ts';
import type {ComparisonContent} from './result-contract.ts';
export type JourneyDraftSource=Readonly<{kind:'task_output';taskTurnId:string}|{kind:'trip_snapshot';tripId:string;tripVersion:number}|{kind:'proposal_preview';proposalId:string;proposalRevision:number}>;
export type JourneyDraftContent=Readonly<{schemaVersion:'journey-draft/1';title:string;summary:string;draft:TripSnapshot;source:JourneyDraftSource;actions:readonly []}>;
export type DecisionContent=Readonly<{schemaVersion:'decision/1';title:string;summary:string;comparisonRef:Readonly<{artifactId:string;revision:number}>;state:'pending'|'chosen';chosenOptionId:string|null;actions:readonly []}>;
export type PracticalContent=Readonly<{schemaVersion:'practical/1';kind:'translation';sourceTurnId:string;sourceLocale:'zh'|'en';targetLocale:'zh'|'en';translation:string;backTranslation:string;actions:readonly []}>;
export type ResultContent=ComparisonContent|JourneyDraftContent|DecisionContent|ChangeProposalReference|PracticalContent;
/** Same canonical evidence descriptor as the v6 source-context owner; no copied quote/source body. */
export type ResultEvidenceRef=Readonly<{factId:string;assertionId:string;assertionRevision:number;city:'shanghai'|'beijing'|'guangzhou'|'chongqing';scene:'arrival'|'airport_transport'|'payment'|'connectivity'|'public_transport'|'taxi'|'rail'|'attraction'|'accommodation'|'emergency'}>;
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const allowed=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).every(k=>keys.includes(k));
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const integer=(v:unknown,min=1):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=2147483647;
const actionless=(v:Record<string,unknown>)=>Array.isArray(v.actions)&&v.actions.length===0;
function journeySource(v:unknown):v is JourneyDraftSource{
 if(!obj(v))return false;
 return v.kind==='task_output'&&exact(v,['kind','taskTurnId'])&&uuid(v.taskTurnId)
  ||v.kind==='trip_snapshot'&&exact(v,['kind','tripId','tripVersion'])&&uuid(v.tripId)&&integer(v.tripVersion,0)
  ||v.kind==='proposal_preview'&&exact(v,['kind','proposalId','proposalRevision'])&&uuid(v.proposalId)&&integer(v.proposalRevision);
}
function closedDraft(v:unknown):v is TripSnapshot{
 if(!obj(v)||!exact(v,['version','title','days'])||!integer(v.version,0)||!Array.isArray(v.days)||v.days.length>30)return false;
 for(const day of v.days){if(!obj(day)||!allowed(day,['id','date','timeZone','items'])||(Object.hasOwn(day,'items')&&!Array.isArray(day.items)))return false;
  const items=Array.isArray(day.items)?day.items:[];if(items.length>50)return false;
  for(const item of items)if(!obj(item)||!allowed(item,['id','dayId','title','startsAt','endsAt']))return false;
 }
 try{assertTripSnapshot(v);return true;}catch{return false;}
}
export function parseResultContent(v:unknown):ResultContent|null{
 if(!obj(v)||!actionless(v))return null;
 if(v.schemaVersion==='change-proposal-reference/1')return parseChangeProposalReference(v);
 if(v.schemaVersion==='comparison/1'){
  if(!exact(v,['schemaVersion','title','summary','options','actions'])||!text(v.title,120)||!text(v.summary,1000)||!Array.isArray(v.options)||v.options.length<2||v.options.length>4)return null;
  const ids=new Set();for(const o of v.options){if(!obj(o)||!exact(o,['id','title','tradeoff'])||!text(o.id,40)||!/^[a-z0-9_-]+$/.test(o.id)||ids.has(o.id)||!text(o.title,120)||!text(o.tradeoff,500))return null;ids.add(o.id);}return v as ComparisonContent;
 }
 if(v.schemaVersion==='journey-draft/1')return exact(v,['schemaVersion','title','summary','draft','source','actions'])&&text(v.title,120)&&text(v.summary,1000)&&closedDraft(v.draft)&&journeySource(v.source)?v as JourneyDraftContent:null;
 if(v.schemaVersion==='decision/1')return exact(v,['schemaVersion','title','summary','comparisonRef','state','chosenOptionId','actions'])&&text(v.title,120)&&text(v.summary,1000)&&obj(v.comparisonRef)&&exact(v.comparisonRef,['artifactId','revision'])&&uuid(v.comparisonRef.artifactId)&&integer(v.comparisonRef.revision)
  &&(v.state==='pending'&&v.chosenOptionId===null||v.state==='chosen'&&text(v.chosenOptionId,40)&&/^[a-z0-9_-]+$/.test(v.chosenOptionId))?v as DecisionContent:null;
 if(v.schemaVersion==='practical/1')return exact(v,['schemaVersion','kind','sourceTurnId','sourceLocale','targetLocale','translation','backTranslation','actions'])&&v.kind==='translation'&&uuid(v.sourceTurnId)&&(v.sourceLocale==='zh'||v.sourceLocale==='en')&&(v.targetLocale==='zh'||v.targetLocale==='en')&&v.sourceLocale!==v.targetLocale&&text(v.translation,2400)&&text(v.backTranslation,2400)?v as PracticalContent:null;
 return null;
}
export function parseResultEvidenceRefs(v:unknown):readonly ResultEvidenceRef[]|null{
 if(!Array.isArray(v)||v.length>20)return null;const seen=new Set();
 for(const r of v){if(!obj(r)||!exact(r,['factId','assertionId','assertionRevision','city','scene'])||!uuid(r.factId)||!uuid(r.assertionId)||!integer(r.assertionRevision)||typeof r.city!=='string'||!['shanghai','beijing','guangzhou','chongqing'].includes(r.city)||typeof r.scene!=='string'||!['arrival','airport_transport','payment','connectivity','public_transport','taxi','rail','attraction','accommodation','emergency'].includes(r.scene))return null;
  const key=JSON.stringify([r.factId,r.assertionId,r.assertionRevision,r.city,r.scene]);if(seen.has(key))return null;seen.add(key);
 }return v as readonly ResultEvidenceRef[];
}
