import {record,uuid,parseSafetyInput,decodeSafetyOutcome,matchesSafetyOutcome,type SafetyOutcome} from '../../../../lib/server/community/safety/contract.ts';
export type SafetyIdentity=Readonly<{actorId:string;sessionId:string;expiresAt:number}>;
type Auth={getSession():PromiseLike<{data:{session:{access_token:string}|null};error:unknown}>;getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>};
export async function safetyBrowserIdentity(auth:Auth|null):Promise<SafetyIdentity|null> {
  if (!auth) return null;
  const before=await auth.getSession();if (before.error || !before.data.session) return null;
  const user=await auth.getUser();if (user.error || !user.data.user) return null;
  const after=await auth.getSession();if (after.error || after.data.session?.access_token!==before.data.session.access_token) return null;
  try {
    const p:unknown=JSON.parse(atob(before.data.session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if (!record(p) || !uuid(p.sub) || p.sub!==user.data.user.id || !uuid(p.session_id) || p.role!=='authenticated' || p.is_anonymous!==false || p.aud!=='authenticated' || typeof p.exp!=='number' || !Number.isSafeInteger(p.exp*1000) || p.exp*1000<=Date.now()) return null;
    return {actorId:p.sub,sessionId:p.session_id,expiresAt:p.exp*1000};
  } catch {return null;}
}
export async function safetySend(bytes:string,identity:SafetyIdentity,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<{data:SafetyOutcome}|{error:string}> {
  let command;try {command=parseSafetyInput(JSON.parse(bytes));} catch {return {error:'INVALID_INPUT'};}
  if (!command) return {error:'INVALID_INPUT'};
  const response=await fetcher('/api/ops/community/safety',{method:'POST',headers:{'Content-Type':'application/json','x-community-safety-expected-actor':identity.actorId,'x-community-safety-expected-session':identity.sessionId},body:bytes,signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
  let wire:unknown;try {wire=await response.json();} catch {return {error:'SAFETY_UNAVAILABLE'};}
  if (!record(wire) || Object.keys(wire).length!==1) return {error:'SAFETY_UNAVAILABLE'};
  if (!response.ok) return typeof wire.error==='string'?{error:wire.error}:{error:'SAFETY_UNAVAILABLE'};
  const data=decodeSafetyOutcome(wire.data);
  return data && matchesSafetyOutcome(data,command,identity.actorId,identity.sessionId)?{data}:{error:'SAFETY_UNAVAILABLE'};
}
