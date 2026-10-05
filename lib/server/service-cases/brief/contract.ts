import { exact, record, uuid, milliseconds } from '../operations/contract.ts';

export const BRIEF_NOTICE = 'case-minimal-brief/1' as const;
export const revision = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 9007199254740990;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !v.includes('\0');
export const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export type BriefFieldName = 'problem' | 'travel_pace' | 'preference' | 'budget' | 'requirements' | 'response_detail';
export type BriefSources = Readonly<{ profilePace: boolean; memories: readonly Readonly<{ id: string; revision: number }>[]; intakeMessageId: string | null }>;
export type BriefSource = Readonly<{
  kind: 'case' | 'profile_pace' | 'memory' | 'intake'; id: string; revision: number;
  updatedAt: number; receiptId: string | null; consentId: string | null; basisDigest: string;
}>;
export type BriefValue = string | Readonly<{ currency: 'CNY' | 'USD' | 'EUR' | 'GBP'; perNightMinorUnits: number }>
  | Readonly<{ city: string | null; durationDays: number | null; partySize: number | null; interests: readonly string[] | null; dates: Readonly<{ startDate: string; endDate: string }> | null; mobilityConstraints: readonly string[] | null }>;
export type BriefField = Readonly<{ key: string; field: BriefFieldName; state: 'unknown' }>
  | Readonly<{ key: string; field: BriefFieldName; state: 'available'; value: BriefValue; provenance: 'explicit' | 'inferred'; source: BriefSource }>;
export type BriefBinding = Readonly<{ caseId: string; ownerId: string; recipientId: string; grantRevision: number; purpose: 'case_assistance'; category: 'transport' | 'accommodation' | 'on_trip' | 'general' }>;
export type BriefPreview = Readonly<BriefBinding & {
  schemaVersion: 'traveler-brief/1'; kind: 'preview'; previewId: string; revision: number;
  sourceDigest: string; createdAt: number; expiresAt: number; fields: readonly BriefField[]; noticeVersion: typeof BRIEF_NOTICE;
}>;
export type BriefProjection = Readonly<BriefBinding & {
  schemaVersion: 'traveler-brief/1'; kind: 'brief'; revision: number; updatedAt: number; expiresAt: number;
  sourceDigest: string; fields: readonly BriefField[]; noticeVersion: typeof BRIEF_NOTICE;
}>;
export type BriefMutation = Readonly<{ action: 'share'; operationId: string; caseId: string; recipientId: string; grantRevision: number; expectedRevision: number; previewId: string; sourceDigest: string; selectedKeys: readonly string[]; noticeVersion: typeof BRIEF_NOTICE; confirmed: true }>
  | Readonly<{ action: 'withdraw' | 'delete'; operationId: string; caseId: string; recipientId: string; grantRevision: number; expectedRevision: number; confirmed: true }>;
export type BriefInput = BriefMutation
  | Readonly<{ action: 'locate'; caseId: string }>
  | Readonly<{ action: 'source_options'; caseId: string }>
  | Readonly<{ action: 'preview'; caseId: string; recipientId: string; grantRevision: number; sources: BriefSources }>
  | Readonly<{ action: 'read_preview'; previewId: string }>
  | Readonly<{ action: 'read'; caseId: string; recipientId: string; grantRevision: number; expectedRevision: number }>
  | Readonly<{ action: 'audit'; caseId: string }>
  | Readonly<{ action: 'export'; requestId: string; confirmed: true }>
  | Readonly<{ action: 'read_operation'; operationId: string }>
  | Readonly<{ action: 'abandon'; operationId: string; mutationBytes: string }>;
