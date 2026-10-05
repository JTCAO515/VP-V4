import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { createServer } from 'node:http2';
import { createApnsTransport, apnsExchange } from '../../../lib/server/notifications/apns.ts';
import { parseNoticeCommand, noticeRequestDigest, canonicalNoticeJSON, timestamp } from '../../../lib/server/notifications/wire.ts';
import { decodeNoticeView, decodeNoticeResolution } from '../../../lib/server/notifications/codec.ts';
import { runNotificationScheduler } from '../../../lib/server/notifications/scheduler.ts';
import { createNotificationRuntime } from '../../../lib/server/notifications/runtime.ts';
import { notificationExportHandler } from '../../../lib/server/notifications/export.ts';
import { createNotificationSendPermit } from '../../../lib/server/privacy/notification-data/send-budget.ts';
import { notificationRpc } from '../../../lib/server/notifications/rpc.ts';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const now = new Date('2026-10-05T04:00:00.000Z'), clock = () => now;
const source = { kind:'current_trip', sourceId:id(1), revision:3, contentDigest:'a'.repeat(64) };
const command = { action:'schedule', input:{ operationId:id(2),id:id(3),baseVersion:3,purpose:'user_set_travel',source,reason:'检查 / 证件',dueAt:'2026-10-05T04:30:00Z',expiresAt:'2026-10-05T05:30:00Z',timeZone:'Asia/Shanghai',quietHours:{ startMinute:1320,endMinute:420 },consent:true } };
const view = {version:2,tripId:id(1),tripVersion:3,transport:'disabled',watchAvailability:'qualified_only',nextSteps:[],reminders:[],watches:[],device:null,complete:true,mutationReceipt:null};
test('closed commands reject implicit timezone, normalized dates, consent and purpose mismatches',()=>{
 assert.deepEqual(parseNoticeCommand(command),command);
 for(const dueAt of ['2026-02-30T04:00:00Z','2026-10-05T04:00:00','2026-10-05T24:00:00Z','2026-10-05T04:00:00+14:01','2026-10-05T04:00:00+15:00'])assert.equal(timestamp(dueAt),false);
 for(const dueAt of ['2024-02-29T04:00:00Z','2026-10-05T04:00:00.123+08:00'])assert.equal(timestamp(dueAt),true);
 for(const patch of [{consent:false},{purpose:'marketing'},{purpose:'accepted_task_result'},{source:{...source,contentDigest:'timestamp'}},{quietHours:{startMinute:1440,endMinute:1}},{dueAt:'2026-02-30T04:00:00Z'}])assert.equal(parseNoticeCommand({...command,input:{...command.input,...patch}}),null);
 assert.equal(parseNoticeCommand({...command,input:{...command.input,ownerId:id(99)}}),null);
 assert.equal(parseNoticeCommand({action:'register_device',input:{operationId:id(2),deviceId:id(4),token:'ab',environment:'sandbox',permission:'denied',timeZone:'Asia/Shanghai'}}),null);
 assert.ok(parseNoticeCommand({action:'revoke_device',input:{operationId:id(2),deviceId:id(4),permission:'authorized'}}));
});
test('canonical exact mutation receipt clears only the original command; abandon retains original tuple',()=>{
 const digest=noticeRequestDigest(command);
 assert.equal(canonicalNoticeJSON({z:'检查 /',a:{b:2,a:true}}),'\u007b"a":{"a":true,"b":2},"z":"检查 /"}');
 assert.equal(noticeRequestDigest({input:command.input,action:command.action}),digest);
 const mutationReceipt={operationId:id(2),action:'schedule',requestDigest:digest,resultId:id(3),revision:1,terminal:true,outcome:'applied'};
 assert.ok(decodeNoticeView({...view,mutationReceipt},id(1),command));
 assert.equal(decodeNoticeView({...view,mutationReceipt},id(1),null),null);
 assert.equal(decodeNoticeView(view,id(1),command),null);
 for(const patch of [{operationId:id(9)},{requestDigest:'0'.repeat(64)},{resultId:id(8)},{terminal:false},{outcome:'unknown'}])assert.equal(decodeNoticeView({...view,mutationReceipt:{...mutationReceipt,...patch}},id(1),command),null);
 const abandon={action:'abandon',input:{command}};
 assert.deepEqual(parseNoticeCommand(abandon),abandon);
 assert.ok(decodeNoticeView({...view,mutationReceipt:{...mutationReceipt,outcome:'cancelled'}},id(1),abandon));
 assert.equal(parseNoticeCommand({action:'abandon',input:{command:abandon}}),null);
});
test('closed view and opaque resolution reject payload leakage and ambiguous receipts',()=>{
 assert.ok(decodeNoticeView(view,id(1),null));
 const resolution={version:2,kind:'resolved',notificationId:id(7),tripId:id(1),tripVersion:3,source,expiresAt:'2026-10-05T05:00:00Z',current:true};
 assert.ok(decodeNoticeResolution(resolution,id(7)));
 assert.equal(decodeNoticeResolution({...resolution,token:'secret'},id(7)),null);
 assert.equal(decodeNoticeResolution({...resolution,notificationId:id(8)},id(7)),null);
 const step={id:id(9),source,reasonCode:'review_trip',reason:null,expiresAt:resolution.expiresAt};
 assert.ok(decodeNoticeView({...view,nextSteps:[step]},id(1),null));
 assert.equal(decodeNoticeView({...view,nextSteps:[{...step,reason:'secret trip title'}]},id(1),null),null);
 assert.equal(decodeNoticeView({...view,nextSteps:[step,step]},id(1),null),null);
 const available={...step,source:{...source,kind:'qualified_watch'},reasonCode:'watch_available'};
 assert.ok(decodeNoticeView({...view,nextSteps:[available]},id(1),null));
 assert.equal(decodeNoticeView({...view,nextSteps:[{...available,reasonCode:'result_ready'}]},id(1),null),null);
});
test('notification export has an exact lease/source cursor and rejects raw token or copied command',async()=>{
 const lease={requestId:id(60),ownerId:id(61),leaseId:id(62),generation:1,expiresAt:'2026-10-05T05:00:00Z'};
 const device={key:'device:'+id(63),domain:'device',deviceId:id(63),revision:1,permission:'authorized',active:true,environment:'sandbox',timeZone:'Asia/Shanghai'};
 let data={kind:'metadata',schemaVersion:'notification-metadata/1',requestId:lease.requestId,generation:1,sourceRevision:'b'.repeat(64),items:[device],hasMore:false,nextCursor:null,allUserDataCompleted:false};
 const seen=[],rpc=async(name,p)=>{seen.push([name,p]);return data;};
 const handler=notificationExportHandler(lease,rpc),signal=new AbortController().signal;
 const page=await handler.page('notifications',null,10,signal);assert.equal(page.sectionComplete,true);assert.equal(seen[0][1].p_lease,lease.leaseId);assert.ok(!Object.hasOwn(seen[0][1],'ownerId'));
 data={...data,items:[{...device,token:'secret'}]};await assert.rejects(handler.page('notifications',null,10,signal),/unavailable/);
 data={...data,items:[device],sourceRevision:'c'.repeat(64)};await assert.rejects(handler.page('notifications',null,10,signal),/unavailable/);
 data={...data,sourceRevision:'b'.repeat(64),allUserDataCompleted:true};await assert.rejects(handler.page('notifications',null,10,signal),/unavailable/);
});
const keypair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const configuration={teamId:'ABCDEFGHIJ',keyId:'0123456789',topic:'com.visepanda.app',privateKey:keypair.privateKey.export({format:'pem',type:'pkcs8'}).toString(),environment:'sandbox'};
const sendPermit=()=>createNotificationSendPermit(process.hrtime.bigint(),5000,new AbortController().signal);
const send={token:'ab'.repeat(32),apnsId:id(11),notificationId:id(12),environment:'sandbox',topic:'com.visepanda.app',expiresAt:'2026-10-05T05:00:00Z'};
test('APNs factory is explicit/default disabled; no credentials discovery or network',async()=>{
 let calls=0;
 const exchange=async()=>{calls++;throw Error('must not call');};
 const rpc=async()=>{calls++;throw Error('must not poll');};
 assert.equal(createApnsTransport({configuration,exchange}).available,false);
 assert.equal(createApnsTransport({enabled:true,configuration:{...configuration,privateKey:'invalid'},exchange}).available,false);
 assert.equal(await createNotificationRuntime({rpc,configuration,exchange}).tick(new AbortController().signal),'disabled');
 assert.equal(calls,0);
});
test('dedicated persistent RPC is default disabled, bounded and cannot redirect credentials',async()=>{
 let calls=0,seen;
 const fetcher=async(url,init)=>{calls++;seen={url,init};return Response.json({kind:'idle'});};
 const options={url:'http://127.0.0.1:9999',serviceKey:'synthetic-service-only'};
 await assert.rejects(notificationRpc(options,fetcher)('poll_travel_notifications_v2',{p_limit:1},new AbortController().signal),/unavailable/);assert.equal(calls,0);
 const rpc=notificationRpc({...options,enabled:true},fetcher);assert.deepEqual(await rpc('poll_travel_notifications_v2',{p_limit:1},new AbortController().signal),{kind:'idle'});assert.equal(calls,1);assert.equal(seen.init.redirect,'error');assert.equal(seen.init.credentials,'omit');
 assert.throws(()=>notificationRpc({...options,url:'https://outside.example',enabled:true},fetcher),/unavailable/);
 await assert.rejects(notificationRpc({...options,enabled:true},async()=>new Response('secret provider body',{status:503}))('poll_travel_notifications_v2',{p_limit:1},new AbortController().signal),/unavailable/);
});
test('APNs ES256 HTTP2 request is generic, opaque and exact; acceptance never claims delivered',async()=>{
 let seen;
 const transport=createApnsTransport({enabled:true,configuration,now:clock,exchange:async r=>{seen=r;return {status:200,apnsId:send.apnsId,reason:null};}});
 assert.deepEqual(await transport.send({...send,sendPermit:sendPermit()}),{kind:'accepted',apnsId:send.apnsId,acceptedAt:now.toISOString()});
 assert.equal(seen.origin,'https://api.sandbox.push.apple.com');
 assert.equal(seen.headers['apns-expiration'],'0');assert.equal(seen.headers['apns-push-type'],'alert');assert.equal(seen.headers['apns-id'],send.apnsId);
 const jwt=seen.headers.authorization.slice(7),[header,claims,signature]=jwt.split('.');
 assert.deepEqual(JSON.parse(Buffer.from(header,'base64url')),{alg:'ES256',kid:configuration.keyId});
 assert.deepEqual(JSON.parse(Buffer.from(claims,'base64url')),{iss:configuration.teamId,iat:now.getTime()/1000});
 assert.ok(verify('sha256',Buffer.from(`${header}.${claims}`),{key:keypair.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
 const payload=JSON.parse(seen.payload);assert.deepEqual(Object.keys(payload).sort(),['aps','notificationRef']);assert.equal(payload.notificationRef,send.notificationId);assert.deepEqual(Object.keys(payload.aps),['alert']);
 assert.ok(!seen.payload.includes(command.input.reason));assert.ok(!seen.payload.includes(id(1)));
 assert.equal((await transport.send({...send,environment:'production',sendPermit:sendPermit()})).code,'TRANSPORT_UNAVAILABLE');
});
test('uncertain APNs ACK, token revoke and rejected response are distinct, with no retry',async()=>{
 for(const [response,expected] of [[{status:200,apnsId:null,reason:null},'ACK_UNKNOWN'],[{status:200,apnsId:id(77),reason:null},'ACK_UNKNOWN'],[{status:410,apnsId:null,reason:'Unregistered'},'TOKEN_REVOKED'],[{status:429,apnsId:null,reason:'TooManyRequests'},'PROVIDER_REJECTED']]){
  let calls=0;const t=createApnsTransport({enabled:true,configuration,now:clock,exchange:async()=>{calls++;return response;}});
  const outcome=await t.send({...send,sendPermit:sendPermit()});assert.equal(outcome.code??outcome.kind,expected);assert.equal(calls,1);
 }
 const t=createApnsTransport({enabled:true,configuration,now:clock,exchange:async()=>{throw Error('secret body must not escape');}});
 assert.deepEqual(await t.send({...send,sendPermit:sendPermit()}),{kind:'unknown',code:'ACK_UNKNOWN'});
});
test('SQL-authorized topic and environment must match independently configured transport before any exchange',async()=>{
 let exchanges=0;
 const factory=createApnsTransport({enabled:true,configuration,now:clock,exchange:async()=>{exchanges++;return {status:200,apnsId:send.apnsId,reason:null};}});
 assert.deepEqual(factory.binding,{environment:'sandbox',topic:configuration.topic});
 for(const patch of [{topic:'other.app'},{environment:'production'}])assert.deepEqual(await factory.send({...send,...patch,sendPermit:sendPermit()}),{kind:'error',code:'TRANSPORT_UNAVAILABLE'});
 assert.equal(exchanges,0);
 for(const binding of [{environment:'sandbox',topic:'other.app'},{environment:'production',topic:configuration.topic},null]){
  const p=port(),transport={available:true,binding,send:async()=>{exchanges++;throw Error('must not exchange');}};
  assert.equal(await runNotificationScheduler({enabled:true,rpc:p.rpc,transport,now:clock},new AbortController().signal),'error');
  assert.equal(exchanges,0);assert.equal(p.calls.at(-1)[1],'finish');
 }
});
test('actual HTTP2 exchange reads a local synthetic endpoint without contacting Apple',async()=>{
 const server=createServer();server.on('stream',(stream,headers)=>{assert.equal(headers[':method'],'POST');stream.respond({':status':200,'apns-id':send.apnsId});stream.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const response=await apnsExchange({origin:`http://127.0.0.1:${server.address().port}`,headers:{':method':'POST',':path':'/mock'},payload:'{}',timeoutMs:1000,sendPermit:sendPermit()});assert.deepEqual(response,{status:200,apnsId:send.apnsId,reason:null});}
 finally {await new Promise(resolve=>server.close(resolve));}
});
function port({block=false,lostFinish=false,malformed=false,abortAfterBegin=null}={}){
 let sent=0,attempted=false,saved=null;const calls=[];
 const rpc=async(name,p)=>{
  calls.push([name,p.p_action]);
  if(name==='poll_travel_notifications_v2')return {kind:'candidate',notificationId:id(12)};
  const attemptId=p.p_input.attemptId;
  if(p.p_action==='begin_fenced'){
   if(block||attempted)return {kind:'blocked'};attempted=true;abortAfterBegin?.abort();
   return {kind:'attempt',notificationId:id(12),attemptId,deviceRevision:1,token:send.token,environment:'sandbox',topic:'com.visepanda.app',expiresAt:send.expiresAt,authorizedAt:now.toISOString(),leaseExpiresAt:new Date(now.getTime()+5000).toISOString(),leaseBudgetMs:5000,...(malformed?{owner:'untrusted'}:{})};
  }
  if(p.p_action==='finish'){saved={kind:'receipt',notificationId:id(12),attemptId,state:p.p_input.outcome.kind,outcome:p.p_input.outcome};if(lostFinish)throw Error('lost ACK');return saved;}
  return saved;
 };
 const transport={available:true,binding:{environment:'sandbox',topic:'com.visepanda.app'},send:async input=>{sent++;return {kind:'accepted',apnsId:input.apnsId,acceptedAt:now.toISOString()};}};
 return {rpc,transport,calls,get sent(){return sent;}};
}
test('serialized cancellation before begin prevents transport; accepted attempt is never repeated',async()=>{
 const blocked=port({block:true});assert.equal(await runNotificationScheduler({enabled:true,...blocked,now:clock},new AbortController().signal),'blocked');assert.equal(blocked.sent,0);
 const p=port();assert.equal(await runNotificationScheduler({enabled:true,...p,now:clock},new AbortController().signal),'accepted');assert.equal(await runNotificationScheduler({enabled:true,...p,now:clock},new AbortController().signal),'blocked');assert.equal(p.sent,1);
});
test('lost finish ACK recovers same durable attempt; malformed/aborted grant sends nothing',async()=>{
 const p=port({lostFinish:true});assert.equal(await runNotificationScheduler({enabled:true,...p,now:clock},new AbortController().signal),'accepted');assert.equal(p.sent,1);assert.equal(p.calls.at(-1)[1],'read');
 const malformed=port({malformed:true});assert.equal(await runNotificationScheduler({enabled:true,...malformed,now:clock},new AbortController().signal),'blocked');assert.equal(malformed.sent,0);
 const controller=new AbortController(),aborted=port({abortAfterBegin:controller});assert.equal(await runNotificationScheduler({enabled:true,...aborted,now:clock},controller.signal),'unknown');assert.equal(aborted.sent,0);
});
test('abort during an unresolved network handoff records unknown and does not start another send',async()=>{
 const controller=new AbortController(),p=port();let calls=0;
 const transport={available:true,binding:{environment:'sandbox',topic:'com.visepanda.app'},send(){calls++;setTimeout(()=>controller.abort(),5);return new Promise(()=>{});}};
 assert.equal(await runNotificationScheduler({enabled:true,rpc:p.rpc,transport,now:clock},controller.signal),'unknown');assert.equal(calls,1);
 assert.equal(await runNotificationScheduler({enabled:true,rpc:p.rpc,transport,now:clock},new AbortController().signal),'blocked');assert.equal(calls,1);
});
