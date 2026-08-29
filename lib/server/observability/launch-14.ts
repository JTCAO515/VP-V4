import {
  FLAGS,
  decideFlag,
  invalidFlags,
  type FlagState,
} from "../../flags/registry.ts";

export const CONTENT_FREE_TRACE_SCHEMA = "vp-observability-l14/v1";

const TRACE_EVENT_KEYS = [
  "stage",
  "outcome",
  "latencyMs",
  "retryCount",
  "inputTokens",
  "outputTokens",
  "costMicros",
] as const;
const TRACE_CHAIN_OPTIONS_KEYS = ["mintTraceId"] as const;
const SLO_KEYS = ["requestCount", "errorCount", "cancelledCount", "retryCount", "p95LatencyMs", "costMicros"] as const;
const COST_BUDGET_CONFIG_KEYS = ["maxCostMicros"] as const;
const COST_RESERVATION_KEYS = ["expectedCostMicros"] as const;
const MAX_COUNTER = 2_147_483_647;
const MAX_RETRIES = 10;
const MAX_P95_LATENCY_MS = 3_000;
const MAX_SLO_COST_MICROS = 1_000_000;
const MAX_ERROR_RATE = 0.05;

type TraceStage = "api" | "turn" | "worker" | "provider";
type TraceOutcome = "started" | "succeeded" | "failed" | "cancelled" | "rejected" | "retry_scheduled";

type TraceEventInput = Readonly<{
  stage: TraceStage;
  outcome: TraceOutcome;
  latencyMs: number;
  retryCount: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}>;

export type ContentFreeTraceEvent = Readonly<{
  schemaVersion: typeof CONTENT_FREE_TRACE_SCHEMA;
  traceId: string;
  stage: TraceStage;
  outcome: TraceOutcome;
  latencyMs: number;
  retryCount: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  recordContent: false;
}>;

export type ContentFreeTraceChain = Readonly<{
  record: (value: unknown) => ContentFreeTraceEvent;
}>;

export type Launch14SloDecision =
  | Readonly<{ kind: "healthy" }>
  | Readonly<{ kind: "alert"; reason: "error_rate" | "latency" | "cost" }>;

type Launch14SloInput = Readonly<{
  requestCount: number;
  errorCount: number;
  cancelledCount: number;
  retryCount: number;
  p95LatencyMs: number;
  costMicros: number;
}>;

type CostBudgetReservation = Readonly<{ expectedCostMicros: number }>;

export type Launch14ExecutionDecision =
  | Readonly<{ kind: "admitted"; reservedCostMicros: number }>
  | Readonly<{ kind: "unavailable"; code: "FLAG_DISABLED" | "COST_BUDGET_EXHAUSTED"; metric: "flag_disabled" | "cost_budget_exhausted" }>
  | Readonly<{ kind: "invalid" }>;

/**
 * Creates a correlation context whose ID is minted here, never accepted from request/turn/provider input.
 * The returned records are bounded metadata only; this module deliberately has no exporter or transport.
 */
export function createContentFreeTraceChain(options: unknown = undefined): ContentFreeTraceChain {
  const resolvedOptions = options === undefined ? { mintTraceId: defaultMintTraceId } : options;
  if (!isTraceChainOptions(resolvedOptions)) throw new TypeError("Trace chain options must be exact and server-controlled.");
  const traceId = resolvedOptions.mintTraceId();
  if (!isTraceId(traceId)) throw new TypeError("Trace IDs must be server-minted lowercase hexadecimal values.");

  return Object.freeze({
    record(value: unknown): ContentFreeTraceEvent {
      if (!isTraceEventInput(value)) throw new TypeError("Trace events must contain only bounded allowlisted metadata.");
      return Object.freeze({
        schemaVersion: CONTENT_FREE_TRACE_SCHEMA,
        traceId,
        stage: value.stage,
        outcome: value.outcome,
        latencyMs: value.latencyMs,
        retryCount: value.retryCount,
        inputTokens: value.inputTokens,
        outputTokens: value.outputTokens,
        costMicros: value.costMicros,
        recordContent: false,
      });
    },
  });
}

/** Pure threshold evaluation. An alert integration must consume this decision in a separately accepted runtime Issue. */
export function evaluateLaunch14Slo(value: unknown): Launch14SloDecision {
  if (!isLaunch14SloInput(value)) throw new TypeError("SLO input must contain only bounded aggregate metrics.");
  if (value.requestCount > 0 && value.errorCount / value.requestCount > MAX_ERROR_RATE) {
    return Object.freeze({ kind: "alert", reason: "error_rate" });
  }
  if (value.p95LatencyMs > MAX_P95_LATENCY_MS) return Object.freeze({ kind: "alert", reason: "latency" });
  if (value.costMicros > MAX_SLO_COST_MICROS) return Object.freeze({ kind: "alert", reason: "cost" });
  return Object.freeze({ kind: "healthy" });
}

