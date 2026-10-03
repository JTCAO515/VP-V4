export type ExportPolicy = { enabled: true; environment: "local" | "staging" | "production"; maxRunMs: number; artifactTtlMs: number; downloadTicketTtlMs: number; maxPages: number; pageSize: number; maxBytes: number };
export function parseExportPolicy(raw: string | undefined, environment: string): ExportPolicy | null {
  try {
    if (!raw || Buffer.byteLength(raw, "utf8") > 4096) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join() !== "artifactTtlMs,downloadTicketTtlMs,enabled,environment,maxBytes,maxPages,maxRunMs,pageSize"
      || v.enabled !== true || !["local", "staging", "production"].includes(environment) || v.environment !== environment) return null;
    for (const [field, cap] of Object.entries({ maxRunMs: 90000, artifactTtlMs: 86400000, downloadTicketTtlMs: 300000, maxPages: 1000, pageSize: 100, maxBytes: 8388608 })) if (!Number.isSafeInteger(v[field]) || v[field] < 1 || v[field] > cap) return null;
    return v as ExportPolicy;
  } catch { return null; }
}
