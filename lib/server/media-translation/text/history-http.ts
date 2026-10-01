import { getNativeTextConfig } from "../../turn/native-http.ts";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { isUuid } from "../../identity/request-guards.ts";
import { projectTranslation, record } from "./contract.ts";

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: string, status: number) => reply({ error: { code } }, status);
const unavailable = () => ({ version: 2 as const, kind: "unavailable" as const });

/** Raw bounded candidates stay internal; only canonical saved translations are projected. */
export function projectTranslationHistory(data: unknown, policyId: string, cursor: string | null, turnId?: string) {
  if (!record(data)) return null;
  if (data.kind === "unavailable") return unavailable();
  if (turnId !== undefined) {
    if (data.kind !== "translation_candidate") return null;
    const phrase = projectTranslation(data.turn);
    return phrase?.state === "translated" && phrase.turnId === turnId
      ? { version: 2 as const, kind: "translation" as const, policyId, phrase } : unavailable();
  }
  if (data.kind !== "translation_candidates" || !Array.isArray(data.turns) || data.turns.length > 128
    || typeof data.hasUnscannedTail !== "boolean") return null;
  const anchor = cursor === null ? null : projectTranslation(data.anchor);
  if (cursor !== null && (anchor?.state !== "translated" || anchor.turnId !== cursor)) return unavailable();
  const candidates = data.turns.map(projectTranslation);
  const projected = candidates.filter(value => value?.state === "translated");
  if (new Set(projected.map(value => value?.turnId)).size !== projected.length) return null;
  // Filtering malformed/nontranslated candidates cannot turn an incomplete scan
  // into an empty or complete page. No partial content leaves an unsafe window.
  if (projected.length <= 20 && (data.hasUnscannedTail || candidates.some(value => value?.state !== "translated"))) return unavailable();
  const phrases = projected.slice(0, 20);
  return { version: 2 as const, kind: "translations" as const, policyId, phrases,
    nextCursor: projected.length > 20 ? phrases.at(-1)?.turnId : null };
}

/** GET only, current-input policy/session, no admission/provider/model budget path. */
export async function translationHistoryHTTP(request: Request, turnId?: string) {
  if (process.env.VERCEL_ENV === "production") return failure("PROVIDER_UNAVAILABLE", 503);
  const params = new URL(request.url).searchParams, cursor = params.get("cursor");
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin")
    || [...params.keys()].some(key => key !== "cursor") || params.getAll("cursor").length > 1
    || (cursor !== null && !isUuid(cursor)) || (turnId !== undefined && (!isUuid(turnId) || [...params].length !== 0))) return failure("INVALID_INPUT", 400);
  const config = getNativeTextConfig(request);
  if (!config) return failure("PROVIDER_UNAVAILABLE", 503);
  const scope = nativeRequestScope(request.signal);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED", 401);
    const rpc = (name: string, input: Record<string, string | null>) => scope.run(() => actor.client.rpc(name, input).abortSignal(scope.signal));
    const sessionFailure = async (): Promise<Response | null> => {
      const session = await rpc("native_session_v2", { p_action: "session" });
      if (session.error) return failure(/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message)
        ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE",
        /UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? 401 : 503);
      if (!record(session.data) || typeof session.data.subject !== "string" || !isUuid(session.data.subject)
        || typeof session.data.sessionId !== "string" || !isUuid(session.data.sessionId)) return failure("PROVIDER_UNAVAILABLE", 503);
      return session.data.subject === actor.subject && session.data.sessionId === actor.sessionId
        ? null : failure("UNAUTHENTICATED", 401);
    };
    const initialSessionFailure = await sessionFailure();
    if (initialSessionFailure) return initialSessionFailure;
    const read = () => rpc(turnId === undefined ? "list_saved_translations_v1" : "read_saved_translation_v1",
      turnId === undefined ? { p_policy_id: config.policyId, p_cursor: cursor } : { p_policy_id: config.policyId, p_turn_id: turnId });
    const first = await read();
    if (first.error) return failure(/UNAUTHENTICATED|SESSION_REPLACED/.test(first.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE",
      /UNAUTHENTICATED|SESSION_REPLACED/.test(first.error.message) ? 401 : 503);
    const page = projectTranslationHistory(first.data, config.policyId, cursor, turnId);
    if (!page) return failure("PROVIDER_UNAVAILABLE", 503);
    // Re-read current eligibility/content and session before publication. A source
    // change is unavailable; no stale projection survives revocation or deletion.
    const last = await read();
    if (last.error) return failure(/UNAUTHENTICATED|SESSION_REPLACED/.test(last.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE",
      /UNAUTHENTICATED|SESSION_REPLACED/.test(last.error.message) ? 401 : 503);
    if (JSON.stringify(projectTranslationHistory(last.data, config.policyId, cursor, turnId)) !== JSON.stringify(page)) return reply(unavailable());
    const finalSessionFailure = await sessionFailure();
    if (finalSessionFailure) return finalSessionFailure;
    scope.check();
    return reply(page);
  } catch { return failure("PROVIDER_UNAVAILABLE", 503); }
  finally { scope.dispose(); }
}
