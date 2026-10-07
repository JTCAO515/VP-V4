// Bounded timing-only diagnostic. Original Guide test/worker/RPC/assertions remain unchanged.
// A fixture-owned budget-scope lock exposes the ORIGINAL reserve RPC's real Task lock.
import {spawn,execFile} from 'node:child_process';import {promisify} from 'node:util';import {writeFileSync} from 'node:fs';
import {identityLocalEnv} from '../../../../tests/integration/identity/local-supabase.mjs';
const exec=promisify(execFile),original=globalThis.fetch;
let fired=false,readyResolve;const reserveReady=new Promise(resolve=>{readyResolve=resolve;});
const report={controlledScheduling:true,sourceOrAssertChanged:false};
const save=()=>writeFileSync('/tmp/vpj58-guide-budget-overlap.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
const valid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
function pg(container,query){return exec('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8',maxBuffer:2000000});}
globalThis.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 if(process.env.VP_GUIDE_HTTP_INTEGRATION!=='true'||!url?.startsWith(process.env.VP_IDENTITY_SUPABASE_API_URL+'/rest/v1/rpc/'))return original(input,init);
 if(url.endsWith('/reserve_model_budget')&&!fired){
  const body=typeof init?.body==='string'?JSON.parse(init.body):null;
  if(!body||!valid(body.p_scope_id)||!valid(body.p_owner_id)||!valid(body.p_task_id))return original(input,init);
  const local=identityLocalEnv();if(!local||!/^supabase_db_vp-native-ask-[a-f0-9]{8}$/.test(local.DB_CONTAINER))throw Error('Owned diagnostic target mismatch');
  const binding=JSON.parse((await pg(local.DB_CONTAINER,`select jsonb_build_object('taskId',b.task_id,'turnId',b.turn_id) from guide_private.bindings_v1 b where b.turn_id='${body.p_task_id}' or b.task_id='${body.p_task_id}' limit 1;`)).stdout.trim()||'null');
  if(!binding)return original(input,init);
  fired=true;report.binding={...binding,scopeId:body.p_scope_id};
  const holder=spawn('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
  let output='',error='';holder.stderr.on('data',chunk=>{error+=chunk;});
  const holderReady=new Promise((resolve,reject)=>{holder.stdout.on('data',chunk=>{output+=chunk;if(output.includes('SCOPE_LOCK_READY'))resolve();});holder.once('error',()=>reject(Error('Owned scope holder failed')));});
  const holderDone=new Promise(resolve=>holder.once('exit',code=>{report.holderExit=code;save();resolve(code);}));
  holder.stdin.end(`begin;set local application_name='vpj58-guide-budget-holder';set local statement_timeout='6s';select 1 from public.model_budget_scopes where id='${body.p_scope_id}' for update;select 'SCOPE_LOCK_READY';select pg_sleep(3);commit;`);
  await holderReady;
  const pending=original(input,init); // EXACT original service worker request/headers/body.
  for(let attempt=0;attempt<40;attempt++){
   const row=JSON.parse((await pg(local.DB_CONTAINER,`select jsonb_build_object('activities',coalesce((select jsonb_agg(jsonb_build_object('pid',a.pid,'app',a.application_name,'waitType',a.wait_event_type,'wait',a.wait_event,'blockers',pg_blocking_pids(a.pid),'operation',case when a.query like '%reserve_model_budget%' then 'reserve_model_budget' else 'scope_holder' end)) from pg_stat_activity a where a.pid<>pg_backend_pid() and a.datname=current_database() and (a.query like '%reserve_model_budget%' or a.application_name='vpj58-guide-budget-holder')),'[]'),'taskProbe',null);`)).stdout.trim());
   if(row.activities.some(a=>a.operation==='reserve_model_budget'&&a.waitType==='Lock'&&a.blockers.length)){
    report.lockChain=row.activities;readyResolve();save();break;
   }
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  try{const response=await pending;await holderDone;return response;}finally{if(!report.lockChain){readyResolve();report.missingReserveWait=true;save();}}
 }
 if(url.endsWith('/ops_source_revision_withdraw_v1')){
  await Promise.race([reserveReady,new Promise((_,reject)=>setTimeout(()=>reject(Error('No original Guide worker reserve overlap observed')),5000))]);
  const response=await original(input,init);const value=await response.clone().json();
  report.withdraw={status:response.status,code:value.code??null,message:value.code==='55P03'?value.message:null};save();
  return response;
 }
 return original(input,init);
};
