import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const root=resolve('.'),checker=resolve('deploy/hosted-worker/validate-qa-target.mjs');
const endpoint='https://qa-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions';
const profile=()=>({schemaVersion:'vpj07-hosted-text-worker/4',projectRef:'dzqdzetcctkhbrhlxxgn',pollIntervalMs:3000,maxLifetimeMs:60000,
  drainMs:1000,concurrency:1,groupLimit:1,modes:['qa_session_history_v1'],planning:null,
  qwen:{priceVersion:'synthetic-price-v1',pricing:{mode:'flat',inputMicrosPerMillion:6000000,
    outputMicrosPerMillion:24000000,cachedInputMicrosPerMillion:null},reservedMicros:7000000,
    maxOutputTokens:1024,timeoutMs:60000,configurationId:randomUUID(),configurationVersion:1}});
const target=()=>({schemaVersion:'qa-hosted-deployment-target/2',environment:'staging',projectRef:'dzqdzetcctkhbrhlxxgn',
  databaseUrl:'https://dzqdzetcctkhbrhlxxgn.supabase.co',ownerId:randomUUID(),policyId:randomUUID(),scopeId:randomUUID(),
  noticeHash:'a'.repeat(64),build:'abcdefabcdef',qwenEndpoint:endpoint,startupState:'disabled',restartPolicy:'no'});
