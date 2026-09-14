import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
const root=new URL('./',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(n,root),'utf8'));
assert.ok(!fs.existsSync(new URL('diagnostic.json',root)));
const state={schemaVersion:'place-transport-diagnostic/1',startedAt:new Date().toISOString(),modelCalls:0,requests:[],reads:[],cleanup:[]};
const save=()=>fs.writeFileSync(new URL('diagnostic.json',root),JSON.stringify(state,null,2)+'\n',{mode:0o600});
const run=(bin,args)=>execFileSync(bin,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
const safe=e=>({name:e?.name,code:typeof e?.code==='string'?e.code:undefined,syscall:typeof e?.syscall==='string'?e.syscall:undefined,cause:e?.cause?safe(e.cause):undefined,errors:Array.isArray(e?.errors)?e.errors.map(safe):undefined});
const origin='https://'+read('preview-state.json').url;let sessions=[];
async function call(path,token,body){
 const row={path,method:body?'POST':'GET',startedAt:new Date().toISOString(),phase:'fetch'};state.requests.push(row);save();
 try{
  const r=await fetch(origin+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  row.status=r.status;row.phase='body';row.contentEncoding=r.headers.get('content-encoding');row.contentLength=r.headers.get('content-length');save();
  const text=await r.text();row.bytes=Buffer.byteLength(text);row.phase='json';save();const data=JSON.parse(text);row.phase='done';row.finishedAt=new Date().toISOString();save();return {status:r.status,body:data};
 }catch(e){row.error=safe(e);row.finishedAt=new Date().toISOString();save();throw e;}
}
save();
try{
 run('node',['window-state.mjs','activate']);assert.equal(read('activated.json').state.ops,false);assert.equal(read('activated.json').state.activeMembers,0);run('python3',['firewall-scope.py','allow']);
 const users=JSON.parse(fs.readFileSync('/Users/jtcao/Library/Caches/visepanda/s2-live-brrfsvtp/accounts.json')).users;
 for(const locale of ['en','zh']){
  const u=users.find(x=>x.locale===locale),attemptId=randomUUID();const c=await call('/api/auth/native/v2/credentials',null,{email:u.email,password:u.password,attemptId});assert.equal(c.status,200);const token=c.body.accessToken;assert.ok(token);sessions.push({locale,token});
  assert.equal((await call('/api/auth/native/v2/login',token,{attemptId})).status,200);
  for(let i=0;i<2;i++){
   try{const r=await call('/api/chat/native/v4/turns',token);assert.equal(r.status,200);
    const id=locale==='en'?'4b3429a7-53d3-4e19-89d7-01c3113dd6c6':'58b60c3d-da75-4960-a2c6-e83ed0cf8075',t=r.body.turns.find(x=>x.turnId===id);assert.ok(t);
    state.reads.push({locale,attempt:i+1,turn:t,totalTurns:r.body.turns.length});save();
   }catch(e){state.reads.push({locale,attempt:i+1,error:safe(e)});save();}
  }
 }
 state.status=state.reads.every(x=>x.turn)?'PASS':'FAIL';
}catch(e){state.status='FAIL';state.error=safe(e);process.exitCode=1;}
finally{
 for(const s of sessions){let ok=false;for(let i=0;i<2;i++){
  try{const r=await call('/api/auth/native/v2/logout',s.token,{});state.cleanup.push({operation:'nativeLogout',locale:s.locale,attempt:i+1,status:r.status});if(r.status===200){ok=true;break;}if(r.status===401)break;}
  catch(e){state.cleanup.push({operation:'nativeLogout',locale:s.locale,attempt:i+1,status:'UNCERTAIN',error:safe(e)});}save();
 }if(!ok)process.exitCode=1;}
 try{if(fs.existsSync(new URL('activation-transaction.json',root))){run('node',['window-state.mjs','disable']);state.cleanup.push({operation:'disable',status:'PASS'});}}catch(e){state.cleanup.push({operation:'disable',status:'FAIL',error:safe(e)});process.exitCode=1;}
 try{if(fs.existsSync(new URL('firewall-allow-plan.json',root))){run('python3',['firewall-scope.py','remove']);state.cleanup.push({operation:'removeOwnHost',status:'PASS'});}}catch(e){state.cleanup.push({operation:'removeOwnHost',status:'FAIL',error:safe(e)});process.exitCode=1;}
 if(process.exitCode)state.status='FAIL';state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:state.status,modelCalls:0,requests:state.requests,cleanup:state.cleanup}));
}
