import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { getNativeTextConfig } from "../../turn/native-http.ts";
import { getNativeAssistantConfig } from "../../turn/native-assistant-http.ts";
import { parseCanonicalPlaceAsk, parseRecoveryKey, record, sameId, uuid } from "./contract.ts";
import { submitCanonicalPlaceAsk, readCanonicalPlaceAsk } from "./producer.ts";

async function originalUtf8(request: Request, run: ReturnType<typeof nativeRequestScope>["run"]): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) { const part = await run(() => reader.read()); if (part.done) break; bytes += part.value.byteLength; if (bytes > 24000) return null; chunks.push(part.value); }
    const bytesValue = Buffer.concat(chunks);
    try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytesValue); return Buffer.from(text, "utf8").equals(bytesValue) ? text : null; }
    catch { return null; }
  } finally { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* request is ending */ } }
}
/** Native only; no client identity, subject, model, facts or qualification flag. */
export async function canonicalPlaceAskHTTP(request: NextRequest): Promise<Response> {
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
  const fail = (code: string, status: number) => reply({ error: { code } }, status);
  if (!["POST", "GET"].includes(request.method) || request.headers.has("cookie") || request.headers.has("origin")) return fail("INVALID_INPUT", 400);
  const scope = nativeRequestScope(request.signal, 30000);
  try {
    let raw: string | undefined; let input: ReturnType<typeof parseCanonicalPlaceAsk> = null; let operation: ReturnType<typeof parseRecoveryKey> = null;
    if (request.method === "POST") {
      if (request.nextUrl.searchParams.size || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return fail("INVALID_INPUT", 400);
      if (process.env.VISEPANDA_PLACE_ACTIONS_ENABLED !== "true") return fail("PROVIDER_UNAVAILABLE", 503);
      raw = await originalUtf8(request, scope.run) ?? undefined;
      if (!raw) return fail("INVALID_INPUT", 400);
      try { input = parseCanonicalPlaceAsk(JSON.parse(raw)); } catch { return fail("INVALID_INPUT", 400); }
      if (!input) return fail("INVALID_INPUT", 400);
    } else {
      const keys = [...request.nextUrl.searchParams.keys()];
      if (new Set(keys).size !== keys.length || keys.some(k => !["operationId", "scopeKind", "scopeId", "messageId", "turnId"].includes(k))) return fail("INVALID_INPUT", 400);
      operation = parseRecoveryKey({ operationId: request.nextUrl.searchParams.get("operationId"), scopeKind: request.nextUrl.searchParams.get("scopeKind"), scopeId: request.nextUrl.searchParams.get("scopeId"), messageId: request.nextUrl.searchParams.get("messageId"), turnId: request.nextUrl.searchParams.get("turnId") });
      if (!operation) return fail("INVALID_INPUT", 400);
    }
    // Reads retain the original base identity gate during admission rollback.
    const configs = input && "conversationId" in input.submission ? [getNativeAssistantConfig(request)]
      : input ? [getNativeTextConfig(request), getNativeTextConfig(request, true)] : [getNativeTextConfig(request)];
    // Match only operator-configured original policies; the request never picks
    // a database, recipient, mode upgrade or replacement consent.
    const config = configs.find(value => value && (!input || sameId(input.submission.policyId, value.policyId))) ?? null;
    if (!config || input && !sameId(input.submission.policyId, config.policyId)) return fail("DATA_POLICY_BLOCKED", 503);
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return fail("UNAUTHENTICATED", 401);
    const current = async () => {
      scope.check(); const r = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
      return !r.error && record(r.data) && uuid(r.data.subject) && uuid(r.data.sessionId) && sameId(r.data.subject, actor.subject) && sameId(r.data.sessionId, actor.sessionId);
    };
    const ports = { current, rpc: async (name: "grounded_ai_assist_work_v1", params: Parameters<Parameters<typeof submitCanonicalPlaceAsk>[1]["rpc"]>[1]) => { const r = await scope.run(() => actor.client.rpc(name, params).abortSignal(scope.signal)); return { data: r.data, error: r.error }; } };
    const result = input ? await submitCanonicalPlaceAsk(input, ports, raw) : await readCanonicalPlaceAsk(operation, ports);
    return reply(result, result.kind === "accepted" && !result.originalReceipt.reused ? 201 : 200);
  } catch { return fail("PROVIDER_UNAVAILABLE", 503); }
  finally { scope.dispose(); }
}
