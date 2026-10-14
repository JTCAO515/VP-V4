import { descriptorSnapshot } from "./descriptor-snapshot.ts";
import { createHash } from "node:crypto";
import { proposalInputDigest, type WikiProposalJobInput, type WikiProposalJobOutcome } from "../../../jobs/wiki-statement-proposal-job.ts";
import { isSourceUri, type SourceDeclaration } from "../../review/source-assertion.ts";
import { detectProposalConflicts, isStructuredWikiDraft, resolveProposalOutput, type ProposalConflict, type ProposalSource, type StatementWithoutSources } from "../proposals.ts";
import type { WikiRead } from "../read-model.ts";

export type SourceSpan = Readonly<{ sourceRevisionId: string; snippetHash: string; startOffset: number; endOffset: number }>;
export type SynthesisInput = Readonly<Omit<WikiProposalJobInput, "sources"> & { sources: readonly SourceSpan[] }>;
export type SynthesisDependencies = Readonly<{
  /** Authenticated caller context, never supplied by the model. No review port exists here. */
  authorId: string;
  /** Read canonical source rows through the existing authorized source owner.
   * Never adapt Wiki summaries, a research corpus, or prior model outputs into rows.
   * Missing authority must reject, not fall back to caller declarations. */
  readSources(ids: readonly string[], signal: AbortSignal): Promise<unknown>;
}>;
export type SynthesisOutcome =
  | Readonly<{ kind: "draft"; authorId: string; outcome: Extract<WikiProposalJobOutcome, { kind: "succeeded" }>;
      sourceSpans: readonly SourceSpan[]; conflicts: readonly ProposalConflict[]; uncitedSourceRevisionIds: readonly string[] }>
  | Readonly<{ kind: "failed"; errorCode: "INVALID_INPUT" | "SOURCE_UNAVAILABLE" | "SOURCE_CHANGED" | "MODEL_OUTPUT_INVALID" | "GENERATION_FAILED" | "TIMEOUT" }>
  | Readonly<{ kind: "cancelled" }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const MAX_BYTES = 32768;
