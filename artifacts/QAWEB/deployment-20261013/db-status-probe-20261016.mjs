/** One fixed read-only RPC; no worker entrypoint, provider, env-key or output body. */
import { open, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';
import { supabaseWorkerHeaders } from '/app/lib/server/jobs/supabase-worker-headers.ts';
const build = '12ada21db9840525c2c8fc94067846b487476fdc';
const out = {
  instance: 'i-j6c7q3kftufyroypiqvu', build,
  image: 'sha256:1ec86928ef66bd78c24d7dd79b361582fde2f5d7cc97f1295a29b6b5282fd943',
  httpStatus: null, validContentType: false, kindIsStatus: false, enabled: null, probe: 'FAIL',
};
let file, keyBytes, responseBytes, secret = '';
try {
  if (process.getuid() !== 1000 || process.getgid() !== 1000 || process.env.VISEPANDA_HOSTED_WORKER_BUILD !== build) throw Error();
  const path = '/run/vp-worker-secrets/db.key';
  if ((await statfs(path)).type !== 0x01021994) throw Error();
  file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const meta = await file.stat();
  if (!meta.isFile() || meta.uid !== 1000 || meta.gid !== 1000 || (meta.mode & 0o777) !== 0o400 || meta.nlink !== 1 || meta.size < 1 || meta.size > 4096) throw Error();
  keyBytes = await file.readFile();
  if (keyBytes.length < 1 || keyBytes.length > 4096 || !keyBytes.every(b => b >= 33 && b <= 126)) throw Error();
  secret = keyBytes.toString('ascii');
  const response = await fetch('https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/read_hosted_worker_status', {
    method: 'POST', headers: supabaseWorkerHeaders(secret), body: '{}',
    redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  out.httpStatus = response.status;
  out.validContentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json';
  if (response.redirected || response.status !== 200 || !out.validContentType || !response.body) {
    await response.body?.cancel(); throw Error();
  }
  const reader = response.body.getReader(), chunks = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > 262144) { await reader.cancel(); throw Error(); }
    chunks.push(part.value);
  }
  responseBytes = Buffer.concat(chunks, total);
  const value = JSON.parse(responseBytes.toString('utf8'));
  out.kindIsStatus = value !== null && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'kind') && value.kind === 'status';
  if (!out.kindIsStatus || !Object.hasOwn(value, 'enabled') || typeof value.enabled !== 'boolean') throw Error();
  out.enabled = value.enabled;
  out.probe = 'PASS';
} catch {
  // No exception, response body, header, worker/queue detail or credential output.
} finally {
  secret = '';
  keyBytes?.fill(0);
  responseBytes?.fill(0);
  try { await file?.close(); } catch { out.probe = 'FAIL'; }
}
console.log(JSON.stringify(out));
process.exitCode = out.probe === 'PASS' ? 0 : 1;
