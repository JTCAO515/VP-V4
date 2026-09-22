import type { ProtocolProvider } from "./provider-protocol.ts";

export const LEGACY_QWEN_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
export const PROVIDER_ENDPOINTS: Readonly<Record<ProtocolProvider, readonly string[]>> = Object.freeze({
  qwen: Object.freeze([LEGACY_QWEN_ENDPOINT]),
  glm: Object.freeze(["https://open.bigmodel.cn/api/paas/v4/chat/completions"]),
  deepseek: Object.freeze(["https://api.deepseek.com/chat/completions", "https://api.deepseek.com/v1/chat/completions"]),
});

// This migration preserves Beijing access. A different region needs a separate
// deployment decision. Syntax alone NEVER authorizes a request destination.
const WORKSPACE_ENDPOINT = /^https:\/\/(?!trial\.)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cn-beijing\.maas\.aliyuncs\.com\/compatible-mode\/v1\/chat\/completions$/;
export function isQwenEndpoint(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && (value === LEGACY_QWEN_ENDPOINT || WORKSPACE_ENDPOINT.test(value));
}

/** Only server/CLI composition roots supply this environment, never request input.
 * Absence preserves the deployed legacy binding during rollout; malformed or
 * empty configuration fails closed rather than silently selecting the old host. */
export function readQwenEndpoint(env: Readonly<Record<string, string | undefined>>): string {
  const endpoint = env.VISEPANDA_QWEN_ENDPOINT;
  if (endpoint === undefined) return LEGACY_QWEN_ENDPOINT;
  if (!isQwenEndpoint(endpoint)) throw new Error("Qwen endpoint configuration unavailable.");
  return endpoint;
}

/** The trusted operator binding is independent of the job's requested endpoint.
 * Selecting a workspace disables legacy dispatch for this transport instance. */
export function isProviderEndpoint(provider: ProtocolProvider, endpoint: unknown, qwenEndpoint?: string): boolean {
  if (!Object.hasOwn(PROVIDER_ENDPOINTS, provider)) return false;
  if (provider === "qwen") {
    const selected = qwenEndpoint === undefined ? LEGACY_QWEN_ENDPOINT : qwenEndpoint;
    return isQwenEndpoint(selected) && endpoint === selected;
  }
  return typeof endpoint === "string" && PROVIDER_ENDPOINTS[provider].includes(endpoint);
}
