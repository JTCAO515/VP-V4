-- VPJ-79 first slice. A service-owned producer may publish a validated comparison
-- only for an existing task-linked input. No user-facing writer or Trip mutation.
create table turn_private.result_artifacts (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  goal_id uuid not null references turn_private.assistant_goals(id) on delete cascade,
  input_message_id uuid not null references turn_private.assistant_messages(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  current_revision integer not null check(current_revision between 1 and 1000),
  lifecycle text not null default 'active' check(lifecycle in ('active','withdrawn')),
  created_at timestamptz not null default clock_timestamp()
);
create index result_artifacts_owner_created on turn_private.result_artifacts(owner_id,created_at desc,id);
create index result_artifacts_trip on turn_private.result_artifacts(trip_id) where trip_id is not null;

create table turn_private.result_revisions (
  artifact_id uuid not null references turn_private.result_artifacts(id) on delete cascade,
  revision integer not null check(revision between 1 and 1000),
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
  input_sequence bigint not null check(input_sequence > 0),
  task_turn_id uuid not null references turn_private.text_content(turn_id),
  goal_version integer not null check(goal_version > 0),
  trip_version integer check(trip_version >= 0),
  memory_basis jsonb not null check(jsonb_typeof(memory_basis)='array' and jsonb_array_length(memory_basis)<=20),
  content jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(artifact_id,revision),
  unique(owner_id,idempotency_key)
);
create index result_revisions_owner_artifact on turn_private.result_revisions(owner_id,artifact_id,revision desc);

create table turn_private.result_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references turn_private.result_artifacts(id) on delete cascade,
  revision integer not null,
  event_type text not null check(event_type in ('ready','revised','withdrawn')),
  created_at timestamptz not null default clock_timestamp(),
  unique(artifact_id,revision,event_type)
);
create index result_events_owner_id on turn_private.result_events(owner_id,id);

alter table turn_private.result_artifacts enable row level security;
alter table turn_private.result_revisions enable row level security;
alter table turn_private.result_events enable row level security;
revoke all on turn_private.result_artifacts,turn_private.result_revisions,turn_private.result_events from public,anon,authenticated,service_role;

-- Revisions never change. Parent/account/Trip deletion cascades remain possible.
create function turn_private.reject_result_revision_update() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_RESULT_REVISION'; end $$;
create trigger immutable_result_revision before update on turn_private.result_revisions
for each row execute function turn_private.reject_result_revision_update();
revoke all on function turn_private.reject_result_revision_update() from public,anon,authenticated,service_role;

