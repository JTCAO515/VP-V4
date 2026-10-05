export const COMMUNITY_SCHEMA = 'community-j1/1' as const;
export const retained = ['operation_fences','submission_tombstones','audit_metadata'] as const;
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const text = (v: unknown, n: number, empty = false): v is string => typeof v === 'string' && v.length <= n && !v.includes('\0') && (empty || !!v.trim());
export type CommunityPlaceInput = Readonly<{tripId:string;placeReferenceId:string;expectedTripVersion:number;mappingDigest:string}>;
export type CommunityMutation = Readonly<{action:'submit';operationId:string;submissionId:string;contentKind:'experience'|'help';title:string;content:string;benefitDisclosure:string;place:CommunityPlaceInput|null;consent:'internal-review-v1'}>
  | Readonly<{action:'review';operationId:string;submissionId:string;expectedVersion:1;decision:'approve'|'reject';note:string}>
  | Readonly<{action:'withdraw';operationId:string;submissionId:string;expectedVersion:1|2}>
  | Readonly<{action:'delete';operationId:string;confirmed:true}>;
export type CommunityInput = CommunityMutation | Readonly<{action:'mine'|'queue';cursor:string|null}> | Readonly<{action:'read'|'inspect';submissionId:string}>
  | Readonly<{action:'operation'|'abandon';operationId:string;mutationBytes:string}> | Readonly<{action:'export'|'session'}>;
