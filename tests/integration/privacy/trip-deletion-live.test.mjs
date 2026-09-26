import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename } from 'node:path';
import { createServer } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { identityLocalEnv } from '../identity/local-supabase.mjs';
import { waitForNativeAPI } from '../identity/native-api-readiness.mjs';

test('synthetic local GoTrue JWT to HTTP, durable worker RPC, DB and owner readback',
  { skip: !process.env.VP_IDENTITY_SUPABASE_WORKDIR, timeout: 120000 }, async t => {
    assert.equal(process.env.VERCEL_ENV, undefined);
    const workdir = realpathSync(process.env.VP_IDENTITY_SUPABASE_WORKDIR);
    assert.ok([tmpdir(), '/tmp'].some(directory => workdir.startsWith(realpathSync(directory) + '/')));
    assert.match(basename(process.env.VP_IDENTITY_SUPABASE_WORKDIR), /^(vp-db-integration-|vpj36-d1-synthetic\.)/);
    const status = identityLocalEnv();
    assert.ok(status);
    assert.match(status.API_URL, /^http:\/\/127\.0\.0\.1:[0-9]+\/?$/);
    assert.match(status.DB_CONTAINER, /^supabase_db_(vp-db-ci-|vpj36-d1-20260926)/);
    assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
      VISEPANDA_NATIVE_LOCAL_TRIP: 'true',
    });
    const port = await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const selected = probe.address().port;
        probe.close(() => resolve(selected));
      });
    });
    const origin = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack',
      '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: process.cwd(), stdio: 'ignore',
      env: { ...process.env, VISEPANDA_NATIVE_LOCAL_SESSION: 'true',
        VISEPANDA_NATIVE_LOCAL_SERVICE_KEY: status.SERVICE_ROLE_KEY },
    });
    t.after(async () => {
      if (server.exitCode === null) {
        server.kill('SIGTERM');
        await new Promise(resolve => server.once('exit', resolve));
      }
    });
    await waitForNativeAPI(origin, server);
    const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, authOptions);
    const owner = createClient(status.API_URL, status.ANON_KEY, authOptions);
    const other = createClient(status.API_URL, status.ANON_KEY, authOptions);
    const password = `${randomUUID()}Aa!`;
    const signIn = async (client, label) => {
      const email = `vpj36-${label}-${randomUUID()}@example.invalid`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(created.error);
      const login = await client.auth.signInWithPassword({ email, password });
      assert.ifError(login.error);
      const session = login.data.session;
      assert.ok(session?.access_token);
      const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString('utf8'));
      const attempt = randomUUID();
      const prepared = await service.rpc('native_prepare_v2', { p_owner: created.data.user.id, p_session: claims.session_id, p_attempt: attempt });
      assert.ifError(prepared.error);
      const activated = await client.rpc('native_session_v2', { p_action: 'login', p_attempt: attempt });
      assert.ifError(activated.error);
      return { id: created.data.user.id, token: session.access_token, sessionId: claims.session_id };
    };
    const a = await signIn(owner, 'owner');
    const b = await signIn(other, 'other');
    const tripId = randomUUID(), requestId = randomUUID();
    const inserted = await service.from('trips').insert({ id: tripId, owner_id: a.id, title: 'Synthetic D1' });
    assert.ifError(inserted.error);
    const route = `${origin}/api/privacy/native/v1/trips`;
    const post = (token, body) => fetch(route, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    const get = (token) => fetch(`${route}?requestId=${requestId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const input = { requestId, tripId, expectedVersion: 0, confirmed: true };
    let response = await post(a.token, input);
    assert.equal(response.status, 202);
    let receipt = await response.json();
    assert.equal(receipt.state, 'queued');
    assert.equal(receipt.allUserDataCompleted, false);
    assert.equal((await get(b.token)).status, 403);
    assert.equal((await post(b.token, input)).status, 403);
    response = await post(a.token, { ...input, tripId: randomUUID() });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'IDEMPOTENCY_KEY_REUSE');
    const next = await service.rpc('next_trip_deletion_v1');
    assert.ifError(next.error);
    assert.equal(next.data, requestId);
    const workerOutput = execFileSync(process.execPath,
      ['lib/server/jobs/run-local-trip-deletion.mjs', requestId], {
        cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, VP_PRIVACY_LOCAL_DISPOSABLE: 'true',
          VP_PRIVACY_LOCAL_URL: status.API_URL, VP_PRIVACY_LOCAL_SERVICE_KEY: status.SERVICE_ROLE_KEY },
      });
    const executed = JSON.parse(workerOutput);
    assert.equal(executed.state, 'completed');
    response = await get(a.token);
    assert.equal(response.status, 200);
    receipt = await response.json();
    assert.equal(receipt.state, 'completed');
    assert.ok(receipt.completedAt);
    assert.equal(receipt.allUserDataCompleted, false);
    const gone = await service.from('trips').select('id').eq('id', tripId);
    assert.ifError(gone.error);
    assert.deepEqual(gone.data, []);
    const empty = await service.rpc('next_trip_deletion_v1');
    assert.ifError(empty.error);
    assert.equal(empty.data, null);

    // A real, still-valid JWT with an old server session cannot authorize a
    // new deletion. Only this isolated synthetic database is modified.
    const expired = await signIn(createClient(status.API_URL, status.ANON_KEY, authOptions), 'expired');
    const olderTrip = randomUUID();
    assert.ifError((await service.from('trips').insert({ id: olderTrip, owner_id: expired.id, title: 'Old session' })).error);
    execFileSync('docker', ['exec', status.DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', `update auth.sessions set created_at=now()-interval '10 minutes' where id='${expired.sessionId}'::uuid`],
    { stdio: 'pipe' });
    response = await post(expired.token, { requestId: randomUUID(), tripId: olderTrip, expectedVersion: 0, confirmed: true });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'REAUTHENTICATION_REQUIRED');
    assert.equal((await service.from('trips').select('id').eq('id', olderTrip)).data?.length, 1);
  });
