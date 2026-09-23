import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';
import { consumePlaceQuota, PLACE_QUOTA_LIMITS } from '../../../lib/server/maps/place-quota.ts';

// Isolated PostgreSQL (no network) with the SQL-only auth fixture and the full migration history.
const enabled = process.env.VP_PLACE_QUOTA_DB_TEST === '1';
const container = 'vp-place-quota-' + uuid().slice(0, 8);
const MIGRATION = 'supabase/migrations/20260923120000_places_provider_quota.sql';
let created = false;
const run = (name, fn) => test(name, { skip: !enabled, timeout: 120000 }, fn);
const db = async text => { const r = await sql(container, text); assert.equal(r.code, 0, r.stderr); return r.stdout.trim(); };
const asActor = (actor, body) => `set request.jwt.claim.sub='${actor}';set role authenticated;${body}`;
const consumeSql = (bucket, minute, day) => `select public.consume_place_quota_v1(${bucket === null ? 'null' : `'${bucket}'`},${minute === null ? 'null' : minute},${day === null ? 'null' : day});`;
async function consume(actor, bucket = 'places', minute = 3, day = 100) {
  const r = await sql(container, asActor(actor, consumeSql(bucket, minute, day)));
  assert.equal(r.code, 0, r.stderr);
  return JSON.parse(r.stdout.trim());
}
// Fixed windows are UTC-aligned; keep multi-call minute assertions away from a boundary.
async function awayFromMinuteEdge() { const s = (Date.now() / 1000) % 60; if (s > 50) await new Promise(r => setTimeout(r, (61 - s) * 1000)); }
async function user() { const id = uuid(); await db(`insert into auth.users(id) values('${id}');`); return id; }
const hits = (actor, bucket, window) => db(`select coalesce((select hits from place_quota_private.usage where actor_id='${actor}' and bucket='${bucket}' and window_seconds=${window}),-1);`);

before(async () => {
  if (!enabled) return;
  const r = await command('docker', ['run', '--pull=never', '--rm', '-d', '--network', 'none', '--name', container, '--user', 'postgres', '--entrypoint', '/bin/sh', 'public.ecr.aws/supabase/postgres:17.6.1.159', '-c', 'umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(r.code, 0, r.stderr); created = true;
  let ready = false;
  for (let i = 0; i < 60; i++) { if ((await command('docker', ['exec', container, 'pg_isready', '-h', '/tmp/vpj59-socket', '-U', 'postgres'])).code === 0) { ready = true; break; } await new Promise(r => setTimeout(r, 250)); }
  assert.ok(ready);
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql', 'utf8'));
  await db('alter table auth.users add column is_anonymous boolean default false;');
  for (const f of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    const text = readFileSync('supabase/migrations/' + f, 'utf8');
    // The new migration must also roll back cleanly on top of the full history.
    if ('supabase/migrations/' + f === MIGRATION) {
      await db('begin;' + text + 'rollback;');
      assert.equal(await db("select to_regnamespace('place_quota_private') is null;"), 't');
    }
    await db('begin;' + text + 'commit;');
  }
});
after(async () => { if (created) assert.equal((await command('docker', ['rm', '-f', container])).code, 0); });

run('function is SECURITY DEFINER with empty search_path, owner-isolated, executable only by authenticated', async () => {
  assert.equal(await db("select prosecdef from pg_proc where proname='consume_place_quota_v1';"), 't');
  assert.equal(await db("select array_to_string(proconfig,',') from pg_proc where proname='consume_place_quota_v1';"), 'search_path=""');
  assert.equal(await db("select pg_get_userbyid(proowner) from pg_proc where proname='consume_place_quota_v1';"), 'postgres');
  const fn = "'public.consume_place_quota_v1(text,integer,integer)'";
  assert.equal(await db(`select has_function_privilege('authenticated',${fn},'execute');`), 't');
  for (const role of ['anon', 'service_role', 'public']) {
    if (role === 'public') { assert.equal(await db(`select exists(select 1 from pg_proc p, aclexplode(p.proacl) a where p.proname='consume_place_quota_v1' and a.grantee=0);`), 'f'); continue; }
    assert.equal(await db(`select has_function_privilege('${role}',${fn},'execute');`), 'f', role);
  }
  assert.notEqual((await sql(container, `set role anon;${consumeSql('places', 3, 10)}`)).code, 0);
  assert.equal(await db("select rowsecurity from pg_tables where schemaname='place_quota_private' and tablename='usage';"), 't');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.notEqual((await sql(container, `set role ${role};select * from place_quota_private.usage;`)).code, 0, role);
    assert.notEqual((await sql(container, `set role ${role};delete from place_quota_private.usage;`)).code, 0, role);
  }
});

run('rejects a missing actor and out-of-range thresholds without writing', async () => {
  const noActor = await sql(container, `set role authenticated;${consumeSql('places', 3, 10)}`);
  assert.notEqual(noActor.code, 0); assert.match(noActor.stderr, /UNAUTHENTICATED/);
  const a = await user();
  for (const [bucket, minute, day] of [['other', 3, 10], [null, 3, 10], ['places', 0, 10], ['places', null, 10], ['places', 3, null], ['places', 1001, 10], ['places', 3, 100001]]) {
    const r = await sql(container, asActor(a, consumeSql(bucket, minute, day)));
    assert.notEqual(r.code, 0); assert.match(r.stderr, /INVALID_INPUT/);
  }
  assert.equal(await db(`select count(*) from place_quota_private.usage where actor_id='${a}';`), '0');
});

run('per-minute limit: exact allowance, 429 decision with bounded retry, rejected calls consume nothing, window reset', async () => {
  await awayFromMinuteEdge();
  const a = await user();
  for (let i = 0; i < 3; i++) assert.deepEqual(await consume(a), { allowed: true });
  const denied = await consume(a);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 60, String(denied.retryAfterSeconds));
  await consume(a);
  assert.equal(await hits(a, 'places', 60), '3');
  assert.equal(await hits(a, 'places', 86400), '3');
  await db(`update place_quota_private.usage set window_start=window_start-interval '2 minutes' where actor_id='${a}' and window_seconds=60;`);
  assert.deepEqual(await consume(a), { allowed: true });
  assert.equal(await hits(a, 'places', 60), '1');
  assert.equal(await hits(a, 'places', 86400), '4');
});

