import {qaAgentHTTP} from '../../../lib/server/qa-agent/http.ts';
import {qaConfig} from '../../../lib/server/qa-agent/config.ts';
import {getNativeRuntimeConfig} from '../../../lib/server/identity/native-config.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {NextRequest} from 'next/server.js';
import {nativeFixture,subject,sessionId as authSession} from '../../contract/identity/native-fixture.ts';
import * as policy from '../../../app/api/qa-agent/native/v1/policy/route.ts';
import * as consent from '../../../app/api/qa-agent/native/v1/consent/route.ts';
import * as sessions from '../../../app/api/qa-agent/native/v1/sessions/route.ts';
import * as detail from '../../../app/api/qa-agent/native/v1/sessions/[sessionId]/route.ts';
import * as submit from '../../../app/api/qa-agent/native/v1/sessions/[sessionId]/messages/route.ts';
import * as message from '../../../app/api/qa-agent/native/v1/sessions/[sessionId]/messages/[requestId]/route.ts';
import * as cancellation from '../../../app/api/qa-agent/native/v1/sessions/[sessionId]/messages/[requestId]/cancellation/route.ts';
import {nativeQaHTTP} from '../../../lib/server/qa-agent/native-http.ts';
const sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',pid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',rid='cccccccc-cccc-4ccc-8ccc-cccccccccccc',follow='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const stamp='2026-10-16T00:00:00Z',prefix='/api/qa-agent/native/v1';

