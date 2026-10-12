// Timing only: call the original fetch at its original origin and return the
// identical Response. Never forge claims, status, JSON or source qualification.
import {readTiming,writeTiming} from './timing-record.mjs';
if(process.env.VPJ13_E3_AUTH==='true' && process.env.VPJ13_E3_AUTH_CONTROL){
 const path=process.env.VPJ13_E3_AUTH_CONTROL, origin=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const original=globalThis.fetch;
 const load=()=>readTiming(path);
 const save=v=>writeTiming(path,v);
 globalThis.fetch=async(input,init)=>{
  const response=await original(input,init);
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.origin!==origin || url.pathname!=='/rest/v1/rpc/read_result_artifact_v2') return response;
  const control=load();if(control.state!=='armed' || response.status!==200) return response;
  const signal=init?.signal??(input instanceof Request?input.signal:null);
  const start=performance.now();save({...control,state:'waiting',actualHTTPStatus:response.status});
  await new Promise((resolve,reject)=>{
   let done=false;
   const finish=(error)=>{
    if(done)return;done=true;clearInterval(poll);clearTimeout(maximum);signal?.removeEventListener('abort',abort);
    save({...control,state:error?'cancelled':'released',actualHTTPStatus:response.status,elapsedMs:Math.round(performance.now()-start)});
    if(error)reject(error);else resolve();
   };
   const abort=()=>finish(new DOMException('Actual request signal aborted','AbortError'));
   const poll=setInterval(()=>{if(load().release===true)finish();},20);
   const maximum=setTimeout(()=>finish(),20000);
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
  return response;
 };
}
