-- Exact Main lease: one parser body only. Original applied migrations remain intact.
-- Baseline full source SHA12738f0a... includes its final newline; prosrc pins below
-- are the original published parser/helper, not an environment-discovered hash.
do $migration$
declare parser_n oid:=to_regprocedure('result_data_private.json_references_v1(jsonb,text[])');
 helper_n oid:=to_regprocedure('result_data_private.reference_kind_v1(text)');r record;acl_n aclitem[];owner_n oid;config_n text[];
begin
 if parser_n is null or helper_n is null then raise exception 'RESULT_PARSER_DEPENDENCY_DRIFT';end if;
 for r in select p.*,l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.oid in(parser_n,helper_n) loop
  if r.provolatile<>'i' or r.prosecdef or r.proconfig is distinct from array['search_path=""']::text[]
   or (r.oid=parser_n and (r.lanname<>'plpgsql' or md5(r.prosrc)<>'9e014624130e8b640352ab16acdcd307'
    or pg_get_function_arguments(r.oid) is distinct from 'v jsonb, path_n text[] DEFAULT ARRAY[]::text[]'
    or pg_get_function_result(r.oid) is distinct from 'TABLE(kind text, entity_id uuid)'))
   or (r.oid=helper_n and (r.lanname<>'sql' or md5(r.prosrc)<>'988946e99753b485e64e8377fd709c19'
    or pg_get_function_arguments(r.oid) is distinct from 'k text' or pg_get_function_result(r.oid) is distinct from 'text'))
   or exists(select 1 from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) permission_n where grantee=0 and privilege_type='EXECUTE')
   or has_function_privilege('anon',r.oid,'EXECUTE') or has_function_privilege('authenticated',r.oid,'EXECUTE')
   or has_function_privilege('service_role',r.oid,'EXECUTE') then raise exception 'RESULT_PARSER_DEPENDENCY_DRIFT';end if;
 end loop;
 select proacl,proowner,proconfig into acl_n,owner_n,config_n from pg_proc where oid=parser_n;
 execute $replacement$
create or replace function result_data_private.json_references_v1(v jsonb,path_n text[] default array[]::text[]) returns table(kind text,entity_id uuid)
language plpgsql immutable set search_path='' as $$
declare x record;k text;id_n jsonb;
begin
 if cardinality(path_n)>32 then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
 if v='[]'::jsonb then return;end if;
 if jsonb_typeof(v)='object' then
  if v->>'kind' in('artifact_reference','result_artifact','artifact','result','task_result') then
   id_n:=case when v->>'kind'='task_result' then coalesce(v->'sourceId',v->'source_id',v->'id') else v->'id' end;
   if id_n is not null and id_n<>'null'::jsonb then
    if not notification_private.uuid(id_n) then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
    return query select 'artifactIds'::text,(id_n#>>'{}')::uuid;
   end if;
  end if;
  if v->>'source_kind'='task_result' and notification_private.uuid(v->'source_id') then return query select 'artifactIds'::text,(v->>'source_id')::uuid;end if;
  for x in select key,value from jsonb_each(v) order by key collate "C" loop
   k:=case when x.key in('artifact_id','artifactId','source_result_id','sourceResultId','artifactIds','artifact_ids','sourceResultIds','source_result_ids','resultIds','result_ids') then 'artifactIds'
 when x.key in('execution_id','executionId','executionIds','execution_ids','runId','run_id') then 'executionIds'
 when x.key in('publication_key','publicationKey','publicationKeys','publication_keys') then 'publicationKeys' end;
   if x.key='resultId' and ('comparisonRef'=any(path_n) or v->>'kind' in('result','result_artifact','artifact_reference')) then k:='artifactIds';end if;
   if k is not null and x.value<>'null'::jsonb then
    if jsonb_typeof(x.value)='array' then
     for id_n in select value from jsonb_array_elements(x.value) loop
      if not notification_private.uuid(id_n) then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
      return query select k,(id_n#>>'{}')::uuid;
     end loop;
    else
     if not notification_private.uuid(x.value) then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
     return query select k,(x.value#>>'{}')::uuid;
    end if;
   elsif jsonb_typeof(x.value) in('object','array') then return query select * from result_data_private.json_references_v1(x.value,path_n||x.key);end if;
  end loop;
 elsif jsonb_typeof(v)='array' then
  for x in select value,ordinality from jsonb_array_elements(v) with ordinality loop
   return query select * from result_data_private.json_references_v1(x.value,path_n||x.ordinality::text);
  end loop;
 end if;
end$$;
$replacement$;
 if (select proacl::text collate "C" from pg_proc where oid=parser_n) is distinct from acl_n::text collate "C"
  or (select proowner from pg_proc where oid=parser_n) is distinct from owner_n
  or (select proconfig::text collate "C" from pg_proc where oid=parser_n) is distinct from config_n::text collate "C"
  then raise exception 'RESULT_PARSER_DEPENDENCY_DRIFT';end if;
 if (select md5(prosrc) from pg_proc where oid=helper_n)<>'988946e99753b485e64e8377fd709c19'
  then raise exception 'RESULT_PARSER_DEPENDENCY_DRIFT';end if;
end$migration$;
