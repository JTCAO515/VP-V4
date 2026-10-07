import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { command } from '../../cost/fixtures/postgres-rpc.mjs';
import { db, setContainer } from '../profile-data-sql/replay.mjs';

export function postProfileMigrations() {
  if(process.env.VP_CORE_EXPORT_SQL_SOURCE)throw Error('SQL source overrides are forbidden.');
  assert.ok(existsSync('supabase/migrations/20261007010000_result_data.sql'),'Current Result dependency must exist in this checkout; historical fallback is forbidden.');
  const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f>'20261007020000_profile_data.sql').sort();
  assert.ok(files.includes('20261007040000_profile_core_export.sql'));
  return files;
}

export async function replayPostProfileMigrations(verifyRollback=false) {
  const files=postProfileMigrations();
  const resultGuard=()=>db("select md5(prosrc) from pg_proc where oid='result_data_private.guard_core_copy_v1()'::regprocedure");
  const fingerprint=()=>db("set search_path='';select md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname not in('pg_catalog','information_schema','extensions','auth')");
  for(const file of files) {
    const source=readFileSync('supabase/migrations/'+file,'utf8');
    if(file==='20261007040000_profile_core_export.sql') {
      process.env.VP_PROFILE_EXPORT_RESULT_GUARD_HASH=await resultGuard();
      if(verifyRollback) {
        const baseline=await fingerprint();await db('begin;'+source+'rollback;');
        assert.equal(await fingerprint(),baseline);
        assert.equal(await db("select to_regclass('export_private.profile_snapshot_provenance_v1') is null and profile_data_private.schema_v1() and result_data_private.schema_supported_v1()"),'t');
        console.log('Whole append rollback restores all original function definitions/ACL/catalog PASS');
      }
      await db('begin;'+source+'commit;');
      assert.equal(await resultGuard(),process.env.VP_PROFILE_EXPORT_RESULT_GUARD_HASH);
    } else await db('begin;'+source+'commit;');
  }
  console.log('Current post-Profile migrations applied: '+files.join(', '));
}

// Standalone node:test/CI path. The explicit run.mjs already owns its container.
export async function ensureFixture(t) {
  if(process.env.VP_PROFILE_EXPORT_TEST_CONTAINER) {
    setContainer(process.env.VP_PROFILE_EXPORT_TEST_CONTAINER);return;
  }
  postProfileMigrations();
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT);
  const context=JSON.parse((await command('docker',['context','inspect'])).stdout)[0];
  assert.ok(context.Endpoints.docker.Host.startsWith('unix:///'));
  const container='vpj58-profile-export-'+randomUUID().slice(0,8);
  process.env.VP_PROFILE_TEST_CONTAINER=container;
  process.env.VP_PROFILE_EXPORT_TEST_CONTAINER=container;setContainer(container);
  const started=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(started.code,0,started.stderr);
  t.after(async()=>{
    const removed=await command('docker',['rm','-f',container]);assert.equal(removed.code,0,removed.stderr);
    console.log('Owned standalone Profile-export PostgreSQL cleanup PASS');
  });
  for(let n=0;n<100;n++) {
    if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;
    await new Promise(r=>setTimeout(r,100));
  }
  const replay=await command(process.execPath,['tests/integration/privacy/profile-data-sql/replay.mjs','init']);
  assert.equal(replay.code,0,replay.stderr);
  await replayPostProfileMigrations();
}
