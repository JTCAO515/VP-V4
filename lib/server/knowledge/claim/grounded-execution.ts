import {
  assertGroundedClaim,
  type EvidenceReceipt,
  type ExecutionCard,
  type GroundedClaim,
} from "../../contracts/index.ts";

export type ClaimQualifierV1 =
  | Readonly<{ kind: "condition"; code: "reservation_required" | "official_recheck_required" }>
  | Readonly<{ kind: "audience"; code: "ticket_holder" | "eligible_user" }>
  | Readonly<{ kind: "negative_evidence"; code: "not_confirmed" | "not_available" }>;

export type GroundedExecutionRowV1 = Readonly<{
  claim: GroundedClaim;
  qualifiers: readonly Exclude<ClaimQualifierV1, { kind: "negative_evidence" }>[];
  value: string;
}>;

export type GroundedExecutionRequestV1 =
  | Readonly<{ mode: "low_risk_explanation" }>
  | Readonly<{
      mode: "grounded_execution";
      now: string;
      cardId: string;
      claims: readonly Readonly<{ claim: GroundedClaim; qualifiers: readonly ClaimQualifierV1[] }>[];
    }>;

export type GroundedExecutionOutcomeV1 =
  | Readonly<{ kind: "low_risk_explanation"; card: null }>
  | Readonly<{ kind: "execution_card"; card: ExecutionCard; rows: readonly GroundedExecutionRowV1[] }>
  | Readonly<{
      kind: "unsupported_execution";
      reason: "NO_ELIGIBLE_EVIDENCE" | "UNSUPPORTED_CLAIM";
      card: null;
      rows: readonly [];
    }>;

const RFC3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/;
const KNOWN_CLAIM_TYPES = new Set<GroundedClaim["claimType"]>([
  "address",
  "time_window",
  "money",
  "payment_method",
  "admission",
  "transport_status",
  "safe_phrase",
]);
const POSITIVE_QUALIFIER_CODES = new Set(["reservation_required", "official_recheck_required", "ticket_holder", "eligible_user"]);
const IANA_TIME_ZONE = /^[A-Za-z_+-]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)*$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const PAYMENT_METHODS = new Set(["cash", "card", "wallet", "bank_transfer"]);
const ADMISSION_ACTIONS = new Set(["reserve", "queue", "walk_in", "check_official"]);
const TRANSPORT_STATUSES = new Set(["scheduled", "delayed", "cancelled", "unknown"]);

export function prepareGroundedExecution(input: GroundedExecutionRequestV1): GroundedExecutionOutcomeV1 {
  assertRecord(input, input?.mode === "low_risk_explanation" ? ["mode"] : ["mode", "now", "cardId", "claims"]);
  if (input.mode === "low_risk_explanation") return freeze({ kind: "low_risk_explanation", card: null });
  if (input.mode !== "grounded_execution") throw new TypeError("mode must be a known execution mode");

  const now = parseTimestamp(input.now, "now");
  const cardId = parseId(input.cardId, "cardId");
  if (!Array.isArray(input.claims)) throw new TypeError("claims must be an array");
  if (input.claims.length === 0) return unsupported("NO_ELIGIBLE_EVIDENCE");

  const rows: GroundedExecutionRowV1[] = [];
  for (const candidate of input.claims) {
    const row = parseCurrentRow(candidate, now);
    if (!row) return unsupported("UNSUPPORTED_CLAIM");
    rows.push(row);
  }

  const sortedRows = rows.sort(compareRows);
  const evidence = uniqueEvidence(sortedRows.flatMap((row) => [...row.claim.evidence]));
  const card: ExecutionCard = {
    cardId,
    kind: "execution",
    claims: sortedRows.map((row) => row.claim),
    evidence,
  };
  return freeze({ kind: "execution_card", card: freeze(card), rows: freeze(sortedRows) });
}

export function formatGroundedExecutionValue(claim: GroundedClaim): string {
  assertClaimShape(claim);
  switch (claim.claimType) {
    case "address":
      return [...claim.value.lines, ...(claim.value.locality ? [claim.value.locality] : []), claim.value.countryCode].join(" · ");
    case "time_window":
      return claim.value.endsAt
        ? `${claim.value.startsAt} [${claim.value.timeZone}] – ${claim.value.endsAt} [${claim.value.timeZone}]`
        : `${claim.value.startsAt} [${claim.value.timeZone}]`;
    case "money":
      return formatMoney(claim.value.amountMinor, claim.value.currency);
    case "payment_method":
      return claim.value.method;
    case "admission":
      return claim.value.audience ? `${claim.value.action} · ${claim.value.audience}` : claim.value.action;
    case "transport_status":
      return `${claim.value.status} · ${claim.value.serviceId}`;
    case "safe_phrase":
      return `${claim.value.locale} · ${claim.value.text}`;
  }
}

