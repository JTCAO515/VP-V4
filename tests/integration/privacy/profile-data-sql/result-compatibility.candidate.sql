-- CANDIDATE ONLY: Main review/lease required before appending to 07020000.
-- Fixed Result baseline 92e338e19450061f4e048c92177256461825a596.
-- New Profile JSON has no Result authority. Enforce this on every insert/update,
-- with the original immutable typed-reference parser; no global per-user scan.
create function profile_data_private.no_result_references_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$begin
 return not exists(select 1 from result_data_private.json_references_v1(v));
exception when others then return false;end$$;
alter table profile_data_private.operations_v1 add constraint profile_operation_no_result_references
 check(profile_data_private.no_result_references_v1(jsonb_build_array(summary,copies,conflicts,decision)));
alter table profile_data_private.proofs_v1 add constraint profile_proof_no_result_references
 check(profile_data_private.no_result_references_v1(jsonb_build_array(expected_row,input)));
revoke all on function profile_data_private.no_result_references_v1(jsonb) from public,anon,authenticated,service_role;

-- Exact complete application-catalog hash after the reviewed Profile delta.
create or replace function result_data_private.schema_supported_v1() returns boolean language sql stable security definer set search_path='' as $$
 select profile_data_private.schema_v1() and result_data_private.infrastructure_supported_v1() and result_data_private.digest_v1((select coalesce(jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid)) order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','extensions','auth','result_data_private','storage','realtime','_realtime','vault','supabase_functions','supabase_migrations'))::text)='1b026808c513d02dbe168a5fd2698f624283075ba2ae8b8e265e7f4ce4381324'
$$;
