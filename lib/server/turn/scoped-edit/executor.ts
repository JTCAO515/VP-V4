import { CostGuard } from '../../model-gateway/budget/index.ts';
import { runWithDurableBudget, type BudgetRpc, type BudgetAttempt } from '../../model-gateway/budget/durable.ts';
import { invokeScopedTripEditProtocol, type ProtocolTransport, type ProtocolUsage } from '../../model-gateway/adapters/provider-protocol.ts';
import { validatedPlanningUsageReceipt, type RecordPlanningUsage } from '../../model-gateway/budget/usage-receipt.ts';
import { sameValue } from '../../trip/scoped-edit/wire.ts';
import { record, exact, uuid } from '../../trip/scoped-edit/contract.ts';
import { scopedEditDiff } from '../../trip/scoped-edit/diff.ts';
import { previewScopedPatch } from '../../trip/scoped-edit/candidate-guard.ts';
import { parseScopedModelOutput } from './model-output.ts';
import { parseInput, promptInput, authorized, savedOutput, candidatePatch, type ScopedBinding, type ScopedInput, type SavedOutput } from './protocol.ts';
import type { DurableTurnLease } from '../durable-worker.ts';
export type ScopedRpc = (name: string, params: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<unknown>;
export type ScopedExecutorPorts = Readonly<{
  rpc: ScopedRpc; transport: ProtocolTransport; price: (usage: ProtocolUsage) => number | null;
  recordUsage: RecordPlanningUsage; now: () => number;
}>;
const leaseParams=(l:DurableTurnLease)=>({p_turn_id:l.turnId,p_lease_token:l.leaseToken});
/** One durable turn/operation/attempt. No claim, scheduler, secret lookup, fallback,
 * second planner, Proposal producer, or Trip confirm. Unknown ACK can only recover original output. */
export async function executeScopedTripEdit(lease: DurableTurnLease, ports: ScopedExecutorPorts, signal: AbortSignal): Promise<'persisted'|'pending'|'unavailable'> {
  if (signal.aborted) return 'unavailable';
  let input: ScopedInput | null=null;
  const read=async(s:AbortSignal)=>parseInput(await ports.rpc('read_scoped_trip_edit_work_v1',leaseParams(lease),s),lease,ports.now());
  try {
    input=await read(signal); if (!input || signal.aborted) return 'pending';
    const b=input.binding, params={p_binding:b};
    const current=async(s:AbortSignal)=>{
      if(s.aborted)return false;
      const next=await read(s);
      return next!==null && sameValue(next,input) && !s.aborted;
    };
    const allow=async(effect:'reserve'|'dispatch'|'publish',s:AbortSignal)=>await current(s)&&authorized(await ports.rpc('authorize_scoped_trip_edit_effect_v1',{...params,p_effect:effect},s),b,effect)&&!s.aborted;
    const recover=async(s:AbortSignal):Promise<SavedOutput|null>=>savedOutput(await ports.rpc('read_scoped_trip_edit_output_v1',params,s),b);
    const previous=await ports.rpc('read_scoped_trip_edit_output_v1',params,signal);
    let output=savedOutput(previous,b);
    if (!output) {
      // Only a definitive missing output permits the *same* SQL-owned attempt.
      // Its budget dispatch CAS still denies an already dispatched attempt.
      if (!record(previous)||!exact(previous,['kind'])||previous.kind!=='missing'||!await allow('reserve',signal)) return 'pending';
      const a:BudgetAttempt={scopeId:b.scopeId,ownerId:b.ownerId,taskId:b.taskId,attemptId:b.attemptId,provider:b.provider,model:b.model,priceVersion:b.priceVersion,reservedMicros:input.reservedMicros,timeoutMs:input.timeoutMs};
      const budget:BudgetRpc=async(name,p)=>{
        const effect=name==='reserve_model_budget'?'reserve':name==='dispatch_model_budget'?'dispatch':name==='finish_model_budget'?'finish':null;
        if (!effect || p.p_scope_id!==b.scopeId||p.p_owner_id!==b.ownerId||p.p_attempt_id!==b.attemptId || effect!=='finish'&&!await allow(effect,signal)) return {kind:'blocked'};
        return ports.rpc('scoped_trip_edit_budget_v1',{...params,p_effect:effect,p_reserved_micros:p.p_reserved_micros??null,p_actual_micros:p.p_actual_micros??null,p_outcome:p.p_action??null},signal);
      };
      const guard=new CostGuard({windowMs:120000,perUserAttempts:8,perTaskAttempts:8,turnDeadlineMs:120000,maxModelSteps:1,maxToolSteps:1}).startTurn({userId:b.ownerId,taskId:b.taskId});
      if(guard.kind!=='turn')return 'pending';
      const result=await runWithDurableBudget(a,budget,async s=>{
        const value=await invokeScopedTripEditProtocol({requestId:b.attemptId,text:promptInput(input!)},{provider:b.provider,endpoint:input!.endpoint,maxOutputTokens:input!.maxOutputTokens,timeoutMs:input!.timeoutMs},()=>allow('dispatch',s),guard,ports.transport,s);
        // Invalid output may still have billable usage; do not invent a free call.
        const usage=value.usage;
        const actual=usage&&usage.inputTokens<=1048576&&usage.outputTokens<=input!.maxOutputTokens ? ports.price(usage):null;
        if(actual===null||!Number.isSafeInteger(actual)||actual<1||actual>1e12)return {value,actualMicros:null};
        const receipt=validatedPlanningUsageReceipt({schemaVersion:'validated-planning-usage/1',attempt:a,turnId:b.turnId,policyId:b.policyId,usage,actualMicros:actual,observedAt:new Date(ports.now()).toISOString()},{taskId:b.taskId,turnId:b.turnId,planningPolicyId:b.policyId});
        await ports.recordUsage(receipt,s);
        if(value.kind!=='protocol_validated')return {value,actualMicros:actual};
        const parsed=parseScopedModelOutput(value.output);if(!parsed)return {value,actualMicros:actual};
        if(parsed.kind==='candidate')candidatePatch(input!,parsed.edits);
        if(!await current(s))return {value,actualMicros:null};
        try { await ports.rpc('record_scoped_trip_edit_output_v1',{...params,p_output:parsed,p_usage:usage,p_actual_micros:actual},s); } catch { /* Read-only recovery; never replay provider. */ }
        const saved=await recover(s);
        if(!saved||!sameValue(saved.output,parsed)||!sameValue(saved.usage,usage)||saved.actualMicros!==actual)return {value,actualMicros:null};
        return {value,actualMicros:actual};
      },signal);
      if(result.kind!=='completed'||result.accounting!=='settled'||signal.aborted)return 'pending';
      output=await recover(signal);
    }
    if(!output||output.accounting!=='settled'||!await allow('publish',signal))return 'pending';
    if(output.output.kind!=='candidate')return 'pending';
    const patch=candidatePatch(input,output.output.edits);
    let completed:unknown;
    try {completed=await ports.rpc('complete_scoped_trip_edit_work_v1',{...params,p_patch:patch},signal);} catch { /* Read receipt below after ambiguous ACK. */ }
    const diff=scopedEditDiff(input.context.snapshot,previewScopedPatch(input.context.snapshot,patch,{scope:input.context.scope,lockedItemIds:input.context.lockedItemIds,fixedItemIds:input.context.fixedItemIds}));
    const valid=(v:unknown)=>{
      if(!record(v)||!exact(v,['kind','binding','receipt'])||v.kind!=='candidate_saved'||!sameValue(v.binding,b)||!record(v.receipt))return false;
      const r=v.receipt;
      if(!exact(r,['kind','operationId','tripId','contextId','contextDigest','baseVersion','expiresAt','returnScope','candidates','reused'])||r.kind!=='scoped_edit_candidates/1'||r.operationId!==b.operationId||r.tripId!==b.tripId||r.contextId!==b.contextId||r.contextDigest!==b.contextDigest||r.baseVersion!==b.baseVersion||!sameValue(r.returnScope,input!.context.scope)||typeof r.reused!=='boolean'||typeof r.expiresAt!=='string'||Date.parse(r.expiresAt)<=ports.now()||Date.parse(r.expiresAt)>Date.parse(input!.context.expiresAt)||!Array.isArray(r.candidates)||r.candidates.length!==1)return false;
      const c=r.candidates[0];
      return record(c)&&exact(c,['candidateId','edits','diff'])&&uuid(c.candidateId)&&sameValue(c.edits,output!.output.kind==='candidate'?output!.output.edits:null)&&sameValue(c.diff,diff);
    };
    if(!signal.aborted&&valid(completed))return 'persisted';
    if(signal.aborted)return 'pending';
    const reread=await ports.rpc('read_scoped_trip_edit_completion_v1',params,signal);
    return !signal.aborted&&valid(reread)?'persisted':'pending';
  } catch {return signal.aborted?'unavailable':'pending';}
}
export type { ScopedBinding };
