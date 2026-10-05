import {record,uuid,parsePublicationInput,decodePublicationOutcome,matchesPublicationOutcome,type PublicationOutcome} from '../../../../lib/server/community/publication/contract.ts';
export type PublicationIdentity=Readonly<{actorId:string;sessionId:string;expiresAt:number}>;
type Auth={getSession():PromiseLike<{data:{session:{access_token:string}|null};error:unknown}>;getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>};
export async function publicationBrowserIdentity(auth:Auth|null):Promise<PublicationIdentity|null> {
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
export async function publicationSend(bytes:string,identity:PublicationIdentity,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<{data:PublicationOutcome}|{error:string}> {
  let command;try {command=parsePublicationInput(JSON.parse(bytes));} catch {return {error:'INVALID_INPUT'};}
  if (!command) return {error:'INVALID_INPUT'};
  const response=await fetcher('/api/ops/community/publication',{method:'POST',headers:{'Content-Type':'application/json','x-community-publication-expected-actor':identity.actorId,'x-community-publication-expected-session':identity.sessionId},body:bytes,signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
  let wire:unknown;try {wire=await response.json();} catch {return {error:'PUBLICATION_UNAVAILABLE'};}
  if (!record(wire) || Object.keys(wire).length!==1) return {error:'PUBLICATION_UNAVAILABLE'};
  if (!response.ok) return typeof wire.error==='string'?{error:wire.error}:{error:'PUBLICATION_UNAVAILABLE'};
  const data=decodePublicationOutcome(wire.data);
  return data && matchesPublicationOutcome(data,command,identity.actorId,identity.sessionId)?{data}:{error:'PUBLICATION_UNAVAILABLE'};
}
