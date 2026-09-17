import { requestLifetime, type RequestLifetime } from "../knowledge/review/request-lifetime.ts";
import { readOpsLedgerScope } from "./ops-ledger.ts";

type Rpc = {
  authenticate(): Promise<string | false>;
  call(name: string, input: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Cookie-only Ops read. SQL rechecks live membership in the same transaction as the snapshot. */
export async function handleOpsBudgetRead(request: Request, options: {
  enabled: boolean;
  createRpc(lifetime: RequestLifetime): Rpc;
}) {
  const fail = (status: number) => ({ status, body: { error: status === 400 ? "INVALID_INPUT" : status === 401 ? "UNAUTHENTICATED" : "OPS_UNAVAILABLE" } });
  if (!options.enabled) return fail(503);
  if (request.headers.has("authorization")) return fail(401);
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== "scopeId") return fail(400);
  const scopeId = url.searchParams.get("scopeId");
  if (!scopeId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scopeId)) return fail(400);
  const lifetime = requestLifetime(request.signal);
  try {
    const rpc = options.createRpc(lifetime);
    if (!await lifetime.run(() => rpc.authenticate())) return fail(401);
    const result = await readOpsLedgerScope(async (_, params) => {
      const response = await lifetime.run(() => rpc.call("ops_budget_scope_read_v1", params));
      if (response.error) throw new Error("OPS_UNAVAILABLE");
      return response.data;
    }, scopeId);
    lifetime.check();
    if (result.kind === "unavailable") return fail(503);
    return { status: 200, body: { data: { snapshot: result.snapshot, findings: result.findings } } };
  } catch { return fail(503); }
  finally { lifetime.dispose(); }
}
