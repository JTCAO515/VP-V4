import { createHash } from "node:crypto";

import type { ContextPlan, ContextSection, ContextSourceKind } from "./context-plan.ts";

export type ContextCandidateState = "eligible" | "draft" | "expired" | "prohibited";
export type ToolPayloadKind = "raw" | "model_safe_projection";

export type ContextCandidate = Readonly<{
  id: string;
  kind: ContextSourceKind;
  ownerId: string | null;
  state: ContextCandidateState;
  sourceVersion: string;
  tokenCount: number;
  text: string;
  payloadKind?: ToolPayloadKind;
}>;

export type ContextSourceRef = Readonly<{ id: string; kind: ContextSourceKind; sourceVersion: string }>;
export type ContextManifest = Readonly<{
  contextVersion: string;
  compactionVersion: string;
  sourceRefs: readonly ContextSourceRef[];
  sourceVersions: readonly string[];
  omittedReasons: readonly string[];
  sectionTokenCounts: Readonly<Record<ContextSection, number>>;
  totalTokens: number;
  contentHashes: readonly string[];
}>;
export type ContextSectionContent = Readonly<{ kind: ContextSection; text: string; tokenCount: number }>;
export type ContextAssembly = Readonly<{
  sections: readonly ContextSectionContent[];
  rendered: string;
  manifest: ContextManifest;
}>;

export class ContextAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextAssemblyError";
  }
}

export function assembleContext(input: Readonly<{
  plan: ContextPlan;
  actorId: string;
  candidates: readonly ContextCandidate[];
}>): Readonly<ContextAssembly> {
  if (!input.actorId) throw new ContextAssemblyError("An actorId is required to assemble context.");

  const omissions: string[] = [];
  const eligible = input.candidates.filter((candidate) => isEligible(candidate, input.actorId, input.plan, omissions));
  const selected = selectWithinBudgets(eligible, input.plan, omissions);
  assertRequiredSources(selected, input.plan);

  const sections = input.plan.sectionOrder.flatMap((kind) => {
    const sourceCandidates = selected.filter((candidate) => candidate.kind === kind);
    if (sourceCandidates.length === 0) return [];
    const text = sourceCandidates.map(renderCandidate).join("\n");
    return [{ kind, text, tokenCount: sourceCandidates.reduce((sum, candidate) => sum + candidate.tokenCount, 0) }];
  });

  const sectionTokenCounts = Object.fromEntries(input.plan.sectionOrder.map((kind) => [kind, 0])) as Record<ContextSection, number>;
  for (const section of sections) sectionTokenCounts[section.kind] = section.tokenCount;
  const sourceRefs = selected.map(({ id, kind, sourceVersion }) => ({ id, kind, sourceVersion }));
  const manifest: ContextManifest = {
    contextVersion: input.plan.contextVersion,
    compactionVersion: input.plan.policy.compactionVersion,
    sourceRefs,
    sourceVersions: [...new Set(selected.map((candidate) => candidate.sourceVersion))],
    omittedReasons: omissions,
    sectionTokenCounts,
    totalTokens: selected.reduce((sum, candidate) => sum + candidate.tokenCount, 0),
    contentHashes: selected.map((candidate) => sha256(candidate.text)),
  };

  return deepFreeze({
    sections,
    rendered: sections.map((section) => `[${section.kind.toUpperCase()}]\n${section.text}`).join("\n\n"),
    manifest,
  });
}

function isEligible(candidate: ContextCandidate, actorId: string, plan: ContextPlan, omissions: string[]): boolean {
  assertCandidate(candidate);
  if (candidate.state !== "eligible") {
    omissions.push(`ineligible_state:${candidate.kind}:${candidate.id}`);
    return false;
  }
  if (candidate.ownerId !== null && candidate.ownerId !== actorId) {
    omissions.push(`actor_mismatch:${candidate.kind}:${candidate.id}`);
    return false;
  }
  if (candidate.kind === "user_artifact") {
    omissions.push(`raw_user_artifact_disallowed:user_artifact:${candidate.id}`);
    return false;
  }
  if (!plan.policy.allowedSources.includes(candidate.kind)) {
    omissions.push(`source_not_allowed:${candidate.kind}:${candidate.id}`);
    return false;
  }
  if (candidate.kind === "tool" && candidate.payloadKind !== "model_safe_projection") {
    omissions.push(`raw_tool_payload_disallowed:tool:${candidate.id}`);
    return false;
  }
  return true;
}

function selectWithinBudgets(candidates: readonly ContextCandidate[], plan: ContextPlan, omissions: string[]): readonly ContextCandidate[] {
  const selected: ContextCandidate[] = [];
  const usedTokens = Object.fromEntries(plan.sectionOrder.map((kind) => [kind, 0])) as Record<ContextSection, number>;
  let evidenceItems = 0;
  let toolItems = 0;

  for (const kind of plan.sectionOrder) {
    for (const candidate of candidates.filter((item) => item.kind === kind)) {
      if (candidate.tokenCount + usedTokens[kind] > plan.policy.tokenBudgets[kind]) {
        omissions.push(`budget_exhausted:${kind}:${candidate.id}`);
        continue;
      }
      if (kind === "evidence" && evidenceItems >= plan.policy.maxEvidenceItems) {
        omissions.push(`evidence_limit:${kind}:${candidate.id}`);
        continue;
      }
      if (kind === "tool" && toolItems >= plan.policy.maxToolDefinitions) {
        omissions.push(`tool_limit:${kind}:${candidate.id}`);
        continue;
      }
      selected.push(candidate);
      usedTokens[kind] += candidate.tokenCount;
      if (kind === "evidence") evidenceItems += 1;
      if (kind === "tool") toolItems += 1;
    }
  }
  return selected;
}

function assertRequiredSources(candidates: readonly ContextCandidate[], plan: ContextPlan): void {
  const selectedKinds = new Set(candidates.map((candidate) => candidate.kind));
  const missing = plan.policy.requiredSources.filter((source) => !selectedKinds.has(source));
  if (missing.length > 0) throw new ContextAssemblyError(`Missing required source after context filtering: ${missing.join(", ")}`);
}

function renderCandidate(candidate: ContextCandidate): string {
  if (candidate.kind === "tool") {
    return `<untrusted-data source="tool" ref="${candidate.id}">\n${escapeUntrustedDelimiter(candidate.text)}\n</untrusted-data>`;
  }
  return candidate.text;
}

function escapeUntrustedDelimiter(value: string): string {
  return value.replaceAll("</untrusted-data>", "<\\/untrusted-data>");
}

function assertCandidate(candidate: ContextCandidate): void {
  if (!candidate.id || !candidate.sourceVersion || !candidate.text) throw new ContextAssemblyError("Context candidates require id, sourceVersion, and text.");
  if (!Number.isSafeInteger(candidate.tokenCount) || candidate.tokenCount <= 0) {
    throw new ContextAssemblyError(`Context candidate ${candidate.id} has an invalid tokenCount.`);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
