-- PRIVATE REVIEW CANDIDATE. Not a product migration or a live activation.
-- Shared source replacements/lifecycle inventory pins are packaged separately.
create schema ops_control_private;
revoke all on schema ops_control_private from public,anon,authenticated,service_role;
create table ops_control_private.root_v1(
 singleton boolean primary key default true check(singleton),
 revision bigint not null default 0 check(revision between 0 and 9007199254740990),
 recovery_boot timestamptz,recovery_database_oid oid,
 recovery_manifest text check(recovery_manifest ~ '^[a-f0-9]{64}$'),
 check((recovery_boot is null)=(recovery_manifest is null)
  and(recovery_boot is null)=(recovery_database_oid is null))
);
insert into ops_control_private.root_v1(singleton) values(true);
create table ops_control_private.controls_v1(
 kind text not null check(kind in('capability','provider','city')),key text not null,
 state text not null default 'disabled' check(state in('disabled','enabled')),
 revision bigint not null default 0 check(revision between 0 and 9007199254740990),
 stop_revision bigint not null default 0 check(stop_revision between 0 and revision),
 primary key(kind,key),
 check(kind='capability' and key in('text','planning_comparison_v1','planning_intake_comparison_v2','scoped_trip_edit_v1')
  or kind='provider' and key in('qwen','glm','deepseek','amap')
  or kind='city' and key in('shanghai','beijing','guangzhou','chongqing'))
);
-- Closed structural registration; not enabled policy, provider, or owner eligibility.
insert into ops_control_private.controls_v1(kind,key) values
 ('capability','text'),('capability','planning_comparison_v1'),
 ('capability','planning_intake_comparison_v2'),('capability','scoped_trip_edit_v1'),
 ('provider','qwen'),('provider','glm'),('provider','deepseek'),('provider','amap'),
 ('city','shanghai'),('city','beijing'),('city','guangzhou'),('city','chongqing');
create table ops_control_private.budget_fences_v1(
 scope_id uuid primary key,owner_id uuid references auth.users(id) on delete set null,
 scope_created_at timestamptz not null,
 revision bigint not null default 0 check(revision between 0 and 9007199254740990),
 stop_revision bigint not null default 0 check(stop_revision between 0 and revision),
 retired boolean not null default false,
 check(retired or owner_id is not null)
);
-- Existing generations are recorded without enabling or rewriting a ledger.
insert into ops_control_private.budget_fences_v1(scope_id,owner_id,scope_created_at)
 select id,owner_id,created_at from public.model_budget_scopes;
create index ops_control_budget_owner_v1 on ops_control_private.budget_fences_v1(owner_id);
create table ops_control_private.operations_v1(
 operation_id uuid primary key,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null check(action in('set','budget_resume')),
 input jsonb,receipt jsonb,
 revision bigint not null check(revision between 1 and 9007199254740990),
 applied_at timestamptz not null,
 retired boolean not null default false,
 check((not retired and actor_id is not null and input is not null and receipt is not null)
   or(retired and actor_id is null and input is null and receipt is null))
);
create index ops_control_actor_export_v1 on ops_control_private.operations_v1(actor_id,operation_id)
 where not retired;
alter table ops_control_private.root_v1 enable row level security;
alter table ops_control_private.controls_v1 enable row level security;
alter table ops_control_private.budget_fences_v1 enable row level security;
alter table ops_control_private.operations_v1 enable row level security;
revoke all on all tables in schema ops_control_private from public,anon,authenticated,service_role;

