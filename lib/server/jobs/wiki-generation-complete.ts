import {isStructuredWikiDraft} from "../knowledge/wiki/proposals.ts";
import type {WikiProposalJobOutcome} from "./wiki-statement-proposal-job.ts";
import type { WikiGenerationJobOutcome } from "./wiki-generation-job.ts";
import { isValidWikiGenerationDraftOutput } from "../model-gateway/prompt/wiki-generation.ts";

type Completion = Readonly<{
  operationId: string; jobId: string; expectedVersion: number; sourceRevisionIds: readonly string[];
  statementRefs: readonly string[]; promptVersion: string; configDigest: string; generatedAt: string; changeNote: string;
}>;
type Rpc = { call(name: string, input: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** Persist the complete validated output. Retain this exact input/operationId for
 * receipt recovery after a lost response; retrying completion never invokes a model.
 * The caller supplies its existing authenticated Ops RPC, not a service bypass.
 */
export function completeWikiGenerationJob(rpc: Rpc, completion: Completion, outcome: WikiGenerationJobOutcome | WikiProposalJobOutcome) {
  if (outcome.kind === "succeeded" && !(isValidWikiGenerationDraftOutput(outcome.output) || isStructuredWikiDraft(outcome.output))) throw new TypeError("INVALID_INPUT");
  const { operationId, jobId, ...metadata } = completion;
  return rpc.call("ops_wiki_generation_v1", { p_input: {
    action: "complete", operationId, jobId,
    outcome: outcome.kind === "succeeded"
      ? { kind: "succeeded", ...metadata, costTokens: outcome.usage.totalTokens, draftContent: outcome.output }
      : outcome,
  } });
}
