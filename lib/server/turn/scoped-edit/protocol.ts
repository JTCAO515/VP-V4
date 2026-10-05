import { exact, record, uuid, digest, integer, type ManualEdit } from '../../trip/scoped-edit/contract.ts';
import { parseScopedContext, sameValue, type ScopedEditContext } from '../../trip/scoped-edit/wire.ts';
import { manualScopedPatch, previewScopedPatch, type ScopedPatchOperation, type ScopedPatch } from '../../trip/scoped-edit/candidate-guard.ts';
import { parseScopedModelOutput, type ScopedModelOutput } from './model-output.ts';
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
    || !(v.profile === null || record(v.profile)) || !Array.isArray(v.memory) || v.memory.length > 64 || !v.memory.every(record)
    || !integer(v.reservedMicros, 1) || !integer(v.timeoutMs, 1) || v.timeoutMs > 60000 || !integer(v.maxOutputTokens, 1) || v.maxOutputTokens > 4096) return null;
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
  if (!record(v) || !exact(v,['kind','binding','output','usage','actualMicros','accounting']) || v.kind !== 'saved_output' || !validBinding(v.binding) || !sameValue(v.binding,b) || !parseScopedModelOutput(v.output) || !record(v.usage) || !integer(v.actualMicros,1) || !['settled','pending'].includes(String(v.accounting))) return null;
  const u=v.usage;
  if (!exact(u,['inputTokens','outputTokens','totalTokens','cachedInputTokens','uncachedInputTokens','reasoningTokens','cost']) || ![u.inputTokens,u.outputTokens,u.totalTokens].every(x=>integer(x)) || Number(u.inputTokens)+Number(u.outputTokens)!==u.totalTokens || Number(u.inputTokens)>1048576 || Number(u.outputTokens)>4096 || u.cost!=='unknown'
    || [u.cachedInputTokens,u.uncachedInputTokens,u.reasoningTokens].some(x=>x!==null&&!integer(x)) || Number(u.cachedInputTokens)>Number(u.inputTokens) || Number(u.reasoningTokens)>Number(u.outputTokens)) return null;
  return JSON.parse(JSON.stringify(v)) as SavedOutput;
}
/** Translate model edits through the same domain guard as manual editing, then
 * check the entire candidate against the original current snapshot. */
export function candidatePatch(input: ScopedInput, edits: readonly ManualEdit[]): ScopedPatch {
  const base=input.context.snapshot, constraints={scope:input.context.scope, lockedItemIds:input.context.lockedItemIds, fixedItemIds:input.context.fixedItemIds};
  let current=base; const operations:ScopedPatchOperation[]=[];
  for (const edit of edits) {
    const step=manualScopedPatch(current,edit,constraints);
    current={...previewScopedPatch(current,step,constraints),version:base.version};
    operations.push(...step.operations);
  }
  const patch={expectedVersion:base.version,operations};
  const next=previewScopedPatch(base,patch,constraints);
  if (!sameValue({...next,version:base.version},current) || sameValue(current,base)) throw Error('Scoped candidate unavailable');
  return patch;
}
