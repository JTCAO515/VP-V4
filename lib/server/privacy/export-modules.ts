import { supabaseWorkerHeaders } from "../jobs/supabase-worker-headers.ts";
import { exportCanonical, type ExportLease, type ExportHandler, type ExportPage } from "./export-dispatcher.ts";

export type ExportRPC = (name: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
const allowed = new Set(["assistant_conversation_export_owner_v1", "result_artifact_export_owner_v1", "privacy_core_export_v1", "assistant_message_source_export_owner_v2", "assistant_travel_intake_export_owner_v1"]);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Existing service-only module RPCs, explicit operator configuration; no retries/redirects. */
export function existingExportRPC(config: { url: string; serviceKey: string }, fetcher: typeof fetch = fetch): ExportRPC {
  const url = new URL(config.url);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || !(url.protocol === "https:" && /^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
      || url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw Error("Export transport unavailable");
  const headers = supabaseWorkerHeaders(config.serviceKey);
  return async (name, input, signal) => {
    if (!allowed.has(name) || signal.aborted) throw Error("Export transport unavailable");
    const response = await fetcher(`${url.origin}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(input), signal, redirect: "error", credentials: "omit", cache: "no-store" });
    if (response.status !== 200 || response.headers.get("content-type")?.split(";")[0].trim() !== "application/json") { await response.body?.cancel(); throw Error("Export source unavailable"); }
    const reader = response.body?.getReader();
    if (!reader) throw Error("Export source unavailable");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength;
        if (bytes > 1_048_576 || signal.aborted) { await reader.cancel(); throw Error("Export page too large"); } chunks.push(next.value); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally { reader.releaseLock(); }
  };
}
function page(value: unknown, schema: string, section: string | null, limit: number): ExportPage {
  if (!record(value) || Object.keys(value).sort().join() !== (section === null ? "hasMore,items,nextCursor,schemaVersion,sectionComplete" : "hasMore,items,nextCursor,schemaVersion,section,sectionComplete")
    || value.schemaVersion !== schema || (section !== null && value.section !== section) || !Array.isArray(value.items) || value.items.length > limit
    || typeof value.hasMore !== "boolean" || value.sectionComplete !== !value.hasMore
    || (value.hasMore ? value.items.length === 0 || value.nextCursor === null : value.nextCursor !== null)) throw Error("Export page invalid");
  return { items: structuredClone(value.items), hasMore: value.hasMore, sectionComplete: !value.hasMore, nextCursor: structuredClone(value.nextCursor) };
}

/** Owner is taken solely from the durable validated job lease, never a download/query field. */
export function existingExportHandlers(lease: ExportLease, rpc: ExportRPC): { conversations: ExportHandler; results: ExportHandler } {
  if (!uuid(lease.ownerId)) throw Error("Export owner invalid");
  const conversations = ["conversations", "goals", "messages", "goalTripLinks", "goalTripReceipts", "messageSources", "travelIntakes"] as const;
  const results = ["artifacts", "revisions", "events"] as const;
  return {
    conversations: { sections: conversations, consistency: "live_bounded", page: async (section, cursor, limit, signal) => {
      if (!(conversations as readonly string[]).includes(section) || cursor !== null && !uuid(cursor)) throw Error("Export cursor invalid");
      if (section === "messageSources" || section === "travelIntakes") {
        const sources = section === "messageSources";
        const name = sources ? "assistant_message_source_export_owner_v2" : "assistant_travel_intake_export_owner_v1";
        const input = sources ? { p_owner: lease.ownerId, p_after_message: cursor, p_limit: limit } : { p_owner: lease.ownerId, p_after_id: cursor, p_limit: limit };
        const p = page(await rpc(name, input, signal), sources ? "assistant-message-sources-export/2" : "assistant-travel-intake-export/1", null, limit);
        const rowKeys = sources ? ["messageId", "inputReferences", "capturedReferences", "createdAt"]
          : ["message_id", "intake_revision", "goal_id", "conversation_id", "message_sequence", "goal_version", "intake", "memory_basis", "created_at"];
        if (!p.items.every(row => record(row) && Object.keys(row).sort().join() === [...rowKeys].sort().join() && uuid(row[sources ? "messageId" : "message_id"]))) throw Error("Export row invalid");
        if (p.hasMore) {
          const last = p.items.at(-1), id = sources ? "messageId" : "message_id";
          if (!uuid(p.nextCursor) || !record(last) || last[id] !== p.nextCursor || cursor !== null && p.nextCursor <= String(cursor)) throw Error("Export cursor invalid");
        }
        return p;
      }
      const p = page(await rpc("assistant_conversation_export_owner_v1", { p_owner: lease.ownerId, p_section: section, p_after_id: cursor, p_limit: limit }, signal), "assistant-conversation-export/1", section, limit);
      if (p.hasMore) {
        const id = { conversations: "conversationId", goals: "goalId", messages: "messageId", goalTripLinks: "goalId", goalTripReceipts: "operationId" }[section];
        const last = p.items.at(-1);
        if (!uuid(p.nextCursor) || !record(last) || !id || last[id] !== p.nextCursor || cursor !== null && p.nextCursor <= String(cursor)) throw Error("Export cursor invalid");
      }
      return p;
    } },
    results: { sections: results, consistency: "live_bounded", page: async (section, cursor, limit, signal) => {
      if (!(results as readonly string[]).includes(section)) throw Error("Export cursor invalid");
      const validCursor = (v: unknown) => {
        if (!record(v) || v.ownerId !== lease.ownerId || v.section !== section) return false;
        const keys = section === "artifacts" ? ["artifactId", "ownerId", "section"] : section === "revisions" ? ["artifactId", "ownerId", "revision", "section"] : ["eventId", "ownerId", "section"];
        return Object.keys(v).sort().join() === keys.sort().join() && (section === "events" ? typeof v.eventId === "string" && /^[1-9][0-9]{0,18}$/.test(v.eventId)
          : uuid(v.artifactId) && (section !== "revisions" || typeof v.revision === "number" && Number.isSafeInteger(v.revision) && v.revision > 0));
      };
      if (cursor !== null && !validCursor(cursor)) throw Error("Export cursor invalid");
      const p = page(await rpc("result_artifact_export_owner_v1", { p_owner: lease.ownerId, p_section: section, p_cursor: cursor, p_limit: limit }, signal), "result-artifact-export/1", section, limit);
      if (p.hasMore && (!validCursor(p.nextCursor) || exportCanonical(p.nextCursor) === exportCanonical(cursor))) throw Error("Export cursor invalid");
      return p;
    } },
  };
}
