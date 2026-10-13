import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
const docker=args=>spawnSync('docker',args,{encoding:'utf8',timeout:30000});
const ok=r=>{assert.equal(r.status,0,r.stderr+r.stdout);return r.stdout.trim();};

test('independent QA individual binds preserve real Linux tmpfs secret-reader guards',t=>{
 const suffix=randomUUID(),volume=`qa-secret-mount-${suffix}`,donor=`qa-secret-donor-${suffix}`;
 t.after(()=>{docker(['rm','-f',donor]);docker(['volume','rm',volume]);});
 ok(docker(['volume','create','--driver','local','--opt','type=tmpfs','--opt','device=tmpfs','--opt','o=size=64k,uid=1000,gid=1000,mode=0700',volume]));
 const source=ok(docker(['volume','inspect','--format','{{.Mountpoint}}',volume]));
 ok(docker(['run','-d','--rm','--pull=never','--name',donor,'--network','none','--user','0','--mount',`type=volume,src=${volume},dst=/synthetic`,'--entrypoint','sleep','node:22-bookworm-slim','120']));
 ok(docker(['exec',donor,'bash','-c',`set -eu
mkdir /synthetic/qa-abcdefghijklmnopqrst
printf 'SYNTHETIC_INDEPENDENT_DB' > /synthetic/qa-abcdefghijklmnopqrst/db.key
printf 'SYNTHETIC_ORIGINAL_QWEN' > /synthetic/qwen.key
printf 'SYNTHETIC_OLD_DB_MUST_NOT_REACH_QA' > /synthetic/db.key
chown -R 1000:1000 /synthetic
chmod 700 /synthetic/qa-abcdefghijklmnopqrst
chmod 400 /synthetic/qa-abcdefghijklmnopqrst/db.key /synthetic/qwen.key /synthetic/db.key
`]));
 const args=['run','--rm','--pull=never','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges',
 '--tmpfs','/run/vp-worker-secrets:rw,noexec,nosuid,nodev,size=64k,mode=0700,uid=1000,gid=1000',
 '--mount',`type=bind,src=${source}/qa-abcdefghijklmnopqrst/db.key,dst=/run/vp-worker-secrets/db.key,readonly`,
 '--mount',`type=bind,src=${source}/qwen.key,dst=/run/vp-worker-secrets/qwen.key,readonly`,
 '--mount',`type=bind,src=${resolve('.')},dst=/repo,readonly`,'--entrypoint','node','node:22-bookworm-slim','--input-type=module','-e'];
 const probe=`import assert from 'node:assert/strict';
import {writeFile,statfs,lstat,readFile} from 'node:fs/promises';
import {readHostedWorkerSecrets} from '/repo/lib/server/jobs/hosted-worker-secrets.mjs';
const values=await readHostedWorkerSecrets({VISEPANDA_HOSTED_WORKER_SECRET_MODE:'files'});
assert.equal(values.workerKey,'SYNTHETIC_INDEPENDENT_DB');
assert.equal(values.providerKey,'SYNTHETIC_ORIGINAL_QWEN');
for(const p of ['/run/vp-worker-secrets','/run/vp-worker-secrets/db.key','/run/vp-worker-secrets/qwen.key'])assert.equal((await statfs(p)).type,0x01021994);
const mounts=await readFile('/proc/self/mountinfo','utf8');
for(const p of ['/run/vp-worker-secrets/db.key','/run/vp-worker-secrets/qwen.key']){
 assert.ok(mounts.split('\\n').some(line=>line.split(' ')[4]===p&&line.split(' ')[5].split(',').includes('ro')));
 await assert.rejects(writeFile(p,'must-fail'));
}
console.log('PASS independent DB and original Qwen; tmpfs/private metadata and readonly binds');`;
 ok(docker([...args,probe]));
 ok(docker(['exec',donor,'chmod','644','/synthetic/qa-abcdefghijklmnopqrst/db.key']));
 const rejected=docker([...args,`import assert from 'node:assert/strict';import {readHostedWorkerSecrets} from '/repo/lib/server/jobs/hosted-worker-secrets.mjs';await assert.rejects(readHostedWorkerSecrets({VISEPANDA_HOSTED_WORKER_SECRET_MODE:'files'}));`]);
 ok(rejected);
});
