// Source preparation does not authorize execution; Main exact resource lease required.
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {nativeHTTPPorts,nativeHTTPChildEnv,nativeHTTPSupabaseConfig,assertNativeHTTPPortsFree} from '../../turn/native-http-ports.mjs';
import {owner,nonce,project,network,portBase,imageIds} from './scope.mjs';

if(process.argv.length!==2 || process.env.VPJ13_E3_AUTH_NONCE!==nonce) throw Error('Exact E3 fixture lease/nonce required');
if(process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw Error('Docker overrides refused');
const docker=(args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const context=docker(['context','show']);
assert.ok(JSON.parse(docker(['context','inspect',context]))[0].Endpoints.docker.Host.startsWith('unix:///'),'Only local Docker');
const ports=nativeHTTPPorts(portBase);await assertNativeHTTPPortsFree(ports);
assert.equal(docker(['ps','-aq','--filter','name='+project]),'','Fresh exact project required');
assert.equal(docker(['volume','ls','-q','--filter','name='+project]),'','Fresh exact project volumes required');
assert.equal(docker(['network','ls','-q','--filter','name=^'+network+'$']),'','Fresh exact network required');
for(const [tag,id] of Object.entries(imageIds)) assert.equal(docker(['image','inspect',tag,'--format','{{.Id}}']),id,'Pinned installed image required');
const target=mkdtempSync(join(tmpdir(),nonce+'-'));mkdirSync(join(target,'supabase'),{mode:0o700});
writeFileSync(join(target,'supabase/config.toml'),nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'),project,ports),{mode:0o600});
cpSync('supabase/migrations',join(target,'supabase/migrations'),{recursive:true});
const env={...process.env,DOCKER_CONTEXT:context};
const run=(cmd,args,visible=false,childEnv=env)=>new Promise((resolve,reject)=>{
 const child=spawn(cmd,args,{env:childEnv,stdio:visible?'inherit':['ignore','pipe','pipe']});
 if(!visible){child.stdout.resume();child.stderr.resume();} // CLI status/start may contain ephemeral secrets; never retain.
 child.once('error',()=>reject(Error('Owned fixture process launch failed')));child.once('exit',code=>resolve(code??1));
});
let code=1,created=false,started=false;
try{
 docker(['network','create','--internal','--label','vp.owner='+owner,'--label','vp.nonce='+nonce,'--opt','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',network]);created=true;
 started=true;
 const start=await run('supabase',['start','--workdir',target,'--network-id',network,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
 if(start!==0) throw Error('Owned Supabase start exit '+start+'; credential-bearing output suppressed');
 const expectedServices=['db','auth','rest','kong'].map(kind=>'supabase_'+kind+'_'+project);
 const names=docker(['ps','-a','--filter','name='+project,'--format','{{.Names}}']).split('\n').filter(Boolean);
 assert.deepEqual([...names].sort(),[...expectedServices].sort(),'Only four leased services');
 const inspect=JSON.parse(docker(['inspect',...names]));
 for(const c of inspect){
  assert.ok(Object.values(imageIds).includes(c.Image),'Only pinned images');
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks),[network],'Own exact network');
  for(const bindings of Object.values(c.NetworkSettings.Ports)) for(const binding of bindings??[]){
   assert.equal(binding.HostIp,'127.0.0.1','No wildcard or external exposure');assert.ok(ports.ports.includes(Number(binding.HostPort)),'Only leased ports');
  }
 }
 console.log('E3_AUTH_TARGET '+JSON.stringify({nonce,owner,project,network,ports:ports.ports,services:expectedServices}));
 code=await run(process.execPath,['--test','tests/integration/journey-entry/goal-return/auth-http.test.mjs'],true,
  {...env,...nativeHTTPChildEnv(ports,target),VPJ13_E3_AUTH:'true',VPJ13_E3_AUTH_NONCE:nonce});
}finally{
 if(started){const stopped=await run('supabase',['stop','--workdir',target,'--no-backup']);if(stopped!==0){code=1;console.error('Own E3 stack cleanup failed: '+project);}}
 if(created){
  const remaining=docker(['network','ls','-q','--filter','name=^'+network+'$']);
  if(remaining){const n=JSON.parse(docker(['network','inspect',network]))[0];assert.equal(n.Labels['vp.owner'],owner);assert.equal(n.Labels['vp.nonce'],nonce);assert.equal(Object.keys(n.Containers).length,0);docker(['network','rm',network]);}
 }
 const remaining=docker(['ps','-aq','--filter','name='+project]),volumes=docker(['volume','ls','-q','--filter','name='+project]);
 if(remaining || volumes){code=1;console.error('Own E3 containers/volumes remain: '+project);}else{await assertNativeHTTPPortsFree(ports);rmSync(target,{recursive:true});console.log('E3_AUTH_CLEANUP '+JSON.stringify({nonce,project,containers:'ABSENT',volumes:'ABSENT',ports:'FREE',result:'PASS'}));}
}
process.exitCode=code;
