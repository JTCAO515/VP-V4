/** Creates and removes only a new uniquely named disposable native identity stack. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import {createSafeServerDiagnostic} from './server-diagnostic.mjs';
import { runOpsProcess } from '../service-cases/ops-process.mjs';
const repo=process.cwd();
const supabaseCLI=process.env.VP_SUPABASE_CLI || 'supabase';
if(process.argv.length!==2)throw Error('No options; only the dedicated disposable continuity instance is supported');
const base=64620;
if(!Number.isInteger(base)||base<1024||base>65000)throw new Error('Invalid disposable port base');
for(const offset of [20,21,22,23,24,27,29,31])await new Promise((ok,fail)=>{const socket=net.createServer();socket.once('error',()=>fail(new Error('Disposable test port unavailable')));socket.listen(base+offset,'127.0.0.1',()=>socket.close(ok));});
if(process.env.VERCEL_ENV)throw Error('Deployed environments refused');
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw new Error('Explicit Docker overrides refused');
const {execFileSync}=await import('node:child_process');
const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();
const inspected=JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0];
if(!inspected.Endpoints.docker.Host.startsWith('unix:///'))throw new Error('Local Docker context required');
process.env.DOCKER_CONTEXT=context;
const target=mkdtempSync(join(tmpdir(),'vpj41-web-trip-continuity-'));
const project='vp-web-continuity-'+randomUUID().slice(0,8);
mkdirSync(join(target,'supabase'));
let config=readFileSync(join(repo,'supabase/config.toml'),'utf8').replace(/^project_id\s*=.*$/m,`project_id = "${project}"`);
for(const offset of [20,21,22,23,24,27,29])config=config.replaceAll(String(54300+offset),String(base+offset));
config=config.replace(/(\[db.seed\][\s\S]*?enabled = )true/,'$1false');
writeFileSync(join(target,'supabase/config.toml'),config);
cpSync(join(repo,'supabase/migrations'),join(target,'supabase/migrations'),{recursive:true});
// Only our test process has visible output; CLI startup/cleanup use #612's fixed diagnostic enums.
function runTest(args,env){return new Promise(resolve=>{
  const child=spawn(process.execPath,args,{cwd:repo,env,stdio:'inherit'});
  child.once('error',()=>{});
  child.once('close',code=>resolve(Number.isInteger(code)&&code>=0?code:1));
});}
const safeServer=createSafeServerDiagnostic(event=>console.error('SAFE_SERVER_DIAGNOSTIC '+JSON.stringify(event)));
let exit=1,server,projectDir;
// Copy accepted project inputs into our existing uniquely owned disposable directory.
// No .env, shared .next, node_modules contents or Git metadata enters the snapshot.
function snapshotProject(){
 const dir=join(target,'web-project');mkdirSync(dir);
 const files=execFileSync('git',['ls-files','-z'],{cwd:repo,encoding:'utf8'}).split('\0').filter(Boolean);
 for(const file of files){if(file.split('/').some(part=>part==='.git'||part==='.next'||part==='node_modules'||part.startsWith('.env')))continue;const to=join(dir,file);mkdirSync(resolve(to,'..'),{recursive:true});cpSync(join(repo,file),to);}
 symlinkSync(join(repo,'node_modules'),join(dir,'node_modules'),'dir');return dir;
}
function runBuild(env){return new Promise(resolve=>{const child=spawn(process.execPath,[join(repo,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:projectDir,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',c=>safeServer.write('stdout',c));child.stderr.on('data',c=>safeServer.write('stderr',c));child.once('error',()=>{});child.once('close',code=>resolve(Number.isInteger(code)&&code>=0?code:1));});}
try{
  exit=await runOpsProcess(supabaseCLI,['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'],{phase:'start',cwd:repo});
  if(exit===0){
  const testEnv={...process.env,VP_NATIVE_LOCAL_INTEGRATION:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',VP_IDENTITY_SUPABASE_WORKDIR:target,VP_IDENTITY_SUPABASE_API_URL:`http://127.0.0.1:${base+21}`,VP_NATIVE_API_PORT:String(base+31)};
  const {identityLocalEnv}=await import('../identity/local-supabase.mjs');
  const before={...process.env};Object.assign(process.env,testEnv);
  const state=identityLocalEnv();
  for(const key of Object.keys(testEnv))before[key]===undefined?delete process.env[key]:process.env[key]=before[key];
  projectDir=snapshotProject();
  const osEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG','LC_ALL','CI'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
  const localEnv={...osEnv,VP_NATIVE_LOCAL_INTEGRATION:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',
    VISEPANDA_PUBLIC_ORIGIN:`http://127.0.0.1:${base+31}`,
    __NEXT_SHOW_IGNORE_LISTED:'true',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:state.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:state.PUBLISHABLE_KEY||state.ANON_KEY,
    VISEPANDA_NATIVE_STAGING:'false',VISEPANDA_NATIVE_PRODUCTION:'false',VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:state.SERVICE_ROLE_KEY};
  // Compile to completion once, then serve immutable artifacts without a dev compiler.
  exit=await runBuild(localEnv);
  if(exit!==0)throw new Error('Owned continuity build failed');
  server=spawn(process.execPath,[join(repo,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(base+31)],{cwd:projectDir,env:localEnv,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',chunk=>safeServer.write('stdout',chunk));server.stderr.on('data',chunk=>safeServer.write('stderr',chunk));server.stdout.on('end',()=>safeServer.end('stdout'));server.stderr.on('end',()=>safeServer.end('stderr'));
  const {waitForNativeAPI}=await import('../identity/native-api-readiness.mjs');
  await waitForNativeAPI(`http://127.0.0.1:${base+31}`,server);
  exit=await runTest(['--experimental-strip-types','--test','tests/integration/web-trip-continuity/continuity.test.mjs'],
    {...testEnv,VP_WEB_TRIP_CONTINUITY:'true'});
  }
}finally{
  if(server && server.exitCode===null){
    server.kill('SIGTERM');
    await new Promise(resolve=>server.once('exit',resolve));
  }
  const cleanup=await runOpsProcess(supabaseCLI,['stop','--workdir',target,'--no-backup'],{phase:'cleanup',cwd:repo});
  if(cleanup===0)rmSync(target,{recursive:true,force:true});
  else if(exit===0)exit=cleanup;
}
process.exitCode=exit;
