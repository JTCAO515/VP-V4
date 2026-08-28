export type Constraint =
  | Readonly<{ id: string; kind: "hard"; type: "max_budget"; amountMinor: number; currency: string }>
  | Readonly<{ id: string; kind: "hard"; type: "arrival_window"; startsAt: string; endsAt: string }>
  | Readonly<{ id: string; kind: "hard"; type: "min_transfer_minutes"; minutes: number }>
  | Readonly<{ id: string; kind: "hard"; type: "opening_required" }>
  | Readonly<{ id: string; kind: "hard"; type: "reservation_required" }>
  | Readonly<{ id: string; kind: "hard"; type: "transfer_evidence_required" }>
  | Readonly<{ id: string; kind: "soft"; type: "max_stops"; count: number; weight: number }>
  | Readonly<{ id: string; kind: "assumption"; type: "candidate"; description: string }>
  | Readonly<{ id: string; kind: "missing"; type: "evidence"; description: string }>;

export type ConstraintSet = Readonly<{ revision: number; partySize: number; constraints: readonly Constraint[] }>;
export type TravelStop = Readonly<{ id: string; startsAt: string; endsAt: string; opening: "open" | "closed" | "unknown"; openingEvidence: "current" | "unknown" | "expired"; reservation: "available" | "not_required" | "unknown"; reservationEvidence: "current" | "unknown" | "expired" }>;
export type TravelTransfer = Readonly<{ fromStopId: string; toStopId: string; minutes: number; evidence: "current" | "unknown" | "expired" }>;
export type TravelPlan = Readonly<{ currency: string; totalCostMinor: number; priceEvidence: "current" | "unknown" | "expired"; stops: readonly TravelStop[]; transfers: readonly TravelTransfer[] }>;
export type ConstraintViolation = Readonly<{ constraintId: string; code: "BUDGET_EXCEEDED" | "ARRIVAL_WINDOW_VIOLATED" | "TRANSFER_TOO_SHORT" | "STOP_CLOSED" }>;
export type TradeoffCandidate = Readonly<{ constraintId: string; scorePenalty: number }>;
export type EvidenceNeed = Readonly<{ constraintId: string; code: "OPENING_EVIDENCE_REQUIRED" | "RESERVATION_EVIDENCE_REQUIRED" | "TRANSFER_EVIDENCE_REQUIRED" | "PRICE_EVIDENCE_REQUIRED" }>;
export type FeasibilityResult = Readonly<{ status: "feasible" | "infeasible" | "unknown"; violations: readonly ConstraintViolation[]; tradeoffs: readonly TradeoffCandidate[]; missingEvidence: readonly EvidenceNeed[] }>;

type EvidenceCode = EvidenceNeed["code"];
type AdjacentTransfer = Readonly<{ from: TravelStop; to: TravelStop; transfer?: TravelTransfer }>;

export class ConstraintEngineError extends Error {
  constructor(message: string) { super(message); this.name = "ConstraintEngineError"; }
}

