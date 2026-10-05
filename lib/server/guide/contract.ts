/** Guide consumes current published expressions; no generated or inferred facts. */
export type GuideLocale = "en" | "zh";
export type GuideInterest = "general" | "address" | "opening_hours";
export type GuideSelection = Readonly<{
  expectedTripVersion: number; placeReferenceId: string; locale: GuideLocale;
  interest: GuideInterest;
}>;
export type GuideCommand = GuideSelection & (
  | Readonly<{ action: "read" }>
  | Readonly<{ action: "replay"; expectedDigest: string }>
  | Readonly<{ action: "progress"; operationId: string; expectedDigest: string; completedSegmentIds: readonly string[] }>
  | Readonly<{ action: "forget"; operationId: string }>
  | Readonly<{ action: "export" }>
  | Readonly<{ action: "follow_up"; operationId: string; expectedDigest: string; question: string;
      completedSegmentIds: readonly string[]; threadId: string; turnId: string; policyId: string; serviceTask: Readonly<{
        id: string; scopeVersion: 1; relationship: "new_goal" | "clarification" | "repair"; parentTurnId: string | null;
      }> }>
);
export type GuideSource = Readonly<{
  sourceRevisionId: string; revisionLabel: string; publisher: string; uri: string; locator: string;
}>;
export type GuideSegment = Readonly<{
  id: string; kind: "fact"; subjectId: string; predicate: "located_at" | "opens_during";
  factId: string; factVersion: number; assertionId: string; assertionRevision: number;
  text: string; conditions: readonly string[]; exclusions: readonly string[];
  reviewedAt: string; expiresAt: string; sources: readonly GuideSource[];
}>;
export type GuideReady = Readonly<{
  kind: "ready"; version: 1; tripId: string; tripVersion: number; placeReferenceId: string;
  canonicalPoiId: string; place: Readonly<{ en: string; zh: string }>;
  locale: GuideLocale; interest: GuideInterest; digest: string; evaluatedAt: string; expiresAt: string;
  rights: Readonly<{ revision: number; display: true; tts: boolean; cache: boolean; prompt: boolean }>;
  segments: readonly GuideSegment[]; completedSegmentIds: readonly string[];
  replayAskUnits: 0; narration: "published_facts"; unsupportedNarratives: readonly ["history", "legend"];
  generationCost: null;
}>;
export type GuideUnavailable = Readonly<{
  kind: "unavailable"; reason: "not_covered" | "rights_unavailable" | "source_changed" | "unsupported_language" | "capacity";
  fallback: "explore";
}>;
export type GuideOutcome = GuideReady | GuideUnavailable
  | Readonly<{ kind: "forgotten"; operationId: string }>
  | Readonly<{ kind: "export"; version: 1; scope: "guide_selection_metadata"; coverage: "complete_for_selection";
      tripId: string; placeReferenceId: string; records: readonly GuideExportRecord[]; bindings: readonly GuideBindingExportRecord[] }>
  | Readonly<{ kind: "submitted"; version: 1; operationId: string; tripId: string; turnId: string; serviceTaskId: string;
      scopeVersion: 1; relationship: "new_goal" | "clarification" | "repair"; parentTurnId: string | null;
      guideDigest: string; reused: boolean; generationCost: null }>;

export type GuideExportRecord = Readonly<{
  digest: string; canonicalPoiId: string; locale: GuideLocale; interest: GuideInterest;
  rightsRevision: number; completedSegmentIds: readonly string[]; expiresAt: string; updatedAt: string;
}>;
/** Source/body-free owner metadata. invalidated=false is no eligibility grant. */
export type GuideBindingExportRecord = Readonly<{
  turnId: string; serviceTaskId: string; operationId: string; canonicalPoiId: string;
  locale: GuideLocale; interest: GuideInterest; digest: string; rightsRevision: number;
  expiresAt: string; tripVersion: number; invalidated: boolean;
}>;

export const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
export const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v);
export const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
export const tripVersion = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export const instant = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
export const segmentIds = (v: unknown): v is readonly string[] => Array.isArray(v) && v.length <= 4 && new Set(v).size === v.length && v.every(uuid);

export function parseGuideCommand(value: unknown): GuideCommand | null {
  if (!record(value) || !tripVersion(value.expectedTripVersion) || !uuid(value.placeReferenceId)
    || typeof value.locale !== "string" || !["en", "zh"].includes(value.locale)
    || typeof value.interest !== "string" || !["general", "address", "opening_hours"].includes(value.interest)
    || typeof value.action !== "string") return null;
  const common = ["action", "expectedTripVersion", "placeReferenceId", "locale", "interest"];
  if (["read", "export"].includes(value.action) && exact(value, common)) return value as GuideCommand;
  if (value.action === "replay" && exact(value, [...common, "expectedDigest"]) && hash(value.expectedDigest)) return value as GuideCommand;
  if (value.action === "forget" && exact(value, [...common, "operationId"]) && uuid(value.operationId)) return value as GuideCommand;
  if (value.action === "progress" && exact(value, [...common, "operationId", "expectedDigest", "completedSegmentIds"])
    && uuid(value.operationId) && hash(value.expectedDigest) && segmentIds(value.completedSegmentIds)) return value as GuideCommand;
  if (value.action !== "follow_up" || !exact(value, [...common, "operationId", "expectedDigest", "question", "completedSegmentIds", "threadId", "turnId", "policyId", "serviceTask"])
    || !uuid(value.operationId) || !hash(value.expectedDigest) || !text(value.question, 600)
    || !segmentIds(value.completedSegmentIds)
    || !uuid(value.threadId) || !uuid(value.turnId) || !uuid(value.policyId)
    || !record(value.serviceTask) || !exact(value.serviceTask, ["id", "scopeVersion", "relationship", "parentTurnId"])
    || !uuid(value.serviceTask.id) || value.serviceTask.id === value.turnId || value.serviceTask.scopeVersion !== 1
    || typeof value.serviceTask.relationship !== "string" || !["new_goal", "clarification", "repair"].includes(value.serviceTask.relationship)
    || !(value.serviceTask.parentTurnId === null || uuid(value.serviceTask.parentTurnId))
    || (value.serviceTask.relationship === "new_goal") !== (value.serviceTask.parentTurnId === null)) return null;
  return value as GuideCommand;
}
