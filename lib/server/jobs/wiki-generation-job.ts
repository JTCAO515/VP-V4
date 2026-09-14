import { createHash, randomUUID } from "node:crypto";
import { CostGuard } from "../model-gateway/budget/index.ts";
import { invokeProviderProtocol, type ProtocolProvider } from "../model-gateway/adapters/provider-protocol.ts";
import { createProviderHttpTransport, type HttpProviderConfiguration, type HttpTransportDependencies } from "../model-gateway/adapters/http-transport.ts";
import type { WikiGenerationDraftOutput } from "../model-gateway/prompt/wiki-generation.ts";
import type { PageType } from "../knowledge/wiki/contract.ts";

/**
 * Dedicated one-shot wiki-generation invocation (VPJ-75 slice 2). Separate
 * from lib/server/jobs/staging-text-job.ts on purpose -- that file is #357's
 * active SIM Ask worker; this module never imports or modifies it. Calls
 * the shared invokeProviderProtocol/createProviderHttpTransport primitives
 * directly instead of the multi-turn scoped-text-worker abstraction, since
 * a wiki draft is a single bounded request, not a conversation turn.
 *
 * This module only performs the external call and returns its outcome; it
 * never writes to wiki_generation_jobs/wiki_page_revisions itself -- the
 * caller is responsible for claim/complete against ops_wiki_generation_v1
 * (see docs/contracts/wiki-generation-dispatch.md).
 */

export type WikiGenerationJobInput = Readonly<{
  pageType: PageType;
  pageKey: string;
  sourceText: string;
  promptVersion: string;
  configDigest: string;
  maxOutputTokens: number;
  timeoutMs: number;
  provider: HttpProviderConfiguration;
}>;

export type WikiGenerationJobOutcome =
  | Readonly<{ kind: "succeeded"; output: WikiGenerationDraftOutput; usage: Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number }>; inputDigest: string }>
  | Readonly<{ kind: "failed"; errorCode: string }>
  | Readonly<{ kind: "cancelled" }>;

export type WikiGenerationJobDependencies = Readonly<{
  credential: HttpTransportDependencies["credential"];
  recordDestination: HttpTransportDependencies["recordDestination"];
  fetch?: typeof globalThis.fetch;
}>;

/** Deterministic; the caller uses this same digest as the dispatcher's idempotency key. */
export function computeWikiInputDigest(promptVersion: string, configDigest: string, sourceText: string): string {
  return createHash("sha256").update(`${promptVersion} ${configDigest} ${sourceText}`).digest("hex");
}

const TASK_ID_UNSAFE = /[^A-Za-z0-9_-]/g;

export async function runWikiGenerationJob(
  input: WikiGenerationJobInput, dependencies: WikiGenerationJobDependencies, signal: AbortSignal,
): Promise<WikiGenerationJobOutcome> {
  if (!validInput(input)) return { kind: "failed", errorCode: "INVALID_INPUT" };
  if (signal.aborted) return { kind: "cancelled" };

  const guard = new CostGuard({ windowMs: 60000, perUserAttempts: 10, perTaskAttempts: 3, turnDeadlineMs: input.timeoutMs, maxModelSteps: 1, maxToolSteps: 1 });
  const taskId = input.pageKey.replace(TASK_ID_UNSAFE, "-").slice(0, 64) || "wiki-page";
  const turn = guard.startTurn({ userId: "wiki-generation-worker", taskId });
  if (turn.kind !== "turn") return { kind: "failed", errorCode: "INVALID_INPUT" };

  const transport = createProviderHttpTransport(input.provider, {
    credential: dependencies.credential, recordDestination: dependencies.recordDestination,
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
  });
  const inputDigest = computeWikiInputDigest(input.promptVersion, input.configDigest, input.sourceText);
  const outcome = await invokeProviderProtocol(
    { requestId: randomUUID(), provider: input.provider.provider, dataClass: "c0_synthetic", input: input.sourceText, task: "wiki_generation_v1", maxOutputTokens: input.maxOutputTokens, timeoutMs: input.timeoutMs },
    turn, transport, signal,
  );
  if (outcome.kind === "cancelled") return { kind: "cancelled" };
  if (outcome.kind === "unavailable") return { kind: "failed", errorCode: outcome.code };
  if (typeof outcome.output === "string" || (outcome.output as { kind?: string }).kind === "tool_candidate" || (outcome.output as { kind?: string }).kind === "known" || (outcome.output as { kind?: string }).kind === "unknown") {
    return { kind: "failed", errorCode: "MODEL_OUTPUT_INVALID" };
  }
  return { kind: "succeeded", output: outcome.output as WikiGenerationDraftOutput, usage: outcome.usage, inputDigest };
}

function validInput(value: WikiGenerationJobInput): boolean {
  return !!value && typeof value === "object"
    && ["source_summary", "entity_procedure", "topic", "comparison_gap"].includes(value.pageType)
    && typeof value.pageKey === "string" && value.pageKey.length > 0 && value.pageKey.length <= 200
    && typeof value.sourceText === "string" && value.sourceText.trim().length > 0 && value.sourceText.length <= 32768
    && typeof value.promptVersion === "string" && value.promptVersion.length > 0 && value.promptVersion.length <= 60
    && /^[0-9a-f]{64}$/.test(value.configDigest)
    && Number.isSafeInteger(value.maxOutputTokens) && value.maxOutputTokens > 0 && value.maxOutputTokens <= 8192
    && Number.isSafeInteger(value.timeoutMs) && value.timeoutMs > 0 && value.timeoutMs <= 60000
    && !!value.provider && (value.provider as HttpProviderConfiguration).provider !== undefined;
}
