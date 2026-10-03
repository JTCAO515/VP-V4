/** Persistent source impact DTOs. Qualification does not authorize publication. */
export type SourceImpactClaim=Readonly<{factId:string;assertionId:string;revision:number;payloadHash:string}>;
export type SourceImpactTarget=Readonly<{kind:'wiki_revision'|'wiki_job'|'statement'|'historical_answer';id:string;version:number;payloadHash:string;claimRefs:readonly SourceImpactClaim[]}>;
export type SourceImpactLease=Readonly<{kind:'leased';deliveryId:string;setId:string;reviewVersion:number;sourceDigest:string;target:SourceImpactTarget;leaseToken:string;attempt:number}>;
export type SourceImpactDelivery=Readonly<Omit<SourceImpactLease,'kind'|'leaseToken'>&{kind:'delivery';state:'queued'|'leased'|'failed'|'acked'|'unsupported'|'exhausted';leaseToken:string|null;receiptId:string|null}>;
const row=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const sourceImpactUuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
function target(v:unknown):v is SourceImpactTarget{
 if(!row(v)||!exact(v,['kind','id','version','payloadHash','claimRefs'])||!['wiki_revision','wiki_job','statement','historical_answer'].includes(String(v.kind))||!sourceImpactUuid(v.id)||!integer(v.version,1,Number.MAX_SAFE_INTEGER)||!hash(v.payloadHash)||!Array.isArray(v.claimRefs)||v.claimRefs.length>50)return false;
 return v.claimRefs.every(c=>row(c)&&exact(c,['factId','assertionId','revision','payloadHash'])&&sourceImpactUuid(c.factId)&&sourceImpactUuid(c.assertionId)&&integer(c.revision,1,Number.MAX_SAFE_INTEGER)&&hash(c.payloadHash))&&new Set(v.claimRefs.map(c=>c.factId)).size===v.claimRefs.length;
}
const identityKeys=['deliveryId','setId','reviewVersion','sourceDigest','target','leaseToken','attempt'];
function identity(v:Record<string,unknown>,minAttempt:number){return sourceImpactUuid(v.deliveryId)&&sourceImpactUuid(v.setId)&&integer(v.reviewVersion,1,Number.MAX_SAFE_INTEGER)&&hash(v.sourceDigest)&&target(v.target)&&integer(v.attempt,minAttempt,8);}
export function decodeSourceImpactLease(v:unknown):SourceImpactLease|null{return row(v)&&exact(v,['kind',...identityKeys])&&v.kind==='leased'&&identity(v,1)&&sourceImpactUuid(v.leaseToken)?v as SourceImpactLease:null;}
export function decodeSourceImpactDelivery(v:unknown):SourceImpactDelivery|null{
 if(!row(v)||!exact(v,['kind',...identityKeys,'state','receiptId'])||v.kind!=='delivery'||!identity(v,0)||!['queued','leased','failed','acked','unsupported','exhausted'].includes(String(v.state))||v.leaseToken!==null&&!sourceImpactUuid(v.leaseToken)||v.receiptId!==null&&!sourceImpactUuid(v.receiptId))return null;
 if(v.state==='acked'&&(!sourceImpactUuid(v.receiptId)||!sourceImpactUuid(v.leaseToken)||!integer(v.attempt,1,8)))return null;
 return v as SourceImpactDelivery;
}
function sameTarget(a:SourceImpactTarget,b:SourceImpactTarget){return a.kind===b.kind&&a.id===b.id&&a.version===b.version&&a.payloadHash===b.payloadHash&&a.claimRefs.length===b.claimRefs.length&&a.claimRefs.every((c,i)=>c.factId===b.claimRefs[i].factId&&c.assertionId===b.claimRefs[i].assertionId&&c.revision===b.claimRefs[i].revision&&c.payloadHash===b.claimRefs[i].payloadHash);}
export function sameSourceImpactDelivery(saved:SourceImpactDelivery,lease:SourceImpactLease):boolean{return saved.deliveryId===lease.deliveryId&&saved.setId===lease.setId&&saved.reviewVersion===lease.reviewVersion&&saved.sourceDigest===lease.sourceDigest&&saved.leaseToken===lease.leaseToken&&saved.attempt===lease.attempt&&sameTarget(saved.target,lease.target);}
export function sourceImpactApplied(v:unknown,l:SourceImpactLease):boolean{return row(v)&&exact(v,['kind','deliveryId','receiptId','digest'])&&v.kind==='applied'&&v.deliveryId===l.deliveryId&&sourceImpactUuid(v.receiptId)&&v.digest===l.sourceDigest;}
export function sourceImpactFailed(v:unknown,l:SourceImpactLease):boolean{return row(v)&&exact(v,['kind','deliveryId','nextAttemptAt'])&&v.kind==='failed'&&v.deliveryId===l.deliveryId&&typeof v.nextAttemptAt==='string'&&Number.isFinite(Date.parse(v.nextAttemptAt));}
export function sourceImpactIdle(v:unknown):boolean{return row(v)&&exact(v,['kind'])&&v.kind==='idle';}
