import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as http2Server } from 'node:http2';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runHostedNotifications } from '../../../lib/server/notifications/hosted.ts';
const exec = promisify(execFile), id = '00000000-0000-0000-0000-000000000111';
const cli='lib/server/jobs/run-notification-worker.mjs';
test('formal host disabled path reads no credentials/endpoints and CLI rejects open parameters',async()=>{
 const environment=new Proxy({VISEPANDA_REMINDER_DELIVERY_ENABLED:'false'},{get(target,key){if(key!=='VISEPANDA_REMINDER_DELIVERY_ENABLED')throw Error('secret read');return target[key];}});
 assert.equal((await runHostedNotifications({},new AbortController().signal,environment)).reason,'disabled');
 assert.equal((await runHostedNotifications({profile:'local'},new AbortController().signal,environment)).ticks,0);
 const off=await exec(process.execPath,['--experimental-strip-types',cli],{env:{...process.env,VISEPANDA_REMINDER_DELIVERY_ENABLED:'true',VISEPANDA_REMINDER_WORKER_KEY:'synthetic-never-print'}});assert.equal(JSON.parse(off.stdout).reason,'disabled');assert.ok(!off.stdout.includes('synthetic-never-print'));
 await assert.rejects(exec(process.execPath,['--experimental-strip-types',cli,'--profile','disabled','--ticks','999']));
 await assert.rejects(exec(process.execPath,['--experimental-strip-types',cli,'--unknown','secret']));
});
test('formal CLI local composition uses real loopback HTTP/HTTP2 once, stops and never contacts Apple',async()=>{
 let sends=0,polls=0,attempt=null,outcome=null,dbCalls=[];
 const push=http2Server();push.on('stream',(stream,headers)=>{
  assert.equal(headers.authorization,undefined);assert.equal(headers['apns-expiration'],'0');
  let body='';stream.on('data',chunk=>body+=chunk);stream.on('end',()=>{const data=JSON.parse(body);assert.deepEqual(Object.keys(data).sort(),['aps','notificationRef']);assert.equal(data.notificationRef,id);sends++;stream.respond({':status':200,'apns-id':headers['apns-id']});stream.end();});
 });
 const database=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;const p=JSON.parse(body);dbCalls.push(req.url);
  assert.equal(req.headers.authorization,'Bearer synthetic-notification-worker');
  let value;
  if(req.url==='/rest/v1/rpc/poll_travel_notifications_v2'){polls++;value=outcome?{kind:'idle'}:{kind:'candidate',notificationId:id};}
  else if(req.url==='/rest/v1/rpc/dispatch_travel_notification_v2'){
   if(p.p_action==='begin'){assert.equal(attempt,null);attempt=p.p_input.attemptId;const now=Date.now();value={kind:'attempt',notificationId:id,attemptId:attempt,deviceRevision:1,token:'ab'.repeat(32),environment:'sandbox',expiresAt:new Date(now+60000).toISOString(),authorizedAt:new Date(now).toISOString(),leaseExpiresAt:new Date(now+5000).toISOString()};}
   else if(p.p_action==='finish'){assert.equal(p.p_input.attemptId,attempt);outcome=p.p_input.outcome;value={kind:'receipt',notificationId:id,attemptId:attempt,state:outcome.kind,outcome};}
   else throw Error('unexpected mock RPC');
  }else throw Error('unexpected mock route');
  res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
 });
 await Promise.all([new Promise(r=>push.listen(0,'127.0.0.1',r)),new Promise(r=>database.listen(0,'127.0.0.1',r))]);
 try{
  const environment={...process.env,VISEPANDA_REMINDER_DELIVERY_ENABLED:'true',VISEPANDA_REMINDER_HOST_PROFILE:'local',VISEPANDA_REMINDER_DATABASE_URL:`http://127.0.0.1:${database.address().port}`,VISEPANDA_REMINDER_WORKER_KEY:'synthetic-notification-worker',VISEPANDA_REMINDER_APNS_TOPIC:'fixture.only',VISEPANDA_REMINDER_APNS_ENVIRONMENT:'sandbox',VISEPANDA_REMINDER_LOCAL_SYNTHETIC:'true',VISEPANDA_REMINDER_LOCAL_APNS_URL:`http://127.0.0.1:${push.address().port}`,VERCEL_ENV:''};
  const run=await exec(process.execPath,['--experimental-strip-types',cli,'--profile','local','--ticks','2','--max-ms','10000'],{env:environment});
  const result=JSON.parse(run.stdout);assert.equal(result.profile,'local');assert.equal(result.reason,'completed');assert.equal(result.ticks,2);assert.equal(result.accepted,1);assert.equal(sends,1);assert.equal(polls,2);assert.ok(dbCalls.every(x=>['/rest/v1/rpc/poll_travel_notifications_v2','/rest/v1/rpc/dispatch_travel_notification_v2'].includes(x)));assert.ok(!run.stdout.includes('ab'.repeat(32)));assert.ok(!run.stdout.includes('synthetic-notification-worker'));
 }finally{await Promise.all([new Promise(r=>push.close(r)),new Promise(r=>database.close(r))]);}
});
