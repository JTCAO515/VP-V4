import assert from'node:assert/strict';import{randomUUID as uuid}from'node:crypto';import{command}from'../../cost/fixtures/postgres-rpc.mjs';
assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);
const context=JSON.parse((await command('docker',['context','inspect'])).stdout)[0];assert.ok(context.Endpoints.docker.Host.startsWith('unix:///'));
const container='vpj58-profile-'+uuid().slice(0,8);process.env.VP_PROFILE_TEST_CONTAINER=container;process.env.VP_PROFILE_DATA_SQL='1';
const started=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(started.code,0,started.stderr);
try{
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 for(const args of [['tests/integration/privacy/profile-data-sql/replay.mjs','init'],['--test','--test-concurrency=1','tests/integration/privacy/profile-data-sql/profile.test.mjs','tests/integration/privacy/profile-data-sql/result-compatibility.test.mjs']]){
  const r=await command(process.execPath,args);process.stdout.write(r.stdout);process.stderr.write(r.stderr);assert.equal(r.code,0);
 }
}finally{const r=await command('docker',['rm','-f',container]);assert.equal(r.code,0,r.stderr);console.log('Owned disposable PG cleanup PASS');}
