import{readFileSync}from'node:fs';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
const root='artifacts/VPJ-08/assistant-events-sql-20261010/';
const r=await sql('vpj08-events-sql-20261010','begin;'+readFileSync(root+'terminal-helper.candidate.sql','utf8')+readFileSync(root+'writers.candidate.sql','utf8')+'rollback;');console.log(r.stdout+r.stderr);console.log('writer candidate transactional compile exit',r.code);process.exitCode=r.code;
