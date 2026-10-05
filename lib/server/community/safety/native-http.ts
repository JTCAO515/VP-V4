import type {NextRequest} from 'next/server.js';
import {getNativeRuntimeConfig} from '../../identity/native-config.ts';
import {verifyNativeCredentials} from '../../identity/native-credentials.ts';
import {nativeFetch} from '../../identity/native-fetch.ts';
import {handleSafetyRequest} from './http.ts';
export async function safetyNativeHTTP(request:NextRequest) {
  const config=getNativeRuntimeConfig(request,'session');
  const configured=!!config && !config.environment && !process.env.VERCEL_ENV;
  const result=await handleSafetyRequest(request,{enabled:configured && process.env.COMMUNITY_SAFETY_INTERNAL==='1',cleanupEnabled:configured,surface:'native',createRpc:lifetime=>{
    const transport:typeof fetch=(url,init)=>lifetime.run(()=>nativeFetch(url,{...init,signal:init?.signal?AbortSignal.any([lifetime.signal,init.signal]):lifetime.signal}));
    let credentials:Awaited<ReturnType<typeof verifyNativeCredentials>>;let epoch:number|undefined;
    async function current() {
      if (!credentials) return false;
      const result=await lifetime.run(()=>credentials!.client.rpc('native_session_v2',{p_action:'session'}).abortSignal(lifetime.signal));
      if (result.error) {if (['UNAUTHENTICATED','SESSION_REPLACED'].includes(result.error.message)) return false;throw Error('SAFETY_UNAVAILABLE');}
      const s=result.data;
      if (!s || s.subject!==credentials.subject || s.sessionId!==credentials.sessionId || !Number.isSafeInteger(s.mobileEpoch) || s.mobileEpoch<1) return false;
      if (epoch===undefined) epoch=s.mobileEpoch;return epoch===s.mobileEpoch;
    }
    return {sessionId:()=>credentials?.sessionId??null,current,
      async authenticate() {let unavailable=false;credentials=await verifyNativeCredentials(request,config!,transport,()=>{unavailable=true;});if (unavailable) throw Error('SAFETY_UNAVAILABLE');return credentials && await current()?credentials.subject:false;},
      async call(name,params) {if (!credentials) return {data:null,error:{message:'UNAUTHENTICATED'}};return credentials.client.rpc(name,params).abortSignal(lifetime.signal);},
    };
  }});
  return Response.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff'}});
}
