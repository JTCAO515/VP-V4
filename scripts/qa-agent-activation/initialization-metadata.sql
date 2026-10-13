-- READ ONLY pre-initialization inventory. Connector project must equal the reviewed independent operator binding.
-- No project ref is inferred from current_database(), and no shared target is permitted.
-- Read counts only, no account rows or secrets. Preserve this separate inventory as initialization evidence.
select clock_timestamp() as observed_at,
 to_regclass('supabase_migrations.schema_migrations') is not null as migration_history_present,
 (select count(*) from auth.users) as auth_user_count,
 (select count(*) from storage.objects) as storage_object_count,
 (select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by n.nspname,c.relname),'[]'::jsonb)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ('public','turn_private','turn_data_private','conversation_data_private','profile_data_private','result_data_private')) as existing_business_relations;
-- Main must also collect the exact migration version list using official list_migrations (empty means []).
-- This SQL does not prove an empty migration history or absence of data/role/backup copying by itself.
