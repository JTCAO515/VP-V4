import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {generate,preflight as rawPreflight,checkBinding,digest,SHARED_PROJECT,validateTarget,LINK,MODE,migrationManifest,MIGRATION_MANIFEST_HASH} from '../../../scripts/qa-agent-activation/toolkit.mjs';
// Read the Main-approved Git object; never modify either checkout's migration.
const fixtureDir=mkdtempSync(tmpdir()+'/qa-activation-source-');
const sourceRoot=pathToFileURL(fixtureDir+'/');
for(const file of Object.keys(migrationManifest.sourceSha256)) {
 const current=readFileSync(new URL('../../../supabase/migrations/'+file,import.meta.url));
 const bytes=createHash('sha256').update(current).digest('hex')===migrationManifest.sourceSha256[file]?current:
   execFileSync('git',['show',migrationManifest.reviewedSourceRevision+':supabase/migrations/'+file],{maxBuffer:8*1024*1024});
 writeFileSync(new URL(file,sourceRoot),bytes);
}
process.on('exit',()=>rmSync(fixtureDir,{recursive:true,force:true}));
const PROJECT=SHARED_PROJECT; // Target identifier only; all tests stay offline with synthetic owners/receipts.
const OTHER_PROJECT='abcd1234abcdefghijkl';
const target={projectRef:PROJECT,supabaseUrl:`https://${PROJECT}.supabase.co`};
const preflight=(b,s,n)=>rawPreflight(b,s,n,sourceRoot,target);
const now=Date.parse('2026-10-13T04:00:00Z');
const id='11111111-1111-4111-8111-111111111111';
const proof=()=>({url:'https://example.invalid/synthetic-only',observedAt:'2026-10-13T03:00:00Z',validUntil:'2026-10-14T04:00:00Z',sha256:'a'.repeat(64)});
const input=()=>({schemaVersion:'qa-activation-input/2',projectId:PROJECT,supabaseUrl:target.supabaseUrl,contextMode:MODE,ownerId:id,
 supplier:{provider:'qwen',recipient:'SYNTHETIC recipient; not a real provider assertion',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',termsVersion:'SYNTHETIC-terms-1',sourceRegion:'SYNTHETIC source',processingRegion:'unknown',storageRegion:'not disclosed',providerRetentionDisclosure:'unknown; supplier has not disclosed retention',evidence:proof()},
 pricing:{model:'qwen3.7-plus-2026-05-26',priceVersion:'synthetic-only-v1',currency:'CNY',mode:'flat',inputMicrosPerMillion:1000000,outputMicrosPerMillion:2000000,cachedInputMicrosPerMillion:null,evidence:proof(),coverage:{inputTokens:1000000,outputTokens:4096,allBillableComponentsIncluded:true}},
 budget:{limitMicros:10000000,taskLimitMicros:5000000,providerLimitMicros:10000000,attemptLimitMicros:2000000,taskAttemptLimit:8,concurrencyLimit:1,maxOutputTokens:128,timeoutMs:1000,evidence:proof()},
 validity:{effectiveAt:'2026-10-13T03:00:00Z',expiresAt:'2026-10-14T03:00:00Z',termsRecheckAt:'2026-10-14T03:00:00Z'},configuration:{id,version:1},targetReceipts:{projectRef:PROJECT,ownerId:id,configurationId:id,accountEvidenceHash:'b'.repeat(64),budgetEvidenceHash:'a'.repeat(64),observedAt:'2026-10-13T03:30:00Z'}});
const build=x=>generate(x??input(),{now,approvedTarget:target});
const snapshot=b=>({projectId:PROJECT,supabaseUrl:target.supabaseUrl,linkId:LINK,observedAt:'2026-10-13T03:30:00Z',migrations:[...migrationManifest.expected155],reviewedMigrations:[...migrationManifest.reviewedMissing80],migrationManifestHash:MIGRATION_MANIFEST_HASH,qaRpcPresent:true,qaReadyGroupsAcl:{signature:'public.qa_ready_groups_v2(integer,text,text,text)',serviceRoleExecute:true,publicExecute:false,anonExecute:false,authenticatedExecute:false},turnDataPrivatePresent:true,qaSchemaFingerprintMatches:true,backupRestore:{projectRef:PROJECT,backupVerified:true,restoreVerified:true,backupEvidenceHash:'b'.repeat(64),restoreEvidenceHash:'c'.repeat(64),baselineVersionSetHash:digest(migrationManifest.baseline75),observedAt:'2026-10-13T03:30:00Z'},accessBinding:{projectRef:PROJECT,sourceProjectRef:PROJECT,authorizedForTarget:true,rpcRole:'service_role',slotId:'SYNTHETIC-existing-owned-slot',holderId:'SYNTHETIC-original-holder',purpose:'qa_hosted_worker',evidenceHash:'b'.repeat(64),observedAt:'2026-10-13T03:30:00Z'},identityReceipts:{projectRef:PROJECT,ownerId:id,policyId:b.notice.policyId,noticeHash:b.noticeHash,scopeId:b.scopeInsertParameters.id,configurationId:id,hostedProfileHash:b.hostedProfileHash,endpoint:b.notice.supplier.endpoint,evidenceHash:'b'.repeat(64)},exactConsent:{projectRef:PROJECT,ownerId:id,policyId:b.notice.policyId,noticeHash:b.noticeHash,accepted:true,revoked:false,authSessionId:id,consentId:id,evidenceHash:'b'.repeat(64)},workerStopped:true,webDisabled:true,ownerId:id,existingPolicyIds:[],existingNoticeVersions:[],existingNoticeHashes:[],existingScopeIds:[],reviewedPackageHash:b.packageHash});
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
test('shared 75-plus-80 exact source set and verified recovery required; current75 stays blocked',()=>{
 const b=build(),s=snapshot(b);assert.equal(preflight(b,s,now).reviewReady,true);assert.deepEqual(preflight(b,s,now).blockers,[]);assert.equal(preflight(b,s,now).activationAllowed,false);
 for(const patch of [{migrations:migrationManifest.baseline75},{migrations:s.migrations.slice(1)},{migrations:[...s.migrations,'20269999000000']},{migrations:[...s.migrations].reverse()},{reviewedMigrations:s.reviewedMigrations.slice(1)},{reviewedMigrations:[...s.reviewedMigrations].reverse()},{reviewedMigrations:[...s.reviewedMigrations.slice(1),'20269999000000']},{migrationManifestHash:'a'.repeat(64)},{migrations:[...s.migrations.slice(1),'20269999000000']},{qaRpcPresent:false},{turnDataPrivatePresent:false},{qaSchemaFingerprintMatches:false},{backupRestore:{backupVerified:false}},{workerStopped:false},{webDisabled:false},{projectId:'another-project'},{linkId:'another-account'},{ownerId:'another-user'},{reviewedPackageHash:'c'.repeat(64)},{existingPolicyIds:[b.notice.policyId]},{existingNoticeHashes:[b.noticeHash]},{existingScopeIds:[b.scopeInsertParameters.id]},{observedAt:'2026-09-13T00:00:00Z'}]) {
  const failure={migrations:'EXACT_REVIEWED_155_MIGRATIONS',reviewedMigrations:'PINNED_SHARED_75_PLUS_80',migrationManifestHash:'PINNED_SHARED_75_PLUS_80',qaRpcPresent:'QA_SCHEMA',turnDataPrivatePresent:'QA_SCHEMA',qaSchemaFingerprintMatches:'QA_SCHEMA',backupRestore:'VERIFIED_SHARED_BACKUP_RESTORE',workerStopped:'STOPPED_HOST_AND_WEB',webDisabled:'STOPPED_HOST_AND_WEB',projectId:'CURRENT_SHARED_TARGET',linkId:'CURRENT_SHARED_TARGET',ownerId:'OWNER',reviewedPackageHash:'EXACT_PACKAGE_REVIEW',existingPolicyIds:'FRESH_POLICY_ONLY',existingNoticeHashes:'FRESH_POLICY_ONLY',existingScopeIds:'FRESH_BUDGET_ONLY',observedAt:'STALE_OBSERVATION',supabaseUrl:'CURRENT_SHARED_TARGET',accessBinding:'CURRENT_TRUSTED_ACCESS_SLOT',identityReceipts:'TARGET_IDENTITY_RECEIPTS',exactConsent:'EXACT_CURRENT_TARGET_CONSENT'}[Object.keys(patch)[0]];
  assert.ok(failure);assert.ok(preflight(b,{...s,...patch},now).blockers.includes(failure),failure);
 }
 assert.equal(preflight(b,s,now+2*86400000).reviewReady,false);
});
test('diagnostic binding rejects cross user, auth session, QA Session, mode, policy, scope and attempt',()=>{
 const expected={projectRef:PROJECT,supabaseUrl:target.supabaseUrl,ownerId:id,authSessionId:id,sessionId:id,turnId:id,leaseToken:id,policyId:id,noticeHash:'a'.repeat(64),scopeId:id,contextMode:MODE};
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
test('public source candidate cannot become an activatable package with missing account and budget evidence',()=>{
 const candidate=JSON.parse(readFileSync(new URL('../../../artifacts/QAWEB/activation/supplier-price-candidate.json',import.meta.url),'utf8'));
 assert.equal(candidate.status,'UNPUBLISHED_DISABLED');assert.equal(candidate.activationAllowed,false);assert.equal(candidate.accountVerified,false);
 assert.equal(candidate.inputCandidate.supplier.endpoint,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
 assert.equal(candidate.inputCandidate.pricing.model,'qwen3.7-plus-2026-05-26');
 assert.equal(candidate.inputCandidate.pricing.coverage.allBillableComponentsIncluded,true);
 assert.equal(candidate.inputCandidate.pricing.coverage.inputTokens,1000000);
 assert.throws(()=>build(candidate.inputCandidate),/TARGET_OR_MODE/);
 const x=input();x.pricing={...candidate.inputCandidate.pricing,evidence:proof()};x.pricing.coverage={...x.pricing.coverage,allBillableComponentsIncluded:false};assert.throws(()=>build(x),/PRICE_COVERAGE/);
});
test('6/24 upper-tier arithmetic preserves full-context reserve without cache or free-quota discounts',()=>{
 const x=input();x.pricing.inputMicrosPerMillion=6000000;x.pricing.outputMicrosPerMillion=24000000;
 x.budget.limitMicros=20000000;x.budget.providerLimitMicros=20000000;x.budget.taskLimitMicros=10000000;x.budget.attemptLimitMicros=7000000;
 assert.equal(build(x).hostedProfile.qwen.reservedMicros,6294528);
 x.budget.maxOutputTokens=4096;assert.equal(build(x).hostedProfile.qwen.reservedMicros,6389760);
 x.budget.attemptLimitMicros=6389759;assert.throws(()=>build(x),/UNDER_RESERVED/);
});

test('stable Main migration hash and actual v2 QA RPC ACL are mandatory; v1 and source drift are blocked',()=>{
 const b=build(),s=snapshot(b);
 const metadata=readFileSync(new URL('../../../scripts/qa-agent-activation/metadata.sql',import.meta.url),'utf8');
 assert.equal(metadata.match(/public\.qa_ready_groups_v2\(integer,text,text,text\)/g)?.length,5);
 assert.doesNotMatch(metadata,/qa_ready_groups_v1\(/);
 for(const patch of [{qaReadyGroupsAcl:null},{qaReadyGroupsAcl:{...s.qaReadyGroupsAcl,signature:'public.qa_ready_groups_v1(integer)'}},{qaReadyGroupsAcl:{...s.qaReadyGroupsAcl,signature:'public.qa_ready_groups_v2(integer)'}},{qaReadyGroupsAcl:{...s.qaReadyGroupsAcl,signature:'public.text_ready_groups_v1(integer)'}},...['publicExecute','anonExecute','authenticatedExecute'].map(k=>({qaReadyGroupsAcl:{...s.qaReadyGroupsAcl,[k]:true}})),{qaReadyGroupsAcl:{...s.qaReadyGroupsAcl,serviceRoleExecute:false}}]) assert.ok(preflight(b,{...s,...patch},now).blockers.includes('QA_READY_GROUPS_SERVICE_ROLE_ONLY'));
 const file=new URL('20261013050429_qa_agent_web.sql',sourceRoot),original=readFileSync(file);
 try {writeFileSync(file,Buffer.concat([original,Buffer.from('\n-- drift')]));assert.ok(preflight(b,s,now).blockers.includes('SOURCE_MIGRATION_DRIFT'));} finally {writeFileSync(file,original);}
 assert.equal(preflight(b,s,now).reviewReady,true);assert.deepEqual(preflight(b,s,now).blockers,[]);
});

test('official legal input fee stays below unchanged full-context reserve; incomplete coverage rejects',()=>{
 const x=input();x.pricing.inputMicrosPerMillion=6000000;x.pricing.outputMicrosPerMillion=24000000;
 x.budget.limitMicros=20000000;x.budget.providerLimitMicros=20000000;x.budget.taskLimitMicros=10000000;x.budget.attemptLimitMicros=7000000;x.budget.maxOutputTokens=4096;
 // Official qwen3-7-plus snapshot: input 991808, context 1000000.
 // 32768 is serialized message BYTES, not measured provider tokens.
 const legalMaximumMicros=(991808n*6000000n+4096n*24000000n+999999n)/1000000n;
 assert.equal(legalMaximumMicros,6049152n);assert.equal(build(x).hostedProfile.qwen.reservedMicros,6389760);
 assert.ok(legalMaximumMicros<=BigInt(build(x).hostedProfile.qwen.reservedMicros));
 for(const mutate of [p=>delete p.coverage,p=>delete p.coverage.allBillableComponentsIncluded,p=>p.coverage.allBillableComponentsIncluded=false,p=>p.coverage.inputTokens=1048576,p=>p.coverage.inputTokens=32768]) {
  const bad=structuredClone(x);mutate(bad.pricing);assert.throws(()=>build(bad),/PRICE_SCHEMA|PRICE_COVERAGE/);
 }
});
test('CLI fixture uses official coverage with unchanged disabled output and reservation',()=>{
 const x=input(),time=Date.now(),iso=n=>new Date(n).toISOString();
 x.targetReceipts.observedAt=iso(time-1000);
 for(const section of ['supplier','pricing','budget'])x[section].evidence={...proof(),observedAt:iso(time-1000),validUntil:iso(time+86400000)};
 x.validity={effectiveAt:iso(time-1000),expiresAt:iso(time+3600000),termsRecheckAt:iso(time+3600000)};
 const source=new URL('cli-input.json',sourceRoot),output=new URL('cli-output.json',sourceRoot),targetFile=new URL('operator-target.json',sourceRoot);
 writeFileSync(targetFile,JSON.stringify(target));
 writeFileSync(source,JSON.stringify(x));
 execFileSync(process.execPath,[new URL('../../../scripts/qa-agent-activation/cli.mjs',import.meta.url).pathname,'generate',source.pathname,output.pathname,targetFile.pathname]);
 const b=JSON.parse(readFileSync(output));assert.equal(b.activationAllowed,false);assert.equal(b.scopeInsertParameters.enabled,false);assert.equal(b.hostedProfile.qwen.reservedMicros,1048832);
});

test('shared target is allowed only by explicit operator binding; missing or wrong project and URL fail closed',()=>{
 assert.deepEqual(validateTarget(target),target);assert.throws(()=>generate(input(),{now}),/OPERATOR_TARGET_REQUIRED/);
 for(const projectRef of [undefined,'',OTHER_PROJECT,'ABCdefghijklmnopqrst','abcdefghijklmnopqrs','abcdefghijklmnopqrstu','abcd-234abcdefghijkl']) assert.throws(()=>validateTarget({projectRef,supabaseUrl:`https://${projectRef}.supabase.co`}));
 for(const supabaseUrl of [target.supabaseUrl+'/',target.supabaseUrl+':443',target.supabaseUrl+'?x=1',target.supabaseUrl+'#x',target.supabaseUrl+'/rest/v1','https://user:pass@'+PROJECT+'.supabase.co',`https://${OTHER_PROJECT}.supabase.co`]) assert.throws(()=>validateTarget({...target,supabaseUrl}));
 for(const patch of [{projectId:OTHER_PROJECT,supabaseUrl:`https://${OTHER_PROJECT}.supabase.co`},{supabaseUrl:target.supabaseUrl+'/'}]) assert.throws(()=>build({...input(),...patch}),/TARGET_OR_MODE/);
 const b=build();assert.equal(b.hostedProfile.schemaVersion,'vpj07-hosted-text-worker/4');assert.equal(b.hostedProfile.projectRef,PROJECT);
 assert.equal(b.notice.projectRef,PROJECT);assert.equal(b.serverEnvironment.VISEPANDA_QA_SUPABASE_PROJECT_REF,PROJECT);
 assert.deepEqual(b.initialization.fromMigrations,migrationManifest.baseline75);assert.equal(b.initialization.missingMigrations.length,80);assert.equal(b.initialization.toMigrations.length,155);
 assert.equal(b.accessRequirements.valuesIncluded,false);assert.equal(b.accessRequirements.existingOwnedSlotsPermitted,true);assert.equal(b.activationAllowed,false);
});
test('current trusted owned slot is valid; backup, role, foreign job receipts and absent exact consent fail closed',()=>{
 for(const change of [x=>x.targetReceipts.projectRef=OTHER_PROJECT,x=>delete x.targetReceipts,x=>x.targetReceipts.ownerId='other',x=>x.targetReceipts.accountEvidenceHash=null,x=>x.targetReceipts.budgetEvidenceHash='b'.repeat(64)]) {const x=input();change(x);assert.throws(()=>build(x));}
 const b=build(),s=snapshot(b);
 const current=preflight(b,{...s,existingPolicyIds:['old-disabled-policy'],existingNoticeVersions:['old-version'],existingNoticeHashes:['a'.repeat(64)],existingScopeIds:['old-disabled-budget']},now);
 assert.deepEqual(current.blockers,[]); // Existing dzt slot/inventory does not require new keys.
 for(const patch of [{supabaseUrl:`https://${OTHER_PROJECT}.supabase.co`},{backupRestore:null},{backupRestore:{...s.backupRestore,backupVerified:false}},{backupRestore:{...s.backupRestore,restoreVerified:false}},{backupRestore:{...s.backupRestore,baselineVersionSetHash:'a'.repeat(64)}},{backupRestore:{...s.backupRestore,projectRef:OTHER_PROJECT}},{accessBinding:{...s.accessBinding,sourceProjectRef:OTHER_PROJECT}},{accessBinding:{...s.accessBinding,authorizedForTarget:false}},{accessBinding:{...s.accessBinding,rpcRole:'authenticated'}},{accessBinding:{...s.accessBinding,slotId:null}},{accessBinding:null},{identityReceipts:{...s.identityReceipts,projectRef:OTHER_PROJECT}},{identityReceipts:{...s.identityReceipts,scopeId:'old-budget'}},{identityReceipts:{...s.identityReceipts,policyId:'old-policy'}},{identityReceipts:{...s.identityReceipts,hostedProfileHash:'a'.repeat(64)}},{exactConsent:null},{exactConsent:{...s.exactConsent,accepted:false}},{exactConsent:{...s.exactConsent,revoked:true}},{exactConsent:{...s.exactConsent,projectRef:OTHER_PROJECT}},{exactConsent:{...s.exactConsent,noticeHash:'a'.repeat(64)}},{existingPolicyIds:[b.notice.policyId]},{existingScopeIds:[b.scopeInsertParameters.id]}]) {
  const failure={supabaseUrl:'CURRENT_SHARED_TARGET',backupRestore:'VERIFIED_SHARED_BACKUP_RESTORE',accessBinding:'CURRENT_TRUSTED_ACCESS_SLOT',identityReceipts:'TARGET_IDENTITY_RECEIPTS',exactConsent:'EXACT_CURRENT_TARGET_CONSENT',existingPolicyIds:'FRESH_POLICY_ONLY',existingScopeIds:'FRESH_BUDGET_ONLY'}[Object.keys(patch)[0]];
  assert.ok(preflight(b,{...s,...patch},now).blockers.includes(failure),failure);
 }
 const swapped=structuredClone(b);swapped.hostedProfile.projectRef=OTHER_PROJECT;const {packageHash,...body}=swapped;swapped.packageHash=digest(body);assert.throws(()=>preflight(swapped,s,now),/PACKAGE_CHANGED|QA hosted profile unavailable/);
});
test('missing pinned source file fails closed without repository mutation',()=>{
 const name=Object.keys(migrationManifest.sourceSha256)[0],file=new URL(name,sourceRoot),bytes=readFileSync(file);
 try {rmSync(file);assert.ok(preflight(build(),snapshot(build()),now).blockers.includes('SOURCE_MIGRATION_DRIFT'));} finally {writeFileSync(file,bytes);}
});

test('shared operator target works through offline CLI; a different job target cannot override it',()=>{
 const x=input(),time=Date.now(),iso=n=>new Date(n).toISOString();x.targetReceipts.observedAt=iso(time-1000);
 for(const section of ['supplier','pricing','budget'])x[section].evidence={...proof(),observedAt:iso(time-1000),validUntil:iso(time+86400000)};
 x.validity={effectiveAt:iso(time-1000),expiresAt:iso(time+3600000),termsRecheckAt:iso(time+3600000)};
 const source=new URL('shared-input.json',sourceRoot),targetFile=new URL('shared-target.json',sourceRoot),output=new URL('shared-output.json',sourceRoot);
 writeFileSync(source,JSON.stringify(x));writeFileSync(targetFile,JSON.stringify(target));
 execFileSync(process.execPath,[new URL('../../../scripts/qa-agent-activation/cli.mjs',import.meta.url).pathname,'generate',source.pathname,output.pathname,targetFile.pathname]);
 const b=JSON.parse(readFileSync(output));assert.equal(b.projectId,SHARED_PROJECT);assert.equal(b.activationAllowed,false);
 assert.equal(b.profileValidation,'BACKEND_TYPED_VALIDATED');
 assert.throws(()=>generate({...x,projectId:OTHER_PROJECT,supabaseUrl:`https://${OTHER_PROJECT}.supabase.co`},{now:time,approvedTarget:target}),/TARGET_OR_MODE/);
});

test('formal profile4 and worker job2 bind the operator root and cannot bypass pending recovery',()=>{
 const b=build(),s=snapshot(b);assert.equal(b.profileValidation,'BACKEND_TYPED_VALIDATED');
 assert.equal(b.workerJobCandidate.schemaVersion,'qa-agent-worker/2');assert.equal(b.workerJobCandidate.projectRef,PROJECT);assert.equal(b.workerJobCandidate.databaseUrl,target.supabaseUrl);
 assert.equal(b.workerJobCandidate.ownerId,b.scopeInsertParameters.owner_id);assert.equal(b.workerJobCandidate.policyId,b.notice.policyId);assert.equal(b.workerJobCandidate.budget.scopeId,b.scopeInsertParameters.id);
 for(const change of [x=>delete x.hostedProfile.projectRef,x=>x.hostedProfile.schemaVersion='vpj07-hosted-text-worker/3',x=>x.hostedProfile.projectRef=OTHER_PROJECT,x=>x.workerJobCandidate.projectRef=OTHER_PROJECT,x=>x.workerJobCandidate.databaseUrl=`https://${OTHER_PROJECT}.supabase.co`,x=>x.workerJobCandidate.budget.scopeId='wrong-scope',x=>x.workerJobCandidate.policyId='old-policy']) {
  const altered=structuredClone(b);change(altered);const {packageHash,...body}=altered;altered.packageHash=digest(body);assert.throws(()=>preflight(altered,s,now));
 }
 const pending=preflight(b,{...s,backupRestore:{...s.backupRestore,backupVerified:false,restoreVerified:false}},now);
 assert.ok(pending.blockers.includes('VERIFIED_SHARED_BACKUP_RESTORE'));assert.equal(pending.reviewReady,false);assert.equal(pending.activationAllowed,false);
});
