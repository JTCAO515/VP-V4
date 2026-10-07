/** Starts/stops only a uniquely owned disposable local Auth/API/database fixture. */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { nativeHTTPOptions, nativeHTTPChildEnv, nativeHTTPSupabaseConfig, assertNativeHTTPPortsFree } from '../../turn/native-http-ports.mjs';
import { runOpsProcess } from '../../service-cases/ops-process.mjs';
import { moduleById } from '../../../../lib/server/privacy/coverage/catalog.ts';
if (!existsSync('supabase/migrations/20261007010000_result_data.sql') || moduleById('results')?.deleteHandler !== 'result_data') throw Error('Fixed ResultData SQL and precisely leased shared registration are required before signed Auth execution');
const { ports, mode } = nativeHTTPOptions(process.argv.slice(2), process.env);
if (mode) throw Error('Result data runner accepts only an isolated port base');
await assertNativeHTTPPortsFree(ports);
if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw Error('Explicit Docker overrides refused');
const context = execFileSync('docker', ['context','show'], { encoding: 'utf8' }).trim();
const endpoint = JSON.parse(execFileSync('docker', ['context','inspect',context], { encoding: 'utf8' }))[0].Endpoints.docker.Host;
if (!endpoint.startsWith('unix:///')) throw Error('Local Docker context required');
const project = 'vp-native-ask-' + randomUUID().slice(0,8), target = mkdtempSync(join(tmpdir(), 'vpj58-result-data-http-'));
mkdirSync(join(target,'supabase'));
writeFileSync(join(target,'supabase/config.toml'), nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'), project, ports));
cpSync('supabase/migrations', join(target,'supabase/migrations'), { recursive: true });
const env = { ...process.env, DOCKER_CONTEXT: context }; let exit = 1;
try {
  if (await runOpsProcess('supabase', ['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'], { phase: 'start', cwd: process.cwd(), env }) !== 0)
    throw Error('Owned result-data fixture startup failed; credential-bearing output suppressed');
  console.log('VP_RESULT_DATA_HTTP_TARGET ' + JSON.stringify({ project, base: ports.base }));
  exit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types','--test','tests/integration/privacy/result-data/auth-http.test.mjs'], {
      env: { ...env, VP_RESULT_DATA_HTTP: 'true', ...nativeHTTPChildEnv(ports,target) }, stdio: 'inherit',
    });
    child.once('error', () => reject(Error('Result data fixture launch failed'))); child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  const stopped = await runOpsProcess('supabase', ['stop','--workdir',target,'--no-backup'], { phase: 'cleanup', cwd: process.cwd(), env });
  if (stopped !== 0) { console.error('Owned result-data fixture cleanup failed: ' + project); exit = 1; }
  else { rmSync(target, { recursive: true }); console.log('VP_RESULT_DATA_HTTP_CLEANUP ' + JSON.stringify({ project, result: 'PASS' })); }
}
process.exitCode = exit;
