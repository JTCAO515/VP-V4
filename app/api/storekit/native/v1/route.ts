import { createClient } from "@supabase/supabase-js";
import { getNativeRuntimeConfig } from "@/lib/server/identity/native-config";
import { verifyNativeCredentials } from "@/lib/server/identity/native-credentials";
import { nativeRequestScope } from "@/lib/server/identity/native-request";
import { verifySandboxPurchase } from "@/lib/server/entitlements/storekit-sandbox";
import { journeyPassCatalog } from "@/lib/server/entitlements/journey-pass-catalog";
import { presentGrant } from "@/lib/server/entitlements/grant-read";
import { isStoreKitSandboxTarget } from "@/lib/server/entitlements/runtime-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (code: string, status: number) => reply({ error: { code } }, status);

async function authenticated(request: Request) {
  const config = getNativeRuntimeConfig(request, "trip");
  if (!isStoreKitSandboxTarget(config) || !config || request.headers.has("cookie") || request.headers.has("origin")) return null;
  const scope = nativeRequestScope(request.signal);
  const credentials = await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable);
  if (!credentials) { scope.dispose(); return null; }
  const session = await credentials.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal);
  if (session.error || session.data?.subject !== credentials.subject || session.data?.sessionId !== credentials.sessionId) {
    scope.dispose(); return null;
  }
  return { config, credentials, scope };
}

export async function GET(request: Request) {
  if (process.env.VISEPANDA_STOREKIT_SANDBOX_ENABLED !== "true") return fail("STOREKIT_UNAVAILABLE", 503);
  const context = await authenticated(request);
  if (!context) return fail("UNAUTHENTICATED", 401);
  try {
    const { data, error } = await context.credentials.client.from("storekit_grants")
      .select("environment,transaction_id,product_id,purchase_at,starts_at,ends_at,catalog_version,policy_version,capacity_snapshot,state,revoked_at")
      .eq("owner_id", context.credentials.subject).order("starts_at", { ascending: true }).abortSignal(context.scope.signal);
    context.scope.check();
    return error ? fail("STOREKIT_UNAVAILABLE", 503) : reply({ data: {
      productId: journeyPassCatalog.products.journeyPass.storeKitProductId,
      grants: (data ?? []).map(grant => presentGrant(grant)),
    } });
  } catch { return fail("STOREKIT_UNAVAILABLE", 503); }
  finally { context.scope.dispose(); }
}

export async function POST(request: Request) {
  if (process.env.VISEPANDA_STOREKIT_SANDBOX_ENABLED !== "true" || !journeyPassCatalog.products.journeyPass.storeKitProductId) return fail("STOREKIT_UNAVAILABLE", 503);
  const context = await authenticated(request);
  if (!context) return fail("UNAUTHENTICATED", 401);
  try {
    const raw = await context.scope.body(request, 22000);
    let body: unknown;
    try { body = JSON.parse(raw ?? ""); } catch { return fail("INVALID_INPUT", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        typeof (body as Record<string, unknown>).signedTransaction !== "string" ||
        Object.keys(body).some(key => key !== "signedTransaction")) return fail("INVALID_INPUT", 400);
    const signed = (body as { signedTransaction: string }).signedTransaction;
    let purchase;
    try { purchase = await verifySandboxPurchase(signed, context.credentials.subject); }
    catch (error) { return error instanceof Error && error.message === "INVALID_TRANSACTION"
      ? fail("INVALID_TRANSACTION", 422) : fail("STOREKIT_UNAVAILABLE", 503); }
    const serviceKey = context.config.environment === "staging"
      ? process.env.VISEPANDA_STOREKIT_STAGING_SERVICE_KEY : process.env.VISEPANDA_NATIVE_LOCAL_SERVICE_KEY;
    if (!serviceKey) return fail("STOREKIT_UNAVAILABLE", 503);
    const service = createClient(context.config.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await service.rpc("storekit_apply_verified_v1", { p_input: purchase });
    context.scope.check();
    if (error) return fail(error.message === "TRANSACTION_CONFLICT" ? "TRANSACTION_CONFLICT" : "STOREKIT_UNAVAILABLE",
      error.message === "TRANSACTION_CONFLICT" ? 409 : 503);
    return reply({ data });
  } catch { return fail("STOREKIT_UNAVAILABLE", 503); }
  finally { context.scope.dispose(); }
}
