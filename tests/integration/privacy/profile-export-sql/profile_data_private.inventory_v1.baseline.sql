CREATE OR REPLACE FUNCTION profile_data_private.inventory_v1(u uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.user_profiles;w profile_data_private.watermarks_v1;cases uuid[]:=array[]::uuid[];scoped uuid[]:=array[]::uuid[];work_ids uuid[]:=array[]::uuid[];recovery uuid[]:=array[]::uuid[];
 spec record;row_n jsonb;rows_n jsonb:='[]';copies jsonb:=profile_data_private.empty_copies_v1();conflicts text[]:=array[]::text[];n integer:=0;source jsonb;modules jsonb;
begin
 if profile_data_private.schema_v1() is not true then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
 select * into p from public.user_profiles where owner_id=u for update nowait;
 select * into w from profile_data_private.watermarks_v1 where owner_id=u for update nowait;
 if p.owner_id is not null then
  if p.profile_revision<>w.profile_revision or p.pace_revision<>w.pace_revision or jsonb_typeof(p.profile_saved_fields)<>'array'
   or (select coalesce(jsonb_agg(value order by ord),'[]') from jsonb_array_elements('["display_name","travel_pace","locale","currency","distance_unit","temperature_unit","default_departure_time"]') with ordinality f(value,ord) where p.profile_saved_fields ? (value#>>'{}')) is distinct from p.profile_saved_fields
   or (p.pace_request is null)<>(p.pace_operation is null) or p.pace_request is not null and ((p.pace_request->>'operationId')::uuid is distinct from p.pace_operation or (p.pace_request->>'expectedRevision')::bigint+1<>p.pace_revision)
   or p.pace_undo is not null and p.pace_request->>'action' is distinct from 'save' or p.pace_state not in('explicit','paused') and p.pace_notice is not null then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
 end if;
 select coalesce(array_agg(id order by id),'{}') into scoped from (select id from scoped_edit_private.contexts_v1 where owner_id=u order by id limit 10001 for update nowait) s;
 select coalesce(array_agg(id order by id),'{}') into recovery from (select id from recovery_private.contexts_v1 where owner_id=u order by id limit 10001 for update nowait) s;
 select coalesce(array_agg(turn_id order by turn_id),'{}') into work_ids from scoped_edit_private.work_v1 where context_id=any(scoped);
 select coalesce(array_agg(case_id order by case_id),'{}') into cases from (select case_id from service_brief_private.briefs where owner_id=u and state='shared' and sources->'profilePace'='true' union select case_id from service_brief_private.previews where owner_id=u and sources->'profilePace'='true') s;
 if exists(select 1 from unnest(cases) cid where not exists(select 1 from service_cases_private.cases c where c.id=cid and c.owner_id=u))
  or exists(select 1 from scoped_edit_private.contexts_v1 c where c.id=any(scoped) and not exists(select 1 from public.trips t where t.id=c.trip_id and t.owner_id=u))
  or exists(select 1 from recovery_private.contexts_v1 c where c.id=any(recovery) and not exists(select 1 from public.trips t where t.id=c.trip_id and t.owner_id=u))
  or exists(select 1 from scoped_edit_private.work_v1 x where x.context_id=any(scoped) and (x.owner_id<>u or not exists(select 1 from scoped_edit_private.contexts_v1 c where c.id=x.context_id and c.owner_id=x.owner_id and c.trip_id=x.trip_id) or not exists(select 1 from public.model_budget_scopes b where b.id=x.scope_id and b.owner_id=u) or not exists(select 1 from turn_private.service_tasks st where st.id=x.task_id and st.owner_id=u) or not exists(select 1 from turn_private.work t where t.turn_id=x.turn_id and t.owner_id=u))) then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
 if cardinality(scoped)+cardinality(recovery)+cardinality(work_ids)+cardinality(cases)>10000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;
 copies:=jsonb_set(copies,'{scopedEditContexts}',to_jsonb(scoped));copies:=jsonb_set(copies,'{scopedEditWork}',to_jsonb(work_ids));copies:=jsonb_set(copies,'{recoveryContexts}',to_jsonb(recovery));
 for spec in select * from profile_data_private.sources_v1() loop
  for row_n in execute format('select to_jsonb(r) from (select * from %s where %s order by %I limit 10001 for update nowait) r',spec.relation_name,spec.predicate,spec.order_key) using u,cases,scoped,work_ids,recovery loop
   if row_n ? 'owner_id' and row_n->>'owner_id' is distinct from u::text or spec.relation_name='service_brief_private.operations' and row_n->>'actor_id' is distinct from u::text then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
   n:=n+1;if n>10000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;
   rows_n:=rows_n||jsonb_build_array(jsonb_build_object('relation',spec.relation_name,'row',row_n));
   if octet_length(rows_n::text)>1000000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;
   if spec.relation_name='service_brief_private.previews' then
    if service_brief_private.valid_sources(row_n->'sources') is not true then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
    copies:=jsonb_set(copies,'{briefPreviews}',copies->'briefPreviews'||jsonb_build_array(row_n->'id'));
   elsif spec.relation_name='service_brief_private.briefs' and row_n->>'state'='shared' then
    if service_brief_private.valid_sources(row_n->'sources') is not true then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
    copies:=jsonb_set(copies,'{sharedBriefs}',copies->'sharedBriefs'||jsonb_build_array(row_n->'case_id'));
   elsif spec.relation_name='turn_private.work' and row_n->>'state'='leased' then conflicts:=conflicts||array['ACTIVE_PROFILE_USE'];
   elsif spec.relation_name='export_private.core_jobs_v1' then
    modules:=row_n->'modules';
    if modules<>'[]' and export_private.valid_modules_v1(modules,(row_n->'policy_snapshot'->>'max_pages')::integer) is not true then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
    if exists(select 1 from jsonb_array_elements(modules) m where m->>'module'='profile' and ((m->>'pages')::integer>0 or (m->>'rows')::integer>0)) then
     copies:=jsonb_set(copies,'{coreExports}',copies->'coreExports'||jsonb_build_array(row_n->'request_id'));
     conflicts:=conflicts||array['CORE_EXPORT_COPY'];
     if row_n->>'state' in('queued','running') then conflicts:=conflicts||array['SOURCE_UNSUPPORTED'];end if;
    end if;
   elsif spec.relation_name='public.privacy_requests' and row_n->>'action'='delete' and row_n->>'status' in('requested','processing') then conflicts:=conflicts||array['OTHER_DELETE_PENDING'];end if;
  end loop;
 end loop;
 -- Sorting keeps the one public copy inventory finite and canonical.
 for spec in select key from jsonb_each(copies) loop
  copies:=jsonb_set(copies,array[spec.key],(select coalesce(jsonb_agg(value order by value),'[]') from jsonb_array_elements(copies->spec.key)));
 end loop;
 source:=jsonb_build_object('profile',to_jsonb(p),'watermark',to_jsonb(w),'rows',rows_n);
 if octet_length(source::text)>1000000 or (select sum(jsonb_array_length(value)) from jsonb_each(copies))>10000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;
 return jsonb_build_object('sourceDigest',profile_data_private.digest_v1(source::text),'copies',copies,'rows',rows_n,'profile',case when p.owner_id is null then null else profile_data_private.profile_v1(p) end,'summary',case when p.owner_id is null then case when w.profile_floor>0 then jsonb_build_object('profileRevision',w.profile_revision,'paceRevision',w.pace_revision,'profileErasureFloor',w.profile_floor,'paceErasureFloor',w.pace_floor,'paceState','revoked','presentFields','[]'::jsonb,'hasPaceRequest',false,'hasPaceUndo',false) else null end else profile_data_private.summary_v1(p,w) end,
 'conflicts',(select coalesce(jsonb_agg(to_jsonb(k) order by ord),'[]') from unnest(array['SCOPE_TOO_LARGE','ACTIVE_PROFILE_USE','CORE_EXPORT_COPY','OTHER_DELETE_PENDING','SOURCE_UNSUPPORTED']) with ordinality x(k,ord) where k=any(conflicts)));
end$function$
