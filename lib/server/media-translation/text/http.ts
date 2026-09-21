import { NextRequest } from "next/server.js";
import { nativeTextHTTP } from "../../turn/native-http.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { parseSubmission, projectTranslation, record, translationPrompt } from "./contract.ts";

const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const invalid = () => response({ error: { code: "INVALID_INPUT" } }, 400);

/** Uses exactly the current-input text lane: no new recipient, worker, budget or history context. */
export async function translationHTTP(request: NextRequest, textHTTP: typeof nativeTextHTTP = nativeTextHTTP) {
  if (request.headers.has("cookie") || request.headers.has("origin") || [...request.nextUrl.searchParams].length) return invalid();
  if (request.method === "GET") {
    const result = await textHTTP(request, "history");
    if (!result.ok) return result;
    const history: unknown = await result.json();
    if (!record(history) || history.kind !== "history" || !Array.isArray(history.turns) || history.turns.length > 20) return response({ error: { code: "PROVIDER_UNAVAILABLE" } }, 503);
    return response({ version: 1, kind: "translations", phrases: history.turns.map(projectTranslation).filter(value => value !== null) });
  }
  if (request.method !== "POST" || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return invalid();
  const scope = nativeRequestScope(request.signal, 5000);
  try {
    const body = await scope.body(request, 12000);
    const input = body === null ? null : parseSubmission(JSON.parse(body));
    if (!input) return invalid();
    const prompt = translationPrompt(input);
    if (prompt.length > 4000) return invalid();
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const forwarded = new NextRequest(request.url, { method: "POST", headers, signal: request.signal,
      body: JSON.stringify({ threadId: input.threadId, turnId: input.turnId, idempotencyKey: input.idempotencyKey,
        policyId: input.policyId, locale: input.targetLocale, text: prompt }) });
    return await textHTTP(forwarded, "submit");
  } catch { return invalid(); }
  finally { scope.dispose(); }
}
