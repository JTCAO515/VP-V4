/** VPJ-07 hosted text worker entry for a dedicated container. Never a Vercel function.
 * Fails closed: explicit enable flag, both secrets, a closed profile and a private
 * journal directory are all required; the SQL stop switch still starts disabled. */
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {isAbsolute,join} from 'node:path';
import {readQwenEndpoint} from '../model-gateway/adapters/provider-endpoints.ts';
import {createHostedTextWorker,parseHostedWorkerProfile} from './hosted-text-worker.ts';

const controller=new AbortController();
const stop=()=>controller.abort();
let journal,health;
try{
 const env=process.env;
 if(env.VISEPANDA_HOSTED_TEXT_WORKER!=='true' || env.VERCEL_ENV || process.argv.length!==2)throw Error('unavailable');
 const workerKey=env.VISEPANDA_HOSTED_WORKER_DB_KEY,providerKey=env.VISEPANDA_HOSTED_WORKER_QWEN_KEY;
 if(![workerKey,providerKey].every(value=>typeof value==='string' && /^[\x21-\x7e]{1,4096}$/.test(value)) || workerKey===providerKey)throw Error('unavailable');
 // Secrets stay in this closure only; nothing later (diagnostics, children) can read them from env.
 delete env.VISEPANDA_HOSTED_WORKER_DB_KEY;delete env.VISEPANDA_HOSTED_WORKER_QWEN_KEY;
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
