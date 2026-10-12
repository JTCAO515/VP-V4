import { decodePlanningV2Read, decodePlanningV2Checkpoints, type V2Lease, type V2Read } from '../../turn/planning-intake-worker-protocol.ts';

/** Existing planning purpose, never inferred from literal text or comparisonTarget alone. */
export const IDEA_RESULT_SCOPE = 'transport_screening' as const;
export type IdeaResultSource = Readonly<{
  schemaVersion: 'journey-idea-result-source/1';
  scope: typeof IDEA_RESULT_SCOPE;
  lease: V2Lease;
  read: V2Read;
  observation: Readonly<Record<string, unknown>>;
  prompt: string;
  executionAvailable: false;
}>;

/** Equality of source bytes is stronger than equality of caller-supplied digests.
 * Ordering of object keys is immaterial; array ordering remains significant. */
export function sameIdeaSource(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameIdeaSource(x, b[i]));
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
    return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(k => Object.hasOwn(right, k) && sameIdeaSource(left[k], right[k]));
  }
  return Object.is(a, b);
}

/** An already admitted v2 source only. Does not turn first-party intake reads,
 * text consent, local test permits, or an unrecorded idea into planning authority. */
export function captureIdeaResultSource(raw: unknown, lease: V2Lease, place: unknown, now: number): IdeaResultSource | null {
  const read = decodePlanningV2Read(raw, lease);
  if (!read) return null;
  const checkpoints = decodePlanningV2Checkpoints({ schemaVersion: 'planning-v2-checkpoints/1', ownerId: lease.ownerId,
    taskId: lease.taskId, turnId: lease.turnId, intakeContextDigest: lease.intakeContextDigest,
    planningContextDigest: lease.planningContextDigest, place: { state: 'completed', observation: place }, modelAttempt: 'none' }, lease, now);
  if (!checkpoints) return null;
  // Preserve the original producer's payload exactly, including null unknowns.
  // goalText is authoritative literal text, not a parse of destinations/services.
  const prompt = JSON.stringify({ goal: read.goalText, delegation: read.delegation, intake: read.qualifiedIntake.intake,
    observation: place, unknown: ['hotel_price', 'availability', 'safety', 'quietness', 'food', 'photography', 'pace_suitability'] });
  if (prompt.length > 32768 || prompt.includes('\0') || Buffer.from(prompt, 'utf8').toString('utf8') !== prompt) return null;
  return structuredClone({ schemaVersion: 'journey-idea-result-source/1', scope: IDEA_RESULT_SCOPE, lease, read,
    observation: place as Record<string, unknown>, prompt, executionAvailable: false });
}

export function matchesIdeaResultSource(raw: unknown, captured: IdeaResultSource): boolean {
  const read = decodePlanningV2Read(raw, captured.lease);
  return read !== null && sameIdeaSource(read, captured.read);
}
