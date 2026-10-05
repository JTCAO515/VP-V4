import {createServerClient,type CookieOptions} from '@supabase/ssr';
import type {NextRequest,NextResponse} from 'next/server';
import type {RequestLifetime} from '../../knowledge/review/request-lifetime.ts';
import {SAFETY_SCHEMA,uuid,decodeSafetyOutcome} from './contract.ts';
export function createSafetyWebRPC(request:NextRequest,config:{url:string;publishableKey:string},lifetime:RequestLifetime) {
  const pending:{name:string;value:string;options:CookieOptions}[]=[];
  const client=createServerClient(config.url,config.publishableKey,{
    global:{fetch:(url,init)=>lifetime.run(()=>fetch(url,{...init,redirect:'error',signal:init?.signal?AbortSignal.any([init.signal,lifetime.signal]):lifetime.signal}))},
    cookies:{getAll:()=>request.headers.has('authorization')?[]:request.cookies.getAll(),setAll:cookies=>{if (!lifetime.signal.aborted) pending.push(...cookies);}},
  });
  let actor:string|false=false;let session:string|null=null;
  return {sessionId:()=>session,
    async authenticate() {
      if (request.headers.has('authorization')) return false;
      const result=await lifetime.run(()=>client.auth.getClaims());lifetime.check();
      if (result.error) {if (!result.error.status || result.error.status>=500) throw Error('SAFETY_UNAVAILABLE');return false;}
      const c=result.data?.claims;
      const valid=c && uuid(c.sub) && uuid(c.session_id) && c.role==='authenticated' && c.is_anonymous===false && c.aud==='authenticated' && c.iss===`${config.url}/auth/v1` && Number.isFinite(c.exp) && c.exp>Date.now()/1000 && (c.nbf===undefined || typeof c.nbf==='number' && Number.isFinite(c.nbf) && c.nbf<=Date.now()/1000);
      actor=valid?c.sub:false;session=valid?c.session_id:null;return actor;
    },
    async current() {
      if (!actor || !session) return false;
      const {data,error}=await lifetime.run(()=>client.rpc('community_workspace',{p_input:{protocol:SAFETY_SCHEMA,command:{action:'session'},mutationBytes:null}}).abortSignal(lifetime.signal));
      if (error) {if (['UNAUTHENTICATED','SESSION_REPLACED'].includes(error.message)) return false;throw Error('SAFETY_UNAVAILABLE');}
      const o=decodeSafetyOutcome(data);return !!o && o.kind==='session' && o.actorId===actor && o.sessionId===session;
    },
    async call(name:string,input:Record<string,unknown>) {if (!actor || !session) return {data:null,error:{message:'UNAUTHENTICATED'}};return lifetime.run(()=>client.rpc(name,input).abortSignal(lifetime.signal));},
    applyCookies(response:NextResponse) {for (const cookie of pending) response.cookies.set(cookie.name,cookie.value,cookie.options);return response;},
  };
}
