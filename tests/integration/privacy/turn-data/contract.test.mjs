import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTurnCommand, turnDigest, TURN_BOUNDARIES, GRAPH_KEYS, ERASED_KEYS, REDACTED_KEYS, RETAINED_KEYS } from '../../../../lib/server/privacy/turn-data/contract.ts';
import { decodeTurnPreview, decodeTurnReceipt, validOperationRow, decodeTurnList } from '../../../../lib/server/privacy/turn-data/protocol.ts';
import { handleTurnData } from '../../../../lib/server/privacy/turn-data/http.ts';
import { turnRecoveryBytes, turnCoverageOutcome } from '../../../../lib/server/privacy/turn-data/coverage.ts';
import { id,now,actor,selection,command,bytes,preview,receipt,operation,zero } from './fixtures.mjs';

test('explicit selected Turn excludes actor injection, parent selection and rewritten recovery',()=>{
  assert.ok(parseTurnCommand(command));
  for(const change of [{ownerId:actor.ownerId},{rootId:id(8)},{turnId:null},{objectIds:[id(8)]},{confirmed:false},{scope:'conversation-sensitive-data/1'}]) assert.equal(parseTurnCommand({...command,...change}),null);
  const recover=JSON.parse(turnRecoveryBytes(bytes));assert.equal(recover.mutationBytes,bytes);assert.ok(parseTurnCommand(recover));
  assert.equal(parseTurnCommand({...recover,turnId:id(90)}),null);
  assert.equal(turnDigest(bytes)===turnDigest(JSON.stringify(command)),false);
});
test('preview is full effect plan, one Turn only and explicit blockers cannot become eligible',()=>{
  assert.ok(decodeTurnPreview(preview(),{action:'preview',...selection},actor,now+1));
  for(const mutate of [v=>v.graph.turnIds.push(id(40)),v=>v.retainCounts.turns=0,v=>v.redactCounts.textBodies=0,v=>v.retainedReferences.taskIds=[],
    v=>v.ownerId=id(90),v=>v.sourceAuthorities=[],v=>v.expiresAt++,v=>v.boundaries.retained.push('unknown'),v=>v.conflicts=['CROSS_TURN_REFERENCE'],v=>v.rawInput='secret']) {
    const v=preview();mutate(v);assert.equal(decodeTurnPreview(v,{action:'preview',...selection},actor,now+1),null);
  }
  const blocked=preview();blocked.conflicts=['CROSS_TURN_REFERENCE'];blocked.eligible=false;assert.ok(decodeTurnPreview(blocked,{action:'preview',...selection},actor,now+1));
  assert.equal(decodeTurnPreview(preview(),{action:'preview',...selection},actor,now+30000),null);
});
test('immutable receipt accurately reports root digest exception and original decision beyond TTL',()=>{
  assert.ok(decodeTurnReceipt(receipt(),command,actor,turnDigest(bytes),now+40000));
  const wrong=receipt();wrong.decision.parentData='not_modified';assert.equal(decodeTurnReceipt(wrong,command,actor,turnDigest(bytes),now+40000),null);
  const preserved=receipt();preserved.decision.redactedCounts.taskDigests=0;preserved.decision.parentData='not_modified';assert.ok(decodeTurnReceipt(preserved,command,actor,turnDigest(bytes),now+40000));
  for(const mutate of [v=>v.decision.decidedAt=now+30000,v=>v.decision.financialData='erased',v=>v.decision.retainedFences++,v=>v.decision.receipt=receipt(),v=>v.decision.erasedCounts.turns=1]) {
    const v=receipt();mutate(v);assert.equal(decodeTurnReceipt(v,command,actor,turnDigest(bytes),now+40000),null);
  }
  assert.equal(decodeTurnReceipt(receipt(),command,actor,turnDigest(JSON.stringify(command)),now+40000),null);
});
test('own finite progress erasure preserves source and immutable decision without recursive receipt/body',()=>{
  const op=operation();assert.ok(validOperationRow(op,actor.ownerId,now+40000));
  assert.equal(validOperationRow({...op,mutationBytes:bytes},actor.ownerId,now+40000),false);
  assert.equal(validOperationRow({...op,decision:{...op.decision,receipt:receipt()}},actor.ownerId,now+40000),false);
  const s={scope:'turn-delete-progress/1',requestId:id(50),turnId:null,objectIds:[op.requestId]},c={...command,...s};
  const r={...receipt(),...s,boundaries:TURN_BOUNDARIES[s.scope],decision:{...receipt().decision,requestDigest:turnDigest(JSON.stringify(c)),graph:Object.fromEntries(GRAPH_KEYS.map(k=>[k,[]])),erasedCounts:zero(ERASED_KEYS),redactedCounts:zero(REDACTED_KEYS),retainedCounts:zero(RETAINED_KEYS),clearedPreviews:1,retainedFences:1,sourceTurn:'not_modified',parentData:'not_modified'}};
  assert.ok(decodeTurnReceipt(r,c,actor,r.decision.requestDigest,now+10));
  const list={...actor,schemaVersion:'turn-data/1',kind:'list',scope:s.scope,sourceDigest:'c'.repeat(64),capturedAt:now+40000,expiresAt:now+70000,items:[op],hasMore:false,nextCursor:null,allUserDataCompleted:false};
  assert.ok(decodeTurnList(list,{action:'list',scope:s.scope,limit:20,cursor:null},actor,now+40001));
  assert.equal(decodeTurnList({...list,items:[op,op]},{action:'list',scope:s.scope,limit:20,cursor:null},actor,now+40001),null);
});
test('HTTP retains exact bytes, maps lost mutation ACK unknown, and recovery never dispatches erase',async()=>{
  const actions=[],raws=[];let loseAck=false,current=true;
  const options={enabled:true,now:()=>now+40000,authority:()=>({authenticate:async()=>actor,current:async()=>current,rpc:async(action,raw)=>{
    actions.push(action);raws.push(raw);if(loseAck)throw Error('secret raw error');return receipt();
  }})};
  const request=body=>new Request('http://localhost/api/privacy/native/v1/turn-data',{method:'POST',headers:{'content-type':'application/json'},body});
  assert.equal((await handleTurnData(request(bytes),options)).status,200);assert.equal(raws[0],bytes);
  loseAck=true;assert.deepEqual(await (await handleTurnData(request(bytes),options)).json(),{error:{code:'TURN_ACK_UNKNOWN'}});
  loseAck=false;assert.equal((await handleTurnData(request(turnRecoveryBytes(bytes)),options)).status,200);assert.deepEqual(actions,['erase','erase','recover']);
  current=false;assert.equal((await handleTurnData(request(bytes),options)).status,401);assert.equal(actions.length,3);
  assert.equal((await handleTurnData(request(bytes),{...options,enabled:false})).status,503);
  const input={actorId:actor.ownerId,sessionId:actor.sessionId,mobileEpoch:actor.mobileEpoch,moduleId:'turn',moduleVersion:'turn-data/1',operationId:selection.requestId,action:'delete',phase:'execute',tripId:null,commandBytes:bytes};
  assert.deepEqual(turnCoverageOutcome({input,command,handler:'turn_data'},receipt(),now+40000),{state:'scoped_complete',reason:'SELECTED_TURN_ERASURE_WITH_DECLARED_RETENTION'});
});