export type BriefReceipt = Readonly<{ schemaVersion: 'traveler-brief/1'; kind: 'receipt'; operationId: string; requestDigest: string; action: BriefMutation['action']; outcome: 'applied' | 'cancelled'; caseId: string; revision: number; grantRevision: number; createdAt: number }>;
const key = (v: unknown): v is string => typeof v === 'string' && /^(problem|travel_pace|budget|requirements|response_detail|memory:[0-9a-f-]{36})$/.test(v) && (!v.startsWith('memory:') || uuid(v.slice(7)));
const sourceFields = ['kind','id','revision','updatedAt','receiptId','consentId','basisDigest'];
function validSources(v: unknown): v is BriefSources {
  return record(v) && exact(v,['profilePace','memories','intakeMessageId']) && typeof v.profilePace === 'boolean' && (v.intakeMessageId === null || uuid(v.intakeMessageId)) && Array.isArray(v.memories) && v.memories.length <= 3 && v.memories.every(m => record(m) && exact(m,['id','revision']) && uuid(m.id) && revision(m.revision) && m.revision > 0) && new Set(v.memories.map(m => m.id)).size === v.memories.length;
}
export function parseBriefInput(v: unknown): BriefInput | null {
  if (!record(v)) return null;
  if (v.action === 'read_preview') return exact(v,['action','previewId']) && uuid(v.previewId) ? v as BriefInput : null;
  if (v.action === 'audit' || v.action === 'source_options' || v.action === 'locate') return exact(v,['action','caseId']) && uuid(v.caseId) ? v as BriefInput : null;
  if (v.action === 'export') return exact(v,['action','requestId','confirmed']) && uuid(v.requestId) && v.confirmed === true ? v as BriefInput : null;
  if (v.action === 'read_operation') return exact(v,['action','operationId']) && uuid(v.operationId) ? v as BriefInput : null;
  if (v.action === 'abandon') {
    if (!exact(v,['action','operationId','mutationBytes']) || !uuid(v.operationId) || !text(v.mutationBytes,24000)) return null;
    let original: unknown; try { original = JSON.parse(v.mutationBytes); } catch { return null; }
    if (!record(original) || !['share','withdraw','delete'].includes(String(original.action))) return null;
    const parsed = parseBriefInput(original);
    return parsed && 'operationId' in parsed && parsed.operationId === v.operationId ? v as BriefInput : null;
  }
  if (!uuid(v.caseId) || !uuid(v.recipientId) || !revision(v.grantRevision)) return null;
  const binding = ['action','caseId','recipientId','grantRevision'];
  if (v.action === 'preview') return exact(v,[...binding,'sources']) && validSources(v.sources) ? v as BriefInput : null;
  if (!revision(v.expectedRevision)) return null;
  if (v.action === 'read') return exact(v,[...binding,'expectedRevision']) ? v as BriefInput : null;
  if (!uuid(v.operationId) || v.confirmed !== true) return null;
  const mutation = [...binding,'operationId','expectedRevision','confirmed'];
  if (v.action === 'withdraw' || v.action === 'delete') return exact(v,mutation) ? v as BriefInput : null;
  if (v.action !== 'share' || !exact(v,[...mutation,'previewId','sourceDigest','selectedKeys','noticeVersion']) || !uuid(v.previewId) || !digest(v.sourceDigest) || v.noticeVersion !== BRIEF_NOTICE || !Array.isArray(v.selectedKeys) || !v.selectedKeys.length || v.selectedKeys.length > 7 || !v.selectedKeys.every(key) || new Set(v.selectedKeys).size !== v.selectedKeys.length) return null;
  return v as BriefInput;
}
function validValue(field: BriefFieldName, v: unknown) {
  if (field === 'travel_pace') return ['relaxed','balanced','packed','fast'].includes(String(v)) && typeof v === 'string';
  if (['problem','preference'].includes(field)) return text(v,field === 'problem' ? 1000 : 500);
  if (field === 'budget') return record(v) && exact(v,['currency','perNightMinorUnits']) && ['CNY','USD','EUR','GBP'].includes(String(v.currency)) && revision(v.perNightMinorUnits) && v.perNightMinorUnits > 0 && v.perNightMinorUnits <= 10000000;
  if (field !== 'requirements' || !record(v) || !exact(v,['city','durationDays','partySize','interests','dates','mobilityConstraints'])) return false;
  const bounded = (n: unknown, max: number) => n === null || revision(n) && n > 0 && n <= max;
  const strings = (a: unknown, max: number, length: number) => a === null || Array.isArray(a) && a.length <= max && a.every(s => text(s,length)) && new Set(a).size === a.length;
  const date = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  return (v.city === null || text(v.city,80)) && bounded(v.durationDays,30) && bounded(v.partySize,10) && strings(v.interests,8,20) && (v.interests === null || (v.interests as string[]).every(s => ['food','photography','culture','nature'].includes(s))) && strings(v.mobilityConstraints,6,120) && (v.dates === null || record(v.dates) && exact(v.dates,['startDate','endDate']) && date(v.dates.startDate) && date(v.dates.endDate) && String(v.dates.endDate) >= String(v.dates.startDate) && Date.parse(String(v.dates.endDate))-Date.parse(String(v.dates.startDate)) <= 30*86400000);
}
export function validBriefField(v: unknown): v is BriefField {
  if (!record(v) || !key(v.key) || !['problem','travel_pace','preference','budget','requirements','response_detail'].includes(String(v.field))) return false;
  if (v.key !== (v.field === 'preference' ? v.key : v.field) || (v.field === 'preference') !== String(v.key).startsWith('memory:')) return false;
  if (v.state === 'unknown') return exact(v,['key','field','state']);
  if (v.state !== 'available' || !exact(v,['key','field','state','value','provenance','source']) || v.provenance !== 'explicit' || !validValue(v.field as BriefFieldName,v.value) || !record(v.source) || !exact(v.source,sourceFields)) return false;
  const s = v.source;
  if (!uuid(s.id) || !revision(s.revision) || !milliseconds(s.updatedAt) || !digest(s.basisDigest) || !(s.receiptId === null || uuid(s.receiptId)) || !(s.consentId === null || uuid(s.consentId))) return false;
  if (v.field === 'preference') return s.kind === 'memory' && uuid(s.receiptId) && uuid(s.consentId) && s.id === String(v.key).slice(7);
  if (v.field === 'problem') return s.kind === 'case' && s.receiptId === null && s.consentId === null;
  if (v.field === 'travel_pace') return s.kind === 'profile_pace' && uuid(s.receiptId) && s.consentId === null || s.kind === 'intake' && uuid(s.receiptId) && uuid(s.consentId);
  return ['budget','requirements'].includes(String(v.field)) && s.kind === 'intake' && uuid(s.receiptId) && uuid(s.consentId);
}
const bindingKeys = ['schemaVersion','kind','caseId','ownerId','recipientId','grantRevision','purpose','category','revision','sourceDigest','expiresAt','fields','noticeVersion'];
export type BriefLocator = Readonly<BriefBinding & {schemaVersion: 'traveler-brief/1'; kind: 'locator'; revision: number; expiresAt: number}>;
export function decodeBriefLocator(v: unknown): BriefLocator | null {
  return record(v) && exact(v,['schemaVersion','kind','caseId','ownerId','recipientId','grantRevision','purpose','category','revision','expiresAt']) && v.schemaVersion === 'traveler-brief/1' && v.kind === 'locator' && [v.caseId,v.ownerId,v.recipientId].every(uuid) && v.ownerId !== v.recipientId && revision(v.grantRevision) && revision(v.revision) && v.purpose === 'case_assistance' && ['transport','accommodation','on_trip','general'].includes(String(v.category)) && milliseconds(v.expiresAt) ? v as BriefLocator : null;
}
export function decodeBrief(v: unknown): BriefPreview | BriefProjection | null {
  if (!record(v) || !['preview','brief'].includes(String(v.kind)) || !exact(v,[...bindingKeys,...(v.kind === 'preview' ? ['previewId','createdAt'] : ['updatedAt'])]) || v.schemaVersion !== 'traveler-brief/1' || ![v.caseId,v.ownerId,v.recipientId].every(uuid) || v.ownerId === v.recipientId || !revision(v.grantRevision) || !revision(v.revision) || v.purpose !== 'case_assistance' || !['transport','accommodation','on_trip','general'].includes(String(v.category)) || !digest(v.sourceDigest) || !milliseconds(v.expiresAt) || v.noticeVersion !== BRIEF_NOTICE || !Array.isArray(v.fields) || v.fields.length > 8 || !v.fields.every(validBriefField) || new Set(v.fields.map(f => f.key)).size !== v.fields.length) return null;
  if (v.fields.some(f => f.state === 'available' && (f.source.kind === 'case' && (f.source.id !== v.caseId || f.source.revision !== v.grantRevision) || f.source.kind === 'profile_pace' && f.source.id !== v.ownerId))) return null;
  if (v.kind === 'preview') return uuid(v.previewId) && milliseconds(v.createdAt) && v.expiresAt > v.createdAt && v.expiresAt-v.createdAt <= 300000 ? v as BriefPreview : null;
  return v.fields.length > 0 && v.fields.every(f => f.state === 'available') && milliseconds(v.updatedAt) && v.expiresAt > v.updatedAt ? v as BriefProjection : null;
}
export function decodeBriefReceipt(v: unknown): BriefReceipt | null {
  return record(v) && exact(v,['schemaVersion','kind','operationId','requestDigest','action','outcome','caseId','revision','grantRevision','createdAt']) && v.schemaVersion === 'traveler-brief/1' && v.kind === 'receipt' && uuid(v.operationId) && digest(v.requestDigest) && ['share','withdraw','delete'].includes(String(v.action)) && ['applied','cancelled'].includes(String(v.outcome)) && uuid(v.caseId) && revision(v.revision) && revision(v.grantRevision) && milliseconds(v.createdAt) ? v as BriefReceipt : null;
}

