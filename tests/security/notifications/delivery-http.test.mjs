import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { nativeNoticeHTTP } from '../../../lib/server/notifications/delivery-http.ts';
import { noticeRequestDigest } from '../../../lib/server/notifications/wire.ts';
import { nativeFixture, subject, sessionId } from '../../contract/identity/native-fixture.ts';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const source={kind:'current_trip',sourceId:id(1),revision:3,contentDigest:'a'.repeat(64)};
const command={action:'schedule',input:{operationId:id(2),id:id(3),baseVersion:3,purpose:'user_set_travel',source,reason:'Meet guide',dueAt:'2026-10-05T12:00:00Z',expiresAt:'2026-10-05T13:00:00Z',timeZone:'Asia/Shanghai',quietHours:{startMinute:1320,endMinute:420},consent:true}};
const view={version:2,tripId:id(1),tripVersion:3,transport:'configured',watchAvailability:'qualified_only',nextSteps:[],reminders:[],watches:[],device:null,complete:true,mutationReceipt:null};
let port=61100;
async function setup(t){
 const fixture=await nativeFixture(t,`http://127.0.0.1:${port++}`);
 const patch={NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey,VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_REMINDER_DELIVERY_ENABLED:'false'};
 const prior=new Map(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);
 t.after(()=>{for(const[k,v]of prior)v===undefined?delete process.env[k]:process.env[k]=v;});
 const transport=globalThis.fetch,seen=[];let data=view,rpcError=null,epoch=1,drift=false,sessionReply=null,sessionReads=0;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const request=new Request(input,init),path=new URL(request.url).pathname;
  if(path.endsWith('/native_session_v2')){sessionReads++;return Response.json(sessionReply??{version:2,subject,sessionId,mobileEpoch:drift&&sessionReads>1?epoch+1:epoch});}
  if(path.endsWith('/travel_reminders_v2')||path.endsWith('/resolve_travel_notification_v2')){seen.push(await request.json());return rpcError?Response.json({message:rpcError},{status:400}):Response.json(data);}
  return transport(input,init);
 });
 return {fixture,seen,data:v=>{data=v;},error:v=>{rpcError=v;},drift:()=>{drift=true;},session:v=>{sessionReply=v;},request:(body=null,extra={})=>new NextRequest('http://127.0.0.1/api/trips/native/v2/'+id(1)+'/reminders/delivery',{method:body?'POST':'GET',headers:{authorization:'Bearer '+fixture.token,...extra},...(body?{body:JSON.stringify(body)}:{})})};
}
test('synthetic authenticated HTTP enforces exact mutation ACK and independently disabled transport',async t=>{
 const e=await setup(t);
 const first=await nativeNoticeHTTP(e.request(),id(1));assert.equal(first.status,200);assert.equal((await first.json()).transport,'disabled');
 const mutationReceipt={operationId:id(2),action:'schedule',requestDigest:noticeRequestDigest(command),resultId:id(3),revision:1,terminal:true,outcome:'applied'};
 e.data({...view,mutationReceipt});const response=await nativeNoticeHTTP(e.request(command),id(1));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(e.seen.at(-1),{p_trip:id(1),p_action:'schedule',p_input:command.input});
 e.data({...view,mutationReceipt:{...mutationReceipt,requestDigest:'b'.repeat(64)}});assert.equal((await nativeNoticeHTTP(e.request(command),id(1))).status,503);
});
test('closed native HTTP rejects browser authority, malformed dates and extra private fields before mutation',async t=>{
 const e=await setup(t);
 for(const extra of [{cookie:'synthetic'},{origin:'http://127.0.0.1'}])assert.equal((await nativeNoticeHTTP(e.request(command,extra),id(1))).status,400);
 assert.equal((await nativeNoticeHTTP(e.request({...command,input:{...command.input,dueAt:'2026-02-30T12:00:00Z'}}),id(1))).status,400);
 assert.equal((await nativeNoticeHTTP(e.request({...command,actor:subject}),id(1))).status,400);
 assert.equal((await nativeNoticeHTTP(e.request(), 'not-a-trip')).status,400);assert.deepEqual(e.seen,[]);
});
test('scope drift discards response; storage failure preserves unknown rather than credential denial',async t=>{
 const e=await setup(t);e.drift();assert.equal((await nativeNoticeHTTP(e.request(),id(1))).status,409);
 e.error('Temporary secret storage error');const fail=await nativeNoticeHTTP(e.request(),id(1));assert.equal(fail.status,503);assert.deepEqual(await fail.json(),{error:{code:'PROVIDER_UNAVAILABLE'}});
 e.error('SOURCE_UNAVAILABLE');assert.equal((await nativeNoticeHTTP(e.request(),id(1))).status,409);
});
test('opaque resolve keeps full current source tuple and cannot accept caller-selected Trip',async t=>{
 const e=await setup(t),notificationId=id(8);
 e.data({version:2,kind:'resolved',notificationId,tripId:id(1),tripVersion:3,source,expiresAt:'2026-10-05T13:00:00Z',current:true});
 const request=body=>new NextRequest('http://127.0.0.1/api/trips/native/v2/notifications/resolve',{method:'POST',headers:{authorization:'Bearer '+e.fixture.token},body:JSON.stringify(body)});
 assert.equal((await nativeNoticeHTTP(request({notificationRef:notificationId}),null)).status,200);assert.deepEqual(e.seen,[{p_notification:notificationId}]);
 assert.equal((await nativeNoticeHTTP(request({notificationRef:notificationId,tripId:id(1)}),null)).status,400);
 e.data({version:2,kind:'resolved',notificationId,tripId:id(1),current:true});assert.equal((await nativeNoticeHTTP(request({notificationRef:notificationId}),null)).status,503);
});
