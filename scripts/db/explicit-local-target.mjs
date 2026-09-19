import { execFileSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { readFileSync } from 'node:fs';

/** Explicit disposable target only. Never discover the repository's pre-existing local instance. */
export function identityLocalEnv() {
  const supabaseCLI = process.env.VP_SUPABASE_CLI || 'supabase';
  const workdir = process.env.VP_IDENTITY_SUPABASE_WORKDIR;
  const expected = process.env.VP_IDENTITY_SUPABASE_API_URL;
  if (!workdir && !expected) return null;
  if (!workdir || !expected) throw new Error("Both explicit local workdir and expected API origin are required");
  if (!isAbsolute(workdir)) throw new Error('Identity DB workdir must be explicit and absolute');
  const target = new URL(expected);
  if (target.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(target.hostname) || !target.port) throw new Error('Identity DB target must be explicit loopback');
  let result;
  try {
    const raw = execFileSync(supabaseCLI,['status','--workdir',workdir,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
    result = JSON.parse(raw);
  } catch { throw new Error('Explicit local Supabase status failed; credential-bearing output suppressed'); }
  if (result.API_URL !== expected) throw new Error('Identity DB target mismatch');
  const config = readFileSync(join(workdir, 'supabase', 'config.toml'), 'utf8');
  const project = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m.exec(config)?.[1];
  if (!project) throw new Error('Explicit identity DB project id missing');
  return { ...result, DB_CONTAINER: 'supabase_db_' + project };
}
