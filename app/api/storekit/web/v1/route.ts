import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getNativeRuntimeConfig } from "@/lib/server/identity/native-config";
import { journeyPassCatalog } from "@/lib/server/entitlements/journey-pass-catalog";
import { presentGrant } from "@/lib/server/entitlements/grant-read";
import { isStoreKitSandboxTarget } from "@/lib/server/entitlements/runtime-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const fail = (code: string, status: number) => NextResponse.json({ error: { code } }, { status, headers: { "Cache-Control": "private, no-store" } });
  if (process.env.VISEPANDA_STOREKIT_SANDBOX_ENABLED !== "true") return fail("STOREKIT_UNAVAILABLE", 503);
  if (request.headers.has("authorization")) return fail("UNAUTHENTICATED", 401);
  // The Web reader uses the same bounded local/Staging target as native.
  // A Production deployment cannot surface or consume Sandbox grants.
  const config = getNativeRuntimeConfig(request, "trip");
  if (!isStoreKitSandboxTarget(config) || !config) return fail("STOREKIT_UNAVAILABLE", 503);
  const cookies: { name: string; value: string; options: CookieOptions }[] = [];
  const client = createServerClient(config.url, config.publishableKey, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: values => { cookies.push(...values); } },
  });
  const { data: identity, error: authError } = await client.auth.getClaims();
  if (authError || typeof identity?.claims?.sub !== "string") return fail("UNAUTHENTICATED", 401);
  const { data, error } = await client.from("storekit_grants")
    .select("environment,transaction_id,product_id,purchase_at,starts_at,ends_at,catalog_version,policy_version,capacity_snapshot,state,revoked_at")
    .eq("owner_id", identity.claims.sub).order("starts_at", { ascending: true });
  if (error) return fail("STOREKIT_UNAVAILABLE", 503);
  const response = NextResponse.json({ data: { productId: journeyPassCatalog.products.journeyPass.storeKitProductId,
    grants: (data ?? []).map(grant => presentGrant(grant)) } }, { headers: { "Cache-Control": "private, no-store" } });
  for (const cookie of cookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
