import { CORE_EXPORT_MODULES, type ExportModuleReceipt } from "./export-dispatcher.ts";
export type ExportJobReceipt = { kind: "privacy_export_job/1"; requestId: string; scope: "core-export-d2/1"; state: "queued" | "running" | "ready_partial" | "ready_complete" | "failed" | "expired"; generation: number; createdAt: string; completedAt: string | null; artifactDigest: string | null; artifactBytes: number | null; artifactExpiresAt: string | null; modules: ExportModuleReceipt[]; allUserDataCompleted: false };
export const exportRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export const exportExact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const exportUUID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const exportUTC = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const exportSHA = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
export function parseExportJob(value: unknown, requestId: string): ExportJobReceipt | null {
  if (!exportRecord(value) || !exportExact(value, ["kind", "requestId", "scope", "state", "generation", "createdAt", "completedAt", "artifactDigest", "artifactBytes", "artifactExpiresAt", "modules", "allUserDataCompleted"])
    || value.kind !== "privacy_export_job/1" || value.requestId !== requestId || !exportUUID(requestId) || value.scope !== "core-export-d2/1" || value.allUserDataCompleted !== false
    || typeof value.generation !== "number" || !Number.isSafeInteger(value.generation) || value.generation < 1 || !exportUTC(value.createdAt)
    || !["queued", "running", "ready_partial", "ready_complete", "failed", "expired"].includes(String(value.state)) || !Array.isArray(value.modules)) return null;
  const ready = value.state === "ready_partial" || value.state === "ready_complete";
  if (ready) {
    if (!exportUTC(value.completedAt) || !exportSHA(value.artifactDigest) || !exportUTC(value.artifactExpiresAt)
      || typeof value.artifactBytes !== "number" || !Number.isSafeInteger(value.artifactBytes) || value.artifactBytes < 1 || value.artifactBytes > 8388608
      || value.modules.length !== CORE_EXPORT_MODULES.length) return null;
    for (let i = 0; i < value.modules.length; i++) {
      const m = value.modules[i];
      if (!exportRecord(m) || !exportExact(m, ["module", "status", "reason", "pages", "rows", "digest"]) || m.module !== CORE_EXPORT_MODULES[i]
        || !["complete", "partial", "unavailable", "failed"].includes(String(m.status)) || !["NONE", "HANDLER_MISSING", "BOUNDED_LIMIT", "LIVE_TRAVERSAL", "SOURCE_UNAVAILABLE"].includes(String(m.reason))
        || typeof m.pages !== "number" || !Number.isSafeInteger(m.pages) || m.pages < 0 || m.pages > 1000 || typeof m.rows !== "number" || !Number.isSafeInteger(m.rows) || m.rows < 0 || m.rows > 100000
        || (m.digest !== null && !exportSHA(m.digest)) || (m.status === "complete" ? m.reason !== "NONE" || m.digest === null : m.reason === "NONE")
        || (m.status === "unavailable" && (m.reason !== "HANDLER_MISSING" || m.pages !== 0 || m.rows !== 0 || m.digest !== null))) return null;
    }
    const complete = value.modules.every(m => m.status === "complete");
    if (complete !== (value.state === "ready_complete")) return null;
  } else if (value.state !== "expired" && (value.completedAt !== null || value.artifactDigest !== null || value.artifactBytes !== null || value.artifactExpiresAt !== null || value.modules.length !== 0)) return null;
  return structuredClone(value) as ExportJobReceipt;
}
