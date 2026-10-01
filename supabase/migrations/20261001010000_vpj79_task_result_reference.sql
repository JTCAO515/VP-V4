-- Read-only Task reference resolution. Content/eligibility remain authoritative
-- in read_result_artifacts_v1; missing or stale Tasks never use global latest.
create index result_artifacts_owner_task_created_v1
  on turn_private.result_artifacts(owner_id,task_id,created_at desc,id desc);

create function public.read_task_result_reference_v1(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); candidate record; authorised jsonb; examined integer:=0;
begin
  if p_task_id is null then raise exception 'INVALID_INPUT'; end if;
  for candidate in select id,current_revision from turn_private.result_artifacts
    where owner_id=u and task_id=p_task_id and lifecycle='active'
    order by created_at desc,id desc limit 65 loop
    examined:=examined+1;
    if examined>64 then return jsonb_build_object('kind','unavailable'); end if;
    authorised:=public.read_result_artifacts_v1(candidate.id,candidate.current_revision);
    if authorised->>'kind'='result_artifact' and authorised->>'current'='true'
      and authorised->'source'->>'taskId'=p_task_id::text then
      return jsonb_build_object('kind','result_reference','artifactId',candidate.id,
        'revision',candidate.current_revision,'taskId',p_task_id);
    end if;
  end loop;
  return jsonb_build_object('kind','empty');
end $$;
revoke all on function public.read_task_result_reference_v1(uuid) from public,anon,service_role;
grant execute on function public.read_task_result_reference_v1(uuid) to authenticated;
notify pgrst,'reload schema';
