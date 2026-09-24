import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceCaseHTTP} from '../../../lib/server/service-cases/http.ts';
import {nativeFixture,subject,sessionId} from '../identity/native-fixture.ts';

for(const mode of ['success','session-denied','session-error','wrong-subject','bad-input'])test('native case transport: '+mode,async t=>{
 const f=await nativeFixture(t,'http://127.0.0.1:59877');
 const env={SERVICE_CASES_LOCAL:'1',VISEPANDA_NATIVE_LOCAL_SESSION:'true',NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VERCEL_ENV:undefined,VISEPANDA_NATIVE_STAGING:undefined};
 const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 for(const[k,v]of Object.entries(env))v===undefined?delete process.env[k]:process.env[k]=v;
 t.after(()=>{for(const[k,v]of Object.entries(prior))v===undefined?delete process.env[k]:process.env[k]=v;});
 const fallback=globalThis.fetch;let writes=0;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const request=new Request(input,init),path=new URL(request.url).pathname;
  if(path.endsWith('/native_session_v2')){
   if(mode==='session-denied'||mode==='session-error')return Response.json({message:mode==='session-denied'?'SESSION_REPLACED':'database unavailable',code:'P0001'},{status:400});
   return Response.json({subject:mode==='wrong-subject'?'wrong':subject,sessionId});
  }
  if(path.endsWith('/service_case_v1')){writes++;assert.equal(request.redirect,'error');return Response.json({cases:[],staff:[]});}
  return fallback(input,init);
 });
 const r=await serviceCaseHTTP(new Request('http://127.0.0.1/api/service-cases/native/v1',{method:'POST',headers:{Authorization:'Bearer '+f.token},body:mode==='bad-input'?'[':'{"action":"list"}'}));
 assert.equal(r.status,mode==='success'?200:mode==='session-error'?503:mode==='bad-input'?400:401);
 assert.equal(writes,mode==='success'?1:0);assert.match(r.headers.get('cache-control'),/no-store/);
});
