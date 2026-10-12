create function public.submit_planning_comparison_v1(
  p_conversation_id uuid,p_goal_id uuid,p_expected_goal_version integer,p_parent_message_id uuid,
  p_message_id uuid,p_message_key uuid,p_thread_id uuid,p_turn_id uuid,p_task_id uuid,p_task_key uuid,
  p_text_policy_id uuid,p_planning_policy_id uuid,p_locale text,p_text text,p_memory_basis jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); p turn_private.planning_policies%rowtype;
  c turn_private.planning_consents%rowtype; admitted jsonb; linked jsonb; prior turn_private.planning_comparisons%rowtype;
  m jsonb; ids text[]:=array[]::text[];
begin
  if p_conversation_id is null or p_goal_id is null or p_expected_goal_version is null or p_expected_goal_version<1
    or p_parent_message_id is null or p_message_id is null or p_message_key is null
    or p_thread_id is null or p_turn_id is null or p_task_id is null or p_task_key is null
    or p_text_policy_id is null or p_planning_policy_id is null or p_locale not in ('zh','en')
    or not turn_private.valid_text(p_text,4000) or p_memory_basis is null or jsonb_typeof(p_memory_basis)<>'array'
    or jsonb_array_length(p_memory_basis)>3 then raise exception 'INVALID_INPUT'; end if;
  select * into p from turn_private.planning_policies where id=p_planning_policy_id and text_policy_id=p_text_policy_id;
  if not found or not turn_private.planning_policy_current(p.id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into c from turn_private.planning_consents where owner_id=u and policy_id=p.id and revoked_at is null for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  for m in select value from jsonb_array_elements(p_memory_basis) loop
    if jsonb_typeof(m)<>'object' or m-'id'-'revision'<>'{}'::jsonb or (m->>'id') is null
      or (m->>'revision') !~ '^[1-9][0-9]{0,14}$' or m->>'id'=any(ids) then raise exception 'INVALID_INPUT'; end if;
    if not exists(select 1 from public.memory_profiles x join public.memory_consents y on y.id=x.consent_id and y.owner_id=u and y.status='granted'
      where x.id=(m->>'id')::uuid and x.owner_id=u and x.revision=(m->>'revision')::bigint
        and x.state in ('explicit','confirmed') and x.summary is not null) then raise exception 'STALE_BASIS'; end if;
    ids:=array_append(ids,m->>'id');
  end loop;
  admitted:=public.submit_service_task_turn(p_thread_id,p_turn_id,p_task_key,p_text_policy_id,p_locale,p_text,p_task_id,1,'new_goal',null);
  if admitted->>'kind'<>'accepted' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  linked:=public.submit_assistant_message_v1(p_conversation_id,p_message_id,p_message_key,p_text_policy_id,
    p_locale,p_text,'follow_up',p_goal_id,p_expected_goal_version,p_task_id,p_parent_message_id,null);
  if linked->>'kind'<>'accepted' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  if exists(select 1 from turn_private.assistant_goals g where g.id=p_goal_id and g.owner_id=u and g.trip_terminal)
    or exists(select 1 from turn_private.assistant_goal_trip_links l where l.goal_id=p_goal_id and l.owner_id=u
      and (l.trip_id is not null or l.terminal_unlinked)) then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  select * into prior from turn_private.planning_comparisons where turn_id=p_turn_id;
  if found then
    if prior.owner_id<>u or prior.task_id<>p_task_id or prior.message_id<>p_message_id or prior.goal_id<>p_goal_id
      or prior.goal_version<>p_expected_goal_version or prior.planning_policy_id<>p_planning_policy_id
      or prior.planning_consent_id<>c.consent_id or prior.memory_basis<>p_memory_basis
      then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    return jsonb_build_object('kind','accepted','reused',true,'taskId',prior.task_id,'turnId',prior.turn_id,'artifactId',prior.artifact_id);
  end if;
  if admitted->>'reused'='true' or linked->>'reused'='true' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  update turn_private.work set execution_mode='planning_comparison_v1' where turn_id=p_turn_id and owner_id=u and state='queued';
  if not found then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  insert into turn_private.planning_comparisons(turn_id,owner_id,task_id,goal_id,message_id,goal_version,planning_policy_id,planning_consent_id,memory_basis,artifact_id,publication_key)
    values(p_turn_id,u,p_task_id,p_goal_id,p_message_id,p_expected_goal_version,p.id,c.consent_id,p_memory_basis,gen_random_uuid(),gen_random_uuid());
  return jsonb_build_object('kind','accepted','reused',false,'taskId',p_task_id,'turnId',p_turn_id,
    'artifactId',(select artifact_id from turn_private.planning_comparisons where turn_id=p_turn_id));
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_INPUT';
end $$;
