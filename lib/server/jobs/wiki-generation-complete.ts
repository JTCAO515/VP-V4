import {isStructuredWikiDraft} from "../knowledge/wiki/proposals.ts";
import type {WikiProposalJobOutcome} from "./wiki-statement-proposal-job.ts";
import type { WikiGenerationJobOutcome } from "./wiki-generation-job.ts";
import { isValidWikiGenerationDraftOutput } from "../model-gateway/prompt/wiki-generation.ts";

type Completion = Readonly<{
  operationId: string; jobId: string; claimToken: string; expectedVersion: number; sourceRevisionIds: readonly string[];
  statementRefs: readonly string[]; promptVersion: string; configDigest: string; generatedAt: string; changeNote: string;
}>;
type Rpc = { call(name: string, input: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** Persist the complete validated output. Retain this exact input/operationId for
 * receipt recovery after a lost response; retrying completion never invokes a model.
 * The caller supplies its existing authenticated Ops RPC, not a service bypass.
 *
 * claimToken must be the exact value claim() returned (VPJ-75 job-reclaim
 * slice): if another caller has since reclaimed this job as stale, the RPC
 * rejects a completion carrying the old token with OPS_CONFLICT rather than
 * letting a late-arriving worker race or overwrite the reclaimer.
 */
export function completeWikiGenerationJob(rpc: Rpc, completion: Completion, outcome: WikiGenerationJobOutcome | WikiProposalJobOutcome) {
  if (outcome.kind === "succeeded" && !(isValidWikiGenerationDraftOutput(outcome.output) || isStructuredWikiDraft(outcome.output))) throw new TypeError("INVALID_INPUT");
  const { operationId, jobId, claimToken, ...metadata } = completion;
  return rpc.call("ops_wiki_generation_v1", { p_input: {
    action: "complete", operationId, jobId,
    outcome: outcome.kind === "succeeded"
      ? { kind: "succeeded", ...metadata, claimToken, costTokens: outcome.usage.totalTokens, draftContent: outcome.output }
      : { ...outcome, claimToken },
  } });
}
