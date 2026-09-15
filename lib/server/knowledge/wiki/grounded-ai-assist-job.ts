import { runGroundedAiAssist, type GroundedAiAssistContextRpc, type GroundedAiAssistInput, type GroundedAiAssistOutcome } from "./grounded-ai-assist.ts";
import type { GroundedSearchDependencies } from "./grounded-search.ts";

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
  if (state.kind === "done") return doneStatus(state);

  let outcome: GroundedAiAssistOutcome;
  try {
    outcome = await runGroundedAiAssist({ ...searchInput, turnId }, searchDependencies, signal);
  } catch (error) {
    const errorCode = error instanceof Error && error.message ? error.message.slice(0, 60) : "UNKNOWN";
    await complete(jobRpc, state.jobId, state.claimToken, { kind: "failed", errorCode });
    return { status: "failed", errorCode };
  }
  await complete(jobRpc, state.jobId, state.claimToken, { kind: "succeeded", result: outcome });
  return { status: "succeeded", outcome };
}

async function complete(
  jobRpc: GroundedAiAssistJobRpc, jobId: string, claimToken: string,
  outcome: Readonly<{ kind: "succeeded"; result: GroundedAiAssistOutcome }> | Readonly<{ kind: "failed"; errorCode: string }>,
): Promise<void> {
  try { await jobRpc("grounded_ai_assist_work_v1", { p_input: { action: "complete", jobId, claimToken, outcome } }); }
  catch { /* A dropped completion self-heals: the next poll's staleness check reclaims the job. */ }
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
  if (!record(state.outcome) || typeof state.outcome.kind !== "string") return { status: "failed", errorCode: "MALFORMED_OUTCOME" };
  return { status: "succeeded", outcome: state.outcome as unknown as GroundedAiAssistOutcome };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
