/** Server-only seam. No default credentials, client route, policy approval or provider fetch. */
export type BudgetRpc = (name: "reserve_model_budget" | "dispatch_model_budget" | "finish_model_budget", parameters: Readonly<Record<string, string | number | null>>) => Promise<unknown>;
export type BudgetAttempt = Readonly<{
  scopeId: string; ownerId: string; taskId: string; attemptId: string;
  provider: "qwen" | "glm" | "deepseek"; model: string; priceVersion: string;
  reservedMicros: number; timeoutMs: number;
}>;
export type BudgetedResult<T> =
  | Readonly<{ kind: "completed"; value: T; accounting: "settled" | "pending" | "overrun" }>
  | Readonly<{ kind: "unavailable"; reason: "invalid" | "budget" | "cancelled" | "timeout" | "transport" | "accounting" }>;
export type PricedResult<T> = Readonly<{ value: T; actualMicros: number | null }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9._-]{1,100}$/;
const MAX_MICROS = 1_000_000_000_000;
const KEYS = ["scopeId", "ownerId", "taskId", "attemptId", "provider", "model", "priceVersion", "reservedMicros", "timeoutMs"];

/**
 * Caller must independently enforce policy/identity and derive the reservation from a
 * verified worst-case price. A transport result is never domain/Trip authorization.
 * RPC transport must have its own finite network timeout. Unknown DB acknowledgments
 * fail closed; no second worker receives a dispatch from this consumer for duplicates.
 */
export async function runWithDurableBudget<T>(
  attempt: BudgetAttempt,
  rpc: BudgetRpc,
  invoke: (signal: AbortSignal) => Promise<PricedResult<T>>,
  signal: AbortSignal,
): Promise<BudgetedResult<T>> {
  if (!valid(attempt) || typeof rpc !== "function" || typeof invoke !== "function") return unavailable("invalid");
  if (signal.aborted) return unavailable("cancelled");
  const identity = { p_scope_id: attempt.scopeId, p_owner_id: attempt.ownerId, p_attempt_id: attempt.attemptId };
  const finish = async (action: "pending" | "release" | "settle", actual: number | null = null) =>
    call(rpc, "finish_model_budget", { ...identity, p_action: action, p_actual_micros: actual });
  const reserved = await call(rpc, "reserve_model_budget", {
    ...identity, p_task_id: attempt.taskId, p_provider: attempt.provider,
    p_model: attempt.model, p_price_version: attempt.priceVersion, p_reserved_micros: attempt.reservedMicros,
  });
  if (reserved?.kind !== "reserved") return unavailable(reserved === null ? "accounting" : "budget");
  if (signal.aborted) { await finish("release"); return unavailable("cancelled"); }
  const dispatched = await call(rpc, "dispatch_model_budget", identity);
  if (dispatched?.kind !== "dispatched") {
    // Unknown/duplicate dispatch may already be in flight; only a definite pre-dispatch
    // disabled/expired decision permits release. A later recovery can reconcile others.
    if (dispatched?.kind === "disabled" || dispatched?.kind === "expired" || dispatched?.kind === "exhausted") await finish("release");
    return unavailable(dispatched === null ? "accounting" : "budget");
  }
  if (signal.aborted) { await finish("pending"); return unavailable("cancelled"); }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, attempt.timeoutMs);
  let onAbort: () => void = () => {};
  const interrupted = new Promise<{ kind: "interrupted" }>((resolve) => {
    onAbort = () => resolve({ kind: "interrupted" });
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const work = Promise.resolve().then(async () => {
      if (controller.signal.aborted) return { kind: "failed" as const };
      try { return { kind: "result" as const, result: await invoke(controller.signal) }; }
      catch { return { kind: "failed" as const }; }
    });
    const observed = await Promise.race([work, interrupted]);
    if (observed.kind !== "result" || controller.signal.aborted) {
      await finish("pending");
      return unavailable(controller.signal.aborted ? timedOut ? "timeout" : "cancelled" : "transport");
    }
    if (!record(observed.result) || !Object.hasOwn(observed.result, "value") || !Object.hasOwn(observed.result, "actualMicros")) {
      await finish("pending"); return unavailable("accounting");
    }
    const actual = observed.result.actualMicros;
    if (actual === null) { await finish("pending"); return { kind: "completed", value: observed.result.value, accounting: "pending" }; }
    if (!Number.isSafeInteger(actual) || actual < 0 || actual > MAX_MICROS) {
      await finish("pending"); return unavailable("accounting");
    }
    const settled = await finish("settle", actual);
    if (settled?.kind !== "settled" || typeof settled.overrun !== "boolean") return unavailable("accounting");
    if (controller.signal.aborted) return unavailable(timedOut ? "timeout" : "cancelled");
    return { kind: "completed", value: observed.result.value, accounting: settled.overrun ? "overrun" : "settled" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

async function call(rpc: BudgetRpc, name: Parameters<BudgetRpc>[0], parameters: Parameters<BudgetRpc>[1]): Promise<Record<string, unknown> | null> {
  try { const result = await rpc(name, parameters); return record(result) ? result : null; } catch { return null; }
}
function valid(value: BudgetAttempt): boolean {
  return record(value) && Object.keys(value).length === KEYS.length && Object.keys(value).every((key) => KEYS.includes(key))
    && [value.scopeId, value.ownerId, value.taskId, value.attemptId].every((id) => typeof id === "string" && UUID.test(id))
    && ["qwen", "glm", "deepseek"].includes(value.provider)
    && typeof value.model === "string" && TOKEN.test(value.model) && typeof value.priceVersion === "string" && TOKEN.test(value.priceVersion)
    && Number.isSafeInteger(value.reservedMicros) && value.reservedMicros > 0 && value.reservedMicros <= MAX_MICROS
    && Number.isSafeInteger(value.timeoutMs) && value.timeoutMs > 0 && value.timeoutMs <= 300_000;
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function unavailable(reason: Extract<BudgetedResult<never>, { kind: "unavailable" }>["reason"]): BudgetedResult<never> { return { kind: "unavailable", reason }; }