function parseCurrentRow(value: unknown, now: Date): GroundedExecutionRowV1 | null {
  assertRecord(value, ["claim", "qualifiers"]);
  const claim = value.claim as GroundedClaim;
  assertClaimEnvelope(claim);
  if (!KNOWN_CLAIM_TYPES.has(claim.claimType)) return null;
  assertClaimShape(claim);
  const qualifiers = parseQualifiers(value.qualifiers);
  if (qualifiers.some((qualifier) => qualifier.kind === "negative_evidence")) return null;
  if (parseTimestamp(claim.asOf, "claim asOf").getTime() > now.getTime()) return null;
  if (!hasCurrentEvidence(claim.evidence, now)) return null;
  if (claim.claimType === "payment_method" && claim.value.qualifier) return null;

  try {
    assertGroundedClaim(claim);
  } catch {
    return null;
  }

  return freeze({
    claim: freeze(claim),
    qualifiers: freeze(qualifiers as Exclude<ClaimQualifierV1, { kind: "negative_evidence" }>[]) as readonly Exclude<
      ClaimQualifierV1,
      { kind: "negative_evidence" }
    >[],
    value: formatGroundedExecutionValue(claim),
  });
}

function assertClaimEnvelope(value: unknown): asserts value is GroundedClaim {
  assertRecord(value, ["claimType", "subjectId", "value", "asOf", "evidence"]);
  if (typeof value.claimType !== "string" || typeof value.subjectId !== "string" || typeof value.asOf !== "string" || !Array.isArray(value.evidence)) {
    throw new TypeError("claim must use the closed grounded-claim envelope");
  }
}

function assertClaimShape(claim: GroundedClaim): void {
  assertClaimEnvelope(claim);
  switch (claim.claimType) {
    case "address":
      assertRecord(claim.value, ["lines", "locality", "countryCode"], ["locality"]);
      if (!Array.isArray(claim.value.lines) || claim.value.lines.some((line) => typeof line !== "string" || line.length === 0) || typeof claim.value.countryCode !== "string") {
        throw new TypeError("address claim must contain typed address fields");
      }
      return;
    case "time_window":
      assertRecord(claim.value, ["startsAt", "endsAt", "timeZone"], ["endsAt"]);
      if (typeof claim.value.startsAt !== "string" || typeof claim.value.timeZone !== "string" || (claim.value.endsAt !== undefined && typeof claim.value.endsAt !== "string")) {
        throw new TypeError("time window claim must contain typed time fields");
      }
      const startsAt = parseTimestamp(claim.value.startsAt, "time window startsAt");
      const endsAt = claim.value.endsAt === undefined ? null : parseTimestamp(claim.value.endsAt, "time window endsAt");
      if (endsAt && endsAt.getTime() < startsAt.getTime()) throw new TypeError("time window must not end before it starts");
      assertIanaTimeZone(claim.value.timeZone);
      return;
    case "money":
      assertRecord(claim.value, ["amountMinor", "currency"]);
      if (!Number.isSafeInteger(claim.value.amountMinor) || typeof claim.value.currency !== "string" || !ISO_CURRENCY.test(claim.value.currency)) throw new TypeError("money claim must contain typed money fields");
      return;
    case "payment_method":
      assertRecord(claim.value, ["method", "qualifier"], ["qualifier"]);
      if (typeof claim.value.method !== "string" || !PAYMENT_METHODS.has(claim.value.method) || (claim.value.qualifier !== undefined && typeof claim.value.qualifier !== "string")) {
        throw new TypeError("payment claim must contain typed payment fields");
      }
      return;
    case "admission":
      assertRecord(claim.value, ["action", "audience"], ["audience"]);
      if (typeof claim.value.action !== "string" || !ADMISSION_ACTIONS.has(claim.value.action) || (claim.value.audience !== undefined && typeof claim.value.audience !== "string")) {
        throw new TypeError("admission claim must contain typed admission fields");
      }
      return;
    case "transport_status":
      assertRecord(claim.value, ["status", "serviceId"]);
      if (typeof claim.value.status !== "string" || !TRANSPORT_STATUSES.has(claim.value.status) || typeof claim.value.serviceId !== "string") throw new TypeError("transport claim must contain typed transport fields");
      return;
    case "safe_phrase":
      assertRecord(claim.value, ["locale", "text", "purpose"]);
      if (typeof claim.value.locale !== "string" || typeof claim.value.text !== "string" || typeof claim.value.purpose !== "string") {
        throw new TypeError("safe phrase claim must contain typed phrase fields");
      }
      return;
    default:
      throw new TypeError("claim type is unsupported");
  }
}

