import { isLocalNativeTarget } from "../identity/native-config.ts";

/** Explicitly reject a future Production native config, regardless of flags. */
export function isStoreKitSandboxTarget(config: { url: string; environment?: string } | null,
  deployed = Boolean(process.env.VERCEL_ENV)): boolean {
  return config !== null && (config.environment === "staging"
    || (config.environment === undefined && !deployed && isLocalNativeTarget(config.url)));
}
