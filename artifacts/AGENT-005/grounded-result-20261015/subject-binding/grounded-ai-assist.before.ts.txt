import { isPlaceQuestionId, reviewedQuestionId } from "../claim/questions.ts";
import type { KnowledgeIntent } from "../claim/intent.ts";
import { runGroundedWikiSearch, type GroundedSearchDependencies, type GroundedSearchOutcome } from "./grounded-search.ts";
import type { HttpProviderConfiguration } from "../../model-gateway/adapters/http-transport.ts";

/**
 * VPJ-76 (#360) slice 7: the real integration point into grounded-turn/1.
 * Deliberately the narrowest one possible -- see
 * docs/contracts/wiki-agentic-search.md, "Slice 7", for the full reasoning
 * this session worked through with the user before writing any of this.
 *
 * grounded-turn/1's answer is never LLM-generated; resolve_question()
 * matches fixed claims against published statements with zero generation.
 * This module does not touch that resolver or complete_selected_grounded_work
 * at all. It only offers agentic search as a user-triggered, real-time,
 * non-persisted supplement -- and only for a turn the resolver itself
 * already judged 'blocked' (found zero eligible content for every required
 * claim), enforced by read_grounded_ai_assist_context_v1's own gate, not
 * re-checked here.
 *
 * Not built in this slice: persistence of the AI-assisted result, any
 * durable worker/retry semantics, or UI wiring in iOS/Web/the durable text
 * worker. This is the caller a future UI action would invoke -- it is not
 * itself invoked from anywhere in the product yet.
 */

export type GroundedAiAssistContextRpc = (name: "read_grounded_ai_assist_context_v1", params: Readonly<{ p_turn_id: string }>) => Promise<Readonly<{ data: unknown; error: { message: string } | null }>>;

export type GroundedAiAssistOutcome =
  | GroundedSearchOutcome
  | Readonly<{ kind: "not_offered"; reason: "unauthorized" | "not_blocked" | "context_unavailable" }>;

export type GroundedAiAssistInput = Readonly<{
  turnId: string;
  maxRounds: number;
  maxOutputTokens: number;
  timeoutMs: number;
  provider: HttpProviderConfiguration;
}>;

export async function runGroundedAiAssist(
  input: GroundedAiAssistInput, dependencies: GroundedSearchDependencies & Readonly<{ contextRpc: GroundedAiAssistContextRpc }>, signal: AbortSignal,
): Promise<GroundedAiAssistOutcome> {
  let raw: Readonly<{ data: unknown; error: { message: string } | null }>;
  try {
    raw = await dependencies.contextRpc("read_grounded_ai_assist_context_v1", { p_turn_id: input.turnId });
  } catch {
    return { kind: "not_offered", reason: "context_unavailable" };
  }
  if (raw.error) return { kind: "not_offered", reason: "context_unavailable" };
  const context = parseContext(raw.data);
  if (context === "unauthorized") return { kind: "not_offered", reason: "unauthorized" };
  if (context === "not_blocked" || context === null) return { kind: "not_offered", reason: "not_blocked" };

  return runGroundedWikiSearch(
    {
      intent: context.intent, question: context.inputText, city: context.city, locale: context.locale,
      maxRounds: input.maxRounds, maxOutputTokens: input.maxOutputTokens, timeoutMs: input.timeoutMs, provider: input.provider,
    },
    dependencies, signal,
  );
}

type Context = Readonly<{ intent: KnowledgeIntent; inputText: string; city: string; locale: "zh" | "en" }>;

function parseContext(value: unknown): Context | "unauthorized" | "not_blocked" | null {
  if (!record(value) || typeof value.kind !== "string") return null;
  if (value.kind === "unavailable") return "unauthorized";
  if (value.kind === "not_applicable") return "not_blocked";
  if (value.kind !== "context") return null;
  if (typeof value.city !== "string" || (value.locale !== "zh" && value.locale !== "en")) return null;
  if (typeof value.inputText !== "string" || value.inputText.trim().length === 0) return null;
  const id = reviewedQuestionId(value.intent);
  if (!id) return null;
  const placeName = typeof value.placeName === "string" ? value.placeName : null;
  if (isPlaceQuestionId(id) !== (placeName !== null)) return null;
  const intent: KnowledgeIntent = isPlaceQuestionId(id)
    ? { intent: id, requestScope: "single", placeName: placeName as string, unansweredNeeds: [] }
    : { intent: id, requestScope: "single" };
  return { intent, inputText: value.inputText, city: value.city, locale: value.locale };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
