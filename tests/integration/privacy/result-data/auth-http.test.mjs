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
import { resultDigest } from '../../../../lib/server/privacy/result-data/contract.ts';
import { decodeResultList, decodeResultPreview, decodeResultReceipt, decodeResultUnknown, validOperationRow } from '../../../../lib/server/privacy/result-data/protocol.ts';
import { CATALOG_VERSION, moduleById } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';

test('signed Auth and actual PG close one complete artifact erasure, source preservation, exact recovery, finite own inventory and authority denial', {
  skip: process.env.VP_RESULT_DATA_HTTP !== 'true', timeout: 300000,
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
    for (const user of users) sql('delete from public.model_budget_attempts where scope_id in(select id from public.model_budget_scopes where owner_id=' + literal(user.id) + ');delete from public.model_budget_provider_limits where scope_id in(select id from public.model_budget_scopes where owner_id=' + literal(user.id) + ');delete from public.model_budget_scopes where owner_id=' + literal(user.id) + ';delete from public.trip_events where owner_id=' + literal(user.id) + ';delete from public.trip_audit_events where owner_id=' + literal(user.id) + ';delete from auth.users where id=' + literal(user.id) + ';');
    if (users.length) assert.equal(sql('select count(*) from auth.users where id in(' + users.map(u => literal(u.id)).join(',') + ');'), '0');
  });
  const log = createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR, 'result-data-next.log'), { mode: 0o600 });
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(ports.apiPort)], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      VISEPANDA_NATIVE_LOCAL_SESSION: 'true', VISEPANDA_NATIVE_LOCAL_TRIP: 'true', VISEPANDA_NATIVE_LOCAL_SERVICE_KEY: local.SERVICE_ROLE_KEY,
      VISEPANDA_TRIP_PROTOCOL_V2: 'true', DATA_RESULT_DATA_LOCAL: '1', DATA_COVERAGE_LOCAL: '1',
      VISEPANDA_NATIVE_STAGING: 'false', VISEPANDA_NATIVE_PRODUCTION: 'false', VERCEL_ENV: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  next.stdout.pipe(log); next.stderr.pipe(log); next.once('exit', () => log.end()); await waitForNativeAPI(ports.api, next);
  const path = '/api/privacy/native/v1/result-data';
  const call = async (route, token, body, method = 'POST') => {
    const response = await fetch(ports.api + route, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    return { status: response.status, body: response.status === 405 ? null : await response.json(), cache: response.headers.get('cache-control') };
  };
  async function user() {
    const auth = createClient(local.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = 'vpj58-result-' + uuid() + '@example.test', password = 'VPJ58-Disposable-' + uuid() + '!';
    const signup = await auth.auth.signUp({ email, password }); assert.equal(signup.error, null); assert.ok(signup.data.user && signup.data.session);
    const row = { id: signup.data.user.id }; users.push(row);
    const attemptId = uuid(), credentials = await call('/api/auth/native/v2/credentials', null, { email, password, attemptId });
    assert.equal(credentials.status, 200); assert.equal((await call('/api/auth/native/v2/login', credentials.body.accessToken, { attemptId })).status, 200);
    const client = createClient(local.API_URL, key, { global: { headers: { Authorization: 'Bearer ' + credentials.body.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const session = await client.rpc('native_session_v2', { p_action: 'session' }); assert.equal(session.error, null);
    return { ...row, token: credentials.body.accessToken, client, actor: { ownerId: row.id, sessionId: session.data.sessionId, mobileEpoch: session.data.mobileEpoch } };
  }
  const owner = await user(), foreign = await user(), scope = 'result-sensitive-data/1';
  const list = { action: 'list', scope, rootKind: 'artifact', cursor: null, limit: 20 };
  assert.equal((await call(path, null, list)).status, 401);
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(sql("select has_function_privilege(" + literal(role) + ",'public.privacy_result_data_v1(text,text,bigint)','execute');"), 'f');
  assert.equal((await call(path, owner.token, list)).status, 503);
  sql('grant execute on function public.privacy_result_data_v1(text,text,bigint) to authenticated;');
  t.after(() => sql('revoke execute on function public.privacy_result_data_v1(text,text,bigint) from authenticated;'));
  t.diagnostic('Only uniquely owned disposable fixture grants the new RPC; no target grant/provider/Storage/deploy/real user erase.');
  const policy = uuid(), conversation = uuid(), message = uuid(), goal = uuid(), trip = uuid(), task = uuid(), turn = uuid(), thread = uuid(), linkedMessage = uuid();
  const artifact = uuid(), sibling = uuid(), publicationKeys = [uuid(), uuid()], memoryId = uuid(), budgetScope = uuid(), budgetAttempt = uuid();
  sql(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
    values('${policy}','qwen','synthetic fixture','https://fixture.invalid/v1','local','local','local','fixture','fixture','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');`);
  const rpc = async (name, input) => { const response = await owner.client.rpc(name, input); assert.equal(response.error, null, name); return response.data; };
  await rpc('accept_text_policy', { p_policy_id: policy, p_notice_hash: 'a'.repeat(64) });
  await rpc('submit_assistant_message_v1', { p_conversation_id: conversation, p_message_id: message, p_idempotency_key: uuid(), p_policy_id: policy, p_locale: 'en', p_text: 'Owned source goal, must remain',
    p_relationship: 'goal_start', p_goal_id: goal, p_expected_goal_version: null, p_task_id: null, p_parent_message_id: null, p_turn_id: null });
  assert.equal((await call('/api/trips/native/v2', owner.token, { tripId: trip, title: 'Retained confirmed Trip' })).status, 201);
  const proposal = await call('/api/trips/native/v2/' + trip + '/proposal', owner.token, { patch: { expectedVersion: 0, operations: [{ kind: 'set_title', title: 'Confirmed retained Trip body' }] } });
  assert.equal(proposal.status, 201);
  const diff = await call('/api/trips/native/v2/' + trip + '/proposal?proposalId=' + proposal.body.proposalId, owner.token, undefined, 'GET'); assert.equal(diff.status, 200);
  assert.equal((await call('/api/trips/native/v2/' + trip + '/confirm', owner.token, { proposalId: proposal.body.proposalId, idempotencyKey: uuid(), digest: diff.body.proposal.digest })).status, 200);
  await rpc('set_assistant_goal_trip_link_v1', { p_operation_id: uuid(), p_conversation_id: conversation, p_goal_id: goal, p_source_message_id: message,
    p_expected_goal_scope_version: 1, p_expected_link_version: 0, p_action: 'link', p_trip_id: trip, p_expected_trip_version: 1, p_confirmed: true });
  const mc = await rpc('native_memory_command_v1', { p_input: { action: 'consentCreate', operationId: uuid() } });
  await rpc('native_memory_command_v1', { p_input: { action: 'create', operationId: uuid(), memoryId, receiptId: uuid(), consentId: mc.consentId, constraintKind: 'preference', summary: 'Original explicit Memory', saveLongTerm: true } });
  await rpc('submit_service_task_turn', { p_thread_id: thread, p_turn_id: turn, p_idempotency_key: uuid(), p_policy_id: policy, p_locale: 'en', p_text: 'Original source input, must remain',
    p_task_id: task, p_scope_version: 1, p_relationship: 'new_goal', p_parent_turn_id: null });
  await rpc('submit_assistant_message_v1', { p_conversation_id: conversation, p_message_id: linkedMessage, p_idempotency_key: uuid(), p_policy_id: policy, p_locale: 'en', p_text: 'Original linked source, must remain',
    p_relationship: 'follow_up', p_goal_id: goal, p_expected_goal_version: 2, p_task_id: task, p_parent_message_id: message, p_turn_id: null });
  // Controlled synthetic source completion; no provider or worker invocation.
  sql(`update turn_private.text_content set output_kind='answered',output_text='Synthetic completed source answer, must remain' where turn_id='${turn}';select turn_private.terminal('${turn}','completed',1);`);
  const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const content = { schemaVersion: 'comparison/1', title: 'Owned synthetic result', summary: 'Private synthetic result body', options: [{ id: 'a', title: 'A', tradeoff: 'Unknown cost' }, { id: 'b', title: 'B', tradeoff: 'Unknown availability' }], actions: [] };
  const publish = async (id, expected, key, value = content) => { const response = await service.rpc('publish_comparison_result_v1', { p_owner_id: owner.id, p_artifact_id: id,
    p_expected_revision: expected, p_idempotency_key: key, p_task_id: task, p_goal_id: goal, p_input_message_id: linkedMessage, p_trip_id: trip, p_trip_version: 1,
    p_goal_version: 2, p_memory_basis: [{ id: memoryId, revision: 1 }], p_content: value }); assert.equal(response.error, null); return response.data; };
  assert.equal((await publish(artifact, 0, publicationKeys[0])).revision, 1);
  assert.equal((await publish(artifact, 1, publicationKeys[1], { ...content, summary: 'Private second revision' })).revision, 2);
  assert.equal((await publish(sibling, 0, uuid(), { ...content, title: 'Unselected sibling result' })).revision, 1);
  const withdrawn = await service.rpc('withdraw_result_artifact_v1', { p_owner_id: owner.id, p_artifact_id: artifact, p_expected_revision: 2 }); assert.equal(withdrawn.error, null);
  // Synthetic settled financial rows are preserved in full; no real charge/provider request.
  sql(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at)
    values('${budgetScope}','${owner.id}','CNY',1000,100,4,2,true,now()+interval '1 day');
    insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled)
    values('${budgetScope}','qwen','synthetic-only','fixture',1000,100,true);
    insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,actual_micros,status)
    values('${budgetScope}','${budgetAttempt}','${task}','qwen','synthetic-only','fixture',10,4,'settled');`);
  const retainedTables = ['turn_private.assistant_conversations', 'turn_private.assistant_goals', 'turn_private.assistant_messages', 'turn_private.assistant_message_source_receipts',
    'turn_private.assistant_travel_intakes', 'turn_private.assistant_goal_trip_links', 'turn_private.assistant_goal_trip_receipts', 'turn_private.service_tasks', 'turn_private.service_task_turns',
    'turn_private.service_task_capacity', 'turn_private.text_content', 'turn_private.work', 'public.turns', 'public.chat_threads', 'public.trips', 'public.trip_events', 'public.trip_proposals',
    'public.trip_version_snapshots', 'public.memory_profiles', 'public.memory_receipts', 'public.memory_consents', 'public.model_budget_scopes'];
  const retained = () => JSON.stringify(retainedTables.map(table => [table, sql(`select coalesce(jsonb_agg(to_jsonb(actual) order by to_jsonb(actual)::text),'[]') from ${table} actual where owner_id='${owner.id}';`)]))
    + sql(`select jsonb_build_object('budgetAttempts',(select jsonb_agg(to_jsonb(b) order by attempt_id) from public.model_budget_attempts b where scope_id='${budgetScope}'),'providerLimits',(select jsonb_agg(to_jsonb(l) order by provider) from public.model_budget_provider_limits l where scope_id='${budgetScope}'),'artifact',(select to_jsonb(a) from turn_private.result_artifacts a where id='${sibling}'),
      'revisions',(select jsonb_agg(to_jsonb(r) order by revision) from turn_private.result_revisions r where artifact_id='${sibling}'),
      'events',(select jsonb_agg(to_jsonb(e) order by id) from turn_private.result_events e where artifact_id='${sibling}'));`);
  const before = retained();
  const inventory = await call(path, owner.token, list);
  if (inventory.status !== 200) {
    const actual = await owner.client.rpc('privacy_result_data_v1', { p_action: 'list', p_input_bytes: JSON.stringify(list), p_expected_epoch: owner.actor.mobileEpoch });
    t.diagnostic(JSON.stringify({ phase: 'actual-owner-list', httpCode: inventory.body.error?.code, rpcCode: actual.error?.code, rpcClosedCode: /^RESULT_[A-Z_]+$/.test(actual.error?.message ?? '') ? actual.error.message : 'UNMAPPED',
      sourceAudit: JSON.parse(sql(`select jsonb_build_object('schemaSupported',result_data_private.schema_supported_v1(),'conflicts',result_data_private.source_v1('${owner.id}','${artifact}')->'conflicts',
        'schemaTableCounts',(select jsonb_object_agg(nspname,n) from(select n.nspname,count(*) n from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','auth','extensions') group by n.nspname) metadata));`)) }));
  }
  assert.equal(inventory.status, 200); assert.ok(decodeResultList(inventory.body.data, list, owner.actor, Date.now()));
  const selected = inventory.body.data.items.find(x => x.rootId === artifact); assert.ok(selected); assert.equal(selected.lifecycle, 'withdrawn'); assert.equal(selected.revisionCount, 2); assert.equal(selected.eventCount, 3);
  assert.equal((await call(path, foreign.token, list)).body.data.items.length, 0);
  const selection = { scope, requestId: '00000000-0000-4000-8000-000000000001', rootKind: 'artifact', rootId: artifact, objectIds: [] }, previewCommand = { action: 'preview', ...selection };
  assert.notEqual((await call(path, foreign.token, previewCommand)).status, 200);
  const pg = await owner.client.rpc('privacy_result_data_v1', { p_action: 'preview', p_input_bytes: JSON.stringify(previewCommand), p_expected_epoch: owner.actor.mobileEpoch });
  assert.equal(pg.error, null); assert.ok(decodeResultPreview(pg.data, previewCommand, owner.actor, Date.now())); assert.equal(pg.data.eligible, true);
  assert.deepEqual(pg.data.graph.artifactIds, [artifact]); assert.deepEqual(pg.data.graph.revisions, [1, 2]); assert.equal(pg.data.graph.eventIds.length, 3);
  assert.deepEqual(pg.data.graph.publicationKeys, [...publicationKeys].sort()); assert.deepEqual(pg.data.retainedReferences.tripIds, [trip]); assert.deepEqual(pg.data.retainedReferences.memoryIds, [memoryId]);
  // A real distinct preview without erasure recovers unknown; its transient graph is later explicitly selected for cleanup.
  const pending = { ...selection, requestId: '00000000-0000-4000-8000-000000000002' }, pendingCommand = { action: 'preview', ...pending };
  const pendingPreview = await call(path, owner.token, pendingCommand); assert.equal(pendingPreview.status, 200);
  const pendingBytes = JSON.stringify({ action: 'erase', ...pending, sourceDigest: pendingPreview.body.data.sourceDigest, previewDigest: pendingPreview.body.data.previewDigest, confirmed: true });
  const unknown = await call(path, owner.token, { action: 'recover', ...pending, mutationBytes: pendingBytes }); assert.equal(unknown.status, 200);
  assert.ok(decodeResultUnknown(unknown.body.data, { action: 'recover', ...pending, mutationBytes: pendingBytes }, owner.actor, resultDigest(pendingBytes)));
  const command = { action: 'erase', ...selection, sourceDigest: pg.data.sourceDigest, previewDigest: pg.data.previewDigest, confirmed: true }, bytes = '\n' + JSON.stringify(command) + ' ';
  assert.ok((await owner.client.rpc('privacy_result_data_v1', { p_action: 'erase', p_input_bytes: bytes, p_expected_epoch: owner.actor.mobileEpoch + 1 })).error);
  const outer = { schemaVersion: 'data-coverage/1', catalogVersion: CATALOG_VERSION, actorId: owner.id, sessionId: owner.actor.sessionId, mobileEpoch: owner.actor.mobileEpoch,
    moduleId: 'results', moduleVersion: moduleById('results').version, operationId: selection.requestId, action: 'delete', phase: 'execute', confirmed: true, tripId: null, commandBytes: bytes };
  const raw = JSON.stringify(outer), erased = await call('/api/privacy/native/v1/coverage', owner.token, raw); assert.equal(erased.status, 200);
  assert.ok(matchesCoverageResult(erased.body, raw)); assert.equal(erased.body.state, 'scoped_complete'); assert.equal(erased.body.allUserDataCompleted, false);
  const receipt = erased.body.result.data; assert.ok(decodeResultReceipt(receipt, command, owner.actor, resultDigest(bytes), Date.now()));
  assert.equal(sql(`select count(*) from turn_private.result_artifacts where id='${artifact}';`), '0');
  assert.equal(sql(`select count(*) from turn_private.result_revisions where artifact_id='${artifact}';`), '0');
  assert.equal(sql(`select count(*) from turn_private.result_events where artifact_id='${artifact}';`), '0'); assert.equal(retained(), before);
  const recover = { action: 'recover', ...selection, mutationBytes: bytes };
  const recovered = await call(path, owner.token, recover); assert.equal(recovered.status, 200); assert.deepEqual(recovered.body.data, receipt);
  assert.notEqual((await call(path, owner.token, { ...recover, mutationBytes: bytes.trim() })).status, 200);
  const revived = await service.rpc('publish_comparison_result_v1', { p_owner_id: owner.id, p_artifact_id: artifact, p_expected_revision: 0, p_idempotency_key: publicationKeys[0],
    p_task_id: task, p_goal_id: goal, p_input_message_id: linkedMessage, p_trip_id: trip, p_trip_version: 1, p_goal_version: 2, p_memory_basis: [{ id: memoryId, revision: 1 }], p_content: content });
  assert.ok(revived.error, 'original publication cannot revive erased identity'); assert.equal(retained(), before);
  const progressList = { action: 'list', scope: 'result-delete-progress/1', rootKind: null, cursor: null, limit: 20 };
  const progressInventory = await call(path, owner.token, progressList); assert.equal(progressInventory.status, 200); assert.ok(decodeResultList(progressInventory.body.data, progressList, owner.actor, Date.now()));
  assert.ok(validOperationRow(progressInventory.body.data.items.find(x => x.requestId === selection.requestId), owner.id, Date.now()));
  const progress = { scope: progressList.scope, requestId: '80000000-0000-4000-8000-000000000001', rootKind: null, rootId: null, objectIds: [pending.requestId] };
  const pp = await call(path, owner.token, { action: 'preview', ...progress }); assert.equal(pp.status, 200); assert.ok(decodeResultPreview(pp.body.data, { action: 'preview', ...progress }, owner.actor, Date.now()));
  const pc = { action: 'erase', ...progress, sourceDigest: pp.body.data.sourceDigest, previewDigest: pp.body.data.previewDigest, confirmed: true }, pbytes = JSON.stringify(pc);
  const pr = await call(path, owner.token, pbytes); assert.equal(pr.status, 200); assert.ok(decodeResultReceipt(pr.body.data, pc, owner.actor, resultDigest(pbytes), Date.now()));
  assert.equal(pr.body.data.decision.sourceResult, 'not_modified'); assert.equal(pr.body.data.decision.clearedPreviews, 1); assert.equal(retained(), before);
  const final = await call(path, owner.token, progressList); assert.equal(final.status, 200); assert.ok(decodeResultList(final.body.data, progressList, owner.actor, Date.now()));
  assert.equal(final.body.data.items.length, 3); assert.equal(final.body.data.items.find(x => x.requestId === pending.requestId).previewErased, true);
  sql(`update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id='${owner.id}' and policy_id='${policy}';`);
  assert.notEqual((await call(path, owner.token, recover)).status, 200, 'terminal ACK requalifies original revoked consent');
  sql(`update auth.sessions set created_at=clock_timestamp()-interval '6 minutes' where id='${owner.actor.sessionId}';`);
  assert.equal((await call(path, owner.token, progressList)).status, 401, 'reauth precedes permanent inventory feedback');
  sql('revoke execute on function public.privacy_result_data_v1(text,text,bigint) from authenticated;');
  assert.equal((await call(path, foreign.token, list)).status, 503); assert.equal(retained(), before);
  t.diagnostic('Actual signed RPC -> TS PG decoder -> registered HTTP bytes/receipt/progress; original Conversation/Task/Turn/Trip/Memory and sibling whole rows remain. Synthetic source output only, no provider/device/backup claim.');
});
