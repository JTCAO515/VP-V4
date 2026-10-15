import { createHash } from "node:crypto";
import { parseAskRun, type AskRun } from "./contract.ts";
import { boundedAskPort, type AskTransport, type AskRequest, type AskObservation } from "./transport.ts";
import { selectedTurn, observeNativeEvents } from "./projection.ts";
import { record } from "../runtime-recovery/contract.ts";
import { RuntimeFailure } from "../runtime-recovery/transport.ts";
import { assertTripSnapshot } from "../../../lib/server/trip/patch/contract.ts";
import { sameRecoveryValue } from "../../../lib/server/today/recovery/service.ts";
import { gradeReadOnlyResult } from "../pairing/index.ts";
import type { SavedTurn } from "../../../lib/grounded/read-model.ts";

export type AskReport = Readonly<{
  schemaVersion: "harness-runtime-ask/1"; caseId: AskRun["caseId"] | null; mode: AskRun["mode"] | "NOT_RUN";
  outcome: "answered" | "partial" | "clarification" | "blocked" | "technical_failure" | "unknown" | "NOT_RUN";
  code: string | null; status: string | "unknown"; coverage: string | null; planDigest: string | null;
  binding: Readonly<{ ownerId: string; sessionId: string; turnId: string; taskId: string; threadId: string; policyId: string; idempotencyKey: string }> | null;
  expectation: AskRun["expectation"] | null; contextVerification: "caller_bound_not_attested";
  facts: readonly Readonly<{ factId: string; sourceRevisionIds: readonly string[] }>[];
  gaps: readonly Readonly<{ claimId: string; reasons: readonly string[] }>[];
  selectedTripUnchanged: boolean | "unknown"; tripCollectionUnchanged: "unknown";
  acknowledgement: "not_submitted" | "observed" | "unknown"; submitDispatches: number; observations: readonly AskObservation[];
  policyRechecked: boolean; usage: "unknown"; cost: "unknown"; userQuotaDebit: "unknown"; originalKeyReadback: "unknown";
  existingGrader: ReturnType<typeof gradeReadOnlyResult> | null; requiredModeVerdict: "NOT_RUN"; fullAcceptance: "NOT_RUN";
  nativeConsumer: "transport_parser_observation" | "NOT_RUN"; webConsumer: "NOT_RUN";
}>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Invokable H1 acquisition: existing Native policy/history/explicit single submit,
 * finite events/readback, then current eligibility and Trip observations. No live defaults. */
