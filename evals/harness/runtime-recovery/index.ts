import { createHash } from "node:crypto";
import { decodeAssistantEvents, ASSISTANT_EVENTS_LIMIT } from "../../../lib/server/turn/assistant-events/protocol.ts";
import { readLocalRecoveryOperation, sameRecoveryValue, type RecoveryOperationReceipt } from "../../../lib/server/today/recovery/service.ts";
import { exact, integer } from "../../../lib/server/today/recovery/contract.ts";
import { parseRun, record, type RecoveryRun } from "./contract.ts";
import { createBoundedPort, RuntimeFailure, type RuntimeTransport, type Observation } from "./transport.ts";
import type { FailureCode } from "../../../lib/server/contracts/errors/index.ts";
import { assertTripSnapshot } from "../../../lib/server/trip/patch/contract.ts";

export type RecoveryReport = Readonly<{
  schemaVersion: "harness-runtime-recovery/1";
  scenario: "H09" | "H10" | null; mode: "controlled" | "staging" | "NOT_RUN";
  outcome: "applied" | "cancelled" | "unknown" | "NOT_RUN";
  code: FailureCode | null; source: RecoveryRun["context"]["source"] | null;
  sourceVerification: "caller_bound_not_attested" | "NOT_RUN";
  binding: Readonly<{ taskId: string; turnId: string; tripId: string; operationId: string | null; proposalId: string | null; idempotencyKey: string | null }> | null;
  taskState: string | "unknown"; tripVersion: number | "unknown";
  lateEventsIgnored: number;
  receipt: Readonly<{ operationId: string; proposalId: string; proposalRevision: number; contextDigest: string; resultingVersion: number | null }> | null;
  confirmDispatches: number; cancelDispatches: number; acknowledgement: "observed" | "unknown" | "not_dispatched";
  commitCount: "unknown"; quotaDebit: "unknown"; providerUsage: "unknown"; vendorCost: "unknown";
  taskTripCausalLink: "unknown"; idempotencyReadback: "unknown";
  observations: readonly Observation[];
  fullAcceptance: "NOT_RUN";
}>;
const terminals = new Set(["completed", "proposal_ready", "unavailable", "failed", "cancelled"]);
const hashValue = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** Drive existing authorized ports. There is no task creator, worker executor, retry,
 * journal writer, accounting settlement, or implicit live transport in this module. */
