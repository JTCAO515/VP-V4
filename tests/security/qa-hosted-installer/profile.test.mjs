import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {parseQaHostedProfile} from '../../../lib/server/qa-agent/hosted-profile.ts';

const validator=resolve('deploy/hosted-worker/validate-qa-profile.py');
const installer=resolve('deploy/hosted-worker/ecs-worker-files.sh');
const profile=()=>({schemaVersion:'vpj07-hosted-text-worker/4',projectRef:'dzqdzetcctkhbrhlxxgn',pollIntervalMs:3000,maxLifetimeMs:86400000,
 drainMs:45000,concurrency:1,groupLimit:1,modes:['qa_session_history_v1'],planning:null,
 qwen:{priceVersion:'synthetic-qa-price-v1',pricing:{mode:'flat',inputMicrosPerMillion:6000000,
 outputMicrosPerMillion:24000000,cachedInputMicrosPerMillion:null},reservedMicros:7000000,
 maxOutputTokens:1024,timeoutMs:60000,configurationId:randomUUID(),configurationVersion:1}});

test('QA-only installer preflight uses closed v4 profile and retains legacy file-mode branch',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qaw005-profile-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const path=join(directory,'profile.json');
 const run=async raw=>{
  await writeFile(path,raw);
  return spawnSync('python3',[validator,path,'--emit'],{encoding:'utf8'});
 };
 const valid=profile();
 const accepted=await run(JSON.stringify(valid));
 assert.equal(accepted.status,0,accepted.stderr);
 assert.deepEqual(JSON.parse(accepted.stdout),valid);
 assert.equal(parseQaHostedProfile(valid).schemaVersion,'vpj07-hosted-text-worker/4');
 const secret='sb_secret_SYNTHETIC_PROFILE_CANARY';
 for(const bad of [
  {...valid,schemaVersion:'vpj07-hosted-text-worker/3'},
  {...valid,projectRef:undefined},
  {...valid,projectRef:'ABCDEFGHIJKLMNOPQRST'},
  {...valid,projectRef:'abcdefghijklmnopqrs-'},
  {...valid,projectRef:'dzqdzetcctkhbrhlxxgn.supabase.co'},
  {...valid,modes:['current_input_v1']},
  {...valid,planning:{}},
  {...valid,VISEPANDA_HOSTED_WORKER_DB_KEY:secret},
  {...valid,pollIntervalMs:true},
  {...valid,qwen:{...valid.qwen,priceVersion:secret}},
  {...valid,qwen:{...valid.qwen,reservedMicros:1}},
  {...valid,qwen:{...valid.qwen,pricing:{...valid.qwen.pricing,cachedInputMicrosPerMillion:1}}},
 ]){
  const denied=await run(JSON.stringify(bad));
  assert.equal(denied.status,1);
  assert.equal(denied.stderr.includes(secret),false);
  assert.equal(denied.stdout,'');
 }
 const duplicate=JSON.stringify(valid).replace('"groupLimit":1','"groupLimit":1,"groupLimit":1');
 assert.equal((await run(duplicate)).status,1,'duplicate profile keys must be refused');
 assert.equal(spawnSync('bash',['-n',installer]).status,0);
 const source=await readFile(installer,'utf8');
 assert.match(source,/--planning\|--qa/);
 assert.match(source,/validate-s1-profile\.py/);
 assert.match(source,/validate-qa-profile\.py/);
 assert.match(source,/VISEPANDA_HOSTED_WORKER_SECRET_MODE=files/);
 assert.match(source,/--mount "type=bind,src=\$secret_dir,dst=\/run\/vp-worker-secrets,readonly"/);
});
