import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const root='/Users/jtcao/Library/Caches/visepanda/place-diagnostic-20260914',repo=root+'/frozen';
const read=n=>JSON.parse(fs.readFileSync(root+'/'+n,'utf8')),exists=n=>fs.existsSync(root+'/'+n);
const scenario=read('scenario.json'),deployment=read('preview-state.json'),origin='https://'+deployment.url,base='/api/chat/native/v4';
const state={schemaVersion:'place-diagnostic-observation/1',status:'STARTED',startedAt:new Date().toISOString(),sourceCommit:scenario.sourceCommit,scenarioHash:createHash('sha256').update(fs.readFileSync(root+'/scenario.json')).digest('hex'),operations:[],tasks:[],observations:[],workerLaunches:0,cleanup:[]};
const save=()=>{const fd=fs.openSync(root+'/place-run.json','w',0o600);try{fs.writeFileSync(fd,JSON.stringify(state,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
const write=(name,data)=>fs.writeFileSync(root+'/'+name,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});
const run=(bin,args)=>{try{return execFileSync(bin,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});}catch{throw Error('Operator subprocess failed; inspect private artifacts');}};
const keys=()=>JSON.parse(run('supabase',['projects','api-keys','--project-ref','dzqdzetcctkhbrhlxxgn','--reveal','--output-format','json'])).keys;
const actors=[],sessions=[];let phase='preflight',started=false,stop=false,users=[];
process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
const deadline=Date.now()+scenario.maxWindowMinutes*60000;
function within(){assert.ok(!stop,'Stop requested');assert.ok(Date.now()<deadline,'Window deadline exceeded');}
const call=async(path,{token,actor,body}={})=>{const r=await fetch(origin+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(token?{authorization:'Bearer '+token}:{}),...(actor?{Cookie:actor.cookie()}:{}),...(body?{'Content-Type':'application/json',...(actor?{Origin:origin}:{})}: {})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};
async function login(u){
 const attemptId=randomUUID();let r=await call('/api/auth/native/v2/credentials',{body:{email:u.email,password:u.password,attemptId}});assert.equal(r.status,200);const token=r.body.accessToken;assert.ok(token);sessions.push({locale:u.locale,token});
 r=await call('/api/auth/native/v2/login',{token,body:{attemptId}});assert.equal(r.status,200);
 r=await call(base+'/policy',{token});assert.equal(r.status,200);const expected=JSON.parse(fs.readFileSync('/Users/jtcao/Library/Caches/visepanda/specific-gaps-20260914/policy.json','utf8'));assert.equal(r.body.policy.id,scenario.policyId);assert.equal(r.body.policy.noticeHash,expected.notice_hash);assert.equal(r.body.policy.noticeEn,expected.notice_en);assert.equal(r.body.policy.noticeZh,expected.notice_zh);
 assert.equal((await call(base+'/consent',{token,body:{policyId:scenario.policyId,noticeHash:expected.notice_hash}})).status,200);return token;
}
async function logoutAll(){
 let failed=false;
 for(const s of [...sessions]){try{const result=await call('/api/auth/native/v2/logout',{token:s.token,body:{}});state.cleanup.push({operation:'nativeLogout',locale:s.locale,status:result.status});save();assert.equal(result.status,200);sessions.splice(sessions.indexOf(s),1);}catch{failed=true;state.cleanup.push({operation:'nativeLogout',locale:s.locale,status:'FAIL'});save();}}
 assert.equal(failed,false,'One or more native logout attempts failed');
}
async function worker(locale,index){
 within();assert.ok(state.workerLaunches<scenario.maxNewModelAttempts);const receipts=root+'/worker-'+index+'.jsonl';assert.ok(!fs.existsSync(receipts));
 const key=keys().find(k=>k.name==='service_role'&&k.type==='legacy')?.api_key;assert.ok(key);const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));assert.equal(claims.ref,'dzqdzetcctkhbrhlxxgn');assert.equal(claims.role,'service_role');
 const provider=run('security',['find-generic-password','-a','VP-V4','-s','VP-V4.QWEN_API_KEY','-w']).trim();assert.ok(provider);state.workerLaunches++;save();
 const child=spawn(process.execPath,['--experimental-strip-types',repo+'/lib/server/jobs/run-staging-text-worker.mjs','--config',root+'/worker-'+locale+'.json','--receipts',receipts],{cwd:repo,env:{...process.env,VISEPANDA_STAGING_TEXT_WORKER:'true',VISEPANDA_STAGING_TEXT_WORKER_KEY:key,VISEPANDA_STAGING_TEXT_PROVIDER_KEY:provider},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',x=>output+=x);child.stderr.resume();const timer=setTimeout(()=>child.kill('SIGTERM'),120000);
 const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);}).finally(()=>clearTimeout(timer));
 const result=JSON.parse(output.trim());const records=fs.readFileSync(receipts,'utf8').trim().split('\n').map(JSON.parse),returned=records.find(r=>r.phase==='returned');assert.equal(returned?.prompt?.version,'vp-knowledge-intent-v6');return{exitCode,result:result.result,receipts,prompt:returned.prompt};
}

