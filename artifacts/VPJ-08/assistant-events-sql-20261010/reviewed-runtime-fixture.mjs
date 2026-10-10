import{readFileSync}from'node:fs';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';const root='artifacts/VPJ-08/assistant-events-sql-20261010/';
const before=JSON.parse(readFileSync(root+'authority-functions-before.json','utf8'))['turn_data_private.runtime_supported_v1()'];
const r=await sql('vpj08-events-sql-20261010','begin;'+before+';'+readFileSync(root+'runtime-pins.candidate.sql','utf8')+'commit;');if(r.code)throw Error(r.stderr);console.log('own fixture exact original runtime predecessor asserted for corrected scoped helper');
