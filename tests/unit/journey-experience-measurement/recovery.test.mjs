import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA, PURPOSE, TTL } from '../../../lib/server/journey-entry/experience-measurement/contract.ts';
import { acquireMeasurementRecovery, reconcileMeasurementRecovery, recoveryIntegrity, CONTROL_ROWS } from '../../../lib/server/privacy/experience-measurement/recovery.ts';
import { eraseMeasurementControlScope } from '../../../lib/server/privacy/experience-measurement/control-erasure.ts';
import { measurementCoreRecoveryAdapter } from '../../../lib/server/privacy/experience-measurement/core-adapter.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now=1791780000000;
const sig=()=>new AbortController().signal;
const zero=()=>Object.fromEntries(CONTROL_ROWS.map(k=>[k,0]));
const ctx=()=>({schemaVersion:SCHEMA,purpose:PURPOSE,kind:'measurement_recovery_context',requestId:id(1),leaseId:id(2),generation:3,ownerId:id(4),scope:SCHEMA,
  mode:'scoped_restore',source:{kind:'synthetic_fixture',sourceId:id(5),instanceId:id(6)},targetInstanceId:id(7),layoutDigest:'a'.repeat(64),pinsDigest:'b'.repeat(64),
  backupCutoffAt:now-5000,capturedAt:now-20,expiresAt:now+2000,barrier:{kind:'writers_quiesced',barrierId:id(8),generation:3,closedAt:now-30,expiresAt:now+2000}});
function frame(c,r){const v={schemaVersion:SCHEMA,purpose:PURPOSE,kind:'measurement_recovery_journal',...r,ownerId:c.ownerId,scope:SCHEMA,source:structuredClone(c.source),
  targetInstanceId:c.targetInstanceId,layoutDigest:c.layoutDigest,pinsDigest:c.pinsDigest,reconciliationGeneration:c.generation,journalId:id(9),floor:4,
  cutoffAt:c.backupCutoffAt,coveredFromAt:now-5000,coveredThroughAt:c.barrier.closedAt,barrierId:c.barrier.barrierId,capturedAt:now-10,expiresAt:now+1500,
  authorityReceivedAt:now-1000,retainedUntil:now-1000+TTL,coverage:{withdrawals:'complete',erasures:'complete',sourceExpiry:'complete',copies:'complete'},
  inventory:{...zero(),consents:1,admissions:2,reports:3,erasureReceipts:1,recoveryControls:1,journals:1},copies:[],authorityInventoryDigest:'c'.repeat(64),
  sourceSeal:{kind:'source_obtained',sealId:id(10),digest:'d'.repeat(64)}};return {...v,integrityDigest:recoveryIntegrity(v)};}
const reseal=v=>{const {integrityDigest,...unsigned}=v;return {...unsigned,integrityDigest:recoveryIntegrity(unsigned)};};
function harness({contextChange,frameChange,authenticate=true,currentChange,reconcileChange}={}){
  const c=ctx();contextChange?.(c);const calls={open:0,issue:0,authenticate:0,current:0,reconcile:0};
  const adapter={open:async request=>{calls.open++;assert.equal(request,c.requestId);return c;},
    issue:async r=>{calls.issue++;assert.deepEqual(Object.keys(r).sort(),['acquisitionId','challenge','generation','leaseId','requestId']);let v=frame(c,r);frameChange?.(v);return reseal(v);},
    authenticate:async()=>{calls.authenticate++;return authenticate;},
    current:async expected=>{calls.current++;const v={schemaVersion:SCHEMA,purpose:PURPOSE,kind:'measurement_recovery_current',requestId:c.requestId,leaseId:c.leaseId,generation:c.generation,
      ownerId:c.ownerId,scope:SCHEMA,source:structuredClone(c.source),targetInstanceId:c.targetInstanceId,layoutDigest:c.layoutDigest,pinsDigest:c.pinsDigest,
      barrierId:c.barrier.barrierId,coveredThroughAt:c.barrier.closedAt,expiresAt:c.expiresAt,state:'current'};currentChange?.(v,calls.current);return v;},
    reconcile:async(expected,f)=>{calls.reconcile++;const v={schemaVersion:SCHEMA,purpose:PURPOSE,kind:'measurement_recovery_reconciliation',requestId:c.requestId,leaseId:c.leaseId,generation:c.generation,
      ownerId:c.ownerId,scope:SCHEMA,sourceId:f.source.sourceId,targetInstanceId:c.targetInstanceId,journalId:f.journalId,acquisitionId:f.acquisitionId,reconciliationGeneration:f.reconciliationGeneration,
      layoutDigest:c.layoutDigest,pinsDigest:c.pinsDigest,barrierId:f.barrierId,floor:f.floor,authorityInventoryDigest:f.authorityInventoryDigest,integrityDigest:f.integrityDigest,
      expiresAt:f.expiresAt,state:'reconciled',copies:{state:'acknowledged',obligations:f.copies.length,acknowledged:f.copies.length}};reconcileChange?.(v);return v;}};
  return {adapter,calls,c};
}

