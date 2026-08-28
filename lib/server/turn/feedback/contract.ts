export const TURN_RESULT_TYPES = ["needs_input", "answer", "card", "proposal_ready", "unavailable", "conflict"] as const;
export const TURN_FEEDBACK_KINDS = ["another_option", "inaccurate", "reject_reason", "correction"] as const;
export const TURN_FEEDBACK_REASONS = ["different_preference", "not_relevant", "missing_evidence", "incorrect_detail"] as const;

export type TurnResultType = (typeof TURN_RESULT_TYPES)[number];
export type TurnFeedbackKind = (typeof TURN_FEEDBACK_KINDS)[number];
export type TurnFeedbackReason = (typeof TURN_FEEDBACK_REASONS)[number];
export type TurnFeedbackRecord = Readonly<{ id: string; actorId: string; turnId: string; kind: TurnFeedbackKind; reason: TurnFeedbackReason }>;
export class TurnFeedbackInputError extends Error {}

const validPair = new Set(["another_option:different_preference", "inaccurate:not_relevant", "reject_reason:missing_evidence", "correction:incorrect_detail"]);

export function isTurnFeedback(input: Readonly<{ kind: string; reason: string }>): input is Readonly<{ kind: TurnFeedbackKind; reason: TurnFeedbackReason }> {
  return validPair.has(`${input.kind}:${input.reason}`);
}

export class InMemoryTurnFeedbackStore {
  #records = new Map<string, TurnFeedbackRecord>();

  resultTypes(): readonly TurnResultType[] { return TURN_RESULT_TYPES; }

  record(input: Readonly<{ id: string; actorId: string; turnId: string; kind: TurnFeedbackKind; reason: TurnFeedbackReason }>): Readonly<{ id: string; reused: boolean }> {
    if (!isTurnFeedback(input)) throw new TurnFeedbackInputError("feedback must use an approved kind/reason code pair");
    const key = `${input.actorId}:${input.turnId}:${input.kind}:${input.reason}`;
    const previous = this.#records.get(key);
    if (previous) return { id: previous.id, reused: true };
    this.#records.set(key, Object.freeze({ ...input }));
    return { id: input.id, reused: false };
  }

  history(input: Readonly<{ actorId: string; turnId: string }>): readonly TurnFeedbackRecord[] {
    return [...this.#records.values()].filter((record) => record.actorId === input.actorId && record.turnId === input.turnId);
  }
}
