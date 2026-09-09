import { spawn } from 'node:child_process';
export function command(binary, args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
export const sql = (container, text) => command('docker', ['exec','-i',container,'psql','-h','/tmp/vpj59-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'], "set statement_timeout='5s'; set lock_timeout='5s';\n"+text);
const names = new Set(['reserve_model_budget','dispatch_model_budget','finish_model_budget']);
const literal = value => value === null ? 'null' : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
export const rpc = container => async (name, params) => {
  if (!names.has(name) || Object.keys(params).some(k => !/^p_[a-z_]+$/.test(k))) throw Error('Invalid test RPC');
  const result = await sql(container, 'set role service_role; select public.'+name+'('+Object.entries(params).map(([k,v])=>k+' => '+literal(v)).join(',')+');');
  if (result.code !== 0) throw Error('Test RPC failed: '+result.stderr);
  return JSON.parse(result.stdout.trim());
};
