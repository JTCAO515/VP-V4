-- VPJ-79 second slice: exact, user-confirmed goal-to-Trip result basis.
-- 030000 remains applied and unchanged; null-Trip publication keeps its wire and behavior.
alter table turn_private.result_revisions
  add column trip_link_operation_id uuid,
  add column trip_link_version integer check(trip_link_version between 1 and 10001),
  add constraint result_trip_link_basis_v1 check (
    (trip_version is null and trip_link_operation_id is null and trip_link_version is null)
    or (trip_version is not null and trip_link_operation_id is not null and trip_link_version is not null)
  );

create or replace function turn_private.result_basis_state(a turn_private.result_artifacts,r turn_private.result_revisions)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb; current_basis boolean:=true; readable boolean:=true; goal turn_private.assistant_goals%rowtype;
  source turn_private.assistant_messages%rowtype; task turn_private.service_tasks%rowtype;
begin
  select * into source from turn_private.assistant_messages where id=a.input_message_id and owner_id=a.owner_id;
  select * into goal from turn_private.assistant_goals where id=a.goal_id and owner_id=a.owner_id;
  select * into task from turn_private.service_tasks where id=a.task_id and owner_id=a.owner_id;
  if source.id is null or goal.id is null or task.id is null or source.goal_id<>a.goal_id or source.task_id<>a.task_id
    or source.sequence<>r.input_sequence or goal.conversation_id<>source.conversation_id
    or not turn_private.text_policy_current(source.policy_id)
    or not exists(select 1 from turn_private.text_consents c where c.owner_id=a.owner_id and c.policy_id=source.policy_id and c.consent_id=source.consent_id and c.revoked_at is null)
    or not turn_private.text_policy_current(task.policy_id)
    or not exists(select 1 from turn_private.text_consents c where c.owner_id=a.owner_id and c.policy_id=task.policy_id and c.consent_id=task.consent_id and c.revoked_at is null)
    or not exists(select 1 from turn_private.text_content root where root.turn_id=task.goal_turn_id and root.owner_id=a.owner_id and root.hidden_at is null)
    or not exists(select 1 from turn_private.text_content basis_turn where basis_turn.turn_id=r.task_turn_id and basis_turn.owner_id=a.owner_id and basis_turn.hidden_at is null)
    then return jsonb_build_object('readable',false,'current',false); end if;
  if goal.scope_version<>r.goal_version or task.last_turn_id<>r.task_turn_id
    or not exists(select 1 from public.turns t join turn_private.text_content c on c.turn_id=t.id and c.owner_id=a.owner_id and c.hidden_at is null
      where t.id=r.task_turn_id and t.owner_id=a.owner_id and t.status='completed' and c.output_kind='answered')
    then current_basis:=false; end if;
  if a.trip_id is not null then
    -- A removed receipt or queued deletion removes historical read eligibility.
    if r.trip_link_operation_id is null or r.trip_link_version is null
      or not exists(select 1 from turn_private.assistant_goal_trip_receipts receipt
        where receipt.operation_id=r.trip_link_operation_id and receipt.owner_id=a.owner_id
          and receipt.goal_id=a.goal_id and receipt.conversation_id=source.conversation_id
          and receipt.trip_id=a.trip_id and receipt.trip_head_version=r.trip_version
          and receipt.after_link_version=r.trip_link_version and receipt.after_goal_scope_version=r.goal_version
          and receipt.action='link' and receipt.source_kind='native_user_confirmed')
      or not exists(select 1 from public.trips t where t.id=a.trip_id and t.owner_id=a.owner_id)
      or exists(select 1 from privacy_private.trip_deletions d where d.trip_id=a.trip_id)
      then return jsonb_build_object('readable',false,'current',false); end if;
    if not exists(select 1 from public.trips t where t.id=a.trip_id and t.owner_id=a.owner_id and t.head_version=r.trip_version)
      or exists(select 1 from public.trip_archives archive where archive.trip_id=a.trip_id and archive.owner_id=a.owner_id)
      or not exists(select 1 from turn_private.assistant_goal_trip_links link
        where link.goal_id=a.goal_id and link.owner_id=a.owner_id and link.conversation_id=source.conversation_id
          and link.trip_id=a.trip_id and link.trip_head_version=r.trip_version
          and link.operation_id=r.trip_link_operation_id and link.link_version=r.trip_link_version
          and link.goal_scope_version=r.goal_version and link.source_kind='native_user_confirmed'
          and not link.terminal_unlinked)
      then current_basis:=false; end if;
  end if;
  for m in select value from jsonb_array_elements(r.memory_basis) loop
    if not exists(select 1 from public.memory_profiles p join public.memory_consents c on c.id=p.consent_id and c.owner_id=p.owner_id and c.status='granted'
      where p.id=(m->>'id')::uuid and p.owner_id=a.owner_id and p.state in ('explicit','confirmed') and p.summary is not null)
      then readable:=false; exit; end if;
    if not exists(select 1 from public.memory_profiles p where p.id=(m->>'id')::uuid and p.owner_id=a.owner_id and p.revision=(m->>'revision')::bigint)
      then current_basis:=false; end if;
  end loop;
  return jsonb_build_object('readable',readable,'current',current_basis and readable);
