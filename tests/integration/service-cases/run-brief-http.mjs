/** New uniquely named disposable Auth/HTTP stack. No existing target or .env. */
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {nativeHTTPOptions,nativeHTTPChildEnv,nativeHTTPSupabaseConfig,assertNativeHTTPPortsFree} from '../turn/native-http-ports.mjs';
import {runOpsProcess} from './ops-process.mjs';
const {ports}=nativeHTTPOptions(process.argv.slice(2),process.env);
await assertNativeHTTPPortsFree(ports);
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('Explicit Docker overrides refused');
const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();
const endpoint=JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0].Endpoints.docker.Host;
if(!endpoint.startsWith('unix:///'))throw Error('Owned local Docker context required');
const project='vp-native-ask-'+randomUUID().slice(0,8),target=mkdtempSync(join(tmpdir(),'vpj31-brief-http-'));
mkdirSync(join(target,'supabase'));
writeFileSync(join(target,'supabase/config.toml'),nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'),project,ports));
cpSync('supabase/migrations',join(target,'supabase/migrations'),{recursive:true});
const env={...process.env,DOCKER_CONTEXT:context};
const run=(args,childEnv)=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,args,{env:childEnv,stdio:'inherit'});
 child.once('error',()=>reject(Error('Owned Brief HTTP test launch failed')));child.once('exit',code=>resolve(code??1));
});
let exit=1;
try{
 const started=await runOpsProcess('supabase',['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'],{phase:'start',cwd:process.cwd(),env});
 if(started!==0)throw Error('Owned Brief stack startup failed; credential-bearing output suppressed');
 console.log('VP_TRAVELER_BRIEF_HTTP_TARGET '+JSON.stringify({project,base:ports.base}));
 exit=await run(['--experimental-strip-types','--test','tests/integration/service-cases/brief-http.test.mjs'],{...env,VP_TRAVELER_BRIEF_HTTP:'true',...nativeHTTPChildEnv(ports,target)});
}finally{
 const stopped=await runOpsProcess('supabase',['stop','--workdir',target,'--no-backup'],{phase:'cleanup',cwd:process.cwd(),env});
 if(stopped!==0){console.error('Owned Brief cleanup failed: '+project);exit=1;}
 else{rmSync(target,{recursive:true});console.log('VP_TRAVELER_BRIEF_HTTP_CLEANUP '+JSON.stringify({project,result:'PASS'}));}
}
process.exitCode=exit;
