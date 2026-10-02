import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {nativeTravelIntakeHTTP,validExplicitTravelIntake} from '../../../lib/server/turn/native-travel-intake-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
const id='11111111-1111-4111-8111-111111111111',goal='22222222-2222-4222-8222-222222222222',message='33333333-3333-4333-8333-333333333333';
const intake={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:null};
const data={kind:'travel_intake',schemaVersion:'assistant-travel-current-basis/1',conversationId:id,goalId:goal,goalVersion:1,messageId:message,messageSequence:1,intakeRevision:1,sourceKind:'explicit_current_input',intake,memoryBasis:[],contextDigest:'a'.repeat(64),readiness:{kind:'ready',scope:'transport_screening',unknown:['lodgingBudget','dates','mobilityConstraints']},readyForProvider:false};
let port=58820;
async function setup(t,{reads=[data,data],lastSession={subject,sessionId},post=false,writeBasis=false}={}){
 const f=await nativeFixture(t,'http://127.0.0.1:'+port++),patch={NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:id,VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'true'};
 const old=new Map(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);t.after(()=>{for(const[k,v]of old)v===undefined?delete process.env[k]:process.env[k]=v;});
 let sessions=0,index=0;const calls=[],previous=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(input,init)=>{const r=new Request(input,init),path=new URL(r.url).pathname;
  if(path.endsWith('/native_session_v2')){sessions++;return Response.json(sessions===1?{subject,sessionId}:lastSession);}
  if(path.endsWith('/read_assistant_travel_intake_v1')||path.endsWith('/read_assistant_travel_intake_write_basis_v1')){calls.push(await r.json());return Response.json(reads[Math.min(index++,reads.length-1)]);}
  if(path.endsWith('/submit_assistant_travel_intake_v1'))return Response.json({kind:'accepted',conversationId:id,goalId:goal,messageId:message,messageSequence:1,goalVersion:1,intakeRevision:1,reused:false,current:true,contextDigest:data.contextDigest,readyForProvider:false});
  return previous(input,init);
 });
 const body={conversationId:id,goalId:goal,messageId:message,parentMessageId:null,expectedGoalVersion:null,expectedIntakeRevision:0,idempotencyKey:id,policyId:id,locale:'en',text:'Explicit input',relationship:'goal_start',intake,memoryBasis:[]};
 const request=()=>new NextRequest('http://127.0.0.1/api/chat/native/v5/travel-intake'+(post?'':'?conversationId='+id+'&goalId='+goal),{method:post?'POST':'GET',headers:{Authorization:'Bearer '+f.token,...(post?{'Content-Type':'application/json'}:{})},...(post?{body:JSON.stringify(body)}:{})});
 return {request,sessions:()=>sessions,calls};
}
for(const [name,reads,status,body]of [
 ['unrecorded',[{kind:'unavailable',reason:'intake_unrecorded'}],200,{version:5,kind:'unavailable',reason:'intake_unrecorded',readyForProvider:false}],
 ['stale',[{kind:'unavailable',reason:'stale_basis'}],200,{version:5,kind:'unavailable',reason:'stale_basis',readyForProvider:false}],
 ['blocked',[{kind:'unavailable',reason:'blocked'}],403,{error:{code:'DATA_POLICY_BLOCKED'}}],
 ['unknown-reason',[{kind:'unavailable',reason:'unknown'}],503,{error:{code:'PROVIDER_UNAVAILABLE'}}],
 ['extra-unavailable-field',[{kind:'unavailable',reason:'stale_basis',intake}],503,{error:{code:'PROVIDER_UNAVAILABLE'}}],
 ['malformed',[null],503,{error:{code:'PROVIDER_UNAVAILABLE'}}],
 ['second-blocked',[data,{kind:'unavailable',reason:'blocked'}],403,{error:{code:'DATA_POLICY_BLOCKED'}}],
 ['second-malformed',[data,{}],503,{error:{code:'PROVIDER_UNAVAILABLE'}}],
 ['second-unknown',[data,{kind:'unavailable',reason:'not_integrated'}],503,{error:{code:'PROVIDER_UNAVAILABLE'}}],
 ['changed-basis',[data,{...data,contextDigest:'b'.repeat(64)}],200,{version:5,kind:'unavailable',reason:'stale_basis',readyForProvider:false}],
 ['unknown-field-spelling',[{...data,readiness:{...data.readiness,unknown:['lodging_budget']}}],503,{error:{code:'PROVIDER_UNAVAILABLE'}}],
 ['duplicate-unknown',[{...data,readiness:{...data.readiness,unknown:['lodgingBudget','lodgingBudget','dates']}}],503,{error:{code:'PROVIDER_UNAVAILABLE'}}],
 ['missing-unknown',[{...data,readiness:{...data.readiness,unknown:['dates']}}],503,{error:{code:'PROVIDER_UNAVAILABLE'}}],
 ['known-field-unknown',[{...data,intake:{...intake,lodgingBudget:{currency:'USD',perNightMinorUnits:10000}}}],503,{error:{code:'PROVIDER_UNAVAILABLE'}}],
 ['ready-without-city',[{...data,intake:{...intake,city:null}}],503,{error:{code:'PROVIDER_UNAVAILABLE'}}],
])test('intake read strict qualification: '+name,async t=>{
 const e=await setup(t,{reads}),r=await nativeTravelIntakeHTTP(e.request());assert.equal(r.status,status);assert.deepEqual(await r.json(),body);
 assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(e.sessions(),2,'early response still verifies final session');
});
for(const [name,reply,status,code]of [['replaced',{subject:goal,sessionId},401,'UNAUTHENTICATED'],['malformed',{},503,'PROVIDER_UNAVAILABLE']])test('final intake session '+name,async t=>{
 const e=await setup(t,{reads:[{kind:'unavailable',reason:'stale_basis'}],lastSession:reply}),r=await nativeTravelIntakeHTTP(e.request());assert.equal(r.status,status);assert.deepEqual(await r.json(),{error:{code}});
});
for(const [name,read,status]of [['blocked',{kind:'unavailable',reason:'blocked'},403],['malformed',{},503],['unknown',{kind:'unavailable',reason:'unknown'},503],['legal-stale',{kind:'unavailable',reason:'stale_basis'},201]])test('post current qualification: '+name,async t=>{
 const e=await setup(t,{post:true,reads:[read]}),r=await nativeTravelIntakeHTTP(e.request());assert.equal(r.status,status);const body=await r.json();
 if(status===201){assert.equal(body.current,false);for(const key of ['contextDigest','intake','memoryBasis'])assert.equal(Object.hasOwn(body,key),false);}
 else assert.deepEqual(body,{error:{code:status===403?'DATA_POLICY_BLOCKED':'PROVIDER_UNAVAILABLE'}});
 assert.equal(e.sessions(),2);
});
test('closed projection never infers values, filters malformed keys or coerces enum arrays',()=>{
 assert.equal(validExplicitTravelIntake(intake),true);
 for(const bad of [{...intake,city:undefined},{...intake,pace:['relaxed']},{...intake,comparisonTarget:['area_transport']},{...intake,extra:'private'},
  {...intake,dates:{startDate:'2026-02-31',endDate:'2026-03-01'}},{...intake,partySize:1.5},{...intake,interests:['food','food']}])assert.equal(validExplicitTravelIntake(bad),false);
 const missing={...intake};delete missing.pace;assert.equal(validExplicitTravelIntake(missing),false);
});

const basis={kind:'travel_intake_write_basis',conversationId:id,goalId:goal,goalVersion:2,parentMessageId:message,messageSequence:3,intakeRevision:1,policyId:id,readyForProvider:false};
for(const [name,reads,status,code]of [
 ['ready',[basis,basis],200,null],['foreign',[{kind:'unavailable',reason:'blocked'}],403,'DATA_POLICY_BLOCKED'],
 ['second-blocked',[basis,{kind:'unavailable',reason:'blocked'}],403,'DATA_POLICY_BLOCKED'],['malformed',[{}],503,'PROVIDER_UNAVAILABLE'],
 ['extra-content',[{...basis,intake}],503,'PROVIDER_UNAVAILABLE'],['second-malformed',[basis,null],503,'PROVIDER_UNAVAILABLE'],
 ['mixed-revision',[basis,{...basis,intakeRevision:2}],409,'SERVICE_TASK_CONFLICT'],
])test('write basis closed metadata: '+name,async t=>{
 const e=await setup(t,{reads,writeBasis:true}),r=await nativeTravelIntakeHTTP(e.request(),true);assert.equal(r.status,status);
 assert.deepEqual(await r.json(),status===200?{version:5,...basis}:{error:{code}});assert.equal(e.sessions(),2);
});
