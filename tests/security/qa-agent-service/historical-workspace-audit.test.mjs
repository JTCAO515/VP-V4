import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {auditHostedUsageJournal} from '../../../lib/server/jobs/hosted-usage-audit.ts';
import {parseHostedWorkerProfile,createHostedTextWorker} from '../../../lib/server/jobs/hosted-text-worker.ts';
import {qaJobConfig} from '../../../lib/server/qa-agent/hosted-profile.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const endpoint='https://synthetic-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions';
function fixture(){
 const profile=parseHostedWorkerProfile({schemaVersion:'vpj07-hosted-text-worker/3',pollIntervalMs:3000,maxLifetimeMs:60000,drainMs:1000,concurrency:1,groupLimit:1,modes:['qa_session_history_v1'],planning:null,
  qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:2000000,outputMicrosPerMillion:8000000,cachedInputMicrosPerMillion:null},reservedMicros:2101248,maxOutputTokens:512,timeoutMs:1000,configurationId:randomUUID(),configurationVersion:1}});
 const job=qaJobConfig(profile,randomUUID(),randomUUID(),randomUUID(),endpoint),digest=createHash('sha256').update(JSON.stringify(job)).digest('hex'),turn=randomUUID();
 const first={schemaVersion:'vpj07-hosted-run/1',phase:'started',workerId:randomUUID(),build:'synthetic-historical',startedAt:new Date().toISOString(),profile,qwenEndpoint:endpoint};
 const receipt={schemaVersion:'validated-model-usage/1',turnId:turn,policyId:job.policyId,attempt:{scopeId:job.budget.scopeId,ownerId:job.ownerId,taskId:turn,attemptId:randomUUID(),provider:'qwen',model:PROTOCOL_MODELS.qwen,priceVersion:job.budget.priceVersion,reservedMicros:job.budget.reservedMicros,timeoutMs:job.budget.timeoutMs},usage:{inputTokens:10,outputTokens:5,totalTokens:15,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'},actualMicros:60,observedAt:new Date().toISOString()};
 return {profile,first,job,rows:[first,{schemaVersion:'vpj07-hosted-job/1',jobDigest:digest,job},{schemaVersion:'vpj07-usage-journal/1',configurationDigest:digest,receipt}]};
}
test('historical /3 workspace journal validates empty batch and validated usage without any network',t=>{
 let sends=0;t.mock.method(globalThis,'fetch',async()=>{sends++;throw Error('Audit cannot execute');});const f=fixture();
 assert.equal(auditHostedUsageJournal(f.rows.slice(0,2)).distinctAttempts,0,'validate([]) accepts bound workspace endpoint');
 const report=auditHostedUsageJournal(f.rows);assert.equal(report.distinctAttempts,1);assert.equal(report.groups[0].actualMicros,60);assert.equal(report.ledgerState,'not_checked');assert.equal(report.settlementAction,'none');assert.equal(sends,0);
});
test('historical audit still refuses forged workspace and price; /3 cannot execute or read credentials',()=>{
 const f=fixture();let keys=0;
 assert.throws(()=>createHostedTextWorker(f.profile,{workerCredential:()=>{keys++;return 'synthetic';}}));assert.equal(keys,0);
 const foreign=structuredClone(f.rows);foreign[0].qwenEndpoint='https://evil.invalid/compatible-mode/v1/chat/completions';foreign[1].job.provider.endpoint=foreign[0].qwenEndpoint;foreign[1].jobDigest=createHash('sha256').update(JSON.stringify(foreign[1].job)).digest('hex');assert.throws(()=>auditHostedUsageJournal(foreign));
 const cost=structuredClone(f.rows);cost[2].receipt.actualMicros=61;assert.throws(()=>auditHostedUsageJournal(cost));
});
