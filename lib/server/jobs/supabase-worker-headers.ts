/** Supabase secret keys are API keys, not JWTs. Legacy service_role JWTs still
 * need both headers for the existing PostgREST transport. Never log either. */
export function supabaseWorkerHeaders(secret: string): Record<string, string> {
  if (secret.startsWith("sb_")) {
    if (!secret.startsWith("sb_secret_") || secret.length <= "sb_secret_".length) throw Error("Worker credential unavailable.");
    return { "content-type": "application/json", apikey: secret };
  }
  return { "content-type": "application/json", apikey: secret, authorization: "Bearer " + secret };
}
