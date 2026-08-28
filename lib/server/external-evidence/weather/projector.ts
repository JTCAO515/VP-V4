import { resolveExternalEvidence } from "../resolver.ts";

type WeatherCondition = "clear" | "cloudy" | "rain" | "snow" | "wind";
type AirQuality = "good" | "moderate" | "unhealthy" | "hazardous";
type AlertSeverity = "blue" | "yellow" | "orange" | "red";
type AlertCategory = "rainstorm" | "wind" | "heat" | "cold" | "snow";

type WeatherAlert = Readonly<{ severity: AlertSeverity; category: AlertCategory; issuedAt: string }>;
type WeatherReport = Readonly<{ condition: WeatherCondition; airQuality: AirQuality; alert: WeatherAlert | null }>;

export type WeatherCardOutcome =
  | Readonly<{
      kind: "weather_card";
      freshness: "fresh";
      source: string;
      observedAt: string;
      expiresAt: string;
      condition: WeatherCondition;
      airQuality: AirQuality;
      alert: WeatherAlert | null;
      recheck: false;
    }>
  | Readonly<{
      kind: "weather_unavailable";
      reason: "WEATHER_DATA_DISABLED" | "DATA_POLICY_BLOCKED" | "STALE_OR_EXPIRED" | "WEATHER_INPUT_INVALID";
      recheck: true;
    }>;

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;

/**
 * C0 weather projection. This is intentionally a pure metadata consumer: no provider,
 * request, URL, cache, storage, claim, Proposal, Trip, or feature-flag registry is involved.
 */
export function projectWeatherCard(input: unknown): WeatherCardOutcome {
  try {
    exact(input, ["now", "weatherDataEnabled", "need", "observation"]);
    if (typeof input.weatherDataEnabled !== "boolean") throw new TypeError("weatherDataEnabled must be boolean");
    if (!input.weatherDataEnabled) return unavailable("WEATHER_DATA_DISABLED");

    const observation = parseObservation(input.observation);
    const resolved = resolveExternalEvidence({
      now: input.now,
      need: input.need,
      observation: {
        kind: observation.kind,
        observedAt: observation.observedAt,
        expiresAt: observation.expiresAt,
        receipt: observation.receipt,
      },
    });
    if (resolved.kind === "unavailable") return unavailable(resolved.reason);

    if (observation.report.alert && instant(observation.report.alert.issuedAt).getTime() > instant(observation.observedAt).getTime()) {
      throw new TypeError("alert cannot be issued after observation");
    }
    return freeze({
      kind: "weather_card" as const,
      freshness: "fresh" as const,
      source: resolved.observation.policyId,
      observedAt: resolved.observation.observedAt,
      expiresAt: resolved.observation.expiresAt,
      condition: observation.report.condition,
      airQuality: observation.report.airQuality,
      alert: observation.report.alert,
      recheck: false as const,
    });
  } catch {
    return unavailable("WEATHER_INPUT_INVALID");
  }
}

function parseObservation(value: unknown): Readonly<{
  kind: "weather";
  observedAt: string;
  expiresAt: string;
  receipt: Readonly<{ policyId: string; allowed: boolean }>;
  report: WeatherReport;
}> {
  exact(value, ["kind", "observedAt", "expiresAt", "receipt", "report"]);
  if (value.kind !== "weather") throw new TypeError("weather kind is required");
  exact(value.receipt, ["policyId", "allowed"]);
  if (typeof value.receipt.policyId !== "string" || typeof value.receipt.allowed !== "boolean") throw new TypeError("closed receipt is required");
  instant(value.observedAt);
  instant(value.expiresAt);
  return freeze({
    kind: "weather" as const,
    observedAt: value.observedAt as string,
    expiresAt: value.expiresAt as string,
    receipt: freeze({ policyId: value.receipt.policyId, allowed: value.receipt.allowed }),
    report: parseReport(value.report),
  });
}

function parseReport(value: unknown): WeatherReport {
  exact(value, ["condition", "airQuality", "alert"]);
  if (!oneOf(value.condition, ["clear", "cloudy", "rain", "snow", "wind"])) throw new TypeError("weather condition is closed");
  if (!oneOf(value.airQuality, ["good", "moderate", "unhealthy", "hazardous"])) throw new TypeError("air quality is closed");
  if (value.alert === null) return freeze({ condition: value.condition, airQuality: value.airQuality, alert: null });
  exact(value.alert, ["severity", "category", "issuedAt"]);
  if (!oneOf(value.alert.severity, ["blue", "yellow", "orange", "red"])) throw new TypeError("alert severity is closed");
  if (!oneOf(value.alert.category, ["rainstorm", "wind", "heat", "cold", "snow"])) throw new TypeError("alert category is closed");
  instant(value.alert.issuedAt);
  return freeze({
    condition: value.condition,
    airQuality: value.airQuality,
    alert: freeze({ severity: value.alert.severity, category: value.alert.category, issuedAt: value.alert.issuedAt as string }),
  });
}

function unavailable(reason: Extract<WeatherCardOutcome, { kind: "weather_unavailable" }> ["reason"]): WeatherCardOutcome {
  return freeze({ kind: "weather_unavailable" as const, reason, recheck: true as const });
}

function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("closed record required");
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError("unexpected or missing input key");
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T { return typeof value === "string" && values.includes(value as T); }

function instant(value: unknown): Date {
  if (typeof value !== "string" || !INSTANT.test(value)) throw new TypeError("RFC3339 instant required");
  const match = INSTANT.exec(value);
  if (!match) throw new TypeError("RFC3339 instant required");
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) throw new TypeError("real instant required");
  return parsed;
}

function freeze<T>(value: T): Readonly<T> { if (value && typeof value === "object") Object.values(value as object).forEach(freeze); return Object.freeze(value); }
