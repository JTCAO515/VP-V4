import type { NativeConfig } from "../identity/native-config.ts";

/** A local or Staging switch cannot activate Production native knowledge reads. */
export function nativeReadEnabled(environment: NativeConfig["environment"], env: NodeJS.ProcessEnv): boolean {
  const flag = environment === "staging" ? env.KNOWLEDGE_STAGING_READ
    : environment === "production" ? env.KNOWLEDGE_PRODUCTION_READ : env.KNOWLEDGE_LOCAL_READ;
  return flag === "1";
}
