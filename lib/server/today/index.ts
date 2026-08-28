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
  if (!isCurrentTrip(input.trip, input.now) || !input.fact.id.trim() || !checkKinds.includes(input.fact.checkKind) || !isEligibleFact(input.fact, input.now) || !input.fact.summary.trim()) {
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
  const updatedAt = Date.parse(trip.updatedAt);
  return trip.id.trim().length > 0 && trip.title.trim().length > 0 && Number.isFinite(updatedAt) && updatedAt <= now.getTime();
}