const keys = (value: unknown, expected: readonly string[]): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)
  && Reflect.ownKeys(value).length === expected.length && expected.every(key => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return field?.enumerable === true && Object.hasOwn(field, "value");
  });
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const hash = (value: unknown): value is string => typeof value === "string" && HASH.test(value);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function bytes(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return Infinity; }
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function validInput(value: unknown): value is SynthesisInput {
  if (!keys(value, ["dataClass", "sources", "configDigest", "maxOutputTokens", "timeoutMs", "provider"])
    || value.dataClass !== "c0_synthetic" || !hash(value.configDigest)
    || !Number.isSafeInteger(value.maxOutputTokens) || (value.maxOutputTokens as number) < 1 || (value.maxOutputTokens as number) > 8192
    || !Number.isSafeInteger(value.timeoutMs) || (value.timeoutMs as number) < 1 || (value.timeoutMs as number) > 60000
    || !keys(value.provider, ["provider", "endpoint", "configurationId", "configurationVersion", "timeoutMs"])
    || !Array.isArray(value.sources) || value.sources.length < 2 || value.sources.length > 3) return false;
  return value.sources.every(s => keys(s, ["sourceRevisionId", "snippetHash", "startOffset", "endOffset"])
    && uuid(s.sourceRevisionId) && hash(s.snippetHash) && Number.isSafeInteger(s.startOffset) && Number.isSafeInteger(s.endOffset)
    && (s.startOffset as number) >= 0 && (s.endOffset as number) > (s.startOffset as number) && (s.endOffset as number) <= 2000)
    && new Set(value.sources.map(s => s.sourceRevisionId.toLowerCase())).size === value.sources.length && bytes(value) <= MAX_BYTES;
}
function validDeclaration(value: unknown): value is SourceDeclaration {
  return keys(value, ["sourceKey", "revisionLabel", "publisher", "uri", "locator", "snippet", "usageDeclaration"])
    && text(value.sourceKey, 128) && /^[a-z][a-z0-9_-]{0,127}$/.test(value.sourceKey)
    && text(value.revisionLabel, 120) && text(value.publisher, 160) && isSourceUri(value.uri)
    && text(value.locator, 240)
    && text(value.snippet, 2000) && text(value.usageDeclaration, 500);
}
type SourceRow = WikiRead["revisions"][number]["sources"][number];
function selectSources(raw: unknown, spans: readonly SourceSpan[]): readonly ProposalSource[] | null {
  const snapshot = descriptorSnapshot(raw, MAX_BYTES, 3);
  if (!Array.isArray(snapshot) || snapshot.length !== spans.length) return null;
  const rows = snapshot as SourceRow[];
  if (new Set(rows.map(r => r?.id?.toLowerCase())).size !== rows.length) return null;
  const result: ProposalSource[] = [];
  for (const span of spans) {
    const row = rows.find(r => r?.id === span.sourceRevisionId);
    if (!row || row.missing !== false || row.withdrawnAt !== null || row.withdrawnBy !== null || row.withdrawalReason !== null
      || row.lineageStatus !== "tracked" || row.snippetHash !== span.snippetHash || !validDeclaration(row.declaration)
      || digest(row.declaration.snippet) !== span.snippetHash || span.endOffset > Array.from(row.declaration.snippet).length) return null;
    result.push({ id: row.id, declaration: row.declaration });
  }
  if (new Set(result.map(s => `${s.declaration.sourceKey}:${s.declaration.revisionLabel}`)).size !== result.length) return null;
  return freeze(result);
}
function validUsage(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const usage = value as Record<string, unknown>;
  if (!Reflect.ownKeys(usage).every(k => typeof k === "string" && ["inputTokens", "outputTokens", "totalTokens", "cachedInputTokens", "uncachedInputTokens", "reasoningTokens", "cost"].includes(k))) return false;
  if (![usage.inputTokens, usage.outputTokens, usage.totalTokens].every(n => Number.isSafeInteger(n) && (n as number) >= 0)) return false;
  for (const [key, limit] of [["cachedInputTokens", usage.inputTokens], ["uncachedInputTokens", usage.inputTokens], ["reasoningTokens", usage.outputTokens]] as const) {
    const n = usage[key];
    if (n !== undefined && n !== null && (!Number.isSafeInteger(n) || (n as number) < 0 || (n as number) > (limit as number))) return false;
  }
  return usage.cost === undefined || usage.cost === "unknown";
}
function validOutcome(value: WikiProposalJobOutcome, input: WikiProposalJobInput, spans: readonly SourceSpan[]): value is Extract<WikiProposalJobOutcome, { kind: "succeeded" }> {
  if (!keys(value, ["kind", "output", "usage", "inputDigest"]) || value.kind !== "succeeded"
    || value.inputDigest !== proposalInputDigest(input) || !isStructuredWikiDraft(value.output) || bytes(value.output) > MAX_BYTES
    || !validUsage(value.usage)
    || value.usage.outputTokens > input.maxOutputTokens
    || value.usage.totalTokens !== value.usage.inputTokens + value.usage.outputTokens) return false;
  const proposals = value.output.statementProposals.map(p => {
    const { sources: _sources, ...statement } = p.statement;
    return { statement: statement as StatementWithoutSources, evidence: p.evidence.map(({ sourceRevisionId, quote }) => ({ sourceRevisionId, quote })) };
  });
  // Reuse canonical proposal binding, including ambiguous quotes and code-point
  // offsets. Do not trust even an otherwise schema-valid generation outcome.
  const canonical = resolveProposalOutput({ summary: value.output.summary, gaps: value.output.gaps, proposals }, input.sources);
  if (!canonical || JSON.stringify(canonical) !== JSON.stringify(value.output)) return false;
  return value.output.statementProposals.every(p => p.evidence.every(e => {
    const span = spans.find(s => s.sourceRevisionId === e.sourceRevisionId);
    return span !== undefined && e.startOffset >= span.startOffset && e.endOffset <= span.endOffset;
  }));
}

