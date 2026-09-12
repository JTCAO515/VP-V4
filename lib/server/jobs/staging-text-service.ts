import { setTimeout as delay } from "node:timers/promises";
import { createStagingTextJob, type StagingTextJobDependencies } from "./staging-text-job.ts";

type PollResult = "empty" | "finished" | "queued" | "unavailable";
export type ServiceEvent = Readonly<{ phase: "poll-started" | "poll-returned"; poll: number; result?: PollResult; deadlineExceeded?: boolean }>;
type ServiceResult = Readonly<{ reason: "stopped" | "expired" | "unavailable"; polls: number }>;
type LoopDependencies = Readonly<{
  poll: (signal: AbortSignal) => Promise<PollResult>;
  record: (event: ServiceEvent) => Promise<void>;
  /** Deterministic clock/wait seams for tests; the CLI supplies neither. */
  now?: () => number;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}>;
const MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** One immutable owner/policy/job. SQL remains the authority on every poll. */
export function createStagingTextService(raw: unknown, dependencies: StagingTextJobDependencies & {
  recordService: LoopDependencies["record"];
}) {
  if (!record(raw) || Object.keys(raw).length !== 4 || raw.schemaVersion !== "vpj07-staging-text-service/1"
    || typeof raw.expiresAt !== "string" || !Number.isFinite(Date.parse(raw.expiresAt))
    || new Date(raw.expiresAt).toISOString() !== raw.expiresAt
    || typeof raw.pollIntervalMs !== "number" || typeof dependencies.recordService !== "function") throw unavailable();
  const expiresAt = Date.parse(raw.expiresAt), pollIntervalMs = raw.pollIntervalMs;
  validateWindow(expiresAt, pollIntervalMs, Date.now());
  const poll = createStagingTextJob(raw.job, dependencies);
  return (signal: AbortSignal) => runTextService(expiresAt, pollIntervalMs, {
    poll, record: dependencies.recordService,
  }, signal);
}

/** Sequential polling; a failed poll/journal stops this run rather than retrying blindly. */
export async function runTextService(expiresAt: number, pollIntervalMs: number,
  dependencies: LoopDependencies, signal: AbortSignal): Promise<ServiceResult> {
  const now = dependencies.now ?? Date.now;
  const wait = dependencies.wait ?? (async (milliseconds, stop) => { await delay(milliseconds, undefined, { signal: stop }); });
  validateWindow(expiresAt, pollIntervalMs, now());
  const controller = new AbortController();
  let expired = false, polls = 0;
  const stop = () => controller.abort();
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  // An absolute expiry also bounds restarts using the same config. This timer
  // prevents a backward wall-clock adjustment extending a running process.
  const timer = setTimeout(() => { expired = true; stop(); }, expiresAt - now());
  try {
    for (;;) {
      if (now() >= expiresAt) { expired = true; stop(); }
      if (controller.signal.aborted) return { reason: expired ? "expired" : "stopped", polls };
      await dependencies.record({ phase: "poll-started", poll: polls + 1 });
      if (now() >= expiresAt) { expired = true; stop(); }
      if (controller.signal.aborted) return { reason: expired ? "expired" : "stopped", polls };
      polls++;
      const pollController = new AbortController();
      const stopPoll = () => pollController.abort();
      controller.signal.addEventListener("abort", stopPoll, { once: true });
      let deadlineExceeded = false;
      const pollTimer = setTimeout(() => { deadlineExceeded = true; stopPoll(); }, 150000);
      let result: PollResult;
      try { result = await dependencies.poll(pollController.signal); }
      finally { clearTimeout(pollTimer); stopPoll(); controller.signal.removeEventListener("abort", stopPoll); }
      if (!["empty", "finished", "queued", "unavailable"].includes(result)) throw unavailable();
      await dependencies.record({ phase: "poll-returned", poll: polls, result, ...(deadlineExceeded ? { deadlineExceeded: true } : {}) });
      if (deadlineExceeded) return { reason: "unavailable", polls };
      if (result === "unavailable" && !controller.signal.aborted) return { reason: "unavailable", polls };
      if (controller.signal.aborted) return { reason: expired ? "expired" : "stopped", polls };
      await wait(Math.min(pollIntervalMs, Math.max(0, expiresAt - now())), controller.signal);
    }
  } catch {
    return { reason: controller.signal.aborted ? expired ? "expired" : "stopped" : "unavailable", polls };
  } finally {
    clearTimeout(timer); stop(); signal.removeEventListener("abort", stop);
  }
}

function validateWindow(expiresAt: number, pollIntervalMs: number, now: number) {
  if (!Number.isFinite(now) || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt - now > MAX_LIFETIME_MS
    || !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 5000 || pollIntervalMs > 60000) throw unavailable();
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function unavailable(): Error { return new Error("Staging text service unavailable."); }
