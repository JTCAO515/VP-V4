import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sql } from '../../cost/fixtures/postgres-rpc.mjs';
export let container=process.env.VP_PROFILE_TEST_CONTAINER || 'vpj58-profile-data-sql-20261007';
export function setContainer(v){container=v;}
export async function db(q){const r=await sql(container,q);if(r.code)throw Error(r.stderr);return r.stdout.trim();}
if(['init','catalog'].includes(process.argv[2])){
 if(process.argv[2]==='init'){
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<'20261007020000').sort();
 for(const f of migrations)await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 // Fixed sole Result dependency, preserved as actual committed source. In the
 // integrated package this migration is already in the ordered migration list.
 if(!migrations.includes('20261007010000_result_data.sql')){
  const source=execFileSync('git',['show','92e338e19450061f4e048c92177256461825a596:supabase/migrations/20261007010000_result_data.sql'],{encoding:'utf8'});
  await db('begin;'+source+'commit;');
 }
 const profileSource=readFileSync('supabase/migrations/20261007020000_profile_data.sql','utf8');
 const functions=()=>db("set search_path='';select md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname not in('pg_catalog','information_schema','extensions','auth')");
 const original=await functions();await db('begin;'+profileSource+'rollback;');
 if(await functions()!==original || await db("select to_regnamespace('profile_data_private') is null and result_data_private.schema_supported_v1()")!=='t')throw Error('Profile migration rollback mismatch');
 console.log('Actual full migration rollback/source/ACL restoration PASS');
 await db('begin;'+profileSource+'commit;');
 }
 if(process.argv[2]==='catalog'){
 const sources=await db("select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in('pg_catalog','information_schema') and (p.prosrc like '%user_profiles%' or p.prosrc like '%profile_basis%' or p.prosrc like '%profilePace%');");
 writeFileSync('tests/integration/privacy/profile-data-sql/catalog-functions.json',sources+'\n');
 const catalog=await db("select jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid),'triggers',(select jsonb_agg(jsonb_build_object('name',tgname,'def',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(tgfoid)) order by tgname) from pg_trigger t where tgrelid=c.oid and not tgisinternal)) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and (c.oid='public.user_profiles'::regclass or n.nspname in('service_brief_private','scoped_edit_private','recovery_private','export_private'));");
 writeFileSync('tests/integration/privacy/profile-data-sql/catalog-relations.json',catalog+'\n');
 }
 console.log('Actual local PG replay complete');
}
