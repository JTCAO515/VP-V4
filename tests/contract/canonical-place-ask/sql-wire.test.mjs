// SQL peer generated these receipts through ordinary-role PG17.11 admission.
// This layer uses actual HTTP/SDK codecs with synthetic transport, not live Auth.
import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import wire from './sql-wire-positive.json' with {type:'json'};
import {nativeFixture,subject,sessionId} from '../identity/native-fixture.ts';
import {canonicalPlaceAskHTTP} from '../../../lib/server/knowledge/place-ask/http.ts';
for(const lostAck of [false,true])test(`actual SQL2 receipts cross HTTP/SDK and same-op recovery; lost ACK=${lostAck}`,async t=>{
 const f=await nativeFixture(t,'http://127.0.0.1:59881');
 const env={VISEPANDA_PLACE_ACTIONS_ENABLED:'true',VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:wire.request.submission.policyId,NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VERCEL_ENV:undefined,VISEPANDA_NATIVE_STAGING:undefined,VISEPANDA_NATIVE_PRODUCTION:undefined,VISEPANDA_NATIVE_LOCAL_TASK_POLICY:undefined};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));for(const[k,v]of Object.entries(env))v===undefined?delete process.env[k]:process.env[k]=v;
 t.after(()=>{for(const[k,v]of Object.entries(saved))v===undefined?delete process.env[k]:process.env[k]=v;});
 assert.equal(wire.policyContextMode,'current_input_v1');assert.equal(wire.accepted.originalReceipt.version,2);
 const fallback=globalThis.fetch,actions=[];
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const r=new Request(input,init),u=new URL(r.url);assert.equal(u.origin,f.config.url);assert.equal(r.redirect,'error');
  if(u.pathname.endsWith('/native_session_v2'))return Response.json({subject,sessionId});
  if(u.pathname.endsWith('/grounded_ai_assist_work_v1')){
   const {p_input}=await r.json();actions.push(p_input.action);
   if(p_input.action==='selected_submit'){
    assert.deepEqual(Object.keys(p_input),['action','requestBytes']);assert.equal(p_input.requestBytes,wire.requestBytes);
    return Response.json(lostAck?null:wire.accepted);
   }
   assert.deepEqual(p_input,{action:'selected_read',operation:wire.accepted.operation});return Response.json(wire.recovered);
  }return fallback(input,init);
 });
 const headers={'content-type':'application/json',authorization:'Bearer '+f.token};
 const post=await canonicalPlaceAskHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v7/place-ask',{method:'POST',headers,body:wire.requestBytes}));
 assert.equal(post.status,lostAck?200:201);assert.deepEqual(await post.json(),lostAck?{schemaVersion:'canonical-place-ask/1',kind:'unknown',operation:wire.accepted.operation,readyForProvider:false}:wire.accepted);
 delete process.env.VISEPANDA_PLACE_ACTIONS_ENABLED;delete process.env.VISEPANDA_NATIVE_LOCAL_TEXT_POLICY;delete process.env.VISEPANDA_NATIVE_LOCAL_TEXT;
 const query=new URLSearchParams(Object.entries(wire.accepted.operation).filter(([,v])=>v!==null));
 const get=await canonicalPlaceAskHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v7/place-ask?'+query,{headers}));
 assert.equal(get.status,200);assert.deepEqual(await get.json(),wire.recovered);assert.deepEqual(actions,['selected_submit','selected_read']);
});