/** Invokable multi-source assembler, with no model call, persistence, review or publication.
 * Consume an existing generation outcome; readable source rows and C0 labels
 * cannot authorize dispatch. A single deadline bounds read + requalification.
 * Fresh requalification is advisory; atomic completion remains the original
 * authenticated dispatcher transaction's responsibility. No automatic retry. */
export async function produceWikiSynthesis(input: SynthesisInput, generation: WikiProposalJobOutcome, deps: SynthesisDependencies, signal: AbortSignal): Promise<SynthesisOutcome> {
  const startedAt = performance.now();
  let request: SynthesisInput;
  let authorId: string;
  let readSources: SynthesisDependencies["readSources"];
  try {
    const snapshot = descriptorSnapshot(input, MAX_BYTES);
    if (!validInput(snapshot) || !keys(deps, ["authorId", "readSources"])) return { kind: "failed", errorCode: "INVALID_INPUT" };
    const actor = Object.getOwnPropertyDescriptor(deps, "authorId")?.value as unknown;
    const reader = Object.getOwnPropertyDescriptor(deps, "readSources")?.value as unknown;
    if (!uuid(actor) || typeof reader !== "function") return { kind: "failed", errorCode: "INVALID_INPUT" };
    request = freeze(snapshot);
    authorId = actor;
    readSources = reader as SynthesisDependencies["readSources"];
  } catch { return { kind: "failed", errorCode: "INVALID_INPUT" }; }
  if (signal.aborted) return { kind: "cancelled" };
  let generationSnapshot: WikiProposalJobOutcome;
  try {
    generationSnapshot = freeze(descriptorSnapshot(generation, MAX_BYTES + 2048) as WikiProposalJobOutcome);
  } catch { return { kind: "failed", errorCode: "MODEL_OUTPUT_INVALID" }; }
  const controller = new AbortController();
  const deadline = startedAt + request.timeoutMs;
  let timedOut = false;
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, request.timeoutMs);
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new Error("synthesis aborted"));
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  // A deadline can expire before the first race attaches its rejection handler.
  void aborted.catch(() => {});
  const checkLifetime = () => {
    if (performance.now() >= deadline) { timedOut = true; controller.abort(); }
    if (signal.aborted || controller.signal.aborted) throw new Error("synthesis aborted");
  };
  const bounded = <T>(call: () => Promise<T>): Promise<T> => {
    checkLifetime();
    return Promise.race([Promise.resolve().then(() => {
      checkLifetime();
      return call();
    }), aborted]);
  };
  try {
    const ids = freeze(request.sources.map(s => s.sourceRevisionId));
    const rawSources = await bounded(() => readSources(ids, controller.signal));
    checkLifetime();
    const sources = selectSources(rawSources, request.sources);
    if (!sources) return { kind: "failed", errorCode: "SOURCE_UNAVAILABLE" };
    const jobInput = freeze({ ...request, sources });
    const outcome = generationSnapshot;
    checkLifetime();
    if (outcome?.kind === "cancelled") return { kind: "cancelled" };
    if (outcome?.kind === "failed") return { kind: "failed", errorCode: "GENERATION_FAILED" };
    if (!validOutcome(outcome, jobInput, request.sources)) return { kind: "failed", errorCode: "MODEL_OUTPUT_INVALID" };
    const snapshot = outcome;
    const current = selectSources(await bounded(() => readSources(ids, controller.signal)), request.sources);
    checkLifetime();
    if (!current || JSON.stringify(current) !== JSON.stringify(sources)) return { kind: "failed", errorCode: "SOURCE_CHANGED" };
    const cited = new Set(snapshot.output.statementProposals.flatMap(p => p.evidence.map(e => e.sourceRevisionId)));
    const result = freeze({ kind: "draft" as const, authorId, outcome: snapshot, sourceSpans: request.sources,
      conflicts: detectProposalConflicts(snapshot.output), uncitedSourceRevisionIds: ids.filter(id => !cited.has(id)) });
    checkLifetime();
    return result;
  } catch {
    if (signal.aborted) return { kind: "cancelled" };
    if (timedOut) return { kind: "failed", errorCode: "TIMEOUT" };
    return { kind: "failed", errorCode: "SOURCE_UNAVAILABLE" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
  }
}
