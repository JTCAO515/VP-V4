import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevelopmentVerifier,assertVerified} from '../../../lib/server/entitlements/subscription-ledger/verification.ts';
import {developmentLedger} from '../../../lib/server/entitlements/subscription-ledger/persistence.ts';
import {parseSnapshot,closedSnapshot} from '../../../lib/server/entitlements/subscription-ledger/contract.ts';
import {owner,other,now,jws,payload,options} from './fixtures.mjs';
test('injected verifier/readback accepts accelerated Sandbox period and immutable version snapshot',async()=>{
 const c=await createDevelopmentVerifier(options())(jws,owner);
 assert.equal(c.expiresAt,new Date(payload.expiresDate).toISOString());
 assert.equal(Date.parse(c.expiresAt)-Date.parse(c.purchaseAt),300000);
 assert.equal(c.catalogVersion,3);assert.equal(c.capacitySnapshot.period.quantity,80);assert.ok(Object.isFrozen(c.capacitySnapshot.period));assertVerified(c);
 assert.throws(()=>assertVerified({...c}),/UNTRUSTED/);
});
test('renewal and revoked current evidence bind the original family without moving period',async()=>{
 const p={...payload,transactionId:'1002',transactionReason:'RENEWAL'};
 const c=await createDevelopmentVerifier(options(p,{...p,revocationDate:now-2000}))(jws,owner);
 assert.equal(c.originalTransactionId,'1001');assert.equal(c.revokedAt,new Date(now-2000).toISOString());assert.equal(c.purchaseAt,new Date(p.purchaseDate).toISOString());
});
test('closed wire rejects unknown versions states, types, keys and private error fields',()=>{
 const v=closedSnapshot();assert.deepEqual(parseSnapshot(v),v);
 for(const change of [{state:'pending'},{schemaVersion:'subscription-entitlement/2'},{ownerId:owner},{localTest:true},{remainingCapacity:0},{purchaseEnabled:true},{extra:1}]) assert.equal(parseSnapshot({...v,...change}),null);
});
test('read errors and foreign snapshots fail closed; never none or zero',async()=>{
 assert.deepEqual(await developmentLedger().read(owner),closedSnapshot());
 assert.deepEqual(await developmentLedger(async()=>{throw Error('query');}).read(owner),closedSnapshot());
 const foreign={...closedSnapshot(),sourceEnvironment:'Sandbox',ownerId:other,checkedAt:new Date().toISOString(),state:'none'};
 assert.deepEqual(await developmentLedger(async()=>({rows:[{snapshot:foreign}]})).read(owner),closedSnapshot());
});
test('unknown ACK rejects and does not call the writer twice',async()=>{
 const c=await createDevelopmentVerifier(options())(jws,owner);let calls=0;
 const db=developmentLedger(async()=>{calls++;throw Error('connection lost after commit');});
 await assert.rejects(db.apply(c,0),/RECONCILIATION_REQUIRED/);assert.equal(calls,1);
 await assert.rejects(db.apply({...c},0),/UNTRUSTED/);assert.equal(calls,1);
});

test('transport bounded at 8192 UTF8 bytes; active requires bounded server lease, no client calendar',async()=>{
 const {decodeSnapshotText}=await import('../../../lib/server/entitlements/subscription-ledger/contract.ts');
 assert.deepEqual(decodeSnapshotText(JSON.stringify(closedSnapshot())),closedSnapshot());
 assert.equal(decodeSnapshotText(' '.repeat(8193)),null);assert.equal(decodeSnapshotText('😀'.repeat(3000)),null);
 const c=await createDevelopmentVerifier(options())(jws,owner);
 const period={transactionId:c.transactionId,originalTransactionId:c.originalTransactionId,productId:c.productId,subscriptionGroupId:c.subscriptionGroupId,purchaseAt:c.purchaseAt,expiresAt:c.expiresAt,revokedAt:null,descriptorId:`Sandbox:${c.transactionId}`,catalogVersion:3,policyVersion:c.policyVersion};
 const v={...closedSnapshot(),sourceEnvironment:'Sandbox',ownerId:owner,state:'active',checkedAt:new Date(now).toISOString(),lifetimeMs:240000,period};
 assert.ok(parseSnapshot(v));assert.equal(parseSnapshot({...v,lifetimeMs:0}),null);assert.equal(parseSnapshot({...v,lifetimeMs:300001}),null);
 assert.equal(parseSnapshot({...v,state:'expired'}),null);
});
