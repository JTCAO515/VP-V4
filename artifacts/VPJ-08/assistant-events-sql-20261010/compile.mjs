import{readFileSync}from'node:fs';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
const out='artifacts/VPJ-08/assistant-events-sql-20261010/';
const r=await sql('vpj08-events-sql-20261010','begin;'+['events-reader.candidate.sql','events-lifecycle.candidate.sql'].map(n=>readFileSync(out+n,'utf8')).join('\n')+'rollback;');
console.log(r.stdout+r.stderr);console.log('exit',r.code);process.exitCode=r.code;
