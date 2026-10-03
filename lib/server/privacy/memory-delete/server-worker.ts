import { nativeRequestScope } from '../../identity/native-request.ts';
import { supabaseWorkerHeaders } from '../../jobs/supabase-worker-headers.ts';
import { executeMemoryDeletion } from './worker.ts';
export type MemoryDeleteWorkerConfig={enabled?:boolean;environment:'local'|'staging';databaseUrl:string};
const staging='https://dzqdzetcctkhbrhlxxgn.supabase.co';
function target(config:MemoryDeleteWorkerConfig){try{const u=new URL(config.databaseUrl);return !u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&(config.environment==='staging'?u.origin===staging&&config.databaseUrl===staging:config.environment==='local'&&u.protocol==='http:'&&['127.0.0.1','[::1]'].includes(u.hostname));}catch{return false;}}
/** Server-only explicit one-request composition; default disabled performs zero RPC/secret access. */
export function createMemoryDeletionWorker(config:MemoryDeleteWorkerConfig,deps:{credential:(signal:AbortSignal)=>Promise<string|null>|string|null;fetcher?:typeof fetch}) {
 return async(requestId:string,signal:AbortSignal):Promise<'disabled'|'blocked'|'queued'|'completed'>=>{
  if(config.enabled!==true)return 'disabled';
  if(typeof window!=='undefined'||!target(config))return 'blocked';
  const scope=nativeRequestScope(signal,30000);
  try{return await executeMemoryDeletion(requestId,async(action,input)=>{
   if(!['claim','execute'].includes(action))throw Error('D4 RPC unavailable');
   const credential=await scope.run(()=>Promise.resolve(deps.credential(scope.signal)));if(typeof credential!=='string'||!/^[\x21-\x7e]{1,4096}$/.test(credential))throw Error('D4 credential unavailable');
   const fetcher=deps.fetcher??fetch;
   const response=await scope.run(()=>fetcher(new URL('/rest/v1/rpc/privacy_memory_delete_v1',config.databaseUrl),{method:'POST',headers:supabaseWorkerHeaders(credential),body:JSON.stringify({p_action:action,p_input:input}),redirect:'manual',credentials:'omit',cache:'no-store',signal:scope.signal}));
   if(response.redirected||response.status!==200||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json'||!response.body){void response.body?.cancel().catch(()=>{});throw Error('D4 RPC unavailable');}
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const part=await scope.run(()=>reader.read());if(part.done)break;if((size+=part.value.byteLength)>192000)throw Error('D4 response bound');chunks.push(part.value);}scope.check();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}
   finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
  },scope.signal,true);}finally{scope.dispose();}
 };
}
