import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQaHostedProfile,planQaGroup} from '../../../lib/server/qa-agent/hosted-profile.ts';
import {parseHostedWorkerProfile} from '../../../lib/server/jobs/hosted-text-worker.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const id='11111111-1111-4111-8111-111111111111',endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const profile=()=>({schemaVersion:'vpj07-hosted-text-worker/4',projectRef:'abcdefghijklmnopqrst',pollIntervalMs:1000,maxLifetimeMs:60000,drainMs:1000,concurrency:1,groupLimit:10,modes:['qa_session_history_v1'],planning:null,qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null},reservedMicros:2,maxOutputTokens:128,timeoutMs:1000,configurationId:id,configurationVersion:1}});
test('Independent QA v4 is a closed profile; original v1/v2 do not gain QA mode',()=>{
 const p=parseQaHostedProfile(profile());assert.deepEqual(p.modes,['qa_session_history_v1']);
 for(const patch of [{modes:['task_history_v1']},{modes:['qa_session_history_v1','current_input_v1']},{planning:{ownerId:id}},{extra:true},{schemaVersion:'vpj07-hosted-text-worker/2'}])assert.throws(()=>parseQaHostedProfile({...profile(),...patch}));
 assert.throws(()=>parseHostedWorkerProfile({...profile(),schemaVersion:'vpj07-hosted-text-worker/2'}));
 const legacy=profile();legacy.schemaVersion='vpj07-hosted-text-worker/1';delete legacy.planning;delete legacy.projectRef;assert.throws(()=>parseHostedWorkerProfile(legacy));
});
test('QA group must match existing default provider endpoint and exactly one original scope',()=>{
 const p=parseQaHostedProfile(profile()),group={ownerId:id,policyId:id,contextMode:'qa_session_history_v1',provider:'qwen',endpoint,scopes:[{scopeId:id,model:PROTOCOL_MODELS.qwen,priceVersion:'synthetic-v1'}]};
 const job=planQaGroup(p,group,endpoint);assert.equal(job.schemaVersion,'qa-agent-worker/2');assert.equal(job.budget.scopeId,id);
 for(const patch of [{provider:'glm'},{endpoint:'https://evil.invalid'},{contextMode:'current_input_v1'},{scopes:[]},{scopes:[...group.scopes,...group.scopes]}])assert.equal(planQaGroup(p,{...group,...patch},endpoint),null);
});
