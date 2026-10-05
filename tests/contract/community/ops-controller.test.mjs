import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {CommunityOpsController,decodePendingReview} from '../../../app/ops/community/controller.ts';
const identity={actorId:randomUUID(),sessionId:randomUUID(),expiresAt:Date.now()+600000},id=randomUUID();
const item={id,title:'Synthetic',content:'Internal text',contentKind:'help',benefitDisclosure:'',authorDisclosure:'unknown',reviewerDisclosure:null,status:'pending',version:1,createdAt:'2026-10-05T12:00:00Z',reviewedAt:null,withdrawnAt:null,reviewNote:null,place:null,history:[],visibility:'internal',publiclyVisible:false,retrievalEligible:false};
const base={schemaVersion:'community-j1/1',actorId:identity.actorId,sessionId:identity.sessionId};
function fixture(change={}) {
 let stored=null;const sent=[];let actor=identity;
 const deps={identity:async()=>actor,read:()=>stored,write:p=>{stored=p;},erase:()=>{stored=null;},changed:()=>{},send:async bytes=>{sent.push(bytes);const c=JSON.parse(bytes);return {data:c.action==='inspect'?{...base,kind:'item',submission:item}:c.action==='queue'?{...base,kind:'page',submissions:[item],nextCursor:null,complete:true}:{...base,kind:'operation',operationId:c.operationId,state:'committed',submission:{...item,status:'rejected',version:2,reviewedAt:'2026-10-05T12:01:00Z',reviewNote:'Visible reason',reviewerDisclosure:'unknown'}}};},...change};
 const controller=new CommunityOpsController(deps);return {controller,deps,sent,stored:()=>stored,actor:v=>{actor=v;}};
}
test('actual Ops consumer saves exact operation before send and resolves current result',async()=>{
 const f=fixture();await f.controller.inspect(id);const old=f.deps.send;
 f.deps.send=async(...args)=>{assert.equal(f.stored().bytes,args[0]);return old(...args);};
 await f.controller.review('reject','Visible reason');assert.equal(f.controller.view.selected.status,'rejected');assert.equal(f.stored(),null);assert.equal(f.sent.length,2);
});
test('storage failure prevents dispatch, unknown result forbids a new operation and original retry uses frozen bytes',async()=>{
 const storage=fixture({write:()=>{throw Error('storage');}});await storage.controller.inspect(id);await storage.controller.review('approve','Note');assert.equal(storage.sent.length,1);assert.equal(storage.controller.view.message,'storage');
 const f=fixture();await f.controller.inspect(id);f.deps.send=async bytes=>{f.sent.push(bytes);throw Error('ack lost');};await f.controller.review('reject','Note');const bytes=f.stored().bytes;assert.equal(f.controller.view.message,'unknown');
 await f.controller.review('approve','different');assert.equal(f.sent.length,2);
 f.deps.send=async wire=>{assert.equal(wire,bytes);return {data:{...base,kind:'operation',operationId:JSON.parse(bytes).operationId,state:'committed',submission:{...item,status:'withdrawn',version:2,title:'',content:'',benefitDisclosure:null,place:null,withdrawnAt:'2026-10-05T12:01:00Z'}}};};
 await f.controller.retry();assert.equal(f.controller.view.selected.content,'');assert.equal(f.stored(),null);
});
test('status absent retains original journal; terminal abandon closes without second review',async()=>{
 const f=fixture();await f.controller.inspect(id);f.deps.send=async()=>({error:'COMMUNITY_ACK_UNKNOWN'});await f.controller.review('approve','Note');const original=f.stored().bytes;
 f.deps.send=async wire=>{const c=JSON.parse(wire);assert.equal(c.mutationBytes,original);return {data:{...base,kind:'operation',operationId:c.operationId,state:c.action==='operation'?'absent':'abandoned',submission:null}};};
 await f.controller.resolve('operation');assert.equal(f.stored().bytes,original);await f.controller.resolve('abandon');assert.equal(f.stored(),null);assert.equal(f.controller.view.pending,null);
});
test('scope replacement and lifecycle invalidate fence delayed private results and clear local raw notes on signout',async()=>{
 let release;const f=fixture({send:()=>new Promise(r=>{release=r;})});const pending=f.controller.inspect(id);await new Promise(r=>setImmediate(r));f.controller.invalidate();release({data:{...base,kind:'item',submission:item}});await pending;assert.equal(f.controller.view.selected,null);
 f.deps.send=async()=>({data:{...base,kind:'item',submission:item}});await f.controller.inspect(id);f.deps.send=async()=>({error:'COMMUNITY_ACK_UNKNOWN'});await f.controller.review('approve','Private reason');assert.ok(f.stored());f.controller.invalidate(true);assert.equal(f.stored(),null);assert.equal(f.controller.view.pending,null);
});
test('wrong actor pending cannot replay and journal parser fails closed instead of guessing',async()=>{
 assert.throws(()=>decodePendingReview('{}'));assert.throws(()=>decodePendingReview(JSON.stringify({actorId:identity.actorId,sessionId:identity.sessionId,bytes:JSON.stringify({action:'submit'})})));
 const f=fixture();await f.controller.inspect(id);f.deps.send=async()=>({error:'COMMUNITY_ACK_UNKNOWN'});await f.controller.review('approve','Note');f.actor({...identity,sessionId:randomUUID()});await f.controller.retry();assert.equal(f.stored(),null);assert.equal(f.controller.view.message,'login');
});
