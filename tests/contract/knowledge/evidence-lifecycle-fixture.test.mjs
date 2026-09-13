import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isOpsInput} from '../../../lib/server/knowledge/review/local-workspace.ts';
const fixture=revision=>JSON.parse(readFileSync(new URL(`../../fixtures/knowledge/evidence-lifecycle-v${revision}.json`,import.meta.url),'utf8'));
const submit=item=>({action:'submit_statement',operationId:'12345678-1234-4123-8123-123456789012',candidateId:item.candidateId,title:item.title,statement:item.statement});
test('retain the exact rejected v1 conflict and diagnose its invalid source identifier',()=>{
 const item=fixture(1).statements.find(s=>s.key==='mobileConflict');
 assert.equal(isOpsInput(submit(item)),false);
 const repaired=structuredClone(item);repaired.statement.sources[0].sourceKey=repaired.statement.sources[0].sourceKey.toLowerCase();
 assert.equal(isOpsInput(submit(repaired)),false,'the synthetic URI also contained an uppercase character');
 repaired.statement.sources[0].uri=repaired.statement.sources[0].uri.toLowerCase();
 assert.equal(isOpsInput(submit(repaired)),true,'both source key and synthetic URI must use valid lowercase identifiers');
});
test('every frozen v2 lifecycle statement passes the real Ops admission validator before any activation',()=>{
 const previous=fixture(1),current=fixture(2);
 for(const item of current.statements){assert.equal(isOpsInput(submit(item)),true,item.key);assert.ok(!previous.statements.some(p=>p.candidateId===item.candidateId));}
 assert.equal(current.maxNewModelAttempts+current.priorRun.modelAttempts,current.maxSliceModelAttempts);
 assert.deepEqual(current.questions,previous.questions,'the format repair does not tune classifier questions');
});

test('v3 supplement preserves failed runs and admits fresh valid statements without tuning questions',()=>{
 const previous=[fixture(1),fixture(2)],current=fixture(3);
 for(const item of current.statements){assert.equal(isOpsInput(submit(item)),true,item.key);assert.ok(previous.every(p=>p.statements.every(x=>x.candidateId!==item.candidateId)));}
 assert.equal(current.priorRun.modelAttempts,6);
 assert.equal(current.maxNewModelAttempts,4);
 assert.equal(current.maxSliceModelAttempts,10);
 assert.deepEqual(current.questions,previous[1].questions);
 const stages=structuredClone(previous[1].stages);stages[3].oldCardReasons=['expired'];
 assert.deepEqual(current.stages,stages,'only the diagnosed saved-fact reason expectation changes');
});
