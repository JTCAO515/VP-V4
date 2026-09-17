import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createScopedTextWorker } from '../../lib/server/turn/scoped-text-worker.ts';
import { API, STAGING, requireTarget, requestFactory, denied } from './vpj-02-verification-core.mjs';

/** Only the exact nonexistent owner/policy claim may reach the real transport. */
export function idleOnlyFetch(ownerId, policyId, fetcher, observations) {
  let sent = false;
  return async (url, options) => {
    if (sent || url !== `${API}/rest/v1/rpc/claim_text_work` || options?.method !== 'POST'
      || options.redirect !== 'manual' || options.credentials !== 'omit') throw new Error('PROBE_BOUNDARY_REJECTED');
    let params;
    try { params = JSON.parse(options.body); } catch { throw new Error('PROBE_BOUNDARY_REJECTED'); }
    if (!params || Object.keys(params).length !== 2 || params.p_owner_id !== ownerId || params.p_policy_id !== policyId) throw new Error('PROBE_BOUNDARY_REJECTED');
    sent = true;
    const response = await fetcher(url, options);
    observations.requests++;
    observations.status = response.status;
    return response; // Do not synthesize, replace or reinterpret the server result.
  };
}

async function run() {
  const report = { observedAt: new Date().toISOString(), project: STAGING, scope: 'actual scoped HTTP worker; one empty poll only', checks: [] };
  const check = (name, valid) => { report.checks.push({ name, status: valid ? 'PASS' : 'FAIL' }); if (!valid) throw new Error('CHECK_FAILED'); };
  const temporary = mkdtempSync(join(tmpdir(), 'vpj02-worker-'));
  const cli = args => {
    try { return JSON.parse(execFileSync(process.env.VPJ02_SUPABASE_BIN || 'supabase', [...args, '--output-format', 'json'], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, stdio: ['ignore','pipe','pipe'] })); }
    catch { throw new Error('CLI_FAILED'); }
  };
  const query = sql => {
    const path = join(temporary, 'readonly.sql');
    writeFileSync(path, `begin read only; set local statement_timeout='10s'; ${sql}; rollback;`, { mode: 0o600 });
    const value = cli(['db','query','--linked','--project-ref',STAGING,'--file',path]);
    if (!Array.isArray(value.rows) || value.rows.length !== 1) throw new Error('INVALID_QUERY_RESULT');
    return value.rows[0];
  };
  let before;
  const tables = ['auth.users','public.trips','turn_private.work','turn_private.text_policies','public.model_budget_scopes','public.model_budget_attempts'];
  const snapshot = () => query(`select jsonb_build_array(${tables.map(table => `(select jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by md5(row_to_json(t)::text)),''))) from ${table} t)`).join(',')}) as state`).state;
  try {
    requireTarget(process.argv[2]);
    check('dedicated-process', process.argv.length === 3 && !process.env.VERCEL_ENV);
    const list = cli(['projects','list']);
    check('correct-staging-project', (Array.isArray(list) ? list : list.projects).some(p => p.id === STAGING && p.name === 'VP - V4' && p.region === 'ap-southeast-1' && p.status === 'ACTIVE_HEALTHY'));
    const ownerId = randomUUID(), policyId = randomUUID(), scopeId = randomUUID();
    const scope = query(`select
      not exists(select 1 from auth.users where id='${ownerId}') and not exists(select 1 from turn_private.work where owner_id='${ownerId}')
      and not exists(select 1 from turn_private.text_policies where id='${policyId}') and not exists(select 1 from public.model_budget_scopes where id='${scopeId}') as absent,
      has_function_privilege('service_role','public.claim_text_work(uuid,uuid)','execute') and not has_function_privilege('anon','public.claim_text_work(uuid,uuid)','execute')
      and not has_function_privilege('authenticated','public.claim_text_work(uuid,uuid)','execute') as grants,
      (select md5(prosrc) from pg_proc where oid='public.claim_text_work(uuid,uuid)'::regprocedure) as outer_hash,
      (select md5(prosrc) from pg_proc where oid='turn_private.claim_text_mode(uuid,uuid,text)'::regprocedure) as inner_hash`);
    check('nonexistent-owner-policy-budget-scope', scope.absent === true);
    check('service-only-claim-grants', scope.grants === true);
    const source = readFileSync('supabase/migrations/20260911205200_vpj_07_task_context.sql','utf8');
    const sourceHash = signature => {
      const start = source.indexOf(signature);
      if (start < 0) throw new Error('SOURCE_MISSING');
      const bodyStart = source.indexOf('$$',start)+2, end = source.indexOf('$$;',bodyStart);
      if (bodyStart < 2 || end < bodyStart) throw new Error('SOURCE_INVALID');
      return createHash('md5').update(source.slice(bodyStart,end)).digest('hex');
    };
    check('live-claim-source-matches-reviewed-filter', scope.outer_hash === sourceHash('create or replace function public.claim_text_work(')
      && scope.inner_hash === sourceHash('create function turn_private.claim_text_mode('));
    before = snapshot();
    const keys = cli(['projects','api-keys','--project-ref',STAGING]);
    const items = Array.isArray(keys) ? keys : keys.keys ?? keys.api_keys;
    const service = items?.find(k => k.name === 'service_role')?.api_key, anon = items?.find(k => k.name === 'anon')?.api_key;
    check('existing-server-credentials', !!service?.startsWith('eyJ') && !!anon?.startsWith('eyJ'));
    check('anon-worker-rpc-denied', denied(await requestFactory({ anon, service })('/rest/v1/rpc/claim_text_work', { method:'POST',body:{p_owner_id:ownerId,p_policy_id:policyId} })));
    const observations = { requests: 0, providerCalls: 0 };
    const worker = createScopedTextWorker({ environment:'staging',databaseUrl:API,ownerId,policyId,
      budget:{scopeId,priceVersion:'probe-never-dispatched',reservedMicros:1,maxOutputTokens:1,timeoutMs:1000} }, {
      credential: () => service,
      provider:{provider:'qwen',endpoint:'https://provider-disabled.invalid/never',price:()=>{throw new Error('PROVIDER_DISABLED');},transport:async()=>{observations.providerCalls++;throw new Error('PROVIDER_DISABLED');}},
      fetch: idleOnlyFetch(ownerId, policyId, fetch, observations),
    });
    const result = await worker(AbortSignal.timeout(15000));
    check('actual-worker-returned-empty', result === 'empty');
    check('one-real-worker-http-request', observations.requests === 1 && observations.status === 200);
    check('no-provider-call', observations.providerCalls === 0);
    report.workerResult = result;
  } catch { report.status = 'FAIL'; process.exitCode = 1; }
  finally {
    if (before) {
      try { check('original-auth-trip-queue-policy-budget-unchanged', JSON.stringify(snapshot()) === JSON.stringify(before)); }
      catch { report.status = 'FAIL'; process.exitCode = 1; }
    }
    rmSync(temporary,{recursive:true,force:true});
    report.status ??= 'PASS_EMPTY_POLL_ONLY';
    report.fullTaskExecution = 'UNRUN in this probe; no job, provider, policy or budget activated';
    report.completedAt = new Date().toISOString();
    console.log(JSON.stringify(report,null,2));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