export type BriefAuditEvent = Readonly<{ eventId: string; revision: number; actorId: string; action: 'previewed' | 'shared' | 'withdrawn' | 'deleted' | 'read' | 'invalidated'; recipientId: string | null; grantRevision: number; fieldKeys: readonly string[]; createdAt: number }>;
export type BriefAudit = Readonly<{ schemaVersion: 'traveler-brief/1'; kind: 'audit'; caseId: string; ownerId: string; revision: number; events: readonly BriefAuditEvent[]; complete: true }>;
export function validBriefAuditEvent(v: unknown): v is BriefAuditEvent {
  return record(v) && exact(v,['eventId','revision','actorId','action','recipientId','grantRevision','fieldKeys','createdAt']) && uuid(v.eventId) && revision(v.revision) && uuid(v.actorId) && ['previewed','shared','withdrawn','deleted','read','invalidated'].includes(String(v.action)) && (v.recipientId === null || uuid(v.recipientId)) && revision(v.grantRevision) && Array.isArray(v.fieldKeys) && v.fieldKeys.length <= 7 && v.fieldKeys.every(key) && new Set(v.fieldKeys).size === v.fieldKeys.length && milliseconds(v.createdAt);
}
export function decodeBriefAudit(v: unknown): BriefAudit | null {
  return record(v) && exact(v,['schemaVersion','kind','caseId','ownerId','revision','events','complete']) && v.schemaVersion === 'traveler-brief/1' && v.kind === 'audit' && uuid(v.caseId) && uuid(v.ownerId) && revision(v.revision) && v.complete === true && Array.isArray(v.events) && v.events.length <= 200 && v.events.every(validBriefAuditEvent) && new Set(v.events.map(e => e.eventId)).size === v.events.length ? v as BriefAudit : null;
}

