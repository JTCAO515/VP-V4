export type PolicyActionV1 = "display" | "cache" | "persist" | "llm_inference" | "embed" | "translate" | "tts" | "model_training" | "backfill" | "redistribute";
export type PolicyPurposeV1 = "chat_answer" | "trip_planning" | "explore" | "seo" | "internal_review";
export type PolicyDecisionCodeV1 = "DATA_POLICY_BLOCKED";
export type PolicyReceiptV1 = Readonly<{ receiptId: string; policyId: string; sourceId: string; licenceVersion: string; action: PolicyActionV1; purpose: PolicyPurposeV1; field: string; region: string; decision: "allowed" | "denied"; code: PolicyDecisionCodeV1 | null; reason: "POLICY_NOT_CURRENT" | "POLICY_NOT_REGISTERED" | "POLICY_ACTION_NOT_GRANTED" | "POLICY_DATA_CLASS_DENIED" | "POLICY_TRAINING_DENIED" | "POLICY_REVOKED" | null; derivative: "allowed" | "denied"; shareAlike: "required" | "not_required"; combination: "allowed" | "denied"; redistribution: "allowed" | "denied"; retention: "ephemeral" | "durable" | "none"; evaluatedAt: string }>;
export type PolicyDecisionV1 = Readonly<{ kind: "allowed" | "denied"; receipt: PolicyReceiptV1 }>;
export type PolicyRegistryV1 = Readonly<{ kind: "PolicyRegistryV1" }>;
export type PolicyRevocationPlanV1 = Readonly<{ policyId: string; revokedAt: string; invalidatedConsumers: readonly ["cache", "rag", "explore", "seo", "new_proposal"]; receipt: PolicyReceiptV1 }>;

const ACTIONS = new Set<PolicyActionV1>(["display", "cache", "persist", "llm_inference", "embed", "translate", "tts", "model_training", "backfill", "redistribute"]);
const PURPOSES = new Set<PolicyPurposeV1>(["chat_answer", "trip_planning", "explore", "seo", "internal_review"]);
const DATA_CLASSES = new Set(["c0_public", "c1_account", "c2_trip_sensitive", "c3_highly_sensitive", "c4_secret"]);
const DERIVATIVE_RULES = new Set(["allowed", "denied"]);
const SHARE_ALIKE_RULES = new Set(["required", "not_required"]);
const RETENTION_RULES = new Set(["ephemeral", "durable", "none"]);
const TOKEN = /^[a-z][a-z0-9_-]{0,127}$/;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/;
const CONSUMERS = ["cache", "rag", "explore", "seo", "new_proposal"] as const;

type ParsedGrant = Readonly<{ field: string; region: string; action: PolicyActionV1; purpose: PolicyPurposeV1 }>;
type ParsedPolicy = Readonly<{ policyId: string; sourceId: string; licenceVersion: string; dataClass: "c0_public" | "c1_account" | "c2_trip_sensitive" | "c3_highly_sensitive" | "c4_secret"; grants: readonly ParsedGrant[]; effectiveAt: string; expiresAt: string; termsRecheckAt: string; trialEndsAt: string | null; derivative: "allowed" | "denied"; shareAlike: "required" | "not_required"; combination: "allowed" | "denied"; redistribution: "allowed" | "denied"; training: "allowed" | "denied"; retention: "ephemeral" | "durable" | "none" }>;
type RegistryState = { policies: ReadonlyMap<string, ParsedPolicy> };
const registryStates = new WeakMap<PolicyRegistryV1, RegistryState>();
// This is the one in-process authority for every registry view; consumers cannot clear it by rebuilding a view.
const sharedRevocations = new Map<string, string>();