const node=(args,input)=>spawnSync(process.execPath,['--experimental-strip-types',checker,...args],{input,encoding:'utf8'});
test('QA package emits its exact reviewed endpoint and rejects stale build, profile and destinations',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'qa-target-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const p=profile(),s=target(),prepared=node(['--prepare'],JSON.stringify({profile:p,target:s}));
  assert.equal(prepared.status,0,prepared.stderr);const bundle=JSON.parse(prepared.stdout);
  const paths=[join(dir,'profile.json'),join(dir,'target.json')];
  await writeFile(paths[0],bundle.profileJson);await writeFile(paths[1],bundle.targetJson);
  const emitted=node([...paths,s.build,'--emit']);assert.equal(emitted.status,0,emitted.stderr);
  assert.equal(emitted.stdout,JSON.stringify(p)+'\n'+endpoint);
  assert.equal(node([...paths,'abcdefabcdee','--emit']).status,1);
  for(const imageBuild of [undefined,'abcdefabcdee',s.build]){
    const env={...process.env};
    if(imageBuild===undefined)delete env.VISEPANDA_HOSTED_WORKER_BUILD;
    else env.VISEPANDA_HOSTED_WORKER_BUILD=imageBuild;
    const runtime=spawnSync(process.execPath,['--experimental-strip-types',checker,...paths,s.build,'--emit-runtime'],{env,encoding:'utf8'});
    assert.equal(runtime.status,imageBuild===s.build?0:1,'runtime image build must match');
    if(runtime.status!==0)assert.equal(runtime.stdout,'');
  }
  await writeFile(paths[0],bundle.profileJson.replace('"groupLimit":1','"groupLimit":2'));
  assert.equal(node(paths).status,1,'profile hash mismatch');
  await writeFile(paths[0],bundle.profileJson);await writeFile(paths[1],bundle.targetJson.replace('"restartPolicy":"no"','"restartPolicy":"no","restartPolicy":"no"'));
  assert.equal(node(paths).status,1,'duplicate target key');
  for(const qwenEndpoint of ['https://trial.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',endpoint+'?token=CANARY','https://example.invalid/compatible-mode/v1/chat/completions']){
    const r=node(['--prepare'],JSON.stringify({profile:p,target:{...s,qwenEndpoint}}));
    assert.equal(r.status,1);assert.equal(r.stdout,'');assert.ok(!r.stderr.includes('CANARY'));
  }
  assert.equal(node(['--prepare'],JSON.stringify({profile:p,target:{...s,qwenEndpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'}})).status,0);
  for(const bad of [
    {...s,schemaVersion:'qa-hosted-deployment-target/1'},
    {...s,projectRef:undefined},
    {...s,projectRef:'ABCDEFGHIJKLMNOPQRST'},
    {...s,databaseUrl:'https://zyxwvutsrqponmlkjihg.supabase.co'},
    {...s,databaseUrl:s.databaseUrl+'/'},
    {...s,databaseUrl:s.databaseUrl+':443'},
    {...s,databaseUrl:s.databaseUrl+'?project=CANARY'},
    {...s,databaseUrl:s.databaseUrl+'#CANARY'},
    {...s,databaseUrl:'https://CANARY@dzqdzetcctkhbrhlxxgn.supabase.co'},
    {...s,jobDatabaseUrl:s.databaseUrl},
  ]){
    const denied=node(['--prepare'],JSON.stringify({profile:p,target:bad}));
    assert.equal(denied.status,1,'unbound/alternate URL target rejected');
    assert.equal(denied.stdout,'');assert.ok(!denied.stderr.includes('CANARY'));
  }
  for(const bad of [
    {...p,schemaVersion:'vpj07-hosted-text-worker/3'},
    {...p,projectRef:undefined},
    {...p,projectRef:'zyxwvutsrqponmlkjihg'},
  ])assert.equal(node(['--prepare'],JSON.stringify({profile:bad,target:s})).status,1,'profile target mismatch rejected');
  assert.equal(node(['--prepare'],JSON.stringify({profile:{...p,projectRef:'abcdefghijklmnopqrst'},target:{...s,projectRef:'abcdefghijklmnopqrst',databaseUrl:'https://abcdefghijklmnopqrst.supabase.co'}})).status,1,'a self-consistent but unapproved project is not a trusted root');
  const secret='sb_secret_SYNTHETIC_CANARY';
  const denied=node(['--prepare'],JSON.stringify({profile:{...p,qwen:{...p.qwen,priceVersion:secret}},target:s}));
  assert.equal(denied.status,1);assert.equal(denied.stdout,'');assert.ok(!denied.stderr.includes(secret));
});

test('Linux QA installer passes the workspace endpoint to its sole mocked Docker create',async t=>{
  const dir=await mkdtemp(join(resolve('.'),'.qa-target-wrapper-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const r=node(['--prepare'],JSON.stringify({profile:profile(),target:target()}));assert.equal(r.status,0,r.stderr);
  const bundle=JSON.parse(r.stdout);await writeFile(join(dir,'profile.json'),bundle.profileJson);await writeFile(join(dir,'target.json'),bundle.targetJson);
  await writeFile(join(dir,'docker'),`#!/bin/bash
case "$1 $2" in
 "container inspect") exit 1;;
 "image inspect") printf 'sha256:%064d\\n' 0;;
 "create --name") printf "%s\\n" "$@" > /tmp/docker-argv;;
 *) if [[ $1 == run ]]; then
      export VISEPANDA_HOSTED_WORKER_BUILD=abcdefabcdef
      exec /usr/local/bin/node --experimental-strip-types --disable-warning=ExperimentalWarning /repo/deploy/hosted-worker/validate-qa-target.mjs /etc/visepanda/hosted-profile.json /etc/visepanda/qa/qa-target.json abcdefabcdef --emit-runtime
    fi;;
esac
exit 0
`,{mode:0o755});
  await writeFile(join(dir,'swapon'),'#!/bin/bash\nexit 0\n',{mode:0o755});
  // The real closed Python validator is covered by profile.test; this image has
  // Node only. The target checker also runs the actual v4 TypeScript validator.
  await writeFile(join(dir,'python3'),`#!/bin/bash
if [[ $1 == - ]]; then
 exec /usr/local/bin/node -e 'const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(t.build+String.fromCharCode(10)+t.projectRef)' "$2"
fi
cat "$2"
`,{mode:0o755});
  const script=String.raw`set -eu
export PATH=/fixtures:$PATH
mkdir -p /run/vp-worker-secrets /etc/visepanda/qa
chown 1000:1000 /run/vp-worker-secrets; chmod 700 /run/vp-worker-secrets
for f in db qwen; do printf 'SYNTHETIC_CANARY' > /run/vp-worker-secrets/$f.key; chown 1000:1000 /run/vp-worker-secrets/$f.key; chmod 400 /run/vp-worker-secrets/$f.key; done
chmod 700 /etc/visepanda/qa
cp /fixtures/profile.json /etc/visepanda/hosted-profile.json
cp /fixtures/target.json /etc/visepanda/qa/qa-target.json
chmod 600 /etc/visepanda/hosted-profile.json /etc/visepanda/qa/qa-target.json
wrapper=/repo/deploy/hosted-worker/ecs-worker-files.sh
bash "$wrapper" preflight --qa
bash "$wrapper" start abcdefabcdef --qa
node --input-type=module -e 'import {readFileSync} from "node:fs";import assert from "node:assert/strict";const a=readFileSync("/tmp/docker-argv","utf8");assert.match(a,/VISEPANDA_QWEN_ENDPOINT=https:\/\/qa-workspace\.cn-beijing\.maas\.aliyuncs\.com\/compatible-mode\/v1\/chat\/completions/);assert.equal(a.split("VISEPANDA_QWEN_ENDPOINT=").length,2);assert.match(a,/--restart\nno/);assert.ok(!a.includes("SYNTHETIC_CANARY"));assert.ok(!a.includes("--env-file"));'
rm /tmp/docker-argv
reject() { if bash "$wrapper" "$@" >/tmp/rejected 2>&1; then exit 21; fi; test ! -f /tmp/docker-argv; }
reject start abcdefabcdee --qa
chmod 644 /etc/visepanda/qa/qa-target.json; reject preflight --qa; chmod 600 /etc/visepanda/qa/qa-target.json
mv /etc/visepanda/qa/qa-target.json /etc/visepanda/qa/saved; ln -s saved /etc/visepanda/qa/qa-target.json; reject preflight --qa
`;
  const result=spawnSync('docker',['run','--rm','--pull=never','--network','none','--user','0','--tmpfs','/run','--tmpfs','/etc/visepanda','--tmpfs','/var/lib/vp-worker',
    '--mount',`type=bind,src=${root},dst=/repo,readonly`,'--mount',`type=bind,src=${dir},dst=/fixtures,readonly`,
    'node:22-bookworm-slim','bash','-c',script],{encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.ok(!result.stdout.includes('SYNTHETIC_CANARY'));assert.ok(!result.stderr.includes('SYNTHETIC_CANARY'));
});
