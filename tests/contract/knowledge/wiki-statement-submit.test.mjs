import test from 'node:test';
import assert from 'node:assert/strict';
import {isWikiStatementSubmit} from '../../../lib/server/knowledge/wiki/statement-submit.ts';
import {isOpsInput} from '../../../lib/server/knowledge/review/local-workspace.ts';
const id='11111111-1111-4111-8111-111111111111';
const source={sourceKey:'synthetic',revisionLabel:'r1',publisher:'Synthetic',uri:'urn:vpj15:synthetic:wiki',locator:'paragraph 1',snippet:'Bring ID unless exempt.',usageDeclaration:'Synthetic test'};
const statement={schemaVersion:'knowledge-statement/1',assertion:{subjectId:'rail',predicate:'requires_document',objectId:'passport',conditions:['boarding'],exclusions:['exempt']},scope:{cities:['shanghai'],scene:'rail',audience:'international_independent_traveler'},expressions:{zh:{text:'需提供证件',conditions:['乘车时'],exclusions:['豁免者除外']},en:{text:'Bring ID',conditions:['When boarding'],exclusions:['Unless exempt']}},sources:[source]};
const input={action:'submit_wiki_statement',operationId:id,candidateId:id,title:'Draft',wikiRevisionId:id,expectedWikiVersion:1,statement};
test('Wiki submission uses existing statement contract and Ops mutation entry',()=>{assert.equal(isWikiStatementSubmit(input),true);assert.equal(isOpsInput(input),true);});
test('rejects authority injection, invalid versions and malformed statements',()=>{
 for(const value of [{...input,published:true},{...input,wikiRevisionId:'fake'},...[0,-1,1.5,2147483648,'1'].map(expectedWikiVersion=>({...input,expectedWikiVersion})),{...input,statement:{...statement,reviewerId:id}},{...input,statement:{...statement,sources:[]}}])assert.equal(isWikiStatementSubmit(value),false);
});
