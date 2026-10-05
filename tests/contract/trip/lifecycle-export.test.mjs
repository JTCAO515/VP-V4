import test from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleExportSource } from '../../../lib/server/trip/lifecycle/export.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const lease={requestId:id(1),ownerId:id(2),leaseId:id(3),generation:1,expiresAt:new Date(Date.now()+60000).toISOString()};
const binding={requestId:lease.requestId,leaseId:lease.leaseId,generation:1};
const enrollment={schemaVersion:'trip-lifecycle-export/2',...binding,sourceRevision:4,enrolled:true};
const lifecycle={tripId:id(4),title:'Saved',headVersion:1,state:'archived',archivedVersion:1,archivedAt:'2026-10-05T01:00:00Z'};
const trip={tripId:id(4),title:'Saved',headVersion:1,confirmationState:'confirmed',content:{days:[]},lifecycle};
const operation={operationId:id(5),sessionId:null,receipt:null,erasedReason:'MEMORY_CONFLICT'};
const page=(section,items)=>({schemaVersion:'trip-lifecycle-export/2',...binding,sourceRevision:4,section,items,hasMore:false,nextCursor:null,sectionComplete:true});
const proof={schemaVersion:'trip-lifecycle-export-proof/2',...binding,sourceRevision:4,coverage:'complete',pages:2,rows:2};
const signal=new AbortController().signal;
test('v2 handler does not enroll old jobs implicitly and requires both actual source traversals',async()=>{
 const calls=[];const source=lifecycleExportSource(lease,async(action,input)=>{calls.push([action,input]);return action==='enroll'?enrollment:action==='page'?page(input.section,input.section==='trips'?[trip]:[operation]):proof;});
 assert.equal(await source.proof(signal),'partial');assert.deepEqual(calls,[]);
 await assert.rejects(()=>source.page('trips',null,50,signal),/unavailable/);
 await source.enroll(signal);assert.deepEqual(calls[0],['enroll',binding]);
 await assert.rejects(()=>source.proof(signal),/unavailable/,'source-complete claim cannot precede local traversal');
 assert.equal((await source.page('trips',null,50,signal)).items[0].lifecycle.state,'archived');
 assert.equal((await source.page('operations',null,50,signal)).items[0].sessionId,null,'erased tombstone retains no session');
 assert.equal(await source.proof(signal),'complete','source traversal only, not artifact assembly/delivery');
 await assert.rejects(()=>source.page('trips',null,50,signal),/unavailable/);
});
test('v2 export rejects wrong lease, mixed source, leaked raw bytes and stale coverage',async()=>{
 for(const fault of ['lease','source','private','session']){
  const source=lifecycleExportSource(lease,async(action,input)=>{
   if(action==='enroll')return enrollment;
   const value=page(input.section,input.section==='trips'?[trip]:[operation]);
   if(fault==='lease')return {...value,leaseId:id(9)};
   if(fault==='source')return {...value,sourceRevision:5};
   if(fault==='private')return {...value,items:[{...operation,request_bytes:'private'}]};
   return {...value,items:[{...operation,sessionId:id(10)}]};
  });
  await source.enroll(signal);await assert.rejects(()=>source.page('operations',null,10,signal),/unavailable/,fault);
 }
 const changed=lifecycleExportSource(lease,async action=>action==='enroll'?enrollment:{schemaVersion:'trip-lifecycle-export-proof/2',...binding,coverage:'partial',reason:'NOT_ENROLLED_OR_SOURCE_CHANGED'});
 await changed.enroll(signal);assert.equal(await changed.proof(signal),'partial');
});
