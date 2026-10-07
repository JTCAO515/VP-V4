/** Starts/stops only a uniquely owned disposable local Auth/API/database fixture. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { nativeHTTPOptions, nativeHTTPChildEnv, nativeHTTPSupabaseConfig, assertNativeHTTPPortsFree } from '../../turn/native-http-ports.mjs';
import { runOpsProcess } from '../../service-cases/ops-process.mjs';
const { ports, mode } = nativeHTTPOptions(process.argv.slice(2), process.env);
if (mode) throw Error('Profile data runner accepts only an isolated port base');
await assertNativeHTTPPortsFree(ports);
if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw Error('Explicit Docker overrides refused');
const context = execFileSync('docker', ['context','show'], { encoding: 'utf8' }).trim();
const endpoint = JSON.parse(execFileSync('docker', ['context','inspect',context], { encoding: 'utf8' }))[0].Endpoints.docker.Host;
if (!endpoint.startsWith('unix:///')) throw Error('Local Docker context required');
const project = 'vp-native-ask-' + randomUUID().slice(0,8), target = mkdtempSync(join(tmpdir(), 'vpj58-profile-data-http-'));
mkdirSync(join(target,'supabase'));
writeFileSync(join(target,'supabase/config.toml'), nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'), project, ports));
cpSync('supabase/migrations', join(target,'supabase/migrations'), { recursive: true });
// Consume the fixed sole upstream SQL only in the owned fixture until main includes it.
// Never write the active Result worktree or invent a replacement source/hash.
const resultMigration = join(target, 'supabase/migrations/20261007010000_result_data.sql');
if (!existsSync(resultMigration)) writeFileSync(resultMigration, execFileSync('git', ['show', '92e338e19450061f4e048c92177256461825a596:supabase/migrations/20261007010000_result_data.sql'], { encoding: 'utf8' }));
const env = { ...process.env, DOCKER_CONTEXT: context }; let exit = 1;
try {
  if (await runOpsProcess('supabase', ['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'], { phase: 'start', cwd: process.cwd(), env }) !== 0)
    throw Error('Owned profile-data fixture startup failed; credential-bearing output suppressed');
  console.log('VP_PROFILE_DATA_HTTP_TARGET ' + JSON.stringify({ project, base: ports.base }));
  exit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types','--test','tests/integration/privacy/profile-data/auth-http.test.mjs'], {
      env: { ...env, VP_PROFILE_DATA_HTTP: 'true', ...nativeHTTPChildEnv(ports,target) }, stdio: 'inherit',
    });
    child.once('error', () => reject(Error('Profile data fixture launch failed'))); child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  const stopped = await runOpsProcess('supabase', ['stop','--workdir',target,'--no-backup'], { phase: 'cleanup', cwd: process.cwd(), env });
  if (stopped !== 0) { console.error('Owned profile-data fixture cleanup failed: ' + project); exit = 1; }
  else { rmSync(target, { recursive: true }); console.log('VP_PROFILE_DATA_HTTP_CLEANUP ' + JSON.stringify({ project, result: 'PASS' })); }
}
process.exitCode = exit;
