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
import { conversationDigest } from '../../../../lib/server/privacy/conversation-data/contract.ts';
import { decodeConversationList, decodeConversationPreview, decodeConversationReceipt, decodeConversationUnknown, validOperationRow } from '../../../../lib/server/privacy/conversation-data/protocol.ts';
import { CATALOG_VERSION, moduleById } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';

test('signed Auth and actual PG payloads close selected conversation erasure/retention/exact recovery/own progress and authority denial', {
  skip: process.env.VP_CONVERSATION_DATA_HTTP !== 'true', timeout: 300000,
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
  const log = createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR, 'conversation-data-next.log'), { mode: 0o600 });
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(ports.apiPort)], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      VISEPANDA_NATIVE_LOCAL_SESSION: 'true', VISEPANDA_NATIVE_LOCAL_TRIP: 'true', VISEPANDA_NATIVE_LOCAL_SERVICE_KEY: local.SERVICE_ROLE_KEY,
      VISEPANDA_TRIP_PROTOCOL_V2: 'true', DATA_CONVERSATION_DATA_LOCAL: '1', DATA_COVERAGE_LOCAL: '1',
      VISEPANDA_NATIVE_STAGING: 'false', VISEPANDA_NATIVE_PRODUCTION: 'false', VERCEL_ENV: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  next.stdout.pipe(log); next.stderr.pipe(log); next.once('exit', () => log.end()); await waitForNativeAPI(ports.api, next);
  const path = '/api/privacy/native/v1/conversation-data';
  const call = async (route, token, body, method = 'POST') => {
    const response = await fetch(ports.api + route, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    return { status: response.status, body: response.status === 405 ? null : await response.json(), cache: response.headers.get('cache-control') };
  };
  async function user() {
    const auth = createClient(local.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = 'vpj58-conversation-' + uuid() + '@example.test', password = 'VPJ58-Disposable-' + uuid() + '!';
    const signup = await auth.auth.signUp({ email, password }); assert.equal(signup.error, null); assert.ok(signup.data.user && signup.data.session);
    const row = { id: signup.data.user.id }; users.push(row);
    const attemptId = uuid(), credentials = await call('/api/auth/native/v2/credentials', null, { email, password, attemptId });
    assert.equal(credentials.status, 200); assert.equal((await call('/api/auth/native/v2/login', credentials.body.accessToken, { attemptId })).status, 200);
    const client = createClient(local.API_URL, key, { global: { headers: { Authorization: 'Bearer ' + credentials.body.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const session = await client.rpc('native_session_v2', { p_action: 'session' }); assert.equal(session.error, null);
    return { ...row, token: credentials.body.accessToken, client, actor: { ownerId: row.id, sessionId: session.data.sessionId, mobileEpoch: session.data.mobileEpoch } };
  }
  const owner = await user(), foreign = await user(), scope = 'conversation-sensitive-data/1';
  const list = { action: 'list', scope, rootKind: 'conversation', cursor: null, limit: 20 };
  assert.equal((await call(path, null, list)).status, 401);
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(sql("select has_function_privilege(" + literal(role) + ",'public.privacy_conversation_data_v1(text,text,bigint)','execute');"), 'f');
  assert.equal((await call(path, owner.token, list)).status, 503);
  sql('grant execute on function public.privacy_conversation_data_v1(text,text,bigint) to authenticated;');
  t.diagnostic('Only the uniquely owned local fixture grants the new RPC. No target GRANT/provider/Storage/deploy/real user erase.');
  const policy = uuid(), consent = uuid(), conversation = 'ffffffff-ffff-4fff-8fff-ffffffffffff', message = uuid(), goal = uuid(), trip = uuid();
  sql(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
    values('${policy}','qwen','synthetic fixture','https://fixture.invalid/v1','local','local','local','fixture','fixture','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
    insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${owner.id}','${policy}','${consent}');`);
  const submit = { p_conversation_id: conversation, p_message_id: message, p_idempotency_key: uuid(), p_policy_id: policy, p_locale: 'en', p_text: 'Owned record-only private goal',
    p_relationship: 'goal_start', p_goal_id: goal, p_expected_goal_version: null, p_task_id: null, p_parent_message_id: null, p_turn_id: null };
  const created = await owner.client.rpc('submit_assistant_message_v1', submit); assert.equal(created.error, null);
  assert.equal((await call('/api/trips/native/v2', owner.token, { tripId: trip, title: 'Retained confirmed Trip' })).status, 201);
  const proposal = await call('/api/trips/native/v2/' + trip + '/proposal', owner.token, { patch: { expectedVersion: 0, operations: [{ kind: 'set_title', title: 'Confirmed retained Trip body' }] } });
  assert.equal(proposal.status, 201);
  const diff = await call('/api/trips/native/v2/' + trip + '/proposal?proposalId=' + proposal.body.proposalId, owner.token, undefined, 'GET'); assert.equal(diff.status, 200);
  assert.equal((await call('/api/trips/native/v2/' + trip + '/confirm', owner.token, { proposalId: proposal.body.proposalId, idempotencyKey: uuid(), digest: diff.body.proposal.digest })).status, 200);
  const linked = await owner.client.rpc('set_assistant_goal_trip_link_v1', { p_operation_id: uuid(), p_conversation_id: conversation, p_goal_id: goal, p_source_message_id: message,
    p_expected_goal_scope_version: 1, p_expected_link_version: 0, p_action: 'link', p_trip_id: trip, p_expected_trip_version: 1, p_confirmed: true }); assert.equal(linked.error, null);
  const mc = await owner.client.rpc('native_memory_command_v1', { p_input: { action: 'consentCreate', operationId: uuid() } }); assert.equal(mc.error, null);
  const memory = await owner.client.rpc('native_memory_command_v1', { p_input: { action: 'create', operationId: uuid(), memoryId: uuid(), receiptId: uuid(), consentId: mc.data.consentId, constraintKind: 'preference', summary: 'Original explicit Memory', saveLongTerm: true } }); assert.equal(memory.error, null);
  const retained = () => sql(`select jsonb_build_object('trip',(select to_jsonb(t) from public.trips t where id='${trip}'),
    'snapshots',(select jsonb_agg(to_jsonb(s) order by version) from public.trip_version_snapshots s where trip_id='${trip}'),
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.trip_events e where trip_id='${trip}'),
    'proposals',(select jsonb_agg(to_jsonb(p) order by id) from public.trip_proposals p where trip_id='${trip}'),
    'memory',(select jsonb_agg(to_jsonb(m) order by id) from public.memory_profiles m where owner_id='${owner.id}'),
    'memoryReceipts',(select jsonb_agg(to_jsonb(r) order by id) from public.memory_receipts r where owner_id='${owner.id}'));`);
  const before = retained();
  const inventory = await call(path, owner.token, list); assert.equal(inventory.status, 200); assert.ok(decodeConversationList(inventory.body.data, list, owner.actor, Date.now()));
  assert.ok(inventory.body.data.items.some(x => x.rootId === conversation)); assert.equal((await call(path, foreign.token, list)).body.data.items.length, 0);
  const selection = { scope, requestId: '00000000-0000-4000-8000-000000000001', rootKind: 'conversation', rootId: conversation, objectIds: [] }, previewCommand = { action: 'preview', ...selection };
  assert.notEqual((await call(path, foreign.token, previewCommand)).status, 200);
  // Real signed direct RPC is decoded by the actual TS PG consumer before HTTP erasure.
  const pg = await owner.client.rpc('privacy_conversation_data_v1', { p_action: 'preview', p_input_bytes: JSON.stringify(previewCommand), p_expected_epoch: owner.actor.mobileEpoch });
  assert.equal(pg.error, null); assert.ok(decodeConversationPreview(pg.data, previewCommand, owner.actor, Date.now()));
  assert.equal(pg.data.eligible, true); assert.deepEqual(pg.data.graph.taskIds, []); assert.deepEqual(pg.data.sourceAuthorities, [{ policyId: policy, consentId: consent }]);
  assert.deepEqual(pg.data.retainedReferences.tripIds, [trip]);
  const command = { action: 'erase', ...selection, sourceDigest: pg.data.sourceDigest, previewDigest: pg.data.previewDigest, confirmed: true }, bytes = '\n' + JSON.stringify(command) + ' ';
  const epochDenied = await owner.client.rpc('privacy_conversation_data_v1', { p_action: 'erase', p_input_bytes: bytes, p_expected_epoch: owner.actor.mobileEpoch + 1 }); assert.ok(epochDenied.error);
  const outer = { schemaVersion: 'data-coverage/1', catalogVersion: CATALOG_VERSION, actorId: owner.id, sessionId: owner.actor.sessionId, mobileEpoch: owner.actor.mobileEpoch,
    moduleId: 'conversations', moduleVersion: moduleById('conversations').version, operationId: selection.requestId, action: 'delete', phase: 'execute', confirmed: true, tripId: null, commandBytes: bytes };
  const raw = JSON.stringify(outer), erased = await call('/api/privacy/native/v1/coverage', owner.token, raw); assert.equal(erased.status, 200);
  assert.ok(matchesCoverageResult(erased.body, raw)); assert.equal(erased.body.state, 'scoped_complete'); assert.equal(erased.body.allUserDataCompleted, false);
  const receipt = erased.body.result.data; assert.ok(decodeConversationReceipt(receipt, command, owner.actor, conversationDigest(bytes), Date.now()));
  assert.equal(sql(`select count(*) from turn_private.assistant_conversations where id='${conversation}';`), '0'); assert.equal(retained(), before);
  assert.equal(receipt.decision.sourceTrip, 'not_modified'); assert.equal(receipt.decision.explicitMemory, 'not_modified'); assert.equal(receipt.decision.erasedCounts.goalLinks, 1);
  const recover = { action: 'recover', ...selection, mutationBytes: bytes };
  const recovered = await call(path, owner.token, recover); assert.equal(recovered.status, 200); assert.deepEqual(recovered.body.data, receipt);
  assert.notEqual((await call(path, owner.token, { ...recover, mutationBytes: bytes.trim() })).status, 200);
  assert.ok((await owner.client.rpc('submit_assistant_message_v1', { ...submit, p_message_id: uuid(), p_idempotency_key: uuid() })).error, 'old root cannot revive through original producer');
  const progressList = { action: 'list', scope: 'conversation-delete-progress/1', rootKind: null, cursor: null, limit: 20 };
  const progressInventory = await call(path, owner.token, progressList); assert.equal(progressInventory.status, 200); assert.ok(decodeConversationList(progressInventory.body.data, progressList, owner.actor, Date.now()));
  assert.ok(validOperationRow(progressInventory.body.data.items.find(x => x.requestId === selection.requestId), owner.id, Date.now()));
  const progress = { scope: progressList.scope, requestId: '80000000-0000-4000-8000-000000000001', rootKind: null, rootId: null, objectIds: [selection.requestId] };
  const pp = await call(path, owner.token, { action: 'preview', ...progress }); assert.equal(pp.status, 200); assert.ok(decodeConversationPreview(pp.body.data, { action: 'preview', ...progress }, owner.actor, Date.now()));
  assert.deepEqual(pp.body.data.sourceAuthorities, pg.data.sourceAuthorities);
  const pc = { action: 'erase', ...progress, sourceDigest: pp.body.data.sourceDigest, previewDigest: pp.body.data.previewDigest, confirmed: true }, pbytes = JSON.stringify(pc);
  const pr = await call(path, owner.token, pbytes); assert.equal(pr.status, 200); assert.ok(decodeConversationReceipt(pr.body.data, pc, owner.actor, conversationDigest(pbytes), Date.now()));
  assert.equal(pr.body.data.decision.sourceConversation, 'not_modified'); assert.equal(pr.body.data.decision.clearedPreviews, 0); assert.equal(retained(), before);
  const final = await call(path, owner.token, progressList);
  if (final.status !== 200) {
    const actual = await owner.client.rpc('privacy_conversation_data_v1', { p_action: 'list', p_input_bytes: JSON.stringify(progressList), p_expected_epoch: owner.actor.mobileEpoch });
    t.diagnostic(JSON.stringify({ phase: 'actual-progress-decoder', http: final.body.error?.code, rpcError: actual.error?.code,
      rows: actual.data?.items?.map(row => ({ valid: validOperationRow(row, owner.id, Date.now()), requestId: row.requestId, rootId: row.rootId, scope: row.scope, state: row.state })) }));
  }
  assert.equal(final.status, 200, final.body.error?.code); assert.equal(final.body.data.items.length, 2); assert.ok(decodeConversationList(final.body.data, progressList, owner.actor, Date.now()));
  // Read-only unknown ACK on a distinct real, uncommitted preview remains uncompleted.
  const thread = uuid(); sql(`insert into public.chat_threads(id,owner_id) values('${thread}','${owner.id}');`);
  const pending = { scope, requestId: uuid(), rootKind: 'thread', rootId: thread, objectIds: [] };
  const pendingPreview = await call(path, owner.token, { action: 'preview', ...pending }); assert.equal(pendingPreview.status, 200);
  const pendingBytes = JSON.stringify({ action: 'erase', ...pending, sourceDigest: pendingPreview.body.data.sourceDigest, previewDigest: pendingPreview.body.data.previewDigest, confirmed: true });
  const unknown = await call(path, owner.token, { action: 'recover', ...pending, mutationBytes: pendingBytes }); assert.equal(unknown.status, 200);
  assert.ok(decodeConversationUnknown(unknown.body.data, { action: 'recover', ...pending, mutationBytes: pendingBytes }, owner.actor, conversationDigest(pendingBytes)));
  assert.equal(sql(`select count(*) from public.chat_threads where id='${thread}';`), '1');
  sql(`update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id='${owner.id}' and policy_id='${policy}';`);
  assert.notEqual((await call(path, owner.token, recover)).status, 200, 'terminal recovery requalifies ORIGINAL revoked consent');
  sql(`update auth.sessions set created_at=clock_timestamp()-interval '6 minutes' where id='${owner.actor.sessionId}';`);
  assert.equal((await call(path, owner.token, progressList)).status, 401, 'reauth precedes even retained inventory feedback');
  sql('revoke execute on function public.privacy_conversation_data_v1(text,text,bigint) from authenticated;');
  assert.equal((await call(path, foreign.token, list)).status, 503); assert.equal(retained(), before);
  t.diagnostic('Actual signed direct RPC/TS PG decoder and registered owner HTTP erasure/recovery observed; confirmed Trip and explicit Memory whole rows unchanged. Target/backup/old-device ALL2 is separate.');
});
