import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-authorized (service-role) Supabase client, scoped narrowly for
 * lib/server/maps/canonical-mapping-repository.ts's provider_poi_mappings
 * lookup -- the one table in this schema that revokes every anon/
 * authenticated grant by design (see
 * supabase/migrations/20260914100000_vpj_19_363_place_identity.sql, and
 * docs/contracts/place-identity.md's "Canonical-mapping lookup" section,
 * which already anticipated this: "a route wiring this in must supply a
 * server-authorized client, never a request-scoped user client").
 *
 * Deliberately never reused for Trip/memory/profile/privacy data. That
 * surface stays on the request-scoped, RLS-respecting client built in
 * lib/server/identity/user-data-adapter.ts, whose actor is derived only
 * from the caller's own Supabase session -- see
 * tests/security/identity/no-service-credential.test.mjs, which asserts
 * that file (and the Trip/auth routes it lists) never references a service
 * credential, to keep a service key from ever standing in for a real
 * user's identity or bypassing Trip RLS. This factory lives in its own
 * module, imported by nothing under lib/server/identity/** or those listed
 * Trip routes, so that file list and its guarantee stay unchanged and
 * true. provider_poi_mappings carries no user-owned row (no user_id/owner
 * column -- see the migration), so this client can never read or write
 * anything that guard is protecting.
 *
 * Reads a private, non-`NEXT_PUBLIC_`-prefixed key so Next.js's build
 * never inlines it into a client bundle -- the same mechanism that
 * already keeps AMAP_WEB_SERVICE_KEY/TENCENT_MAP_WEB_SERVICE_KEY
 * server-only. Returns null, never throws, whenever the URL or key is
 * absent (every environment today, until this key is explicitly
 * provisioned) or client construction otherwise fails; callers already
 * treat "no service client available" as "no known mapping, dbError
 * false" via canonical-mapping-repository.ts's own graceful-degrade
 * posture -- never a hard failure of the underlying search/nearby result.
 */
export function createMapsServiceRoleClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof url !== "string" || !url.trim() || typeof serviceRoleKey !== "string" || !serviceRoleKey.trim()) {
    return null;
  }
  try {
    return createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return null;
  }
}
