/** Operator-owned bounded D2 consumer. Disabled by default; no production or scheduler activation. */
import {readFile,lstat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {parseExportPolicy} from './export-policy.ts';
import {parseExportKey} from './export-artifact.ts';
import {existingExportRPC} from './export-modules.ts';
import {runCoreExportJob} from './export-worker.ts';
const staging='https://dzqdzetcctkhbrhlxxgn.supabase.co';
async function privateFile(path,max){
  if(!path||!isAbsolute(path))throw Error('unavailable');
  const info=await lstat(path);if(!info.isFile()||(info.mode&0o077)!==0||info.size>max)throw Error('unavailable');
  return (await readFile(path,'utf8')).trim();
}
export async function runConfiguredCoreExport(requestId,{configuration=process.env,fetcher=fetch,signal=new AbortController().signal}={}){
  if(configuration.VP_PRIVACY_EXPORT_WORKER!=='true')return {kind:'unavailable'};
  const environment=configuration.VP_PRIVACY_EXPORT_ENVIRONMENT;
  if(!['local','staging'].includes(environment))return {kind:'unavailable'};
  const policy=parseExportPolicy(configuration.VISEPANDA_CORE_EXPORT_POLICY,environment);
  if(!policy)return {kind:'unavailable'};
  const url=configuration.VP_PRIVACY_EXPORT_DB_URL;
  if(environment==='staging'&&url!==staging)return {kind:'unavailable'};
  if(environment==='local'){
    if(configuration.VP_PRIVACY_LOCAL_DISPOSABLE!=='true')return {kind:'unavailable'};
    try{const local=new URL(url);if(local.protocol!=='http:'||!['127.0.0.1','localhost'].includes(local.hostname)||local.pathname!=='/'||local.search||local.hash||local.username||local.password)return {kind:'unavailable'};}catch{return {kind:'unavailable'};}
  }
  const key=parseExportKey(JSON.parse(await privateFile(configuration.VP_PRIVACY_EXPORT_KEY_FILE,4096)));
  if(!key)return {kind:'unavailable'};
  const serviceKey=await privateFile(configuration.VP_PRIVACY_EXPORT_DB_KEY_FILE,4096);
  if(!serviceKey||/[\r\n]/.test(serviceKey))return {kind:'unavailable'};
  const rpc=existingExportRPC({url,serviceKey},fetcher);
  const domain=(action,input,bounded)=>rpc('privacy_core_export_v1',{p_action:action,p_input:input},bounded);
  return runCoreExportJob(requestId,randomUUID(),policy,key,domain,rpc,signal);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length!==3)throw Error('unavailable');
    const receipt=await runConfiguredCoreExport(process.argv[2]);
    console.log(JSON.stringify(receipt&&typeof receipt==='object'?{kind:receipt.kind,state:receipt.state??null,requestId:receipt.requestId??null}:{kind:'unavailable'}));
  }catch{console.error('Core export unavailable. Inspect the exact request receipt before retrying.');process.exitCode=1;}
}
