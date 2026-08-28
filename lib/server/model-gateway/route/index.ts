import { MODEL_PROFILES, type ModelDataClass, type ModelProfileId } from "../index.ts";
import { isFailureCode, type FailureCode } from "../../contracts/errors/index.ts";

const ROUTE_REQUEST_KEYS = Object.freeze(["task", "dataClass", "modality", "schema", "region", "policy", "safety"] as const);
const FALLBACK_ASSESSMENT_KEYS = Object.freeze(["code", "emittedOutput"] as const);

export type FixtureRouteRequest = Readonly<{
  task: "ordinary_text" | "strict_known_unknown";
  dataClass: ModelDataClass;
  modality: "text" | "vision";
  schema: "none" | "known_unknown";
  region: "fixture_only" | "unapproved";
  policy: "allowed" | "blocked";
  safety: "clear" | "blocked";
}>;

export type FixtureRouteDecision =
  | Readonly<{ kind: "route"; profileId: "deepseek_flash" | "qwen_37_strict"; lane: "baseline" }>
  | Readonly<{ kind: "unavailable"; code: FailureCode }>;

export type FallbackAssessment = Readonly<{ code: FailureCode; emittedOutput: boolean }>;

export function resolveFixtureRoute(value: unknown): FixtureRouteDecision {
  if (!isFixtureRouteRequest(value)) return unavailable("INVALID_INPUT");
  if (value.dataClass !== "c0_synthetic" || value.region !== "fixture_only" || value.policy !== "allowed") return unavailable("DATA_POLICY_BLOCKED");
  if (value.safety !== "clear") return unavailable("SAFETY_BLOCKED");
  if (value.modality !== "text") return unavailable("PROVIDER_UNAVAILABLE");

  if (value.task === "ordinary_text" && value.schema === "none" && isFixtureProfile("deepseek_flash")) {
    return Object.freeze({ kind: "route", profileId: "deepseek_flash", lane: "baseline" });
  }
  if (value.task === "strict_known_unknown" && value.schema === "known_unknown" && isFixtureProfile("qwen_37_strict")) {
    return Object.freeze({ kind: "route", profileId: "qwen_37_strict", lane: "baseline" });
  }
  return unavailable("PROVIDER_UNAVAILABLE");
}

export function canFallback(value: unknown): boolean {
  if (!isFallbackAssessment(value) || value.emittedOutput) return false;
  return value.code === "PROVIDER_UNAVAILABLE" || value.code === "TIMEOUT_BEFORE_OUTPUT" || value.code === "MODEL_OUTPUT_INVALID";
}

export class FixtureCircuitBreaker {
  readonly #threshold: number;
  readonly #cooldownMs: number;
  readonly #failures = new Map<ModelProfileId, number>();
  readonly #openUntil = new Map<ModelProfileId, number>();

  constructor(config: Readonly<{ threshold: number; cooldownMs: number }>) {
    if (!Number.isSafeInteger(config.threshold) || config.threshold <= 0 || !Number.isSafeInteger(config.cooldownMs) || config.cooldownMs <= 0) {
      throw new TypeError("Circuit configuration requires positive safe integers.");
    }
    this.#threshold = config.threshold;
    this.#cooldownMs = config.cooldownMs;
  }

  record(profileId: ModelProfileId, code: FailureCode, nowMs: number): void {
    if (!isProfileId(profileId) || !isFailureCode(code) || !isClock(nowMs)) throw new TypeError("Circuit record input is invalid.");
    if (!canFallback({ code, emittedOutput: false })) return;
    const count = (this.#failures.get(profileId) ?? 0) + 1;
    if (count < this.#threshold) {
      this.#failures.set(profileId, count);
      return;
    }
    const openUntil = nowMs + this.#cooldownMs;
    if (!Number.isSafeInteger(openUntil)) throw new RangeError("Circuit cooldown exceeds the safe clock range.");
    this.#failures.delete(profileId);
    this.#openUntil.set(profileId, openUntil);
  }

  isOpen(profileId: ModelProfileId, nowMs: number): boolean {
    if (!isProfileId(profileId) || !isClock(nowMs)) throw new TypeError("Circuit query input is invalid.");
    const openUntil = this.#openUntil.get(profileId);
    if (openUntil === undefined) return false;
    if (nowMs < openUntil) return true;
    this.#openUntil.delete(profileId);
    return false;
  }
}

function unavailable(code: FailureCode): FixtureRouteDecision {
  return Object.freeze({ kind: "unavailable", code });
}

function isFixtureRouteRequest(value: unknown): value is FixtureRouteRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return hasExactKeys(request, ROUTE_REQUEST_KEYS)
    && (request.task === "ordinary_text" || request.task === "strict_known_unknown")
    && (request.dataClass === "c0_synthetic" || request.dataClass === "c1_user" || request.dataClass === "c2_sensitive" || request.dataClass === "c3_restricted" || request.dataClass === "c4_secret")
    && (request.modality === "text" || request.modality === "vision")
    && (request.schema === "none" || request.schema === "known_unknown")
    && (request.region === "fixture_only" || request.region === "unapproved")
    && (request.policy === "allowed" || request.policy === "blocked")
    && (request.safety === "clear" || request.safety === "blocked");
}

function isFallbackAssessment(value: unknown): value is FallbackAssessment {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && hasExactKeys(value as Record<string, unknown>, FALLBACK_ASSESSMENT_KEYS)
    && isFailureCode((value as { code?: unknown }).code)
    && typeof (value as { emittedOutput?: unknown }).emittedOutput === "boolean";
}

function isFixtureProfile(profileId: "deepseek_flash" | "qwen_37_strict"): boolean {
  return MODEL_PROFILES[profileId].route === "fixture_only";
}

function isProfileId(value: unknown): value is ModelProfileId {
  return value === "deepseek_flash" || value === "deepseek_pro" || value === "deepseek_vision" || value === "qwen_37_strict";
}

function isClock(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
