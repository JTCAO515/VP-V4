import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';
import { readOpsLedgerScope, parseOpsLedgerSnapshot } from '../../../lib/server/observability/ops-ledger.ts';
import { renderOpsLedgerReport } from '../../../apps/ops/ledger-report.ts';

const enabled = process.env.VP_OPS_DB_TEST === '1';
const container = 'vpj37-ops-' + uuid().slice(0, 8);
const postgresImage = process.env.VP_OPS_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.159';
const migration = '20260910190658_vpj_37_ops_scope_read_model.sql';
const memberMigration = '20260917131633_vpj_37_ops_budget_member_read.sql';
let created = false;
const run = (name, fn) => test(name, { skip: !enabled }, fn);
const db = async text => { const r = await sql(container, text); assert.equal(r.code, 0, r.stderr); return r.stdout.trim(); };
const literal = v => v === null ? 'null' : typeof v === 'number' ? String(v) : "'" + v.replaceAll("'", "''") + "'";
const service = async (name, params = {}) => {
  assert.match(name, /^[a-z_][a-z0-9_]*$/); assert.ok(Object.keys(params).every(k => /^p_[a-z_]+$/.test(k)));
  return JSON.parse(await db('set role service_role; select public.' + name + '(' + Object.entries(params).map(([k, v]) => k + '=>' + literal(v)).join(',') + ');'));
};
const read = scope => service('read_ops_budget_scope_v1', { p_scope_id: scope });
const amounts = a => ({ p_scope_id: a.scope, p_owner_id: a.owner, p_attempt_id: a.id });
const snapshotTables = () => db("select coalesce(jsonb_agg(to_jsonb(a) order by scope_id,attempt_id),'[]') from public.model_budget_attempts a; select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from public.model_budget_scopes s; select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.turns t; select coalesce(jsonb_agg(to_jsonb(c) order by turn_id),'[]') from turn_private.text_content c;");
async function scope() {
  const a = { owner: uuid(), scope: uuid(), session: uuid(), policy: uuid() };
  await db(`insert into auth.users values('${a.owner}'); insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
    insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at)
    values('${a.scope}','${a.owner}','CNY',1000000,100000,100,100,true,now()+interval '1 hour');
    insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled)
    select '${a.scope}',p,'synthetic-model','synthetic-price',1000000,10000,true from unnest(array['qwen','glm','deepseek']) p;
    insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
    values('${a.policy}','qwen','synthetic-only','https://synthetic.invalid/inference','fixture','fixture','fixture','fixture','fixture',repeat('a',64),'合成告知','Synthetic notice','retain_after_hide_v1',now()-interval '1 day',now()+interval '1 day',now()+interval '1 day');`);
  return a;
}
async function textTurn(a, outcome) {
  const turn = uuid(), thread = uuid();
  await db(`set request.jwt.claim.sub='${a.owner}'; set request.jwt.claims='{"session_id":"${a.session}"}';set role authenticated;
    select public.accept_text_policy('${a.policy}',repeat('a',64));
    select public.submit_text_turn('${thread}','${turn}','${uuid()}','${a.policy}','en','DO-NOT-EXPORT-private-input');`);
  const lease = await service('claim_turn_work'); assert.equal(lease.turnId, turn);
  if (outcome !== null) {
    assert.equal((await service('authorize_text_dispatch', { p_turn_id: turn, p_lease_token: lease.leaseToken, p_policy_id: a.policy, p_provider: 'qwen' })).kind, 'authorized');
    assert.equal((await service('complete_text_work', { p_turn_id: turn, p_lease_token: lease.leaseToken, p_kind: outcome, p_text: 'DO-NOT-EXPORT-private-answer' })).kind, 'finished');
  } else {
    assert.equal((await service('finish_turn_work', { p_turn_id: turn, p_lease_token: lease.leaseToken, p_outcome: 'validation_failure' })).kind, 'finished');
  }
  return turn;
}
async function attempt(a, task, provider, state, hold = 100, actual = 7) {
  const x = { ...a, id: uuid() };
  assert.equal((await service('reserve_model_budget', { ...amounts(x), p_task_id: task, p_provider: provider, p_model: 'synthetic-model', p_price_version: 'synthetic-price', p_reserved_micros: hold })).kind, 'reserved');
  if (state === 'dispatched' || state === 'pending' || state === 'settled') assert.equal((await service('dispatch_model_budget', amounts(x))).kind, 'dispatched');
  if (state === 'pending' || state === 'settled' || state === 'released') {
    const action = { pending: 'pending', settled: 'settle', released: 'release' }[state];
    await service('finish_model_budget', { ...amounts(x), p_action: action, p_actual_micros: state === 'settled' ? actual : null });
  }
  return x;
}

