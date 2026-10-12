// Source preparation does not authorize execution; Main exact resource lease required.
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,rmSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {nativeHTTPPorts,nativeHTTPChildEnv,nativeHTTPSupabaseConfig,assertNativeHTTPPortsFree} from '../../turn/native-http-ports.mjs';
import {owner,nonce,project,network,portBase,imageIds} from './scope.mjs';

if(process.argv.length!==2 || process.env.VPJ13_E3_AUTH_NONCE!==undefined && process.env.VPJ13_E3_AUTH_NONCE!==nonce) throw Error('Exact E3 fixture nonce required');
const lease=JSON.parse(readFileSync('/Users/jtsm5p/Documents/Codex/2026-10-12/task/VPJ13-E3-AuthHTTP-fixture-exact-lease-20261012.json','utf8'));
assert.equal(lease.soleOwner,owner);assert.equal(lease.nonce,nonce);assert.equal(lease.project,project);assert.equal(lease.network,network);assert.equal(lease.worktree,process.cwd());
if(process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw Error('Docker overrides refused');
const docker=(args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const context=docker(['context','show']);
assert.ok(JSON.parse(docker(['context','inspect',context]))[0].Endpoints.docker.Host.startsWith('unix:///'),'Only local Docker');
const ports=nativeHTTPPorts(portBase);await assertNativeHTTPPortsFree(ports);
assert.deepEqual(lease.ports,ports.ports);
assert.equal(readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).length,155,'Exact current migration chain');
assert.equal(createHash('sha256').update(readFileSync('supabase/migrations/20261012010000_vpj13_goal_return_source.sql')).digest('hex'),'15fd14818a09a1e0418aaf31deb639b7e6b9f269c51b3782410d536564e8596b','Exact leased SQL bytes');
assert.equal(docker(['ps','-aq','--filter','name='+project]),'','Fresh exact project required');
assert.equal(docker(['volume','ls','-q','--filter','name='+project]),'','Fresh exact project volumes required');
assert.equal(docker(['network','ls','-q','--filter','name=^'+network+'$']),'','Fresh exact network required');
for(const [tag,id] of Object.entries(imageIds)) assert.equal(docker(['image','inspect',tag,'--format','{{.Id}}']),id,'Pinned installed image required');
const target=mkdtempSync(join(tmpdir(),nonce+'-'));mkdirSync(join(target,'supabase'),{mode:0o700});
writeFileSync(join(target,'supabase/config.toml'),nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'),project,ports),{mode:0o600});
cpSync('supabase/migrations',join(target,'supabase/migrations'),{recursive:true});
const env={...process.env,DOCKER_CONTEXT:context,VPJ13_E3_AUTH_NONCE:nonce};
let lastErrors=[];
const run=(cmd,args,visible=false,childEnv=env)=>new Promise((resolve,reject)=>{
 const child=spawn(cmd,args,{env:childEnv,stdio:visible?'inherit':['ignore','pipe','pipe']});
 let pending={stdout:'',stderr:''},errors=[];
 let timedOut=false,force;
 const limit=cmd==='supabase' && args[0]==='stop'?60000:visible?210000:240000;
 const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');force=setTimeout(()=>child.kill('SIGKILL'),3000);},limit);
 const finish=()=>{clearTimeout(timer);clearTimeout(force);};
 if(!visible){
  const classify=(chunk,stream)=>{
   pending[stream]+=chunk.toString();const lines=pending[stream].split('\n');pending[stream]=lines.pop().slice(-2000);
   for(const line of lines){
    if(!/error|fail|invalid|denied|refused|panic|cannot|unable|unknown|unsupported|missing|not found/i.test(line))continue;
    // Drop, rather than hash/store, any potentially secret-bearing line.
    if(/password|token|secret|credential|\bkey\b|bearer|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|(?:postgres(?:ql)?|https?):\/\/[^\s]*@/i.test(line))continue;
    errors.push(line.replace(/\x1b\[[0-9;]*m/g,'').slice(0,300));if(errors.length>8)errors.shift();
   }
  };
  // Modern CLI errors can be on stdout; both streams are filtered before output.
  child.stdout.on('data',chunk=>classify(chunk,'stdout'));child.stderr.on('data',chunk=>classify(chunk,'stderr'));
  child.once('exit',()=>{classify(Buffer.from('\n'),'stdout');classify(Buffer.from('\n'),'stderr');});
 }
 child.once('error',()=>{finish();reject(Error('Owned fixture process launch failed'));});child.once('exit',code=>{finish();lastErrors=errors;resolve(timedOut?124:code??1);});
});
let code=1,created=false,started=false;
try{
 docker(['network','create','--internal','--label','vp.owner='+owner,'--label','vp.nonce='+nonce,'--opt','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',network]);created=true;
 started=true;
 const start=await run('supabase',['start','--workdir',target,'--network-id',network,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
 if(start!==0) throw Error('Owned Supabase start exit '+start+'; non-secret errors: '+JSON.stringify(lastErrors));
 const expectedServices=['db','auth','rest','kong'].map(kind=>'supabase_'+kind+'_'+project);
 const names=docker(['ps','-a','--filter','name='+project,'--format','{{.Names}}']).split('\n').filter(Boolean);
 assert.deepEqual([...names].sort(),[...expectedServices].sort(),'Only four leased services');
 const inspect=JSON.parse(docker(['inspect',...names]));
 const roleTags={db:'public.ecr.aws/supabase/postgres:17.6.1.167',auth:'public.ecr.aws/supabase/gotrue:v2.196.0',rest:'public.ecr.aws/supabase/postgrest:v16.2',kong:'public.ecr.aws/supabase/kong:2.8.1'};
 const n=JSON.parse(docker(['network','inspect',network]))[0];
 assert.equal(n.Driver,'bridge');assert.equal(n.Internal,true);assert.equal(n.Labels['vp.owner'],owner);assert.equal(n.Labels['vp.nonce'],nonce);
 assert.equal(n.Options['com.docker.network.bridge.host_binding_ipv4'],'127.0.0.1');
 for(const c of inspect){
  const role=Object.keys(roleTags).find(kind=>c.Name==='/supabase_'+kind+'_'+project);
  assert.ok(role,'Only exact leased service role');assert.equal(c.Image,imageIds[roleTags[role]],'Exact role-to-pinned-image mapping');
  assert.ok(c.Mounts.every(m=>m.Type!=='bind'),'No host bind mounts');
  assert.ok(c.Mounts.every(m=>m.Type!=='volume' || m.Name.includes(project)),'Only own project volumes');
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks),[network],'Own exact network');
  for(const bindings of Object.values(c.NetworkSettings.Ports)) for(const binding of bindings??[]){
   assert.equal(binding.HostIp,'127.0.0.1','No wildcard or external exposure');assert.ok(ports.ports.includes(Number(binding.HostPort)),'Only leased ports');
  }
 }
 console.log('E3_AUTH_TARGET '+JSON.stringify({nonce,owner,project,network,ports:ports.ports,services:expectedServices,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}));
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
