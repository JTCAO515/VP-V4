import { parseIntakeInput, type IntakeInput, type IntakeResult } from "./contract.ts";
export type IntakeRpc = (input: IntakeInput, signal: AbortSignal) => Promise<IntakeResult>;
const codes = { received: 201, withdrawn: 200, invalid_input: 400, unavailable: 503, request_not_accepted: 409, rate_limited: 429, receipt_conflict: 409 };
function reply(kind: IntakeResult["kind"]) {
  return Response.json({ kind }, { status: codes[kind], headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...(kind === "rate_limited" ? { "Retry-After": "3600" } : {}) } });
}
/** No submitted values or upstream error bodies enter responses/logs. */
export async function handleIntake(request: Request, rpc: IntakeRpc | null, sameOrigin = request.headers.get("origin") === new URL(request.url).origin): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || !sameOrigin
    || request.headers.get("sec-fetch-site") === "cross-site" || url.search) return new Response(null, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !request.body) return reply("invalid_input");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
  let input: IntakeInput | null = null;
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    let size = 0; const parts: Uint8Array[] = [];
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2048) { await reader.cancel(); return reply("invalid_input"); }
      parts.push(chunk.value);
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    input = parseIntakeInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch { return reply("invalid_input"); }
  finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  if (!input) return reply("invalid_input");
  if (!rpc) return reply("unavailable");
  try {
    const result = await rpc(input, signal);
    signal.throwIfAborted();
    return reply(Object.hasOwn(codes, result.kind) ? result.kind : "unavailable");
  } catch { return reply("unavailable"); }
}