test('missing adapter/raw deserialized journal cannot authorize reconciliation or collection',async()=>{
  assert.equal(await acquireMeasurementRecovery(id(1),null,sig(),()=>now),null);
  for(const value of [null,{kind:'measurement_acquired_recovery',acquisitionId:id(55)},frame(ctx(),{requestId:id(1),leaseId:id(2),generation:3,acquisitionId:id(56),challenge:id(57)})]){
    const result=await reconcileMeasurementRecovery(value,sig(),()=>now);assert.equal(result.state,'denied');assert.equal(result.collectionEligible,false);
  }
});
test('controlled synthetic Core acquisition binds independent frame and one-use handle; never live/whole lifecycle evidence',async()=>{
  const h=harness(),acquired=await acquireMeasurementRecovery(id(1),h.adapter,sig(),()=>now);assert.ok(acquired);
  const result=await reconcileMeasurementRecovery(acquired,sig(),()=>now);assert.deepEqual(result,{state:'synthetic_qualified',measurementSourceQualified:true,collectionEligible:false,wholeLifecycleComplete:false});
  assert.equal((await reconcileMeasurementRecovery(acquired,sig(),()=>now)).state,'denied');assert.equal(h.calls.reconcile,1);
  assert.equal((await reconcileMeasurementRecovery(JSON.parse(JSON.stringify(acquired)),sig(),()=>now)).state,'denied');
});
test('whole-database/same-restored-instance/unknown provenance/lease/barrier rejects before issuer',async()=>{
  for(const mutate of [c=>c.mode='whole_database',c=>c.source.instanceId=c.targetInstanceId,c=>c.source.kind='restored_control_table',
    c=>c.scope='profile-sensitive-data/1',c=>c.ownerId='not-owner',c=>c.expiresAt=now,c=>c.barrier.kind='config_enabled',c=>c.barrier.generation++,c=>delete c.barrier]){
    const h=harness({contextChange:mutate});assert.equal(await acquireMeasurementRecovery(id(1),h.adapter,sig(),()=>now),null);assert.equal(h.calls.issue,0);assert.equal(h.calls.reconcile,0);
  }
});
test('valid metadata hash/source-looking seal without actual protected source authentication denies',async()=>{
  const h=harness({authenticate:false});assert.equal(await acquireMeasurementRecovery(id(1),h.adapter,sig(),()=>now),null);assert.equal(h.calls.authenticate,1);assert.equal(h.calls.reconcile,0);
});
test('foreign/layout/pin/floor generation/nonce/expiry/unknown coverage and old forgotten window deny even rehashed',async()=>{
  for(const mutate of [f=>f.ownerId=id(99),f=>f.source.sourceId=id(99),f=>f.layoutDigest='f'.repeat(64),f=>f.pinsDigest='f'.repeat(64),f=>f.reconciliationGeneration++,
    f=>f.challenge=id(99),f=>f.acquisitionId=id(99),f=>f.expiresAt=now,f=>f.coveredThroughAt=now-40,f=>f.coverage.erasures='partial',f=>f.coverage.sourceExpiry='unknown',
    f=>f.coveredFromAt=now-TTL-1,f=>f.retainedUntil=f.authorityReceivedAt+TTL+1,f=>f.sourceSeal.kind='client_sealed',f=>f.inventory.reports=10001,
    f=>f.sourceBody='private text',f=>delete f.authorityInventoryDigest]){
    const h=harness({frameChange:mutate});assert.equal(await acquireMeasurementRecovery(id(1),h.adapter,sig(),()=>now),null);assert.equal(h.calls.reconcile,0);
  }
});
test('unacknowledged copy or omitted copy inventory prevents restore qualification',async()=>{
  for(const mutate of [f=>{f.copies=[{copyId:id(20),executorId:null,ackId:null,state:'unknown',authorityReceivedAt:now-100,expiresAt:now+1000}];f.inventory.copyObligations=1;},
    f=>{f.inventory.copyObligations=1;},f=>{f.coverage.copies='unknown';}]){
    const h=harness({frameChange:mutate});assert.equal(await acquireMeasurementRecovery(id(1),h.adapter,sig(),()=>now),null);assert.equal(h.calls.reconcile,0);
  }
});
test('latest barrier is rechecked before and after target reconciliation; stale/foreign ACK stays denied',async()=>{
  for(const mutate of [v=>v.ownerId=id(99),v=>v.floor=0,v=>v.reconciliationGeneration++,v=>v.authorityInventoryDigest='f'.repeat(64),v=>v.copies.state='unknown',v=>v.state='denied']){
    const h=harness({reconcileChange:mutate});const acquired=await acquireMeasurementRecovery(id(1),h.adapter,sig(),()=>now);assert.ok(acquired);
    assert.equal((await reconcileMeasurementRecovery(acquired,sig(),()=>now)).state,'denied');assert.equal(h.calls.reconcile,1);
  }
  for(const changeAt of [2,3]){const h=harness({currentChange:(v,n)=>{if(n>=changeAt)v.generation++;}});const acquired=await acquireMeasurementRecovery(id(1),h.adapter,sig(),()=>now);assert.ok(acquired);
    assert.equal((await reconcileMeasurementRecovery(acquired,sig(),()=>now)).state,'denied');assert.equal(h.calls.reconcile,changeAt===2?0:1);}
});
test('expired acquired handle and lost/unknown target ACK deny with no effect retry',async()=>{
  const h=harness();const acquired=await acquireMeasurementRecovery(id(1),h.adapter,sig(),()=>now);assert.ok(acquired);
  assert.equal((await reconcileMeasurementRecovery(acquired,sig(),()=>now+2000)).state,'denied');assert.equal(h.calls.reconcile,0);
  const lost=harness();lost.adapter.reconcile=async()=>{lost.calls.reconcile++;throw Error('private raw transport failure');};const second=await acquireMeasurementRecovery(id(1),lost.adapter,sig(),()=>now);
  assert.equal((await reconcileMeasurementRecovery(second,sig(),()=>now)).state,'denied');assert.equal((await reconcileMeasurementRecovery(second,sig(),()=>now)).state,'denied');assert.equal(lost.calls.reconcile,1);
});
test('acquired metadata entry expires automatically even while an opaque handle remains referenced',async()=>{
  const h=harness({contextChange:c=>c.expiresAt=now+50,frameChange:f=>f.expiresAt=now+5});
  const acquired=await acquireMeasurementRecovery(id(1),h.adapter,sig(),()=>now);assert.ok(acquired);
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal((await reconcileMeasurementRecovery(acquired,sig(),()=>now)).state,'denied');assert.equal(h.calls.reconcile,0);
});
test('adapter argument mutation cannot rewrite captured owner/source/floor or upgrade synthetic frame',async()=>{
  const h=harness();h.adapter.authenticate=async(c,f)=>{c.ownerId=id(99);f.floor=0;f.source.kind='protected_live';return true;};
  const acquired=await acquireMeasurementRecovery(id(1),h.adapter,sig(),()=>now);assert.ok(acquired);
  const result=await reconcileMeasurementRecovery(acquired,sig(),()=>now);assert.equal(result.state,'synthetic_qualified');assert.equal(result.collectionEligible,false);
});
test('original Core bridge cannot be enabled by a missing verifier, config boolean or ordinary RPC allowed:true',async()=>{
  let calls=0;const domain=async()=>{calls++;return {allowed:true};};
  assert.equal(measurementCoreRecoveryAdapter(domain,null),null);
  assert.equal(measurementCoreRecoveryAdapter(domain,{verifyOrigin:true,verifySeal:true}),null);assert.equal(calls,0);
  const bridge=measurementCoreRecoveryAdapter(domain,{verifyOrigin:async()=>true,verifySeal:async()=>true});
  assert.equal(await acquireMeasurementRecovery(id(1),bridge,sig(),()=>now),null);assert.equal(calls,1);
});
test('concrete original Core bridge sends only leased request metadata and delegates origin/seal proof outside RPC flags',async()=>{
  const h=harness(),actions=[];let origin=0,seal=0;
  const domain=async(action,input,signal)=>{actions.push(action);
    if(action==='measurement_recovery_context'){assert.deepEqual(Object.keys(input),['requestId']);return h.adapter.open(input.requestId,signal);}
    if(action==='measurement_recovery_issue')return h.adapter.issue(input,signal);
    if(action==='measurement_recovery_current'){assert.deepEqual(Object.keys(input).sort(),['generation','leaseId','requestId']);return h.adapter.current(h.c,signal);}
    assert.equal(action,'measurement_recovery_reconcile');assert.deepEqual(Object.keys(input).sort(),['acquisitionId','frame','generation','journalId','leaseId','requestId']);return h.adapter.reconcile(h.c,input.frame,signal);
  };
  const bridge=measurementCoreRecoveryAdapter(domain,{verifyOrigin:async()=>{origin++;return true;},verifySeal:async()=>{seal++;return true;}});
  const acquired=await acquireMeasurementRecovery(id(1),bridge,sig(),()=>now);assert.ok(acquired);
  assert.equal((await reconcileMeasurementRecovery(acquired,sig(),()=>now)).state,'synthetic_qualified');assert.equal(origin,2);assert.equal(seal,2);
  assert.equal(actions.filter(a=>a==='measurement_recovery_reconcile').length,1);
});
test('currently unavailable Core action or failing independent origin remains denied with no target reconciliation',async()=>{
  const denied=measurementCoreRecoveryAdapter(async()=>{throw Error('INVALID_INPUT');},{verifyOrigin:async()=>true,verifySeal:async()=>true});
  assert.equal(await acquireMeasurementRecovery(id(1),denied,sig(),()=>now),null);
  const h=harness();const domain=async(a,input,s)=>a==='measurement_recovery_context'?h.adapter.open(input.requestId,s):h.adapter.issue(input,s);
  const badOrigin=measurementCoreRecoveryAdapter(domain,{verifyOrigin:async()=>false,verifySeal:async()=>true});
  assert.equal(await acquireMeasurementRecovery(id(1),badOrigin,sig(),()=>now),null);assert.equal(h.calls.reconcile,0);
});