export function createPolicyRegistry(value: unknown): PolicyRegistryV1 {
  assertRecord(value, ["policies"]);
  if (!Array.isArray(value.policies) || value.policies.length === 0) throw new TypeError("policies must be a non-empty array");
  const policies = value.policies.map(parsePolicy);
  if (new Set(policies.map((policy) => policy.policyId)).size !== policies.length) throw new TypeError("policy IDs must be unique");
  const registry = Object.freeze({ kind: "PolicyRegistryV1" }) as PolicyRegistryV1;
  registryStates.set(registry, { policies: new Map(policies.map((policy) => [policy.policyId, policy])) });
  return registry;
}

export function evaluatePolicyDecision(registry: PolicyRegistryV1, value: unknown): PolicyDecisionV1 {
  const state = getRegistryState(registry);
  assertRecord(value, ["now", "requestId", "policyId", "action", "purpose", "field", "region"]);
  const now = parseTimestamp(value.now, "now");
  const requestId = parseToken(value.requestId, "requestId");
  const policyId = parseToken(value.policyId, "policyId");
  const action = parseAction(value.action);
  const purpose = parsePurpose(value.purpose);
  const field = parseToken(value.field, "field");
  const region = parseToken(value.region, "region");
  const policy = state.policies.get(policyId);
  if (!policy) return denyUnknown({ requestId, policyId, action, purpose, field, region, now: value.now as string });
  const common = { requestId, policy, action, purpose, field, region, now: value.now as string };
  if (now.getTime() < parseTimestamp(policy.effectiveAt, "effectiveAt").getTime() || now.getTime() >= parseTimestamp(policy.expiresAt, "expiresAt").getTime() || now.getTime() >= parseTimestamp(policy.termsRecheckAt, "termsRecheckAt").getTime() || (policy.trialEndsAt !== null && now.getTime() >= parseTimestamp(policy.trialEndsAt, "trialEndsAt").getTime())) return deny(common, "POLICY_NOT_CURRENT");
  if (sharedRevocations.has(policy.policyId)) return deny(common, "POLICY_REVOKED");
  if (policy.dataClass !== "c0_public") return deny(common, "POLICY_DATA_CLASS_DENIED");
  if (!policy.grants.some((grant) => grant.field === field && grant.region === region && grant.action === action && grant.purpose === purpose)) return deny(common, "POLICY_ACTION_NOT_GRANTED");
  if ((action === "cache" && policy.retention === "none") || (action === "persist" && policy.retention !== "durable")) return deny(common, "POLICY_ACTION_NOT_GRANTED");
  if (["embed", "translate", "tts", "backfill"].includes(action) && policy.derivative !== "allowed") return deny(common, "POLICY_ACTION_NOT_GRANTED");
  if (action === "backfill" && policy.combination !== "allowed") return deny(common, "POLICY_ACTION_NOT_GRANTED");
  if (action === "redistribute" && policy.redistribution !== "allowed") return deny(common, "POLICY_ACTION_NOT_GRANTED");
  if (action === "model_training" && policy.training !== "allowed") return deny(common, "POLICY_TRAINING_DENIED");
  return allow(common);
}

export function revokePolicy(registry: PolicyRegistryV1, value: unknown): PolicyRevocationPlanV1 {
  const state = getRegistryState(registry);
  assertRecord(value, ["now", "policyId", "revokedAt", "reason"]);
  const now = parseTimestamp(value.now, "now");
  const policyId = parseToken(value.policyId, "policyId");
  const policy = state.policies.get(policyId);
  if (!policy) throw new TypeError("policyId must be registered");
  const revokedAt = parseTimestamp(value.revokedAt, "revokedAt");
  if (revokedAt.getTime() > now.getTime()) throw new TypeError("revokedAt must not be in the future");
  if (value.reason !== "terms_withdrawn" && value.reason !== "policy_revoked") throw new TypeError("reason must be closed");
  const existing = sharedRevocations.get(policyId);
  if (existing && existing !== value.revokedAt) throw new TypeError("revocation is immutable");
  sharedRevocations.set(policyId, value.revokedAt as string);
  const receipt = receiptFor({ requestId: `revoke-${policyId}`, policy, action: "display", purpose: "internal_review", field: "policy_record", region: "global", evaluatedAt: value.now as string, decision: "denied", reason: "POLICY_REVOKED" });
  return freeze({ policyId, revokedAt: value.revokedAt as string, invalidatedConsumers: freeze([...CONSUMERS]) as PolicyRevocationPlanV1["invalidatedConsumers"], receipt });
}

