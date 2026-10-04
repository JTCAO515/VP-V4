import {isClassificationOperation,type ClassificationOperation} from './contract.ts';
export type PendingClassification=Readonly<{actorId:string;input:ClassificationOperation;createdAt:number}>;
/** Bounded session-only operation recovery; no credential/token persistence. */
export const PENDING_CLASSIFICATION_KEY='vp.ops.classification.pending/1';
export function decodePendingClassification(v:unknown,now=Date.now()):PendingClassification|null{
 if(v===null||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==3)return null;const p=v as Record<string,unknown>;
 if(typeof p.actorId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.actorId)||!isClassificationOperation(p.input)||typeof p.createdAt!=='number'||!Number.isSafeInteger(p.createdAt)||p.createdAt>now)return null;return p as PendingClassification;
}
export async function dispatchClassificationPending(p:PendingClassification,io:Readonly<{isCurrent:()=>boolean;currentActor:()=>Promise<string|null>;send:(input:ClassificationOperation)=>Promise<{ok:boolean;status:number;data:unknown}>}>){
 try{if(!io.isCurrent()||await io.currentActor()!==p.actorId||!io.isCurrent())return {kind:'identity_changed'} as const;const r=await io.send(p.input);if(!io.isCurrent()||await io.currentActor()!==p.actorId||!io.isCurrent())return {kind:'identity_changed'} as const;return r.ok?{kind:'received',data:r.data} as const:{kind:'unknown'} as const;}catch{return {kind:'unknown'} as const;}
}

/** A first send is permitted only after its exact recovery record was saved. */
export async function beginClassificationPending(p:PendingClassification,io:Readonly<{save:(p:PendingClassification)=>boolean;dispatch:(p:PendingClassification)=>Promise<void>}>):Promise<boolean>{
 try{if(!io.save(p))return false;}catch{return false;}await io.dispatch(p);return true;
}
