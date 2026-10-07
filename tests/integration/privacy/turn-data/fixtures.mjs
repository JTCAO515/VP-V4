import { TURN_SCHEMA, TURN_BOUNDARIES, ERASED_KEYS, REDACTED_KEYS, RETAINED_KEYS, GRAPH_KEYS, REFERENCE_KEYS, turnDigest } from '../../../../lib/server/privacy/turn-data/contract.ts';
import { TURN_SOURCE_SCHEMA } from '../../../../lib/server/privacy/turn-data/export.ts';
import { exportCanonical } from '../../../../lib/server/privacy/export-dispatcher.ts';
import { createHash } from 'node:crypto';
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const now = 1791388800000;
export const actor = { ownerId:id(1),sessionId:id(2),mobileEpoch:3 };
export const selection = { scope:'turn-sensitive-data/1',requestId:id(3),turnId:id(4),objectIds:[] };
export const command = { action:'erase',...selection,sourceDigest:'a'.repeat(64),previewDigest:'b'.repeat(64),confirmed:true };
export const bytes = `  ${JSON.stringify(command)}\n`;
export const sourceAuthorities = [{ policyId:id(20),consentId:id(21) }];
export const zero = keys => Object.fromEntries(keys.map(k=>[k,0]));
export const graph = { ...zero(GRAPH_KEYS),turnIds:[id(4)],messageIds:[id(5)],artifactIds:[] };
export const references = { ...Object.fromEntries(REFERENCE_KEYS.map(k=>[k,[]])),taskIds:[id(6)],threadIds:[id(7)],conversationIds:[id(8)],goalIds:[id(9)] };
export const eraseCounts = { ...zero(ERASED_KEYS),events:2,work:1,sourceReceipts:1 };
export const redactCounts = { ...zero(REDACTED_KEYS),textBodies:1,messageBodies:1,taskDigests:1 };
export const retainCounts = { ...zero(RETAINED_KEYS),turns:1,messages:1,tasks:1,taskTurns:1,threads:1,conversations:1,goals:1 };
export const binding = { schemaVersion:TURN_SCHEMA,...selection,...actor,sourceDigest:command.sourceDigest,previewDigest:command.previewDigest,
  sourceAuthorities,capturedAt:now,expiresAt:now+30000,boundaries:TURN_BOUNDARIES[selection.scope],allUserDataCompleted:false };
export const preview = () => structuredClone({ ...binding,kind:'preview',graph,eraseCounts,redactCounts,retainCounts,retainedReferences:references,conflicts:[],eligible:true,progressCount:0 });
export const decision = () => structuredClone({ requestDigest:turnDigest(bytes),decidedAt:now+10,graph,erasedCounts:eraseCounts,redactedCounts:redactCounts,retainedCounts:retainCounts,
  clearedPreviews:0,retainedFences:2,sourceTurn:'erased',parentData:'selected_digest_redacted',sourceTrip:'not_modified',explicitMemory:'not_modified',financialData:'not_modified',externalCopies:'not_erased' });
export const receipt = () => structuredClone({ ...binding,kind:'receipt',state:'erased',decision:decision() });
export const operation = () => structuredClone({ ...selection,...actor,sourceDigest:binding.sourceDigest,previewDigest:binding.previewDigest,sourceAuthorities,capturedAt:now,expiresAt:now+30000,
  requestDigest:turnDigest(bytes),state:'erased',previewErased:true,graph:null,eraseCounts:null,redactCounts:null,retainCounts:null,retainedReferences:null,conflicts:null,decision:decision() });
export const lease = () => ({ requestId:id(30),ownerId:actor.ownerId,leaseId:id(31),generation:1,expiresAt:new Date(now+60000).toISOString() });
export function snapshot() {
  const sources = TURN_SOURCE_SCHEMA.map(s=>({ relation:s.relation,rows:[] }));
  const row = { id:selection.turnId,owner_id:actor.ownerId,trip_id:null,status:'completed',created_at:new Date(now-200).toISOString(),thread_id:id(7),updated_at:new Date(now-100).toISOString() };
  sources.find(s=>s.relation==='public.turns').rows=[row];
  sources.find(s=>s.relation==='turn_private.text_content').rows=[{ turn_id:selection.turnId,owner_id:actor.ownerId,thread_id:id(7),policy_id:id(20),consent_id:id(21),locale:'zh',input_text:'真实用户输入',output_kind:'answered',output_text:'原始输出',hidden_at:null,created_at:row.created_at }];
  return { ownerId:actor.ownerId,sources,sourceAuthorities:structuredClone(sourceAuthorities),operations:[],fences:[],sourceRows:{data:2,operations:0,fences:0} };
}
export function page(item=snapshot()) {
  return { schemaVersion:'turn-core-export/1',section:'snapshot',sourceDigest:createHash('sha256').update(exportCanonical({snapshot:[item]}),'utf8').digest('hex'),items:[item],hasMore:false,nextCursor:null,sectionComplete:true };
}
