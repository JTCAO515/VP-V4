import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';
const enabled = process.env.VP_MEMORY_DB_TEST === '1';
const container = 'vpj11-memory-' + uuid().slice(0, 8);
let created = false;
const run = (name, fn) => test(name, { skip: !enabled }, fn);
const literal = s => "'" + s.replaceAll("'", "''") + "'";
const db = async text => { const r = await sql(container, text); assert.equal(r.code, 0, r.stderr); return r.stdout.trim(); };
const raw = (a, input, project = false, claims = {}) => sql(container, `set request.jwt.claim.sub='${a.id}';set request.jwt.claims=${literal(JSON.stringify({ role: 'authenticated', is_anonymous: false, session_id: a.session, ...claims }))};set role authenticated;select public.${project ? 'native_task_travel_pace_v1' : 'native_travel_pace_v1'}(${literal(JSON.stringify(input))}::jsonb);`);
async function call(a, input, project = false) { const r = await raw(a, input, project); assert.equal(r.code, 0, r.stderr); return JSON.parse(r.stdout.trim()); }
async function denied(a, input, error, project = false, claims) { const r = await raw(a, input, project, claims); assert.notEqual(r.code, 0); assert.ok(r.stderr.includes(error), r.stderr); }
async function actor() {
  const a = { id: uuid(), session: uuid(), trip: uuid(), secondTrip: uuid() };
  await db(`insert into auth.users(id) values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${a.id}',1,'${a.session}');insert into identity_private.mobile_attempts values('${a.id}','${uuid()}','${a.session}',1);insert into public.trips(id,owner_id,title) values('${a.trip}','${a.id}','Synthetic trip'),('${a.secondTrip}','${a.id}','Second synthetic trip');`);
  return a;
}
const save = (rev = 0, pace = 'relaxed') => ({ action: 'save', operationId: uuid(), expectedRevision: rev, travelPace: pace, noticeVersion: 'local-planning-cross-trip-v1' });
const change = (action, rev) => ({ action, operationId: uuid(), expectedRevision: rev });
const projection = (a, fields = {}) => ({ tripId: a.trip, currentPace: null, useSaved: true, ...fields });

