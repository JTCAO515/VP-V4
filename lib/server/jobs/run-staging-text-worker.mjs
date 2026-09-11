/** Explicit one-shot operator entry; no scheduler, account provisioning or defaults. */
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {createStagingTextJob} from './staging-text-job.ts';
import {TEXT_TURN_PROMPT_REF,TEXT_TASK_PROMPT_REF} from '../model-gateway/prompt/text-turn.ts';

const controller=new AbortController();
const stop=()=>controller.abort();
let journal,timer;
try{
 const args=process.argv.slice(2);
 if(process.env.VISEPANDA_STAGING_TEXT_WORKER!=='true' || process.env.VERCEL_ENV
  || args.length!==4 || args[0]!=='--config' || args[2]!=='--receipts' || args[1]===args[3])throw Error('unavailable');
 const workerKey=process.env.VISEPANDA_STAGING_TEXT_WORKER_KEY,providerKey=process.env.VISEPANDA_STAGING_TEXT_PROVIDER_KEY;
 if(![workerKey,providerKey].every(value=>typeof value==='string' && /^[\x21-\x7e]{1,4096}$/.test(value)))throw Error('unavailable');
 const file=await open(args[1],constants.O_RDONLY|constants.O_NOFOLLOW);
 let contents;
 try{
  const stat=await file.stat();if(!stat.isFile() || stat.size<1 || stat.size>16384)throw Error('unavailable');
  contents=await file.readFile({encoding:'utf8'});if(Buffer.byteLength(contents)>16384)throw Error('unavailable');
 }finally{await file.close();}
 const configurationDigest=createHash('sha256').update(contents).digest('hex');
 const append=async value=>{
  if(controller.signal.aborted || !journal)throw Error('unavailable');
  await journal.writeFile(JSON.stringify(value)+'\n');await journal.sync();
  if(controller.signal.aborted)throw Error('unavailable');
 };
 const config=JSON.parse(contents);
 const worker=createStagingTextJob(config,{
  workerCredential:()=>workerKey,providerCredential:()=>providerKey,
  recordDestination:async(receipt,signal)=>{if(signal.aborted)throw Error('unavailable');await append(receipt);if(signal.aborted)throw Error('unavailable');},
 });
 const prompt=config.schemaVersion==='vpj07-staging-text-job/2'?TEXT_TASK_PROMPT_REF:TEXT_TURN_PROMPT_REF;
 // Never overwrite an existing receipt file or follow a symlink. A run owns one
 // fresh private journal with configuration hash and metadata only, never text.
 journal=await open(args[3],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 await append({schemaVersion:'vpj07-worker-run/2',configurationDigest,prompt,phase:'started',observedAt:new Date().toISOString()});
 process.once('SIGINT',stop);process.once('SIGTERM',stop);timer=setTimeout(stop,150000);
 const result=await worker(controller.signal);
 await append({schemaVersion:'vpj07-worker-run/2',configurationDigest,prompt,phase:'returned',result,observedAt:new Date().toISOString()});
 console.log(JSON.stringify({schemaVersion:'vpj07-worker-result/1',configurationDigest,result}));
 if(result==='unavailable')process.exitCode=1;
}catch{
 console.error('Staging text worker unavailable. Retain its receipt journal and unresolved budget holds.');
 process.exitCode=1;
}finally{
 clearTimeout(timer);controller.abort();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
 if(journal){try{await journal.close();}catch{process.exitCode=1;}}
}
