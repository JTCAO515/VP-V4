import{readFileSync,writeFileSync}from'node:fs';
import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
const out='artifacts/VPJ-08/assistant-events-sql-20261010/';
async function q(s){const r=await sql('vpj08-events-sql-20261010',s);if(r.code)throw Error(r.stderr);return r.stdout.trim();}
const catalog=`select coalesce(jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid)) order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','extensions','auth','result_data_private','storage','realtime','_realtime','vault','supabase_functions','supabase_migrations')`;
const guards=`select jsonb_object_agg(n.nspname||'.'||p.proname,pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('profile_data_private','turn_data_private','result_data_private','conversation_data_private','export_private','privacy_private') and (p.proname like '%supported%' or p.proname like '%relations%' or p.proname like '%dependency%' or p.proname like '%manifest%' or p.proname like '%hook%')`;
for(const[name,s]of[['catalog-before.json',catalog],['guards-before.json',guards]])writeFileSync(out+name,JSON.stringify(JSON.parse(await q(s)),null,2)+'\n');
console.log('before source catalog recorded');
await q('begin;'+readFileSync(out+'events-core.candidate.sql','utf8')+'commit;');
writeFileSync(out+'catalog-after.json',JSON.stringify(JSON.parse(await q(catalog)),null,2)+'\n');
console.log('core candidate compile/apply PASS own isolated fixture only');
console.log(await q("select jsonb_build_object('result',result_data_private.schema_supported_v1(),'conversation',conversation_data_private.schema_supported_v1(),'profile',profile_data_private.schema_v1())"));
