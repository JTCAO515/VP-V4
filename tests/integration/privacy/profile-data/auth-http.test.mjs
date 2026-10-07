// Real disposable GoTrue/JWT -> owner RPC/PostgreSQL -> actual TS/HTTP consumers.
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
import { profileDigest } from '../../../../lib/server/privacy/profile-data/contract.ts';
import { decodeProfileList, decodeProfilePreview, decodeProfileReceipt, decodeProfileUnknown, validOperationRow } from '../../../../lib/server/privacy/profile-data/protocol.ts';
import { CATALOG_VERSION, moduleById } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';

test('signed Auth and actual PG payloads close selected Profile field clear/monotonic floor/new edit/exact recovery/own progress with actual ordinary-owner authorization', {
  skip: process.env.VP_PROFILE_DATA_HTTP !== 'true', timeout: 300000,
}, async t => {
  const ports = nativeHTTPEnvironmentPorts(process.env), local = identityLocalEnv();
  assert.equal(local?.API_URL, ports.supabaseAPI); assert.match(local.DB_CONTAINER, /^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
  const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
  const sql = query => execFileSync('docker', ['exec', '-i', local.DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-Atq', '-v', 'ON_ERROR_STOP=1'], {
    input: "set statement_timeout='15s';" + query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  const key = local.PUBLISHABLE_KEY || local.ANON_KEY, users = []; let next;
  t.after(async () => {
    if (next && next.exitCode === null) {
      const stopped = once(next, 'exit'); next.kill('SIGTERM'); await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 3000))]);
      if (next.exitCode === null) { next.kill('SIGKILL'); await stopped; }
    }
    for (const user of users) sql('delete from public.trip_events where owner_id=' + literal(user.id) + ';delete from public.trip_audit_events where owner_id=' + literal(user.id) + ';delete from auth.users where id=' + literal(user.id) + ';');
    if (users.length) assert.equal(sql('select count(*) from auth.users where id in(' + users.map(u => literal(u.id)).join(',') + ');'), '0');
  });
  const log = createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR, 'profile-data-next.log'), { mode: 0o600 });
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(ports.apiPort)], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      VISEPANDA_NATIVE_LOCAL_SESSION: 'true', VISEPANDA_NATIVE_LOCAL_TRIP: 'true', VISEPANDA_NATIVE_LOCAL_SERVICE_KEY: local.SERVICE_ROLE_KEY,
      VISEPANDA_TRIP_PROTOCOL_V2: 'true', DATA_PROFILE_DATA_LOCAL: '1', DATA_COVERAGE_LOCAL: '1',
      VISEPANDA_NATIVE_STAGING: 'false', VISEPANDA_NATIVE_PRODUCTION: 'false', VERCEL_ENV: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  next.stdout.pipe(log); next.stderr.pipe(log); next.once('exit', () => log.end()); await waitForNativeAPI(ports.api, next);
  const path = '/api/privacy/native/v1/profile-data';
  const call = async (route, token, body, method = 'POST') => {
    const response = await fetch(ports.api + route, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    return { status: response.status, body: response.status === 405 ? null : await response.json(), cache: response.headers.get('cache-control') };
  };
  async function user() {
    const auth = createClient(local.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = 'vpj58-profile-' + uuid() + '@example.test', password = 'VPJ58-Disposable-' + uuid() + '!';
    const signup = await auth.auth.signUp({ email, password }); assert.equal(signup.error, null); assert.ok(signup.data.user && signup.data.session);
    const row = { id: signup.data.user.id }; users.push(row);
    const attemptId = uuid(), credentials = await call('/api/auth/native/v2/credentials', null, { email, password, attemptId });
    assert.equal(credentials.status, 200); assert.equal((await call('/api/auth/native/v2/login', credentials.body.accessToken, { attemptId })).status, 200);
    const client = createClient(local.API_URL, key, { global: { headers: { Authorization: 'Bearer ' + credentials.body.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const session = await client.rpc('native_session_v2', { p_action: 'session' }); assert.equal(session.error, null);
    return { ...row, token: credentials.body.accessToken, client, actor: { ownerId: row.id, sessionId: session.data.sessionId, mobileEpoch: session.data.mobileEpoch } };
  }
  const owner = await user(), foreign = await user(), scope = 'profile-sensitive-data/1';
  const list = { action: 'list', scope, cursor: null, limit: 20 };
  assert.equal((await call(path, null, list)).status, 401);
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(sql("select has_function_privilege(" + literal(role) + ",'public.privacy_profile_data_v1(text,text,bigint)','execute');"), 'f');
  assert.equal((await call(path, owner.token, list)).status, 503);
  sql('grant execute on function public.privacy_profile_data_v1(text,text,bigint) to authenticated;');
  t.diagnostic('Only owned disposable fixture grants this default-denied RPC. No target grants/provider/Storage/fees/deploy/real user erase.');
  const saved = { p_display_name: 'Signed disposable owner', p_travel_pace: 'relaxed', p_locale: 'en', p_currency: 'USD', p_distance_unit: 'mile', p_temperature_unit: 'fahrenheit', p_default_departure_time: '10:30:00' };
  assert.equal((await owner.client.rpc('save_user_profile', saved)).error, null);
  const oldPace = { action: 'save', operationId: uuid(), expectedRevision: 0, travelPace: 'packed', noticeVersion: 'local-planning-cross-trip-v1' };
  const pace = await owner.client.rpc('native_travel_pace_v1', { p_input: oldPace }); assert.equal(pace.error, null);
  const trip = uuid();
  assert.equal((await call('/api/trips/native/v2', owner.token, { tripId: trip, title: 'Retained confirmed Trip' })).status, 201);
  const proposal = await call('/api/trips/native/v2/' + trip + '/proposal', owner.token, { patch: { expectedVersion: 0, operations: [{ kind: 'set_title', title: 'Confirmed retained Trip body' }] } });
  assert.equal(proposal.status, 201);
  const diff = await call('/api/trips/native/v2/' + trip + '/proposal?proposalId=' + proposal.body.proposalId, owner.token, undefined, 'GET'); assert.equal(diff.status, 200);
  assert.equal((await call('/api/trips/native/v2/' + trip + '/confirm', owner.token, { proposalId: proposal.body.proposalId, idempotencyKey: uuid(), digest: diff.body.proposal.digest })).status, 200);
  const mc = await owner.client.rpc('native_memory_command_v1', { p_input: { action: 'consentCreate', operationId: uuid() } }); assert.equal(mc.error, null);
  const memory = await owner.client.rpc('native_memory_command_v1', { p_input: { action: 'create', operationId: uuid(), memoryId: uuid(), receiptId: uuid(), consentId: mc.data.consentId, constraintKind: 'preference', summary: 'Independent explicit Memory retained', saveLongTerm: true } }); assert.equal(memory.error, null);
  const retained = () => sql(`select jsonb_build_object('accountDigest',(select encode(sha256(convert_to(to_jsonb(u)::text,'UTF8')),'hex') from auth.users u where id='${owner.id}'),
    'sessionDigest',(select encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') from auth.sessions s where id='${owner.actor.sessionId}'),
    'trip',(select to_jsonb(t) from public.trips t where id='${trip}'),
    'snapshots',(select jsonb_agg(to_jsonb(s) order by version) from public.trip_version_snapshots s where trip_id='${trip}'),
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.trip_events e where trip_id='${trip}'),
    'proposals',(select jsonb_agg(to_jsonb(p) order by id) from public.trip_proposals p where trip_id='${trip}'),
    'memory',(select jsonb_agg(to_jsonb(m) order by id) from public.memory_profiles m where owner_id='${owner.id}'),
    'memoryReceipts',(select jsonb_agg(to_jsonb(r) order by id) from public.memory_receipts r where owner_id='${owner.id}'));`);
  const before = retained();
  const inventory = await call(path, owner.token, list); assert.equal(inventory.status, 200); assert.ok(decodeProfileList(inventory.body.data, list, owner.actor, Date.now()));
  assert.equal(inventory.body.data.items.length, 1); assert.equal((await call(path, foreign.token, list)).body.data.items.length, 0);
  const selection = { scope, requestId: '00000000-0000-4000-8000-000000000001', profileId: owner.id, objectIds: [] }, previewCommand = { action: 'preview', ...selection };
  assert.notEqual((await call(path, foreign.token, previewCommand)).status, 200);
  const pg = await owner.client.rpc('privacy_profile_data_v1', { p_action: 'preview', p_input_bytes: JSON.stringify(previewCommand), p_expected_epoch: owner.actor.mobileEpoch });
  assert.equal(pg.error, null); assert.ok(decodeProfilePreview(pg.data, previewCommand, owner.actor, Date.now()));
  assert.equal(pg.data.eligible, true); assert.equal(pg.data.profile.displayName, saved.p_display_name);assert.deepEqual(pg.data.profile.paceRequest, oldPace);
  assert.equal(pg.data.summary.hasPaceUndo, true);
  const command = { action: 'erase', ...selection, sourceDigest: pg.data.sourceDigest, previewDigest: pg.data.previewDigest, confirmed: true }, bytes = '\n' + JSON.stringify(command) + ' ';
  assert.ok((await owner.client.rpc('privacy_profile_data_v1', { p_action: 'erase', p_input_bytes: bytes, p_expected_epoch: owner.actor.mobileEpoch + 1 })).error);
  const outer = { schemaVersion: 'data-coverage/1', catalogVersion: CATALOG_VERSION, actorId: owner.id, sessionId: owner.actor.sessionId, mobileEpoch: owner.actor.mobileEpoch,
    moduleId: 'profile', moduleVersion: moduleById('profile').version, operationId: selection.requestId, action: 'delete', phase: 'execute', confirmed: true, tripId: null, commandBytes: bytes };
  const raw = JSON.stringify(outer), erased = await call('/api/privacy/native/v1/coverage', owner.token, raw); assert.equal(erased.status, 200);
  assert.ok(matchesCoverageResult(erased.body, raw)); assert.equal(erased.body.state, 'scoped_complete'); assert.equal(erased.body.allUserDataCompleted, false);
  const receipt = erased.body.result.data; assert.ok(decodeProfileReceipt(receipt, command, owner.actor, profileDigest(bytes), Date.now()));
  const actual = JSON.parse(sql(`select to_jsonb(p) from public.user_profiles p where owner_id='${owner.id}';`));
  assert.equal(actual.display_name, null);assert.equal(actual.travel_pace, 'balanced');assert.equal(actual.locale, 'zh');assert.equal(actual.currency, 'CNY');
  assert.equal(actual.distance_unit, 'kilometre');assert.equal(actual.temperature_unit, 'celsius');assert.equal(actual.default_departure_time, '09:00:00');
  assert.equal(actual.pace_state, 'revoked');for (const field of ['pace_notice', 'pace_operation', 'pace_request', 'pace_undo']) assert.equal(actual[field], null);
  assert.equal(actual.pace_revision, pace.data.revision + 1);assert.equal(actual.profile_revision, pg.data.summary.profileRevision + 1);assert.deepEqual(actual.profile_saved_fields, []);
  assert.equal(retained(), before);
  const recover = { action: 'recover', ...selection, mutationBytes: bytes };
  const recovered = await call(path, owner.token, recover); assert.equal(recovered.status, 200); assert.deepEqual(recovered.body.data, receipt);
  assert.notEqual((await call(path, owner.token, { ...recover, mutationBytes: bytes.trim() })).status, 200);
  assert.ok((await owner.client.rpc('save_user_profile', saved)).error, 'old unbound full save cannot revive cleared fields');
  assert.ok((await owner.client.rpc('native_travel_pace_v1', { p_input: oldPace })).error, 'old exact native request cannot replay');
  assert.ok((await owner.client.rpc('native_travel_pace_v1', { p_input: { action: 'undo', operationId: uuid(), expectedRevision: actual.pace_revision } })).error, 'original Undo history is gone');
  const progressList = { action: 'list', scope: 'profile-delete-progress/1', cursor: null, limit: 20 };
  const progressInventory = await call(path, owner.token, progressList); assert.equal(progressInventory.status, 200); assert.ok(decodeProfileList(progressInventory.body.data, progressList, owner.actor, Date.now()));
  assert.ok(validOperationRow(progressInventory.body.data.items.find(x => x.requestId === selection.requestId), owner.id, Date.now()));
  const progress = { scope: progressList.scope, requestId: '80000000-0000-4000-8000-000000000001', profileId: null, objectIds: [selection.requestId] };
  const pp = await call(path, owner.token, { action: 'preview', ...progress }); assert.equal(pp.status, 200); assert.ok(decodeProfilePreview(pp.body.data, { action: 'preview', ...progress }, owner.actor, Date.now()));
  const pc = { action: 'erase', ...progress, sourceDigest: pp.body.data.sourceDigest, previewDigest: pp.body.data.previewDigest, confirmed: true }, pbytes = JSON.stringify(pc);
  const pr = await call(path, owner.token, pbytes); assert.equal(pr.status, 200); assert.ok(decodeProfileReceipt(pr.body.data, pc, owner.actor, profileDigest(pbytes), Date.now()));
  assert.equal(pr.body.data.decision.sourceProfile, 'not_modified');assert.equal(retained(), before);
  assert.deepEqual((await call(path, owner.token, recover)).body.data, receipt, 'progress exit retains original decision/fences');
  const final = await call(path, owner.token, progressList);assert.equal(final.status, 200);assert.equal(final.body.data.items.length, 2);assert.ok(decodeProfileList(final.body.data, progressList, owner.actor, Date.now()));
  assert.ok((await owner.client.rpc('save_user_profile_v2', { ...saved, p_expected_profile_revision: pg.data.summary.profileRevision })).error, 'old bound save is stale');
  const newEdit = await owner.client.rpc('save_user_profile_v2', { ...saved, p_display_name: 'Fresh user edit after clear', p_expected_profile_revision: actual.profile_revision });
  assert.equal(newEdit.error, null, 'new explicit edit from fresh revision remains legal');
  const reread = JSON.parse(sql(`select to_jsonb(p) from public.user_profiles p where owner_id='${owner.id}';`));
  assert.equal(reread.display_name, 'Fresh user edit after clear');assert.notEqual(reread.pace_state, 'explicit', 'Web fields do not grant pace purpose');
  const newConsent = await owner.client.rpc('native_travel_pace_v1', { p_input: { action: 'save', operationId: uuid(), expectedRevision: reread.pace_revision, travelPace: 'relaxed', noticeVersion: 'local-planning-cross-trip-v1' } });
  assert.equal(newConsent.error, null, 'fresh explicit consent save remains legal');assert.equal(newConsent.data.state, 'explicit');assert.equal(retained(), before);
  assert.deepEqual((await call(path, owner.token, recover)).body.data, receipt, 'original immutable receipt survives a legitimate newer edit without re-erasing it');
  const pending = { scope, requestId: uuid(), profileId: owner.id, objectIds: [] };
  const pendingPreview = await call(path, owner.token, { action: 'preview', ...pending });assert.equal(pendingPreview.status, 200);
  const pendingBytes = JSON.stringify({ action: 'erase', ...pending, sourceDigest: pendingPreview.body.data.sourceDigest, previewDigest: pendingPreview.body.data.previewDigest, confirmed: true });
  const unknown = await call(path, owner.token, { action: 'recover', ...pending, mutationBytes: pendingBytes });assert.equal(unknown.status, 200);
  assert.ok(decodeProfileUnknown(unknown.body.data, { action: 'recover', ...pending, mutationBytes: pendingBytes }, owner.actor, profileDigest(pendingBytes)));
  sql(`update auth.sessions set created_at=clock_timestamp()-interval '6 minutes' where id='${owner.actor.sessionId}';`);
  assert.equal((await call(path, owner.token, progressList)).status, 401, 'reauth precedes even retained inventory feedback');
  sql('revoke execute on function public.privacy_profile_data_v1(text,text,bigint) from authenticated;');
  assert.equal((await call(path, foreign.token, list)).status, 503);
  t.diagnostic('Actual signed RPC/TS decoder and registered owner HTTP field clearing/recovery; whole Trip and explicit Memory retained, new edits allowed. Mixed-copy/worker concurrency evidence belongs to sole SQL tests, target/device acceptance remains UNRUN.');
});
