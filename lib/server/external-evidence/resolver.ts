type Need =
  | Readonly<{ kind: "weather"; locationId: string; purpose: "trip_recheck" }>
  | Readonly<{ kind: "flight"; flightId: string; purpose: "trip_recheck" }>
  | Readonly<{ kind: "rail"; serviceId: string; purpose: "trip_recheck" }>;

type Observation = Readonly<{
  kind: Need["kind"];
  observedAt: string;
  expiresAt: string;
  receipt: Readonly<{ policyId: string; allowed: boolean }>;
}>;

type Resolution =
  | Readonly<{
      kind: "available";
      freshness: "fresh";
      observation: Readonly<{ kind: Need["kind"]; observedAt: string; expiresAt: string; policyId: string }>;
    }>
  | Readonly<{ kind: "unavailable"; reason: "DATA_POLICY_BLOCKED" | "STALE_OR_EXPIRED" }>;

const ID = /^[a-z][a-z0-9_-]{0,127}$/;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;

/**
 * Resolves only a caller-supplied, already-authorized C0 observation. It has no
 * transport, provider selection, cache, persistence, claim, card, or Trip path.
 */
export function resolveExternalEvidence(input: unknown): Resolution {
  exact(input, ["now", "need", "observation"]);
  const now = timestamp(input.now, "now");
  const need = parseNeed(input.need);
  const observation = parseObservation(input.observation);
  if (need.kind !== observation.kind) throw new TypeError("need and observation kinds must match");
  const observedAt = timestamp(observation.observedAt, "observedAt");
  const expiresAt = timestamp(observation.expiresAt, "expiresAt");
  if (observedAt.getTime() > now.getTime() || observedAt.getTime() > expiresAt.getTime()) throw new TypeError("observation timeline is invalid");
  if (!observation.receipt.allowed) return freeze({ kind: "unavailable" as const, reason: "DATA_POLICY_BLOCKED" as const });
  if (expiresAt.getTime() <= now.getTime()) return freeze({ kind: "unavailable" as const, reason: "STALE_OR_EXPIRED" as const });
  return freeze({
    kind: "available",
    freshness: "fresh",
    observation: freeze({ kind: observation.kind, observedAt: observation.observedAt, expiresAt: observation.expiresAt, policyId: observation.receipt.policyId }),
  });
}

function parseNeed(value: unknown): Need {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("need must be a closed record");
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "weather") { exact(candidate, ["kind", "locationId", "purpose"]); return freeze({ kind: "weather", locationId: id(candidate.locationId), purpose: purpose(candidate.purpose) }); }
  if (candidate.kind === "flight") { exact(candidate, ["kind", "flightId", "purpose"]); return freeze({ kind: "flight", flightId: id(candidate.flightId), purpose: purpose(candidate.purpose) }); }
  if (candidate.kind === "rail") { exact(candidate, ["kind", "serviceId", "purpose"]); return freeze({ kind: "rail", serviceId: id(candidate.serviceId), purpose: purpose(candidate.purpose) }); }
  throw new TypeError("need kind must be closed");
}

function parseObservation(value: unknown): Observation {
  exact(value, ["kind", "observedAt", "expiresAt", "receipt"]);
  if (value.kind !== "weather" && value.kind !== "flight" && value.kind !== "rail") throw new TypeError("observation kind must be closed");
  timestamp(value.observedAt, "observedAt");
  timestamp(value.expiresAt, "expiresAt");
  exact(value.receipt, ["policyId", "allowed"]);
  if (typeof value.receipt.allowed !== "boolean") throw new TypeError("receipt allowed must be boolean");
  return freeze({ kind: value.kind, observedAt: value.observedAt as string, expiresAt: value.expiresAt as string, receipt: freeze({ policyId: id(value.receipt.policyId), allowed: value.receipt.allowed }) });
}

function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("closed record required");
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError("unexpected or missing input key");
}

function purpose(value: unknown): "trip_recheck" { if (value !== "trip_recheck") throw new TypeError("purpose must be closed"); return value; }
function id(value: unknown): string { if (typeof value !== "string" || !ID.test(value)) throw new TypeError("bounded opaque ID required"); return value; }
function timestamp(value: unknown, label: string): Date {
  if (typeof value !== "string" || !RFC3339.test(value)) throw new TypeError(`${label} must be RFC3339`);
  const match = RFC3339.exec(value);
  if (!match) throw new TypeError(`${label} must be RFC3339`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) throw new TypeError(`${label} must be a real instant`);
  return parsed;
}
function freeze<T>(value: T): Readonly<T> { if (value && typeof value === "object") Object.values(value as object).forEach(freeze); return Object.freeze(value); }
