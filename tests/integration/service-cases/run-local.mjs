/** Creates and removes only a new uniquely named disposable Ops stack. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
const repo=resolve(import.meta.dirname,'../../..');
const selectedTest='tests/integration/service-cases/access.test.mjs';
if(!/^tests\/integration\/(service-cases)\/[a-z0-9-]+\.test\.mjs$/.test(selectedTest))throw new Error('Invalid disposable test selection');
const before=process.env.VP_OPS_BEFORE_MIGRATION;
if(before && !/^[0-9]{14}_[a-z0-9_]+\.sql$/.test(before))throw new Error('Invalid disposable migration boundary');
const base=Number(process.env.VP_OPS_TEST_PORT_BASE||58100);
if(!Number.isInteger(base)||base<1024||base>65000)throw new Error('Invalid disposable port base');
for(const offset of [20,21,22,23,24,27,29,31])await new Promise((ok,fail)=>{const socket=net.createServer();socket.once('error',()=>fail(new Error('Disposable test port unavailable')));socket.listen(base+offset,'127.0.0.1',()=>socket.close(ok));});
const cli=spawnSync('supabase',['--version'],{stdio:'ignore'});
if(cli.error?.code==='ENOENT')throw new Error('Supabase CLI is required for the disposable Ops integration test but is not available on PATH.');
if(cli.status!==0)throw new Error('Supabase CLI failed its version preflight for the disposable Ops integration test.');
const target=mkdtempSync(join(tmpdir(),'vpj57-cases-'));
const project='vp-service-cases-'+randomUUID().slice(0,8);
mkdirSync(join(target,'supabase'));
let config=readFileSync(join(repo,'supabase/config.toml'),'utf8').replace(/^project_id\s*=.*$/m,`project_id = "${project}"`);
for(const offset of [20,21,22,23,24,27,29])config=config.replaceAll(String(54300+offset),String(base+offset));
config=config.replace(/(\[db.seed\][\s\S]*?enabled = )true/,'$1false');
writeFileSync(join(target,'supabase/config.toml'),config);
cpSync(join(repo,'supabase/migrations'),join(target,'supabase/migrations'),{recursive:true});
if(before)for(const file of readdirSync(join(target,'supabase/migrations')))if(file>=before)rmSync(join(target,'supabase/migrations',file));
function run(command,args,visible=false,env=process.env){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:repo,env,stdio:visible?'inherit':['ignore','pipe','pipe']});if(!visible){child.stdout.resume();child.stderr.resume();}child.once('error',()=>reject(new Error(`Disposable process launch failed: ${command}`)));child.once('exit',code=>resolve(code??1));});}
let exit=1;
try{
  const started=await run('supabase',['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
  if(started!==0)throw new Error('Disposable Ops stack failed to start; credential-bearing output suppressed');
  exit=await run(process.execPath,['--test',selectedTest],true,{...process.env,VP_OPS_LOCAL_INTEGRATION:'true',VP_IDENTITY_SUPABASE_WORKDIR:target,VP_IDENTITY_SUPABASE_API_URL:`http://127.0.0.1:${base+21}`,VP_OPS_API_PORT:String(base+31)});
}finally{
  const stopped=await run('supabase',['stop','--workdir',target,'--no-backup']);
  if(stopped!==0){console.error('Disposable Ops cleanup failed for '+project);exit=1;}else rmSync(target,{recursive:true});
}
process.exitCode=exit;
