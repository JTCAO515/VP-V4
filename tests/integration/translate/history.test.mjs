// Disposable, network-disabled PostgreSQL; identities and answers are synthetic.
// SQL claims exercise database contracts, not GoTrue/HTTP or an account executor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';
import { translationPrompt } from '../../../lib/server/media-translation/text/contract.ts';
import { projectTranslationHistory } from '../../../lib/server/media-translation/text/history-http.ts';

const enabled = process.env.VP_TRANSLATION_HISTORY_DB_TEST === '1';
const container = 'vpj82-translations-' + uuid().slice(0, 8);
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
  await db("create function auth.role() returns text language sql as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$; create schema extensions; create extension pgcrypto with schema extensions;");
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    const migration = readFileSync('supabase/migrations/' + file, 'utf8');
    if (file === '20261002050000_vpj82_translation_history.sql') {
      await db('begin;' + migration + 'rollback;');
      assert.equal(await db("select to_regprocedure('public.list_saved_translations_v1(uuid,uuid)') is null;"), 't');
    }
    await db('begin;' + migration + 'commit;');
  }
});
after(async () => { if (created) assert.equal((await command('docker', ['rm', '-f', container])).code, 0); });

const literal = value => "'" + value.replaceAll("'", "''") + "'";
async function actor(lifetime = '1 day') {
  const a = { owner: uuid(), session: uuid(), policy: uuid() };
  await db(`insert into auth.users(id) values('${a.owner}'); insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');
    insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
    insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
    values('${a.policy}','qwen','synthetic test','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','test','test','${'a'.repeat(64)}','合成告知','Synthetic notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '${lifetime}',now()+interval '1 day');
    insert into turn_private.text_consents(owner_id,policy_id) values('${a.owner}','${a.policy}');`);
  return a;
}
async function seed(a, ordinary = false) {
  const id = uuid(), thread = uuid(), text = 'Synthetic phrase CNY 50.';
  const input = ordinary ? 'PRIVATE ORDINARY ASK BODY' : translationPrompt({ sourceLocale: 'en', targetLocale: 'zh', text });
  await db(actorSQL(a, `select public.submit_text_turn('${thread}','${id}','${uuid()}','${a.policy}','zh',${literal(input)});`));
  await db(`update public.turns set status='completed' where id='${id}'; update turn_private.text_content set output_kind='answered',output_text='{"translation":"合成短句50元。","backTranslation":"${text}"}' where turn_id='${id}';`);
  return { id, thread };
}
const page = async (a, cursor = null) => JSON.parse(await db(actorSQL(a, `select public.list_saved_translations_v1('${a.policy}',${cursor ? literal(cursor) : 'null'});`)));
const exact = async (a, id) => JSON.parse(await db(actorSQL(a, `select public.read_saved_translation_v1('${a.policy}','${id}');`)));

