CREATE OR REPLACE FUNCTION result_data_private.infrastructure_supported_v1()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare spec record;column_n record;found_n boolean;
begin
 -- Every excluded origin, not just the six namespaces, must remain without
 -- an incoming application FK. Application outgoing FKs remain in the hash.
 if exists(select 1 from pg_constraint fk join pg_class destination on destination.oid=fk.confrelid
  join pg_namespace target_n on target_n.oid=destination.relnamespace
  join pg_class origin on origin.oid=fk.conrelid join pg_namespace origin_n on origin_n.oid=origin.relnamespace
  where fk.contype='f'
   and target_n.nspname not in('pg_catalog','information_schema','extensions','auth','result_data_private')
   and not target_n.nspname=any(result_data_private.infrastructure_namespaces_v1())
   and (origin_n.nspname in('pg_catalog','information_schema','extensions','auth','result_data_private')
    or origin_n.nspname=any(result_data_private.infrastructure_namespaces_v1()))) then return false;end if;
 -- A typed application identity column is not unrelated infrastructure, even
 -- if it has no FK, is empty, or is placed inside one of the fixed namespaces.
 if exists(select 1 from pg_attribute attribute_n join pg_class relation_n on relation_n.oid=attribute_n.attrelid
  join pg_namespace namespace_n on namespace_n.oid=relation_n.relnamespace
  where relation_n.relkind='r' and namespace_n.nspname=any(result_data_private.infrastructure_namespaces_v1())
   and attribute_n.attnum>0 and not attribute_n.attisdropped
   and result_data_private.reference_kind_v1(attribute_n.attname::text) is not null) then return false;end if;
 for spec in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='r' and n.nspname=any(result_data_private.infrastructure_namespaces_v1()) order by n.nspname,c.relname loop
  -- Managed regclass subscriptions and the actual webhook table OID must not
  -- silently introduce application consumers across this boundary.
  for column_n in select attname from pg_attribute where attrelid=spec.oid and attnum>0 and not attisdropped
   and (atttypid='regclass'::regtype or spec.nspname='supabase_functions' and spec.relname='hooks' and attname='hook_table_id' and atttypid='oid'::regtype) loop
   execute format('select exists(select 1 from %I.%I operational where operational.%I::oid in(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in(''pg_catalog'',''information_schema'',''extensions'',''auth'',''result_data_private'') and not n.nspname=any($1)))',spec.nspname,spec.relname,column_n.attname)
    into found_n using result_data_private.infrastructure_namespaces_v1();
   if found_n then return false;end if;
  end loop;
  if exists(select 1 from pg_attribute where attrelid=spec.oid and attnum>0 and not attisdropped and atttypid in('json'::regtype,'jsonb'::regtype)) then
   -- Arbitrary title/UUID strings are not authority. Actual typed JSON links
   -- to application rows or permanent identities remain unsupported sources.
   execute format('select exists(select 1 from %I.%I operational where exists(select 1 from result_data_private.json_references_v1(to_jsonb(operational)) typed where result_data_private.application_identity_v1(typed.kind,typed.entity_id)))',spec.nspname,spec.relname) into found_n;
   if found_n then return false;end if;
  end if;
 end loop;
 return true;
exception when invalid_text_representation or invalid_parameter_value then return false;
end$function$