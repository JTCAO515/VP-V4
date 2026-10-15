import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevelopmentVerifier} from '../../../lib/server/entitlements/subscription-ledger/verification.ts';
import {owner,other,now,jws,payload,options} from '../../contract/subscription-ledger/fixtures.mjs';
test('unconfigured and localTest paths perform zero port/credential/network/write calls',async()=>{
 let calls=0;const o=options();o.ports=new Proxy({}, {get(){calls++;throw Error('port access');}});
 await assert.rejects(createDevelopmentVerifier()(jws,owner),/UNAVAILABLE/);
 await assert.rejects(createDevelopmentVerifier(o)(jws,owner,'localTest'),/UNAVAILABLE/);assert.equal(calls,0);
});
test('both signed sources reject owner, environment, SKU, type, dates, ownership and group mismatch',async()=>{
 const invalid=[{appAccountToken:other},{environment:'Production'},{environment:'Xcode'},{bundleId:'other.app'},{productId:'unknown'},{type:'Non-Renewing Subscription'},
 {quantity:2},{inAppOwnershipType:'FAMILY_SHARED'},{subscriptionGroupIdentifier:'other'},{originalTransactionId:'abc'},{transactionReason:'OTHER'},
 {isUpgraded:true},{purchaseDate:now+1},{expiresDate:payload.purchaseDate},{signedDate:now+1},{signedDate:0},{revocationDate:now+100},{revocationReason:0},{purchaseDate:'123'}];
 for(const change of invalid)for(const side of ['device','current']){
  await assert.rejects(createDevelopmentVerifier(options(side==='device'?{...payload,...change}:payload,side==='current'?{...payload,...change}:payload))(jws,owner));
 }
});
test('readback identity/date/revocation conflicts reject; old observation cannot un-revoke',async()=>{
 for(const change of [{transactionId:'1002'},{originalTransactionId:'1002'},{purchaseDate:payload.purchaseDate-1},{expiresDate:payload.expiresDate+1},{transactionReason:'RENEWAL'},{signedDate:payload.signedDate-1}])
  await assert.rejects(createDevelopmentVerifier(options(payload,{...payload,...change}))(jws,owner),/CONFLICT/);
 await assert.rejects(createDevelopmentVerifier(options({...payload,revocationDate:now-2000},payload))(jws,owner),/CONFLICT/);
});
test('bounded strict JWS, catalog and approved binding reject before verification',async()=>{
 let calls=0;for(const bad of ['', 'a.b.c', 'a'.repeat(20001), '{}']){
  const o=options();o.ports.verify=async()=>{calls++;return payload;};await assert.rejects(createDevelopmentVerifier(o)(bad,owner));
 }assert.equal(calls,0);
 const o=options();await assert.rejects(createDevelopmentVerifier({...o,binding:{...o.binding,approvedProductId:'dev.visepanda.subscription.monthly'}})(jws,owner));
 await assert.rejects(createDevelopmentVerifier({...o,catalog:{...o.catalog,catalogVersion:2}})(jws,owner),/CATALOG/);
});
test('signature rejection and failed or malformed current readback never yield a candidate',async()=>{
 let o=options();o.ports.verify=async()=>{throw Error('signature');};await assert.rejects(createDevelopmentVerifier(o)(jws,owner),/INVALID/);
 o=options();o.ports.readback=async()=>{throw Error('network');};await assert.rejects(createDevelopmentVerifier(o)(jws,owner),/UNAVAILABLE/);
 o=options();o.ports.readback=async()=>'{decoded:true}';await assert.rejects(createDevelopmentVerifier(o)(jws,owner),/UNAVAILABLE/);
});
