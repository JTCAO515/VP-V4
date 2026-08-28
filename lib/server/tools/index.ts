import { createHash } from "node:crypto";

export type ToolRiskClass = "D0_deterministic" | "R1_read_only" | "R2_transformation" | "P_proposal_producing" | "X_external_side_effect";
export type ToolIdempotency = "required" | "none";
export type ToolRetryPolicy = "never" | "read_only_once";
export type ToolTaskProfile = "trip_planning" | "trip_update" | "information_lookup" | "recovery";
export type ToolDataClass = "public_evidence" | "user_artifact" | "sensitive_media";

export type ToolDefinition<I, O> = Readonly<{
  id: string;
  version: string;
  description: string;
  riskClass: ToolRiskClass;
  allowedTaskProfiles: readonly ToolTaskProfile[];
  allowedDataClasses: readonly ToolDataClass[];
  requiresApproval: boolean;
  idempotency: ToolIdempotency;
  timeoutMs: number;
  retryPolicy: ToolRetryPolicy;
  maxModelOutputTokens: number;
  featureFlag: string;
  validateInput: (input: unknown) => input is I;
  validateOutput: (output: unknown) => output is O;
}>;

export type ToolCallIntent = Readonly<{ source: "model" | "ui"; callId: string; toolId: string; input: unknown }>;
export type ToolActor = Readonly<{ id: string; taskProfile: ToolTaskProfile; dataClasses: readonly ToolDataClass[]; approvedDigests: readonly string[] }>;
export type ToolReceipt<O> = Readonly<{ toolId: string; toolVersion: string; callId: string; inputDigest: string; output: O; startedAt: string; finishedAt: string; policyReceipt: string }>;

export class ToolGatewayError extends Error {
  constructor(message: string) { super(message); this.name = "ToolGatewayError"; }
}

export class ToolRegistry {
  #definitions = new Map<string, ToolDefinition<unknown, unknown>>();
  #callDigests = new Map<string, string>();
  constructor(definitions: readonly ToolDefinition<unknown, unknown>[] = []) { for (const definition of definitions) this.register(definition); }
  register(definition: ToolDefinition<unknown, unknown>): void {
    if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/.test(definition.id)) throw new ToolGatewayError("Tool id must use a namespaced allowlisted form.");
    if (!definition.version || definition.timeoutMs <= 0 || definition.maxModelOutputTokens <= 0) throw new ToolGatewayError("Tool definition has invalid bounds.");
    if (definition.id.startsWith("trip.") || (definition.riskClass === "X_external_side_effect" && !definition.requiresApproval)) throw new ToolGatewayError("Trip writes and unapproved side effects are not registerable tools.");
    if (this.#definitions.has(definition.id)) throw new ToolGatewayError("Tool id collision.");
    this.#definitions.set(definition.id, definition);
  }
  resolve(toolId: string): ToolDefinition<unknown, unknown> {
    const definition = this.#definitions.get(toolId);
    if (!definition) throw new ToolGatewayError("Unknown or disabled tool.");
    return definition;
  }
  claimCall(callId: string, inputDigest: string): void {
    const previous = this.#callDigests.get(callId);
    if (previous) throw new ToolGatewayError(previous === inputDigest ? "Idempotent tool call was already executed." : "Tool call id reuse with a different input is forbidden.");
    this.#callDigests.set(callId, inputDigest);
  }
  releaseCall(callId: string, inputDigest: string): void { if (this.#callDigests.get(callId) === inputDigest) this.#callDigests.delete(callId); }
}

export async function executeToolIntent<O>(input: Readonly<{
  registry: ToolRegistry;
  intent: ToolCallIntent;
  actor: ToolActor;
  execute: (input: unknown) => Promise<O>;
  now: () => string;
}>): Promise<Readonly<ToolReceipt<O>>> {
  const definition = input.registry.resolve(input.intent.toolId);
  if (!definition.allowedTaskProfiles.includes(input.actor.taskProfile)) throw new ToolGatewayError("Tool is not allowed for this task profile.");
  if (!definition.allowedDataClasses.every((dataClass) => input.actor.dataClasses.includes(dataClass))) throw new ToolGatewayError("Tool data policy is not allowed for this actor.");
  if (!definition.validateInput(input.intent.input)) throw new ToolGatewayError("Tool input is invalid.");
  const inputDigest = digest({ toolId: definition.id, version: definition.version, input: input.intent.input });
  if (definition.requiresApproval && !input.actor.approvedDigests.includes(inputDigest)) throw new ToolGatewayError("Exact approval digest is required.");
  if (definition.idempotency === "required") input.registry.claimCall(input.intent.callId, inputDigest);
  const startedAt = input.now();
  let output: O;
  try { output = await input.execute(input.intent.input); } catch (error) { if (definition.idempotency === "required") input.registry.releaseCall(input.intent.callId, inputDigest); throw error; }
  if (!definition.validateOutput(output)) throw new ToolGatewayError("Tool output is invalid.");
  const finishedAt = input.now();
  return Object.freeze({ toolId: definition.id, toolVersion: definition.version, callId: input.intent.callId, inputDigest, output, startedAt, finishedAt, policyReceipt: digest({ toolId: definition.id, callId: input.intent.callId, inputDigest, policy: "allowed" }) });
}

function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
