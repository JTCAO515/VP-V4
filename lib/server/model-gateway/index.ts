import type { FailureCode } from "../contracts/errors/index.ts";

export type ModelProfileId = "deepseek_flash" | "deepseek_pro" | "deepseek_vision" | "qwen_37_strict";
export type ModelTask = "ordinary_text" | "strict_known_unknown";
export type ModelDataClass = "c0_synthetic" | "c1_user" | "c2_sensitive" | "c3_restricted" | "c4_secret";

export type ModelTaskRequest = Readonly<{
  requestId: string;
  profileId: ModelProfileId;
  task: ModelTask;
  dataClass: ModelDataClass;
  input: string;
}>;

export type KnownUnknownOutput =
  | Readonly<{ kind: "known"; value: string }>
  | Readonly<{ kind: "unknown"; reason: "fixture_no_evidence" }>;

export type ModelAttemptOutcome =
  | Readonly<{
    kind: "validated";
    profileId: ModelProfileId;
    output: string | KnownUnknownOutput;
    usage: Readonly<{ inputTokens: number; outputTokens: number }>;
  }>
  | Readonly<{
    kind: "unavailable";
    code: FailureCode;
    reason: "unsupported_task" | "data_policy_blocked" | "invalid_output" | "invalid_request";
  }>
  | Readonly<{ kind: "cancelled"; code: "CANCELLED" }>;

export interface ModelGateway {
  invoke(request: ModelTaskRequest, signal: AbortSignal): Promise<ModelAttemptOutcome>;
}

type ModelProfile = Readonly<{
  provider: "deepseek" | "qwen";
  providerModelId: string;
  observedDeployment: string;
  lifecycle: "beta" | "ga" | "experimental" | "candidate";
  tasks: readonly ModelTask[];
  thinking: "disabled" | "not_used";
  route: "fixture_only" | "shadow_only";
}>;

export const MODEL_PROFILES: Readonly<Record<ModelProfileId, ModelProfile>> = Object.freeze({
  deepseek_flash: Object.freeze({
    provider: "deepseek",
    providerModelId: "deepseek-v4-flash",
    observedDeployment: "DeepSeek-V4-Flash-0731",
    lifecycle: "beta",
    tasks: Object.freeze<ModelTask[]>(["ordinary_text"]),
    thinking: "disabled",
    route: "fixture_only",
  }),
  deepseek_pro: Object.freeze({
    provider: "deepseek",
    providerModelId: "deepseek-v4-pro",
    observedDeployment: "DeepSeek-V4-Pro-0813",
    lifecycle: "ga",
    tasks: Object.freeze<ModelTask[]>(["ordinary_text"]),
    thinking: "not_used",
    route: "fixture_only",
  }),
  deepseek_vision: Object.freeze({
    provider: "deepseek",
    providerModelId: "deepseek-v4-flash-vision-exp",
    observedDeployment: "DeepSeek-V4-Flash-Vision-Exp",
    lifecycle: "experimental",
    tasks: Object.freeze<ModelTask[]>([]),
    thinking: "not_used",
    route: "shadow_only",
  }),
  qwen_37_strict: Object.freeze({
    provider: "qwen",
    providerModelId: "qwen3.7-plus-2026-05-26",
    observedDeployment: "qwen3.7-plus-2026-05-26",
    lifecycle: "candidate",
    tasks: Object.freeze<ModelTask[]>(["strict_known_unknown"]),
    thinking: "not_used",
    route: "fixture_only",
  }),
});

export function isFixtureProfile(profile: Readonly<{ route: ModelProfile["route"] }>): boolean {
  return profile.route === "fixture_only";
}

export function validateKnownUnknownOutput(value: unknown): value is KnownUnknownOutput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const output = value as Record<string, unknown>;
  if (output.kind === "known") return typeof output.value === "string" && output.value.length > 0 && Object.keys(output).length === 2;
  return output.kind === "unknown" && output.reason === "fixture_no_evidence" && Object.keys(output).length === 2;
}

export function createFixtureModelGateway(): ModelGateway {
  return Object.freeze({
    async invoke(request: ModelTaskRequest, signal: AbortSignal): Promise<ModelAttemptOutcome> {
      if (!isModelTaskRequest(request) || !isAbortSignal(signal)) return Object.freeze({ kind: "unavailable", code: "INVALID_INPUT", reason: "invalid_request" });
      if (signal.aborted) return Object.freeze({ kind: "cancelled", code: "CANCELLED" });
      if (request.dataClass !== "c0_synthetic") return Object.freeze({ kind: "unavailable", code: "DATA_POLICY_BLOCKED", reason: "data_policy_blocked" });

      if (!Object.hasOwn(MODEL_PROFILES, request.profileId)) return Object.freeze({ kind: "unavailable", code: "PROVIDER_UNAVAILABLE", reason: "unsupported_task" });
      const profile = MODEL_PROFILES[request.profileId];
      if (!isFixtureProfile(profile)) return Object.freeze({ kind: "unavailable", code: "PROVIDER_UNAVAILABLE", reason: "unsupported_task" });
      if (!profile.tasks.includes(request.task)) return Object.freeze({ kind: "unavailable", code: "PROVIDER_UNAVAILABLE", reason: "unsupported_task" });

      const output: string | KnownUnknownOutput = request.task === "strict_known_unknown"
        ? Object.freeze({ kind: "known", value: "fixture-ready" })
        : "fixture response";
      if (request.task === "strict_known_unknown" && !validateKnownUnknownOutput(output)) return Object.freeze({ kind: "unavailable", code: "MODEL_OUTPUT_INVALID", reason: "invalid_output" });

      return Object.freeze({
        kind: "validated",
        profileId: request.profileId,
        output,
        usage: Object.freeze({ inputTokens: 3, outputTokens: 2 }),
      });
    },
  });
}

function isModelTaskRequest(value: unknown): value is ModelTaskRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return typeof request.requestId === "string"
    && /^[A-Za-z0-9_-]{1,64}$/.test(request.requestId)
    && typeof request.profileId === "string"
    && typeof request.task === "string"
    && (["ordinary_text", "strict_known_unknown"] as readonly string[]).includes(request.task)
    && typeof request.dataClass === "string"
    && (["c0_synthetic", "c1_user", "c2_sensitive", "c3_restricted", "c4_secret"] as readonly string[]).includes(request.dataClass)
    && typeof request.input === "string"
    && request.input.length > 0;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return typeof value === "object" && value !== null && typeof (value as { aborted?: unknown }).aborted === "boolean";
}
