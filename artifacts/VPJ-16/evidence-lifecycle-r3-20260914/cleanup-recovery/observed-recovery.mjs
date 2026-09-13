import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
const root=new URL('./',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(n,root),'utf8')),exists=n=>fs.existsSync(new URL(n,root));assert.ok(!exists('recovery.json'),'Inspect existing recovery rather than restarting');
const source=read('../evidence-lifecycle-r3-20260914/lifecycle.json'),targets=read('targets.json'),preview=read('preview-state.json'),origin='https://'+preview.url;
assert.equal(source.candidateIdsInitiallyAbsent,true);assert.equal(targets.rows.length,2);assert.equal(preview.target,null);assert.equal(preview.readyState,'READY');
let stopped=false;const activeRequests=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;activeRequests.abort();});
const checkStop=()=>assert.ok(!stopped,'Recovery interrupted; perform cleanup');
const state={startedAt:new Date().toISOString(),status:'STARTED',modelCalls:0,operations:targets.rows.map(t=>({candidateId:t.candidateId,operationId:randomUUID(),attempts:[]})),cleanup:[]};
const save=()=>{const fd=fs.openSync(new URL('recovery.json',root),'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(state,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
const run=(bin,args)=>{try{return execFileSync(bin,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});}catch{throw Error('Operator subprocess failed; inspect retained artifacts');}};
const {createServerClient}=createRequire('/Users/jtcao/Documents/VP-V4-S2-Specific-Gaps/package.json')('@supabase/ssr');let auth;const jar=new Map(),deadline=Date.now()+600000;
const call=async body=>{checkStop();assert.ok(Date.now()<deadline,'Recovery deadline');const response=await fetch(origin+'/api/ops/review',{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.any([activeRequests.signal,AbortSignal.timeout(20000)]),headers:{Cookie:[...jar].map(([n,v])=>n+'='+v).join('; '),...(body?{'Content-Type':'application/json',Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
save();
try{
 checkStop();state.activation=run('node',['window-state.mjs','activate']);save();checkStop();state.hostAllowance=run('python3',['firewall-scope.py','allow']);save();
 checkStop();const keys=JSON.parse(run('supabase',['projects','api-keys','--project-ref','dzqdzetcctkhbrhlxxgn','--reveal','--output-format','json'])).keys;const key=keys.find(k=>k.name==='anon'&&k.type==='legacy')?.api_key;assert.ok(key);
 auth=createServerClient('https://dzqdzetcctkhbrhlxxgn.supabase.co',key,{auth:{autoRefreshToken:false},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});
 const user=read('../s2-live-brrfsvtp/accounts.json').users.find(x=>x.locale==='zh');const signed=await auth.auth.signInWithPassword({email:user.email,password:user.password});assert.equal(signed.error,null);assert.equal(signed.data.user.id,'7d063756-e5d8-4a6b-94a3-5134b0b04443');
 let listing;for(let i=0;i<2;i++){try{listing=await call();break;}catch(e){state.listingTransportErrors??=[];state.listingTransportErrors.push({at:new Date().toISOString(),name:e.name,code:e.cause?.code??null,causeName:e.cause?.name??null});save();if(stopped||i===1)throw e;}}state.listingStatus=listing.status;save();assert.equal(listing.status,200);assert.ok(Array.isArray(listing.body.data?.candidates),'Expected Ops candidate listing');
 for(const item of state.operations){
  const c=listing.body.data.candidates.find(x=>x.id===item.candidateId);assert.ok(c);assert.equal(c.authorId,'fe70fac7-d312-494c-bde1-4c37c3942722');assert.equal(c.publication.state,'published');assert.equal(c.publication.version,1);
  const body={action:'revoke_statement',operationId:item.operationId,candidateId:item.candidateId,expectedPublicationVersion:1,note:'Complete owned lifecycle v3 cleanup after failed automatic listing; no model calls.'};
  for(let i=0;i<2;i++){
   item.attempts.push({at:new Date().toISOString(),request:body});save();
   let result;try{result=await call(body);}catch(e){item.attempts[i].transportError={name:e.name,message:e.message==='fetch failed'?'fetch failed':'Private transport details suppressed',code:e.cause?.code??null,causeName:e.cause?.name??null};save();if(stopped||i===1)throw e;continue;}
   item.attempts[i].status=result.status;item.attempts[i].result=result.body.data??result.body.error;save();assert.equal(result.status,200);break;
  }
 }
 state.status='PASS';save();
}catch(e){state.status='FAIL';state.error={name:e.name,code:e.cause?.code??null,causeName:e.cause?.name??null,message:e.name==='AssertionError'?e.message:e.message==='fetch failed'?'fetch failed':'Private transport details suppressed'};save();process.exitCode=1;}
finally{
 if(auth){try{const r=await auth.auth.signOut({scope:'local'});assert.equal(r.error,null);state.cleanup.push({operation:'cookieLogout',status:'PASS'});}catch{state.cleanup.push({operation:'cookieLogout',status:'FAIL'});process.exitCode=1;}}
 try{if(exists('activation-transaction.json')){state.disable=run('node',['window-state.mjs','disable']);state.cleanup.push({operation:'disable',status:'PASS'});}else state.cleanup.push({operation:'disable',status:'NOT_ACTIVATED'});}catch{state.cleanup.push({operation:'disable',status:'FAIL'});process.exitCode=1;}
 if(exists('firewall-allow-plan.json'))try{state.firewall=run('python3',['firewall-scope.py','remove']);state.cleanup.push({operation:'removeOwnHost',status:'PASS'});}catch{state.cleanup.push({operation:'removeOwnHost',status:'FAIL'});process.exitCode=1;}
 if(process.exitCode)state.status='FAIL';state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:state.status,modelCalls:0,cleanup:state.cleanup,error:state.error}));
}
