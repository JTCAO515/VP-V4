import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { hrtime } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { identityLocalEnv } from '../../identity/local-supabase.mjs';
import { nativeHTTPEnvironmentPorts } from '../../turn/native-http-ports.mjs';
import { waitForNativeAPI } from '../../identity/native-api-readiness.mjs';
import { notificationDataDigest } from '../../../../lib/server/privacy/notification-data/contract.ts';
import { decodeNotificationDataPreview, decodeNotificationDataBundle, decodeNotificationDataReceipt, decodeNotificationDataList } from '../../../../lib/server/privacy/notification-data/protocol.ts';
import { createNotificationSendPermit } from '../../../../lib/server/privacy/notification-data/send-budget.ts';
import { decodeNotificationSendGrant } from '../../../../lib/server/privacy/notification-data/sender.ts';
import { CATALOG_VERSION, moduleById } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';

test('signed owner Auth -> selected complete notification data -> permanent fences/monotonic drain -> retained inventory/registered HTTP consumer; isolated fixture only', {
  skip: process.env.VP_NOTIFICATION_DATA_HTTP !== 'true', timeout: 300000,
}, async t => {
  const ports = nativeHTTPEnvironmentPorts(process.env), local = identityLocalEnv();
  assert.equal(local?.API_URL, ports.supabaseAPI); assert.match(local.DB_CONTAINER, /^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
  const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
  const sql = query => execFileSync('docker', ['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'], {
    input: "set statement_timeout='15s';" + query, encoding: 'utf8', stdio: ['pipe','pipe','pipe'],
  }).trim();
  const key = local.PUBLISHABLE_KEY || local.ANON_KEY, users = []; let next;
  t.after(async () => {
    if (next && next.exitCode === null) {
      const stopped = once(next, 'exit'); next.kill('SIGTERM'); await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 3000))]);
      if (next.exitCode === null) { next.kill('SIGKILL'); await stopped; }
    }
    for (const user of users) sql('delete from public.trip_events where owner_id='+literal(user.id)+';delete from public.trip_audit_events where owner_id='+literal(user.id)+';delete from auth.users where id='+literal(user.id)+';');
    if (users.length) assert.equal(sql('select count(*) from auth.users where id in('+users.map(user => literal(user.id)).join(',')+');'), '0');
  });
  const log = createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR, 'notification-data-next.log'), { mode: 0o600 });
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      VISEPANDA_NATIVE_LOCAL_SESSION: 'true', VISEPANDA_NATIVE_LOCAL_TRIP: 'true', VISEPANDA_NATIVE_LOCAL_SERVICE_KEY: local.SERVICE_ROLE_KEY,
      VISEPANDA_TRIP_PROTOCOL_V2: 'true', DATA_NOTIFICATION_DATA_LOCAL: '1', DATA_COVERAGE_LOCAL: '1',
      VISEPANDA_NATIVE_STAGING: 'false', VISEPANDA_NATIVE_PRODUCTION: 'false', VERCEL_ENV: '' }, stdio: ['ignore','pipe','pipe'],
  });
  next.stdout.pipe(log); next.stderr.pipe(log); next.once('exit', () => log.end()); await waitForNativeAPI(ports.api, next);
  const path = '/api/privacy/native/v1/notification-data';
  const call = async (route, token, body, method = 'POST') => {
    const response = await fetch(ports.api + route, { method, headers: { ...(token ? { Authorization: 'Bearer '+token } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  };
  async function user() {
    const auth = createClient(local.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = 'vpj58-notification-'+uuid()+'@example.test', password = 'VPJ58-Disposable-'+uuid()+'!';
    const signup = await auth.auth.signUp({ email, password }); assert.equal(signup.error, null); assert.ok(signup.data.user && signup.data.session);
    const row = { id: signup.data.user.id }; users.push(row);
    const attemptId = uuid(), credentials = await call('/api/auth/native/v2/credentials', null, { email, password, attemptId });
    assert.equal(credentials.status, 200); assert.equal((await call('/api/auth/native/v2/login', credentials.body.accessToken, { attemptId })).status, 200);
    const client = createClient(local.API_URL, key, { global: { headers: { Authorization: 'Bearer '+credentials.body.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const session = await client.rpc('native_session_v2', { p_action: 'session' }); assert.equal(session.error, null);
    return { ...row, token: credentials.body.accessToken, client, actor: { ownerId: row.id, sessionId: session.data.sessionId, mobileEpoch: session.data.mobileEpoch } };
  }
  const owner = await user(), foreign = await user(), tripId = uuid();
  assert.equal((await call('/api/trips/native/v2', owner.token, { tripId, title: 'Synthetic notification exit Trip' })).status, 201);
  // Source setup is explicitly disposable fixture data. No Trip/provider write
  // authority is inferred from direct fixture seed statements.
  sql('insert into public.trip_days(trip_id,owner_id,day_id,trip_date,time_zone) values('+literal(tripId)+','+literal(owner.id)+",'fixture_day',current_date+2,'Asia/Shanghai');");
  const tripScope = 'notification-trip-data/1', deviceScope = 'notification-device-data/1', progressScope = 'notification-exit-progress/1';
  const list = scope => ({ action: 'list', scope, cursor: null, limit: 20 });
  assert.equal((await call(path, null, list(tripScope))).status, 401);
  assert.equal(sql("select has_function_privilege('authenticated','public.privacy_notification_data_v1(text,text,bigint)','execute');"), 'f');
  assert.equal(sql("select has_function_privilege('authenticated','public.privacy_notification_data_drain_v1(text,jsonb)','execute');"), 'f');
  assert.equal((await call(path, owner.token, list(tripScope))).status, 503);
  sql('grant execute on function public.privacy_notification_data_v1(text,text,bigint),public.travel_reminders_v2(uuid,text,jsonb) to authenticated;'+
    'grant execute on function public.privacy_notification_data_drain_v1(text,jsonb),public.dispatch_travel_notification_v2(uuid,text,jsonb) to service_role;'+
    "update notification_exit_private.settings set enabled=true,drain_enabled=true;update notification_private.settings set enabled=true,environment='sandbox',topic='fixture.only';");
  t.diagnostic('Only uniquely owned disposable fixture RPC GRANT/settings; no target role, APNs, credential creation, provider, storage, deployment or real user data activated.');
  const notification = async (action, input) => {
    const response = await owner.client.rpc('travel_reminders_v2', { p_trip: tripId, p_action: action, p_input: input });
    assert.equal(response.error, null, response.error?.message); return response.data;
  };
  const deviceId = uuid(), deviceOperation = uuid(), syntheticToken = 'ab'.repeat(32);
  await notification('register_device', { operationId: deviceOperation, deviceId, token: syntheticToken, environment: 'sandbox', permission: 'authorized', timeZone: 'Asia/Shanghai' });
  const view = await notification('list', {}), source = view.nextSteps.find(step => step.source.kind === 'current_trip').source;
  const reminder = { operationId: uuid(), id: uuid(), baseVersion: view.tripVersion, purpose: 'user_set_travel', source, reason: 'Synthetic sensitive notification 🐼',
    dueAt: new Date(Date.now()+60000).toISOString(), expiresAt: new Date(Date.now()+3600000).toISOString(), timeZone: 'Asia/Shanghai', quietHours: { startMinute: 0, endMinute: 0 }, consent: true };
  await notification('schedule', reminder);
  sql('update notification_private.reminders set due_at=clock_timestamp()-interval \'1 second\' where id='+literal(reminder.id)+';update public.travel_reminders set due_at=clock_timestamp()-interval \'1 second\' where id='+literal(reminder.id)+';');
  const notificationId = sql('select id from notification_private.outbox where reminder_id='+literal(reminder.id)+';');
  const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const attemptId = uuid(), startedNs = hrtime.bigint();
  const attempt = await service.rpc('dispatch_travel_notification_v2', { p_notification: notificationId, p_action: 'begin_fenced', p_input: { attemptId } });
  assert.equal(attempt.error, null); assert.ok(decodeNotificationSendGrant(attempt.data, notificationId, attemptId));
  const permit = createNotificationSendPermit(startedNs, attempt.data.leaseBudgetMs, new AbortController().signal); assert.ok(permit);
  t.after(() => permit.close());
  const before = (await call('/api/trips/native/v2/'+tripId, owner.token, undefined, 'GET')).body;
  const exitRequests = [];
  async function preview(scope, ids) {
    const command = { action: 'preview', scope, requestId: uuid(), objectIds: [...ids].sort() }, result = await call(path, owner.token, command);
    assert.equal(result.status, 200); assert.ok(decodeNotificationDataPreview(result.body.data, command, owner.actor));
    return { command, value: result.body.data };
  }
  async function exportData(scope, ids) {
    const p = await preview(scope, ids), command = { ...p.command, action: 'export', previewDigest: p.value.previewDigest, confirmed: true }, raw = '\n'+JSON.stringify(command);
    const result = await call(path, owner.token, raw); assert.equal(result.status, 200);
    assert.ok(decodeNotificationDataBundle(result.body.data, command, owner.actor)); assert.equal(result.body.data.requestDigest, notificationDataDigest(raw));
    assert.match(result.cache, /private, no-store/); exitRequests.push(command.requestId); return result.body.data;
  }
  async function eraseData(scope, ids) {
    const p = await preview(scope, ids), command = { ...p.command, action: 'erase', previewDigest: p.value.previewDigest, confirmed: true }, bytes = '\t'+JSON.stringify(command);
    const started = hrtime.bigint(), result = await call(path, owner.token, bytes); assert.equal(result.status, 200);
    const receipt = decodeNotificationDataReceipt(result.body.data, command, owner.actor, notificationDataDigest(bytes)); assert.ok(receipt);
    if (scope !== progressScope) { assert.ok(hrtime.bigint()-started >= BigInt(5000000000)); assert.equal(receipt.effects.drainProof.waitMs, 5000); }
    const recovery = { ...p.command, action: 'recover', mutationBytes: bytes }, recovered = await call(path, owner.token, recovery);
    assert.equal(recovered.status, 200); assert.deepEqual(recovered.body, result.body);
    const absent = await call(path, foreign.token, { ...recovery, requestId: uuid(), mutationBytes: JSON.stringify({ ...command, requestId: uuid() }) });
    assert.equal(absent.status, 400, 'outer and embedded operation must agree');
    const foreignReceipt = await call(path, foreign.token, recovery); assert.equal(foreignReceipt.status, 200); assert.equal(foreignReceipt.body.data.kind, 'unknown');
    const absentId = uuid(), absentCommand = { ...command, requestId: absentId };
    const foreignAbsent = await call(path, foreign.token, { ...recovery, requestId: absentId, mutationBytes: JSON.stringify(absentCommand) });
    assert.equal(foreignAbsent.status, 200); assert.equal(foreignAbsent.body.data.kind, 'unknown');
    assert.equal(foreignReceipt.body.data.ownerId, foreign.id); assert.equal(foreignAbsent.body.data.ownerId, foreign.id);
    assert.notEqual((await call(path, owner.token, { ...recovery, mutationBytes: bytes.trim() })).status, 200, 'original digest cannot change on recovery');
    exitRequests.push(command.requestId); return receipt;
  }
  const discovered = await call(path, owner.token, list(tripScope)); assert.equal(discovered.status, 200);
  assert.ok(decodeNotificationDataList(discovered.body.data, list(tripScope), owner.actor, Date.now())); assert.ok(discovered.body.data.items.some(item => item.objectId === tripId));
  const full = await exportData(tripScope, [tripId]);
  assert.equal(full.items[0].reminders[0].reason, reminder.reason); assert.equal(full.items[0].outbox.length, 1); assert.equal(full.items[0].attempts.length, 1);
  const device = await exportData(deviceScope, [deviceId]); assert.equal(device.items[0].device.token, syntheticToken);
  const p = await preview(tripScope, [tripId]), exported = { ...p.command, action: 'export', previewDigest: p.value.previewDigest, confirmed: true };
  const module = moduleById('notifications'), input = { schemaVersion: 'data-coverage/1', catalogVersion: CATALOG_VERSION, actorId: owner.id,
    sessionId: owner.actor.sessionId, mobileEpoch: owner.actor.mobileEpoch, moduleId: module.id, moduleVersion: module.version,
    operationId: exported.requestId, action: 'export', phase: 'execute', confirmed: true, tripId: null, commandBytes: '\n'+JSON.stringify(exported) };
  const covered = await call('/api/privacy/native/v1/coverage', owner.token, input); assert.equal(covered.status, 200);
  assert.ok(matchesCoverageResult(covered.body, JSON.stringify(input))); assert.equal(covered.body.state, 'scoped_complete');
  const catalog = await call('/api/privacy/native/v1/coverage', owner.token, undefined, 'GET'); assert.equal(catalog.status, 200);
  assert.equal(catalog.body.modules.length, 34); assert.equal(catalog.body.allUserDataCompleted, false);
  const erased = await eraseData(tripScope, [tripId]); assert.equal(erased.effects.reminders, 1); assert.equal(erased.effects.attempts, 1);
  assert.equal(permit.canWrite(), false, 'pre-fence claimed sender cannot initiate a new request after successful drain receipt');
  assert.equal(sql('select count(*) from notification_private.reminders where owner_id='+literal(owner.id)+';'), '0');
  assert.equal(sql('select count(*) from public.travel_reminders where owner_id='+literal(owner.id)+';'), '0');
  const replay = await owner.client.rpc('travel_reminders_v2', { p_trip: tripId, p_action: 'schedule', p_input: reminder }); assert.ok(replay.error);
  const oldAttempt = await service.rpc('dispatch_travel_notification_v2', { p_notification: notificationId, p_action: 'begin_fenced', p_input: { attemptId } });
  assert.equal(oldAttempt.error, null); assert.equal(oldAttempt.data.kind, 'blocked');
  const retained = await exportData(tripScope, [tripId]); assert.ok(retained.items[0].fences.some(fence => fence.kind === 'outbox_parent'));
  await eraseData(deviceScope, [deviceId]); assert.equal(sql('select count(*) from notification_private.devices where owner_id='+literal(owner.id)+';'), '0');
  const deviceReplay = await owner.client.rpc('travel_reminders_v2', { p_trip: tripId, p_action: 'register_device', p_input: { operationId: deviceOperation,
    deviceId, token: syntheticToken, environment: 'sandbox', permission: 'authorized', timeZone: 'Asia/Shanghai' } }); assert.ok(deviceReplay.error);
  const progress = await exportData(progressScope, exitRequests.slice(0, 4)); assert.equal(progress.items.length, 4);
  assert.ok(progress.items.some(row => row.state === 'erased' && row.receipt.effects.drainProof.waitMs === 5000));
  const progressReceipt = await eraseData(progressScope, exitRequests.slice(0, 4)); assert.equal(progressReceipt.effects.drainProof, null);
  assert.equal(sql('select count(*) from notification_exit_private.fences where owner_id='+literal(owner.id)+';') !== '0', true);
  const after = (await call('/api/trips/native/v2/'+tripId, owner.token, undefined, 'GET')).body;
  assert.equal(after.trip.headVersion, before.trip.headVersion); assert.deepEqual(after.content, before.content, 'notification erasure cannot mutate original Trip/business content');
  t.diagnostic('All scoped receipts/retained inventories consumed from actual signed GoTrue -> Next -> owner/service SQL; explicit synthetic source/device only, no APNs send and no target activation.');
});
