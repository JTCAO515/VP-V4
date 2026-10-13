/** Offline only. No environment credentials, database client, transport or worker execution. */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PROTOCOL_MODELS } from '../../lib/server/model-gateway/adapters/provider-protocol.ts';
import { isQwenEndpoint } from '../../lib/server/model-gateway/adapters/provider-endpoints.ts';
import { parseQaHostedProfile } from '../../lib/server/qa-agent/hosted-profile.ts';
export const SHARED_PROJECT = 'dzqdzetcctkhbrhlxxgn';
export const LINK = 'link_6acdbe0471c081919ff47de24ca53b0f';
export const MODE = 'qa_session_history_v1';
export const MIGRATION_MANIFEST_HASH = '230500975ecbd08df8eb1663b073ae96a11c79f3f2806d611fc5ce2d0a2e2a2f';
const manifestBytes=readFileSync(new URL('./migration-manifest.json',import.meta.url));
if (createHash('sha256').update(manifestBytes).digest('hex')!==MIGRATION_MANIFEST_HASH) throw Error('MIGRATION_MANIFEST_CHANGED');
export const migrationManifest=JSON.parse(manifestBytes);
function sourceMigrationsMatch(root=new URL('../../supabase/migrations/',import.meta.url)) {
  try {
  const files=readdirSync(root).filter(x=>x.endsWith('.sql')).sort();
  return JSON.stringify(files)===JSON.stringify(Object.keys(migrationManifest.sourceSha256).sort())
    && files.every(f=>createHash('sha256').update(readFileSync(new URL(f,root))).digest('hex')===migrationManifest.sourceSha256[f]);
  } catch { return false; }
}
const template = JSON.parse(readFileSync(new URL('../../artifacts/QAWEB/sql-20261013/policy-notice-template.json', import.meta.url), 'utf8'));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const fail = code => { throw new Error(code); };
const exact = (x, keys, code) => {
  if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).sort().join('|') !== keys.split(' ').sort().join('|')) fail(code);
};
const str = (x, max=200) => typeof x === 'string' && x === x.trim() && x.length > 0 && x.length <= max && !/[\x00-\x1f]|\{\{|\}\}/.test(x);
const int = (x, max=1_000_000_000_000) => Number.isSafeInteger(x) && x > 0 && x <= max;
const stamp = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(x) && Number.isFinite(Date.parse(x));
const https = x => { try { const u=new URL(x); return u.protocol==='https:' && !u.username && !u.password && !u.search && !u.hash; } catch { return false; } };
export const canonical = x => JSON.stringify(sort(x));
function sort(x) { return Array.isArray(x) ? x.map(sort) : x && typeof x==='object' ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])) : x; }
export const digest = x => createHash('sha256').update(canonical(x)).digest('hex');
function evidence(x, now, code) {
  exact(x, 'url observedAt validUntil sha256', code);
  if (!https(x.url) || !HASH.test(x.sha256) || !stamp(x.observedAt) || !stamp(x.validUntil)
    || Date.parse(x.observedAt)>now || now-Date.parse(x.observedAt)>7*86400000 || Date.parse(x.validUntil)<=now) fail(code);
}
function clean(x) {
  if (x && typeof x==='object') for (const [k,v] of Object.entries(x)) {
    if (/secret|password|credential|authorization|cookie|api.?key|access.?token/i.test(k)) fail('SECRET_FIELD_REJECTED');
    clean(v);
  }
  if (typeof x==='string' && /(?:Bearer\s|sk-[A-Za-z0-9]{12}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/.test(x)) fail('SECRET_VALUE_REJECTED');
}
export function validateTarget(binding) {
  exact(binding, 'projectRef supabaseUrl', 'OPERATOR_TARGET_REQUIRED');
  if (typeof binding.projectRef!=='string' || !/^[a-z0-9]{20}$/.test(binding.projectRef) || binding.projectRef!==SHARED_PROJECT
    || binding.supabaseUrl!==`https://${binding.projectRef}.supabase.co`) fail('CURRENT_SHARED_TARGET_BINDING');
  return Object.freeze({...binding});
}
function targetReceipts(r, input, now) {
  exact(r, 'projectRef ownerId configurationId accountEvidenceHash budgetEvidenceHash observedAt', 'TARGET_RECEIPTS');
  if (r.projectRef!==input.projectId || r.ownerId!==input.ownerId || r.configurationId!==input.configuration.id
    || !HASH.test(r.accountEvidenceHash) || r.budgetEvidenceHash!==input.budget.evidence.sha256
    || !stamp(r.observedAt) || Date.parse(r.observedAt)>now || now-Date.parse(r.observedAt)>3600000) fail('TARGET_RECEIPTS');
}
// Closed /4 interface candidate. Stable backend validation is required before delivery.
function boundProfile(profile) {
  const {projectRef,...legacyShape}=profile;
  validateTarget({projectRef,supabaseUrl:`https://${projectRef}.supabase.co`});
  if (profile.schemaVersion!=='vpj07-hosted-text-worker/4') fail('BOUND_PROFILE');
  // Reuse the accepted tariff/limits validator offline; this never invokes its worker.
  const validated=parseQaHostedProfile({...legacyShape,schemaVersion:'vpj07-hosted-text-worker/3'});
  return Object.freeze({...validated,schemaVersion:'vpj07-hosted-text-worker/4',projectRef});
}
export function generate(input, { now = Date.now(), approvedTarget } = {}) {
  clean(input);
  const target=validateTarget(approvedTarget);
  exact(input, 'schemaVersion projectId supabaseUrl contextMode ownerId supplier pricing budget validity configuration targetReceipts', 'INPUT_SCHEMA');
  if (input.schemaVersion!=='qa-activation-input/2' || input.projectId!==target.projectRef || input.supabaseUrl!==target.supabaseUrl || input.contextMode!==MODE || !UUID.test(input.ownerId)) fail('TARGET_OR_MODE');
  const s=input.supplier, p=input.pricing, b=input.budget, v=input.validity, c=input.configuration;
  exact(s, 'provider recipient endpoint termsVersion sourceRegion processingRegion storageRegion providerRetentionDisclosure evidence', 'SUPPLIER_SCHEMA');
  if (s.provider!=='qwen' || !isQwenEndpoint(s.endpoint) || !str(s.recipient) || /^(unknown|not disclosed)$/i.test(s.recipient)) fail('PROVIDER_BINDING');
  for (const k of ['termsVersion','sourceRegion','processingRegion','storageRegion','providerRetentionDisclosure']) if (!str(s[k],k==='providerRetentionDisclosure'?1200:100)) fail('DISCLOSURE_REQUIRED');
  // Unknown regions / retention are deliberately expressible, never replaced by invented facts.
  evidence(s.evidence,now,'SUPPLIER_EVIDENCE');
  exact(p, 'model priceVersion currency mode inputMicrosPerMillion outputMicrosPerMillion cachedInputMicrosPerMillion evidence coverage', 'PRICE_SCHEMA');
  if (p.model!==PROTOCOL_MODELS.qwen || !/^[A-Za-z0-9._-]{1,100}$/.test(p.priceVersion) || !['CNY','USD'].includes(p.currency)
    || !['flat','cache_split'].includes(p.mode) || !int(p.inputMicrosPerMillion) || !int(p.outputMicrosPerMillion)
    || (p.mode==='flat'?p.cachedInputMicrosPerMillion!==null:!int(p.cachedInputMicrosPerMillion))) fail('PRICE_UNKNOWN_OR_INVALID');
  evidence(p.evidence,now,'PRICE_EVIDENCE');
  exact(p.coverage, 'inputTokens outputTokens allBillableComponentsIncluded', 'PRICE_COVERAGE');
  // Official tariff range, not the larger conservative monetary reservation basis below.
  if (p.coverage.inputTokens!==1000000 || !int(p.coverage.outputTokens,4096) || p.coverage.allBillableComponentsIncluded!==true) fail('PRICE_COVERAGE');
  exact(b, 'limitMicros taskLimitMicros providerLimitMicros attemptLimitMicros taskAttemptLimit concurrencyLimit maxOutputTokens timeoutMs evidence', 'BUDGET_SCHEMA');
  evidence(b.evidence,now,'BUDGET_EVIDENCE');
  for (const k of ['limitMicros','taskLimitMicros','providerLimitMicros','attemptLimitMicros']) if (!int(b[k])) fail('BUDGET_LIMIT');
  if (!int(b.taskAttemptLimit,8) || b.concurrencyLimit!==1 || !int(b.maxOutputTokens,4096) || !int(b.timeoutMs,60000)
    || b.maxOutputTokens>p.coverage.outputTokens || b.taskLimitMicros>b.limitMicros || b.providerLimitMicros>b.limitMicros
    || b.attemptLimitMicros>b.taskLimitMicros || b.attemptLimitMicros>b.providerLimitMicros) fail('BUDGET_LIMIT');
  const worst=(1048576n*BigInt(Math.max(p.inputMicrosPerMillion,p.cachedInputMicrosPerMillion??0))+BigInt(b.maxOutputTokens)*BigInt(p.outputMicrosPerMillion)+999999n)/1000000n;
  if (worst>BigInt(b.attemptLimitMicros) || worst<1n) fail('UNDER_RESERVED');
  exact(v, 'effectiveAt expiresAt termsRecheckAt', 'VALIDITY_SCHEMA');
  if (!Object.values(v).every(stamp) || Date.parse(v.effectiveAt)>now || Date.parse(v.expiresAt)<=now || Date.parse(v.termsRecheckAt)<=now
    || Date.parse(v.expiresAt)>now+7*86400000 || Date.parse(v.termsRecheckAt)>Date.parse(s.evidence.validUntil)
    || Date.parse(v.expiresAt)>Math.min(Date.parse(p.evidence.validUntil),Date.parse(b.evidence.validUntil))) fail('VALIDITY');
  exact(c, 'id version', 'CONFIGURATION_SCHEMA');
  if (!UUID.test(c.id) || !int(c.version,Number.MAX_SAFE_INTEGER)) fail('CONFIGURATION');
  targetReceipts(input.targetReceipts,input,now);
  const policyId=randomUUID(), scopeId=randomUUID(), noticeVersion='qa-v1-'+randomUUID();
  const replacements={...s,endpointDisclosure:s.endpoint};
  const render=lang=>template[lang].replace(/\{\{([A-Za-z]+)\}\}/g,(_,key)=>replacements[key]??fail('TEMPLATE_FIELD'))
    + (lang==='zh'?` 条款版本：${s.termsVersion}。`:` Terms version: ${s.termsVersion}.`);
  const notice={projectRef:target.projectRef,policyId,noticeVersion,contextMode:MODE,noticeZh:render('zh'),noticeEn:render('en'),supplier:s,
    limits:{maxTotalTurns:8,maxPriorPairs:7,maxSerializedHistoryBytes:65536,maxSelectedHistoryPairs:3,maxSelectedContentBytes:16384,maxSerializedPromptBytes:32768},
    retention:'retain_after_hide_v1'};
  const noticeHash=digest(notice);
  const hostedProfile=boundProfile({schemaVersion:'vpj07-hosted-text-worker/4',projectRef:target.projectRef,pollIntervalMs:1000,maxLifetimeMs:60000,drainMs:10000,
    concurrency:1,groupLimit:1,modes:[MODE],planning:null,qwen:{priceVersion:p.priceVersion,
      pricing:{mode:p.mode,inputMicrosPerMillion:p.inputMicrosPerMillion,outputMicrosPerMillion:p.outputMicrosPerMillion,cachedInputMicrosPerMillion:p.cachedInputMicrosPerMillion},
      reservedMicros:Number(worst),maxOutputTokens:b.maxOutputTokens,timeoutMs:b.timeoutMs,configurationId:c.id,configurationVersion:c.version}});
  const result={schemaVersion:'qa-activation-review/2',projectId:target.projectRef,supabaseUrl:target.supabaseUrl,targetBinding:target,linkId:LINK,generatedAt:new Date(now).toISOString(),status:'UNPUBLISHED_DISABLED',
    activationAllowed:false,policyInserted:false,workerEnabled:false,profileValidation:'CANDIDATE_NOT_BACKEND_VERIFIED',migrationManifestHash:MIGRATION_MANIFEST_HASH,notice,noticeHash,inputDigest:digest(input),
    policyInsertParameters:{id:policyId,provider:s.provider,recipient:s.recipient,endpoint:s.endpoint,source_region:s.sourceRegion,processing_region:s.processingRegion,
      storage_region:s.storageRegion,terms_version:s.termsVersion,notice_version:noticeVersion,notice_hash:noticeHash,notice_zh:notice.noticeZh,notice_en:notice.noticeEn,
      retention:notice.retention,context_mode:MODE,effective_at:v.effectiveAt,expires_at:v.expiresAt,terms_recheck_at:v.termsRecheckAt,revoked_at:null},
    scopeInsertParameters:{id:scopeId,owner_id:input.ownerId,currency:p.currency,limit_micros:b.limitMicros,task_limit_micros:b.taskLimitMicros,
      task_attempt_limit:b.taskAttemptLimit,concurrency_limit:1,enabled:false,frozen:false,expires_at:v.expiresAt},
    providerLimitInsertParameters:{scope_id:scopeId,provider:s.provider,model:p.model,price_version:p.priceVersion,limit_micros:b.providerLimitMicros,attempt_limit_micros:b.attemptLimitMicros,enabled:false},
    hostedProfile,hostedProfileHash:digest(hostedProfile),sourceEvidence:{supplier:s.evidence,price:p.evidence,budget:b.evidence},targetReceipts:input.targetReceipts,
    initialization:{fromMigrations:migrationManifest.baseline75,missingMigrations:migrationManifest.reviewedMissing80,toMigrations:migrationManifest.expected155,sharedProductionDatabase:true,requiresVerifiedBackupRestore:true},
    accessRequirements:{projectRef:target.projectRef,existingOwnedSlotsPermitted:true,valuesIncluded:false,secureOperatorHandoffRequired:true,requiredTypes:['current target Web publishable access','current target prepared owned hosted worker access slot','separately authorized existing Qwen account access']},
    serverEnvironment:{VISEPANDA_QA_SUPABASE_PROJECT_REF:target.projectRef,NEXT_PUBLIC_SUPABASE_URL:target.supabaseUrl,VISEPANDA_QA_AGENT:'false',VISEPANDA_QA_AGENT_CONTEXT_MODE:MODE,VISEPANDA_QA_AGENT_POLICY_ID:policyId,VISEPANDA_QWEN_ENDPOINT:s.endpoint},
    consent:{projectRef:target.projectRef,required:true,via:'QA UI -> qa_accept_policy_v1',policyId,noticeHash,carryForward:false},
    attemptBinding:{projectRef:target.projectRef,ledger:'public.model_budget_attempts',attemptId:'leaseToken',taskId:'leased turnId',dispatch:'qa_authorize_dispatch_v1',unknownUsage:'pending; never zero/release after dispatch'}};
  return {...result,packageHash:digest(result)};
}
export function validatePackage(bundle, approvedTarget) {
  const target=validateTarget(approvedTarget);
  const {packageHash,...body}=bundle;
  if (!HASH.test(packageHash) || digest(body)!==packageHash || digest(bundle.notice)!==bundle.noticeHash
    || bundle.schemaVersion!=='qa-activation-review/2' || bundle.projectId!==target.projectRef || bundle.supabaseUrl!==target.supabaseUrl
    || canonical(bundle.targetBinding)!==canonical(target) || bundle.notice.projectRef!==target.projectRef
    || digest(bundle.hostedProfile)!==bundle.hostedProfileHash || bundle.hostedProfile.schemaVersion!=='vpj07-hosted-text-worker/4' || bundle.hostedProfile.projectRef!==target.projectRef
    || bundle.targetReceipts.projectRef!==target.projectRef || bundle.consent.projectRef!==target.projectRef || bundle.attemptBinding.projectRef!==target.projectRef
    || bundle.serverEnvironment.VISEPANDA_QA_SUPABASE_PROJECT_REF!==target.projectRef || bundle.serverEnvironment.NEXT_PUBLIC_SUPABASE_URL!==target.supabaseUrl || bundle.linkId!==LINK || bundle.notice.contextMode!==MODE
    || bundle.status!=='UNPUBLISHED_DISABLED' || bundle.activationAllowed!==false || bundle.workerEnabled!==false || bundle.policyInserted!==false
    || bundle.scopeInsertParameters.enabled!==false || bundle.providerLimitInsertParameters.enabled!==false) fail('PACKAGE_CHANGED');
}
/** Local evidence evaluation only: no evidence blob can grant runtime authority. */
export function preflight(bundle, observation, now=Date.now(), migrationRoot, approvedTarget) {
  const target=validateTarget(approvedTarget);
  validatePackage(bundle,target); clean(observation);
  const blockers=[]; const check=(ok,code)=>{if(!ok)blockers.push(code);};
  check(observation.projectId===target.projectRef && observation.supabaseUrl===target.supabaseUrl && observation.linkId===LINK,'CURRENT_SHARED_TARGET');
  check(stamp(observation.observedAt) && Date.parse(observation.observedAt)<=now && now-Date.parse(observation.observedAt)<=3600000,'STALE_OBSERVATION');
  check(canonical(observation.migrations)===canonical(migrationManifest.expected155),'EXACT_REVIEWED_155_MIGRATIONS');
  check(canonical(observation.reviewedMigrations)===canonical(migrationManifest.reviewedMissing80)
    && observation.migrationManifestHash===MIGRATION_MANIFEST_HASH && bundle.migrationManifestHash===MIGRATION_MANIFEST_HASH,'PINNED_SHARED_75_PLUS_80');
  check(sourceMigrationsMatch(migrationRoot),'SOURCE_MIGRATION_DRIFT');
  check(bundle.profileValidation==='BACKEND_TYPED_VALIDATED','PROFILE_VALIDATION_PENDING');
  // This field describes operator-bound hosted /4's actual v2 discovery RPC.
  const acl=observation.qaReadyGroupsAcl;
  check(acl?.signature==='public.qa_ready_groups_v2(integer,text,text,text)' && acl.serviceRoleExecute===true
    && acl.publicExecute===false && acl.anonExecute===false && acl.authenticatedExecute===false,'QA_READY_GROUPS_SERVICE_ROLE_ONLY');
  check(observation.qaRpcPresent===true && observation.turnDataPrivatePresent===true && observation.qaSchemaFingerprintMatches===true,'QA_SCHEMA');
  const recovery=observation.backupRestore;
  check(recovery?.projectRef===target.projectRef && recovery?.backupVerified===true && recovery?.restoreVerified===true
    && HASH.test(recovery?.backupEvidenceHash??'') && HASH.test(recovery?.restoreEvidenceHash??'')
    && recovery?.baselineVersionSetHash===digest(migrationManifest.baseline75)
    && stamp(recovery?.observedAt) && Date.parse(recovery.observedAt)<=now && now-Date.parse(recovery.observedAt)<=3600000,'VERIFIED_SHARED_BACKUP_RESTORE');
  const access=observation.accessBinding;
  check(access?.projectRef===target.projectRef && access?.sourceProjectRef===target.projectRef
    && access?.authorizedForTarget===true && access?.rpcRole==='service_role'
    && str(access?.slotId,100) && str(access?.holderId,100) && access?.purpose==='qa_hosted_worker'
    && HASH.test(access?.evidenceHash??'') && stamp(access?.observedAt)
    && Date.parse(access.observedAt)<=now && now-Date.parse(access.observedAt)<=3600000,'CURRENT_TRUSTED_ACCESS_SLOT');
  const receipts=observation.identityReceipts;
  check(receipts?.projectRef===target.projectRef && receipts?.ownerId===bundle.scopeInsertParameters.owner_id
    && receipts?.policyId===bundle.notice.policyId && receipts?.noticeHash===bundle.noticeHash
    && receipts?.scopeId===bundle.scopeInsertParameters.id && receipts?.configurationId===bundle.hostedProfile.qwen.configurationId
    && receipts?.hostedProfileHash===bundle.hostedProfileHash && receipts?.endpoint===bundle.notice.supplier.endpoint && HASH.test(receipts?.evidenceHash??''),'TARGET_IDENTITY_RECEIPTS');
  const consent=observation.exactConsent;
  check(consent?.projectRef===target.projectRef && consent?.ownerId===bundle.scopeInsertParameters.owner_id
    && consent?.policyId===bundle.notice.policyId && consent?.noticeHash===bundle.noticeHash && consent?.accepted===true
    && consent?.revoked===false && UUID.test(consent?.authSessionId??'') && UUID.test(consent?.consentId??'')
    && HASH.test(consent?.evidenceHash??''),'EXACT_CURRENT_TARGET_CONSENT');
  check(observation.workerStopped===true && observation.webDisabled===true,'STOPPED_HOST_AND_WEB');
  check(observation.ownerId===bundle.scopeInsertParameters.owner_id,'OWNER');
  check(Array.isArray(observation.existingPolicyIds) && !observation.existingPolicyIds.includes(bundle.notice.policyId)
    && Array.isArray(observation.existingNoticeVersions) && !observation.existingNoticeVersions.includes(bundle.notice.noticeVersion)
    && Array.isArray(observation.existingNoticeHashes) && !observation.existingNoticeHashes.includes(bundle.noticeHash),'FRESH_POLICY_ONLY');
  check(Array.isArray(observation.existingScopeIds) && !observation.existingScopeIds.includes(bundle.scopeInsertParameters.id),'FRESH_BUDGET_ONLY');
  for(const [name,proof] of Object.entries(bundle.sourceEvidence)) { try { evidence(proof,now,'STALE'); } catch { blockers.push('STALE_'+name.toUpperCase()); } }
  check(Date.parse(bundle.policyInsertParameters.expires_at)>now && Date.parse(bundle.policyInsertParameters.terms_recheck_at)>now,'POLICY_EXPIRED');
  check(observation.reviewedPackageHash===bundle.packageHash,'EXACT_PACKAGE_REVIEW');
  try {targetReceipts(bundle.targetReceipts,{projectId:bundle.projectId,ownerId:bundle.scopeInsertParameters.owner_id,configuration:{id:bundle.hostedProfile.qwen.configurationId},budget:{evidence:bundle.sourceEvidence.budget}},now);} catch {blockers.push('STALE_TARGET_RECEIPTS');}
  return {schemaVersion:'qa-activation-preflight/2',projectId:target.projectRef,supabaseUrl:target.supabaseUrl,packageHash:bundle.packageHash,
    reviewReady:blockers.length===0,activationAllowed:false,blockers,provider:'UNRUN',auth:'UNRUN',deployment:'UNRUN',
    disclaimer:'Operator-supplied evidence only. No credentials, consent, activation or runtime authorization produced.'};
}
/** Diagnostic equality check; never called by the runtime and never a consent substitute. */
export function checkBinding(expected, actual) {
  const keys=['projectRef','supabaseUrl','ownerId','authSessionId','sessionId','turnId','leaseToken','policyId','noticeHash','scopeId','contextMode'];
  let target;try {target=validateTarget({projectRef:expected.projectRef,supabaseUrl:expected.supabaseUrl});} catch {return false;}
  return target && keys.every(k=>typeof expected[k]==='string' && expected[k].length>0 && expected[k]===actual[k])
    && expected.contextMode===MODE && actual.consentAccepted===true && actual.clientModel===undefined;
}
