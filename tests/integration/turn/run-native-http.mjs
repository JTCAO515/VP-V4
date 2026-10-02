/** Creates and removes only a new uniquely named disposable native Ask stack. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {nativeHTTPOptions,nativeHTTPChildEnv,nativeHTTPSupabaseConfig,assertNativeHTTPPortsFree} from './native-http-ports.mjs';
const repo=process.cwd();
const {mode,ports}=nativeHTTPOptions(process.argv.slice(2),process.env);
await assertNativeHTTPPortsFree(ports);
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw new Error('Explicit Docker overrides refused');
const {execFileSync}=await import('node:child_process');
const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();
const inspected=JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0];
if(!inspected.Endpoints.docker.Host.startsWith('unix:///'))throw new Error('Local Docker context required');
process.env.DOCKER_CONTEXT=context;
const project='vp-native-ask-'+randomUUID().slice(0,8);
const config=nativeHTTPSupabaseConfig(readFileSync(join(repo,'supabase/config.toml'),'utf8'),project,ports);
const target=mkdtempSync(join(tmpdir(),'vpj07-native-http-'));
mkdirSync(join(target,'supabase'));
writeFileSync(join(target,'supabase/config.toml'),config);
cpSync(join(repo,'supabase/migrations'),join(target,'supabase/migrations'),{recursive:true});
function run(command,args,visible=false,env=process.env){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:repo,env,stdio:visible?'inherit':['ignore','pipe','pipe']});if(!visible){child.stdout.resume();child.stderr.resume();}child.once('error',()=>reject(new Error('Disposable process launch failed')));child.once('exit',code=>resolve(code??1));});}
let exit=1;
try{
  const started=await run('supabase',['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
  if(started!==0)throw new Error('Disposable native Ask stack failed to start; credential-bearing output suppressed');
  console.log('VP_NATIVE_HTTP_TARGET '+JSON.stringify({project,base:ports.base,supabaseAPI:ports.supabaseAPI,api:ports.api}));
  exit=await run(process.execPath,['--experimental-strip-types',...(mode==='--grounded-native'?['tests/integration/turn/run-native-grounded-events.mjs']:mode==='--assistant-native'?['tests/integration/turn/run-native-assistant-ui.mjs']:['--test',...(mode==='--assistant-rollback'?['--test-concurrency=1','tests/integration/turn/assistant-task-activity.test.mjs']:[]),mode==='--translation-history'?'tests/integration/translate/history-http.test.mjs':mode==='--assistant-rollback'?'tests/integration/turn/assistant-rollback.test.mjs':mode==='--planning'?'tests/integration/turn/native-planning-http.test.mjs':mode==='--grounded'?'tests/integration/turn/native-grounded-http.test.mjs':'tests/integration/turn/native-text-http.test.mjs'])],true,{...process.env,VP_NATIVE_TEXT_INTEGRATION:'true',VP_NATIVE_PLANNING_INTEGRATION:mode==='--planning'?'true':'false',VP_NATIVE_GROUNDED_INTEGRATION:mode==='--grounded'?'true':'false',VP_NATIVE_TEXT_SERVICE_INTEGRATION:mode==='--service'?'true':'false',VISEPANDA_TRIP_PROTOCOL_V2:'true',...nativeHTTPChildEnv(ports,target)});
}finally{
  const stopped=await run('supabase',['stop','--workdir',target,'--no-backup']);
  if(stopped!==0){console.error('Disposable native Ask cleanup failed for '+project);exit=1;}else {rmSync(target,{recursive:true});console.log('VP_NATIVE_HTTP_CLEANUP '+JSON.stringify({project,result:'PASS'}));}
}
process.exitCode=exit;