test('actual Native QA route exports + Bearer SDK + original service: persistent identity, unknown ACK, isolation and cancellation',async t=>{
 const browserFetch=globalThis.fetch,f=await nativeFixture(t,'http://127.0.0.1:58123'),authFetch=globalThis.fetch;
 const rows=[],calls=[];let task=null,accepted=false,epoch=1,replaced=false,replaceAfterPrecheck=false,lost=false,lostCancel=false,cancelled=false;
 const thread={id:sid,status:'active',createdAt:stamp,updatedAt:stamp};
 const server=createServer(async(req,res)=>{try{
  const parts=[];for await(const b of req)parts.push(b);const u=new URL(req.url,origin),pieces=u.pathname.slice(prefix.length).split('/').filter(Boolean);
  const params={sessionId:pieces[1],requestId:pieces[3]},route=pieces[0]==='policy'?policy:pieces[0]==='consent'?consent:pieces.length===1?sessions:pieces.at(-1)==='cancellation'?cancellation:pieces.length===2?detail:pieces.length===3?submit:message;
  const request=new NextRequest(u,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(parts)}:{})});
  const response=await route[req.method](request,{params:Promise.resolve(params)});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('test adapter failure');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://localhost:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const env={VISEPANDA_QA_AGENT:'true',VISEPANDA_QA_AGENT_ORIGIN:origin,VISEPANDA_QA_AGENT_POLICY_ID:pid,VISEPANDA_QA_AGENT_CONTEXT_MODE:'qa_session_history_v1',VISEPANDA_NATIVE_LOCAL_TRIP:'true',NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VERCEL_ENV:undefined,VISEPANDA_NATIVE_STAGING:undefined,VISEPANDA_NATIVE_PRODUCTION:undefined};
 const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));for(const[k,v]of Object.entries(env))v===undefined?delete process.env[k]:process.env[k]=v;
 t.after(()=>{for(const[k,v]of Object.entries(prior))v===undefined?delete process.env[k]:process.env[k]=v;});
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  const req=new Request(url,init),u=new URL(req.url);assert.equal(u.origin,f.config.url);
  if(!u.pathname.startsWith('/rest/v1/'))return authFetch(url,init);
  assert.equal(req.headers.get('authorization'),'Bearer '+f.token);assert.equal(req.headers.has('cookie'),false);assert.equal(req.headers.has('origin'),false);assert.equal(init.redirect,'error');
  const name=u.pathname.split('/').at(-1),p=await req.json();calls.push({name,p});
  const error=msg=>Response.json({message:msg,code:'P0001'},{status:400});
  if(name==='native_session_v2'){
   if(replaced)return error('SESSION_REPLACED');
   const response=Response.json({version:2,subject,sessionId:authSession,mobileEpoch:epoch});if(replaceAfterPrecheck){replaceAfterPrecheck=false;replaced=true;}return response;
  }
  assert.equal(name,'qa_native_session_v1','never ordinary unwrapped data or Native legacy submit');assert.equal(p.p_mobile_epoch,epoch);
  if(replaced)return error('SESSION_REPLACED');
  const a=p.p_action,b=p.p_payload;
  if(a==='list')return Response.json({kind:'threads',threads:[thread]});
  if(a==='create')return Response.json({kind:'thread',thread});
  if(a==='read')return b.p_thread_id!==sid?error('FORBIDDEN'):Response.json({kind:'thread_read',thread,turns:rows.map(r=>({id:r.turnId,status:cancelled?'cancelled':r.output?'completed':'accepted',createdAt:stamp}))});
  if(a==='qa_read_policy_v1')return Response.json({kind:'policy',policy:{id:pid,contextMode:'qa_session_history_v1',maxTurns:8,noticeHash:'a'.repeat(64),noticeZh:'合成许可',noticeEn:'Synthetic permission',provider:'qwen',recipient:'Synthetic',consentState:accepted?'accepted':'not_accepted'}});
  if(a==='qa_accept_policy_v1'){accepted=true;return Response.json({kind:'accepted',policyId:pid});}
  if(a==='qa_list_sessions_v1')return Response.json({kind:'sessions',sessions:[{threadId:sid}]});
  if(a==='qa_read_session_v1')return Response.json({kind:'session',schemaVersion:'qa-session/1',threadId:sid,policyId:rows.length?pid:null,serviceTaskId:task,lastTurnId:rows.at(-1)?.turnId??null,messages:rows});
  if(a==='qa_submit_message_v1'){
   const prior=rows.find(r=>r.turnId===b.p_turn_id);if(prior&&prior.input!==b.p_text)return error('IDEMPOTENCY_KEY_REUSE');
   if(!prior){task??=b.p_task_id;assert.equal(b.p_task_id,task);rows.push({kind:'text',reconciliationRequired:false,turnId:b.p_turn_id,input:b.p_text,output:null,outcome:null});}
   if(lost){lost=false;throw Error('synthetic lost admission ACK');}return Response.json({kind:'accepted',turnId:b.p_turn_id,reused:!!prior});
  }
  if(a==='qa_cancellation_v1'){
   if(b.p_thread_id!==sid)return error('FORBIDDEN');const seen=rows.some(r=>r.turnId===b.p_request_id);
   if(b.p_action==='cancel'&&seen){cancelled=true;if(lostCancel){lostCancel=false;throw Error('synthetic lost stop ACK');}}
   const state=!seen?'not_observed':cancelled?'cancelled':'pending';return Response.json({version:'qa-cancellation/1',sessionId:sid,requestId:b.p_request_id,state,ack:state==='cancelled'?'observed':'unknown'});
  }
  throw Error('Unexpected QA operation '+a);
 });
 const call=async(path,method='GET',body,headers={})=>{const r=await browserFetch(origin+prefix+path,{method,headers:{Authorization:'Bearer '+f.token,...(method==='POST'?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),headers:r.headers};};
 assert.ok(qaConfig(origin+prefix+'/policy',process.env),'local QA config');assert.ok(getNativeRuntimeConfig({url:origin+prefix+'/policy'},'trip','text'),'local native config');
 const initial=await call('/policy');assert.equal(initial.status,200,JSON.stringify({body:initial.body,calls}));assert.equal(initial.body.policy.consentState,'not_accepted');
 assert.equal((await call('/consent','POST',{policyId:pid.toUpperCase(),noticeHash:'a'.repeat(64)})).status,200);
 assert.equal((await call('/sessions','POST',{})).status,201);assert.equal((await call('/sessions')).body.sessions[0].id,sid);
 const original='Original exact text  尾部 ';lost=true;const unknown=await call('/sessions/'+sid+'/messages','POST',{requestId:rid.toUpperCase(),text:original});assert.equal(unknown.status,503);assert.equal(unknown.body.error.ack,'unknown');assert.equal(rows.length,1);
 const read=await call('/sessions/'+sid+'/messages/'+rid.toUpperCase());assert.equal(read.status,200);assert.equal(read.body.message.status,'pending');assert.equal(read.body.message.input,original);
 rows[0].output='Persisted synthetic answer';rows[0].outcome='answered';
 const reopened=await call('/sessions/'+sid);assert.equal(reopened.body.messages[0].text,rows[0].output);assert.equal(reopened.body.version,'qa-agent/1');
 assert.equal((await call('/sessions/'+sid+'/messages','POST',{requestId:rid,text:original})).body.reused,true);
 assert.equal((await call('/sessions/'+sid+'/messages','POST',{requestId:follow,text:'Why? simplify'})).status,202);assert.equal(rows.length,2);
 const savedTask=task;assert.ok(savedTask);assert.equal(calls.filter(c=>c.p.p_action==='qa_submit_message_v1').every(c=>c.p.p_payload.p_task_id===savedTask),true);
 const baseline=calls.length;
 for(const [method,body,headers]of [['GET',undefined,{Cookie:'x'}],['GET',undefined,{Origin:origin}],['POST',{ownerId:sid},{}]])assert.equal((await call('/sessions',method,body,headers)).status,400);
 assert.equal((await call('/policy?db=evil')).status,400);assert.equal((await call('/sessions/'+sid+'/messages','POST',{requestId:follow,text:'x'.repeat(40000)})).status,400);assert.equal(calls.length,baseline);
 assert.equal((await call('/policy','GET',undefined,{Authorization:'Bearer x, Bearer y'})).status,401);
 const expired=await f.sign({exp:Math.floor(Date.now()/1000)-60});assert.equal((await call('/policy','GET',undefined,{Authorization:'Bearer '+expired})).status,401);
 assert.equal((await qaAgentHTTP(new NextRequest(origin+'/api/qa-agent/policy',{headers:{Authorization:'Bearer '+f.token}}),'policy')).status,403);
 assert.equal((await call('/sessions/'+follow)).status,403);
 replaceAfterPrecheck=true;const denied=await call('/sessions','POST',{});assert.equal(denied.status,401);replaced=false;
 accepted=false;assert.equal((await call('/sessions/'+sid+'/messages','POST',{requestId:rid,text:original})).status,403);
 delete process.env.VISEPANDA_QA_AGENT;delete process.env.VISEPANDA_QA_AGENT_POLICY_ID;
 lostCancel=true;const stop=await call('/sessions/'+sid+'/messages/'+follow+'/cancellation','POST',{});assert.equal(stop.status,503);assert.equal(stop.body.error.ack,'unknown');
 const receipt=await call('/sessions/'+sid+'/messages/'+follow+'/cancellation');assert.equal(receipt.body.version,'qa-cancellation/1');assert.equal(receipt.body.state,'cancelled');assert.equal(receipt.body.ack,'observed');
 assert.equal(receipt.headers.get('cache-control'),'private, no-store');assert.equal(receipt.headers.has('set-cookie'),false);
 assert.equal(calls.filter(c=>c.p.p_action==='qa_cancellation_v1'&&c.p.p_payload.p_action==='cancel').length,1);
 assert.equal(calls.some(c=>['submit_service_task_turn','submit_text_turn','reserve_model_budget','finish_model_budget'].includes(c.name)),false);
});