test('translation older than the legacy20 reopens through bounded pages and exact same source', { skip: !enabled, timeout: 120000 }, async () => {
  const a = await actor(), b = await actor(), old = await seed(a), foreign = await seed(b);
  for (let i = 0; i < 21; i++) await seed(a, true);
  const legacy = JSON.parse(await db(actorSQL(a, `select public.list_text_turns('${a.policy}',20);`)));
  assert.equal(legacy.turns.length, 20);
  assert.ok(!legacy.turns.some(t => t.turnId === old.id));
  assert.equal(projectTranslationHistory(await exact(a, old.id), a.policy, null, old.id).kind, 'translation');
  for (let i = 0; i < 25; i++) await seed(a);
  // Equal timestamps exercise UUID tie-breaking; never paginate by date alone.
  await db(`update turn_private.text_content set created_at='2026-10-02T00:00:00Z' where owner_id='${a.owner}' and turn_id<>'${old.id}';
    update turn_private.text_content set created_at='2026-10-01T00:00:00Z' where turn_id='${old.id}';`);
  const first = projectTranslationHistory(await page(a), a.policy, null);
  assert.equal(first.kind, 'translations'); assert.equal(first.phrases.length, 20); assert.ok(first.nextCursor);
  const second = projectTranslationHistory(await page(a, first.nextCursor), a.policy, first.nextCursor);
  assert.equal(second.kind, 'translations'); assert.equal(second.phrases.length, 6); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.phrases, ...second.phrases].map(p => p.turnId)).size, 26);
  assert.ok(second.phrases.some(p => p.turnId === old.id));
  assert.ok(!JSON.stringify(first).includes(foreign.id));
  assert.ok(!JSON.stringify(first).includes('PRIVATE ORDINARY'));
  assert.equal((await page(a, foreign.id)).kind, 'unavailable');
  assert.equal((await exact(a, foreign.id)).kind, 'unavailable');
  assert.equal((await page(a, uuid())).kind, 'unavailable');
  for (const role of ['anon', 'service_role']) {
    await denied(`set role ${role}; select public.list_saved_translations_v1('${a.policy}',null);`, /permission denied/);
    await denied(`set role ${role}; select public.read_saved_translation_v1('${a.policy}','${old.id}');`, /permission denied/);
  }
  await denied(actorSQL(a, "select * from turn_private.text_content;"), /permission denied/);
});

test('sparse raw128 window is unavailable without exposing a hidden scan cursor or partial phrase', { skip: !enabled, timeout: 120000 }, async () => {
  const a = await actor(), old = await seed(a);
  for (let i = 0; i < 129; i++) await seed(a, true);
  const raw = await page(a);
  assert.equal(raw.hasUnscannedTail, true); assert.deepEqual(raw.turns, []);
  assert.deepEqual(projectTranslationHistory(raw, a.policy, null), { version: 2, kind: 'unavailable' });
 assert.deepEqual(projectTranslationHistory(raw, a.policy, null, undefined, 'Synthetic'), { version: 2, kind: 'unavailable' });
  assert.equal(projectTranslationHistory(await exact(a, old.id), a.policy, null, old.id).kind, 'translation');
  assert.equal(await db(`select count(*) from turn_private.text_dispatches;`), '0');
  assert.equal(await db(`select count(*) from public.model_budget_attempts;`), '0');
});

test('same list/exact eligibility rejects status, hidden/deleted/thread, consent/policy and replaced actor', { skip: !enabled, timeout: 120000 }, async () => {
  const a = await actor();
  for (const state of ['failed', 'cancelled', 'accepted']) {
    const t = await seed(a); await db(`update public.turns set status='${state}' where id='${t.id}';`);
    assert.equal((await exact(a, t.id)).kind, 'unavailable');
    assert.ok(!(await page(a)).turns.some(value => value.turnId === t.id));
  }
  const hidden = await seed(a); await db(`update turn_private.text_content set hidden_at=clock_timestamp() where turn_id='${hidden.id}';`);
  assert.equal((await exact(a, hidden.id)).kind, 'unavailable');
  const deleted = await seed(a); await db(`delete from public.turns where id='${deleted.id}';`);
  assert.equal((await page(a, deleted.id)).kind, 'unavailable');
  const thread = await seed(a); await db(`delete from public.chat_threads where id='${thread.thread}';`);
  assert.equal((await exact(a, thread.id)).kind, 'unavailable');
  const valid = await seed(a);
  await db(actorSQL(a, `select public.withdraw_text_policy('${a.policy}');`));
  assert.equal((await page(a)).kind, 'unavailable'); assert.equal((await exact(a, valid.id)).kind, 'unavailable');
  const expired = await actor('1 second'), expiredTurn = await seed(expired);
  await db('select pg_sleep(1.1);');
  assert.equal((await page(expired)).kind, 'unavailable'); assert.equal((await exact(expired, expiredTurn.id)).kind, 'unavailable');
  await db(`delete from auth.sessions where id='${a.session}';`);
  await denied(actorSQL(a, `select public.list_saved_translations_v1('${a.policy}',null);`), /SESSION_REPLACED/);
});
