import type { OpsWikiReadRpc } from "../research-corpus.ts";
import type { SynthesisDependencies } from "./producer.ts";

/** Bind to a caller-selected current page/version through the existing Ops RPC.
 * Read only canonical sources, never draftContent or a previous revision. The
 * authenticated RPC owns actor eligibility; its errors reject without fallback.
 * This grants neither provider egress rights nor publication eligibility. */
export function createOpsSynthesisSourceReader(
  rpc: OpsWikiReadRpc, pageKey: string, expectedVersion: number,
): SynthesisDependencies["readSources"] {
  return async (ids, signal) => {
    if (signal.aborted || typeof pageKey !== "string" || !pageKey.trim() || pageKey.length > 200
      || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || ids.length < 2 || ids.length > 3) throw new Error("SOURCE_UNAVAILABLE");
    const response = await rpc("ops_wiki_read_v1", { p_input: { pageKey } });
    if (signal.aborted || response.error || !record(response.data)) throw new Error("SOURCE_UNAVAILABLE");
    const page = response.data;
    if (page.pageKey !== pageKey || page.version !== expectedVersion || !Array.isArray(page.revisions)) throw new Error("SOURCE_CHANGED");
    const current = page.revisions[0];
    if (!record(current) || current.version !== expectedVersion || !Array.isArray(current.sourceRevisionIds)
      || !Array.isArray(current.sources)) throw new Error("SOURCE_UNAVAILABLE");
    const sourceRevisionIds = current.sourceRevisionIds;
    if (!ids.every(id => sourceRevisionIds.includes(id))) throw new Error("SOURCE_UNAVAILABLE");
    // Do not flatten all pages/revisions or expose extra sources to generation.
    const sources = current.sources.filter(s => record(s) && ids.includes(s.id as string));
    if (sources.length !== ids.length) throw new Error("SOURCE_UNAVAILABLE");
    return sources;
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
