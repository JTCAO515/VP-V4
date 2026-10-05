import { isSourceUri } from "../knowledge/review/source-assertion.ts";
import { exact, hash, instant, integer, record, segmentIds, text, uuid,
  type GuideCommand, type GuideOutcome, type GuideReady, type GuideSegment, type GuideExportRecord } from "./contract.ts";

/** Whole captions, qualifiers included. Conservative reading-time bound, not
 * a promise about a device's installed voice/rate. Never shorten a negation. */
export function caption(segment: GuideSegment): string {
  return [segment.text, ...segment.conditions, ...segment.exclusions].join("\n");
}
export function shortNarration(segments: readonly GuideSegment[], locale: "en" | "zh"): boolean {
  const all = segments.map(caption).join("\n");
  if (all.length > 2400) return false;
  // English handles unspaced/mixed scripts conservatively too.
  const cjk = (all.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const words = all.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, " ").trim().split(/\s+/u).filter(Boolean).length;
  return cjk / 4 + words / 2 <= 120 && (locale !== "zh" || Array.from(all).length <= 480);
}
const qualifiers = (v: unknown): v is readonly string[] => Array.isArray(v) && v.length <= 12 && v.every(x => text(x, 240));
function segment(v: unknown, now: number): v is GuideSegment {
  if (!record(v) || !exact(v, ["id", "kind", "subjectId", "predicate", "factId", "factVersion", "assertionId", "assertionRevision", "text", "conditions", "exclusions", "reviewedAt", "expiresAt", "sources"])
    || !uuid(v.id) || v.id !== v.assertionId || v.kind !== "fact"
    || typeof v.subjectId !== "string" || !/^[a-z][a-z0-9_-]{0,127}$/.test(v.subjectId)
    || typeof v.predicate !== "string" || !["located_at", "opens_during"].includes(v.predicate) || !uuid(v.factId) || !integer(v.factVersion)
    || !uuid(v.assertionId) || !integer(v.assertionRevision) || !text(v.text, 1000)
    || !qualifiers(v.conditions) || !qualifiers(v.exclusions)
    || !instant(v.reviewedAt) || Date.parse(v.reviewedAt) > now || !instant(v.expiresAt) || Date.parse(v.expiresAt) <= now
    || !Array.isArray(v.sources) || v.sources.length < 1 || v.sources.length > 3) return false;
  const ids = new Set<string>();
  return v.sources.every(s => {
    if (!record(s) || !exact(s, ["sourceRevisionId", "revisionLabel", "publisher", "uri", "locator"])
      || !uuid(s.sourceRevisionId) || ids.has(s.sourceRevisionId) || !text(s.revisionLabel, 120)
      || !text(s.publisher, 160) || !isSourceUri(s.uri) || !text(s.locator, 240)) return false;
    ids.add(s.sourceRevisionId); return true;
  });
}

/** Only the authoritative owner RPC can produce this projection. This decoder
 * is structural defense, never a substitute for SQL publication/use checks. */
