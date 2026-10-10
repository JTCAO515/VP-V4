import {parseResultContent,parseResultEvidenceRefs,type ResultContent,type ResultEvidenceRef} from './result-content.ts';
import type {ResultArtifactRead} from './result-contract.ts';
export type ResultArtifactReadV2=Omit<ResultArtifactRead,'content'|'basis'>&Readonly<{basis:Readonly<{memories:readonly Readonly<{id:string;revision:number}>[];evidence:readonly ResultEvidenceRef[]}>;content:ResultContent}>;
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,ks:readonly string[])=>Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const int=(v:unknown,min=1):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
export function parseResultArtifactReadV2(v:unknown):ResultArtifactReadV2|null{
 if(!obj(v)||!exact(v,['kind','artifactId','revision','currentRevision','current','historicalReadable','lifecycle','source','basis','content','createdAt'])||v.kind!=='result_artifact'||!uuid(v.artifactId)||!int(v.revision)||v.revision>1000||!int(v.currentRevision)||v.currentRevision>1000||v.revision>v.currentRevision||typeof v.current!=='boolean'||v.historicalReadable!==true||(v.lifecycle!=='active'&&v.lifecycle!=='withdrawn')||typeof v.createdAt!=='string'||v.createdAt.length>64||!Number.isFinite(Date.parse(v.createdAt))||!obj(v.source)||!obj(v.basis))return null;
 const s=v.source,b=v.basis;
 if(!exact(s,['taskId','taskTurnId','goalId','goalVersion','inputMessageId','inputSequence','tripId','tripVersion'])||![s.taskId,s.taskTurnId,s.goalId,s.inputMessageId].every(uuid)||!int(s.goalVersion)||!int(s.inputSequence)||(s.tripId===null?s.tripVersion!==null:!uuid(s.tripId)||!int(s.tripVersion,0)))return null;
 if(!exact(b,['memories','evidence'])||!Array.isArray(b.memories)||b.memories.length>20||!b.memories.every(r=>obj(r)&&exact(r,['id','revision'])&&uuid(r.id)&&int(r.revision))||new Set(b.memories.map(r=>r.id)).size!==b.memories.length||parseResultEvidenceRefs(b.evidence)===null)return null;
 const content=parseResultContent(v.content);if(!content||v.current&&(v.lifecycle!=='active'||v.revision!==v.currentRevision))return null;
 if(content.schemaVersion==='change-proposal-reference/1'&&(v.current!==true||s.tripId===null))return null;
 if(content.schemaVersion==='journey-draft/1'){
  if(content.source.kind==='task_output'&&content.source.taskTurnId!==s.taskTurnId)return null;
  if(content.source.kind==='trip_snapshot'&&(content.source.tripId!==s.tripId||content.source.tripVersion!==s.tripVersion))return null;
  if(content.source.kind==='proposal_preview'&&s.tripId===null)return null;
 }
 return v as ResultArtifactReadV2;
}
export type ResultSearchItemV2=Readonly<{artifactId:string;revision:number;schemaVersion:ResultContent['schemaVersion'];title:string;summary:string;tripId:string|null;tripVersion:number|null}>;
export type ResultSearchPageV2=Readonly<{kind:'result_search';results:readonly ResultSearchItemV2[];nextCursor:string|null}>;
export function parseResultSearchPageV2(v:unknown):ResultSearchPageV2|null{
 if(!obj(v)||!exact(v,['kind','results','nextCursor'])||v.kind!=='result_search'||!Array.isArray(v.results)||v.results.length>20||v.nextCursor!==null&&!uuid(v.nextCursor))return null;
 for(const r of v.results)if(!obj(r)||!exact(r,['artifactId','revision','schemaVersion','title','summary','tripId','tripVersion'])||!uuid(r.artifactId)||!int(r.revision)||r.revision>1000||typeof r.schemaVersion!=='string'||!['comparison/1','journey-draft/1','decision/1','change-proposal-reference/1','practical/1','travel-directions/1'].includes(r.schemaVersion)||typeof r.title!=='string'||r.title.trim().length===0||r.title.length>120||typeof r.summary!=='string'||r.summary.length>1000||(r.tripId===null?r.tripVersion!==null:!uuid(r.tripId)||!int(r.tripVersion,0)))return null;
 if(new Set(v.results.map(r=>r.artifactId)).size!==v.results.length||v.nextCursor!==null&&(v.results.length!==20||v.results.at(-1)?.artifactId!==v.nextCursor))return null;
 return v as ResultSearchPageV2;
}
