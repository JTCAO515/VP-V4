/** Service-only transport; it must enforce a finite database request timeout. */
export type TurnWorkRpc = (name: "enqueue_turn_work" | "claim_turn_work" | "finish_turn_work", params: Readonly<Record<string, string | number>>) => Promise<unknown>;
export type DurableTurnLease = Readonly<{ turnId: string; ownerId: string; attempt: number; leaseToken: string; leaseMs: number }>;
export type TurnWorkOutcome = "completed" | "provider_failure" | "validation_failure" | "persisted";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One metadata work item per invocation. No route, timer, Provider or paid work is
 * enabled here. A future executor must enforce policy and the existing durable
 * model budget for EVERY attempt, validate output, and persist it before completed.
 * Lease recovery is at-least-once execution; only the current lease can finish.
 */
export async function runDurableTurnWork(
  rpc: TurnWorkRpc,
  execute: (lease: DurableTurnLease, signal: AbortSignal) => Promise<TurnWorkOutcome>,
  signal: AbortSignal,
): Promise<"empty" | "finished" | "queued" | "unavailable"> {
  if (signal.aborted) return "unavailable";
  let raw: unknown;
  try { raw = await rpc("claim_turn_work", {}); } catch { return "unavailable"; }
  if (record(raw) && raw.kind === "empty") return "empty";
  const lease = parseLease(raw);
  if (!lease || signal.aborted) return "unavailable";
  // The lease began in PostgreSQL before the response arrived. This local timeout
  // is only a resource bound; PostgreSQL performs the authoritative expiry check.
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, lease.leaseMs);
  let onAbort = () => {};
  const interrupted = new Promise<null>((resolve) => {
    onAbort = () => resolve(null);
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const work = Promise.resolve().then(async () => {
      if (controller.signal.aborted) return null;
      try { return await execute(lease, controller.signal); } catch { return null; }
    });
    const outcome = await Promise.race([work, interrupted]);
    // A content executor can own its atomic answer + terminal transaction.
    if (outcome === "persisted" && !controller.signal.aborted) return "finished";
    // Unknown execution/acknowledgement retains the lease until durable recovery.
    if (controller.signal.aborted || !["completed", "provider_failure", "validation_failure"].includes(outcome ?? "")) return "unavailable";
    const result = await rpc("finish_turn_work", { p_turn_id: lease.turnId, p_lease_token: lease.leaseToken, p_outcome: outcome! });
    if (controller.signal.aborted) return "unavailable";
    return record(result) && (result.kind === "finished" || result.kind === "queued") ? result.kind : "unavailable";
  } catch { return "unavailable"; }
  finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseLease(value: unknown): DurableTurnLease | null {
  if (!record(value) || value.kind !== "leased"
    || typeof value.turnId !== "string" || !UUID.test(value.turnId)
    || typeof value.ownerId !== "string" || !UUID.test(value.ownerId)
    || typeof value.leaseToken !== "string" || !UUID.test(value.leaseToken)
    || typeof value.attempt !== "number" || !Number.isInteger(value.attempt) || value.attempt < 1 || value.attempt > 5
    || typeof value.leaseMs !== "number" || !Number.isInteger(value.leaseMs) || value.leaseMs < 1000 || value.leaseMs > 300000) return null;
  return Object.freeze({ turnId: value.turnId, ownerId: value.ownerId, attempt: value.attempt, leaseToken: value.leaseToken, leaseMs: value.leaseMs });
}