test('new native QA keeps original target gates: finite Preview may authenticate; QA alias and Production refuse before I/O',async t=>{
 const env={VERCEL_ENV:'preview',VERCEL_URL:'vp-v4-ab12-jtcao515s-projects.vercel.app',VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_NATIVE_PRODUCTION:undefined,VISEPANDA_TRIP_PROTOCOL_V2:'true',VISEPANDA_QA_AGENT:'true',VISEPANDA_QA_AGENT_ORIGIN:'https://qatesting.go2china.space',VISEPANDA_QA_AGENT_POLICY_ID:pid,VISEPANDA_QA_AGENT_CONTEXT_MODE:'qa_session_history_v1',VISEPANDA_QA_SUPABASE_PROJECT_REF:'dzqdzetcctkhbrhlxxgn',NEXT_PUBLIC_SUPABASE_URL:'https://dzqdzetcctkhbrhlxxgn.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public'};
 const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));for(const[k,v]of Object.entries(env))v===undefined?delete process.env[k]:process.env[k]=v;t.after(()=>{for(const[k,v]of Object.entries(prior))v===undefined?delete process.env[k]:process.env[k]=v;});
 let io=0;t.mock.method(globalThis,'fetch',async()=>{io++;throw Error('No I/O');});
 assert.equal((await nativeQaHTTP(new NextRequest('https://'+env.VERCEL_URL+prefix+'/policy'),'policy')).status,401);
 assert.equal((await nativeQaHTTP(new NextRequest('https://qatesting.go2china.space'+prefix+'/policy'),'policy')).status,503);
 process.env.VERCEL_ENV='production';assert.equal((await nativeQaHTTP(new NextRequest('https://go2china.space'+prefix+'/policy'),'policy')).status,503);assert.equal(io,0);
});
