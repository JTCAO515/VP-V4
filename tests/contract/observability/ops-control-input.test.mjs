import test from 'node:test';
import assert from 'node:assert/strict';
import { parseControlInput } from '../../../lib/server/observability/ops-control/contract.ts';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const base={schemaVersion:'ops-control/1',action:'set',operationId:id,expectedRevision:0,scope:{kind:'city',key:'shanghai'},state:'disabled'};
test('untrusted scope labels, actors and extra restore fields cannot grant controls',()=>{
  assert.deepEqual(parseControlInput(base),base);
  for(const input of [{...base,ownerId:id},{...base,scope:{kind:'city',key:'Shanghai'}},{...base,scope:{kind:'capability',key:'all_tools'}},{...base,scope:{kind:'provider',key:'other'}},{...base,expectedRevision:-1},{...base,expectedRevision:Number.MAX_SAFE_INTEGER+1},{...base,state:'resume'},{...base,scope:{...base.scope,source:'default'}}])assert.equal(parseControlInput(input),null);
});
test('receipt read and budget recovery are distinct closed operations',()=>{
  for(const input of [{schemaVersion:'ops-control/1',action:'receipt',operationId:id},{schemaVersion:'ops-control/1',action:'workspace'},{schemaVersion:'ops-control/1',action:'budget_read',scopeId:id},{schemaVersion:'ops-control/1',action:'budget_resume',scopeId:id,operationId:id,expectedRevision:1}])assert.deepEqual(parseControlInput(input),input);
  for(const input of [{schemaVersion:'ops-control/1',action:'receipt',operationId:id,scope:base.scope},{schemaVersion:'ops-control/1',action:'budget_resume',scopeId:id,operationId:id,expectedRevision:1,resetPending:true},{schemaVersion:'ops-control/1',action:'budget_resume',scopeId:id,operationId:id}])assert.equal(parseControlInput(input),null);
});
