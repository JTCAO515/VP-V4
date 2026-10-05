import { parseGuideCommand, uuid, type GuideOutcome, type GuideCommand } from "./contract.ts";
import { decodeGuideOutcome } from "./projection.ts";

export type GuideRPC = (name: "guide_place_v1", params: Readonly<{ p_trip: string; p_input: GuideCommand }>) => Promise<Readonly<{ data: unknown; error: { message: string } | null }>>;
type GuideErrorCode = "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "STALE_TRIP_VERSION" | "IDEMPOTENCY_KEY_REUSE" | "DATA_POLICY_BLOCKED" | "SERVICE_TASK_CONFLICT" | "SERVICE_TASK_CAPACITY_EXHAUSTED" | "GUIDE_UNAVAILABLE";
export class GuideError extends Error {
  readonly code: GuideErrorCode;
  constructor(code: GuideErrorCode) { super(code); this.code = code; }
}
/** SQL owns current facts, use qualification, lifecycle and the original
 * grounded task transaction. TS never submits a separate unbound turn. */
export async function runGuide(tripId: string, input: unknown, dependencies: Readonly<{
  rpc: GuideRPC; current: () => Promise<boolean>; now: () => number;
}>): Promise<GuideOutcome> {
  const command = parseGuideCommand(input);
  if (!uuid(tripId) || !command) throw new GuideError("INVALID_INPUT");
  if (!await dependencies.current()) throw new GuideError("UNAUTHENTICATED");
  const result = await dependencies.rpc("guide_place_v1", { p_trip: tripId, p_input: command });
  if (result.error) {
    const allowed = ["UNAUTHENTICATED", "FORBIDDEN", "STALE_TRIP_VERSION", "IDEMPOTENCY_KEY_REUSE", "DATA_POLICY_BLOCKED", "SERVICE_TASK_CONFLICT", "SERVICE_TASK_CAPACITY_EXHAUSTED"] as const;
    throw new GuideError(allowed.find(c => result.error!.message.includes(c)) ?? "GUIDE_UNAVAILABLE");
  }
  if (!await dependencies.current()) throw new GuideError("UNAUTHENTICATED");
  const outcome = decodeGuideOutcome(result.data, tripId, command, dependencies.now());
  if (!outcome) throw new GuideError("GUIDE_UNAVAILABLE");
  return outcome;
}