end $$;

-- A Trip surface receives only an exact reference. Its subsequent content GET
-- uses the ordinary owner-scoped result reader, never a second body copy.
create function public.read_trip_result_reference_v1(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); a turn_private.result_artifacts%rowtype;
  r turn_private.result_revisions%rowtype; authorised jsonb;
begin
  if p_trip_id is null then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from public.trips t where t.id=p_trip_id and t.owner_id=u)
    then return jsonb_build_object('kind','empty'); end if;
  if exists(select 1 from privacy_private.trip_deletions d where d.trip_id=p_trip_id)
    then return jsonb_build_object('kind','unavailable'); end if;
  if exists(select 1 from public.trip_archives archive where archive.trip_id=p_trip_id and archive.owner_id=u)
    then return jsonb_build_object('kind','empty'); end if;
  select artifact.* into a from turn_private.result_artifacts artifact
    join turn_private.result_revisions revision on revision.artifact_id=artifact.id
      and revision.revision=artifact.current_revision and revision.owner_id=u
    join turn_private.assistant_goal_trip_links link on link.goal_id=artifact.goal_id
      and link.owner_id=u and link.trip_id=p_trip_id and link.trip_head_version=revision.trip_version
      and link.operation_id=revision.trip_link_operation_id and link.link_version=revision.trip_link_version
      and link.goal_scope_version=revision.goal_version and link.source_kind='native_user_confirmed'
      and not link.terminal_unlinked
    join turn_private.assistant_goals goal on goal.id=artifact.goal_id and goal.owner_id=u
      and goal.scope_version=revision.goal_version
    join public.trips trip on trip.id=p_trip_id and trip.owner_id=u and trip.head_version=revision.trip_version
    where artifact.trip_id=p_trip_id and artifact.owner_id=u and artifact.lifecycle='active'
    order by artifact.created_at desc,artifact.id desc limit 1;
  if a.id is null then return jsonb_build_object('kind','empty'); end if;
  select * into r from turn_private.result_revisions
    where artifact_id=a.id and owner_id=u and revision=a.current_revision;
  if not found then return jsonb_build_object('kind','empty'); end if;
  authorised:=public.read_result_artifacts_v1(a.id,r.revision);
  if authorised->>'kind'='unavailable' then return jsonb_build_object('kind','unavailable'); end if;
  if authorised->>'kind'<>'result_artifact' or authorised->>'current'<>'true'
    then return jsonb_build_object('kind','empty'); end if;
  return jsonb_build_object('kind','result_reference','artifactId',a.id,'revision',r.revision,'tripId',p_trip_id);
end $$;
revoke all on function public.read_trip_result_reference_v1(uuid) from public,anon,service_role;
grant execute on function public.read_trip_result_reference_v1(uuid) to authenticated;
notify pgrst, 'reload schema';