run('per-day limit wins over the minute window and reports time to the next UTC day', async () => {
  const a = await user();
  for (let i = 0; i < 2; i++) assert.deepEqual(await consume(a, 'places', 10, 2), { allowed: true });
  const denied = await consume(a, 'places', 10, 2);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 86400);
  const expected = Math.ceil((Math.floor(Date.now() / 86400000) + 1) * 86400 - Date.now() / 1000);
  assert.ok(Math.abs(denied.retryAfterSeconds - expected) <= 5, `${denied.retryAfterSeconds} vs ${expected}`);
});

run('actors and buckets are isolated; deleting the account removes its counters', async () => {
  await awayFromMinuteEdge();
  const a = await user(), b = await user();
  for (let i = 0; i < 3; i++) await consume(a);
  assert.equal((await consume(a)).allowed, false);
  assert.deepEqual(await consume(b), { allowed: true });
  assert.deepEqual(await consume(a, 'map_proxy'), { allowed: true });
  assert.equal(await hits(b, 'places', 60), '1');
  await db(`delete from auth.users where id='${a}';`);
  assert.equal(await db(`select count(*) from place_quota_private.usage where actor_id='${a}';`), '0');
});

run('concurrent requests from one actor never exceed the limit', async () => {
  await awayFromMinuteEdge();
  const a = await user();
  const results = await Promise.all(Array.from({ length: 20 }, () => consume(a, 'places', 5, 100)));
  assert.equal(results.filter(r => r.allowed).length, 5);
  assert.equal(await hits(a, 'places', 60), '5');
});

run('server helper → real RPC: configured limits and 429 mapping', async () => {
  await awayFromMinuteEdge();
  const a = await user();
  const client = {
    rpc(name, params) {
      assert.equal(name, 'consume_place_quota_v1');
      const p = sql(container, asActor(a, consumeSql(params.p_bucket, params.p_minute_limit, params.p_day_limit)))
        .then(r => r.code === 0 ? { data: JSON.parse(r.stdout.trim()), error: null } : { data: null, error: { message: 'rpc failed' } });
      return { then: (ok, fail) => p.then(ok, fail), abortSignal() { return this; } };
    },
  };
  const limit = PLACE_QUOTA_LIMITS.places.perMinute;
  for (let i = 0; i < limit; i++) assert.deepEqual(await consumePlaceQuota(client, 'places'), { kind: 'allowed' });
  const denied = await consumePlaceQuota(client, 'places');
  assert.equal(denied.kind, 'limited');
  assert.ok(denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 60);
  assert.equal(await hits(a, 'places', 60), String(limit));
});
