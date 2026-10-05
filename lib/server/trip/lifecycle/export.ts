import type { ExportLease } from "../../privacy/export-dispatcher.ts";
import { exact, record, uuid, revision, isLifecycleTrip, isLifecycleReceipt } from "./contract.ts";

export type LifecycleExportRPC = (action: "enroll" | "page" | "proof", input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
export type LifecycleExportSection = "trips" | "operations";
function unavailable(): never { throw Error("Lifecycle export source unavailable"); }

/** Separate v2 source handler. Existing core jobs/artifacts are never auto-enrolled. */
export function lifecycleExportSource(lease: ExportLease, rpc: LifecycleExportRPC) {
  if (!uuid(lease.ownerId) || !uuid(lease.requestId) || !uuid(lease.leaseId) || !Number.isInteger(lease.generation) || lease.generation < 1 || lease.generation > 3) unavailable();
  const binding = { requestId: lease.requestId, leaseId: lease.leaseId, generation: lease.generation };
  let sourceRevision: number | null = null;
  const progress = new Map<LifecycleExportSection, { cursor: string | null; terminal: boolean; pages: number; rows: number }>();
  const bound = (v: Record<string, unknown>) => v.requestId === lease.requestId && v.leaseId === lease.leaseId && v.generation === lease.generation;
  const row = (section: LifecycleExportSection, value: unknown): string | null => {
    if (!record(value)) return null;
    if (section === "trips") {
      // Keep original core content projection scoped to this new version.
      if (!exact(value, ["tripId", "title", "headVersion", "confirmationState", "content", "lifecycle"])
        || !isLifecycleTrip(value.lifecycle) || value.tripId !== value.lifecycle.tripId || value.title !== value.lifecycle.title
        || value.headVersion !== value.lifecycle.headVersion || !["initial", "confirmed", "unknown"].includes(String(value.confirmationState))
        || !record(value.content) || !exact(value.content, ["days"]) || !Array.isArray(value.content.days)) return null;
      return value.lifecycle.tripId;
    }
    if (!exact(value, ["operationId", "sessionId", "receipt", "erasedReason"]) || !uuid(value.operationId)) return null;
    if (value.erasedReason !== null) return ["FORBIDDEN", "MEMORY_CONFLICT"].includes(String(value.erasedReason))
      && value.receipt === null && value.sessionId === null ? value.operationId : null;
    return uuid(value.sessionId) && isLifecycleReceipt(value.receipt) && value.receipt.ownerId === lease.ownerId
      && value.receipt.operationId === value.operationId && value.receipt.sessionId === value.sessionId ? value.operationId : null;
  };
  return {
    async enroll(signal: AbortSignal): Promise<void> {
      if (signal.aborted) unavailable();
      const value = await rpc("enroll", binding, signal);
      if (signal.aborted || !record(value) || !exact(value, ["schemaVersion", "requestId", "leaseId", "generation", "sourceRevision", "enrolled"])
        || value.schemaVersion !== "trip-lifecycle-export/2" || !bound(value) || !revision(value.sourceRevision) || value.enrolled !== true
        || sourceRevision !== null && sourceRevision !== value.sourceRevision) unavailable();
      sourceRevision = value.sourceRevision as number;
    },
    async page(section: LifecycleExportSection, cursor: string | null, limit: number, signal: AbortSignal) {
      if (sourceRevision === null || signal.aborted || !["trips", "operations"].includes(section)
        || cursor !== null && !uuid(cursor) || !Number.isInteger(limit) || limit < 1 || limit > 50) unavailable();
      const prior = progress.get(section);
      if (prior ? prior.terminal || prior.cursor !== cursor : cursor !== null) unavailable();
      const value = await rpc("page", { ...binding, section, cursor, limit }, signal);
      if (signal.aborted || !record(value) || !exact(value, ["schemaVersion", "requestId", "leaseId", "generation", "sourceRevision", "section", "items", "hasMore", "nextCursor", "sectionComplete"])
        || value.schemaVersion !== "trip-lifecycle-export/2" || !bound(value) || value.sourceRevision !== sourceRevision || value.section !== section
        || !Array.isArray(value.items) || value.items.length > limit || typeof value.hasMore !== "boolean" || value.sectionComplete !== !value.hasMore) unavailable();
      const page = value as Record<string, unknown> & { items: unknown[]; hasMore: boolean };
      const ids = page.items.map(item => row(section, item));
      if (ids.some((id, i) => !id || cursor !== null && id <= cursor || i > 0 && id <= String(ids[i - 1]))
        || (page.hasMore ? page.items.length !== limit || page.nextCursor !== ids.at(-1) : page.nextCursor !== null)) unavailable();
      progress.set(section, { cursor: page.nextCursor as string | null, terminal: !page.hasMore, pages: (prior?.pages ?? 0) + 1, rows: (prior?.rows ?? 0) + page.items.length });
      return { items: structuredClone(page.items), hasMore: page.hasMore, nextCursor: page.nextCursor as string | null, sectionComplete: !page.hasMore };
    },
    async proof(signal: AbortSignal): Promise<"partial" | "complete"> {
      if (signal.aborted) unavailable();
      if (sourceRevision === null) return "partial";
      const value = await rpc("proof", binding, signal);
      if (signal.aborted || !record(value) || !bound(value) || value.schemaVersion !== "trip-lifecycle-export-proof/2") unavailable();
      if (exact(value as Record<string, unknown>, ["schemaVersion", "requestId", "leaseId", "generation", "coverage", "reason"])) {
        if (value.coverage === "partial" && value.reason === "NOT_ENROLLED_OR_SOURCE_CHANGED") return "partial";
        unavailable();
      }
      if (!exact(value as Record<string, unknown>, ["schemaVersion", "requestId", "leaseId", "generation", "sourceRevision", "coverage", "pages", "rows"])
        || value.sourceRevision !== sourceRevision || !revision(value.pages) || !revision(value.rows) || !["partial", "complete"].includes(String(value.coverage))) unavailable();
      const all = [...progress.values()];
      if (value.coverage === "complete") {
        if (progress.size !== 2 || all.some(p => !p.terminal) || value.pages !== all.reduce((sum, p) => sum + p.pages, 0)
          || value.rows !== all.reduce((sum, p) => sum + p.rows, 0)) unavailable();
        return "complete";
      }
      return "partial";
    },
  };
}
