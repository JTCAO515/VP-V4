/** One affected HTTP proof; owns and removes only its uniquely named local stack. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { nativeHTTPOptions, nativeHTTPChildEnv, nativeHTTPSupabaseConfig, assertNativeHTTPPortsFree } from '../turn/native-http-ports.mjs';
const repo = process.cwd(), { mode, ports } = nativeHTTPOptions(process.argv.slice(2), process.env);
if (mode) throw Error('Only a port base is accepted for this scoped proof');
await assertNativeHTTPPortsFree(ports);
if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw Error('Explicit Docker overrides refused');
const context = execFileSync('docker', ['context', 'show'], { encoding: 'utf8' }).trim();
const inspected = JSON.parse(execFileSync('docker', ['context', 'inspect', context], { encoding: 'utf8' }))[0];
if (!inspected.Endpoints.docker.Host.startsWith('unix:///')) throw Error('Local Docker context required');
const project = 'vp-native-ask-' + randomUUID().slice(0, 8), target = mkdtempSync(join(tmpdir(), 'vpj55-pdf-http-'));
mkdirSync(join(target, 'supabase'));
writeFileSync(join(target, 'supabase/config.toml'), nativeHTTPSupabaseConfig(readFileSync(join(repo, 'supabase/config.toml'), 'utf8'), project, ports));
cpSync(join(repo, 'supabase/migrations'), join(target, 'supabase/migrations'), { recursive: true });
const run = (command, args, visible = false, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: repo, env: { ...env, DOCKER_CONTEXT: context }, stdio: visible ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
  if (!visible) { child.stdout.resume(); child.stderr.resume(); }
  child.once('error', () => reject(Error('Disposable process launch failed')));
  child.once('exit', code => resolve(code ?? 1));
});
let exit = 1;
try {
  if (await run('supabase', ['start', '--workdir', target, '-x', 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']) !== 0)
    throw Error('Owned stack start failed; credential-bearing output suppressed');
  console.log('VPJ55_PDF_LOCAL_TARGET ' + JSON.stringify({ project, base: ports.base }));
  exit = await run(process.execPath, ['--experimental-strip-types', '--test', 'tests/integration/intake/pdf-intake-http.test.mjs'], true,
    { ...process.env, VP_PDF_INTAKE_HTTP: 'true', VISEPANDA_TRIP_PROTOCOL_V2: 'true', ...nativeHTTPChildEnv(ports, target) });
} finally {
  if (await run('supabase', ['stop', '--workdir', target, '--no-backup']) !== 0) { console.error('Owned stack cleanup failed: ' + project); exit = 1; }
  else { rmSync(target, { recursive: true }); console.log('VPJ55_PDF_LOCAL_CLEANUP PASS ' + project); }
}
process.exitCode = exit;
