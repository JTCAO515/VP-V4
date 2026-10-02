import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {nativePlanningIntakeHTTP,planningIntakeParams,validPlanningIntakeReceipt} from '../../../lib/server/turn/native-planning-intake-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
const textPolicy=uuid(),intake={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:null};
const source=uuid(),body={conversationId:uuid(),goalId:uuid(),expectedGoalVersion:1,parentMessageId:source,messageId:uuid(),messageKey:uuid(),threadId:uuid(),turnId:uuid(),taskId:uuid(),taskKey:uuid(),planningPolicyId:uuid(),locale:'en',text:'Compare explicit areas',memoryBasis:[],expectedIntakeMessageId:source,expectedSourceSequence:1,expectedIntakeRevision:1,expectedIntakeDigest:'a'.repeat(64),intake};
const receipt={kind:'accepted',reused:false,taskId:body.taskId,turnId:body.turnId,artifactId:uuid(),conversationId:body.conversationId,goalId:body.goalId,goalVersion:1,messageId:body.messageId,messageSequence:2,intakeRevision:2,current:true,readyForProvider:false,executionAvailable:false,intakeContextDigest:'b'.repeat(64),planningContextDigest:'c'.repeat(64)};
const current={kind:'travel_intake',schemaVersion:'assistant-travel-current-basis/1',conversationId:body.conversationId,goalId:body.goalId,goalVersion:1,messageId:body.messageId,messageSequence:2,intakeRevision:2,sourceKind:'explicit_current_input',intake,memoryBasis:[],contextDigest:receipt.intakeContextDigest,readiness:{kind:'ready',scope:'transport_screening',unknown:['lodgingBudget','dates','mobilityConstraints']},readyForProvider:false};
const historical=()=>{const r={...receipt,current:false};delete r.intakeContextDigest;delete r.planningContextDigest;return r;};
test('closed 19-key request maps to exactly 20 RPC parameters with server text policy',()=>{
 const p=planningIntakeParams(body,textPolicy);assert.equal(Object.keys(p).length,20);assert.equal(p.p_text_policy_id,textPolicy);assert.equal(p.p_expected_intake_digest,body.expectedIntakeDigest);
 for(const k of Object.keys(body)){const b={...body};delete b[k];assert.equal(planningIntakeParams(b,textPolicy),null,k);}
 for(const key of ['ownerId','environment','textPolicyId','budget','executionAvailable'])assert.equal(planningIntakeParams({...body,[key]:uuid()},textPolicy),null);
 for(const patch of [{expectedIntakeDigest:'A'.repeat(64)},{expectedSourceSequence:0},{expectedIntakeRevision:1000},{parentMessageId:uuid()},{messageId:source},{taskId:body.turnId},{memoryBasis:[{id:source,revision:1},{id:source,revision:2}]},{intake:{...intake,schemaVersion:null}}])assert.equal(planningIntakeParams({...body,...patch},textPolicy),null);
});
test('receipt closes both digest branches and binds exact request identities',()=>{
 const p=planningIntakeParams(body,textPolicy);assert.equal(validPlanningIntakeReceipt(receipt,p),true);assert.equal(validPlanningIntakeReceipt(historical(),p),true);
 for(const patch of [{current:false},{readyForProvider:true},{executionAvailable:true},{contextDigest:'d'.repeat(64)},{taskId:uuid()},{goalVersion:2},{intakeRevision:1},{messageSequence:1},{planningContextDigest:receipt.intakeContextDigest},{intakeContextDigest:body.expectedIntakeDigest}])assert.equal(validPlanningIntakeReceipt({...receipt,...patch},p),false);
 const missing={...receipt};delete missing.planningContextDigest;assert.equal(validPlanningIntakeReceipt(missing,p),false);
});
const policy={kind:'planning_policy',policyId:body.planningPolicyId,environment:'local_synthetic',consentState:'accepted',modelRecipient:'Synthetic',modelProvider:'qwen',placeProvider:'amap',noticeVersion:'test',noticeHash:'a'.repeat(64),noticeZh:'合成',noticeEn:'Synthetic'};
let port=59120;
async function setup(t,options={}){
 const requestBody=options.body??body;
 const f=await nativeFixture(t,'http://127.0.0.1:'+port++),api='http://127.0.0.1:64751',patch={NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:textPolicy,VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'true',VISEPANDA_NATIVE_LOCAL_PLANNING:'true',VP_NATIVE_INTAKE_PLANNING_HTTP_TEST:'1',VP_NATIVE_INTAKE_PLANNING_HTTP_API:api,VP_NATIVE_INTAKE_PLANNING_HTTP_PROJECT:'vp-native-ask-1234abcd',VP_IDENTITY_SUPABASE_API_URL:f.config.url,VERCEL_ENV:undefined,...options.env};
 const old=new Map(Object.keys(patch).map(k=>[k,process.env[k]]));for(const[k,v]of Object.entries(patch))v===undefined?delete process.env[k]:process.env[k]=v;t.after(()=>{for(const[k,v]of old)v===undefined?delete process.env[k]:process.env[k]=v;});
 const calls=[];let sessions=0,policies=0;const previous=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(input,init)=>{const r=new Request(input,init),name=new URL(r.url).pathname.split('/').at(-1);
  if(name==='native_session_v2'){calls.push(name);sessions++;return Response.json(sessions===1?(options.firstSession??{subject,sessionId}):(options.lastSession??{subject,sessionId}));}
  if(name==='read_planning_policy_v1'){calls.push(name);policies++;return Response.json(policies===1?(options.firstPolicy??policy):(options.lastPolicy??policy));}
  if(name==='submit_planning_comparison_v2'){calls.push(name);assert.deepEqual(await r.json(),planningIntakeParams(requestBody,textPolicy));return options.rpcError?Response.json({message:options.rpcError,code:'P0001'},{status:400}):Response.json(options.receipt??receipt);}
  if(name==='read_assistant_travel_intake_v1'){calls.push(name);return Response.json(options.current??current);}
  return previous(input,init);
 });
 const request=new NextRequest((options.api??api)+'/api/chat/native/v5/planning/intake-tasks',{method:'POST',headers:{Authorization:'Bearer '+f.token,'Content-Type':'application/json'},body:JSON.stringify(requestBody)});
 return {request,calls,f};
}
for(const[name,env,api]of [['default',{VP_NATIVE_INTAKE_PLANNING_HTTP_TEST:undefined}],['deployed',{VERCEL_ENV:'preview'}],['remote-db',{VP_IDENTITY_SUPABASE_API_URL:'https://db.example.com'}],['remote-api',{VP_NATIVE_INTAKE_PLANNING_HTTP_API:'https://api.example.com'}],['project',{VP_NATIVE_INTAKE_PLANNING_HTTP_PROJECT:'vp-native-ask-fixed'}],['port',{},'http://127.0.0.1:64752'],['prefix',{},'http://127.0.0.1.evil.invalid:64751']])test('gate '+name+' makes zero RPC/auth calls',async t=>{const e=await setup(t,{env,api}),r=await nativePlanningIntakeHTTP(e.request);assert.equal(r.status,503);assert.deepEqual(e.calls,[]);assert.deepEqual(e.f.seen,[]);});
for(const[name,options,status]of [
 ['fresh',{},201],['reused',{receipt:{...receipt,reused:true}},200],['historical',{receipt:{...historical(),reused:true}},200],
 ['withdraw-after-RPC',{lastPolicy:{...policy,consentState:'withdrawn'}},403],
 ['policy-malformed',{lastPolicy:{}},503],['policy-extra-field',{lastPolicy:{...policy,executionAvailable:true}},503],['policy-invalid-notice',{lastPolicy:{...policy,noticeHash:'broken'}},503],['policy-before-blocked',{firstPolicy:{kind:'unavailable'}},403],
 ['source-changed',{current:{...current,messageId:uuid()}},201],['projection-changed',{current:{...current,intake:{...intake,pace:'fast'}}},201],
 ['stale',{current:{kind:'unavailable',reason:'stale_basis'}},201],['unrecorded',{current:{kind:'unavailable',reason:'intake_unrecorded'}},201],
 ['blocked',{current:{kind:'unavailable',reason:'blocked'}},403],['malformed-current',{current:{}},503],['malformed-readiness',{current:{...current,readiness:{...current.readiness,unknown:['dates']}}},503],
 ['mixed-digests',{receipt:{...receipt,current:false}},503],['final-session-malformed',{lastSession:{}},503],['final-session-replaced',{lastSession:{subject:uuid(),sessionId}},401],
 ['first-session-malformed',{firstSession:{}},503],['first-session-replaced',{firstSession:{subject:uuid(),sessionId}},401],
 ['SQL-memory',{rpcError:'MEMORY_CONFLICT'},409],['SQL-conflict',{rpcError:'SERVICE_TASK_CONFLICT'},409],['SQL-owner',{rpcError:'FORBIDDEN'},403],['SQL-unknown',{rpcError:'opaque failure'},503],
])test('transport qualification '+name,async t=>{
 const e=await setup(t,options),r=await nativePlanningIntakeHTTP(e.request);assert.equal(r.status,status);const result=await r.json();assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.ok(e.calls.filter(x=>x==='submit_planning_comparison_v2').length<=1,'never retries admission');
 if(status===201||status===200){assert.equal(result.version,2);assert.equal(result.executionAvailable,false);assert.equal(result.readyForProvider,false);assert.equal(result.taskId,body.taskId);
  const stale=['historical','source-changed','projection-changed','stale','unrecorded'].includes(name);assert.equal(result.current,!stale);assert.equal(Object.hasOwn(result,'intakeContextDigest'),!stale);assert.equal(Object.hasOwn(result,'planningContextDigest'),!stale);
 }else assert.ok(result.error.code);
});

