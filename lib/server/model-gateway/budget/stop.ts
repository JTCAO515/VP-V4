import type { BudgetRpc } from "./durable.ts";

export type BudgetStop = Readonly<{ scopeId: string; ownerId: string }>;
export type BudgetStopResult =
  | Readonly<{ kind: "stopped"; released: number; pending: number }>
  | Readonly<{ kind: "unavailable" }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trusted server/operator consumer. No automatic restart, usage estimate or network default.
 * Unknown acknowledgments may be retried: stop is idempotent. Counts describe this call's
 * transitions, not refunded money or proof that an in-flight transport was cancelled.
 */
export async function stopDurableBudget(scope: BudgetStop, rpc: BudgetRpc): Promise<BudgetStopResult> {
  if (!record(scope) || Object.keys(scope).length !== 2
    || ![scope.scopeId, scope.ownerId].every(value => typeof value === "string" && UUID.test(value))
    || typeof rpc !== "function") return { kind: "unavailable" };
  try {
    const result = await rpc("stop_model_budget", { p_scope_id: scope.scopeId, p_owner_id: scope.ownerId });
    if (!record(result) || result.kind !== "stopped"
      || !count(result.released) || !count(result.pending)) return { kind: "unavailable" };
    return { kind: "stopped", released: result.released, pending: result.pending };
  } catch { return { kind: "unavailable" }; }
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
