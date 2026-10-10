import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {directionsClientActor,directionsClientScope,directionsClientLeaseCurrent,directionsClientPendingCurrent,directionsClientActorChanged} from '../../../../lib/server/planning/directions/client-state.ts';
test('30 second display lease expires, rejects clock rollback and cannot cross actor/session/Trip',()=>{
 const actor=directionsClientActor(uuid(),uuid()),scope=directionsClientScope(actor,uuid()),lease={scopeKey:scope,startedAt:100,deadline:30100};
 assert.equal(directionsClientLeaseCurrent(lease,scope,30099),true);assert.equal(directionsClientLeaseCurrent(lease,scope,30100),false);assert.equal(directionsClientLeaseCurrent(lease,scope,99),false);assert.equal(directionsClientLeaseCurrent(lease,directionsClientScope(actor,uuid()),101),false);assert.equal(directionsClientLeaseCurrent(lease,null,101),false);
});
test('unknown request remains immutable on same actor token refresh, but cannot retry in another Trip/session',()=>{
 const subject=uuid(),session=uuid(),trip=uuid(),actor=directionsClientActor(subject,session),scope=directionsClientScope(actor,trip),pending={scopeKey:scope,sourceKey:'original-source',actorKey:actor,tripId:trip,artifactId:uuid(),revision:1,action:'save',bytes:' {"operationId":"fixed"} '};
 assert.equal(directionsClientActorChanged(actor,directionsClientActor(subject,session)),false);assert.equal(directionsClientPendingCurrent(pending,scope,'original-source'),true);assert.equal(directionsClientPendingCurrent(pending,scope,'different-goal-source'),false);assert.equal(directionsClientPendingCurrent(pending,directionsClientScope(actor,uuid())),false);assert.equal(directionsClientActorChanged(actor,directionsClientActor(subject,uuid())),true);assert.equal(directionsClientActorChanged(actor,null),true);assert.equal(pending.bytes,' {"operationId":"fixed"} ');
});
