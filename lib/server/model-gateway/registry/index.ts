import { copyVersionSnapshot, isVersionSnapshot, type VersionSnapshot } from "../prompt/index.ts";

type VersionedAttempt = Readonly<{
  attemptId: string;
  requestedModel: string;
  returnedModel: string;
  expectedObservedVersion: string;
  observedVersion: string;
  versions: VersionSnapshot;
}>;

type VersionedAttemptRecord =
  | Readonly<{ kind: "recorded"; promotion: "hold"; attemptId: string; versions: VersionSnapshot }>
  | Readonly<{ kind: "drift_detected"; promotion: "hold"; attemptId: string; checks: readonly ["conformance", "eval"]; versions: VersionSnapshot }>
  | Readonly<{ kind: "invalid" }>;

const ATTEMPT_KEYS = Object.freeze(["attemptId", "requestedModel", "returnedModel", "expectedObservedVersion", "observedVersion", "versions"] as const);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** Captures queryable version metadata and turns alias drift into review work, never promotion. */
export function recordVersionedAttempt(value: unknown): VersionedAttemptRecord {
  if (!isVersionedAttempt(value)) return invalid();
  const versions = copyVersionSnapshot(value.versions);
  if (value.requestedModel === value.returnedModel && value.expectedObservedVersion === value.observedVersion) {
    return Object.freeze({ kind: "recorded", promotion: "hold", attemptId: value.attemptId, versions });
  }
  return Object.freeze({
    kind: "drift_detected",
    promotion: "hold",
    attemptId: value.attemptId,
    checks: Object.freeze(["conformance", "eval"] as const),
    versions,
  });
}

function isVersionedAttempt(value: unknown): value is VersionedAttempt {
  return isRecord(value)
    && hasExactKeys(value, ATTEMPT_KEYS)
    && isIdentifier(value.attemptId)
    && isIdentifier(value.requestedModel)
    && isIdentifier(value.returnedModel)
    && isIdentifier(value.expectedObservedVersion)
    && isIdentifier(value.observedVersion)
    && isVersionSnapshot(value.versions);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function invalid(): VersionedAttemptRecord {
  return Object.freeze({ kind: "invalid" });
}
