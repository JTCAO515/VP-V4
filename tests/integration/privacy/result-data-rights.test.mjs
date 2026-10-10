// Disposable, network-disabled PostgreSQL; identities and answers are synthetic.
// SQL claims exercise database contracts, not GoTrue/HTTP or an account executor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';

const enabled = process.env.VP_PRIVACY_DB_TEST === '1';
const container = 'vpj79-result-rights-' + uuid().slice(0, 8);
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
    if (file === '20261002030000_vpj79_result_export.sql') {
      await db('begin;' + migration + 'rollback;');
      assert.equal(await db("select to_regprocedure('public.result_artifact_export_owner_v1(uuid,text,jsonb,integer)') is null;"), 't');
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

const sections = ['artifacts', 'revisions', 'events'];
const pageSQL = (owner, section, cursor = null, limit = 7) =>
  `select public.result_artifact_export_owner_v1('${owner}','${section}',${cursor === null ? 'null' : "'" + JSON.stringify(cursor).replaceAll("'", "''") + "'::jsonb"},${limit});`;
async function collect(owner, section, limit = 7) {
  const items = [], seen = new Set(); let cursor = null;
  do {
    const page = JSON.parse(await db(serviceSQL(pageSQL(owner, section, cursor, limit))));
    assert.equal(page.schemaVersion, 'result-artifact-export/1');
    assert.equal(page.section, section); assert.ok(page.items.length <= limit);
    assert.equal(page.sectionComplete, !page.hasMore);
    assert.equal(page.nextCursor !== null, page.hasMore);
    items.push(...page.items); cursor = page.nextCursor;
    if (cursor !== null) {
      assert.equal(cursor.ownerId, owner); assert.equal(cursor.section, section);
      assert.ok(!seen.has(JSON.stringify(cursor))); seen.add(JSON.stringify(cursor));
    }
  } while (cursor !== null);
  return items;
}

test('service-only result export pages reconstruct owned retained revisions and exact event references', { skip: !enabled, timeout: 120000 }, async () => {
  const a = await fixture(), b = await fixture();
  const content = JSON.stringify({schemaVersion:'comparison/1',title:'Owned comparison',summary:'Result output only',
    options:[{id:'a',title:'A',tradeoff:'Unknown'},{id:'b',title:'B',tradeoff:'Unknown'}],actions:[]});
  const publish = (id, expected, trip = 'null', version = 'null') => `select public.publish_comparison_result_v1('${a.owner}','${id}',${expected},'${uuid()}',
    '${a.task}','${a.goal}','${a.followup}',${trip},${version},2,'[]','${content}');`;
  await db(serviceSQL(publish(a.artifact,1))); await db(serviceSQL(publish(a.artifact,2)));
  await db(serviceSQL(`select public.publish_comparison_result_v1('${a.owner}',gen_random_uuid(),0,gen_random_uuid(),
    '${a.task}','${a.goal}','${a.followup}',null,null,2,'[]','${content}') from generate_series(1,105);`));
  const linked = uuid(); await db(serviceSQL(publish(linked,0,"'"+a.trip+"'",0)));
  const high = '9007199254740993';
  await db(`insert into turn_private.result_events(id,owner_id,artifact_id,revision,event_type) overriding system value
    values(${high},'${a.owner}','${a.artifact}',3,'ready');`);
  const manifest = Object.fromEntries(await Promise.all(sections.map(async s => [s,await collect(a.owner,s)])));
  assert.equal(manifest.artifacts.length,107); assert.equal(manifest.revisions.length,109); assert.equal(manifest.events.length,110);
  const revisionKeys=new Set(manifest.revisions.map(r=>`${r.artifactId}:${r.revision}`));
  assert.ok(manifest.events.every(e=>revisionKeys.has(`${e.artifactId}:${e.revision}`)),'event references reconstruct against exported revisions');
  for (const section of sections) assert.deepEqual(await collect(a.owner,section,100),manifest[section]);
  for (const section of sections) {
    const one=JSON.parse(await db(serviceSQL(pageSQL(b.owner,section,null,1))));
    assert.equal(one.items.length,1); assert.equal(one.sectionComplete,true); assert.equal(one.hasMore,false); assert.equal(one.nextCursor,null);
  }
  const revisions=manifest.revisions.filter(r=>r.artifactId===a.artifact);
  assert.deepEqual(revisions.map(r=>r.revision),[1,2,3]); assert.equal(revisions[0].content.title,'Synthetic result');
  assert.equal(revisions[2].taskTurnId,a.turn); assert.equal(revisions[2].goalVersion,2);
  const tripRevision=manifest.revisions.find(r=>r.artifactId===linked);
  assert.equal(tripRevision.tripLinkOperationId,a.operation); assert.equal(tripRevision.tripLinkVersion,1);
  assert.equal(manifest.events.at(-1).eventId,high,'bigint event identity must not lose JS precision');
  const finalPage=JSON.parse(await db(serviceSQL(pageSQL(a.owner,'events',{ownerId:a.owner,section:'events',eventId:high}))));
  assert.deepEqual(finalPage.items,[]); assert.equal(finalPage.sectionComplete,true); assert.equal(finalPage.nextCursor,null);
  assert.equal(JSON.parse(await db(serviceSQL(pageSQL(a.owner,'events',null,100)))).nextCursor.eventId.length>0,true);
  for (const id of Object.values(b)) assert.ok(!JSON.stringify(manifest).includes(id));
  assert.doesNotMatch(JSON.stringify(manifest),/requestDigest|request_digest|idempotency|sessionId|Synthetic answer|Synthetic journey goal|Synthetic Trip/);
  for (const role of ['anon','authenticated']) await denied(`set role ${role}; ${pageSQL(a.owner,'artifacts')}`,/permission denied/);
  await denied(pageSQL(a.owner,'artifacts'),/FORBIDDEN/);
  await denied(serviceSQL("select public.result_artifact_export_owner_v1(null,'artifacts');"),/FORBIDDEN/);
  for (const table of ['result_artifacts','result_revisions','result_events'])
    await denied(`set role service_role; select * from turn_private.${table};`,/permission denied/);
  for (const limit of ['0','101','null']) await denied(serviceSQL(pageSQL(a.owner,'artifacts',null,limit)),/INVALID_INPUT/);
  await denied(serviceSQL(pageSQL(a.owner,'unknown')),/INVALID_INPUT/);
  const bad=[{},[],{ownerId:b.owner,section:'artifacts',artifactId:b.artifact},
    {ownerId:a.owner,section:'artifacts',artifactId:b.artifact},
    {ownerId:a.owner,section:'revisions',artifactId:a.artifact},
    {ownerId:a.owner,section:'revisions',artifactId:a.artifact,revision:'1'},
    {ownerId:a.owner,section:'revisions',artifactId:a.artifact,revision:99},
    {ownerId:a.owner,section:'artifacts',artifactId:'malformed'},
    {ownerId:a.owner,section:'events',eventId:'9223372036854775808'},
    {ownerId:a.owner,section:'events',eventId:Number(high)},
    {ownerId:a.owner,section:'artifacts',artifactId:a.artifact,secret:'extra'}];
  for (const cursor of bad) await denied(serviceSQL(pageSQL(a.owner,cursor.section==='events'?'events':cursor.section==='revisions'?'revisions':'artifacts',cursor)),/INVALID_EXPORT_CURSOR/);
  await denied(serviceSQL(pageSQL(a.owner,'events',{ownerId:a.owner,section:'artifacts',artifactId:a.artifact})),/INVALID_EXPORT_CURSOR/);
  const foreignEvent=(await collect(b.owner,'events'))[0].eventId;
  await denied(serviceSQL(pageSQL(a.owner,'events',{ownerId:a.owner,section:'events',eventId:foreignEvent})),/INVALID_EXPORT_CURSOR/);
  await denied(serviceSQL(`select public.result_artifact_export_owner_v1('${a.owner}','artifacts','null'::jsonb);`),/INVALID_EXPORT_CURSOR/);
  await denied(`begin;revoke execute on function public.result_artifact_export_owner_v1(uuid,text,jsonb,integer) from service_role;${serviceSQL(pageSQL(a.owner,'artifacts'))}`,/permission denied/);
  assert.deepEqual(await collect(a.owner,'revisions'),manifest.revisions,'rollback/retry changes no data');
  await db(serviceSQL(`select public.withdraw_result_artifact_v1('${a.owner}','${a.artifact}',3);`));
  assert.equal(JSON.parse(await db(actorSQL(a,`select public.read_result_artifacts_v1('${a.artifact}',3);`))).kind,'unavailable');
  assert.deepEqual(await collect(a.owner,'revisions'),manifest.revisions,'result withdrawal preserves only the service privacy seam');
  await db(actorSQL(a,`select public.withdraw_text_policy('${a.policy}');`));
  assert.equal(JSON.parse(await db(actorSQL(a,`select public.read_result_artifacts_v1('${a.artifact}',3);`))).kind,'unavailable');
  assert.equal((await collect(a.owner,'artifacts')).find(r=>r.artifactId===a.artifact).lifecycle,'withdrawn');
  assert.deepEqual(await collect(a.owner,'revisions'),manifest.revisions,'retained privacy output is not ordinary read revival');
  const otherBefore=await collect(b.owner,'revisions');
  const deletion=uuid();
  await db(actorSQL(a,`select public.request_trip_deletion_v1('${deletion}','${a.trip}',0,true);`));
  await db(serviceSQL(`select public.execute_trip_deletion_v1('${deletion}');`));
  for (const [section,cursor] of [['artifacts',{ownerId:a.owner,section:'artifacts',artifactId:linked}],
    ['revisions',{ownerId:a.owner,section:'revisions',artifactId:linked,revision:1}]])
    await denied(serviceSQL(pageSQL(a.owner,section,cursor)),/INVALID_EXPORT_CURSOR/);
  assert.equal((await collect(a.owner,'artifacts')).length,106,'Trip cascade only erases Trip-bound result');
  await db(`delete from auth.users where id='${a.owner}';`);
  await denied(serviceSQL(pageSQL(a.owner,'artifacts',{ownerId:a.owner,section:'artifacts',artifactId:a.artifact})),/INVALID_EXPORT_CURSOR/);
  await denied(serviceSQL(pageSQL(a.owner,'events',{ownerId:a.owner,section:'events',eventId:high})),/INVALID_EXPORT_CURSOR/);
  await denied(actorSQL(a,`select public.read_result_artifacts_v1('${a.artifact}',3);`),/UNAUTHENTICATED/);
  await denied(serviceSQL(publish(a.artifact,0)),/STALE_BASIS/);
  for (const section of sections) assert.deepEqual(await collect(a.owner,section),[]);
  assert.deepEqual(await collect(b.owner,'revisions'),otherBefore);
});
