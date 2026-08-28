type Source = Readonly<{ sourceId: string; rowId: string; rowHash: string; sourceVersion: string }>;
type Candidate = Readonly<{ id: string; status: "candidate"; visibility: "private"; revision: number; authorId: string; source: Source }>;
type ChangeSet = Readonly<{ id: string; candidateId: string; authorId: string; revision: number }>;
type Fact = Readonly<{ id: string; status: "reviewed"; candidateId: string }>;
type Audit = Readonly<{ actorId: string; candidateId: string; outcome: "merge" | "split" | "tombstone" | "source_delete" | "publish" }>;
const token = /^[a-z][a-z0-9_-]{0,127}$/;
const hash = /^[a-z0-9_-]{8,128}$/;

export function createKnowledgeImportLedger() {
  const sources = new Map<string, string>();
  const candidates = new Map<string, Candidate>();
  const changes = new Map<string, ChangeSet>();
  const facts: Fact[] = [];
  const audit: Audit[] = [];
  return Object.freeze({
    prepareImport(input: unknown) {
      record(input, ["now", "actorId", "source", "candidateId"]); timestamp(input.now); const actorId = id(input.actorId); const candidateId = id(input.candidateId); const source = parseSource(input.source);
      const sourceKey = `${source.sourceId}:${source.rowId}`; const known = sources.get(sourceKey); if (known) { if (known !== source.rowHash) throw new TypeError("source row hash replay drift"); throw new TypeError("source row already imported"); } if (candidates.has(candidateId)) throw new TypeError("candidate ID already exists");
      sources.set(sourceKey, source.rowHash); const candidate = freeze({ id: candidateId, status: "candidate" as const, visibility: "private" as const, revision: 1, authorId: actorId, source }); candidates.set(candidateId, candidate); return freeze({ kind: "prepared" as const, candidate });
    },
    createChangeSet(input: unknown) {
      record(input, ["now", "actorId", "candidateId", "expectedRevision"]); timestamp(input.now); const actorId = id(input.actorId); const candidateId = id(input.candidateId); const candidate = candidates.get(candidateId); if (!candidate || candidate.authorId !== actorId || input.expectedRevision !== candidate.revision) throw new TypeError("candidate CAS denied");
      const change = freeze({ id: `changeset-${candidateId}-${candidate.revision}`, candidateId, authorId: actorId, revision: candidate.revision }); if (changes.has(change.id)) throw new TypeError("change set already exists"); changes.set(change.id, change); return change;
    },
    reviewAndPublish(input: unknown) {
      record(input, ["now", "actorId", "changeSetId", "expectedRevision", "decision"]); timestamp(input.now); const actorId = id(input.actorId); const changeSetId = id(input.changeSetId); const change = changes.get(changeSetId); if (!change || input.expectedRevision !== change.revision || input.decision !== "approve" || actorId === change.authorId) throw new TypeError("review CAS or separation denied");
      const fact = freeze({ id: `fact-${change.candidateId}-${change.revision}`, status: "reviewed" as const, candidateId: change.candidateId }); if (facts.some((item) => item.id === fact.id)) throw new TypeError("fact already published"); const eligibilityEvent = freeze({ kind: "eligibility_recheck_required" as const, factId: fact.id }); const event = freeze({ actorId, candidateId: change.candidateId, outcome: "publish" as const }); facts.push(fact); audit.push(event); return freeze({ kind: "published" as const, fact, eligibilityEvent, audit: event });
    },
    recordSourceDisposition(input: unknown) {
      record(input, ["now", "actorId", "candidateId", "outcome"]); timestamp(input.now); const actorId = id(input.actorId); const candidateId = id(input.candidateId); if (!candidates.has(candidateId) || !["merge", "split", "tombstone", "source_delete"].includes(input.outcome as string)) throw new TypeError("invalid source disposition"); const event = freeze({ actorId, candidateId, outcome: input.outcome as Audit["outcome"] }); audit.push(event); return event;
    },
    // A reviewed fact is still private until the existing eligibility pipeline creates a public projection.
    reviewedFacts: () => freeze([...facts]),
    publicFacts: () => freeze([] as Fact[]),
    audit: () => freeze([...audit]),
  });
}
function parseSource(value: unknown): Source { record(value, ["sourceId", "rowId", "rowHash", "sourceVersion"]); if (typeof value.rowHash !== "string" || !hash.test(value.rowHash)) throw new TypeError("source hash must be bounded"); return freeze({ sourceId: id(value.sourceId), rowId: id(value.rowId), rowHash: value.rowHash, sourceVersion: id(value.sourceVersion) }); }
function record(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("record required"); const actual = Object.keys(value); if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError("closed record required"); }
function id(value: unknown): string { if (typeof value !== "string" || !token.test(value)) throw new TypeError("bounded ID required"); return value; }
function timestamp(value: unknown): void {
  if (typeof value !== "string") throw new TypeError("RFC3339 timestamp required");
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!parts) throw new TypeError("RFC3339 timestamp required");
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number); const milliseconds = Number((parts[7] ?? "").slice(0, 3).padEnd(3, "0")); const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second, milliseconds));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second || Number.isNaN(Date.parse(value))) throw new TypeError("RFC3339 timestamp required");
}
function freeze<T>(value: T): Readonly<T> { if (Array.isArray(value)) value.forEach(freeze); else if (value && typeof value === "object") Object.values(value).forEach(freeze); return Object.freeze(value); }
