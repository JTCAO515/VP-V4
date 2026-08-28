const REALTIME_PROTOCOL = "REALTIME-00" as const;
const LOCALES = ["zh", "en", "es", "ru", "ar"] as const;

type Locale = (typeof LOCALES)[number];
type FixtureId = "five-locale-finished" | "disconnect-cancelled";
type EventState = "opened" | "tentative" | "confirmed" | "finished" | "cancelled";
type Authority = Readonly<{
  browserCredential: "never_issued";
  issuance: "server_authorized_only";
  reconnect: "new_server_authorization_required";
  resume: "not_supported";
}>;
type Event = Readonly<{ sequence: number; state: EventState; terminal: boolean }>;
type Coverage = Readonly<{
  sourceLocale: Locale;
  entity: "fixture_exact";
  number: "fixture_exact";
  latency: "not_measured";
  cost: "not_measured";
}>;

const AUTHORITY: Authority = freeze({
  browserCredential: "never_issued",
  issuance: "server_authorized_only",
  reconnect: "new_server_authorization_required",
  resume: "not_supported",
});

const COVERAGE: readonly Coverage[] = freeze(LOCALES.map((sourceLocale) => freeze({
  sourceLocale,
  entity: "fixture_exact" as const,
  number: "fixture_exact" as const,
  latency: "not_measured" as const,
  cost: "not_measured" as const,
})));

const FIXTURES: Readonly<Record<FixtureId, readonly Event[]>> = freeze({
  "five-locale-finished": freeze([
    event(1, "opened", false),
    event(2, "tentative", false),
    event(3, "confirmed", false),
    event(4, "finished", true),
  ]),
  "disconnect-cancelled": freeze([
    event(1, "opened", false),
    event(2, "tentative", false),
    event(3, "cancelled", true),
  ]),
});

export type RealtimeFixtureResult = Readonly<{
  kind: "realtime_fixture";
  protocol: typeof REALTIME_PROTOCOL;
  fixtureId: FixtureId;
  authority: Authority;
  events: readonly Event[];
  coverage: readonly Coverage[];
}>;

export type RealtimeUnavailable = Readonly<{
  kind: "realtime_unavailable";
  reason: "server_authorization_unavailable" | "unknown_fixture";
}>;

export function evaluateRealtimeFixture(input: unknown): RealtimeFixtureResult | RealtimeUnavailable {
  if (!isExactRecord(input, ["fixtureId"]) || typeof input.fixtureId !== "string" || !isFixtureId(input.fixtureId)) return unavailable("unknown_fixture");
  return freeze({
    kind: "realtime_fixture" as const,
    protocol: REALTIME_PROTOCOL,
    fixtureId: input.fixtureId,
    authority: AUTHORITY,
    events: FIXTURES[input.fixtureId],
    coverage: COVERAGE,
  });
}

export type CredentialExpiryResult = Readonly<{
  kind: "credential_expired";
  authority: "server_authorized_only";
  reconnect: "new_server_authorization_required";
}> | RealtimeUnavailable;

export function inspectFixtureCredentialExpiry(input: unknown): CredentialExpiryResult {
  if (!isExactRecord(input, ["fixtureId"]) || input.fixtureId !== "expired-credential") return unavailable("unknown_fixture");
  return freeze({
    kind: "credential_expired" as const,
    authority: "server_authorized_only" as const,
    reconnect: "new_server_authorization_required" as const,
  });
}

export function requestRealtimeSession(_input: unknown): RealtimeUnavailable {
  return unavailable("server_authorization_unavailable");
}

function event(sequence: number, state: EventState, terminal: boolean): Event {
  return freeze({ sequence, state, terminal });
}

function isFixtureId(value: string): value is FixtureId {
  return Object.hasOwn(FIXTURES, value);
}

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

function unavailable(reason: RealtimeUnavailable["reason"]): RealtimeUnavailable {
  return freeze({ kind: "realtime_unavailable" as const, reason });
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
