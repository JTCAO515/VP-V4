import { readApprovedQaTarget } from "./target.ts";
import { exact, record, uuid } from "./service.ts";

/** Independently supplied by the reviewed deployment package, never discovery. */
export type QaRuntimeBinding = Readonly<{
  schemaVersion: "qa-runtime-binding/1"; projectRef: string;
  ownerId: string; policyId: string; scopeId: string; noticeHash: string;
}>;
export function requireQaRuntimeBinding(raw: unknown, projectRef: string): QaRuntimeBinding {
  if (!record(raw) || !exact(raw, ["schemaVersion", "projectRef", "ownerId", "policyId", "scopeId", "noticeHash"])
    || raw.schemaVersion !== "qa-runtime-binding/1" || raw.projectRef !== projectRef || !readApprovedQaTarget(projectRef)
    || ![raw.ownerId, raw.policyId, raw.scopeId].every(v => uuid(v) && v === v.toLowerCase())
    || typeof raw.noticeHash !== "string" || !/^[a-f0-9]{64}$/.test(raw.noticeHash)) throw new Error("QA runtime binding unavailable");
  return Object.freeze({ ...raw }) as QaRuntimeBinding;
}
