-- Owner-only receipt projection. No writer, worker, provider or policy enablement.
create function public.read_assistant_task_activity_v1(p_policy_id uuid,p_conversation_id uuid,p_task_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); source turn_private.assistant_messages%rowtype;
  job turn_private.planning_comparisons%rowtype; goal turn_private.assistant_goals%rowtype;
  member jsonb; receipt record; memory jsonb; ids text[]:=array[]::text[]; basis text;
  actions jsonb:='[]'; examined integer:=0;
begin
  if p_policy_id is null or p_conversation_id is null or p_task_id is null then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','unavailable'); end if;
  perform 1 from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  perform 1 from turn_private.assistant_conversations where id=p_conversation_id and owner_id=u and policy_id=p_policy_id for share;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  select * into source from turn_private.assistant_messages
    where conversation_id=p_conversation_id and owner_id=u and task_id=p_task_id order by sequence desc limit 1;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  member:=turn_private.assistant_task_member_v1(u,p_conversation_id,source.id);
  if member is null then return jsonb_build_object('kind','unavailable'); end if;
  select * into job from turn_private.planning_comparisons
    where turn_id=(member->'turn'->>'turnId')::uuid and owner_id=u and task_id=p_task_id;
  if not found or job.message_id<>source.id or job.goal_id<>source.goal_id
    or job.goal_version<>source.scope_version or not turn_private.planning_policy_current(job.planning_policy_id)
    then return jsonb_build_object('kind','unavailable'); end if;
  perform 1 from turn_private.planning_consents where owner_id=u and policy_id=job.planning_policy_id
    and consent_id=job.planning_consent_id and revoked_at is null for share;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  select * into goal from turn_private.assistant_goals where id=job.goal_id and owner_id=u and conversation_id=p_conversation_id;
  if not found or goal.scope_version<>job.goal_version or goal.trip_terminal
    or exists(select 1 from turn_private.assistant_goal_trip_links where goal_id=goal.id and owner_id=u
      and (trip_id is not null or terminal_unlinked)) then return jsonb_build_object('kind','unavailable'); end if;
  -- Same accepted Memory basis as the writer, without requiring a queued execution state.
  for memory in select value from jsonb_array_elements(job.memory_basis) loop
    if jsonb_typeof(memory)<>'object' or memory-'id'-'revision'<>'{}'::jsonb
      or memory->>'id' is null or coalesce(memory->>'revision','')!~'^[1-9][0-9]{0,14}$'
      or memory->>'id'=any(ids) then return jsonb_build_object('kind','unavailable'); end if;
    if not exists(select 1 from public.memory_profiles p join public.memory_consents c
      on c.id=p.consent_id and c.owner_id=p.owner_id and c.status='granted'
      where p.id=(memory->>'id')::uuid and p.owner_id=u and p.revision=(memory->>'revision')::bigint
        and p.state in ('explicit','confirmed') and p.summary is not null)
      then return jsonb_build_object('kind','unavailable'); end if;
    ids:=array_append(ids,memory->>'id');
  end loop;
  basis:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(source.id,source.sequence,goal.id,
    goal.scope_version,p_task_id,job.turn_id,job.memory_basis)::text,'UTF8')),'hex');
  -- Writer hard limit is four for the entire Task. Inspect at most five, fail closed on overflow.
  for receipt in select * from turn_private.planning_action_receipts where task_id=p_task_id
    order by created_at limit 5 loop
    examined:=examined+1;
    if examined>4 then return jsonb_build_object('kind','unavailable'); end if;
    if receipt.turn_id<>job.turn_id then continue; end if;
    if receipt.owner_id<>u or receipt.message_id<>source.id or receipt.memory_basis<>job.memory_basis
      or receipt.basis_digest<>basis then return jsonb_build_object('kind','unavailable'); end if;
    actions:=actions||jsonb_build_array(jsonb_build_object('tool',receipt.tool_id,'state',receipt.state));
  end loop;
  return jsonb_build_object('kind','task_activity','conversationId',p_conversation_id,'taskId',p_task_id,
    'turnId',job.turn_id,'turnStatus',member->'turn'->>'status','limit',4,
    'recording',case when jsonb_array_length(actions)=0 then 'unrecorded' else 'recorded' end,'actions',actions);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('kind','unavailable');
end $$;
revoke all on function public.read_assistant_task_activity_v1(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.read_assistant_task_activity_v1(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
