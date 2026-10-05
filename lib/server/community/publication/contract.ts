/** J3/J4 controlled experience protocol. Anonymous and external audiences are disabled. */
import {record,exact,uuid,text,decodeSafetyObject,type SafetyObject} from '../safety/contract.ts';
export {record,exact,uuid,text};
export const PUBLICATION_SCHEMA='community-publication-j3j4/1' as const;
export const publicationRetained=['operation_fences','publication_tombstones','reference_tombstones','audit_metadata'] as const;
const choice=<T extends string>(v:unknown,values:readonly T[]):v is T=>typeof v==='string' && values.includes(v as T);
const revision=(v:unknown):v is number=>typeof v==='number' && Number.isSafeInteger(v) && v>=0 && v<=2147483647;
const version=(v:unknown):v is number=>revision(v) && v>0;
const hash=(v:unknown):v is string=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
const time=(v:unknown):v is string=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v.slice(0,10)).toISOString().slice(0,10)===v.slice(0,10);
const nullable=(v:unknown,check:(v:unknown)=>boolean)=>v===null || check(v);
type SourceVersion=Readonly<{expectedSubmissionVersion:number;expectedSafetyVersion:number}>;
type PublicationVersion=Readonly<{publicationId:string;expectedPublicationVersion:number}>;
export type PublicationMutation=
  | SourceVersion & Readonly<{action:'requestPublication';operationId:string;publicationId:string;submissionId:string;previewDigest:string;consent:'controlled-preview-v1';rightsDeclaration:'own-text-v1'}>
  | SourceVersion & PublicationVersion & Readonly<{action:'rightsReview';operationId:string;decision:'approve'|'reject';note:string}>
  | SourceVersion & PublicationVersion & Readonly<{action:'publish';operationId:string}>
  | PublicationVersion & Readonly<{action:'withdraw'|'revoke';operationId:string}>
  | SourceVersion & PublicationVersion & Readonly<{action:'save';operationId:string;referenceId:string}>
  | Readonly<{action:'unsave';operationId:string;referenceId:string;expectedReferenceVersion:1}>
  | Readonly<{action:'delete';operationId:string;confirmed:true}>;
export type PublicationInput=PublicationMutation
  | Readonly<{action:'session'|'export'}>
  | Readonly<{action:'preview';submissionId:string}>
  | Readonly<{action:'list';cursor:string|null;query:string}>
  | Readonly<{action:'mine'|'queue'|'saved';cursor:string|null}>
  | Readonly<{action:'detail'|'inspect';publicationId:string}>
  | Readonly<{action:'reference';referenceId:string}>
  | Readonly<{action:'operation'|'abandon';operationId:string;mutationBytes:string}>;
