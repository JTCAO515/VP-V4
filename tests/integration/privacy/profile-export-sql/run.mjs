import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { command } from '../../cost/fixtures/postgres-rpc.mjs';
import { db, setContainer } from '../profile-data-sql/replay.mjs';
assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT);
const context=JSON.parse((await command('docker',['context','inspect'])).stdout)[0];
assert.ok(context.Endpoints.docker.Host.startsWith('unix:///'));
const container='vpj58-profile-export-'+randomUUID().slice(0,8);
process.env.VP_PROFILE_TEST_CONTAINER=container;
process.env.VP_PROFILE_EXPORT_TEST_CONTAINER=container;
process.env.VP_PROFILE_EXPORT_SQL='1';setContainer(container);
const profileRegression=process.argv.includes('--profile-regression');
const started=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
assert.equal(started.code,0,started.stderr);
try {
  for(let n=0;n<100;n++) {
    if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;
    await new Promise(r=>setTimeout(r,100));
  }
  const replay=await command(process.execPath,['tests/integration/privacy/profile-data-sql/replay.mjs','init']);
  process.stdout.write(replay.stdout);process.stderr.write(replay.stderr);assert.equal(replay.code,0);
  process.env.VP_PROFILE_EXPORT_RESULT_GUARD_HASH=await db("select md5(prosrc) from pg_proc where oid='result_data_private.guard_core_copy_v1()'::regprocedure");
  const fingerprint=()=>db("set search_path='';select md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname not in('pg_catalog','information_schema','extensions','auth')");
  const baseline=await fingerprint(),source=readFileSync('supabase/migrations/20261007040000_profile_core_export.sql','utf8');
  await db('begin;'+source+'rollback;');assert.equal(await fingerprint(),baseline);
  assert.equal(await db("select to_regclass('export_private.profile_snapshot_provenance_v1') is null and profile_data_private.schema_v1() and result_data_private.schema_supported_v1()"),'t');
  console.log('Whole append rollback restores all original function definitions/ACL/catalog PASS');
  await db('begin;'+source+'commit;');
  console.log('Current ordered append replay/catalog and fixed source identities PASS');
  if(profileRegression)process.env.VP_PROFILE_DATA_SQL='1';
  const files=profileRegression
    ? ['tests/integration/privacy/profile-data-sql/profile.test.mjs','tests/integration/privacy/profile-data-sql/result-compatibility.test.mjs']
    : ['tests/integration/privacy/profile-export-sql/postgres.test.mjs'];
  const result=await command(process.execPath,['--test','--test-concurrency=1',...files]);
  process.stdout.write(result.stdout);process.stderr.write(result.stderr);assert.equal(result.code,0);
} finally {
  const removed=await command('docker',['rm','-f',container]);assert.equal(removed.code,0,removed.stderr);
  console.log('Owned network-none PostgreSQL cleanup PASS');
}
