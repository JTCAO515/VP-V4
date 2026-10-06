// Baseline source audit only. SQL claims/admin-seeded synthetic relations are
// not signed Auth, a new erasure RPC, or target acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid, createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { command, sql } from '../../cost/fixtures/postgres-rpc.mjs';

const enabled = process.env.VP_CONVERSATION_SOURCE_AUDIT === '1';
const boundary = '20261006060000_conversation_data.sql';
const lit = v => "'" + String(v).replaceAll("'", "''") + "'";
const json = v => lit(JSON.stringify(v)) + '::jsonb';
const hash = v => createHash('sha256').update(v).digest('hex');
const tables = [
  'public.chat_threads', 'public.turns', 'public.chat_turn_events', 'public.chat_turn_idempotency', 'public.turn_feedback',
  'turn_private.assistant_conversations', 'turn_private.assistant_goals', 'turn_private.assistant_messages',
  'turn_private.result_artifacts', 'turn_private.result_revisions', 'turn_private.result_events',
  'turn_private.assistant_message_source_receipts', 'turn_private.assistant_travel_intakes', 'turn_private.planning_intake_bindings',
  'turn_private.planning_comparisons', 'turn_private.planning_action_receipts', 'turn_private.planning_observations',
  'turn_private.planning_model_dispatches', 'turn_private.planning_v2_place_checkpoints',
  'turn_private.planning_v2_model_attempt_bindings', 'turn_private.planning_v2_model_local_journal',
  'turn_private.planning_v2_execution_runs', 'turn_private.planning_v2_external_call_windows',
  'turn_private.planning_v2_collector_origins', 'turn_private.planning_v2_collector_outputs',
  'turn_private.planning_v2_result_claims', 'turn_private.planning_v2_completion_proofs', 'turn_private.planning_v2_completed_receipts',
  'turn_private.grounded_turns', 'turn_private.grounded_ai_assist_jobs', 'turn_private.work',
  'public.memory_consumer_receipts', 'turn_private.assistant_goal_trip_links', 'turn_private.service_tasks',
  'turn_private.service_task_turns', 'turn_private.service_task_capacity', 'public.model_budget_attempts',
  'turn_private.text_dispatches', 'turn_private.assistant_goal_trip_receipts', 'turn_private.text_content',
];

