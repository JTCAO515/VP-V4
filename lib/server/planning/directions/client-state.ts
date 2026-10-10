import { isUuid } from '../../identity/request-guards.ts';
export type DirectionsClientLease=Readonly<{scopeKey:string;startedAt:number;deadline:number}>;
export type DirectionsClientPending=Readonly<{scopeKey:string;sourceKey:string;actorKey:string;tripId:string;artifactId:string;revision:number;action:'choose'|'save'|'edit'|'bind';bytes:string}>;
/** UI cache/retry identity only. Canonical RPCs remain the authorization authority. */
export function directionsClientActor(subject:unknown,session:unknown):string|null{
 return typeof subject==='string'&&typeof session==='string'&&isUuid(subject)&&isUuid(session)?subject.toLowerCase()+':'+session.toLowerCase():null;
}
export function directionsClientScope(actor:string|null,tripId:string):string|null{return actor!==null&&isUuid(tripId)?actor+':'+tripId.toLowerCase():null;}
export function directionsClientLeaseCurrent(lease:DirectionsClientLease|null,scopeKey:string|null,now:number):boolean{
 return !!lease&&scopeKey!==null&&lease.scopeKey===scopeKey&&Number.isFinite(now)&&Number.isFinite(lease.startedAt)&&lease.deadline===lease.startedAt+30000&&now>=lease.startedAt&&now<lease.deadline;
}
export function directionsClientSourceKey(source:object,memories:readonly Readonly<{id:string;revision:number}>[]):string{return JSON.stringify([Object.entries(source).sort(([a],[b])=>a.localeCompare(b)),[...memories].sort((a,b)=>a.id.localeCompare(b.id))]);}
export function directionsClientPendingCurrent(pending:DirectionsClientPending|null,scopeKey:string|null,sourceKey?:string|null):boolean{return !!pending&&scopeKey!==null&&pending.scopeKey===scopeKey&&(sourceKey===undefined||sourceKey!==null&&pending.sourceKey===sourceKey)&&directionsClientScope(pending.actorKey,pending.tripId)===scopeKey&&isUuid(pending.artifactId)&&Number.isSafeInteger(pending.revision)&&pending.revision>=1&&pending.revision<=1000;}
export function directionsClientActorChanged(previous:string|null,next:string|null):boolean{return next===null||previous!==next;}
