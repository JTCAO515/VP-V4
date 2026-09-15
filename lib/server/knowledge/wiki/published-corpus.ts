import type { WikiSearchCorpusEntry } from "./search-index.ts";

/**
 * VPJ-76 (#360) slice 2: adapts the existing, already-authorized
 * `knowledge_read_v1` RPC into a corpus the agentic search loop
 * (wiki-search-job.ts) can query. Deliberately reuses that RPC rather than
 * adding a second read path against publication tables -- all eligibility
 * (published/not-expired/reviewed), authentication and scope filtering
 * stay exactly where they already are, enforced by that RPC's own SQL.
 * This module only reshapes an already-filtered response; it grants no
 * new access and repeats no eligibility check.
 *
 * Scope is a single {city, scene, locale} -- the same triple
 * knowledge_read_v1 already requires. Identifying which city/scene a free-
 * text question is about is intent recognition (the existing
 * knowledge_intent_v1 path), out of scope here: the caller supplies the
 * scope, this module only turns its published statements into search
 * candidates.
 */

export type PublishedCorpusScope = Readonly<{ city: string; scene: string; locale: "zh" | "en" }>;
export type KnowledgeReadRpc = (name: "knowledge_read_v1", params: Readonly<{ p_input: PublishedCorpusScope }>) => Promise<Readonly<{ data: unknown; error: { message: string } | null }>>;

export type PublishedCorpusOutcome =
  | Readonly<{ kind: "corpus"; entries: readonly WikiSearchCorpusEntry[] }>
  | Readonly<{ kind: "unavailable"; code: string }>;

const CITIES = new Set(["shanghai", "beijing", "guangzhou", "chongqing"]);
const SCENES = new Set(["arrival", "airport_transport", "payment", "connectivity", "public_transport", "taxi", "rail", "attraction", "accommodation", "emergency"]);

export async function buildPublishedWikiCorpus(rpc: KnowledgeReadRpc, scope: PublishedCorpusScope): Promise<PublishedCorpusOutcome> {
  if (!CITIES.has(scope.city) || !SCENES.has(scope.scene) || (scope.locale !== "zh" && scope.locale !== "en")) {
    return { kind: "unavailable", code: "INVALID_INPUT" };
  }
  let raw: Readonly<{ data: unknown; error: { message: string } | null }>;
  try {
    raw = await rpc("knowledge_read_v1", { p_input: scope });
  } catch {
    return { kind: "unavailable", code: "KNOWLEDGE_UNAVAILABLE" };
  }
  if (raw.error) return { kind: "unavailable", code: raw.error.message || "KNOWLEDGE_UNAVAILABLE" };
  const parsed = parseKnowledgeRead(raw.data);
  if (!parsed) return { kind: "unavailable", code: "KNOWLEDGE_UNAVAILABLE" };
  return { kind: "corpus", entries: parsed };
}

function parseKnowledgeRead(value: unknown): readonly WikiSearchCorpusEntry[] | null {
  if (!record(value) || value.schemaVersion !== "knowledge-read/1" || !Array.isArray(value.statements)) return null;
  if (value.status === "no_eligible_content") return value.statements.length === 0 ? [] : null;
  if (value.status !== "available") return null;
  const seen = new Set<string>();
  const entries: WikiSearchCorpusEntry[] = [];
  for (const raw of value.statements) {
    if (!record(raw) || typeof raw.factId !== "string" || raw.factId.length === 0 || raw.factId.length > 200) return null;
    if (typeof raw.text !== "string" || raw.text.trim().length === 0) return null;
    if (!Array.isArray(raw.conditions) || !raw.conditions.every((v: unknown) => typeof v === "string")) return null;
    if (!Array.isArray(raw.exclusions) || !raw.exclusions.every((v: unknown) => typeof v === "string")) return null;
    if (seen.has(raw.factId)) return null;
    seen.add(raw.factId);
    const text = [raw.text, ...raw.conditions, ...raw.exclusions].join(". ").slice(0, 4000);
    entries.push({ pageKey: raw.factId, text });
  }
  return entries;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
