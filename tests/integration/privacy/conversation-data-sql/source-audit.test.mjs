// Actual local PostgreSQL source/RPC fixtures. Admin-seeded relations and SQL
// claims remain separate from signed Auth and target acceptance.
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
  let originalSource,tasklessOutcome;
  const mixedOnly = process.env.VP_CONVERSATION_MIXED_COPY_ONLY === '1';
  const paginationOnly = process.env.VP_CONVERSATION_PAGINATION_ONLY === '1';
  const fencesOnly = process.env.VP_CONVERSATION_FENCES_ONLY === '1';
  const runCase = (name, ...args) => (mixedOnly && !/actual mapped|real text-hide|new private state|actual fixed-point|connected mixed-copy/.test(name))
    || (paginationOnly && !/new private state|progress pagination/.test(name))
    || (fencesOnly && !/real text-hide|new private state|connected mixed-copy|ordinary scoped RPC|actual retained task|shared entity guards/.test(name)) ? Promise.resolve() : t.test(name, ...args);
  await runCase('actual mapped table definitions, all inbound/outbound FKs, JSON columns and trigger bodies', async () => {
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

  await runCase('real text-hide trigger mutates mixed impact set outside selected Turn; rollback restores all', async () => {
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
      if(turn===selected)originalSource={owner,session,policy,consent,thread,task,turn};
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
  await runCase('new private state prefix rolls back; defaults deny; session deletion retains own binding and account deletion cascades', async () => {
    const source=readFileSync('supabase/migrations/'+boundary,'utf8');
    const oldFunctions=()=>db("select md5(string_agg(p.oid::regprocedure::text||p.prosrc||coalesce(p.proacl::text,'')||coalesce(p.proconfig::text,''),'' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in('pg_catalog','information_schema','conversation_data_private') and p.proname<>'privacy_conversation_data_v1';");
    const before=await oldFunctions();
    await db('begin;'+source+'rollback;');
    assert.equal(await db("select to_regnamespace('conversation_data_private') is null;"),'t');
    assert.equal(await oldFunctions(),before);
    await db('begin;'+source+'commit;');assert.equal(await oldFunctions(),before);
    assert.equal(await db('select conversation_data_private.schema_supported_v1();'),'t');
    assert.equal(await db('begin;alter table public.chat_turn_events add column unexpected_reference uuid;select conversation_data_private.schema_supported_v1();rollback;'),'f');
    assert.equal(await db('select conversation_data_private.schema_supported_v1();'),'t');
    for (const role of ['anon','authenticated','service_role']) {
      assert.equal(await db(`select has_schema_privilege('${role}','conversation_data_private','USAGE');`),'f');
      assert.equal(await db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='conversation_data_private' and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
      assert.equal(await db(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='conversation_data_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,DELETE'));`),'0');
    }
    const owner=uuid(),session=uuid(),request=uuid();
    await db(`insert into auth.users values('${owner}');insert into auth.sessions(id,user_id) values('${session}','${owner}');
      insert into conversation_data_private.operations_v1(request_id,owner_id,session_id,mobile_epoch,scope,root_kind,root_id,object_ids,source_digest,preview_digest,source_authorities,captured_at,expires_at,graph,erase_counts,redact_counts,retain_counts,retained_references,conflicts)
      values('${request}','${owner}','${session}',1,'conversation-sensitive-data/1','thread','${uuid()}',array[]::uuid[],'${'a'.repeat(64)}','${'b'.repeat(64)}','[]',1,30001,'{}','{}','{}','{}','{}','[]');
      delete from auth.sessions where id='${session}';`);
    assert.equal(await db(`select count(*) from conversation_data_private.operations_v1 where request_id='${request}';`),'1');
    const forbidden=await sql(container,`update conversation_data_private.operations_v1 set root_id='${uuid()}' where request_id='${request}';`);
    assert.notEqual(forbidden.code,0);assert.match(forbidden.stderr,/CONVERSATION_CONFLICT/);
    const leakedProof=await sql(container,`begin;insert into conversation_data_private.transaction_proofs_v1(transaction_id,owner_id,request_id,source_digest,graph,expires_at)
      values(pg_current_xact_id(),'${owner}','${request}','${'a'.repeat(64)}','{}',30001);commit;`);
    assert.notEqual(leakedProof.code,0);assert.match(leakedProof.stderr,/CONVERSATION_CONFLICT/);
    assert.equal(await db('select count(*) from conversation_data_private.transaction_proofs_v1;'),'0');
    await db(`delete from auth.users where id='${owner}';`);
    assert.equal(await db(`select count(*) from conversation_data_private.operations_v1 where request_id='${request}';`),'0');
    evidence.prefix={kind:'partial-private-state-only',digest:hash(source),rollback:'PASS',oldFunctions:'unchanged',defaultACL:'denied',sessionCascade:'none',accountCascade:'original owner deletion',publicRPC:'not implemented'};
  });
  await runCase('actual fixed-point graph inventory and stored impact relation blocker, with no source effects',async()=>{
    const s=originalSource;
    const a=JSON.parse(await db(`select conversation_data_private.source_v1('${s.owner}','thread','${s.thread}');`));
    assert.deepEqual(a.graph.threadIds,[s.thread]);assert.deepEqual(a.graph.turnIds,[s.turn]);assert.deepEqual(a.graph.taskIds,[s.task]);
    assert.deepEqual(a.sourceAuthorities,[{policyId:s.policy,consentId:s.consent}]);
    assert.ok(a.conflicts.includes('SOURCE_UNSUPPORTED'));assert.equal(a.redactCounts.textBodies,1);
    assert.equal(await db(`select input_text from turn_private.text_content where turn_id='${s.turn}';`),'Synthetic private input');
    const baseline=a.sourceDigest;
    const changed=JSON.parse(await db(`begin;update knowledge_review_private.source_impact_outbox set state='failed' where set_id in(select id from knowledge_review_private.source_impact_sets where author_id='${s.owner}');
      select conversation_data_private.source_v1('${s.owner}','thread','${s.thread}');rollback;`));
    assert.notEqual(changed.sourceDigest,baseline);
    assert.equal(JSON.parse(await db(`select conversation_data_private.source_v1('${s.owner}','thread','${s.thread}');`)).sourceDigest,baseline);
    const revoked=await sql(container,`begin;update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id='${s.owner}' and policy_id='${s.policy}';
      select conversation_data_private.authorities_current_v1('${s.owner}',${json(a.sourceAuthorities)});rollback;`);
    assert.notEqual(revoked.code,0);assert.match(revoked.stderr,/DATA_POLICY_BLOCKED/);
    evidence.source={kind:'private graph constructor only',impactBlocker:'SOURCE_UNSUPPORTED',authorities:'actual original singleton',effects:'none'};
  });
  await runCase('connected mixed-copy CAS covers six tables and both old/new cross-set parents without erasing any copy',async()=>{
    const a=originalSource,ids=Array.from({length:12},()=>uuid());
    const [setA,setB,setC,itemA,itemB,outA,outB,projectionA,projectionB,op,source]=ids;
    const target={kind:'historical_answer',id:a.turn};
    await db(`begin;
      insert into knowledge_review_private.source_revisions(id,source_key,revision_label,declaration,snippet_hash,submitted_by)
      values('${source}','mixed-copy-source','1','{}','${'d'.repeat(64)}','${a.owner}');
      insert into knowledge_review_private.source_impact_sets(id,operation_id,source_id,signal_kind,source_snapshot,graph_snapshot,digest,author_id)
      values('${setA}','${uuid()}','${source}','observation_unavailable','{}',${json([target])},'${'a'.repeat(64)}','${a.owner}'),
      ('${setB}','${uuid()}','${source}','observation_unavailable','{}','[]','${'b'.repeat(64)}','${a.owner}'),
      ('${setC}','${uuid()}','${source}','observation_unavailable','{}','[]','${'c'.repeat(64)}','${a.owner}');
      insert into knowledge_review_private.source_impact_items(id,set_id,target_key,target)
      values('${itemA}','${setA}','selected',${json(target)}),('${itemB}','${setB}','independent','{"kind":"wiki_page","id":"${uuid()}"}');
      insert into knowledge_review_private.source_impact_pages(set_id,cursor_key,base_version,receipt)
      values('${setB}','',1,'{"copy":"independent page"}');
      insert into knowledge_review_private.source_impact_outbox(id,set_id,item_id,consumer,review_version,digest,state)
      values('${outA}','${setB}','${itemA}','knowledge_recheck_projection',1,'${'a'.repeat(64)}','stale'),
      ('${outB}','${setB}','${itemB}','knowledge_recheck_projection',1,'${'b'.repeat(64)}','acked');
      insert into knowledge_review_private.source_impact_projections(id,delivery_id,set_id,target,source_snapshot,disposition,review_version,digest)
      values('${projectionA}','${outA}','${setB}','{"kind":"wiki_page","id":"${uuid()}"}','{}','recheck_required',1,'${'a'.repeat(64)}'),
      ('${projectionB}','${outB}','${setC}','{"kind":"wiki_page","id":"${uuid()}"}','{}','recheck_required',1,'${'b'.repeat(64)}');
      update knowledge_review_private.source_impact_outbox set receipt_id='${projectionB}' where id='${outA}';
      insert into knowledge_review_private.source_impact_review_requests(delivery_id,projection_id) values('${outA}','${projectionB}');commit;`);
    const sourceQuery=`select conversation_data_private.source_v1('${a.owner}','thread','${a.thread}');`;
    const baseline=JSON.parse(await db(sourceQuery));assert.ok(baseline.conflicts.includes('SOURCE_UNSUPPORTED'));
    const whole=JSON.parse(await db(`select conversation_data_private.impact_inventory_v1(${json(baseline.graph)});`));
    assert.equal(whole.overflow,false);
    assert.deepEqual([...new Set(whole.rows.map(r=>r.table))].sort(),['sets','items','pages','outbox','projections','review_requests'].map(x=>'knowledge_review_private.source_impact_'+x).sort());
    const mutations=[
      `update knowledge_review_private.source_impact_sets set version=version+1 where id='${setC}'`,
      `insert into knowledge_review_private.source_impact_items(set_id,target_key,target) values('${setB}','added independent','{"kind":"wiki_page","id":"${uuid()}"}')`,
      `delete from knowledge_review_private.source_impact_pages where set_id='${setB}'`,
      `update knowledge_review_private.source_impact_outbox set error_code='changed terminal copy' where id='${outB}'`,
      `delete from knowledge_review_private.source_impact_review_requests where delivery_id='${outA}'`,
      `delete from knowledge_review_private.source_impact_projections where id='${projectionA}'`,
    ];
    for(const mutation of mutations){
      const changed=JSON.parse(await db(`begin;${mutation};${sourceQuery}rollback;`));
      assert.notEqual(changed.sourceDigest,baseline.sourceDigest,mutation);
      assert.equal(JSON.parse(await db(sourceQuery)).sourceDigest,baseline.sourceDigest);
    }
    const parents=JSON.parse(await db(`select jsonb_agg(entity_id) from conversation_data_private.parents_v1('knowledge_review_private.source_impact_outbox',
      (select to_jsonb(o) from knowledge_review_private.source_impact_outbox o where id='${outA}'));`));
    assert.ok(parents.includes(a.turn));
    // A retained operation is a fixture tombstone only; no fake RPC ACK or erase proof.
    const tombstone=`insert into conversation_data_private.operations_v1(request_id,owner_id,session_id,mobile_epoch,scope,root_kind,root_id,object_ids,source_digest,preview_digest,source_authorities,captured_at,expires_at,state,preview_erased,request_digest,decision)
      values('${op}','${a.owner}','${a.session}',1,'conversation-sensitive-data/1','thread','${uuid()}',array[]::uuid[],'${'a'.repeat(64)}','${'b'.repeat(64)}','[]',1,30001,'erased',true,'${'c'.repeat(64)}',
      '{"graph":{"turnIds":["${a.turn}"],"threadIds":[],"taskIds":[],"conversationIds":[],"goalIds":[],"messageIds":[],"artifactIds":[]}}');`;
    for(const mutation of [
      `update knowledge_review_private.source_impact_outbox set set_id='${setC}',item_id='${itemB}',receipt_id=null where id='${outA}'`,
      `insert into knowledge_review_private.source_impact_outbox(id,set_id,item_id,consumer,review_version,digest,state,receipt_id) values('${uuid()}','${setC}','${itemB}','fixture',1,'${'a'.repeat(64)}','stale','${projectionA}')`,
      `insert into knowledge_review_private.source_impact_review_requests(delivery_id,projection_id) values('${outB}','${projectionA}')`,
      `insert into knowledge_review_private.source_impact_sets(operation_id,source_id,signal_kind,source_snapshot,graph_snapshot,digest,author_id) values('${uuid()}','${source}','observation_unavailable','{}',${json([target])},'${'a'.repeat(64)}','${a.owner}')`,
    ]){
      const refused=await sql(container,`begin;${tombstone}${mutation};rollback;`);
      assert.notEqual(refused.code,0);assert.match(refused.stderr,/CONVERSATION_CONFLICT/);
    }
    assert.equal(JSON.parse(await db(sourceQuery)).sourceDigest,baseline.sourceDigest);
    evidence.mixedCopies={kind:'admin-seeded valid six-table rows; actual constructor/guards',CAS:'all six whole-row mutations change digest; rollback restores it',
      crossSet:'item/delivery/projection/receipt/review closure',oldNewParents:'moves and stale parent insert rejected',effects:'no copies erased'};
  });
  await runCase('ordinary scoped RPC actually erases standalone metadata and recovers immutable original bytes',async()=>{
    for(const role of ['anon','authenticated','service_role'])assert.equal(await db(`select has_function_privilege('${role}','public.privacy_conversation_data_v1(text,text,bigint)','EXECUTE');`),'f');
    await db('grant execute on function public.privacy_conversation_data_v1(text,text,bigint) to authenticated;');
    const owner=uuid(),session=uuid(),thread=uuid(),turn=uuid(),request=uuid();
    const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:session}))};`;
    await db(`insert into auth.users values('${owner}');insert into auth.sessions(id,user_id) values('${session}','${owner}');
      insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${owner}','${session}',1);
      insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${owner}','${uuid()}','${session}',1);
      ${claims}insert into public.chat_threads(id,owner_id) values('${thread}','${owner}');
      insert into public.turns(id,owner_id,thread_id,status) values('${turn}','${owner}','${thread}','completed');
      insert into public.chat_turn_events(owner_id,thread_id,turn_id,event_id,sequence,schema_version,event_type,state)
      values('${owner}','${thread}','${turn}','fixture',1,'turn-sse-v1','terminal','completed');`);
    const query=(action,bytes)=>`begin;${claims}set role authenticated;select public.privacy_conversation_data_v1(${lit(action)},${lit(bytes)},1);commit;`;
    const call=async c=>JSON.parse(await db(query(c.action,JSON.stringify(c))));
    const selection={scope:'conversation-sensitive-data/1',requestId:request,rootKind:'thread',rootId:thread,objectIds:[]};
    const list=await call({action:'list',scope:selection.scope,rootKind:'thread',cursor:null,limit:20});assert.equal(list.items.length,1);
    const p=await call({action:'preview',...selection});assert.equal(p.eligible,true);assert.equal(p.eraseCounts.turns,1);assert.deepEqual(p.sourceAuthorities,[]);
    const command={action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true};
    const bytes='  '+JSON.stringify(command)+'\n';
    const receipt=JSON.parse(await db(query('erase',bytes)));assert.equal(receipt.state,'erased');assert.equal(receipt.decision.erasedCounts.events,1);
    assert.equal(receipt.decision.retainedFences,2);assert.equal(receipt.decision.requestDigest,hash(bytes));
    assert.equal(await db(`select count(*) from public.chat_threads where id='${thread}';`),'0');
    assert.equal(await db('select count(*) from conversation_data_private.transaction_proofs_v1;'),'0');
    assert.deepEqual(await call({action:'recover',...selection,mutationBytes:bytes}),receipt);
    const restore=await sql(container,`${claims}insert into public.chat_threads(id,owner_id) values('${thread}','${owner}');`);
    assert.notEqual(restore.code,0);assert.match(restore.stderr,/CONVERSATION_CONFLICT/);
    evidence.rpc={kind:'SQL claims fixture; actual RPC and source effects',erase:'PASS',exactBytesRecover:'PASS',rootRestore:'rejected',proofAtCommit:'absent'};
  });
  await runCase('taskless goal conversation actually erases; terminal recovery retains and rechecks original authority; progress self-inventory exits',async()=>{
    const a=originalSource,conversation=uuid(),goal=uuid(),message=uuid(),request=uuid();
    const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};`;
    await db(`${claims}select public.submit_assistant_message_v1('${conversation}','${message}','${uuid()}','${a.policy}','en','Synthetic record-only goal','goal_start','${goal}',null,null,null,null);`);
    const query=(action,bytes)=>`begin;${claims}set role authenticated;select public.privacy_conversation_data_v1(${lit(action)},${lit(bytes)},1);commit;`;
    const call=async c=>JSON.parse(await db(query(c.action,JSON.stringify(c))));
    const selection={scope:'conversation-sensitive-data/1',requestId:request,rootKind:'conversation',rootId:conversation,objectIds:[]};
    const p=await call({action:'preview',...selection});assert.equal(p.eligible,true);assert.deepEqual(p.graph.taskIds,[]);
    assert.deepEqual(p.sourceAuthorities,[{policyId:a.policy,consentId:a.consent}]);
    const command={action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true};const bytes='\n'+JSON.stringify(command)+' ';
    const receipt=JSON.parse(await db(query('erase',bytes)));assert.equal(receipt.decision.erasedCounts.conversations,1);assert.equal(receipt.decision.erasedCounts.messages,1);
    tasklessOutcome={claims,selection,bytes,receipt};
    assert.equal(await db(`select count(*) from turn_private.assistant_conversations where id='${conversation}';`),'0');
    assert.deepEqual(await call({action:'recover',...selection,mutationBytes:bytes}),receipt);
    const revoked=await sql(container,`begin;update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id='${a.owner}' and policy_id='${a.policy}';${claims}
      set role authenticated;select public.privacy_conversation_data_v1('recover',${lit(JSON.stringify({action:'recover',...selection,mutationBytes:bytes}))},1);rollback;`);
    assert.notEqual(revoked.code,0);assert.match(revoked.stderr,/DATA_POLICY_BLOCKED/);
    const list=await call({action:'list',scope:'conversation-delete-progress/1',rootKind:null,cursor:null,limit:20});
    const original=list.items.find(x=>x.requestId===request);assert.ok(original);assert.deepEqual(original.sourceAuthorities,p.sourceAuthorities);assert.equal(original.previewErased,true);
    const progress={scope:'conversation-delete-progress/1',requestId:uuid(),rootKind:null,rootId:null,objectIds:[request]};
    const pp=await call({action:'preview',...progress});assert.deepEqual(pp.sourceAuthorities,p.sourceAuthorities);
    const pc={action:'erase',...progress,sourceDigest:pp.sourceDigest,previewDigest:pp.previewDigest,confirmed:true};
    const pr=await call(pc);assert.equal(pr.decision.sourceConversation,'not_modified');assert.equal(pr.decision.clearedPreviews,0);assert.equal(pr.decision.retainedFences,1);
    const final=await call({action:'list',scope:progress.scope,rootKind:null,cursor:null,limit:20});assert.ok(final.items.find(x=>x.requestId===progress.requestId));
    assert.equal(await db(`select count(*) from conversation_data_private.operations_v1 where request_id='${request}';`),'1');
    evidence.taskless={kind:'actual SQL claims RPC',originalAuthority:'retained and requalified',source:'erased',progress:'own operation discoverable; original decision retained'};
  });
  await runCase('actual retained task/text/capacity/budget fields survive with fixed markers and old completion cannot revive text',async()=>{
    const a=originalSource,thread=uuid(),turn=uuid(),task=uuid(),request=uuid(),budget=uuid(),attempt=uuid();
    const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};`;
    await db(`begin;${claims}insert into public.chat_threads(id,owner_id) values('${thread}','${a.owner}');
      insert into public.turns(id,owner_id,thread_id,status) values('${turn}','${a.owner}','${thread}','completed');
      insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
      values('${task}','${a.owner}','${thread}','${turn}','${turn}','${a.policy}','${a.consent}',1,'${'a'.repeat(64)}');
      insert into turn_private.service_task_turns(turn_id,task_id,owner_id,relationship,idempotency_key,request_digest)
      values('${turn}','${task}','${a.owner}','new_goal','${uuid()}','${'b'.repeat(64)}');
      insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text,output_kind,output_text)
      values('${turn}','${a.owner}','${thread}','${a.policy}','${a.consent}','en','Private selected input','answered','Private selected answer');commit;
      insert into turn_private.service_task_capacity(task_id,owner_id,policy_version,tier,admitted_at,state,settled_turn_id,settled_at)
      values('${task}','${a.owner}','service-task-development/1','free',clock_timestamp(),'settled','${turn}',clock_timestamp());
      insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at)
      values('${budget}','${a.owner}','CNY',10000,1000,3,3,true,clock_timestamp()+interval '1 day');
      insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled)
      values('${budget}','qwen','synthetic','fixture',10000,1000,true);
      insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,actual_micros,status)
      values('${budget}','${attempt}','${task}','qwen','synthetic','fixture',10,5,'settled');`);
    const retained=()=>db(`select jsonb_build_object('capacity',(select to_jsonb(actual) from turn_private.service_task_capacity actual where task_id='${task}'),
      'budget',(select to_jsonb(actual) from public.model_budget_attempts actual where attempt_id='${attempt}'),
      'links',(select to_jsonb(actual) from turn_private.service_task_turns actual where turn_id='${turn}'),
      'task',(select to_jsonb(actual)-'goal_digest' from turn_private.service_tasks actual where id='${task}'));`);
    const before=await retained();const selection={scope:'conversation-sensitive-data/1',requestId:request,rootKind:'thread',rootId:thread,objectIds:[]};
    const query=c=>`begin;${claims}set role authenticated;select public.privacy_conversation_data_v1(${lit(c.action)},${lit(JSON.stringify(c))},1);commit;`;
    const p=JSON.parse(await db(query({action:'preview',...selection})));assert.equal(p.eligible,true);
    assert.equal(p.retainCounts.budgetAttempts,1);assert.equal(p.retainCounts.capacity,1);assert.equal(p.redactCounts.textBodies,1);
    const r=JSON.parse(await db(query({action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true})));assert.equal(r.state,'erased');
    assert.equal(await retained(),before);
    assert.equal(await db(`select input_text='[deleted by scoped conversation request]' and output_kind is null and output_text is null and hidden_at is not null from turn_private.text_content where turn_id='${turn}';`),'t');
    assert.equal(await db(`select goal_digest from turn_private.service_tasks where id='${task}';`),hash('[deleted by scoped conversation request]'));
    const callback=await sql(container,`update turn_private.text_content set thread_id='${a.thread}',input_text='late old provider body',hidden_at=null where turn_id='${turn}';`);
    assert.notEqual(callback.code,0);assert.match(callback.stderr,/CONVERSATION_CONFLICT/);
    assert.equal(JSON.parse(await db(`${claims}select public.read_text_turn('${turn}');`)).kind,'unavailable');
    const sourceRevision=await db(`select source_id from knowledge_review_private.source_impact_sets where author_id='${a.owner}' limit 1;`);
    const lateImpact=await sql(container,`insert into knowledge_review_private.source_impact_sets(operation_id,source_id,signal_kind,source_snapshot,graph_snapshot,digest,author_id)
      values('${uuid()}','${sourceRevision}','observation_unavailable','{}',${json([{kind:'historical_answer',id:turn}])},'${'a'.repeat(64)}','${a.owner}');`);
    assert.notEqual(lateImpact.code,0);assert.match(lateImpact.stderr,/CONVERSATION_CONFLICT/);
    evidence.retention={taskText:'fixed marker/permanent hide',capacityBudgetTaskLinks:'all original columns unchanged',oldCallback:'rejected'};
  });
  await runCase('late real absolute deadline rolls back source/fence/receipt after effects; fixed original preview never renews', {timeout:45000},async()=>{
    const a=originalSource,thread=uuid(),request=uuid();
    const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};`;
    await db(`${claims}insert into public.chat_threads(id,owner_id) values('${thread}','${a.owner}');`);
    const selection={scope:'conversation-sensitive-data/1',requestId:request,rootKind:'thread',rootId:thread,objectIds:[]};
    const query=c=>`begin;${claims}set role authenticated;select public.privacy_conversation_data_v1(${lit(c.action)},${lit(JSON.stringify(c))},1);commit;`;
    const p=JSON.parse(await db(query({action:'preview',...selection})));
    const before=await db(`select to_jsonb(actual) from conversation_data_private.operations_v1 actual where request_id='${request}';`);
    // Owned fixture fault: real time advances inside AFTER DELETE. No clock or
    // deadline guard override, no caller GUC authority, no target table change.
    await db(`create function public.conversation_fixture_delay() returns trigger language plpgsql as $$begin if old.id='${thread}'::uuid then perform pg_sleep(2);end if;return old;end$$;
      create trigger zz_conversation_fixture_delay after delete on public.chat_threads for each row execute function public.conversation_fixture_delay();`);
    await new Promise(r=>setTimeout(r,Math.max(0,p.expiresAt-Date.now()-1000)));
    const c={action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true};
    const late=await sql(container,query(c));assert.notEqual(late.code,0);assert.match(late.stderr,/CONVERSATION_EXPIRED/);
    await db('drop trigger zz_conversation_fixture_delay on public.chat_threads;drop function public.conversation_fixture_delay();');
    assert.equal(await db(`select count(*) from public.chat_threads where id='${thread}';`),'1');
    assert.equal(await db(`select to_jsonb(actual) from conversation_data_private.operations_v1 actual where request_id='${request}';`),before);
    assert.equal(await db('select count(*) from conversation_data_private.transaction_proofs_v1;'),'0');
    const reuse=await sql(container,query({action:'preview',...selection}));assert.notEqual(reuse.code,0);assert.match(reuse.stderr,/CONVERSATION_EXPIRED/);
    evidence.deadline={clock:'real original 30 seconds',lateAfterEffects:'complete rollback',previewReuse:'expired, not renewed'};
  });
  await runCase('full-row CAS rejects a changed goal body; foreign recover equals absent unknown; active work and NOWAIT retain source',async()=>{
    const a=originalSource,conversation=uuid(),goal=uuid(),message=uuid();
    const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};`;
    await db(`${claims}select public.submit_assistant_message_v1('${conversation}','${message}','${uuid()}','${a.policy}','en','CAS original private goal','goal_start','${goal}',null,null,null,null);`);
    const query=(c,epoch=1)=>`begin;${claims}set role authenticated;select public.privacy_conversation_data_v1(${lit(c.action)},${lit(JSON.stringify(c))},${epoch});commit;`;
    const call=async c=>JSON.parse(await db(query(c)));
    const selection={scope:'conversation-sensitive-data/1',requestId:uuid(),rootKind:'conversation',rootId:conversation,objectIds:[]};
    const p=await call({action:'preview',...selection});const command={action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true};
    await db(`update turn_private.assistant_goals set current_text='Changed private goal' where id='${goal}';`);
    const changed=await sql(container,query(command));assert.notEqual(changed.code,0);assert.match(changed.stderr,/CONVERSATION_SOURCE_CHANGED/);
    assert.equal(await db(`select current_text from turn_private.assistant_goals where id='${goal}';`),'Changed private goal');
    const stale=await sql(container,query({action:'preview',...selection},2));assert.notEqual(stale.code,0);assert.match(stale.stderr,/SESSION_REPLACED/);
    const foreignOwner=uuid(),foreignRequest=uuid();await db(`insert into auth.users values('${foreignOwner}');
      insert into conversation_data_private.operations_v1(request_id,owner_id,session_id,mobile_epoch,scope,root_kind,root_id,object_ids,source_digest,preview_digest,source_authorities,captured_at,expires_at,graph,erase_counts,redact_counts,retain_counts,retained_references,conflicts)
      values('${foreignRequest}','${foreignOwner}','${uuid()}',1,'conversation-sensitive-data/1','thread','${uuid()}',array[]::uuid[],'${'a'.repeat(64)}','${'b'.repeat(64)}','[]',1,30001,'{}','{}','{}','{}','{}','[]');`);
    const unknownFor=async request=>{const s={...selection,requestId:request};const m={...command,...s};return call({action:'recover',...s,mutationBytes:JSON.stringify(m)});};
    const foreign=await unknownFor(foreignRequest),absent=await unknownFor(uuid());
    assert.equal(foreign.kind,'unknown');assert.equal(absent.kind,'unknown');assert.equal(foreign.ownerId,a.owner);
    assert.deepEqual(Object.keys(foreign).sort(),Object.keys(absent).sort());assert.equal(JSON.stringify(foreign).includes(foreignOwner),false);
    const thread=uuid(),turn=uuid();await db(`${claims}insert into public.chat_threads(id,owner_id) values('${thread}','${a.owner}');insert into public.turns(id,owner_id,thread_id,status) values('${turn}','${a.owner}','${thread}','accepted');`);
    const activeSelection={scope:'conversation-sensitive-data/1',requestId:uuid(),rootKind:'thread',rootId:thread,objectIds:[]};
    const active=await call({action:'preview',...activeSelection});assert.ok(active.conflicts.includes('ACTIVE_WORK'));assert.equal(active.eligible,false);
    const refused=await sql(container,query({action:'erase',...activeSelection,sourceDigest:active.sourceDigest,previewDigest:active.previewDigest,confirmed:true}));assert.notEqual(refused.code,0);assert.match(refused.stderr,/CONVERSATION_CONFLICT/);
    const marker='conversation-lock-'+uuid();
    const holder=sql(container,`set application_name=${lit(marker)};begin;select 1 from public.chat_threads where id='${thread}' for update;select pg_sleep(1.5);rollback;`);
    for(let i=0;i<100;i++){if(await db(`select exists(select 1 from pg_stat_activity where application_name=${lit(marker)} and wait_event_type='Timeout');`)==='t')break;await new Promise(r=>setTimeout(r,10));}
    const locked=await sql(container,`${claims}update public.turns set status='cancelled' where id='${turn}';`);
    assert.notEqual(locked.code,0);assert.match(locked.stderr,/could not obtain lock|CONVERSATION_CONFLICT/);assert.equal((await holder).code,0);
    assert.equal(await db(`select status from public.turns where id='${turn}';`),'accepted');
    evidence.negatives={wholeRowCAS:'changed goal rejected',foreignRecover:'same unknown shape/actor as absent',active:'rejected without effects',concurrency:'NOWAIT rolls back'};
    const old=tasklessOutcome;assert.ok(Date.now()>old.receipt.expiresAt);
    assert.deepEqual(JSON.parse(await db(`begin;${old.claims}set role authenticated;select public.privacy_conversation_data_v1('recover',${lit(JSON.stringify({action:'recover',...old.selection,mutationBytes:old.bytes}))},1);commit;`)),old.receipt);
    evidence.terminalAfterTTL='same original bytes/authority returns original committed decision';
  });
  await runCase('linked confirmed Trip and explicit Memory complete rows remain unchanged under conversation erasure',async()=>{
    const a=originalSource,trip=uuid(),conversation=uuid(),goal=uuid(),message=uuid(),request=uuid();
    const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};`;
    await db(`${claims}insert into public.trips(id,owner_id,title) values('${trip}','${a.owner}','Original retained Trip');`);
    const proposal=JSON.parse(await db(`${claims}select row_to_json(actual) from public.create_trip_proposal_patch('${trip}','{"expectedVersion":0,"operations":[{"kind":"set_title","title":"Confirmed retained Trip"}]}') actual;`));
    const proposalDigest=await db(`${claims}select digest from public.read_trip_proposal_v2('${proposal.proposal_id}');`);
    assert.match(await db(`${claims}select * from public.confirm_and_apply_trip_proposal('${proposal.proposal_id}','${uuid()}','${proposalDigest}');`),/applied/);
    const consent=JSON.parse(await db(`${claims}select public.native_memory_command_v1(${json({action:'consentCreate',operationId:uuid()})});`));
    const memory=uuid(),memoryReceipt=uuid();
    await db(`${claims}select public.native_memory_command_v1(${json({action:'create',operationId:uuid(),memoryId:memory,receiptId:memoryReceipt,consentId:consent.consentId,constraintKind:'preference',summary:'Explicit retained Memory',saveLongTerm:true})});
      select public.submit_assistant_message_v1('${conversation}','${message}','${uuid()}','${a.policy}','en','Goal linked to retained Trip','goal_start','${goal}',null,null,null,null);
      select public.set_assistant_goal_trip_link_v1('${uuid()}','${conversation}','${goal}',null,1,0,'link','${trip}',1,true);`);
    const invariant=()=>db(`select jsonb_build_object('trip',(select to_jsonb(actual) from public.trips actual where id='${trip}'),
      'snapshots',(select jsonb_agg(to_jsonb(actual) order by version) from public.trip_version_snapshots actual where trip_id='${trip}'),
      'events',(select jsonb_agg(to_jsonb(actual) order by id) from public.trip_events actual where trip_id='${trip}'),
      'proposals',(select jsonb_agg(to_jsonb(actual) order by id) from public.trip_proposals actual where trip_id='${trip}'),
      'memory',(select to_jsonb(actual) from public.memory_profiles actual where id='${memory}'),
      'receipts',(select jsonb_agg(to_jsonb(actual) order by id) from public.memory_receipts actual where memory_id='${memory}'),
      'memoryConsent',(select to_jsonb(actual) from public.memory_consents actual where id='${consent.consentId}'),
      'goalTripReceipts',(select jsonb_agg(to_jsonb(actual) order by operation_id) from turn_private.assistant_goal_trip_receipts actual where conversation_id='${conversation}'));`);
    const before=await invariant();const selection={scope:'conversation-sensitive-data/1',requestId:request,rootKind:'conversation',rootId:conversation,objectIds:[]};
    const query=c=>`begin;${claims}set role authenticated;select public.privacy_conversation_data_v1(${lit(c.action)},${lit(JSON.stringify(c))},1);commit;`;
    const p=JSON.parse(await db(query({action:'preview',...selection})));assert.equal(p.eligible,true);assert.deepEqual(p.retainedReferences.tripIds,[trip]);
    const r=JSON.parse(await db(query({action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true})));assert.equal(r.decision.sourceTrip,'not_modified');assert.equal(r.decision.explicitMemory,'not_modified');
    assert.equal(await invariant(),before);
    evidence.tripMemory={confirmedTrip:'all tested content/snapshot/event/proposal rows unchanged',explicitMemory:'profile/receipt/consent rows unchanged',goalTripReceipts:'all columns unchanged'};
  });
  await runCase('shared entity guards preserve ordinary concurrent writers and keep erase overlap/late restore fail-closed',async()=>{
    const owner=uuid(),session=uuid(),thread=uuid(),turn=uuid(),request=uuid();
    const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:session}))};`;
    await db(`insert into auth.users values('${owner}');insert into auth.sessions(id,user_id) values('${session}','${owner}');
      insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${owner}','${session}',1);
      insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${owner}','${uuid()}','${session}',1);
      ${claims}insert into public.chat_threads(id,owner_id) values('${thread}','${owner}');
      insert into public.turns(id,owner_id,thread_id,status) values('${turn}','${owner}','${thread}','completed');`);
    const insertEvent=n=>`insert into public.chat_turn_events(owner_id,thread_id,turn_id,event_id,sequence,schema_version,event_type,state)
      values('${owner}','${thread}','${turn}','shared-${n}',${n},'turn-sse-v1','terminal','completed');`;
    const waitMarker=async marker=>{let seen=false;for(let n=0;n<100;n++){
      if(await db(`select exists(select 1 from pg_stat_activity where application_name=${lit(marker)} and wait_event='PgSleep');`)==='t'){seen=true;break;}
      await new Promise(r=>setTimeout(r,10));}assert.ok(seen,'actual owned transaction reached hold point');};
    const writerMarker='conversation-shared-'+uuid();
    const writer=sql(container,`set application_name=${lit(writerMarker)};begin;${insertEvent(1)}select pg_sleep(1);commit;`);
    await waitMarker(writerMarker);
    assert.equal((await sql(container,insertEvent(2))).code,0,'ordinary writers sharing thread/Turn preserve original concurrent writes');
    assert.equal((await writer).code,0);
    const selection={scope:'conversation-sensitive-data/1',requestId:request,rootKind:'thread',rootId:thread,objectIds:[]};
    const query=c=>`begin;${claims}set role authenticated;select public.privacy_conversation_data_v1(${lit(c.action)},${lit(JSON.stringify(c))},1);commit;`;
    const preview=JSON.parse(await db(query({action:'preview',...selection})));assert.equal(preview.eligible,true);assert.equal(preview.eraseCounts.events,2);
    const erase={action:'erase',...selection,sourceDigest:preview.sourceDigest,previewDigest:preview.previewDigest,confirmed:true};
    const heldWriterMarker='conversation-held-writer-'+uuid();
    const heldWriter=sql(container,`set application_name=${lit(heldWriterMarker)};begin;${insertEvent(3)}select pg_sleep(1);rollback;`);
    await waitMarker(heldWriterMarker);
    const refusedErase=await sql(container,query(erase));assert.notEqual(refusedErase.code,0);assert.match(refusedErase.stderr,/CONVERSATION_CONFLICT/);
    assert.equal((await heldWriter).code,0);assert.equal(await db(`select count(*) from public.chat_threads where id='${thread}';`),'1');
    const eraseMarker='conversation-held-erase-'+uuid();
    const heldErase=sql(container,`set application_name=${lit(eraseMarker)};begin;${claims}set role authenticated;
      select public.privacy_conversation_data_v1('erase',${lit(JSON.stringify(erase))},1);select pg_sleep(1);commit;`);
    await waitMarker(eraseMarker);
    const callback=await sql(container,insertEvent(4));assert.notEqual(callback.code,0);assert.match(callback.stderr,/CONVERSATION_CONFLICT/);
    const committed=await heldErase;assert.equal(committed.code,0,committed.stderr);
    assert.equal(await db(`select count(*) from public.chat_threads where id='${thread}';`),'0');
    const restore=await sql(container,`${claims}insert into public.chat_threads(id,owner_id) values('${thread}','${owner}');`);
    assert.notEqual(restore.code,0);assert.match(restore.stderr,/CONVERSATION_CONFLICT/);
    evidence.sharedFences={kind:'actual guarded writers and scoped erase RPC; SQL claims fixture',ordinary:'two shared-parent event writes commit',
      writerOverlap:'erase refuses held source writer',eraseOverlap:'late producer refuses exclusive erase',afterCommit:'permanent root restore refused'};
  });
  await runCase('progress pagination uses outer-scope request identity across repeated sensitive roots and progress rows',async()=>{
    const owner=uuid(),session=uuid(),root='f0000000-0000-4000-8000-000000000001';
    const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:session}))};`;
    await db(`insert into auth.users values('${owner}');insert into auth.sessions(id,user_id) values('${session}','${owner}');
      insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${owner}','${session}',1);
      insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${owner}','${uuid()}','${session}',1);
      ${claims}insert into public.chat_threads(id,owner_id) values('${root}','${owner}');
      grant execute on function public.privacy_conversation_data_v1(text,text,bigint) to authenticated;`);
    const query=c=>`begin;${claims}set role authenticated;select public.privacy_conversation_data_v1(${lit(c.action)},${lit(JSON.stringify(c))},1);commit;`;
    const call=async c=>JSON.parse(await db(query(c)));
    const requests=Array.from({length:25},(_,n)=>'10000000-0000-4000-8000-'+String(n+1).padStart(12,'0'));
    for(let n=0;n<requests.length;n++)await call({action:'preview',requestId:requests[n],
      ...(n%5===4?{scope:'conversation-delete-progress/1',rootKind:null,rootId:null,objectIds:[requests[0]]}
        :{scope:'conversation-sensitive-data/1',rootKind:'thread',rootId:root,objectIds:[]})});
    const listCommand={action:'list',scope:'conversation-delete-progress/1',rootKind:null,cursor:null,limit:20};
    const first=await call(listCommand);assert.equal(first.hasMore,true);assert.equal(first.items.length,20);
    assert.deepEqual(first.items.map(r=>r.requestId),requests.slice(0,20));assert.equal(first.nextCursor.afterId,requests[19]);
    assert.ok(first.items.some(r=>r.rootId===root));assert.ok(first.items.some(r=>r.rootId===null));
    const second=await call({...listCommand,cursor:first.nextCursor});assert.equal(second.hasMore,false);assert.equal(second.nextCursor,null);
    assert.equal(second.sourceDigest,first.sourceDigest);assert.deepEqual(second.items.map(r=>r.requestId),requests.slice(20));
    assert.deepEqual([...first.items,...second.items].map(r=>r.requestId),requests);
    for(const cursor of [{sourceDigest:first.sourceDigest,afterId:root},{sourceDigest:'a'.repeat(64),afterId:requests[19]},
      {sourceDigest:first.sourceDigest,afterId:'10000000-0000-4000-8000-000000000099'}]){
      const rejected=await sql(container,query({...listCommand,cursor}));assert.notEqual(rejected.code,0);assert.match(rejected.stderr,/CONVERSATION_SOURCE_CHANGED/);
    }
    const resumed=await call({...listCommand,cursor:{sourceDigest:first.sourceDigest,afterId:requests[4]}});
    assert.deepEqual(resumed.items.map(r=>r.requestId),requests.slice(5));assert.equal(resumed.hasMore,false);
    const last=await call({...listCommand,cursor:{sourceDigest:first.sourceDigest,afterId:requests[24]}});
    assert.deepEqual(last.items,[]);assert.equal(last.hasMore,false);assert.equal(last.nextCursor,null);
    const sensitive=await call({action:'list',scope:'conversation-sensitive-data/1',rootKind:'thread',cursor:null,limit:20});
    assert.deepEqual(sensitive.items.map(r=>r.rootId),[root]);
    const empty=await call({action:'list',scope:'conversation-sensitive-data/1',rootKind:'thread',cursor:{sourceDigest:sensitive.sourceDigest,afterId:root},limit:20});
    assert.deepEqual(empty.items,[]);assert.equal(empty.hasMore,false);assert.equal(empty.nextCursor,null);
    evidence.pagination={kind:'actual local SQL claims RPC; 25 real preview operations',progress:'requestId ordering across repeated roots and progress rows; 20+5 exact pages',
      anchors:'root alias/absent operation/digest mismatch rejected; existing operation resumes exactly',sensitive:'rootId anchor preserved',skipsDuplicates:'none'};
  });
  if (!paginationOnly && !fencesOnly) {
  assert.ok(evidence.finding, 'Reproduction must succeed before publishing evidence');
  assert.ok(evidence.prefix, 'Private state checks must succeed before publishing prefix evidence');
  assert.ok(evidence.source, 'Actual source constructor checks must succeed before publishing source evidence');
  if (!mixedOnly) {
  assert.ok(evidence.rpc, 'Actual RPC checks must succeed before publishing executor evidence');
  assert.ok(evidence.taskless, 'Taskless source/authority/progress checks must succeed before publishing evidence');
  assert.ok(evidence.retention, 'Real retained fields and callback checks must succeed before publishing evidence');
  assert.ok(evidence.deadline, 'Actual late deadline rollback must succeed before publishing evidence');
  assert.ok(evidence.negatives, 'Actual CAS/authority/concurrency negatives must succeed before publishing evidence');
  assert.ok(evidence.tripMemory, 'Actual retained Trip/Memory comparison must succeed before publishing evidence');
  }
  assert.ok(evidence.mixedCopies, 'Connected mixed-copy checks must succeed before publishing evidence');
  }
  if (fencesOnly) {
    for (const key of ['finding','prefix','mixedCopies','rpc','retention','sharedFences']) assert.ok(evidence[key], key+' must pass');
  }
  if (!mixedOnly && !fencesOnly) assert.ok(evidence.pagination, 'Actual progress pagination checks must succeed before publishing evidence');
  const target='artifacts/VPJ-58/conversation-data-sql';mkdirSync(target,{recursive:true});
  writeFileSync(target+(fencesOnly?'/shared-writer-fences-catalog.json':paginationOnly?'/progress-pagination-catalog.json':mixedOnly?'/mixed-copy-catalog.json':'/source-catalog.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(fencesOnly ? 'Shared writer/erasure fences verified; focused evidence saved; owned fixture cleanup follows.' : paginationOnly ? 'Progress pagination verified; focused evidence saved; owned fixture cleanup follows.'
    : 'SOURCE_UNSUPPORTED reproduction verified; baseline catalog saved; owned fixture cleanup follows.');
});
