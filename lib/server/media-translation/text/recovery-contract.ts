import { createHash } from "node:crypto";
import { isUuid } from "../../identity/request-guards.ts";
import { projectTranslation, readTranslationInput, record } from "./contract.ts";

export type TranslationRecoveryIdentity = Readonly<{
  turnId: string; threadId: string; idempotencyKey: string; policyId: string;
  noticeHash: string; sourceLocale: "zh" | "en"; targetLocale: "zh" | "en"; inputHash: string;
}>;
export type TranslationRecoveryState = "unknown" | "pending" | "translated" | "cancelled" | "unavailable" | "needs_review";
export type TranslationRecoveryPhrase = Readonly<{
  turnId: string; sourceLocale: "zh" | "en"; targetLocale: "zh" | "en"; original: string;
  state: Exclude<TranslationRecoveryState, "unknown">; translation: string | null; backTranslation: string | null;
}>;
export type TranslationRecovery = Readonly<{
  version: 1; kind: "translation_recovery"; identity: TranslationRecoveryIdentity;
  state: TranslationRecoveryState; phrase: TranslationRecoveryPhrase | null;
}>;
const keys = ["threadId", "idempotencyKey", "policyId", "noticeHash", "sourceLocale", "targetLocale", "inputHash"] as const;
export const canonicalUuid = (value: unknown): value is string => typeof value === "string" && isUuid(value) && value === value.toLowerCase();
export const translationInputHash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Closed query, no source text or caller-supplied actor authority. */
export function parseTranslationRecoveryIdentity(turnId: string, params: URLSearchParams): TranslationRecoveryIdentity | null {
  if (!canonicalUuid(turnId) || [...params].length !== keys.length || keys.some(key => params.getAll(key).length !== 1)
    || [...params.keys()].some(key => !(keys as readonly string[]).includes(key))) return null;
  const fields = Object.fromEntries(params);
  if (![fields.threadId, fields.idempotencyKey, fields.policyId].every(canonicalUuid)
    || ![fields.noticeHash, fields.inputHash].every(value => /^[a-f0-9]{64}$/.test(value))
    || ![fields.sourceLocale, fields.targetLocale].every(value => value === "zh" || value === "en")
    || fields.sourceLocale === fields.targetLocale) return null;
  return { turnId, ...fields } as TranslationRecoveryIdentity;
}
export function unknownTranslationRecovery(identity: TranslationRecoveryIdentity): TranslationRecovery {
  return { version: 1, kind: "translation_recovery", identity, state: "unknown", phrase: null };
}

/** Only called with independently authorized, policy-bound metadata and exact text. */
export function projectTranslationRecovery(identity: TranslationRecoveryIdentity, turn: unknown): TranslationRecovery {
  const unknown = unknownTranslationRecovery(identity);
  if (!record(turn) || turn.turnId !== identity.turnId || turn.threadId !== identity.threadId || typeof turn.input !== "string") return unknown;
  const input = readTranslationInput(turn.input);
  if (!input || input.sourceLocale !== identity.sourceLocale || input.targetLocale !== identity.targetLocale
    || turn.locale !== identity.targetLocale || translationInputHash(input.text) !== identity.inputHash) return unknown;
  const statuses = ["accepted", "planning", "retrieving", "generating", "validating", "completed", "failed", "unavailable", "cancelled"];
  if (!statuses.includes(String(turn.status)) || ![null, "answered", "partial", "clarification", "blocked", "technical_failure"].includes(turn.outcome as string | null)
    || (turn.output !== null && (typeof turn.output !== "string" || turn.output.length > 8000))
    || (turn.output === null) !== (turn.outcome === null)) return unknown;
  if (["accepted", "planning", "retrieving", "generating", "validating", "cancelled"].includes(String(turn.status)) && turn.output !== null) return unknown;
  // A completion racing its stored text is not evidence of failure.
  if (turn.status === "completed" && turn.output === null) return unknown;
  const phrase = projectTranslation(turn);
  return phrase ? { ...unknown, state: phrase.state, phrase: { ...phrase,
    translation: phrase.state === "translated" ? phrase.translation : null,
    backTranslation: phrase.state === "translated" ? phrase.backTranslation : null } } : unknown;
}
