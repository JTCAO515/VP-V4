import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoalReturnScope,parseGoalReturn,qualifyGoalReturnArtifact} from '../../../../lib/server/journey-entry/goal-return/contract.ts';

const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const scope={conversationId:id(1),goalId:id(2),goalVersion:1,parentMessageId:id(3),inputSequence:1};
const ref={kind:'goal_return',schemaVersion:'goal-return/1',scope,lastDecision:{artifactId:id(4),revision:2,eventId:'9223372036854775807'},nextStep:{kind:'unknown'}};
const artifact={kind:'result_artifact',artifactId:id(4),revision:2,currentRevision:2,current:true,historicalReadable:true,lifecycle:'active',
 source:{taskId:id(5),taskTurnId:id(6),goalId:id(2),goalVersion:1,inputMessageId:id(3),inputSequence:1,tripId:null,tripVersion:null},
 basis:{memories:[],evidence:[]},content:{schemaVersion:'decision/1',title:'Chosen',summary:'Recorded',comparisonRef:{artifactId:id(7),revision:1},state:'chosen',chosenOptionId:'a',actions:[]},createdAt:'2026-10-12T00:00:00Z'};

test('exact scope and reference preserve int64 source sequence and explicit unknown',()=>{
 assert.deepEqual(parseGoalReturnScope(scope),scope);assert.deepEqual(parseGoalReturn(ref,scope),ref);
 assert.deepEqual(qualifyGoalReturnArtifact(artifact,ref,scope),artifact);
});
test('foreign scope, extra authority and noncanonical event sequences fail closed',()=>{
 for (const field of Object.keys(scope)) assert.equal(parseGoalReturn(ref,{...scope,[field]:typeof scope[field]==='string'?id(99):2}),null);
 for (const value of ['0','01','-1','1.0','9223372036854775808',1]) assert.equal(parseGoalReturn({...ref,lastDecision:{...ref.lastDecision,eventId:value}},scope),null);
 assert.equal(parseGoalReturn({...ref,latestAt:'2026-10-12'},scope),null);
 assert.equal(parseGoalReturn({...ref,nextStep:{kind:'save'}},scope),null);
 assert.equal(parseGoalReturnScope({...scope,ownerId:id(9)}),null);
 assert.equal(parseGoalReturnScope({...scope,inputSequence:1000001}),null);
});
test('readable historical, stale, pending or wrong reference cannot be current decision',()=>{
 for (const change of [{current:false},{lifecycle:'withdrawn',current:false},{artifactId:id(99)},{revision:1},{currentRevision:3},
  {content:{...artifact.content,state:'pending',chosenOptionId:null}}, {content:{...artifact.content,chosenOptionId:null}}])
  assert.equal(qualifyGoalReturnArtifact({...artifact,...change},ref,scope),null);
 for (const field of ['goalId','goalVersion','inputMessageId','inputSequence'])
  assert.equal(qualifyGoalReturnArtifact({...artifact,source:{...artifact.source,[field]:typeof artifact.source[field]==='string'?id(99):2}},ref,scope),null);
});
