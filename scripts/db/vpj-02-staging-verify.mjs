import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, lstatSync, realpathSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, isAbsolute, dirname } from 'node:path';
import { STAGING, requireTarget, migrationDiff, newJournal, validateJournal, ownedUser, ownedTrip, marker, denied, hidden, requestFactory, cleanupFixtures } from './vpj-02-verification-core.mjs';

const report = { version: 1, observedAt: new Date().toISOString(), project: STAGING, checks: [], paths: {
  managementAPI: 'UNRUN', httpJWT: 'UNRUN', directDatabase: 'UNRUN: no verified SQL credential',
  sessionPooler: 'UNRUN: no verified SQL credential', worker: 'UNRUN: no verified worker connection identity',
} };
function check(name, pass) {
  report.checks.push({ name, status: pass ? 'PASS' : 'FAIL' });
  if (!pass) throw new Error('CHECK_FAILED');
}
function cli(args) {
  try { return JSON.parse(execFileSync(process.env.VPJ02_SUPABASE_BIN || 'supabase', [...args, '--output-format', 'json'], { encoding: 'utf8', timeout: 45000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch { throw new Error('CLI_REQUEST_FAILED'); }
}
const scratch = mkdtempSync(join(tmpdir(), 'vpj02-query-'));
function query(sql) {
  const file = join(scratch, 'query.sql');
  writeFileSync(file, `begin read only; set local statement_timeout='10s'; ${sql}; rollback;`, { mode: 0o600 });
  const value = cli(['db', 'query', '--linked', '--project-ref', STAGING, '--file', file]);
  if (!Array.isArray(value.rows) || value.rows.length !== 1) throw new Error('QUERY_RESULT_INVALID');
  report.paths.managementAPI = 'PASS';
  return value.rows[0];
}
function snapshot(j) {
  validateJournal(j);
  const users = j.users.map((u) => `'${u.id}'`).join(',');
  const trips = j.trips.map((id) => `'${id}'`).join(',');
  const emails = j.users.map((u) => `'${u.email}'`).join(',');
  return query(`select
    (select count(*)::int from auth.users where id not in (${users})) as auth_count,
    (select md5(coalesce(string_agg(md5(row_to_json(u)::text), '' order by id), '')) from auth.users u where id not in (${users})) as auth_digest,
    (select count(*)::int from public.trips where id not in (${trips})) as trip_count,
    (select md5(coalesce(string_agg(md5(row_to_json(t)::text), '' order by id), '')) from public.trips t where id not in (${trips})) as trip_digest,
    (select count(*)::int from auth.users where id in (${users}) or email in (${emails})) as fixture_users,
    (select count(*)::int from public.trips where id in (${trips})) as fixture_trips,
    (select count(*)::int from auth.sessions where user_id in (${users})) as fixture_sessions`);
}
let journalPath;
function save(j) {
  // Parent is owned 0700; atomic, fsynced replacement precedes each Auth mutation.
  const pending = `${journalPath}.${randomBytes(12).toString('hex')}.pending`;
  const fd = openSync(pending, 'wx', 0o600);
  try {
    try { writeFileSync(fd, `${JSON.stringify(j)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(pending, journalPath);
    const directory = openSync(dirname(journalPath), 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  } finally { rmSync(pending, { force: true }); }
}
async function main() {
  const [mode, ref, path, ...extra] = process.argv.slice(2);
  requireTarget(ref);
  if (!['inventory','matrix','cleanup'].includes(mode) || extra.length || (mode !== 'inventory' && (!path || !isAbsolute(path))) || (mode === 'inventory' && path)) throw new Error('ARGUMENTS_INVALID');
  const projects = cli(['projects','list']);
  check('explicit-staging-target', (Array.isArray(projects) ? projects : projects.projects).some((p) => p.id === STAGING && p.name === 'VP - V4' && p.region === 'ap-southeast-1' && p.status === 'ACTIVE_HEALTHY'));
  if (mode !== 'cleanup') {
    const inventory = cli(['db','query','--linked','--project-ref',STAGING,'--file','scripts/db/vpj-02-readonly.sql']).rows?.[0]?.inventory;
    if (!inventory) throw new Error('INVENTORY_INVALID');
    report.paths.managementAPI = 'PASS';
    report.inventory = { authAccountCount: inventory.authAccountCount, tripCount: inventory.tripCount,
      migrations: migrationDiff(readdirSync('supabase/migrations'), inventory.migrations),
      authenticatedDirectTripUpdateGranted: inventory.authenticatedDirectTripUpdateGranted,
      scope: 'public/private ordinary tables only', tableCount: inventory.tables.length, allListedTablesRLS: inventory.tables.every((t) => t.rlsEnabled) };
    check('migration-version-name-history', report.inventory.migrations.nameDrift.length === 0 && report.inventory.migrations.remoteOnly.length === 0 && report.inventory.migrations.historical24Matched);
    check('direct-trip-update-revoked', inventory.authenticatedDirectTripUpdateGranted === false);
    if (mode === 'inventory') return;
  }
  journalPath = resolve(path);
  if (journalPath.startsWith(`${realpathSync('.')}/`)) throw new Error('JOURNAL_MUST_BE_OUTSIDE_REPO');
  let j;
  if (mode === 'matrix') {
    // A new exclusive directory avoids overwriting a recovery receipt or following a symlink.
    mkdirSync(journalPath, { mode: 0o700 });
    journalPath = join(journalPath, 'journal.json');
    j = newJournal(); save(j);
  } else {
    const st = lstatSync(journalPath);
    if (!st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('JOURNAL_PERMISSIONS_INVALID');
    j = validateJournal(JSON.parse(readFileSync(journalPath, 'utf8')));
    if (!j.preflight || !j.baseline) throw new Error('JOURNAL_NOT_ARMED');
  }
  // Existing credentials only, held in memory. Raw CLI output/errors must never be printed.
  const keys = cli(['projects','api-keys','--project-ref',STAGING]);
  const items = Array.isArray(keys) ? keys : (keys.keys ?? keys.api_keys);
  const anon = items?.find((k) => k.name === 'anon')?.api_key;
  const service = items?.find((k) => k.name === 'service_role')?.api_key;
  if (!anon?.startsWith('eyJ') || !service?.startsWith('eyJ')) throw new Error('EXISTING_LEGACY_KEYS_UNAVAILABLE');
  const request = requestFactory({ anon, service });
  const tokens = [];
  if (mode === 'cleanup') { await cleanupFixtures(j, { request, tokens, snapshot, save, report }); return; }
  j.baseline = snapshot(j);
  check('reserved-identities-and-trip-ids-absent', j.baseline.fixture_users === 0 && j.baseline.fixture_trips === 0 && j.baseline.fixture_sessions === 0);
  j.preflight = true; save(j);
  try {
    for (const [i, user] of j.users.entries()) {
      const password = randomBytes(36).toString('base64url');
      user.attempted = true; save(j);
      const created = await request('/auth/v1/admin/users', { method: 'POST', admin: true, body: { id: user.id, email: user.email, password, email_confirm: true, user_metadata: { vpj02_run: j.run } } });
      check(`ordinary-user-${i}-created`, created.status === 200 && ownedUser(created.body, j, user) && created.body.role === 'authenticated' && !created.body.app_metadata?.ops_probe);
      const login = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: user.email, password } });
      if (typeof login.body?.access_token === 'string') tokens[i] = login.body.access_token;
      check(`ordinary-user-${i}-password-login`, login.status === 200 && login.body?.user?.id === user.id && !!tokens[i]);
      const identity = await request('/auth/v1/user', { token: tokens[i] });
      check(`ordinary-user-${i}-server-identity`, identity.status === 200 && identity.body?.id === user.id && identity.body.role === 'authenticated');
    }
    for (const i of [0,1]) {
      const row = { id: j.trips[i], owner_id: j.users[i].id, title: marker(j) };
      const created = await request('/rest/v1/trips', { method: 'POST', token: tokens[i], body: row });
      check(`owner-${i}-create-empty-trip`, created.status === 201 && created.body?.length === 1 && ownedTrip(created.body[0], j));
      const own = await request(`/rest/v1/trips?id=eq.${row.id}&select=id,owner_id,title,head_version`, { token: tokens[i] });
      check(`owner-${i}-read-own`, own.status === 200 && own.body?.length === 1 && own.body[0].id === row.id && ownedTrip(own.body[0], j));
      check(`other-${i}-read-hidden`, hidden(await request(`/rest/v1/trips?id=eq.${row.id}&select=id`, { token: tokens[1-i] })));
      check(`anon-${i}-read-denied`, denied(await request(`/rest/v1/trips?id=eq.${row.id}&select=id`)));
      const forged = await request('/rest/v1/trips', { method: 'POST', token: tokens[1-i], body: { ...row, id: j.trips[2+i] } });
      check(`other-${i}-forged-owner-insert-denied`, denied(forged));
      for (const [actor, token] of [['owner',tokens[i]],['other',tokens[1-i]],['anon',undefined]]) {
        check(`${actor}-${i}-direct-patch-denied`, denied(await request(`/rest/v1/trips?id=eq.${row.id}`, { method: 'PATCH', token, body: { title: `${marker(j)}-forbidden` } })));
      }
      const after = await request(`/rest/v1/trips?id=eq.${row.id}&select=id,title,head_version`, { token: tokens[i] });
      check(`owner-${i}-trip-unchanged-after-attacks`, after.status === 200 && after.body?.length === 1 && after.body[0].title === marker(j) && after.body[0].head_version === 0);
    }
    check('anon-insert-denied', denied(await request('/rest/v1/trips', { method: 'POST', body: { id: j.trips[4], owner_id: j.users[0].id, title: marker(j) } })));
    report.paths.httpJWT = 'PASS';
  } catch (e) { report.paths.httpJWT = 'FAIL'; throw e; }
  finally { await cleanupFixtures(j, { request, tokens, snapshot, save, report }); }
}
try { await main(); }
catch { report.status = 'FAIL'; process.exitCode = 1; }
finally {
  rmSync(scratch, { recursive: true, force: true });
  report.status ??= 'PASS_FOR_RECORDED_SCOPE';
  report.completedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
}
