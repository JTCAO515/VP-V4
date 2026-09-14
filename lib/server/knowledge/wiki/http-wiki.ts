import { requestLifetime, type RequestLifetime } from "../review/request-lifetime.ts";

const statuses: Record<string, number> = { UNAUTHENTICATED: 401, OPS_FORBIDDEN: 403, OPS_DISABLED: 503, OPS_NOT_FOUND: 404, INVALID_INPUT: 400 };
type Rpc = { authenticate(): Promise<string | false>; call(name: string, input: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** Cookie-authenticated Ops read, sharing one bounded request lifetime. */
export async function handleWikiRequest(request: Request, options: {
  enabled: boolean; createRpc(lifetime: RequestLifetime): Rpc; milliseconds?: number;
}) {
  const response = (error: string, status: number) => ({ body: { error }, status });
  if (!options.enabled) return response("OPS_DISABLED", 503);
  if (request.headers.has("authorization")) return response("UNAUTHENTICATED", 401);
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  const pageKey = url.searchParams.get("pageKey");
  if (keys.length > 1 || (keys.length === 1 && (keys[0] !== "pageKey" || !pageKey || pageKey.trim() !== pageKey || pageKey.length > 200))) return response("INVALID_INPUT", 400);
  const lifetime = requestLifetime(request.signal, options.milliseconds);
  try {
    const rpc = options.createRpc(lifetime);
    const actor = await lifetime.run(() => rpc.authenticate());
    if (!actor) return response("UNAUTHENTICATED", 401);
    lifetime.check();
    const { data, error } = await lifetime.run(() => rpc.call("ops_wiki_read_v1", { p_input: pageKey ? { pageKey } : {} }));
    if (error) {
      const known = Object.hasOwn(statuses, error.message);
      const code = known ? error.message : "OPS_UNAVAILABLE";
      return response(code, statuses[code] ?? 503);
    }
    return { body: { data }, status: 200 };
  } catch {
    return response("OPS_UNAVAILABLE", 503);
  } finally {
    lifetime.dispose();
  }
}
