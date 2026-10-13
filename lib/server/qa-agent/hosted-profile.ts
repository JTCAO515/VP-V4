import { readIndependentQaTarget, type IndependentQaTarget } from "./target.ts";
import { createStagingTextJob } from "../jobs/staging-text-job.ts";
import { PROTOCOL_MODELS } from "../model-gateway/adapters/provider-protocol.ts";
import type { HostedTariff } from "../jobs/hosted-text-worker.ts";
import type { QaWorkerConfiguration, LegacyQaWorkerConfiguration, IndependentQaWorkerConfiguration } from "./worker.ts";
import { exact, record, uuid } from "./service.ts";

export type LegacyQaHostedProfile = Readonly<{
  schemaVersion: "vpj07-hosted-text-worker/3";
  pollIntervalMs: number; maxLifetimeMs: number; drainMs: number; concurrency: number; groupLimit: number;
  modes: readonly ["qa_session_history_v1"]; qwen: HostedTariff; planning: null;
}>;
export type IndependentQaHostedProfile = Omit<LegacyQaHostedProfile, "schemaVersion"> & Readonly<{
  schemaVersion: "vpj07-hosted-text-worker/4"; projectRef: string;
}>;
export type QaHostedProfile = LegacyQaHostedProfile | IndependentQaHostedProfile;
const nil = "00000000-0000-4000-8000-000000000000";
const defaultEndpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
/** /4 independent QA; /3 parsing is retained only for historical evidence. */
export function parseQaHostedProfile(raw: unknown): QaHostedProfile {
  if (!record(raw) || !exact(raw, ["schemaVersion", "pollIntervalMs", "maxLifetimeMs", "drainMs", "concurrency", "groupLimit", "modes", "qwen", "planning", ...(raw.schemaVersion === "vpj07-hosted-text-worker/4" ? ["projectRef"] : [])])
    || !["vpj07-hosted-text-worker/3", "vpj07-hosted-text-worker/4"].includes(String(raw.schemaVersion))
    || (raw.schemaVersion === "vpj07-hosted-text-worker/4" && !readIndependentQaTarget(raw.projectRef)) || raw.planning !== null
    || !integer(raw.pollIntervalMs, 1000, 60000) || !integer(raw.maxLifetimeMs, 60000, 86400000) || !integer(raw.drainMs, 0, 60000)
    || !integer(raw.concurrency, 1, 8) || !integer(raw.groupLimit, 1, 50)
    || !Array.isArray(raw.modes) || raw.modes.length !== 1 || raw.modes[0] !== "qa_session_history_v1"
    || !record(raw.qwen) || !exact(raw.qwen, ["priceVersion", "pricing", "reservedMicros", "maxOutputTokens", "timeoutMs", "configurationId", "configurationVersion"])
    || typeof raw.qwen.priceVersion !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(raw.qwen.priceVersion)
    || !integer(raw.qwen.reservedMicros, 1, 1_000_000_000_000) || !integer(raw.qwen.maxOutputTokens, 1, 4096) || !integer(raw.qwen.timeoutMs, 1, 60000)
    || !uuid(raw.qwen.configurationId) || !integer(raw.qwen.configurationVersion, 1, Number.MAX_SAFE_INTEGER)) throw new Error("QA hosted profile unavailable");
  const profile = raw as unknown as QaHostedProfile;
  // Historical /3 parsing remains available without executing the old QA job.
  const tariff = profile.qwen;
  createStagingTextJob({ schemaVersion: "vpj07-staging-text-job/1", ownerId: nil, policyId: nil,
    budget: { scopeId: nil, priceVersion: tariff.priceVersion, reservedMicros: tariff.reservedMicros, maxOutputTokens: tariff.maxOutputTokens, timeoutMs: tariff.timeoutMs },
    provider: { provider: "qwen", endpoint: defaultEndpoint, configurationId: tariff.configurationId, configurationVersion: tariff.configurationVersion, timeoutMs: tariff.timeoutMs }, pricing: tariff.pricing },
    { workerCredential: () => null, providerCredential: () => null, recordDestination: async () => {} });
  return Object.freeze({ ...profile, modes: Object.freeze(["qa_session_history_v1"] as const),
    qwen: Object.freeze({ ...profile.qwen, pricing: Object.freeze({ ...profile.qwen.pricing }) }), planning: null });
}
export function requireQaProfileTarget(profile: QaHostedProfile, operatorProjectRef: unknown): IndependentQaTarget {
  const target = readIndependentQaTarget(operatorProjectRef);
  if (profile.schemaVersion !== "vpj07-hosted-text-worker/4" || !target || profile.projectRef !== target.projectRef) throw new Error("QA profile target unavailable");
  return target;
}
export function qaJobConfig(profile: IndependentQaHostedProfile, ownerId: string, policyId: string, scopeId: string, endpoint: string): IndependentQaWorkerConfiguration;
export function qaJobConfig(profile: LegacyQaHostedProfile, ownerId: string, policyId: string, scopeId: string, endpoint: string): LegacyQaWorkerConfiguration;
export function qaJobConfig(profile: QaHostedProfile, ownerId: string, policyId: string, scopeId: string, endpoint: string): QaWorkerConfiguration;
export function qaJobConfig(profile: QaHostedProfile, ownerId: string, policyId: string, scopeId: string, endpoint: string): QaWorkerConfiguration {
  const tariff = profile.qwen;
  const binding = profile.schemaVersion === "vpj07-hosted-text-worker/4" ? readIndependentQaTarget(profile.projectRef) : null;
  if (profile.schemaVersion === "vpj07-hosted-text-worker/4" && !binding) throw new Error("QA profile target unavailable");
  return { ...(binding ? { schemaVersion: "qa-agent-worker/2" as const, projectRef: binding.projectRef, databaseUrl: binding.databaseUrl }
      : { schemaVersion: "qa-agent-worker/1" as const, databaseUrl: "https://dzqdzetcctkhbrhlxxgn.supabase.co" }), ownerId, policyId,
    budget: { scopeId, priceVersion: tariff.priceVersion, reservedMicros: tariff.reservedMicros, maxOutputTokens: tariff.maxOutputTokens, timeoutMs: tariff.timeoutMs },
    provider: { provider: "qwen", endpoint, configurationId: tariff.configurationId, configurationVersion: tariff.configurationVersion, timeoutMs: tariff.timeoutMs },
    pricing: { ...tariff.pricing } };
}
export function planQaGroup(profile: QaHostedProfile, raw: unknown, qwenEndpoint: string): QaWorkerConfiguration | null {
  if (profile.schemaVersion !== "vpj07-hosted-text-worker/4" || !record(raw) || !uuid(raw.ownerId) || !uuid(raw.policyId) || raw.contextMode !== "qa_session_history_v1"
    || raw.provider !== "qwen" || raw.endpoint !== qwenEndpoint || !Array.isArray(raw.scopes)) return null;
  const matching = raw.scopes.filter(v => record(v) && uuid(v.scopeId) && v.model === PROTOCOL_MODELS.qwen && v.priceVersion === profile.qwen.priceVersion);
  return matching.length === 1 ? qaJobConfig(profile, raw.ownerId.toLowerCase(), raw.policyId.toLowerCase(), String(matching[0].scopeId).toLowerCase(), qwenEndpoint) : null;
}
