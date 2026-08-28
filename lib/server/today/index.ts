import {
  isEligibleFact,
  type FactEligibility,
} from "../knowledge/fact/eligibility.ts";

export type TodayCheckKind =
  | "budget"
  | "arrival_window"
  | "transfer"
  | "opening"
  | "reservation"
  | "price_evidence"
  | "transfer_evidence"
  | "opening_evidence"
  | "reservation_evidence";

export type CheckResult =
  | Readonly<{
      kind: TodayCheckKind;
      status: "unknown";
      reason: "NO_ELIGIBLE_EVIDENCE";
    }>
  | Readonly<{
      kind: TodayCheckKind;
      status: "evidence_available";
      factId: string;
      why: string;
    }>;

export type TodayResult = Readonly<{
  nextAction:
    | Readonly<{
        status: "available";
        tripId: string;
        factId: string;
        action: "review_fact";
        why: string;
        asOf: string;
      }>
    | Readonly<{ status: "unavailable"; reason: "NO_ELIGIBLE_EVIDENCE" }>;
  checks: readonly CheckResult[];
}>;

const checkKinds: readonly TodayCheckKind[] = [
  "budget",
  "arrival_window",
  "transfer",
  "opening",
  "reservation",
  "price_evidence",
  "transfer_evidence",
  "opening_evidence",
  "reservation_evidence",
];

export function buildToday(input: Readonly<{
  now: Date;
  trip: Readonly<{ id: string; title: string; updatedAt: string }>;
  fact: FactEligibility & Readonly<{ summary: string; checkKind: TodayCheckKind }>;
}>): TodayResult {
  const unknownChecks = checkKinds.map((kind) => ({
    kind,
    status: "unknown" as const,
    reason: "NO_ELIGIBLE_EVIDENCE" as const,
  }));
  if (!input || typeof input !== "object" || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime()) || !isCurrentTrip(input.trip, input.now) || !isValidFact(input.fact) || !isEligibleFact(input.fact, input.now)) {
    return { nextAction: { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" }, checks: unknownChecks };
  }
  const checks = unknownChecks.map((check) =>
    check.kind === input.fact.checkKind
      ? { kind: check.kind, status: "evidence_available" as const, factId: input.fact.id, why: input.fact.summary }
      : check,
  );
  return {
    nextAction: {
      status: "available",
      tripId: input.trip.id,
      factId: input.fact.id,
      action: "review_fact",
      why: input.fact.summary,
      asOf: input.now.toISOString(),
    },
    checks,
  };
}

function isCurrentTrip(trip: Readonly<{ id: string; title: string; updatedAt: string }>, now: Date): boolean {
  const updatedAt = parseRfc3339Timestamp(trip?.updatedAt);
  return typeof trip?.id === "string" && typeof trip?.title === "string" && trip.id.trim().length > 0 && trip.title.trim().length > 0 && Number.isFinite(updatedAt) && updatedAt <= now.getTime();
}

function isValidFact(fact: unknown): fact is FactEligibility & Readonly<{ summary: string; checkKind: TodayCheckKind }> {
  const value = fact as Readonly<{ id?: unknown; summary?: unknown; checkKind?: unknown; expiresAt?: unknown; status?: unknown; licenceAllowed?: unknown }> | null;
  return !!value && typeof value.id === "string" && value.id.trim().length > 0 && typeof value.summary === "string" && value.summary.trim().length > 0 && checkKinds.includes(value.checkKind as TodayCheckKind) && value.status === "reviewed" && value.licenceAllowed === true && Number.isFinite(parseRfc3339Timestamp(value.expiresAt));
}

function parseRfc3339Timestamp(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const [, y, m, d, h, min, s, offset] = match; const year = Number(y), month = Number(m), day = Number(d), hour = Number(h), minute = Number(min), second = Number(s);
  const days = month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59 || (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59))) return Number.NaN;
  return Date.parse(value);
}
