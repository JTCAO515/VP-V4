import {KNOWLEDGE_INTENT_PROMPT_REF} from '../model-gateway/prompt/knowledge-intent.ts';
/** Dedicated Staging service; no public route, account provisioning or automatic activation. */
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {createStagingTextService} from './staging-text-service.ts';
import {TEXT_TURN_PROMPT_REF,TEXT_TASK_PROMPT_REF} from '../model-gateway/prompt/text-turn.ts';

const controller=new AbortController();
const stop=()=>controller.abort();
let journal;
try{
 const args=process.argv.slice(2);
 if(process.env.VISEPANDA_STAGING_TEXT_SERVICE!=='true' || process.env.VERCEL_ENV
  || args.length!==4 || args[0]!=='--config' || args[2]!=='--receipts' || args[1]===args[3])throw Error('unavailable');
 const workerKey=process.env.VISEPANDA_STAGING_TEXT_WORKER_KEY,providerKey=process.env.VISEPANDA_STAGING_TEXT_PROVIDER_KEY;
 if(![workerKey,providerKey].every(value=>typeof value==='string' && /^[\x21-\x7e]{1,4096}$/.test(value)))throw Error('unavailable');
 const file=await open(args[1],constants.O_RDONLY|constants.O_NOFOLLOW);
 let contents;
 try{
  const stat=await file.stat();if(!stat.isFile() || stat.size<1 || stat.size>32768)throw Error('unavailable');
  contents=await file.readFile({encoding:'utf8'});if(Buffer.byteLength(contents)>32768)throw Error('unavailable');
 }finally{await file.close();}
 const configurationDigest=createHash('sha256').update(contents).digest('hex');
 const append=async value=>{
  if(!journal)throw Error('unavailable');
  await journal.writeFile(JSON.stringify(value)+'\n');await journal.sync();
 };
 const config=JSON.parse(contents);
 const service=createStagingTextService(config,{
  workerCredential:()=>workerKey,providerCredential:()=>providerKey,
  recordService:async event=>append({schemaVersion:'vpj07-service-run/1',configurationDigest,...event,observedAt:new Date().toISOString()}),
  recordDestination:async(receipt,signal)=>{
   if(signal.aborted)throw Error('unavailable');await append(receipt);if(signal.aborted)throw Error('unavailable');
  },
 });
 journal=await open(args[3],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const prompt=config.job.inputMode==='knowledge_intent_v1'?KNOWLEDGE_INTENT_PROMPT_REF:config.job.inputMode==='task_history_v1'?TEXT_TASK_PROMPT_REF:TEXT_TURN_PROMPT_REF;
 const generation=config.job.thinkingBudgetTokens===undefined?{}:{generation:{mode:'qwen-bounded-thinking-v1',maxCompletionTokens:config.job.budget.maxOutputTokens,thinkingBudgetTokens:config.job.thinkingBudgetTokens}};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 await append({schemaVersion:'vpj07-service-run/1',configurationDigest,prompt,...generation,phase:'started',expiresAt:config.expiresAt,pollIntervalMs:config.pollIntervalMs,observedAt:new Date().toISOString()});
 const result=await service(controller.signal);
 await append({schemaVersion:'vpj07-service-run/1',configurationDigest,phase:'returned',...result,observedAt:new Date().toISOString()});
 console.log(JSON.stringify({schemaVersion:'vpj07-service-result/1',configurationDigest,...result}));
 if(result.reason==='unavailable')process.exitCode=1;
}catch{
 console.error('Staging text service unavailable. Retain its journal and unresolved budget holds.');process.exitCode=1;
}finally{
 controller.abort();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
 if(journal){try{await journal.close();}catch{process.exitCode=1;}}
}
