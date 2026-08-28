export type RecoveryProposal =
  | Readonly<{ status: "pending_confirmation"; tripId: string; baseVersion: number; disruption: "delay" | "closure"; evidenceId: string; observedAt: string; expiresAt: string }>
  | Readonly<{ status: "recheck_required"; reason: "EVIDENCE_STALE" }>
  | Readonly<{ status: "unavailable"; reason: "NO_ELIGIBLE_EVIDENCE" }>;

type PendingRecoveryProposal = Extract<RecoveryProposal, { status: "pending_confirmation" }>;

export type RecoveryDecision =
  | Readonly<{ status: "accepted"; tripId: string; baseVersion: number; disruption: "delay" | "closure"; evidenceId: string }>
  | Readonly<{ status: "rejected"; tripId: string; evidenceId: string }>
  | Readonly<{ status: "conflict"; reason: "TRIP_VERSION_CHANGED" }>
  | Readonly<{ status: "recheck_required"; reason: "EVIDENCE_STALE" }>
  | Readonly<{ status: "unavailable"; reason: "NO_ELIGIBLE_EVIDENCE" }>;

export function proposeRecovery(input: Readonly<{
  now: Date;
  trip: Readonly<{ id: string; version: number }>;
  disruption: Readonly<{ kind: "delay" | "closure"; evidenceId: string; observedAt: string; expiresAt: string }> | null;
}>): RecoveryProposal {
  const disruption = input?.disruption;
  const now = input?.now instanceof Date ? input.now.getTime() : Number.NaN;
  const tripId = input?.trip?.id;
  const tripVersion = input?.trip?.version;
  const evidenceId = disruption?.evidenceId;
  const observedAt = typeof disruption?.observedAt === "string" ? Date.parse(disruption.observedAt) : Number.NaN;
  const expiresAt = typeof disruption?.expiresAt === "string" ? Date.parse(disruption.expiresAt) : Number.NaN;
  if (!disruption || (disruption.kind !== "delay" && disruption.kind !== "closure") || typeof tripId !== "string" || !tripId.trim() || !Number.isSafeInteger(tripVersion) || tripVersion < 0 || typeof evidenceId !== "string" || !evidenceId.trim() || !Number.isFinite(now) || !Number.isFinite(observedAt) || !Number.isFinite(expiresAt) || observedAt > now || expiresAt < observedAt) {
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
  const observedAt = typeof proposal?.observedAt === "string" ? Date.parse(proposal.observedAt) : Number.NaN;
  const expiresAt = typeof proposal?.expiresAt === "string" ? Date.parse(proposal.expiresAt) : Number.NaN;
  const tripId = input?.trip?.id;
  const tripVersion = input?.trip?.version;
  if (!proposal || proposal.status !== "pending_confirmation" || typeof proposal.tripId !== "string" || !proposal.tripId.trim() || !Number.isSafeInteger(proposal.baseVersion) || proposal.baseVersion < 0 || (proposal.disruption !== "delay" && proposal.disruption !== "closure") || typeof proposal.evidenceId !== "string" || !proposal.evidenceId.trim() || typeof proposal.observedAt !== "string" || typeof proposal.expiresAt !== "string" || !Number.isFinite(decisionNow) || !Number.isFinite(observedAt) || !Number.isFinite(expiresAt) || observedAt > decisionNow || expiresAt < observedAt || (input?.decision !== "accept" && input?.decision !== "reject")) {
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
