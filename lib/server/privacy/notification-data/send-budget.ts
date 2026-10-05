import { hrtime } from 'node:process';

/** The installed DB grant upper bound, not a wall-clock skew allowance. */
export const NOTIFICATION_SEND_BUDGET_MS = 5000;
export const NOTIFICATION_SEND_PROTOCOL = 'monotonic-notification-send/1' as const;
export type MonotonicClock = () => bigint;
export type NotificationSendPermit = Readonly<{
  protocol: typeof NOTIFICATION_SEND_PROTOCOL; signal: AbortSignal;
  remainingMs(): number; beginNetworkWrite(): boolean; canWrite(): boolean; close(): void;
}>;
const minted = new WeakSet<NotificationSendPermit>();
export const genuineNotificationSendPermit = (v: unknown): v is NotificationSendPermit => !!v && typeof v === 'object' && minted.has(v as NotificationSendPermit);

/** Capture startedNs BEFORE begin_fenced RPC. Transit/RPC delay consumes budget.
 * The absolute monotonic deadline and its original signal never leave this process.
 * Wall time, serialized replay bytes and new timer construction cannot renew it. */
export function createNotificationSendPermit(startedNs: bigint, leaseBudgetMs: number, external: AbortSignal,
  clock: MonotonicClock = hrtime.bigint): NotificationSendPermit | null {
  if (typeof startedNs !== 'bigint' || !Number.isSafeInteger(leaseBudgetMs) || leaseBudgetMs <= 0 || leaseBudgetMs > NOTIFICATION_SEND_BUDGET_MS) return null;
  const deadline = startedNs + BigInt(leaseBudgetMs) * BigInt(1000000);
  const controller = new AbortController(); let closed = false, started = false, last = startedNs;
  const remainingMs = () => {
    const current = clock();
    if (closed || current < last || current < startedNs) { controller.abort(); closed = true; return 0; }
    last = current;
    if (current >= deadline) { controller.abort(); closed = true; return 0; }
    return Number((deadline - current) / BigInt(1000000));
  };
  if (external.aborted || remainingMs() <= 0) return null;
  let timer: ReturnType<typeof setTimeout>;
  const abort = () => { closed = true; controller.abort(); };
  external.addEventListener('abort', abort, { once: true });
  const permit: NotificationSendPermit = Object.freeze({ protocol: NOTIFICATION_SEND_PROTOCOL, signal: controller.signal,
    remainingMs,
    beginNetworkWrite() { if (started || !this.canWrite()) return false; started = true; return true; },
    canWrite() { return !external.aborted && !controller.signal.aborted && remainingMs() > 0; },
    close() { clearTimeout(timer); external.removeEventListener('abort', abort); abort(); },
  });
  minted.add(permit);
  timer = setTimeout(abort, remainingMs());
  return permit;
}

/** Trusted server drain barrier: wait is monotonic elapsed duration after the
 * durable fence is read, independent of sender/server/client calendar clocks. */
export async function waitNotificationDrain(waitMs: number, signal: AbortSignal, clock: MonotonicClock = hrtime.bigint,
  wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))): Promise<void> {
  if (!Number.isSafeInteger(waitMs) || waitMs !== NOTIFICATION_SEND_BUDGET_MS) throw Error('NOTIFICATION_DATA_DRAIN_UNAVAILABLE');
  const start = clock(), target = start + BigInt(waitMs) * BigInt(1000000); let previous = start;
  for (;;) {
    const current = clock();
    if (signal.aborted || current < previous) throw Error('NOTIFICATION_DATA_DRAIN_UNAVAILABLE');
    previous = current;
    if (current >= target) return;
    // A timer waking early or a delayed callback never constitutes drain proof.
    await wait(Math.min(50, Math.max(1, Number((target - current + BigInt(999999)) / BigInt(1000000)))));
  }
}
