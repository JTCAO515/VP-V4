type Phase = "r1" | "r3";
type Kind = "fact-invalidation" | "retrieval-projection" | "explore-projection" | "embedding";
type Message = Readonly<{ jobId: string; kind: Kind; payloadVersion: 1; factId: string }>;
type RecordState = "pending" | "leased" | "quarantined" | "acknowledged";
type QueueRecord = Message & { fingerprint: string; attempts: number; state: RecordState; lease?: Readonly<{ workerId: string; until: string }> };
const idPattern = /^[a-z][a-z0-9_-]{0,127}$/;
const kinds = new Set<Kind>(["fact-invalidation", "retrieval-projection", "explore-projection", "embedding"]);
const maxAttempts = 3;

export function createProjectionQueue(input: unknown) {
  exact(input, ["phase"]); if (input.phase !== "r3") throw new TypeError("queue is unavailable before R3");
  const records = new Map<string, QueueRecord>();
  return Object.freeze({
    enqueue(input: unknown) {
      exact(input, ["jobId", "kind", "payloadVersion", "factId", "now"]); timestamp(input.now);
      const message = messageOf(input); const fingerprint = JSON.stringify(message); const existing = records.get(message.jobId);
      if (existing) { if (existing.fingerprint !== fingerprint) throw new TypeError("conflicting duplicate job"); return view(existing); }
      const record = freeze({ ...message, fingerprint, attempts: 0, state: "pending" as const }); records.set(record.jobId, record); return view(record);
    },
    claim(input: unknown) {
      exact(input, ["workerId", "now", "leaseUntil"]); const workerId = id(input.workerId); timestamp(input.now); timestamp(input.leaseUntil);
      if (Date.parse(input.leaseUntil) <= Date.parse(input.now)) throw new TypeError("lease must be future-dated"); expire(records, input.now);
      const item = [...records.values()].find((record) => record.state === "pending"); if (!item) return null;
      const leased = freeze({ ...item, attempts: item.attempts + 1, state: "leased" as const, lease: freeze({ workerId, until: input.leaseUntil }) }); records.set(item.jobId, leased); return delivery(leased);
    },
    acknowledge(input: unknown) {
      exact(input, ["workerId", "jobId", "now"]); const workerId = id(input.workerId); const jobId = id(input.jobId); timestamp(input.now); expire(records, input.now);
      const item = records.get(jobId); if (!item || item.state !== "leased" || item.lease?.workerId !== workerId) throw new TypeError("active lease required");
      records.set(jobId, freeze({ ...item, state: "acknowledged" as const, lease: undefined }));
    },
    replay(input: unknown) {
      exact(input, ["operatorId", "jobId", "now"]); id(input.operatorId); const jobId = id(input.jobId); timestamp(input.now); expire(records, input.now);
      const item = records.get(jobId); if (!item || item.state !== "quarantined") throw new TypeError("quarantined job required");
      records.set(jobId, freeze({ ...item, attempts: 0, state: "pending" as const, lease: undefined }));
    },
    snapshot() {
      const values = [...records.values()]; return freeze({
        pending: values.filter((item) => item.state === "pending").map(view),
        leased: values.filter((item) => item.state === "leased").map(view),
        quarantined: values.filter((item) => item.state === "quarantined").map((item) => freeze({ jobId: item.jobId, attempts: item.attempts, reason: "max-attempts" as const })),
      });
    },
  });
}

function expire(records: Map<string, QueueRecord>, now: string): void {
  for (const item of records.values()) if (item.state === "leased" && item.lease && Date.parse(item.lease.until) <= Date.parse(now)) records.set(item.jobId, freeze(item.attempts >= maxAttempts ? { ...item, state: "quarantined" as const, lease: undefined } : { ...item, state: "pending" as const, lease: undefined }));
}
function messageOf(value: Record<string, unknown>): Message { if (value.payloadVersion !== 1 || typeof value.kind !== "string" || !kinds.has(value.kind as Kind)) throw new TypeError("supported projection payload required"); return freeze({ jobId: id(value.jobId), kind: value.kind as Kind, payloadVersion: 1, factId: id(value.factId) }); }
function delivery(value: QueueRecord) { return freeze({ ...view(value), attempt: value.attempts }); }
function view(value: QueueRecord) { return freeze({ jobId: value.jobId, kind: value.kind, payloadVersion: value.payloadVersion, factId: value.factId }); }
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("closed record required"); const actual = Object.keys(value); if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError("closed record required"); }
function id(value: unknown): string { if (typeof value !== "string" || !idPattern.test(value)) throw new TypeError("bounded ID required"); return value; }
function timestamp(value: unknown): asserts value is string { if (typeof value !== "string") throw new TypeError("RFC3339 timestamp required"); const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/.exec(value); if (!match) throw new TypeError("RFC3339 timestamp required"); const [year, month, day, hour, minute, second] = match.slice(1).map(Number); const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second)); if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second || Number.isNaN(Date.parse(value))) throw new TypeError("RFC3339 timestamp required"); }
function freeze<T>(value: T): Readonly<T> { if (Array.isArray(value)) value.forEach(freeze); else if (value && typeof value === "object") Object.values(value).forEach(freeze); return Object.freeze(value); }
