import { createClient } from "@supabase/supabase-js";
import { verifyNativeCredentials } from "./native-credentials.ts";
import { isUuid } from "./request-guards.ts";

type Config = Readonly<{ url: string; publishableKey: string; serviceRoleKey?: string }>;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const failure = (code: string, status = 401) => json({ error: { code } }, status);
const rpcFailure = (message: string) => {
  if (message.includes("IDEMPOTENCY_KEY_REUSE")) return failure("IDEMPOTENCY_KEY_REUSE", 409);
  if (message.includes("SESSION_REPLACED") || message.includes("UNAUTHENTICATED")) return failure("SESSION_REPLACED");
  if (message.includes("INVALID_INPUT")) return failure("INVALID_INPUT", 400);
  return failure("UNAVAILABLE", 503);
};
const tokenRequest = (token: string) => ({ headers: new Headers({ Authorization: `Bearer ${token}` }) });

/** Dedicated native protocol. No cookie fallback, Origin exception, service credential or CORS. */
export async function nativeIdentityHTTP(request: Request, action: string, config: Config | null): Promise<Response> {
  if (!config) return failure("UNAVAILABLE", 503);
  try {
    const target = new URL(config.url);
    if (target.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(target.hostname) || target.username || target.password) return failure("UNAVAILABLE", 503);
  } catch { return failure("UNAVAILABLE", 503); }
  if (request.headers.has("cookie") || request.headers.has("origin")) return failure("AMBIGUOUS_CREDENTIALS", 400);
  if (request.method !== (["session", "profile"].includes(action) ? "GET" : "POST")) return failure("METHOD_NOT_ALLOWED", 405);
  try {
    const raw = request.method === "GET" ? "{}" : await request.text();
    if (raw.length > 20000) return failure("INVALID_INPUT", 400);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return failure("INVALID_INPUT", 400); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return failure("INVALID_INPUT", 400);
    const body = input as Record<string, unknown>;
    if (action === "credentials") {
      if (request.headers.has("authorization") || Object.keys(body).sort().join() !== "attemptId,email,password" ||
          typeof body.email !== "string" || body.email.length > 254 || typeof body.password !== "string" || body.password.length > 1024 ||
          typeof body.attemptId !== "string" || !isUuid(body.attemptId)) return failure("INVALID_INPUT", 400);
      if (!config.serviceRoleKey) return failure("UNAVAILABLE", 503);
      const auth = createClient(config.url, config.publishableKey, options);
      const { data, error } = await auth.auth.signInWithPassword({ email: body.email, password: body.password });
      if (error || !data.session) return failure("UNAUTHENTICATED");
      const verified = await verifyNativeCredentials(tokenRequest(data.session.access_token), config);
      if (!verified) return failure("UNAUTHENTICATED");
      const provisioner = createClient(config.url, config.serviceRoleKey, options);
      const proof = await provisioner.rpc("native_prepare_v2", { p_owner: verified.subject, p_session: verified.sessionId, p_attempt: body.attemptId });
      if (proof.error) return failure("UNAVAILABLE", 503);
      return json({ version: 2, subject: verified.subject, accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at });
    }
    if (action === "refresh") {
      if (request.headers.has("authorization") || Object.keys(body).join() !== "refreshToken" || typeof body.refreshToken !== "string" || !body.refreshToken || body.refreshToken.length > 16384) return failure("INVALID_INPUT", 400);
      const auth = createClient(config.url, config.publishableKey, options);
      const { data, error } = await auth.auth.refreshSession({ refresh_token: body.refreshToken });
      if (error || !data.session) return failure("UNAUTHENTICATED");
      const verified = await verifyNativeCredentials(tokenRequest(data.session.access_token), config);
      if (!verified) return failure("UNAUTHENTICATED");
      const state = await verified.client.rpc("native_session_v2", { p_action: "session" });
      if (state.error) return rpcFailure(state.error.message);
      return json({ ...state.data, accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at });
    }
    if (!["login", "session", "logout", "profile"].includes(action)) return failure("INVALID_INPUT", 400);
    if (action === "login" ? (Object.keys(body).join() !== "attemptId" || typeof body.attemptId !== "string" || !isUuid(body.attemptId)) : Object.keys(body).length !== 0) return failure("INVALID_INPUT", 400);
    const verified = await verifyNativeCredentials(request, config);
    if (!verified) return failure("UNAUTHENTICATED");
    const state = await verified.client.rpc("native_session_v2", { p_action: action === "profile" ? "session" : action, ...(action === "login" ? { p_attempt: body.attemptId } : {}) });
    if (state.error) return rpcFailure(state.error.message);
    if (action === "profile") {
      const result = await verified.client.from("user_profiles").select("owner_id,display_name").eq("owner_id", verified.subject).maybeSingle();
      if (result.error) return failure("UNAVAILABLE", 503);
      return json({ version: 2, subject: verified.subject, displayName: result.data?.display_name ?? null });
    }
    return json(state.data);
  } catch { return failure("UNAVAILABLE", 503); }
}
