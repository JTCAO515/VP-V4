-- VPJ-79: references only the existing owned Proposal authority. No Proposal
-- writer, patch, digest, confirmation intent or Trip effect is added.
alter table turn_private.result_artifacts add column proposal_id uuid
  references public.trip_proposals(id) on delete cascade;
create index result_artifacts_proposal_source_v1 on turn_private.result_artifacts(proposal_id) where proposal_id is not null;

create function turn_private.valid_proposal_reference_v1(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  return value is not null and jsonb_typeof(value)='object'
    and value ?& array['schemaVersion','proposalId','proposalRevision','actions']
    and value-'schemaVersion'-'proposalId'-'proposalRevision'-'actions'='{}'::jsonb
    and value->>'schemaVersion'='change-proposal-reference/1'
    and jsonb_typeof(value->'proposalId')='string'
    and value->>'proposalId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    and jsonb_typeof(value->'proposalRevision')='number'
    and value->>'proposalRevision' ~ '^[1-9][0-9]{0,9}$'
    and (value->>'proposalRevision')::bigint<=2147483647
    and value->'actions'='[]'::jsonb;
exception when others then return false;
end $$;
revoke all on function turn_private.valid_proposal_reference_v1(jsonb) from public,anon,authenticated,service_role;

create function turn_private.proposal_reference_current_v1(p_owner uuid,p_trip uuid,p_base integer,p_content jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare proposal public.trip_proposals%rowtype; base public.trip_version_snapshots%rowtype; target public.trip_version_snapshots%rowtype;
begin
  if not coalesce(turn_private.valid_proposal_reference_v1(p_content),false) or p_trip is null or p_base is null then return false; end if;
  select * into proposal from public.trip_proposals where id=(p_content->>'proposalId')::uuid and owner_id=p_owner;
  if not found or proposal.revision<>(p_content->>'proposalRevision')::integer
    or proposal.trip_id<>p_trip or proposal.base_trip_version<>p_base
    or proposal.status<>'pending' or proposal.expires_at<=clock_timestamp()
    or not exists(select 1 from public.trips where id=p_trip and owner_id=p_owner and head_version=p_base)
    or exists(select 1 from public.trip_archives where trip_id=p_trip)
    or exists(select 1 from privacy_private.trip_deletions where trip_id=p_trip) then return false; end if;
  select * into base from public.trip_version_snapshots where trip_id=p_trip and owner_id=p_owner and version=p_base;
  if not found then return false; end if;
  if proposal.rollback_snapshot_version is not null then
    select * into target from public.trip_version_snapshots where trip_id=p_trip and owner_id=p_owner and version=proposal.rollback_snapshot_version;
    if not found or jsonb_typeof(target.content)<>'object' or jsonb_typeof(target.content->'days')<>'array' then return false; end if;
  else
    if proposal.patch ? 'operations' and (proposal.patch->>'expectedVersion')::integer is distinct from p_base then return false; end if;
    -- Existing deterministic, read-only projection validates the canonical intent.
    -- Its result is neither saved nor returned in this artifact.
    perform public.apply_trip_content_patch(base.content,proposal.patch);
  end if;
  return true;
exception when others then return false;
end $$;
revoke all on function turn_private.proposal_reference_current_v1(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;

alter function turn_private.result_basis_state(turn_private.result_artifacts,turn_private.result_revisions)
  rename to comparison_common_basis_state;
create function turn_private.result_basis_state(a turn_private.result_artifacts,r turn_private.result_revisions)
returns jsonb language plpgsql security definer set search_path='' as $$
declare state jsonb;
begin
  state:=turn_private.comparison_common_basis_state(a,r);
  if a.proposal_id is not null then
    if not coalesce(turn_private.valid_proposal_reference_v1(r.content),false) then
      return jsonb_build_object('readable',false,'current',false);
    end if;
    if state->>'current'<>'true' or (r.content->>'proposalId')::uuid is distinct from a.proposal_id
      or not turn_private.proposal_reference_current_v1(a.owner_id,a.trip_id,r.trip_version,r.content) then
      return jsonb_build_object('readable',false,'current',false);
    end if;
  end if;
  return state;
end $$;
revoke all on function turn_private.result_basis_state(turn_private.result_artifacts,turn_private.result_revisions) from public,anon,authenticated,service_role;

create or replace function turn_private.publish_result_v1(
  p_owner_id uuid,p_artifact_id uuid,p_expected_revision integer,p_idempotency_key uuid,
  p_task_id uuid,p_goal_id uuid,p_input_message_id uuid,p_trip_id uuid,p_trip_version integer,
  p_goal_version integer,p_memory_basis jsonb,p_content jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a turn_private.result_artifacts%rowtype; r turn_private.result_revisions%rowtype;
  source turn_private.assistant_messages%rowtype; task turn_private.service_tasks%rowtype;
  trip public.trips%rowtype; linked turn_private.assistant_goal_trip_links%rowtype;
  goal turn_private.assistant_goals%rowtype; receipt turn_private.assistant_goal_trip_receipts%rowtype;
  digest text; new_revision integer; m jsonb; reference_id uuid;
begin
  if (select auth.role())<>'service_role' or p_owner_id is null or p_artifact_id is null or p_idempotency_key is null
    or p_task_id is null or p_goal_id is null or p_input_message_id is null or p_expected_revision is null
    or p_expected_revision not between 0 and 999 or p_goal_version is null or p_goal_version<1
    or (p_trip_id is null)<>(p_trip_version is null)
    or p_memory_basis is null or jsonb_typeof(p_memory_basis)<>'array' or jsonb_array_length(p_memory_basis)>20
    or not (turn_private.valid_comparison_v1(p_content) or turn_private.valid_proposal_reference_v1(p_content)) then raise exception 'INVALID_INPUT'; end if;
  if turn_private.valid_proposal_reference_v1(p_content) then
    if p_trip_id is null then raise exception 'STALE_BASIS'; end if;
    reference_id:=(p_content->>'proposalId')::uuid;
  end if;
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
    if reference_id is not null then
      -- Existing confirm/revise locks Proposal then Trip. Never wait for a
      -- Proposal lock while holding Trip: NOWAIT aborts rather than deadlocks.
      begin
        perform 1 from public.trip_proposals where id=reference_id and owner_id=p_owner_id for share nowait;
      exception when lock_not_available then raise exception 'STALE_BASIS'; end;
      if not turn_private.proposal_reference_current_v1(p_owner_id,p_trip_id,p_trip_version,p_content)
        then raise exception 'STALE_BASIS'; end if;
    end if;
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
    insert into turn_private.result_artifacts(id,owner_id,task_id,goal_id,input_message_id,trip_id,proposal_id,current_revision)
      values(p_artifact_id,p_owner_id,p_task_id,p_goal_id,p_input_message_id,p_trip_id,reference_id,1);
    new_revision:=1;
  else
    if not found or a.owner_id<>p_owner_id or a.lifecycle<>'active' or a.current_revision<>p_expected_revision
      or a.proposal_id is distinct from reference_id
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

revoke all on function turn_private.publish_result_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.publish_comparison_result_v1(
  p_owner_id uuid,p_artifact_id uuid,p_expected_revision integer,p_idempotency_key uuid,
  p_task_id uuid,p_goal_id uuid,p_input_message_id uuid,p_trip_id uuid,p_trip_version integer,
  p_goal_version integer,p_memory_basis jsonb,p_content jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(turn_private.valid_comparison_v1(p_content),false) then raise exception 'INVALID_INPUT'; end if;
  return turn_private.publish_result_v1(p_owner_id,p_artifact_id,p_expected_revision,p_idempotency_key,p_task_id,p_goal_id,p_input_message_id,p_trip_id,p_trip_version,p_goal_version,p_memory_basis,p_content);
end $$;
revoke all on function public.publish_comparison_result_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.publish_comparison_result_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb) to service_role;

create or replace function public.publish_change_proposal_reference_v1(
  p_owner_id uuid,p_artifact_id uuid,p_expected_revision integer,p_idempotency_key uuid,
  p_task_id uuid,p_goal_id uuid,p_input_message_id uuid,p_trip_id uuid,p_trip_version integer,
  p_goal_version integer,p_memory_basis jsonb,p_content jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(turn_private.valid_proposal_reference_v1(p_content),false) then raise exception 'INVALID_INPUT'; end if;
  return turn_private.publish_result_v1(p_owner_id,p_artifact_id,p_expected_revision,p_idempotency_key,p_task_id,p_goal_id,p_input_message_id,p_trip_id,p_trip_version,p_goal_version,p_memory_basis,p_content);
end $$;
revoke all on function public.publish_change_proposal_reference_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.publish_change_proposal_reference_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb) to service_role;

create or replace function public.read_result_artifacts_v1(p_artifact_id uuid default null,p_revision integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); a turn_private.result_artifacts%rowtype; r turn_private.result_revisions%rowtype; state jsonb;
begin
  if u is null or (p_revision is not null and (p_artifact_id is null or p_revision<1)) then raise exception 'INVALID_INPUT'; end if;
  if p_artifact_id is null then
    select * into a from turn_private.result_artifacts where owner_id=u and proposal_id is null order by created_at desc,id desc limit 1;
  else
    select * into a from turn_private.result_artifacts where id=p_artifact_id and owner_id=u;
  end if;
  if not found then return jsonb_build_object('kind','empty'); end if;
  if a.proposal_id is not null then return jsonb_build_object('kind','unavailable'); end if;
  if a.lifecycle='withdrawn' then return jsonb_build_object('kind','unavailable'); end if;
  select * into r from turn_private.result_revisions where artifact_id=a.id and revision=coalesce(p_revision,a.current_revision) and owner_id=u;
  if not found then return jsonb_build_object('kind','empty'); end if;
  state:=turn_private.result_basis_state(a,r);
  if state->>'readable'<>'true' then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','result_artifact','artifactId',a.id,'revision',r.revision,'currentRevision',a.current_revision,
    'current',a.lifecycle='active' and r.revision=a.current_revision and state->>'current'='true',
    'historicalReadable',true,'lifecycle',a.lifecycle,
    'source',jsonb_build_object('taskId',a.task_id,'taskTurnId',r.task_turn_id,'goalId',a.goal_id,'goalVersion',r.goal_version,
      'inputMessageId',a.input_message_id,'inputSequence',r.input_sequence,'tripId',a.trip_id,'tripVersion',r.trip_version),
    'basis',jsonb_build_object('memories',r.memory_basis,'evidence','[]'::jsonb),
    'content',r.content,'createdAt',r.created_at);
end $$;
create or replace function public.read_trip_result_reference_v1(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); a turn_private.result_artifacts%rowtype;
  r turn_private.result_revisions%rowtype; authorised jsonb; candidate record; examined integer:=0;
begin
  if p_trip_id is null then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from public.trips t where t.id=p_trip_id and t.owner_id=u)
    then return jsonb_build_object('kind','empty'); end if;
  if exists(select 1 from privacy_private.trip_deletions d where d.trip_id=p_trip_id)
    then return jsonb_build_object('kind','unavailable'); end if;
  if exists(select 1 from public.trip_archives archive where archive.trip_id=p_trip_id and archive.owner_id=u)
    then return jsonb_build_object('kind','empty'); end if;
  -- Examine at most 64 newest references. If older candidates exist beyond
  -- that bound, report unavailable rather than falsely claim an empty Trip.
  for candidate in select artifact.id as artifact_id,artifact.current_revision as revision
    from turn_private.result_artifacts artifact
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
    where artifact.proposal_id is null and artifact.trip_id=p_trip_id and artifact.owner_id=u and artifact.lifecycle='active'
    order by artifact.created_at desc,artifact.id desc limit 65 loop
    examined:=examined+1;
    if examined>64 then return jsonb_build_object('kind','unavailable'); end if;
    select * into a from turn_private.result_artifacts
      where id=candidate.artifact_id and owner_id=u and lifecycle='active';
    if not found then continue; end if;
    select * into r from turn_private.result_revisions
      where artifact_id=a.id and owner_id=u and revision=candidate.revision;
    if not found or turn_private.result_basis_state(a,r)->>'current'<>'true' then continue; end if;
    authorised:=public.read_result_artifacts_v1(a.id,r.revision);
    if authorised->>'kind'='result_artifact' and authorised->>'current'='true' then
      return jsonb_build_object('kind','result_reference','artifactId',a.id,'revision',r.revision,'tripId',p_trip_id);
    end if;
  end loop;
  return jsonb_build_object('kind','empty');
end $$;
create or replace function public.read_task_result_reference_v1(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); candidate record; authorised jsonb; examined integer:=0;
begin
  if p_task_id is null then raise exception 'INVALID_INPUT'; end if;
  for candidate in select id,current_revision from turn_private.result_artifacts
    where proposal_id is null and owner_id=u and task_id=p_task_id and lifecycle='active'
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
create or replace function public.read_change_proposal_reference_v1(p_artifact_id uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); a turn_private.result_artifacts%rowtype; r turn_private.result_revisions%rowtype; state jsonb;
begin
  if u is null or p_artifact_id is null or p_revision is null or p_revision not between 1 and 1000 then raise exception 'INVALID_INPUT'; end if;
  select * into a from turn_private.result_artifacts where id=p_artifact_id and owner_id=u and proposal_id is not null;
  if not found then return jsonb_build_object('kind','empty'); end if;
  if a.lifecycle<>'active' or a.current_revision<>p_revision then return jsonb_build_object('kind','unavailable'); end if;
  select * into r from turn_private.result_revisions where artifact_id=a.id and owner_id=u and revision=p_revision;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  state:=turn_private.result_basis_state(a,r);
  if state->>'readable'<>'true' or state->>'current'<>'true' then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','result_artifact','artifactId',a.id,'revision',r.revision,'currentRevision',a.current_revision,
    'current',a.lifecycle='active' and r.revision=a.current_revision and state->>'current'='true',
    'historicalReadable',true,'lifecycle',a.lifecycle,
    'source',jsonb_build_object('taskId',a.task_id,'taskTurnId',r.task_turn_id,'goalId',a.goal_id,'goalVersion',r.goal_version,
      'inputMessageId',a.input_message_id,'inputSequence',r.input_sequence,'tripId',a.trip_id,'tripVersion',r.trip_version),
    'basis',jsonb_build_object('memories',r.memory_basis,'evidence','[]'::jsonb),
    'content',r.content,'createdAt',r.created_at);
end $$;
revoke all on function public.read_change_proposal_reference_v1(uuid,integer) from public,anon,service_role;
grant execute on function public.read_change_proposal_reference_v1(uuid,integer) to authenticated;
notify pgrst,'reload schema';
