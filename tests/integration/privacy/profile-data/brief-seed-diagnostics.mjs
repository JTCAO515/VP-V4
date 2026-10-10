// Single original9800 seed observation in its own existing test container.
// No target, authorization, statement/lock timeout, count or original exit oracle change.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { loadavg, availableParallelism } from 'node:os';
import { sql } from '../../cost/fixtures/postgres-rpc.mjs';
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const errorSummary = error => String(error).split('\n')[0].slice(0, 240);
const observedNamespaces = "('result_data_private','conversation_data_private','profile_data_private')";
const functionStats = `select coalesce(jsonb_agg(to_jsonb(s) order by namespace,function),'[]') from
 (select n.nspname namespace,p.proname function,c.calls,c.total_time,c.self_time
 from pg_stat_user_functions c join pg_proc p on p.oid=c.funcid join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in${observedNamespaces})s;`;
export async function observedBriefAuditSeed(container, query) {
  assert.match(container, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'original safe Docker name, including an owned external fixture');
  assert.match(query, /^insert into service_brief_private\.audit\(/);
  assert.match(query, /from generate_series\(1,9800\);$/);
  const marker = 'brief-9800-observe-' + randomUUID().slice(0, 8);
  const read = async statement => {
    let result;
    try { result = await sql(container, statement); } catch (error) { return { unavailable: true, code: 'OBSERVATION_SPAWN_ERROR', error: errorSummary(error) }; }
    if (result.code !== 0) return { unavailable: true, code: result.code, error: errorSummary(result.stderr) };
    try { return JSON.parse(result.stdout.trim()); } catch { return { unavailable: true, code: result.code, error: 'MALFORMED_OBSERVATION' }; }
  };
  const before = await read(functionStats), samples = [], samplingErrors = [];
  let ended = false; const start = performance.now();
  // Only telemetry settings are prefixed. The ORIGINAL complete INSERT is unchanged;
  // sql() still sets the original statement_timeout=5s and lock_timeout=5s.
  const work = sql(container, `set track_functions='all';set application_name=${literal(marker)};${query}`)
    .then(result => ({ result }), error => ({ spawnError: error })).finally(() => { ended = true; });
  while (!ended) {
    const sample = await read(`select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'state',state,
      'waitType',wait_event_type,'wait',wait_event,'blockers',pg_blocking_pids(pid),
      'transactionAgeMs',extract(epoch from(clock_timestamp()-xact_start))*1000,
      'queryAgeMs',extract(epoch from(clock_timestamp()-query_start))*1000)),'[]')
      from pg_stat_activity where application_name=${literal(marker)};`);
    if (Array.isArray(sample)) samples.push(...sample); else samplingErrors.push(sample);
    if (!ended) await new Promise(resolve => setTimeout(resolve, 100));
  }
  const outcome = await work, elapsedMs = performance.now() - start;
  if (outcome.spawnError) {
    console.log('VP_BRIEF_9800_DIAGNOSTIC ' + JSON.stringify({ container, marker, elapsedMs, samples, samplingErrors, originalSpawnError: errorSummary(outcome.spawnError), remoteCauseConclusion: 'UNKNOWN' }));
    throw outcome.spawnError;
  }
  const result = outcome.result;
  const after = await read(functionStats);
  console.log('VP_BRIEF_9800_DIAGNOSTIC ' + JSON.stringify({ kind: 'original9800/5s seed observation',
    container, marker, count: 9800, statementTimeoutMs: 5000, lockTimeoutMs: 5000,
    originalExit: result.code, error: errorSummary(result.stderr), elapsedMs, samples, samplingErrors,
    beforeFunctions: before, afterFunctions: after, host: { loadavg: loadavg(), parallelism: availableParallelism() },
    rawQueryLogged: false, sourceChanged: false, remoteCauseConclusion: 'UNKNOWN' }));
  // Identical original db() success oracle; diagnostic failure never turns a seed
  // timeout/lock failure into a pass, retry, skip, different error or partial result.
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}
