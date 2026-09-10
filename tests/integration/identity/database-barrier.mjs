import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

/** Test-only persistent PostgreSQL session. No JWT impersonation or production guard changes. */
export async function databaseBarrier(container) {
  if (!/^supabase_db_[A-Za-z0-9_-]+$/.test(container)) throw new Error('Invalid explicit test container');
  const name='vpj04_gate_'+randomUUID().replaceAll('-','');
  const key=(randomBytes(8).readBigUInt64BE() & ((1n<<63n)-1n)).toString();
  const command=['exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
  const session=spawn('docker',command,{stdio:['pipe','pipe','ignore']});
  let output='',pid=null,released=false,spawnFailed=false;
  session.once('error',()=>{spawnFailed=true;});
  session.stdout.on('data',chunk=>{output=(output+chunk.toString()).slice(-4096);const match=/VPJ_GATE_PID:(\d+)/.exec(output);if(match)pid=Number(match[1]);});
  session.stdin.on('error',()=>{});
  const sql=statement=>execFileSync('docker',command,{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:10000}).trim();
  async function release() {
    if(released)return;released=true;
    if(session.exitCode!==null || spawnFailed)return;
    session.stdin.end(`select pg_advisory_unlock(${key}::bigint);\n\\q\n`);
    const stopped=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),3000);session.once('exit',()=>{clearTimeout(timer);resolve(true);});});
    if(!stopped) {
      // A bounded fallback targets only this unique application name / observed backend.
      try { sql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name='${name}'${pid===null?'':` and pid=${pid}`};`); }
      finally { session.kill('SIGTERM'); }
    }
  }
  try {
    session.stdin.write(`select set_config('application_name','${name}',false); select 'VPJ_GATE_PID:'||pg_backend_pid(); select pg_advisory_lock(${key}::bigint); select 'VPJ_GATE_HELD';\n`);
    await waitUntil(()=>{if(spawnFailed)throw new Error('Test gate session failed to spawn');if(session.exitCode!==null)throw new Error('Test gate session exited');return output.includes('VPJ_GATE_HELD') && pid!==null;},10000,'test gate acquisition');
    return {key,pid,release,sql};
  } catch(error) {await release();throw error;}
}
export async function waitUntil(probe, timeoutMs, label) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline) {
    const result=await probe();if(result)return result;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw new Error('Timed out waiting for '+label);
}
