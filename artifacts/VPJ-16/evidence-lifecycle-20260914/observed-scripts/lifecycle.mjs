import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const root='/Users/jtcao/Library/Caches/visepanda/evidence-lifecycle-20260914',repo=root+'/frozen';
const read=n=>JSON.parse(fs.readFileSync(root+'/'+n,'utf8')),exists=n=>fs.existsSync(root+'/'+n);
const scenario=read('scenario.json'),deployment=read('preview-state.json'),origin='https://'+deployment.url,base='/api/chat/native/v4';
const {createServerClient}=createRequire('/Users/jtcao/Documents/VP-V4-S2-Specific-Gaps/package.json')('@supabase/ssr');
const state={schemaVersion:'knowledge-lifecycle-observation/1',status:'STARTED',startedAt:new Date().toISOString(),sourceCommit:scenario.sourceCommit,scenarioHash:createHash('sha256').update(fs.readFileSync(root+'/scenario.json')).digest('hex'),operations:[],tasks:[],observations:[],workerLaunches:0,cleanup:[]};
const save=()=>{const fd=fs.openSync(root+'/lifecycle.json','w',0o600);try{fs.writeFileSync(fd,JSON.stringify(state,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
const write=(name,data)=>fs.writeFileSync(root+'/'+name,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});
const run=(bin,args)=>{try{return execFileSync(bin,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});}catch{throw Error('Operator subprocess failed; inspect private artifacts');}};
const keys=()=>JSON.parse(run('supabase',['projects','api-keys','--project-ref','dzqdzetcctkhbrhlxxgn','--reveal','--output-format','json'])).keys;
const actors=[],sessions=[];let phase='preflight',started=false,stop=false,users=[];
process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
const deadline=Date.now()+scenario.maxWindowMinutes*60000;
function within(){assert.ok(!stop,'Stop requested');assert.ok(Date.now()<deadline,'Window deadline exceeded');}
const call=async(path,{token,actor,body}={})=>{const r=await fetch(origin+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(token?{authorization:'Bearer '+token}:{}),...(actor?{Cookie:actor.cookie()}:{}),...(body?{'Content-Type':'application/json',...(actor?{Origin:origin}:{})}: {})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};
async function op(actor,body){
 const entry={actor:actor.id,request:body,startedAt:new Date().toISOString()};state.operations.push(entry);save();
 const result=await call('/api/ops/review',{actor,body});entry.status=result.status;entry.finishedAt=new Date().toISOString();
 // A mutation response contains only this owned synthetic candidate. Never persist a workspace listing.
 if(result.status===200)entry.result=result.body.data;else entry.error=result.body.error;save();assert.equal(result.status,200,'Ops operation did not acknowledge success');return result.body.data;
}
async function publish(key){
 within();const item=scenario.statements.find(x=>x.key===key);assert.ok(item);
 await op(actors[0],{action:'submit_statement',operationId:randomUUID(),candidateId:item.candidateId,title:item.title,statement:item.statement});
 await op(actors[1],{action:'review',operationId:randomUUID(),candidateId:item.candidateId,expectedVersion:1,decision:'reviewed',note:'Independent identity review of owned synthetic lifecycle test material only.'});
 const expiresAt=new Date(Date.now()+scenario.publicationLifetimesSeconds[key]*1000).toISOString();
 await op(actors[1],{action:'publish_statement',operationId:randomUUID(),candidateId:item.candidateId,expectedVersion:2,expiresAt,useBasis:'original_factual_summary',useNote:'Owned synthetic private Staging lifecycle test. No real travel claim.'});
 state[key+'ExpiresAt']=expiresAt;save();
}
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
 const result=JSON.parse(output.trim());return{exitCode,result:result.result,receipts};
}
async function produce(group,users){
 for(const u of users){
  within();phase=group+'-'+u.locale;const token=await login(u),request={threadId:randomUUID(),turnId:randomUUID(),idempotencyKey:randomUUID(),policyId:scenario.policyId,locale:u.locale,city:scenario.city,text:scenario.questions[u.locale],serviceTask:{id:randomUUID(),scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
  assert.ok(state.tasks.length<scenario.maxNewModelAttempts);const task={group,locale:u.locale,request};state.tasks.push(task);save();
  task.admission=await call(base+'/turns',{token,body:request});save();assert.equal(task.admission.status,201);assert.equal(task.admission.body.turnId,request.turnId);
  task.worker=await worker(u.locale,state.tasks.length);save();assert.equal(task.worker.exitCode,0);assert.equal(task.worker.result,'finished');
  const history=await call(base+'/turns',{token});assert.equal(history.status,200);task.original=history.body.turns.find(t=>t.turnId===request.turnId);assert.ok(task.original);assert.equal(task.original.result.intent,scenario.questionId);assert.equal(task.original.result.requestScope,'single');assert.equal(task.original.result.originalOutcome,group==='before'?'answered':'partial');save();
  await logoutAll();
 }
}
function expect(stage,task){return stage===0?['answered',2]:stage===1?['partial',1]:stage===2?(task.group==='before'?['answered',2]:['partial',1]):(task.group==='before'?['partial',1]:['no_answer',0]);}
async function observe(stage){
 const entry={stage:scenario.stages[stage].id,at:new Date().toISOString(),web:[]};
 for(const actor of actors){
  const reply=await call('/api/chat/grounded',{actor});assert.equal(reply.status,200);
  for(const task of state.tasks.filter(t=>t.locale===actor.locale)){
   const turn=reply.body.data.turns.find(t=>t.id===task.request.turnId);assert.ok(turn);const [coverage,count]=expect(stage,task);entry.web.push({group:task.group,locale:task.locale,turn});state.observations.push({...entry,partial:true});save();state.observations.pop();assert.equal(turn.coverage,coverage);assert.equal(turn.facts.length,count);assert.equal(turn.outcome,task.group==='before'?'answered':'partial');
  }
  for(const other of state.tasks.filter(t=>t.locale!==actor.locale))assert.ok(!reply.body.data.turns.some(t=>t.id===other.request.turnId));
 }
 entry.native=[];
 for(const u of users){const token=await login(u),reply=await call(base+'/turns',{token});assert.equal(reply.status,200);
  for(const task of state.tasks.filter(t=>t.locale===u.locale)){const turn=reply.body.turns.find(t=>t.turnId===task.request.turnId);assert.ok(turn);entry.native.push({group:task.group,locale:u.locale,turn});state.inProgressObservation=entry;save();const knowledge=turn.result.knowledge,[coverage,count]=expect(stage,task);assert.equal(knowledge.answer.outcome,coverage);assert.equal(knowledge.statements.length,count);assert.equal(turn.result.originalOutcome,task.group==='before'?'answered':'partial');
   const mobile=knowledge.answer.claims.find(c=>c.id==='supported_card_merchant_qr_payment'),card=knowledge.answer.claims.find(c=>c.id==='merchant_acceptance_check');
   if(stage===1||(stage>=2&&task.group==='during'))assert.deepEqual(mobile.reasons,['unresolved_variants']);
   if(stage===3)assert.deepEqual([...card.reasons].sort(),['expired','revoked']);
  }for(const other of state.tasks.filter(t=>t.locale!==u.locale))assert.ok(!reply.body.turns.some(t=>t.turnId===other.request.turnId));await logoutAll();
 }
 delete state.inProgressObservation;entry.status='PASS';state.observations.push(entry);save();return entry;
}
async function handoff(stage){
 const label=scenario.stages[stage].id;phase=label;await observe(stage);write(label+'-ready.json',{at:new Date().toISOString(),stage:label,tasks:state.tasks.map(t=>({group:t.group,locale:t.locale,turnId:t.request.turnId,taskId:t.request.serviceTask.id})),deadline:new Date(deadline).toISOString()});console.log(JSON.stringify({stage:label,status:'READY_FOR_UI',next:label+'-ui-complete.json'}));
 while(!exists(label+'-ui-complete.json')){within();await new Promise(r=>setTimeout(r,1000));}
 const ui=read(label+'-ui-complete.json');assert.equal(ui.nativeSignedOut,true);assert.equal(ui.webSignedOut,true);assert.equal(ui.status,'PASS');state.observations.push({stage:label,ui});save();
}
async function until(date){while(Date.now()<Date.parse(date)+2000){within();await new Promise(r=>setTimeout(r,1000));}}
try{
 assert.ok(!exists('lifecycle.json'),'An existing run must be inspected, never rerolled');assert.ok(!exists('activation-intent.json'));assert.equal(state.scenarioHash,fs.readFileSync(root+'/scenario.sha256','utf8').trim());assert.equal(deployment.readyState,'READY');assert.notEqual(deployment.target,'production');assert.equal(deployment.sha,scenario.sourceCommit);assert.equal(read('budget-preflight.json').status,'PASS');assert.ok(Date.now()-Date.parse(read('budget-preflight.json').at)<10*60000);
 assert.equal(['en','zh'].reduce((sum,l)=>sum+2*read('worker-'+l+'.json').budget.reservedMicros,0),scenario.maxReservedMicros);write('lifecycle.json',state);started=true;users=JSON.parse(fs.readFileSync('/Users/jtcao/Library/Caches/visepanda/s2-live-brrfsvtp/accounts.json','utf8')).users;assert.deepEqual(users.map(x=>x.locale).sort(),['en','zh']);
 phase='activation';console.log(run('node',['window-state.mjs','activate']));phase='host-allow';console.log(run('python3',['firewall-scope.py','allow']));
 phase='cookie-login';const key=keys().find(k=>k.name==='anon'&&k.type==='legacy')?.api_key;assert.ok(key);
 for(const locale of ['en','zh']){const u=users.find(x=>x.locale===locale),jar=new Map(),auth=createServerClient('https://dzqdzetcctkhbrhlxxgn.supabase.co',key,{auth:{autoRefreshToken:false},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});const signed=await auth.auth.signInWithPassword({email:u.email,password:u.password});assert.equal(signed.error,null);actors.push({id:signed.data.user.id,locale,auth,cookie:()=>[...jar].map(([n,v])=>n+'='+v).join('; ')});}
 assert.deepEqual(actors.map(a=>a.id),['fe70fac7-d312-494c-bde1-4c37c3942722','7d063756-e5d8-4a6b-94a3-5134b0b04443']);
 const initial=await call('/api/ops/review',{actor:actors[1]});assert.equal(initial.status,200);for(const item of scenario.statements)assert.ok(!initial.body.data.candidates.some(c=>c.id===item.candidateId));state.candidateIdsInitiallyAbsent=true;save();
 phase='publish-card';await publish('card');await produce('before',users);await handoff(0);
 phase='publish-conflict';await publish('mobileConflict');await produce('during',users);await handoff(1);
 await until(state.mobileConflictExpiresAt);await handoff(2);await until(state.cardExpiresAt);await handoff(3);
 state.status='PASS';save();
}catch(e){if(started){state.status='FAIL';state.failure={phase,errorType:e.name,message:e.name==='AssertionError'?e.message:'Private transport details suppressed'};save();}console.error(JSON.stringify({status:'STOPPED',phase,errorType:e.name}));process.exitCode=1;}
finally{
 if(started){
  // Cleanup is independent of observation success. Mutations remain restricted to the two
  // candidate IDs durably journaled before this run's normal Ops submissions.
  if(actors.length===2){try{const listing=await call('/api/ops/review',{actor:actors[1]});assert.equal(listing.status,200);for(const item of scenario.statements){const submitted=state.operations.some(o=>o.request.action==='submit_statement'&&o.request.candidateId===item.candidateId);if(!submitted||!state.candidateIdsInitiallyAbsent)continue;const candidate=listing.body.data.candidates.find(c=>c.id===item.candidateId);if(candidate?.publication?.state==='published'){assert.equal(candidate.authorId,actors[0].id);assert.equal(candidate.publication.version,1);await op(actors[1],{action:'revoke_statement',operationId:randomUUID(),candidateId:item.candidateId,expectedPublicationVersion:candidate.publication.version,note:'End of owned synthetic lifecycle test.'});}}state.cleanup.push({operation:'revokeOwned',status:'PASS'});}catch(e){state.cleanup.push({operation:'revokeOwned',status:'FAIL',errorType:e.name});process.exitCode=1;}}
  try{await logoutAll();}catch{state.cleanup.push({operation:'nativeLogout',status:'FAIL'});process.exitCode=1;}
  for(const a of actors){try{const r=await a.auth.auth.signOut({scope:'local'});assert.equal(r.error,null);state.cleanup.push({operation:'cookieLogout',locale:a.locale,status:'PASS'});}catch{state.cleanup.push({operation:'cookieLogout',locale:a.locale,status:'FAIL'});process.exitCode=1;}}
  try{if(exists('activation-transaction.json')){console.log(run('node',['window-state.mjs','disable']));const s=read('after-disable.json').state;assert.ok(!s.ops&&!s.reader&&s.activeMembers===0);state.cleanup.push({operation:'disable',status:'PASS',windowClosed:true});}else{console.log(run('node',['window-state.mjs','inspect']));const s=read('inspected.json').state;state.cleanup.push({operation:'noOwnedActivation',status:'NOT_ACTIVATED',observedWindowClosed:!s.ops&&!s.reader&&s.activeMembers===0});}}catch{state.cleanup.push({operation:'disable',status:'FAIL'});process.exitCode=1;}
  if(exists('firewall-allow-plan.json')){try{console.log(run('python3',['firewall-scope.py','remove']));state.cleanup.push({operation:'removeOwnHost',status:'PASS'});}catch{state.cleanup.push({operation:'removeOwnHost',status:'FAIL'});process.exitCode=1;}}
  if(process.exitCode)state.status='FAIL';state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:state.status,workerLaunches:state.workerLaunches,cleanup:state.cleanup}));
 }
}
