import { CostGuard } from "../model-gateway/budget/index.ts";
import { invokeKnowledgeIntentProtocol, PROTOCOL_MODELS, type ProtocolTransport } from "../model-gateway/adapters/provider-protocol.ts";
import { validateKnowledgeIntent, type KnowledgeIntent } from "../knowledge/claim/intent.ts";

/**
 * A standalone testing chatbot ("VP-V4 内部测试网站", 2026-09-16) needs the
 * real grounded-turn/1 pipeline to actually answer a submitted question,
 * but no worker process for it has ever been deployed anywhere (every
 * VPJ-76 slice this session found the same gap for the *supplementary*
 * AI-assist path; this is the same gap for the *primary* authoritative
 * path). `lib/server/turn/text-worker.ts`'s `runTextWorker` is the real,
 * already-shipped worker logic -- but it drains the *generic*
 * `claim_turn_work()` queue, which VPJ-16's own migration
 * (20260912190000_vpj_16_grounded_turn.sql) deliberately excludes grounded
 * (`knowledge_intent_v1`) work from (`not exists (... context_mode in
 * ('task_history_v1','knowledge_intent_v1'))`). Grounded work is claimed
 * only through the separate, owner+policy-scoped `claim_grounded_work`.
 *
 * That scoping is exactly what makes a synchronous, pull-driven,
 * per-request worker safe here (the same reasoning as VPJ-76 slice 8's
 * `grounded_ai_assist_work_v1`): passing the *caller's own, already-
 * verified* ownerId means this can only ever claim and complete that
 * caller's own queued turn, never another user's, even though the RPCs
 * themselves run as service_role. This file does not touch
 * `durable-worker.ts`/`text-worker.ts` (shared, already-tested production
 * code for the generic queue) -- it adapts the same completion logic
 * `runTextWorker`'s grounded branch already implements, driven by the
 * different, owner-scoped claim RPC instead.
 */

export type TestingGroundedWorkerRpc = (
  name: "claim_grounded_work" | "read_grounded_work" | "authorize_grounded_dispatch" | "complete_grounded_work" | "complete_grounded_work_with_needs" | "complete_grounded_place_work",
  params: Readonly<Record<string, string>>,
) => Promise<unknown>;

/** The caller builds `transport` itself (createProviderHttpTransport with its own credential/recordDestination), matching runTextWorker's TextProviderBinding convention -- this function never sees the raw credential. */
export type TestingGroundedWorkerBinding = Readonly<{
  provider: keyof typeof PROTOCOL_MODELS;
  endpoint: string;
  transport: ProtocolTransport;
  maxOutputTokens: number;
  timeoutMs: number;
}>;

export type TestingGroundedWorkerOutcome = "empty" | "processed" | "unavailable";

/**
 * One claim-and-complete attempt for a specific, already-authenticated
 * owner's own queued grounded turn. Never claims another owner's work
 * (claim_grounded_work is itself owner+policy-scoped in SQL). Returns
 * "empty" when nothing of this owner's is queued (including "already
 * being processed by a concurrent request" -- the lease simply isn't
 * free yet), "processed" once a turn's terminal result has been written,
 * "unavailable" on an unexpected failure (safe to retry).
 */
export async function runTestingGroundedWorkerOnce(
  ownerId: string, policyId: string, rpc: TestingGroundedWorkerRpc, binding: TestingGroundedWorkerBinding, signal: AbortSignal,
): Promise<TestingGroundedWorkerOutcome> {
  if (signal.aborted) return "unavailable";
  let raw: unknown;
  try { raw = await rpc("claim_grounded_work", { p_owner_id: ownerId, p_policy_id: policyId }); }
  catch { return "unavailable"; }
  if (!record(raw)) return "unavailable";
  if (raw.kind === "empty") return "empty";
  if (raw.kind !== "leased" || typeof raw.turnId !== "string" || typeof raw.leaseToken !== "string") return "unavailable";
  const keys = { p_turn_id: raw.turnId, p_lease_token: raw.leaseToken };

  let input: unknown;
  try { input = await rpc("read_grounded_work", keys); } catch { return "unavailable"; }
  if (!record(input) || input.kind !== "intent_input" || typeof input.text !== "string" || !input.text.trim()
    || typeof input.locale !== "string" || !["zh", "en"].includes(input.locale)
    || input.provider !== binding.provider || input.endpoint !== binding.endpoint
    || typeof input.contextDigest !== "string") return "unavailable";

  const guard = new CostGuard({ windowMs: 120000, perUserAttempts: 1, perTaskAttempts: 1, turnDeadlineMs: 120000, maxModelSteps: 1, maxToolSteps: 1 })
    .startTurn({ userId: ownerId, taskId: raw.turnId });
  if (guard.kind !== "turn") return "unavailable";

  const authorizeRpc = async (name: "read_grounded_work" | "authorize_grounded_dispatch", params: Readonly<Record<string, string>>) => rpc(name, params);
  const outcome = await invokeKnowledgeIntentProtocol(
    { turnId: raw.turnId, leaseToken: raw.leaseToken },
    { provider: binding.provider, endpoint: binding.endpoint, maxOutputTokens: binding.maxOutputTokens, timeoutMs: binding.timeoutMs },
    authorizeRpc, guard, binding.transport, signal,
  );

  let intent: KnowledgeIntent | null = null;
  if (outcome.kind === "protocol_validated" && typeof outcome.output === "string") {
    try {
      const validation = validateKnowledgeIntent(JSON.parse(outcome.output), input.text);
      intent = validation.kind === "valid" ? validation.value : null;
      if (intent && intent.unansweredNeeds === undefined) intent = null; // v5 output must identify gaps explicitly.
    } catch { /* Never persist arbitrary model text; falls through to the denied/technical_failure branch below. */ }
  }
  const denied = outcome.kind === "unavailable" && ["SAFETY_BLOCKED", "DATA_POLICY_BLOCKED"].includes(outcome.code);
  let completed: unknown;
  try {
    completed = await rpc(
      intent?.placeName ? "complete_grounded_place_work" : intent?.unansweredNeeds ? "complete_grounded_work_with_needs" : "complete_grounded_work",
      {
        ...keys,
        ...(intent?.placeName ? { p_place_name: intent.placeName } : {}),
        ...(intent?.unansweredNeeds ? { p_unanswered_needs: JSON.stringify(intent.unansweredNeeds) } : {}),
        p_intent: intent?.intent ?? (denied ? "blocked" : "technical_failure"),
        p_request_scope: intent?.requestScope ?? "unknown",
      },
    );
  } catch { return "unavailable"; }
  if (!record(completed) || completed.kind !== "finished") return "unavailable";
  return "processed";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
