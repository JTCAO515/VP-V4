import { createHash } from "node:crypto";
import { validatedPlanningUsageReceipt, type ValidatedPlanningUsageReceipt } from "../model-gateway/budget/usage-receipt.ts";
import type { PlanningSelection } from "../model-gateway/prompt/planning-comparison.ts";

/** Structural correlation only. No dispatch, persistence, settlement or SQL authority. */
export type PlanningV2ModelOutputBinding = Readonly<{
  owner: string; task: string; turn: string; lease: string; textPolicy: string; planningPolicy: string;
  scope: string; attempt: string; provider: "qwen"; model: string; priceVersion: string;
  intakeDigest: string; planningDigest: string;
}>;
export type PlanningV2ModelOutputReceipt = Readonly<{
  schemaVersion: "planning-v2-model-output/1";
  binding: PlanningV2ModelOutputBinding;
  usageReceipt: ValidatedPlanningUsageReceipt;
  output: PlanningSelection;
  observedAt: string;
  outputDigest: string;
  usageDigest: string;
  executionAvailable: false;
  readyForPublication: false;
}>;
const bindingKeys = ["owner", "task", "turn", "lease", "textPolicy", "planningPolicy", "scope", "attempt", "provider", "model", "priceVersion", "intakeDigest", "planningDigest"] as const;
const inputKeys = ["schemaVersion", "binding", "usageReceipt", "output", "observedAt"];
const wireKeys = [...inputKeys, "outputDigest", "usageDigest", "executionAvailable", "readyForPublication"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
function binding(v: unknown): v is PlanningV2ModelOutputBinding {
  return record(v) && keys(v, bindingKeys)
    && bindingKeys.every(k => typeof v[k] === "string")
    && bindingKeys.slice(0, 8).every(k => UUID.test(v[k] as string))
    && v.provider === "qwen" && TOKEN.test(v.model as string) && TOKEN.test(v.priceVersion as string)
    && SHA.test(v.intakeDigest as string) && SHA.test(v.planningDigest as string)
    && v.task !== v.turn && v.intakeDigest !== v.planningDigest;
}
function timestamp(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
    && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
}
const hash = (v: unknown): string => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** Closed five-field constructor input; callers cannot supply trusted hashes or flags.
 * Unknown actualMicros cannot form the existing validated usage receipt: reject null,
 * never coerce it to zero. Known zero is retained. No time freshness is inferred. */
export function createPlanningV2ModelOutputReceipt(raw: unknown, expected: unknown): PlanningV2ModelOutputReceipt | null {
  if (!record(raw) || !keys(raw, inputKeys) || raw.schemaVersion !== "planning-v2-model-output/1"
    || !binding(raw.binding) || !binding(expected)) return null;
  const b = raw.binding;
  if (!bindingKeys.every(k => b[k] === expected[k])
    || !timestamp(raw.observedAt) || !record(raw.output) || !keys(raw.output, ["highlight"])
    || typeof raw.output.highlight !== "string" || !["jingan", "peoples_square", "none"].includes(raw.output.highlight)
    || !record(raw.usageReceipt) || !record(raw.usageReceipt.attempt) || raw.usageReceipt.attempt.provider !== "qwen") return null;
  let usage: ValidatedPlanningUsageReceipt;
  try {
    usage = validatedPlanningUsageReceipt(raw.usageReceipt, { taskId: b.task, turnId: b.turn, planningPolicyId: b.planningPolicy });
  } catch { return null; }
  const a = usage.attempt;
  if (a.scopeId !== b.scope || a.ownerId !== b.owner || a.taskId !== b.task || a.attemptId !== b.attempt
    || a.provider !== b.provider || a.model !== b.model || a.priceVersion !== b.priceVersion) return null;
  const captured = Object.freeze(Object.fromEntries(bindingKeys.map(k => [k, b[k]]))) as PlanningV2ModelOutputBinding;
  const output = Object.freeze({ highlight: raw.output.highlight }) as PlanningSelection;
  // Fixed tuple order plus validator-built usage property order, independent of caller key order.
  const tuple = bindingKeys.map(k => captured[k]);
  return Object.freeze({ schemaVersion: "planning-v2-model-output/1", binding: captured, usageReceipt: usage, output,
    observedAt: raw.observedAt,
    outputDigest: hash(["planning-v2-model-output/1", tuple, raw.observedAt, output]),
    usageDigest: hash(["planning-v2-model-output-usage/1", tuple, raw.observedAt, usage]),
    executionAvailable: false, readyForPublication: false });
}

/** Closed nine-field wire decoder. Recomputed hashes are integrity checks, not signatures
 * or evidence that a provider dispatched, produced or persisted this data. */
export function parsePlanningV2ModelOutputReceipt(raw: unknown, expected: unknown): PlanningV2ModelOutputReceipt | null {
  if (!record(raw) || !keys(raw, wireKeys) || raw.executionAvailable !== false || raw.readyForPublication !== false) return null;
  const result = createPlanningV2ModelOutputReceipt({ schemaVersion: raw.schemaVersion, binding: raw.binding,
    usageReceipt: raw.usageReceipt, output: raw.output, observedAt: raw.observedAt }, expected);
  return result && raw.outputDigest === result.outputDigest && raw.usageDigest === result.usageDigest ? result : null;
}
