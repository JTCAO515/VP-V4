import { createHash } from "node:crypto";
import { parseAskRun } from "../runtime-ask/contract.ts";
import { runRuntimeAsk, type AskReport } from "../runtime-ask/index.ts";
import { RuntimeFailure } from "../runtime-recovery/transport.ts";
import { parseInventory, INVENTORY_COVERAGE, stableJSON, type TripInventory } from "../../../lib/server/trip/inventory/contract.ts";
import { inventoryBudget, type InventoryTransport, type InventoryObservation } from "./transport.ts";

type SnapshotMetadata = Readonly<{ count: number; digest: string; trips: readonly Readonly<{ id: string; headVersion: number; bytes: number; sha256: string }>[] }>;
export type InventoryReport = Readonly<{
  schemaVersion: "harness-trip-inventory/1"; coverage: typeof INVENTORY_COVERAGE; state: "observed" | "unknown" | "NOT_RUN";
  tripCollectionUnchanged: boolean | "unknown"; reason: string | null; before: SnapshotMetadata | null; after: SnapshotMetadata | null;
  ask: AskReport | null; submitDispatches: number; observations: readonly InventoryObservation[];
  originAuthentication: "unknown"; contextAttestation: "unknown"; usage: "unknown"; attemptCompleteness: "unknown";
  requiredModeVerdict: "NOT_RUN"; finalAcceptance: "NOT_RUN";
}>;
const metadata = (snapshot: TripInventory): SnapshotMetadata => ({ count: snapshot.count, digest: snapshot.digest, trips: snapshot.trips.map(t => {
  const bytes = stableJSON(t); return { id: t.id, headVersion: t.headVersion, bytes: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") };
}) });
/** H04 acquisition: complete before -> original one-submit driver -> complete after.
 * Raw canonical content stays in this invocation and is never put in the report. */
export async function acquireH04TripInventory(input: unknown, transport?: InventoryTransport, signal: AbortSignal = new AbortController().signal): Promise<InventoryReport> {
  const run = parseAskRun(input);
  const base: InventoryReport = { schemaVersion: "harness-trip-inventory/1", coverage: INVENTORY_COVERAGE, state: "NOT_RUN", tripCollectionUnchanged: "unknown", reason: null,
    before: null, after: null, ask: null, submitDispatches: 0, observations: [], originAuthentication: "unknown", contextAttestation: "unknown", usage: "unknown", attemptCompleteness: "unknown", requiredModeVerdict: "NOT_RUN", finalAcceptance: "NOT_RUN" };
  if (!run || run.caseId !== "H04" || typeof transport !== "function") return { ...base, reason: "INVALID_INPUT" };
  const started = performance.now(), milliseconds = Math.min(run.bounds.timeoutMs, Date.parse(run.bounds.deadlineAt) - Date.now());
  if (milliseconds <= 0 || signal.aborted) return { ...base, reason: signal.aborted ? "CANCELLED" : "TIMEOUT_BEFORE_OUTPUT" };
  const controller = new AbortController(), abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  const timer = setTimeout(abort, milliseconds), deadline = started + milliseconds;
  const port = inventoryBudget(transport, run.bounds, controller.signal, deadline);
  let before: TripInventory | null = null, after: TripInventory | null = null, ask: AskReport | null = null, reason: string | null = null;
  const session = async () => {
    const r = await port.call({ port: "session", body: null, tripId: null, turnId: null, cursor: null });
    if (!r.ok) throw new RuntimeFailure("UNAUTHENTICATED"); const s = await r.json(); port.check();
    if (s?.version !== 2 || s.subject !== run.context.ownerId || s.sessionId !== run.context.sessionId || s.mobileEpoch !== run.context.mobileEpoch) throw new RuntimeFailure("UNAUTHENTICATED");
  };
  const observe = async () => {
    await session(); const response = await port.call({ port: "inventory" });
    if (!response.ok) throw new RuntimeFailure("PROVIDER_UNAVAILABLE");
    const snapshot = parseInventory(await response.json()); port.check();
    if (!snapshot || snapshot.ownerId !== run.context.ownerId) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
    await session(); port.check(); return snapshot;
  };
  let submits = 0;
  try {
    before = await observe();
    // Reserve after's session/inventory/session requests; the global port also enforces all actual bytes.
    const maxRequests = run.bounds.maxRequests - port.requests - 3, maxTotalBytes = run.bounds.maxTotalBytes - port.bytes;
    const timeoutMs = Math.floor(deadline - performance.now());
    if (maxRequests < 1 || maxTotalBytes < 1 || timeoutMs < 1) throw new RuntimeFailure("RATE_LIMITED");
    ask = await runRuntimeAsk({ ...run, bounds: { ...run.bounds, maxRequests, maxTotalBytes, maxResponseBytes: Math.min(run.bounds.maxResponseBytes, maxTotalBytes), timeoutMs } }, async (request, s) => {
      port.check(); if (request.port === "submit" && ++submits > 1) throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
      return port.call(request, s);
    }, controller.signal);
    port.check();
    if (ask.code !== null || ask.outcome === "unknown" || ask.outcome === "NOT_RUN") throw new RuntimeFailure("PROVIDER_UNAVAILABLE");
    after = await observe(); port.check();
  } catch (error) { reason = error instanceof RuntimeFailure ? error.code : "PROVIDER_UNAVAILABLE"; after = null; }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  // No content disclosure after abort/deadline, including a late Ask result.
  if (controller.signal.aborted || performance.now() >= deadline) { before = null; after = null; ask = null; reason = "CANCELLED"; }
  const result: InventoryReport = { ...base, state: before ? after ? "observed" : "unknown" : "NOT_RUN", reason,
    before: before ? metadata(before) : null, after: after ? metadata(after) : null, ask, submitDispatches: submits,
    tripCollectionUnchanged: before && after ? before.digest === after.digest : "unknown", observations: [...port.observations] };
  if (controller.signal.aborted || performance.now() >= deadline) return { ...result, state: "unknown", tripCollectionUnchanged: "unknown", reason: "CANCELLED", before: null, after: null, ask: null };
  return result;
}
