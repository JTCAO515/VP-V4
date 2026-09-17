import { requestLifetime, type RequestLifetime } from "../review/request-lifetime.ts";

const statuses: Record<string, number> = { UNAUTHENTICATED: 401, OPS_FORBIDDEN: 403, OPS_DISABLED: 503, OPS_NOT_FOUND: 404, OPS_CONFLICT: 409, INVALID_INPUT: 400 };
type Rpc = { authenticate(): Promise<string | false>; call(name: string, input: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** The one write action this endpoint accepts: withdrawing a cited source
 * (ops_source_revision_withdraw_v1). A closed 4-key shape mirroring that
 * RPC's own input validation, so a malformed body is rejected here before
 * any RPC round trip -- exactly the "reject before dispatch" idiom every
 * other Ops POST handler in this codebase already follows. */
function isWikiWithdrawInput(value: unknown): value is { action: "withdraw_source"; operationId: string; sourceRevisionId: string; reason: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 4 && v.action === "withdraw_source"
    && typeof v.operationId === "string" && uuid.test(v.operationId)
    && typeof v.sourceRevisionId === "string" && uuid.test(v.sourceRevisionId)
    && typeof v.reason === "string" && v.reason.trim().length >= 1 && v.reason.trim().length <= 500
    && new TextEncoder().encode(JSON.stringify(v)).byteLength <= 4000;
}

/** Cookie-authenticated Ops read (GET, unchanged) and the one write action --
 * withdrawing a cited source (POST) -- sharing one bounded request lifetime.
 * GET behavior (query validation, ops_wiki_read_v1 call shape, error mapping)
 * is byte-for-byte the same as before this action was added. */
export async function handleWikiRequest(request: Request, options: {
  enabled: boolean; sameOrigin?: boolean; createRpc(lifetime: RequestLifetime): Rpc; milliseconds?: number;
}) {
  const response = (error: string, status: number) => ({ body: { error }, status });
  if (!options.enabled) return response("OPS_DISABLED", 503);
  if (request.headers.has("authorization")) return response("UNAUTHENTICATED", 401);
  const mutation = request.method === "POST";
  if (mutation && !options.sameOrigin) return response("OPS_FORBIDDEN", 403);
  const url = new URL(request.url);
  const pageKey = url.searchParams.get("pageKey");
  if (!mutation) {
    const keys = [...url.searchParams.keys()];
    if (keys.length > 1 || (keys.length === 1 && (keys[0] !== "pageKey" || !pageKey || pageKey.trim() !== pageKey || pageKey.length > 200))) return response("INVALID_INPUT", 400);
  } else if (url.search || !request.headers.get("content-type")?.startsWith("application/json")) {
    return response("INVALID_INPUT", 400);
  }
  const lifetime = requestLifetime(request.signal, options.milliseconds);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let dispatched = false;
  try {
    const rpc = options.createRpc(lifetime);
    const actor = await lifetime.run(() => rpc.authenticate());
    if (!actor) return response("UNAUTHENTICATED", 401);
    lifetime.check();
    let name = "ops_wiki_read_v1";
    let input: Record<string, unknown> = pageKey ? { pageKey } : {};
    if (mutation) {
      reader = request.body?.getReader();
      if (!reader) return response("INVALID_INPUT", 400);
      let length = 0; const chunks: Uint8Array[] = [];
      while (true) {
        const chunk = await lifetime.run(() => reader!.read());
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > 4000) return response("INVALID_INPUT", 413);
        chunks.push(chunk.value);
      }
      let value: unknown;
      try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return response("INVALID_INPUT", 400); }
      if (!isWikiWithdrawInput(value)) return response("INVALID_INPUT", 400);
      name = "ops_source_revision_withdraw_v1";
      input = { operationId: value.operationId, sourceRevisionId: value.sourceRevisionId, reason: value.reason };
    }
    lifetime.check();
    dispatched = true;
    const { data, error } = await lifetime.run(() => rpc.call(name, { p_input: input }));
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
