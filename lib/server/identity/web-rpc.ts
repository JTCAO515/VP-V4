import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { RequestLifetime } from "../knowledge/review/request-lifetime.ts";

/** Existing Web SSR cookie auth; all refresh/fetch work shares the request lifetime. */
export function createWebRpc(request: NextRequest, config: { url: string; publishableKey: string }, lifetime: RequestLifetime) {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const hasAuthorization = request.headers.has("authorization");
  const client = createServerClient(config.url, config.publishableKey, {
    global: { fetch: (url, init) => lifetime.run(() => fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal })) },
    cookies: {
      getAll: () => hasAuthorization ? [] : request.cookies.getAll(),
      setAll: (cookies) => { if (!lifetime.signal.aborted) pending.push(...cookies); },
    },
  });
  let authenticated: string | false = false;
  return {
    async authenticate() {
      lifetime.check();
      if (hasAuthorization) return false;
      const { data, error } = await lifetime.run(() => client.auth.getClaims());
      lifetime.check();
      authenticated = !error && typeof data?.claims?.sub === "string" ? data.claims.sub : false;
      return authenticated;
    },
    async call(name: string, input: Record<string, unknown>) {
      lifetime.check();
      if (!authenticated) return { data: null, error: { message: "UNAUTHENTICATED" } };
      return lifetime.run(() => client.rpc(name, input).abortSignal(lifetime.signal));
    },
    applyCookies(response: NextResponse) {
      for (const { name, value, options } of pending) response.cookies.set(name, value, options);
      return response;
    },
  };
}
