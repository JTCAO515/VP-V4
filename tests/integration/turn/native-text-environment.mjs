// Disposable synthetic environment only. Does not discover a repository .env or remote project.
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createWriteStream,mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createClient} from '@supabase/supabase-js';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
import {waitForNativeAPI} from '../identity/native-api-readiness.mjs';
import {createStagingTextJob} from '../../../lib/server/jobs/staging-text-job.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';

export async function createNativeTextEnvironment({continuous=false}={}){
 const e=identityLocalEnv();
 if(!e || e.API_URL!=='http://127.0.0.1:59641' || !/^supabase_db_vp-native-ask-[a-z0-9]+$/.test(e.DB_CONTAINER))throw Error('Only an explicit disposable native Ask instance is allowed');
 const sql=q=>execFileSync('docker',['exec','-i',e.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='10s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const literal=s=>"'"+s.replaceAll("'","''")+"'";
 const key=e.PUBLISHABLE_KEY||e.ANON_KEY;
 const users=[],pendingResponses=new Set();let next,model,timer,stopping=false,active=Promise.resolve();
 let serviceDirectory;const serviceChildren=[],serviceJournals=[],serviceFailures=[];
 const controller=new AbortController(),policyId=randomUUID(),taskPolicyId=randomUUID(),api='http://127.0.0.1:59651';
 const noticeZh='仅用于本机合成测试，不向外部模型发送数据。测试输入和回答保存在本次独立数据库中；删除对话或账号会隐藏正文，正文保留到此测试实例销毁。可随时撤回新处理授权，仍可手动编辑行程。';
 const noticeEn='Local synthetic test only. No data goes to an external model. Test inputs and answers remain in this disposable database; deleting a conversation or account hides content until this test instance is destroyed. You may withdraw permission for new processing and continue editing Trip manually.';
 const noticeHash=createHash('sha256').update(JSON.stringify({version:'local-text-v1',zh:noticeZh,en:noticeEn})).digest('hex');
 const taskNoticeZh=noticeZh+'本策略还使用同一服务任务内最多三组较早的输入和回答。';
 const taskNoticeEn=noticeEn+' This policy also uses up to three earlier input/answer pairs from the same service task.';
 const taskNoticeHash=createHash('sha256').update(JSON.stringify({version:'local-task-v1',zh:taskNoticeZh,en:taskNoticeEn})).digest('hex');
 const requests=[];
 const counts={http:0,finished:0,destinationReceipts:0};
 const releaseModels=()=>{for(const deliver of pendingResponses)deliver();pendingResponses.clear();};
 async function cleanup(){
  if(stopping)return;stopping=true;clearInterval(timer);controller.abort();releaseModels();await active.catch(()=>{});
  await stopServices();
  if(next && next.exitCode===null){const exited=once(next,'exit');next.kill('SIGTERM');await Promise.race([exited,new Promise(r=>setTimeout(r,3000))]);if(next.exitCode===null)next.kill('SIGKILL');}
  if(model){model.closeAllConnections();await new Promise(r=>model.close(r));}
  if(users.length){const ids=users.map(u=>literal(u.id)).join(',');sql(`delete from public.model_budget_attempts where scope_id in (select id from public.model_budget_scopes where owner_id in (${ids}));delete from public.model_budget_provider_limits where scope_id in (select id from public.model_budget_scopes where owner_id in (${ids}));delete from public.model_budget_scopes where owner_id in (${ids});delete from auth.users where id in (${ids});`);}
  if(serviceDirectory)rmSync(serviceDirectory,{recursive:true,force:true});
 }
 async function stopServices(){
  for(const child of serviceChildren.splice(0)){
   if(child.exitCode!==null)continue;
   const exited=once(child,'exit');child.kill('SIGTERM');
   await Promise.race([exited,new Promise(r=>setTimeout(r,5000))]);
   if(child.exitCode===null){child.kill('SIGKILL');await exited;serviceFailures.push('forced-stop');}
  }
 }
 try{
  sql(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at) values('${policyId}','qwen','Controlled local fixture','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','local fixture','local fixture','disposable local database','synthetic-v1','local-text-v1','${noticeHash}',${literal(noticeZh)},${literal(noticeEn)},'retain_after_hide_v1',now()-interval '1 minute',now()+interval '1 day',now()+interval '1 day');`);
  sql(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) select '${taskPolicyId}',provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,'local-task-v1','${taskNoticeHash}',${literal(taskNoticeZh)},${literal(taskNoticeEn)},retention,effective_at,expires_at,terms_recheck_at,'task_history_v1' from turn_private.text_policies where id='${policyId}';`);
  for(const label of ['a','b','ui-en','ui-zh']){
   const email='vpj07-'+label+'-'+randomUUID()+'@example.test',password='VPJ07-Local-Synthetic-Only-195!';
   const client=createClient(e.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),signup=await client.auth.signUp({email,password});
   if(!signup.data.user || !signup.data.session || signup.error)throw Error('Synthetic local account creation failed');
   const user={id:signup.data.user.id,email,password,scopeId:randomUUID()};users.push(user);
   sql(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${user.scopeId}','${user.id}','CNY',1000000,10000,4,2,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${user.scopeId}','qwen','${PROTOCOL_MODELS.qwen}','synthetic-v1',1000000,1000,true);`);
  }
  model=createServer(async(req,res)=>{
   if(req.url==='/release'){req.resume();releaseModels();res.end('{}');return;}
   const chunks=[];for await(const c of req)chunks.push(c);
   const body=JSON.parse(Buffer.concat(chunks).toString()),input=body.messages?.at(-1)?.content ?? '';
   counts.http++;requests.push(body);
   const kind=['partial','clarification','blocked','technical_failure'].find(k=>input.includes('kind='+k)) ?? 'answered';
   const deliver=()=>{if(res.destroyed)return;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({outcome:kind,text:input.includes('中文')?'本机合成回答：请求已完成。':'Local synthetic answer: request completed.'})}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));};
   if(input.includes('HOLD'))pendingResponses.add(deliver);else deliver();
  });
  model.listen(0,'127.0.0.1');await once(model,'listening');const modelURL='http://127.0.0.1:'+model.address().port;
  const log=createWriteStream('/tmp/vpj07-native-text-api.log',{mode:0o600});
  next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','59651'],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:e.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:e.SERVICE_ROLE_KEY,VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:policyId,VISEPANDA_NATIVE_LOCAL_TASK_POLICY:taskPolicyId},stdio:['ignore','pipe','pipe']});
  next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());
  await waitForNativeAPI(api,next);
  // Exercise the exact Staging job composition through an explicit closed test
  // mapper. Both official destinations go only to this disposable DB/model.
  const stagedDatabase='https://dzqdzetcctkhbrhlxxgn.supabase.co';
  const providerEndpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  const mappedFetch=async(input,init)=>{
   const url=typeof input==='string'?input:input.url??String(input);
   if(url.startsWith(stagedDatabase+'/rest/v1/rpc/'))return fetch(e.API_URL+new URL(url).pathname,init);
   if(url===providerEndpoint)return fetch(modelURL,init);
   throw Error('Unexpected synthetic job destination');
  };
  const jobConfig=(owner,taskMode)=>({schemaVersion:taskMode?'vpj07-staging-text-job/2':'vpj07-staging-text-job/1',...(taskMode?{inputMode:'task_history_v1'}:{}),ownerId:owner.id,policyId:taskMode?taskPolicyId:policyId,
   budget:{scopeId:owner.scopeId,priceVersion:'synthetic-v1',reservedMicros:1000,maxOutputTokens:512,timeoutMs:60000},
   provider:{provider:'qwen',endpoint:providerEndpoint,configurationId:randomUUID(),configurationVersion:1,timeoutMs:60000},
   pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null}});
  const workers=continuous?[]:users.flatMap(owner=>[false,true].map(taskMode=>createStagingTextJob(jobConfig(owner,taskMode),
   {workerCredential:()=>e.SERVICE_ROLE_KEY,providerCredential:()=> 'synthetic-local-provider-only',recordDestination:async()=>{counts.destinationReceipts++;},fetch:mappedFetch})));
  const serviceConfigs=[];
  if(continuous){
   serviceDirectory=mkdtempSync(join(tmpdir(),'vp-native-service-'));
   const mapper=join(serviceDirectory,'closed-fetch.mjs');
   writeFileSync(mapper,`const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{const url=typeof input==='string'?input:input.url??String(input);if(url.startsWith(${JSON.stringify(stagedDatabase+'/rest/v1/rpc/')}))return original(${JSON.stringify(e.API_URL)}+new URL(url).pathname,init);if(url===${JSON.stringify(providerEndpoint)})return original(${JSON.stringify(modelURL)},init);throw Error('Unexpected local destination');};`,{mode:0o600});
   for(const taskMode of [false,true]){
    const path=join(serviceDirectory,taskMode?'task.json':'single.json');
    writeFileSync(path,JSON.stringify({schemaVersion:'vpj07-staging-text-service/1',job:jobConfig(users[0],taskMode),pollIntervalMs:5000,expiresAt:new Date(Date.now()+600000).toISOString()}),{mode:0o600});serviceConfigs.push(path);
   }
  }
  async function startServices(){
   for(const path of serviceConfigs){
    const journal=join(serviceDirectory,randomUUID()+'.jsonl');serviceJournals.push(journal);
    const child=spawn(process.execPath,['--experimental-strip-types','--import',join(serviceDirectory,'closed-fetch.mjs'),resolve('lib/server/jobs/run-staging-text-service.mjs'),'--config',path,'--receipts',journal],{env:{...process.env,NODE_OPTIONS:'',VERCEL_ENV:'',VISEPANDA_STAGING_TEXT_SERVICE:'true',VISEPANDA_STAGING_TEXT_WORKER_KEY:e.SERVICE_ROLE_KEY,VISEPANDA_STAGING_TEXT_PROVIDER_KEY:'synthetic-local-provider-only'},stdio:['ignore','pipe','pipe']});
    child.stdout.resume();child.stderr.resume();child.once('exit',code=>{if(code!==0 && code!==null)serviceFailures.push('service-exit-'+code);});serviceChildren.push(child);
   }
  }
  if(continuous)await startServices();
  const restartServiceWorkers=async()=>{if(!continuous)throw Error('Service mode required');await stopServices();await startServices();};
  const serviceEvidence=()=>({failures:[...serviceFailures],runs:serviceJournals.map(path=>readFileSync(path,'utf8').split('\n').slice(0,-1).filter(Boolean).map(JSON.parse))});
  let busy=false;
  if(!continuous)timer=setInterval(()=>{if(busy||stopping)return;busy=true;active=(async()=>{
   for(const worker of workers){
    if(stopping)return;
    const result=await worker(controller.signal);
    if(result==='finished')counts.finished++;
   }
  })().catch(()=>{}).finally(()=>{busy=false;});},500);
  return {api,policyId,noticeHash,taskPolicyId,taskNoticeHash,requests,users,sql,counts,releaseModels,controlURL:modelURL+'/release',cleanup,restartServiceWorkers,serviceEvidence};
 }catch(error){await cleanup();throw error;}
}
