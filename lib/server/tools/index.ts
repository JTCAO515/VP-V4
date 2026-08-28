import { createHash } from "node:crypto";

export type ToolRiskClass = "D0_deterministic" | "R1_read_only" | "R2_transformation" | "P_proposal_producing" | "X_external_side_effect";
export type ToolIdempotency = "required" | "none";
export type ToolRetryPolicy = "never" | "read_only_once";
export type ToolTaskProfile = "trip_planning" | "trip_update" | "information_lookup" | "recovery";
export type ToolDataClass = "public_evidence" | "user_artifact" | "sensitive_media";
export type ToolGatewayErrorCode = "TOOL_DEADLINE_EXCEEDED" | "TOOL_OUTPUT_REJECTED" | "TOOL_POLICY_REJECTED" | "TOOL_REPLAY_REJECTED";
export type ToolApproval = Readonly<{ actorId: string; callId: string; source: ToolCallIntent["source"]; taskProfile: ToolTaskProfile; dataClasses: readonly ToolDataClass[]; inputDigest: string; expiresAt: string }>;

export type ToolDefinition<I, O> = Readonly<{
  id: string;
  version: string;
  description: string;
  riskClass: ToolRiskClass;
  allowedTaskProfiles: readonly ToolTaskProfile[];
  allowedDataClasses: readonly ToolDataClass[];
  requiredLicenseScopes: readonly ToolDataClass[];
  requiresApproval: boolean;
  idempotency: ToolIdempotency;
  timeoutMs: number;
  retryPolicy: ToolRetryPolicy;
  maxModelOutputTokens: number;
  featureFlag: string;
  validateInput: (input: unknown) => input is I;
  validateOutput: (output: unknown) => output is O;
}>;

export type ToolCallIntent = Readonly<{ source: "model" | "ui"; callId: string; toolId: string; dataClasses: readonly ToolDataClass[]; input: unknown }>;
export type ToolActor = Readonly<{ id: string; taskProfile: ToolTaskProfile; dataClasses: readonly ToolDataClass[]; licensedScopes: readonly ToolDataClass[]; enabledFeatureFlags: readonly string[]; approvals: readonly ToolApproval[] }>;
export type ToolReceipt = Readonly<{ toolId: string; toolVersion: string; callId: string; inputDigest: string; modelSafeProjection: string; startedAt: string; finishedAt: string; policyReceipt: string }>;

export class ToolGatewayError extends Error {
  readonly code: ToolGatewayErrorCode;

  constructor(message: string, code: ToolGatewayErrorCode = "TOOL_POLICY_REJECTED") {
    super(message);
    this.name = "ToolGatewayError";
    this.code = code;
  }
}

export class ToolRegistry {
  #definitions = new Map<string, ToolDefinition<unknown, unknown>>();
  #callDigests = new Map<string, string>();
  constructor(definitions: readonly ToolDefinition<unknown, unknown>[] = []) { for (const definition of definitions) this.register(definition); }

