import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { getNativeRuntimeConfig } from "../../identity/native-config.ts";
import { createNativeTripDataAdapter } from "../../identity/user-data-adapter.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../../contracts/errors/index.ts";
import { parseInventory, INVENTORY_BYTES } from "./contract.ts";
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode) => response({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
/** Native-only, same adapter/current-session authority; no new identity callback or caller owner. */
export async function nativeTripInventoryHTTP(request: NextRequest): Promise<Response> {
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin")
    || request.nextUrl.search !== "" || request.body !== null) return failure("INVALID_INPUT");
  const config = getNativeRuntimeConfig(request, "trip", "trip");
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const adapter = await createNativeTripDataAdapter(request, config, scope.fetch, scope.unavailable);
      scope.check();
      if (!adapter) return failure("UNAUTHENTICATED");
      const before = await adapter.authenticated(); scope.check();
      if ("error" in before) return failure(before.error);
      const result = await adapter.getTripInventory(scope.signal); scope.check();
      if ("error" in result) return failure(result.error);
      const after = await adapter.authenticated(); scope.check();
      if ("error" in after) return failure(after.error);
      if (after.data !== before.data || result.data.ownerId !== after.data) return failure("UNAUTHENTICATED");
      const data = parseInventory(result.data);
      if (!data || Buffer.byteLength(JSON.stringify(data)) > INVENTORY_BYTES) return failure("PROVIDER_UNAVAILABLE");
      scope.check(); return response(data);
    });
  } catch { return failure("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}