export function evaluateFeasibility(input: Readonly<{ constraints: ConstraintSet; plan: TravelPlan }>): FeasibilityResult {
  assertValidInput(input);
  const violations: ConstraintViolation[] = [];
  const tradeoffs: TradeoffCandidate[] = [];
  const missingEvidence = new Map<string, EvidenceNeed>();
  const adjacentTransfers = getAdjacentTransfers(input.plan);
  const addEvidence = (constraintId: string, code: EvidenceCode): void => {
    missingEvidence.set(`${constraintId}:${code}`, { constraintId, code });
  };

  for (const constraint of input.constraints.constraints) {
    if (constraint.kind === "soft") {
      if (input.plan.stops.length > constraint.count) tradeoffs.push({ constraintId: constraint.id, scorePenalty: (input.plan.stops.length - constraint.count) * constraint.weight });
      continue;
    }
    if (constraint.kind !== "hard") continue;

    switch (constraint.type) {
      case "max_budget":
        if (input.plan.currency !== constraint.currency) violations.push({ constraintId: constraint.id, code: "BUDGET_EXCEEDED" });
        else if (input.plan.priceEvidence !== "current") addEvidence(constraint.id, "PRICE_EVIDENCE_REQUIRED");
        else if (input.plan.totalCostMinor > constraint.amountMinor) violations.push({ constraintId: constraint.id, code: "BUDGET_EXCEEDED" });
        break;
      case "arrival_window": {
        const arrival = input.plan.stops[0];
        if (!arrival || !isWithin(arrival.startsAt, constraint.startsAt, constraint.endsAt)) violations.push({ constraintId: constraint.id, code: "ARRIVAL_WINDOW_VIOLATED" });
        break;
      }
      case "min_transfer_minutes":
        if (adjacentTransfers.some(({ from, to, transfer }) => transfer?.evidence === "current" && (transfer.minutes < constraint.minutes || minutesBetween(from.endsAt, to.startsAt) < constraint.minutes))) violations.push({ constraintId: constraint.id, code: "TRANSFER_TOO_SHORT" });
        if (adjacentTransfers.some(({ transfer }) => !transfer || transfer.evidence !== "current")) addEvidence(constraint.id, "TRANSFER_EVIDENCE_REQUIRED");
        break;
      case "opening_required":
        if (input.plan.stops.some((stop) => stop.opening === "closed" && stop.openingEvidence === "current")) violations.push({ constraintId: constraint.id, code: "STOP_CLOSED" });
        if (input.plan.stops.some((stop) => stop.opening === "unknown" || stop.openingEvidence !== "current")) addEvidence(constraint.id, "OPENING_EVIDENCE_REQUIRED");
        break;
      case "reservation_required":
        if (input.plan.stops.some((stop) => stop.reservation === "unknown" || stop.reservationEvidence !== "current")) addEvidence(constraint.id, "RESERVATION_EVIDENCE_REQUIRED");
        break;
      case "transfer_evidence_required":
        if (adjacentTransfers.some(({ transfer }) => !transfer || transfer.evidence !== "current")) addEvidence(constraint.id, "TRANSFER_EVIDENCE_REQUIRED");
        break;
    }
  }

  const orderedViolations = sortByConstraintId(violations);
  const orderedTradeoffs = sortByConstraintId(tradeoffs);
  const orderedEvidence = sortByConstraintId([...missingEvidence.values()]);
  return Object.freeze({ status: orderedViolations.length > 0 ? "infeasible" : orderedEvidence.length > 0 ? "unknown" : "feasible", violations: orderedViolations, tradeoffs: orderedTradeoffs, missingEvidence: orderedEvidence });
}

export function scoreFinalState(result: FeasibilityResult): "accept" | "reject" | "needs_evidence" {
  return result.status === "feasible" ? "accept" : result.status === "infeasible" ? "reject" : "needs_evidence";
}

function assertValidInput(input: unknown): asserts input is Readonly<{ constraints: ConstraintSet; plan: TravelPlan }> {
  if (!isRecord(input) || !isRecord(input.constraints) || !isRecord(input.plan)) throw new ConstraintEngineError("Constraint input must contain a constraint set and a travel plan.");
  const { constraints, plan } = input;
  if (!isPositiveInteger(constraints.revision) || !isPositiveInteger(constraints.partySize) || !Array.isArray(constraints.constraints) || !isCurrency(plan.currency) || !isMoneyMinor(plan.totalCostMinor) || !isEvidenceState(plan.priceEvidence) || !Array.isArray(plan.stops) || !Array.isArray(plan.transfers)) throw new ConstraintEngineError("Constraint input has invalid top-level bounds.");

  const stopIds = new Set<string>();
  let previousStart: number | undefined;
  for (const stop of plan.stops) {
    if (!isRecord(stop) || !isSafeId(stop.id) || stopIds.has(stop.id) || !isRfc3339Instant(stop.startsAt) || !isRfc3339Instant(stop.endsAt) || Date.parse(stop.startsAt) >= Date.parse(stop.endsAt) || !isOneOf(stop.opening, ["open", "closed", "unknown"]) || !isEvidenceState(stop.openingEvidence) || !isOneOf(stop.reservation, ["available", "not_required", "unknown"]) || !isEvidenceState(stop.reservationEvidence)) throw new ConstraintEngineError("Plan stops must have unique IDs, ordered RFC3339 instants, and closed evidence states.");
    const start = Date.parse(stop.startsAt);
    if (previousStart !== undefined && previousStart > start) throw new ConstraintEngineError("Plan stops must be in chronological order.");
    const previousStop = plan.stops[stopIds.size - 1];
    if (previousStop && Date.parse(previousStop.endsAt) > start) throw new ConstraintEngineError("Plan stops must not overlap.");
    previousStart = start;
    stopIds.add(stop.id);
  }

  const allowedPairs = new Set<string>();
  for (let index = 0; index < plan.stops.length - 1; index += 1) allowedPairs.add(pairKey(plan.stops[index].id, plan.stops[index + 1].id));
  const transferPairs = new Set<string>();
  for (const transfer of plan.transfers) {
    const key = isRecord(transfer) && typeof transfer.fromStopId === "string" && typeof transfer.toStopId === "string" ? pairKey(transfer.fromStopId, transfer.toStopId) : "";
    if (!isRecord(transfer) || !allowedPairs.has(key) || transferPairs.has(key) || !isNonNegativeInteger(transfer.minutes) || !isEvidenceState(transfer.evidence)) throw new ConstraintEngineError("Transfers must be unique adjacent-stop links with bounded durations and closed evidence states.");
    transferPairs.add(key);
  }

  const ids = new Set<string>();
  for (const constraint of constraints.constraints) {
    if (!isValidConstraint(constraint) || ids.has(constraint.id)) throw new ConstraintEngineError("Constraints must use an exact supported kind/type schema with unique bounded IDs.");
    ids.add(constraint.id);
  }
}

