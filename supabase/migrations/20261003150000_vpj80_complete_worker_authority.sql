-- #561 controlled collector batch. All entries default closed; no role/grant/config/activation.
-- Registered operator tariff is a separate immutable authority; caller model tuple is not a price.
create table turn_private.planning_v2_registered_tariffs (
 id uuid primary key,provider text not null check(provider='qwen'),model text not null,
 price_version text not null,currency text not null check(currency='CNY'),unit text not null check(unit='micros'),
 input_rate bigint not null check(input_rate>=0),cached_input_rate bigint check(cached_input_rate>=0),
 output_rate bigint not null check(output_rate>=0),source_authority text not null check(length(source_authority) between 1 and 500),
 enabled boolean not null default false,valid_until timestamptz not null,
 unique(provider,model,price_version,currency,unit)
);
create table turn_private.planning_v2_collector_principals (
 id uuid primary key,jwt_role text not null check(jwt_role='planning_worker_v2_collector'),jwt_subject uuid not null,
 database_role text not null check(database_role='planning_worker_v2_collector'),gateway_session_user text not null check(gateway_session_user='authenticator'),
 approved boolean not null default false,valid_until timestamptz not null
);
revoke all on turn_private.planning_v2_collector_principals from public,anon,authenticated,service_role;
create table turn_private.planning_v2_execution_profiles (
 id uuid primary key,revision integer not null check(revision>0),owner_id uuid not null references auth.users(id) on delete cascade,
 enabled boolean not null default false,environment text not null check(environment in ('local_synthetic','staging')),
 collector_principal_id uuid not null references turn_private.planning_v2_collector_principals(id),collector_jwt_role text not null check(collector_jwt_role='planning_worker_v2_collector'),
 collector_jwt_subject uuid not null,local_admin_fixture boolean not null default false,
 text_policy_id uuid not null references turn_private.text_policies(id),planning_policy_id uuid not null references turn_private.planning_policies(id),
 scope_id uuid not null references public.model_budget_scopes(id),tariff_id uuid not null references turn_private.planning_v2_registered_tariffs(id),
 provider_configuration_id uuid not null,provider_configuration_version integer not null check(provider_configuration_version>0),
 endpoint text not null check(endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'),recipient text not null,
 reserved_micros bigint not null check(reserved_micros between 1 and 1000000000000),timeout_ms integer not null check(timeout_ms between 1 and 300000),
 max_output_tokens integer not null check(max_output_tokens between 1 and 8192),
 map_fee_window_id uuid not null,map_fee_window_until timestamptz not null,map_fee_approved boolean not null default false,
 max_map_calls integer not null default 13 check(max_map_calls=13),max_steps integer not null default 4 check(max_steps=4),
 max_retries integer not null default 0 check(max_retries=0),deadline_ms integer not null default 120000 check(deadline_ms=120000),
 valid_until timestamptz not null,check(not local_admin_fixture or environment='local_synthetic')
);
create table turn_private.planning_v2_execution_runs (
 id uuid primary key,profile_id uuid not null references turn_private.planning_v2_execution_profiles(id),profile_revision integer not null,
 owner_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid unique not null references turn_private.service_tasks(id) on delete cascade,
 turn_id uuid unique not null references turn_private.planning_comparisons(turn_id) on delete cascade,
 original_lease uuid not null,source jsonb not null,intake_digest text not null,planning_digest text not null,
 collector_principal_id uuid not null,origin_kind text not null check(origin_kind in ('controlled_collector','local_admin_fixture')),
 execution jsonb not null,profile_snapshot jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create table turn_private.planning_v2_external_call_windows (
 execution_id uuid primary key references turn_private.planning_v2_execution_runs(id) on delete cascade,
 calls integer not null default 0 check(calls between 0 and 13)
);
create table turn_private.planning_v2_collector_origins (
 execution_id uuid primary key references turn_private.planning_v2_execution_runs(id) on delete cascade,
 scope_id uuid not null,attempt_id uuid not null,invocation_id uuid unique not null,
 request_id uuid not null,request_digest text not null,payload_digest text not null,
 binding jsonb not null,origin_kind text not null check(origin_kind in ('controlled_collector','local_admin_fixture')),
 configured_at timestamptz not null,attempted_at timestamptz,response_buffered_at timestamptz,
 unknown_at timestamptz,configuration_id uuid not null,configuration_version integer not null,endpoint text not null,
 unique(scope_id,attempt_id),foreign key(scope_id,attempt_id) references public.model_budget_attempts(scope_id,attempt_id) on delete cascade,
 check(response_buffered_at is null or attempted_at is not null)
);
create table turn_private.planning_v2_collector_outputs (
 execution_id uuid primary key references turn_private.planning_v2_collector_origins(execution_id) on delete cascade,
 output_digest text not null,usage_digest text not null,output_wire jsonb not null,
 usage_receipt_id uuid unique not null,usage_wire jsonb not null,recorded_at timestamptz not null default clock_timestamp(),
 check(output_digest ~ '^[a-f0-9]{64}$' and usage_digest ~ '^[a-f0-9]{64}$')
);
create table turn_private.planning_v2_result_claims (
 execution_id uuid primary key references turn_private.planning_v2_execution_runs(id) on delete cascade,
 action_key text not null,content_digest text not null,lease_token uuid not null,
 state text not null check(state in ('started','completed','unknown')),
 check(action_key ~ '^[a-f0-9]{64}$' and content_digest ~ '^[a-f0-9]{64}$')
);
revoke all on turn_private.planning_v2_registered_tariffs,turn_private.planning_v2_execution_profiles,
 turn_private.planning_v2_execution_runs,turn_private.planning_v2_external_call_windows,
 turn_private.planning_v2_collector_origins,turn_private.planning_v2_collector_outputs,turn_private.planning_v2_result_claims
 from public,anon,authenticated,service_role;

create function turn_private.planning_v2_immutable_collector_record() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_EXECUTION_RECORD'; end $$;
revoke all on function turn_private.planning_v2_immutable_collector_record() from public,anon,authenticated,service_role;
create trigger immutable_v2_execution_run before update on turn_private.planning_v2_execution_runs for each row execute function turn_private.planning_v2_immutable_collector_record();
create trigger immutable_v2_collector_output before update on turn_private.planning_v2_collector_outputs for each row execute function turn_private.planning_v2_immutable_collector_record();
create trigger immutable_v2_registered_tariff before update on turn_private.planning_v2_registered_tariffs for each row execute function turn_private.planning_v2_immutable_collector_record();

create function turn_private.planning_v2_collector_principal(p_profile uuid) returns text
language plpgsql security definer set search_path='' as $$
declare p turn_private.planning_v2_execution_profiles%rowtype;principal turn_private.planning_v2_collector_principals%rowtype;
begin
 select * into p from turn_private.planning_v2_execution_profiles where id=p_profile for share nowait;
 if not found or not p.enabled or p.valid_until<=clock_timestamp() then return null; end if;
 if p.local_admin_fixture and p.environment='local_synthetic' and session_user='postgres' and current_setting('role')='none' and inet_client_addr() is null then return 'local_admin_fixture'; end if;
 if p.local_admin_fixture then return null; end if;
 select * into principal from turn_private.planning_v2_collector_principals where id=p.collector_principal_id for share nowait;
 if not found or not principal.approved or principal.valid_until<=clock_timestamp() or principal.jwt_role<>p.collector_jwt_role or principal.jwt_subject<>p.collector_jwt_subject
 or session_user<>principal.gateway_session_user or current_setting('role')<>principal.database_role or not exists(select 1 from pg_roles where rolname=principal.database_role) then return null;end if;
 if auth.jwt()->>'role' is distinct from p.collector_jwt_role or auth.jwt()->>'sub' is distinct from p.collector_jwt_subject::text then return null; end if;
 return 'controlled_collector';
exception when lock_not_available then return null;
end $$;
revoke all on function turn_private.planning_v2_collector_principal(uuid) from public,anon,authenticated,service_role;

create function turn_private.planning_v2_run_basis(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r turn_private.planning_v2_execution_runs%rowtype;p turn_private.planning_v2_execution_profiles%rowtype;
 q jsonb;t turn_private.service_tasks%rowtype;s public.model_budget_scopes%rowtype;l public.model_budget_provider_limits%rowtype;tar turn_private.planning_v2_registered_tariffs%rowtype;origin text;
begin
 select * into r from turn_private.planning_v2_execution_runs where task_id=p_task and owner_id=p_owner and turn_id=p_turn;
 if not found then return null; end if;
 origin:=turn_private.planning_v2_collector_principal(r.profile_id);if origin is null or origin<>r.origin_kind then return null;end if;
 select * into p from turn_private.planning_v2_execution_profiles where id=r.profile_id;
 if to_jsonb(p) is distinct from r.profile_snapshot or p.revision<>r.profile_revision or not exists(select 1 from turn_private.text_policies tp join turn_private.planning_policies pp on pp.text_policy_id=tp.id where tp.id=p.text_policy_id and pp.id=p.planning_policy_id and pp.environment=p.environment and tp.endpoint=p.endpoint and tp.recipient=p.recipient) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,34));
 perform 1 from auth.users where id=p_owner for key share nowait;if not found then return null;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=p_owner for update;if not found then return null;end if;
 select * into t from turn_private.service_tasks where id=p_task and owner_id=p_owner for update nowait;
 if not found or t.last_turn_id<>p_turn or t.policy_id<>p.text_policy_id or t.budget_scope_id is distinct from p.scope_id then return null;end if;
 q:=turn_private.read_planning_qualified_intake_v1(p_owner,p_turn,p_lease);
 if q->>'kind' is distinct from 'planning_intake_input' or q->>'taskId' is distinct from p_task::text or q->>'planningPolicyId' is distinct from p.planning_policy_id::text
 or q->>'intakeContextDigest' is distinct from p_intake_digest or q->>'planningContextDigest' is distinct from p_planning_digest or r.intake_digest<>p_intake_digest or r.planning_digest<>p_planning_digest then return null;end if;
 select * into s from public.model_budget_scopes where id=p.scope_id for share nowait;
 if not found or s.owner_id<>p_owner or s.currency<>'CNY' or not s.enabled or s.frozen or s.expires_at<=clock_timestamp() then return null;end if;
 select * into l from public.model_budget_provider_limits where scope_id=p.scope_id and provider='qwen' for share nowait;
 select * into tar from turn_private.planning_v2_registered_tariffs where id=p.tariff_id for share nowait;
 if l.scope_id is null or tar.id is null or not l.enabled or not tar.enabled or tar.valid_until<=clock_timestamp() or l.model<>tar.model or l.price_version<>tar.price_version
 or r.execution->>'model' is distinct from tar.model or r.execution->>'priceVersion' is distinct from tar.price_version then return null;end if;
 perform 1 from turn_private.planning_v2_execution_runs where id=r.id for share nowait;
 return jsonb_build_object('runId',r.id,'qualification',q,'execution',r.execution,'originKind',origin,'originalLease',r.original_lease);
exception when lock_not_available then return null;
end $$;
revoke all on function turn_private.planning_v2_run_basis(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function public.claim_planning_intake_work_v1(p_owner_id uuid,p_planning_policy_id uuid,p_execution_profile_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p turn_private.planning_v2_execution_profiles%rowtype;principal turn_private.planning_v2_collector_principals%rowtype;tar turn_private.planning_v2_registered_tariffs%rowtype;c record;w turn_private.work%rowtype;q jsonb;e jsonb;source jsonb;r turn_private.planning_v2_execution_runs%rowtype;execution_id uuid;origin text;task_row turn_private.service_tasks%rowtype;
begin
origin:=turn_private.planning_v2_collector_principal(p_execution_profile_id);if origin is null then return jsonb_build_object('kind','blocked');end if;
 select * into p from turn_private.planning_v2_execution_profiles where id=p_execution_profile_id;
 if p.owner_id<>p_owner_id or p.planning_policy_id<>p_planning_policy_id then return jsonb_build_object('kind','blocked');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,34));
 perform 1 from auth.users where id=p_owner_id for key share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 perform 1 from identity_private.mobile_accounts where owner_id=p_owner_id for update;if not found then return jsonb_build_object('kind','blocked');end if;
 for c in select j.task_id,j.turn_id,j.artifact_id,j.memory_basis,m.locale from turn_private.planning_comparisons j join turn_private.work candidate_work on candidate_work.turn_id=j.turn_id join turn_private.assistant_messages m on m.id=j.message_id
 where j.owner_id=p_owner_id and j.planning_policy_id=p_planning_policy_id and j.state='queued' and candidate_work.execution_mode='planning_intake_comparison_v2' and (candidate_work.state='queued' or candidate_work.state='leased' and candidate_work.expires_at<=clock_timestamp()) order by candidate_work.created_at,candidate_work.turn_id limit 100 loop
  select * into task_row from turn_private.service_tasks where id=c.task_id and owner_id=p_owner_id and policy_id=p.text_policy_id for update nowait;if not found then continue;end if;
  if task_row.budget_scope_id is not null and task_row.budget_scope_id is distinct from p.scope_id then return jsonb_build_object('kind','blocked');end if;
  if task_row.budget_scope_id is null and (exists(select 1 from public.model_budget_attempts where task_id=c.task_id) or exists(select 1 from turn_private.planning_v2_execution_runs where task_id=c.task_id)) then return jsonb_build_object('kind','blocked');end if;
  select * into w from turn_private.work where turn_id=c.turn_id;
  if not turn_private.lock_turn(c.turn_id,p_owner_id,w.session_id) then return jsonb_build_object('kind','blocked');end if;
  select * into w from turn_private.work where turn_id=c.turn_id for update nowait;
  if w.attempt>=w.max_attempts then return jsonb_build_object('kind','blocked');end if;
  select * into r from turn_private.planning_v2_execution_runs where turn_id=c.turn_id;
  if found then
   if r.profile_id<>p.id or r.profile_revision<>p.revision or (exists(select 1 from public.model_budget_attempts where task_id=c.task_id) and not exists(select 1 from turn_private.planning_v2_collector_outputs o join turn_private.planning_v2_collector_origins x on x.execution_id=o.execution_id join public.model_budget_attempts a on a.scope_id=x.scope_id and a.attempt_id=x.attempt_id where o.execution_id=r.id and a.status='settled' and a.actual_micros is not null and a.actual_micros=(o.usage_wire->>'actualMicros')::bigint)) or (not exists(select 1 from public.model_budget_attempts where task_id=c.task_id) and not exists(select 1 from turn_private.planning_v2_place_checkpoints cp where cp.turn_id=c.turn_id and cp.state='completed' and turn_private.valid_planning_v2_place_v1(cp.observation,p.environment) is true)) then return jsonb_build_object('kind','unknown_effect');end if;
  elsif exists(select 1 from public.model_budget_attempts where task_id=c.task_id) then return jsonb_build_object('kind','unknown_effect');end if;
  update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+least(w.lease_ms,120000)*interval '1 millisecond' where turn_id=c.turn_id returning * into w;
  q:=turn_private.read_planning_qualified_intake_v1(p_owner_id,c.turn_id,w.lease_token);
  if q->>'kind' is distinct from 'planning_intake_input' then raise exception 'STALE_BASIS';end if;
  perform 1 from public.model_budget_scopes where id=p.scope_id for share nowait;
  perform 1 from public.model_budget_provider_limits where scope_id=p.scope_id and provider='qwen' for share nowait;
  select * into tar from turn_private.planning_v2_registered_tariffs where id=p.tariff_id for share nowait;
  if not found or not tar.enabled or tar.valid_until<=clock_timestamp() or not exists(select 1 from public.model_budget_scopes s join public.model_budget_provider_limits l on l.scope_id=s.id where s.id=p.scope_id and s.owner_id=p_owner_id and s.currency='CNY' and s.enabled and not s.frozen and s.expires_at>clock_timestamp() and l.provider='qwen' and l.model=tar.model and l.price_version=tar.price_version and l.enabled) or p.reserved_micros<ceil((1048576::numeric*greatest(tar.input_rate,coalesce(tar.cached_input_rate,0))+p.max_output_tokens::numeric*tar.output_rate)/1000000) then raise exception 'EXECUTION_PROFILE_CONFLICT';end if;
  if task_row.budget_scope_id is null then update turn_private.service_tasks set budget_scope_id=p.scope_id where id=c.task_id and budget_scope_id is null;if not found then raise exception 'EXECUTION_PROFILE_CONFLICT';end if;end if;
  execution_id:=coalesce(r.id,gen_random_uuid());
  e:=jsonb_build_object('schemaVersion','planning-v2-execution/1','executionId',execution_id,'profileId',p.id,'profileRevision',p.revision,'textPolicyId',p.text_policy_id,'scopeId',p.scope_id,'provider','qwen','model',tar.model,'providerConfigurationId',p.provider_configuration_id,'providerConfigurationVersion',p.provider_configuration_version,'endpoint',p.endpoint,'priceVersion',tar.price_version,'reservedMicros',p.reserved_micros,'timeoutMs',p.timeout_ms,'maxOutputTokens',p.max_output_tokens,'inputMicrosPerMillion',tar.input_rate,'cachedInputMicrosPerMillion',tar.cached_input_rate,'outputMicrosPerMillion',tar.output_rate,'maxMapCalls',13,'maxSteps',4,'maxRetries',0,'deadlineMs',120000);
  source:=(q->'qualifiedIntake')-array['version','kind','schemaVersion','sourceKind','intake','contextDigest','readiness','readyForProvider'];
  if r.id is null then
    insert into turn_private.planning_v2_execution_runs(id,profile_id,profile_revision,owner_id,task_id,turn_id,original_lease,source,intake_digest,planning_digest,collector_principal_id,origin_kind,execution,profile_snapshot) values(execution_id,p.id,p.revision,p_owner_id,c.task_id,c.turn_id,w.lease_token,source,q->>'intakeContextDigest',q->>'planningContextDigest',p.collector_principal_id,origin,e,to_jsonb(p));
  else
    if r.execution is distinct from e or r.intake_digest<>q->>'intakeContextDigest' or r.planning_digest<>q->>'planningContextDigest' then raise exception 'STALE_BASIS';end if;
  end if;
  return jsonb_build_object('kind','leased','lease',jsonb_build_object('ownerId',p_owner_id,'taskId',c.task_id,'turnId',c.turn_id,'leaseToken',w.lease_token,'artifactId',c.artifact_id,'planningPolicyId',p.planning_policy_id,'intakeContextDigest',q->>'intakeContextDigest','planningContextDigest',q->>'planningContextDigest','source',source,'environment',p.environment,'locale',c.locale),'execution',e);
 end loop;
 return jsonb_build_object('kind','idle');
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.claim_planning_intake_work_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function turn_private.planning_v2_exact_model_basis(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;e jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return null;end if;e:=q->'execution';
 if e->>'textPolicyId' is distinct from p_text_policy::text or e->>'scopeId' is distinct from p_scope::text or e->>'provider' is distinct from p_provider or e->>'model' is distinct from p_model or e->>'priceVersion' is distinct from p_price_version or q->'qualification'->>'planningPolicyId' is distinct from p_planning_policy::text or p_attempt is null then return null;end if;
 if exists(select 1 from turn_private.planning_v2_model_attempt_bindings mb where mb.turn_id=p_turn and (mb.claim_lease is distinct from p_lease or mb.scope_id is distinct from p_scope or mb.attempt_id is distinct from p_attempt)) then return null;end if;
 return q;
exception when lock_not_available then return null;
end $$;
revoke all on function turn_private.planning_v2_exact_model_basis(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated,service_role;

create function public.read_planning_intake_work_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;return q->'qualification';
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.read_planning_intake_work_v1(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function public.read_planning_intake_checkpoints_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;return turn_private.read_planning_v2_checkpoints_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.read_planning_intake_checkpoints_v1(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function public.claim_planning_intake_place_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;return turn_private.claim_planning_v2_place_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.claim_planning_intake_place_v1(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function public.save_planning_intake_place_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_observation jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return false;end if;if not exists(select 1 from turn_private.planning_v2_external_call_windows where execution_id=(q->>'runId')::uuid and calls>0 and to_jsonb(calls)=p_observation->'providerCalls') then return false;end if;return turn_private.save_planning_v2_place_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest,p_observation);
exception when lock_not_available then return false;
end $$;
revoke all on function public.save_planning_intake_place_v1(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create function public.unknown_planning_intake_place_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text) returns boolean
language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return false;end if;return turn_private.unknown_planning_v2_place_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);
exception when lock_not_available then return false;
end $$;
revoke all on function public.unknown_planning_intake_place_v1(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function public.authorize_planning_intake_external_read_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_scope uuid,p_max_calls integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;p turn_private.planning_v2_execution_profiles%rowtype;n integer;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null or p_max_calls is distinct from 13 or q->'execution'->>'scopeId' is distinct from p_scope::text then return jsonb_build_object('kind','blocked');end if;
 if not exists(select 1 from turn_private.planning_v2_place_checkpoints cp where cp.turn_id=p_turn and cp.owner_id=p_owner and cp.task_id=p_task and cp.claim_lease=p_lease and cp.state='started' and cp.intake_digest=p_intake_digest and cp.planning_digest=p_planning_digest) then return jsonb_build_object('kind','blocked');end if;
 select profile.* into p from turn_private.planning_v2_execution_profiles profile where profile.id=(q->'execution'->>'profileId')::uuid;
 if not p.map_fee_approved or p.map_fee_window_until<=clock_timestamp() then return jsonb_build_object('kind','blocked');end if;
 insert into turn_private.planning_v2_external_call_windows values((q->>'runId')::uuid,0) on conflict do nothing;
 update turn_private.planning_v2_external_call_windows set calls=calls+1 where execution_id=(q->>'runId')::uuid and calls<13 returning calls into n;
 if not found then return jsonb_build_object('kind','blocked');end if;
 return jsonb_build_object('schemaVersion','planning-v2-tool-authority/1','kind','authorized','binding',jsonb_build_object('ownerId',p_owner,'taskId',p_task,'turnId',p_turn,'leaseToken',p_lease,'intakeContextDigest',p_intake_digest,'planningContextDigest',p_planning_digest),'scopeId',p_scope,'maxCalls',13);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.authorize_planning_intake_external_read_v1(uuid,uuid,uuid,uuid,text,text,uuid,integer) from public,anon,authenticated,service_role;

create function public.authorize_planning_intake_model_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text,p_effect text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;b jsonb;a public.model_budget_attempts%rowtype;
begin
q:=turn_private.planning_v2_exact_model_basis(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;
 if not exists(select 1 from turn_private.planning_v2_place_checkpoints cp join turn_private.planning_policies pp on pp.id=p_planning_policy where cp.turn_id=p_turn and cp.owner_id=p_owner and cp.task_id=p_task and cp.state='completed' and turn_private.valid_planning_v2_place_v1(cp.observation,pp.environment) is true) then return jsonb_build_object('kind','blocked');end if;
 if p_effect='model_reserve' then
  if exists(select 1 from public.model_budget_attempts where task_id=p_task) then return jsonb_build_object('kind','blocked');end if;
 elsif p_effect='model_dispatch' then
  b:=turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
  if b->>'ledgerStatus' is distinct from 'reserved' or b->'unknown' is distinct from 'false'::jsonb or exists(select 1 from turn_private.planning_v2_collector_origins where execution_id=(q->>'runId')::uuid) then return jsonb_build_object('kind','blocked');end if;
 else return jsonb_build_object('kind','blocked');end if;
 return jsonb_build_object('schemaVersion','planning-v2-effect-authority/1','kind','authorized','effect',p_effect,'binding',jsonb_build_object('owner',p_owner,'task',p_task,'turn',p_turn,'lease',p_lease,'textPolicy',p_text_policy,'planningPolicy',p_planning_policy,'scope',p_scope,'attempt',p_attempt,'provider',p_provider,'model',p_model,'priceVersion',p_price_version,'intakeDigest',p_intake_digest,'planningDigest',p_planning_digest));
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.authorize_planning_intake_model_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated,service_role;

create function public.bind_planning_intake_model_attempt_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
q:=turn_private.planning_v2_exact_model_basis(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;
 if not exists(select 1 from public.model_budget_attempts where scope_id=p_scope and attempt_id=p_attempt and reserved_micros=(q->'execution'->>'reservedMicros')::bigint) then return jsonb_build_object('kind','blocked');end if;
 return turn_private.bind_planning_v2_model_attempt_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.bind_planning_intake_model_attempt_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated,service_role;

create function public.project_planning_intake_comparison_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_observation jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;locale text;projection jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;
 select m.locale into locale from turn_private.assistant_messages m where id=(q->'qualification'->'qualifiedIntake'->>'messageId')::uuid;
 projection:=turn_private.project_planning_qualified_comparison_v1(p_owner,p_turn,p_lease,p_intake_digest,p_planning_digest,p_observation,locale);
 return coalesce(projection,jsonb_build_object('kind','blocked'));
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.project_planning_intake_comparison_v1(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create function public.record_planning_intake_provider_destination_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text,p_destination jsonb,p_request_id uuid,p_request_digest text,p_payload_digest text,p_payload_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;e jsonb;b jsonb;o turn_private.planning_v2_collector_origins%rowtype;phase text;at_time timestamptz;canonical jsonb;payload jsonb;user_input jsonb;place jsonb;
begin
q:=turn_private.planning_v2_exact_model_basis(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;e:=q->'execution';b:=jsonb_build_object('owner',p_owner,'task',p_task,'turn',p_turn,'lease',p_lease,'textPolicy',p_text_policy,'planningPolicy',p_planning_policy,'scope',p_scope,'attempt',p_attempt,'provider',p_provider,'model',p_model,'priceVersion',p_price_version,'intakeDigest',p_intake_digest,'planningDigest',p_planning_digest);
 if p_destination is null or jsonb_typeof(p_destination) is distinct from 'object' or p_destination-array['schemaVersion','invocationId','provider','model','endpoint','configurationId','configurationVersion','phase','observedAt']<>'{}' or (select count(*) from jsonb_object_keys(p_destination))<>9
 or p_destination->>'schemaVersion' is distinct from 'provider-destination/1' or p_destination->>'invocationId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or p_destination->'provider' is distinct from e->'provider' or p_destination->'model' is distinct from e->'model' or p_destination->'endpoint' is distinct from e->'endpoint' or p_destination->'configurationId' is distinct from e->'providerConfigurationId' or p_destination->'configurationVersion' is distinct from e->'providerConfigurationVersion' or turn_private.planning_v2_valid_ms_v1(p_destination->'observedAt') is distinct from true then return jsonb_build_object('kind','blocked');end if;
 if p_request_id is distinct from p_attempt or p_payload_text is null or octet_length(p_payload_text)>65536 then return jsonb_build_object('kind','blocked');end if;
 payload:=p_payload_text::jsonb;canonical:=turn_private.serialize_planning_v2_request_v1(b,p_request_id,payload);
 if canonical is null or canonical->>'body' is distinct from p_payload_text or canonical->>'requestDigest' is distinct from p_request_digest or canonical->>'payloadDigest' is distinct from p_payload_digest or payload->'max_tokens' is distinct from e->'maxOutputTokens' then return jsonb_build_object('kind','blocked');end if;
 select observation into place from turn_private.planning_v2_place_checkpoints where turn_id=p_turn and state='completed';
 if place is null then return jsonb_build_object('kind','blocked');end if;
 user_input:=(payload->'messages'->1->>'content')::jsonb;
 if user_input is distinct from jsonb_build_object('goal',q->'qualification'->'goalText','delegation',q->'qualification'->'delegation','intake',q->'qualification'->'qualifiedIntake'->'intake','observation',place,'unknown','["hotel_price","availability","safety","quietness","food","photography","pace_suitability"]'::jsonb) then return jsonb_build_object('kind','blocked');end if;
 phase:=p_destination->>'phase';at_time:=(p_destination->>'observedAt')::timestamptz;
 if phase not in ('configured','attempted','response_buffered') or at_time>clock_timestamp()+interval '5 seconds' or at_time<clock_timestamp()-interval '2 minutes' then return jsonb_build_object('kind','blocked');end if;
 if not exists(select 1 from public.model_budget_attempts where scope_id=p_scope and attempt_id=p_attempt and task_id=p_task and status='dispatched' and reserved_micros=(e->>'reservedMicros')::bigint) or (select count(*) from public.model_budget_attempts where task_id=p_task)<>1 then return jsonb_build_object('kind','blocked');end if;
 if turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest)->'unknown' is distinct from 'false'::jsonb then return jsonb_build_object('kind','blocked');end if;
 select * into o from turn_private.planning_v2_collector_origins where execution_id=(q->>'runId')::uuid for update nowait;
 if phase='configured' then
  if found then return jsonb_build_object('kind','blocked');end if;
  insert into turn_private.planning_v2_collector_origins(execution_id,scope_id,attempt_id,invocation_id,request_id,request_digest,payload_digest,binding,origin_kind,configured_at,configuration_id,configuration_version,endpoint) values((q->>'runId')::uuid,p_scope,p_attempt,(p_destination->>'invocationId')::uuid,p_request_id,p_request_digest,p_payload_digest,b,q->>'originKind',at_time,(e->>'providerConfigurationId')::uuid,(e->>'providerConfigurationVersion')::integer,e->>'endpoint');
 else
  if not found or o.binding is distinct from b or o.request_id is distinct from p_request_id or o.request_digest is distinct from p_request_digest or o.payload_digest is distinct from p_payload_digest or o.invocation_id::text is distinct from p_destination->>'invocationId' or o.unknown_at is not null or at_time<o.configured_at then return jsonb_build_object('kind','conflict');end if;
  if phase='attempted' then
   if o.attempted_at is not null or o.response_buffered_at is not null then return jsonb_build_object('kind','conflict');end if;
   update turn_private.planning_v2_collector_origins set attempted_at=at_time where execution_id=o.execution_id;
  else
   if o.attempted_at is null or o.response_buffered_at is not null or at_time<o.attempted_at then return jsonb_build_object('kind','conflict');end if;
   update turn_private.planning_v2_collector_origins set response_buffered_at=at_time where execution_id=o.execution_id;
  end if;
 end if;
 return jsonb_build_object('kind','destination_recorded','attemptId',p_attempt,'invocationId',p_destination->'invocationId','phase',phase);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.record_planning_intake_provider_destination_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,uuid,text,text,text) from public,anon,authenticated,service_role;

create function turn_private.planning_v2_usage_cost(p_wire jsonb,p_execution jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare u jsonb;tokens jsonb;cached numeric;n numeric;cost numeric;
begin
u:=p_wire->'usageReceipt';tokens:=u->'usage';
 if jsonb_typeof(u->'actualMicros') is distinct from 'number' or u->'actualMicros'='null' or (u->'attempt'->'reservedMicros') is distinct from (p_execution->'reservedMicros') or (u->'attempt'->'timeoutMs') is distinct from (p_execution->'timeoutMs') then return null;end if;
 if (tokens->>'inputTokens')::numeric>1048576 or (tokens->>'outputTokens')::numeric>(p_execution->>'maxOutputTokens')::numeric then return null;end if;
 n:=(tokens->>'outputTokens')::numeric*(p_execution->>'outputMicrosPerMillion')::numeric;
 if p_execution->'cachedInputMicrosPerMillion'='null' then n:=n+(tokens->>'inputTokens')::numeric*(p_execution->>'inputMicrosPerMillion')::numeric;
 else
  if tokens->'cachedInputTokens'='null' then return null;end if;
  cached:=(tokens->>'cachedInputTokens')::numeric;
  n:=n+cached*(p_execution->>'cachedInputMicrosPerMillion')::numeric+((tokens->>'inputTokens')::numeric-cached)*(p_execution->>'inputMicrosPerMillion')::numeric;
 end if;
 cost:=ceil(n/1000000);
 if cost>1000000000000 or cost is distinct from (u->>'actualMicros')::numeric then return null;end if;
 return cost::bigint;
exception when lock_not_available then return null;
end $$;
revoke all on function turn_private.planning_v2_usage_cost(jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.record_planning_intake_model_output_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text,p_output_wire jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;b jsonb;o turn_private.planning_v2_collector_origins%rowtype;saved turn_private.planning_v2_collector_outputs%rowtype;a public.model_budget_attempts%rowtype;cost bigint;
begin
q:=turn_private.planning_v2_exact_model_basis(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;b:=jsonb_build_object('owner',p_owner,'task',p_task,'turn',p_turn,'lease',p_lease,'textPolicy',p_text_policy,'planningPolicy',p_planning_policy,'scope',p_scope,'attempt',p_attempt,'provider',p_provider,'model',p_model,'priceVersion',p_price_version,'intakeDigest',p_intake_digest,'planningDigest',p_planning_digest);
 if turn_private.validate_planning_v2_output_v1(p_output_wire,b) is distinct from true then return jsonb_build_object('kind','blocked');end if;
 cost:=turn_private.planning_v2_usage_cost(p_output_wire,q->'execution');if cost is null then return jsonb_build_object('kind','blocked');end if;
 select * into a from public.model_budget_attempts where scope_id=p_scope and attempt_id=p_attempt for share nowait;
 if not found or a.task_id<>p_task or a.provider<>p_provider or a.model<>p_model or a.price_version<>p_price_version or a.reserved_micros<>(q->'execution'->>'reservedMicros')::bigint or a.status not in ('dispatched','pending','settled') or a.status='settled' and (a.actual_micros is null or a.actual_micros<>cost) or (select count(*) from public.model_budget_attempts where task_id=p_task)<>1 then return jsonb_build_object('kind','blocked');end if;
 select * into o from turn_private.planning_v2_collector_origins where execution_id=(q->>'runId')::uuid for share nowait;
 if not found or o.binding is distinct from b or o.origin_kind is distinct from q->>'originKind' or o.unknown_at is not null or o.response_buffered_at is null or (p_output_wire->>'observedAt')::timestamptz<o.response_buffered_at or (p_output_wire->>'observedAt')::timestamptz>clock_timestamp()+interval '5 seconds' then return jsonb_build_object('kind','blocked');end if;
 select * into saved from turn_private.planning_v2_collector_outputs where execution_id=o.execution_id for share nowait;
 if found then
  if saved.output_wire is distinct from p_output_wire then return jsonb_build_object('kind','conflict');end if;
 else
  insert into turn_private.planning_v2_collector_outputs(execution_id,output_digest,usage_digest,output_wire,usage_receipt_id,usage_wire) values(o.execution_id,p_output_wire->>'outputDigest',p_output_wire->>'usageDigest',p_output_wire,gen_random_uuid(),p_output_wire->'usageReceipt');
 end if;
 return jsonb_build_object('kind','output_recorded','binding',b,'outputDigest',p_output_wire->'outputDigest','usageDigest',p_output_wire->'usageDigest');
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.record_planning_intake_model_output_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb) from public,anon,authenticated,service_role;

create function public.read_planning_intake_model_output_receipt_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text,p_output_digest text,p_usage_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;saved turn_private.planning_v2_collector_outputs%rowtype;
begin
q:=turn_private.planning_v2_exact_model_basis(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;
 select * into saved from turn_private.planning_v2_collector_outputs where execution_id=(q->>'runId')::uuid for share nowait;
 if not found or saved.output_digest is distinct from p_output_digest or saved.usage_digest is distinct from p_usage_digest then return jsonb_build_object('kind','conflict');end if;
 return public.record_planning_intake_model_output_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest,saved.output_wire);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.read_planning_intake_model_output_receipt_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;

create function public.read_planning_intake_model_output_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_scope uuid,p_text_policy uuid,p_price_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;o turn_private.planning_v2_collector_origins%rowtype;saved turn_private.planning_v2_collector_outputs%rowtype;a public.model_budget_attempts%rowtype;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null or q->'execution'->>'scopeId' is distinct from p_scope::text or q->'execution'->>'textPolicyId' is distinct from p_text_policy::text or q->'execution'->>'priceVersion' is distinct from p_price_version then return jsonb_build_object('kind','blocked');end if;
 if (select count(*) from public.model_budget_attempts where task_id=p_task)>1 then return jsonb_build_object('kind','blocked');end if;
 select * into a from public.model_budget_attempts where task_id=p_task and scope_id=p_scope for share nowait;
 if not found then return jsonb_build_object('kind','model_state','state','none');end if;
 if a.status in ('reserved','dispatched','pending') then return jsonb_build_object('kind','model_state','state',a.status);end if;
 if a.status<>'settled' or a.actual_micros is null or a.provider is distinct from q->'execution'->>'provider' or a.model is distinct from q->'execution'->>'model' or a.price_version is distinct from q->'execution'->>'priceVersion' or a.reserved_micros is distinct from (q->'execution'->>'reservedMicros')::bigint then return jsonb_build_object('kind','blocked');end if;
 select * into o from turn_private.planning_v2_collector_origins where execution_id=(q->>'runId')::uuid and scope_id=p_scope and attempt_id=a.attempt_id for share nowait;
 select * into saved from turn_private.planning_v2_collector_outputs where execution_id=(q->>'runId')::uuid for share nowait;
 if o.execution_id is null or saved.execution_id is null or o.unknown_at is not null or o.response_buffered_at is null or o.origin_kind is distinct from q->>'originKind' or saved.usage_wire->>'actualMicros' is distinct from a.actual_micros::text or turn_private.validate_planning_v2_output_v1(saved.output_wire,o.binding) is distinct from true or turn_private.planning_v2_usage_cost(saved.output_wire,q->'execution') is distinct from a.actual_micros then return jsonb_build_object('kind','blocked');end if;
 return jsonb_build_object('kind','model_state','state','settled','binding',o.binding,'output',saved.output_wire);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.read_planning_intake_model_output_v1(uuid,uuid,uuid,uuid,text,text,uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.claim_planning_intake_result_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_action_key text,p_content_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;c turn_private.planning_v2_result_claims%rowtype;added uuid;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null or p_action_key is null or p_content_digest is null or p_action_key !~ '^[a-f0-9]{64}$' or p_content_digest !~ '^[a-f0-9]{64}$' then return jsonb_build_object('kind','blocked');end if;
 insert into turn_private.planning_v2_result_claims values((q->>'runId')::uuid,p_action_key,p_content_digest,p_lease,'started') on conflict do nothing returning execution_id into added;
 if added is not null then return jsonb_build_object('kind','claimed');end if;
 select * into c from turn_private.planning_v2_result_claims where execution_id=(q->>'runId')::uuid for share nowait;
 if c.action_key<>p_action_key or c.content_digest<>p_content_digest then return jsonb_build_object('kind','blocked');end if;
 return jsonb_build_object('kind',case when c.state='unknown' or c.state='started' then 'unknown' else 'duplicate' end);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.claim_planning_intake_result_v1(uuid,uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;

create function public.pause_planning_intake_work_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null or p_reason not in ('waiting','reconciliation','stale','blocked') or p_reason is null then return jsonb_build_object('kind','blocked');end if;
 update turn_private.planning_comparisons set state='paused_unknown' where turn_id=p_turn;
 update turn_private.work set state='queued',lease_token=null,expires_at=null where turn_id=p_turn;
 update turn_private.service_task_capacity set state='released',released_at=clock_timestamp() where task_id=p_task and state='reserved';
 return jsonb_build_object('kind','paused','taskId',p_task,'turnId',p_turn);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.pause_planning_intake_work_v1(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

create table turn_private.planning_v2_completion_proofs (
 execution_id uuid primary key references turn_private.planning_v2_execution_runs(id) on delete cascade,
 transaction_id xid8 not null,owner_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null,turn_id uuid not null,original_lease uuid not null,current_lease uuid not null,
 intake_digest text not null,planning_digest text not null,action_key text not null,content_digest text not null,
 artifact_id uuid not null,scope_id uuid not null,attempt_id uuid not null,output_digest text not null,usage_digest text not null,
 content jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create table turn_private.planning_v2_completed_receipts (
 execution_id uuid primary key references turn_private.planning_v2_completion_proofs(execution_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,task_id uuid not null,turn_id uuid not null,
 artifact_id uuid not null,revision integer not null check(revision=1),receipt jsonb not null
);
revoke all on turn_private.planning_v2_completion_proofs,turn_private.planning_v2_completed_receipts from public,anon,authenticated,service_role;
create trigger immutable_v2_completion_proof before update on turn_private.planning_v2_completion_proofs for each row execute function turn_private.planning_v2_immutable_collector_record();
create trigger immutable_v2_completed_receipt before update on turn_private.planning_v2_completed_receipts for each row execute function turn_private.planning_v2_immutable_collector_record();

create function turn_private.planning_v2_content_digest(p_content jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare bytes text;opts text;
begin
if turn_private.valid_comparison_v1(p_content) is distinct from true or p_content->'actions' is distinct from '[]'::jsonb then return null;end if;
 select string_agg('['||turn_private.planning_v2_json_string_v1(o->>'id')||','||turn_private.planning_v2_json_string_v1(o->>'title')||','||turn_private.planning_v2_json_string_v1(o->>'tradeoff')||']',',' order by n) into opts from jsonb_array_elements(p_content->'options') with ordinality a(o,n);
 bytes:='['||turn_private.planning_v2_json_string_v1(p_content->>'schemaVersion')||','||turn_private.planning_v2_json_string_v1(p_content->>'title')||','||turn_private.planning_v2_json_string_v1(p_content->>'summary')||',['||opts||'],[]]';
 return encode(sha256(convert_to(bytes,'UTF8')),'hex');
exception when lock_not_available then return null;
end $$;
revoke all on function turn_private.planning_v2_content_digest(jsonb) from public,anon,authenticated,service_role;

create function turn_private.planning_v2_completed_current(p_execution uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r turn_private.planning_v2_execution_runs%rowtype;w turn_private.work%rowtype;j turn_private.planning_comparisons%rowtype;p turn_private.planning_v2_execution_profiles%rowtype;t turn_private.service_tasks%rowtype;origin text;d text;
begin
select * into r from turn_private.planning_v2_execution_runs where id=p_execution;if not found then return false;end if;
 origin:=turn_private.planning_v2_collector_principal(r.profile_id);if origin is null or origin<>r.origin_kind then return false;end if;
 select * into p from turn_private.planning_v2_execution_profiles where id=r.profile_id;if to_jsonb(p) is distinct from r.profile_snapshot then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(r.owner_id::text,34));
 perform 1 from auth.users where id=r.owner_id for key share nowait;if not found then return false;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=r.owner_id for update;if not found then return false;end if;
 select * into t from turn_private.service_tasks where id=r.task_id and owner_id=r.owner_id for update nowait;
 if not found or t.last_turn_id<>r.turn_id or t.policy_id<>p.text_policy_id or t.budget_scope_id<>p.scope_id then return false;end if;
 select * into w from turn_private.work where turn_id=r.turn_id and owner_id=r.owner_id;
 if not found or not turn_private.lock_turn(r.turn_id,r.owner_id,w.session_id) then return false;end if;
 select * into j from turn_private.planning_comparisons where turn_id=r.turn_id and owner_id=r.owner_id;
 if not found or j.task_id<>r.task_id or j.planning_policy_id<>p.planning_policy_id or not turn_private.planning_policy_current(j.planning_policy_id)
 or not exists(select 1 from turn_private.planning_consents where owner_id=r.owner_id and policy_id=j.planning_policy_id and consent_id=j.planning_consent_id and revoked_at is null)
 or not exists(select 1 from turn_private.text_content c join turn_private.text_consents k on k.owner_id=c.owner_id and k.policy_id=c.policy_id and k.consent_id=c.consent_id and k.revoked_at is null where c.turn_id=r.turn_id and c.owner_id=r.owner_id and c.hidden_at is null and turn_private.text_policy_current(c.policy_id)) then return false;end if;
 d:=turn_private.assistant_travel_current_basis_v1(r.owner_id,j.message_id);if d is distinct from r.intake_digest then return false;end if;
 if not exists(select 1 from turn_private.assistant_goals g join turn_private.assistant_messages m on m.goal_id=g.id and m.scope_version=g.scope_version where m.id=j.message_id and m.owner_id=r.owner_id and g.owner_id=r.owner_id and g.id=j.goal_id and g.scope_version=j.goal_version and not g.trip_terminal) then return false;end if;
 return true;
exception when lock_not_available then return false;
end $$;
revoke all on function turn_private.planning_v2_completed_current(uuid) from public,anon,authenticated,service_role;

create function turn_private.valid_current_v2_completion_proof(p_turn uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare proof turn_private.planning_v2_completion_proofs%rowtype;r turn_private.planning_v2_execution_runs%rowtype;o turn_private.planning_v2_collector_origins%rowtype;v turn_private.planning_v2_collector_outputs%rowtype;claim turn_private.planning_v2_result_claims%rowtype;
begin
select * into proof from turn_private.planning_v2_completion_proofs where turn_id=p_turn and transaction_id=pg_current_xact_id();if not found then return false;end if;
 select * into r from turn_private.planning_v2_execution_runs where id=proof.execution_id;
 if not found or r.owner_id<>proof.owner_id or r.task_id<>proof.task_id or r.turn_id<>p_turn or r.intake_digest<>proof.intake_digest or r.planning_digest<>proof.planning_digest or not turn_private.planning_v2_completed_current(r.id) then return false;end if;
 select * into o from turn_private.planning_v2_collector_origins where execution_id=r.id;
 select * into v from turn_private.planning_v2_collector_outputs where execution_id=r.id;
 select * into claim from turn_private.planning_v2_result_claims where execution_id=r.id;
 if o.execution_id is null or v.execution_id is null or claim.execution_id is null or o.origin_kind<>r.origin_kind or o.unknown_at is not null or o.response_buffered_at is null or o.binding->>'lease' is distinct from proof.original_lease::text or o.scope_id<>proof.scope_id or o.attempt_id<>proof.attempt_id
 or not exists(select 1 from turn_private.planning_v2_model_attempt_bindings mb where mb.turn_id=p_turn and mb.owner_id=proof.owner_id and mb.task_id=proof.task_id and mb.claim_lease=proof.original_lease and mb.scope_id=proof.scope_id and mb.attempt_id=proof.attempt_id and mb.intake_digest=proof.intake_digest and mb.planning_digest=proof.planning_digest and mb.unknown_at is null)
 or v.output_digest<>proof.output_digest or v.usage_digest<>proof.usage_digest or claim.action_key<>proof.action_key or claim.content_digest<>proof.content_digest or claim.lease_token<>proof.current_lease or claim.state not in ('started','completed')
 or turn_private.planning_v2_content_digest(proof.content) is distinct from proof.content_digest or turn_private.validate_planning_v2_output_v1(v.output_wire,o.binding) is distinct from true
 or not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes sc on sc.id=a.scope_id where a.scope_id=proof.scope_id and a.attempt_id=proof.attempt_id and a.task_id=proof.task_id and sc.owner_id=proof.owner_id and sc.currency='CNY' and a.provider=r.execution->>'provider' and a.model=r.execution->>'model' and a.price_version=r.execution->>'priceVersion' and a.reserved_micros=(r.execution->>'reservedMicros')::bigint and a.status='settled' and a.actual_micros is not null and a.actual_micros=turn_private.planning_v2_usage_cost(v.output_wire,r.execution))
 or not exists(select 1 from turn_private.planning_comparisons where turn_id=p_turn and owner_id=proof.owner_id and task_id=proof.task_id and artifact_id=proof.artifact_id) then return false;end if;
 return true;
exception when lock_not_available then return false;
end $$;
revoke all on function turn_private.valid_current_v2_completion_proof(uuid) from public,anon,authenticated,service_role;

create function public.complete_planning_intake_comparison_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_action_key text,p_scope uuid,p_attempt uuid,p_output_digest text,p_usage_digest text,p_content jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;model jsonb;digest text;key text;c turn_private.planning_v2_result_claims%rowtype;job turn_private.planning_comparisons%rowtype;place turn_private.planning_v2_place_checkpoints%rowtype;w turn_private.work%rowtype;cap turn_private.service_task_capacity%rowtype;locale text;published jsonb;receipt jsonb;capacity_required boolean;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;
 model:=public.read_planning_intake_model_output_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest,p_scope,(q->'execution'->>'textPolicyId')::uuid,q->'execution'->>'priceVersion');
 if model->>'state' is distinct from 'settled' or model->'binding'->>'attempt' is distinct from p_attempt::text or model->'output'->>'outputDigest' is distinct from p_output_digest or model->'output'->>'usageDigest' is distinct from p_usage_digest then return jsonb_build_object('kind','blocked');end if;
 select * into place from turn_private.planning_v2_place_checkpoints where turn_id=p_turn for share nowait;
 select m.locale into locale from turn_private.planning_comparisons j join turn_private.assistant_messages m on m.id=j.message_id where j.turn_id=p_turn;
 if not found or place.state<>'completed' or turn_private.valid_planning_qualified_comparison_v1(p_owner,p_turn,p_lease,p_intake_digest,p_planning_digest,place.observation,locale,p_content) is distinct from true then return jsonb_build_object('kind','blocked');end if;
 digest:=turn_private.planning_v2_content_digest(p_content);
 key:=encode(sha256(convert_to('['||turn_private.planning_v2_json_string_v1(p_task::text)||','||turn_private.planning_v2_json_string_v1(p_turn::text)||','||turn_private.planning_v2_json_string_v1(p_intake_digest)||','||turn_private.planning_v2_json_string_v1(p_planning_digest)||',"result.prepare",'||turn_private.planning_v2_json_string_v1(digest)||']','UTF8')),'hex');
 select * into c from turn_private.planning_v2_result_claims where execution_id=(q->>'runId')::uuid for update nowait;
 if not found or c.state<>'started' or c.lease_token<>p_lease or c.action_key is distinct from p_action_key or c.action_key is distinct from key or c.content_digest is distinct from digest then return jsonb_build_object('kind','unknown');end if;
 select * into job from turn_private.planning_comparisons where turn_id=p_turn for update nowait;
 select * into w from turn_private.work where turn_id=p_turn for update nowait;
 select * into cap from turn_private.service_task_capacity where task_id=p_task for update nowait;
 if not found then
  select capacity_enforced into capacity_required from turn_private.service_tasks where id=p_task;
  if capacity_required then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT';end if;
 elsif cap.state<>'reserved' then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT';end if;
 if cap.tier='journey_pass' and not exists(select 1 from public.storekit_grants g where g.environment=cap.grant_environment and g.transaction_id=cap.grant_transaction_id and g.owner_id=p_owner and g.state='active' and g.starts_at<=cap.admitted_at and g.ends_at>clock_timestamp() for share) then raise exception 'SERVICE_TASK_GRANT_UNAVAILABLE';end if;
 insert into turn_private.planning_v2_completion_proofs values((q->>'runId')::uuid,pg_current_xact_id(),p_owner,p_task,p_turn,(model->'binding'->>'lease')::uuid,p_lease,p_intake_digest,p_planning_digest,p_action_key,digest,job.artifact_id,p_scope,p_attempt,p_output_digest,p_usage_digest,p_content,clock_timestamp());
 update turn_private.text_content set output_kind='answered',output_text=p_content->>'summary' where turn_id=p_turn and owner_id=p_owner;
 perform turn_private.terminal(p_turn,'completed',w.attempt);
 update turn_private.service_task_capacity set state='settled',settled_turn_id=p_turn,settled_at=clock_timestamp() where task_id=p_task;
 published:=public.publish_comparison_result_v1(p_owner,job.artifact_id,0,job.publication_key,p_task,job.goal_id,job.message_id,null,null,job.goal_version,job.memory_basis,p_content);
 if published->>'kind' is distinct from 'published' or published->'reused' is distinct from 'false'::jsonb then raise exception 'PLANNING_INCOMPLETE';end if;
 update turn_private.planning_v2_result_claims set state='completed' where execution_id=(q->>'runId')::uuid;
 update turn_private.planning_comparisons set state='completed' where turn_id=p_turn;
 receipt:=jsonb_build_object('kind','published','taskId',p_task,'turnId',p_turn,'artifactId',job.artifact_id,'revision',1);
 insert into turn_private.planning_v2_completed_receipts values((q->>'runId')::uuid,p_owner,p_task,p_turn,job.artifact_id,1,receipt);
 return receipt;
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.complete_planning_intake_comparison_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create function public.read_completed_planning_intake_receipt_v1(p_owner uuid,p_task uuid,p_turn uuid,p_artifact uuid,p_intake_digest text,p_planning_digest text,p_scope uuid,p_attempt uuid,p_output_digest text,p_usage_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r turn_private.planning_v2_execution_runs%rowtype;proof turn_private.planning_v2_completion_proofs%rowtype;receipt turn_private.planning_v2_completed_receipts%rowtype;
begin
select * into r from turn_private.planning_v2_execution_runs where turn_id=p_turn and owner_id=p_owner and task_id=p_task;
 if not found or r.intake_digest is distinct from p_intake_digest or r.planning_digest is distinct from p_planning_digest or not turn_private.planning_v2_completed_current(r.id) then return jsonb_build_object('kind','blocked');end if;
 select * into proof from turn_private.planning_v2_completion_proofs where execution_id=r.id;
 select * into receipt from turn_private.planning_v2_completed_receipts where execution_id=r.id;
 if proof.execution_id is null or receipt.execution_id is null or proof.artifact_id is distinct from p_artifact or proof.scope_id is distinct from p_scope or proof.attempt_id is distinct from p_attempt or proof.output_digest is distinct from p_output_digest or proof.usage_digest is distinct from p_usage_digest
 or not exists(select 1 from turn_private.result_artifacts a join turn_private.result_revisions v on v.artifact_id=a.id and v.revision=a.current_revision join turn_private.result_events e on e.artifact_id=a.id and e.revision=v.revision and e.event_type='ready' where a.id=p_artifact and a.owner_id=p_owner and a.lifecycle='active' and a.current_revision=receipt.revision and v.task_turn_id=p_turn and v.content=proof.content)
 or not exists(select 1 from public.turns where id=p_turn and owner_id=p_owner and status='completed')
 or not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes sc on sc.id=a.scope_id join turn_private.planning_v2_collector_origins o on o.scope_id=a.scope_id and o.attempt_id=a.attempt_id join turn_private.planning_v2_collector_outputs v on v.execution_id=o.execution_id where o.execution_id=r.id and a.scope_id=p_scope and a.attempt_id=p_attempt and a.task_id=p_task and sc.owner_id=p_owner and sc.currency='CNY' and a.provider=r.execution->>'provider' and a.model=r.execution->>'model' and a.price_version=r.execution->>'priceVersion' and a.reserved_micros=(r.execution->>'reservedMicros')::bigint and a.status='settled' and a.actual_micros is not null and a.actual_micros=turn_private.planning_v2_usage_cost(v.output_wire,r.execution) and o.origin_kind=r.origin_kind and o.unknown_at is null and o.response_buffered_at is not null and v.output_digest=p_output_digest and v.usage_digest=p_usage_digest) then return jsonb_build_object('kind','stale');end if;
 return receipt.receipt;
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.read_completed_planning_intake_receipt_v1(uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create or replace function turn_private.reject_unavailable_intake_completion_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if new.state='completed' and exists(select 1 from turn_private.work where turn_id=new.turn_id and execution_mode='planning_intake_comparison_v2') and turn_private.valid_current_v2_completion_proof(new.turn_id) is distinct from true then raise exception 'V2_EXECUTION_UNAVAILABLE';end if;
 return new;
end $$;
revoke all on function turn_private.reject_unavailable_intake_completion_v1() from public,anon,authenticated,service_role;

create function public.planning_intake_budget_v1(p_effect text,p_binding jsonb,p_reserved_micros bigint default null,p_actual_micros bigint default null,p_outcome text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;b jsonb;a public.model_budget_attempts%rowtype;saved turn_private.planning_v2_collector_outputs%rowtype;decision jsonb;
begin
 if turn_private.planning_v2_binding_bytes_v1(p_binding) is null or p_effect not in ('reserve','dispatch','finish') or p_effect is null then return jsonb_build_object('kind','invalid');end if;
 b:=p_binding;
 q:=turn_private.planning_v2_exact_model_basis((b->>'owner')::uuid,(b->>'task')::uuid,(b->>'turn')::uuid,(b->>'lease')::uuid,(b->>'textPolicy')::uuid,(b->>'planningPolicy')::uuid,(b->>'scope')::uuid,(b->>'attempt')::uuid,b->>'provider',b->>'model',b->>'priceVersion',b->>'intakeDigest',b->>'planningDigest');
 if q is null then return jsonb_build_object('kind','unavailable');end if;
 if p_effect='reserve' then
  if p_reserved_micros is distinct from (q->'execution'->>'reservedMicros')::bigint or p_actual_micros is not null or p_outcome is not null then return jsonb_build_object('kind','invalid');end if;
  decision:=public.authorize_planning_intake_model_v1((b->>'owner')::uuid,(b->>'task')::uuid,(b->>'turn')::uuid,(b->>'lease')::uuid,(b->>'textPolicy')::uuid,(b->>'planningPolicy')::uuid,(b->>'scope')::uuid,(b->>'attempt')::uuid,b->>'provider',b->>'model',b->>'priceVersion',b->>'intakeDigest',b->>'planningDigest','model_reserve');
  if decision->>'kind' is distinct from 'authorized' then return jsonb_build_object('kind','unavailable');end if;
  return public.reserve_model_budget((b->>'scope')::uuid,(b->>'owner')::uuid,(b->>'task')::uuid,(b->>'attempt')::uuid,b->>'provider',b->>'model',b->>'priceVersion',p_reserved_micros);
 end if;
 if p_reserved_micros is not null then return jsonb_build_object('kind','invalid');end if;
 if p_effect='dispatch' then
  if p_actual_micros is not null or p_outcome is not null then return jsonb_build_object('kind','invalid');end if;
  decision:=public.authorize_planning_intake_model_v1((b->>'owner')::uuid,(b->>'task')::uuid,(b->>'turn')::uuid,(b->>'lease')::uuid,(b->>'textPolicy')::uuid,(b->>'planningPolicy')::uuid,(b->>'scope')::uuid,(b->>'attempt')::uuid,b->>'provider',b->>'model',b->>'priceVersion',b->>'intakeDigest',b->>'planningDigest','model_dispatch');
  if decision->>'kind' is distinct from 'authorized' then return jsonb_build_object('kind','unavailable');end if;
  return public.dispatch_model_budget((b->>'scope')::uuid,(b->>'owner')::uuid,(b->>'attempt')::uuid);
 end if;
 select * into a from public.model_budget_attempts where scope_id=(b->>'scope')::uuid and attempt_id=(b->>'attempt')::uuid for share nowait;
 if not found or a.task_id::text<>b->>'task' or a.provider<>b->>'provider' or a.model<>b->>'model' or a.price_version<>b->>'priceVersion' or (select count(*) from public.model_budget_attempts where task_id=(b->>'task')::uuid)<>1 then return jsonb_build_object('kind','unavailable');end if;
 if p_outcome='settle' then
  select * into saved from turn_private.planning_v2_collector_outputs where execution_id=(q->>'runId')::uuid;
  if not found or p_actual_micros is null or p_actual_micros is distinct from turn_private.planning_v2_usage_cost(saved.output_wire,q->'execution') or saved.output_wire->'binding' is distinct from b
  or public.read_planning_intake_model_output_receipt_v1((b->>'owner')::uuid,(b->>'task')::uuid,(b->>'turn')::uuid,(b->>'lease')::uuid,(b->>'textPolicy')::uuid,(b->>'planningPolicy')::uuid,(b->>'scope')::uuid,(b->>'attempt')::uuid,b->>'provider',b->>'model',b->>'priceVersion',b->>'intakeDigest',b->>'planningDigest',saved.output_digest,saved.usage_digest)->>'kind' is distinct from 'output_recorded' then return jsonb_build_object('kind','unavailable');end if;
 elsif p_outcome='pending' then
  if p_actual_micros is not null or a.status not in ('dispatched','pending') then return jsonb_build_object('kind','conflict');end if;
 elsif p_outcome='release' then
  if p_actual_micros is not null or a.status<>'reserved' or exists(select 1 from turn_private.planning_v2_collector_origins where execution_id=(q->>'runId')::uuid) then return jsonb_build_object('kind','conflict');end if;
 else return jsonb_build_object('kind','invalid');end if;
 return public.finish_model_budget((b->>'scope')::uuid,(b->>'owner')::uuid,(b->>'attempt')::uuid,p_outcome,p_actual_micros);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');
end $$;
revoke all on function public.planning_intake_budget_v1(text,jsonb,bigint,bigint,text) from public,anon,authenticated,service_role;

create function turn_private.valid_current_v2_publication_proof(p_owner uuid,p_artifact uuid,p_expected_revision integer,p_idempotency_key uuid,p_task uuid,p_goal uuid,p_message uuid,p_trip uuid,p_trip_version integer,p_goal_version integer,p_memory_basis jsonb,p_content jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare proof turn_private.planning_v2_completion_proofs%rowtype;j turn_private.planning_comparisons%rowtype;
begin
 if p_expected_revision is distinct from 0 or p_trip is not null or p_trip_version is not null or turn_private.valid_comparison_v1(p_content) is distinct from true then return false;end if;
 select * into proof from turn_private.planning_v2_completion_proofs where owner_id=p_owner and artifact_id=p_artifact and task_id=p_task and transaction_id=pg_current_xact_id();
 if not found or proof.content is distinct from p_content or turn_private.valid_current_v2_completion_proof(proof.turn_id) is distinct from true then return false;end if;
 select * into j from turn_private.planning_comparisons where turn_id=proof.turn_id;
 if not found or j.state<>'queued' or j.publication_key is distinct from p_idempotency_key or j.goal_id is distinct from p_goal or j.message_id is distinct from p_message or j.goal_version is distinct from p_goal_version or j.memory_basis is distinct from p_memory_basis
 or not exists(select 1 from public.turns t join turn_private.work w on w.turn_id=t.id join turn_private.text_content c on c.turn_id=t.id where t.id=proof.turn_id and t.owner_id=p_owner and t.status='completed' and w.state='completed' and w.lease_token is null and c.output_kind='answered' and c.output_text=p_content->>'summary')
 or exists(select 1 from turn_private.result_artifacts where id=p_artifact)
 or exists(select 1 from turn_private.planning_v2_completed_receipts where execution_id=proof.execution_id)
 or not exists(select 1 from turn_private.planning_v2_result_claims where execution_id=proof.execution_id and state='started') then return false;end if;
 return true;
exception when lock_not_available then return false;
end $$;
revoke all on function turn_private.valid_current_v2_publication_proof(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Existing publisher role fence only. All domain validation, signature and ACL stay intact.
do $$
declare f oid;definition text;needle text;replacement text;
begin
 f:='turn_private.publish_result_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb)'::regprocedure;
 definition:=pg_get_functiondef(f);
 needle:='if (select auth.role())<>''service_role'' or p_owner_id is null';
 replacement:='if ((select auth.role()) is distinct from ''service_role'' and turn_private.valid_current_v2_publication_proof(p_owner_id,p_artifact_id,p_expected_revision,p_idempotency_key,p_task_id,p_goal_id,p_input_message_id,p_trip_id,p_trip_version,p_goal_version,p_memory_basis,p_content) is distinct from true) or p_owner_id is null';
 if position(needle in definition)=0 then raise exception 'V2_PUBLISHER_DEPENDENCY_CHANGED';end if;
 execute replace(definition,needle,replacement);
end $$;
notify pgrst,'reload schema';

do $$ declare name text;begin
 foreach name in array array['planning_v2_registered_tariffs','planning_v2_collector_principals','planning_v2_execution_profiles','planning_v2_execution_runs','planning_v2_external_call_windows','planning_v2_collector_origins','planning_v2_collector_outputs','planning_v2_result_claims','planning_v2_completion_proofs','planning_v2_completed_receipts'] loop execute format('alter table turn_private.%I enable row level security',name);end loop;
end $$;
