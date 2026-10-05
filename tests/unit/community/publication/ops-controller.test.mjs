import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {PublicationOpsController} from '../../../../app/ops/community/publication/controller.ts';
import {PUBLICATION_SCHEMA} from '../../../../lib/server/community/publication/contract.ts';
import {SAFETY_SCHEMA} from '../../../../lib/server/community/safety/contract.ts';
const actor=uuid(),session=uuid(),id=uuid(),source=uuid();
const identity=()=>({actorId:actor,sessionId:session,expiresAt:Date.now()+120000});
const pub=(state='pending_rights')=>({id,submissionId:source,submissionVersion:2,safetyVersion:0,version:state==='pending_rights'?1:state==='rights_approved'?2:3,state,rightsDeclaration:'own-text-v1',rightsNote:state==='pending_rights'?null:'Synthetic reviewer verified own text',createdAt:'2026-10-06T00:00:00Z',publishedAt:state==='published'?'2026-10-06T00:01:00Z':null,endedAt:null,audience:'controlled_registered',publiclyVisible:false,retrievalEligible:false});
const object=()=>({id:source,submissionVersion:2,safetyVersion:0,title:'Synthetic owned content',content:'Synthetic current text',contentKind:'experience',benefitDisclosure:'',authorDisclosure:'unknown',reviewerDisclosure:'unknown',source:'user_experience',copyright:'unknown',visibility:'internal',publiclyVisible:false,retrievalEligible:false,canReport:true,canBlock:true,expiresAt:new Date(Date.now()+29000).toISOString()});
const b=()=>({schemaVersion:PUBLICATION_SCHEMA,actorId:actor,sessionId:session});
function fixture(overrides={}) {let pending=null;const calls=[];let changed=[];const deps={identity:async()=>identity(),send:async(bytes)=>{const c=JSON.parse(bytes);calls.push(c);return {data:{...b(),kind:'publication',publication:pub()}};},source:async()=>({schemaVersion:SAFETY_SCHEMA,actorId:actor,sessionId:session,kind:'object',object:object()}),read:()=>pending,write:p=>{pending=p;},erase:()=>{pending=null;},changed:v=>changed.push(v),...overrides};const controller=new PublicationOpsController(deps);return {controller,deps,calls,pending:()=>pending,changed:()=>changed};}
test('Ops cannot blind approve a publication record or publish without current lawful source',async()=>{
 const f=fixture();await f.controller.execute({action:'inspect',publicationId:id});assert.equal(f.controller.view.selected.id,id);
 await f.controller.decide('approve','Synthetic basis');assert.equal(f.calls.length,1);
 await f.controller.inspectSource();assert.equal(f.controller.view.source.content,'Synthetic current text');
 f.deps.send=async(bytes)=>{const c=JSON.parse(bytes);f.calls.push(c);return {data:{...b(),kind:'operation',operationId:c.operationId,state:'committed',publication:pub('rights_approved'),reference:null}};};
 await f.controller.decide('approve','Verified own text');assert.equal(f.calls[1].expectedSubmissionVersion,2);assert.equal(f.calls[1].expectedSafetyVersion,0);assert.equal(f.controller.view.source,null);
 await f.controller.publish();assert.equal(f.calls.length,2);
 await f.controller.inspectSource();await f.controller.publish();assert.equal(f.calls.at(-1).action,'publish');
});
test('lawful source binding rejects replacement revision, foreign session and expired content',async()=>{
 for(const replacement of [{...object(),id:uuid()},{...object(),safetyVersion:1},{...object(),submissionVersion:3},{...object(),expiresAt:new Date(Date.now()-1).toISOString()}]) {
  const f=fixture({source:async()=>({schemaVersion:SAFETY_SCHEMA,actorId:actor,sessionId:session,kind:'object',object:replacement})});await f.controller.execute({action:'inspect',publicationId:id});await f.controller.inspectSource();assert.equal(f.controller.view.source,null);assert.equal(f.controller.view.selected,null);await f.controller.decide('approve','Synthetic note');assert.equal(f.calls.length,1);
 }
});
test('unknown mutation retry denial retains journal until exact operation is resolved',async()=>{
 const f=fixture();await f.controller.execute({action:'inspect',publicationId:id});await f.controller.inspectSource();
 f.deps.send=async()=>{throw Error('Lost ACK');};await f.controller.decide('approve','Synthetic rights basis');const bytes=f.pending().bytes;assert.equal(f.controller.view.message,'unknown');
 f.deps.send=async()=>({error:'PUBLICATION_FORBIDDEN'});await f.controller.retry();assert.equal(f.pending().bytes,bytes);assert.equal(f.controller.view.message,'unknown');
 f.deps.send=async(raw)=>{const c=JSON.parse(raw);assert.equal(c.mutationBytes,bytes);return {data:{...b(),kind:'operation',operationId:c.operationId,state:'committed',publication:pub('rights_approved'),reference:null}};};
 await f.controller.resolve('operation');assert.equal(f.pending(),null);assert.equal(f.controller.view.selected.state,'rights_approved');
});
test('storage failure prevents mutation dispatch and lifecycle fences a late source reply',async()=>{
 const f=fixture({write:()=>{throw Error('Storage unavailable');}});await f.controller.execute({action:'inspect',publicationId:id});await f.controller.inspectSource();await f.controller.decide('approve','Synthetic basis');assert.equal(f.calls.length,1);assert.equal(f.controller.view.message,'storage');
 let resolve;const g=fixture({source:()=>new Promise(r=>{resolve=r;})});await g.controller.execute({action:'inspect',publicationId:id});const work=g.controller.inspectSource();await new Promise(r=>setTimeout(r,0));g.controller.invalidate();resolve({schemaVersion:SAFETY_SCHEMA,actorId:actor,sessionId:session,kind:'object',object:object()});await work;assert.equal(g.controller.view.source,null);assert.equal(g.controller.view.selected,null);
});
test('account switch discards owned pending bytes and pre-source identity failure hides prior record',async()=>{
 const f=fixture();await f.controller.execute({action:'inspect',publicationId:id});f.deps.identity=async()=>({...identity(),sessionId:uuid()});await f.controller.inspectSource();assert.equal(f.controller.view.selected,null);assert.equal(f.controller.view.source,null);
});
