import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {NextRequest} from 'next/server.js';
import {nativeFixture} from '../../contract/identity/native-fixture.ts';
const sid='aabbccdd-1234-4abc-8def-012345abcdef',rid='eeffaabb-5678-4cde-9fab-abcdef012345',foreign='33333333-3333-4333-8333-333333333333';
const routePath="app/api/qa-agent/sessions/[sessionId]/messages/[requestId]/cancellation/route.ts";
const source=ts.transpileModule(readFileSync(routePath,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('"@/lib/server/qa-agent/cancellation/http"',JSON.stringify(pathToFileURL(resolve('lib/server/qa-agent/cancellation/http.ts')).href));
const route=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('real HTTP route + SSR cookie cancellation keeps exact request, unknown ACK recovers by GET only',async t=>{
 const network=globalThis.fetch,f=await nativeFixture(t,'http://127.0.0.1:58289'),authStub=globalThis.fetch;
 let state='pending',lost=false,denied=false,malformed=false;const calls=[];
 const server=createServer(async(req,res)=>{
  const parts=[];for await(const b of req)parts.push(b);const url=new URL(req.url,'http://localhost:'+server.address().port);
  const match=/^\/api\/qa-agent\/sessions\/([^/]+)\/messages\/([^/]+)\/cancellation$/.exec(url.pathname);
  const request=new NextRequest(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(parts)}:{})});
  const response=await route[req.method](request,{params:Promise.resolve({sessionId:match[1],requestId:match[2]})});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
 });
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});t.after(()=>new Promise(resolve=>server.close(resolve)));
 const api='http://127.0.0.1:'+server.address().port,origin='http://localhost:'+server.address().port;
 const patch={VISEPANDA_QA_AGENT:'false',VISEPANDA_QA_AGENT_POLICY_ID:undefined,VISEPANDA_QA_AGENT_ORIGIN:origin,NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VERCEL_ENV:undefined};
 const prior=Object.fromEntries(Object.keys(patch).map(k=>[k,process.env[k]]));for(const[k,v]of Object.entries(patch))v===undefined?delete process.env[k]:process.env[k]=v;t.after(()=>{for(const[k,v]of Object.entries(prior))v===undefined?delete process.env[k]:process.env[k]=v;});
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url);if(url.origin===api)return network(input,init);
  if(!url.pathname.startsWith('/rest/v1/'))return authStub(input,init);
  assert.equal(url.origin,f.config.url);assert.equal(req.headers.get('authorization'),'Bearer '+f.token);assert.equal(url.pathname,'/rest/v1/rpc/qa_cancellation_v1');
  const p=await req.json();calls.push(p);
  if(denied)return Response.json({message:'SESSION_REPLACED',code:'P0001'},{status:400});
  if(p.p_thread_id!==sid)return Response.json({message:'FORBIDDEN',code:'P0001'},{status:400});
  let found=p.p_request_id===rid?state:'not_observed';if(p.p_action==='cancel'&&found!=='not_observed'){state=found='cancelled';if(lost)throw Error('Synthetic ACK lost after cancellation');}
  return Response.json({version:'qa-cancellation/1',sessionId:p.p_thread_id,requestId:p.p_request_id,state:found,ack:malformed?'observed':['cancelled','terminal'].includes(found)?'observed':'unknown'});
 });
 const call=async(method='GET',body,ids=[sid.toUpperCase(),rid.toUpperCase()],headers={})=>{
  const response=await globalThis.fetch(api+`/api/qa-agent/sessions/${ids[0]}/messages/${ids[1]}/cancellation`,{method,headers:{Cookie:f.cookie(),...(method==='POST'?{Origin:origin,'Content-Type':'application/json'}:{}),...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};
 };
 const pending=await call();assert.equal(pending.status,200);assert.equal(pending.body.state,'pending');assert.equal(pending.body.ack,'unknown');
 const before=calls.length;
 assert.equal((await call('GET',undefined,undefined,{Cookie:''})).status,401);
 for(const [body,headers,expected]of [[{}, {Origin:'https://evil.invalid'},403],[{}, {Origin:''},403],[{turnId:foreign},{},400],[{}, {Authorization:'Bearer forbidden'},403]])assert.equal((await call('POST',body,undefined,headers)).status,expected);
 assert.equal(calls.length,before);
 lost=true;const unknown=await call('POST',{});assert.equal(unknown.status,503);assert.equal(unknown.body.error.ack,'unknown');assert.equal(Object.hasOwn(unknown.body,'state'),false);
 lost=false;const recovered=await call();assert.equal(recovered.body.state,'cancelled');assert.equal(recovered.body.ack,'observed');assert.equal(recovered.body.sessionId,sid);assert.equal(recovered.body.requestId,rid);
 assert.equal((await call('POST',{})).body.state,'cancelled');
 const unseen=await call('GET',undefined,[sid,foreign]);assert.equal(unseen.body.state,'not_observed');assert.equal(unseen.body.ack,'unknown');
 assert.equal((await call('GET',undefined,[foreign,rid])).status,403);
 denied=true;assert.equal((await call()).status,401);denied=false;
 state='pending';malformed=true;assert.equal((await call()).status,503);
 assert.equal(calls.every(p=>Object.keys(p).sort().join(',')==='p_action,p_request_id,p_thread_id'),true);
 assert.equal(calls.filter(p=>p.p_action==='cancel').length,2,'only explicit stops; recovery never re-POSTs');
});