before(async () => {
  if (!enabled) return;
  assert.match(postgresImage, /^public\.ecr\.aws\/supabase\/postgres:17\.6\.1\.(159|167)$/);
  const r = await command('docker', ['run', '--pull=never', '--rm', '-d', '--network', 'none', '--name', container, '--user', 'postgres', '--entrypoint', '/bin/sh', postgresImage, '-c', 'umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(r.code, 0, r.stderr); created = true;
  assert.equal(JSON.parse((await command('docker', ['inspect', container])).stdout)[0].HostConfig.NetworkMode, 'none');
  let ready = false;
  for (let i = 0; i < 40; i++) { if ((await command('docker', ['exec', container, 'pg_isready', '-h', '/tmp/vpj59-socket', '-U', 'postgres'])).code === 0) { ready = true; break; } await new Promise(r => setTimeout(r, 250)); }
  assert.ok(ready);
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql', 'utf8'));
  const files = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && f !== migration && f !== memberMigration).sort();
  for (const file of files) await db('begin;' + readFileSync('supabase/migrations/' + file, 'utf8') + 'commit;');
  const old = await scope(); await attempt(old, uuid(), 'qwen', 'pending', 123);
  const prior = await snapshotTables();
  await db('begin;' + readFileSync('supabase/migrations/' + migration, 'utf8') + 'commit;');
  await db('begin;' + readFileSync('supabase/migrations/' + memberMigration, 'utf8') + 'commit;');
  assert.equal(await snapshotTables(), prior, 'migration does not change pre-existing ledger/Turn/body records');
});
after(async () => { if (created) assert.equal((await command('docker', ['rm', '-f', container])).code, 0); });

run('real ledger statuses and provider sums reconcile without multiplying a repeated task outcome', async t => {
  const a = await scope(), partial = await textTurn(a, 'partial'), blocked = await textTurn(a, 'blocked'), failed = await textTurn(a, null);
  await attempt(a, partial, 'qwen', 'settled', 100, 7);
  await attempt(a, partial, 'deepseek', 'pending', 200);
  await attempt(a, blocked, 'qwen', 'reserved', 300);
  await attempt(a, failed, 'glm', 'released', 400);
  await attempt(a, uuid(), 'glm', 'dispatched', 500);
  const before = await snapshotTables();
  const result = await readOpsLedgerScope(service, a.scope); assert.equal(result.kind, 'available');
  const s = result.snapshot;
  assert.deepEqual(s.attempts, { total: 5, reserved: 1, dispatched: 1, pending: 1, settled: 1, released: 1 });
  assert.deepEqual(s.money, { settledMicros: '7', holdMicros: '1000', exposureMicros: '1007' });
  assert.equal(s.tasks.total, 4); assert.equal(s.tasks.linkedTurns, 3); assert.equal(s.tasks.missingTurns, 1);
  assert.equal(s.tasks.technical.completed, 1); assert.equal(s.tasks.technical.failed, 1);
  assert.deepEqual(s.tasks.business, { answered: 0, partial: 1, clarification: 0, blocked: 1, technicalFailure: 0, unobserved: 2 });
  const direct = JSON.parse(await db(`select json_build_object('attempts',count(*),'hold',sum(case when status in ('reserved','dispatched','pending') then reserved_micros else 0 end)::text,'debit',sum(coalesce(actual_micros,0))::text) from public.model_budget_attempts where scope_id='${a.scope}';`));
  assert.equal(s.attempts.total, direct.attempts); assert.equal(s.money.holdMicros, direct.hold); assert.equal(s.money.settledMicros, direct.debit);
  const report = renderOpsLedgerReport(s);
  for (const secret of ['DO-NOT-EXPORT', a.owner, a.scope, partial, a.policy, 'synthetic-model', 'synthetic-price']) assert.ok(!report.includes(secret) && !JSON.stringify(s).includes(secret));
  assert.equal(s.unobserved.toolAttempts, null); assert.equal(s.unobserved.semanticQuality, null); assert.equal(s.unobserved.actualBilledMicros, null);
  assert.equal(await snapshotTables(), before, 'reading/formatting cannot mutate authority');
  t.diagnostic(report);
});

run('empty scopes have observed zero rows, while missing scopes and denied roles yield no data', async () => {
  const a = await scope(), s = parseOpsLedgerSnapshot(await read(a.scope));
  assert.equal(s.attempts.total, 0); assert.equal(s.tasks.total, 0); assert.deepEqual(s.providers, []); assert.equal(s.unobserved.humanTimeMs, null);
  assert.deepEqual(await read(uuid()), { kind: 'unavailable' }); assert.deepEqual(await read(null), { kind: 'unavailable' });
  for (const role of ['anon', 'authenticated']) assert.notEqual((await sql(container, `set role ${role}; select public.read_ops_budget_scope_v1('${a.scope}');`)).code, 0);
  assert.equal(await db("select provolatile::text||':'||prosecdef::text from pg_proc where oid='public.read_ops_budget_scope_v1(uuid)'::regprocedure;"), 's:true');
  const readOnly = JSON.parse(await db(`begin read only; set role service_role; select public.read_ops_budget_scope_v1('${a.scope}'); rollback;`));
  assert.equal(parseOpsLedgerSnapshot(readOnly).attempts.total, 0, 'works inside an explicitly read-only transaction');
});

run('hidden text and foreign-owner task IDs do not become business successes or disclose identifiers', async () => {
  const a = await scope(), b = await scope();
  const hidden = await textTurn(a, 'answered'), foreign = await textTurn(b, 'answered');
  await attempt(a, hidden, 'qwen', 'settled'); await attempt(a, foreign, 'qwen', 'pending');
  await db(`update turn_private.text_content set hidden_at=clock_timestamp() where turn_id='${hidden}';`);
  const s = parseOpsLedgerSnapshot(await read(a.scope));
  assert.equal(s.tasks.ownerMismatch, 1); assert.equal(s.tasks.business.answered, 0); assert.equal(s.tasks.business.unobserved, 2);
  assert.equal(s.tasks.technical.completed, 1); assert.equal(s.tasks.technical.unknown, 1);
  assert.ok(!JSON.stringify(s).includes(b.owner));
});

run('metadata anomalies are counted without inventing quality or treating an inconsistent outcome as answered', async () => {
  const a = await scope(), task = await textTurn(a, 'answered'); await attempt(a, task, 'glm', 'settled');
  await db(`update public.turns set status='failed' where id='${task}';
    insert into public.chat_turn_events(owner_id,thread_id,turn_id,event_id,sequence,schema_version,event_type,state)
    select owner_id,thread_id,id,'synthetic-corrupt-terminal',3,'turn-sse-v1','terminal','failed' from public.turns where id='${task}';`);
  const result = await readOpsLedgerScope(service, a.scope); assert.equal(result.kind, 'available');
  assert.deepEqual(result.findings, ['inconsistent_outcome', 'duplicate_terminal']);
  assert.equal(result.snapshot.tasks.business.answered, 0); assert.equal(result.snapshot.tasks.business.unobserved, 1);
});

run('settlement concurrent with repeated snapshots preserves reconciliation and never changes another scope', async () => {
  const a = await scope(), b = await scope();
  const items = []; for (let i = 0; i < 12; i++) items.push(await attempt(a, uuid(), ['qwen','glm','deepseek'][i % 3], 'pending'));
  await attempt(b, uuid(), 'qwen', 'pending', 999);
  const other = await db(`select to_jsonb(a) from public.model_budget_attempts a where scope_id='${b.scope}';`);
  await Promise.all([
    (async () => { for (const x of items) await service('finish_model_budget', { ...amounts(x), p_action: 'settle', p_actual_micros: 9 }); })(),
    (async () => { for (let i = 0; i < 15; i++) { const s = parseOpsLedgerSnapshot(await read(a.scope)); assert.equal(s.attempts.total, 12); } })(),
  ]);
  const final = parseOpsLedgerSnapshot(await read(a.scope)); assert.equal(final.money.settledMicros, '108'); assert.equal(final.money.holdMicros, '0');
  assert.equal(await db(`select to_jsonb(a) from public.model_budget_attempts a where scope_id='${b.scope}';`), other);
});

run('live Ops membership, session and switch gate the same sanitized ledger snapshot', async () => {
  const budget = await scope(), member = await scope(), outsider = await scope();
  await attempt(budget, uuid(), 'qwen', 'pending', 123);
  await db(`update knowledge_review_private.settings set enabled=true;
    insert into knowledge_review_private.members(actor_id,active) values('${member.owner}',true);`);
  const call = async actor => sql(container, `set request.jwt.claim.sub='${actor.owner}';
    set request.jwt.claims='{"role":"authenticated","is_anonymous":false,"session_id":"${actor.session}"}';
    set role authenticated; select public.ops_budget_scope_read_v1('${budget.scope}');`);
  const allowed = await call(member);
  assert.equal(allowed.code, 0, allowed.stderr);
  const snapshot = parseOpsLedgerSnapshot(JSON.parse(allowed.stdout.trim()));
  assert.equal(snapshot.attempts.pending, 1);
  assert.equal(snapshot.money.holdMicros, '123');
  assert.equal(snapshot.unobserved.actualBilledMicros, null);
  assert.ok(!allowed.stdout.includes(member.owner) && !allowed.stdout.includes(budget.owner));
  const denied = await call(outsider);
  assert.notEqual(denied.code, 0); assert.match(denied.stderr, /OPS_FORBIDDEN/);
  assert.notEqual((await sql(container, `set role anon; select public.ops_budget_scope_read_v1('${budget.scope}');`)).code, 0);
  await db(`update knowledge_review_private.members set active=false where actor_id='${member.owner}';`);
  assert.match((await call(member)).stderr, /OPS_FORBIDDEN/);
  await db(`update knowledge_review_private.members set active=true where actor_id='${member.owner}'; delete from auth.sessions where id='${member.session}';`);
  assert.match((await call(member)).stderr, /UNAUTHENTICATED|SESSION_REPLACED/);
  assert.equal(await db("select has_function_privilege('authenticated','public.read_ops_budget_scope_v1(uuid)','EXECUTE');"), 'f');
  assert.equal(await db("select has_schema_privilege('authenticated','knowledge_review_private','USAGE');"), 'f');
});
