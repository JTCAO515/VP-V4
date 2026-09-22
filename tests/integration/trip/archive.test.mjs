import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';

test('archive SQL: owner isolation, atomic retries, failure preservation, service retention and fresh Trip', { skip: process.env.VP_ARCHIVE_DB_TEST !== '1', timeout: 180000 }, async t => {
  const container = 'vpj61-' + uuid().slice(0, 8);
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT);
  const context = JSON.parse((await command('docker', ['context', 'inspect'])).stdout)[0];
  assert.ok(context.Endpoints.docker.Host.startsWith('unix:///'));
  const started = await command('docker', ['run', '--pull=never', '--rm', '-d', '--network', 'none', '--name', container, '--user', 'postgres', '--entrypoint', '/bin/sh', 'public.ecr.aws/supabase/postgres:17.6.1.159', '-c', 'umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(started.code, 0, started.stderr);
  t.after(async () => { assert.equal((await command('docker', ['rm', '-f', container])).code, 0); });
  const db = async text => { const r = await sql(container, "set statement_timeout='30s';\n" + text); assert.equal(r.code, 0, r.stderr); return r.stdout.trim(); };
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if ((await command('docker', ['exec', container, 'pg_isready', '-h', '/tmp/vpj59-socket', '-U', 'postgres'])).code === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready);
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql', 'utf8') + '\ngrant usage on schema auth to authenticated, service_role;');
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db('begin;\n' + readFileSync('supabase/migrations/' + file, 'utf8') + '\ncommit;');
  }
  const owner = uuid(), other = uuid(), trip = uuid(), fresh = uuid(), key = uuid(), turn = uuid(), session = uuid(), task = uuid(), taskTurn = uuid(), thread = uuid(), policy = uuid();
  await db(`insert into auth.users values('${owner}'),('${other}'); insert into auth.sessions(id,user_id) values('${session}','${owner}'); insert into public.trips(id,owner_id,title) values('${trip}','${owner}','Old trip');`);
  const as = (actor, text) => `set request.jwt.claim.sub='${actor}'; set request.jwt.claims='{"role":"authenticated"}'; set role authenticated; ${text}`;
  const call = (actor = owner, version = 1, k = key, confirmed = true, id = trip) => as(actor, `select row_to_json(r) from public.archive_trip_v1('${id}',${version},'${k}',${confirmed}) r;`);
  const denied = async (text, expected) => { const r = await sql(container, text); assert.notEqual(r.code, 0); assert.ok(r.stderr.includes(expected), r.stderr); };
  await denied(call(owner, 0), 'INVALID_INPUT');
  await denied(call(other), 'FORBIDDEN');
  await denied(call(owner, 1, key, false), 'INVALID_INPUT');
  // Create and explicitly confirm through the real existing producer.
  const proposal = JSON.parse(await db(as(owner, `select row_to_json(r) from public.create_trip_proposal_patch('${trip}','{"expectedVersion":0,"operations":[{"kind":"upsert_day","dayId":"day-old","date":"2020-01-01","timeZone":"Asia/Shanghai"},{"kind":"upsert_item","dayId":"day-old","itemId":"item-old","title":"Temporary meeting","startsAt":"2020-01-01T09:00:00Z"}]}') r;`)));
  const digest = await db(as(owner, `select digest from public.read_trip_proposal_v2('${proposal.proposal_id}');`));
  await db(as(owner, `select * from public.confirm_and_apply_trip_proposal('${proposal.proposal_id}','${uuid()}','${digest}');`));
  await db(`insert into public.turns(id,owner_id,trip_id,status) values('${turn}','${owner}','${trip}','accepted');`);
  await db(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at) values('${policy}','qwen','synthetic-only','https://synthetic.invalid/inference','fixture','fixture','fixture','test-v1','test-v1','${'a'.repeat(64)}','合成测试','Synthetic test','retain_after_hide_v1',now()-interval '1 day',now()+interval '1 day',now()+interval '1 day');`);
  const taskAs = text => `set request.jwt.claim.sub='${owner}'; set request.jwt.claims='{"session_id":"${session}","role":"authenticated"}'; set role authenticated; ${text}`;
  await db(taskAs(`select public.accept_text_policy('${policy}','${'a'.repeat(64)}');`));
  const admitted = JSON.parse(await db(taskAs(`select public.submit_service_task_turn('${thread}','${taskTurn}','${uuid()}','${policy}','en','Synthetic unfinished service','${task}',1,'new_goal',null);`)));
  assert.equal(admitted.kind, 'accepted');
  assert.equal(admitted.serviceTaskId, task);
  const snapshot = () => db(`select row_to_json(t) from public.trips t where id='${trip}'; select row_to_json(s) from public.trip_version_snapshots s where trip_id='${trip}' order by version; select row_to_json(t) from public.turns t where id in ('${turn}','${taskTurn}') order by id; select row_to_json(t) from turn_private.service_tasks t where id='${task}'; select row_to_json(t) from turn_private.service_task_turns t where task_id='${task}'; select row_to_json(t) from turn_private.work t where turn_id='${taskTurn}';`);
  const lateProposal = JSON.parse(await db(as(owner, `select row_to_json(r) from public.create_trip_proposal_patch('${trip}','{"expectedVersion":1,"operations":[{"kind":"set_title","title":"Late change"}]}') r;`)));
  const lateDigest = await db(as(owner, `select digest from public.read_trip_proposal_v2('${lateProposal.proposal_id}');`));
  const before = await snapshot();
  assert.equal(await db(`select count(*) from public.trip_archives;`), '0', 'old dates do not archive');
  await denied(call(owner, 2), 'STALE_TRIP_VERSION');
  await db(`create function private.vpj61_fail_audit() returns trigger language plpgsql as $$ begin if new.action='trip_archived' then raise exception 'archive fault'; end if; return new; end $$; create trigger vpj61_fail before insert on private.audit_events for each row execute function private.vpj61_fail_audit();`);
  await denied(call(), 'archive fault');
  assert.equal(await snapshot(), before);
  assert.equal(await db('select count(*) from public.trip_archives;'), '0');
  await db('drop trigger vpj61_fail on private.audit_events; drop function private.vpj61_fail_audit();');
  const concurrent = await Promise.all([db(call()), db(call())]);
  assert.deepEqual(concurrent.map(x => JSON.parse(x).reused).sort(), [false, true]);
  assert.equal(JSON.parse(await db(call())).reused, true);
  assert.equal(JSON.parse(await db(call(owner, 1, uuid()))).reused, true);
  await denied(as(owner, `select * from public.confirm_and_apply_trip_proposal('${lateProposal.proposal_id}','${uuid()}','${lateDigest}');`), 'PROPOSAL_NOT_CONFIRMABLE');
  assert.equal(await snapshot(), before, 'Trip, saved content and unfinished service status are byte-for-byte preserved');
  assert.equal(await db(`select count(*) from private.audit_events where action='trip_archived' and entity_id='${trip}';`), '1');
  assert.equal(await db(as(other, 'select count(*) from public.trip_archives;')), '0');
  for (const role of ['anon', 'authenticated']) {
    await denied(`set role ${role}; insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${trip}','${other}',1,'${uuid()}');`, 'permission denied');
  }
  await denied(as(owner, `delete from public.trip_archives where trip_id='${trip}';`), 'permission denied');
  await denied(`update public.trips set head_version=2 where id='${trip}';`, 'PROPOSAL_NOT_CONFIRMABLE');
  await db(as(owner, `insert into public.trips(id,owner_id,title) values('${fresh}','${owner}','Next trip');`));
  assert.equal(await db(as(owner, `select content->'days' from public.trip_version_snapshots where trip_id='${fresh}' and version=0;`)), '[]');
  assert.equal(await db(`select count(*) from public.trip_archives where trip_id='${fresh}';`), '0');
  await denied(call(owner, 1, key, true, fresh), 'IDEMPOTENCY_KEY_REUSE');
  await denied(`set role anon; select * from public.archive_trip_v1('${trip}',1,'${key}',true);`, 'permission denied');
  await db(`insert into identity_private.mobile_accounts(owner_id,session_id) values('${owner}',null) on conflict(owner_id) do update set session_id=null; insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${owner}','${uuid()}','${session}',1);`);
  await denied(taskAs(`select * from public.archive_trip_v1('${trip}',1,'${key}',true);`), 'SESSION_REPLACED');
  assert.equal(await db(taskAs('select count(*) from public.trip_archives;')), '0');
});
