/** Explicit trusted recovery. Never starts a worker or provider. */
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseBudgetRpc } from '../model-gateway/budget/supabase-rpc.ts';
import { stagingUsageReconciliation } from './staging-usage-reconciliation.ts';

const controller=new AbortController(),stop=()=>controller.abort();
let output,timer;
const fail=()=>{throw Error('unavailable');};
async function readPrivate(path,limit){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await file.stat();
  if(!stat.isFile()||stat.size<1||stat.size>limit||(stat.mode&0o077)!==0||stat.uid!==process.getuid())fail();
  const bytes=await file.readFile();if(bytes.length>limit)fail();
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }finally{await file.close();}
}
try{
 const args=process.argv.slice(2);
 if(process.env.VISEPANDA_STAGING_USAGE_RECONCILE!=='true'||process.env.VERCEL_ENV
  ||args.length!==6||args[0]!=='--config'||args[2]!=='--journal'||args[4]!=='--receipts'
  ||new Set([args[1],args[3],args[5]]).size!==3)fail();
 const contents=await readPrivate(args[1],32768),config=JSON.parse(contents);
 const digest=createHash('sha256').update(contents).digest('hex');
 let job=config;
 if(config?.schemaVersion==='vpj07-staging-text-service/1'){
  if(Object.keys(config).length!==4||typeof config.expiresAt!=='string'||!Number.isFinite(Date.parse(config.expiresAt))
   ||!Number.isSafeInteger(config.pollIntervalMs)||config.pollIntervalMs<1)fail();
  job=config.job;
 }
 const text=await readPrivate(args[3],4*1024*1024),lines=text.split('\n');
 const runSchema=config.schemaVersion==='vpj07-staging-text-service/1'?'vpj07-service-run/1'
  :job.thinkingBudgetTokens===undefined?'vpj07-worker-run/2':'vpj07-worker-run/3';
 // A torn final append has no durable complete receipt and is never reconstructed.
 const partialTail=lines.pop()!=='';
 const rows=lines.map(line=>JSON.parse(line));
 const first=rows[0];
 if(!first||first.schemaVersion!==runSchema
  ||first.phase!=='started'||first.configurationDigest!==digest)fail();
 const usage=[];
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row))fail();
  if(row.schemaVersion==='vpj07-usage-journal/1'){
   if(Object.keys(row).length!==3||row.configurationDigest!==digest||!row.receipt)fail();
   usage.push(row.receipt);
  }else if(row.schemaVersion==='vpj07-knowledge-validation-journal/1'){
   const receipt=row.receipt;
   if(Object.keys(row).length!==3||row.configurationDigest!==digest
    ||!receipt||typeof receipt!=='object'||Array.isArray(receipt)||Object.keys(receipt).length!==3
    ||receipt.schemaVersion!=='knowledge-validation/1'||typeof receipt.turnId!=='string'
    ||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.turnId)
    ||!['valid','invalid_json','missing_unanswered_needs','protocol_unavailable','object_shape','unknown_keys','place_name_presence','place_name_invalid','unanswered_needs_invalid','intent_scope_invalid'].includes(receipt.reason))fail();
   // Diagnostics cannot supply usage, a settlement action or arbitrary content.
  }else if(row.schemaVersion===runSchema){
   if(row.configurationDigest!==digest)fail();
  }else if(row.schemaVersion!=='provider-destination/1')fail();
 }
 const recovery=stagingUsageReconciliation(job,usage);
 const key=process.env.VISEPANDA_STAGING_TEXT_WORKER_KEY;
 if(typeof key!=='string'||!/^[\x21-\x7e]{1,4096}$/.test(key))fail();
 const url='https://dzqdzetcctkhbrhlxxgn.supabase.co';
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:async(input,init)=>{
   if(String(input)!==url+'/rest/v1/rpc/finish_model_budget'||controller.signal.aborted)fail();
   const response=await fetch(input,{...init,redirect:'manual'});
   if(response.redirected||response.status!==200){void response.body?.cancel().catch(()=>{});fail();}
   return response;
  }}});
 const rpc=createSupabaseBudgetRpc(client);
 output=await open(args[5],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 process.once('SIGINT',stop);process.once('SIGTERM',stop);timer=setTimeout(stop,300000);
 const append=async row=>{await output.writeFile(JSON.stringify(row)+'\n');await output.sync();};
 await append({schemaVersion:'vpj07-usage-reconciliation/1',configurationDigest:digest,phase:'started',journalSha256:createHash('sha256').update(text).digest('hex'),count:recovery.receipts.length,partialTailIgnored:partialTail,at:new Date().toISOString()});
 let settled=0,alreadySettled=0;
 for(const receipt of recovery.receipts){
  if(controller.signal.aborted)fail();
  const result=await recovery.settle(receipt,rpc,controller.signal);
  await append({schemaVersion:'vpj07-usage-reconciliation/1',configurationDigest:digest,phase:'attempt',attemptId:receipt.attempt.attemptId,result,at:new Date().toISOString()});
  if(result==='settled')settled++;else if(result==='already_settled')alreadySettled++;else fail();
 }
 await append({schemaVersion:'vpj07-usage-reconciliation/1',configurationDigest:digest,phase:'finished',settled,alreadySettled,at:new Date().toISOString()});
 console.log(JSON.stringify({schemaVersion:'vpj07-usage-reconciliation-result/1',settled,alreadySettled,partialTailIgnored:partialTail}));
}catch{console.error('Staging usage reconciliation unavailable. Preserve journals and unknown holds.');process.exitCode=1;}
finally{controller.abort();clearTimeout(timer);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);if(output){try{await output.close();}catch{process.exitCode=1;}}}