export async function runRuntimeAsk(input: unknown, transport?: AskTransport, signal: AbortSignal = new AbortController().signal): Promise<AskReport> {
  const run = parseAskRun(input);
  const base: AskReport = {
    schemaVersion: "harness-runtime-ask/1", caseId: run?.caseId ?? null, mode: "NOT_RUN", outcome: "NOT_RUN", code: run ? null : "INVALID_INPUT",
    status: "unknown", coverage: null, planDigest: run ? hash(run) : null,
    binding: run ? { ownerId: run.context.ownerId, sessionId: run.context.sessionId, turnId: run.submission.turnId, taskId: run.submission.serviceTask.id,
      threadId: run.submission.threadId, policyId: run.context.policyId, idempotencyKey: run.submission.idempotencyKey } : null,
    expectation: run?.expectation ?? null, contextVerification: "caller_bound_not_attested", facts: [], gaps: [], selectedTripUnchanged: "unknown",
    tripCollectionUnchanged: "unknown", acknowledgement: "not_submitted", submitDispatches: 0, observations: [], policyRechecked: false,
    usage: "unknown", cost: "unknown", userQuotaDebit: "unknown", originalKeyReadback: "unknown",
    existingGrader: run?.caseId === "H01" ? gradeReadOnlyResult(null) : null, requiredModeVerdict: "NOT_RUN", fullAcceptance: "NOT_RUN",
    nativeConsumer: "NOT_RUN", webConsumer: "NOT_RUN",
  };
  if (!run || typeof transport !== "function" || signal.aborted) return Object.freeze({ ...base, code: signal.aborted ? "CANCELLED" : base.code });
  const remaining = Date.parse(run.bounds.deadlineAt) - Date.now();
  if (remaining <= 0) return Object.freeze({ ...base, code: "TIMEOUT_BEFORE_OUTPUT" });
  Object.freeze(run.context); Object.freeze(run.submission.serviceTask); Object.freeze(run.submission);
  Object.freeze(run.bounds); Object.freeze(run.expectation.factIds); Object.freeze(run.expectation.sourceRevisionIds); Object.freeze(run.expectation.gapIds);
  Object.freeze(run.expectation); Object.freeze(run);
  const started = performance.now(), milliseconds = Math.min(run.bounds.timeoutMs, remaining), deadline = started + milliseconds;
  const controller = new AbortController(), abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; abort(); }, milliseconds);
  const port = boundedAskPort(transport, run.bounds, controller.signal, deadline);
  const request = (name: AskRequest["port"], cursor: number | null = null): AskRequest => ({ port: name, body: name === "submit" ? run.submission : null,
    turnId: name === "events" ? run.submission.turnId : null, tripId: name === "trip" ? run.currentTripId : null, cursor });
  const checked = async (name: AskRequest["port"], cursor: number | null = null) => {
    const session = await port.call(request("session"));
    if (!record(session) || session.version !== 2 || session.subject !== run.context.ownerId || session.sessionId !== run.context.sessionId
      || session.mobileEpoch !== run.context.mobileEpoch) throw new RuntimeFailure("UNAUTHENTICATED");
    return port.call(request(name, cursor));
  };
  const policyRead = async () => {
    const reply = await checked("policy");
    const p = record(reply) && record(reply.policy) ? reply.policy : null;
    if (!record(reply) || reply.version !== 4 || reply.kind !== "policy" || !p || p.id !== run.context.policyId || p.consentState !== "accepted"
      || p.noticeHash !== run.context.noticeHash || p.noticeVersion !== run.context.noticeVersion || typeof p.expiresAt !== "string"
      || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= Date.now()) throw new RuntimeFailure("DATA_POLICY_BLOCKED");
    return reply;
  };
  const tripRead = async () => {
    if (run.currentTripId === null) return null;
    try {
      const value = await checked("trip");
      if (!record(value) || value.version !== 2 || !record(value.trip) || value.trip.id !== run.currentTripId || !record(value.content)) return null;
      if (typeof value.trip.headVersion !== "number" || !Number.isSafeInteger(value.trip.headVersion) || value.trip.headVersion < 0) return null;
      const snapshot = { version: value.trip.headVersion, title: value.content.title, days: value.content.days };
      try { assertTripSnapshot(snapshot); } catch { return null; }
      return { version: snapshot.version, digest: hash(value.content) };
    } catch (error) { if (error instanceof RuntimeFailure && error.code === "PROVIDER_UNAVAILABLE") return null; throw error; }
  };
  let acknowledgement: AskReport["acknowledgement"] = "not_submitted", selectedTripUnchanged: AskReport["selectedTripUnchanged"] = "unknown";
  let turn: SavedTurn | null = null, policyRechecked = false, outcome: AskReport["outcome"] = "unknown", code: string | null = null;
  try {
    const initialPolicy = await policyRead();
    turn = selectedTurn(await checked("history"), initialPolicy, run, performance.now() - started);
    const before = await tripRead();
    if (!turn) {
      // Recheck current notice/consent immediately before the only dispatch. No consent action is reachable.
      const freshPolicy = await policyRead();
      if (!sameRecoveryValue(freshPolicy, initialPolicy)) throw new RuntimeFailure("DATA_POLICY_BLOCKED");
      acknowledgement = "unknown";
      try {
        const ack = await checked("submit");
        if (!record(ack) || ack.version !== 4 || ack.kind !== "accepted" || ack.turnId !== run.submission.turnId
          || ack.serviceTaskId !== run.submission.serviceTask.id || ack.scopeVersion !== 1 || ack.relationship !== run.submission.serviceTask.relationship
          || ack.parentTurnId !== run.submission.serviceTask.parentTurnId || typeof ack.reused !== "boolean") throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
        acknowledgement = "observed";
      } catch (error) {
        // Transport/ACK failure remains unknown; only reads follow. Never retry the POST.
        if (!(error instanceof RuntimeFailure) || !["PROVIDER_UNAVAILABLE", "MODEL_OUTPUT_INVALID", "TIMEOUT_AFTER_OUTPUT", "TIMEOUT_BEFORE_OUTPUT"].includes(error.code)) throw error;
      }
    }
    let cursor = 0;
    for (let poll = 0; poll < run.bounds.maxPolls; poll++) {
      port.check();
      const currentPolicy = await policyRead();
      const observed = observeNativeEvents(await checked("events", cursor), cursor, currentPolicy, run, performance.now() - started, port.check);
      cursor = observed.cursor;
      turn = selectedTurn(await checked("history"), currentPolicy, run, performance.now() - started);
      if (turn && turn.outcome !== null) break;
    }
    const finalPolicy = await policyRead();
    turn = selectedTurn(await checked("history"), finalPolicy, run, performance.now() - started);
    const after = await tripRead();
    // A final notice/session check fences delayed responses and qualification changes.
    const lastPolicy = await policyRead();
    if (!sameRecoveryValue(finalPolicy, lastPolicy)) throw new RuntimeFailure("DATA_POLICY_BLOCKED");
    policyRechecked = true; port.check();
    if (before && after) selectedTripUnchanged = before.version === after.version && before.digest === after.digest;
    if (turn?.projection === "unavailable") throw new RuntimeFailure("DATA_EXPIRED");
    if (turn && typeof turn.outcome === "string" && ["answered", "partial", "clarification", "blocked", "technical_failure"].includes(turn.outcome)) outcome = turn.outcome as AskReport["outcome"];
  } catch (error) { code = timedOut ? port.observations.some(o => o.bytes > 0) ? "TIMEOUT_AFTER_OUTPUT" : "TIMEOUT_BEFORE_OUTPUT"
    : error instanceof RuntimeFailure ? error.code : "MODEL_OUTPUT_INVALID"; outcome = "unknown"; turn = null; }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  // Emit only currently validated factual/source IDs and canonical gap reasons; no input/answer/Trip/notice text.
  return Object.freeze({ ...base, mode: run.mode, outcome, code, status: turn?.status ?? "unknown", coverage: turn?.coverage ?? null,
    facts: Object.freeze((turn?.facts ?? []).map(f => Object.freeze({ factId: f.id, sourceRevisionIds: Object.freeze(f.sources.map(s => s.id)) }))),
    gaps: Object.freeze((turn?.claimGaps ?? []).map(g => Object.freeze({ claimId: g.id, reasons: Object.freeze([...g.reasons]) }))),
    selectedTripUnchanged, acknowledgement, submitDispatches: port.observations.filter(o => o.port === "submit").length,
    policyRechecked, observations: Object.freeze([...port.observations]), nativeConsumer: "transport_parser_observation" });
}

export function askReportArtifacts(report: AskReport): Readonly<{ json: string; markdown: string }> {
  const json = JSON.stringify(report, null, 2) + "\n";
  if (Buffer.byteLength(json) > 32768) throw new RuntimeFailure("INVALID_INPUT");
  return Object.freeze({ json, markdown: `Ask ${report.caseId ?? "unknown"}: ${report.outcome}\n\nMode: ${report.mode}; status: ${report.status}; error: ${report.code ?? "none"}.\n\nCurrent facts: ${report.facts.length}; gaps: ${report.gaps.length}; selected Trip unchanged: ${report.selectedTripUnchanged}; full Trip collection: unknown.\n\nPOST dispatches: ${report.submitDispatches}; ACK: ${report.acknowledgement}; current policy rechecked: ${report.policyRechecked}.\n\nUsage, cost, quota, original key readback and context attestation: unknown. Required mode and full acceptance: NOT_RUN.\n` });
}