function parsePolicy(value: unknown): ParsedPolicy {
  assertRecord(value, ["policyId", "sourceId", "licenceVersion", "dataClass", "grants", "effectiveAt", "expiresAt", "termsRecheckAt", "trialEndsAt", "derivative", "shareAlike", "combination", "redistribution", "training", "retention"]);
  const policy: ParsedPolicy = { policyId: parseToken(value.policyId, "policyId"), sourceId: parseToken(value.sourceId, "sourceId"), licenceVersion: parseToken(value.licenceVersion, "licenceVersion"), dataClass: parseEnum(value.dataClass, DATA_CLASSES, "dataClass") as ParsedPolicy["dataClass"], grants: parseGrants(value.grants), effectiveAt: parseTimestampString(value.effectiveAt, "effectiveAt"), expiresAt: parseTimestampString(value.expiresAt, "expiresAt"), termsRecheckAt: parseTimestampString(value.termsRecheckAt, "termsRecheckAt"), trialEndsAt: value.trialEndsAt === null ? null : parseTimestampString(value.trialEndsAt, "trialEndsAt"), derivative: parseEnum(value.derivative, DERIVATIVE_RULES, "derivative") as ParsedPolicy["derivative"], shareAlike: parseEnum(value.shareAlike, SHARE_ALIKE_RULES, "shareAlike") as ParsedPolicy["shareAlike"], combination: parseEnum(value.combination, DERIVATIVE_RULES, "combination") as ParsedPolicy["combination"], redistribution: parseEnum(value.redistribution, DERIVATIVE_RULES, "redistribution") as ParsedPolicy["redistribution"], training: parseEnum(value.training, DERIVATIVE_RULES, "training") as ParsedPolicy["training"], retention: parseEnum(value.retention, RETENTION_RULES, "retention") as ParsedPolicy["retention"] };
  if (policy.grants.length === 0) throw new TypeError("policy grants must not be empty");
  if (parseTimestamp(policy.effectiveAt, "effectiveAt").getTime() >= parseTimestamp(policy.expiresAt, "expiresAt").getTime()) throw new TypeError("policy expiry must follow effectiveAt");
  return freeze(policy);
}
function parseGrants(value: unknown): readonly ParsedGrant[] {
  if (!Array.isArray(value)) throw new TypeError("grants must be an array");
  const grants = value.map((grant) => { assertRecord(grant, ["field", "region", "action", "purpose"]); return freeze({ field: parseToken(grant.field, "field"), region: parseToken(grant.region, "region"), action: parseAction(grant.action), purpose: parsePurpose(grant.purpose) }); });
  const keys = grants.map((grant) => `${grant.field}\u0000${grant.region}\u0000${grant.action}\u0000${grant.purpose}`);
  if (new Set(keys).size !== grants.length) throw new TypeError("grants must not contain duplicates");
  return freeze(grants);
}
function allow(value: Readonly<{ requestId: string; policy: ParsedPolicy; action: PolicyActionV1; purpose: PolicyPurposeV1; field: string; region: string; now: string }>): PolicyDecisionV1 { return freeze({ kind: "allowed", receipt: receiptFor({ requestId: value.requestId, policy: value.policy, action: value.action, purpose: value.purpose, field: value.field, region: value.region, evaluatedAt: value.now, decision: "allowed", reason: null }) }); }
function deny(value: Readonly<{ requestId: string; policy: ParsedPolicy; action: PolicyActionV1; purpose: PolicyPurposeV1; field: string; region: string; now: string }>, reason: Exclude<PolicyReceiptV1["reason"], null>): PolicyDecisionV1 { return freeze({ kind: "denied", receipt: receiptFor({ requestId: value.requestId, policy: value.policy, action: value.action, purpose: value.purpose, field: value.field, region: value.region, evaluatedAt: value.now, decision: "denied", reason }) }); }
function denyUnknown(value: Readonly<{ requestId: string; policyId: string; action: PolicyActionV1; purpose: PolicyPurposeV1; field: string; region: string; now: string }>): PolicyDecisionV1 { const policy: ParsedPolicy = { policyId: value.policyId, sourceId: "unknown_registry", licenceVersion: "unknown", dataClass: "c0_public", grants: [], effectiveAt: value.now, expiresAt: value.now, termsRecheckAt: value.now, trialEndsAt: null, derivative: "denied", shareAlike: "not_required", combination: "denied", redistribution: "denied", training: "denied", retention: "none" }; return deny({ requestId: value.requestId, policy, action: value.action, purpose: value.purpose, field: value.field, region: value.region, now: value.now }, "POLICY_NOT_REGISTERED"); }
function receiptFor(value: Readonly<{ requestId: string; policy: ParsedPolicy; action: PolicyActionV1; purpose: PolicyPurposeV1; field: string; region: string; evaluatedAt: string; decision: "allowed" | "denied"; reason: PolicyReceiptV1["reason"] }>): PolicyReceiptV1 { return freeze({ receiptId: `policy-receipt-${value.requestId}`, policyId: value.policy.policyId, sourceId: value.policy.sourceId, licenceVersion: value.policy.licenceVersion, action: value.action, purpose: value.purpose, field: value.field, region: value.region, decision: value.decision, code: value.decision === "denied" ? "DATA_POLICY_BLOCKED" : null, reason: value.reason, evaluatedAt: value.evaluatedAt, derivative: value.policy.derivative, shareAlike: value.policy.shareAlike, combination: value.policy.combination, redistribution: value.policy.redistribution, retention: value.policy.retention }); }
function getRegistryState(registry: PolicyRegistryV1): RegistryState { const state = registryStates.get(registry); if (!state) throw new TypeError("registry must be created by createPolicyRegistry"); return state; }
function parseAction(value: unknown): PolicyActionV1 { if (typeof value !== "string" || !ACTIONS.has(value as PolicyActionV1)) throw new TypeError("action must be closed"); return value as PolicyActionV1; }
function parsePurpose(value: unknown): PolicyPurposeV1 { if (typeof value !== "string" || !PURPOSES.has(value as PolicyPurposeV1)) throw new TypeError("purpose must be closed"); return value as PolicyPurposeV1; }
function parseEnum(value: unknown, values: ReadonlySet<string>, name: string): string { if (typeof value !== "string" || !values.has(value)) throw new TypeError(`${name} must be closed`); return value; }
function parseToken(value: unknown, name: string): string { if (typeof value !== "string" || !TOKEN.test(value)) throw new TypeError(`${name} must be bounded opaque text`); return value; }
function parseTimestampString(value: unknown, name: string): string { parseTimestamp(value, name); return value as string; }
function parseTimestamp(value: unknown, name: string): Date { if (typeof value !== "string") throw new TypeError(`${name} must be RFC3339`); const match = TIMESTAMP.exec(value); if (!match) throw new TypeError(`${name} must be RFC3339`); const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number); const offsetHour = Number(match[9] ?? 0); const offsetMinute = Number(match[10] ?? 0); const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second)); if (offsetHour > 23 || offsetMinute > 59 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) throw new TypeError(`${name} must be real RFC3339`); const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw new TypeError(`${name} must be valid`); return parsed; }
function assertRecord(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("expected record"); const actual = Object.keys(value); if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError("unexpected or missing input key"); }
function freeze<T>(value: T): Readonly<T> { if (Array.isArray(value)) value.forEach((item) => freeze(item)); else if (value && typeof value === "object") Object.values(value).forEach((item) => freeze(item)); return Object.freeze(value); }
