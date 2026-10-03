import test from 'node:test';import assert from 'node:assert/strict';
import {memoryDeleteCommand,memoryDeleteSelection,memoryDeletePlan,memoryDeleteReceipt,selectionEqual} from '../../../lib/server/privacy/memory-delete/contract.ts';
import {createMemoryDeletionWorker} from '../../../lib/server/privacy/memory-delete/server-worker.ts';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const retained=['FINANCIAL_RECORDS','USER_TRIP_INTENT','ORIGINAL_CHAT_INPUT','EXTERNAL_COPIES','PROVIDER_ERASURE_UNKNOWN','BACKUP_ERASURE_NOT_VERIFIED'];
const selection={memories:[{memoryId:id(1),revision:2,sourceReceiptId:id(2)}],consumerReferenceIds:[],artifactIds:[],generatedTurnIds:[],exportRequestIds:[]};
const plan={kind:'memory_delete_plan/1',planId:id(3),sourceRevision:20,scopeDigest:'a'.repeat(64),expiresAt:'2026-10-03T23:00:00.000Z',selection,counts:{memories:1,consumerReferences:0,artifacts:0,generatedTurns:0,exports:0},conflicts:[],retained};
const receipt={kind:'memory_delete_receipt/1',requestId:id(4),planId:id(3),scope:'memory-bulk-delete-d4/1',scopeDigest:'a'.repeat(64),state:'queued',sourceTombstoned:true,cleanupPending:true,requestedAt:'2026-10-03T22:00:00.000Z',completedAt:null,selection,deletedRevisions:[{memoryId:id(1),revision:3}],erasedCounts:null,allUserDataCompleted:false,retained};
test('closed codec verifies counts, tombstone revisions, no fabricated completion and canonical selection',()=>{
 assert.equal(memoryDeleteCommand({action:'preview',memoryIds:[id(1)]}),true);assert.equal(memoryDeleteCommand({action:'preview',memoryIds:[id(1),id(1)]}),false);assert.equal(memoryDeleteCommand({action:'preview',memoryIds:[id(1)],ownerId:id(5)}),false);
 assert.equal(memoryDeleteSelection(selection),true);assert.equal(memoryDeletePlan(plan),true);assert.equal(memoryDeletePlan({...plan,counts:{...plan.counts,artifacts:1}}),false);assert.equal(memoryDeletePlan({...plan,expiresAt:'2026-99-99T00:00:00.000Z'}),false);
 assert.equal(memoryDeleteReceipt(receipt),true);assert.equal(memoryDeleteReceipt({...receipt,state:'completed'}),false);assert.equal(memoryDeleteReceipt({...receipt,deletedRevisions:[{memoryId:id(1),revision:2}]}),false);
 const c={...receipt,state:'completed',cleanupPending:false,completedAt:'2026-10-03T22:01:00.000Z',erasedCounts:{consumerReferences:0,artifacts:0,generatedOutputs:0,exports:0,tickets:0}};assert.equal(memoryDeleteReceipt(c),true);assert.equal(memoryDeleteReceipt({...c,allUserDataCompleted:true}),false);assert.equal(selectionEqual(selection,{exportRequestIds:[],generatedTurnIds:[],artifactIds:[],consumerReferenceIds:[],memories:[{revision:2,sourceReceiptId:id(2),memoryId:id(1)}]}),true);
});
test('one-shot default and production/wrong target execute zero credential or RPC',async()=>{
 const deps={credential:()=>assert.fail('unexpected secret access'),fetcher:()=>assert.fail('unexpected RPC')};
 assert.equal(await createMemoryDeletionWorker({environment:'local',databaseUrl:'http://127.0.0.1:1234'},deps)(id(4),new AbortController().signal),'disabled');
 for(const databaseUrl of ['https://production.example','https://dzqdzetcctkhbrhlxxgn.supabase.co.evil','http://localhost:1234'])assert.equal(await createMemoryDeletionWorker({enabled:true,environment:'staging',databaseUrl},deps)(id(4),new AbortController().signal),'blocked');
});
