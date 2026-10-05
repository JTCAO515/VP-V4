import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { identityLocalEnv } from '../../identity/local-supabase.mjs';
import { nativeHTTPEnvironmentPorts } from '../../turn/native-http-ports.mjs';
import { waitForNativeAPI } from '../../identity/native-api-readiness.mjs';
import { archiveDigest } from '../../../../lib/server/privacy/archive-data/contract.ts';
import { decodeArchiveList, decodeArchivePreview, decodeArchiveBundle, decodeArchiveReceipt } from '../../../../lib/server/privacy/archive-data/protocol.ts';
import { CATALOG_VERSION, moduleById, MODULE_CATALOG } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';

test('signed owner original confirm/archive -> inventory/preview/exact export/protected file preparation -> own metadata erase -> original Trip delete invalidates export; owned fixture only', {
  skip: process.env.VP_ARCHIVE_DATA_HTTP !== 'true', timeout: 300000,
}, async t => {
  const ports = nativeHTTPEnvironmentPorts(process.env), local = identityLocalEnv();
  assert.equal(local?.API_URL, ports.supabaseAPI); assert.match(local.DB_CONTAINER, /^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
  const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
  const sql = query => execFileSync('docker', ['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'], {
    input: "set statement_timeout='15s';" + query, encoding: 'utf8', stdio: ['pipe','pipe','pipe'],
  }).trim();
  const key = local.PUBLISHABLE_KEY || local.ANON_KEY, users = []; let next;
  t.after(async () => {
    if (next && next.exitCode === null) {
      const stopped = once(next, 'exit'); next.kill('SIGTERM'); await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 3000))]);
      if (next.exitCode === null) { next.kill('SIGKILL'); await stopped; }
    }
    for (const u of users) sql('delete from public.trip_events where owner_id='+literal(u.id)+';delete from public.trip_audit_events where owner_id='+literal(u.id)+';delete from auth.users where id='+literal(u.id)+';');
    if (users.length) assert.equal(sql('select count(*) from auth.users where id in('+users.map(u => literal(u.id)).join(',')+');'), '0');
  });
  const log = createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR, 'archive-data-next.log'), { mode: 0o600 });
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      VISEPANDA_NATIVE_LOCAL_SESSION: 'true', VISEPANDA_NATIVE_LOCAL_TRIP: 'true', VISEPANDA_NATIVE_LOCAL_SERVICE_KEY: local.SERVICE_ROLE_KEY,
      VISEPANDA_TRIP_PROTOCOL_V2: 'true', DATA_ARCHIVE_DATA_LOCAL: '1', DATA_COVERAGE_LOCAL: '1',
      VISEPANDA_NATIVE_STAGING: 'false', VISEPANDA_NATIVE_PRODUCTION: 'false', VERCEL_ENV: '' }, stdio: ['ignore','pipe','pipe'],
  });
  next.stdout.pipe(log); next.stderr.pipe(log); next.once('exit', () => log.end()); await waitForNativeAPI(ports.api, next);
  const path = '/api/privacy/native/v1/archive-data';
  const call = async (route, token, body, method = 'POST') => {
    const response = await fetch(ports.api + route, { method, headers: { ...(token ? { Authorization: 'Bearer '+token } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    return { status: response.status, body: response.status === 405 ? null : await response.json(), cache: response.headers.get('cache-control') };
  };
  async function user() {
    const auth = createClient(local.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = 'vpj58-archive-'+uuid()+'@example.test', password = 'VPJ58-Disposable-'+uuid()+'!';
    const signup = await auth.auth.signUp({ email, password }); assert.equal(signup.error, null); assert.ok(signup.data.user && signup.data.session);
    const row = { id: signup.data.user.id }; users.push(row);
    const attemptId = uuid(), credentials = await call('/api/auth/native/v2/credentials', null, { email, password, attemptId });
    assert.equal(credentials.status, 200); assert.equal((await call('/api/auth/native/v2/login', credentials.body.accessToken, { attemptId })).status, 200);
    const client = createClient(local.API_URL, key, { global: { headers: { Authorization: 'Bearer '+credentials.body.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const session = await client.rpc('native_session_v2', { p_action: 'session' }); assert.equal(session.error, null);
    return { ...row, token: credentials.body.accessToken, client, actor: { ownerId: row.id, sessionId: session.data.sessionId, mobileEpoch: session.data.mobileEpoch } };
  }
  const owner = await user(), foreign = await user(), tripId = uuid(), scope = 'archived-trip-data/1';
  const list = { action: 'list', scope, cursor: null, limit: 20 };
  assert.equal((await call(path, null, list)).status, 401);
  for (const role of ['anon','authenticated','service_role']) assert.equal(sql("select has_function_privilege("+literal(role)+",'public.privacy_archive_data_v1(text,text,bigint)','execute');"), 'f');
  assert.equal((await call(path, owner.token, list)).status, 503);
  sql('grant execute on function public.privacy_archive_data_v1(text,text,bigint) to authenticated;');
  t.diagnostic('New RPC grant applies only to this unique disposable Auth fixture; no target role/Storage/provider/real user data.');
  assert.equal((await call('/api/trips/native/v2', owner.token, { tripId, title: 'Synthetic archive source' })).status, 201);
  const patch = { expectedVersion: 0, operations: [{ kind: 'set_title', title: 'Archived safe Trip' },
    { kind: 'upsert_day', dayId: 'day1', date: '2026-10-06', timeZone: 'Asia/Shanghai' },
    { kind: 'upsert_item', itemId: 'item1', dayId: 'day1', title: 'Synthetic retained content' }] };
  const proposal = await call('/api/trips/native/v2/'+tripId+'/proposal', owner.token, { patch }); assert.equal(proposal.status, 201);
  const diff = await call('/api/trips/native/v2/'+tripId+'/proposal?proposalId='+proposal.body.proposalId, owner.token, undefined, 'GET'); assert.equal(diff.status, 200);
  assert.equal(diff.body.proposal.after.days[0].items[0].title, 'Synthetic retained content');
  const confirmed = await call('/api/trips/native/v2/'+tripId+'/confirm', owner.token, { proposalId: proposal.body.proposalId, idempotencyKey: uuid(), digest: diff.body.proposal.digest });
  assert.equal(confirmed.status, 200); assert.equal(confirmed.body.resultingVersion, 1);
  const archived = await call('/api/trips/native/v2/'+tripId+'/archive', owner.token, { expectedVersion: 1, idempotencyKey: uuid(), confirmed: true });
  assert.equal(archived.status, 200); assert.equal(archived.body.archive.archivedVersion, 1);
  const catalog = await call('/api/privacy/native/v1/coverage', owner.token, undefined, 'GET'); assert.equal(catalog.status, 200);
  assert.equal(MODULE_CATALOG.length, 34); assert.equal(catalog.body.modules.length, 34); assert.equal(moduleById('archive').exportHandler, 'archive_data');
  const inventory = await call(path, owner.token, list); assert.equal(inventory.status, 200);
  assert.ok(decodeArchiveList(inventory.body.data, list, owner.actor, Date.now())); assert.equal(inventory.body.data.items[0].tripId, tripId);
  assert.equal((await call(path, foreign.token, list)).body.data.items.length, 0);
  const selection = { scope, requestId: uuid(), tripId, tripVersion: 1, objectIds: [] }, previewCommand = { action: 'preview', ...selection };
  assert.notEqual((await call(path, foreign.token, previewCommand)).status, 200);
  const preview = await call(path, owner.token, previewCommand); assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.ok(decodeArchivePreview(preview.body.data, previewCommand, owner.actor, Date.now())); assert.equal(preview.body.data.snapshotVersionGaps, 0);
  const command = { action: 'export', ...selection, previewDigest: preview.body.data.previewDigest, confirmed: true }, bytes = ' '+JSON.stringify(command)+'\n';
  const envelope = { schemaVersion: 'data-coverage/1', catalogVersion: CATALOG_VERSION, actorId: owner.id, sessionId: owner.actor.sessionId, mobileEpoch: owner.actor.mobileEpoch,
    moduleId: 'archive', moduleVersion: 'archive-data/1', operationId: selection.requestId, action: 'export', phase: 'execute', confirmed: true, tripId, commandBytes: bytes };
  const outerBytes = JSON.stringify(envelope), exported = await call('/api/privacy/native/v1/coverage', owner.token, outerBytes);
  assert.equal(exported.status, 200, JSON.stringify(exported.body)); assert.ok(matchesCoverageResult(exported.body, outerBytes));
  assert.equal(exported.body.state, 'partial'); assert.equal(exported.body.reason, 'PROTECTED_ARCHIVE_FILE_REQUIRED');
  const bundle = exported.body.result.data; assert.ok(decodeArchiveBundle(bundle, command, owner.actor, Date.now())); assert.equal(bundle.requestDigest, archiveDigest(bytes));
  assert.equal(bundle.sections[0].items[0].content.days[0].items[0].title, 'Synthetic retained content');
  assert.equal(bundle.sections[1].items.length, 2); assert.equal(exported.body.allUserDataCompleted, false);
  const validate = { ...command, action: 'validate' }; assert.equal((await call(path, owner.token, validate)).status, 200);
  const progressScope = 'archive-export-progress/1', progressList = await call(path, owner.token, { action: 'list', scope: progressScope, cursor: null, limit: 20 });
  assert.equal(progressList.body.data.items.length, 1); assert.equal(progressList.body.data.items[0].objectId, selection.requestId);
  const progressSelection = { scope: progressScope, requestId: uuid(), tripId: null, tripVersion: null, objectIds: [selection.requestId] };
  const progressPreview = await call(path, owner.token, { action: 'preview', ...progressSelection }); assert.equal(progressPreview.status, 200);
  const erase = { action: 'erase', ...progressSelection, previewDigest: progressPreview.body.data.previewDigest, confirmed: true }, eraseBytes = JSON.stringify(erase);
  const erased = await call(path, owner.token, eraseBytes); assert.equal(erased.status, 200);
  assert.ok(decodeArchiveReceipt(erased.body.data, erase, owner.actor, archiveDigest(eraseBytes))); assert.equal(erased.body.data.effects.sourceTrip, 'not_modified');
  const recovered = await call(path, owner.token, { action: 'recover', ...progressSelection, mutationBytes: eraseBytes }); assert.equal(recovered.status, 200);
  assert.deepEqual(recovered.body, erased.body);
  assert.equal((await call(path, owner.token, { action: 'list', scope: progressScope, cursor: null, limit: 20 })).body.data.items.length, 2);
  assert.notEqual((await call(path, owner.token, validate)).status, 200, 'erasing file request progress invalidates that file authority');
  assert.equal((await call('/api/trips/native/v2/'+tripId+'/archive', owner.token, undefined, 'GET')).body.archive.archivedVersion, 1, 'own progress erase preserves original archive business source');
  const freshSelection = { ...selection, requestId: uuid() };
  const freshPreview = await call(path, owner.token, { action: 'preview', ...freshSelection }); assert.equal(freshPreview.status, 200);
  const freshExport = { action: 'export', ...freshSelection, previewDigest: freshPreview.body.data.previewDigest, confirmed: true };
  assert.equal((await call(path, owner.token, freshExport)).status, 200);
  const freshValidate = { ...freshExport, action: 'validate' }; assert.equal((await call(path, owner.token, freshValidate)).status, 200);
  const deletion = { requestId: uuid(), tripId, expectedVersion: 1, confirmed: true };
  const queued = await call('/api/privacy/native/v1/trips', owner.token, deletion); assert.equal(queued.status, 202);
  assert.equal(queued.body.state, 'queued'); assert.equal(queued.body.completedAt, null);
  assert.notEqual((await call(path, owner.token, freshValidate)).status, 200, 'original deletion admission invalidates the old file source');
  assert.equal((await call(path, owner.token, list)).body.data.items.length, 0);
  assert.equal((await call(path, owner.token, undefined, 'GET')).status, 405, 'no old public export URL/read route');
  sql('revoke execute on function public.privacy_archive_data_v1(text,text,bigint) from authenticated;');
  assert.equal((await call(path, owner.token, { action: 'list', scope: progressScope, cursor: null, limit: 20 })).status, 503);
});
