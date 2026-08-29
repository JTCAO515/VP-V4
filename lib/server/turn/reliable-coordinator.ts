import { TurnEventLog, type TurnEvent } from "./contract.ts";

const CONFIG_KEYS = ["leaseMs", "maxAttempts"] as const;
const ENQUEUE_KEYS = ["turnId", "ownerId"] as const;
const READ_KEYS = ["turnId", "ownerId"] as const;
const OUTCOME_KEYS = ["outcome"] as const;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}$/;
const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKERS = new WeakSet<object>();
const LEASES = new WeakSet<object>();
const LEASE_WORKERS = new WeakMap<object, object>();

type TurnWorkState = "queued" | "leased" | "completed" | "failed" | "cancelled" | "quarantined";
type TerminalState = "completed" | "failed" | "cancelled" | "quarantined";
type WorkerOutcome = "completed" | "provider_failure" | "validation_failure";
type CoordinatorConfig = Readonly<{ leaseMs: number; maxAttempts: number }>;
type TurnRecord = { ownerId: string; state: TurnWorkState; attempt: number; lease: TurnWorkLease | null; leaseStartedAt: number | null; log: TurnEventLog };

export type TurnWorkerCapability = Readonly<Record<never, never>>;
export type TurnWorkLease = Readonly<{ turnId: string; attempt: number }>;
export type TurnCoordinatorState = Readonly<{ state: TurnWorkState | "invalid"; attempt: number; terminal: boolean }>;

export class TurnCoordinatorAccessError extends Error {}
export class TurnCoordinatorConflictError extends Error {}

/**
 * Server-only worker capability. It intentionally carries no identifier, role, secret, or telemetry value.
 * A later runtime adapter must bind worker authentication before it obtains this process-local capability.
 */
export function createTurnWorkerCapability(): TurnWorkerCapability {
  const worker = Object.freeze({});
  WORKERS.add(worker);
  return worker;
}

/**
 * In-memory lifecycle contract for a future durable coordinator. It has no Provider, message body,
 * persistence, Trip writer, queue host, environment read, credential, or HTTP capability.
 */
export class ReliableTurnCoordinator {
  readonly #leaseMs: number;
  readonly #maxAttempts: number;
  readonly #clock: () => number;
  readonly #turns = new Map<string, TurnRecord>();
  #lastNow = -1;

  constructor(config: unknown, clock: () => number = Date.now) {
    if (!isConfig(config) || typeof clock !== "function") throw new TypeError("Coordinator configuration must be exact and bounded.");
    this.#leaseMs = config.leaseMs;
    this.#maxAttempts = config.maxAttempts;
    this.#clock = clock;
  }

  enqueue(value: unknown): TurnCoordinatorState {
    if (!isEnqueue(value)) throw new TypeError("Accepted Turn metadata must be exact and content-free.");
    const existing = this.#turns.get(value.turnId);
    if (existing) {
      if (existing.ownerId !== value.ownerId) throw new TurnCoordinatorConflictError("Turn ID already belongs to another owner.");
      return snapshot(existing);
    }
    const log = new TurnEventLog();
    log.append({ turnId: value.turnId, eventId: "accepted", type: "accepted", state: "accepted" });
    const record: TurnRecord = { ownerId: value.ownerId, state: "queued", attempt: 0, lease: null, leaseStartedAt: null, log };
    this.#turns.set(value.turnId, record);
    return snapshot(record);
  }

