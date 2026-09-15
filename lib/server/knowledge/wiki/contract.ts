import {isStructuredWikiDraft, type StructuredWikiDraft} from "./proposals.ts";
import { isValidWikiGenerationDraftOutput, type WikiGenerationDraftOutput } from "../../model-gateway/prompt/wiki-generation.ts";

/** Wiki page/job contract and compatible revision reader. Historical revisions
 * may omit draftContent; new successful completions require the complete body. */

export type PageType = "source_summary" | "entity_procedure" | "topic" | "comparison_gap";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type ValidationStatus = "draft" | "validated" | "rejected";

export type WikiPage = Readonly<{ id: string; pageType: PageType; pageKey: string; version: number }>;

export type WikiGenerationJob = Readonly<{
  id: string;
  pageKey: string;
  inputDigest: string;
  status: JobStatus;
  startedAt: string | null;
  finishedAt: string | null;
  cost: Readonly<{ unknown: true } | { unknown: false; tokens: number }>;
  errorCode: string | null;
}>;

export type WikiPageRevision = Readonly<{
  id: string;
  pageId: string;
  version: number;
  sourceRevisionIds: readonly string[];
  statementRefs: readonly string[];
  jobId: string;
  promptVersion: string;
  configDigest: string;
  inputDigest: string;
  generatedAt: string;
  validationStatus: ValidationStatus;
  changeNote: string;
  /** Absent/null on historical revisions; never reconstruct from changeNote. */
  draftContent?: WikiGenerationDraftOutput | StructuredWikiDraft | null;
}>;

const PAGE_TYPES: readonly PageType[] = ["source_summary", "entity_procedure", "topic", "comparison_gap"];
const JOB_STATUSES: readonly JobStatus[] = ["queued", "running", "succeeded", "failed", "cancelled"];
const VALIDATION_STATUSES: readonly ValidationStatus[] = ["draft", "validated", "rejected"];
const DIGEST = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const digest = (v: unknown): v is string => typeof v === "string" && DIGEST.test(v);
const boundedText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= max;
const isoInstant = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

export function isValidWikiPage(value: unknown): value is WikiPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return uuid(v.id) && PAGE_TYPES.includes(v.pageType as PageType)
    && boundedText(v.pageKey, 200)
    && typeof v.version === "number" && Number.isInteger(v.version) && v.version >= 0;
}

/**
 * Mirrors the migration's job state machine checks: `queued` has no
 * `startedAt`; a terminal status always has `finishedAt`; only `failed`
 * carries an `errorCode`; a known cost always carries a token count.
 */
export function isValidWikiGenerationJob(value: unknown): value is WikiGenerationJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!uuid(v.id) || !boundedText(v.pageKey, 200) || !digest(v.inputDigest)) return false;
  if (!JOB_STATUSES.includes(v.status as JobStatus)) return false;
  const status = v.status as JobStatus;
  const startedAt = v.startedAt;
  const finishedAt = v.finishedAt;
  if ((status === "queued") !== (startedAt === null)) return false;
  if (startedAt !== null && !isoInstant(startedAt)) return false;
  const terminal = status === "succeeded" || status === "failed" || status === "cancelled";
  if (terminal !== (finishedAt !== null)) return false;
  if (finishedAt !== null && !isoInstant(finishedAt)) return false;
  if ((status === "failed") !== (typeof v.errorCode === "string")) return false;
  if (typeof v.errorCode === "string" && !boundedText(v.errorCode, 60)) return false;
  if (v.errorCode !== null && typeof v.errorCode !== "string") return false;
  return isValidCost(v.cost);
}

function isValidCost(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.unknown === true) return Object.keys(v).length === 1;
  if (v.unknown !== false) return false;
  return Object.keys(v).length === 2 && typeof v.tokens === "number" && Number.isInteger(v.tokens) && v.tokens >= 0;
}

export function isValidWikiPageRevision(value: unknown): value is WikiPageRevision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!uuid(v.id) || !uuid(v.pageId) || !uuid(v.jobId)) return false;
  if (typeof v.version !== "number" || !Number.isInteger(v.version) || v.version < 1) return false;
  if (!Array.isArray(v.sourceRevisionIds) || v.sourceRevisionIds.length < 1 || !v.sourceRevisionIds.every(uuid)) return false;
  if (!Array.isArray(v.statementRefs) || !v.statementRefs.every(uuid)) return false;
  if (!boundedText(v.promptVersion, 60) || !digest(v.configDigest) || !digest(v.inputDigest)) return false;
  if (!isoInstant(v.generatedAt)) return false;
  if (!VALIDATION_STATUSES.includes(v.validationStatus as ValidationStatus)) return false;
  return boundedText(v.changeNote, 400)
    && (v.draftContent == null || isValidWikiGenerationDraftOutput(v.draftContent) || isStructuredWikiDraft(v.draftContent));
}

/**
 * The stable dedup key a caller must derive identically every time for the
 * "same input never rebuilds a page" invariant to hold at the DB level
 * (unique on (pageKey, inputDigest)). Deliberately simple and inspectable --
 * no hashing of the key itself, only ':'-joined bounded segments.
 */
export function derivePageKey(pageType: PageType, subjectId: string): string {
  if (!PAGE_TYPES.includes(pageType)) throw new TypeError("pageType must be closed");
  if (!boundedText(subjectId, 150)) throw new TypeError("subjectId must be a bounded non-empty string with no leading/trailing space");
  return `${pageType}:${subjectId}`;
}