export async function runRuntimeRecovery(input: unknown, transport?: RuntimeTransport, signal: AbortSignal = new AbortController().signal): Promise<RecoveryReport> {
  const run = parseRun(input);
  const base: RecoveryReport = {
    schemaVersion: "harness-runtime-recovery/1", scenario: run?.scenario ?? null, mode: "NOT_RUN", outcome: "NOT_RUN",
    code: run ? null : "INVALID_INPUT", source: run?.context.source ?? null, sourceVerification: "NOT_RUN",
    binding: run ? { taskId: run.context.taskId, turnId: run.context.turnId, tripId: run.context.tripId,
      operationId: run.operation?.operationId ?? null, proposalId: run.proposalId, idempotencyKey: run.idempotencyKey } : null,
    taskState: "unknown", tripVersion: "unknown", lateEventsIgnored: 0, receipt: null, confirmDispatches: 0, cancelDispatches: 0,
    acknowledgement: "not_dispatched", commitCount: "unknown", quotaDebit: "unknown", providerUsage: "unknown", vendorCost: "unknown",
    taskTripCausalLink: "unknown", idempotencyReadback: "unknown",
    observations: [], fullAcceptance: "NOT_RUN",
  };
  if (!run || typeof transport !== "function" || signal.aborted) return Object.freeze({ ...base, code: signal.aborted ? "CANCELLED" : base.code });
  // Freeze a detached binding before any asynchronous operation (caller mutation cannot redirect it).
  Object.freeze(run.context.source); Object.freeze(run.context); Object.freeze(run.operation); Object.freeze(run);
  const controller = new AbortController();
  const deadline = performance.now() + run.timeoutMs;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; abort(); }, run.timeoutMs);
  const port = createBoundedPort(transport, run.context, run.maxRequests, controller.signal, deadline);
  let taskState = "unknown", cursor = 0, retired = false;
  let lateEventsIgnored = 0;
  let tripVersion: number | "unknown" = "unknown", receipt: RecoveryReport["receipt"] = null;
  let acknowledgement: RecoveryReport["acknowledgement"] = "not_dispatched";
  let outcome: RecoveryReport["outcome"] = "unknown", code: FailureCode | null = null;
  const checked = async (name: Parameters<typeof port.call>[0], params: Record<string, unknown>) => {
    const session = await port.call("native_session_v2", { p_action: "session" });
    if (!record(session) || session.version !== 2 || session.subject !== run.context.ownerId
      || session.sessionId !== run.context.sessionId || session.mobileEpoch !== run.context.mobileEpoch) throw new RuntimeFailure("UNAUTHENTICATED");
    return port.call(name, params);
  };
  const replay = async () => {
    for (let n = 0; n < run.replayPages; n++) {
      const value = await checked("read_assistant_events_v1", { p_policy_id: run.context.policyId,
        p_conversation_id: run.context.conversationId, p_after_sequence: cursor, p_limit: ASSISTANT_EVENTS_LIMIT });
      let page;
      try { page = decodeAssistantEvents(value, run.context.conversationId, cursor); }
      catch { throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); }
      for (const event of page.events) {
        if (event.type === "source_retired") { retired = true; continue; }
        if (event.taskId !== run.context.taskId || event.turnId !== run.context.turnId) continue;
        if (taskState === "cancelled" && event.type !== "task_status") {
          if (event.type === "task_progress" && event.state === "started" || event.type === "artifact_ready" || event.type === "artifact_updated")
            throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
          lateEventsIgnored += 1;
        }
        if (event.type === "task_status") {
          if (terminals.has(taskState) && event.status !== taskState) throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
          taskState = event.status;
        }
      }
      cursor = page.lastSequence;
      if (retired) throw new RuntimeFailure("DATA_POLICY_BLOCKED");
      if (!page.hasMore) return;
    }
    throw new RuntimeFailure("SERVICE_TASK_CAPACITY_EXHAUSTED");
  };
  const operationRead = async (): Promise<RecoveryOperationReceipt | null> => {
    if (!run.operation) return null;
    let operation: RecoveryOperationReceipt;
    try {
      operation = await readLocalRecoveryOperation(run.context.tripId, run.operation.operationId, async (name, params) => {
        if (name !== "read_local_recovery_operation_v1") throw new RuntimeFailure("INVALID_INPUT");
        return { data: await checked(name, params), error: null };
      });
    } catch (e) { if (e instanceof RuntimeFailure) throw e; throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); }
    const r = operation.receipt;
    if (!sameRecoveryValue(operation.input, run.operation) || r.proposalId !== run.proposalId || r.proposalRevision !== run.proposalRevision
      || r.baseVersion !== run.baseVersion) throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
    receipt = { operationId: r.operationId, proposalId: r.proposalId, proposalRevision: r.proposalRevision,
      contextDigest: r.contextDigest, resultingVersion: operation.resultingVersion };
    return operation;
  };
  const tripRead = async () => {
    const value = await checked("trip_reload", { tripId: run.context.tripId });
    if (!record(value) || value.version !== 2 || !record(value.trip) || value.trip.id !== run.context.tripId
      || !integer(value.trip.headVersion) || !record(value.content) || !Array.isArray(value.content.days)) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
    tripVersion = value.trip.headVersion;
    try { assertTripSnapshot({ version: tripVersion, title: value.content.title, days: value.content.days }); }
    catch { throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); }
    if (value.content.days.length > 366 || value.content.days.reduce((n, d) => n + (record(d) && Array.isArray(d.items) ? d.items.length : 0), 0) > 500)
      throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
    return { headVersion: tripVersion, contentDigest: hashValue(value.content) };
  };
  const proposalRead = async (pending: boolean) => {
    if (run.proposalId === null) return;
    const value = await checked("read_trip_proposal_v2", { p_proposal_id: run.proposalId });
    const row = Array.isArray(value) && value.length === 1 ? value[0] : null;
    const p = record(row) && record(row.proposal) ? row.proposal : null;
    if (!p || !record(row) || row.digest !== run.digest || p.id !== run.proposalId || p.owner_id !== run.context.ownerId
      || p.trip_id !== run.context.tripId || p.revision !== run.proposalRevision || p.base_trip_version !== run.baseVersion)
      throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
    if (pending && (p.status !== "pending" || typeof p.expires_at !== "string" || !Number.isFinite(Date.parse(p.expires_at))
      || Date.parse(p.expires_at) <= Date.now())) throw new RuntimeFailure("PROPOSAL_NOT_CONFIRMABLE");
  };
  try {
    await replay();
    if (taskState === "unknown") throw new RuntimeFailure("NO_ELIGIBLE_EVIDENCE");
    const before = await tripRead();
    const initial = await operationRead();
    if (run.scenario === "H09" && run.action === "confirm_once") {
      if (taskState === "cancelled" || taskState === "failed" || taskState === "unavailable" || initial?.state !== "pending" || before.headVersion !== run.baseVersion)
        throw new RuntimeFailure("PROPOSAL_NOT_CONFIRMABLE");
      await proposalRead(true);
      // The explicit invocation must already represent the user's visible-diff confirmation.
      // Only the existing immutable production confirm RPC can apply it. Never retry this RPC.
      // Mark dispatch intent conservatively: a failed session precheck can still mean no actual dispatch.
      const active = await port.call("native_session_v2", { p_action: "session" });
      if (!record(active) || active.version !== 2 || active.subject !== run.context.ownerId || active.sessionId !== run.context.sessionId
        || active.mobileEpoch !== run.context.mobileEpoch) throw new RuntimeFailure("UNAUTHENTICATED");
      acknowledgement = "unknown";
      try {
        const ack = await port.call("confirm_and_apply_trip_proposal", { p_proposal_id: run.proposalId, p_idempotency_key: run.idempotencyKey, p_digest: run.digest });
        const row = Array.isArray(ack) && ack.length === 1 ? ack[0] : null;
        if (!record(row) || !exact(row, ["outcome", "resulting_version"]) || !["applied", "already_applied"].includes(String(row.outcome))
          || row.resulting_version !== run.baseVersion + 1) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        acknowledgement = "observed";
      } catch (e) {
        // Unknown ACK is reconciled by reads only. Authorization/conflict errors stop immediately.
        if (e instanceof RuntimeFailure && ["UNAUTHENTICATED", "FORBIDDEN", "INVALID_INPUT", "IDEMPOTENCY_KEY_REUSE", "STALE_TRIP_VERSION", "SERVICE_TASK_CONFLICT"].includes(e.code)) throw e;
      }
    }
    if (run.scenario === "H10" && run.action === "cancel" && !terminals.has(taskState)) {
      // ACK is insufficient: only a source-bound terminal replay proves cancellation.
      acknowledgement = "unknown";
      try {
        const ack = await checked("cancel_chat_turn", { p_turn_id: run.context.turnId });
        const row = Array.isArray(ack) && ack.length === 1 ? ack[0] : null;
        if (!record(row) || !exact(row, ["sequence", "state"]) || !integer(row.sequence, 1) || row.state !== "cancelled") throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        acknowledgement = "observed";
      }
      catch (e) { if (e instanceof RuntimeFailure && ["UNAUTHENTICATED", "FORBIDDEN", "INVALID_INPUT"].includes(e.code)) throw e; }
    }
    await replay(); // consumes late replies as observations; has no apply capability
    const final = await operationRead();
    if (initial && final && !sameRecoveryValue({ ...initial.receipt, reused: true }, { ...final.receipt, reused: true }))
      throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
    await proposalRead(false);
    const raw = run.proposalId === null ? [] : await checked("read_trip_confirmation_receipt_v1", { p_proposal_id: run.proposalId });
    if (!Array.isArray(raw) || raw.length > 1) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
    const confirmed = raw[0];
    if (confirmed !== undefined && (!record(confirmed) || !exact(confirmed, ["proposal_id", "trip_id", "resulting_version"])
      || confirmed.proposal_id !== run.proposalId || confirmed.trip_id !== run.context.tripId || confirmed.resulting_version !== run.baseVersion + 1))
      throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
    const after = await tripRead();
    await replay(); // final authority and late terminal fence before classifying
    if (performance.now() >= deadline) throw new RuntimeFailure("TIMEOUT_AFTER_OUTPUT");
    if (controller.signal.aborted) throw new RuntimeFailure("CANCELLED");
    if (final?.state === "applied" && confirmed !== undefined && after.headVersion === final.resultingVersion) outcome = "applied";
    else if (run.scenario === "H10" && taskState === "cancelled" && confirmed === undefined && final?.state !== "applied"
      && before.headVersion === run.baseVersion && after.headVersion === run.baseVersion && before.contentDigest === after.contentDigest) outcome = "cancelled";
    // A cancelled task with an earlier committed Trip remains applied; this is never an undo claim.
  } catch (e) {
    code = timedOut ? port.observations.some(o => o.bytes > 0) ? "TIMEOUT_AFTER_OUTPUT" : "TIMEOUT_BEFORE_OUTPUT" : e instanceof RuntimeFailure ? e.code : "INTERNAL_ERROR";
    outcome = "unknown";
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  return Object.freeze({ ...base, mode: run.mode, outcome, code, sourceVerification: "caller_bound_not_attested",
    taskState, tripVersion, lateEventsIgnored, receipt,
    confirmDispatches: port.observations.filter(o => o.request === "confirm_and_apply_trip_proposal").length,
    cancelDispatches: port.observations.filter(o => o.request === "cancel_chat_turn").length,
    acknowledgement, observations: Object.freeze([...port.observations]) });
}

export function recoveryReportArtifacts(report: RecoveryReport): Readonly<{ json: string; markdown: string }> {
  const json = JSON.stringify(report, null, 2) + "\n";
  if (Buffer.byteLength(json) > 32768) throw new RuntimeFailure("INVALID_INPUT");
  const markdown = `Runtime recovery ${report.scenario ?? "unknown"}: ${report.outcome}\n\nMode: ${report.mode}. Full acceptance: ${report.fullAcceptance}.\n\nTask: ${report.taskState}; Trip version: ${report.tripVersion}; acknowledgement: ${report.acknowledgement}.\n\nCommit count, quota debit, provider usage, vendor cost, task-to-Trip causal link and original idempotency readback: unknown. Source revisions are caller-bound, not attested.\n\nRequests observed: ${report.observations.length}; error: ${report.code ?? "none"}.\n`;
  return Object.freeze({ json, markdown });
}
