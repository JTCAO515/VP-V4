import { uuid } from '../../../../lib/server/service-cases/operations/contract.ts';
import type { Identity, ReadCommand } from './controller.ts';

type Auth = Readonly<{
  getSession(): PromiseLike<{ data: { session: { access_token: string } | null }; error: unknown }>;
  getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
}>;
/** getUser verifies actor with Auth; token fields only identify the browser
 * session/expiry. Cookie-bound API independently verifies both, plus staff ACL. */
export async function browserIdentity(auth: Auth | null): Promise<Identity | null> {
  if (!auth) return null;
  const session = await auth.getSession();
  if (session.error || !session.data.session) return null;
  const user = await auth.getUser();
  if (user.error || !user.data.user) return null;
  const latest = await auth.getSession();
  if (latest.error || latest.data.session?.access_token !== session.data.session.access_token) return null;
  try {
    const payload = JSON.parse(atob(session.data.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    if (!uuid(payload.sub) || payload.sub !== user.data.user.id || !uuid(payload.session_id) || typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp * 1000) || payload.exp <= 0) return null;
    return { actorId: payload.sub, sessionId: payload.session_id, expiresAt: payload.exp * 1000 };
  } catch { return null; }
}
export async function sendBriefRead(command: ReadCommand, identity: Identity, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher('/api/ops/service-cases/brief/v1', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-ops-expected-actor': identity.actorId, 'x-ops-expected-session': identity.sessionId },
    body: JSON.stringify(command), signal,
  });
  if (!response.ok) return { ok: false };
  const wire: unknown = await response.json();
  if (!wire || typeof wire !== 'object' || Array.isArray(wire) || Object.keys(wire).length !== 1 || !('data' in wire)) return { ok: false };
  return { ok: true, data: wire.data };
}
