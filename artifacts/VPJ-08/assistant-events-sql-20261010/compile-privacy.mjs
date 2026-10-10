import{readFileSync}from'node:fs';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';const root='artifacts/VPJ-08/assistant-events-sql-20261010/';
const files=['events-witness.candidate.sql','privacy-handlers.candidate.sql','terminal-helper.candidate.sql','writers.candidate.sql'];
const r=await sql('vpj08-events-sql-20261010','begin;'+files.map(n=>readFileSync(root+n,'utf8')).join('\n')+'rollback;');console.log(r.stdout+r.stderr);console.log('private witness + exact original handlers/writers compile exit',r.code);process.exitCode=r.code;
