import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/** Existing Web SSR cookie auth; never accepts a caller-supplied bearer identity. */
export function createWebRpc(request: NextRequest, config: { url: string; publishableKey: string }) {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const hasAuthorization = request.headers.has("authorization");
  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => hasAuthorization ? [] : request.cookies.getAll(),
      setAll: (cookies) => { pending.push(...cookies); },
    },
  });
  return {
    async call(name: string, input: Record<string, unknown>) {
      if (hasAuthorization) return { data: null, error: { message: "UNAUTHENTICATED" } };
      const { data, error } = await client.auth.getClaims();
      if (error || typeof data?.claims?.sub !== "string") return { data: null, error: { message: "UNAUTHENTICATED" } };
      return client.rpc(name, input);
    },
    applyCookies(response: NextResponse) {
      for (const { name, value, options } of pending) response.cookies.set(name, value, options);
      return response;
    },
  };
}
