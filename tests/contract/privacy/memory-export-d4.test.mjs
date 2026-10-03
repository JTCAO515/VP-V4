import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {memoryExportHandler,MEMORY_EXPORT_SECTIONS} from '../../../lib/server/privacy/export-memory.ts';
const id=randomUUID(),consent=randomUUID(),receipt=randomUUID(),at='2026-10-03T00:00:00.000Z';
const lease={requestId:randomUUID(),leaseId:randomUUID(),ownerId:randomUUID(),generation:1,expiresAt:'2026-10-03T00:01:00.000Z'};
const row={memoryId:id,revision:1,state:'explicit',constraintKind:'preference',summary:'用户保存的摘要',sourceReceiptId:receipt,consentId:consent,consentStatus:'granted',createdAt:at,updatedAt:at};
const page=(section,items=[],rev=1)=>({schemaVersion:'memory-core-export/1',section,sourceRevision:rev,items,hasMore:false,nextCursor:null,sectionComplete:true});
test('Memory consumer uses exact job lease and6 sections without caller owner or raw cache fields',async()=>{
 const calls=[],handler=memoryExportHandler(lease,async(action,input)=>{calls.push({action,input});return page(input.section,input.section==='profiles'?[row]:[]);});
 for(const section of MEMORY_EXPORT_SECTIONS)await handler.page(section,null,100,new AbortController().signal);
 assert.equal(calls.length,6);assert.deepEqual(handler.progress(),{pages:6,rows:1,terminalSections:6});await handler.page('profiles',null,100,new AbortController().signal);assert.deepEqual(handler.progress(),{pages:6,rows:1,terminalSections:6});assert.ok(calls.every(c=>c.action==='memory_page'&&c.input.requestId===lease.requestId&&c.input.leaseId===lease.leaseId&&c.input.generation===1&&!('ownerId'in c.input)&&!('sourceRevision'in c.input)));
});
test('deleted/revoked text, raw preimage/receipt and changed source revision fail closed',async()=>{
 for(const bad of [{...row,state:'deleted'},{...row,consentStatus:'revoked'},{...row,prior_summary:'hidden'},{...row,input_digest:'secret'}]){
  const handler=memoryExportHandler(lease,async()=>page('profiles',[bad]));await assert.rejects(()=>handler.page('profiles',null,100,new AbortController().signal));
 }
 let revision=1;const handler=memoryExportHandler(lease,async(_a,input)=>page(input.section,[],revision));
 await handler.page('profiles',null,100,new AbortController().signal);revision=2;
 await assert.rejects(()=>handler.page('consents',null,100,new AbortController().signal));
});
test('revoked/deleted tombstone export remains null; unavailable authority never becomes empty success',async()=>{
 const handler=memoryExportHandler(lease,async()=>page('profiles',[{...row,state:'deleted',summary:null}]));
 assert.equal((await handler.page('profiles',null,100,new AbortController().signal)).items[0].summary,null);
 const closed=memoryExportHandler(lease,async()=>({kind:'unavailable'}));await assert.rejects(()=>closed.page('profiles',null,100,new AbortController().signal));
});