function parseQualifiers(value: unknown): readonly ClaimQualifierV1[] {
  if (!Array.isArray(value)) throw new TypeError("qualifiers must be an array");
  return value.map((qualifier) => {
    assertRecord(qualifier, ["kind", "code"]);
    if (qualifier.kind === "condition" && (qualifier.code === "reservation_required" || qualifier.code === "official_recheck_required")) return freeze(qualifier as ClaimQualifierV1);
    if (qualifier.kind === "audience" && (qualifier.code === "ticket_holder" || qualifier.code === "eligible_user")) return freeze(qualifier as ClaimQualifierV1);
    if (qualifier.kind === "negative_evidence" && (qualifier.code === "not_confirmed" || qualifier.code === "not_available")) return freeze(qualifier as ClaimQualifierV1);
    throw new TypeError("qualifier must use a closed kind and code");
  });
}

function hasCurrentEvidence(receipts: readonly EvidenceReceipt[], now: Date): boolean {
  if (receipts.length === 0) return false;
  const keys = new Set<string>();
  for (const receipt of receipts) {
    assertReceiptShape(receipt);
    const key = evidenceKey(receipt);
    if (keys.has(key)) return false;
    keys.add(key);
    if (receipt.kind === "user_artifact") {
      if (parseTimestamp(receipt.confirmedAt, "artifact confirmedAt").getTime() > now.getTime()) return false;
      continue;
    }
    if (parseTimestamp(receipt.expiresAt, "receipt expiresAt").getTime() <= now.getTime()) return false;
  }
  return true;
}

function assertReceiptShape(receipt: EvidenceReceipt): void {
  switch (receipt.kind) {
    case "fact":
      assertRecord(receipt, ["kind", "factId", "version", "reviewedAt", "expiresAt"]);
      return;
    case "observation":
      assertRecord(receipt, ["kind", "observationId", "provider", "policyId", "expiresAt"]);
      return;
    case "user_artifact":
      assertRecord(receipt, ["kind", "artifactId", "version", "confirmedAt"]);
      return;
    default:
      throw new TypeError("receipt must use a known kind");
  }
}

function uniqueEvidence(receipts: readonly EvidenceReceipt[]): EvidenceReceipt[] {
  return [...new Map(receipts.map((receipt) => [evidenceKey(receipt), receipt])).values()].sort((left, right) => compareText(evidenceKey(left), evidenceKey(right)));
}

function evidenceKey(receipt: EvidenceReceipt): string {
  switch (receipt.kind) {
    case "fact":
      return `fact:${receipt.factId}:${receipt.version}`;
    case "observation":
      return `observation:${receipt.observationId}:${receipt.policyId}`;
    case "user_artifact":
      return `user_artifact:${receipt.artifactId}:${receipt.version}`;
  }
}

function compareRows(left: GroundedExecutionRowV1, right: GroundedExecutionRowV1): number {
  return compareText(left.claim.claimType, right.claim.claimType) || compareText(left.claim.subjectId, right.claim.subjectId) || compareText(evidenceKey(left.claim.evidence[0]), evidenceKey(right.claim.evidence[0]));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertIanaTimeZone(value: string): void {
  if (!IANA_TIME_ZONE.test(value)) throw new TypeError("time window must use an IANA time zone");
  try {
    Intl.DateTimeFormat("en", { timeZone: value }).format(0);
  } catch {
    throw new TypeError("time window must use a known IANA time zone");
  }
}

function parseTimestamp(value: unknown, label: string): Date {
  if (typeof value !== "string") throw new TypeError(`${label} must be RFC3339`);
  const match = RFC3339_TIMESTAMP.exec(value);
  if (!match) throw new TypeError(`${label} must be timezone-qualified RFC3339`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    offsetHour > 23 || offsetMinute > 59 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second
  ) throw new TypeError(`${label} must be a real RFC3339 instant`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${label} must be a valid instant`);
  return parsed;
}

function parseId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new TypeError(`${label} must be a bounded opaque ID`);
  return value;
}

function assertRecord(value: unknown, keys: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("expected record");
  const actual = Object.keys(value);
  if (actual.some((key) => !keys.includes(key)) || keys.some((key) => !optional.includes(key) && !actual.includes(key))) {
    throw new TypeError("unexpected or missing input key");
  }
}

function formatMoney(amountMinor: number, currency: string): string {
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  return `${currency} ${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function unsupported(reason: "NO_ELIGIBLE_EVIDENCE" | "UNSUPPORTED_CLAIM"): GroundedExecutionOutcomeV1 {
  return freeze({ kind: "unsupported_execution", reason, card: null, rows: [] as const });
}

function freeze<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) value.forEach((item) => freeze(item));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}
