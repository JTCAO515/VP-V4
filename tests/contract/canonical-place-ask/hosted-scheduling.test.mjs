import test from 'node:test';
import assert from 'node:assert/strict';
import {planCanonicalPlaceHostedJob,createCanonicalPlaceGroupPoll} from '../../../lib/server/knowledge/place-ask/hosted-scheduling.ts';
import {jobConfig,planGroup} from '../../../lib/server/jobs/hosted-text-worker.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const id='11111111-1111-4111-8111-111111111111',endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const profile={schemaVersion:'vpj07-hosted-text-worker/1',groupLimit:5,modes:['current_input_v1','knowledge_intent_v1'],qwen:{priceVersion:'controlled',pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null},reservedMicros:100,maxOutputTokens:100,timeoutMs:1000,configurationId:id,configurationVersion:1}};
const group={ownerId:id,policyId:id,contextMode:'current_input_v1',provider:'qwen',endpoint,scopes:[{scopeId:id,model:PROTOCOL_MODELS.qwen,priceVersion:'controlled'}]};
test('original qualified current-input group preserves policy and gains only an explicitly enabled existing job4 execution',()=>{
 const before=structuredClone(group),ordinary=planGroup(profile,group,endpoint),secondary=planCanonicalPlaceHostedJob(profile,group,ordinary);
 assert.deepEqual(ordinary,jobConfig(profile,'current_input_v1',id,id,id,endpoint));
 assert.deepEqual(secondary,jobConfig(profile,'knowledge_intent_v1',id,id,id,endpoint));assert.deepEqual(group,before);assert.equal(group.contextMode,'current_input_v1');
});
for(const modes of [['current_input_v1'],['knowledge_intent_v1'],['task_history_v1']])test(`no implicit execution allowance from profile ${modes}`,()=>{
 assert.equal(planCanonicalPlaceHostedJob({...profile,modes},group,jobConfig(profile,'current_input_v1',id,id,id,endpoint)),null);
});
for(const version of ['vpj07-hosted-text-worker/3','vpj07-hosted-text-worker/4'])test(`QA profile ${version} keeps its original path`,()=>assert.equal(planCanonicalPlaceHostedJob({...profile,schemaVersion:version},group,jobConfig(profile,'current_input_v1',id,id,id,endpoint)),null));
for(const mode of ['task_history_v1','knowledge_intent_v1'])test(`existing ${mode} group does not gain a second claimer`,()=>assert.equal(planCanonicalPlaceHostedJob(profile,{...group,contextMode:mode},jobConfig(profile,mode,id,id,id,endpoint)),null));
test('discovery booleans neither qualify nor deny facts; only existing grounded SQL claim can do so',()=>{
 const ordinary=jobConfig(profile,'current_input_v1',id,id,id,endpoint);
 assert.deepEqual(planCanonicalPlaceHostedJob(profile,{...group,selectedPlace:false,readyForProvider:true},ordinary),planCanonicalPlaceHostedJob(profile,{...group,selectedPlace:true,readyForProvider:false},ordinary));
});
test('owner-lane bounded polling rotates fairness and stops on the first nonempty outcome',async()=>{
 const poll=createCanonicalPlaceGroupPoll(2),seen=[],signal=new AbortController().signal;
 const ordinary=async()=>{seen.push('ordinary');return 'finished';},selected=async()=>{seen.push('selected');return 'finished';};
 for(let i=0;i<4;i++)assert.equal(await poll('a'.repeat(64),ordinary,selected,signal),'finished');assert.deepEqual(seen,['ordinary','selected','ordinary','selected']);
});
for(const result of ['queued','unavailable','finished'])test(`${result} never invokes another claimer`,async()=>{
 let calls=0;assert.equal(await createCanonicalPlaceGroupPoll(1)('a'.repeat(64),async()=>result,async()=>{calls++;return 'finished';},new AbortController().signal),result);assert.equal(calls,0);
});
test('only empty permits one bounded alternate poll; no loop or retry',async()=>{
 let calls=0;assert.equal(await createCanonicalPlaceGroupPoll(1)('a'.repeat(64),async()=>{calls++;return 'empty';},async()=>{calls++;return 'empty';},new AbortController().signal),'empty');assert.equal(calls,2);
});
test('abort and an unknown thrown outcome never cause an alternate claim',async()=>{
 let calls=0;const c=new AbortController();await assert.rejects(createCanonicalPlaceGroupPoll(1)('a'.repeat(64),async()=>{throw Error('unknown');},async()=>{calls++;return 'finished';},c.signal),/unknown/);assert.equal(calls,0);
 assert.equal(await createCanonicalPlaceGroupPoll(1)('a'.repeat(64),async()=>{c.abort();return 'empty';},async()=>{calls++;return 'finished';},c.signal),'unavailable');assert.equal(calls,0);
});
