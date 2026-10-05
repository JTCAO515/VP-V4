import { record,uuid,decodeCommunityOutcome,parseCommunityInput,matchesCommunityOutcome,type CommunityOutcome } from '../../../lib/server/community/contract.ts';
export type CommunityIdentity=Readonly<{actorId:string;sessionId:string;expiresAt:number}>;
type Auth={getSession():PromiseLike<{data:{session:{access_token:string}|null};error:unknown}>;getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>};
export async function communityBrowserIdentity(auth:Auth|null):Promise<CommunityIdentity|null> {
  if (!auth) return null;
  const before=await auth.getSession();if (before.error || !before.data.session) return null;
  const user=await auth.getUser();if (user.error || !user.data.user) return null;
  const after=await auth.getSession();if (after.error || after.data.session?.access_token!==before.data.session.access_token) return null;
  try {
    const p:unknown=JSON.parse(atob(before.data.session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if (!record(p) || !uuid(p.sub) || p.sub!==user.data.user.id || !uuid(p.session_id) || typeof p.exp!=='number' || !Number.isSafeInteger(p.exp*1000) || p.exp*1000<=Date.now()) return null;
    return {actorId:p.sub,sessionId:p.session_id,expiresAt:p.exp*1000};
  } catch {return null;}
}
export async function communitySend(bytes:string,identity:CommunityIdentity,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<{data:CommunityOutcome}|{error:string}> {
  const command=parseCommunityInput(JSON.parse(bytes));if (!command) return {error:'INVALID_INPUT'};
  const response=await fetcher('/api/ops/community',{method:'POST',headers:{'Content-Type':'application/json','x-community-expected-actor':identity.actorId,'x-community-expected-session':identity.sessionId},body:bytes,signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
  let wire:unknown;try {wire=await response.json();} catch {return {error:'COMMUNITY_UNAVAILABLE'};}
  if (!record(wire)) return {error:'COMMUNITY_UNAVAILABLE'};
  if (!response.ok) return Object.keys(wire).length===1 && typeof wire.error==='string'?{error:wire.error}:{error:'COMMUNITY_UNAVAILABLE'};
  const data=Object.keys(wire).length===1?decodeCommunityOutcome(wire.data):null;
  return data && matchesCommunityOutcome(data,command,identity.actorId,identity.sessionId)?{data}:{error:'COMMUNITY_UNAVAILABLE'};
}
