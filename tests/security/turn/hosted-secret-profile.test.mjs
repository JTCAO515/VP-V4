import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const validator=resolve('deploy/hosted-worker/validate-s1-profile.py');
const profile=()=>({schemaVersion:'vpj07-hosted-text-worker/1',pollIntervalMs:3000,maxLifetimeMs:86400000,
 drainMs:45000,concurrency:1,groupLimit:1,modes:['current_input_v1'],qwen:{priceVersion:'qwen-public-upper-20260912-v1',
 pricing:{mode:'flat',inputMicrosPerMillion:6000000,outputMicrosPerMillion:24000000,cachedInputMicrosPerMillion:null},
 reservedMicros:7000000,maxOutputTokens:1024,timeoutMs:60000,configurationId:randomUUID(),configurationVersion:1}});
test('only the frozen nonsecret S1 profile reaches Docker Config.Env',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'vpj07-profile-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'profile.json'),run=body=>{const r=spawnSync('python3',[validator,path],{encoding:'utf8'});return r;};
 await writeFile(path,JSON.stringify(profile()));
 assert.equal(run().status,0);
 const canary='sb_secret_SYNTHETIC_PROFILE_CANARY';
 for(const invalid of [
  {...profile(),VISEPANDA_HOSTED_WORKER_DB_KEY:canary},
  {...profile(),modes:['current_input_v1','task_history_v1']},
  {...profile(),qwen:{...profile().qwen,priceVersion:canary}},
  {...profile(),qwen:{...profile().qwen,pricing:{...profile().qwen.pricing,outputMicrosPerMillion:1}}},
 ]){
  await writeFile(path,JSON.stringify(invalid));const r=run();assert.equal(r.status,1);assert.ok(!r.stderr.includes(canary));
 }
 const body=JSON.stringify(profile()).replace('"groupLimit":1','"groupLimit":1,"groupLimit":1');
 await writeFile(path,body);assert.equal(run().status,1,'duplicate JSON key rejected');
});
