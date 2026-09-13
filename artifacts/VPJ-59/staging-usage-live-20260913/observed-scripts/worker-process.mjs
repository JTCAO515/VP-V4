import fs from 'node:fs';import {execFileSync,spawn} from 'node:child_process';import assert from 'node:assert/strict';
const root='/Users/jtcao/Library/Caches/visepanda/staging-usage-live-20260913';const mode=process.argv[2];assert.ok(['fault','reconcile','replay','empty'].includes(mode));assert.ok(fs.existsSync(root+'/window-ready')&&!fs.existsSync(root+'/window-finished.json'));
try{
const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','dzqdzetcctkhbrhlxxgn','--reveal','--output-format','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).keys;const key=keys.find(k=>k.name==='service_role'&&k.type==='legacy')?.api_key;assert.ok(key);const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));assert.equal(payload.ref,'dzqdzetcctkhbrhlxxgn');assert.equal(payload.role,'service_role');
const env={...process.env,NODE_OPTIONS:'',VERCEL_ENV:'',VISEPANDA_STAGING_TEXT_WORKER_KEY:key};delete env.VISEPANDA_STAGING_TEXT_PROVIDER_KEY;
let args=['--experimental-strip-types'];
if(mode==='fault'||mode==='empty')env.VISEPANDA_STAGING_TEXT_PROVIDER_KEY=execFileSync('security',['find-generic-password','-a','VP-V4','-s','VP-V4.QWEN_API_KEY','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(mode==='fault'){
assert.ok(!fs.existsSync(root+'/fault-ready.json'));fs.writeFileSync(root+'/service-en.json',JSON.stringify({schemaVersion:'vpj07-staging-text-service/1',job:JSON.parse(fs.readFileSync(root+'/worker-en.json')),pollIntervalMs:5000,expiresAt:new Date(Date.now()+20*60000).toISOString()},null,2)+'\n',{mode:0o600,flag:'wx'});
env.VISEPANDA_STAGING_TEXT_SERVICE='true';args.push('--import',root+'/fault-after-usage.mjs',root+'/frozen/lib/server/jobs/run-staging-text-service.mjs','--config',root+'/service-en.json','--receipts',root+'/fault-service.jsonl');
}else if(mode==='empty'){
assert.equal(JSON.parse(fs.readFileSync(root+'/settled.json')).status,'cancelled');env.VISEPANDA_STAGING_TEXT_WORKER='true';args.push(root+'/frozen/lib/server/jobs/run-staging-text-worker.mjs','--config',root+'/worker-en.json','--receipts',root+'/empty-worker.jsonl');
}else{
assert.equal(JSON.parse(fs.readFileSync(root+'/fault-process-result.json')).signal,'SIGKILL');assert.ok(JSON.parse(fs.readFileSync(root+'/api-cancel-receipts.json')).receipts.some(r=>r.path.endsWith('/cancel')&&r.status===503));env.VISEPANDA_STAGING_USAGE_RECONCILE='true';args.push(root+'/frozen/lib/server/jobs/reconcile-staging-text-usage.mjs','--config',root+'/service-en.json','--journal',root+'/fault-service.jsonl','--receipts',root+'/'+mode+'-receipts.jsonl');
}
fs.writeFileSync(root+'/'+mode+'-process-intent.json',JSON.stringify({at:new Date().toISOString(),mode,source:fs.readFileSync(root+'/source-sha','utf8').trim()})+'\n',{mode:0o600,flag:'wx'});
const child=spawn(process.execPath,args,{cwd:root+'/frozen',env,stdio:['ignore','pipe','pipe']});fs.writeFileSync(root+'/'+mode+'-process.json',JSON.stringify({pid:child.pid,mode})+'\n',{mode:0o600,flag:'wx'});let stdout='';child.stdout.on('data',x=>stdout+=x);child.stderr.resume();let timer;if(mode==='fault')timer=setInterval(()=>{if(fs.existsSync(root+'/kill-worker')||fs.existsSync(root+'/native-read-complete'))child.kill('SIGKILL');},100);
const r=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});clearInterval(timer);let result=stdout.trim()?JSON.parse(stdout.trim()):null;fs.writeFileSync(root+'/'+mode+'-process-result.json',JSON.stringify({at:new Date().toISOString(),mode,...r,result},null,2)+'\n',{mode:0o600,flag:'wx'});
if(mode==='fault')assert.equal(r.signal,'SIGKILL');else{assert.equal(r.code,0);if(mode==='reconcile'){assert.equal(result.settled,1);assert.equal(result.alreadySettled,0);}if(mode==='replay'){assert.equal(result.settled,0);assert.equal(result.alreadySettled,1);}if(mode==='empty')assert.equal(result.result,'empty');}
console.log({mode,...r,result});
}catch(e){console.error(JSON.stringify({mode,status:'STOPPED',errorType:e.name}));process.exitCode=1;}
