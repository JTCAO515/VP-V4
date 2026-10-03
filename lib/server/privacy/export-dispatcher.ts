import { createHash } from "node:crypto";

export const CORE_EXPORT_MODULES = ["trip", "conversations", "results", "profile", "memory", "turn", "user_artifact", "brief", "entitlements"] as const;
export type CoreExportModule = typeof CORE_EXPORT_MODULES[number];
export type ExportModuleReceipt = {
  module: CoreExportModule; status: "complete" | "partial" | "unavailable" | "failed";
  reason: "NONE" | "HANDLER_MISSING" | "BOUNDED_LIMIT" | "LIVE_TRAVERSAL" | "SOURCE_UNAVAILABLE";
  pages: number; rows: number; digest: string | null;
};
export type ExportPage = {
  items: unknown[]; hasMore: boolean; nextCursor: unknown; sectionComplete: boolean;
};
export type ExportHandler = {
  sections: readonly string[];
  consistency: "snapshot" | "live_bounded";
  page: (section: string, cursor: unknown, limit: number, signal: AbortSignal) => Promise<ExportPage>;
};
export type ExportLease = { requestId: string; ownerId: string; leaseId: string; generation: number; expiresAt: string };
export type ExportBundle = {
  schemaVersion: "privacy-core-export/1"; requestId: string; generatedAt: string;
  coverage: "partial" | "complete"; allUserDataCompleted: false;
  modules: ExportModuleReceipt[]; data: Partial<Record<CoreExportModule, Record<string, unknown[]>>>;
  notices: { downloadedFilesRecallable: false; providerCopies: "not_exported"; financialRetention: "unchanged" };
};
export function exportCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(exportCanonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${exportCanonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw Error("Invalid export value");
  return encoded;
}
const digest = (value: unknown) => createHash("sha256").update(exportCanonical(value), "utf8").digest("hex");

/** Bounded, request-bound collection. No metadata-only intent is mutated or reported completed. */
export async function collectCoreExport(
  lease: ExportLease, handlers: Partial<Record<CoreExportModule, ExportHandler>>,
  limits: { enabled: boolean; maxPages: number; maxBytes: number; pageSize: number },
  validateLease: (lease: ExportLease) => Promise<boolean>, signal: AbortSignal, now: () => number = Date.now,
): Promise<ExportBundle | null> {
  if (limits.enabled !== true) return null;
  if (![limits.maxPages, limits.maxBytes, limits.pageSize].every(n => Number.isSafeInteger(n) && n > 0)
    || limits.maxPages > 1000 || limits.maxBytes > 8_388_608 || limits.pageSize > 100) return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const expiry = Date.parse(lease.expiresAt), started = now();
  if (![lease.requestId, lease.ownerId, lease.leaseId].every(id => uuid.test(id)) || !Number.isSafeInteger(lease.generation) || lease.generation < 1
    || !Number.isFinite(expiry) || expiry <= started || expiry - started > 90000 || new Date(expiry).toISOString() !== lease.expiresAt) return null;
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.ceil(expiry - started)))]);
  function bounded<T>(work: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => reject(Error("Export deadline reached"));
      boundedSignal.addEventListener("abort", abort, { once: true });
      if (boundedSignal.aborted) { boundedSignal.removeEventListener("abort", abort); return abort(); }
      Promise.resolve().then(work).then(resolve, reject).finally(() => boundedSignal.removeEventListener("abort", abort));
    });
  }
  const current = async () => {
    try { return !boundedSignal.aborted && now() < expiry && await bounded(() => validateLease(lease)); } catch { return false; }
  };
  if (!await current()) return null;
  const data: ExportBundle["data"] = {}, modules: ExportModuleReceipt[] = [];
  let pagesUsed = 0;
  for (const module of CORE_EXPORT_MODULES) {
    const handler = handlers[module];
    if (!handler) { modules.push({ module, status: "unavailable", reason: "HANDLER_MISSING", pages: 0, rows: 0, digest: null }); continue; }
    if (!handler.sections.length || new Set(handler.sections).size !== handler.sections.length
      || !handler.sections.every(s => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(s))
      || !["snapshot", "live_bounded"].includes(handler.consistency)) {
      modules.push({ module, status: "failed", reason: "SOURCE_UNAVAILABLE", pages: 0, rows: 0, digest: null }); continue;
    }
    const sections: Record<string, unknown[]> = {};
    let pages = 0, rows = 0, reason: ExportModuleReceipt["reason"] = "NONE";
    try {
      for (const section of handler.sections) {
        let cursor: unknown = null;
        const seen = new Set<string>(); sections[section] = [];
        for (;;) {
          if (!await current()) return null;
          if (pagesUsed >= limits.maxPages) { reason = "BOUNDED_LIMIT"; break; }
          const page = await bounded(() => handler.page(section, cursor, limits.pageSize, boundedSignal));
          if (!Array.isArray(page.items) || page.items.length > limits.pageSize || typeof page.hasMore !== "boolean"
            || typeof page.sectionComplete !== "boolean" || page.sectionComplete !== !page.hasMore
            || (page.hasMore ? page.nextCursor === null || page.items.length === 0 : page.nextCursor !== null)) throw Error("Invalid page");
          const candidate = { ...data, [module]: { ...sections, [section]: [...sections[section], ...page.items] } };
          if (Buffer.byteLength(exportCanonical(candidate), "utf8") > limits.maxBytes) { reason = "BOUNDED_LIMIT"; break; }
          sections[section].push(...page.items); pages++; pagesUsed++; rows += page.items.length;
          if (!page.hasMore) break;
          const key = exportCanonical(page.nextCursor);
          if (seen.has(key) || key === exportCanonical(cursor)) throw Error("Repeated cursor");
          seen.add(key); cursor = structuredClone(page.nextCursor);
        }
        if (reason !== "NONE") break;
      }
    } catch { reason = "SOURCE_UNAVAILABLE"; }
    if (!await current()) return null;
    data[module] = sections;
    if (reason === "NONE" && handler.consistency === "live_bounded") reason = "LIVE_TRAVERSAL";
    modules.push({ module, status: reason === "NONE" ? "complete" : reason === "SOURCE_UNAVAILABLE" ? "failed" : "partial", reason, pages, rows, digest: digest(sections) });
  }
  if (!await current()) return null;
  const bundle: ExportBundle = { schemaVersion: "privacy-core-export/1", requestId: lease.requestId,
    generatedAt: new Date(now()).toISOString(), coverage: modules.every(m => m.status === "complete") ? "complete" : "partial", allUserDataCompleted: false,
    modules, data, notices: { downloadedFilesRecallable: false, providerCopies: "not_exported", financialRetention: "unchanged" } };
  return Buffer.byteLength(exportCanonical(bundle), "utf8") <= limits.maxBytes ? bundle : null;
}