function eraseHarness({unknownExecutor=false,copyAckChange,sourceAckChange,inventoryChange}={}){
  const c={schemaVersion:SCHEMA,purpose:PURPOSE,kind:'measurement_control_context',requestId:id(1),leaseId:id(2),generation:3,ownerId:id(4),scope:SCHEMA,
    sourceId:id(5),layoutDigest:'a'.repeat(64),pinsDigest:'b'.repeat(64),capturedAt:now-20,expiresAt:now+2000};const calls={source:0,copy:0};
  const binding={schemaVersion:SCHEMA,purpose:PURPOSE,requestId:c.requestId,leaseId:c.leaseId,generation:c.generation,ownerId:c.ownerId,scope:SCHEMA,sourceId:c.sourceId,layoutDigest:c.layoutDigest,pinsDigest:c.pinsDigest};
  const copy={copyId:id(20),executorId:unknownExecutor?null:id(21),ackId:null,state:unknownExecutor?'unknown':'outstanding',authorityReceivedAt:now-1000,expiresAt:now+1000};
  const i={...binding,kind:'measurement_control_inventory',sourceDigest:'c'.repeat(64),capturedAt:now-10,expiresAt:now+1500,
    rows:{...zero(),consents:1,admissions:2,reports:3,erasureReceipts:1,recoveryControls:1,journals:1,copyObligations:1},copies:[copy]};inventoryChange?.(i);
  const adapter={open:async()=>c,current:async()=>({...binding,kind:'measurement_control_current',expiresAt:c.expiresAt,state:'current'}),inventory:async()=>i,
    eraseSource:async()=>{calls.source++;const v={...binding,kind:'measurement_control_erasure',sourceDigest:i.sourceDigest,state:'source_erased',consentRevoked:true,
      erasedRows:9,retainedControls:{...zero(),erasureReceipts:1,recoveryControls:1,copyObligations:1},authorityReceivedAt:now-5,retainedUntil:now-5+TTL};sourceAckChange?.(v);return v;},
    eraseCopy:async()=>{calls.copy++;const v={...binding,kind:'measurement_copy_erasure',copyId:copy.copyId,executorId:copy.executorId,ackId:id(22),state:'erased'};copyAckChange?.(v);return v;}};
  return {adapter,calls};
}
test('explicit control scope inventories all seven groups and verifies scoped source plus copy ACK; lifecycle remains uninstalled',async()=>{
  const h=eraseHarness();const result=await eraseMeasurementControlScope(id(1),h.adapter,sig(),()=>now);
  assert.equal(result.state,'scoped_source_and_copies_erased');assert.equal(result.sourceErased,true);assert.equal(result.copyObligations,1);assert.equal(result.copyAcks,1);
  assert.equal(result.wholeLifecycleComplete,false);assert.equal(result.collectionEligible,false);assert.equal(h.calls.source,1);assert.equal(h.calls.copy,1);
});
test('source erasure never claims unknown executor or foreign/missing external-copy ACK erased',async()=>{
  const missing=eraseHarness({unknownExecutor:true});const result=await eraseMeasurementControlScope(id(1),missing.adapter,sig(),()=>now);
  assert.equal(result.sourceErased,true);assert.equal(result.state,'source_erased');assert.equal(result.copyState,'unknown');assert.equal(result.copyAcks,0);assert.equal(missing.calls.copy,0);
  for(const mutate of [v=>v.ownerId=id(99),v=>v.copyId=id(99),v=>v.ackId=null,v=>v.state='unknown']){
    const h=eraseHarness({copyAckChange:mutate});const r=await eraseMeasurementControlScope(id(1),h.adapter,sig(),()=>now);assert.equal(r.sourceErased,true);assert.equal(r.state,'source_erased');assert.equal(r.copyAcks,0);assert.equal(h.calls.copy,1);
  }
});
test('control inventory omission/stale/foreign and retained observations/extended TTL/unknown erase ACK cannot claim completion',async()=>{
  for(const mutate of [i=>i.ownerId=id(99),i=>i.expiresAt=now,i=>delete i.rows.journals,i=>i.rows.copyObligations=0,i=>i.copies[0].expiresAt=now]){
    const h=eraseHarness({inventoryChange:mutate});assert.equal((await eraseMeasurementControlScope(id(1),h.adapter,sig(),()=>now)).state,'denied');assert.equal(h.calls.source,0);
  }
  for(const mutate of [v=>v.ownerId=id(99),v=>v.erasedRows=0,v=>v.retainedControls.reports=1,v=>v.retainedUntil=v.authorityReceivedAt+TTL+1,v=>v.consentRevoked=false]){
    const h=eraseHarness({sourceAckChange:mutate});const r=await eraseMeasurementControlScope(id(1),h.adapter,sig(),()=>now);assert.equal(r.state,'unknown');assert.equal(r.collectionEligible,false);assert.equal(h.calls.copy,0);
  }
  assert.equal((await eraseMeasurementControlScope(id(1),null,sig(),()=>now)).state,'denied');
});