test('conversation source graph baseline: catalog and hidden-text reverse effects', { skip: !enabled, timeout: 300000 }, async t => {
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT);
  const context = JSON.parse((await command('docker', ['context', 'inspect'])).stdout)[0];
  assert.ok(context.Endpoints.docker.Host.startsWith('unix:///'));
  const container = 'vpj58-conversation-audit-' + uuid().slice(0, 8);
  const started = await command('docker', ['run', '--pull=never', '--rm', '-d', '--network', 'none', '--name', container,
    '--user', 'postgres', '--entrypoint', '/bin/sh', 'public.ecr.aws/supabase/postgres:17.6.1.159', '-c',
    'umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(started.code, 0, started.stderr);
  t.after(async () => assert.equal((await command('docker', ['rm', '-f', container])).code, 0));
  const db = async q => { const r = await sql(container, q); assert.equal(r.code, 0, r.stderr); return r.stdout.trim(); };
  for (let n = 0; n < 100; n++) {
    if ((await command('docker', ['exec', container, 'pg_isready', '-h', '/tmp/vpj59-socket', '-U', 'postgres'])).code === 0) break;
    await new Promise(r => setTimeout(r, 100));
  }
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql', 'utf8'));
  await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
  const migrations = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && f < boundary).sort();
  for (const f of migrations) await db('begin;' + readFileSync('supabase/migrations/' + f, 'utf8') + 'commit;');
  const relationArray = 'array[' + tables.map(lit).join(',') + ']::regclass[]';
  const evidence = { base: 'a1f70134fb6abf3672a94b956a4296b36c2c3d59', kind: 'source-audit-only',
    migrations: migrations.map(file => ({ file, digest: hash(readFileSync('supabase/migrations/' + file, 'utf8')) })) };
  await t.test('actual mapped table definitions, all inbound/outbound FKs, JSON columns and trigger bodies', async () => {
    evidence.tables = JSON.parse(await db(`select jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,'rls',c.relrowsecurity,'acl',c.relacl,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid::regtype::text,'notNull',a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid)) order by c.oid::regclass::text)
      from pg_class c where c.oid=any(${relationArray});`));
    assert.equal(evidence.tables.length, tables.length);
    evidence.foreignKeys = JSON.parse(await db(`select jsonb_agg(jsonb_build_object('from',conrelid::regclass::text,'to',confrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid)) order by conrelid::regclass::text,conname)
      from pg_constraint where contype='f' and (conrelid=any(${relationArray}) or confrelid=any(${relationArray}));`));
    evidence.triggers = JSON.parse(await db(`select jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'definition',pg_get_triggerdef(oid),'function',pg_get_functiondef(tgfoid)) order by tgrelid::regclass::text,tgname)
      from pg_trigger where not tgisinternal and tgrelid=any(${relationArray});`));
    evidence.jsonColumns = JSON.parse(await db(`select jsonb_agg(jsonb_build_object('table',a.attrelid::regclass::text,'column',a.attname) order by a.attrelid::regclass::text,a.attname)
      from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      where c.relkind='r' and n.nspname not in ('pg_catalog','information_schema') and a.attnum>0 and not a.attisdropped and a.atttypid in ('json'::regtype,'jsonb'::regtype);`));
    evidence.reverseFunctions = JSON.parse(await db(`select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema')
      and (p.prosrc like '%historical_answer%' or p.prosrc like '%comparisonRef%' or p.prosrc like '%sourceTurnId%' or p.prosrc like '%source_result_id%');`));
  });

  await t.test('real text-hide trigger mutates mixed impact set outside selected Turn; rollback restores all', async () => {
    const owner=uuid(),session=uuid(),policy=uuid(),consent=uuid(),source=uuid(),set=uuid(),other=uuid(),selected=uuid();
    const selectedItem=uuid(),otherItem=uuid(),selectedOutbox=uuid(),otherOutbox=uuid();
    const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:session}))};`;
    await db(`insert into auth.users values('${owner}');insert into auth.sessions(id,user_id) values('${session}','${owner}');
      insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${owner}','${session}',1);
      insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${owner}','${uuid()}','${session}',1);
      insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
      values('${policy}','qwen','fixture','https://fixture.invalid/v1','local','local','local','fixture','fixture','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
      insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${owner}','${policy}','${consent}');`);
    for (const turn of [selected,other]) {
      const thread=uuid(),task=uuid();
      await db(`begin;${claims}insert into public.chat_threads(id,owner_id,status) values('${thread}','${owner}','active');
        insert into public.turns(id,owner_id,thread_id,status) values('${turn}','${owner}','${thread}','completed');
        insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
        values('${task}','${owner}','${thread}','${turn}','${turn}','${policy}','${consent}',1,'${'b'.repeat(64)}');
        insert into turn_private.service_task_turns(turn_id,task_id,owner_id,relationship,idempotency_key,request_digest)
        values('${turn}','${task}','${owner}','new_goal','${uuid()}','${'c'.repeat(64)}');
        insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text,output_kind,output_text)
        values('${turn}','${owner}','${thread}','${policy}','${consent}','en','Synthetic private input','answered','Synthetic private output');commit;`);
    }
    const targets=[selected,other].map(id=>({key:'historical_answer:'+id+':1',target:{kind:'historical_answer',id,version:1,payloadHash:'d'.repeat(64),claimRefs:[]}}));
    await db(`insert into knowledge_review_private.source_revisions(id,source_key,revision_label,declaration,snippet_hash,submitted_by)
      values('${source}','fixture-source','1','{}','${'d'.repeat(64)}','${owner}');
      insert into knowledge_review_private.source_impact_sets(id,operation_id,source_id,signal_kind,source_snapshot,graph_snapshot,digest,author_id,complete,item_count)
      values('${set}','${uuid()}','${source}','observation_unavailable','{}',${json(targets)},'${'e'.repeat(64)}','${owner}',true,2);
      insert into knowledge_review_private.source_impact_items(id,set_id,target_key,target) values
      ('${selectedItem}','${set}',${lit(targets[0].key)},${json(targets[0].target)}),('${otherItem}','${set}',${lit(targets[1].key)},${json(targets[1].target)});
      insert into knowledge_review_private.source_impact_pages(set_id,cursor_key,base_version,receipt) values('${set}','',1,'{"synthetic":true}');
      insert into knowledge_review_private.source_impact_outbox(id,set_id,item_id,consumer,review_version,digest,state) values
      ('${selectedOutbox}','${set}','${selectedItem}','knowledge_recheck_projection',1,'${'e'.repeat(64)}','queued'),
      ('${otherOutbox}','${set}','${otherItem}','knowledge_recheck_projection',1,'${'e'.repeat(64)}','queued');`);
    const inventory=()=>db(`select jsonb_build_object('set',(select to_jsonb(s) from knowledge_review_private.source_impact_sets s where id='${set}'),
      'pages',(select jsonb_agg(to_jsonb(p)) from knowledge_review_private.source_impact_pages p where set_id='${set}'),
      'items',(select jsonb_agg(to_jsonb(i) order by id) from knowledge_review_private.source_impact_items i where set_id='${set}'),
      'outbox',(select jsonb_agg(to_jsonb(o) order by id) from knowledge_review_private.source_impact_outbox o where set_id='${set}'),
      'text',(select to_jsonb(c) from turn_private.text_content c where turn_id='${selected}'));`);
    const before=await inventory();
    const effects=JSON.parse(await db(`begin;update turn_private.text_content set input_text='[deleted by scoped conversation request]',output_kind=null,output_text=null,hidden_at=clock_timestamp() where turn_id='${selected}';
      select jsonb_build_object('mixedPages',(select count(*) from knowledge_review_private.source_impact_pages where set_id='${set}'),
      'unselectedOutbox',(select state from knowledge_review_private.source_impact_outbox where id='${otherOutbox}'),
      'unselectedError',(select error_code from knowledge_review_private.source_impact_outbox where id='${otherOutbox}'),
      'mixedSetStatus',(select status from knowledge_review_private.source_impact_sets where id='${set}'),
      'unselectedTextVisible',(select hidden_at is null from turn_private.text_content where turn_id='${other}'),
      'selectedItems',(select count(*) from knowledge_review_private.source_impact_items where id='${selectedItem}'),
      'unselectedItems',(select count(*) from knowledge_review_private.source_impact_items where id='${otherItem}'));rollback;`));
    assert.deepEqual(effects,{mixedPages:0,unselectedOutbox:'stale',unselectedError:'private_source_removed',mixedSetStatus:'invalidated',unselectedTextVisible:true,selectedItems:0,unselectedItems:1});
    assert.equal(await inventory(),before);
    evidence.finding={code:'SOURCE_UNSUPPORTED',relation:'knowledge_review_private.source_impact_sets.graph_snapshot[].target historical_answer',effects,
      producer:'knowledge_review_private.impact_graph(uuid)',trigger:'clear_source_impact_on_text_hide',rollback:'PASS',
      fixture:'Valid schema rows seeded as fixture postgres; existing real trigger/function, no trigger bypass or new erasure RPC.'};
  });
  assert.ok(evidence.finding, 'Reproduction must succeed before publishing evidence');
  const target='artifacts/VPJ-58/conversation-data-sql';mkdirSync(target,{recursive:true});
  writeFileSync(target+'/source-catalog.json',JSON.stringify(evidence,null,2)+'\n');
  console.log('SOURCE_UNSUPPORTED reproduction verified; baseline catalog saved; owned fixture cleanup follows.');
});
