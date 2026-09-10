import test from 'node:test';
import assert from 'node:assert/strict';
import { isSourcedCandidateInput } from '../../../lib/server/knowledge/review/source-assertion.ts';
import { isOpsInput } from '../../../lib/server/knowledge/review/local-workspace.ts';
const sample=()=>({action:'submit_assertion',operationId:'12345678-1234-4123-8123-123456789012',candidateId:'22345678-1234-4123-8123-123456789012',title:'Synthetic address',source:{sourceKey:'test-material',revisionLabel:'r1',publisher:'Synthetic test author',uri:'urn:vpj15:synthetic:material-1',locator:'paragraph 1',snippet:'Test help desk is at Test Hall.',usageDeclaration:'Synthetic test declaration; not a runtime licence grant.'},assertion:{subjectId:'test-help-desk',claimType:'address',value:{lines:['Test Hall'],locality:'Synthetic City',countryCode:'CN'}},expressions:{zh:'合成测试服务台位于测试大厅。',en:'The synthetic help desk is at Test Hall.'}});
test('one source-backed pending address assertion fits the existing Ops input union',()=>{
 const value=sample();assert.ok(isSourcedCandidateInput(value));assert.ok(isOpsInput(value));
 const chinese=sample();chinese.source.snippet='合'.repeat(2000);chinese.expressions.zh='成'.repeat(1000);chinese.expressions.en='测'.repeat(1000);assert.ok(isSourcedCandidateInput(chinese),'bounded Chinese UTF-8 payload remains inside24KB');
});
test('source declarations cannot inject grants, server hashes, publication or unrelated claim types',()=>{
 for(const mutate of [v=>v.source.licenceAllowed=true,v=>v.source.snippetHash='0'.repeat(64),v=>v.source.usageStatus='allowed',v=>v.published=true,v=>v.assertion.claimType='money',v=>v.assertion.evidence=[],v=>v.expressions.assertionId='other']){
  const value=sample();mutate(value);assert.equal(isSourcedCandidateInput(value),false);
 }
});
test('closed bounded source/locator/address and both expressions are mandatory',()=>{
 for(const mutate of [v=>v.source.uri='https://user:secret@example.test/file',v=>v.source.uri='file:///etc/passwd',v=>v.source.uri='javascript:alert(1)',v=>v.source.uri='https://example.test/file?token=secret',v=>v.source.snippet='合'.repeat(2001),v=>v.source.revisionLabel='r1'+' '.repeat(120),v=>v.source.locator='',v=>v.assertion.value.lines=[],v=>v.assertion.value.countryCode='China',v=>delete v.expressions.zh]){
  const value=sample();mutate(value);assert.equal(isSourcedCandidateInput(value),false);
 }
});
