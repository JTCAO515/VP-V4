import { isFailureCode, type FailureCode } from "../contracts/errors/index.ts";
import { MODEL_PROFILES, type ModelProfileId } from "../model-gateway/index.ts";
import type { FixtureRouteDecision } from "../model-gateway/route/index.ts";

const TRACE_INPUT_KEYS = Object.freeze([
  "attemptId",
  "route",
  "outcomeCode",
  "inputTokens",
  "outputTokens",
  "latencyMs",
  "priceVersion",
  "inputMicrosPerToken",
  "outputMicrosPerToken",
] as const);

export type ModelAttemptTraceInput = Readonly<{
  attemptId: string;
  route: FixtureRouteDecision;
  outcomeCode: FailureCode | "VALIDATED";
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  priceVersion: string;
  inputMicrosPerToken: number;
  outputMicrosPerToken: number;
}>;

export type ModelAttemptTrace = Readonly<{
  attemptId: string;
  profileId: ModelProfileId | "none";
  provider: "deepseek" | "qwen" | "none";
  requestedModel: string;
  returnedModel: string;
  observedDeployment: string;
  routeLane: "baseline" | "unavailable";
  outcomeCode: FailureCode | "VALIDATED";
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  priceVersion: string;
  costMicros: number;
  recordInputs: false;
  recordOutputs: false;
}>;

export function buildModelAttemptTrace(value: unknown): ModelAttemptTrace {
  if (!isTraceInput(value)) throw new TypeError("Trace input must contain only allowlisted metadata.");
  const costMicros = calculateCostMicros({
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    inputMicrosPerToken: value.inputMicrosPerToken,
    outputMicrosPerToken: value.outputMicrosPerToken,
  });
  if (value.route.kind === "unavailable") {
    if (value.outcomeCode !== value.route.code || value.inputTokens !== 0 || value.outputTokens !== 0 || costMicros !== 0) {
      throw new TypeError("Unavailable routes must record their denial metadata with zero usage and cost.");
    }
    return Object.freeze({
      attemptId: value.attemptId,
      profileId: "none",
      provider: "none",
      requestedModel: "none",
      returnedModel: "none",
      observedDeployment: "none",
      routeLane: "unavailable",
      outcomeCode: value.outcomeCode,
      inputTokens: value.inputTokens,
      outputTokens: value.outputTokens,
      latencyMs: value.latencyMs,
      priceVersion: value.priceVersion,
      costMicros,
      recordInputs: false,
      recordOutputs: false,
    });
  }

  const profile = MODEL_PROFILES[value.route.profileId];
  return Object.freeze({
    attemptId: value.attemptId,
    profileId: value.route.profileId,
    provider: profile.provider,
    requestedModel: profile.providerModelId,
    returnedModel: profile.providerModelId,
    observedDeployment: profile.observedDeployment,
    routeLane: value.route.lane,
    outcomeCode: value.outcomeCode,
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    latencyMs: value.latencyMs,
    priceVersion: value.priceVersion,
    costMicros,
    recordInputs: false,
    recordOutputs: false,
  });
}

export function calculateCostMicros(input: Readonly<{
  inputTokens: number;
  outputTokens: number;
  inputMicrosPerToken: number;
  outputMicrosPerToken: number;
}>): number {
  for (const value of Object.values(input)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Usage and price inputs must be non-negative safe integers.");
  }
  const cost = input.inputTokens * input.inputMicrosPerToken + input.outputTokens * input.outputMicrosPerToken;
  if (!Number.isSafeInteger(cost)) throw new RangeError("Cost exceeds the safe integer range.");
  return cost;
}

function isTraceInput(value: unknown): value is ModelAttemptTraceInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (!hasExactKeys(input, TRACE_INPUT_KEYS) || !isAttemptId(input.attemptId) || !isFixtureRouteDecision(input.route)) return false;
  if (input.outcomeCode !== "VALIDATED" && !isFailureCode(input.outcomeCode)) return false;
  return isNonNegativeSafeInteger(input.inputTokens)
    && isNonNegativeSafeInteger(input.outputTokens)
    && isNonNegativeSafeInteger(input.latencyMs)
    && isPriceVersion(input.priceVersion)
    && isNonNegativeSafeInteger(input.inputMicrosPerToken)
    && isNonNegativeSafeInteger(input.outputMicrosPerToken);
}

function isFixtureRouteDecision(value: unknown): value is FixtureRouteDecision {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const route = value as Record<string, unknown>;
  if (route.kind === "route") {
    return hasExactKeys(route, ["kind", "profileId", "lane"])
      && (route.profileId === "deepseek_flash" || route.profileId === "qwen_37_strict")
      && route.lane === "baseline";
  }
  return route.kind === "unavailable" && hasExactKeys(route, ["kind", "code"]) && isFailureCode(route.code);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isAttemptId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function isPriceVersion(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
