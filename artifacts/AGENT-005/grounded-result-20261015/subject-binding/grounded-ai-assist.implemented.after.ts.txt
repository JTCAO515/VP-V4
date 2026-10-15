import { isPlaceQuestionId, reviewedQuestionId, questionDefinition } from "../claim/questions.ts";
import type { KnowledgeIntent } from "../claim/intent.ts";
import { runGroundedWikiSearch, type GroundedSearchDependencies, type GroundedSearchOutcome } from "./grounded-search.ts";
import type { HttpProviderConfiguration } from "../../model-gateway/adapters/http-transport.ts";

/** Native/Web job integration into the existing owner-authorized blocked-turn
 * context. Resolver output is read from that context, never from client/model
 * labels. The durable job owns completion receipts and replay revalidation. */

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
  const context = parseContext(raw.data, input.turnId);
  if (context === "unauthorized") return { kind: "not_offered", reason: "unauthorized" };
  if (context === "not_blocked" || context === null) return { kind: "not_offered", reason: "not_blocked" };

  return runGroundedWikiSearch(
    {
      intent: context.intent, question: context.inputText, city: context.city, locale: context.locale,
      ...(context.placeSubjectId ? { placeSubjectId: context.placeSubjectId } : {}),
      maxRounds: input.maxRounds, maxOutputTokens: input.maxOutputTokens, timeoutMs: input.timeoutMs, provider: input.provider,
    },
    dependencies, signal,
  );
}

type Context = Readonly<{ intent: KnowledgeIntent; inputText: string; city: string; locale: "zh" | "en"; placeSubjectId?: string }>;

export function parseContext(value: unknown, turnId: string): Context | "unauthorized" | "not_blocked" | null {
  if (!record(value) || typeof value.kind !== "string") return null;
  if (value.kind === "unavailable") return "unauthorized";
  if (value.kind === "not_applicable") return "not_blocked";
  if (value.kind !== "context") return null;
  if (typeof value.city !== "string" || (value.locale !== "zh" && value.locale !== "en")) return null;
  if (typeof value.inputText !== "string" || value.inputText.trim().length === 0) return null;
  const id = reviewedQuestionId(value.intent);
  if (!id) return null;
  const placeName = typeof value.placeName === "string" ? value.placeName : null;
  if (isPlaceQuestionId(id) !== (placeName !== null)
    || (placeName !== null && (!placeName.trim() || placeName.length > 160))) return null;
  // This value comes only from the owner-authorized context RPC, never a
  // request parameter, model response, place title or client POI identifier.
  const hasSubject = value.placeSubjectId !== undefined && value.placeSubjectId !== null;
  if (hasSubject && (!isPlaceQuestionId(id) || value.turnId !== turnId || value.placeResolution !== "matched"
    || !questionDefinition(id, value.placeSubjectId))) return null;
  const placeSubjectId = hasSubject ? value.placeSubjectId as string : undefined;
  const intent: KnowledgeIntent = isPlaceQuestionId(id)
    ? { intent: id, requestScope: "single", placeName: placeName as string, unansweredNeeds: [] }
    : { intent: id, requestScope: "single" };
  return { intent, inputText: value.inputText, city: value.city, locale: value.locale,
    ...(placeSubjectId ? { placeSubjectId } : {}) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
