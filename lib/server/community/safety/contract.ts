/** Canonical J2 wire. Internal objects only; qualification is never affiliation. */
export const SAFETY_SCHEMA = 'community-safety-j2/1' as const;
export const safetyRetained = ['operation_fences','record_tombstones','audit_metadata'] as const;
export const record = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
export const exact = (v:Record<string,unknown>,keys:readonly string[]) => Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
export const uuid = (v:unknown):v is string => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const text = (v:unknown,max:number,empty=false):v is string => typeof v==='string' && v.length<=max && !v.includes('\0') && (empty || !!v.trim());
const choice = <T extends string>(v:unknown,values:readonly T[]):v is T => typeof v==='string' && values.includes(v as T);
const revision = (v:unknown):v is number => typeof v==='number' && Number.isSafeInteger(v) && v>=0 && v<=2147483647;
const version = (v:unknown):v is number => revision(v) && v>=1;
const time = (v:unknown):v is string => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v.slice(0,10)).toISOString().slice(0,10)===v.slice(0,10);
const nullable = (v:unknown,check:(v:unknown)=>boolean) => v===null || check(v);
const hash = (v:unknown):v is string => typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
export const collections = ['reports','dispositions','appeals','blocks'] as const;
export type SafetyCollection = typeof collections[number];
export type SafetyMutation = Readonly<{action:'report';operationId:string;reportId:string;submissionId:string;expectedSubmissionVersion:number;expectedSafetyVersion:number;category:'abuse'|'rights'|'misleading'|'other';details:string;consent:'internal-safety-v1'}>
  | Readonly<{action:'disposition';operationId:string;reportId:string;expectedReportVersion:1;expectedSubmissionVersion:number;expectedSafetyVersion:number;decision:'dismiss'|'remove';note:string}>
  | Readonly<{action:'appeal';operationId:string;appealId:string;submissionId:string;expectedSubmissionVersion:number;expectedSafetyVersion:number;basis:'j1_rejection'|'safety_removal';statement:string;consent:'internal-safety-v1'}>
  | Readonly<{action:'appealReview';operationId:string;appealId:string;expectedAppealVersion:1;expectedSubmissionVersion:number;expectedSafetyVersion:number;decision:'uphold'|'restore';note:string}>
  | Readonly<{action:'block';operationId:string;blockId:string;submissionId:string;expectedSubmissionVersion:number;expectedSafetyVersion:number}>
  | Readonly<{action:'unblock';operationId:string;blockId:string;expectedVersion:1}>
  | Readonly<{action:'delete';operationId:string;confirmed:true}>;
export type SafetyInput = SafetyMutation | Readonly<{action:'objects';cursor:string|null}>
  | Readonly<{action:'object'|'eligibility';submissionId:string}>
  | Readonly<{action:'mine';collection:SafetyCollection;cursor:string|null}>
  | Readonly<{action:'read';collection:SafetyCollection;id:string}>
  | Readonly<{action:'queue';collection:'reports'|'appeals';cursor:string|null}>
  | Readonly<{action:'inspect';collection:'reports'|'appeals';id:string}>
  | Readonly<{action:'operation'|'abandon';operationId:string;mutationBytes:string}>
  | Readonly<{action:'session'|'export'}>;
