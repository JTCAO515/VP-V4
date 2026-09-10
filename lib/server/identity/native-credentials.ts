import { nativeFetch } from "./native-fetch.ts";
import { createClient, isAuthError } from "@supabase/supabase-js";
import { isUuid } from "./request-guards.ts";

/** Internal credential preparation, NOT NativeActorContext or permission to access user data. */
export async function verifyNativeCredentials(
  request: Pick<Request, "headers">,
  config: Readonly<{ url: string; publishableKey: string }>,
  transport: typeof fetch = nativeFetch,
  onUnavailable?: () => void,
) {
  // Reject ambiguous credentials, including chunked/custom cookie names. Never fall back to cookies.
  if (request.headers.has("cookie")) return null;
  const authorization = request.headers.get("authorization");
  const token = authorization && authorization.length <= 16384 && /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization)?.[1];
  if (!token) return null;
  // Reject caller-controlled JSON syntax before SDK parsing can throw a generic
  // error indistinguishable from malformed upstream JSON. This never verifies it.
  try {
    for (const part of token.split(".").slice(0, 2)) {
      const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    }
  } catch { return null; }
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport, headers: { Authorization: `Bearer ${token}` } },
  });
  try {
    const { data, error } = await client.auth.getClaims(token);
    const claims = data?.claims;
    if (error) {
      if (!nativeAuthRejected(error)) onUnavailable?.();
      return null;
    }
    if (!claims) { onUnavailable?.(); return null; }
    if (
      typeof claims.sub !== "string" || !isUuid(claims.sub) ||
      claims.role !== "authenticated" || claims.is_anonymous !== false ||
      claims.aud !== "authenticated" ||
      claims.iss !== `${config.url.replace(/\/$/, "")}/auth/v1` ||
      typeof claims.session_id !== "string" || !isUuid(claims.session_id) ||
      !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000 ||
      (claims.nbf !== undefined && (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf > Date.now() / 1000))
    ) return null;
    // Expose the JWT-bound client only after ordinary-user credential verification.
    // This is NOT an active mobile session or atomic write authorization.
    return { subject: claims.sub, sessionId: claims.session_id, client };
  } catch (error) {
    if (!nativeAuthRejected(error)) onUnavailable?.();
    // SDK/network/crypto errors do not expose tokens or create an authenticated fallback.
    return null;
  }
}

/** Only an explicit SDK credential rejection can justify the HTTP401 clear-session path. */
export function nativeAuthRejected(error: unknown): boolean {
  return isAuthError(error) && typeof error.status === "number" && [400, 401, 403, 422].includes(error.status)
    && (error.name === "AuthInvalidJwtError" || (error.name === "AuthApiError" && typeof error.code === "string" && error.code.length > 0));
}