before(async () => {
  if (!enabled) return;
  const r = await command('docker', ['run', '--pull=never', '--rm', '-d', '--network', 'none', '--name', container, '--user', 'postgres', '--entrypoint', '/bin/sh', 'public.ecr.aws/supabase/postgres:17.6.1.159', '-c', 'umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(r.code, 0, r.stderr); created = true;
  assert.equal(JSON.parse((await command('docker', ['inspect', container])).stdout)[0].HostConfig.NetworkMode, 'none');
  let ready = false;
  for (let i = 0; i < 60; i++) { if ((await command('docker', ['exec', container, 'pg_isready', '-h', '/tmp/vpj59-socket', '-U', 'postgres'])).code === 0) { ready = true; break; } await new Promise(r => setTimeout(r, 250)); }
  assert.ok(ready);
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql', 'utf8'));
  await db('alter table auth.users add column is_anonymous boolean default false;');
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db('begin;' + readFileSync('supabase/migrations/' + file, 'utf8') + 'commit;');
  }
});
after(async () => { if (created) assert.equal((await command('docker', ['rm', '-f', container])).code, 0); });

run('explicit cross-trip consent is required; profile defaults are never task inputs; owner/session gates', async () => {
  const a = await actor(), b = await actor();
  assert.equal((await call(a, { action: 'read' })).state, 'unset');
  assert.equal((await call(a, projection(a), true)).source, 'none');
  await db(`insert into public.user_profiles(owner_id,travel_pace) values('${a.id}','balanced');`);
  assert.equal((await call(a, projection(a), true)).travelPace, null);
  await denied(a, { ...save(), noticeVersion: null }, 'INVALID_INPUT');
  await denied(a, { ...save(), ownerId: b.id }, 'INVALID_INPUT');
  const s = save(); const first = await call(a, s);
  assert.equal(first.state, 'explicit'); assert.equal(first.revision, 1);
  for (const tripId of [a.trip, a.secondTrip]) {
    const result = await call(a, projection(a, { tripId }), true);
    assert.equal(result.travelPace, 'relaxed'); assert.equal(result.source, 'profile'); assert.equal(result.sourceRevision, 1);
    assert.equal(result.sourceOperationId, s.operationId);
    assert.deepEqual(Object.keys(result).sort(), ['purpose','schemaVersion','source','sourceOperationId','sourceRevision','travelPace','tripId']);
  }
  await denied(b, projection(a), 'FORBIDDEN', true);
  assert.equal((await call(b, { action: 'read' })).state, 'unset');
  await denied(a, { action: 'read' }, 'UNAUTHENTICATED', false, { is_anonymous: true });
  assert.notEqual((await sql(container, `set role anon; select public.native_travel_pace_v1('{"action":"read"}');`)).code, 0);
  assert.notEqual((await sql(container, `set role authenticated; update public.user_profiles set pace_state='explicit';`)).code, 0);
});
run('current requirement wins; skip is task-only; correction invalidates queued work and older retries', async () => {
  const a = await actor(), s = save(); await call(a, s);
  const current = await call(a, projection(a, { currentPace: 'packed' }), true);
  assert.equal(current.source, 'current_input'); assert.equal(current.travelPace, 'packed'); assert.equal(current.sourceRevision, null);
  assert.equal((await call(a, projection(a, { useSaved: false }), true)).source, 'none');
  assert.equal((await call(a, projection(a), true)).source, 'profile');
  assert.deepEqual(await call(a, s), { ...await call(a, { action: 'read' }), reused: true });
  await denied(a, { ...s, travelPace: 'packed' }, 'PACE_OPERATION_REUSE');
  const corrected = save(1, 'packed'); await call(a, corrected);
  await denied(a, projection(a, { expectedSourceRevision: 1 }), 'PACE_STALE_SOURCE', true);
  await denied(a, s, 'PACE_CONFLICT');
  assert.equal((await call(a, projection(a), true)).travelPace, 'packed');
  const pause = change('pause', 2); await call(a, pause);
  assert.equal((await call(a, projection(a), true)).source, 'none');
  await denied(a, corrected, 'PACE_CONFLICT');
});
run('Undo restores exactly the last save; competing corrections and withdrawal prevent revival', async () => {
  const a = await actor(); await call(a, save());
  const undoFirst = change('undo', 1); const undone = await call(a, undoFirst);
  assert.equal(undone.state, 'unset'); assert.equal(undone.travelPace, null);
  assert.equal((await call(a, undoFirst)).reused, true);
  await call(a, save(2)); await call(a, save(3, 'packed'));
  assert.equal((await call(a, change('undo', 4))).travelPace, 'relaxed');
  const s = save(5, 'packed'); await call(a, s);
  await call(a, change('revoke', 6));
  assert.equal((await call(a, projection(a), true)).source, 'none');
  await denied(a, change('undo', 6), 'PACE_CONFLICT');
  await denied(a, change('undo', 7), 'PACE_CONFLICT');
  await denied(a, s, 'PACE_CONFLICT');
  assert.equal(await db(`select (pace_undo is null and pace_notice is null and travel_pace='balanced')::text from public.user_profiles where owner_id='${a.id}';`), 'true');
  assert.equal(await db(`select head_version from public.trips where id='${a.trip}';`), '0');
});
run('two devices cannot overwrite each other; legacy change revokes use; replaced session rejects replay', async () => {
  const a = await actor(); await call(a, save());
  const results = await Promise.all([raw(a, save(1, 'packed')), raw(a, save(1, 'balanced'))]);
  assert.equal(results.filter(r => r.code === 0).length, 1);
  assert.ok(results.find(r => r.code !== 0).stderr.includes('PACE_CONFLICT'));
  const prior = await call(a, { action: 'read' });
  await db(`set request.jwt.claim.sub='${a.id}';set request.jwt.claims=${literal(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};set role authenticated;select public.save_user_profile(null,'${prior.travelPace === 'packed' ? 'relaxed' : 'packed'}','en','CNY','kilometre','celsius','09:00:00');`);
  const legacy = await call(a, { action: 'read' }); assert.equal(legacy.state, 'unset'); assert.equal(legacy.revision, 3);
  await denied(a, projection(a, { expectedSourceRevision: 2 }), 'PACE_STALE_SOURCE', true);
  const s = save(3); await call(a, s);
  await db(`delete from auth.sessions where id='${a.session}';`);
  await denied(a, s, 'UNAUTHENTICATED');
});
run('failed write rolls back version and preimage; code rollback never restores revoked qualification', async () => {
  const a = await actor(); const s = save(); await call(a, s);
  await db("create function memory_private.test_fault() returns trigger language plpgsql as $$begin raise exception 'synthetic write failure';end$$;create trigger memory_test_fault after update on public.user_profiles for each row execute function memory_private.test_fault();");
  const correction = save(1, 'packed');
  try {
    await denied(a, correction, 'synthetic write failure');
    const unchanged = await call(a, { action: 'read' });
    assert.equal(unchanged.revision, 1); assert.equal(unchanged.travelPace, 'relaxed'); assert.equal(unchanged.operationId, s.operationId);
  } finally { await db('drop trigger memory_test_fault on public.user_profiles;drop function memory_private.test_fault();'); }
  await call(a, correction); await call(a, change('revoke', 2));
  await db('revoke execute on function public.native_task_travel_pace_v1(jsonb) from authenticated;');
  try { await denied(a, projection(a), 'permission denied', true); }
  finally { await db('grant execute on function public.native_task_travel_pace_v1(jsonb) to authenticated;'); }
  assert.equal((await call(a, projection(a), true)).source, 'none');
});