create function ops_control_private.exact_v1(v jsonb,k text[]) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and v-k='{}'::jsonb and v ?& k,false)
$$;
create function ops_control_private.uuid_v1(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',false)
$$;
create function ops_control_private.revision_v1(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'number' or v::text !~ '^(0|[1-9][0-9]*)$' then return false;end if;
 return(v::text)::numeric between 0 and 9007199254740990;
end
$$;
create function ops_control_private.stamp_v1(v timestamptz) returns text
language sql immutable set search_path='' as $$
 select to_char(v at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;
create function ops_control_private.recovery_ready_v1() returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if to_regprocedure('ops_control_private.installed_supported_v1()') is null then return false;end if;
 return coalesce((select recovery_boot=pg_postmaster_start_time() and recovery_manifest is not null
  and recovery_database_oid=(select oid from pg_database where datname=current_database())
  from ops_control_private.root_v1 where singleton),false) and ops_control_private.installed_supported_v1();
end
$$;
create function ops_control_private.actor_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;s uuid;e bigint;
begin
 if auth.role() is distinct from 'authenticated' or auth.jwt()->>'role' is distinct from 'authenticated'
  or auth.jwt()->>'is_anonymous' is distinct from 'false' then raise exception 'OPS_FORBIDDEN';end if;
 u:=knowledge_review_private.current_actor();s:=(auth.jwt()->>'session_id')::uuid;
 select epoch into e from identity_private.mobile_accounts where owner_id=u;
 if e is null or e<0 or e>9007199254740990 then raise exception 'OPS_UNAVAILABLE';end if;
 return jsonb_build_object('actorId',u,'sessionId',s,'sessionEpoch',e::text);
exception when invalid_text_representation then raise exception 'OPS_FORBIDDEN';
end $$;
create function ops_control_private.input_v1(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare a text;
begin
 if v->>'schemaVersion' is distinct from 'ops-control/1' then return false;end if;a:=v->>'action';
 if a='workspace' then return ops_control_private.exact_v1(v,array['schemaVersion','action']);end if;
 if a='receipt' then return ops_control_private.exact_v1(v,array['schemaVersion','action','operationId'])
  and ops_control_private.uuid_v1(v->'operationId');end if;
 if a='budget_read' then return ops_control_private.exact_v1(v,array['schemaVersion','action','scopeId'])
  and ops_control_private.uuid_v1(v->'scopeId');end if;
 if a='budget_resume' then return ops_control_private.exact_v1(v,array['schemaVersion','action','operationId','scopeId','expectedRevision'])
  and ops_control_private.uuid_v1(v->'operationId') and ops_control_private.uuid_v1(v->'scopeId')
  and ops_control_private.revision_v1(v->'expectedRevision');end if;
 if a='set' then return ops_control_private.exact_v1(v,array['schemaVersion','action','operationId','expectedRevision','scope','state'])
  and ops_control_private.uuid_v1(v->'operationId') and ops_control_private.revision_v1(v->'expectedRevision')
  and ops_control_private.exact_v1(v->'scope',array['kind','key'])
  and jsonb_typeof(v->'scope'->'kind')='string' and jsonb_typeof(v->'scope'->'key')='string'
  and v->'scope'->>'kind' in('capability','provider','city') and v->>'state' in('disabled','enabled');end if;
 return false;
end $$;
create function ops_control_private.immutable_operation_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and not old.retired and new.retired and new.actor_id is null
  and new.input is null and new.receipt is null
  and to_jsonb(new)-array['actor_id','input','receipt','retired'] is not distinct from
   to_jsonb(old)-array['actor_id','input','receipt','retired'] then return new;end if;
 raise exception 'OPS_IMMUTABLE_OPERATION';
end $$;
create trigger immutable_ops_operation_v1 before update or delete on ops_control_private.operations_v1
 for each row execute function ops_control_private.immutable_operation_v1();
create function ops_control_private.erase_actor_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update ops_control_private.operations_v1 set actor_id=null,input=null,receipt=null,retired=true
  where actor_id=old.id;
 update ops_control_private.budget_fences_v1 set owner_id=null,retired=true,revision=revision+1
  where owner_id=old.id;
 return old;
end $$;
create trigger ops_control_actor_erasure_v1 before delete on auth.users
 for each row execute function ops_control_private.erase_actor_v1();
create function ops_control_private.budget_source_changed_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare sid uuid;s public.model_budget_scopes%rowtype;stopped boolean:=false;old_n jsonb;new_n jsonb;
begin
 old_n:=to_jsonb(old);new_n:=to_jsonb(new);
 sid:=case when tg_table_name='model_budget_scopes' then
  case when tg_op='DELETE' then(old_n->>'id')::uuid else(new_n->>'id')::uuid end
  else case when tg_op='DELETE' then(old_n->>'scope_id')::uuid else(new_n->>'scope_id')::uuid end end;
 if tg_table_name='model_budget_scopes' and tg_op='DELETE' then
  update ops_control_private.budget_fences_v1 set retired=true,owner_id=null,revision=revision+1
   where scope_id=sid;
  update ops_control_private.operations_v1 set retired=true,actor_id=null,input=null,receipt=null
   where not retired and action='budget_resume' and input->>'scopeId'=sid::text;
  return old;
 end if;
 select * into s from public.model_budget_scopes where id=sid for update nowait;
 if not found then raise exception 'OPS_UNAVAILABLE';end if;
 insert into ops_control_private.budget_fences_v1(scope_id,owner_id,scope_created_at)
  values(s.id,s.owner_id,s.created_at) on conflict do nothing;
 perform 1 from ops_control_private.budget_fences_v1 where scope_id=s.id and not retired
  and owner_id=s.owner_id and scope_created_at=s.created_at for update nowait;
 if not found then
  -- Fence retirement denies fresh sending/resume, never the original exact known
  -- settlement of an already-dispatched hold. No identity or generation is revived.
  if tg_table_name='model_budget_attempts' and tg_op='UPDATE'
   and(old_n->>'status' in('dispatched','pending') and new_n->>'status'='settled' and new_n->>'actual_micros' is not null
    or old_n->>'status'='dispatched' and new_n->>'status'='pending' and new_n->>'actual_micros' is null
    or old_n->>'status'='reserved' and new_n->>'status'='released' and new_n->>'actual_micros' is null)
   and to_jsonb(new)-array['status','actual_micros','updated_at'] is not distinct from
    to_jsonb(old)-array['status','actual_micros','updated_at'] then
   update ops_control_private.budget_fences_v1 set revision=revision+1 where scope_id=sid;
   return new;
  end if;
  if tg_table_name='model_budget_scopes' and tg_op='UPDATE' and not(old_n->>'frozen')::boolean and(new_n->>'frozen')::boolean
   and to_jsonb(new)-'frozen' is not distinct from to_jsonb(old)-'frozen' then
   update ops_control_private.budget_fences_v1 set revision=revision+1,stop_revision=revision+1 where scope_id=sid;
   return new;
  end if;
  if tg_table_name='model_budget_scopes' and tg_op='UPDATE' and(old_n->>'enabled')::boolean and not(new_n->>'enabled')::boolean
   and to_jsonb(new)-'enabled' is not distinct from to_jsonb(old)-'enabled' then
   update ops_control_private.budget_fences_v1 set revision=revision+1,stop_revision=revision+1 where scope_id=sid;
   return new;
  end if;
  raise exception 'OPS_UNAVAILABLE';
 end if;
 if tg_table_name='model_budget_scopes' and tg_op='UPDATE' then
  if to_jsonb(new) is not distinct from to_jsonb(old) then return new;end if;
  stopped:=((old_n->>'enabled')::boolean and not(new_n->>'enabled')::boolean)
   or(not(old_n->>'frozen')::boolean and(new_n->>'frozen')::boolean);
 end if;
 update ops_control_private.budget_fences_v1 set revision=revision+1,
  stop_revision=case when stopped then revision+1 else stop_revision end where scope_id=sid;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
-- AFTER avoids reading an old copy during INSERT; scope DELETE retirement is BEFORE.
create trigger ops_control_scope_version_v1 after insert or update on public.model_budget_scopes
 for each row execute function ops_control_private.budget_source_changed_v1();
create trigger ops_control_scope_retire_v1 before delete on public.model_budget_scopes
 for each row execute function ops_control_private.budget_source_changed_v1();
create trigger ops_control_tariff_version_v1 after insert or update or delete on public.model_budget_provider_limits
 for each row execute function ops_control_private.budget_source_changed_v1();
create trigger ops_control_attempt_version_v1 after insert or update or delete on public.model_budget_attempts
 for each row execute function ops_control_private.budget_source_changed_v1();
create function ops_control_private.repeated_budget_stop_v1(sid uuid,uid uuid,was_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Original stop holds scope UPDATE. First true->false transition is already observed
 -- by the source trigger; repeated explicit stop still advances the monotonic marker.
 if was_enabled is false then
  update ops_control_private.budget_fences_v1 f set revision=revision+1,stop_revision=revision+1
   where scope_id=sid and(owner_id=uid or retired and owner_id is null)
   and exists(select 1 from public.model_budget_scopes s where s.id=sid and s.owner_id=uid
    and s.created_at=f.scope_created_at and not s.enabled);
  -- A generation already retired remains closed even if there is no further
  -- writable marker. Do not make original stopping/settlement fail to open it.
 end if;
end $$;

create function ops_control_private.budget_state_v1(sid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.model_budget_scopes%rowtype;f ops_control_private.budget_fences_v1%rowtype;
 total_n numeric;pending_n bigint;active_n bigint;eligibility_n text;
begin
 select * into s from public.model_budget_scopes where id=sid for update nowait;
 if not found then raise exception 'OPS_UNAVAILABLE';end if;
 select * into f from ops_control_private.budget_fences_v1 where scope_id=sid for update nowait;
 if not found then raise exception 'OPS_UNAVAILABLE';end if;
 select coalesce(sum(case when status='settled' then actual_micros when status='released' then 0 else reserved_micros end),0),
  count(*) filter(where status in('dispatched','pending')),count(*) filter(where status in('reserved','dispatched','pending'))
  into total_n,pending_n,active_n from public.model_budget_attempts where scope_id=sid;
 eligibility_n:=case
  when f.retired or f.owner_id is distinct from s.owner_id or f.scope_created_at is distinct from s.created_at then 'retired'
  when not ops_control_private.recovery_ready_v1() then 'recovery_unavailable'
  when s.enabled and not s.frozen then 'not_stopped'
  when s.expires_at<=clock_timestamp() then 'expired'
  when pending_n>0 then 'unresolved'
  when total_n>=s.limit_micros or active_n>=s.concurrency_limit
   or exists(select 1 from public.model_budget_attempts a where a.scope_id=sid group by a.task_id
    having sum(case when status='settled' then actual_micros when status='released' then 0 else reserved_micros end)>s.task_limit_micros
     or count(*)>s.task_attempt_limit) then 'exhausted'
  when not exists(select 1 from public.model_budget_provider_limits where scope_id=sid and enabled)
   or exists(select 1 from public.model_budget_attempts a left join public.model_budget_provider_limits p
    on p.scope_id=a.scope_id and p.provider=a.provider where a.scope_id=sid and a.status<>'released'
    and(p.scope_id is null or not p.enabled or p.model<>a.model or p.price_version<>a.price_version)) then 'provider_unavailable'
  when exists(select 1 from public.model_budget_provider_limits p where p.scope_id=sid and
   coalesce((select sum(case when a.status='settled' then a.actual_micros when a.status='released' then 0 else a.reserved_micros end)
    from public.model_budget_attempts a where a.scope_id=sid and a.provider=p.provider),0)>p.limit_micros) then 'exhausted'
  else 'eligible' end;
 return jsonb_build_object('action','budget_read','scopeId',sid,'revision',f.revision,'stopRevision',f.stop_revision,
  'enabled',s.enabled,'frozen',s.frozen,'expiresAt',ops_control_private.stamp_v1(s.expires_at),
  'exposureMicros',total_n::text,'unresolvedAttempts',pending_n,'eligibility',eligibility_n);
end $$;

-- A denial-only leaf. Call only after the original authoritative source/lease checks.
-- No caller-facing wrapper grants execution on this private predicate.
create function ops_control_private.allowed_v1(mode_n text,provider_n text,city_n text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from ops_control_private.root_v1 where singleton for share nowait;
 if not found or not ops_control_private.recovery_ready_v1() then return false;end if;
 if not exists(select 1 from ops_control_private.controls_v1 where kind='capability' and key=mode_n and state='enabled')
  or not exists(select 1 from ops_control_private.controls_v1 where kind='provider' and key=provider_n and state='enabled')
  then return false;end if;
 if city_n is null then
  if exists(select 1 from ops_control_private.controls_v1 where kind='city' and state='disabled') then return false;end if;
 else
  if not exists(select 1 from ops_control_private.controls_v1 where kind='city' and key=city_n and state='enabled') then return false;end if;
 end if;
 return true;
exception when lock_not_available then return false;
end $$;

create function ops_control_private.work_basis_v1(turn_n uuid,lease_n uuid,effect_n text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;c turn_private.text_content%rowtype;
 p turn_private.text_policies%rowtype;g turn_private.grounded_turns%rowtype;
 run_n turn_private.planning_v2_execution_runs%rowtype;
 profile_n turn_private.planning_v2_execution_profiles%rowtype;
 tariff_n turn_private.planning_v2_registered_tariffs%rowtype;
 scoped_n scoped_edit_private.work_v1%rowtype;cfg_n scoped_edit_private.worker_settings_v1%rowtype;
 q jsonb;city_n text;provider_n text;
 task_n turn_private.service_tasks%rowtype;
begin
 -- Original entry already holds the authorizing source locks. Late reads use NOWAIT;
 -- there is no global-control lock followed by a new owner/task/policy lock.
 if effect_n not in('admission','model','tool') or effect_n is null then return null;end if;
 select * into w from turn_private.work where turn_id=turn_n for share nowait;
 if not found then return null;end if;
 if not exists(select 1 from public.turns where id=w.turn_id and owner_id=w.owner_id
  and status not in('completed','proposal_ready','unavailable','failed','cancelled')) then return null;end if;
 if effect_n='admission' then
  if w.state<>'queued' then return null;end if;
 else
  if w.state<>'leased' or w.lease_token is distinct from lease_n
   or w.expires_at<=clock_timestamp() then return null;end if;
 end if;
 select * into c from turn_private.text_content where turn_id=w.turn_id and owner_id=w.owner_id
  and hidden_at is null for share nowait;
 if not found then return null;end if;
 select * into p from turn_private.text_policies where id=c.policy_id for share nowait;
 if not found or not turn_private.text_policy_current(p.id)
  or not exists(select 1 from turn_private.text_consents where owner_id=w.owner_id and policy_id=c.policy_id
   and consent_id=c.consent_id and revoked_at is null)
  or not exists(select 1 from auth.sessions where id=w.session_id and user_id=w.owner_id)
  then return null;end if;
 provider_n:=p.provider;
 if w.execution_mode='planning_intake_comparison_v2' then
  q:=turn_private.read_planning_qualified_intake_v1(w.owner_id,w.turn_id,
   case when effect_n='admission' then null else lease_n end);
  if q->>'kind' is distinct from 'planning_intake_input' then return null;end if;
  city_n:=q->'qualifiedIntake'->'intake'->>'city';
  if city_n is distinct from 'shanghai' then return null;end if;
  if effect_n<>'admission' then
   select * into run_n from turn_private.planning_v2_execution_runs where turn_id=w.turn_id and owner_id=w.owner_id;
   if not found or run_n.task_id::text is distinct from q->>'taskId' then return null;end if;
   select * into profile_n from turn_private.planning_v2_execution_profiles where id=run_n.profile_id for share nowait;
   if not found or profile_n.owner_id<>w.owner_id or profile_n.revision<>run_n.profile_revision
    or to_jsonb(profile_n) is distinct from run_n.profile_snapshot or profile_n.text_policy_id<>p.id
    or profile_n.planning_policy_id::text is distinct from q->>'planningPolicyId' then return null;end if;
   select * into tariff_n from turn_private.planning_v2_registered_tariffs where id=profile_n.tariff_id for share nowait;
   if not found or run_n.execution->>'provider' is distinct from tariff_n.provider
    or run_n.execution->>'model' is distinct from tariff_n.model
    or run_n.execution->>'priceVersion' is distinct from tariff_n.price_version then return null;end if;
   provider_n:=tariff_n.provider;
  end if;
 elsif w.execution_mode='text' then
  select * into g from turn_private.grounded_turns where turn_id=w.turn_id and owner_id=w.owner_id for share nowait;
  if found then
   if not exists(select 1 from turn_private.service_task_turns st where st.turn_id=w.turn_id
    and st.owner_id=w.owner_id and st.task_id=g.task_id)
    then return null;end if;
   city_n:=g.city;
  end if;
 elsif w.execution_mode='scoped_trip_edit_v1' then
  select * into scoped_n from scoped_edit_private.work_v1 where turn_id=w.turn_id and owner_id=w.owner_id for share nowait;
  if not found or scoped_n.policy_id<>p.id
   or not exists(select 1 from turn_private.service_task_turns st where st.turn_id=w.turn_id
    and st.owner_id=w.owner_id and st.task_id=scoped_n.task_id) then return null;end if;
  select * into cfg_n from scoped_edit_private.worker_settings_v1 where policy_id=scoped_n.policy_id for share nowait;
  if not found or not cfg_n.enabled or cfg_n.expires_at<=clock_timestamp()
   or cfg_n.scope_id<>scoped_n.scope_id or p.provider is distinct from 'qwen'
   or not scoped_edit_private.worker_policy_v1(w.owner_id,scoped_n.policy_id,scoped_n.scope_id) then return null;end if;
  if effect_n='admission' then provider_n:='qwen';
  else
   if scoped_n.binding->>'provider' is distinct from 'qwen'
    or scoped_n.binding->>'model' is distinct from cfg_n.model
    or scoped_n.binding->>'priceVersion' is distinct from cfg_n.price_version then return null;end if;
   provider_n:=scoped_n.binding->>'provider';
  end if;
 elsif w.execution_mode<>'planning_comparison_v1' then return null;
 end if;
 if effect_n='tool' then
  if w.execution_mode not in('planning_comparison_v1','planning_intake_comparison_v2') then return null;end if;
  provider_n:='amap';
 end if;
 select t.* into task_n from turn_private.service_tasks t join turn_private.service_task_turns st
  on st.task_id=t.id and st.owner_id=t.owner_id where st.turn_id=w.turn_id and t.owner_id=w.owner_id for share of t nowait;
 if task_n.id is not null then
  if task_n.policy_id<>c.policy_id or task_n.consent_id<>c.consent_id or task_n.thread_id<>c.thread_id
   or not exists(select 1 from turn_private.text_content goal where goal.turn_id=task_n.goal_turn_id
    and goal.owner_id=w.owner_id and goal.hidden_at is null) then return null;end if;
  if p.context_mode='task_history_v1' and turn_private.task_history(w.turn_id) is null then return null;end if;
  if g.turn_id is not null and g.scope_version<>task_n.scope_version then return null;end if;
 elsif w.execution_mode<>'text' or p.context_mode<>'current_input_v1'
  or exists(select 1 from turn_private.service_task_turns where turn_id=w.turn_id)
  or exists(select 1 from turn_private.service_tasks where id=w.turn_id) then return null;
 end if;
 -- This internal proof is not exposed as an actor/lease/source DTO.
 return jsonb_build_object('mode',w.execution_mode,'provider',provider_n,'city',city_n,'taskId',coalesce(task_n.id,w.turn_id),
  'canonicalTask',task_n.id is not null,
  'scopeId',task_n.budget_scope_id,'model',case
   when w.execution_mode='planning_intake_comparison_v2' and effect_n<>'admission' then tariff_n.model
   when w.execution_mode='scoped_trip_edit_v1' then cfg_n.model
   when provider_n='qwen' then 'qwen3.7-plus-2026-05-26' when provider_n='glm' then 'glm-5.3-flash'
   when provider_n='deepseek' then 'deepseek-flash' else null end,
  'priceVersion',case when w.execution_mode='planning_intake_comparison_v2' and effect_n<>'admission' then tariff_n.price_version
   when w.execution_mode='scoped_trip_edit_v1' then cfg_n.price_version else null end);
exception when lock_not_available then return null;
end $$;
create function ops_control_private.control_decision_v1(mode_n text,provider_n text,city_n text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from ops_control_private.root_v1 where singleton for share nowait;
 if not found or not ops_control_private.recovery_ready_v1()
  or not exists(select 1 from ops_control_private.controls_v1 where kind='capability' and key=mode_n)
  or not exists(select 1 from ops_control_private.controls_v1 where kind='provider' and key=provider_n)
  then return jsonb_build_object('kind','blocked','code','OPS_SCOPE_UNAVAILABLE');end if;
 if exists(select 1 from ops_control_private.controls_v1 where state='disabled'
  and(kind='capability' and key=mode_n or kind='provider' and key=provider_n))
  then return jsonb_build_object('kind','blocked','code','OPS_CONTROL_DISABLED');end if;
 if city_n is null and exists(select 1 from ops_control_private.controls_v1 where kind='city' and state='disabled')
  or city_n is not null and not exists(select 1 from ops_control_private.controls_v1 where kind='city' and key=city_n)
  then return jsonb_build_object('kind','blocked','code','OPS_SCOPE_UNAVAILABLE');end if;
 if exists(select 1 from ops_control_private.controls_v1 where kind='city' and key=city_n and state='disabled')
  then return jsonb_build_object('kind','blocked','code','OPS_CONTROL_DISABLED');end if;
 return jsonb_build_object('kind','allowed');
exception when lock_not_available then return jsonb_build_object('kind','blocked','code','OPS_SCOPE_UNAVAILABLE');
end $$;
create function ops_control_private.work_decision_v1(turn_n uuid,lease_n uuid,effect_n text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b jsonb;
begin
 b:=ops_control_private.work_basis_v1(turn_n,lease_n,effect_n);
 -- A policy/source/lease denial never becomes an Ops refusal or an Ops side channel.
 if b is null then return jsonb_build_object('kind','blocked');end if;
 return ops_control_private.control_decision_v1(b->>'mode',b->>'provider',b->>'city');
end $$;
create function ops_control_private.work_allowed_v1(turn_n uuid,lease_n uuid,effect_n text) returns boolean
language sql security definer set search_path='' as $$
 select ops_control_private.work_decision_v1(turn_n,lease_n,effect_n)->>'kind'='allowed'
$$;
create function ops_control_private.admission_guard_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;decision_n jsonb;
begin
 -- Deferred commit-time qualification sees the final mode/source after original nested
 -- admission wrappers. Planning/scoped admissions are not accidentally gated as text.
 select * into w from turn_private.work where turn_id=new.turn_id;
 if not found or w.state<>'queued' then return null;end if;
 if w.execution_mode='travel_directions_v1' then return null;end if;
 -- Existing paused-unknown recovery is a drain/readback state, not new admission.
 if exists(select 1 from turn_private.planning_comparisons where turn_id=w.turn_id and state='paused_unknown')
  or exists(select 1 from scoped_edit_private.work_v1 where turn_id=w.turn_id and paused_reason is not null)
  then return null;end if;
 decision_n:=ops_control_private.work_decision_v1(w.turn_id,null,'admission');
 if decision_n->>'kind'<>'allowed' then
  if decision_n->>'code' in('OPS_CONTROL_DISABLED','OPS_SCOPE_UNAVAILABLE') then
   raise exception using message=decision_n->>'code';
  end if;
  raise exception 'TURN_UNAVAILABLE';
 end if;
 return null;
end $$;
create constraint trigger ops_control_admission_v1 after insert or update of execution_mode,state
 on turn_private.work deferrable initially deferred for each row
 when(new.state='queued') execute function ops_control_private.admission_guard_v1();

create function ops_control_private.ledger_decision_v1(sid uuid,uid uuid,attempt_n uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.model_budget_attempts%rowtype;s public.model_budget_scopes%rowtype;
 f ops_control_private.budget_fences_v1%rowtype;p public.model_budget_provider_limits%rowtype;
 tid uuid;token_n uuid;n bigint;b jsonb;
begin
 -- Source/authority locks precede the original scope UPDATE. The original dispatcher
 -- rechecks monetary state under that lock and retains its duplicate-status branches.
 select * into s from public.model_budget_scopes where id=sid and owner_id=uid;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 select * into a from public.model_budget_attempts where scope_id=sid and attempt_id=attempt_n;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 if a.status<>'reserved' then return jsonb_build_object('kind','allowed');end if;
 select * into f from ops_control_private.budget_fences_v1 where scope_id=sid;
 if not found or f.retired or f.owner_id is distinct from uid or f.scope_created_at is distinct from s.created_at
  then return jsonb_build_object('kind','blocked','code','OPS_SCOPE_UNAVAILABLE');end if;
 select * into p from public.model_budget_provider_limits where scope_id=sid and provider=a.provider;
 if not found or p.model<>a.model or p.price_version<>a.price_version then return jsonb_build_object('kind','unavailable');end if;
 select count(*),min(w.turn_id::text)::uuid,min(w.lease_token::text)::uuid into n,tid,token_n
 from turn_private.work w where w.owner_id=uid and w.state='leased' and w.expires_at>clock_timestamp()
  and(w.turn_id=a.task_id or exists(select 1 from turn_private.service_task_turns st
   where st.turn_id=w.turn_id and st.owner_id=uid and st.task_id=a.task_id));
 if n<>1 then return jsonb_build_object('kind','blocked','code','OPS_SCOPE_UNAVAILABLE');end if;
 b:=ops_control_private.work_basis_v1(tid,token_n,'model');
 if b is null then return jsonb_build_object('kind','blocked');end if;
 if b->>'taskId' is distinct from a.task_id::text
  or b->'canonicalTask'='true'::jsonb and b->>'scopeId' is distinct from sid::text
  or b->>'provider' is distinct from a.provider or b->>'model' is distinct from a.model
  or b->>'priceVersion' is not null and b->>'priceVersion' is distinct from a.price_version
  then return jsonb_build_object('kind','blocked','code','OPS_SCOPE_UNAVAILABLE');end if;
 return ops_control_private.control_decision_v1(b->>'mode',a.provider,b->>'city');
exception when lock_not_available then return jsonb_build_object('kind','blocked','code','OPS_SCOPE_UNAVAILABLE');
end $$;

create function ops_control_private.c2_unqualified_decision_v1(turn_n uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context_n jsonb;
begin
 -- Preserve the original current owner/session/policy/hidden/blocked-grounded gate.
 -- The returned source is used only internally; no text/city leaves this denial.
 context_n:=public.read_grounded_ai_assist_context_v1(turn_n);
 if context_n->>'kind' is distinct from 'context' then return jsonb_build_object('kind','unavailable');end if;
 -- Actual current C2 source has ENV-only configuration and an in-process CostGuard,
 -- no immutable registered SQL execution/durable-budget binding. Never borrow the
 -- original text policy provider, guess a scope, or invent zero cost/profile/role.
 return jsonb_build_object('kind','blocked','code','OPS_SCOPE_UNAVAILABLE');
end $$;
create function ops_control_private.operations_v1(v jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor_n jsonb;u uuid;op uuid;r ops_control_private.operations_v1%rowtype;
 root_n ops_control_private.root_v1%rowtype;control_n ops_control_private.controls_v1%rowtype;
 a text;result_n jsonb;budget_n jsonb;revision_n bigint;instant_n timestamptz;
begin
 actor_n:=ops_control_private.actor_v1();u:=(actor_n->>'actorId')::uuid;
 if not pg_try_advisory_xact_lock(hashtextextended(u::text,34)) then raise exception 'OPS_UNAVAILABLE';end if;
 if ops_control_private.input_v1(v) is not true then raise exception 'OPS_INVALID_INPUT';end if;
 a:=v->>'action';
 if a='workspace' then
  select * into root_n from ops_control_private.root_v1 where singleton for share nowait;
  if not found then raise exception 'OPS_UNAVAILABLE';end if;
  result_n:=jsonb_build_object('revision',root_n.revision,'observedAt',ops_control_private.stamp_v1(clock_timestamp()),
   'controls',(select jsonb_agg(jsonb_build_object('scope',jsonb_build_object('kind',kind,'key',key),
    'state',state,'revision',revision,'stopRevision',stop_revision) order by kind,key) from ops_control_private.controls_v1),
   'registry',jsonb_build_object('capabilities',(select jsonb_agg(key order by key) from ops_control_private.controls_v1 where kind='capability'),
    'providers',(select jsonb_agg(key order by key) from ops_control_private.controls_v1 where kind='provider'),
    'cities',(select jsonb_agg(key order by key) from ops_control_private.controls_v1 where kind='city')),
   'recoveryReady',ops_control_private.recovery_ready_v1());
 elsif a='budget_read' then result_n:=ops_control_private.budget_state_v1((v->>'scopeId')::uuid);
 else
  op:=(v->>'operationId')::uuid;
  if not pg_try_advisory_xact_lock(hashtextextended(op::text,3701)) then raise exception 'OPS_CONFLICT';end if;
  select * into r from ops_control_private.operations_v1 where operation_id=op for share nowait;
  if found then
   if r.retired or r.actor_id is distinct from u then
    if a='receipt' then raise exception 'OPS_UNAVAILABLE';end if;
    raise exception 'OPS_CONFLICT';
   end if;
   if a<>'receipt' and r.input is distinct from v then raise exception 'OPS_CONFLICT';end if;
   result_n:=r.receipt;
  elsif a='receipt' then raise exception 'OPS_UNAVAILABLE';
  elsif a='set' then
   select * into root_n from ops_control_private.root_v1 where singleton for update nowait;
   if not found or not ops_control_private.recovery_ready_v1() then raise exception 'OPS_UNAVAILABLE';end if;
   if root_n.revision<>(v->>'expectedRevision')::bigint then raise exception 'OPS_CONFLICT';end if;
   select * into control_n from ops_control_private.controls_v1 where kind=v->'scope'->>'kind'
    and key=v->'scope'->>'key' for update nowait;
   if not found then raise exception 'OPS_UNAVAILABLE';end if;
   revision_n:=root_n.revision+1;instant_n:=clock_timestamp();
   update ops_control_private.root_v1 set revision=revision_n where singleton;
   update ops_control_private.controls_v1 set state=v->>'state',revision=revision_n,
    stop_revision=case when v->>'state'='disabled' then revision_n else stop_revision end
    where kind=control_n.kind and key=control_n.key returning * into control_n;
   result_n:=jsonb_build_object('operationId',op,'action','set','scope',v->'scope','state',control_n.state,
    'revision',revision_n,'stopRevision',control_n.stop_revision,'appliedAt',ops_control_private.stamp_v1(instant_n),
    'acknowledgement','applied','effect',case when control_n.state='disabled' then 'blocks_new_dispatch' else 'permits_fresh_authorization' end);
   insert into ops_control_private.operations_v1(operation_id,actor_id,action,input,receipt,revision,applied_at)
    values(op,u,a,v,result_n,revision_n,instant_n);
  elsif a='budget_resume' then
   budget_n:=ops_control_private.budget_state_v1((v->>'scopeId')::uuid);
   if (budget_n->>'revision')::bigint<>(v->>'expectedRevision')::bigint then raise exception 'OPS_CONFLICT';end if;
   if budget_n->>'eligibility'<>'eligible' then raise exception 'OPS_UNAVAILABLE';end if;
   instant_n:=clock_timestamp();
   update public.model_budget_scopes set enabled=true,frozen=false where id=(v->>'scopeId')::uuid;
   select revision into revision_n from ops_control_private.budget_fences_v1 where scope_id=(v->>'scopeId')::uuid;
   result_n:=jsonb_build_object('operationId',op,'action','budget_resume','scopeId',v->'scopeId',
    'revision',revision_n,'stopRevision',budget_n->'stopRevision','appliedAt',ops_control_private.stamp_v1(instant_n),
    'acknowledgement','applied','effect','permits_fresh_budget_authorization');
   insert into ops_control_private.operations_v1(operation_id,actor_id,action,input,receipt,revision,applied_at)
    values(op,u,a,v,result_n,revision_n,instant_n);
  end if;
 end if;
 if ops_control_private.actor_v1() is distinct from actor_n then raise exception 'OPS_FORBIDDEN';end if;
 return result_n||jsonb_build_object('schemaVersion','ops-control/1',
  'sessionId',actor_n->'sessionId','sessionEpoch',actor_n->'sessionEpoch');
exception when lock_not_available then raise exception 'OPS_UNAVAILABLE';
end $$;
create function public.ops_control_operations_v1(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 -- Explicit guard in the thin public wrapper; private kernel also gates every action.
 perform knowledge_review_private.current_actor();
 return ops_control_private.operations_v1(p_input);
exception when others then
 if sqlerrm in('OPS_FORBIDDEN','OPS_CONFLICT','OPS_UNAVAILABLE','OPS_INVALID_INPUT') then raise;end if;
 if sqlerrm in('UNAUTHENTICATED','SESSION_REPLACED','OPS_DISABLED') then raise exception 'OPS_FORBIDDEN';end if;
 raise exception 'OPS_UNAVAILABLE';
end $$;
revoke all on all functions in schema ops_control_private from public,anon,authenticated,service_role;
revoke all on function public.ops_control_operations_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ops_control_operations_v1(jsonb) to authenticated;
-- No restore-fence activation, policy/host/provider/role/member enablement here.
