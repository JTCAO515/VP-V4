import type { ToolActionStore } from "./index.ts";

export type PlanningActionRpc = (name: "claim_planning_action_v1" | "finish_planning_action_v1",
  params: Readonly<Record<string, string | null>>) => Promise<unknown>;
export type PlanningActionLease = Readonly<{
  turnId: string; ownerId: string; leaseToken: string; messageId: string;
  /** Explicit, revisioned memories used in the current planning basis. */
  memoryBasis: readonly Readonly<{ id: string; revision: number }>[];
}>;

/** No implicit network transport or credentials. The RPC must have a finite timeout. */
export function durablePlanningActionStore(rpc: PlanningActionRpc, lease: PlanningActionLease): ToolActionStore {
  const identity = { p_turn_id: lease.turnId, p_owner_id: lease.ownerId, p_lease_token: lease.leaseToken };
  return {
    async claim(key, toolId, inputDigest) {
      const value = await rpc("claim_planning_action_v1", {
        ...identity, p_message_id: lease.messageId, p_action_key: key,
        p_tool_id: toolId, p_input_digest: inputDigest,
        p_memory_basis: JSON.stringify(lease.memoryBasis),
      });
      const kind = object(value) ? value.kind : null;
      return kind === "claimed" || kind === "duplicate" || kind === "unknown" || kind === "stale" || kind === "stale_basis" || kind === "step_limit" || kind === "conflict" ? kind : "stale";
    },
    async complete(key, receiptDigest) {
      const value = await rpc("finish_planning_action_v1", { ...identity, p_action_key: key, p_receipt_digest: receiptDigest });
      return object(value) && (value.kind === "completed" || value.kind === "duplicate");
    },
    async markUnknown(key) {
      await rpc("finish_planning_action_v1", { ...identity, p_action_key: key, p_receipt_digest: null });
    },
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