export const publicationActions=['requestPublication','rightsReview','publish','withdraw','revoke','save','unsave','delete'] as const;
export const isPublicationMutation=(v:PublicationInput):v is PublicationMutation=>choice(v.action,publicationActions);
export const publicationSideEffect=(v:PublicationInput)=>isPublicationMutation(v) || v.action==='abandon';
export function parsePublicationInput(v:unknown):PublicationInput|null {
  if (!record(v)) return null;
  if (choice(v.action,['session','export'])) return exact(v,['action'])?v as PublicationInput:null;
  if (choice(v.action,['mine','queue','saved'])) return exact(v,['action','cursor']) && nullable(v.cursor,uuid)?v as PublicationInput:null;
  if (v.action==='list') return exact(v,['action','cursor','query']) && nullable(v.cursor,uuid) && text(v.query,160,true)?v as PublicationInput:null;
  if (v.action==='preview') return exact(v,['action','submissionId']) && uuid(v.submissionId)?v as PublicationInput:null;
  if (choice(v.action,['detail','inspect'])) return exact(v,['action','publicationId']) && uuid(v.publicationId)?v as PublicationInput:null;
  if (v.action==='reference') return exact(v,['action','referenceId']) && uuid(v.referenceId)?v as PublicationInput:null;
  if (!uuid(v.operationId)) return null;
  if (choice(v.action,['operation','abandon'])) {
    if (!exact(v,['action','operationId','mutationBytes']) || !text(v.mutationBytes,10000) || new TextEncoder().encode(v.mutationBytes).length>24000) return null;
    let original:unknown;try {original=JSON.parse(v.mutationBytes);} catch {return null;}
    if (!record(original) || !choice(original.action,publicationActions)) return null;
    const p=parsePublicationInput(original);return p && isPublicationMutation(p) && p.operationId===v.operationId?v as PublicationInput:null;
  }
  if (v.action==='delete') return exact(v,['action','operationId','confirmed']) && v.confirmed===true?v as PublicationInput:null;
  if (v.action==='unsave') return exact(v,['action','operationId','referenceId','expectedReferenceVersion']) && uuid(v.referenceId) && v.expectedReferenceVersion===1?v as PublicationInput:null;
  if (!uuid(v.publicationId)) return null;
  if (choice(v.action,['withdraw','revoke'])) return exact(v,['action','operationId','publicationId','expectedPublicationVersion']) && version(v.expectedPublicationVersion)?v as PublicationInput:null;
  if (!version(v.expectedSubmissionVersion) || !revision(v.expectedSafetyVersion)) return null;
  const common=['action','operationId','publicationId','expectedSubmissionVersion','expectedSafetyVersion'];
  if (v.action==='requestPublication') return exact(v,[...common,'submissionId','previewDigest','consent','rightsDeclaration']) && uuid(v.submissionId) && hash(v.previewDigest) && v.consent==='controlled-preview-v1' && v.rightsDeclaration==='own-text-v1'?v as PublicationInput:null;
  if (!version(v.expectedPublicationVersion)) return null;
  if (v.action==='rightsReview') return exact(v,[...common,'expectedPublicationVersion','decision','note']) && choice(v.decision,['approve','reject']) && text(v.note,400)?v as PublicationInput:null;
  if (v.action==='publish') return exact(v,[...common,'expectedPublicationVersion'])?v as PublicationInput:null;
  return v.action==='save' && exact(v,[...common,'expectedPublicationVersion','referenceId']) && uuid(v.referenceId)?v as PublicationInput:null;
}
export type PublicationRecord=Readonly<{id:string;submissionId:string;submissionVersion:number;safetyVersion:number;version:number;state:'pending_rights'|'rights_approved'|'rights_rejected'|'published'|'withdrawn'|'revoked'|'invalidated'|'erased';rightsDeclaration:'own-text-v1'|null;rightsNote:string|null;createdAt:string;publishedAt:string|null;endedAt:string|null;audience:'controlled_registered';publiclyVisible:false;retrievalEligible:false}>;
export type Experience=Readonly<{id:string;submissionId:string;submissionVersion:number;safetyVersion:number;publicationVersion:number;title:string;content:string;contentKind:'experience'|'help';benefitDisclosure:string;authorDisclosure:SafetyObject['authorDisclosure'];reviewerDisclosure:SafetyObject['reviewerDisclosure'];source:'user_experience'|'user_help';copyright:'author_declared_own_text_independently_reviewed';rightsPurpose:'controlled_experience_display';audience:'controlled_registered';publiclyVisible:false;retrievalEligible:false;canReport:true;canBlock:boolean;place:Readonly<{canonicalPoiId:string;mappingDigest:string;label:string|null}>|null;expiresAt:string}>;
export type ExperienceReference=Readonly<{id:string;publicationId:string|null;submissionVersion:number;safetyVersion:number;publicationVersion:number;version:number;state:'saved'|'unsaved'|'erased';availability:'current'|'unavailable';experience:Experience|null;createdAt:string;endedAt:string|null}>;
export type PublicationPreview=Readonly<{object:SafetyObject;previewDigest:string;audience:'controlled_registered';rightsDeclarationRequired:'own-text-v1';expiresAt:string}>;
type Base=Readonly<{schemaVersion:typeof PUBLICATION_SCHEMA;actorId:string;sessionId:string}>;
export type PublicationOutcome=Base & (
  | Readonly<{kind:'session'}>
  | Readonly<{kind:'preview';preview:PublicationPreview}>
  | Readonly<{kind:'detail';experience:Experience}>
  | Readonly<{kind:'publication';publication:PublicationRecord}>
  | Readonly<{kind:'reference';reference:ExperienceReference}>
  | Readonly<{kind:'list';experiences:readonly Experience[];nextCursor:string|null;complete:boolean}>
  | Readonly<{kind:'publications';publications:readonly PublicationRecord[];nextCursor:string|null;complete:boolean}>
  | Readonly<{kind:'saved';references:readonly ExperienceReference[];nextCursor:string|null;complete:boolean}>
  | Readonly<{kind:'operation';operationId:string;state:'absent'|'committed'|'abandoned';publication:PublicationRecord|null;reference:ExperienceReference|null}>
  | Readonly<{kind:'deleted';operationId:string;scope:'community_publication_module';retained:typeof publicationRetained}>
  | Readonly<{kind:'export';scope:'community_publication_module';coverage:'complete_for_community_publication';publications:readonly PublicationRecord[];references:readonly ExperienceReference[];authoredRightsReviews:readonly Readonly<{publicationId:string;decision:'approve'|'reject';note:string|null;createdAt:string}>[];receipts:readonly Readonly<{operationId:string;recordId:string|null;action:PublicationMutation['action'];state:'committed'|'abandoned';digest:string}>[];audits:readonly Readonly<{recordId:string|null;action:PublicationMutation['action'];createdAt:string}>[];qualification:Readonly<{rightsReviewer:boolean;publisher:boolean}>|null;retained:typeof publicationRetained}>);