try{
 assert.ok(!exists('place-run.json'),'Never repeat the diagnostic run');assert.ok(!exists('activation-intent.json'));
 assert.equal(state.scenarioHash,fs.readFileSync(root+'/scenario.sha256','utf8').trim());
 assert.equal(scenario.maxNewModelAttempts,1);assert.equal(deployment.readyState,'READY');assert.notEqual(deployment.target,'production');assert.equal(deployment.sha,scenario.apiSourceCommit);
 assert.equal(read('budget-preflight.json').status,'PASS');assert.ok(Date.now()-Date.parse(read('budget-preflight.json').at)<10*60000);
 write('place-run.json',state);started=true;
 phase='activation';console.log(run('node',['window-state.mjs','activate']));phase='host-allow';console.log(run('python3',['firewall-scope.py','allow']));
 within();phase='login';const u=JSON.parse(fs.readFileSync('/Users/jtcao/Library/Caches/visepanda/s2-live-brrfsvtp/accounts.json','utf8')).users.find(x=>x.locale==='en');const token=await login(u);
 within();phase='admit';const request={threadId:randomUUID(),turnId:randomUUID(),idempotencyKey:randomUUID(),policyId:scenario.policyId,locale:'en',city:'shanghai',text:scenario.text,serviceTask:{id:randomUUID(),scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
 const task={request};state.tasks.push(task);save();task.admission=await call(base+'/turns',{token,body:request});save();assert.equal(task.admission.status,201);
 phase='worker';task.worker=await worker('en',1);save();assert.equal(task.worker.exitCode,0);assert.equal(task.worker.result,'finished');assert.equal(task.worker.prompt.digest,scenario.promptDigest);
 const records=fs.readFileSync(root+'/worker-1.jsonl','utf8').trim().split('\n').map(JSON.parse);
 const usage=records.filter(x=>x.schemaVersion==='vpj07-usage-journal/1');assert.equal(usage.length,1);assert.equal(usage[0].receipt.turnId,request.turnId);
 const diagnoses=records.filter(x=>x.schemaVersion==='vpj07-knowledge-validation-journal/1');assert.equal(diagnoses.length,1);assert.equal(diagnoses[0].receipt.turnId,request.turnId);task.diagnosis=diagnoses[0].receipt;save();
 phase='read-result';const history=await call(base+'/turns',{token});assert.equal(history.status,200);task.turn=history.body.turns.find(x=>x.turnId===request.turnId);assert.ok(task.turn);save();
 state.status='DIAGNOSIS_CAPTURED';state.originalAcceptance='FAIL_UNCHANGED';save();
}catch(e){if(started){state.status='FAIL';state.failure={phase,errorType:e.name,message:e.name==='AssertionError'?e.message:'Private details suppressed'};save();}process.exitCode=1;console.error(JSON.stringify({status:'STOPPED',phase,errorType:e.name}));}
finally{
 if(started){
  try{await logoutAll();}catch{state.cleanup.push({operation:'nativeLogout',status:'FAIL'});process.exitCode=1;}
  try{
   if(exists('activation-transaction.json')){console.log(run('node',['window-state.mjs','disable']));state.cleanup.push({operation:'disable',status:'PASS'});}
   else {console.log(run('node',['window-state.mjs','inspect']));const s=read('inspected.json').state;assert.ok(!s.ops&&!s.reader&&s.activeMembers===0);state.cleanup.push({operation:'notActivated',status:'PASS'});}
  }catch{state.cleanup.push({operation:'disable',status:'FAIL'});process.exitCode=1;}
  if(exists('firewall-allow-plan.json'))try{console.log(run('python3',['firewall-scope.py','remove']));state.cleanup.push({operation:'removeOwnHost',status:'PASS'});}catch{state.cleanup.push({operation:'removeOwnHost',status:'FAIL'});process.exitCode=1;}
  if(process.exitCode)state.status='FAIL';state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:state.status,calls:state.workerLaunches,diagnosis:state.tasks[0]?.diagnosis,cleanup:state.cleanup}));
 }
}
