import assert from 'node:assert/strict';
import test from 'node:test';
import {parseResultArtifactReadV2,parseResultSearchPageV2} from '../../../lib/server/artifacts/result-v2-contract.ts';
const id='12345678-1234-4234-8234-123456789abc';
const content={schemaVersion:'comparison/1',title:'Areas',summary:'Unknown safety',options:[{id:'a',title:'A',tradeoff:'Unknown'},{id:'b',title:'B',tradeoff:'Unknown'}],actions:[]};
const result={kind:'result_artifact',artifactId:id,revision:1,currentRevision:1,current:true,historicalReadable:true,lifecycle:'active',source:{taskId:id,taskTurnId:id,goalId:id,goalVersion:1,inputMessageId:id,inputSequence:3000000000,tripId:null,tripVersion:null},basis:{memories:[{id,revision:3000000000}],evidence:[]},content,createdAt:'2026-10-03T00:00:00Z'};
test('v2 exact result retains safe bigint sequences/memory versions and denies tampered source/schema/basis flags',()=>{
 assert.ok(parseResultArtifactReadV2(result));for(const bad of [{...result,content:{...content,schemaVersion:'unknown/1'}},{...result,current:[true]},{...result,historicalReadable:false},{...result,source:{...result.source,tripId:id,tripVersion:null}},{...result,basis:{...result.basis,evidence:[{factId:'fake'}]}},{...result,revision:2},{...result,createdAt:'invalid'},{...result,extra:true}])assert.equal(parseResultArtifactReadV2(bad),null);
 assert.ok(parseResultArtifactReadV2({...result,current:false,currentRevision:2}));
});
test('generic index classifies known schemas with same exact identity and rejects unknown versions/cursor leakage',()=>{
 const row={artifactId:id,revision:1,schemaVersion:'practical/1',title:'Translation',summary:'Synthetic',tripId:null,tripVersion:null};assert.ok(parseResultSearchPageV2({kind:'result_search',results:[row],nextCursor:null}));assert.equal(parseResultSearchPageV2({kind:'result_search',results:[{...row,schemaVersion:'future/1'}],nextCursor:null}),null);assert.equal(parseResultSearchPageV2({kind:'result_search',results:[row],nextCursor:id}),null);
});
