import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/server/identity/user-data-adapter";
import { failureResponse } from "@/lib/server/identity/failure-response";
import { isSameOriginMutation } from "@/lib/server/identity/request-guards";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type PendingCookie = { name: string; value: string; options: CookieOptions };

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json(failureResponse("FORBIDDEN"), { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 }); }
  const email = typeof (payload as { email?: unknown })?.email === "string" ? (payload as { email: string }).email.trim() : "";
  if (!EMAIL.test(email) || email.length > 320) return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  const current = getSupabasePublicConfig();
  if (!current) return NextResponse.json(failureResponse("PROVIDER_UNAVAILABLE"), { status: 503 });
  const pendingCookies: PendingCookie[] = [];
  const client = createServerClient(current.url, current.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => { pendingCookies.push(...cookies); },
    },
  });
  await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: new URL("/auth/callback?next=/visepanda", request.nextUrl.origin).toString() },
  });
  const response = NextResponse.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
