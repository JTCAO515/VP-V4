import { getNativeTextConfig } from "../../turn/native-http.ts";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { isUuid } from "../../identity/request-guards.ts";
import { projectTranslation, record } from "./contract.ts";

// 20 * (600 + 2400 + 2400) UTF-16 units need at most648k bytes with
// six-byte JSON Unicode escaping, plus bounded metadata. See the v2 contract.
export const TRANSLATION_HISTORY_MAX_BYTES = 1_000_000;
const reply = (data: unknown, status = 200) => {
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized, "utf8") > TRANSLATION_HISTORY_MAX_BYTES) {
    return Response.json({ error: { code: "PROVIDER_UNAVAILABLE" } }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  return new Response(serialized, { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
};
const failure = (code: string, status: number) => reply({ error: { code } }, status);
const unavailable = () => ({ version: 2 as const, kind: "unavailable" as const });

export const TRANSLATION_HISTORY_QUERY_LIMIT = 120;
export const TRANSLATION_SEARCH_CURSOR_LIMIT = 1200;

export function translationSearchCursor(turnId: string, query: string): string {
  return "q1." + Buffer.from(JSON.stringify({ turnId, query }), "utf8").toString("base64url");
}
export function parseTranslationSearchCursor(value: string): { turnId: string; query: string } | null {
  if (value.length > TRANSLATION_SEARCH_CURSOR_LIMIT || !/^q1\.[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(value.slice(3), "base64url")));
    if (!record(data) || Object.keys(data).length !== 2 || !Object.hasOwn(data, "turnId") || !Object.hasOwn(data, "query")
      || typeof data.turnId !== "string" || !isUuid(data.turnId) || typeof data.query !== "string" || data.query.length > TRANSLATION_HISTORY_QUERY_LIMIT
      || translationSearchCursor(data.turnId, data.query) !== value) return null;
    return { turnId: data.turnId, query: data.query };
  } catch { return null; }
}
function matchesQuery(phrase: NonNullable<ReturnType<typeof projectTranslation>>, query: string | null): boolean {
  if (phrase.state !== "translated") return false;
  const term = query?.trim().toLowerCase() ?? "";
  return term === "" || [phrase.original, phrase.translation, phrase.backTranslation].some(text => text.toLowerCase().includes(term));
}

/** Raw bounded candidates stay internal; only canonical saved translations are projected. */
export function projectTranslationHistory(data: unknown, policyId: string, cursor: string | null, turnId?: string, query: string | null = null) {
  if (!record(data) || query !== null && query.length > TRANSLATION_HISTORY_QUERY_LIMIT) return null;
  if (data.kind === "unavailable") return unavailable();
  if (turnId !== undefined) {
    if (query !== null) return null;
    if (data.kind !== "translation_candidate") return null;
    const phrase = projectTranslation(data.turn);
    return phrase?.state === "translated" && phrase.turnId === turnId
      ? { version: 2 as const, kind: "translation" as const, policyId, phrase } : unavailable();
  }
  if (data.kind !== "translation_candidates" || !Array.isArray(data.turns) || data.turns.length > 128
    || typeof data.hasUnscannedTail !== "boolean") return null;
  const anchor = cursor === null ? null : projectTranslation(data.anchor);
  if (cursor !== null && (anchor?.state !== "translated" || anchor.turnId !== cursor || !matchesQuery(anchor, query))) return unavailable();
  const candidates = data.turns.map(projectTranslation);
  const projected = candidates.filter(value => value?.state === "translated" && matchesQuery(value, query));
  if (new Set(projected.map(value => value?.turnId)).size !== projected.length) return null;
  // Filtering malformed/nontranslated candidates cannot turn an incomplete scan
  // into an empty or complete page. No partial content leaves an unsafe window.
  if (projected.length <= 20 && (data.hasUnscannedTail || candidates.some(value => value?.state !== "translated"))) return unavailable();
  const phrases = projected.slice(0, 20);
  const nextTurn = phrases.at(-1)?.turnId;
  return { version: 2 as const, kind: "translations" as const, policyId, phrases,
    ...(query === null ? {} : { query }),
    nextCursor: projected.length > 20 && nextTurn ? query === null ? nextTurn : translationSearchCursor(nextTurn, query) : null };
}

/** GET only, current-input policy/session, no admission/provider/model budget path. */
export async function translationHistoryHTTP(request: Request, turnId?: string) {
  if (process.env.VERCEL_ENV === "production") return failure("PROVIDER_UNAVAILABLE", 503);
  const params = new URL(request.url).searchParams, cursorValue = params.get("cursor"), query = params.get("query");
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin")
    || [...params.keys()].some(key => key !== "cursor" && key !== "query") || params.getAll("cursor").length > 1 || params.getAll("query").length > 1
    || (query !== null && query.length > TRANSLATION_HISTORY_QUERY_LIMIT)
    || (cursorValue !== null && (query === null ? !isUuid(cursorValue) : parseTranslationSearchCursor(cursorValue) === null)) || (turnId !== undefined && (!isUuid(turnId) || [...params].length !== 0))) return failure("INVALID_INPUT", 400);
  const searchCursor = cursorValue !== null && query !== null ? parseTranslationSearchCursor(cursorValue) : null;
  const cursor = query === null ? cursorValue : searchCursor?.turnId ?? null;
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
    if (searchCursor && searchCursor.query !== query) return reply(unavailable());
    const read = () => rpc(turnId === undefined ? "list_saved_translations_v1" : "read_saved_translation_v1",
      turnId === undefined ? { p_policy_id: config.policyId, p_cursor: cursor } : { p_policy_id: config.policyId, p_turn_id: turnId });
    const first = await read();
    if (first.error) return failure(/UNAUTHENTICATED|SESSION_REPLACED/.test(first.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE",
      /UNAUTHENTICATED|SESSION_REPLACED/.test(first.error.message) ? 401 : 503);
    const page = projectTranslationHistory(first.data, config.policyId, cursor, turnId, query);
    if (!page) return failure("PROVIDER_UNAVAILABLE", 503);
    // Re-read current eligibility/content and session before publication. A source
    // change is unavailable; no stale projection survives revocation or deletion.
    const last = await read();
    if (last.error) return failure(/UNAUTHENTICATED|SESSION_REPLACED/.test(last.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE",
      /UNAUTHENTICATED|SESSION_REPLACED/.test(last.error.message) ? 401 : 503);
    if (JSON.stringify(projectTranslationHistory(last.data, config.policyId, cursor, turnId, query)) !== JSON.stringify(page)) return reply(unavailable());
    const finalSessionFailure = await sessionFailure();
    if (finalSessionFailure) return finalSessionFailure;
    scope.check();
    return reply(page);
  } catch { return failure("PROVIDER_UNAVAILABLE", 503); }
  finally { scope.dispose(); }
}
