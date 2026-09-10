import type { OpsInput } from "./local-workspace.ts";
export type PendingOpsOperation = Readonly<{ actorId: string; input: OpsInput }>;
/** A lost acknowledgement retains this exact payload/id; identity drift forbids replay. */
export async function dispatchOpsOperation(operation: PendingOpsOperation, io: {
  currentActor(): Promise<string | null>;
  send(input: OpsInput): Promise<{ ok: boolean; status: number }>;
  isCurrent(): boolean;
}): Promise<"confirmed" | "unknown" | "rejected" | "identity-changed" | "stale"> {
  try {
    const actor = await io.currentActor();
    if (!io.isCurrent()) return "stale";
    if (actor !== operation.actorId) return "identity-changed";
    const response = await io.send(operation.input);
    if (!io.isCurrent()) return "stale";
    return response.ok ? "confirmed" : response.status >= 500 ? "unknown" : "rejected";
  } catch { return io.isCurrent() ? "unknown" : "stale"; }
}
