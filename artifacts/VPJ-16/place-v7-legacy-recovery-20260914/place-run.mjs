import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const root='/Users/jtcao/Library/Caches/visepanda/place-v7-legacy-recovery-20260914',repo=root+'/frozen';
const read=n=>JSON.parse(fs.readFileSync(root+'/'+n,'utf8')),exists=n=>fs.existsSync(root+'/'+n);
const {isOpsInput}=await import(repo+'/lib/server/knowledge/review/local-workspace.ts');
const scenario=read('scenario.json'),deployment=read('preview-state.json'),origin='https://'+deployment.url,base='/api/chat/native/v4';
const {createServerClient}=createRequire('/Users/jtcao/Documents/VP-V4-S2-Place-Grounding/package.json')('@supabase/ssr');
const state={schemaVersion:'place-legacy-continuation/1',status:'STARTED',startedAt:new Date().toISOString(),sourceCommit:scenario.sourceCommit,scenarioHash:createHash('sha256').update(fs.readFileSync(root+'/scenario.json')).digest('hex'),operations:[],tasks:[],observations:[],workerLaunches:0,cleanup:[]};
const save=()=>{const fd=fs.openSync(root+'/place-run.json','w',0o600);try{fs.writeFileSync(fd,JSON.stringify(state,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
const write=(name,data)=>fs.writeFileSync(root+'/'+name,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});
const run=(bin,args)=>{try{return execFileSync(bin,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});}catch{throw Error('Operator subprocess failed; inspect private artifacts');}};
const keys=()=>JSON.parse(run('supabase',['projects','api-keys','--project-ref','dzqdzetcctkhbrhlxxgn','--reveal','--output-format','json'])).keys;
const actors=[],sessions=[];let phase='preflight',started=false,stop=false,users=[];
process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
const deadline=Date.now()+scenario.maxWindowMinutes*60000;
function within(){assert.ok(!stop,'Stop requested');assert.ok(Date.now()<deadline,'Window deadline exceeded');}
const safeError=e=>({name:e?.name,code:typeof e?.code==='string'?e.code:undefined,syscall:typeof e?.syscall==='string'?e.syscall:undefined,cause:e?.cause?safeError(e.cause):undefined});
const call=async(path,{token,actor,body}={})=>{
 for(let attempt=0;attempt<(body?1:2);attempt++){
  const observation={at:new Date().toISOString(),method:body?'POST':'GET',path,attempt:attempt+1,phase:'fetch'};
  try{
   const r=await fetch(origin+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(token?{authorization:'Bearer '+token}:{}),...(actor?{Cookie:actor.cookie()}:{}),...(body?{'Content-Type':'application/json',...(actor?{Origin:origin}:{})}: {})},...(body?{body:JSON.stringify(body)}:{})});
   observation.status=r.status;observation.phase='body';const text=await r.text();observation.bytes=Buffer.byteLength(text);observation.phase='json';return {status:r.status,body:JSON.parse(text)};
  }catch(e){state.transportErrors??=[];state.transportErrors.push({...observation,error:safeError(e)});save();if(body||attempt!==0||!['TypeError','TimeoutError'].includes(e.name))throw e;}
 }
};
async function login(u){
 const attemptId=randomUUID();let r=await call('/api/auth/native/v2/credentials',{body:{email:u.email,password:u.password,attemptId}});assert.equal(r.status,200);const token=r.body.accessToken;assert.ok(token);sessions.push({locale:u.locale,token});
 r=await call('/api/auth/native/v2/login',{token,body:{attemptId}});assert.equal(r.status,200);
 r=await call(base+'/policy',{token});assert.equal(r.status,200);const expected=JSON.parse(fs.readFileSync('/Users/jtcao/Library/Caches/visepanda/specific-gaps-20260914/policy.json','utf8'));assert.equal(r.body.policy.id,scenario.policyId);assert.equal(r.body.policy.noticeHash,expected.notice_hash);assert.equal(r.body.policy.noticeEn,expected.notice_en);assert.equal(r.body.policy.noticeZh,expected.notice_zh);
 assert.equal((await call(base+'/consent',{token,body:{policyId:scenario.policyId,noticeHash:expected.notice_hash}})).status,200);return token;
}
async function readHistory(u,token){
 try{return await call(base+'/turns',{token});}
 catch(e){
  if(!['TypeError','TimeoutError'].includes(e.name))throw e;
  within();state.readRecoveries??=[];assert.ok(state.readRecoveries.length<3,'Read recovery cap reached');
  const row={locale:u.locale,at:new Date().toISOString(),status:'STARTED',modelCalls:0};state.readRecoveries.push(row);save();
  const replacement=await login(u);const old=sessions.findIndex(s=>s.token===token);assert.ok(old>=0);sessions.splice(old,1);
  row.status='SESSION_REPLACED';save();const result=await call(base+'/turns',{token:replacement});assert.equal(result.status,200);row.status='READ_RETURNED';save();return result;
 }
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
 const result=JSON.parse(output.trim());const records=fs.readFileSync(receipts,'utf8').trim().split('\n').map(JSON.parse),returned=records.find(r=>r.phase==='returned');assert.equal(returned?.prompt?.version,'vp-knowledge-intent-v7');return{exitCode,result:result.result,receipts,prompt:returned.prompt};
}