export type BriefSourceOptions = Readonly<{
  schemaVersion: 'traveler-brief/1'; kind: 'source_options'; caseId: string; ownerId: string;
  recipientId: string; grantRevision: number; expiresAt: number;
  profilePace: BriefField | null; memories: readonly BriefField[]; memoryScope: 'latest_three_preferences';
  intake: Readonly<{ messageId: string; revision: number; updatedAt: number; fields: readonly BriefField[] }> | null;
}>;
export function decodeBriefSourceOptions(v: unknown): BriefSourceOptions | null {
  if (!record(v) || !exact(v,['schemaVersion','kind','caseId','ownerId','recipientId','grantRevision','expiresAt','profilePace','memories','memoryScope','intake']) || v.schemaVersion !== 'traveler-brief/1' || v.kind !== 'source_options' || ![v.caseId,v.ownerId,v.recipientId].every(uuid) || v.ownerId === v.recipientId || !revision(v.grantRevision) || !milliseconds(v.expiresAt) || v.memoryScope !== 'latest_three_preferences' || !Array.isArray(v.memories) || v.memories.length > 3 || !v.memories.every(m => validBriefField(m) && m.field === 'preference' && m.state === 'available') || new Set(v.memories.map(m => m.key)).size !== v.memories.length) return null;
  if (v.profilePace !== null && !(validBriefField(v.profilePace) && v.profilePace.field === 'travel_pace' && v.profilePace.state === 'available' && v.profilePace.source.kind === 'profile_pace' && v.profilePace.source.id === v.ownerId)) return null;
  if (v.intake !== null) {
    const i = v.intake;
    if (!record(i) || !exact(i,['messageId','revision','updatedAt','fields']) || !uuid(i.messageId) || !revision(i.revision) || !milliseconds(i.updatedAt) || !Array.isArray(i.fields) || i.fields.length > 3 || !i.fields.every(f => validBriefField(f) && ['travel_pace','budget','requirements'].includes(f.field) && f.state === 'available' && f.source.kind === 'intake' && f.source.id === i.messageId && f.source.revision === i.revision && f.source.updatedAt === i.updatedAt) || new Set(i.fields.map(f => f.key)).size !== i.fields.length) return null;
  }
  return v as BriefSourceOptions;
}

/** Reference-only export: original source values are never copied into a Brief
 * table, operation, audit or download. Source exports retain their own writers. */