export const isSafetyMutation = (v:SafetyInput):v is SafetyMutation => ['report','disposition','appeal','appealReview','block','unblock','delete'].includes(v.action);
export const safetySideEffect = (v:SafetyInput) => isSafetyMutation(v) || v.action==='abandon';
export function parseSafetyInput(v:unknown):SafetyInput|null {
  if (!record(v)) return null;
  if (choice(v.action,['session','export'])) return exact(v,['action'])?v as SafetyInput:null;
  if (choice(v.action,['object','eligibility'])) return exact(v,['action','submissionId']) && uuid(v.submissionId)?v as SafetyInput:null;
  if (v.action==='objects') return exact(v,['action','cursor']) && nullable(v.cursor,uuid)?v as SafetyInput:null;
  if (choice(v.action,['mine','queue'])) return exact(v,['action','collection','cursor']) && choice(v.collection,v.action==='mine'?collections:['reports','appeals']) && nullable(v.cursor,uuid)?v as SafetyInput:null;
  if (choice(v.action,['read','inspect'])) return exact(v,['action','collection','id']) && choice(v.collection,v.action==='read'?collections:['reports','appeals']) && uuid(v.id)?v as SafetyInput:null;
  if (!uuid(v.operationId)) return null;
  if (choice(v.action,['operation','abandon'])) {
    if (!exact(v,['action','operationId','mutationBytes']) || !text(v.mutationBytes,10000) || new TextEncoder().encode(v.mutationBytes).length>24000) return null;
    let original:unknown;try {original=JSON.parse(v.mutationBytes);} catch {return null;}
    if (!record(original) || !choice(original.action,['report','disposition','appeal','appealReview','block','unblock','delete'])) return null;
    const parsed=parseSafetyInput(original);
    return parsed && isSafetyMutation(parsed) && parsed.operationId===v.operationId?v as SafetyInput:null;
  }
  if (v.action==='delete') return exact(v,['action','operationId','confirmed']) && v.confirmed===true?v as SafetyInput:null;
  if (v.action==='unblock') return exact(v,['action','operationId','blockId','expectedVersion']) && uuid(v.blockId) && v.expectedVersion===1?v as SafetyInput:null;
  if (!version(v.expectedSubmissionVersion) || !revision(v.expectedSafetyVersion)) return null;
  if (v.action==='report') return exact(v,['action','operationId','reportId','submissionId','expectedSubmissionVersion','expectedSafetyVersion','category','details','consent']) && uuid(v.reportId) && uuid(v.submissionId) && choice(v.category,['abuse','rights','misleading','other']) && text(v.details,1000) && v.consent==='internal-safety-v1'?v as SafetyInput:null;
  if (v.action==='disposition') return exact(v,['action','operationId','reportId','expectedReportVersion','expectedSubmissionVersion','expectedSafetyVersion','decision','note']) && uuid(v.reportId) && v.expectedReportVersion===1 && choice(v.decision,['dismiss','remove']) && text(v.note,400)?v as SafetyInput:null;
  if (v.action==='appeal') return exact(v,['action','operationId','appealId','submissionId','expectedSubmissionVersion','expectedSafetyVersion','basis','statement','consent']) && uuid(v.appealId) && uuid(v.submissionId) && choice(v.basis,['j1_rejection','safety_removal']) && text(v.statement,1000) && v.consent==='internal-safety-v1'?v as SafetyInput:null;
  if (v.action==='appealReview') return exact(v,['action','operationId','appealId','expectedAppealVersion','expectedSubmissionVersion','expectedSafetyVersion','decision','note']) && uuid(v.appealId) && v.expectedAppealVersion===1 && choice(v.decision,['uphold','restore']) && text(v.note,400)?v as SafetyInput:null;
  return v.action==='block' && exact(v,['action','operationId','blockId','submissionId','expectedSubmissionVersion','expectedSafetyVersion']) && uuid(v.blockId) && uuid(v.submissionId)?v as SafetyInput:null;
}
export type SafetyObject = Readonly<{id:string;submissionVersion:number;safetyVersion:number;title:string;content:string;contentKind:'experience'|'help'|'unknown';benefitDisclosure:string|null;authorDisclosure:'registered_user'|'community_reviewer'|'official'|'employee'|'unknown';reviewerDisclosure:'registered_user'|'community_reviewer'|'official'|'employee'|'unknown'|null;source:'user_experience'|'user_help'|'unknown';copyright:'unknown';visibility:'internal';publiclyVisible:false;retrievalEligible:false;canReport:boolean;canBlock:boolean;expiresAt:string}>;
export type SafetyReport = Readonly<{kind:'report';id:string;submissionId:string;submissionVersion:number;safetyVersion:number;category:'abuse'|'rights'|'misleading'|'other';details:string|null;state:'pending'|'dismissed'|'removed'|'erased';version:number;createdAt:string;resolvedAt:string|null;note:string|null}>;
export type SafetyDisposition = Readonly<{kind:'disposition';id:string;submissionId:string;submissionVersion:number;safetyVersion:number;state:'clear'|'removed'|'unavailable';j1Status:'pending'|'published'|'rejected'|'withdrawn'|'deleted';note:string|null;appealable:boolean}>;
export type SafetyAppeal = Readonly<{kind:'appeal';id:string;submissionId:string;submissionVersion:number;safetyVersion:number;basis:'j1_rejection'|'safety_removal';statement:string|null;state:'pending'|'upheld'|'restored'|'erased';version:number;createdAt:string;resolvedAt:string|null;note:string|null}>;
export type SafetyBlock = Readonly<{kind:'block';id:string;submissionId:string|null;state:'blocked'|'unblocked'|'erased';version:number;createdAt:string;endedAt:string|null}>;
export type SafetyRecord = SafetyReport|SafetyDisposition|SafetyAppeal|SafetyBlock;
export type SafetyAudit = Readonly<{recordId:string|null;action:SafetyMutation['action'];createdAt:string}>;
export type SafetyReaderGrant = Readonly<{submissionId:string;submissionVersion:number;expiresAt:string;revoked:boolean}>;
export type SafetyAuthoredDecision = Readonly<{recordId:string;kind:'report'|'appeal';decision:'dismiss'|'remove'|'uphold'|'restore';note:string|null;createdAt:string}>;
export type SafetyReceipt = Readonly<{operationId:string;recordId:string|null;action:SafetyMutation['action'];state:'committed'|'abandoned';digest:string}>;
type Base = Readonly<{schemaVersion:typeof SAFETY_SCHEMA;actorId:string;sessionId:string}>;
export type SafetyOutcome = Base & (Readonly<{kind:'session'}>
  | Readonly<{kind:'objects';objects:readonly SafetyObject[];nextCursor:string|null;complete:boolean}>
  | Readonly<{kind:'object';object:SafetyObject}>
  | Readonly<{kind:'page';collection:SafetyCollection;records:readonly SafetyRecord[];nextCursor:string|null;complete:boolean}>
  | Readonly<{kind:'record';record:SafetyRecord}>
  | Readonly<{kind:'operation';operationId:string;state:'absent'|'committed'|'abandoned';record:SafetyRecord|null}>
  | Readonly<{kind:'eligibility';submissionId:string;publicationEnabled:false;publiclyVisible:false;retrievalEligible:false;reason:'public_disabled'}>
  | Readonly<{kind:'deleted';operationId:string;scope:'community_safety_module';retained:typeof safetyRetained}>
  | Readonly<{kind:'export';scope:'community_safety_module';coverage:'complete_for_community_safety';reports:readonly SafetyReport[];dispositions:readonly SafetyDisposition[];appeals:readonly SafetyAppeal[];blocks:readonly SafetyBlock[];authoredDecisions:readonly SafetyAuthoredDecision[];readerGrants:readonly SafetyReaderGrant[];receipts:readonly SafetyReceipt[];audits:readonly SafetyAudit[];qualification:Readonly<{active:boolean}>|null;retained:typeof safetyRetained}>);
