// Own fresh disposable Auth/PostgREST stack; no existing local/remote target.
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {nativeHTTPPorts,nativeHTTPSupabaseConfig,nativeHTTPChildEnv,assertNativeHTTPPortsFree} from '../turn/native-http-ports.mjs';
const ports=nativeHTTPPorts(process.env.VP_COMMUNITY_JWT_PORT_BASE??'64100');
await assertNativeHTTPPortsFree(ports);
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('Explicit Docker overrides refused');
const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();
const inspected=JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0];
if(!inspected.Endpoints.docker.Host.startsWith('unix:///'))throw Error('Local Docker context required');
const project='vp-native-ask-'+randomUUID().slice(0,8),target=mkdtempSync(join(tmpdir(),'vpj48-j1-jwt-'));
mkdirSync(join(target,'supabase'));writeFileSync(join(target,'supabase/config.toml'),nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'),project,ports));cpSync('supabase/migrations',join(target,'supabase/migrations'),{recursive:true});
const run=(bin,args,visible=false,env=process.env)=>new Promise((ok,fail)=>{const child=spawn(bin,args,{env:{...env,DOCKER_CONTEXT:context},stdio:visible?'inherit':['ignore','pipe','pipe']});if(!visible){child.stdout.resume();child.stderr.resume();}child.once('error',()=>fail(Error('Disposable process launch failed')));child.once('exit',code=>ok(code??1));});
let result=1;
try{
 if(await run('supabase',['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'])!==0)throw Error('Owned disposable Auth stack failed; credential output suppressed');
 console.log('COMMUNITY_J1_JWT_TARGET '+JSON.stringify({project,base:ports.base}));
 result=await run(process.execPath,['--test','tests/integration/community/submission-j1-jwt.test.mjs'],true,{...process.env,...nativeHTTPChildEnv(ports,target),VP_COMMUNITY_JWT_TEST:'1'});
}finally{
 if(await run('supabase',['stop','--workdir',target,'--no-backup'])!==0){console.error('Owned disposable cleanup failed '+project);result=1;}else{rmSync(target,{recursive:true});console.log('COMMUNITY_J1_JWT_CLEANUP PASS '+project);}
}
process.exitCode=result;