export type BriefDataRow = Readonly<{ key: string; domain: 'brief' | 'preview' | 'audit' | 'operation'; value: Record<string, unknown> }>;
export type BriefDataBundle = Readonly<{
  schemaVersion: 'traveler-brief-data/1'; kind: 'bundle'; requestId: string; ownerId: string; sessionId: string;
  capturedAt: number; expiresAt: number; sourceDigest: string; corePackageEnrollment: 'not_enrolled';
  allUserDataCompleted: false; coverage: Readonly<{ brief: 'complete'; previews: 'complete'; audit: 'complete'; operations: 'complete'; sourceValues: 'not_copied'; attachments: 'unavailable' }>; rows: readonly BriefDataRow[];
}>;
export function validBriefDataRow(v: unknown): v is BriefDataRow {
  if (!record(v) || !exact(v,['key','domain','value']) || !text(v.key,180) || !record(v.value)) return false;
  const r = v.value;
  if (v.domain === 'audit') return exact(r,['caseId','event']) && uuid(r.caseId) && validBriefAuditEvent(r.event);
  if (v.domain === 'brief') return exact(r,['caseId','revision','recipientId','grantRevision','state','selectedKeys','sourceDigest','sources','updatedAt','expiresAt']) && uuid(r.caseId) && revision(r.revision) && (r.recipientId === null || uuid(r.recipientId)) && revision(r.grantRevision) && ['shared','withdrawn','deleted','invalidated'].includes(String(r.state)) && Array.isArray(r.selectedKeys) && r.selectedKeys.length <= 7 && r.selectedKeys.every(key) && (r.sourceDigest === null || digest(r.sourceDigest)) && (r.sources === null || validSources(r.sources)) && milliseconds(r.updatedAt) && (r.expiresAt === null || milliseconds(r.expiresAt));
  if (v.domain === 'preview') return exact(r,['previewId','caseId','revision','recipientId','grantRevision','sourceDigest','sources','createdAt','expiresAt']) && [r.previewId,r.caseId,r.recipientId].every(uuid) && revision(r.revision) && revision(r.grantRevision) && digest(r.sourceDigest) && validSources(r.sources) && milliseconds(r.createdAt) && milliseconds(r.expiresAt) && r.expiresAt > r.createdAt && r.expiresAt-r.createdAt <= 300000;
  if (v.domain !== 'operation' || !exact(r,['operationId','caseId','sessionId','requestDigest','requestBytes','receipt','erased','createdAt']) || !uuid(r.operationId) || !uuid(r.sessionId) || !digest(r.requestDigest) || !milliseconds(r.createdAt)) return false;
  if (r.erased === true) return r.caseId === null && r.requestBytes === null && r.receipt === null;
  if (r.erased !== false || !uuid(r.caseId) || !text(r.requestBytes,24000)) return false;
  const receipt = decodeBriefReceipt(r.receipt); if (!receipt || receipt.operationId !== r.operationId || receipt.caseId !== r.caseId || receipt.requestDigest !== r.requestDigest) return false;
  try { const input = parseBriefInput(JSON.parse(r.requestBytes)); return !!input && ['share','withdraw','delete'].includes(input.action) && 'operationId' in input && input.operationId === r.operationId; } catch { return false; }
}
export function decodeBriefDataBundle(v: unknown): BriefDataBundle | null {
  if (!record(v) || !exact(v,['schemaVersion','kind','requestId','ownerId','sessionId','capturedAt','expiresAt','sourceDigest','corePackageEnrollment','allUserDataCompleted','coverage','rows']) || v.schemaVersion !== 'traveler-brief-data/1' || v.kind !== 'bundle' || ![v.requestId,v.ownerId,v.sessionId].every(uuid) || !milliseconds(v.capturedAt) || !milliseconds(v.expiresAt) || v.expiresAt <= v.capturedAt || v.expiresAt-v.capturedAt > 30000 || !digest(v.sourceDigest) || v.corePackageEnrollment !== 'not_enrolled' || v.allUserDataCompleted !== false || !record(v.coverage) || !exact(v.coverage,['brief','previews','audit','operations','sourceValues','attachments']) || !['brief','previews','audit','operations'].every(k => (v.coverage as Record<string,unknown>)[k] === 'complete') || v.coverage.sourceValues !== 'not_copied' || v.coverage.attachments !== 'unavailable' || !Array.isArray(v.rows) || v.rows.length > 10000 || !v.rows.every(validBriefDataRow) || new Set(v.rows.map(r => r.key)).size !== v.rows.length) return null;
  return v as BriefDataBundle;
}
