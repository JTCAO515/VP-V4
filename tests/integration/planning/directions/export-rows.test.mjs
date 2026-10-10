import test from 'node:test';import assert from 'node:assert/strict';
import {validDirectionExportRow} from '../../../../lib/server/planning/directions/export-rows.ts';
const id='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000001',digest='a'.repeat(64),createdAt='2026-10-10T08:00:00Z';
const intake={messageId:id,intakeRevision:1,goalId:id,conversationId:id,taskId:id,taskTurnId:other,messageSequence:2,goalVersion:1,policyId:id,consentId:id,planningPolicyId:id,planningConsentId:id,idempotencyKey:id,requestBytesDigest:digest,intake:{schemaVersion:'travel-directions-intake/1',destinations:['Shanghai'],durationDays:null,interests:[],currentPace:null,budget:null,dates:null,intent:'explore'},memoryBasis:[],createdAt};
const source={artifactId:id,messageId:id,taskTurnId:other,sourceDigest:digest,initialContentDigest:digest,initialOutputDigest:digest,previousArtifactId:null,previousRevision:null,publicationKey:id,createdAt};
const erased={operationId:id,sessionId:other,action:'edit',requestBytesDigest:digest,erased:true,artifactId:null,sourceMessageId:null,taskTurnId:null,expectedRevision:null,resultRevision:null,sourceDigest:null,outputContentDigest:null,tripId:null,proposalId:null,proposalArtifactId:null,receipt:null,createdAt};
test('closed retained intake/source projections preserve valid unknown input and reject malformed lineage/foreign fields',()=>{
 assert.equal(validDirectionExportRow('directionIntakes',intake),true);assert.equal(validDirectionExportRow('directionSources',source),true);
 for(const bad of [{...intake,ownerId:other},{...intake,intake:{...intake.intake,durationDays:31}},{...intake,memoryBasis:[{id,revision:1},{id,revision:2}]}])assert.equal(validDirectionExportRow('directionIntakes',bad),false);
 assert.equal(validDirectionExportRow('directionSources',{...source,previousArtifactId:other}),false);assert.equal(validDirectionExportRow('directionSources',{...source,previousArtifactId:id,previousRevision:1}),false);
});
test('permanent erased operation cannot resurrect receipt/source identities; live receipts must match revision/Trip provenance',()=>{
 assert.equal(validDirectionExportRow('directionOperations',erased),true);
 for(const patch of [{receipt:{}},{artifactId:id},{sourceDigest:digest},{resultRevision:2}])assert.equal(validDirectionExportRow('directionOperations',{...erased,...patch}),false);
 const live={...erased,erased:false,artifactId:id,sourceMessageId:id,taskTurnId:other,expectedRevision:1,resultRevision:2,sourceDigest:digest,outputContentDigest:digest,receipt:{kind:'revised',artifactId:id,revision:2,reused:false}};assert.equal(validDirectionExportRow('directionOperations',live),true);
 assert.equal(validDirectionExportRow('directionOperations',{...live,resultRevision:3}),false);assert.equal(validDirectionExportRow('directionOperations',{...live,tripId:other}),false);
 const bound={...live,action:'bind',resultRevision:1,outputContentDigest:null,tripId:id,proposalId:other,proposalArtifactId:other,receipt:{kind:'proposal_created',artifactId:id,revision:1,reused:false,tripId:id,tripVersion:0,proposalId:other,proposalRevision:1,proposalArtifactId:other,proposalArtifactRevision:1}};
 assert.equal(validDirectionExportRow('directionOperations',bound),true);assert.equal(validDirectionExportRow('directionOperations',{...bound,receipt:{...bound.receipt,proposalId:id}}),false);
});
