import type { ExportHandler, ExportLease, ExportPage } from "./export-dispatcher.ts";
import type { ExportDomainRPC } from "./export-worker.ts";

export const MEMORY_EXPORT_SECTIONS = ["profiles", "consents", "receipts", "consumerReferences", "commands", "undoMetadata"] as const;
const fields: Record<string, readonly string[]> = {
  profiles: ["memoryId","revision","state","constraintKind","summary","sourceReceiptId","consentId","consentStatus","createdAt","updatedAt"],
  consents: ["consentId","status","createdAt","updatedAt"],
  receipts: ["receiptId","memoryId","eventState","sourceKind","createdAt"],
  consumerReferences: ["referenceId","memoryId","sourceReceiptId","consumerKind","turnId","proposalId","constraintKind","createdAt"],
  commands: ["commandId","memoryId","consentId","action","state","revision","sourceReceiptId","createdAt"],
  undoMetadata: ["commandId","memoryId","consentId","resultingRevision","expiresAt"],
};
const anchors: Record<string,string> = { profiles:"memoryId",consents:"consentId",receipts:"receiptId",consumerReferences:"referenceId",commands:"commandId",undoMetadata:"commandId" };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const instant = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const state = (v: unknown) => typeof v === "string" && ["explicit","confirmed","inferred","rejected","paused","deleted"].includes(v);
const constraint = (v: unknown) => v === "preference" || v === "hard_constraint";
const summary = (v: unknown) => typeof v === "string" && [...v].length > 0 && [...v].length <= 500 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
const record = (v: unknown): v is Record<string,unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function validRow(section: string, row: Record<string,unknown>): boolean {
  if (section !== "undoMetadata" && !instant(row.createdAt)) return false;
  switch (section) {
    case "profiles": return positive(row.revision) && state(row.state) && constraint(row.constraintKind) && uuid(row.sourceReceiptId) && uuid(row.consentId)
      && typeof row.consentStatus === "string" && ["granted","revoked"].includes(row.consentStatus) && instant(row.updatedAt)
      && ((row.state === "deleted" || row.consentStatus === "revoked") ? row.summary === null : summary(row.summary));
    case "consents": return typeof row.status === "string" && ["granted","revoked"].includes(row.status) && instant(row.updatedAt);
    case "receipts": return uuid(row.memoryId) && state(row.eventState) && typeof row.sourceKind === "string" && ["user_confirmed","bounded_turn","user_artifact","system"].includes(row.sourceKind);
    case "consumerReferences": return uuid(row.memoryId) && uuid(row.sourceReceiptId) && constraint(row.constraintKind)
      && (row.consumerKind === "turn" ? uuid(row.turnId) && row.proposalId === null : row.consumerKind === "proposal" && uuid(row.proposalId) && row.turnId === null);
    case "commands": return (row.memoryId === null || uuid(row.memoryId)) && uuid(row.consentId)
      && typeof row.action === "string" && ["consentCreate","create","createUndo","update","updateUndo","state","revoke"].includes(row.action)
      && (row.state === null || state(row.state)) && (row.revision === null || positive(row.revision)) && (row.sourceReceiptId === null || uuid(row.sourceReceiptId));
    case "undoMetadata": return uuid(row.memoryId) && uuid(row.consentId) && positive(row.resultingRevision) && instant(row.expiresAt);
    default: return false;
  }
}

/** Missing SQL authority fails closed. Job authority owns scope and source fence; no client assertion. */
export type MemoryExportHandler = ExportHandler & { progress: () => { pages: number; rows: number; terminalSections: number } };
export function memoryExportHandler(lease: ExportLease, domain: ExportDomainRPC): MemoryExportHandler {
  let revision: number | null = null, pages=0, rows=0;
  const seen=new Set<string>(), terminal=new Set<string>();
  return { progress:()=>({pages,rows,terminalSections:terminal.size}), sections: MEMORY_EXPORT_SECTIONS, consistency:"live_bounded", page: async (section,cursor,limit,signal):Promise<ExportPage> => {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !fields[section] || (cursor !== null && !uuid(cursor))) throw Error("Memory export unavailable");
    const value = await domain("memory_page", { requestId:lease.requestId,leaseId:lease.leaseId,generation:lease.generation,section,cursor,limit },signal);
    if (!record(value) || Object.keys(value).sort().join() !== "hasMore,items,nextCursor,schemaVersion,section,sectionComplete,sourceRevision"
      || value.schemaVersion !== "memory-core-export/1" || value.section !== section || typeof value.sourceRevision !== "number"
      || !Number.isSafeInteger(value.sourceRevision) || value.sourceRevision < 1 || (revision !== null && revision !== value.sourceRevision)
      || !Array.isArray(value.items) || value.items.length > limit || typeof value.hasMore !== "boolean" || value.sectionComplete !== !value.hasMore
      || (value.hasMore ? value.items.length === 0 || !uuid(value.nextCursor) : value.nextCursor !== null)) throw Error("Memory export unavailable");
    for (const row of value.items) {
      if (!record(row) || Object.keys(row).sort().join() !== [...fields[section]].sort().join() || !uuid(row[anchors[section]]) || !validRow(section,row)) throw Error("Memory export unavailable");
      if (section === "profiles" && ((row.state === "deleted" || row.consentStatus === "revoked") && row.summary !== null)) throw Error("Memory export unavailable");
    }
    if (value.hasMore && (!uuid(value.nextCursor) || value.items.at(-1)[anchors[section]] !== value.nextCursor || cursor !== null && value.nextCursor <= cursor)) throw Error("Memory export unavailable");
    revision=value.sourceRevision;
    const key=JSON.stringify([section,cursor,limit]);
    if (!seen.has(key)) { seen.add(key);pages++;rows+=value.items.length;if (!value.hasMore) terminal.add(section); }
    return { items:structuredClone(value.items),hasMore:value.hasMore,nextCursor:structuredClone(value.nextCursor),sectionComplete:!value.hasMore };
  } };
}