/** In-memory reservation guard. It cannot invoke a provider and is intentionally fail-closed on malformed input. */
export class Launch14CostBudgetGuard {
  readonly #maxCostMicros: number;
  #reservedCostMicros = 0;

  constructor(value: unknown) {
    if (!isCostBudgetConfig(value)) throw new TypeError("Cost budget configuration must be exact and bounded.");
    this.#maxCostMicros = value.maxCostMicros;
  }

  get reservedCostMicros(): number {
    return this.#reservedCostMicros;
  }

  reserve(value: unknown): Launch14ExecutionDecision {
    if (!isCostBudgetReservation(value)) return Object.freeze({ kind: "invalid" });
    if (value.expectedCostMicros > this.#maxCostMicros - this.#reservedCostMicros) {
      return Object.freeze({ kind: "unavailable", code: "COST_BUDGET_EXHAUSTED", metric: "cost_budget_exhausted" });
    }
    this.#reservedCostMicros += value.expectedCostMicros;
    return Object.freeze({ kind: "admitted", reservedCostMicros: this.#reservedCostMicros });
  }
}

/**
 * The only execution gate in this contract. It consumes the existing chat runtime flag before any cost
 * reservation; neither branch can begin a model/provider call because this module owns no transport.
 */
export function admitLaunch14Execution(
  flags: unknown,
  budget: Launch14CostBudgetGuard,
  reservation: unknown,
): Launch14ExecutionDecision {
  if (!(budget instanceof Launch14CostBudgetGuard) || !isFlagState(flags)) return Object.freeze({ kind: "invalid" });
  if (invalidFlags(flags).length > 0) return Object.freeze({ kind: "invalid" });
  if (!decideFlag(flags, "CHAT_RUNTIME_ENABLED").available) {
    return Object.freeze({ kind: "unavailable", code: "FLAG_DISABLED", metric: "flag_disabled" });
  }
  return budget.reserve(reservation);
}

function isTraceChainOptions(value: unknown): value is Readonly<{ mintTraceId: () => string }> {
  if (!isRecord(value) || !hasExactKeys(value, TRACE_CHAIN_OPTIONS_KEYS) || typeof value.mintTraceId !== "function") return false;
  return true;
}

function defaultMintTraceId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") throw new TypeError("A secure server trace-ID generator is required.");
  return globalThis.crypto.randomUUID().replaceAll("-", "");
}

function isTraceEventInput(value: unknown): value is TraceEventInput {
  if (!isRecord(value) || !hasExactKeys(value, TRACE_EVENT_KEYS)) return false;
  return isTraceStage(value.stage)
    && isTraceOutcome(value.outcome)
    && isBoundedCounter(value.latencyMs)
    && isRetryCount(value.retryCount)
    && isBoundedCounter(value.inputTokens)
    && isBoundedCounter(value.outputTokens)
    && isBoundedCounter(value.costMicros);
}

function isLaunch14SloInput(value: unknown): value is Launch14SloInput {
  if (!isRecord(value) || !hasExactKeys(value, SLO_KEYS)) return false;
  if (!SLO_KEYS.every((key) => isBoundedCounter(value[key]))) return false;
  const input = value as Launch14SloInput;
  return input.errorCount <= input.requestCount && input.cancelledCount <= input.requestCount;
}

function isCostBudgetConfig(value: unknown): value is Readonly<{ maxCostMicros: number }> {
  return isRecord(value) && hasExactKeys(value, COST_BUDGET_CONFIG_KEYS) && isBoundedCounter(value.maxCostMicros);
}

function isCostBudgetReservation(value: unknown): value is CostBudgetReservation {
  return isRecord(value) && hasExactKeys(value, COST_RESERVATION_KEYS) && isBoundedCounter(value.expectedCostMicros);
}

function isFlagState(value: unknown): value is FlagState {
  if (!isRecord(value) || !hasExactKeys(value, Object.keys(FLAGS))) return false;
  return Object.keys(FLAGS).every((key) => typeof value[key] === "boolean");
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTraceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
}

function isTraceStage(value: unknown): value is TraceStage {
  return value === "api" || value === "turn" || value === "worker" || value === "provider";
}

function isTraceOutcome(value: unknown): value is TraceOutcome {
  return value === "started" || value === "succeeded" || value === "failed" || value === "cancelled" || value === "rejected" || value === "retry_scheduled";
}

function isBoundedCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNTER;
}

function isRetryCount(value: unknown): value is number {
  return isBoundedCounter(value) && value <= MAX_RETRIES;
}
