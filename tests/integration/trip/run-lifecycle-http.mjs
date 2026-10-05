/** Owned disposable Auth/HTTP stack; no repository .env, target or provider access. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { nativeHTTPOptions, nativeHTTPChildEnv, nativeHTTPSupabaseConfig, assertNativeHTTPPortsFree } from '../turn/native-http-ports.mjs';
const {ports}=nativeHTTPOptions(process.argv.slice(2),process.env);
await assertNativeHTTPPortsFree(ports);
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('Explicit Docker overrides refused');
const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();
const endpoint=JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0].Endpoints.docker.Host;
if(!endpoint.startsWith('unix:///'))throw Error('Local Docker context required');
const project='vp-native-ask-'+randomUUID().slice(0,8),target=mkdtempSync(join(tmpdir(),'vpj61-lifecycle-http-'));
mkdirSync(join(target,'supabase'));
writeFileSync(join(target,'supabase/config.toml'),nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'),project,ports));
cpSync('supabase/migrations',join(target,'supabase/migrations'),{recursive:true});
const env={...process.env,DOCKER_CONTEXT:context};
async function run(command,args,visible=false,childEnv=env){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{env:childEnv,stdio:visible?'inherit':['ignore','pipe','pipe']});
  if(!visible){child.stdout.resume();child.stderr.resume();}
  child.once('error',()=>reject(Error('Owned lifecycle process launch failed')));child.once('exit',code=>resolve(code??1));
 });
}
let exit=1;
try{
 const started=await run('supabase',['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
 if(started!==0)throw Error('Owned lifecycle stack startup failed; credential-bearing output suppressed');
 console.log('VP_LIFECYCLE_HTTP_TARGET '+JSON.stringify({project,base:ports.base}));
 exit=await run(process.execPath,['--experimental-strip-types','--test','tests/integration/trip/lifecycle-http.test.mjs'],true,{...env,VP_TRIP_LIFECYCLE_HTTP:'true',...nativeHTTPChildEnv(ports,target)});
}finally{
 const stopped=await run('supabase',['stop','--workdir',target,'--no-backup']);
 if(stopped!==0){console.error('Owned lifecycle cleanup failed: '+project);exit=1;}
 else{rmSync(target,{recursive:true});console.log('VP_LIFECYCLE_HTTP_CLEANUP '+JSON.stringify({project,result:'PASS'}));}
}
process.exitCode=exit;
