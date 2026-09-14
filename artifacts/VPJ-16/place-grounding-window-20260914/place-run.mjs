import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const root='/Users/jtcao/Library/Caches/visepanda/place-grounding-staging-20260914',repo=root+'/frozen';
const read=n=>JSON.parse(fs.readFileSync(root+'/'+n,'utf8')),exists=n=>fs.existsSync(root+'/'+n);
const {isOpsInput}=await import(repo+'/lib/server/knowledge/review/local-workspace.ts');
const scenario=read('scenario.json'),deployment=read('preview-state.json'),origin='https://'+deployment.url,base='/api/chat/native/v4';
const {createServerClient}=createRequire('/Users/jtcao/Documents/VP-V4-S2-Place-Grounding/package.json')('@supabase/ssr');
const state={schemaVersion:'place-staging-observation/1',status:'STARTED',startedAt:new Date().toISOString(),sourceCommit:scenario.sourceCommit,scenarioHash:createHash('sha256').update(fs.readFileSync(root+'/scenario.json')).digest('hex'),operations:[],tasks:[],observations:[],workerLaunches:0,cleanup:[]};
const save=()=>{const fd=fs.openSync(root+'/place-run.json','w',0o600);try{fs.writeFileSync(fd,JSON.stringify(state,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
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
 await op(actors[1],{action:'review',operationId:randomUUID(),candidateId:item.candidateId,expectedVersion:1,decision:'reviewed',note:'Independent identity review of owned synthetic place test material only.'});
 const expiresAt=new Date(Date.now()+scenario.publicationLifetimeSeconds*1000).toISOString();
 await op(actors[1],{action:'publish_statement',operationId:randomUUID(),candidateId:item.candidateId,expectedVersion:2,expiresAt,useBasis:'original_factual_summary',useNote:'Owned synthetic private Staging place test. No real travel claim.'});
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
 const result=JSON.parse(output.trim());const records=fs.readFileSync(receipts,'utf8').trim().split('\n').map(JSON.parse),returned=records.find(r=>r.phase==='returned');assert.equal(returned?.prompt?.version,'vp-knowledge-intent-v6');return{exitCode,result:result.result,receipts,prompt:returned.prompt};
}

function matches(sample,turn){
 const result=turn.result;assert.equal(result.intent,sample.intent);assert.equal(result.requestScope,sample.requestScope);assert.equal(result.originalOutcome,sample.outcome);
 const needs=result.unansweredNeeds;assert.ok(Array.isArray(needs)&&needs.length<=6&&needs.every(x=>typeof x==='string'&&x.trim()&&[...x].length<=240&&sample.text.includes(x)));assert.equal(needs.length>0,sample.requestScope==='additional_needs');
 const joined=needs.join('\n');for(const f of [...(sample.fragments??[]),...(sample.requiredFragments??[])])assert.ok(joined.toLowerCase().includes(f.toLowerCase()));for(const f of sample.forbiddenFragments??[])assert.ok(!joined.toLowerCase().includes(f.toLowerCase()));
 if(Object.hasOwn(sample,'placeResolution'))assert.equal(result.placeResolution,sample.placeResolution);
 if(sample.placeResolution==='matched'){assert.equal(result.placeSubjectId,'cedar_moon_gallery');assert.equal(result.placeName,sample.locale==='en'?'Cedar Moon Gallery':'杉月展馆');
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
  task.worker=await worker(u.locale,state.tasks.length);save();assert.equal(task.worker.exitCode,0);assert.equal(task.worker.result,'finished');
  const h=await call(base+'/turns',{token});assert.equal(h.status,200);task.original=h.body.turns.find(t=>t.turnId===request.turnId);assert.ok(task.original);save();matches(sample,task.original);task.matches=true;
  const other=actors.find(a=>a.locale!==u.locale),foreign=await call('/api/chat/grounded',{actor:other});assert.equal(foreign.status,200);assert.ok(!foreign.body.data.turns.some(t=>t.id===request.turnId));task.foreignOwnerHidden=true;save();await logoutAll();
  console.log(JSON.stringify({group,id:sample.id,locale:u.locale,status:'PASS',calls:state.workerLaunches}));
 }
}
async function retained(stage){
 const snapshot={stage,at:new Date().toISOString(),rows:[]};
 for(const actor of actors){const r=await call('/api/chat/grounded',{actor});assert.equal(r.status,200);
  for(const task of state.tasks.filter(t=>t.locale===actor.locale&&['before','current'].includes(t.group))){
   const turn=r.body.data.turns.find(t=>t.id===task.request.turnId);assert.ok(turn);assert.equal(turn.outcome,task.original.outcome);assert.equal(turn.questionId,task.expected.intent);
   const originalPartial=task.sampleId.startsWith('partial'),hoursOnly=task.sampleId.startsWith('hours');
   const expectedCoverage=stage==='revoked'?(originalPartial||task.expected.intent==='place_address'?'no_answer':'partial'):originalPartial?'partial':'answered';
   assert.equal(turn.coverage,stage==='revoked'&&hoursOnly?'answered':expectedCoverage);
   if(originalPartial)assert.ok(turn.missingClaims.includes('opening_hours'));
   if(stage!=='revoked'){assert.ok(turn.facts.some(f=>f.placeDetails?.some(t=>t.includes('18 Cedar Moon Test Road')))||hoursOnly);}
   if(!originalPartial&&task.expected.intent!=='place_address')assert.ok(turn.facts.some(f=>f.placeDetails?.some(t=>t.includes(scenario.localDate+' 09:00:00')&&t.includes('Asia/Shanghai'))));
   snapshot.rows.push({id:turn.id,questionId:turn.questionId,outcome:turn.outcome,coverage:turn.coverage,facts:turn.facts,missingClaims:turn.missingClaims});
  }
 }
 state.observations.push(snapshot);save();
}
async function ui(stage){
 phase='ui-'+stage;write(stage+'-ready.json',{stage,deadline:new Date(deadline).toISOString(),nativeQuestions:scenario.nativeQuestions,tasks:state.tasks.filter(t=>t.group!=='legacy').map(t=>({group:t.group,locale:t.locale,id:t.request.turnId,taskId:t.request.serviceTask.id,input:t.request.text}))});
 console.log(JSON.stringify({stage,status:'READY_FOR_UI'}));
 state.nativeTasks??=[];
 while(!exists(stage+'-ui-complete.json')){
  within();if(stage==='current')for(const locale of ['en','zh']){
   const requestFile='native-'+locale+'-worker-request.json';if(!exists(requestFile)||state.nativeTasks.some(t=>t.locale===locale))continue;
   const marker=read(requestFile);assert.equal(marker.locale,locale);assert.equal(marker.input,scenario.nativeQuestions[locale]);
   const entry={locale,startedAt:new Date().toISOString()};state.nativeTasks.push(entry);save();entry.worker=await worker(locale,'native-'+locale);save();assert.equal(entry.worker.exitCode,0);assert.equal(entry.worker.result,'finished');
   const reply=await call('/api/chat/grounded',{actor:actors.find(a=>a.locale===locale)});assert.equal(reply.status,200);
   const found=reply.body.data.turns.filter(t=>t.input===marker.input&&!state.tasks.some(x=>x.request.turnId===t.id));assert.equal(found.length,1);entry.turn=found[0];save();assert.equal(entry.turn.coverage,'answered');assert.equal(entry.turn.questionId,'place_address_and_hours');write('native-'+locale+'-worker-done.json',{status:'PASS',turn:entry.turn});
  }
  await new Promise(r=>setTimeout(r,1000));
 }
 const done=read(stage+'-ui-complete.json');assert.equal(done.status,'PASS');assert.equal(done.nativeSignedOut,true);assert.equal(done.webSignedOut,true);if(stage==='current')assert.equal(state.nativeTasks.length,2);state.observations.push({stage,ui:done});save();
}
try{
 assert.ok(!exists('place-run.json'),'Inspect existing run, never reroll');assert.ok(!exists('activation-intent.json'));assert.equal(state.scenarioHash,fs.readFileSync(root+'/scenario.sha256','utf8').trim());
 assert.equal(new Date(Date.now()+8*3600000).toISOString().slice(0,10),scenario.localDate);assert.equal(read('migration-result.json').migrationCount,48);
 assert.equal(deployment.readyState,'READY');assert.notEqual(deployment.target,'production');assert.equal(deployment.sha,scenario.sourceCommit);assert.equal(read('native-build-result.json').source,scenario.sourceCommit);
 assert.equal(read('budget-preflight.json').status,'PASS');assert.ok(Date.now()-Date.parse(read('budget-preflight.json').at)<10*60000);assert.equal(scenario.maxNewModelAttempts,132);assert.equal(scenario.legacy.length,106);
 for(const item of scenario.statements)assert.ok(isOpsInput({action:'submit_statement',operationId:randomUUID(),candidateId:item.candidateId,title:item.title,statement:item.statement}));
 const maxCases=['before','current','ambiguous','limits','legacy'].reduce((n,k)=>n+scenario[k].length,0);assert.equal(maxCases+scenario.nativeMaxAttempts,scenario.maxNewModelAttempts);
 write('place-run.json',state);started=true;users=JSON.parse(fs.readFileSync('/Users/jtcao/Library/Caches/visepanda/s2-live-brrfsvtp/accounts.json','utf8')).users;assert.deepEqual(users.map(x=>x.locale).sort(),['en','zh']);
 phase='activation';console.log(run('node',['window-state.mjs','activate']));phase='host-allow';console.log(run('python3',['firewall-scope.py','allow']));
 phase='cookie-login';const key=keys().find(k=>k.name==='anon'&&k.type==='legacy')?.api_key;assert.ok(key);
 for(const locale of ['en','zh']){const u=users.find(x=>x.locale===locale),jar=new Map(),auth=createServerClient('https://dzqdzetcctkhbrhlxxgn.supabase.co',key,{auth:{autoRefreshToken:false},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});const signed=await auth.auth.signInWithPassword({email:u.email,password:u.password});assert.equal(signed.error,null);actors.push({id:signed.data.user.id,locale,auth,cookie:()=>[...jar].map(([n,v])=>n+'='+v).join('; ')});}
 assert.deepEqual(actors.map(a=>a.id),['fe70fac7-d312-494c-bde1-4c37c3942722','7d063756-e5d8-4a6b-94a3-5134b0b04443']);
 const initial=await call('/api/ops/review',{actor:actors[1]});assert.equal(initial.status,200);for(const item of scenario.statements)assert.ok(!initial.body.data.candidates.some(c=>c.id===item.candidateId));state.candidateIdsInitiallyAbsent=true;save();
 phase='publish-address-prior';await publish('address');await publish('prior-hours');await produce('before',scenario.before);
 phase='publish-today';await publish('today-hours');await retained('current');await produce('current',scenario.current);await retained('current');await ui('current');
 phase='publish-duplicate';await publish('duplicate-address');await produce('ambiguous',scenario.ambiguous);await retained('ambiguous');
 phase='revoke-address';const address=scenario.statements.find(x=>x.key==='address');await op(actors[1],{action:'revoke_statement',operationId:randomUUID(),candidateId:address.candidateId,expectedPublicationVersion:1,note:'Owned place acceptance: revoke original address and retain saved history.'});await retained('revoked');await ui('revoked');
 await produce('limits',scenario.limits);await produce('legacy',scenario.legacy);
 assert.equal(state.workerLaunches,scenario.maxNewModelAttempts);state.status='PASS';save();
}catch(e){if(started){state.status='FAIL';state.failure={phase,errorType:e.name,message:e.name==='AssertionError'?e.message:'Private transport details suppressed'};save();}console.error(JSON.stringify({status:'STOPPED',phase,errorType:e.name}));process.exitCode=1;}
finally{
 if(started){
  // Cleanup is independent of observation success. Mutations remain restricted to the four
  // candidate IDs durably journaled before this run's normal Ops submissions.
  if(actors.length===2){
   let revokeFailed=false;
   for(const item of scenario.statements){
    const submitted=state.operations.some(o=>o.request.action==='submit_statement'&&o.request.candidateId===item.candidateId);
    if(!submitted||!state.candidateIdsInitiallyAbsent)continue;
    const body={action:'revoke_statement',operationId:randomUUID(),candidateId:item.candidateId,expectedPublicationVersion:1,note:'End of owned synthetic place test.'};
    const record={operation:'revokeOwned',candidateId:item.candidateId,operationId:body.operationId,status:'STARTED',attempts:0};state.cleanup.push(record);save();
    for(let attempt=0;attempt<2;attempt++){
     record.attempts=attempt+1;save();
     try{
      const listing=await call('/api/ops/review',{actor:actors[1]});assert.equal(listing.status,200);const candidate=listing.body.data.candidates.find(c=>c.id===item.candidateId);
      if(!candidate){record.status='ABSENT';break;}
      assert.equal(candidate.authorId,actors[0].id);
      if(!candidate.publication){record.status='NOT_PUBLISHED';break;}
      if(candidate.publication.state==='revoked'){record.status='PASS';break;}
      assert.equal(candidate.publication.version,1);await op(actors[1],body);
      const confirmed=await call('/api/ops/review',{actor:actors[1]});assert.equal(confirmed.status,200);assert.equal(confirmed.body.data.candidates.find(c=>c.id===item.candidateId)?.publication?.state,'revoked');record.status='PASS';break;
     }catch(e){record.errorType=e.name;record.status='UNCERTAIN';save();}
    }
    // Resolve a lost last acknowledgement without generating a new operation.
    if(record.status==='UNCERTAIN'){try{const reply=await call('/api/ops/review',{actor:actors[1]});assert.equal(reply.status,200);const candidate=reply.body.data.candidates.find(c=>c.id===item.candidateId);assert.equal(candidate?.authorId,actors[0].id);assert.equal(candidate?.publication?.state,'revoked');record.status='PASS';}catch{record.status='FAIL';revokeFailed=true;}}
    save();
   }
   if(revokeFailed)process.exitCode=1;
  }
  try{await logoutAll();}catch{state.cleanup.push({operation:'nativeLogout',status:'FAIL'});process.exitCode=1;}
  for(const a of actors){try{const r=await a.auth.auth.signOut({scope:'local'});assert.equal(r.error,null);state.cleanup.push({operation:'cookieLogout',locale:a.locale,status:'PASS'});}catch{state.cleanup.push({operation:'cookieLogout',locale:a.locale,status:'FAIL'});process.exitCode=1;}}
  try{if(exists('activation-transaction.json')){console.log(run('node',['window-state.mjs','disable']));const s=read('after-disable.json').state;assert.ok(!s.ops&&!s.reader&&s.activeMembers===0);state.cleanup.push({operation:'disable',status:'PASS',windowClosed:true});}else{console.log(run('node',['window-state.mjs','inspect']));const s=read('inspected.json').state;state.cleanup.push({operation:'noOwnedActivation',status:'NOT_ACTIVATED',observedWindowClosed:!s.ops&&!s.reader&&s.activeMembers===0});}}catch{state.cleanup.push({operation:'disable',status:'FAIL'});process.exitCode=1;}
  if(exists('firewall-allow-plan.json')){try{console.log(run('python3',['firewall-scope.py','remove']));state.cleanup.push({operation:'removeOwnHost',status:'PASS'});}catch{state.cleanup.push({operation:'removeOwnHost',status:'FAIL'});process.exitCode=1;}}
  if(process.exitCode)state.status='FAIL';state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:state.status,workerLaunches:state.workerLaunches,cleanup:state.cleanup}));
 }
}
