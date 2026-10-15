import { isPlaceQuestionId, reviewedQuestionId } from "../claim/questions.ts";
import { runGroundedAiAssist, type GroundedAiAssistContextRpc, type GroundedAiAssistInput, type GroundedAiAssistOutcome } from "./grounded-ai-assist.ts";
import { revalidateGroundedWikiSearchResult, type GroundedSearchDependencies } from "./grounded-search.ts";

/**
 * VPJ-76 (#360) slice 8: the pull-driven job this repo's Web route actually
 * calls. No cron/worker process exists anywhere in this codebase, so instead
 * of a separate poller, whichever request first observes a job as claimable
 * (freshly created, or 'running' past a staleness window) claims it and runs
 * the agentic search itself before returning -- see the migration's own
 * comment (supabase/migrations/20260915200000_..._grounded_ai_assist_jobs.sql)
 * for the full reasoning. A concurrent second request sees 'pending' and
 * polls again rather than double-running the search.
 */

export type GroundedAiAssistJobRpc = (
  name: "grounded_ai_assist_work_v1",
  params: Readonly<{ p_input: Record<string, unknown> }>,
) => Promise<Readonly<{ data: unknown; error: { message: string } | null }>>;

export type GroundedAiAssistJobStatus =
  | Readonly<{ status: "not_offered"; reason: "unauthorized" | "not_blocked" | "job_unavailable" }>
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "succeeded"; outcome: GroundedAiAssistOutcome }>
  | Readonly<{ status: "failed"; errorCode: string | null }>
  | Readonly<{ status: "cancelled" }>;

export async function runGroundedAiAssistJob(
  turnId: string,
  jobRpc: GroundedAiAssistJobRpc,
  searchInput: Omit<GroundedAiAssistInput, "turnId">,
  searchDependencies: GroundedSearchDependencies & Readonly<{ contextRpc: GroundedAiAssistContextRpc }>,
  signal: AbortSignal,
): Promise<GroundedAiAssistJobStatus> {
  if (signal.aborted) return { status: "cancelled" };
  let ensure: Readonly<{ data: unknown; error: { message: string } | null }>;
  try {
    ensure = await jobRpc("grounded_ai_assist_work_v1", { p_input: { action: "ensure", turnId } });
  } catch {
    return { status: "not_offered", reason: "job_unavailable" };
  }
  if (ensure.error) return { status: "not_offered", reason: "job_unavailable" };
  const state = parseEnsure(ensure.data);
  if (state === null) return { status: "not_offered", reason: "job_unavailable" };
  if (state.kind === "unavailable") return { status: "not_offered", reason: "unauthorized" };
  if (state.kind === "not_applicable") return { status: "not_offered", reason: "not_blocked" };
  if (state.kind === "pending") return { status: "pending" };
  if (state.kind === "done") {
    const stored = doneStatus(state);
    if (stored.status !== "succeeded" || stored.outcome.kind !== "answered") return stored;
    try {
      const context = await searchDependencies.contextRpc("read_grounded_ai_assist_context_v1", { p_turn_id: turnId });
      if (context.error || !record(context.data) || context.data.kind !== "context"
        || typeof context.data.city !== "string" || typeof context.data.inputText !== "string"
        || (context.data.locale !== "zh" && context.data.locale !== "en")) return { status: "not_offered", reason: "unauthorized" };
      const id = reviewedQuestionId(context.data.intent);
      if (!id || isPlaceQuestionId(id)) return { status: "not_offered", reason: "not_blocked" };
      const outcome = await revalidateGroundedWikiSearchResult({ ...searchInput, city: context.data.city,
        locale: context.data.locale, question: context.data.inputText, intent: { intent: id, requestScope: "single" } },
      stored.outcome, searchDependencies, signal);
      return signal.aborted ? { status: "cancelled" } : { status: "succeeded", outcome };
    } catch { return { status: "failed", errorCode: "MALFORMED_OUTCOME" }; }
  }

  let outcome: GroundedAiAssistOutcome;
  try {
    outcome = await runGroundedAiAssist({ ...searchInput, turnId }, searchDependencies, signal);
  } catch {
    if (signal.aborted) return { status: "cancelled" };
    const errorCode = "UNKNOWN";
    const acknowledged = await complete(jobRpc, state.jobId, state.claimToken, { kind: "failed", errorCode });
    return acknowledged ? { status: "failed", errorCode } : { status: "pending" };
  }
  if (signal.aborted || outcome.kind === "cancelled") return { status: "cancelled" };
  const acknowledged = await complete(jobRpc, state.jobId, state.claimToken, { kind: "succeeded", result: outcome });
  return signal.aborted ? { status: "cancelled" } : acknowledged ? { status: "succeeded", outcome } : { status: "pending" };
}