create function turn_private.valid_comparison_v1(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare option jsonb; ids text[]:=array[]::text[];
begin
  if value is null then return false; end if;
  if jsonb_typeof(value)<>'object' or not (value ?& array['schemaVersion','title','summary','options','actions'])
    or value-'schemaVersion'-'title'-'summary'-'options'-'actions'<>'{}'::jsonb
    or value->>'schemaVersion'<>'comparison/1'
    or jsonb_typeof(value->'title')<>'string' or jsonb_typeof(value->'summary')<>'string'
    or pg_catalog.length(pg_catalog.btrim(value->>'title')) not between 1 and 120
    or pg_catalog.length(pg_catalog.btrim(value->>'summary')) not between 1 and 1000
    or jsonb_typeof(value->'options')<>'array' or jsonb_array_length(value->'options') not between 2 and 4
    or jsonb_typeof(value->'actions')<>'array' or value->'actions'<>'[]'::jsonb then return false; end if;
  for option in select x from jsonb_array_elements(value->'options') x loop
    if jsonb_typeof(option)<>'object' or not (option ?& array['id','title','tradeoff'])
      or option-'id'-'title'-'tradeoff'<>'{}'::jsonb
      or jsonb_typeof(option->'id')<>'string' or jsonb_typeof(option->'title')<>'string' or jsonb_typeof(option->'tradeoff')<>'string'
      or option->>'id' !~ '^[a-z0-9_-]{1,40}$' or option->>'id'=any(ids)
      or pg_catalog.length(pg_catalog.btrim(option->>'title')) not between 1 and 120
      or pg_catalog.length(pg_catalog.btrim(option->>'tradeoff')) not between 1 and 500 then return false; end if;
    ids:=pg_catalog.array_append(ids,option->>'id');
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function turn_private.valid_comparison_v1(jsonb) from public,anon,authenticated,service_role;

create function turn_private.result_basis_state(a turn_private.result_artifacts,r turn_private.result_revisions)
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
  if a.trip_id is not null and not exists(select 1 from public.trips t where t.id=a.trip_id and t.owner_id=a.owner_id and t.head_version=r.trip_version)
    then current_basis:=false; end if;
  for m in select value from jsonb_array_elements(r.memory_basis) loop
    if not exists(select 1 from public.memory_profiles p join public.memory_consents c on c.id=p.consent_id and c.owner_id=p.owner_id and c.status='granted'
      where p.id=(m->>'id')::uuid and p.owner_id=a.owner_id and p.state in ('explicit','confirmed') and p.summary is not null)
      then readable:=false; exit; end if;
    if not exists(select 1 from public.memory_profiles p where p.id=(m->>'id')::uuid and p.owner_id=a.owner_id and p.revision=(m->>'revision')::bigint)
      then current_basis:=false; end if;
  end loop;
  return jsonb_build_object('readable',readable,'current',current_basis and readable);
end $$;
revoke all on function turn_private.result_basis_state(turn_private.result_artifacts,turn_private.result_revisions) from public,anon,authenticated,service_role;

create function public.publish_comparison_result_v1(
  p_owner_id uuid,p_artifact_id uuid,p_expected_revision integer,p_idempotency_key uuid,
  p_task_id uuid,p_goal_id uuid,p_input_message_id uuid,p_trip_id uuid,p_trip_version integer,
  p_goal_version integer,p_memory_basis jsonb,p_content jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a turn_private.result_artifacts%rowtype; r turn_private.result_revisions%rowtype;
  source turn_private.assistant_messages%rowtype; task turn_private.service_tasks%rowtype;
  digest text; new_revision integer; m jsonb;
begin
  if (select auth.role())<>'service_role' or p_owner_id is null or p_artifact_id is null or p_idempotency_key is null
    or p_task_id is null or p_goal_id is null or p_input_message_id is null or p_expected_revision is null
    or p_expected_revision not between 0 and 999 or p_goal_version is null or p_goal_version<1
    -- #559 has no trusted task/goal-to-Trip membership yet.
    or p_trip_id is not null or p_trip_version is not null
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
  select * into source from turn_private.assistant_messages where id=p_input_message_id and owner_id=p_owner_id and goal_id=p_goal_id and task_id=p_task_id;
  if not found or source.scope_version<>p_goal_version then raise exception 'STALE_BASIS'; end if;
  select * into task from turn_private.service_tasks where id=p_task_id and owner_id=p_owner_id for share;
  if not found or not turn_private.text_policy_current(task.policy_id)
    or not exists(select 1 from turn_private.text_consents c where c.owner_id=p_owner_id and c.policy_id=task.policy_id and c.consent_id=task.consent_id and c.revoked_at is null)
    or not exists(select 1 from turn_private.text_content root where root.turn_id=task.goal_turn_id and root.owner_id=p_owner_id and root.hidden_at is null)
    or not exists(select 1 from public.turns t join turn_private.text_content c on c.turn_id=t.id and c.owner_id=p_owner_id and c.hidden_at is null
      where t.id=task.last_turn_id and t.owner_id=p_owner_id and t.status='completed' and c.output_kind='answered' for share)
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
  insert into turn_private.result_revisions(artifact_id,revision,owner_id,idempotency_key,request_digest,input_sequence,task_turn_id,goal_version,trip_version,memory_basis,content)
    values(p_artifact_id,new_revision,p_owner_id,p_idempotency_key,digest,source.sequence,task.last_turn_id,p_goal_version,p_trip_version,p_memory_basis,p_content);
  insert into turn_private.result_events(owner_id,artifact_id,revision,event_type)
    values(p_owner_id,p_artifact_id,new_revision,case when new_revision=1 then 'ready' else 'revised' end);
  return jsonb_build_object('kind','published','artifactId',p_artifact_id,'revision',new_revision,'reused',false);
end $$;
revoke all on function public.publish_comparison_result_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.publish_comparison_result_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb) to service_role;

create function public.withdraw_result_artifact_v1(p_owner_id uuid,p_artifact_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a turn_private.result_artifacts%rowtype;
begin
  if (select auth.role())<>'service_role' or p_owner_id is null or p_artifact_id is null or p_expected_revision is null or p_expected_revision<1
    then raise exception 'INVALID_INPUT'; end if;
  select * into a from turn_private.result_artifacts where id=p_artifact_id and owner_id=p_owner_id for update;
  if not found or a.current_revision<>p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
  if a.lifecycle='withdrawn' then return jsonb_build_object('kind','withdrawn','artifactId',a.id,'revision',a.current_revision,'reused',true); end if;
  update turn_private.result_artifacts set lifecycle='withdrawn' where id=a.id;
  insert into turn_private.result_events(owner_id,artifact_id,revision,event_type)
    values(p_owner_id,a.id,a.current_revision,'withdrawn');
  return jsonb_build_object('kind','withdrawn','artifactId',a.id,'revision',a.current_revision,'reused',false);
end $$;
revoke all on function public.withdraw_result_artifact_v1(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.withdraw_result_artifact_v1(uuid,uuid,integer) to service_role;

-- Content-free durable cursor for a later delivery worker. Delivery itself is not activated.
create function public.read_result_events_v1(p_after_id bigint,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare events jsonb;
begin
  if (select auth.role())<>'service_role' or p_after_id is null or p_after_id<0 or p_limit not between 1 and 100
    then raise exception 'INVALID_INPUT'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'ownerId',x.owner_id,'artifactId',x.artifact_id,
    'revision',x.revision,'type',x.event_type) order by x.id),'[]'::jsonb) into events
  from (select id,owner_id,artifact_id,revision,event_type from turn_private.result_events
    where id>p_after_id order by id limit p_limit) x;
  return jsonb_build_object('kind','result_events','events',events);
end $$;
revoke all on function public.read_result_events_v1(bigint,integer) from public,anon,authenticated;
grant execute on function public.read_result_events_v1(bigint,integer) to service_role;

create function public.read_result_artifacts_v1(p_artifact_id uuid default null,p_revision integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); a turn_private.result_artifacts%rowtype; r turn_private.result_revisions%rowtype; state jsonb;
begin
  if u is null or (p_revision is not null and (p_artifact_id is null or p_revision<1)) then raise exception 'INVALID_INPUT'; end if;
  if p_artifact_id is null then
    select * into a from turn_private.result_artifacts where owner_id=u order by created_at desc,id desc limit 1;
  else
    select * into a from turn_private.result_artifacts where id=p_artifact_id and owner_id=u;
  end if;
  if not found then return jsonb_build_object('kind','empty'); end if;
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
revoke all on function public.read_result_artifacts_v1(uuid,integer) from public,anon,service_role;
grant execute on function public.read_result_artifacts_v1(uuid,integer) to authenticated;
notify pgrst, 'reload schema';
