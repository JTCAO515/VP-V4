/** VPJ-07 hosted text worker entry for a dedicated container. Never a Vercel function.
 * Fails closed: explicit enable flag, both secrets, a closed profile and a private
 * journal directory are all required; the SQL stop switch still starts disabled. */
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {isAbsolute,join} from 'node:path';
import {readQwenEndpoint} from '../model-gateway/adapters/provider-endpoints.ts';
import {createHostedTextWorker,parseHostedWorkerProfile,HOSTED_STAGING_DATABASE_URL} from './hosted-text-worker.ts';
import {readHostedWorkerSecrets} from './hosted-worker-secrets.mjs';
import {supabaseWorkerHeaders} from './supabase-worker-headers.ts';

const controller=new AbortController();
const stop=()=>controller.abort();
let journal,health;
try{
 const env=process.env;
 if(env.VISEPANDA_HOSTED_TEXT_WORKER!=='true' || env.VERCEL_ENV || process.argv.length!==2)throw Error('unavailable');
 const {workerKey,providerKey}=await readHostedWorkerSecrets(env);
 // Secrets stay in this closure only; file mode never puts them in env.
 const rawProfile=env.VISEPANDA_HOSTED_WORKER_PROFILE;
 if(typeof rawProfile!=='string' || Buffer.byteLength(rawProfile)<2 || Buffer.byteLength(rawProfile)>16384)throw Error('unavailable');
 const profile=parseHostedWorkerProfile(JSON.parse(rawProfile));
 const qwenEndpoint=readQwenEndpoint(env);
 const build=env.VISEPANDA_HOSTED_WORKER_BUILD ?? 'unversioned';
 if(!/^[A-Za-z0-9._-]{1,64}$/.test(build))throw Error('unavailable');
 const directory=env.VISEPANDA_HOSTED_WORKER_JOURNAL_DIR;
 if(typeof directory!=='string' || !isAbsolute(directory))throw Error('unavailable');
 const info=await lstat(directory);
 if(!info.isDirectory() || (info.mode&0o022)!==0)throw Error('unavailable');
 if(env.VISEPANDA_HOSTED_WORKER_SECRET_MODE==='files'){
  // A reboot can leave SQL enabled while /run has lost its keys. File-mode
  // startup must see disabled before it creates a journal or enters the loop.
  const response=await fetch(HOSTED_STAGING_DATABASE_URL+'/rest/v1/rpc/read_hosted_worker_status',{
   method:'POST',headers:supabaseWorkerHeaders(workerKey),body:'{}',redirect:'manual',
   credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000),
  });
  if(response.redirected||response.status!==200||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json'){
   try{await response.body?.cancel();}catch{}
   throw Error('unavailable');
  }
  const statusText=await response.text();
  if(Buffer.byteLength(statusText)>262144)throw Error('unavailable');
  const status=JSON.parse(statusText);
  if(!status||status.kind!=='status'||status.enabled!==false)throw Error('unavailable');
 }
 const port=env.VISEPANDA_HOSTED_WORKER_HEALTH_PORT,host=env.VISEPANDA_HOSTED_WORKER_HEALTH_HOST ?? '127.0.0.1';
 if(port!==undefined && (!/^[1-9][0-9]{0,4}$/.test(port) || Number(port)>65535 || !['127.0.0.1','0.0.0.0','::'].includes(host)))throw Error('unavailable');
 const workerId=randomUUID(),startedAt=new Date().toISOString();
 // One fresh private metadata journal per process: never overwritten, never a symlink.
 journal=await open(join(directory,'hosted-'+startedAt.replace(/[:.]/g,'-')+'-'+workerId+'.jsonl'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const append=async value=>{await journal.writeFile(JSON.stringify(value)+'\n');await journal.sync();};
 const guarded=async(value,signal)=>{if(signal?.aborted)throw Error('unavailable');await append(value);if(signal?.aborted)throw Error('unavailable');};
 let lastOk=0,enabled=null;
 if(port!==undefined){
  // Liveness only: fresh successful SQL heartbeat. Content-free, no ids.
  health=createServer((req,res)=>{
   const fresh=Date.now()-lastOk<=Math.max(3*profile.pollIntervalMs,90000);
   res.writeHead(req.method==='GET' && req.url==='/healthz'?(fresh?200:503):404,{'content-type':'application/json','cache-control':'no-store'});
   res.end(req.url==='/healthz'?JSON.stringify({status:fresh?(enabled?'serving':'disabled'):'stale'}):'{}');
  });
  // A port conflict is a failed start: stop claiming rather than run without the declared health signal.
  health.once('error',()=>{process.exitCode=1;stop();});
  health.listen(Number(port),host);
 }
 const worker=createHostedTextWorker(profile,{
  workerId,build,startedAt,qwenEndpoint,
  requireInitialDisabled:env.VISEPANDA_HOSTED_WORKER_SECRET_MODE==='files',
  workerCredential:()=>workerKey,providerCredential:()=>providerKey,
  onHeartbeat:(ok,value)=>{if(ok){lastOk=Date.now();enabled=value;}},
  journal:{
   job:async(digest,job)=>append({schemaVersion:'vpj07-hosted-job/1',jobDigest:digest,job}),
   usage:async(digest,receipt,signal)=>guarded({schemaVersion:'vpj07-usage-journal/1',configurationDigest:digest,receipt},signal),
   knowledge:async(digest,receipt)=>append({schemaVersion:'vpj07-knowledge-validation-journal/1',configurationDigest:digest,receipt}),
   destination:async(receipt,signal)=>guarded(receipt,signal),
   event:async event=>append({schemaVersion:'vpj07-hosted-run/1',...event,observedAt:new Date().toISOString()}),
  },
 });
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 await append({schemaVersion:'vpj07-hosted-run/1',phase:'started',workerId,build,startedAt,profile,qwenEndpoint});
 console.log(JSON.stringify({schemaVersion:'vpj07-hosted-worker/1',phase:'started',workerId,build}));
 const result=await worker(controller.signal);
 await append({schemaVersion:'vpj07-hosted-run/1',phase:'returned',...result,observedAt:new Date().toISOString()});
 console.log(JSON.stringify({schemaVersion:'vpj07-hosted-worker/1',phase:'returned',workerId,...result}));
 if(result.reason==='unavailable')process.exitCode=1;
}catch{
 console.error('Hosted text worker unavailable. Retain its journal and unresolved budget holds.');process.exitCode=1;
}finally{
 controller.abort();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
 if(health){health.closeAllConnections?.();await new Promise(resolve=>health.close(()=>resolve()));}
 if(journal){try{await journal.close();}catch{process.exitCode=1;}}
}
