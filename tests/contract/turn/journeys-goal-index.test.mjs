import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {nativeJourneysGoalIndexHTTP,validJourneysGoalIndexPage,validJourneysGoalIndexCursor} from '../../../lib/server/turn/native-journeys-goal-index-http.ts';
import {nativeFixture,subject,sessionId} from '../identity/native-fixture.ts';
const conversation='10000000-0000-4000-8000-000000000001',goal='20000000-0000-4000-8000-000000000001',stamp='a'.repeat(32);
const page={kind:'journeys_goal_index',snapshot:stamp,goals:[{conversationId:conversation,goalId:goal,scopeVersion:1,text:'China with no dates',relation:{state:'unlinked',tripId:null,tripHeadVersion:null}}],nextCursor:null};
test('journeys page is closed/bounded and cursor contains no arbitrary path/query input',()=>{
 assert.ok(validJourneysGoalIndexPage(page));assert.ok(validJourneysGoalIndexCursor(`v1.${conversation}.${goal}.${stamp}`));
 for(const bad of [{...page,messages:['private']},{...page,goals:Array(21).fill(page.goals[0])},{...page,goals:[{...page.goals[0],relation:{state:'unknown',tripId:goal,tripHeadVersion:1}}]},{...page,nextCursor:'bad'}])assert.equal(validJourneysGoalIndexPage(bad),false);
 for(const bad of ['../private',`v1.${conversation}.${goal}.${stamp}?owner=other`,'bad'])assert.equal(validJourneysGoalIndexCursor(bad),false);
});
for(const mode of ['success','terminal','foreign-cursor','revoked','wrong-session','session-error','missing-rpc','unexpected-messages','query','post','wrong-path'])test('journeys HTTP: '+mode,async t=>{
 const host='vp-v4-journeys-jtcao515s-projects.vercel.app',database='https://dzqdzetcctkhbrhlxxgn.supabase.co';const f=await nativeFixture(t,database);
 const env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',VISEPANDA_NATIVE_STAGING_TEXT:'true',VISEPANDA_NATIVE_STAGING_TEXT_POLICY:conversation,NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});
 const previous=globalThis.fetch;const rpcs=[];
 t.mock.method(globalThis,'fetch',async(i,init)=>{const request=new Request(i,init),path=new URL(request.url).pathname;
  if(path.endsWith('/native_session_v2') && mode==='session-error')return Response.json({message:'temporary unavailable'},{status:503});
  if(path.endsWith('/native_session_v2'))return Response.json({subject:mode==='wrong-session'?goal:subject,sessionId,mobileEpoch:1});
  if(path.endsWith('/read_journeys_goal_index_v1')){rpcs.push(await request.json());if(mode==='missing-rpc')return Response.json({message:'missing schema'},{status:404});return Response.json(['foreign-cursor','revoked'].includes(mode)?{kind:'unavailable'}:mode==='unexpected-messages'?{...page,messages:['private']}:mode==='terminal'?{...page,goals:[{...page.goals[0],scopeVersion:10001}, {...page.goals[0],goalId:'20000000-0000-4000-8000-000000000002'}]}:page);}
  return previous(i,init);
 });
 const cursor=mode==='foreign-cursor'?`v1.${conversation}.${goal}.${stamp}`:undefined;
 const request=new NextRequest(`https://${host}/api/chat/native/v5/${mode==='wrong-path'?'other':'journeys-goals'}${cursor?'/'+cursor:''}${mode==='query'?'?owner=other':''}`,{method:mode==='post'?'POST':'GET',headers:{Authorization:'Bearer '+f.token}});
 const response=await nativeJourneysGoalIndexHTTP(request,cursor);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 if(mode==='terminal'){assert.equal(response.status,200);const body=await response.json();assert.equal(body.goals.length,2);assert.equal(body.goals[0].scopeVersion,10001);assert.deepEqual(body.goals[0].relation,{state:'unlinked',tripId:null,tripHeadVersion:null});}
 else if(mode==='success'){assert.equal(response.status,200);assert.deepEqual(rpcs,[{p_policy_id:conversation,p_cursor:null}]);assert.deepEqual(await response.json(),{version:5,...page});}
 else {if(mode==='session-error')assert.equal(response.status,503);assert.notEqual(response.status,200);assert.ok(!JSON.stringify(await response.json()).includes('conversationId'));}
 assert.ok(rpcs.length<=1);
});

test('read boundary includes terminal 10001 but excludes unsupported 10002',()=>{assert.equal(validJourneysGoalIndexPage({...page,goals:[{...page.goals[0],scopeVersion:10001}]}),true);assert.equal(validJourneysGoalIndexPage({...page,goals:[{...page.goals[0],scopeVersion:10002}]}),false);});

for(const [name,data,error,status] of [
 ['null',null,null,503],['empty',{},null,503],['missing-subject',{sessionId},null,503],['missing-session',{subject},null,503],
 ['invalid-subject',{subject:'invalid',sessionId},null,503],['invalid-session',{subject,sessionId:'invalid'},null,503],
 ['valid-subject-mismatch',{subject:goal,sessionId},null,401],['valid-session-mismatch',{subject,sessionId:goal},null,401],
 ['explicit-unauthenticated',null,'UNAUTHENTICATED',401],['explicit-replacement',null,'SESSION_REPLACED',401],
])test('journeys session reply classification: '+name,async t=>{
 const f=await nativeFixture(t,'http://127.0.0.1:58710');
 const env={NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,
  VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:conversation};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});
 const previous=globalThis.fetch;let reads=0;
 t.mock.method(globalThis,'fetch',async(i,init)=>{const request=new Request(i,init),path=new URL(request.url).pathname;
  if(path.endsWith('/native_session_v2'))return error?Response.json({message:error},{status:400}):Response.json(data);
  if(path.endsWith('/read_journeys_goal_index_v1')){reads++;return Response.json(page);}
  return previous(i,init);
 });
 const response=await nativeJourneysGoalIndexHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v5/journeys-goals',{headers:{Authorization:'Bearer '+f.token}}));
 assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(await response.json(),{error:{code:status===503?'PROVIDER_UNAVAILABLE':'UNAUTHENTICATED'}});
 assert.equal(reads,0);
});
