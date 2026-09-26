/** Operator-selected native environment; requests never choose the database or key. */
export type NativeConfig = Readonly<{
  url: string; publishableKey: string; serviceRoleKey?: string; environment?: "staging" | "production";
  capability?: "session" | "trip";
  productionSurface?: "identity" | "trip" | "text";
}>;
const stagingDatabase = "https://dzqdzetcctkhbrhlxxgn.supabase.co";
const productionOrigins = new Set(["https://go2china.space", "https://www.go2china.space"]);
const projectRef = /^[a-z0-9]{20}$/;

export function isLocalNativeTarget(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  } catch { return false; }
}

function stagingRequest(request: Pick<Request, "url">): boolean {
  const host = process.env.VERCEL_URL;
  if (process.env.VERCEL_ENV !== "preview" || process.env.VISEPANDA_NATIVE_STAGING !== "true"
      || process.env.VISEPANDA_TRIP_PROTOCOL_V2 !== "true" || !host
      || !/^vp-v4-[a-z0-9]+-jtcao515s-projects\.vercel\.app$/.test(host)) return false;
  try {
    const url = new URL(request.url);
    const customOrigin = "https://staging.go2china.space";
    const allowedOrigin = url.origin === `https://${host}`
      || (process.env.VISEPANDA_NATIVE_STAGING_CUSTOM_ORIGIN === customOrigin && url.origin === customOrigin);
    return allowedOrigin && !url.username && !url.password;
  } catch { return false; }
}

function productionRequest(request: Pick<Request, "url">): boolean {
  const origin = process.env.VISEPANDA_NATIVE_PRODUCTION_ORIGIN;
  if (process.env.VERCEL_ENV !== "production" || process.env.VISEPANDA_NATIVE_PRODUCTION !== "true"
      || process.env.VISEPANDA_NATIVE_STAGING === "true" || process.env.VISEPANDA_TRIP_PROTOCOL_V2 !== "true"
      || !origin || !productionOrigins.has(origin) || process.env.VISEPANDA_PUBLIC_ORIGIN !== origin) return false;
  try {
    const url = new URL(request.url);
    return url.origin === origin && !url.username && !url.password;
  } catch { return false; }
}

function productionDatabase(raw: string): boolean {
  const ref = process.env.VISEPANDA_NATIVE_PRODUCTION_PROJECT_REF;
  return typeof ref === "string" && projectRef.test(ref) && ref !== "dzqdzetcctkhbrhlxxgn"
    && raw === `https://${ref}.supabase.co`;
}

export function nativeTargetAllowed(config: NativeConfig, request: Pick<Request, "url">): boolean {
  if (config.environment === "staging") return config.url === stagingDatabase && stagingRequest(request);
  if (config.environment === "production") {
    const flag = config.capability === "session" && config.productionSurface === "identity"
      ? process.env.VISEPANDA_NATIVE_PRODUCTION_SESSION
      : config.capability === "trip" && ["trip", "text"].includes(config.productionSurface ?? "")
        ? process.env.VISEPANDA_NATIVE_PRODUCTION_TRIP : undefined;
    return flag === "true" && productionDatabase(config.url) && productionRequest(request);
  }
  // LOCAL flags cannot enable any deployed Vercel environment, even if misconfigured.
  return !process.env.VERCEL_ENV && isLocalNativeTarget(config.url);
}

export function getNativeRuntimeConfig(request: Pick<Request, "url">, capability: "session" | "trip", productionSurface?: NativeConfig["productionSurface"]): NativeConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  // A deployment declaring both targets is unavailable even when one flag is off.
  if (process.env.VISEPANDA_NATIVE_STAGING === "true" && process.env.VISEPANDA_NATIVE_PRODUCTION === "true") return null;
  if (process.env.VISEPANDA_NATIVE_STAGING === "true") {
    const config: NativeConfig = { url, publishableKey, environment: "staging",
      ...(capability === "session" ? { serviceRoleKey: process.env.VISEPANDA_NATIVE_STAGING_PROOF_KEY } : {}) };
    return nativeTargetAllowed(config, request) ? config : null;
  }
  if (process.env.VISEPANDA_NATIVE_PRODUCTION === "true") {
    const config: NativeConfig = { url, publishableKey, environment: "production", capability, productionSurface,
      ...(capability === "session" ? { serviceRoleKey: process.env.VISEPANDA_NATIVE_PRODUCTION_PROOF_KEY } : {}) };
    return nativeTargetAllowed(config, request) ? config : null;
  }
  const flag = capability === "session" ? "VISEPANDA_NATIVE_LOCAL_SESSION" : "VISEPANDA_NATIVE_LOCAL_TRIP";
  const config: NativeConfig = { url, publishableKey,
    ...(capability === "session" ? { serviceRoleKey: process.env.VISEPANDA_NATIVE_LOCAL_SERVICE_KEY } : {}) };
  return process.env[flag] === "true" && nativeTargetAllowed(config, request) ? config : null;
}
