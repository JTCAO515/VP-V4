import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BriefOpsController} from '../../../../app/ops/service/brief/controller.ts';
import {browserIdentity, sendBriefRead} from '../../../../app/ops/service/brief/transport.ts';
import {handleTravelerBrief} from '../../../../lib/server/service-cases/brief/http.ts';

const now = Date.now(), actorId = randomUUID(), sessionId = randomUUID(), ownerId = randomUUID(), caseId = randomUUID();
const identity = {actorId, sessionId, expiresAt: now + 60000};
const locator = {schemaVersion:'traveler-brief/1',kind:'locator',caseId,ownerId,recipientId:actorId,grantRevision:3,purpose:'case_assistance',category:'general',revision:7,expiresAt:now+50000};
const {kind:_, ...binding} = locator;
const brief = {...binding,kind:'brief',updatedAt:now,sourceDigest:'a'.repeat(64),noticeVersion:'case-minimal-brief/1',fields:[{key:'problem',field:'problem',state:'available',value:'Synthetic shared problem',provenance:'explicit',source:{kind:'case',id:caseId,revision:3,updatedAt:now,receiptId:null,consentId:null,basisDigest:'b'.repeat(64)}}]};
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve}; };
function harness(extra={}) {
  const commands=[],views=[];
  const controller=new BriefOpsController({identity:async()=>identity,send:async(command)=>{commands.push(command);return {ok:true,data:command.action==='locate'?locator:brief};},changed:view=>views.push(view),now:()=>now,...extra},caseId);
  return {controller,commands,views};
}

