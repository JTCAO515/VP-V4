import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
const root='artifacts/VPJ-08/assistant-events-sql-20261010/';const source=readFileSync('supabase/migrations/20261010020000_assistant_events.sql','utf8');
// Disposable-only deliberate unknown metadata. Original product source is
// unchanged; connection failure rolls back this local configuration mutation.
const altered=source.replace('begin;',"begin;alter function turn_private.terminal(uuid,text,integer) set work_mem='4MB';");
const rejected=await sql('vpj08-events-sql-20261010',altered);writeFileSync(root+'migration-negative.log',rejected.stdout+rejected.stderr);assert.notEqual(rejected.code,0);assert.match(rejected.stderr,/ASSISTANT_EVENTS_BASELINE_DRIFT/);
const unchanged=await sql('vpj08-events-sql-20261010',"select to_regclass('turn_private.assistant_events_v1') is null and to_regclass('turn_private.assistant_event_heads_v1') is null;select proconfig::text from pg_proc where oid='turn_private.terminal(uuid,text,integer)'::regprocedure;select turn_data_private.runtime_supported_v1();");assert.equal(unchanged.code,0,unchanged.stderr);assert.equal(unchanged.stdout.trim(),'t\n{"search_path=\\\"\\\""}\nt');
console.log('unknown original function config rejected before any new object; failed transaction restores original config/runtime and both new tables absent PASS; repository source untouched');
