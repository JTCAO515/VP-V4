import { createHash } from 'node:crypto';
import { exact, record, uuid, digest, integer, type CandidateEdit } from '../../trip/scoped-edit/contract.ts';
import { parseScopedContext, sameValue, type ScopedEditContext } from '../../trip/scoped-edit/wire.ts';
import { candidateScopedEditsPatch, selectedItems, type ScopedPatch } from '../../trip/scoped-edit/candidate-guard.ts';
import { parseScopedModelOutput, SCOPED_TRIP_EDIT_PROMPT, type ScopedModelOutput } from './model-output.ts';
import { PROTOCOL_MODELS, type ProtocolUsage } from '../../model-gateway/adapters/provider-protocol.ts';
import { isQwenEndpoint } from '../../model-gateway/adapters/provider-endpoints.ts';
import type { DurableTurnLease } from '../durable-worker.ts';
export type ScopedBinding = Readonly<{
  ownerId: string; taskId: string; turnId: string; leaseToken: string; operationId: string;
  contextId: string; contextDigest: string; sourceDigest: string; tripId: string; baseVersion: number;
  policyId: string; scopeId: string; attemptId: string; provider: 'qwen'; model: string; priceVersion: string;
}>;
export type ScopedInput = Readonly<{
  kind: 'scoped_edit_input/1'; binding: ScopedBinding; context: ScopedEditContext; text: string; locale: 'zh' | 'en';
  profile: Readonly<Record<string, unknown>> | null; memory: readonly Readonly<Record<string, unknown>>[];
  endpoint: string; reservedMicros: number; timeoutMs: number; maxOutputTokens: number;
}>;
export const bindingKeys = ['ownerId','taskId','turnId','leaseToken','operationId','contextId','contextDigest','sourceDigest','tripId','baseVersion','policyId','scopeId','attemptId','provider','model','priceVersion'] as const;
export function validBinding(v: unknown): v is ScopedBinding {
  return record(v) && exact(v, bindingKeys) && ['ownerId','taskId','turnId','leaseToken','operationId','contextId','tripId','policyId','scopeId','attemptId'].every(k => uuid(v[k]))
    && v.taskId !== v.turnId && [v.contextDigest,v.sourceDigest].every(digest) && integer(v.baseVersion) && v.provider === 'qwen' && v.model === PROTOCOL_MODELS.qwen && typeof v.priceVersion === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(v.priceVersion);
}
export function parseInput(v: unknown, lease: DurableTurnLease, now: number): ScopedInput | null {
  if (!record(v) || !exact(v, ['kind','binding','context','text','locale','profile','memory','endpoint','reservedMicros','timeoutMs','maxOutputTokens']) || v.kind !== 'scoped_edit_input/1' || !validBinding(v.binding)) return null;
  const b = v.binding, context = parseScopedContext(v.context, b.tripId, now);
  if (!context || b.ownerId !== lease.ownerId || b.turnId !== lease.turnId || b.leaseToken !== lease.leaseToken || b.contextId !== context.contextId || b.contextDigest !== context.contextDigest || b.sourceDigest !== context.sourceBasis.sourceDigest || b.baseVersion !== context.baseVersion
    || typeof v.text !== 'string' || !v.text.trim() || v.text.length > 4000 || v.text.includes('\0') || !['en','zh'].includes(String(v.locale)) || !isQwenEndpoint(v.endpoint)
    || !(v.profile === null || record(v.profile) && exact(v.profile,['travelPace','revision']) && ['relaxed','balanced','packed'].includes(String(v.profile.travelPace)) && Number.isSafeInteger(v.profile.revision) && Number(v.profile.revision)>=0) || !Array.isArray(v.memory) || v.memory.length > 64 || !v.memory.every(m=>record(m)&&exact(m,['id','revision','summary','constraintKind'])&&uuid(m.id)&&Number.isSafeInteger(m.revision)&&Number(m.revision)>=1&&typeof m.summary==='string'&&m.summary.trim().length>0&&m.summary.length<=500&&['preference','hard_constraint'].includes(String(m.constraintKind))) || new Set(v.memory.map(m=>m.id)).size!==v.memory.length
    || !integer(v.reservedMicros, 1) || !integer(v.timeoutMs, 1) || v.timeoutMs > 60000 || !integer(v.maxOutputTokens, 1) || v.maxOutputTokens > 4096) return null;
  try { selectedItems(context.snapshot,context.scope); } catch { return null; }
  // Qualification comes only from current SQL, never from these structural checks.
  const result = JSON.parse(JSON.stringify({...v, context})) as ScopedInput;
  if (Buffer.byteLength(promptInput(result)) > 32768) return null;
  return result;
}
/** Identity and recipient keys stay outside the prompt. Sources are never citations. */
export function promptInput(input: ScopedInput): string {
  return JSON.stringify({ask: input.text, locale: input.locale, trip: input.context.snapshot, scope: input.context.scope,
    lockedItemIds: input.context.lockedItemIds, fixedItemIds: input.context.fixedItemIds, profile: input.profile, memory: input.memory});
}
export function authorized(v: unknown, binding: ScopedBinding, effect: 'reserve' | 'dispatch' | 'publish'): boolean {
  return record(v) && exact(v, ['kind','effect','binding']) && v.kind === 'authorized' && v.effect === effect && validBinding(v.binding) && sameValue(v.binding, binding);
}
export type SavedOutput = Readonly<{kind:'saved_output'; binding:ScopedBinding; output:ScopedModelOutput; usage:ProtocolUsage; actualMicros:number; accounting:'settled'|'pending'}>;
export function savedOutput(v: unknown, b: ScopedBinding): SavedOutput | null {
  if (!record(v) || !exact(v,['kind','binding','output','usage','actualMicros','accounting']) || v.kind !== 'saved_output' || !validBinding(v.binding) || !sameValue(v.binding,b) || !parseScopedModelOutput(v.output) || !record(v.usage) || !integer(v.actualMicros) || !['settled','pending'].includes(String(v.accounting))) return null;
  if(!validUsage(v.usage))return null;
  return JSON.parse(JSON.stringify(v)) as SavedOutput;
}
export function validUsage(value: unknown): value is ProtocolUsage {
  if(!record(value))return false;
  const u=value;
  if (!exact(u,['inputTokens','outputTokens','totalTokens','cachedInputTokens','uncachedInputTokens','reasoningTokens','cost']) || ![u.inputTokens,u.outputTokens,u.totalTokens].every(x=>integer(x)) || Number(u.inputTokens)+Number(u.outputTokens)!==u.totalTokens || Number(u.inputTokens)>1048576 || Number(u.outputTokens)>4096 || u.cost!=='unknown'
    || [u.cachedInputTokens,u.uncachedInputTokens,u.reasoningTokens].some(x=>x!==null&&!integer(x)) || Number(u.cachedInputTokens)>Number(u.inputTokens) || Number(u.reasoningTokens)>Number(u.outputTokens) || Number(u.uncachedInputTokens)>Number(u.inputTokens) || u.cachedInputTokens!==null&&u.uncachedInputTokens!==null&&Number(u.cachedInputTokens)+Number(u.uncachedInputTokens)!==u.inputTokens) return false;
  return true;
}
export type SavedUsage=Readonly<{kind:'saved_usage';binding:ScopedBinding;usage:ProtocolUsage;actualMicros:number}>;
export function savedUsage(v: unknown,b:ScopedBinding):SavedUsage|null {
  return record(v)&&exact(v,['kind','binding','usage','actualMicros'])&&v.kind==='saved_usage'&&validBinding(v.binding)&&sameValue(v.binding,b)&&validUsage(v.usage)&&integer(v.actualMicros)?v as SavedUsage:null;
}
/** Translate model edits through the same domain guard as manual editing, then
 * check the entire candidate against the original current snapshot. */
export function candidatePatch(input: ScopedInput, edits: readonly CandidateEdit[]): ScopedPatch {
  return candidateScopedEditsPatch(input.context.snapshot,edits,{scope:input.context.scope,lockedItemIds:input.context.lockedItemIds,fixedItemIds:input.context.fixedItemIds},{contextId:input.binding.contextId,askOperationId:input.binding.operationId,candidateId:input.binding.attemptId});
}

/** Closed tuple bytes are independent of JSONB/object property serialization. */
export function scopedRequestIdentity(input: ScopedInput) {
  const body=JSON.stringify({model:PROTOCOL_MODELS.qwen,messages:[{role:'system',content:SCOPED_TRIP_EDIT_PROMPT},{role:'user',content:promptInput(input)}],stream:false,max_tokens:input.maxOutputTokens,enable_thinking:false,response_format:{type:'json_object'}});
  const payloadDigest=createHash('sha256').update(body,'utf8').digest('hex');
  const tuple=bindingKeys.filter(k=>k!=='leaseToken').map(k=>input.binding[k]);
  return {requestId:input.binding.attemptId,body,payloadDigest,requestDigest:createHash('sha256').update(JSON.stringify(['scoped-trip-edit-request/1',tuple,payloadDigest])).digest('hex')};
}