function matches(sample,turn){
 const result=turn.result;assert.equal(result.intent,sample.intent);assert.equal(result.requestScope,sample.requestScope);assert.equal(result.originalOutcome,sample.outcome);
 const needs=result.unansweredNeeds;assert.ok(Array.isArray(needs)&&needs.length<=6&&needs.every(x=>typeof x==='string'&&x.trim()&&[...x].length<=240&&sample.text.includes(x)));assert.equal(needs.length>0,sample.requestScope==='additional_needs');
 const joined=needs.join('\n');for(const f of [...(sample.fragments??[]),...(sample.requiredFragments??[])])assert.ok(joined.toLowerCase().includes(f.toLowerCase()));for(const f of sample.forbiddenFragments??[])assert.ok(!joined.toLowerCase().includes(f.toLowerCase()));
 if(Object.hasOwn(sample,'placeResolution'))assert.equal(result.placeResolution,sample.placeResolution);
 if(sample.placeResolution==='matched'){assert.equal(result.placeSubjectId,'willow_dawn_gallery_20260914');assert.equal(result.placeName,sample.locale==='en'?'Willow Dawn Gallery':'柳晓展馆');
  assert.equal(result.knowledge.answer.subjectId,result.placeSubjectId);const missing=result.knowledge.answer.claims.filter(c=>c.status!=='covered').map(c=>c.id);assert.deepEqual(missing,sample.missing??[]);
  if(missing.length)assert.deepEqual(result.knowledge.answer.claims.find(c=>c.id==='opening_hours').reasons,['not_current_date']);
 }
}
async function produce(group,samples){
 for(const sample of samples){
  within();phase=group+'-'+sample.locale+'-'+sample.id;const u=users.find(u=>u.locale===sample.locale),token=await login(u);
  const request={threadId:randomUUID(),turnId:randomUUID(),idempotencyKey:randomUUID(),policyId:scenario.policyId,locale:u.locale,city:sample.city??'shanghai',text:sample.text,serviceTask:{id:randomUUID(),scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
  const task={group,locale:u.locale,sampleId:sample.id,expected:sample,request};state.tasks.push(task);save();task.admission=await call(base+'/turns',{token,body:request});save();assert.equal(task.admission.status,201);
  const replay=await call(base+'/turns',{token,body:request});assert.equal(replay.status,200);assert.equal(replay.body.turnId,request.turnId);task.replayBound=true;save();
  task.worker=await worker(u.locale,state.tasks.length);save();assert.equal(task.worker.exitCode,0);assert.equal(task.worker.result,'finished');assert.equal(task.worker.prompt.digest,scenario.promptDigest);const journal=fs.readFileSync(root+'/worker-'+state.tasks.length+'.jsonl','utf8').trim().split('\n').map(JSON.parse);const diagnostic=journal.filter(x=>x.schemaVersion==='vpj07-knowledge-validation-journal/1');assert.equal(diagnostic.length,1);assert.equal(diagnostic[0].receipt.turnId,request.turnId);task.diagnosis=diagnostic[0].receipt;save();assert.equal(task.diagnosis.reason,'valid');
  const h=await readHistory(u,token);assert.equal(h.status,200);task.original=h.body.turns.find(t=>t.turnId===request.turnId);assert.ok(task.original);save();matches(sample,task.original);task.matches=true;
  const other=actors.find(a=>a.locale!==u.locale),foreign=await call('/api/chat/grounded',{actor:other});assert.equal(foreign.status,200);assert.ok(!foreign.body.data.turns.some(t=>t.id===request.turnId));task.foreignOwnerHidden=true;save();await logoutAll();
  console.log(JSON.stringify({group,id:sample.id,locale:u.locale,status:'PASS',calls:state.workerLaunches}));
 }
}

try{
 assert.ok(!exists('place-run.json'));assert.ok(!exists('activation-intent.json'));assert.equal(state.scenarioHash,fs.readFileSync(root+'/scenario.sha256','utf8').trim());
 const prior=JSON.parse(fs.readFileSync(scenario.continuationOf));assert.ok(prior.finishedAt);assert.equal(prior.workerLaunches,1);assert.equal(prior.tasks.length,1);
 assert.equal(createHash('sha256').update(fs.readFileSync(scenario.continuationOf)).digest('hex'),scenario.originalRunHash);
 const originalPath='/Users/jtcao/Library/Caches/visepanda/place-v7-isolated-20260914/scenario.json';assert.equal(createHash('sha256').update(fs.readFileSync(originalPath)).digest('hex'),scenario.originalScenarioHash);assert.deepEqual(scenario.legacy,JSON.parse(fs.readFileSync(originalPath)).legacy.slice(21));
 assert.equal(read('before.json').state.migrations,48);assert.equal(read('before.json').state.attempts,406);assert.equal(scenario.maxNewModelAttempts,85);assert.equal(scenario.legacy.length,85);
 assert.equal(deployment.readyState,'READY');assert.notEqual(deployment.target,'production');assert.equal(deployment.sha,scenario.apiSourceCommit);
 assert.equal(read('budget-preflight.json').status,'PASS');assert.ok(Date.now()-Date.parse(read('budget-preflight.json').at)<10*60000);
 write('place-run.json',state);started=true;users=JSON.parse(fs.readFileSync('/Users/jtcao/Library/Caches/visepanda/s2-live-brrfsvtp/accounts.json','utf8')).users;assert.deepEqual(users.map(x=>x.locale).sort(),['en','zh']);
 phase='activation';console.log(run('node',['window-state.mjs','activate']));assert.equal(read('activated.json').state.ops,false);assert.equal(read('activated.json').state.activeMembers,0);
 phase='host-allow';console.log(run('python3',['firewall-scope.py','allow']));
 phase='cookie-login';const key=keys().find(k=>k.name==='anon'&&k.type==='legacy')?.api_key;assert.ok(key);
 for(const locale of ['en','zh']){const u=users.find(x=>x.locale===locale),jar=new Map(),auth=createServerClient('https://dzqdzetcctkhbrhlxxgn.supabase.co',key,{auth:{autoRefreshToken:false},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});const signed=await auth.auth.signInWithPassword({email:u.email,password:u.password});assert.equal(signed.error,null);actors.push({id:signed.data.user.id,locale,auth,cookie:()=>[...jar].map(([n,v])=>n+'='+v).join('; ')});}
 assert.deepEqual(actors.map(a=>a.id),['fe70fac7-d312-494c-bde1-4c37c3942722','7d063756-e5d8-4a6b-94a3-5134b0b04443']);

 phase='recover-existing-read';const interrupted=prior.tasks.at(-1);assert.equal(interrupted.request.turnId,scenario.recoverTurnId);assert.equal(interrupted.diagnosis.reason,'valid');
 const recoveryUser=users.find(x=>x.locale===interrupted.locale),token=await login(recoveryUser);const result=await readHistory(recoveryUser,token);assert.equal(result.status,200);const turn=result.body.turns.find(t=>t.turnId===scenario.recoverTurnId);assert.ok(turn);matches(interrupted.expected,turn);
 const foreign=await call('/api/chat/grounded',{actor:actors.find(a=>a.locale!==interrupted.locale)});assert.equal(foreign.status,200);assert.ok(!foreign.body.data.turns.some(t=>t.id===turn.turnId));
 state.recoveredRead={turnId:turn.turnId,original:turn,matches:true,foreignOwnerHidden:true,modelCalls:0,at:new Date().toISOString()};save();await logoutAll();
 await produce('legacy',scenario.legacy);assert.equal(state.workerLaunches,85);state.status='PASS';save();
}catch(e){if(started){state.status='FAIL';state.failure={phase,errorType:e.name,message:e.name==='AssertionError'?e.message:'Private transport details suppressed'};save();}console.error(JSON.stringify({status:'STOPPED',phase,errorType:e.name}));process.exitCode=1;}
finally{
 if(started){
  try{await logoutAll();}catch{state.cleanup.push({operation:'nativeLogout',status:'FAIL'});process.exitCode=1;}
  for(const a of actors){try{const r=await a.auth.auth.signOut({scope:'local'});assert.equal(r.error,null);state.cleanup.push({operation:'cookieLogout',locale:a.locale,status:'PASS'});}catch{state.cleanup.push({operation:'cookieLogout',locale:a.locale,status:'FAIL'});process.exitCode=1;}}
  try{if(exists('activation-transaction.json')){console.log(run('node',['window-state.mjs','disable']));const s=read('after-disable.json').state;assert.ok(!s.ops&&!s.reader&&s.activeMembers===0);state.cleanup.push({operation:'disable',status:'PASS'});}}catch{state.cleanup.push({operation:'disable',status:'FAIL'});process.exitCode=1;}
  if(exists('firewall-allow-plan.json')){try{console.log(run('python3',['firewall-scope.py','remove']));state.cleanup.push({operation:'removeOwnHost',status:'PASS'});}catch{state.cleanup.push({operation:'removeOwnHost',status:'FAIL'});process.exitCode=1;}}
  if(process.exitCode)state.status='FAIL';state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:state.status,workerLaunches:state.workerLaunches,cleanup:state.cleanup}));
 }
}