  register(definition: ToolDefinition<unknown, unknown>): void {
    if (!/^(?=.{1,96}$)[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/.test(definition.id)) throw new ToolGatewayError("Tool id must use a bounded namespaced allowlisted form.");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(definition.version) || !Number.isFinite(definition.timeoutMs) || !Number.isFinite(definition.maxModelOutputTokens) || definition.timeoutMs <= 0 || definition.timeoutMs > 60_000 || definition.maxModelOutputTokens <= 0 || definition.maxModelOutputTokens > 4_096 || !definition.featureFlag) throw new ToolGatewayError("Tool definition has invalid bounds.");
    if (definition.id.startsWith("trip.") || definition.riskClass === "P_proposal_producing") throw new ToolGatewayError("Trip writes and proposal executors are not registerable until a typed Proposal capability is frozen.");
    if (definition.riskClass === "X_external_side_effect") throw new ToolGatewayError("External side effects are disabled until a verified persistent idempotency adapter exists.");
    if (definition.retryPolicy === "read_only_once" && definition.riskClass !== "R1_read_only") throw new ToolGatewayError("Only read-only tools may declare an automatic retry policy.");
    if (this.#definitions.has(definition.id)) throw new ToolGatewayError("Tool id collision.");
    this.#definitions.set(definition.id, definition);
  }

  resolve(toolId: string): ToolDefinition<unknown, unknown> {
    const definition = this.#definitions.get(toolId);
    if (!definition) throw new ToolGatewayError("Unknown or disabled tool.");
    return definition;
  }

  async claimCall(key: string, inputDigest: string): Promise<void> {
    const previous = this.#callDigests.get(key);
    if (previous) throw new ToolGatewayError(previous === inputDigest ? "Idempotent tool call was already executed." : "Tool call id reuse with a different input is forbidden.", "TOOL_REPLAY_REJECTED");
    this.#callDigests.set(key, inputDigest);
  }

  releaseCall(key: string, inputDigest: string): void { if (this.#callDigests.get(key) === inputDigest) this.#callDigests.delete(key); }
}

export function approvalDigestForToolIntent(definition: Readonly<{ id: string; version: string }>, input: unknown): string {
  return digest({ toolId: definition.id, version: definition.version, input });
}

export async function executeToolIntent<O>(input: Readonly<{
  registry: ToolRegistry;
  intent: ToolCallIntent;
  actor: ToolActor;
  execute: (input: unknown) => Promise<O>;
  now: () => string;
}>): Promise<Readonly<ToolReceipt>> {
  const definition = input.registry.resolve(input.intent.toolId);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.intent.callId)) throw new ToolGatewayError("Tool call id is invalid.");
  if (!definition.allowedTaskProfiles.includes(input.actor.taskProfile)) throw new ToolGatewayError("Tool is not allowed for this task profile.");
  if (!definition.allowedDataClasses.every((dataClass) => input.actor.dataClasses.includes(dataClass))) throw new ToolGatewayError("Tool data policy is not allowed for this actor.");
  if (!input.intent.dataClasses.every((dataClass) => definition.allowedDataClasses.includes(dataClass) && input.actor.dataClasses.includes(dataClass))) throw new ToolGatewayError("Tool intent data policy is not allowed.");
  if (!definition.requiredLicenseScopes.every((scope) => input.actor.licensedScopes.includes(scope))) throw new ToolGatewayError("Tool license policy is not allowed for this actor.");
  if (!input.actor.enabledFeatureFlags.includes(definition.featureFlag)) throw new ToolGatewayError("Tool is disabled for this actor.");
  if (!definition.validateInput(input.intent.input)) throw new ToolGatewayError("Tool input is invalid.");
  const inputDigest = approvalDigestForToolIntent(definition, input.intent.input);
  const startedAt = input.now();
  if (definition.requiresApproval && !hasExactApproval(input.actor, input.intent, inputDigest, startedAt)) throw new ToolGatewayError("Exact actor-bound approval is required.");
  const claimRequired = definition.idempotency === "required";
  const idempotencyKey = digest({ actorId: input.actor.id, toolId: definition.id, version: definition.version, callId: input.intent.callId });
  if (claimRequired) await input.registry.claimCall(idempotencyKey, inputDigest);

  try {
    const output = await withDeadline(input.execute(input.intent.input), definition.timeoutMs);
    if (!definition.validateOutput(output)) throw new ToolGatewayError("Tool output is invalid.", "TOOL_OUTPUT_REJECTED");
    const modelSafeProjection = projectToolOutput(definition, output);
    const finishedAt = input.now();
    return Object.freeze({
      toolId: definition.id,
      toolVersion: definition.version,
      callId: input.intent.callId,
      inputDigest,
      modelSafeProjection,
      startedAt,
      finishedAt,
      policyReceipt: digest({ toolId: definition.id, callId: input.intent.callId, inputDigest, policy: "allowed" }),
    });
  } catch (error) {
    if (claimRequired) input.registry.releaseCall(idempotencyKey, inputDigest);
    throw error;
  }
}

function hasExactApproval(actor: ToolActor, intent: ToolCallIntent, inputDigest: string, now: string): boolean {
  const nowMs = Date.parse(now);
  return Number.isFinite(nowMs) && actor.approvals.some((approval) => approval.actorId === actor.id && approval.callId === intent.callId && approval.source === intent.source && approval.taskProfile === actor.taskProfile && sameSet(approval.dataClasses, actor.dataClasses) && approval.inputDigest === inputDigest && Date.parse(approval.expiresAt) > nowMs);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value) => right.includes(value)); }

function withDeadline<O>(operation: Promise<O>, timeoutMs: number): Promise<O> {
  return new Promise<O>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new ToolGatewayError("Tool execution deadline exceeded.", "TOOL_DEADLINE_EXCEEDED")), timeoutMs);
    void operation.then((output) => { clearTimeout(timeout); resolve(output); }, (error: unknown) => { clearTimeout(timeout); reject(error); });
  });
}

function projectToolOutput(definition: Readonly<{ id: string; version: string; maxModelOutputTokens: number }>, output: unknown): string {
  const payload = stableJson(output);
  const projection = `<untrusted-tool-output tool="${definition.id}" version="${definition.version}">${escapeForUntrustedBoundary(payload)}</untrusted-tool-output>`;
  if (Array.from(projection).length > definition.maxModelOutputTokens) throw new ToolGatewayError("Tool output exceeds the model-safe budget.", "TOOL_OUTPUT_REJECTED");
  return projection;
}

function escapeForUntrustedBoundary(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }

function digest(value: unknown): string { return createHash("sha256").update(stableJson(value)).digest("hex"); }

function stableJson(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ToolGatewayError("Tool data must be finite JSON.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item, seen)).join(",")}]`;
  if (typeof value === "object") {
    if (seen.has(value)) throw new ToolGatewayError("Tool data must not be cyclic.");
    seen.add(value);
    const result = `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key], seen)}`).join(",")}}`;
    seen.delete(value);
    return result;
  }
  throw new ToolGatewayError("Tool data must be JSON-compatible.");
}