async function complete(
  jobRpc: GroundedAiAssistJobRpc, jobId: string, claimToken: string,
  outcome: Readonly<{ kind: "succeeded"; result: GroundedAiAssistOutcome }> | Readonly<{ kind: "failed"; errorCode: string }>,
): Promise<boolean> {
  // Only this operation's explicit receipt proves persistence. An error or
  // unknown ACK is pending; never retry completion or call ensure as readback
  // (ensure can reclaim a stale lease and is not a read-only operation).
  try {
    const reply = await jobRpc("grounded_ai_assist_work_v1", { p_input: { action: "complete", jobId, claimToken, outcome } });
    return !reply.error && record(reply.data) && reply.data.kind === outcome.kind && reply.data.jobId === jobId
      && Object.keys(reply.data).length === 2;
  } catch { return false; }
}

type EnsureState =
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "not_applicable" }>
  | Readonly<{ kind: "pending" }>
  | Readonly<{ kind: "claimed"; jobId: string; claimToken: string }>
  | Readonly<{ kind: "done"; status: "succeeded" | "failed" | "cancelled"; outcome: unknown; errorCode: string | null }>;

function parseEnsure(value: unknown): EnsureState | null {
  if (!record(value) || typeof value.kind !== "string") return null;
  if (value.kind === "unavailable" || value.kind === "not_applicable" || value.kind === "pending") return { kind: value.kind };
  if (value.kind === "claimed") {
    if (typeof value.jobId !== "string" || typeof value.claimToken !== "string") return null;
    return { kind: "claimed", jobId: value.jobId, claimToken: value.claimToken };
  }
  if (value.kind === "done") {
    if (typeof value.status !== "string" || !["succeeded", "failed", "cancelled"].includes(value.status)) return null;
    return { kind: "done", status: value.status as "succeeded" | "failed" | "cancelled", outcome: value.outcome ?? null, errorCode: typeof value.errorCode === "string" ? value.errorCode : null };
  }
  return null;
}

function doneStatus(state: Readonly<{ kind: "done"; status: "succeeded" | "failed" | "cancelled"; outcome: unknown; errorCode: string | null }>): GroundedAiAssistJobStatus {
  if (state.status === "cancelled") return { status: "cancelled" };
  if (state.status === "failed") return { status: "failed", errorCode: state.errorCode };
  if (!record(state.outcome) || typeof state.outcome.kind !== "string"
    || !["answered", "unavailable", "budget_exhausted", "cancelled", "not_offered"].includes(state.outcome.kind)) return { status: "failed", errorCode: "MALFORMED_OUTCOME" };
  if (state.outcome.kind === "answered" && !validStoredAnswer(state.outcome)) return { status: "failed", errorCode: "MALFORMED_OUTCOME" };
  return { status: "succeeded", outcome: state.outcome as unknown as GroundedAiAssistOutcome };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validStoredAnswer(value: Record<string, unknown>): boolean {
  if ((value.coverage !== "answered" && value.coverage !== "partial")
    || !Array.isArray(value.citations) || value.citations.length > 8
    || !value.citations.every((citation) => record(citation) && typeof citation.pageKey === "string"
      && typeof citation.quote === "string" && citation.quote.length > 0 && citation.quote.length < 4000)
    || !Array.isArray(value.conflicts) || value.conflicts.length > 5
    || !Array.isArray(value.queries) || value.queries.length > 6
    || !Number.isSafeInteger(value.rounds) || Number(value.rounds) < 0 || Number(value.rounds) > 6
    || !record(value.usage) || ![value.usage.inputTokens, value.usage.outputTokens, value.usage.totalTokens]
      .every((count) => Number.isSafeInteger(count) && Number(count) >= 0)
    || !record(value.evidence) || value.evidence.schemaVersion !== "evidence-pack/2"
    || !Array.isArray(value.evidence.required) || value.evidence.required.length > 4
    || !Array.isArray(value.evidence.background) || value.evidence.background.length > 8) return false;
  return value.evidence.required.every((claim) => record(claim) && Array.isArray(claim.refs) && claim.refs.length <= 8);
}
