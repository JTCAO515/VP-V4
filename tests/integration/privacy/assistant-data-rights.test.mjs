// Disposable, network-disabled PostgreSQL; identities and answers are synthetic.
// SQL claims exercise database contracts, not GoTrue/HTTP or an account executor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';

const enabled = process.env.VP_PRIVACY_DB_TEST === '1';
const container = 'vpj78-data-rights-' + uuid().slice(0, 8);
let created = false;
const db = async text => {
  const result = await sql(container, text);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
};
const actorSQL = (a, text) => `set request.jwt.claim.sub='${a.owner}'; set request.jwt.claims='{"session_id":"${a.session}","role":"authenticated"}'; set request.jwt.claim.role='authenticated'; set role authenticated; ${text}`;
const serviceSQL = text => `set role service_role; set request.jwt.claim.role='service_role'; ${text}`;
const denied = async (text, pattern) => {
  const result = await sql(container, text);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, pattern);
};

before(async () => {
  if (!enabled) return;
  const result = await command('docker', ['run', '--pull=never', '--rm', '-d', '--network', 'none', '--name', container,
    '--user', 'postgres', '--entrypoint', '/bin/sh', 'public.ecr.aws/supabase/postgres:17.6.1.159', '-c',
    'umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(result.code, 0, result.stderr);
  created = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if ((await command('docker', ['exec', container, 'pg_isready', '-h', '/tmp/vpj59-socket', '-U', 'postgres'])).code === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready);
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql', 'utf8'));
  await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$; create schema extensions; create extension pgcrypto with schema extensions;");
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    const migration = readFileSync('supabase/migrations/' + file, 'utf8');
    if (file === '20261002010000_vpj78_conversation_export.sql') {
      await db('begin;' + migration + 'rollback;');
      assert.equal(await db("select to_regprocedure('public.assistant_conversation_export_owner_v1(uuid,text,uuid,integer)') is null;"), 't');
    }
    await db('begin;' + migration + 'commit;');
  }
});
after(async () => { if (created) assert.equal((await command('docker', ['rm', '-f', container])).code, 0); });

async function fixture() {
  const a = Object.fromEntries(['owner', 'session', 'policy', 'conversation', 'goal', 'message', 'trip', 'task', 'thread', 'turn', 'followup', 'artifact', 'operation'].map(k => [k, uuid()]));
  await db(`insert into auth.users(id) values('${a.owner}');
    insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');
    insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
    insert into public.trips(id,owner_id,title) values('${a.trip}','${a.owner}','Synthetic Trip');
    insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
    values('${a.policy}','qwen','synthetic test','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','test','test','${'a'.repeat(64)}','合成告知','Synthetic notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
    insert into turn_private.text_consents(owner_id,policy_id) values('${a.owner}','${a.policy}');`);
  const user = text => db(actorSQL(a, text));
  await user(`select public.submit_assistant_message_v1('${a.conversation}','${a.message}','${uuid()}','${a.policy}','en','Synthetic journey goal','goal_start','${a.goal}',null,null,null,null);`);
  await user(`select public.set_assistant_goal_trip_link_v1('${a.operation}','${a.conversation}','${a.goal}','${a.message}',1,0,'link','${a.trip}',0,true);`);
  await user(`select public.submit_service_task_turn('${a.thread}','${a.turn}','${uuid()}','${a.policy}','en','Synthetic comparison','${a.task}',1,'new_goal',null);`);
  await user(`select public.submit_assistant_message_v1('${a.conversation}','${a.followup}','${uuid()}','${a.policy}','en','Synthetic follow up','follow_up','${a.goal}',2,'${a.task}','${a.message}',null);`);
  // Synthetic terminal answer: no model, dispatch or charge is claimed.
  await db(`update public.turns set status='completed' where id='${a.turn}'; update turn_private.text_content set output_kind='answered',output_text='Synthetic answer' where turn_id='${a.turn}';`);
  const content = JSON.stringify({ schemaVersion: 'comparison/1', title: 'Synthetic result', summary: 'Synthetic summary', options: [{ id: 'a', title: 'A', tradeoff: 'A tradeoff' }, { id: 'b', title: 'B', tradeoff: 'B tradeoff' }], actions: [] });
  const published = JSON.parse(await db(serviceSQL(`select public.publish_comparison_result_v1('${a.owner}','${a.artifact}',0,'${uuid()}','${a.task}','${a.goal}','${a.followup}',null,null,2,'[]','${content}');`)));
  assert.equal(published.kind, 'published');
  return a;
}

test('existing account cascade removes assistant associations/results and rejects late reads/writes', { skip: !enabled, timeout: 120000 }, async () => {
  const a = await fixture(), b = await fixture();
  assert.equal(JSON.parse(await db(actorSQL(a, `select public.read_assistant_conversation_v1('${a.policy}','${a.conversation}');`))).conversationId, a.conversation);
  assert.equal(JSON.parse(await db(actorSQL(a, `select public.read_result_artifacts_v1('${a.artifact}',1);`))).kind, 'result_artifact');
  const before = await db(actorSQL(b, `select public.read_assistant_conversation_v1('${b.policy}','${b.conversation}');`));
  await db(`delete from auth.users where id='${a.owner}';`);
  for (const table of ['assistant_conversations', 'assistant_goals', 'assistant_messages', 'assistant_goal_trip_links', 'assistant_goal_trip_receipts', 'result_artifacts', 'result_revisions', 'result_events']) {
    assert.equal(await db(`select count(*) from turn_private.${table} where owner_id='${a.owner}';`), '0', table);
    assert.notEqual(await db(`select count(*) from turn_private.${table} where owner_id='${b.owner}';`), '0', table + ' other owner retained');
  }
  assert.equal(await db(actorSQL(b, `select public.read_assistant_conversation_v1('${b.policy}','${b.conversation}');`)), before);
  for (const text of [
    `select public.read_assistant_conversation_v1('${a.policy}','${a.conversation}');`,
    `select public.read_assistant_goal_trip_link_v1('${a.goal}');`,
    `select public.read_result_artifacts_v1('${a.artifact}',1);`,
    `select public.submit_assistant_message_v1('${a.conversation}','${uuid()}','${uuid()}','${a.policy}','en','Late replay','goal_start','${uuid()}',null,null,null,null);`
  ]) await denied(actorSQL(a, text), /UNAUTHENTICATED/);
  assert.equal(await db(`select count(*) from turn_private.text_content where owner_id='${a.owner}' and hidden_at is null;`), '0', 'existing retained text is hidden, not newly erased');
});

test('paginated service-only export reconstructs complete owned histories and Trip-link manifests', { skip: !enabled, timeout: 120000 }, async () => {
  const a = await fixture(), b = await fixture();
  const second = uuid(), secondGoal = uuid(), secondMessage = uuid(), question = uuid(), questionTurn = uuid();
  await db(actorSQL(a, `select public.submit_assistant_message_v1('${second}','${secondMessage}','${uuid()}','${a.policy}','en','Second synthetic goal','goal_start','${secondGoal}',null,null,null,null);`));
  for (let i = 0; i < 53; i++) {
    await db(actorSQL(a, `select public.submit_assistant_message_v1('${a.conversation}','${uuid()}','${uuid()}','${a.policy}','en','Synthetic history ${i}','follow_up','${a.goal}',2,null,'${a.followup}',null);`));
  }
  await db(actorSQL(a, `select public.submit_assistant_message_v1('${a.conversation}','${question}','${uuid()}','${a.policy}','en','Synthetic ordinary question','independent_question',null,null,null,null,'${questionTurn}');`));
  assert.equal(JSON.parse(await db(actorSQL(a, `select public.read_assistant_conversation_v1('${a.policy}','${a.conversation}');`))).messages.length, 50);
  const sections = ['conversations', 'goals', 'messages', 'goalTripLinks', 'goalTripReceipts'];
  const pageSQL = (section, cursor = null, limit = 7, owner = a.owner) => `select public.assistant_conversation_export_owner_v1('${owner}','${section}',${cursor ? "'" + cursor + "'" : 'null'},${limit});`;
  const collect = async section => {
    const items = [], seen = new Set();
    let cursor = null;
    do {
      const page = JSON.parse(await db(serviceSQL(pageSQL(section, cursor))));
      assert.equal(page.schemaVersion, 'assistant-conversation-export/1');
      assert.equal(page.section, section);
      assert.ok(page.items.length <= 7);
      assert.equal(page.sectionComplete, !page.hasMore);
      assert.equal(page.nextCursor !== null, page.hasMore);
      items.push(...page.items);
      cursor = page.nextCursor;
      if (cursor !== null) { assert.ok(!seen.has(cursor), 'cursor advances'); seen.add(cursor); }
    } while (cursor !== null);
    return items;
  };
  const manifest = Object.fromEntries(await Promise.all(sections.map(async section => [section, await collect(section)])));
  assert.equal(manifest.conversations.length, 2);
  assert.equal(manifest.goals.length, 2);
  assert.equal(manifest.messages.length, 57);
  const history = manifest.messages.filter(m => m.conversationId === a.conversation).sort((x, y) => x.sequence - y.sequence);
  assert.equal(history.length, 56);
  assert.deepEqual(history.map(m => m.sequence), Array.from({ length: 56 }, (_, i) => i + 1));
  assert.equal(history[0].text, 'Synthetic journey goal');
  assert.equal(history[1].taskId, a.task);
  assert.equal(history[1].parentMessageId, a.message);
  assert.equal(history.at(-1).turnId, questionTurn);
  assert.equal(manifest.goals.find(g => g.goalId === a.goal).scopeVersion, 2);
  const links = JSON.parse(await db(serviceSQL(`select public.assistant_goal_trip_export_owner_v1('${a.owner}');`)));
  assert.deepEqual(manifest.goalTripLinks, links.links);
  assert.deepEqual(manifest.goalTripReceipts, links.receipts);
  for (const value of Object.values(b)) assert.ok(!JSON.stringify(manifest).includes(value), 'no other-owner source identifier');
  assert.doesNotMatch(JSON.stringify(manifest), /requestDigest|idempotencyKey|sessionId|Synthetic answer/);
  for (const role of ['anon', 'authenticated']) {
    await denied(`set role ${role}; ${pageSQL('messages')}`, /permission denied/);
  }
  await denied(serviceSQL("select public.assistant_conversation_export_owner_v1(null,'messages');"), /FORBIDDEN/);
  await denied(pageSQL('messages'), /FORBIDDEN/);
  for (const table of ['assistant_conversations', 'assistant_goals', 'assistant_messages']) {
    await denied(`set role service_role; select * from turn_private.${table};`, /permission denied/);
  }
  for (const limit of ['0', '101', 'null']) await denied(serviceSQL(pageSQL('messages', null, limit)), /INVALID_INPUT/);
  await denied(serviceSQL(pageSQL('unknown')), /INVALID_INPUT/);
  await denied(serviceSQL(pageSQL('messages', b.message)), /INVALID_EXPORT_CURSOR/);
  await denied(serviceSQL(pageSQL('messages', uuid())), /INVALID_EXPORT_CURSOR/);
  await denied(serviceSQL(pageSQL('messages', a.goal)), /INVALID_EXPORT_CURSOR/);
  // Compensating EXECUTE revocation disables only the new seam, then rollback restores it.
  await denied(`begin; revoke execute on function public.assistant_conversation_export_owner_v1(uuid,text,uuid,integer) from service_role; ${serviceSQL(pageSQL('messages'))}`, /permission denied/);
  assert.deepEqual(await collect('messages'), manifest.messages, 'rollback/retry is read-only and deterministic');
  await db(actorSQL(a, `select public.withdraw_text_policy('${a.policy}');`));
  assert.equal(JSON.parse(await db(actorSQL(a, `select public.read_assistant_conversation_v1('${a.policy}','${a.conversation}');`))).kind, 'unavailable');
  assert.equal(JSON.parse(await db(actorSQL(a, `select public.read_result_artifacts_v1('${a.artifact}',1);`))).kind, 'unavailable');
  assert.deepEqual(await collect('messages'), manifest.messages, 'withdrawal does not hide retained data from privacy export');
  await db(`delete from auth.users where id='${a.owner}';`);
  await denied(serviceSQL(pageSQL('messages', a.message)), /INVALID_EXPORT_CURSOR/);
  for (const section of sections) {
    const empty = JSON.parse(await db(serviceSQL(pageSQL(section))));
    assert.deepEqual(empty.items, []);
    assert.equal(empty.sectionComplete, true);
    assert.equal(empty.hasMore, false);
    assert.equal(empty.nextCursor, null);
  }
});
