import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {SafetyOpsController,decodeSafetyPending} from '../../../../app/ops/community/safety/controller.ts';
import {safetySend} from '../../../../app/ops/community/safety/transport.ts';
import {SAFETY_SCHEMA} from '../../../../lib/server/community/safety/contract.ts';
const actor=uuid(),session=uuid(),id=uuid(),rid=uuid(),op=uuid();
const identity=()=>({actorId:actor,sessionId:session,expiresAt:Date.now()+60000});
const report=()=>({kind:'report',id:rid,submissionId:id,submissionVersion:1,safetyVersion:0,category:'abuse',details:'Private fixture only',state:'pending',version:1,createdAt:'2026-10-05T12:00:00Z',resolvedAt:null,note:null});
const base=()=>({schemaVersion:SAFETY_SCHEMA,actorId:actor,sessionId:session});
const disposition=()=>({action:'disposition',operationId:op,reportId:rid,expectedReportVersion:1,expectedSubmissionVersion:1,expectedSafetyVersion:0,decision:'remove',note:'Visible result'});
const terminal=()=>({...base(),kind:'operation',operationId:op,state:'committed',record:{...report(),state:'removed',version:2,safetyVersion:1,note:'Visible result',resolvedAt:'2026-10-05T12:01:00Z'}});
function setup(extra={}) {let saved=null;let last=null;const deps={identity:async()=>identity(),read:()=>saved,write:p=>{saved=p;},erase:()=>{saved=null;},changed:v=>{last=v;},send:async()=>({data:terminal()}),...extra};const c=new SafetyOpsController(deps);return {c,deps,saved:()=>saved,last:()=>last};}
test('journal saved before dispatch, timeout keeps exact original, retry/status refuse a new operation',async()=>{
 let s;const sent=[];s=setup({send:async bytes=>{assert.equal(s.saved().bytes,bytes);sent.push(bytes);return {error:'SAFETY_ACK_UNKNOWN'};}});
 await s.c.execute(disposition());const frozen=s.saved().bytes;assert.equal(s.c.view.message,'unknown');
 await s.c.execute({...disposition(),operationId:uuid()});assert.equal(sent.length,1);assert.equal(s.saved().bytes,frozen);
 await s.c.retry();assert.equal(sent[1],frozen);
 for (const error of ['SAFETY_DISABLED','SAFETY_FORBIDDEN','SAFETY_CONFLICT','SAFETY_NOT_FOUND']) {s.deps.send=async()=>({error});await s.c.retry();assert.equal(s.saved()?.bytes,frozen,'denied retry cannot prove the original unknown attempt never committed');assert.equal(s.c.view.message,'unknown');}
 s.deps.send=async bytes=>{const input=JSON.parse(bytes);assert.equal(input.action,'operation');assert.equal(input.mutationBytes,frozen);return {data:terminal()};};
 await s.c.resolve('operation');assert.equal(s.saved(),null);assert.equal(s.c.view.selected.state,'removed');
});
test('storage write failure prevents all mutation dispatch and malformed journals fail closed',async()=>{
 let calls=0;const s=setup({write:()=>{throw Error('quota');},send:async()=>{calls++;return {data:terminal()};}});await s.c.execute(disposition());assert.equal(calls,0);assert.equal(s.c.view.message,'storage');
 assert.equal(decodeSafetyPending(null),null);for (const p of [{actorId:actor,sessionId:session,bytes:'{}'},{actorId:actor,sessionId:session,bytes:JSON.stringify(disposition()),secret:'forbidden'}]) assert.throws(()=>decodeSafetyPending(JSON.stringify(p)));
});
test('late reply after lifecycle invalidation cannot expose private report details',async()=>{
 let release;let entered;const started=new Promise(r=>{entered=r;});const s=setup({send:()=>{entered();return new Promise(r=>{release=r;});}});
 const work=s.c.inspect('reports',rid);await started;s.c.invalidate();release({data:{...base(),kind:'record',record:report()}});await work;
 assert.equal(s.c.view.selected,null);assert.deepEqual(s.c.view.records,[]);assert.equal(s.c.view.object,null);
});
test('account/session switch after dispatch clears sensitive view and journal',async()=>{
 let calls=0;const s=setup({identity:async()=>++calls===1?identity():{...identity(),sessionId:uuid()}});await s.c.execute(disposition());assert.equal(s.c.view.message,'login');assert.equal(s.c.view.selected,null);assert.equal(s.saved(),null);
});
test('wrong operation/body rejected as unknown, server denial erases new journal',async()=>{
 for (const data of [{...terminal(),operationId:uuid()},{...terminal(),record:{...terminal().record,reporterId:actor}}]) {const s=setup({send:async()=>({data})});await s.c.execute(disposition());assert.equal(s.c.view.message,'unknown');assert.ok(s.saved());assert.equal(s.c.view.selected,null);}
 const s=setup({send:async()=>({error:'SAFETY_CONFLICT'})});await s.c.execute(disposition());assert.equal(s.saved(),null);assert.equal(s.c.view.message,'conflict');
});
test('expiry clears previously rendered body and disables stale export',async()=>{
 const object={id,submissionVersion:1,safetyVersion:0,title:'Synthetic title',content:'Private synthetic body',contentKind:'experience',benefitDisclosure:null,authorDisclosure:'unknown',reviewerDisclosure:null,source:'user_experience',copyright:'unknown',visibility:'internal',publiclyVisible:false,retrievalEligible:false,canReport:true,canBlock:true,expiresAt:new Date(Date.now()+600).toISOString()};
 const s=setup({send:async()=>({data:{...base(),kind:'object',object}})});await s.c.execute({action:'object',submissionId:id});assert.equal(s.c.view.object.content,object.content);
 const realNow=Date.now;try {Date.now=()=>realNow()+1000;s.c.expire();assert.equal(s.c.view.object,null);assert.equal(s.c.exportSnapshot(),null);} finally {Date.now=realNow;}
});
test('actual browser transport sends credential headers/no-store and rejects foreign response/session',async()=>{
 const bytes=JSON.stringify(disposition());let calls=0;
 const result=await safetySend(bytes,identity(),new AbortController().signal,async(url,init)=>{calls++;assert.equal(url,'/api/ops/community/safety');assert.equal(init.cache,'no-store');assert.equal(init.credentials,'same-origin');assert.equal(init.headers['x-community-safety-expected-session'],session);assert.equal(init.body,bytes);return Response.json({data:terminal()});});assert.ok(result.data);assert.equal(calls,1);
 assert.equal((await safetySend(bytes,identity(),new AbortController().signal,async()=>Response.json({data:{...terminal(),actorId:uuid()}}))).error,'SAFETY_UNAVAILABLE');
});
