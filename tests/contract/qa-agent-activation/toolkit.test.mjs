import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {generate,preflight,checkBinding,digest,PROJECT,LINK,MODE,migrationManifest,MIGRATION_MANIFEST_HASH} from '../../../scripts/qa-agent-activation/toolkit.mjs';
const now=Date.parse('2026-10-13T04:00:00Z');
const id='11111111-1111-4111-8111-111111111111';
const proof=()=>({url:'https://example.invalid/synthetic-only',observedAt:'2026-10-13T03:00:00Z',validUntil:'2026-10-14T04:00:00Z',sha256:'a'.repeat(64)});
const input=()=>({schemaVersion:'qa-activation-input/1',projectId:PROJECT,contextMode:MODE,ownerId:id,
 supplier:{provider:'qwen',recipient:'SYNTHETIC recipient; not a real provider assertion',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',termsVersion:'SYNTHETIC-terms-1',sourceRegion:'SYNTHETIC source',processingRegion:'unknown',storageRegion:'not disclosed',providerRetentionDisclosure:'unknown; supplier has not disclosed retention',evidence:proof()},
 pricing:{model:'qwen3.7-plus-2026-05-26',priceVersion:'synthetic-only-v1',currency:'CNY',mode:'flat',inputMicrosPerMillion:1000000,outputMicrosPerMillion:2000000,cachedInputMicrosPerMillion:null,evidence:proof(),coverage:{inputTokens:1048576,outputTokens:4096,allBillableComponentsIncluded:true}},
 budget:{limitMicros:10000000,taskLimitMicros:5000000,providerLimitMicros:10000000,attemptLimitMicros:2000000,taskAttemptLimit:8,concurrencyLimit:1,maxOutputTokens:128,timeoutMs:1000,evidence:proof()},
 validity:{effectiveAt:'2026-10-13T03:00:00Z',expiresAt:'2026-10-14T03:00:00Z',termsRecheckAt:'2026-10-14T03:00:00Z'},configuration:{id,version:1}});
const build=x=>generate(x??input(),{now});
const snapshot=b=>({projectId:PROJECT,linkId:LINK,observedAt:'2026-10-13T03:30:00Z',migrations:[...migrationManifest.expected155],reviewedMigrations:[...migrationManifest.reviewedMissing80],migrationManifestHash:MIGRATION_MANIFEST_HASH,qaRpcPresent:true,turnDataPrivatePresent:true,qaSchemaFingerprintMatches:true,restorePoint:{ready:true,evidenceHash:'b'.repeat(64)},workerStopped:true,webDisabled:true,ownerId:id,existingPolicyIds:[],existingNoticeVersions:[],existingNoticeHashes:[],existingScopeIds:[],reviewedPackageHash:b.packageHash});
test('complete synthetic metadata produces a disabled, unpublished compatible profile, with zero sends',()=>{
 const original=globalThis.fetch;let sends=0;globalThis.fetch=()=>{sends++;throw Error('forbidden');};
 try {const b=build();assert.equal(b.hostedProfile.qwen.reservedMicros,1048832);assert.equal(b.scopeInsertParameters.enabled,false);assert.equal(b.providerLimitInsertParameters.enabled,false);assert.equal(b.policyInserted,false);assert.equal(b.activationAllowed,false);assert.equal(b.serverEnvironment.VISEPANDA_QA_AGENT,'false');assert.match(b.notice.noticeEn,/not disclosed/);assert.match(b.notice.noticeZh,/unknown/);assert.equal(b.noticeHash,digest(b.notice));assert.equal(sends,0);} finally {globalThis.fetch=original;}
});
test('new immutable IDs/version/hash each generation and changed disclosures need new consent',()=>{
 const a=build(),b=build();assert.notEqual(a.notice.policyId,b.notice.policyId);assert.notEqual(a.notice.noticeVersion,b.notice.noticeVersion);assert.notEqual(a.noticeHash,b.noticeHash);
 const x=input();x.supplier.providerRetentionDisclosure='SYNTHETIC changed disclosure';const c=build(x);assert.notEqual(a.noticeHash,c.noticeHash);assert.equal(c.consent.carryForward,false);
 const bad=structuredClone(a);bad.notice.noticeEn+=' changed';assert.throws(()=>preflight(bad,snapshot(a),now),/PACKAGE_CHANGED/);
});
test('historical Qwen and GLM policy modes, prices and expired validity fail closed',()=>{
 for(const mode of ['current_input_v1','task_history_v1','knowledge_intent_v1']) {const x=input();x.contextMode=mode;assert.throws(()=>build(x));}
 for(const provider of ['glm','deepseek']) {const x=input();x.supplier.provider=provider;assert.throws(()=>build(x));}
 for(const section of ['supplier','pricing','budget']) {const x=input();x[section].evidence.observedAt='2026-09-12T00:00:00Z';assert.throws(()=>build(x));}
 const x=input();x.validity.expiresAt='2026-09-12T00:00:00Z';assert.throws(()=>build(x));
});
test('unknown endpoint/recipient/price, client model, credentials and incomplete evidence rejected',()=>{
 for(const modify of [x=>x.supplier.endpoint='unknown',x=>x.supplier.endpoint='https://evil.invalid/v1',x=>x.supplier.recipient='unknown',x=>delete x.supplier.storageRegion,x=>x.pricing.inputMicrosPerMillion=null,x=>x.pricing.outputMicrosPerMillion=0,x=>x.pricing.model='client-selected',x=>x.clientModel='qwen',x=>x.apiKey='DO_NOT_OUTPUT',x=>x.supplier.evidence.url='https://example.invalid/?token=NO',x=>x.pricing.coverage.allBillableComponentsIncluded=false]) {const x=input();modify(x);assert.throws(()=>build(x));}
});
test('reservation integer arithmetic and bounded budget reject underfunding, overflow, currency and retries',()=>{
 for(const modify of [x=>x.budget.attemptLimitMicros=1,x=>x.budget.limitMicros=0,x=>x.budget.taskAttemptLimit=9,x=>x.budget.concurrencyLimit=2,x=>x.budget.maxOutputTokens=4097,x=>x.pricing.currency='EUR',x=>x.pricing.inputMicrosPerMillion=Number.MAX_SAFE_INTEGER,x=>x.budget.limitMicros=1.1,x=>x.pricing.coverage.inputTokens=32768]) {const x=input();modify(x);assert.throws(()=>build(x));}
});
test('exact reviewed migration set and recovery point required; count alone never sufficient',()=>{
 const b=build(),s=snapshot(b);assert.equal(preflight(b,s,now).reviewReady,true);assert.equal(preflight(b,s,now).activationAllowed,false);
 for(const patch of [{migrations:migrationManifest.baseline75},{migrations:s.migrations.slice(1)},{migrations:[...s.migrations,'20269999000000']},{migrations:[...s.migrations].reverse()},{reviewedMigrations:s.reviewedMigrations.slice(1)},{reviewedMigrations:[...s.reviewedMigrations].reverse()},{reviewedMigrations:[...s.reviewedMigrations.slice(1),'20269999000000']},{migrationManifestHash:'a'.repeat(64)},{migrations:[...s.migrations.slice(1),'20269999000000']},{qaRpcPresent:false},{turnDataPrivatePresent:false},{qaSchemaFingerprintMatches:false},{restorePoint:{ready:false}},{workerStopped:false},{webDisabled:false},{projectId:'another-project'},{linkId:'another-account'},{ownerId:'another-user'},{reviewedPackageHash:'c'.repeat(64)},{existingPolicyIds:[b.notice.policyId]},{existingNoticeHashes:[b.noticeHash]},{existingScopeIds:[b.scopeInsertParameters.id]},{observedAt:'2026-09-13T00:00:00Z'}]) assert.equal(preflight(b,{...s,...patch},now).reviewReady,false);
 assert.equal(preflight(b,s,now+2*86400000).reviewReady,false);
});
test('diagnostic binding rejects cross user, auth session, QA Session, mode, policy, scope and attempt',()=>{
 const expected={ownerId:id,authSessionId:id,sessionId:id,turnId:id,leaseToken:id,policyId:id,noticeHash:'a'.repeat(64),scopeId:id,contextMode:MODE};
 const actual={...expected,consentAccepted:true};assert.equal(checkBinding(expected,actual),true);
 for(const key of Object.keys(expected))assert.equal(checkBinding(expected,{...actual,[key]:'other'}),false);
 assert.equal(checkBinding(expected,{...actual,consentAccepted:false}),false);assert.equal(checkBinding(expected,{...actual,clientModel:'qwen'}),false);
});
test('no mutating SQL, networking, environment credentials or worker invocation in CLI/toolkit',()=>{
 const cli=readFileSync(new URL('../../../scripts/qa-agent-activation/cli.mjs',import.meta.url),'utf8');
 const core=readFileSync(new URL('../../../scripts/qa-agent-activation/toolkit.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(cli+core,/process\.env|fetch\(|execute_sql\(|apply_migration\(|createQaWorker\(/);
 assert.match(cli,/flag:'wx'/);
});
