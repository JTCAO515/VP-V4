import {createHash,randomUUID} from 'node:crypto';
import {CostGuard} from '../model-gateway/budget/index.ts';
import {invokeProviderProtocol} from '../model-gateway/adapters/provider-protocol.ts';
import {createProviderHttpTransport,type HttpProviderConfiguration} from '../model-gateway/adapters/http-transport.ts';
import {WIKI_STATEMENT_PROPOSALS_PROMPT_REF} from '../model-gateway/prompt/wiki-statement-proposals.ts';
import {isProposalOutput,resolveProposalOutput,type ProposalSource,type StructuredWikiDraft} from '../knowledge/wiki/proposals.ts';
import type {WikiGenerationJobDependencies} from './wiki-generation-job.ts';
import {isKnowledgeStatement} from '../knowledge/publication/statement.ts';
export type WikiProposalJobInput=Readonly<{
  dataClass:'c0_synthetic';sources:readonly ProposalSource[];configDigest:string;
  maxOutputTokens:number;timeoutMs:number;provider:HttpProviderConfiguration;
}>;
export type WikiProposalJobOutcome=
 | Readonly<{kind:'succeeded';output:StructuredWikiDraft;usage:{inputTokens:number;outputTokens:number;totalTokens:number};inputDigest:string}>
 // rawResponseForDiagnostics is present only when errorCode is MODEL_OUTPUT_INVALID;
 // a bounded, allowlisted snapshot (never the verbatim provider body, never
 // reasoning content) -- this module still never persists or logs it itself.
 | Readonly<{kind:'failed';errorCode:string;rawResponseForDiagnostics?:string}> | Readonly<{kind:'cancelled'}>;
const DIAGNOSTIC_PREVIEW_CHARS=4000;
function safeJsonPreview(value:unknown):string {
  try { const text=JSON.stringify(value); return text.length>DIAGNOSTIC_PREVIEW_CHARS?text.slice(0,DIAGNOSTIC_PREVIEW_CHARS):text; } catch { return '"(unserializable)"'; }
}
function validSource(s:ProposalSource):boolean {
  return !!s&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.id)
    &&isKnowledgeStatement({schemaVersion:'knowledge-statement/1',assertion:{subjectId:'validation',predicate:'requires_action',objectId:'validation',conditions:[],exclusions:[]},scope:{cities:['shanghai'],scene:'arrival',audience:'international_independent_traveler'},expressions:{zh:{text:'Validation',conditions:[],exclusions:[]},en:{text:'Validation',conditions:[],exclusions:[]}},sources:[s.declaration]});
}
export function proposalInputDigest(input:WikiProposalJobInput):string {
  return createHash('sha256').update(JSON.stringify({prompt:WIKI_STATEMENT_PROPOSALS_PROMPT_REF,config:input.configDigest,sources:input.sources})).digest('hex');
}
/** Explicit C0-only entry: this does not authorize arbitrary user/source data egress.
 * Claims/completions, durable budget receipts and live source withdrawal gates stay
 * with the caller; no schedule, implicit retry, or automatic publication is added. */
export async function runWikiStatementProposalJob(input:WikiProposalJobInput,deps:WikiGenerationJobDependencies,signal:AbortSignal):Promise<WikiProposalJobOutcome>{
  if(!input||input.dataClass!=='c0_synthetic'||!Array.isArray(input.sources)||input.sources.length<1||input.sources.length>3
    ||!input.sources.every(validSource)||new Set(input.sources.map(s=>s.id)).size!==input.sources.length
    ||!/^[0-9a-f]{64}$/.test(input.configDigest)||!Number.isSafeInteger(input.maxOutputTokens)||input.maxOutputTokens<1||input.maxOutputTokens>8192
    ||!Number.isSafeInteger(input.timeoutMs)||input.timeoutMs<1||input.timeoutMs>60000||!input.provider)return {kind:'failed',errorCode:'INVALID_INPUT'};
  if(signal.aborted)return {kind:'cancelled'};
  const guard=new CostGuard({windowMs:60000,perUserAttempts:10,perTaskAttempts:3,turnDeadlineMs:input.timeoutMs,maxModelSteps:1,maxToolSteps:1});
  const turn=guard.startTurn({userId:'wiki-proposal-worker',taskId:'wiki-proposal'});
  if(turn.kind!=='turn')return {kind:'failed',errorCode:'INVALID_INPUT'};
  const transport=createProviderHttpTransport(input.provider,{credential:deps.credential,recordDestination:deps.recordDestination,...(deps.fetch?{fetch:deps.fetch}:{})});
  // captureRawResponseOnInvalid: true is safe here -- input is approved,
  // ingested source declarations (c0_synthetic), not a traveler's own free-text input.
  const result=await invokeProviderProtocol({requestId:randomUUID(),provider:input.provider.provider,dataClass:'c0_synthetic',task:'wiki_statement_proposals_v1',input:JSON.stringify({sources:input.sources.map(s=>({sourceRevisionId:s.id,snippet:s.declaration.snippet}))}),maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs,captureRawResponseOnInvalid:true},turn,transport,signal);
  if(result.kind==='cancelled')return {kind:'cancelled'};
  if(result.kind==='unavailable')return {kind:'failed',errorCode:result.code,...(result.rawResponseForDiagnostics!==undefined?{rawResponseForDiagnostics:result.rawResponseForDiagnostics}:{})};
  if(!isProposalOutput(result.output))return {kind:'failed',errorCode:'MODEL_OUTPUT_INVALID',rawResponseForDiagnostics:safeJsonPreview(result.output)};
  const output=resolveProposalOutput(result.output,input.sources);
  return output?{kind:'succeeded',output,usage:result.usage,inputDigest:proposalInputDigest(input)}:{kind:'failed',errorCode:'MODEL_OUTPUT_INVALID',rawResponseForDiagnostics:safeJsonPreview(result.output)};
}
