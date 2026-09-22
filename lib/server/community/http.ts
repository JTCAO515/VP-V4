import { isCommunityInput } from "./request.ts";
import { requestLifetime, type RequestLifetime } from "../knowledge/review/request-lifetime.ts";
const statuses: Record<string, number> = { UNAUTHENTICATED: 401, COMMUNITY_FORBIDDEN: 403, COMMUNITY_DISABLED: 503, COMMUNITY_SELF_REVIEW: 403, COMMUNITY_CONFLICT: 409, COMMUNITY_NOT_FOUND: 404, INVALID_INPUT: 400, SESSION_REPLACED: 401 };
type Rpc = { authenticate(): Promise<string | false>; call(name: string, input: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
/** Dependency seam exercises the actual handler with hostile streams and stalled I/O. */
export async function handleCommunityRequest(request: Request, options: {
  enabled: boolean; sameOrigin: boolean; createRpc(lifetime: RequestLifetime): Rpc; milliseconds?: number;
}) {
  const response = (error: string, status: number) => ({ body: { error }, status });
  if (!options.enabled) return response("COMMUNITY_DISABLED", 503);
  if (request.headers.has("authorization")) return response("UNAUTHENTICATED", 401);
  if (request.method !== "GET" && request.method !== "POST") return response("INVALID_INPUT", 405);
  const mutation = request.method === "POST";
  if (mutation && !options.sameOrigin) return response("COMMUNITY_FORBIDDEN", 403);
  if (new URL(request.url).search || (mutation && !request.headers.get("content-type")?.startsWith("application/json"))) return response("INVALID_INPUT", 400);
  const lifetime = requestLifetime(request.signal, options.milliseconds);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let dispatched = false;
  try {
    const rpc = options.createRpc(lifetime);
    const actor = await lifetime.run(() => rpc.authenticate());
    if (!actor) return response("UNAUTHENTICATED", 401);
    const expectedActor = request.headers.get("x-community-expected-actor");
    if (expectedActor !== null && expectedActor !== actor) return response("COMMUNITY_FORBIDDEN", 403);
    lifetime.check();
    let input: Record<string, unknown> = { action: "mine" };
    if (mutation) {
      reader = request.body?.getReader();
      if (!reader) return response("INVALID_INPUT", 400);
      let length = 0; const chunks: Uint8Array[] = [];
      while (true) {
        const chunk = await lifetime.run(() => reader!.read());
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > 24000) return response("INVALID_INPUT", 413);
        chunks.push(chunk.value);
      }
      let value: unknown;
      try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return response("INVALID_INPUT", 400); }
      if (!isCommunityInput(value)) return response("INVALID_INPUT", 400);
      input = value;
    }
    lifetime.check();
    dispatched = true;
    const { data, error } = await lifetime.run(() => rpc.call("community_workspace", { p_input: input }));
    if (error) {
      const known = Object.hasOwn(statuses, error.message);
      const code = known ? error.message : mutation ? "COMMUNITY_ACK_UNKNOWN" : "COMMUNITY_UNAVAILABLE";
      return response(code, statuses[code] ?? 503);
    }
    return { body: { data }, status: 200 };
  } catch {
    // Aborting the transport cannot prove a dispatched SQL transaction rolled back.
    return response(mutation && dispatched ? "COMMUNITY_ACK_UNKNOWN" : "COMMUNITY_UNAVAILABLE", 503);
  } finally {
    lifetime.dispose();
    // A hostile cancel implementation may never settle. Never await it.
    try { void reader?.cancel().catch(() => {}); } catch { /* already closed */ }
  }
}
