import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
export const migration = 'supabase/migrations/20260917140000_vpj_62_research_intake.sql';
export async function startIntakeDatabase({ port = 56962 } = {}) {
  const id = 'vp-intake-' + randomBytes(5).toString('hex');
  const db = id + '-db', rest = id + '-rest';
  const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const stop = () => { for (const name of [rest, db]) { try { docker('rm', '-f', name); } catch {} } try { docker('network', 'rm', id); } catch {} };
  const sql = (text, role = 'postgres') => docker('exec', '-i', db, 'psql', '-U', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `set statement_timeout='5s'; set lock_timeout='5s'; set role ${role}; ${text}`).trim();
  try {
    docker('network', 'create', id);
    docker('run', '--pull=never', '--rm', '-d', '--network', id, '--network-alias', 'database', '--name', db, '--user', 'postgres', '--entrypoint', '/bin/sh', 'public.ecr.aws/supabase/postgres:17.6.1.167', '-c', 'if [ ! -f /tmp/intake-pg/PG_VERSION ]; then initdb -D /tmp/intake-pg -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 || exit 1; fi; exec postgres -D /tmp/intake-pg -c listen_addresses=\'*\'');
    let ready = false;
    for (let i = 0; i < 60; i++) { try { sql('select 1'); ready = true; break; } catch { await new Promise(r => setTimeout(r, 250)); } }
    if (!ready) throw Error('Disposable database did not start');
    docker('exec', db, 'sh', '-c', "printf '\\nhost all all samenet trust\\n' >> /tmp/intake-pg/pg_hba.conf");
    sql('select pg_reload_conf()');
    sql('create role anon; create role authenticated; create role service_role;');
    // Test forward + transaction rollback before applying the real migration.
    sql('begin; ' + readFileSync(migration, 'utf8') + ' rollback;');
    if (sql("select to_regnamespace('research_intake_private') is null") !== 't') throw Error('Migration rollback failed');
    sql('begin; ' + readFileSync(migration, 'utf8') + ' commit;');
    docker('run', '--pull=never', '--rm', '-d', '--network', id, '--name', rest, '-p', `127.0.0.1:${port}:3000`, '-e', 'PGRST_DB_URI=postgres://postgres@database:5432/postgres', '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', 'PGRST_DB_SCHEMAS=public', 'public.ecr.aws/supabase/postgrest:v16.2');
    const url = `http://127.0.0.1:${port}`;
    ready = false;
    for (let i = 0; i < 60; i++) { try { if ((await fetch(url, {signal: AbortSignal.timeout(1000)})).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 250)); }
    if (!ready) throw Error('Disposable REST endpoint did not start: ' + spawnSync('docker',['logs',rest],{encoding:'utf8'}).stderr);
    const rpc = async input => { const response = await fetch(url + '/rpc/research_intake_v1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_input: input }) }); if (!response.ok) throw Error('Database RPC failed: ' + await response.text()); return response.json(); };
    return { sql, rpc, stop, url, restart: () => docker('restart', db) };
  } catch (error) { stop(); throw error; }
}