function isValidConstraint(value: unknown): value is Constraint {
  if (!isRecord(value) || !isSafeId(value.id) || typeof value.kind !== "string" || typeof value.type !== "string") return false;
  if (value.kind === "hard" && value.type === "max_budget") return hasOnlyKeys(value, ["id", "kind", "type", "amountMinor", "currency"]) && isMoneyMinor(value.amountMinor) && isCurrency(value.currency);
  if (value.kind === "hard" && value.type === "arrival_window") return hasOnlyKeys(value, ["id", "kind", "type", "startsAt", "endsAt"]) && isRfc3339Instant(value.startsAt) && isRfc3339Instant(value.endsAt) && Date.parse(value.startsAt) <= Date.parse(value.endsAt);
  if (value.kind === "hard" && value.type === "min_transfer_minutes") return hasOnlyKeys(value, ["id", "kind", "type", "minutes"]) && isNonNegativeInteger(value.minutes);
  if (value.kind === "hard" && (value.type === "opening_required" || value.type === "reservation_required" || value.type === "transfer_evidence_required")) return hasOnlyKeys(value, ["id", "kind", "type"]);
  if (value.kind === "soft" && value.type === "max_stops") return hasOnlyKeys(value, ["id", "kind", "type", "count", "weight"]) && isNonNegativeInteger(value.count) && isNonNegativeInteger(value.weight);
  if ((value.kind === "assumption" && value.type === "candidate") || (value.kind === "missing" && value.type === "evidence")) return hasOnlyKeys(value, ["id", "kind", "type", "description"]) && typeof value.description === "string" && value.description.length > 0 && value.description.length <= 1_000;
  return false;
}

function getAdjacentTransfers(plan: TravelPlan): readonly AdjacentTransfer[] {
  const byPair = new Map(plan.transfers.map((transfer) => [pairKey(transfer.fromStopId, transfer.toStopId), transfer]));
  return plan.stops.slice(0, -1).map((from, index) => ({ from, to: plan.stops[index + 1], transfer: byPair.get(pairKey(from.id, plan.stops[index + 1].id)) }));
}

function sortByConstraintId<T extends { constraintId: string }>(values: readonly T[]): T[] { return [...values].sort((left, right) => left.constraintId < right.constraintId ? -1 : left.constraintId > right.constraintId ? 1 : 0); }
function isWithin(value: string, start: string, end: string): boolean { const instant = Date.parse(value); return instant >= Date.parse(start) && instant <= Date.parse(end); }
function minutesBetween(start: string, end: string): number { return (Date.parse(end) - Date.parse(start)) / 60_000; }
function pairKey(fromStopId: string, toStopId: string): string { return `${fromStopId}\u0000${toStopId}`; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean { return Object.keys(value).length === expected.length && Object.keys(value).every((key) => expected.includes(key)); }
function isSafeId(value: unknown): value is string { return typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value); }
function isCurrency(value: unknown): value is string { return typeof value === "string" && /^[A-Z]{3}$/.test(value); }
function isNonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function isPositiveInteger(value: unknown): value is number { return isNonNegativeInteger(value) && value > 0; }
function isMoneyMinor(value: unknown): value is number { return isNonNegativeInteger(value); }
function isEvidenceState(value: unknown): value is "current" | "unknown" | "expired" { return isOneOf(value, ["current", "unknown", "expired"]); }
function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T { return typeof value === "string" && options.includes(value as T); }
function isRfc3339Instant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = parts;
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText); const hour = Number(hourText); const minute = Number(minuteText); const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText); const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) && hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59 && Number.isFinite(Date.parse(value));
}

function daysInMonth(year: number, month: number): number { return month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31; }
