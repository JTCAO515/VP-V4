import type { HostedWorkerProfile, PollResult } from "../../jobs/hosted-text-worker.ts";
import type { StagingTextJobConfig } from "../../jobs/staging-text-job.ts";

/** An execution choice, never a policy rewrite or proof from discovery metadata.
 * The existing grounded SQL claimer alone qualifies selected Place provenance. */
export function planCanonicalPlaceHostedJob(profile: HostedWorkerProfile, group: unknown, ordinary: StagingTextJobConfig): StagingTextJobConfig | null {
  if (profile.schemaVersion !== "vpj07-hosted-text-worker/1" && profile.schemaVersion !== "vpj07-hosted-text-worker/2") return null;
  if (!profile.modes.includes("current_input_v1") || !profile.modes.includes("knowledge_intent_v1")
    || !group || typeof group !== "object" || !("contextMode" in group) || group.contextMode !== "current_input_v1"
    || ordinary.schemaVersion !== "vpj07-staging-text-job/1" || ordinary.inputMode !== undefined) return null;
  return { ...ordinary, schemaVersion: "vpj07-staging-text-job/4", inputMode: "knowledge_intent_v1" };
}

type Poll = (signal: AbortSignal) => Promise<PollResult>;
/** One owner lane, at most two polls, at most one nonempty outcome. Rotate the
 * first attempt so neither existing ordinary nor selected work can starve.
 * Only authoritative empty permits the other claimer; unknown never retries. */
export function createCanonicalPlaceGroupPoll(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw Error("Place Ask scheduling unavailable.");
  const next = new Map<string, boolean>();
  return async (key: string, ordinary: Poll, selected: Poll, signal: AbortSignal): Promise<PollResult> => {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error("Place Ask scheduling unavailable.");
    if (signal.aborted) return "unavailable";
    const selectedFirst = next.get(key) ?? false;
    next.delete(key);
    next.set(key, !selectedFirst);
    if (next.size > limit) next.delete(next.keys().next().value!);
    const first = selectedFirst ? selected : ordinary, second = selectedFirst ? ordinary : selected;
    const result = await first(signal);
    if (result !== "empty") return result;
    if (signal.aborted) return "unavailable";
    return second(signal);
  };
}
