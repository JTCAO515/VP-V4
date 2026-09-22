import { evaluateReadiness, type ReadinessTrip } from "./index.ts";
import type { ReadinessInput } from "./contract.ts";

type ReadTrip = () => Promise<ReadinessTrip | null>;
/** Re-read the same Trip after evidence retrieval; do not render a result for a changed basis. */
export async function readReadiness(input: ReadinessInput, readTrip: ReadTrip, readEvidence: () => Promise<unknown>, clock = () => new Date()) {
  const before = await readTrip();
  if (!before) throw new Error("FORBIDDEN");
  if (before.headVersion !== input.tripVersion) throw new Error("STALE_TRIP_VERSION");
  const knowledge = await readEvidence();
  const after = await readTrip();
  if (!after) throw new Error("FORBIDDEN");
  if (after.id !== before.id || after.headVersion !== before.headVersion || JSON.stringify(after.dates) !== JSON.stringify(before.dates)) throw new Error("STALE_TRIP_VERSION");
  return evaluateReadiness(input, after, knowledge, clock());
}
