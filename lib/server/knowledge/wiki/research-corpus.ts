import type { WikiSearchCorpusEntry } from "./search-index.ts";
import { isStructuredWikiDraft } from "./proposals.ts";
import { isValidWikiGenerationDraftOutput } from "../../model-gateway/prompt/wiki-generation.ts";

/**
 * VPJ-76 (#360) slice 5: the *research* side of "one set of knowledge, two
 * retrieval purposes" (docs/knowledge-upgrade/README.md, "一套知识，两个
 * 检索用途"). buildPublishedWikiCorpus (slice 2) reads only what a normal
 * authenticated user is eligible to see, published. This module reads the
 * same underlying pages through the existing Ops-only ops_wiki_read_v1 RPC
 * instead -- draft/unpublished/rejected content included -- gated by that
 * RPC's own current_actor() Ops-membership check, not by a UI label. It
 * grants no new access: an actor who cannot already call ops_wiki_read_v1
 * gets OPS_FORBIDDEN from that RPC exactly as they always would.
 *
 * Deliberately not a new migration/RPC: ops_wiki_read_v1 already exists
 * (VPJ-75 slice 3, used by the /ops/wiki review UI) and already returns
 * everything needed here. Two calls per page (list, then each page's
 * detail) because that RPC's list mode intentionally omits draftContent --
 * acceptable at the current, small page count; not something this slice
 * tries to optimize.
 */

export type OpsWikiReadRpc = (name: "ops_wiki_read_v1", params: Readonly<{ p_input: Record<string, never> | Readonly<{ pageKey: string }> }>) => Promise<Readonly<{ data: unknown; error: { message: string } | null }>>;

export type ResearchCorpusOutcome =
  | Readonly<{ kind: "corpus"; entries: readonly WikiSearchCorpusEntry[] }>
  | Readonly<{ kind: "unavailable"; code: string }>;

const MAX_PAGES = 50;

export async function buildResearchWikiCorpus(rpc: OpsWikiReadRpc, maxPages = MAX_PAGES): Promise<ResearchCorpusOutcome> {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES) return { kind: "unavailable", code: "INVALID_INPUT" };

  const pageKeys = await listPageKeys(rpc, maxPages);
  if (pageKeys === null) return { kind: "unavailable", code: "OPS_UNAVAILABLE" };

  const entries: WikiSearchCorpusEntry[] = [];
  for (const pageKey of pageKeys) {
    let raw: Readonly<{ data: unknown; error: { message: string } | null }>;
    try {
      raw = await rpc("ops_wiki_read_v1", { p_input: { pageKey } });
    } catch {
      return { kind: "unavailable", code: "OPS_UNAVAILABLE" };
    }
    if (raw.error) return { kind: "unavailable", code: raw.error.message || "OPS_UNAVAILABLE" };
    const text = extractLatestSummary(raw.data);
    if (text === null) return { kind: "unavailable", code: "OPS_UNAVAILABLE" };
    if (text !== undefined) entries.push({ pageKey, text });
  }
  return { kind: "corpus", entries };
}

async function listPageKeys(rpc: OpsWikiReadRpc, maxPages: number): Promise<readonly string[] | null> {
  let raw: Readonly<{ data: unknown; error: { message: string } | null }>;
  try {
    raw = await rpc("ops_wiki_read_v1", { p_input: {} });
  } catch {
    return null;
  }
  if (raw.error) return null;
  if (!record(raw.data) || !Array.isArray(raw.data.pages)) return null;
  const keys: string[] = [];
  for (const entry of raw.data.pages) {
    if (!record(entry) || typeof entry.pageKey !== "string" || entry.pageKey.length === 0 || entry.pageKey.length > 200) return null;
    keys.push(entry.pageKey);
  }
  return keys.slice(0, maxPages);
}

/**
 * undefined = this page has no usable draft text yet (fine, just skip it);
 * null = the response itself was malformed (a real error, propagate it).
 */
function extractLatestSummary(value: unknown): string | null | undefined {
  if (!record(value) || typeof value.pageKey !== "string" || !Array.isArray(value.revisions)) return null;
  if (value.revisions.length === 0) return undefined;
  const latest = value.revisions[0];
  if (!record(latest) || typeof latest.version !== "number") return null;
  const draft = latest.draftContent;
  if (draft === null || draft === undefined) return undefined;
  if (isValidWikiGenerationDraftOutput(draft) || isStructuredWikiDraft(draft)) return draft.summary;
  return null;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
