import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';

const root=resolve('.');
const docker=(args)=>spawnSync('docker',args,{encoding:'utf8',timeout:120000});
const ok=r=>{assert.equal(r.status,0,r.stderr+r.stdout);return r.stdout.trim();};
test('Linux host without Node validates in real offline containers; worker create/start are intercepted',async t=>{
 const id=randomUUID(),volume=`qa-validator-${id}`,name=`qa-installer-${id}`;
 const dir=await mkdtemp(join(root,'.qa-validator-'));
 t.after(()=>{docker(['volume','rm',volume]);return rm(dir,{recursive:true,force:true});});
 const image=ok(docker(['image','inspect','--format','{{.Id}}','vp-qa-independent-validator-fixture:20261013']));
 ok(docker(['volume','create',volume]));
 const mountpoint=ok(docker(['volume','inspect','--format','{{.Mountpoint}}',volume]));
 const profile={schemaVersion:'vpj07-hosted-text-worker/4',projectRef:'abcdefghijklmnopqrst',pollIntervalMs:3000,maxLifetimeMs:60000,
  drainMs:1000,concurrency:1,groupLimit:1,modes:['qa_session_history_v1'],planning:null,
  qwen:{priceVersion:'synthetic-price-v1',pricing:{mode:'flat',inputMicrosPerMillion:6000000,
  outputMicrosPerMillion:24000000,cachedInputMicrosPerMillion:null},reservedMicros:7000000,
  maxOutputTokens:1024,timeoutMs:60000,configurationId:randomUUID(),configurationVersion:1}};
 const target={schemaVersion:'qa-hosted-deployment-target/2',environment:'staging',projectRef:'abcdefghijklmnopqrst',
  databaseUrl:'https://abcdefghijklmnopqrst.supabase.co',ownerId:randomUUID(),policyId:randomUUID(),scopeId:randomUUID(),
  noticeHash:'a'.repeat(64),build:'abcdefabcdef',qwenEndpoint:'https://qa-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',startupState:'disabled',restartPolicy:'no'};
 const prep=spawnSync(process.execPath,['--experimental-strip-types','deploy/hosted-worker/validate-qa-target.mjs','--prepare'],{input:JSON.stringify({profile,target}),encoding:'utf8'});
 const bundle=JSON.parse(ok(prep));
 await writeFile(join(dir,'profile.json'),bundle.profileJson);await writeFile(join(dir,'target.json'),bundle.targetJson);
 // This proxy permits only our image and ephemeral validators. It maps paths
 // inside this Linux fixture to the same nonsecret volume on the local daemon.
 // Worker calls are recorded, never forwarded to Docker.
 await writeFile(join(dir,'docker'),`#!/usr/bin/python3
import json, os, subprocess, sys
args=sys.argv[1:]
with open('/tmp/docker-calls','a') as f: f.write(json.dumps(args)+'\\n')
if args==['info']: sys.exit(0)
if args[:2]==['container','inspect']: sys.exit(0 if os.path.exists('/tmp/existing') else 1)
if args[:2]==['image','inspect']:
    assert args[-1] in ['vp-hosted-text-worker:abcdefabcdef',os.environ['FIXTURE_IMAGE']]
    if '--format' in args: print(os.environ['FIXTURE_IMAGE'])
    sys.exit(0)
if args[0] in ['create','start']:
    with open('/tmp/worker-calls','a') as f: f.write(json.dumps(args)+'\\n')
    sys.exit(0)
assert args[0]=='run'
assert args[args.index('--entrypoint')+1]=='/usr/local/bin/node'
assert args[args.index('--network')+1]=='none'
assert args[args.index('--restart')+1]=='no'
assert args[args.index('--user')+1]=='0:0'
assert args[args.index('--cap-drop')+1]=='ALL'
assert args[args.index('--security-opt')+1]=='no-new-privileges'
assert '--rm' in args and '--read-only' in args and '--pull=never' in args
assert '--env' not in args and '--env-file' not in args
assert args.count('--mount')==2
assert os.environ['FIXTURE_IMAGE'] in args
for i,a in enumerate(args):
    if a=='--mount':
        value=args[i+1]
        assert value in ['type=bind,src=/etc/visepanda/hosted-profile.json,dst=/qa/profile.json,readonly','type=bind,src=/etc/visepanda/qa/qa-target.json,dst=/qa/target.json,readonly']
        args[i+1]=value.replace('src=/etc/visepanda','src='+os.environ['FIXTURE_MOUNTPOINT'])
sys.exit(subprocess.run(['/usr/bin/docker',*args]).returncode)
`,{mode:0o755});
 await writeFile(join(dir,'swapon'),'#!/bin/bash\nexit 0\n',{mode:0o755});
 const script=String.raw`set -eu
export PATH=/fixtures:/usr/bin:/bin
! command -v node
mkdir -p /run/vp-worker-secrets /etc/visepanda/qa
chown 1000:1000 /run/vp-worker-secrets; chmod 700 /run/vp-worker-secrets
for f in db qwen; do printf 'SYNTHETIC_CANARY' > /run/vp-worker-secrets/$f.key; chown 1000:1000 /run/vp-worker-secrets/$f.key; chmod 400 /run/vp-worker-secrets/$f.key; done
chmod 700 /etc/visepanda/qa
mkdir -p /run/vp-worker-secrets/qa-abcdefghijklmnopqrst
chown 1000:1000 /run/vp-worker-secrets/qa-abcdefghijklmnopqrst; chmod 700 /run/vp-worker-secrets/qa-abcdefghijklmnopqrst
printf 'SYNTHETIC_NEW_DB' > /run/vp-worker-secrets/qa-abcdefghijklmnopqrst/db.key
chown 1000:1000 /run/vp-worker-secrets/qa-abcdefghijklmnopqrst/db.key; chmod 400 /run/vp-worker-secrets/qa-abcdefghijklmnopqrst/db.key
# The old DB slot is deliberately unusable. Independent QA must not inspect it.
rm /run/vp-worker-secrets/db.key; ln -s /no-legacy-key /run/vp-worker-secrets/db.key
reset_package() {
 cp /fixtures/profile.json /etc/visepanda/hosted-profile.json
 cp /fixtures/target.json /etc/visepanda/qa/qa-target.json
 chmod 600 /etc/visepanda/hosted-profile.json /etc/visepanda/qa/qa-target.json
}
reset_package
wrapper=/repo/deploy/hosted-worker/ecs-worker-files.sh
bash "$wrapper" preflight --qa
bash "$wrapper" start abcdefabcdef --qa
python3 - <<'PYCHECK'
import json,os
calls=[json.loads(x) for x in open('/tmp/docker-calls')]
runs=[a for a in calls if a[0]=='run']
assert len(runs)==2 and runs[0][runs[0].index('--name')+1]!=runs[1][runs[1].index('--name')+1]
w=[json.loads(x) for x in open('/tmp/worker-calls')]
assert len(w)==2 and w[0][0]=='create' and w[1]==['start','vp-hosted-text-worker']
assert w[0][-1]==os.environ['FIXTURE_IMAGE']
assert 'VISEPANDA_QA_SUPABASE_PROJECT_REF=abcdefghijklmnopqrst' in w[0]
assert 'type=bind,src=/run/vp-worker-secrets/qa-abcdefghijklmnopqrst/db.key,dst=/run/vp-worker-secrets/db.key,readonly' in w[0]
assert 'type=bind,src=/run/vp-worker-secrets/qwen.key,dst=/run/vp-worker-secrets/qwen.key,readonly' in w[0]
assert not any(a.startswith('type=bind,src=/run/vp-worker-secrets,') or a.startswith('type=bind,src=/run/vp-worker-secrets/db.key,') for a in w[0])
assert w[0][w[0].index('--tmpfs')+1]=='/run/vp-worker-secrets:rw,noexec,nosuid,nodev,size=64k,mode=0700,uid=1000,gid=1000'
assert w[0].count('VISEPANDA_QWEN_ENDPOINT=https://qa-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions')==1
assert w[0][w[0].index('--restart')+1]=='no'
assert 'SYNTHETIC_CANARY' not in str(calls) and '--env-file' not in str(calls)
PYCHECK
rm /tmp/worker-calls
reject() { if bash "$wrapper" "$@" >/tmp/rejected 2>&1; then cat /tmp/rejected; exit 21; fi; test ! -f /tmp/worker-calls; }
reject start abcdefabcdee --qa
python3 - <<'PYNEG'
import json
p='/etc/visepanda/qa/qa-target.json'
t=json.load(open(p));t['projectRef']='zyxwvutsrqponmlkjihg';t['databaseUrl']='https://zyxwvutsrqponmlkjihg.supabase.co'
open(p,'w').write(json.dumps(t,separators=(',',':'))+'\n')
PYNEG
reject preflight --qa
reset_package
sed -i 's/abcdefghijklmnopqrst/dzqdzetcctkhbrhlxxgn/g' /etc/visepanda/hosted-profile.json /etc/visepanda/qa/qa-target.json
reject preflight --qa
reset_package
sed -i 's@vpj07-hosted-text-worker/4@vpj07-hosted-text-worker/3@' /etc/visepanda/hosted-profile.json
reject preflight --qa
reset_package
sed -i 's@qa-hosted-deployment-target/2@qa-hosted-deployment-target/1@' /etc/visepanda/qa/qa-target.json
reject preflight --qa
reset_package
sed -i 's/"groupLimit":1/"groupLimit":2/' /etc/visepanda/hosted-profile.json
reject preflight --qa
reset_package
sed -i 's/qa-workspace.cn-beijing.maas.aliyuncs.com/example.invalid/' /etc/visepanda/qa/qa-target.json
reject preflight --qa
reset_package
sed -i 's/"restartPolicy":"no"/"restartPolicy":"no","restartPolicy":"no"/' /etc/visepanda/qa/qa-target.json
reject preflight --qa
reset_package
sed -i 's/"groupLimit":1/"groupLimit":1,"groupLimit":1/' /etc/visepanda/hosted-profile.json
reject preflight --qa
reset_package
mv /run/vp-worker-secrets/qa-abcdefghijklmnopqrst /run/vp-worker-secrets/qa-saved
reject preflight --qa
mv /run/vp-worker-secrets/qa-saved /run/vp-worker-secrets/qa-abcdefghijklmnopqrst
chmod 755 /run/vp-worker-secrets/qa-abcdefghijklmnopqrst; reject preflight --qa; chmod 700 /run/vp-worker-secrets/qa-abcdefghijklmnopqrst
for file in /etc/visepanda/hosted-profile.json /etc/visepanda/qa/qa-target.json /run/vp-worker-secrets/qa-abcdefghijklmnopqrst/db.key /run/vp-worker-secrets/qwen.key; do
 original=$(stat -c %a "$file")
 chmod 644 "$file"; reject preflight --qa; chmod "$original" "$file"
 ln "$file" "$file.link"; reject preflight --qa; rm "$file.link"
 mv "$file" "$file.saved"; ln -s "$file.saved" "$file"; reject preflight --qa; rm "$file"; mv "$file.saved" "$file"
done
touch /tmp/existing; reject start abcdefabcdef --qa; rm /tmp/existing
printf 'PASS no-host-node / real validators / invalid build-hash-endpoint-duplicates-privatefiles / no worker started\n'
`;
 const result=docker(['run','--rm','--pull=never','--name',name,'--network','none','--user','0','--tmpfs','/run','--tmpfs','/var/lib/vp-worker',
 '--mount',`type=volume,src=${volume},dst=/etc/visepanda`,
 '--mount',`type=bind,src=${root},dst=/repo,readonly`,
 '--mount',`type=bind,src=${dir},dst=/fixtures,readonly`,
 '--mount','type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock',
 '--env',`FIXTURE_IMAGE=${image}`,'--env',`FIXTURE_MOUNTPOINT=${mountpoint}`,'--env','DOCKER_API_VERSION=1.56',
 'vp-qa-installer-fixture:20261013','bash','-c',script]);
 ok(result);assert.ok(!result.stdout.includes('SYNTHETIC_CANARY'));assert.ok(!result.stderr.includes('SYNTHETIC_CANARY'));
});
