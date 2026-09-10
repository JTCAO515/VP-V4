import { isOpsInput } from "./local-workspace.ts";
import { requestLifetime, type RequestLifetime } from "./request-lifetime.ts";
const statuses: Record<string, number> = { UNAUTHENTICATED: 401, OPS_FORBIDDEN: 403, OPS_DISABLED: 503, OPS_SELF_REVIEW: 403, OPS_CONFLICT: 409, OPS_NOT_FOUND: 404, INVALID_INPUT: 400, SESSION_REPLACED: 401 };
type Rpc = { authenticate(): Promise<string | false>; call(name: string, input: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
/** Dependency seam exercises the actual handler with hostile streams and stalled I/O. */
export async function handleOpsRequest(request: Request, options: {
  enabled: boolean; sameOrigin: boolean; createRpc(lifetime: RequestLifetime): Rpc; milliseconds?: number;
}) {
  const response = (error: string, status: number) => ({ body: { error }, status });
  if (!options.enabled) return response("OPS_DISABLED", 503);
  if (request.headers.has("authorization")) return response("UNAUTHENTICATED", 401);
  const mutation = request.method === "POST";
  if (mutation && !options.sameOrigin) return response("OPS_FORBIDDEN", 403);
  if (new URL(request.url).search || (mutation && !request.headers.get("content-type")?.startsWith("application/json"))) return response("INVALID_INPUT", 400);
  const lifetime = requestLifetime(request.signal, options.milliseconds);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let dispatched = false;
  try {
    const rpc = options.createRpc(lifetime);
    const actor = await lifetime.run(() => rpc.authenticate());
    if (!actor) return response("UNAUTHENTICATED", 401);
    const expectedActor = request.headers.get("x-ops-expected-actor");
    if (expectedActor !== null && expectedActor !== actor) return response("OPS_FORBIDDEN", 403);
    lifetime.check();
    let input: Record<string, unknown> = { action: "list" };
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
      if (!isOpsInput(value)) return response("INVALID_INPUT", 400);
      input = value;
    }
    lifetime.check();
    dispatched = true;
    const { data, error } = await lifetime.run(() => rpc.call("ops_review_workspace", { p_input: input }));
    if (error) {
      const known = Object.hasOwn(statuses, error.message);
      const code = known ? error.message : mutation ? "OPS_ACK_UNKNOWN" : "OPS_UNAVAILABLE";
      return response(code, statuses[code] ?? 503);
    }
    return { body: { data }, status: 200 };
  } catch {
    // Aborting the transport cannot prove a dispatched SQL transaction rolled back.
    return response(mutation && dispatched ? "OPS_ACK_UNKNOWN" : "OPS_UNAVAILABLE", 503);
  } finally {
    lifetime.dispose();
    // A hostile cancel implementation may never settle. Never await it.
    try { void reader?.cancel().catch(() => {}); } catch { /* already closed */ }
  }
}
