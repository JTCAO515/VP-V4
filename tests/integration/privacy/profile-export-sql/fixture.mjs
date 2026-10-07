import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { command } from '../../cost/fixtures/postgres-rpc.mjs';
import { db, setContainer } from '../profile-data-sql/replay.mjs';

// Standalone node:test/CI path. The explicit run.mjs already owns its container.
export async function ensureFixture(t) {
  if(process.env.VP_PROFILE_EXPORT_TEST_CONTAINER) {
    setContainer(process.env.VP_PROFILE_EXPORT_TEST_CONTAINER);return;
  }
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
  process.env.VP_PROFILE_EXPORT_RESULT_GUARD_HASH=await db("select md5(prosrc) from pg_proc where oid='result_data_private.guard_core_copy_v1()'::regprocedure");
  await db('begin;'+readFileSync('supabase/migrations/20261007040000_profile_core_export.sql','utf8')+'commit;');
}
