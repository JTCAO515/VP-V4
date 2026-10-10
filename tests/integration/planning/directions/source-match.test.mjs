import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { directionsPublishedSourceMatches, directionsProposalMatches } from '../../../../lib/server/planning/directions/source-match.ts';
import { directions } from '../../../../lib/server/planning/directions/domain.ts';
const ids=Object.fromEntries(['taskId','turnId','conversationId','goalId','inputMessageId','artifactId','tripId','proposalId','proposalArtifactId'].map(k=>[k,uuid()]));
const intake={schemaVersion:'travel-directions-intake/1',destinations:['Shanghai'],durationDays:null,interests:[],currentPace:null,budget:null,dates:null,intent:'explore'};
const receipt={kind:'published',...Object.fromEntries(['taskId','turnId','conversationId','goalId','inputMessageId','artifactId'].map(k=>[k,ids[k]])),revision:1,reused:false,goalVersion:1,inputSequence:8,intakeRevision:1,intakeDigest:'a'.repeat(64),current:true};
const params={taskId:ids.taskId,turnId:ids.turnId,conversationId:ids.conversationId,goalId:ids.goalId,messageId:ids.inputMessageId,expectedGoalVersion:1,expectedSourceSequence:2,expectedIntakeRevision:0,intake,memoryBasis:[]};
const content={schemaVersion:'travel-directions/1',title:'Directions',summary:'Unknown dates',intake,directions:directions({destinations:['Shanghai'],durationDays:null,interests:[],currentPace:null,budgetMinorUnits:null,intent:'explore',locale:'en'}),selectedDirectionId:null,draft:null,actions:[]};
const artifact={kind:'result_artifact',artifactId:ids.artifactId,revision:1,currentRevision:1,current:true,historicalReadable:true,lifecycle:'active',source:{taskId:ids.taskId,taskTurnId:ids.turnId,goalId:ids.goalId,goalVersion:1,inputMessageId:ids.inputMessageId,inputSequence:8,tripId:ids.tripId,tripVersion:0},basis:{memories:[],evidence:[]},content,createdAt:'2026-10-10T08:00:00Z'};
const basis={kind:'directions_intake',schemaVersion:'travel-directions-current-basis/1',...Object.fromEntries(['conversationId','goalId','goalVersion','inputMessageId','inputSequence','intakeRevision','intakeDigest'].map(k=>[k,receipt[k]])),intake,memoryBasis:[],tripId:ids.tripId,tripVersion:0,profilePace:null};
test('legitimate multi-goal sequence gap needs exact current original artifact/intake; forged sequence or source denies',()=>{
 assert.equal(directionsPublishedSourceMatches(receipt,params,artifact,basis),true);
 for(const bad of [{...basis,inputSequence:9},{...basis,goalVersion:2},{...basis,intakeDigest:'b'.repeat(64)},{...basis,intake:{...intake,durationDays:7}},{...basis,tripId:uuid()}])assert.equal(directionsPublishedSourceMatches(receipt,params,artifact,bad),false);
 assert.equal(directionsPublishedSourceMatches(receipt,params,{...artifact,current:false},basis),false);
 assert.equal(directionsPublishedSourceMatches({...receipt,inputSequence:9},params,artifact,basis),false);
});
test('bind receipt must reopen original sameGoal sameTrip proposal reference, never an unrelated proof',()=>{
 const bind={tripId:ids.tripId,tripVersion:0,proposalId:ids.proposalId,proposalRevision:1,proposalArtifactId:ids.proposalArtifactId,proposalArtifactRevision:1};
 const p={...artifact,artifactId:ids.proposalArtifactId,content:{schemaVersion:'change-proposal-reference/1',proposalId:ids.proposalId,proposalRevision:1,actions:[]}};
 assert.equal(directionsProposalMatches(bind,artifact,p),true);
 assert.equal(directionsProposalMatches(bind,artifact,{...p,source:{...p.source,goalId:uuid()}}),false);
 assert.equal(directionsProposalMatches(bind,artifact,{...p,current:false}),false);
});
