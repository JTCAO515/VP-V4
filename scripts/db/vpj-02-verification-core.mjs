import { randomUUID } from 'node:crypto';

export const STAGING = 'dzqdzetcctkhbrhlxxgn';
export const API = `https://${STAGING}.supabase.co`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function requireTarget(ref) {
  if (ref !== STAGING) throw new Error('TARGET_REJECTED');
}
export function migrationDiff(files, remote) {
  const local = files.filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort().map((f) => ({ version: f.slice(0, 14), name: f.slice(15, -4) }));
  if (!Array.isArray(remote) || remote.some((r) => !/^\d{14}$/.test(r.version) || typeof r.name !== 'string') || new Set(remote.map((r) => r.version)).size !== remote.length) throw new Error('MIGRATION_METADATA_INVALID');
  const byVersion = new Map(remote.map((r) => [r.version, r.name]));
  return {
    localCount: local.length, remoteCount: remote.length,
    matched: local.filter((r) => byVersion.get(r.version) === r.name).length,
    pending: local.filter((r) => !byVersion.has(r.version)),
    nameDrift: local.filter((r) => byVersion.has(r.version) && byVersion.get(r.version) !== r.name).map((r) => r.version),
    remoteOnly: remote.filter((r) => !local.some((l) => l.version === r.version)).map((r) => r.version),
    historical24Matched: local.slice(0, 24).length === 24 && local.slice(0, 24).every((r) => byVersion.get(r.version) === r.name),
  };
}
export function newJournal() {
  const run = randomUUID();
  return { version: 1, project: STAGING, run, preflight: false,
    users: [0, 1].map((n) => ({ id: randomUUID(), email: `vpj02-${run}-${n}@example.invalid`, attempted: false })),
    trips: Array.from({ length: 5 }, () => randomUUID()),
  };
}
export function validateJournal(j) {
  requireTarget(j.project);
  if (j.version !== 1 || !uuid.test(j.run) || typeof j.preflight !== 'boolean' || j.users?.length !== 2 || j.trips?.length !== 5) throw new Error('JOURNAL_INVALID');
  for (const [n, u] of j.users.entries()) {
    if (!uuid.test(u.id) || u.email !== `vpj02-${j.run}-${n}@example.invalid` || typeof u.attempted !== 'boolean') throw new Error('JOURNAL_INVALID');
  }
  const ids = [...j.users.map((u) => u.id), ...j.trips];
  if (ids.some((id) => !uuid.test(id)) || new Set(ids).size !== ids.length) throw new Error('JOURNAL_INVALID');
  return j;
}
export function ownedUser(user, j, planned) {
  return user?.id === planned.id && user.email === planned.email && user.user_metadata?.vpj02_run === j.run;
}
export function ownedTrip(trip, j) {
  return j.trips.includes(trip.id) && j.users.some((u) => u.id === trip.owner_id) && [marker(j), `${marker(j)}-forbidden`].includes(trip.title) && trip.head_version === 0;
}
export const marker = (j) => `VPJ02 verification ${j.run}`;
export function denied(response) {
  return [401, 403].includes(response.status) && ['42501', 'PGRST301', 'PGRST302'].includes(response.body?.code);
}
export function hidden(response) {
  return response.status === 200 && Array.isArray(response.body) && response.body.length === 0;
}

// Never follow redirects with credentials. Do not surface remote bodies/errors to logs.
export function requestFactory({ anon, service, fetchImpl = fetch }) {
  return async (path, { method = 'GET', token, admin = false, body } = {}) => {
    if (!path.startsWith('/auth/v1/') && !path.startsWith('/rest/v1/')) throw new Error('PATH_REJECTED');
    const headers = { apikey: admin ? service : anon, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    if (token || admin) headers.Authorization = `Bearer ${token || service}`;
    try {
      const response = await fetchImpl(`${API}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(15000) });
      const reader = response.body?.getReader();
      const chunks = []; let size = 0;
      if (reader) while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > 1024 * 1024) { await reader.cancel(); throw new Error(); }
        chunks.push(Buffer.from(part.value));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      return { status: response.status, body: raw ? JSON.parse(raw) : null };
    } catch { throw new Error('HTTP_REQUEST_FAILED'); }
  };
}

export async function cleanupFixtures(j, { request, tokens = [], snapshot, save, report }) {
  validateJournal(j);
  if (!j.preflight) return;
  let success = true;
  // Each cleanup is independent so one unavailable endpoint cannot strand the other account.
  for (const [i, planned] of j.users.entries()) {
    if (!planned.attempted) continue;
    try {
      const r = await request(`/auth/v1/admin/users/${planned.id}`, { admin: true });
      if (r.status === 404) continue;
      if (r.status !== 200 || !ownedUser(r.body, j, planned)) throw new Error();
      if (tokens[i]) {
        const out = await request('/auth/v1/logout?scope=global', { method: 'POST', token: tokens[i] });
        if (out.status !== 204) throw new Error();
      }
      for (const id of j.trips) {
        const path = `/rest/v1/trips?id=eq.${id}&owner_id=eq.${planned.id}`;
        const r = await request(`${path}&select=id,owner_id,title,head_version`, { admin: true });
        if (r.status !== 200 || !Array.isArray(r.body) || r.body.length > 1 || r.body.some((t) => !ownedTrip(t, j))) throw new Error();
        if (r.body.length) {
          const out = await request(path, { method: 'DELETE', admin: true });
          if (out.status !== 200 || !Array.isArray(out.body) || out.body.length !== 1 || !ownedTrip(out.body[0], j)) throw new Error();
        }
      }
      // Refuse Auth cascade if any unexpected Trip belongs to this identity.
      const remaining = await request(`/rest/v1/trips?owner_id=eq.${planned.id}&select=id&limit=1`, { admin: true });
      if (!hidden(remaining)) throw new Error();
      const out = await request(`/auth/v1/admin/users/${planned.id}`, { method: 'DELETE', admin: true });
      if (out.status !== 200) throw new Error();
    } catch { success = false; }
  }
  const after = snapshot(j);
  report.cleanup = { operations: success ? 'PASS' : 'FAIL', fixturesAbsent: after.fixture_users === 0 && after.fixture_trips === 0 && after.fixture_sessions === 0 ? 'PASS' : 'FAIL', originalsUnchanged: ['auth_count','auth_digest','trip_count','trip_digest'].every((key) => j.baseline[key] === after[key]) ? 'PASS' : 'FAIL', authAccountCount: after.auth_count, tripCount: after.trip_count };
  if (Object.values(report.cleanup).includes('FAIL')) throw new Error('CLEANUP_OR_PRESERVATION_FAILED');
  j.complete = true; save(j);
}
