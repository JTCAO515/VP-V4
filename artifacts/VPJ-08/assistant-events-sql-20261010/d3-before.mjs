import{writeFileSync}from'node:fs';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
const r=await sql('vpj08-events-sql-20261010',"select pg_get_functiondef('public.privacy_linked_trip_delete_v1(text,jsonb)'::regprocedure)");if(r.code)throw Error(r.stderr);writeFileSync('artifacts/VPJ-08/assistant-events-sql-20261010/d3-handler-before.sql',r.stdout.trim()+';\n');
