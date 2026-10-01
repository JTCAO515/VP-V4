import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {nativeJourneysHTTP,validJourneysPage,validJourneysCursor} from '../../../lib/server/turn/native-journeys-http.ts';
import {nativeFixture,subject,sessionId} from '../identity/native-fixture.ts';
const conversation='10000000-0000-4000-8000-000000000001',goal='20000000-0000-4000-8000-000000000001',stamp='a'.repeat(32);
const page={kind:'journeys_page',conversationId:conversation,conversationVersion:1,snapshot:stamp,goals:[{goalId:goal,scopeVersion:1,text:'China with no dates',relation:{state:'unlinked',tripId:null,tripHeadVersion:null}}],nextCursor:null};
test('journeys page is closed/bounded and cursor contains no arbitrary path/query input',()=>{
 assert.ok(validJourneysPage(page));assert.ok(validJourneysCursor(`v1.${conversation}.1.${goal}.${stamp}`));
 for(const bad of [{...page,messages:['private']},{...page,goals:Array(21).fill(page.goals[0])},{...page,goals:[{...page.goals[0],relation:{state:'unknown',tripId:goal,tripHeadVersion:1}}]},{...page,nextCursor:'bad'}])assert.equal(validJourneysPage(bad),false);
 for(const bad of ['../private',`v1.${conversation}.1.${goal}.${stamp}?owner=other`,'bad'])assert.equal(validJourneysCursor(bad),false);
});
for(const mode of ['success','terminal','foreign-cursor','revoked','wrong-session','session-error','missing-rpc','unexpected-messages','query','post','wrong-path'])test('journeys HTTP: '+mode,async t=>{
 const host='vp-v4-journeys-jtcao515s-projects.vercel.app',database='https://dzqdzetcctkhbrhlxxgn.supabase.co';const f=await nativeFixture(t,database);
 const env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',VISEPANDA_NATIVE_STAGING_TEXT:'true',VISEPANDA_NATIVE_STAGING_TEXT_POLICY:conversation,NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});
 const previous=globalThis.fetch;const rpcs=[];
 t.mock.method(globalThis,'fetch',async(i,init)=>{const request=new Request(i,init),path=new URL(request.url).pathname;
  if(path.endsWith('/native_session_v2') && mode==='session-error')return Response.json({message:'temporary unavailable'},{status:503});
  if(path.endsWith('/native_session_v2'))return Response.json({subject:mode==='wrong-session'?goal:subject,sessionId,mobileEpoch:1});
  if(path.endsWith('/read_assistant_journeys_page_v1')){rpcs.push(await request.json());if(mode==='missing-rpc')return Response.json({message:'missing schema'},{status:404});return Response.json(['foreign-cursor','revoked'].includes(mode)?{kind:'unavailable'}:mode==='unexpected-messages'?{...page,messages:['private']}:mode==='terminal'?{...page,goals:[{...page.goals[0],scopeVersion:10001}, {...page.goals[0],goalId:'20000000-0000-4000-8000-000000000002'}]}:page);}
  return previous(i,init);
 });
 const cursor=mode==='foreign-cursor'?`v1.${conversation}.1.${goal}.${stamp}`:undefined;
 const request=new NextRequest(`https://${host}/api/chat/native/v5/${mode==='wrong-path'?'other':'journeys'}${cursor?'/'+cursor:''}${mode==='query'?'?owner=other':''}`,{method:mode==='post'?'POST':'GET',headers:{Authorization:'Bearer '+f.token}});
 const response=await nativeJourneysHTTP(request,cursor);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 if(mode==='terminal'){assert.equal(response.status,200);const body=await response.json();assert.equal(body.goals.length,2);assert.equal(body.goals[0].scopeVersion,10001);assert.deepEqual(body.goals[0].relation,{state:'unlinked',tripId:null,tripHeadVersion:null});}
 else if(mode==='success'){assert.equal(response.status,200);assert.deepEqual(rpcs,[{p_policy_id:conversation,p_cursor:null}]);assert.deepEqual(await response.json(),{version:5,...page});}
 else {if(mode==='session-error')assert.equal(response.status,503);assert.notEqual(response.status,200);assert.ok(!JSON.stringify(await response.json()).includes('conversationId'));}
 assert.ok(rpcs.length<=1);
});

test('read boundary includes terminal 10001 but excludes unsupported 10002',()=>{assert.equal(validJourneysPage({...page,goals:[{...page.goals[0],scopeVersion:10001}]}),true);assert.equal(validJourneysPage({...page,goals:[{...page.goals[0],scopeVersion:10002}]}),false);});
