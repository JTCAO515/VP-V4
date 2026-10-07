// Native-owned synthetic consumer fixtures. Every envelope is admitted by the sole TS decoder.
// Run with the fixed TS source root and this Native worktree root; never reads real user data.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const source = resolve(process.argv[2]);
const destination = resolve(process.argv[3], 'ios/VisePanda/VisePandaTests/Fixtures/TurnData');
const read = p => import(pathToFileURL(resolve(source,p)).href);
const f = await read('tests/integration/privacy/turn-data/fixtures.mjs');
const c = await read('lib/server/privacy/turn-data/contract.ts');
const p = await read('lib/server/privacy/turn-data/protocol.ts');
const previewCommand = {action:'preview',...f.selection};
const listCommand = {action:'list',scope:f.selection.scope,cursor:null,limit:20};
const recovery = {action:'recover',...f.selection,mutationBytes:f.bytes};
const unknown = {schemaVersion:c.TURN_SCHEMA,kind:'unknown',...f.selection,...f.actor,requestDigest:c.turnDigest(f.bytes),allUserDataCompleted:false};
const list = {...f.actor,schemaVersion:c.TURN_SCHEMA,kind:'list',scope:f.selection.scope,sourceDigest:'c'.repeat(64),capturedAt:f.now,expiresAt:f.now+30000,
  items:[{turnId:f.selection.turnId,threadId:f.id(7),taskId:f.id(6),createdAt:f.now-200,status:'completed',erased:false}],hasMore:false,nextCursor:null,allUserDataCompleted:false};
const blocked = f.preview(); blocked.conflicts=['CROSS_TURN_REFERENCE'];blocked.eligible=false;
const progressSelection={scope:'turn-delete-progress/1',requestId:f.id(50),turnId:null,objectIds:[f.selection.requestId]};
const progressPreviewCommand={action:'preview',...progressSelection};
const progressCommand={...f.command,...progressSelection};
const progressBytes=JSON.stringify(progressCommand);
const progressPreview={...f.preview(),...progressSelection,boundaries:c.TURN_BOUNDARIES[progressSelection.scope],
 graph:Object.fromEntries(c.GRAPH_KEYS.map(k=>[k,[]])),eraseCounts:f.zero(c.ERASED_KEYS),redactCounts:f.zero(c.REDACTED_KEYS),retainCounts:f.zero(c.RETAINED_KEYS),
 retainedReferences:Object.fromEntries(c.REFERENCE_KEYS.map(k=>[k,[]])),progressCount:1};
const progressReceipt={...f.receipt(),...progressSelection,boundaries:c.TURN_BOUNDARIES[progressSelection.scope],decision:{...f.decision(),
 requestDigest:c.turnDigest(progressBytes),graph:progressPreview.graph,erasedCounts:progressPreview.eraseCounts,redactedCounts:progressPreview.redactCounts,
 retainedCounts:progressPreview.retainCounts,clearedPreviews:1,retainedFences:1,sourceTurn:'not_modified',parentData:'not_modified'}};
const progressList={...list,scope:progressSelection.scope,items:[f.operation()],capturedAt:f.now+40000,expiresAt:f.now+70000};
const outputs={list,preview:f.preview(),'blocked-preview':blocked,receipt:f.receipt(),unknown,'progress-preview':progressPreview,'progress-receipt':progressReceipt,'progress-list':progressList};
assert.ok(c.parseTurnCommand(recovery));assert.equal(recovery.mutationBytes,f.bytes);
assert.ok(p.decodeTurnList(list,listCommand,f.actor,f.now+1));
assert.ok(p.decodeTurnPreview(outputs.preview,previewCommand,f.actor,f.now+1));
assert.ok(p.decodeTurnPreview(blocked,previewCommand,f.actor,f.now+1));
assert.ok(p.decodeTurnReceipt(outputs.receipt,f.command,f.actor,c.turnDigest(f.bytes),f.now+40000));
assert.ok(p.decodeTurnUnknown(unknown,recovery,f.actor,c.turnDigest(f.bytes)));
assert.ok(p.decodeTurnPreview(progressPreview,progressPreviewCommand,f.actor,f.now+1));
assert.ok(p.decodeTurnReceipt(progressReceipt,progressCommand,f.actor,c.turnDigest(progressBytes),f.now+40000));
assert.ok(p.decodeTurnList(progressList,{...listCommand,scope:progressSelection.scope},f.actor,f.now+40001));
await mkdir(destination,{recursive:true});
for(const [name,data] of Object.entries(outputs)) await writeFile(resolve(destination,name+'.json'),JSON.stringify({data},null,2)+'\n');
await writeFile(resolve(destination,'commands.json'),JSON.stringify({synthetic:true,now:f.now,actor:f.actor,previewBytes:JSON.stringify(previewCommand),eraseBytes:f.bytes,
 recoverBytes:JSON.stringify(recovery),listBytes:JSON.stringify(listCommand),progressPreviewBytes:JSON.stringify(progressPreviewCommand),progressEraseBytes:progressBytes,
 progressListBytes:JSON.stringify({...listCommand,scope:progressSelection.scope})},null,2)+'\n');
console.log('Admitted eight synthetic envelopes through the sole TS Turn decoder; exact original mutation bytes retained.');
