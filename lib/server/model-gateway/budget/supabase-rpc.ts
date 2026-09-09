import type { SupabaseClient } from "@supabase/supabase-js";
import type { BudgetRpc } from "./durable.ts";

/** Caller supplies a server-authorized client. Never construct this with an ordinary user client. */
export function createSupabaseBudgetRpc(client: SupabaseClient, timeoutMs = 10_000): BudgetRpc {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new TypeError("Invalid budget RPC timeout.");
  return async (name, parameters) => {
    try {
      const { data, error } = await client.rpc(name, parameters).abortSignal(AbortSignal.timeout(timeoutMs));
      if (error) throw new Error("Budget RPC unavailable.");
      return data as unknown;
    } catch { throw new Error("Budget RPC unavailable."); }
  };
}