const refs=[{id:'abcdefab-1111-4111-8111-111111111111',revision:1},{id:'bcdefabc-2222-4222-8222-222222222222',revision:2}];
for(const[name,inputRefs,readRefs,status,isCurrent]of [
 ['reversed',[...refs].reverse(),refs,201,true],
 ['uppercase',refs.map(x=>({...x,id:x.id.toUpperCase()})).reverse(),refs,201,true],
 ['missing-read',refs,[refs[0]],201,false],
 ['wrong-revision-read',refs,[refs[0],{...refs[1],revision:3}],201,false],
 ['duplicate-input',[refs[0],{...refs[0],id:refs[0].id.toUpperCase()}],refs,400,false],
 ['duplicate-read',refs,[refs[0],{...refs[0],id:refs[0].id.toUpperCase()}],503,false],
])test('Memory ref set qualification '+name,async t=>{
 const e=await setup(t,{body:{...body,memoryBasis:inputRefs},current:{...current,memoryBasis:readRefs}}),r=await nativePlanningIntakeHTTP(e.request);assert.equal(r.status,status);const data=await r.json();
 if(status===201){assert.equal(data.current,isCurrent);assert.equal(Object.hasOwn(data,'intakeContextDigest'),isCurrent);assert.equal(Object.hasOwn(data,'planningContextDigest'),isCurrent);}
 if(status===400)assert.equal(e.calls.includes('submit_planning_comparison_v2'),false);
});
test('Memory set normalization preserves ordered intake interests',async t=>{
 const ordered={...intake,interests:['food','photography']},e=await setup(t,{body:{...body,intake:ordered,memoryBasis:refs},current:{...current,intake:{...ordered,interests:['photography','food']},memoryBasis:[...refs].reverse()}}),r=await nativePlanningIntakeHTTP(e.request);
 assert.equal(r.status,201);const data=await r.json();assert.equal(data.current,false);assert.equal(Object.hasOwn(data,'intakeContextDigest'),false);assert.equal(Object.hasOwn(data,'planningContextDigest'),false);
});