export function decodePublication(v:unknown):PublicationRecord|null {
  if (!record(v) || !exact(v,['id','submissionId','submissionVersion','safetyVersion','version','state','rightsDeclaration','rightsNote','createdAt','publishedAt','endedAt','audience','publiclyVisible','retrievalEligible']) || !uuid(v.id) || !uuid(v.submissionId) || !version(v.submissionVersion) || !revision(v.safetyVersion) || !version(v.version) || !choice(v.state,['pending_rights','rights_approved','rights_rejected','published','withdrawn','revoked','invalidated','erased']) || !time(v.createdAt) || !nullable(v.publishedAt,time) || !nullable(v.endedAt,time) || !nullable(v.rightsNote,x=>text(x,400)) || v.audience!=='controlled_registered' || v.publiclyVisible!==false || v.retrievalEligible!==false) return null;
  if (v.state==='erased'?v.rightsDeclaration!==null || v.rightsNote!==null:v.rightsDeclaration!=='own-text-v1') return null;
  if (v.state==='published' && (!time(v.publishedAt) || v.endedAt!==null) || choice(v.state,['withdrawn','revoked','invalidated','erased']) && !time(v.endedAt)) return null;
  return v as PublicationRecord;
}
export function decodeExperience(v:unknown):Experience|null {
  if (!record(v) || !exact(v,['id','submissionId','submissionVersion','safetyVersion','publicationVersion','title','content','contentKind','benefitDisclosure','authorDisclosure','reviewerDisclosure','source','copyright','rightsPurpose','audience','publiclyVisible','retrievalEligible','canReport','canBlock','place','expiresAt']) || !uuid(v.id) || !uuid(v.submissionId) || !version(v.submissionVersion) || !revision(v.safetyVersion) || !version(v.publicationVersion) || !text(v.title,160) || !text(v.content,4000) || !text(v.benefitDisclosure,400,true) || !choice(v.contentKind,['experience','help']) || !choice(v.authorDisclosure,['registered_user','community_reviewer','official','employee','unknown']) || !nullable(v.reviewerDisclosure,x=>choice(x,['registered_user','community_reviewer','official','employee','unknown'])) || v.source!==({experience:'user_experience',help:'user_help'} as const)[v.contentKind] || v.copyright!=='author_declared_own_text_independently_reviewed' || v.rightsPurpose!=='controlled_experience_display' || v.audience!=='controlled_registered' || v.publiclyVisible!==false || v.retrievalEligible!==false || v.canReport!==true || typeof v.canBlock!=='boolean' || !time(v.expiresAt)) return null;
  if (v.place!==null && !(record(v.place) && exact(v.place,['canonicalPoiId','mappingDigest','label']) && uuid(v.place.canonicalPoiId) && hash(v.place.mappingDigest) && nullable(v.place.label,x=>text(x,160)))) return null;
  return v as Experience;
}
export function decodeExperienceReference(v:unknown):ExperienceReference|null {
  if (!record(v) || !exact(v,['id','publicationId','submissionVersion','safetyVersion','publicationVersion','version','state','availability','experience','createdAt','endedAt']) || !uuid(v.id) || !nullable(v.publicationId,uuid) || !version(v.submissionVersion) || !revision(v.safetyVersion) || !version(v.publicationVersion) || !version(v.version) || !choice(v.state,['saved','unsaved','erased']) || !choice(v.availability,['current','unavailable']) || !time(v.createdAt) || !nullable(v.endedAt,time)) return null;
  if (v.state==='saved'?v.version!==1 || v.endedAt!==null:v.version<2 || !time(v.endedAt)) return null;
  if (v.state==='erased' && v.publicationId!==null) return null;
  if (v.availability==='unavailable') return v.experience===null?v as ExperienceReference:null;
  const e=decodeExperience(v.experience);
  return e && v.state==='saved' && e.id===v.publicationId && e.submissionVersion===v.submissionVersion && e.safetyVersion===v.safetyVersion && e.publicationVersion===v.publicationVersion?v as ExperienceReference:null;
}
const rows=(v:unknown,n:number,check:(v:unknown)=>boolean)=>Array.isArray(v) && v.length<=n && v.every(check);
const retainedValid=(v:unknown)=>Array.isArray(v) && v.length===publicationRetained.length && v.every((x,i)=>x===publicationRetained[i]);
export function decodePublicationOutcome(v:unknown):PublicationOutcome|null {
  if (!record(v) || v.schemaVersion!==PUBLICATION_SCHEMA || !uuid(v.actorId) || !uuid(v.sessionId)) return null;
  const base=['schemaVersion','kind','actorId','sessionId'];
  if (v.kind==='session') return exact(v,base)?v as PublicationOutcome:null;
  if (v.kind==='preview') {const p=v.preview;return exact(v,[...base,'preview']) && record(p) && exact(p,['object','previewDigest','audience','rightsDeclarationRequired','expiresAt']) && decodeSafetyObject(p.object) && hash(p.previewDigest) && p.audience==='controlled_registered' && p.rightsDeclarationRequired==='own-text-v1' && time(p.expiresAt) && p.expiresAt===(p.object as SafetyObject).expiresAt?v as PublicationOutcome:null;}
  if (v.kind==='detail') return exact(v,[...base,'experience']) && decodeExperience(v.experience)?v as PublicationOutcome:null;
  if (v.kind==='publication') return exact(v,[...base,'publication']) && decodePublication(v.publication)?v as PublicationOutcome:null;
  if (v.kind==='reference') return exact(v,[...base,'reference']) && decodeExperienceReference(v.reference)?v as PublicationOutcome:null;
  if (choice(v.kind,['list','publications','saved'])) {
    const key=v.kind==='list'?'experiences':v.kind==='publications'?'publications':'references';
    const check=v.kind==='list'?decodeExperience:v.kind==='publications'?decodePublication:decodeExperienceReference;
    if (!exact(v,[...base,key,'nextCursor','complete']) || !nullable(v.nextCursor,uuid) || v.complete!==(v.nextCursor===null) || !rows(v[key],50,x=>!!check(x))) return null;
    const ids=(v[key] as {id:string}[]).map(x=>x.id);
    return ids.every((id,i)=>i===0 || id>ids[i-1]) && (v.nextCursor===null || ids.at(-1)===v.nextCursor)?v as PublicationOutcome:null;
  }
  if (v.kind==='operation') return exact(v,[...base,'operationId','state','publication','reference']) && uuid(v.operationId) && choice(v.state,['absent','committed','abandoned']) && (v.state==='committed'?(v.publication===null || !!decodePublication(v.publication)) && (v.reference===null || !!decodeExperienceReference(v.reference)) && !(v.publication!==null && v.reference!==null):v.publication===null && v.reference===null)?v as PublicationOutcome:null;
  if (v.kind==='deleted') return exact(v,[...base,'operationId','scope','retained']) && uuid(v.operationId) && v.scope==='community_publication_module' && retainedValid(v.retained)?v as PublicationOutcome:null;
  if (v.kind!=='export' || !exact(v,[...base,'scope','coverage','publications','references','authoredRightsReviews','receipts','audits','qualification','retained']) || v.scope!=='community_publication_module' || v.coverage!=='complete_for_community_publication' || !retainedValid(v.retained)) return null;
  const pubs=rows(v.publications,100,x=>!!decodePublication(x));
  const refs=rows(v.references,100,x=>!!decodeExperienceReference(x) && (x as ExperienceReference).experience===null && (x as ExperienceReference).availability==='unavailable');
  const reviews=rows(v.authoredRightsReviews,100,x=>record(x) && exact(x,['publicationId','decision','note','createdAt']) && uuid(x.publicationId) && choice(x.decision,['approve','reject']) && nullable(x.note,y=>text(y,400)) && time(x.createdAt));
  const receipts=rows(v.receipts,100,x=>record(x) && exact(x,['operationId','recordId','action','state','digest']) && uuid(x.operationId) && nullable(x.recordId,uuid) && choice(x.action,publicationActions) && choice(x.state,['committed','abandoned']) && hash(x.digest));
  const audits=rows(v.audits,100,x=>record(x) && exact(x,['recordId','action','createdAt']) && nullable(x.recordId,uuid) && choice(x.action,publicationActions) && time(x.createdAt));
  const q=v.qualification;
  return pubs && refs && reviews && receipts && audits && (q===null || record(q) && exact(q,['rightsReviewer','publisher']) && typeof q.rightsReviewer==='boolean' && typeof q.publisher==='boolean')?v as PublicationOutcome:null;
}
export function matchesPublicationOutcome(o:PublicationOutcome,input:PublicationInput,actor:string,session:string):boolean {
  if (o.actorId!==actor || o.sessionId!==session) return false;
  if (input.action==='session' || input.action==='export') return o.kind===input.action;
  if (input.action==='preview') return o.kind==='preview' && o.preview.object.id===input.submissionId;
  if (input.action==='detail') return o.kind==='detail' && o.experience.id===input.publicationId;
  if (input.action==='inspect') return o.kind==='publication' && o.publication.id===input.publicationId;
  if (input.action==='reference') return o.kind==='reference' && o.reference.id===input.referenceId;
  if (input.action==='list' || input.action==='saved' || input.action==='mine' || input.action==='queue') {
    if (input.action==='list' && o.kind!=='list' || input.action==='saved' && o.kind!=='saved' || choice(input.action,['mine','queue']) && o.kind!=='publications') return false;
    const items=o.kind==='list'?o.experiences:o.kind==='saved'?o.references:o.kind==='publications'?o.publications:[];
    return (input.cursor===null || items.every(x=>x.id>input.cursor!.toLowerCase())) && (input.action!=='queue' || o.kind==='publications' && o.publications.every(x=>x.state==='pending_rights' || x.state==='rights_approved'));
  }
  if (input.action==='delete') return o.kind==='deleted' && o.operationId===input.operationId;
  if (!('operationId' in input) || o.kind!=='operation' || o.operationId!==input.operationId) return false;
  const original=isPublicationMutation(input)?input:parsePublicationInput(JSON.parse(input.mutationBytes));
  if (!original || !isPublicationMutation(original)) return false;
  if (o.state!=='committed') return true;
  if (original.action==='delete') return o.publication===null && o.reference===null;
  if (original.action==='save' || original.action==='unsave') return o.publication===null && (o.reference===null || o.reference.id===original.referenceId && (original.action!=='save' || o.reference.publicationId===original.publicationId || o.reference.state==='erased'));
  return o.reference===null && (o.publication===null || o.publication.id===original.publicationId && (original.action!=='requestPublication' || o.publication.submissionId===original.submissionId));
}
/** No export, saved snapshot or old URL grants current display authority. */
export function outcomeExperiences(o:PublicationOutcome):readonly Experience[] {
  if (o.kind==='detail') return [o.experience];
  if (o.kind==='list') return o.experiences;
  if (o.kind==='reference') return o.reference.experience?[o.reference.experience]:[];
  if (o.kind==='saved') return o.references.flatMap(x=>x.experience?[x.experience]:[]);
  if (o.kind==='operation') return o.reference?.experience?[o.reference.experience]:[];
  return [];
}
