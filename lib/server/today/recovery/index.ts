type RecoveryDisruptionKind = "delay" | "closure" | "queue" | "unwell";
type GenericRecoveryDisruptionKind = Exclude<RecoveryDisruptionKind, "unwell">;

export type RecoveryProposal =
  | Readonly<{ status: "pending_confirmation"; tripId: string; baseVersion: number; disruption: RecoveryDisruptionKind; evidenceId: string; observedAt: string; expiresAt: string }>
  | Readonly<{ status: "recheck_required"; reason: "EVIDENCE_STALE" }>
  | Readonly<{ status: "unavailable"; reason: "NO_ELIGIBLE_EVIDENCE" }>;

type PendingRecoveryProposal = Extract<RecoveryProposal, { status: "pending_confirmation" }>;

export type RecoveryDecision =
  | Readonly<{ status: "accepted"; tripId: string; baseVersion: number; disruption: RecoveryDisruptionKind; evidenceId: string }>
  | Readonly<{ status: "rejected"; tripId: string; evidenceId: string }>
  | Readonly<{ status: "conflict"; reason: "TRIP_VERSION_CHANGED" }>
  | Readonly<{ status: "recheck_required"; reason: "EVIDENCE_STALE" }>
  | Readonly<{ status: "unavailable"; reason: "NO_ELIGIBLE_EVIDENCE" }>;

export function proposeRecovery(input: Readonly<{
  now: Date;
  trip: Readonly<{ id: string; version: number }>;
  disruption: Readonly<{ kind: GenericRecoveryDisruptionKind; evidenceId: string; observedAt: string; expiresAt: string }> | null;
}>): RecoveryProposal {
  const disruption = input?.disruption;
  const now = input?.now instanceof Date ? input.now.getTime() : Number.NaN;
  const tripId = input?.trip?.id;
  const tripVersion = input?.trip?.version;
  const evidenceId = disruption?.evidenceId;
  const observedAt = parseRfc3339Timestamp(disruption?.observedAt);
  const expiresAt = parseRfc3339Timestamp(disruption?.expiresAt);
  if (!disruption || (disruption.kind !== "delay" && disruption.kind !== "closure" && disruption.kind !== "queue") || typeof tripId !== "string" || !tripId.trim() || !Number.isSafeInteger(tripVersion) || tripVersion < 0 || typeof evidenceId !== "string" || !evidenceId.trim() || !Number.isFinite(now) || !Number.isFinite(observedAt) || !Number.isFinite(expiresAt) || observedAt > now || expiresAt < observedAt) {
    return { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" };
  }
  if (expiresAt <= now) return { status: "recheck_required", reason: "EVIDENCE_STALE" };
  return { status: "pending_confirmation", tripId, baseVersion: tripVersion, disruption: disruption.kind, evidenceId, observedAt: disruption.observedAt, expiresAt: disruption.expiresAt };
}

export function decideRecoveryProposal(input: Readonly<{
  now: Date;
  proposal: PendingRecoveryProposal;
  decision: "accept" | "reject";
  trip: Readonly<{ id: string; version: number }>;
}>): RecoveryDecision {
  const proposal = input?.proposal;
  const decisionNow = input?.now instanceof Date ? input.now.getTime() : Number.NaN;
  const observedAt = parseRfc3339Timestamp(proposal?.observedAt);
  const expiresAt = parseRfc3339Timestamp(proposal?.expiresAt);
  const tripId = input?.trip?.id;
  const tripVersion = input?.trip?.version;
  if (!proposal || proposal.status !== "pending_confirmation" || typeof proposal.tripId !== "string" || !proposal.tripId.trim() || !Number.isSafeInteger(proposal.baseVersion) || proposal.baseVersion < 0 || (proposal.disruption !== "delay" && proposal.disruption !== "closure" && proposal.disruption !== "queue" && proposal.disruption !== "unwell") || typeof proposal.evidenceId !== "string" || !proposal.evidenceId.trim() || typeof proposal.observedAt !== "string" || typeof proposal.expiresAt !== "string" || !Number.isFinite(decisionNow) || !Number.isFinite(observedAt) || !Number.isFinite(expiresAt) || observedAt > decisionNow || expiresAt < observedAt || (input?.decision !== "accept" && input?.decision !== "reject")) {
    return { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" };
  }
  if (input.decision === "reject") {
    return { status: "rejected", tripId: proposal.tripId, evidenceId: proposal.evidenceId };
  }
  if (expiresAt <= decisionNow) return { status: "recheck_required", reason: "EVIDENCE_STALE" };
  if (typeof tripId !== "string" || !tripId.trim() || !Number.isSafeInteger(tripVersion) || tripVersion < 0) {
    return { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" };
  }
  if (tripId !== proposal.tripId || tripVersion !== proposal.baseVersion) {
    return { status: "conflict", reason: "TRIP_VERSION_CHANGED" };
  }
  return {
    status: "accepted",
    tripId: proposal.tripId,
    baseVersion: proposal.baseVersion,
    disruption: proposal.disruption,
    evidenceId: proposal.evidenceId,
  };
}

export type SafetyRecovery = RecoveryProposal | Readonly<{
  status: "official_channel";
  reason: "HIGH_RISK_UNWELL";
  officialChannelId: string;
}>;

export function proposeSafetyRecovery(input: Readonly<{
  now: Date;
  trip: Readonly<{ id: string; version: number }>;
  disruption: Readonly<{ kind: "queue"; evidenceId: string; observedAt: string; expiresAt: string }> | Readonly<{ kind: "unwell"; severity: "ordinary" | "high_risk"; evidenceId: string; observedAt: string; expiresAt: string; officialChannel?: Readonly<{ id: string; status: "recorded"; authority: "official"; expiresAt: string }> }> | null;
}>): SafetyRecovery {
  if (!input || typeof input !== "object") {
    return { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" };
  }
  const disruption = input?.disruption;
  if (disruption?.kind === "unwell" && disruption.severity !== "ordinary" && disruption.severity !== "high_risk") {
    return { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" };
  }
  if (!disruption || disruption.kind === "queue") {
    return proposeRecovery({ now: input.now, trip: input.trip, disruption });
  }
  const proposal = proposeRecovery({
    now: input.now,
    trip: input.trip,
    disruption: { kind: "queue", evidenceId: disruption.evidenceId, observedAt: disruption.observedAt, expiresAt: disruption.expiresAt },
  });
  if (proposal.status !== "pending_confirmation") return proposal;
  if (disruption.severity === "ordinary") return { ...proposal, disruption: "unwell" };
  if (disruption.severity !== "high_risk") return { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" };
  const officialChannel = currentOfficialChannel(disruption.officialChannel, input.now);
  if (!officialChannel) return { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" };
  return { status: "official_channel", reason: "HIGH_RISK_UNWELL", officialChannelId: officialChannel };
}

function currentOfficialChannel(value: unknown, now: unknown): string | null {
  if (!value || typeof value !== "object" || !(now instanceof Date)) return null;
  const record = value as Readonly<{ id?: unknown; status?: unknown; authority?: unknown; expiresAt?: unknown }>;
  const expiresAt = parseRfc3339Timestamp(record.expiresAt);
  if (typeof record.id !== "string" || !isOpaqueReferenceId(record.id) || record.status !== "recorded" || record.authority !== "official" || !Number.isFinite(now.getTime()) || !Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return null;
  return record.id;
}

function isOpaqueReferenceId(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value);
}

function parseRfc3339Timestamp(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59 || second > 59 || (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59))) return Number.NaN;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function daysInMonth(year: number, month: number): number {
  return month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}
