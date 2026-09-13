import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const root=new URL('./',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(n,root),'utf8'));
const state={schemaVersion:'place-cleanup-recovery/1',startedAt:new Date().toISOString(),modelCalls:0,readerEnabled:false,operations:[],cleanup:[]};
assert.ok(!fs.existsSync(new URL('recovery.json',root)),'Inspect previous recovery');
const save=()=>fs.writeFileSync(new URL('recovery.json',root),JSON.stringify(state,null,2)+'\n',{mode:0o600});
const run=(bin,args)=>execFileSync(bin,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
const original=read('../place-run.json'),observed=read('../post-failure-inspect.json');assert.ok(original.finishedAt);
const ids=['9f2074cc-7d7b-4f78-8940-ad72083ace27','4ff2f6e9-7182-48f1-b843-8d24e021aa76'];
const targets=ids.map(id=>{assert.equal(observed.publications.find(x=>x.candidateId===id).state,'published');const x=original.cleanup.find(x=>x.operation==='revokeOwned'&&x.candidateId===id);assert.ok(x?.operationId);return x;});
const origin='https://'+read('preview-state.json').url;let auth,jar=new Map();
const call=async(body)=>{const r=await fetch(origin+'/api/ops/review',{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{'Content-Type':'application/json',Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200);return (await r.json()).data;};
save();
try{
 run('node',['window-state.mjs','activate']);assert.equal(read('activated.json').state.reader,false);
 run('python3',['firewall-scope.py','allow']);
 const {createServerClient}=createRequire('/Users/jtcao/Documents/VP-V4-S2-Place-Grounding/package.json')('@supabase/ssr');
 const keys=JSON.parse(run('supabase',['projects','api-keys','--project-ref','dzqdzetcctkhbrhlxxgn','--reveal','--output-format','json'])).keys;
 const key=keys.find(k=>k.name==='anon'&&k.type==='legacy')?.api_key;assert.ok(key);
 const u=JSON.parse(fs.readFileSync('/Users/jtcao/Library/Caches/visepanda/s2-live-brrfsvtp/accounts.json')).users.find(x=>x.locale==='zh');
 auth=createServerClient('https://dzqdzetcctkhbrhlxxgn.supabase.co',key,{auth:{autoRefreshToken:false},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:xs=>xs.forEach(x=>jar.set(x.name,x.value))}});
 const signed=await auth.auth.signInWithPassword({email:u.email,password:u.password});assert.equal(signed.error,null);assert.equal(signed.data.user.id,'7d063756-e5d8-4a6b-94a3-5134b0b04443');
 for(const target of targets){
  const row={candidateId:target.candidateId,operationId:target.operationId,status:'STARTED',attempts:0};state.operations.push(row);save();
  for(let n=0;n<3;n++){
   row.attempts=n+1;save();
   try{
    let c=(await call()).candidates.find(x=>x.id===target.candidateId);assert.equal(c?.authorId,'fe70fac7-d312-494c-bde1-4c37c3942722');
    if(c.publication?.state!=='revoked'){
     assert.equal(c.publication?.state,'published');assert.equal(c.publication.version,1);
     await call({action:'revoke_statement',operationId:target.operationId,candidateId:target.candidateId,expectedPublicationVersion:1,note:'End of owned synthetic place test.'});
     c=(await call()).candidates.find(x=>x.id===target.candidateId);
    }
    assert.equal(c.publication?.state,'revoked');assert.equal(c.publication.version,2);row.status='PASS';row.publication={state:c.publication.state,version:c.publication.version};save();break;
   }catch(e){row.status='UNCERTAIN';row.errorType=e.name;save();}
  }
 }
 assert.ok(state.operations.every(x=>x.status==='PASS'));state.status='PASS';
}catch(e){state.status='FAIL';state.errorType=e.name;process.exitCode=1;}
finally{
 if(auth)try{const r=await auth.auth.signOut({scope:'local'});assert.equal(r.error,null);state.cleanup.push({operation:'cookieLogout',status:'PASS'});}catch{state.cleanup.push({operation:'cookieLogout',status:'FAIL'});process.exitCode=1;}
 try{if(fs.existsSync(new URL('activation-transaction.json',root))){run('node',['window-state.mjs','disable']);state.cleanup.push({operation:'disable',status:'PASS'});}}catch{state.cleanup.push({operation:'disable',status:'FAIL'});process.exitCode=1;}
 try{if(fs.existsSync(new URL('firewall-allow-plan.json',root))){run('python3',['firewall-scope.py','remove']);state.cleanup.push({operation:'removeOwnHost',status:'PASS'});}}catch{state.cleanup.push({operation:'removeOwnHost',status:'FAIL'});process.exitCode=1;}
 if(process.exitCode)state.status='FAIL';state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify(state));
}
