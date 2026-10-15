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

test('async catalog/binding/ports mutation cannot change the frozen policy or verifier identity',async()=>{
 const o=options();o.catalog=structuredClone(o.catalog);o.binding={...o.binding};let originalCalls=0,foreignCalls=0;
 o.ports.verify=async()=>{originalCalls++;return {...payload};};
 o.ports.readback=async()=>{
  o.catalog.serviceTaskCapacity.subscription.period.quantity=1000;
  o.binding.approvedProductId='swapped';
  o.ports.verify=async()=>{foreignCalls++;return {...payload,productId:'swapped'};};
  return 'b'.repeat(100)+'.dddd.eeee';
 };
 const verify=createDevelopmentVerifier(o);const c=await verify(jws,owner);
 assert.equal(c.capacitySnapshot.period.quantity,80);assert.equal(c.productId,payload.productId);assert.equal(originalCalls,2);assert.equal(foreignCalls,0);
});
test('readback mutation of prior SDK payload cannot make a different requested transaction agree',async()=>{
 const device={...payload},current={...payload,transactionId:'9999'};const o=options(device,current);let requested;
 o.ports.readback=async id=>{requested=id;device.transactionId='9999';return 'b'.repeat(100)+'.dddd.eeee';};
 await assert.rejects(createDevelopmentVerifier(o)(jws,owner),/CONFLICT/);assert.equal(requested,'1001');
});
test('SDK/catalog/ports getters are rejected without executing getter code',async()=>{
 let getters=0,calls=0;const device={...payload};Object.defineProperty(device,'purchaseDate',{get(){getters++;return payload.purchaseDate;},enumerable:true});
 await assert.rejects(createDevelopmentVerifier(options(device,payload))(jws,owner),/INVALID/);
 const o=options();o.catalog=structuredClone(o.catalog);Object.defineProperty(o.catalog.serviceTaskCapacity.subscription.period,'quantity',{get(){getters++;return 80;},enumerable:true});
 await assert.rejects(createDevelopmentVerifier(o)(jws,owner),/UNAVAILABLE/);
 const p=options();Object.defineProperty(p.ports,'verify',{get(){getters++;return async()=>{calls++;return payload;};},enumerable:true});
 await assert.rejects(createDevelopmentVerifier(p)(jws,owner),/UNAVAILABLE/);assert.equal(getters,0);assert.equal(calls,0);
});
test('abort before verification calls zero ports; cancel after first verify never reads Apple',async()=>{
 let calls=0;let controller=new AbortController();controller.abort();const o=options();
 o.ports={now:()=>{calls++;return now;},verify:async()=>{calls++;return payload;},readback:async()=>{calls++;return '';}};
 await assert.rejects(createDevelopmentVerifier(o)(jws,owner,'Sandbox',{signal:controller.signal}),/CANCELLED/);assert.equal(calls,0);
 controller=new AbortController();let reads=0;const p=options();p.ports.verify=async()=>{controller.abort();return payload;};p.ports.readback=async()=>{reads++;return '';};
 await assert.rejects(createDevelopmentVerifier(p)(jws,owner,'Sandbox',{signal:controller.signal}),/INFLIGHT_UNKNOWN/);assert.equal(reads,0);
});
test('late verifier completion after abort never mints or starts readback',async()=>{
 const controller=new AbortController();let resolve,reads=0;const o=options();o.ports.verify=()=>new Promise(r=>{resolve=r;});o.ports.readback=async()=>{reads++;return '';};
 const result=createDevelopmentVerifier(o)(jws,owner,'Sandbox',{signal:controller.signal});
 await new Promise(setImmediate);controller.abort();await assert.rejects(result,/INFLIGHT_UNKNOWN/);
 resolve(payload);await new Promise(setImmediate);assert.equal(reads,0);
});
test('total deadline bounds stalled readback and ignores late completion without candidate',async()=>{
 let resolve,verified=0;const o=options();o.ports.verify=async()=>{verified++;return payload;};o.ports.readback=()=>new Promise(r=>{resolve=r;});
 await assert.rejects(createDevelopmentVerifier(o)(jws,owner,'Sandbox',{timeoutMs:20}),/INFLIGHT_UNKNOWN/);
 resolve('b'.repeat(100)+'.dddd.eeee');await new Promise(setImmediate);assert.equal(verified,1);
});

test('aborting a returned evidence lease refuses persistence before any SQL write',async()=>{
 const {developmentLedger}=await import('../../../lib/server/entitlements/subscription-ledger/persistence.ts');
 const controller=new AbortController();const candidate=await createDevelopmentVerifier(options())(jws,owner,'Sandbox',{signal:controller.signal});controller.abort();let queries=0;
 await assert.rejects(developmentLedger(async()=>{queries++;return {rows:[]};}).apply(candidate,0),/CANCELLED/);assert.equal(queries,0);
});
