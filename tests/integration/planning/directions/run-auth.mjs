// Creates/removes only its new private disposable project. Await Main's port/fixture lease before running.
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {nativeHTTPPorts,nativeHTTPChildEnv,nativeHTTPSupabaseConfig,assertNativeHTTPPortsFree} from '../../turn/native-http-ports.mjs';
if(process.argv.length!==2)throw Error('Owned directions runner accepts no options');
const repo=process.cwd(),ports=nativeHTTPPorts('62520');await assertNativeHTTPPortsFree(ports);
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('Explicit Docker overrides refused');
const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();const info=JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0];if(!info.Endpoints.docker.Host.startsWith('unix:///'))throw Error('Local Docker required');
const project='vp-native-ask-'+randomUUID().slice(0,8),workdir=mkdtempSync(join(tmpdir(),'vpj09-directions-auth-'));mkdirSync(join(workdir,'supabase'));
writeFileSync(join(workdir,'supabase/config.toml'),nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'),project,ports));cpSync('supabase/migrations',join(workdir,'supabase/migrations'),{recursive:true});
const env={...process.env,DOCKER_CONTEXT:context};
const run=(command,args,visible=false,childEnv=env)=>new Promise((resolve,reject)=>{const p=spawn(command,args,{cwd:repo,env:childEnv,stdio:visible?'inherit':['ignore','pipe','pipe']});if(!visible){p.stdout.resume();p.stderr.resume();}p.once('error',()=>reject(Error('Owned process launch failed')));p.once('exit',code=>resolve(code??1));});
let code=1;
try{
 if(await run('supabase',['start','--workdir',workdir,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'])!==0)throw Error('Owned stack start failed; credential output suppressed');
 console.log('DIRECTIONS_AUTH_TARGET '+JSON.stringify({project,base:ports.base,api:ports.api,supabaseAPI:ports.supabaseAPI}));
 code=await run(process.execPath,['--experimental-strip-types','--test','tests/integration/planning/directions/auth-case.mjs'],true,{...env,...nativeHTTPChildEnv(ports,workdir),VP_DIRECTIONS_AUTH_CASE:'1',VISEPANDA_NATIVE_LOCAL_PLANNING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true'});
}finally{
 const stopped=await run('supabase',['stop','--workdir',workdir,'--no-backup']);if(stopped!==0){console.error('Owned cleanup failed for '+project);code=1;}else{rmSync(workdir,{recursive:true});console.log('DIRECTIONS_AUTH_CLEANUP '+JSON.stringify({project,result:'PASS'}));}
}
process.exitCode=code;
