import {spawn,execFileSync} from 'node:child_process';
import {createHash,randomUUID as uuid} from 'node:crypto';
import {once} from 'node:events';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createClient} from '@supabase/supabase-js';
import {identityLocalEnv} from '../../identity/local-supabase.mjs';
import {waitForNativeAPI} from '../../identity/native-api-readiness.mjs';
import {nativeHTTPEnvironmentPorts} from '../../turn/native-http-ports.mjs';
import {nonce,project} from './scope.mjs';
import {readTiming,writeTiming} from './timing-record.mjs';

export async function createGoalReturnAuthEnvironment(){
 if(process.env.VPJ13_E3_AUTH_NONCE!==nonce)throw Error('Own exact E3 lease required');
 const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();
 if(!local || local.API_URL!==ports.supabaseAPI || local.DB_CONTAINER!=='supabase_db_'+project)throw Error('Own exact E3 local target required');
 for(const name of ['.env','.env.local','.env.development','.env.development.local'])if(existsSync(name))throw Error('Existing environment discovery refused');
 const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],
  {input:"set statement_timeout='10s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const key=local.PUBLISHABLE_KEY||local.ANON_KEY;
 const client=token=>createClient(local.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+token}}});
 const service=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const policyId=uuid(),noticeZh='独占本机合成读取测试，不调用模型。',noticeEn='Owned local synthetic read test; no model call.';
 const noticeHash=createHash('sha256').update(JSON.stringify({zh:noticeZh,en:noticeEn})).digest('hex');
 sql(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${policyId}','qwen','Local synthetic only','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','local','local','disposable','synthetic','synthetic','${noticeHash}','${noticeZh}','${noticeEn}','retain_after_hide_v1',now()-interval '1 minute',now()+interval '1 day',now()+interval '1 day');`);
 const users=[];
 for(let n=0;n<2;n++){
  const email='vpj13-e3-'+uuid()+'@example.test',password='E3-'+uuid()+'-4a!';
  const auth=createClient(local.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await auth.auth.signUp({email,password});
  if(signed.error || !signed.data.user || !signed.data.session)throw Error('Actual local GoTrue signup failed');
  users.push({id:signed.data.user.id,email,password});
 }
 const directory=mkdtempSync(join(tmpdir(),nonce+'-timing-')),control=join(directory,'control.json');
 writeFileSync(control,JSON.stringify({state:'idle',release:false}),{mode:0o600});
 const env={...process.env,NODE_OPTIONS:'',VERCEL_ENV:'',VISEPANDA_NATIVE_STAGING:'false',VISEPANDA_NATIVE_PRODUCTION:'false',
  NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,
  VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',VISEPANDA_NATIVE_LOCAL_TEXT:'true',
  VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:policyId,VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'true',VPJ13_E3_AUTH_CONTROL:control};
 const next=spawn(process.execPath,['--import',resolve('tests/integration/journey-entry/goal-return/timing-control.mjs'),'node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],{env,stdio:['ignore','pipe','pipe']});
 // Startup streams may contain environment/SDK diagnostics; never persist them.
 next.stdout.resume();next.stderr.resume();
 const cleanup=async()=>{
  if(next.exitCode===null){const exited=once(next,'exit');next.kill('SIGTERM');await Promise.race([exited,new Promise(r=>setTimeout(r,3000))]);if(next.exitCode===null){next.kill('SIGKILL');await exited;}}
  rmSync(directory,{recursive:true});
 };
 try{await waitForNativeAPI(ports.api,next);}catch(error){await cleanup();throw error;}
 const timing={arm:()=>writeTiming(control,{state:'armed',release:false}),
  release:()=>writeTiming(control,{...readTiming(control),release:true}),
  read:()=>readTiming(control),
  wait:async(state)=>{const deadline=performance.now()+5000;while(performance.now()<deadline){const c=readTiming(control);if(c.state===state)return c;await new Promise(r=>setTimeout(r,20));}throw Error('Owned actual-response timing stage unavailable');}};
 const lockAccount=async id=>{
  if(!users.some(u=>u.id===id))throw Error('Only owned synthetic actor lock');
  const child=spawn('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
  const ready=new Promise((resolve,reject)=>{child.stdout.on('data',bytes=>{if(bytes.toString().includes('E3_LOCK_READY'))resolve();});child.once('error',()=>reject(Error('Own lock process launch failed')));child.once('exit',()=>reject(Error('Own lock exited before readiness')));child.stderr.resume();});
  child.stdin.write(`begin;set local statement_timeout='5s';select 1 from identity_private.mobile_accounts where owner_id='${id}' for update;select 'E3_LOCK_READY';\n`);
  await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Own lock readiness timed out')),5000))]);
  let released=false;
  const release=async()=>{if(released)return;released=true;const exited=once(child,'exit');child.stdin.end('rollback;\n\\q\n');await exited;};
  return {release};
 };
 return {api:ports.api,local,sql,users,policyId,noticeHash,client,service,timing,lockAccount,cleanup};
}
