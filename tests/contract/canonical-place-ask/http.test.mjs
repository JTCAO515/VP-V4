import assert from 'node:assert/strict';
import test from 'node:test';
import {NextRequest} from 'next/server.js';
import {canonicalPlaceAskHTTP} from '../../../lib/server/knowledge/place-ask/http.ts';
import {taskRequest,ids} from './fixtures.mjs';
const make=(method='POST',extra={})=>new NextRequest('http://127.0.0.1/api/chat/native/v7/place-ask'+(extra.query??''),{method,headers:{'content-type':'application/json',...(extra.headers??{})},...(method==='POST'?{body:extra.body??JSON.stringify(taskRequest)}:{})});
for(const [name,request]of [['cookie',()=>make('POST',{headers:{cookie:'forbidden'}})],['origin',()=>make('POST',{headers:{origin:'http://127.0.0.1'}})],['query',()=>make('POST',{query:'?subject=forged'})],['nonJSON',()=>make('POST',{headers:{'content-type':'text/plain'}})],['unsupported method',()=>make('PUT')]])test(`real HTTP rejects ${name}`,async()=>{
 const result=await canonicalPlaceAskHTTP(request());assert.equal(result.status,400);assert.equal(result.headers.get('cache-control'),'private, no-store');
});
for(const [name,body]of [['invalid UTF8',new Uint8Array([0xff,0xfe])],['oversized','x'.repeat(24001)],['unknown authority',JSON.stringify({...taskRequest,subjectId:'forged'})]])test(`real HTTP rejects ${name} before auth/admission`,async()=>{
 const old=process.env.VISEPANDA_PLACE_ACTIONS_ENABLED;process.env.VISEPANDA_PLACE_ACTIONS_ENABLED='true';
 try{const result=await canonicalPlaceAskHTTP(make('POST',{body}));assert.equal(result.status,400);}finally{if(old===undefined)delete process.env.VISEPANDA_PLACE_ACTIONS_ENABLED;else process.env.VISEPANDA_PLACE_ACTIONS_ENABLED=old;}
});
test('GET recovery accepts null-Turn shape but rejects missing conversation message identity',async()=>{
 const result=await canonicalPlaceAskHTTP(make('GET',{query:`?operationId=${ids.op}&scopeKind=conversation&scopeId=${ids.conversation}`}));assert.equal(result.status,400);
});
test('POST rollback flag never activates a new producer',async()=>{
 const old=process.env.VISEPANDA_PLACE_ACTIONS_ENABLED;delete process.env.VISEPANDA_PLACE_ACTIONS_ENABLED;
 try{assert.equal((await canonicalPlaceAskHTTP(make())).status,503);}finally{if(old!==undefined)process.env.VISEPANDA_PLACE_ACTIONS_ENABLED=old;}
});
test('A current-input original Task uses the configured plain policy instead of requiring task-history retyping',async()=>{
 const env={VISEPANDA_PLACE_ACTIONS_ENABLED:'true',VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:ids.policy,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:6543',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'controlled-fixture-key'};
 const unset=['VERCEL_ENV','VISEPANDA_NATIVE_STAGING','VISEPANDA_NATIVE_PRODUCTION','VISEPANDA_NATIVE_LOCAL_TASK_POLICY'];const saved=new Map([...Object.keys(env),...unset].map(k=>[k,process.env[k]]));
 try{for(const [k,v]of Object.entries(env))process.env[k]=v;for(const k of unset)delete process.env[k];const result=await canonicalPlaceAskHTTP(make());assert.equal(result.status,401,'reaches original identity gate without requiring or inventing another policy');}
 finally{for(const [k,v]of saved)if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
