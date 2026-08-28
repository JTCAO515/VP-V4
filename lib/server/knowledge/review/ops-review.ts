type Draft = Readonly<{ id: string; authorId: string }>;
type Fact = Readonly<{ id: string; draftId: string; visibility: "private" }>;
type Audit = Readonly<{ draftId: string; reviewerId: string; outcome: "published" }>;
const token = /^[a-z][a-z0-9_-]{0,127}$/;

export function createOpsReviewLedger() {
  const drafts = new Map<string, Draft>(); const facts: Fact[] = []; const events: Audit[] = [];
  return Object.freeze({
    submit(input: unknown) { record(input, ["now", "authorId", "draftId"]); timestamp(input.now); const draft = freeze({ id: id(input.draftId), authorId: id(input.authorId) }); if (drafts.has(draft.id)) throw new TypeError("draft already exists"); drafts.set(draft.id, draft); return draft; },
    review(input: unknown) { record(input, ["now", "reviewerId", "draftId", "audit"]); timestamp(input.now); const reviewerId = id(input.reviewerId); const draftId = id(input.draftId); const draft = drafts.get(draftId); if (!draft || draft.authorId === reviewerId || input.audit !== "record") throw new TypeError("review separation or audit denied"); const fact = freeze({ id: `fact-${draftId}`, draftId, visibility: "private" as const }); const audit = freeze({ draftId, reviewerId, outcome: "published" as const }); if (facts.some((item) => item.id === fact.id)) throw new TypeError("already reviewed"); facts.push(fact); events.push(audit); return freeze({ fact, audit }); },
    reviewedFacts: () => freeze([...facts]), audit: () => freeze([...events]),
  });
}
function record(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("record required"); const actual = Object.keys(value); if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError("closed record required"); }
function id(value: unknown): string { if (typeof value !== "string" || !token.test(value)) throw new TypeError("bounded ID required"); return value; }
function timestamp(value: unknown): void { if (typeof value !== "string") throw new TypeError("RFC3339 timestamp required"); const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/.exec(value); if (!parts) throw new TypeError("RFC3339 timestamp required"); const [year, month, day, hour, minute, second] = parts.slice(1).map(Number); const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second)); if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second || Number.isNaN(Date.parse(value))) throw new TypeError("RFC3339 timestamp required"); }
function freeze<T>(value: T): Readonly<T> { if (Array.isArray(value)) value.forEach(freeze); else if (value && typeof value === "object") Object.values(value).forEach(freeze); return Object.freeze(value); }
