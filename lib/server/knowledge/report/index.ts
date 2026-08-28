type Report = Readonly<{ id: string; authorId: string; targetId: string; kind: "correction" | "rights"; status: "pending"; visibility: "private" }>;
type Submission = Readonly<{ kind: "submitted"; report: Report }>;
type Cascade = Readonly<{ cache: "invalidate"; media: "recheck"; retrieval: "invalidate"; explore: "invalidate"; seo: "invalidate"; trip: "recheck_required" }>;
type Resolution = Readonly<{ kind: "resolved"; audit: Readonly<{ reportId: string; reviewerId: string; disposition: "deprecate" | "update" | "tombstone" }>; cascade: Cascade }>;

const SUBMIT_KEYS = ["reportId", "authorId", "targetId", "kind", "now"] as const;
const RESOLVE_KEYS = ["reportId", "reviewerId", "disposition", "now"] as const;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** C0 private rights/correction ledger. It records no payload and never mutates a Fact or external projection. */
export function createReportLedger(isVerifiedReviewer: (reviewerId: string) => boolean) {
  if (typeof isVerifiedReviewer !== "function") throw new TypeError("Report verifier is required.");
  const reports = new Map<string, Readonly<{ report: Report; submittedAt: string }>>();
  const resolved = new Set<string>();
  return Object.freeze({
    submit(value: unknown): Submission {
      if (!isRecord(value) || !exact(value, SUBMIT_KEYS) || !isId(value.reportId) || !isId(value.authorId) || !isId(value.targetId) || (value.kind !== "correction" && value.kind !== "rights") || !timestamp(value.now) || reports.has(value.reportId)) throw new TypeError("Invalid private report.");
      const report = Object.freeze({ id: value.reportId, authorId: value.authorId, targetId: value.targetId, kind: value.kind, status: "pending" as const, visibility: "private" as const });
      reports.set(report.id, Object.freeze({ report, submittedAt: value.now }));
      return Object.freeze({ kind: "submitted" as const, report });
    },
    resolve(value: unknown): Resolution {
      if (!isRecord(value) || !exact(value, RESOLVE_KEYS) || !isId(value.reportId) || !isId(value.reviewerId) || !["deprecate", "update", "tombstone"].includes(value.disposition as string) || !timestamp(value.now)) throw new TypeError("Invalid report resolution.");
      const entry = reports.get(value.reportId);
      if (!entry || entry.report.authorId === value.reviewerId || isVerifiedReviewer(value.reviewerId) !== true || resolved.has(entry.report.id) || value.now < entry.submittedAt) throw new TypeError("Report review denied.");
      resolved.add(entry.report.id);
      const audit = Object.freeze({ reportId: entry.report.id, reviewerId: value.reviewerId, disposition: value.disposition as "deprecate" | "update" | "tombstone" });
      const cascade = Object.freeze({ cache: "invalidate" as const, media: "recheck" as const, retrieval: "invalidate" as const, explore: "invalidate" as const, seo: "invalidate" as const, trip: "recheck_required" as const });
      return Object.freeze({ kind: "resolved" as const, audit, cascade });
    },
    publicFacts: () => Object.freeze([] as readonly never[]),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function isId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
