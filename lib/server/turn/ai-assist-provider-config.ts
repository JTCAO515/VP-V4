import type { HttpProviderConfiguration } from "../model-gateway/adapters/http-transport.ts";
import { PROVIDER_ENDPOINTS, readQwenEndpoint } from "../model-gateway/adapters/provider-endpoints.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Shared by Web and native server routes. All inputs are deployment-owned. */
export function groundedAiAssistProviderConfig(env: Readonly<Record<string, string | undefined>>): HttpProviderConfiguration | null {
  const provider = env.VISEPANDA_GROUNDED_AI_ASSIST_PROVIDER;
  const configurationId = env.VISEPANDA_GROUNDED_AI_ASSIST_CONFIG_ID;
  const version = env.VISEPANDA_GROUNDED_AI_ASSIST_CONFIG_VERSION ?? "1";
  if (provider !== "qwen" && provider !== "glm" && provider !== "deepseek") return null;
  if (!configurationId || !UUID.test(configurationId) || !/^[1-9][0-9]*$/.test(version) || !Number.isSafeInteger(Number(version))) return null;
  try {
    const endpoint = provider === "qwen" ? readQwenEndpoint(env) : PROVIDER_ENDPOINTS[provider][0];
    return { provider, endpoint, configurationId, configurationVersion: Number(version), timeoutMs: 15000 };
  } catch { return null; }
}
