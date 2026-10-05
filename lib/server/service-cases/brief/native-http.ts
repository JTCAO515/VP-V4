import type { NextRequest } from 'next/server.js';
import { getNativeRuntimeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeFetch } from '../../identity/native-fetch.ts';
import { handleTravelerBrief } from './http.ts';
import { decodeBriefDataBundle } from './contract.ts';

export async function travelerBriefNativeHTTP(request: NextRequest) {
  const config = getNativeRuntimeConfig(request,'session');
  const enabled = !!config && !config.environment && !process.env.VERCEL_ENV && process.env.SERVICE_CASE_BRIEF_LOCAL === '1';
  const result = await handleTravelerBrief(request,{enabled,surface:'owner',createRpc:lifetime => {
    const transport: typeof fetch = (url,init) => lifetime.run(() => nativeFetch(url,{...init,signal:init?.signal ? AbortSignal.any([lifetime.signal,init.signal]) : lifetime.signal}));
    let credentials: Awaited<ReturnType<typeof verifyNativeCredentials>>;
    return {
      sessionId() { return credentials?.sessionId ?? null; },
      async authenticate() {
        let unavailable = false;
        credentials = await verifyNativeCredentials(request,config!,transport,() => { unavailable = true; });
        if (unavailable) throw Error('BRIEF_UNAVAILABLE'); if (!credentials) return false;
        const session = await credentials.client.rpc('native_session_v2',{p_action:'session'}).abortSignal(lifetime.signal);
        if (session.error) { if (!['UNAUTHENTICATED','SESSION_REPLACED'].includes(session.error.message)) throw Error('BRIEF_UNAVAILABLE'); return false; }
        return session.data?.subject === credentials.subject && session.data?.sessionId === credentials.sessionId ? credentials.subject : false;
      },
      async call(name,params) { if (!credentials) return {data:null,error:{message:'UNAUTHENTICATED'}}; return credentials.client.rpc(name,params).abortSignal(lifetime.signal); },
    };
  }});
  const bundle = 'data' in result.body ? decodeBriefDataBundle(result.body.data) : null;
  return Response.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff',...(bundle ? {'Content-Disposition':`attachment; filename="visepanda-brief-${bundle.requestId}.json"`} : {})}});
}
