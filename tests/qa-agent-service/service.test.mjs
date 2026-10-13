import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaService} from '../../lib/server/qa-agent/service.ts';
import {QaError} from '../../lib/server/qa-agent/contract.ts';
import {qaConfig} from '../../lib/server/qa-agent/config.ts';
import {browserBoundary} from '../../lib/server/qa-agent/browser-boundary.ts';
const sid='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',pid='33333333-3333-4333-8333-333333333333',foreign='44444444-4444-4444-8444-444444444444';
function fixture(){
 let consent='accepted',output=null,outcome=null,turnStatus='accepted',auth=true,fail=false, admissions=0;
 const turns=[],original=new Map(),calls=[];
 const thread={id:sid,status:'active',createdAt:'2026-10-13',updatedAt:'2026-10-13'};
 const store={list:async()=>{if(!auth)throw new QaError('UNAUTHENTICATED');return [thread];},create:async()=>thread,
 read:async id=>{if(!auth)throw new QaError('UNAUTHENTICATED');if(id!==sid)throw new QaError('FORBIDDEN');return {thread,turns:turns.map(t=>({...t,status:turnStatus}))};},
 rpc:async(name,p)=>{calls.push({name,p});if(!auth)return {data:null,error:{message:'UNAUTHENTICATED'}};
 if(name==='read_text_policy')return {data:{kind:'policy',policy:{id:pid,noticeHash:'a'.repeat(64),noticeZh:'测试',noticeEn:'Synthetic',provider:'qwen',recipient:'Synthetic',consentState:consent}},error:null};
 if(name==='accept_text_policy'){consent='accepted';return {data:{kind:'accepted',policyId:pid},error:null};}
 if(name==='submit_text_turn'){
 const prior=original.get(p.p_turn_id);if(prior&&JSON.stringify(prior)!==JSON.stringify(p))return {data:null,error:{message:'IDEMPOTENCY_KEY_REUSE'}};
 if(!prior){admissions++;original.set(p.p_turn_id,p);turns.push({id:rid,status:'accepted',createdAt:'2026-10-13'});}
 if(fail)throw new Error('Lost ACK');
 return {data:{kind:'accepted',turnId:rid,reused:!!prior},error:null};
 }
 if(name==='read_text_turn')return {data:{kind:'text',turnId:p.p_turn_id,input:original.get(rid)?.p_text??'Synthetic',output,outcome},error:null};
 throw new Error('unexpected '+name);
 }};
 return {service:createQaService(store,pid),calls,get admissions(){return admissions;},finish(kind='answered',text='Actual saved synthetic text'){output=text;outcome=kind;turnStatus='completed';},setConsent:s=>consent=s,revoke:()=>auth=false,setLostAck:v=>fail=v,malformed:()=>{output='';outcome='answered';turnStatus='completed';}};
}
test('strict browser mutation CSRF and cookie-only boundary',()=>{
 const req=(method,headers={},path='')=>new Request('https://qatesting.go2china.space/api/qa-agent'+path,{method,headers});
 assert.equal(browserBoundary(req('POST')),false);
 assert.equal(browserBoundary(req('POST',{Origin:'https://evil.invalid'})),false);
 assert.equal(browserBoundary(req('POST',{Origin:'https://qatesting.go2china.space','Sec-Fetch-Site':'cross-site'})),false);
 assert.equal(browserBoundary(req('POST',{Origin:'https://qatesting.go2china.space',Cookie:'legitimate=ssr'})),true);
 assert.equal(browserBoundary(req('GET',{Authorization:'Bearer wrong-transport'})),false);
 assert.equal(browserBoundary(req('GET',{},'?provider=glm')),false);
 assert.equal(browserBoundary(req('GET')),true);
});
test('QA environment cannot enable production or arbitrary destination',()=>{
 const env={VISEPANDA_QA_AGENT:'true',VISEPANDA_QA_AGENT_ORIGIN:'https://qatesting.go2china.space',VISEPANDA_QA_AGENT_POLICY_ID:pid,NEXT_PUBLIC_SUPABASE_URL:'https://dzqdzetcctkhbrhlxxgn.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public',VERCEL_ENV:'preview'};
 assert.ok(qaConfig(env.VISEPANDA_QA_AGENT_ORIGIN,env));
 for(const patch of [{VERCEL_ENV:'production'},{NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'},{VISEPANDA_QA_AGENT:'false'},{VISEPANDA_QA_AGENT_CONTEXT_MODE:'all_history'},{VISEPANDA_QA_AGENT_ORIGIN:'https://go2china.space'}])assert.equal(qaConfig('https://qatesting.go2china.space',{...env,...patch}),null);
});
test('double click, original bytes, lost ACK and retry retain one original admission',async()=>{
 const f=fixture(),input={requestId:rid,text:' Synthetic original '};
 const rows=await Promise.all([f.service.submit(sid,input),f.service.submit(sid,input)]);
 assert.deepEqual(rows.map(x=>x.reused),[false,true]);assert.equal(f.admissions,1);assert.equal(f.calls.filter(c=>c.name==='submit_text_turn')[0].p.p_text,input.text);
 await assert.rejects(f.service.submit(sid,{...input,text:'changed'}),e=>e.code==='IDEMPOTENCY_KEY_REUSE');
 const lost=fixture();lost.setLostAck(true);
 await assert.rejects(lost.service.submit(sid,input),e=>e.code==='PROVIDER_UNAVAILABLE'&&e.ack==='unknown');
 lost.setLostAck(false);assert.equal((await lost.service.submit(sid,input)).reused,true);assert.equal(lost.admissions,1);
});
test('accepted is pending, refresh reads original saved text and every outcome',async()=>{
 const f=fixture();await f.service.submit(sid,{requestId:rid,text:'Synthetic question'});
 assert.equal((await f.service.message(sid,rid)).message.status,'pending');
 for(const outcome of ['answered','partial','clarification','blocked','technical_failure']){
 f.finish(outcome);const data=await f.service.detail(sid);assert.equal(data.messages[0].text,'Actual saved synthetic text');assert.equal(data.messages[0].status,outcome);
 }
 f.malformed();await assert.rejects(f.service.message(sid,rid),e=>e.code==='PROVIDER_UNAVAILABLE');
});
test('foreign session/request, revoked identity and consent cannot read or submit',async()=>{
 const f=fixture();await assert.rejects(f.service.submit(foreign,{requestId:rid,text:'Synthetic'}),e=>e.code==='FORBIDDEN');
 await assert.rejects(f.service.message(sid,foreign),e=>e.code==='FORBIDDEN');assert.equal(f.admissions,0);
 f.setConsent('withdrawn');await assert.rejects(f.service.submit(sid,{requestId:rid,text:'Synthetic'}),e=>e.code==='DATA_POLICY_BLOCKED');
 await assert.rejects(f.service.detail(sid),e=>e.code==='DATA_POLICY_BLOCKED');
 f.setConsent('accepted');f.revoke();await assert.rejects(f.service.submit(sid,{requestId:rid,text:'Synthetic'}),e=>e.code==='UNAUTHENTICATED');
});
test('client model/history/Trip flags and invalid bodies never reach admission',async()=>{
 const f=fixture();for(const body of [{requestId:rid,text:'',},{requestId:rid,text:'x'.repeat(4001)},{requestId:rid,text:'x',provider:'glm'},{requestId:rid,text:'x',readyForProvider:true},{requestId:rid,text:'x',history:[]}])await assert.rejects(f.service.submit(sid,body),e=>e.code==='INVALID_INPUT');
 await assert.rejects(f.service.consent({policyId:pid,noticeHash:'b'.repeat(64)}),e=>e.code==='DATA_POLICY_BLOCKED');assert.equal(f.admissions,0);
});
