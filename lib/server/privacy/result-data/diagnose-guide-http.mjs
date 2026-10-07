// Read-only PG lock/context observer around the UNMODIFIED original owned Guide runner.
// No query text, header, JWT, password, raw DB logs or row body leaves this process.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),port=process.argv[2]??'64500';
const started=new Date().toISOString(),snapshots=[],contexts=[];
let container=null,stop=false,project=null,busy=false,consoleTail='',observed=0,contextBusy=false;
async function captureContexts(){
 if(!container||contextBusy)return;contextBusy=true;try{
  const {stdout,stderr}=await exec('docker',['logs','--since',started,container],{encoding:'utf8',maxBuffer:8000000});
  for(const line of (stdout+'\n'+stderr).split('\n')){
   const signature=line.match(/PL\/pgSQL function ([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\([^)]{0,250}\)) line (\d+)/);
   const locked=line.match(/ERROR:\s+could not obtain lock on row in relation \"([a-z_][a-z0-9_]*)\"/);
   if(signature){const value={function:signature[1],line:Number(signature[2])};if(!contexts.some(x=>JSON.stringify(x)===JSON.stringify(value)))contexts.push(value);}
   if(locked&&!contexts.some(x=>x.lockedRelation===locked[1]))contexts.push({lockedRelation:locked[1]});
  }
 }catch{/* Context may be unavailable after owned teardown; never print raw logs. */}finally{contextBusy=false;}
}
const original=readFileSync('tests/integration/guide/guide-http.test.mjs');
const sourceHash=createHash('sha256').update(original).digest('hex');
const query=`select jsonb_build_object('at',clock_timestamp(),'activities',coalesce((select jsonb_agg(jsonb_build_object('pid',a.pid,'role',a.usename,'app',a.application_name,'state',a.state,'waitType',a.wait_event_type,'wait',a.wait_event,'blockers',pg_blocking_pids(a.pid),'transactionMs',floor(extract(epoch from clock_timestamp()-a.xact_start)*1000),'operation',case
 when a.query like '%ops_source_revision_withdraw_v1%' then 'source_withdraw'
 when a.query like '%reserve_model_budget%' then 'reserve_model_budget'
 when a.query like '%read_grounded_work%' then 'grounded_read'
 when a.query like '%authorize_grounded_dispatch%' then 'grounded_dispatch'
 when a.query like '%complete_grounded%' or a.query like '%complete_text_work%' then 'work_complete'
 when a.query like '%lease_grounded%' or a.query like '%claim_grounded%' then 'work_claim'
 when a.query like '%guide_place_v1%' then 'guide_request'
 else 'other' end) order by a.pid) from pg_stat_activity a where a.datname=current_database() and a.pid<>pg_backend_pid() and a.backend_type='client backend' and (a.xact_start is not null or a.wait_event_type='Lock')),'[]'),
 'locks',coalesce((select jsonb_agg(jsonb_build_object('pid',l.pid,'type',l.locktype,'mode',l.mode,'granted',l.granted,'relation',case when c.oid is not null then n.nspname||'.'||c.relname end,'transaction',l.transactionid::text)) from pg_locks l left join pg_class c on c.oid=l.relation left join pg_namespace n on n.oid=c.relnamespace where l.pid<>pg_backend_pid() and (c.relname in('service_tasks','work','grounded_turns','source_revisions') or l.locktype in('transactionid','tuple'))),'[]'));`;
async function sample(){if(!container||stop||busy)return;busy=true;try{
 const {stdout}=await exec('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8',maxBuffer:2000000});
 const row=JSON.parse(stdout.trim());observed++;
 if(row.activities.some(a=>a.operation!=='other'||a.waitType==='Lock')||row.locks.some(l=>!l.granted))snapshots.push(row);
 }catch{/* Destroyed owned fixture or short initialization is not diagnostic evidence. */}finally{busy=false;}}
const child=spawn(process.execPath,['--experimental-strip-types','tests/integration/guide/run-guide-http.mjs','--port-base',port],{env:{...process.env,...(process.env.VP_GUIDE_CONTROLLED_OVERLAP==='1'?{NODE_OPTIONS:'--import '+process.cwd()+'/lib/server/privacy/result-data/guide-budget-overlap-hook.mjs'}:{})},stdio:['ignore','pipe','pipe']});
for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
 const text=chunk.toString();process.stdout.write(text);consoleTail=(consoleTail+text).slice(-40000);
 const match=consoleTail.match(/VP_GUIDE_HTTP_TARGET (\{[^\n]+\})/);
 if(text.includes('not ok')||text.includes('could not obtain lock'))void captureContexts();
 if(match&&!container){const target=JSON.parse(match[1]);if(!/^vp-native-ask-[a-f0-9]{8}$/.test(target.project))throw Error('Unexpected owned fixture');project=target.project;container='supabase_db_'+project;}
});
const timer=setInterval(()=>void sample(),25);
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',c=>resolve(c??1));});
stop=true;clearInterval(timer);while(busy||contextBusy)await new Promise(resolve=>setTimeout(resolve,10));
// Context is collected during the owned run by the side sampler below when still present.
const report={sourceHash,started,project,base:Number(port),originalTestExit:code,observedSamples:observed,snapshots,contexts,
 originalTestUnchanged:createHash('sha256').update(readFileSync('tests/integration/guide/guide-http.test.mjs')).digest('hex')===sourceHash,
 cleanupPass:consoleTail.includes('VP_GUIDE_HTTP_CLEANUP')&&consoleTail.includes('"result":"PASS"')};
writeFileSync('/tmp/vpj58-guide-lock-diagnostic.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log('GUIDE_LOCK_DIAGNOSTIC '+JSON.stringify({project,base:Number(port),exit:code,observedSamples:observed,retainedSamples:snapshots.length,sourceUnchanged:report.originalTestUnchanged,cleanupPass:report.cleanupPass}));
process.exitCode=code;
