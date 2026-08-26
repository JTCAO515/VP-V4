import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/server/identity/user-data-adapter";

type PendingCookie = { name: string; value: string; options: CookieOptions };

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, request.nextUrl.origin));
  const code = request.nextUrl.searchParams.get("code");
  const current = getSupabasePublicConfig();
  if (!code || !current) return NextResponse.redirect(new URL("/visepanda?auth=unavailable", request.nextUrl.origin));
  const pendingCookies: PendingCookie[] = [];
  const client = createServerClient(current.url, current.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => { pendingCookies.push(...cookies); },
    },
  });
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/visepanda?auth=failed", request.nextUrl.origin));
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/visepanda";
}
