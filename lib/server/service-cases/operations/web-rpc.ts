import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import type { RequestLifetime } from '../../knowledge/review/request-lifetime.ts';
import { uuid } from './contract.ts';

/** Cookie-bound staff session. Claims are verified; session/membership/shift and
 * Case eligibility are rechecked in the operations RPC, never granted here. */
export function createServiceWebRPC(request: NextRequest, config: { url: string; publishableKey: string }, lifetime: RequestLifetime) {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const client = createServerClient(config.url, config.publishableKey, {
    global: { fetch: (url, init) => lifetime.run(() => fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal })) },
    cookies: { getAll: () => request.headers.has('authorization') ? [] : request.cookies.getAll(), setAll: cookies => { if (!lifetime.signal.aborted) pending.push(...cookies); } },
  });
  let actor: string | false = false; let session: string | null = null;
  return {
    async authenticate() {
      const result = await lifetime.run(() => client.auth.getClaims()); lifetime.check();
      if (result.error) { if (!result.error.status || result.error.status >= 500) throw new Error('CASE_UNAVAILABLE'); actor = false; session = null; return false; }
      const claims = result.data?.claims;
      const valid = claims && uuid(claims.sub) && uuid(claims.session_id) && claims.role === 'authenticated' && claims.is_anonymous === false && claims.iss === `${config.url}/auth/v1` && claims.aud === 'authenticated' && Number.isFinite(claims.exp) && claims.exp > Date.now() / 1000;
      actor = valid ? claims.sub : false; session = valid ? claims.session_id : null;
      return actor;
    },
    sessionId() { return session; },
    async call(name: 'service_case_operations_v1', params: Record<string, unknown>) {
      if (!actor || !session) return { data: null, error: { message: 'UNAUTHENTICATED' } };
      return lifetime.run(() => client.rpc(name, params).abortSignal(lifetime.signal));
    },
    applyCookies(response: NextResponse) { for (const cookie of pending) response.cookies.set(cookie.name, cookie.value, cookie.options); return response; },
  };
}