export function parseCommunityInput(v: unknown): CommunityInput|null {
  if (!record(v)) return null;
  if (v.action === 'mine' || v.action === 'queue') return exact(v,['action','cursor']) && (v.cursor === null || uuid(v.cursor)) ? v as CommunityInput : null;
  if (v.action === 'read' || v.action === 'inspect') return exact(v,['action','submissionId']) && uuid(v.submissionId) ? v as CommunityInput : null;
  if (v.action === 'export' || v.action === 'session') return exact(v,['action']) ? v as CommunityInput : null;
  if (!uuid(v.operationId)) return null;
  if (v.action === 'operation' || v.action === 'abandon') {
    if (!exact(v,['action','operationId','mutationBytes']) || !text(v.mutationBytes,10000)) return null;
    let original: unknown; try { original = JSON.parse(v.mutationBytes); } catch { return null; }
    if (!record(original) || !enumValue(original.action,['submit','review','withdraw','delete'])) return null;
    const parsed = parseCommunityInput(original);
    return parsed && isMutation(parsed) && parsed.operationId === v.operationId ? v as CommunityInput : null;
  }
  if (v.action === 'delete') return exact(v,['action','operationId','confirmed']) && v.confirmed === true ? v as CommunityInput : null;
  if (!uuid(v.submissionId)) return null;
  if (v.action === 'submit') return exact(v,['action','operationId','submissionId','contentKind','title','content','benefitDisclosure','place','consent'])
    && (v.contentKind === 'experience' || v.contentKind === 'help') && text(v.title,160) && text(v.content,4000) && text(v.benefitDisclosure,400,true)
    && (v.place === null || record(v.place) && exact(v.place,['tripId','placeReferenceId','expectedTripVersion','mappingDigest']) && uuid(v.place.tripId) && uuid(v.place.placeReferenceId) && typeof v.place.expectedTripVersion==='number' && Number.isSafeInteger(v.place.expectedTripVersion) && v.place.expectedTripVersion>=0 && v.place.expectedTripVersion<=2147483647 && hash(v.place.mappingDigest))
    && v.consent === 'internal-review-v1' ? v as CommunityInput : null;
  if (v.action === 'withdraw') return exact(v,['action','operationId','submissionId','expectedVersion']) && (v.expectedVersion === 1 || v.expectedVersion === 2) ? v as CommunityInput : null;
  return v.action === 'review' && exact(v,['action','operationId','submissionId','expectedVersion','decision','note']) && v.expectedVersion === 1
    && (v.decision === 'approve' || v.decision === 'reject') && text(v.note,400) ? v as CommunityInput : null;
}
export const isMutation = (v: CommunityInput): v is CommunityMutation => ['submit','review','withdraw','delete'].includes(v.action);
export const hasSideEffect = (v: CommunityInput) => isMutation(v) || v.action === 'abandon';
export type CommunityEvent = Readonly<{action:'submitted'|'reviewed'|'published'|'rejected'|'withdrawn'|'deleted';version:number;createdAt:string}>;
export type CommunityItem = Readonly<{
  id:string;title:string;content:string;contentKind:'experience'|'help'|'unknown';benefitDisclosure:string|null;
  authorDisclosure:'registered_user'|'community_reviewer'|'official'|'employee'|'unknown';reviewerDisclosure:'registered_user'|'community_reviewer'|'official'|'employee'|'unknown'|null;status:'pending'|'published'|'rejected'|'withdrawn'|'deleted';version:number;
  createdAt:string;reviewedAt:string|null;withdrawnAt:string|null;reviewNote:string|null;
  place:Readonly<{tripId:string;placeReferenceId:string;canonicalPoiId:string;mappingDigest:string;label:string|null}>|null;
  history:readonly CommunityEvent[];visibility:'internal';publiclyVisible:false;retrievalEligible:false;
}>;
type Base = Readonly<{schemaVersion:typeof COMMUNITY_SCHEMA;actorId:string;sessionId:string}>;
export type CommunityOutcome = Base & (
  Readonly<{kind:'session'}> |
  Readonly<{kind:'page';submissions:readonly CommunityItem[];nextCursor:string|null;complete:boolean}>
  | Readonly<{kind:'item';submission:CommunityItem}>
  | Readonly<{kind:'operation';operationId:string;state:'absent'|'committed'|'abandoned';submission:CommunityItem|null}>
  | Readonly<{kind:'deleted';operationId:string;scope:'community_module';retained:typeof retained}>
  | Readonly<{kind:'export';scope:'community_module';coverage:'complete_for_community';submissions:readonly CommunityItem[];
    reviews:readonly Readonly<{submissionId:string;decision:'approve'|'reject';note:string|null;createdAt:string}>[];
    receipts:readonly Readonly<{operationId:string;submissionId:string|null;action:'submit'|'review'|'withdraw'|'delete'|'unknown';state:'committed'|'abandoned';digest:string}>[];
    audits:readonly Readonly<{submissionId:string;action:CommunityEvent['action'];version:number;createdAt:string}>[];reviewerQualification:Readonly<{active:boolean}>|null;trustedDisclosure:CommunityItem['authorDisclosure']|null;retained:typeof retained}>
);
const enumValue = (v:unknown,values:readonly string[]):v is string => typeof v === 'string' && values.includes(v);
const time = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v.slice(0,10)).toISOString().slice(0,10) === v.slice(0,10);
const nullable = <T>(v: unknown, check: (v: unknown) => v is T) => v === null || check(v);
const version = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 3;
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const events = ['submitted','reviewed','published','rejected','withdrawn','deleted'];
const validEvent = (v: unknown): v is CommunityEvent => record(v) && exact(v,['action','version','createdAt']) && typeof v.action === 'string' && events.includes(v.action) && version(v.version) && time(v.createdAt);
const rows = (v: unknown, n: number, check: (v: unknown) => boolean) => Array.isArray(v) && v.length <= n && v.every(check);
const retainedValid = (v: unknown) => Array.isArray(v) && v.length === retained.length && v.every((x,i) => x === retained[i]);
export function decodeCommunityItem(v: unknown): CommunityItem|null {
  if (!record(v) || !exact(v,['id','title','content','contentKind','benefitDisclosure','authorDisclosure','reviewerDisclosure','status','version','createdAt','reviewedAt','withdrawnAt','reviewNote','place','history','visibility','publiclyVisible','retrievalEligible']) || !uuid(v.id) || !text(v.title,160,true) || !text(v.content,4000,true)
    || !enumValue(v.contentKind,['experience','help','unknown']) || !nullable(v.benefitDisclosure,x => text(x,400,true))
    || !enumValue(v.authorDisclosure,['registered_user','community_reviewer','official','employee','unknown']) || !nullable(v.reviewerDisclosure,x => enumValue(x,['registered_user','community_reviewer','official','employee','unknown'])) || !enumValue(v.status,['pending','published','rejected','withdrawn','deleted']) || !version(v.version)
    || !time(v.createdAt) || !nullable(v.reviewedAt,time) || !nullable(v.withdrawnAt,time) || !nullable(v.reviewNote,x => text(x,400))
    || !rows(v.history,5,validEvent) || v.visibility !== 'internal' || v.publiclyVisible !== false || v.retrievalEligible !== false) return null;
  if (v.place !== null && (!record(v.place) || !exact(v.place,['tripId','placeReferenceId','canonicalPoiId','mappingDigest','label']) || ![v.place.tripId,v.place.placeReferenceId,v.place.canonicalPoiId].every(uuid) || !hash(v.place.mappingDigest) || !nullable(v.place.label,x => text(x,160)))) return null;
  const erased = v.status === 'withdrawn' || v.status === 'deleted';
  if (erased ? v.title !== '' || v.content !== '' || v.benefitDisclosure !== null || v.place !== null || !time(v.withdrawnAt) || v.version < 2
    : !text(v.title,160) || !text(v.content,4000) || v.withdrawnAt !== null) return null;
  if (v.status === 'pending' && (v.version !== 1 || v.reviewedAt !== null || v.reviewNote !== null || v.reviewerDisclosure !== null)) return null;
  if ((v.status === 'published' || v.status === 'rejected') && (v.version !== 2 || !time(v.reviewedAt))) return null;
  if ((v.history as CommunityEvent[]).some(e => e.version > Number(v.version))) return null;
  return v as CommunityItem;
}
export function decodeCommunityOutcome(v: unknown): CommunityOutcome|null {
  if (!record(v) || v.schemaVersion !== COMMUNITY_SCHEMA || !uuid(v.actorId) || !uuid(v.sessionId)) return null;
  const base = ['schemaVersion','kind','actorId','sessionId'];
  if (v.kind === 'session') return exact(v,base) ? v as CommunityOutcome : null;
  if (v.kind === 'page') return exact(v,[...base,'submissions','nextCursor','complete']) && rows(v.submissions,50,x => !!decodeCommunityItem(x))
    && nullable(v.nextCursor,uuid) && v.complete === (v.nextCursor === null) && (v.nextCursor === null || (v.submissions as CommunityItem[]).at(-1)?.id === v.nextCursor)
    && new Set((v.submissions as CommunityItem[]).map(x => x.id)).size === (v.submissions as CommunityItem[]).length ? v as CommunityOutcome : null;
  if (v.kind === 'item') return exact(v,[...base,'submission']) && decodeCommunityItem(v.submission) ? v as CommunityOutcome : null;
  if (v.kind === 'operation') return exact(v,[...base,'operationId','state','submission']) && uuid(v.operationId) && enumValue(v.state,['absent','committed','abandoned'])
    && (v.state === 'committed' ? v.submission === null || !!decodeCommunityItem(v.submission) : v.submission === null) ? v as CommunityOutcome : null;
  if (v.kind === 'deleted') return exact(v,[...base,'operationId','scope','retained']) && uuid(v.operationId) && v.scope === 'community_module' && retainedValid(v.retained) ? v as CommunityOutcome : null;
  if (v.kind !== 'export' || !exact(v,[...base,'scope','coverage','submissions','reviews','receipts','audits','reviewerQualification','trustedDisclosure','retained']) || v.scope !== 'community_module' || v.coverage !== 'complete_for_community' || !retainedValid(v.retained)) return null;
  const reviews = rows(v.reviews,100,x => record(x) && exact(x,['submissionId','decision','note','createdAt']) && uuid(x.submissionId) && (x.decision === 'approve' || x.decision === 'reject') && nullable(x.note,y => text(y,400)) && time(x.createdAt));
  const receipts = rows(v.receipts,100,x => record(x) && exact(x,['operationId','submissionId','action','state','digest']) && uuid(x.operationId) && nullable(x.submissionId,uuid) && enumValue(x.action,['submit','review','withdraw','delete','unknown']) && enumValue(x.state,['committed','abandoned']) && hash(x.digest));
  const audits = rows(v.audits,100,x => record(x) && exact(x,['submissionId','action','version','createdAt']) && uuid(x.submissionId) && typeof x.action === 'string' && events.includes(x.action) && version(x.version) && time(x.createdAt));
  const qualification=v.reviewerQualification===null || record(v.reviewerQualification) && exact(v.reviewerQualification,['active']) && typeof v.reviewerQualification.active==='boolean';
  const disclosure=v.trustedDisclosure===null || enumValue(v.trustedDisclosure,['registered_user','community_reviewer','official','employee','unknown']);
  return qualification && disclosure && rows(v.submissions,100,x => !!decodeCommunityItem(x)) && reviews && receipts && audits ? v as CommunityOutcome : null;
}
/** Bind success to this exact command and current actor/session, not merely valid JSON. */
export function matchesCommunityOutcome(o: CommunityOutcome, input: CommunityInput, actor: string, session: string): boolean {
  if (o.actorId !== actor || o.sessionId !== session) return false;
  if (input.action === 'mine' || input.action === 'queue') return o.kind === 'page' && (input.cursor === null || o.submissions.every(x => x.id > input.cursor!.toLowerCase())) && (input.action !== 'queue' || o.submissions.every(x => x.status === 'pending'));
  if (input.action === 'read' || input.action === 'inspect') return o.kind === 'item' && o.submission.id === input.submissionId;
  if (input.action === 'export') return o.kind === 'export';
  if (input.action === 'session') return o.kind === 'session';
  if (input.action === 'delete') return o.kind === 'deleted' && o.operationId === input.operationId;
  if (!('operationId' in input) || o.kind !== 'operation' || o.operationId !== input.operationId) return false;
  if (input.action === 'operation' || input.action === 'abandon') {
    const original = parseCommunityInput(JSON.parse(input.mutationBytes));
    return !!original && isMutation(original) && (o.state !== 'committed' || (original.action === 'delete' ? o.submission === null : o.submission?.id === original.submissionId));
  }
  return 'submissionId' in input && o.state === 'committed' && o.submission?.id === input.submissionId;
}
