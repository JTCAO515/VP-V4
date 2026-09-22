import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';

test('Trip deletion SQL: reauthentication, fencing, atomic completion, isolation and tombstone', { skip: process.env.VP_PRIVACY_DB_TEST !== '1', timeout: 180000 }, async t => {
  const container = 'vpj36-' + uuid().slice(0, 8);
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
  await db(readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort().map(f=>'begin;\n'+readFileSync('supabase/migrations/'+f,'utf8')+'\ncommit;').join('\n'));
  const owner=uuid(), other=uuid(), session=uuid(), otherSession=uuid(), oldSession=uuid(), trip=uuid(), request=uuid(), linked=uuid(), archived=uuid();
  await db(`insert into auth.users values('${owner}'),('${other}'); insert into auth.sessions(id,user_id) values('${session}','${owner}'),('${otherSession}','${other}'); insert into auth.sessions(id,user_id,created_at) values('${oldSession}','${owner}',now()-interval '1 hour');
    insert into public.trips(id,owner_id,title) values('${trip}','${owner}','Synthetic delete'),('${linked}','${owner}','Linked'),('${archived}','${owner}','Archived');`);
  const as=(actor,text,sid=actor===other?otherSession:session)=>`set request.jwt.claim.sub='${actor}'; set request.jwt.claims='{"session_id":"${sid}","role":"authenticated"}'; set role authenticated; ${text}`;
  const call=(actor=owner,id=trip,key=request,sid=session,version=1)=>as(actor,`select public.request_trip_deletion_v1('${key}','${id}',${version},true);`,sid);
  const denied=async(text,expected)=>{const r=await sql(container,text);assert.notEqual(r.code,0);assert.ok(r.stderr.includes(expected),r.stderr);};
  await denied(call(other,trip,request,otherSession),'FORBIDDEN');
  await denied(call(owner,trip,request,oldSession),'REAUTHENTICATION_REQUIRED');
  await denied(as(owner,`select public.request_trip_deletion_v1('${request}','${trip}',0,false);`),'INVALID_INPUT');
  await denied(as(owner,`delete from public.trips where id='${trip}';`),'permission denied');
  // Save actual content via confirmed patch and generate lineage before deletion.
  const proposal=JSON.parse(await db(as(owner,`select row_to_json(r) from public.create_trip_proposal_patch('${trip}','{"expectedVersion":0,"operations":[{"kind":"upsert_day","dayId":"day-test","date":"2026-09-22","timeZone":"Asia/Shanghai"},{"kind":"upsert_item","dayId":"day-test","itemId":"item-test","title":"Synthetic item"}]}') r;`)));
  const digest=await db(as(owner,`select digest from public.read_trip_proposal_v2('${proposal.proposal_id}');`));
  await db(as(owner,`select * from public.confirm_and_apply_trip_proposal('${proposal.proposal_id}','${uuid()}','${digest}');`));
  await db(`insert into public.chat_threads(owner_id,trip_id) values('${owner}','${linked}');`);
  await denied(call(owner,linked,uuid(),session,0),'TRIP_HAS_CHAT_REFERENCES');
  await denied(call(owner,trip,request,session,0),'STALE_TRIP_VERSION');
  // A failed receipt admission cannot fence the Trip.
  await db(`create function privacy_private.test_fail() returns trigger language plpgsql as $$ begin raise exception 'receipt fault'; end $$; create trigger test_fail before insert on privacy_private.trip_deletions for each row execute function privacy_private.test_fail();`);
  await denied(call(),'receipt fault');
  await db('drop trigger test_fail on privacy_private.trip_deletions;');
  const before=await db(`select jsonb_agg(to_jsonb(s)) from public.trip_version_snapshots s where trip_id='${trip}';`);
  const queued=await Promise.all([db(call()),db(call())]);
  for(const q of queued){assert.equal(JSON.parse(q).state,'queued');assert.equal(JSON.parse(q).allUserDataCompleted,false);}
  assert.equal(await db(`select count(*) from privacy_private.trip_deletions;`),'1');
  await denied(call(owner,linked,request,session,0),'IDEMPOTENCY_KEY_REUSE');
  await denied(as(other,`select public.read_trip_deletion_v1('${request}');`),'FORBIDDEN');
  await denied(`set role authenticated; select public.execute_trip_deletion_v1('${request}');`,'permission denied');
  await denied(`set role anon; select public.read_trip_deletion_v1('${request}');`,'permission denied');
  for(const statement of [
    `update public.trips set title='Late' where id='${trip}';`,
    `insert into public.chat_threads(owner_id,trip_id) values('${owner}','${trip}');`,
    `insert into public.turns(owner_id,trip_id,status) values('${owner}','${trip}','accepted');`,
    `insert into public.trip_days(trip_id,owner_id,day_id,trip_date) values('${trip}','${owner}','late','2026-09-23');`
  ])await denied(statement,'TRIP_DELETION_PENDING_OR_COMPLETED');
  assert.equal(await db(`select jsonb_agg(to_jsonb(s)) from public.trip_version_snapshots s where trip_id='${trip}';`),before);
  // Crash after source erasure but before completion rolls the complete transaction back.
  await db('create trigger test_fail before update on privacy_private.trip_deletions for each row execute function privacy_private.test_fail();');
  await denied(as(owner,`delete from public.trips where id='${trip}';`),'permission denied');
  const execute=`set role service_role; select public.execute_trip_deletion_v1('${request}');`;
  await denied(execute,'receipt fault');
  assert.equal(await db(`select jsonb_agg(to_jsonb(s)) from public.trip_version_snapshots s where trip_id='${trip}';`),before);
  assert.equal(JSON.parse(await db(as(owner,`select public.read_trip_deletion_v1('${request}');`))).state,'queued');
  await db('drop trigger test_fail on privacy_private.trip_deletions; drop function privacy_private.test_fail();');
  // A legacy writer holding Proposal before Trip cannot trap the worker.
  const held=sql(container,`set application_name='vpj36-proposal-lock'; begin; select id from public.trip_proposals where id='${proposal.proposal_id}' for update; select pg_sleep(2); commit;`);
  let sleeping=false;
  for(let i=0;i<30;i++){
    if(await db("select count(*) from pg_stat_activity where application_name='vpj36-proposal-lock' and wait_event='PgSleep';")==='1'){sleeping=true;break;}
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.ok(sleeping,'proposal lock acquired before worker attempt');
  await denied(execute,'lock timeout');
  assert.equal((await held).code,0);
  assert.equal(JSON.parse(await db(as(owner,`select public.read_trip_deletion_v1('${request}');`))).state,'queued');
  const racingWrite=sql(container,`begin; select 1 from public.trips where id='${trip}' for update; select pg_sleep(0.2); update public.trips set title='Race' where id='${trip}'; commit;`);
  const completions=await Promise.all([db(execute),db(execute)]);
  const raced=await racingWrite; if(raced.code!==0)assert.ok(raced.stderr.includes('TRIP_DELETION_PENDING_OR_COMPLETED'),raced.stderr);
  assert.equal(completions[0],completions[1]);
  const receipt=JSON.parse(completions[0]);assert.equal(receipt.state,'completed');assert.ok(receipt.completedAt);assert.equal(receipt.backupErasure,'not_verified');
  assert.equal(await db(call()),completions[0]);
  for(const table of ['trips','trip_days','trip_items','trip_proposals','trip_events','trip_audit_events','trip_version_snapshots']){
    assert.equal(await db(`select count(*) from public.${table} where ${table==='trips'?'id':'trip_id'}='${trip}';`),'0',table);
  }
  assert.equal(await db(`select count(*) from public.trip_idempotency where proposal_id='${proposal.proposal_id}';`),'0');
  await denied(`insert into public.trips(id,owner_id,title) values('${trip}','${owner}','Offline resurrect');`,'TRIP_DELETION_PENDING_OR_COMPLETED');
  await denied(`insert into public.trips(id,owner_id,title) values('${trip}','${other}','Cross owner resurrect');`,'TRIP_DELETION_PENDING_OR_COMPLETED');
  await db(as(owner,`insert into public.trips(owner_id,title) values('${owner}','Fresh trip allowed');`));
  assert.equal(await db(`select count(*) from public.trips where id='${linked}';`),'1');
  // Archived trips remain eligible; archive and delete are distinct operations.
  const ap=JSON.parse(await db(as(owner,`select row_to_json(r) from public.create_trip_proposal_patch('${archived}','{"expectedVersion":0,"operations":[{"kind":"set_title","title":"Archived synthetic"}]}') r;`)));
  const ad=await db(as(owner,`select digest from public.read_trip_proposal_v2('${ap.proposal_id}');`));
  await db(as(owner,`select * from public.confirm_and_apply_trip_proposal('${ap.proposal_id}','${uuid()}','${ad}'); select * from public.archive_trip_v1('${archived}',1,'${uuid()}',true);`));
  const ar=uuid();await db(call(owner,archived,ar));await db(`set role service_role; select public.execute_trip_deletion_v1('${ar}');`);
  assert.equal(await db(`select count(*) from public.trip_archives where trip_id='${archived}';`),'0');
  // Admission versus a new chat link must serialize, never admit both.
  for(let i=0;i<3;i++){
    const race=uuid(), key=uuid(); await db(`insert into public.trips(id,owner_id,title) values('${race}','${owner}','Race');`);
    const outcomes=await Promise.all([sql(container,call(owner,race,key,session,0)),sql(container,`insert into public.chat_threads(owner_id,trip_id) values('${owner}','${race}');`)]);
    assert.equal(outcomes.filter(r=>r.code===0).length,1);
    assert.ok(outcomes.some(r=>r.stderr.includes('TRIP_HAS_CHAT_REFERENCES') || r.stderr.includes('TRIP_DELETION_PENDING_OR_COMPLETED')));
  }
  await db(`delete from auth.sessions where id='${session}';`);
  await denied(as(owner,`select public.read_trip_deletion_v1('${request}');`),'SESSION_REPLACED');
});