create or replace function public.publish_comparison_result_v1(
  p_owner_id uuid,p_artifact_id uuid,p_expected_revision integer,p_idempotency_key uuid,
  p_task_id uuid,p_goal_id uuid,p_input_message_id uuid,p_trip_id uuid,p_trip_version integer,
  p_goal_version integer,p_memory_basis jsonb,p_content jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a turn_private.result_artifacts%rowtype; r turn_private.result_revisions%rowtype;
  source turn_private.assistant_messages%rowtype; task turn_private.service_tasks%rowtype;
  trip public.trips%rowtype; linked turn_private.assistant_goal_trip_links%rowtype;
  goal turn_private.assistant_goals%rowtype; receipt turn_private.assistant_goal_trip_receipts%rowtype;
  digest text; new_revision integer; m jsonb;
begin
  if (select auth.role())<>'service_role' or p_owner_id is null or p_artifact_id is null or p_idempotency_key is null
    or p_task_id is null or p_goal_id is null or p_input_message_id is null or p_expected_revision is null
    or p_expected_revision not between 0 and 999 or p_goal_version is null or p_goal_version<1
    or (p_trip_id is null)<>(p_trip_version is null)
    or p_memory_basis is null or jsonb_typeof(p_memory_basis)<>'array' or jsonb_array_length(p_memory_basis)>20
    or not turn_private.valid_comparison_v1(p_content) then raise exception 'INVALID_INPUT'; end if;
  for m in select value from jsonb_array_elements(p_memory_basis) loop
    if jsonb_typeof(m)<>'object' or m-'id'-'revision'<>'{}'::jsonb
      or (m->>'id') is null or (m->>'revision') !~ '^[1-9][0-9]{0,14}$'
      then raise exception 'INVALID_INPUT'; end if;
    if not exists(select 1 from public.memory_profiles p join public.memory_consents c on c.id=p.consent_id and c.owner_id=p.owner_id and c.status='granted'
      where p.id=(m->>'id')::uuid and p.owner_id=p_owner_id and p.revision=(m->>'revision')::bigint and p.state in ('explicit','confirmed') and p.summary is not null)
      then raise exception 'STALE_BASIS'; end if;
  end loop;
  digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_owner_id,p_artifact_id,p_expected_revision,p_task_id,p_goal_id,p_input_message_id,p_trip_id,p_trip_version,p_goal_version,p_memory_basis,p_content)::text,'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('result-idempotency:'||p_owner_id||':'||p_idempotency_key,0));
  select * into r from turn_private.result_revisions where owner_id=p_owner_id and idempotency_key=p_idempotency_key;
  if found then
    if r.request_digest<>digest or r.artifact_id<>p_artifact_id then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    return jsonb_build_object('kind','published','artifactId',r.artifact_id,'revision',r.revision,'reused',true);
  end if;
  if p_trip_id is not null then
    -- Match #572's Trip -> link -> goal lock order. Neither retarget nor
    -- deletion can invalidate this basis before the revision/event commit.
    select * into trip from public.trips where id=p_trip_id and owner_id=p_owner_id for share;
    if not found or trip.head_version<>p_trip_version
      or exists(select 1 from public.trip_archives archive where archive.trip_id=p_trip_id and archive.owner_id=p_owner_id)
      or exists(select 1 from privacy_private.trip_deletions d where d.trip_id=p_trip_id)
      then raise exception 'STALE_BASIS'; end if;
    select * into linked from turn_private.assistant_goal_trip_links
      where goal_id=p_goal_id and owner_id=p_owner_id for share;
    if not found or linked.trip_id<>p_trip_id or linked.trip_head_version<>p_trip_version
      or linked.goal_scope_version<>p_goal_version or linked.source_kind<>'native_user_confirmed'
      or linked.terminal_unlinked then raise exception 'STALE_BASIS'; end if;
    select * into goal from turn_private.assistant_goals
      where id=p_goal_id and owner_id=p_owner_id and conversation_id=linked.conversation_id for share;
    if not found or goal.scope_version<>p_goal_version or goal.trip_terminal then raise exception 'STALE_BASIS'; end if;
    select * into receipt from turn_private.assistant_goal_trip_receipts
      where operation_id=linked.operation_id and owner_id=p_owner_id for share;
    if not found or receipt.action<>'link' or receipt.source_kind<>'native_user_confirmed'
      or receipt.goal_id<>p_goal_id or receipt.conversation_id<>linked.conversation_id
      or receipt.trip_id<>p_trip_id or receipt.trip_head_version<>p_trip_version
      or receipt.after_link_version<>linked.link_version or receipt.after_goal_scope_version<>p_goal_version
      or receipt.source_message_id is distinct from linked.source_message_id
      then raise exception 'STALE_BASIS'; end if;
  end if;
  select * into source from turn_private.assistant_messages where id=p_input_message_id and owner_id=p_owner_id and goal_id=p_goal_id and task_id=p_task_id;
  if not found or source.scope_version<>p_goal_version then raise exception 'STALE_BASIS'; end if;
  select * into task from turn_private.service_tasks where id=p_task_id and owner_id=p_owner_id for share;
  if not found or not turn_private.text_policy_current(task.policy_id)
    or not exists(select 1 from turn_private.text_consents c where c.owner_id=p_owner_id and c.policy_id=task.policy_id and c.consent_id=task.consent_id and c.revoked_at is null)
    or not exists(select 1 from turn_private.text_content root where root.turn_id=task.goal_turn_id and root.owner_id=p_owner_id and root.hidden_at is null)
    or not exists(select 1 from public.turns t join turn_private.text_content c on c.turn_id=t.id and c.owner_id=p_owner_id and c.hidden_at is null
      where t.id=task.last_turn_id and t.owner_id=p_owner_id and t.status='completed' and c.output_kind='answered' for share)
    then raise exception 'STALE_BASIS'; end if;
  if p_trip_id is not null and (source.conversation_id<>linked.conversation_id
    or source.created_at<=receipt.created_at or task.created_at<=receipt.created_at)
    then raise exception 'STALE_BASIS'; end if;
  if not exists(select 1 from turn_private.assistant_goals g where g.id=p_goal_id and g.owner_id=p_owner_id and g.conversation_id=source.conversation_id and g.scope_version=p_goal_version)
    or not turn_private.text_policy_current(source.policy_id)
    or not exists(select 1 from turn_private.text_consents c where c.owner_id=p_owner_id and c.policy_id=source.policy_id and c.consent_id=source.consent_id and c.revoked_at is null)
    then raise exception 'STALE_BASIS'; end if;
  select * into a from turn_private.result_artifacts where id=p_artifact_id for update;
  if p_expected_revision=0 then
    if found then raise exception 'REVISION_CONFLICT'; end if;
    insert into turn_private.result_artifacts(id,owner_id,task_id,goal_id,input_message_id,trip_id,current_revision)
      values(p_artifact_id,p_owner_id,p_task_id,p_goal_id,p_input_message_id,p_trip_id,1);
    new_revision:=1;
  else
    if not found or a.owner_id<>p_owner_id or a.lifecycle<>'active' or a.current_revision<>p_expected_revision
      or a.task_id<>p_task_id or a.goal_id<>p_goal_id or a.input_message_id<>p_input_message_id or a.trip_id is distinct from p_trip_id
      then raise exception 'REVISION_CONFLICT'; end if;
    new_revision:=a.current_revision+1;
    update turn_private.result_artifacts set current_revision=new_revision where id=p_artifact_id;
  end if;
  insert into turn_private.result_revisions(artifact_id,revision,owner_id,idempotency_key,request_digest,input_sequence,task_turn_id,goal_version,trip_version,trip_link_operation_id,trip_link_version,memory_basis,content)
    values(p_artifact_id,new_revision,p_owner_id,p_idempotency_key,digest,source.sequence,task.last_turn_id,p_goal_version,p_trip_version,
      case when p_trip_id is null then null else linked.operation_id end,
      case when p_trip_id is null then null else linked.link_version end,p_memory_basis,p_content);
  insert into turn_private.result_events(owner_id,artifact_id,revision,event_type)
    values(p_owner_id,p_artifact_id,new_revision,case when new_revision=1 then 'ready' else 'revised' end);
  return jsonb_build_object('kind','published','artifactId',p_artifact_id,'revision',new_revision,'reused',false);
end $$;