const affiliations = ['registered_user','community_reviewer','official','employee','unknown'] as const;
export function decodeSafetyObject(v:unknown):SafetyObject|null {
  return record(v) && exact(v,['id','submissionVersion','safetyVersion','title','content','contentKind','benefitDisclosure','authorDisclosure','reviewerDisclosure','source','copyright','visibility','publiclyVisible','retrievalEligible','canReport','canBlock','expiresAt']) && uuid(v.id) && version(v.submissionVersion) && revision(v.safetyVersion) && text(v.title,160) && text(v.content,4000) && choice(v.contentKind,['experience','help','unknown']) && nullable(v.benefitDisclosure,x=>text(x,400,true)) && choice(v.authorDisclosure,affiliations) && nullable(v.reviewerDisclosure,x=>choice(x,affiliations)) && v.source===({experience:'user_experience',help:'user_help',unknown:'unknown'} as const)[v.contentKind] && v.copyright==='unknown' && v.visibility==='internal' && v.publiclyVisible===false && v.retrievalEligible===false && typeof v.canReport==='boolean' && typeof v.canBlock==='boolean' && time(v.expiresAt)?v as SafetyObject:null;
}
export function decodeSafetyRecord(v:unknown):SafetyRecord|null {
  if (!record(v) || !uuid(v.id)) return null;
  if (v.kind==='disposition') return exact(v,['kind','id','submissionId','submissionVersion','safetyVersion','state','j1Status','note','appealable']) && uuid(v.submissionId) && v.id===v.submissionId && version(v.submissionVersion) && revision(v.safetyVersion) && choice(v.state,['clear','removed','unavailable']) && choice(v.j1Status,['pending','published','rejected','withdrawn','deleted']) && nullable(v.note,x=>text(x,400)) && typeof v.appealable==='boolean' && (!(v.j1Status==='withdrawn' || v.j1Status==='deleted') || v.state==='unavailable' && v.appealable===false)?v as SafetyDisposition:null;
  if (!version(v.version) || !time(v.createdAt)) return null;
  if (v.kind==='block') return exact(v,['kind','id','submissionId','state','version','createdAt','endedAt']) && nullable(v.submissionId,uuid) && choice(v.state,['blocked','unblocked','erased']) && (v.state==='blocked'?v.version===1 && v.endedAt===null:!!time(v.endedAt) && v.version>=2) && (v.state!=='erased' || v.submissionId===null)?v as SafetyBlock:null;
  if (!uuid(v.submissionId) || !version(v.submissionVersion) || !revision(v.safetyVersion) || !nullable(v.resolvedAt,time) || !nullable(v.note,x=>text(x,400))) return null;
  if (v.kind==='report') return exact(v,['kind','id','submissionId','submissionVersion','safetyVersion','category','details','state','version','createdAt','resolvedAt','note']) && choice(v.category,['abuse','rights','misleading','other']) && choice(v.state,['pending','dismissed','removed','erased']) && (v.state==='erased'?v.details===null && v.note===null:text(v.details,1000)) && (v.state==='pending'?v.version===1 && v.resolvedAt===null && v.note===null:v.version>=2 && time(v.resolvedAt))?v as SafetyReport:null;
  return v.kind==='appeal' && exact(v,['kind','id','submissionId','submissionVersion','safetyVersion','basis','statement','state','version','createdAt','resolvedAt','note']) && choice(v.basis,['j1_rejection','safety_removal']) && choice(v.state,['pending','upheld','restored','erased']) && (v.state==='erased'?v.statement===null && v.note===null:text(v.statement,1000)) && (v.state==='pending'?v.version===1 && v.resolvedAt===null && v.note===null:v.version>=2 && time(v.resolvedAt))?v as SafetyAppeal:null;
}
const rows = (v:unknown,max:number,check:(v:unknown)=>boolean) => Array.isArray(v) && v.length<=max && v.every(check);
const recordKind = (c:SafetyCollection):SafetyRecord['kind'] => ({reports:'report',dispositions:'disposition',appeals:'appeal',blocks:'block'})[c] as SafetyRecord['kind'];
const retainedValid = (v:unknown) => Array.isArray(v) && v.length===safetyRetained.length && v.every((x,i)=>x===safetyRetained[i]);
export function decodeSafetyOutcome(v:unknown):SafetyOutcome|null {
  if (!record(v) || v.schemaVersion!==SAFETY_SCHEMA || !uuid(v.actorId) || !uuid(v.sessionId)) return null;
  const base=['schemaVersion','kind','actorId','sessionId'];
  if (v.kind==='session') return exact(v,base)?v as SafetyOutcome:null;
  if (v.kind==='object') return exact(v,[...base,'object']) && decodeSafetyObject(v.object)?v as SafetyOutcome:null;
  if (v.kind==='objects' || v.kind==='page') {
    const objects=v.kind==='objects';const items=objects?v.objects:v.records;
    if (!exact(v,[...base,...(objects?['objects']:['collection','records']),'nextCursor','complete']) || !nullable(v.nextCursor,uuid) || v.complete!==(v.nextCursor===null) || !rows(items,50,objects?x=>!!decodeSafetyObject(x):x=>choice(v.collection,collections) && decodeSafetyRecord(x)?.kind===recordKind(v.collection))) return null;
    const ids=(items as {id:string}[]).map(x=>x.id);
    return new Set(ids).size===ids.length && (v.nextCursor===null || ids.at(-1)===v.nextCursor)?v as SafetyOutcome:null;
  }
  if (v.kind==='record') return exact(v,[...base,'record']) && decodeSafetyRecord(v.record)?v as SafetyOutcome:null;
  if (v.kind==='operation') return exact(v,[...base,'operationId','state','record']) && uuid(v.operationId) && choice(v.state,['absent','committed','abandoned']) && (v.state==='committed'?v.record===null || !!decodeSafetyRecord(v.record):v.record===null)?v as SafetyOutcome:null;
  if (v.kind==='eligibility') return exact(v,[...base,'submissionId','publicationEnabled','publiclyVisible','retrievalEligible','reason']) && uuid(v.submissionId) && v.publicationEnabled===false && v.publiclyVisible===false && v.retrievalEligible===false && v.reason==='public_disabled'?v as SafetyOutcome:null;
  if (v.kind==='deleted') return exact(v,[...base,'operationId','scope','retained']) && uuid(v.operationId) && v.scope==='community_safety_module' && retainedValid(v.retained)?v as SafetyOutcome:null;
  if (v.kind!=='export' || !exact(v,[...base,'scope','coverage','reports','dispositions','appeals','blocks','authoredDecisions','readerGrants','receipts','audits','qualification','retained']) || v.scope!=='community_safety_module' || v.coverage!=='complete_for_community_safety' || !retainedValid(v.retained)) return null;
  const own=collections.every(c=>rows(v[c],100,x=>decodeSafetyRecord(x)?.kind===recordKind(c)));
  const actions=['report','disposition','appeal','appealReview','block','unblock','delete'] as const;
  const receipts=rows(v.receipts,100,x=>record(x) && exact(x,['operationId','recordId','action','state','digest']) && uuid(x.operationId) && nullable(x.recordId,uuid) && choice(x.action,actions) && choice(x.state,['committed','abandoned']) && hash(x.digest));
  const audits=rows(v.audits,100,x=>record(x) && exact(x,['recordId','action','createdAt']) && nullable(x.recordId,uuid) && choice(x.action,actions) && time(x.createdAt));
  const authored=rows(v.authoredDecisions,100,x=>record(x) && exact(x,['recordId','kind','decision','note','createdAt']) && uuid(x.recordId) && (x.kind==='report'?choice(x.decision,['dismiss','remove']):x.kind==='appeal' && choice(x.decision,['uphold','restore'])) && nullable(x.note,y=>text(y,400)) && time(x.createdAt));
  const grants=rows(v.readerGrants,100,x=>record(x) && exact(x,['submissionId','submissionVersion','expiresAt','revoked']) && uuid(x.submissionId) && version(x.submissionVersion) && time(x.expiresAt) && typeof x.revoked==='boolean');
  return own && authored && grants && receipts && audits && (v.qualification===null || record(v.qualification) && exact(v.qualification,['active']) && typeof v.qualification.active==='boolean')?v as SafetyOutcome:null;
}
export function matchesSafetyOutcome(o:SafetyOutcome,input:SafetyInput,actor:string,session:string):boolean {
  if (o.actorId!==actor || o.sessionId!==session) return false;
  if (input.action==='session') return o.kind==='session';
  if (input.action==='export') return o.kind==='export';
  if (input.action==='eligibility') return o.kind==='eligibility' && o.submissionId===input.submissionId;
  if (input.action==='object') return o.kind==='object' && o.object.id===input.submissionId;
  if (input.action==='objects') return o.kind==='objects' && (input.cursor===null || o.objects.every(x=>x.id>input.cursor!.toLowerCase()));
  if (input.action==='mine' || input.action==='queue') return o.kind==='page' && o.collection===input.collection && (input.cursor===null || o.records.every(x=>x.id>input.cursor!.toLowerCase())) && (input.action!=='queue' || o.records.every(x=>'state' in x && x.state==='pending'));
  if (input.action==='read' || input.action==='inspect') return o.kind==='record' && o.record.id===input.id && o.record.kind===recordKind(input.collection);
  if (input.action==='delete') return o.kind==='deleted' && o.operationId===input.operationId;
  if (!('operationId' in input) || o.kind!=='operation' || o.operationId!==input.operationId) return false;
  let original:SafetyMutation;
  if (input.action==='operation' || input.action==='abandon') {const parsed=parseSafetyInput(JSON.parse(input.mutationBytes));if (!parsed || !isSafetyMutation(parsed)) return false;original=parsed;} else {if (!isSafetyMutation(input)) return false;original=input;}
  if (o.state!=='committed') return input.action==='operation' || input.action==='abandon';
  if (original.action==='delete') return o.record===null;
  const kind=({report:'report',disposition:'report',appeal:'appeal',appealReview:'appeal',block:'block',unblock:'block'} as const)[original.action];
  const id='reportId' in original?original.reportId:'appealId' in original?original.appealId:original.blockId;
  return o.record?.kind===kind && o.record.id===id && (!('submissionId' in original) || o.record.submissionId===original.submissionId || original.action==='block' && o.record.kind==='block' && o.record.state==='erased' && o.record.submissionId===null);
}