export function decodeGuideReady(value: unknown, tripId: string, input: GuideCommand, now: number): GuideReady | null {
  if (!Number.isFinite(now) || !record(value) || !exact(value, ["kind", "version", "tripId", "tripVersion", "placeReferenceId", "canonicalPoiId", "place", "locale", "interest", "digest", "evaluatedAt", "expiresAt", "rights", "segments", "completedSegmentIds", "replayAskUnits", "narration", "unsupportedNarratives", "generationCost"])
    || value.kind !== "ready" || value.version !== 1 || value.tripId !== tripId || value.tripVersion !== input.expectedTripVersion
    || value.placeReferenceId !== input.placeReferenceId || value.locale !== input.locale || value.interest !== input.interest
    || !uuid(value.canonicalPoiId) || !record(value.place) || !exact(value.place, ["en", "zh"])
    || !text(value.place.en, 160) || !text(value.place.zh, 160) || !hash(value.digest)
    || !instant(value.evaluatedAt) || Date.parse(value.evaluatedAt) > now || now - Date.parse(value.evaluatedAt) > 30_000
    || !instant(value.expiresAt) || Date.parse(value.expiresAt) <= now
    || !record(value.rights) || !exact(value.rights, ["revision", "display", "tts", "cache", "prompt"])
    || !integer(value.rights.revision) || value.rights.display !== true
    || ![value.rights.tts, value.rights.cache, value.rights.prompt].every(v => typeof v === "boolean")
    || !Array.isArray(value.segments) || value.segments.length < 1 || value.segments.length > 4
    || !value.segments.every(v => segment(v, now)) || new Set(value.segments.map(s => s.id)).size !== value.segments.length
    || !segmentIds(value.completedSegmentIds)
    || !value.rights.cache && value.completedSegmentIds.length !== 0
    || value.segments.some(s => Date.parse(s.expiresAt) < Date.parse(value.expiresAt as string))
    || !shortNarration(value.segments, input.locale)
    || value.replayAskUnits !== 0 || value.narration !== "published_facts" || value.generationCost !== null
    || !Array.isArray(value.unsupportedNarratives) || value.unsupportedNarratives.join() !== "history,legend") return null;
  const segments = value.segments;
  if (value.completedSegmentIds.some(id => !segments.some(s => s.id === id))) return null;
  if (input.interest === "address" && value.segments.some(s => s.predicate !== "located_at")
    || input.interest === "opening_hours" && value.segments.some(s => s.predicate !== "opens_during")) return null;
  if ((input.action === "replay" || input.action === "progress") && value.digest !== input.expectedDigest) return null;
  if (input.action === "progress" && (!value.rights.cache || value.completedSegmentIds.join() !== input.completedSegmentIds.join())) return null;
  return value as GuideReady;
}

function exportRecord(value: unknown, input: GuideCommand, now: number): value is GuideExportRecord {
  return record(value) && exact(value, ["digest", "canonicalPoiId", "locale", "interest", "rightsRevision", "completedSegmentIds", "expiresAt", "updatedAt"])
    && hash(value.digest) && uuid(value.canonicalPoiId) && value.locale === input.locale && value.interest === input.interest
    && integer(value.rightsRevision) && segmentIds(value.completedSegmentIds) && instant(value.expiresAt) && Date.parse(value.expiresAt) > now
    && instant(value.updatedAt) && Date.parse(value.updatedAt) <= now;
}
export function decodeGuideOutcome(value: unknown, tripId: string, input: GuideCommand, now: number): GuideOutcome | null {
  if (!record(value)) return null;
  if (value.kind === "unavailable" && exact(value, ["kind", "reason", "fallback"])
    && typeof value.reason === "string" && ["not_covered", "rights_unavailable", "source_changed", "unsupported_language", "capacity"].includes(value.reason) && value.fallback === "explore") return value as GuideOutcome;
  if (["read", "replay", "progress"].includes(input.action)) return decodeGuideReady(value, tripId, input, now);
  if (input.action === "forget" && exact(value, ["kind", "operationId"]) && value.kind === "forgotten" && value.operationId === input.operationId) return value as GuideOutcome;
  if (input.action === "export" && exact(value, ["kind", "version", "tripId", "placeReferenceId", "records"])
    && value.kind === "export" && value.version === 1 && value.tripId === tripId && value.placeReferenceId === input.placeReferenceId
    && Array.isArray(value.records) && value.records.length <= 100 && value.records.every(v => exportRecord(v, input, now))
    && new Set(value.records.map(v => v.digest)).size === value.records.length) return value as GuideOutcome;
  if (input.action === "follow_up" && exact(value, ["kind", "version", "operationId", "tripId", "turnId", "serviceTaskId", "scopeVersion", "relationship", "parentTurnId", "guideDigest", "reused", "generationCost"])
    && value.kind === "submitted" && value.version === 1 && value.operationId === input.operationId && value.tripId === tripId
    && value.turnId === input.turnId && value.serviceTaskId === input.serviceTask.id && value.scopeVersion === 1
    && value.relationship === input.serviceTask.relationship && value.parentTurnId === input.serviceTask.parentTurnId
    && value.guideDigest === input.expectedDigest && typeof value.reused === "boolean" && value.generationCost === null) return value as GuideOutcome;
  return null;
}