test('locate actual shared head then exact recipient/grant/revision read, no owner or mutation action', async()=>{
  const h=harness(); await h.controller.refresh();
  assert.deepEqual(h.commands,[{action:'locate',caseId},{action:'read',caseId,recipientId:actorId,grantRevision:3,expectedRevision:7}]);
  assert.equal(h.controller.snapshot().brief,brief);
});
test('a new read clears prior values before awaiting authorization; deny never falls back',async()=>{
  const gate=deferred();let wait=false;
  const h=harness({identity:()=>wait?gate.promise:Promise.resolve(identity)});await h.controller.refresh();wait=true;
  const pending=h.controller.refresh();assert.equal(h.controller.snapshot().brief,null);assert.equal(h.controller.snapshot().busy,true);
  gate.resolve(null);await pending;assert.equal(h.controller.snapshot().message,'auth');assert.equal(h.controller.snapshot().brief,null);
});
test('ordinary problem grant cannot read Brief if locator denies',async()=>{
  const h=harness({send:async()=>({ok:false})});await h.controller.refresh();assert.equal(h.controller.snapshot().brief,null);assert.equal(h.controller.snapshot().message,'unavailable');
});
test('wrong Case or recipient locator cannot dispatch a value read',async()=>{
  for(const changed of [{caseId:randomUUID()},{recipientId:randomUUID()},{ownerId:actorId}]) {
    const commands=[];const h=harness({send:async cmd=>{commands.push(cmd);return {ok:true,data:{...locator,...changed}};}});await h.controller.refresh();
    assert.equal(commands.length,1);assert.equal(h.controller.snapshot().brief,null);
  }
});
test('owner preview, old Brief revision, different grant and unrelated Case cannot render',async()=>{
  for(const changed of [{kind:'preview',previewId:randomUUID(),createdAt:now},{revision:6},{grantRevision:4},{caseId:randomUUID()},{expiresAt:locator.expiresAt+1},{ownerId:randomUUID()}]) {
    const h=harness({send:async cmd=>({ok:true,data:cmd.action==='locate'?locator:{...brief,...changed}})});await h.controller.refresh();assert.equal(h.controller.snapshot().brief,null);
  }
});
test('session or actor switches before read or after read discard values',async()=>{
  for(const check of [2,3])for(const change of [{sessionId:randomUUID()},{actorId:randomUUID()}]) {
    let count=0;const h=harness({identity:async()=>++count===check?{...identity,...change}:identity});await h.controller.refresh();
    assert.equal(h.controller.snapshot().brief,null);assert.equal(h.controller.snapshot().message,'auth');
  }
});
test('source correction, withdraw/delete or network failure on read leave no old body',async()=>{
  for(const code of ['BRIEF_STALE','BRIEF_FORBIDDEN','BRIEF_NOT_FOUND','network']) {
    let denied=false;const h=harness({send:async cmd=>{if(denied&&cmd.action==='read'){if(code==='network')throw Error('synthetic');return {ok:false};}return {ok:true,data:cmd.action==='locate'?locator:brief};}});
    await h.controller.refresh();denied=true;await h.controller.refresh();assert.equal(h.controller.snapshot().brief,null);assert.equal(h.controller.snapshot().message,'unavailable');
  }
});
test('invalidation aborts pending read and late successful value response cannot revive it',async()=>{
  const gate=deferred();let signal;
  const h=harness({send:async(cmd,id,s)=>{signal=s;return cmd.action==='read'?gate.promise:{ok:true,data:locator};}});
  const pending=h.controller.refresh();await new Promise(r=>setImmediate(r));h.controller.invalidate();assert.equal(signal.aborted,true);gate.resolve({ok:true,data:brief});await pending;assert.equal(h.controller.snapshot().brief,null);
});
test('older overlapping response cannot overwrite newer server read',async()=>{
  const gate=deferred();let reads=0;const latest={...brief,revision:8};let newer=false;
  const h=harness({send:async cmd=>cmd.action==='locate'?{ok:true,data:{...locator,revision:newer?8:7}}:++reads===1?gate.promise:{ok:true,data:latest}});
  const old=h.controller.refresh();await new Promise(r=>setImmediate(r));newer=true;await h.controller.refresh();gate.resolve({ok:true,data:brief});await old;
  assert.equal(h.controller.snapshot().brief.revision,8);
});
test('local TTL only discards; expiry/session expiry and slow reply cannot authorize',async()=>{
  let clock=now;const h=harness({now:()=>clock});await h.controller.refresh();clock=locator.expiresAt;h.controller.expire();assert.equal(h.controller.snapshot().brief,null);
  clock=now;const slow=harness({now:()=>clock,send:async cmd=>{if(cmd.action==='read')clock=now+10001;return {ok:true,data:cmd.action==='locate'?locator:brief};}});await slow.controller.refresh();assert.equal(slow.controller.snapshot().brief,null);assert.equal(slow.controller.snapshot().busy,false);
  clock=now;const session=harness({now:()=>clock,identity:async()=>({...identity,expiresAt:now+1000})});await session.controller.refresh();clock=now+1000;session.controller.expire();assert.equal(session.controller.snapshot().brief,null);
});
test('invalid Case ID dispatches no request',async()=>{
  let sent=0;const controller=new BriefOpsController({identity:async()=>identity,send:async()=>{sent++;return {ok:false};},changed:()=>{}},'body-in-URL');await controller.refresh();assert.equal(sent,0);assert.equal(controller.snapshot().message,'invalid');
});
test('verified browser actor plus stable session required; token claim alone is insufficient',async()=>{
  const token=id=>`x.${Buffer.from(JSON.stringify({sub:id,session_id:sessionId,exp:Math.floor((now+60000)/1000)})).toString('base64url')}.x`;
  const auth={getSession:async()=>({data:{session:{access_token:token(actorId)}},error:null}),getUser:async()=>({data:{user:{id:actorId}},error:null})};
  assert.equal((await browserIdentity(auth)).sessionId,sessionId);
  assert.equal(await browserIdentity({...auth,getUser:async()=>({data:{user:{id:randomUUID()}},error:null})}),null);
  assert.equal(await browserIdentity({...auth,getUser:async()=>({data:{user:null},error:{}})}),null);
  let i=0;assert.equal(await browserIdentity({...auth,getSession:async()=>({data:{session:{access_token:token(++i===1?actorId:randomUUID())}},error:null})}),null);
});
test('transport uses cookie POST no-store expected headers; request carries refs only',async()=>{
  const abort=new AbortController();let captured;
  const result=await sendBriefRead({action:'locate',caseId},identity,abort.signal,async(url,init)=>{captured={url,init};return Response.json({data:locator});});
  assert.equal(result.ok,true);assert.equal(captured.url,'/api/ops/service-cases/brief/v1');assert.equal(captured.init.cache,'no-store');assert.equal(captured.init.credentials,'same-origin');assert.equal(captured.init.headers['x-ops-expected-session'],sessionId);assert.equal(captured.init.headers['x-ops-expected-actor'],actorId);assert.equal(captured.init.signal,abort.signal);assert.deepEqual(JSON.parse(captured.init.body),{action:'locate',caseId});assert.equal(captured.init.headers.authorization,undefined);
});
test('client consumer and actual HTTP handler compose with repeated server qualification (synthetic RPC, not Auth runtime)',async()=>{
  let qualified=0;
  const fetcher=async(url,init)=>{
    const request=new Request(`https://ops.test${url}`,{...init,headers:{...init.headers,cookie:'synthetic-session',origin:'https://ops.test'}});
    const response=await handleTravelerBrief(request,{enabled:true,surface:'staff',sameOrigin:true,createRpc:()=>({authenticate:async()=>actorId,sessionId:()=>sessionId,call:async(name,params)=>{qualified++;return {data:params.p_input.action==='locate'?locator:brief,error:null};}})});
    return Response.json(response.body,{status:response.status});
  };
  const h=harness({send:(cmd,id,s)=>sendBriefRead(cmd,id,s,fetcher)});await h.controller.refresh();assert.equal(h.controller.snapshot().brief.kind,'brief');assert.equal(qualified,4);
});
test('malformed data or invented inferred field fails closed',async()=>{
  const h=harness({send:async cmd=>({ok:true,data:cmd.action==='locate'?locator:{...brief,fields:[{...brief.fields[0],provenance:'inferred'}]}})});await h.controller.refresh();assert.equal(h.controller.snapshot().brief,null);
});