  claim(worker: unknown): TurnWorkLease | null {
    if (!isWorker(worker)) return null;
    const now = this.#now();
    if (now === null) return null;
    this.#reclaimExpired(now);
    const entry = [...this.#turns.entries()].find(([, record]) => record.state === "queued");
    if (!entry) return null;
    const [turnId, record] = entry;
    record.attempt += 1;
    const lease = Object.freeze({ turnId, attempt: record.attempt });
    LEASES.add(lease);
    LEASE_WORKERS.set(lease, worker);
    record.state = "leased";
    record.lease = lease;
    record.leaseStartedAt = now;
    record.log.append({ turnId, eventId: `claimed-${record.attempt}`, type: "phase", state: "planning" });
    return lease;
  }

  finish(worker: unknown, lease: unknown, result: unknown): TurnCoordinatorState {
    if (!isWorker(worker) || !isLease(lease) || LEASE_WORKERS.get(lease) !== worker || !isWorkerOutcome(result)) return invalid();
    const now = this.#now();
    if (now === null) return invalid();
    this.#reclaimExpired(now);
    const record = this.#turns.get(lease.turnId);
    if (!record || record.lease !== lease || record.state !== "leased") return record ? snapshot(record) : invalid();
    this.#clearLease(record);
    if (result.outcome === "completed") return this.#terminal(lease.turnId, record, "completed");
    if (result.outcome === "validation_failure") return this.#terminal(lease.turnId, record, "failed");
    if (record.attempt >= this.#maxAttempts) return this.#terminal(lease.turnId, record, "quarantined");
    record.state = "queued";
    return snapshot(record);
  }

  cancel(value: unknown): TurnCoordinatorState {
    if (!isRead(value)) throw new TypeError("Cancellation input must be exact owner-scoped metadata.");
    const record = this.#forOwner(value);
    if (isTerminal(record.state)) return snapshot(record);
    this.#clearLease(record);
    return this.#terminal(value.turnId, record, "cancelled");
  }

  read(value: unknown): TurnCoordinatorState {
    if (!isRead(value)) throw new TypeError("Read input must be exact owner-scoped metadata.");
    return snapshot(this.#forOwner(value));
  }

  replay(value: unknown): readonly TurnEvent[] {
    if (!isRead(value)) throw new TypeError("Replay input must be exact owner-scoped metadata.");
    return this.#forOwner(value).log.replay();
  }

  #forOwner(value: Readonly<{ turnId: string; ownerId: string }>): TurnRecord {
    const record = this.#turns.get(value.turnId);
    if (!record || record.ownerId !== value.ownerId) throw new TurnCoordinatorAccessError("Turn not found or forbidden.");
    return record;
  }

  #terminal(turnId: string, record: TurnRecord, state: TerminalState): TurnCoordinatorState {
    if (isTerminal(record.state)) return snapshot(record);
    record.state = state;
    record.log.append({ turnId, eventId: `${state}-${record.attempt}`, type: "terminal", state: state === "quarantined" ? "failed" : state });
    return snapshot(record);
  }

  #clearLease(record: TurnRecord): void {
    record.lease = null;
    record.leaseStartedAt = null;
  }

  #reclaimExpired(now: number): void {
    for (const [turnId, record] of this.#turns) {
      if (record.state !== "leased" || record.leaseStartedAt === null || now - record.leaseStartedAt < this.#leaseMs) continue;
      this.#clearLease(record);
      if (record.attempt >= this.#maxAttempts) this.#terminal(turnId, record, "quarantined");
      else record.state = "queued";
    }
  }

  #now(): number | null {
    const now = this.#clock();
    if (!Number.isSafeInteger(now) || now < 0 || now < this.#lastNow) return null;
    this.#lastNow = now;
    return now;
  }
}

function snapshot(record: TurnRecord): TurnCoordinatorState {
  return Object.freeze({ state: record.state, attempt: record.attempt, terminal: isTerminal(record.state) });
}

function invalid(): TurnCoordinatorState {
  return Object.freeze({ state: "invalid", attempt: 0, terminal: false });
}

function isTerminal(state: TurnWorkState): state is TerminalState {
  return state === "completed" || state === "failed" || state === "cancelled" || state === "quarantined";
}

function isConfig(value: unknown): value is CoordinatorConfig {
  return isRecord(value)
    && hasExactKeys(value, CONFIG_KEYS)
    && isPositiveSafeInteger(value.leaseMs)
    && isPositiveSafeInteger(value.maxAttempts)
    && value.maxAttempts <= 5;
}

function isEnqueue(value: unknown): value is Readonly<{ turnId: string; ownerId: string }> {
  return isRecord(value) && hasExactKeys(value, ENQUEUE_KEYS) && isIdentifier(value.turnId) && isOwnerId(value.ownerId);
}

function isRead(value: unknown): value is Readonly<{ turnId: string; ownerId: string }> {
  return isRecord(value) && hasExactKeys(value, READ_KEYS) && isIdentifier(value.turnId) && isOwnerId(value.ownerId);
}

function isWorker(value: unknown): value is TurnWorkerCapability {
  return typeof value === "object" && value !== null && WORKERS.has(value);
}

function isLease(value: unknown): value is TurnWorkLease {
  return typeof value === "object" && value !== null && LEASES.has(value);
}

function isWorkerOutcome(value: unknown): value is Readonly<{ outcome: WorkerOutcome }> {
  return isRecord(value) && hasExactKeys(value, OUTCOME_KEYS) && (value.outcome === "completed" || value.outcome === "provider_failure" || value.outcome === "validation_failure");
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function isOwnerId(value: unknown): value is string {
  return typeof value === "string" && OWNER_ID.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
