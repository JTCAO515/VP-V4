import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/server/identity/user-data-adapter";

/**
 * Minimal, request-scoped, RLS-respecting authentication check for
 * app/api/places/**. Deliberately independent of
 * lib/server/identity/user-data-adapter.ts's `createUserDataAdapter` --
 * that adapter's cookie-forwarding/applyCookies machinery and its whole
 * Trip/memory/profile/privacy surface exist to read and mutate the
 * caller's own owned rows; a provider place-search/nearby lookup owns no
 * row for any user at all, so there is nothing for that machinery to do
 * here. Reuses `getSupabasePublicConfig`'s existing
 * `NEXT_PUBLIC_SUPABASE_URL`/publishableKey read and the same anon-key
 * client + `.auth.getClaims()` check `user-data-adapter.ts`'s own
 * `authenticated()` closure already uses -- an ordinary session check
 * against the caller's real Supabase cookies, never a service credential
 * (see lib/server/maps/service-role-client.ts's doc for why that stays a
 * completely separate module, read only after this check has already
 * passed).
 *
 * Gates `app/api/places/**` behind a real session, rather than leaving it
 * open to anonymous callers, purely to keep paid provider-API quota
 * (AMap/Tencent Web Service keys) from being spent by unauthenticated
 * traffic -- the same fail-closed posture the rest of this app already
 * applies to anything that isn't the public marketing preview. Read-only:
 * unlike `createUserDataAdapter`, this never forwards a refreshed-session
 * cookie back to the caller, since a place search is not a page load that
 * a browser session depends on continuing from.
 */
export async function requireAuthenticatedActor(request: NextRequest): Promise<string | null> {
  if (request.headers.has("authorization")) return null;
  const config = getSupabasePublicConfig();
  if (!config) return null;
  try {
    const client = createServerClient(config.url, config.publishableKey, {
      cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
    });
    const { data, error } = await client.auth.getClaims();
    const subject = data?.claims?.sub;
    return !error && typeof subject === "string" ? subject : null;
  } catch {
    return null;
  }
}
