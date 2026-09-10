/** Creates and removes only a new uniquely named disposable Ops stack. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
const repo=resolve(import.meta.dirname,'../../..');
const base=Number(process.env.VP_OPS_TEST_PORT_BASE||56900);
if(!Number.isInteger(base)||base<1024||base>65000)throw new Error('Invalid disposable port base');
for(const offset of [20,21,22,23,24,27,29,31])await new Promise((ok,fail)=>{const socket=net.createServer();socket.once('error',()=>fail(new Error('Disposable test port unavailable')));socket.listen(base+offset,'127.0.0.1',()=>socket.close(ok));});
const target=mkdtempSync(join(tmpdir(),'vpj14-ops-'));
const project='vp-ops-review-'+randomUUID().slice(0,8);
mkdirSync(join(target,'supabase'));
let config=readFileSync(join(repo,'supabase/config.toml'),'utf8').replace(/^project_id\s*=.*$/m,`project_id = "${project}"`);
for(const offset of [20,21,22,23,24,27,29])config=config.replaceAll(String(54300+offset),String(base+offset));
config=config.replace(/(\[db.seed\][\s\S]*?enabled = )true/,'$1false');
writeFileSync(join(target,'supabase/config.toml'),config);
cpSync(join(repo,'supabase/migrations'),join(target,'supabase/migrations'),{recursive:true});
function run(command,args,visible=false,env=process.env){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:repo,env,stdio:visible?'inherit':['ignore','pipe','pipe']});if(!visible){child.stdout.resume();child.stderr.resume();}child.once('error',()=>reject(new Error('Disposable process launch failed')));child.once('exit',code=>resolve(code??1));});}
let exit=1;
try{
  const started=await run('supabase',['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
  if(started!==0)throw new Error('Disposable Ops stack failed to start; credential-bearing output suppressed');
  exit=await run(process.execPath,['--test','tests/integration/ops/local-review.test.mjs'],true,{...process.env,VP_OPS_LOCAL_INTEGRATION:'true',VP_IDENTITY_SUPABASE_WORKDIR:target,VP_IDENTITY_SUPABASE_API_URL:`http://127.0.0.1:${base+21}`,VP_OPS_API_PORT:String(base+31)});
}finally{
  const stopped=await run('supabase',['stop','--workdir',target,'--no-backup']);
  if(stopped!==0){console.error('Disposable Ops cleanup failed for '+project);exit=1;}else rmSync(target,{recursive:true});
}
process.exitCode=exit;
