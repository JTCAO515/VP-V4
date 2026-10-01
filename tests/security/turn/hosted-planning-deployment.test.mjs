import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve('.'), checker=resolve('deploy/hosted-worker/validate-planning-profile.mjs');
const ids={ownerId:'11111111-1111-4111-8111-111111111111',planningPolicyId:'22222222-2222-4222-8222-222222222222',scopeId:'33333333-3333-4333-8333-333333333333'};
const profile=()=>({schemaVersion:'vpj07-hosted-text-worker/2',pollIntervalMs:3000,maxLifetimeMs:86400000,drainMs:45000,concurrency:1,groupLimit:1,modes:['current_input_v1'],qwen:{priceVersion:'qwen-public-upper-20260912-v1',pricing:{mode:'flat',inputMicrosPerMillion:6000000,outputMicrosPerMillion:24000000,cachedInputMicrosPerMillion:null},reservedMicros:7000000,maxOutputTokens:1024,timeoutMs:60000,configurationId:ids.ownerId,configurationVersion:1},planning:ids});
const target=()=>({schemaVersion:'vpj80-planning-deployment-target/1',environment:'staging',databaseUrl:'https://dzqdzetcctkhbrhlxxgn.supabase.co',...ids,build:'abcdefabcdef',qwenEndpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',startupState:'disabled',restartPolicy:'no'});
const node=(args,input)=>spawnSync(process.execPath,['--experimental-strip-types','--disable-warning=ExperimentalWarning',checker,...args],{encoding:'utf8',input});
test('offline package binds selection, hash and runtime schema without exposing rejected input',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'vpj80-package-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const p=join(dir,'input.json'),s=join(dir,'target.json'),out=join(dir,'package');
 await writeFile(p,JSON.stringify(profile()));await writeFile(s,JSON.stringify(target()));
 const pack=()=>spawnSync('python3',[resolve('deploy/hosted-worker/prepare-planning-profile.py'),'--profile',p,'--target',s,'--out',out],{encoding:'utf8'});
 assert.equal(pack().status,0);assert.equal((await stat(out)).mode&0o777,0o700);
 for(const file of ['hosted-profile.json','planning-target.json'])assert.equal((await stat(join(out,file))).mode&0o777,0o600);
 const paths=[join(out,'hosted-profile.json'),join(out,'planning-target.json')];
 assert.equal(node(paths).status,0);assert.equal(node([...paths,'abcdefabcdee']).status,1);
 assert.equal(pack().status,1,'no overwrite');
 assert.equal(spawnSync('python3',[resolve('deploy/hosted-worker/validate-s1-profile.py'),paths[0]]).status,1,'default S1 rejects profile/2');
 assert.equal(node(['--prepare'],JSON.stringify({profile:{...profile(),modes:['current_input_v1','task_history_v1','knowledge_intent_v1']},target:target()})).status,0,'existing text modes retained');
 const canary='sb_secret_SYNTHETIC_CANARY';
 for(const [p2,t2] of [
  [{...profile(),planning:null},target()],
  [{...profile(),secret:canary},target()],
  [profile(),{...target(),ownerId:ids.scopeId}],
  [profile(),{...target(),startupState:'enabled'}],
  [profile(),{...target(),environment:'production'}],
  [profile(),{...target(),qwenEndpoint:'https://example.com/'+canary}],
  [{...profile(),modes:['unknown']},target()],
 ]){const r=node(['--prepare'],JSON.stringify({profile:p2,target:t2}));assert.equal(r.status,1);assert.ok(!r.stderr.includes(canary));}
 const original=await readFile(paths[0],'utf8');await writeFile(paths[0],original.replace('"groupLimit":1','"groupLimit":1,"groupLimit":1'));assert.equal(node(paths).status,1);
 await writeFile(p,JSON.stringify(profile()).replace('"groupLimit":1','"groupLimit":1,"groupLimit":1'));assert.equal(pack().status,1);
});
test('Linux wrapper validates private tmpfs and selected package before its single Docker lifecycle',async t=>{
 const dir=await mkdtemp(join(root,'.vpj80-wrapper-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const prepared=node(['--prepare'],JSON.stringify({profile:profile(),target:target()}));assert.equal(prepared.status,0,prepared.stderr);
 const payload=JSON.parse(prepared.stdout);await writeFile(join(dir,'profile.json'),payload.profileJson);await writeFile(join(dir,'target.json'),payload.targetJson);
 await writeFile(join(dir,'docker'),`#!/bin/bash\ncase "$1 $2" in\n 'container inspect') exit 1;;\n 'create --name') printf '%s\\n' "$@" > /tmp/docker-argv;;\nesac\nexit 0\n`,{mode:0o755});
 await writeFile(join(dir,'swapon'),'#!/bin/bash\nif [[ -f /tmp/fake-swap ]]; then echo synthetic-swap; fi\n',{mode:0o755});
 await writeFile(join(dir,'findmnt'),'#!/bin/bash\nif [[ -f /tmp/fake-disk ]]; then echo ext4; else exec /usr/bin/findmnt "$@"; fi\n',{mode:0o755});
 const script=String.raw`set -eu
export PATH=/fixtures:$PATH
mkdir -p /run/vp-worker-secrets /etc/visepanda/planning
chown 1000:1000 /run/vp-worker-secrets; chmod 700 /run/vp-worker-secrets
for f in db qwen amap; do printf 'FAKE_%s_CANARY' "$f" > /run/vp-worker-secrets/$f.key; chown 1000:1000 /run/vp-worker-secrets/$f.key; chmod 400 /run/vp-worker-secrets/$f.key; done
chmod 700 /etc/visepanda/planning
cp /fixtures/profile.json /etc/visepanda/planning/hosted-profile.json
cp /fixtures/target.json /etc/visepanda/planning/planning-target.json
chmod 600 /etc/visepanda/planning/*
wrapper=/repo/deploy/hosted-worker/ecs-worker-files.sh
bash "$wrapper" preflight --planning
bash "$wrapper" start abcdefabcdef --planning
node --input-type=module -e 'import {readFileSync} from "node:fs";import assert from "node:assert/strict";const a=readFileSync("/tmp/docker-argv","utf8");assert.match(a,/VISEPANDA_HOSTED_PLANNING_WORKER=true/);assert.match(a,/VISEPANDA_QWEN_ENDPOINT=/);assert.match(a,/--restart\nno/);assert.ok(!a.includes("FAKE_"));assert.ok(!a.includes("--env-file"));assert.ok(!a.includes("--publish"));'
reject() { if bash "$wrapper" "$@" >/tmp/rejected 2>&1; then exit 21; fi; }
touch /tmp/fake-disk; reject preflight --planning; rm /tmp/fake-disk
touch /tmp/fake-swap; reject preflight --planning; rm /tmp/fake-swap
reject start abcdefabcdee --planning
reject start abcdefabcdef --planning --enable
reject preflight
chmod 600 /run/vp-worker-secrets/amap.key; reject preflight --planning; chmod 400 /run/vp-worker-secrets/amap.key
chown 0:0 /run/vp-worker-secrets/amap.key; reject preflight --planning; chown 1000:1000 /run/vp-worker-secrets/amap.key
ln /run/vp-worker-secrets/amap.key /run/vp-worker-secrets/linked; reject preflight --planning; rm /run/vp-worker-secrets/linked
mv /run/vp-worker-secrets/amap.key /run/vp-worker-secrets/saved; ln -s saved /run/vp-worker-secrets/amap.key; reject preflight --planning; rm /run/vp-worker-secrets/amap.key; mv /run/vp-worker-secrets/saved /run/vp-worker-secrets/amap.key
chown 1000:1000 /etc/visepanda/planning/planning-target.json; reject preflight --planning; chown 0:0 /etc/visepanda/planning/planning-target.json
chmod 644 /etc/visepanda/planning/planning-target.json; reject preflight --planning
`;
 const r=spawnSync('docker',['run','--rm','--network','none','--user','0','--tmpfs','/run','--tmpfs','/etc/visepanda','--tmpfs','/var/lib/vp-worker','--mount',`type=bind,src=${root},dst=/repo,readonly`,'--mount',`type=bind,src=${dir},dst=/fixtures,readonly`,'node:22-bookworm-slim','bash','-c',script],{encoding:'utf8',timeout:60000});
 assert.equal(r.status,0,r.stderr+r.stdout);assert.ok(!r.stdout.includes('FAKE_'));assert.ok(!r.stderr.includes('FAKE_'));
});
