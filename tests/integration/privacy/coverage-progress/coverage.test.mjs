import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { CATALOG_VERSION, MODULE_CATALOG, moduleById } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { OWNER_HANDLERS } from '../../../../lib/server/privacy/coverage/registry.ts';
import { handleCoverage } from '../../../../lib/server/privacy/coverage/http.ts';
import { matchesCoverageResult, coverageReport } from '../../../../lib/server/privacy/coverage/consumer.ts';
import { handleCoverageProgress } from '../../../../lib/server/privacy/coverage-progress/http.ts';
import { COVERAGE_PROGRESS_SCHEMA as scope, COVERAGE_PROGRESS_BOUNDARIES, coverageProgressDigest } from '../../../../lib/server/privacy/coverage-progress/contract.ts';
import { COVERAGE_PROGRESS_MODULE, COVERAGE_PROGRESS_CATALOG_VERSION } from '../../../../lib/server/privacy/coverage-progress/coverage.ts';

const actor={ownerId:uuid(),sessionId:uuid(),mobileEpoch:1}, requestId=uuid(), objectId=uuid();
const selected={scope,requestId,objectIds:[objectId]}, command={...selected,action:'erase',previewDigest:'b'.repeat(64),confirmed:true}, bytes='\t'+JSON.stringify(command);
const input={schemaVersion:'data-coverage/1',catalogVersion:COVERAGE_PROGRESS_CATALOG_VERSION,actorId:actor.ownerId,sessionId:actor.sessionId,mobileEpoch:actor.mobileEpoch,
  moduleId:'coverage_progress',moduleVersion:scope,operationId:requestId,action:'delete',phase:'execute',confirmed:true,tripId:null,commandBytes:bytes};
const request=raw=>new Request('http://localhost/api/privacy/native/v1/coverage',{method:'POST',headers:{'Content-Type':'application/json'},body:raw});
const current={actorId:actor.ownerId,sessionId:actor.sessionId,mobileEpoch:1};
const authority=()=>({authenticate:async()=>current,current:async()=>true});
const bound=now=>({schemaVersion:scope,...selected,...actor,sourceDigest:'a'.repeat(64),previewDigest:command.previewDigest,capturedAt:now-5,expiresAt:now-5+30000,
  boundaries:COVERAGE_PROGRESS_BOUNDARIES[scope],allUserDataCompleted:false});
const effects={collectorRequests:1,collectorSections:2,exitPages:0,retainedFences:1,sourceData:'not_modified',sessionAccountFences:'retained',externalCopies:'not_erased'};

test('actual catalog and owner caller upgrade only existing progress module, preserving full server/device/external denominator',async()=>{
  assert.equal(CATALOG_VERSION,COVERAGE_PROGRESS_CATALOG_VERSION);assert.deepEqual(moduleById('coverage_progress'),COVERAGE_PROGRESS_MODULE);
  assert.equal(MODULE_CATALOG.length,34);assert.equal(new Set(MODULE_CATALOG.map(m=>m.id)).size,34);assert.equal(typeof OWNER_HANDLERS.coverage_progress,'function');
  const response=await handleCoverage(new Request('http://localhost/api/privacy/native/v1/coverage'),{enabled:true,authority,handlers:OWNER_HANDLERS});
  const catalog=await response.json();assert.equal(response.status,200);assert.deepEqual(catalog.modules,MODULE_CATALOG);assert.equal(catalog.allUserDataCompleted,false);
  for(const location of ['server','device','external']) assert.ok(catalog.modules.some(m=>m.location===location));
});

test('real coverage dispatcher -> own HTTP -> strict erasure receipt -> independent consumer -> mother report',async()=>{
  const now=Date.now(), receipt={...bound(now),kind:'receipt',state:'erased',requestDigest:coverageProgressDigest(bytes),committedAt:now-1,decidedAt:now-1,effects};
  let calls=0;
  const handlers={coverage_progress:async original=>{
    assert.equal(new URL(original.url).pathname,'/api/privacy/native/v1/coverage-progress');
    return handleCoverageProgress(original,{enabled:true,authority:()=>({authenticate:async()=>actor,current:async()=>true,
      rpc:async(action,raw)=>{calls++;assert.equal(action,'erase');assert.equal(raw,bytes);return receipt;}})});
  }};
  const raw=JSON.stringify(input), response=await handleCoverage(request(raw),{enabled:true,authority,handlers}), result=await response.json();
  assert.equal(response.status,200);assert.equal(calls,1);assert.equal(result.state,'scoped_complete');assert.equal(result.reason,'SELECTED_ERASURE_WITH_DECLARED_RETENTION');
  assert.equal(result.allUserDataCompleted,false);assert.ok(matchesCoverageResult(result,raw));
  const report=coverageReport(current,'delete',[{raw,value:result}]);assert.equal(report.modules.length,34);assert.equal(report.allUserDataCompleted,false);
  assert.equal(report.modules.find(m=>m.moduleId==='coverage_progress').state,'scoped_complete');assert.equal(report.modules.find(m=>m.moduleId==='external_copies').state,'unavailable');
  assert.equal(matchesCoverageResult({...result,result:{data:{...receipt,effects:{...effects,sessionAccountFences:'erased'}}}},raw),false);
});

test('exact recovery route preserves original bytes; missing ACK never becomes erasure and previous catalog cannot be promoted',async()=>{
  let calls=0;
  const handlers={coverage_progress:async original=>handleCoverageProgress(original,{enabled:true,authority:()=>({authenticate:async()=>actor,current:async()=>true,
    rpc:async(action,raw)=>{calls++;assert.equal(action,'recover');assert.equal(JSON.parse(raw).mutationBytes,bytes);return{schemaVersion:scope,kind:'unknown',...selected,...actor,requestDigest:coverageProgressDigest(bytes),allUserDataCompleted:false};}})})};
  const raw=JSON.stringify({...input,phase:'recover'}), response=await handleCoverage(request(raw),{enabled:true,authority,handlers}), result=await response.json();
  assert.equal(calls,1);assert.equal(result.state,'unknown');assert.ok(matchesCoverageResult(result,raw));assert.equal(matchesCoverageResult({...result,state:'scoped_complete'},raw),false);
  const old=await handleCoverage(request(JSON.stringify({...input,catalogVersion:'data-coverage-catalog/2026-10-06.4'})),{enabled:true,authority,handlers});assert.equal(old.status,400);assert.equal(calls,1);
});
