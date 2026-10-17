-- SYNTHETIC OWN EMPTY PG ONLY; NOT A DEPLOYMENT MIGRATION.
begin;
create schema identity_private; create schema turn_private; revoke all on schema identity_private,turn_private from public;

create function turn_private.valid_text(p_text text,p_max integer)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(length(btrim(p_text,E' \t\n\r\f\v'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0 and
    (select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0) from regexp_split_to_table(p_text,'') c)<=p_max,false)
$$;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  head_version integer not null default 0 check (head_version >= 0),
  title text not null check (char_length(title) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.turns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  status text not null check (status in ('accepted', 'completed', 'unavailable', 'failed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_turn_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  turn_id uuid not null references public.turns(id) on delete cascade,
  event_id text not null check (char_length(event_id) between 1 and 160),
  sequence integer not null check (sequence > 0),
  schema_version text not null check (schema_version = 'turn-sse-v1'),
  event_type text not null check (event_type in ('accepted', 'phase', 'progress', 'answer', 'card', 'proposal', 'terminal')),
  state text not null check (state in ('accepted', 'planning', 'retrieving', 'generating', 'validating', 'completed', 'proposal_ready', 'unavailable', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (turn_id, sequence),
  unique (turn_id, event_id)
);

create table public.chat_turn_idempotency (
  owner_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  digest text not null check (char_length(digest) between 1 and 160),
  turn_id uuid not null references public.turns(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, thread_id, idempotency_key)
);

create table public.user_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  travel_pace text not null default 'balanced' check (travel_pace in ('relaxed', 'balanced', 'packed')),
  locale text not null default 'zh' check (locale in ('zh', 'en', 'es', 'ru', 'ar')),
  currency text not null default 'CNY' check (currency in ('CNY', 'USD', 'EUR', 'RUB', 'SAR')),
  distance_unit text not null default 'kilometre' check (distance_unit in ('kilometre', 'mile')),
  temperature_unit text not null default 'celsius' check (temperature_unit in ('celsius', 'fahrenheit')),
  default_departure_time time not null default '09:00:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table identity_private.mobile_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  epoch bigint not null default 0,
  session_id uuid
);

create table identity_private.mobile_attempts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  session_id uuid not null unique,
  epoch bigint not null,
  primary key(owner_id, attempt_id)
);

create table identity_private.mobile_login_proofs (
  session_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  expires_at timestamptz not null
);

create table public.model_budget_scopes (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  currency text not null check (currency in ('CNY', 'USD')),
  limit_micros bigint not null check (limit_micros between 1 and 1000000000000),
  task_limit_micros bigint not null check (task_limit_micros between 1 and limit_micros),
  task_attempt_limit integer not null check (task_attempt_limit between 1 and 1000),
  concurrency_limit integer not null check (concurrency_limit between 1 and 1000),
  enabled boolean not null default false,
  frozen boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.model_budget_provider_limits (
  scope_id uuid not null references public.model_budget_scopes(id) on delete restrict,
  provider text not null check (provider in ('qwen', 'glm', 'deepseek')),
  model text not null check (model ~ '^[A-Za-z0-9._-]{1,100}$'),
  price_version text not null check (price_version ~ '^[A-Za-z0-9._-]{1,100}$'),
  limit_micros bigint not null check (limit_micros between 1 and 1000000000000),
  attempt_limit_micros bigint not null check (attempt_limit_micros between 1 and limit_micros),
  enabled boolean not null default false,
  primary key (scope_id, provider)
);

create table public.model_budget_attempts (
  scope_id uuid not null,
  attempt_id uuid not null,
  task_id uuid not null,
  provider text not null,
  model text not null,
  price_version text not null,
  reserved_micros bigint not null check (reserved_micros between 1 and 1000000000000),
  actual_micros bigint check (actual_micros between 0 and 1000000000000),
  status text not null check (status in ('reserved','dispatched','pending','settled','released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope_id, attempt_id),
  foreign key (scope_id, provider) references public.model_budget_provider_limits(scope_id, provider) on delete restrict,
  check ((status = 'settled') = (actual_micros is not null))
);

create table turn_private.work (
  turn_id uuid primary key references public.turns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  state text not null default 'queued' check(state in ('queued','leased','completed','failed','cancelled','quarantined')),
  attempt integer not null default 0 check(attempt between 0 and 5),
  max_attempts integer not null check(max_attempts between 1 and 5),
  lease_ms integer not null check(lease_ms between 1000 and 300000),
  lease_token uuid,
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((state='leased') = (lease_token is not null and expires_at is not null)),
  check (state='leased' or (lease_token is null and expires_at is null))
);

create table turn_private.text_policies (
  id uuid primary key,
  provider text not null check(provider in ('qwen','glm','deepseek')),
  recipient text not null check(length(btrim(recipient)) between 1 and 200),
  endpoint text not null check(endpoint ~ '^https://[^/?#@]+/[^?#]*$'),
  source_region text not null check(length(btrim(source_region)) between 1 and 100),
  processing_region text not null check(length(btrim(processing_region)) between 1 and 100),
  storage_region text not null check(length(btrim(storage_region)) between 1 and 100),
  terms_version text not null check(length(btrim(terms_version)) between 1 and 200),
  notice_version text not null check(length(btrim(notice_version)) between 1 and 100),
  notice_hash text not null check(notice_hash ~ '^[a-f0-9]{64}$'),
  notice_zh text not null check(length(btrim(notice_zh)) between 1 and 8000),
  notice_en text not null check(length(btrim(notice_en)) between 1 and 8000),
  retention text not null check(retention='retain_after_hide_v1'),
  effective_at timestamptz not null,
  expires_at timestamptz not null,
  terms_recheck_at timestamptz not null,
  revoked_at timestamptz,
  check(effective_at<expires_at and effective_at<terms_recheck_at)
);

create table turn_private.text_consents (
  owner_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references turn_private.text_policies(id),
  consent_id uuid not null unique default gen_random_uuid(),
  accepted_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  primary key(owner_id,policy_id)
);

create table turn_private.text_content (
  turn_id uuid primary key,
  owner_id uuid not null,
  thread_id uuid not null,
  policy_id uuid not null references turn_private.text_policies(id),
  consent_id uuid not null,
  locale text not null check(locale in ('zh','en','es','ru','ar')),
  input_text text not null,
  output_kind text check(output_kind in ('answered','partial','clarification','blocked','technical_failure')),
  output_text text,
  hidden_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((output_text is null)=(output_kind is null))
);

create table turn_private.text_dispatches (
  lease_token uuid primary key,
  turn_id uuid not null,
  consent_id uuid not null,
  policy_id uuid not null,
  dispatched_at timestamptz not null default clock_timestamp()
);

create table turn_private.service_tasks (
  id uuid primary key,
  owner_id uuid not null,
  thread_id uuid not null unique,
  goal_turn_id uuid not null references turn_private.text_content(turn_id) deferrable initially deferred,
  last_turn_id uuid not null references turn_private.text_content(turn_id) deferrable initially deferred,
  policy_id uuid not null references turn_private.text_policies(id),
  consent_id uuid not null,
  scope_version integer not null check(scope_version=1),
  expected_result text not null default 'text_answer' check(expected_result='text_answer'),
  goal_digest text not null check(goal_digest ~ '^[a-f0-9]{64}$'),
  budget_scope_id uuid,
  created_at timestamptz not null default clock_timestamp()
);

create table turn_private.service_task_turns (
  turn_id uuid primary key references turn_private.text_content(turn_id) deferrable initially deferred,
  task_id uuid not null references turn_private.service_tasks(id),
  owner_id uuid not null,
  parent_turn_id uuid references turn_private.text_content(turn_id),
  relationship text not null check(relationship in ('new_goal','clarification','repair')),
  idempotency_key uuid not null,
  request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
  unique(owner_id,task_id,idempotency_key),
  unique(task_id,parent_turn_id),
  check((relationship='new_goal')=(parent_turn_id is null))
);

create table turn_private.grounded_turns (
 turn_id uuid primary key references turn_private.text_content(turn_id) deferrable initially deferred,
 owner_id uuid not null,
 task_id uuid not null references turn_private.service_tasks(id) deferrable initially deferred,
 city text not null check(city in ('shanghai','beijing','guangzhou','chongqing')),
 locale text not null check(locale in ('zh','en')),
 scope_version integer not null default 1 check(scope_version=1),
 intent text check(intent in ('rail_boarding_documents','clarification','unsupported','technical_failure','blocked')),
 request_scope text check(request_scope in ('single','additional_needs','unknown')),
 original_outcome text check(original_outcome in ('answered','partial','clarification','blocked','technical_failure')),
 basis jsonb,
 completed_at timestamptz,
 check((intent is null)=(completed_at is null)),
 check((intent is null)=(original_outcome is null)),
 check((intent is null)=(request_scope is null)),
 check(basis is null or jsonb_typeof(basis)='object')
);

create table turn_private.service_task_capacity_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  policy_version text not null default 'service-task-development/1'
);

create table turn_private.service_task_capacity (
  task_id uuid primary key references turn_private.service_tasks(id),
  owner_id uuid not null,
  policy_version text not null check (policy_version='service-task-development/1'),
  tier text not null check (tier in ('free','journey_pass')),
  grant_environment text,
  grant_transaction_id text,
  admitted_at timestamptz not null,
  state text not null check (state in ('reserved','settled','released')),
  settled_turn_id uuid,
  settled_at timestamptz,
  released_at timestamptz,
  check ((tier='free' and grant_environment is null and grant_transaction_id is null)
    or (tier='journey_pass' and grant_environment='Sandbox' and grant_transaction_id is not null)),
  check ((state='settled')=(settled_turn_id is not null and settled_at is not null)),
  check ((state='released')=(released_at is not null))
);

create table turn_private.hosted_worker_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  changed_at timestamptz not null default clock_timestamp(),
  reason text check (reason is null or reason ~ '^[A-Za-z0-9 ._:#/-]{1,200}$')
);

create table turn_private.hosted_worker_heartbeats (
  worker_id uuid primary key,
  build text not null check (build ~ '^[A-Za-z0-9._-]{1,64}$'),
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  phase text not null check (phase in ('started','polling','idle','disabled','draining','stopped')),
  last_result text check (last_result in ('empty','finished','queued','unavailable','disabled','skipped')),
  polls bigint not null default 0 check (polls >= 0),
  finished bigint not null default 0 check (finished >= 0),
  unavailable bigint not null default 0 check (unavailable >= 0),
  skipped bigint not null default 0 check (skipped >= 0),
  stop_reason text check (stop_reason in ('stopped','expired','unavailable'))
);

create table turn_private.assistant_conversations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references turn_private.text_policies(id),
  consent_id uuid not null,
  next_sequence bigint not null default 1 check(next_sequence between 1 and 1000001),
  created_at timestamptz not null default clock_timestamp()
);

create table turn_private.assistant_goals (
  id uuid primary key,
  conversation_id uuid not null references turn_private.assistant_conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope_version integer not null default 1 check(scope_version between 1 and 10000),
  current_text text not null check(turn_private.valid_text(current_text,4000)),
  created_at timestamptz not null default clock_timestamp()
);

create table turn_private.assistant_messages (
  id uuid primary key,
  conversation_id uuid not null references turn_private.assistant_conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  sequence bigint not null,
  idempotency_key uuid not null,
  request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
  policy_id uuid not null references turn_private.text_policies(id),
  consent_id uuid not null,
  locale text not null check(locale in ('zh','en')),
  input_text text not null check(turn_private.valid_text(input_text,4000)),
  relationship text not null check(relationship in ('independent_question','goal_start','follow_up','amendment','clarification')),
  goal_id uuid references turn_private.assistant_goals(id),
  scope_version integer,
  task_id uuid references turn_private.service_tasks(id),
  parent_message_id uuid references turn_private.assistant_messages(id),
  turn_id uuid references turn_private.text_content(turn_id),
  created_at timestamptz not null default clock_timestamp(),
  unique(conversation_id,sequence),
  unique(owner_id,idempotency_key),
  check((relationship='independent_question')=(turn_id is not null)),
  check((goal_id is null)=(scope_version is null))
);

-- Fixed final shape for the selected read/session contract, not historical apply.
alter table public.turns add column thread_id uuid references public.chat_threads(id) on delete cascade;
alter table public.turns add column updated_at timestamptz not null default now();
alter table public.turns drop constraint turns_status_check;
alter table public.turns add constraint turns_status_check check(status in ('accepted','planning','retrieving','generating','validating','completed','proposal_ready','unavailable','failed','cancelled'));
alter table turn_private.text_policies add column context_mode text not null default 'current_input_v1' check(context_mode in ('current_input_v1','task_history_v1','knowledge_intent_v1','qa_session_history_v1'));
alter table turn_private.service_task_turns drop constraint service_task_turns_relationship_check;
alter table turn_private.service_task_turns add constraint service_task_turns_relationship_check check(relationship in ('new_goal','clarification','repair','qa_followup','qa_correction'));
create index baseline_threads_owner on public.chat_threads(owner_id,updated_at desc);
create index baseline_turns_thread on public.turns(thread_id,created_at);
create index baseline_content_thread on turn_private.text_content(thread_id);
alter table turn_private.work add column execution_mode text not null default 'text' check(execution_mode in ('text','planning_comparison_v1'));
alter table turn_private.service_tasks add column capacity_enforced boolean not null default false;
alter table turn_private.grounded_turns add column selected_place_request jsonb;


create function identity_private.prepare_mobile_v2(p_owner uuid,p_session uuid,p_attempt uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.jwt()->>'role' is distinct from 'service_role' or p_attempt is null or not exists(
    select 1 from auth.sessions where id=p_session and user_id=p_owner and created_at>now()-interval '2 minutes'
  ) or exists(select 1 from identity_private.mobile_attempts where session_id=p_session) then raise exception 'UNAUTHENTICATED'; end if;
  insert into identity_private.mobile_login_proofs values(p_session,p_owner,p_attempt,now()+interval '2 minutes') on conflict do nothing;
  if not exists(select 1 from identity_private.mobile_login_proofs where session_id=p_session and owner_id=p_owner and attempt_id=p_attempt) then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
end $$;

create function public.native_prepare_v2(p_owner uuid,p_session uuid,p_attempt uuid)
returns void language sql security invoker set search_path='' as $$
  select identity_private.prepare_mobile_v2(p_owner,p_session,p_attempt);
$$;

create function identity_private.mobile_session_v2(p_action text, p_attempt uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  s uuid := (auth.jwt()->>'session_id')::uuid;
  a identity_private.mobile_accounts%rowtype;
  prior identity_private.mobile_attempts%rowtype;
begin
  if u is null or s is null or auth.jwt()->>'role' is distinct from 'authenticated'
     or (auth.jwt()->>'is_anonymous')::boolean is distinct from false
     or not exists(select 1 from auth.sessions where id=s and user_id=u) then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_action = 'login' then
    if p_attempt is null then raise exception 'INVALID_INPUT'; end if;
    insert into identity_private.mobile_accounts(owner_id) values(u) on conflict do nothing;
  end if;
  select * into a from identity_private.mobile_accounts where owner_id=u for update;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  -- Recheck after acquiring the shared serialization lock.
  if not exists(select 1 from auth.sessions where id=s and user_id=u) then raise exception 'SESSION_REPLACED'; end if;
  if p_action = 'login' then
    select * into prior from identity_private.mobile_attempts where owner_id=u and attempt_id=p_attempt;
    if found then
      if prior.session_id <> s then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
      if a.session_id is distinct from s or a.epoch <> prior.epoch then raise exception 'SESSION_REPLACED'; end if;
    else
      if not exists(select 1 from identity_private.mobile_login_proofs where session_id=s and owner_id=u and attempt_id=p_attempt and expires_at>now()) then raise exception 'UNAUTHENTICATED'; end if;
      if exists(select 1 from identity_private.mobile_attempts where session_id=s) then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
      -- Only the previous MOBILE session is revoked. Other Auth sessions are Web and coexist.
      delete from auth.sessions where id=a.session_id and user_id=u;
      update identity_private.mobile_accounts set epoch=epoch+1, session_id=s where owner_id=u returning * into a;
      insert into identity_private.mobile_attempts values(u,p_attempt,s,a.epoch);
    end if;
  elsif p_action in ('session','logout') then
    if a.session_id is distinct from s then raise exception 'SESSION_REPLACED'; end if;
    if p_action='logout' then
      update identity_private.mobile_accounts set session_id=null where owner_id=u;
      delete from auth.sessions where id=s and user_id=u;
    end if;
  else raise exception 'INVALID_INPUT';
  end if;
  return jsonb_build_object('version',2,'subject',u,'sessionId',s,'mobileEpoch',a.epoch);
end $$;

create function public.native_session_v2(p_action text,p_attempt uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select identity_private.mobile_session_v2(p_action,p_attempt);
$$;

create function identity_private.mobile_access_v2()
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); s uuid := (auth.jwt()->>'session_id')::uuid; a identity_private.mobile_accounts%rowtype;
begin
  if s is not null and u is not null and not exists(select 1 from auth.sessions where id=s and user_id=u) then return false; end if;
  if not exists(select 1 from identity_private.mobile_attempts where session_id=s) and not exists(select 1 from identity_private.mobile_login_proofs where session_id=s) then return true; end if;
  select * into a from identity_private.mobile_accounts where owner_id=u;
  return coalesce(a.session_id=s and exists(select 1 from auth.sessions where id=s and user_id=u),false);
end $$;

create function identity_private.guard_mobile_write_v2()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from identity_private.mobile_accounts where owner_id=auth.uid() for update;
  if not identity_private.mobile_access_v2() then raise exception 'SESSION_REPLACED'; end if;
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;

create function identity_private.guard_mobile_rpc_v2()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from identity_private.mobile_accounts where owner_id=auth.uid() for update;
  if not identity_private.mobile_access_v2() then raise exception 'SESSION_REPLACED'; end if;
end $$;

create or replace function turn_private.lock_turn(p_turn uuid,p_owner uuid,p_session uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare t public.turns%rowtype;
begin
  perform 1 from auth.users where id=p_owner for key share nowait;
  if not found then return false; end if;
  perform 1 from identity_private.mobile_accounts where owner_id=p_owner for update;
  perform 1 from auth.sessions where id=p_session and user_id=p_owner for key share;
  if not found then return false; end if;
  if exists(select 1 from identity_private.mobile_login_proofs where session_id=p_session)
     or exists(select 1 from identity_private.mobile_attempts where session_id=p_session) then
    if not exists(select 1 from identity_private.mobile_accounts where owner_id=p_owner and session_id=p_session) then return false; end if;
  end if;
  select * into t from public.turns where id=p_turn and owner_id=p_owner for update;
  if not found or t.thread_id is null then return false; end if;
  perform 1 from public.chat_threads where id=t.thread_id and owner_id=p_owner and status='active' for update nowait;
  return found;
end $$;

create function turn_private.text_owner()
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  if u is null or s is null then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from auth.users where id=u for key share nowait;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  insert into identity_private.mobile_accounts(owner_id) values(u) on conflict do nothing;
  perform identity_private.guard_mobile_rpc_v2();
  perform 1 from auth.sessions where id=s and user_id=u for key share;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  return u;
end $$;

create function turn_private.text_policy_current(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare p turn_private.text_policies%rowtype;
begin
  select * into p from turn_private.text_policies where id=p_id for share;
  return found and p.revoked_at is null and p.effective_at<=clock_timestamp()
    and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp();
end $$;

create function turn_private.immutable_text_policy()
returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='DELETE' or (to_jsonb(NEW)-'revoked_at') is distinct from (to_jsonb(OLD)-'revoked_at')
     or OLD.revoked_at is not null or NEW.revoked_at is null or NEW.revoked_at>clock_timestamp() then raise exception 'IMMUTABLE_POLICY'; end if;
  return NEW;
end $$;

create function public.accept_text_policy(p_policy_id uuid,p_notice_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype;
begin
  if not turn_private.text_policy_current(p_policy_id) or not exists(select 1 from turn_private.text_policies where id=p_policy_id and notice_hash=p_notice_hash) then return jsonb_build_object('kind','blocked'); end if;
  insert into turn_private.text_consents(owner_id,policy_id) values(u,p_policy_id) on conflict do nothing;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id for update;
  if c.revoked_at is not null then return jsonb_build_object('kind','blocked'); end if;
  return jsonb_build_object('kind','accepted','consentId',c.consent_id,'policyId',c.policy_id);
end $$;

create function public.withdraw_text_policy(p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();
begin
  update turn_private.text_consents set revoked_at=coalesce(revoked_at,clock_timestamp()) where owner_id=u and policy_id=p_policy_id;
  return jsonb_build_object('kind','withdrawn');
end $$;

create function public.start_text_turn(p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype; t record; prior turn_private.text_content%rowtype; admitted jsonb;
begin
  if p_turn_id is null or p_idempotency_key is null or p_locale is null or p_locale not in ('zh','en','es','ru','ar') or not turn_private.valid_text(p_text,4000) then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then return jsonb_build_object('kind','blocked'); end if;
  select * into t from public.start_chat_turn(p_thread_id,p_turn_id,p_idempotency_key,'chat-state-control-v1');
  select * into prior from turn_private.text_content where turn_id=t.turn_id;
  if found then
    if prior.owner_id<>u or prior.hidden_at is not null or prior.policy_id<>p_policy_id or prior.consent_id<>c.consent_id or prior.input_text<>p_text or prior.locale<>p_locale then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    return jsonb_build_object('kind','accepted','turnId',t.turn_id,'reused',true);
  end if;
  if t.reused then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
  insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text) values(t.turn_id,u,p_thread_id,p_policy_id,c.consent_id,p_locale,p_text);
  admitted:=public.enqueue_turn_work(t.turn_id,u,(auth.jwt()->>'session_id')::uuid,120000,3);
  if admitted->>'kind'<>'queued' then raise exception 'TURN_UNAVAILABLE'; end if;
  return jsonb_build_object('kind','accepted','turnId',t.turn_id,'reused',false);
end $$;

create or replace function turn_private.terminal(p_turn uuid,p_state text,p_attempt integer)
returns void language plpgsql security definer set search_path='' as $$
declare t public.turns%rowtype; seq integer; final_state text;
begin
  select * into t from public.turns where id=p_turn for update;
  if not found then return; end if;
  if t.status in ('completed','proposal_ready','unavailable','failed','cancelled') then
    update turn_private.work set state=case when t.status='cancelled' then 'cancelled' when t.status in ('completed','proposal_ready') then 'completed' else 'failed' end,lease_token=null,expires_at=null where turn_id=p_turn;
    return;
  end if;
  final_state:=case when p_state='quarantined' then 'failed' else p_state end;
  select max(sequence)+1 into seq from public.chat_turn_events where turn_id=p_turn;
  if seq is null then raise exception 'MISSING_ACCEPTED_EVENT'; end if;
  insert into public.chat_turn_events(owner_id,thread_id,turn_id,event_id,sequence,schema_version,event_type,state)
    values(t.owner_id,t.thread_id,p_turn,'worker-terminal-'||p_attempt,seq,'turn-sse-v1','terminal',final_state);
  update public.turns set status=final_state,updated_at=clock_timestamp() where id=p_turn;
  update public.chat_threads set updated_at=clock_timestamp() where id=t.thread_id;
  update turn_private.work set state=case when p_state='unavailable' then 'failed' else p_state end,lease_token=null,expires_at=null where turn_id=p_turn;
end $$;

create function turn_private.hide_text_content()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if TG_TABLE_SCHEMA='auth' then update turn_private.text_content set hidden_at=coalesce(hidden_at,clock_timestamp()) where owner_id=OLD.id;
  elsif TG_TABLE_NAME='chat_threads' then update turn_private.text_content set hidden_at=coalesce(hidden_at,clock_timestamp()) where thread_id=OLD.id;
  else update turn_private.text_content set hidden_at=coalesce(hidden_at,clock_timestamp()) where turn_id=OLD.id;
  end if;
  return OLD;
end $$;

create function public.read_text_policy(p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); p turn_private.text_policies%rowtype; c turn_private.text_consents%rowtype;
begin
  if not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','unavailable'); end if;
  select * into p from turn_private.text_policies where id=p_policy_id;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id;
  return jsonb_build_object('kind','policy','policy',jsonb_build_object(
    'id',p.id,'provider',p.provider,'recipient',p.recipient,'sourceRegion',p.source_region,
    'processingRegion',p.processing_region,'storageRegion',p.storage_region,'termsVersion',p.terms_version,
    'noticeVersion',p.notice_version,'noticeHash',p.notice_hash,'noticeZh',p.notice_zh,'noticeEn',p.notice_en,
    'retention',p.retention,'expiresAt',least(p.expires_at,p.terms_recheck_at),
    'consentState',case when c.consent_id is null then 'not_accepted' when c.revoked_at is not null then 'withdrawn' else 'accepted' end));
end $$;

create function turn_private.qa_history_v1(p_turn uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype; l turn_private.service_task_turns%rowtype;
 c turn_private.text_content%rowtype; cursor_n uuid:=p_turn;seen uuid[]:='{}';hist jsonb:='[]';state_n text;
begin
 select x.* into s from turn_private.service_tasks x join turn_private.service_task_turns a on a.task_id=x.id where a.turn_id=p_turn;
 if not found or not exists(select 1 from turn_private.text_policies where id=s.policy_id and context_mode='qa_session_history_v1')
 or not turn_private.text_policy_current(s.policy_id) then return null;end if;
 perform 1 from turn_private.text_consents where owner_id=s.owner_id and policy_id=s.policy_id and consent_id=s.consent_id and revoked_at is null for share;
 if not found then return null;end if;
 perform 1 from public.chat_threads where id=s.thread_id and owner_id=s.owner_id and status='active' and trip_id is null for share;
 if not found then return null;end if;
 loop
  if cursor_n is null or cursor_n=any(seen) or cardinality(seen)>=8 then return null;end if;
  seen:=array_append(seen,cursor_n);
  select * into l from turn_private.service_task_turns where turn_id=cursor_n and task_id=s.id and owner_id=s.owner_id for share;
  if not found then return null;end if;
  select * into c from turn_private.text_content where turn_id=cursor_n and owner_id=s.owner_id and thread_id=s.thread_id and policy_id=s.policy_id and consent_id=s.consent_id and hidden_at is null for share;
  if not found then return null;end if;
  select status into state_n from public.turns where id=cursor_n and owner_id=s.owner_id and thread_id=s.thread_id for share;
  if not found then return null;end if;
  if cursor_n<>p_turn then
   if state_n not in ('completed','failed') or c.output_text is null or c.output_kind not in ('answered','partial','clarification','technical_failure') then return null;end if;
   hist:=jsonb_build_array(jsonb_build_object('turnId',cursor_n,'role','user','content',c.input_text),jsonb_build_object('turnId',cursor_n,'role','assistant','content',c.output_text))||hist;
   if octet_length(hist::text)>65536 then return null;end if;
  end if;
  if l.parent_turn_id is null then
   if cursor_n<>s.goal_turn_id or l.relationship<>'new_goal' then return null;end if;
   return jsonb_build_object('history',hist,'sourceTurnIds',to_jsonb(seen));
  end if;
  if l.relationship not in ('qa_followup','qa_correction') then return null;end if;
  cursor_n:=l.parent_turn_id;
 end loop;
end $$;

create or replace function public.qa_read_session_v1(p_thread_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();s turn_private.service_tasks%rowtype;r record;messages jsonb:='[]';v jsonb;
begin
 perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 select a.* into s from turn_private.service_tasks a join turn_private.text_policies p on p.id=a.policy_id where a.thread_id=p_thread_id and a.owner_id=u and p.context_mode='qa_session_history_v1';
 if not found then
  if exists(select 1 from public.turns where thread_id=p_thread_id) or exists(select 1 from turn_private.text_content where thread_id=p_thread_id) or exists(select 1 from turn_private.service_tasks where thread_id=p_thread_id) then return jsonb_build_object('kind','unavailable');end if;
  return jsonb_build_object('kind','session','schemaVersion','qa-session/1','threadId',p_thread_id,'serviceTaskId',null,'lastTurnId',null,'policyId',null,'messages','[]'::jsonb);
 end if;
 if turn_private.qa_history_v1(s.last_turn_id) is null then return jsonb_build_object('kind','unavailable');end if;
 for r in select value::uuid as turn_id from jsonb_array_elements_text(turn_private.qa_history_v1(s.last_turn_id)->'sourceTurnIds') with ordinality a(value,ord) order by ord desc loop
  if jsonb_array_length(messages)>=8 then return jsonb_build_object('kind','unavailable');end if;
  v:=public.read_text_turn(r.turn_id);if v->>'kind' is distinct from 'text' then return jsonb_build_object('kind','unavailable');end if;
  messages:=messages||jsonb_build_array(v||jsonb_build_object('status',(select status from public.turns where id=r.turn_id and owner_id=u),'createdAt',(select created_at from public.turns where id=r.turn_id and owner_id=u),
   'reconciliationRequired',exists(
    select 1 from turn_private.text_content body_n join public.turns turn_n on turn_n.id=body_n.turn_id and turn_n.owner_id=u
    join turn_private.work work_n on work_n.turn_id=body_n.turn_id and work_n.owner_id=u
    where body_n.turn_id=r.turn_id and body_n.owner_id=u and body_n.thread_id=p_thread_id
     and body_n.policy_id=s.policy_id and body_n.consent_id=s.consent_id and body_n.hidden_at is null
     and body_n.output_text is null and body_n.output_kind is null
     and turn_n.status not in ('completed','proposal_ready','unavailable','failed','cancelled')
     and (work_n.state='queued' or (work_n.state='leased' and work_n.expires_at<=clock_timestamp()))
     and (exists(select 1 from turn_private.text_dispatches d where d.turn_id=body_n.turn_id and d.policy_id=body_n.policy_id and d.consent_id=body_n.consent_id)
      or exists(select 1 from public.model_budget_attempts attempt_n join public.model_budget_scopes scope_n on scope_n.id=attempt_n.scope_id
       where scope_n.owner_id=u and attempt_n.status<>'released'
        and (attempt_n.task_id=work_n.turn_id or attempt_n.attempt_id=work_n.lease_token)))
   )));
 end loop;
 return jsonb_build_object('kind','session','schemaVersion','qa-session/1','threadId',p_thread_id,'serviceTaskId',s.id,'lastTurnId',s.last_turn_id,'policyId',s.policy_id,'messages',messages);
end $$;

create function public.qa_list_sessions_v1(p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();r record;v jsonb;rows_n jsonb:='[]';
begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'INVALID_INPUT';end if;
 for r in select h.id from public.chat_threads h left join turn_private.service_tasks s on s.thread_id=h.id and s.owner_id=u left join turn_private.text_policies p on p.id=s.policy_id where h.owner_id=u and h.status='active' and h.trip_id is null and (p.context_mode='qa_session_history_v1' or (s.id is null and not exists(select 1 from public.turns where thread_id=h.id) and not exists(select 1 from turn_private.text_content where thread_id=h.id))) order by h.updated_at desc,h.id limit p_limit loop
  v:=public.qa_read_session_v1(r.id);if v->>'kind'='session' then rows_n:=rows_n||jsonb_build_array(v-'messages');end if;
 end loop;
 return jsonb_build_object('kind','sessions','sessions',rows_n);
end $$;

create function public.qa_read_policy_v1(p_policy_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();r jsonb;
begin
 if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='qa_session_history_v1') then return jsonb_build_object('kind','unavailable');end if;
 r:=public.read_text_policy(p_policy_id);
 if r->>'kind' is distinct from 'policy' then return r;end if;
 return jsonb_set(r,'{policy}',(r->'policy')||jsonb_build_object('contextMode','qa_session_history_v1','maxTurns',8,'maxHistoryPairs',7,'maxHistoryBytes',65536));
end $$;

create function public.qa_accept_policy_v1(p_policy_id uuid,p_notice_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();
begin
 if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='qa_session_history_v1') then return jsonb_build_object('kind','blocked');end if;
 return public.accept_text_policy(p_policy_id,p_notice_hash);
end $$;

create function turn_private.qa_consumer_window_v1(p_history jsonb,p_text text)
returns boolean language plpgsql immutable set search_path='' as $$
declare n integer;i integer;item jsonb;body_n text;role_n text;
 content_n integer:=octet_length(p_text);prompt_n integer;
begin
 if not turn_private.valid_text(p_text,4000) or jsonb_typeof(p_history) is distinct from 'array' then return false;end if;
 n:=jsonb_array_length(p_history);
 if n>14 or n%2<>0 then return false;end if;
 prompt_n:=2+3775+1+octet_length('{"role":"user","content":'||to_json(p_text)::text||'}');
 for i in 0..n-1 loop
  item:=p_history->i;body_n:=item->>'content';role_n:=case when i%2=0 then 'user' else 'assistant' end;
  if item->>'role' is distinct from role_n or not turn_private.valid_text(body_n,case when i%2=0 then 4000 else 8000 end) then return false;end if;
  -- Explicit JS UTF-16 units for every upstream message, including older pairs
  -- outside the selected window. valid_text also enforces this on source rows.
  if (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) from regexp_split_to_table(body_n,'') ch)
   > (case when i%2=0 then 4000 else 8000 end) then return false;end if;
  if i>=greatest(0,n-6) then
   content_n:=content_n+octet_length(body_n);
   prompt_n:=prompt_n+1+octet_length('{"role":'||to_json(role_n)::text||',"content":'||to_json(body_n)::text||'}');
  end if;
 end loop;
 return content_n<=16384 and prompt_n<=32768;
end $$;

create function turn_private.qa_link_mode_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare mode_n text;
begin
 select p.context_mode into mode_n from turn_private.service_tasks s join turn_private.text_policies p on p.id=s.policy_id where s.id=NEW.task_id;
 if (NEW.relationship in ('qa_followup','qa_correction') and mode_n is distinct from 'qa_session_history_v1')
 or (mode_n='qa_session_history_v1' and NEW.relationship not in ('new_goal','qa_followup','qa_correction')) then raise exception 'QA_MODE_CONFLICT';end if;
 return NEW;
end $$;

create or replace function turn_private.require_text_task()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode in ('task_history_v1','knowledge_intent_v1','qa_session_history_v1'))
    and not exists(select 1 from turn_private.service_task_turns l join turn_private.service_tasks s on s.id=l.task_id
      where l.turn_id=NEW.turn_id and l.owner_id=NEW.owner_id and s.owner_id=NEW.owner_id and s.thread_id=NEW.thread_id
        and s.policy_id=NEW.policy_id and s.consent_id=NEW.consent_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode='knowledge_intent_v1')
    and not exists(select 1 from turn_private.grounded_turns g where g.turn_id=NEW.turn_id and g.owner_id=NEW.owner_id and g.locale=NEW.locale) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  return NEW;
end $$;

create function turn_private.qa_lock_work_v1(p_turn uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;
begin
 select * into w from turn_private.work where turn_id=p_turn;
 if not found or p_token is null or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return false;end if;
 select * into w from turn_private.work where turn_id=p_turn for update;
 if not found or w.state<>'leased' or w.lease_token is distinct from p_token or w.expires_at<=clock_timestamp()
 or not exists(select 1 from public.turns where id=p_turn and status not in ('completed','proposal_ready','unavailable','failed','cancelled')) then return false;end if;
 return turn_private.qa_history_v1(p_turn) is not null and w.expires_at>clock_timestamp();
end $$;

create function public.qa_submit_turn_v1(
  p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,
  p_task_id uuid,p_scope_version integer,p_relationship text,p_parent_turn_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype;
  s turn_private.service_tasks%rowtype; prior turn_private.service_task_turns%rowtype;
  parent turn_private.text_content%rowtype; digest text; result jsonb;
begin
  if p_text is not null and (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) from regexp_split_to_table(p_text,'') ch)>4000 then raise exception 'QA_CONTEXT_LIMIT';end if;
  if p_thread_id is null or p_turn_id is null or p_task_id is null or p_turn_id=p_task_id
    or p_idempotency_key is null or p_scope_version is distinct from 1
    or p_relationship is null or p_relationship not in ('new_goal','qa_followup','qa_correction')
    or ((p_relationship='new_goal') is distinct from (p_parent_turn_id is null))
    or p_locale is null or p_locale not in ('zh','en','es','ru','ar')
    or not turn_private.valid_text(p_text,4000) then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='qa_session_history_v1') or not turn_private.text_policy_current(p_policy_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_task_id,p_scope_version,p_relationship,p_parent_turn_id)::text,'UTF8')),'hex');
  -- Shared identity locks precede thread locks; acquire the pair in UUID order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||least(p_task_id,p_turn_id)::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||greatest(p_task_id,p_turn_id)::text,0));
  if p_relationship='new_goal' then
    insert into public.chat_threads(id,owner_id) values(p_thread_id,u) on conflict do nothing;
  end if;
  perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into s from turn_private.service_tasks where id=p_task_id for update;
  if found then
    if s.owner_id<>u or s.thread_id<>p_thread_id or s.policy_id<>p_policy_id or s.consent_id<>c.consent_id
      or s.scope_version<>p_scope_version then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    perform 1 from turn_private.text_content g join public.turns t on t.id=g.turn_id and t.owner_id=u
      where g.turn_id=s.goal_turn_id and g.owner_id=u and g.hidden_at is null;
    if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
    select * into prior from turn_private.service_task_turns where owner_id=u and task_id=s.id and idempotency_key=p_idempotency_key;
    if found then
      if prior.request_digest<>digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
      -- Existing admission rechecks original content visibility/consent and never enqueues again.
      result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
      if result->>'kind'<>'accepted' then raise exception 'DATA_POLICY_BLOCKED'; end if;
      return result||jsonb_build_object('serviceTaskId',s.id,'scopeVersion',s.scope_version,'relationship',prior.relationship,'parentTurnId',prior.parent_turn_id);
    end if;
    if p_relationship='new_goal' or s.last_turn_id is distinct from p_parent_turn_id then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    select g.* into parent from turn_private.text_content g join public.turns t on t.id=g.turn_id and t.owner_id=u
      where g.turn_id=p_parent_turn_id and g.owner_id=u and g.thread_id=p_thread_id and g.hidden_at is null
      and t.status in ('completed','failed');
    if not found or parent.policy_id<>p_policy_id or parent.consent_id<>c.consent_id
      or parent.output_kind not in ('answered','partial','clarification','technical_failure')
      or parent.output_text is null then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  else
    if p_relationship<>'new_goal' or exists(select 1 from public.turns where thread_id=p_thread_id)
      or exists(select 1 from public.turns where id=p_task_id)
      or exists(select 1 from turn_private.text_content where thread_id=p_thread_id or turn_id=p_task_id)
      or exists(select 1 from public.model_budget_attempts where task_id=p_task_id)
      or exists(select 1 from turn_private.service_tasks where thread_id=p_thread_id)
      then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    if not turn_private.qa_consumer_window_v1('[]'::jsonb,p_text) then raise exception 'QA_CONTEXT_LIMIT';end if;
    insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
      values(p_task_id,u,p_thread_id,p_turn_id,p_turn_id,p_policy_id,c.consent_id,p_scope_version,
        encode(pg_catalog.sha256(convert_to(p_text,'UTF8')),'hex'));
  end if;
  if p_relationship<>'new_goal' and not turn_private.qa_consumer_window_v1((turn_private.qa_history_v1(p_parent_turn_id)->'history')||jsonb_build_array(jsonb_build_object('turnId',p_parent_turn_id,'role','user','content',parent.input_text),jsonb_build_object('turnId',p_parent_turn_id,'role','assistant','content',parent.output_text)),p_text) then raise exception 'QA_CONTEXT_LIMIT';end if;
  if exists(select 1 from turn_private.service_tasks where id=p_task_id) and p_relationship<>'new_goal' then
    if turn_private.qa_history_v1(p_parent_turn_id) is null or octet_length(((turn_private.qa_history_v1(p_parent_turn_id)->'history')||jsonb_build_array(jsonb_build_object('turnId',p_parent_turn_id,'role','user','content',parent.input_text),jsonb_build_object('turnId',p_parent_turn_id,'role','assistant','content',parent.output_text)))::text)>65536 or (select count(*) from turn_private.service_task_turns where task_id=p_task_id)>=8 then raise exception 'QA_CONTEXT_LIMIT'; end if;
  end if;
  if exists(select 1 from turn_private.service_tasks where id=p_turn_id)
    or exists(select 1 from public.turns where id=p_turn_id)
    or exists(select 1 from turn_private.text_content where turn_id=p_turn_id)
    then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  insert into turn_private.service_task_turns(turn_id,task_id,owner_id,parent_turn_id,relationship,idempotency_key,request_digest)
    values(p_turn_id,p_task_id,u,p_parent_turn_id,p_relationship,p_idempotency_key,digest);
  result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
  if result->>'kind'<>'accepted' or result->>'reused'<>'false' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  update turn_private.service_tasks set last_turn_id=p_turn_id where id=p_task_id;
  return result||jsonb_build_object('serviceTaskId',p_task_id,'scopeVersion',p_scope_version,'relationship',p_relationship,'parentTurnId',p_parent_turn_id);
end $$;

create function public.qa_submit_message_v1(p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,p_task_id uuid,p_relationship text default 'qa_followup')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();s turn_private.service_tasks%rowtype;l turn_private.service_task_turns%rowtype;rel text;parent_n uuid;
begin
 if p_thread_id is null or p_turn_id is null or p_task_id is null or p_idempotency_key is null or p_relationship is null or p_relationship not in ('qa_followup','qa_correction') then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('service-task-identity:'||least(p_task_id,p_turn_id)::text,0));
 perform pg_advisory_xact_lock(hashtextextended('service-task-identity:'||greatest(p_task_id,p_turn_id)::text,0));
 insert into public.chat_threads(id,owner_id) values(p_thread_id,u) on conflict do nothing;
 perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
 if not found then raise exception 'FORBIDDEN';end if;
 select * into s from turn_private.service_tasks where id=p_task_id for update;
 if found then
  select * into l from turn_private.service_task_turns where owner_id=u and task_id=p_task_id and idempotency_key=p_idempotency_key;
  if found then
   if l.turn_id is distinct from p_turn_id or (l.relationship<>'new_goal' and l.relationship is distinct from p_relationship) then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
   rel:=l.relationship;parent_n:=l.parent_turn_id;
  else rel:=p_relationship;parent_n:=s.last_turn_id;end if;
 else rel:='new_goal';parent_n:=null;end if;
 return public.qa_submit_turn_v1(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_task_id,1,rel,parent_n);
end $$;

create or replace function public.qa_claim_work_v1(p_owner_id uuid,p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; w turn_private.work%rowtype; c turn_private.text_content%rowtype; turn_state text;
begin
  if p_owner_id is null or p_policy_id is null then raise exception 'INVALID_INPUT'; end if;
  -- An unlocked filter avoids taking policy/consent locks before the established
  -- owner -> account/session -> Turn/thread -> work -> policy/consent order.
  -- Everything relevant to dispatch is checked again after those locks.
  for candidate in
    select q.turn_id,q.owner_id,q.session_id from turn_private.work q
    join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
    join turn_private.text_policies p on p.id=x.policy_id
    join turn_private.text_consents s on s.owner_id=x.owner_id and s.policy_id=x.policy_id and s.consent_id=x.consent_id
    where q.owner_id=p_owner_id and x.policy_id=p_policy_id and x.hidden_at is null and p.context_mode='qa_session_history_v1'
      and p.revoked_at is null and p.effective_at<=clock_timestamp()
      and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp() and s.revoked_at is null
      and not exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id)
      and not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id where b.owner_id=q.owner_id and a.status<>'released' and (a.task_id=q.turn_id or a.attempt_id=q.lease_token))
      and (q.state='queued' or (q.state='leased' and q.expires_at<=clock_timestamp()))
    order by q.created_at,q.turn_id limit 100
  loop
    -- Same advisory key as the legacy global claimer: concurrent versions cannot
    -- lease the same candidate. Return after taking any entity lock.
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      perform turn_private.cancel_unclaimable_turn_v1(candidate.turn_id,candidate.owner_id);
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null
        where turn_id=candidate.turn_id and state in ('queued','leased');
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id and owner_id=p_owner_id for update;
    if not found or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp()) then return jsonb_build_object('kind','empty'); end if;
    select * into c from turn_private.text_content where turn_id=w.turn_id and owner_id=p_owner_id and policy_id=p_policy_id and hidden_at is null;
    if not found or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','empty'); end if;
    perform 1 from turn_private.text_consents where owner_id=p_owner_id and policy_id=p_policy_id and consent_id=c.consent_id and revoked_at is null for share;
    if not found or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','empty'); end if;
    if exists(select 1 from turn_private.text_dispatches d where d.turn_id=w.turn_id) or exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id where b.owner_id=w.owner_id and a.status<>'released' and (a.task_id=w.turn_id or a.attempt_id=w.lease_token)) then return jsonb_build_object('kind','reconciliation_required','turnId',w.turn_id); end if;
    select status into turn_state from public.turns where id=w.turn_id;
    if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then perform turn_private.terminal(w.turn_id,'cancelled',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if turn_private.qa_history_v1(w.turn_id) is null then
      -- No receipt/uncertain ledger can reach this branch. Keep all retained text;
      -- use the original terminal/event path, and return after this owner's locks.
      perform turn_private.terminal(w.turn_id,'cancelled',w.attempt);
      return jsonb_build_object('kind','empty');
    end if;
    -- A slow policy/consent lock cannot revive an already leased item. Its state
    -- and expiry were locked above; only queued/expired work receives a new token.
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond'
      where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  select q.turn_id into candidate from turn_private.work q
   join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
   join turn_private.text_policies p on p.id=x.policy_id
   where q.owner_id=p_owner_id and x.policy_id=p_policy_id and p.context_mode='qa_session_history_v1'
    and q.state in ('queued','leased') and (q.state='queued' or q.expires_at<=clock_timestamp())
    and (exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id) or exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id where b.owner_id=q.owner_id and a.status<>'released' and (a.task_id=q.turn_id or a.attempt_id=q.lease_token)))
   order by q.created_at,q.turn_id limit 1;
  if found then return jsonb_build_object('kind','reconciliation_required','turnId',candidate.turn_id);end if;
  return jsonb_build_object('kind','empty');
end $$;

create function public.qa_read_work_v1(p_turn_id uuid,p_lease_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype;p turn_private.text_policies%rowtype;s turn_private.service_tasks%rowtype;w turn_private.work%rowtype;h jsonb;payload jsonb;
begin
 if not turn_private.qa_lock_work_v1(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked');end if;
 select * into w from turn_private.work where turn_id=p_turn_id;
 select * into c from turn_private.text_content where turn_id=p_turn_id;
 select * into p from turn_private.text_policies where id=c.policy_id;
 select x.* into s from turn_private.service_tasks x join turn_private.service_task_turns l on l.task_id=x.id where l.turn_id=p_turn_id;
 h:=turn_private.qa_history_v1(p_turn_id);if h is null then return jsonb_build_object('kind','blocked');end if;
 payload:=jsonb_build_object('kind','qa_input','schemaVersion','qa-context/1','contextMode','qa_session_history_v1','ownerId',w.owner_id,'authSessionId',w.session_id,'turnId',p_turn_id,'threadId',c.thread_id,'serviceTaskId',s.id,'policyId',p.id,'consentId',c.consent_id,'provider',p.provider,'endpoint',p.endpoint,'text',c.input_text,'locale',c.locale,'history',h->'history','sourceTurnIds',h->'sourceTurnIds');
 return payload||jsonb_build_object('contextDigest',encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
end $$;

create function public.qa_authorize_dispatch_v1(p_turn_id uuid,p_lease_token uuid,p_scope_id uuid,p_policy_id uuid,p_provider text,p_context_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb;fresh_n jsonb;r jsonb;task_n uuid;
begin
 payload:=public.qa_read_work_v1(p_turn_id,p_lease_token);
 if payload->>'kind' is distinct from 'qa_input' or payload->>'policyId' is distinct from p_policy_id::text or payload->>'provider' is distinct from p_provider or payload->>'contextDigest' is distinct from p_context_digest then return jsonb_build_object('kind','blocked');end if;
 task_n:=(payload->>'serviceTaskId')::uuid;
 if not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id
 join turn_private.service_tasks s on s.id=a.task_id and s.budget_scope_id=a.scope_id and s.owner_id=b.owner_id
 where a.scope_id=p_scope_id and a.attempt_id=p_lease_token and a.task_id=task_n and a.provider=p_provider and a.status='reserved'
 and b.owner_id=(select owner_id from turn_private.text_content where turn_id=p_turn_id))
 or exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token) then return jsonb_build_object('kind','blocked');end if;
 -- The original budget RPC may wait on its scope row. Roll back THIS dispatch
 -- if the lease or any locked source expires while that lock is awaited.
 begin
  r:=public.dispatch_model_budget(p_scope_id,(select owner_id from turn_private.text_content where turn_id=p_turn_id),p_lease_token);
  if r->>'kind' is distinct from 'dispatched' then return jsonb_build_object('kind','blocked');end if;
  fresh_n:=public.qa_read_work_v1(p_turn_id,p_lease_token);
  if fresh_n->>'kind' is distinct from 'qa_input' or fresh_n->>'policyId' is distinct from p_policy_id::text
   or fresh_n->>'provider' is distinct from p_provider or fresh_n->>'contextDigest' is distinct from p_context_digest
   then raise exception using errcode='PQA01',message='QA_DISPATCH_SOURCE_EXPIRED';end if;
  insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,(fresh_n->>'consentId')::uuid,p_policy_id);
 exception when sqlstate 'PQA01' then
  return jsonb_build_object('kind','blocked');
 end;
 return jsonb_build_object('kind','authorized');
end $$;

create function public.qa_complete_work_v1(p_turn_id uuid,p_lease_token uuid,p_kind text,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;task_n uuid;
begin
 if p_kind is null or p_kind not in ('answered','partial','clarification','blocked','technical_failure') or not turn_private.valid_text(p_text,8000) then raise exception 'INVALID_INPUT';end if;
 if not turn_private.qa_lock_work_v1(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked');end if;
 select task_id into task_n from turn_private.service_task_turns where turn_id=p_turn_id;
 if p_kind in ('answered','partial','clarification') and (not exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token and turn_id=p_turn_id)
 or not exists(select 1 from public.model_budget_attempts a join turn_private.service_tasks s on s.id=a.task_id and s.budget_scope_id=a.scope_id where a.attempt_id=p_lease_token and a.task_id=task_n and a.status='settled')) then return jsonb_build_object('kind','blocked');end if;
 select * into w from turn_private.work where turn_id=p_turn_id;
 update turn_private.text_content set output_kind=p_kind,output_text=p_text where turn_id=p_turn_id;
 perform turn_private.terminal(p_turn_id,case when p_kind='blocked' then 'unavailable' when p_kind='technical_failure' then 'failed' else 'completed' end,w.attempt);
 return jsonb_build_object('kind','finished');
end $$;

create function public.qa_native_session_v1(p_action text,p_mobile_epoch bigint,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor_n jsonb;claims_n jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 u uuid:=coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),claims_n->>'sub')::uuid;
 sid uuid:=(claims_n->>'session_id')::uuid;
 expected_n text[];keys_n text[];row_n public.chat_threads%rowtype;r jsonb;rows_n jsonb;
begin
 if p_mobile_epoch is null or p_mobile_epoch<1 or p_action is null or p_payload is null
 or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 then raise exception 'INVALID_INPUT';end if;
 if u is null or sid is null then raise exception 'UNAUTHENTICATED';end if;
 expected_n:=case p_action
  when 'list' then array[]::text[] when 'create' then array[]::text[]
  when 'read' then array['p_thread_id']
  when 'qa_read_policy_v1' then array['p_policy_id']
  when 'qa_accept_policy_v1' then array['p_policy_id','p_notice_hash']
  when 'qa_list_sessions_v1' then array['p_limit']
  when 'qa_read_session_v1' then array['p_thread_id']
  when 'read_text_turn' then array['p_turn_id']
  when 'qa_submit_message_v1' then array['p_thread_id','p_turn_id','p_idempotency_key','p_policy_id','p_locale','p_text','p_task_id','p_relationship']
  when 'qa_cancellation_v1' then array['p_action','p_thread_id','p_request_id']
  else null end;
 if expected_n is null then raise exception 'INVALID_INPUT';end if;
 select coalesce(array_agg(k order by k),array[]::text[]) into keys_n from jsonb_object_keys(p_payload) k;
 if keys_n is distinct from (select coalesce(array_agg(k order by k),array[]::text[]) from unnest(expected_n) k)
 or exists(select 1 from jsonb_each(p_payload) v where (v.key='p_limit' and (jsonb_typeof(v.value)<>'number' or v.value::text !~ '^[0-9]+$'))
 or (v.key<>'p_limit' and jsonb_typeof(v.value)<>'string')) then raise exception 'INVALID_INPUT';end if;
 -- Cancellation's existing capacity lock precedes its account/session lock.
 if p_action='qa_cancellation_v1' then
  if p_payload->>'p_action' not in ('read','cancel') then raise exception 'INVALID_INPUT';end if;
  if p_payload->>'p_action'='cancel' then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34));
  end if;
 end if;
 -- The original function validates ordinary authenticated/nonanonymous JWT,
 -- live Auth session and active mobile session under the shared account lock.
 -- This lock remains held through the operation below, not an HTTP precheck.
 actor_n:=public.native_session_v2('session');
 if actor_n->>'version' is distinct from '2' or actor_n->>'subject' is distinct from u::text
 or actor_n->>'sessionId' is distinct from sid::text
 or actor_n->>'mobileEpoch' is distinct from p_mobile_epoch::text then raise exception 'SESSION_REPLACED';end if;
 u:=(actor_n->>'subject')::uuid;
 case p_action
 when 'list' then
  r:=public.qa_list_sessions_v1(20);
  if r->>'kind' is distinct from 'sessions' then return r;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'status',h.status,'createdAt',h.created_at,'updatedAt',h.updated_at) order by h.updated_at desc,h.id),'[]'::jsonb)
   into rows_n from public.chat_threads h where h.owner_id=u and h.status='active' and h.trip_id is null
   and exists(select 1 from jsonb_array_elements(r->'sessions') s where s->>'threadId'=h.id::text);
  return jsonb_build_object('kind','threads','threads',rows_n);
 when 'create' then
  insert into public.chat_threads(owner_id,trip_id) values(u,null) returning * into row_n;
  return jsonb_build_object('kind','thread','thread',jsonb_build_object('id',row_n.id,'status',row_n.status,'createdAt',row_n.created_at,'updatedAt',row_n.updated_at));
 when 'read' then
  select * into row_n from public.chat_threads where id=(p_payload->>'p_thread_id')::uuid and owner_id=u and status='active' and trip_id is null;
  if not found then raise exception 'FORBIDDEN';end if;
  r:=public.qa_read_session_v1((p_payload->>'p_thread_id')::uuid);
  if r->>'kind' is distinct from 'session' then return r;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'createdAt',t.created_at) order by t.created_at,t.id),'[]'::jsonb)
   into rows_n from public.turns t where t.thread_id=row_n.id and t.owner_id=u;
  return jsonb_build_object('kind','thread_read','thread',jsonb_build_object('id',row_n.id,'status',row_n.status,'createdAt',row_n.created_at,'updatedAt',row_n.updated_at),'turns',rows_n);
 when 'qa_read_policy_v1' then return public.qa_read_policy_v1((p_payload->>'p_policy_id')::uuid);
 when 'qa_accept_policy_v1' then return public.qa_accept_policy_v1((p_payload->>'p_policy_id')::uuid,p_payload->>'p_notice_hash');
 when 'qa_list_sessions_v1' then return public.qa_list_sessions_v1((p_payload->>'p_limit')::integer);
 when 'qa_read_session_v1' then return public.qa_read_session_v1((p_payload->>'p_thread_id')::uuid);
 when 'read_text_turn' then return public.read_text_turn((p_payload->>'p_turn_id')::uuid);
 when 'qa_submit_message_v1' then return public.qa_submit_message_v1((p_payload->>'p_thread_id')::uuid,(p_payload->>'p_turn_id')::uuid,
  (p_payload->>'p_idempotency_key')::uuid,(p_payload->>'p_policy_id')::uuid,p_payload->>'p_locale',p_payload->>'p_text',
  (p_payload->>'p_task_id')::uuid,p_payload->>'p_relationship');
 when 'qa_cancellation_v1' then return public.qa_cancellation_v1(p_payload->>'p_action',(p_payload->>'p_thread_id')::uuid,(p_payload->>'p_request_id')::uuid);
 end case;
 raise exception 'INVALID_INPUT';
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_INPUT';
end $$;

create function public.enqueue_turn_work(p_turn_id uuid,p_owner_id uuid,p_session_id uuid,p_lease_ms integer,p_max_attempts integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; t public.turns%rowtype;
begin
  if p_lease_ms is null or p_lease_ms not between 1000 and 300000 or p_max_attempts is null or p_max_attempts not between 1 and 5 then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.lock_turn(p_turn_id,p_owner_id,p_session_id) then return jsonb_build_object('kind','unavailable'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id for update;
  if found then
    if w.owner_id<>p_owner_id or w.session_id<>p_session_id or w.lease_ms<>p_lease_ms or w.max_attempts<>p_max_attempts then return jsonb_build_object('kind','conflict'); end if;
    return jsonb_build_object('kind','duplicate');
  end if;
  select * into t from public.turns where id=p_turn_id;
  if t.status<>'accepted' or not exists(select 1 from public.chat_turn_events where turn_id=p_turn_id and sequence=1 and state='accepted') then return jsonb_build_object('kind','unavailable'); end if;
  insert into turn_private.work(turn_id,owner_id,session_id,lease_ms,max_attempts) values(p_turn_id,p_owner_id,p_session_id,p_lease_ms,p_max_attempts);
  return jsonb_build_object('kind','queued');
end $$;

create or replace function public.start_chat_turn(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_digest text)
returns table(turn_id uuid, reused boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  thread public.chat_threads%rowtype;
  previous public.chat_turn_idempotency%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  if p_digest <> 'chat-state-control-v1' then raise exception 'invalid state control digest'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||p_turn_id::text,0));
  if exists(select 1 from turn_private.service_tasks where id=p_turn_id) then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  select * into thread from public.chat_threads where id = p_thread_id and owner_id = (select auth.uid()) for update;
  if not found or thread.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.chat_turn_idempotency
    where owner_id = (select auth.uid()) and thread_id = p_thread_id and idempotency_key = p_idempotency_key::text for update;
  if found then
    if previous.digest <> p_digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    return query select previous.turn_id, true;
    return;
  end if;
  -- Old native and state-control clients may replay existing turns, but cannot
  -- append an unassociated turn to a v2 task, even during a mixed-worker rollout.
  if exists(select 1 from turn_private.service_tasks where thread_id=p_thread_id)
    and not exists(select 1 from turn_private.service_task_turns l
      join turn_private.service_tasks s on s.id=l.task_id
      where l.turn_id=p_turn_id and l.owner_id=auth.uid() and s.thread_id=p_thread_id)
  then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  insert into public.turns(id, owner_id, thread_id, trip_id, status)
    values (p_turn_id, thread.owner_id, thread.id, thread.trip_id, 'accepted');
  insert into public.chat_turn_events(owner_id, thread_id, turn_id, event_id, sequence, schema_version, event_type, state)
    values (thread.owner_id, thread.id, p_turn_id, 'accepted', 1, 'turn-sse-v1', 'accepted', 'accepted');
  insert into public.chat_turn_idempotency(owner_id, thread_id, idempotency_key, digest, turn_id)
    values (thread.owner_id, thread.id, p_idempotency_key::text, p_digest, p_turn_id);
  update public.chat_threads set updated_at = now() where id = thread.id;
  return query select p_turn_id, false;
end;
$$;

create function public.reserve_model_budget(
  p_scope_id uuid,p_owner_id uuid,p_task_id uuid,p_attempt_id uuid,
  p_provider text,p_model text,p_price_version text,p_reserved_micros bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare canonical uuid; s turn_private.service_tasks%rowtype; result jsonb;
begin
  select task_id into canonical from turn_private.service_task_turns where turn_id=p_task_id;
  if canonical is null then select id into canonical from turn_private.service_tasks where id=p_task_id; end if;
  if canonical is not null then
    select * into s from turn_private.service_tasks where id=canonical for update;
    if s.owner_id is distinct from p_owner_id then return jsonb_build_object('kind','unavailable'); end if;
    if s.budget_scope_id is not null and s.budget_scope_id is distinct from p_scope_id then return jsonb_build_object('kind','conflict'); end if;
  end if;
  result:=turn_private.reserve_model_budget_unbound(p_scope_id,p_owner_id,coalesce(canonical,p_task_id),p_attempt_id,p_provider,p_model,p_price_version,p_reserved_micros);
  if canonical is not null and result->>'kind'='reserved' and s.budget_scope_id is null then
    update turn_private.service_tasks set budget_scope_id=p_scope_id where id=canonical;
  end if;
  return result;
end $$;

create function public.dispatch_model_budget(p_scope_id uuid, p_owner_id uuid, p_attempt_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.model_budget_scopes%rowtype; a public.model_budget_attempts%rowtype; p public.model_budget_provider_limits%rowtype;
  total_cost numeric; provider_cost numeric; task_cost numeric; active_count bigint; task_count bigint;
begin
  select * into s from public.model_budget_scopes where id = p_scope_id for update;
  if not found or s.owner_id is distinct from p_owner_id then return jsonb_build_object('kind','unavailable'); end if;
  select * into a from public.model_budget_attempts where scope_id = p_scope_id and attempt_id = p_attempt_id;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  if a.status <> 'reserved' then return jsonb_build_object('kind','duplicate','status',a.status); end if;
  select * into p from public.model_budget_provider_limits where scope_id = p_scope_id and provider = a.provider for share;
  if not found or not s.enabled or s.frozen or not p.enabled or p.model <> a.model or p.price_version <> a.price_version then
    return jsonb_build_object('kind','disabled');
  end if;
  if s.expires_at <= clock_timestamp() then return jsonb_build_object('kind','expired'); end if;
  select
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end),0),
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end) filter (where provider = a.provider),0),
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end) filter (where task_id = a.task_id),0),
    count(*) filter (where status in ('reserved','dispatched','pending')),
    count(*) filter (where task_id = a.task_id)
  into total_cost, provider_cost, task_cost, active_count, task_count
  from public.model_budget_attempts where scope_id = p_scope_id;
  if a.reserved_micros > p.attempt_limit_micros or total_cost > s.limit_micros
    or provider_cost > p.limit_micros or task_cost > s.task_limit_micros
    or active_count > s.concurrency_limit or task_count > s.task_attempt_limit then
    return jsonb_build_object('kind','exhausted');
  end if;
  update public.model_budget_attempts set status = 'dispatched', updated_at = clock_timestamp()
    where scope_id = p_scope_id and attempt_id = p_attempt_id;
  return jsonb_build_object('kind','dispatched');
end;
$$;

create function public.finish_model_budget(p_scope_id uuid, p_owner_id uuid, p_attempt_id uuid, p_action text, p_actual_micros bigint default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.model_budget_scopes%rowtype; a public.model_budget_attempts%rowtype;
begin
  if p_action is null or p_action not in ('settle','pending','release')
    or (p_action = 'settle' and (p_actual_micros is null or p_actual_micros < 0 or p_actual_micros > 1000000000000))
    or (p_action <> 'settle' and p_actual_micros is not null) then return jsonb_build_object('kind','invalid'); end if;
  select * into s from public.model_budget_scopes where id = p_scope_id for update;
  if not found or s.owner_id is distinct from p_owner_id then return jsonb_build_object('kind','unavailable'); end if;
  select * into a from public.model_budget_attempts where scope_id = p_scope_id and attempt_id = p_attempt_id;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  if p_action = 'release' then
    if a.status = 'released' then return jsonb_build_object('kind','duplicate','status','released'); end if;
    if a.status <> 'reserved' then return jsonb_build_object('kind','conflict'); end if;
    update public.model_budget_attempts set status = 'released', updated_at = clock_timestamp() where scope_id = p_scope_id and attempt_id = p_attempt_id;
    return jsonb_build_object('kind','released');
  elsif p_action = 'pending' then
    if a.status = 'pending' then return jsonb_build_object('kind','duplicate','status','pending'); end if;
    if a.status <> 'dispatched' then return jsonb_build_object('kind','conflict'); end if;
    update public.model_budget_attempts set status = 'pending', updated_at = clock_timestamp() where scope_id = p_scope_id and attempt_id = p_attempt_id;
    return jsonb_build_object('kind','pending');
  else
    if a.status = 'settled' then
      if a.actual_micros = p_actual_micros then return jsonb_build_object('kind','duplicate','status','settled'); end if;
      return jsonb_build_object('kind','conflict');
    end if;
    if a.status not in ('dispatched','pending') then return jsonb_build_object('kind','conflict'); end if;
    update public.model_budget_attempts set status = 'settled', actual_micros = p_actual_micros, updated_at = clock_timestamp()
      where scope_id = p_scope_id and attempt_id = p_attempt_id;
    if p_actual_micros > a.reserved_micros then update public.model_budget_scopes set frozen = true where id = p_scope_id; end if;
    return jsonb_build_object('kind','settled','overrun',p_actual_micros > a.reserved_micros);
  end if;
end;
$$;

create function public.qa_ready_groups_v3(p_limit integer,p_model text,p_price_version text,p_endpoint text,p_owner_id uuid,p_policy_id uuid,p_scope_id uuid,p_notice_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.hosted_worker_control%rowtype;groups_n jsonb;
begin
 if p_owner_id is null or p_policy_id is null or p_scope_id is null or p_notice_hash is null or p_notice_hash !~ '^[a-f0-9]{64}$'
 or p_limit is null or p_limit not between 1 and 50 or p_model is null or p_model !~ '^[A-Za-z0-9._-]{1,100}$'
 or p_price_version is null or p_price_version !~ '^[A-Za-z0-9._-]{1,100}$' or p_endpoint is null or length(p_endpoint)>512
 or p_endpoint !~ '^https://[^/?#@]+/[^?#]*$' then raise exception 'INVALID_INPUT';end if;
 select * into c from turn_private.hosted_worker_control where singleton;
 if not found or not c.enabled then return jsonb_build_object('kind','disabled');end if;
 select coalesce(jsonb_agg(jsonb_build_object('ownerId',g.owner_id,'policyId',g.policy_id,'contextMode',g.context_mode,
 'provider',g.provider,'endpoint',g.endpoint,'noticeHash',g.notice_hash,'scopes',g.scopes) order by g.oldest,g.owner_id,g.policy_id),'[]'::jsonb) into groups_n
 from(
  select w.*,b.scopes from(
   select q.owner_id,x.policy_id,p.context_mode,p.provider,p.endpoint,p.notice_hash,min(q.created_at) oldest
   from turn_private.work q join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
   join turn_private.text_policies p on p.id=x.policy_id
   join turn_private.text_consents a on a.owner_id=x.owner_id and a.policy_id=x.policy_id and a.consent_id=x.consent_id
   where q.owner_id=p_owner_id and x.policy_id=p_policy_id and p.notice_hash=p_notice_hash
    and q.execution_mode='text' and p.context_mode='qa_session_history_v1' and p.provider='qwen' and p.endpoint=p_endpoint
    and x.hidden_at is null and p.revoked_at is null and p.effective_at<=clock_timestamp()
    and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp() and a.revoked_at is null
    and(q.state='queued' or(q.state='leased' and q.expires_at<=clock_timestamp()))
    and not exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id)
    and not exists(select 1 from public.model_budget_attempts t join public.model_budget_scopes s on s.id=t.scope_id
     where s.owner_id=q.owner_id and t.status<>'released' and(t.task_id=q.turn_id or t.attempt_id=q.lease_token))
   group by q.owner_id,x.policy_id,p.context_mode,p.provider,p.endpoint,p.notice_hash
  )w cross join lateral(
   -- Match first, then keep at most two witnesses: zero is unavailable, two is
   -- ambiguous. Nonmatching first-five scopes cannot hide a later exact match.
   select count(*) scope_n,coalesce(jsonb_agg(jsonb_build_object('scopeId',e.id,'model',e.model,'priceVersion',e.price_version) order by e.id),'[]'::jsonb) scopes
   from(select s.id,l.model,l.price_version from public.model_budget_scopes s
    join public.model_budget_provider_limits l on l.scope_id=s.id and l.provider='qwen'
    where s.owner_id=w.owner_id and s.enabled and not s.frozen and s.expires_at>clock_timestamp() and l.enabled
     and l.model=p_model and l.price_version=p_price_version order by s.id limit 2)e
  )b where b.scope_n=1 and (b.scopes->0->>'scopeId')::uuid=p_scope_id
  order by w.oldest,w.owner_id,w.policy_id limit p_limit
 )g;
 return jsonb_build_object('kind','groups','groups',groups_n);
end $$;

create function public.qa_authorize_dispatch_v2(p_turn_id uuid,p_lease_token uuid,p_scope_id uuid,p_policy_id uuid,p_provider text,p_context_digest text,p_owner_id uuid,p_notice_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
 if p_owner_id is null or p_policy_id is null or p_scope_id is null or p_notice_hash is null or p_notice_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
 -- Acquire the original lease/source locks first, preserving v1's lock order.
 payload:=public.qa_read_work_v1(p_turn_id,p_lease_token);
 if payload->>'kind' is distinct from 'qa_input' or payload->>'ownerId' is distinct from p_owner_id::text
 or payload->>'policyId' is distinct from p_policy_id::text then return jsonb_build_object('kind','blocked');end if;
 -- This is the actual immutable policy authority, not a hash echoed by a client.
 perform 1 from turn_private.text_policies where id=p_policy_id and notice_hash=p_notice_hash for share;
 if not found or not exists(select 1 from public.model_budget_scopes where id=p_scope_id and owner_id=p_owner_id) then
  return jsonb_build_object('kind','blocked');end if;
 return public.qa_authorize_dispatch_v1(p_turn_id,p_lease_token,p_scope_id,p_policy_id,p_provider,p_context_digest);
end $$;

create function public.read_hosted_worker_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.hosted_worker_control%rowtype; workers jsonb; queue jsonb;
begin
  select * into c from turn_private.hosted_worker_control where singleton;
  select coalesce(jsonb_agg(to_jsonb(h) order by h."lastSeenAt" desc), '[]'::jsonb) into workers
    from (select worker_id as "workerId", build, started_at as "startedAt", last_seen_at as "lastSeenAt", phase,
      last_result as "lastResult", polls, finished, unavailable, skipped, stop_reason as "stopReason"
      from turn_private.hosted_worker_heartbeats order by last_seen_at desc limit 20) h;
  select jsonb_build_object(
      'ready', count(*) filter (where state = 'queued' or (state = 'leased' and expires_at <= clock_timestamp())),
      'leased', count(*) filter (where state = 'leased' and expires_at > clock_timestamp()),
      'oldestReadySeconds', coalesce(floor(extract(epoch from clock_timestamp() - min(created_at) filter (where state = 'queued' or (state = 'leased' and expires_at <= clock_timestamp()))))::bigint, 0))
    into queue from turn_private.work where state in ('queued','leased');
  return jsonb_build_object('kind','status','enabled',coalesce(c.enabled,false),'changedAt',c.changed_at,'reason',c.reason,
    'workers',workers,'queue',queue);
end $$;

create function public.hosted_worker_heartbeat(
  p_worker_id uuid, p_build text, p_started_at timestamptz, p_phase text, p_result text,
  p_polls bigint, p_finished bigint, p_unavailable bigint, p_skipped bigint, p_stop_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.hosted_worker_control%rowtype;
begin
  if p_worker_id is null or p_build is null or p_build !~ '^[A-Za-z0-9._-]{1,64}$'
    or p_started_at is null or p_started_at > clock_timestamp() + interval '5 minutes'
    or p_phase is null or p_phase not in ('started','polling','idle','disabled','draining','stopped')
    or (p_result is not null and p_result not in ('empty','finished','queued','unavailable','disabled','skipped'))
    or (p_stop_reason is not null and p_stop_reason not in ('stopped','expired','unavailable'))
    or (p_phase = 'stopped') <> (p_stop_reason is not null)
    or p_polls is null or p_finished is null or p_unavailable is null or p_skipped is null
    or least(p_polls, p_finished, p_unavailable, p_skipped) < 0 then raise exception 'INVALID_INPUT'; end if;
  insert into turn_private.hosted_worker_heartbeats as h(worker_id,build,started_at,last_seen_at,phase,last_result,polls,finished,unavailable,skipped,stop_reason)
    values (p_worker_id,p_build,p_started_at,clock_timestamp(),p_phase,p_result,p_polls,p_finished,p_unavailable,p_skipped,p_stop_reason)
  on conflict (worker_id) do update set
    last_seen_at = clock_timestamp(), phase = excluded.phase, last_result = coalesce(excluded.last_result, h.last_result),
    polls = greatest(h.polls, excluded.polls), finished = greatest(h.finished, excluded.finished),
    unavailable = greatest(h.unavailable, excluded.unavailable), skipped = greatest(h.skipped, excluded.skipped),
    stop_reason = excluded.stop_reason
  where h.build = excluded.build and h.started_at = excluded.started_at and h.stop_reason is null;
  if not found then raise exception 'INVALID_INPUT'; end if;
  delete from turn_private.hosted_worker_heartbeats where last_seen_at < clock_timestamp() - interval '7 days';
  select * into c from turn_private.hosted_worker_control where singleton;
  return jsonb_build_object('kind','ok','enabled',coalesce(c.enabled,false));
end $$;

create function turn_private.assistant_event_link_v1(p_owner uuid,p_task uuid,p_turn uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c uuid; n integer;
begin
 select count(distinct m.conversation_id),min(m.conversation_id::text)::uuid into n,c
 from turn_private.assistant_messages m
 join turn_private.assistant_conversations a on a.id=m.conversation_id and a.owner_id=m.owner_id
 join turn_private.service_tasks s on s.id=m.task_id and s.owner_id=m.owner_id
 join turn_private.service_task_turns l on l.task_id=s.id and l.owner_id=s.owner_id and l.turn_id=p_turn
 join turn_private.text_content tc on tc.turn_id=l.turn_id and tc.owner_id=s.owner_id and tc.thread_id=s.thread_id
 join public.turns t on t.id=tc.turn_id and t.owner_id=tc.owner_id and t.thread_id=s.thread_id
 where m.owner_id=p_owner and s.id=p_task;
 if n>1 then raise exception 'ASSISTANT_EVENT_AMBIGUOUS_LINK';end if;
 return c;
end $$;

create function turn_private.cancel_unclaimable_turn_v1(p_turn uuid,p_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
declare t public.turns%rowtype;attempt_n integer;
begin
 -- Only the newly versioned conversation Task observer emits a cancellation.
 -- Legacy plain/grounded Turns retain their original history and projection.
 if not exists(select 1 from turn_private.service_task_turns l where l.turn_id=p_turn
  and l.owner_id=p_owner and turn_private.assistant_event_link_v1(p_owner,l.task_id,p_turn) is not null) then return;end if;
 -- lock_turn has already taken auth owner + account (unless owner is gone).
 -- Recheck using the same order; never require a now-revoked worker session
 -- in order to emit the actual cancellation that the original writer performs.
 perform 1 from auth.users where id=p_owner for key share nowait;
 if not found then return;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=p_owner for update nowait;
 select * into t from public.turns where id=p_turn and owner_id=p_owner for update nowait;
 if not found then return;end if;
 perform 1 from public.chat_threads where id=t.thread_id and owner_id=p_owner for update nowait;
 if not found then return;end if;
 select attempt into attempt_n from turn_private.work where turn_id=p_turn and owner_id=p_owner
  and state in ('queued','leased') for update nowait;
 if not found then return;end if;
 -- Existing terminal helper preserves an already terminal status; it records
 -- only a genuine newly cancelled Turn and clears its original work lease.
 perform turn_private.terminal(p_turn,'cancelled',attempt_n);
end $$;

CREATE OR REPLACE FUNCTION public.read_text_turn(p_turn_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=turn_private.text_owner(); c turn_private.text_content%rowtype;
begin
 if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) then return coalesce(place_actions_private.ask_text_projection_v1(p_turn_id,false),jsonb_build_object('kind','unavailable'));end if;
  if exists(select 1 from turn_private.text_content guarded_content join turn_private.text_policies guarded_policy on guarded_policy.id=guarded_content.policy_id where guarded_content.turn_id=p_turn_id and guarded_policy.context_mode='knowledge_intent_v1') then return jsonb_build_object('kind','unavailable'); end if;
  if not turn_private.lock_turn(p_turn_id,u,(auth.jwt()->>'session_id')::uuid) then return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id and owner_id=u and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null) then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','text','schemaVersion','text-turn-v1','turnId',c.turn_id,'locale',c.locale,'input',c.input_text,'outcome',c.output_kind,'output',c.output_text);
end $function$
;

CREATE OR REPLACE FUNCTION public.cancel_chat_turn(p_turn_id uuid)
 RETURNS TABLE(sequence integer, state text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare task uuid; task_owner uuid; cancelled record;
begin
 if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and owner_id=auth.uid() and selected_place_request is not null) then
  perform turn_private.text_owner();
  if not turn_private.lock_trip_account_v1(auth.uid()) then raise exception 'UNAUTHENTICATED';end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,34));
 end if;
  select l.task_id,l.owner_id into task,task_owner from turn_private.service_task_turns l
    where l.turn_id=p_turn_id and l.owner_id=(select auth.uid());
  if task is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(task_owner::text,34)); end if;
  select * into cancelled from turn_private.cancel_chat_turn_unmetered(p_turn_id);
  if task is not null and cancelled.state='cancelled' then
    update turn_private.service_task_capacity c set state='released',released_at=pg_catalog.clock_timestamp()
      where c.task_id=task and c.owner_id=task_owner and c.state='reserved';
  end if;
  return query select cancelled.sequence::integer,cancelled.state::text;
end $function$
;

create function public.qa_cancellation_v1(p_action text,p_thread_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid:=(auth.jwt()->>'session_id')::uuid;
 turn_n uuid; t public.turns%rowtype; result_state text; stopped record;
begin
 if p_action is null or p_action not in ('read','cancel') or p_thread_id is null or p_request_id is null then raise exception 'INVALID_INPUT';end if;
 if u is null or sid is null then raise exception 'UNAUTHENTICATED';end if;
 -- Preserve the original cancellation capacity-lock -> mobile/account lock order.
 if p_action='cancel' then perform pg_advisory_xact_lock(hashtextextended(u::text,34));end if;
 -- The original identity guard plus the same live Auth-row checks as text_owner,
 -- without its account-registration INSERT: GET stays metadata-read-only.
 perform 1 from auth.users where id=u for key share nowait;
 if not found then raise exception 'UNAUTHENTICATED';end if;
 perform identity_private.guard_mobile_rpc_v2();
 perform 1 from auth.sessions where id=sid and user_id=u for key share;
 if not found then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null;
 if not found then raise exception 'FORBIDDEN';end if;
 select i.turn_id into turn_n from public.chat_turn_idempotency i
 where i.owner_id=u and i.thread_id=p_thread_id and i.idempotency_key=p_request_id::text;
 if found then
  -- Only the original QA text/Task lineage qualifies. No current provider consent
  -- or policy activation is required to stop an already-owned request. No body is read.
  if not exists(select 1 from turn_private.service_task_turns l
   join turn_private.service_tasks s on s.id=l.task_id and s.owner_id=u and s.thread_id=p_thread_id
   join turn_private.text_content c on c.turn_id=l.turn_id and c.owner_id=u and c.thread_id=p_thread_id
    and c.policy_id=s.policy_id and c.consent_id=s.consent_id
   join turn_private.text_policies p on p.id=s.policy_id and p.context_mode='qa_session_history_v1'
   where l.turn_id=turn_n and l.owner_id=u and l.idempotency_key=p_request_id)
   then raise exception 'FORBIDDEN';end if;
  if not turn_private.lock_turn(turn_n,u,sid) then raise exception 'FORBIDDEN';end if;
  select * into t from public.turns where id=turn_n and owner_id=u and thread_id=p_thread_id;
  if not found then raise exception 'FORBIDDEN';end if;
  if p_action='cancel' and t.status not in ('completed','proposal_ready','unavailable','failed','cancelled') then
   select * into stopped from public.cancel_chat_turn(turn_n);
   -- The original row/event transaction is authoritative, not POST arrival.
   select * into t from public.turns where id=turn_n and owner_id=u and thread_id=p_thread_id;
  end if;
  if t.status='cancelled' then
   if not exists(select 1 from public.chat_turn_events e where e.turn_id=turn_n and e.owner_id=u and e.thread_id=p_thread_id
    and e.event_type='terminal' and e.state='cancelled') then raise exception 'TURN_UNAVAILABLE';end if;
   result_state:='cancelled';
  elsif t.status in ('completed','proposal_ready','unavailable','failed') then result_state:='terminal';
  elsif t.status in ('accepted','planning','retrieving','generating','validating') then result_state:='pending';
  else raise exception 'TURN_UNAVAILABLE';end if;
 else result_state:='not_observed';end if;
 return jsonb_build_object('version','qa-cancellation/1','sessionId',p_thread_id,'requestId',p_request_id,'state',result_state,
  'ack',case when result_state in ('cancelled','terminal') then 'observed' else 'unknown' end);
end $$;

create function turn_private.reserve_model_budget_unbound(
  p_scope_id uuid, p_owner_id uuid, p_task_id uuid, p_attempt_id uuid,
  p_provider text, p_model text, p_price_version text, p_reserved_micros bigint
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s public.model_budget_scopes%rowtype;
  p public.model_budget_provider_limits%rowtype;
  a public.model_budget_attempts%rowtype;
  total_cost numeric; provider_cost numeric; task_cost numeric;
  active_count bigint; task_count bigint;
begin
  if p_scope_id is null or p_owner_id is null or p_task_id is null or p_attempt_id is null
    or p_provider is null or p_model is null or p_price_version is null
    or p_reserved_micros is null or p_reserved_micros < 1 or p_reserved_micros > 1000000000000 then
    return jsonb_build_object('kind','invalid');
  end if;
  select * into s from public.model_budget_scopes where id = p_scope_id for update;
  if not found or s.owner_id <> p_owner_id then return jsonb_build_object('kind','unavailable'); end if;
  select * into a from public.model_budget_attempts where scope_id = p_scope_id and attempt_id = p_attempt_id;
  if found then
    if a.task_id <> p_task_id or a.provider <> p_provider or a.model <> p_model
      or a.price_version <> p_price_version or a.reserved_micros <> p_reserved_micros then
      return jsonb_build_object('kind','conflict');
    end if;
    return jsonb_build_object('kind','duplicate','status',a.status);
  end if;
  select * into p from public.model_budget_provider_limits where scope_id = p_scope_id and provider = p_provider for share;
  if not found or p.model <> p_model or p.price_version <> p_price_version then return jsonb_build_object('kind','unavailable'); end if;
  if not s.enabled or s.frozen or not p.enabled then return jsonb_build_object('kind','disabled'); end if;
  if s.expires_at <= clock_timestamp() then return jsonb_build_object('kind','expired'); end if;
  select
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end),0),
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end) filter (where provider = p_provider),0),
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end) filter (where task_id = p_task_id),0),
    count(*) filter (where status in ('reserved','dispatched','pending')),
    count(*) filter (where task_id = p_task_id)
  into total_cost, provider_cost, task_cost, active_count, task_count
  from public.model_budget_attempts where scope_id = p_scope_id;
  if p_reserved_micros > p.attempt_limit_micros
    or total_cost + p_reserved_micros > s.limit_micros
    or provider_cost + p_reserved_micros > p.limit_micros
    or task_cost + p_reserved_micros > s.task_limit_micros
    or active_count >= s.concurrency_limit or task_count >= s.task_attempt_limit then
    return jsonb_build_object('kind','exhausted');
  end if;
  insert into public.model_budget_attempts(scope_id, attempt_id, task_id, provider, model, price_version, reserved_micros, status)
  values (p_scope_id,p_attempt_id,p_task_id,p_provider,p_model,p_price_version,p_reserved_micros,'reserved');
  return jsonb_build_object('kind','reserved');
end;
$$;

create or replace function turn_private.cancel_chat_turn_unmetered(p_turn_id uuid)
returns table(sequence integer, state text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  turn_row public.turns%rowtype;
  prior_sequence integer;
  cancel_sequence integer;
begin
  select * into turn_row from public.turns where id = p_turn_id and owner_id = (select auth.uid()) for update;
  if not found or turn_row.thread_id is null or not exists (
    select 1 from public.chat_threads where id = turn_row.thread_id and owner_id = (select auth.uid()) and status = 'active'
  ) then raise exception 'FORBIDDEN'; end if;
  select e.sequence into cancel_sequence from public.chat_turn_events e where e.turn_id = p_turn_id and e.state = 'cancelled' limit 1;
  if cancel_sequence is not null then return query select cancel_sequence, 'cancelled'::text; return; end if;
  if turn_row.status in ('completed', 'proposal_ready', 'unavailable', 'failed') then raise exception 'terminal turn cannot emit events'; end if;
  select e.sequence into prior_sequence from public.chat_turn_events e where e.turn_id = p_turn_id order by e.sequence desc limit 1;
  insert into public.chat_turn_events(owner_id, thread_id, turn_id, event_id, sequence, schema_version, event_type, state)
    values (turn_row.owner_id, turn_row.thread_id, p_turn_id, 'cancelled', prior_sequence + 1, 'turn-sse-v1', 'terminal', 'cancelled');
  update public.turns set status = 'cancelled', updated_at = now() where id = p_turn_id;
  update public.chat_threads set updated_at = now() where id = turn_row.thread_id;
  return query select prior_sequence + 1, 'cancelled'::text;
end;
$$;

-- Installation owner retains fixture seeding only; client has narrow original ports.
revoke all on all tables in schema public,auth,identity_private,turn_private from public,anon,authenticated,service_role;
revoke all on all functions in schema public,identity_private,turn_private from public,anon,authenticated,service_role;
revoke all on schema identity_private,turn_private from public,anon,authenticated,service_role;
grant usage on schema public,identity_private to authenticated;
grant usage on schema public,identity_private to service_role;
grant execute on function identity_private.prepare_mobile_v2(uuid,uuid,uuid),public.native_prepare_v2(uuid,uuid,uuid) to service_role;
grant execute on function identity_private.mobile_session_v2(text,uuid),identity_private.mobile_access_v2(),public.native_session_v2(text,uuid) to authenticated;
grant execute on function public.qa_native_session_v1(text,bigint,jsonb), public.qa_read_session_v1(uuid),public.qa_list_sessions_v1(integer),public.qa_read_policy_v1(uuid),public.qa_accept_policy_v1(uuid,text),public.read_text_turn(uuid),public.read_text_policy(uuid),public.accept_text_policy(uuid,text),public.withdraw_text_policy(uuid) to authenticated;
grant select,insert,update on public.chat_threads to authenticated;
grant select on public.turns,public.trips,public.user_profiles to authenticated;
alter table public.user_profiles enable row level security;
create policy baseline_profile_read on public.user_profiles for select to authenticated using(owner_id=(select auth.uid()));
alter table public.chat_threads enable row level security;
alter table public.turns enable row level security;
alter table public.trips enable row level security;
create policy baseline_thread_read on public.chat_threads for select to authenticated using(owner_id=(select auth.uid()));
create policy baseline_thread_insert on public.chat_threads for insert to authenticated with check(owner_id=(select auth.uid()) and (trip_id is null or exists(select 1 from public.trips where id=trip_id and owner_id=(select auth.uid()))));
create policy baseline_thread_update on public.chat_threads for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (trip_id is null or exists(select 1 from public.trips where id=trip_id and owner_id=(select auth.uid()))));
create policy baseline_turn_read on public.turns for select to authenticated using(owner_id=(select auth.uid()));
create policy baseline_trip_read on public.trips for select to authenticated using(owner_id=(select auth.uid()));
do $$declare t record;begin
 for t in select c.relname,n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('identity_private','turn_private') and c.relkind='r' loop
 execute format('alter table %I.%I enable row level security',t.nspname,t.relname);
 end loop;
 for t in select tablename from pg_tables where schemaname='public' loop
 execute format('alter table public.%I enable row level security',t.tablename);
 execute format('create trigger native_mobile_write_v2 before insert or update or delete on public.%I for each row execute function identity_private.guard_mobile_write_v2()',t.tablename);
 execute format('create policy native_mobile_access_v2 on public.%I as restrictive to authenticated using(identity_private.mobile_access_v2()) with check(identity_private.mobile_access_v2())',t.tablename);
 end loop;
end$$;
create trigger immutable_text_policy before update or delete on turn_private.text_policies for each row execute function turn_private.immutable_text_policy();
alter table turn_private.text_content add constraint baseline_text_bounds check(turn_private.valid_text(input_text,4000) and (output_text is null or turn_private.valid_text(output_text,8000)));


-- Original closed QA public and worker ports. No non-QA writer is exposed.
grant execute on function public.qa_submit_message_v1(uuid,uuid,uuid,uuid,text,text,uuid,text),public.qa_cancellation_v1(text,uuid,uuid) to authenticated;
grant execute on function public.qa_ready_groups_v3(integer,text,text,text,uuid,uuid,uuid,text),public.qa_claim_work_v1(uuid,uuid),public.qa_read_work_v1(uuid,uuid),public.qa_authorize_dispatch_v1(uuid,uuid,uuid,uuid,text,text),public.qa_authorize_dispatch_v2(uuid,uuid,uuid,uuid,text,text,uuid,text),public.qa_complete_work_v1(uuid,uuid,text,text),public.reserve_model_budget(uuid,uuid,uuid,uuid,text,text,text,bigint),public.dispatch_model_budget(uuid,uuid,uuid),public.finish_model_budget(uuid,uuid,uuid,text,bigint),public.read_hosted_worker_status(),public.hosted_worker_heartbeat(uuid,text,timestamptz,text,text,bigint,bigint,bigint,bigint,text) to service_role;
grant select,insert,update on public.model_budget_scopes,public.model_budget_provider_limits,public.model_budget_attempts to service_role;
insert into turn_private.hosted_worker_control(singleton) values(true);
insert into turn_private.service_task_capacity_settings(singleton) values(true);
create trigger qa_link_mode_v1 before insert or update on turn_private.service_task_turns for each row execute function turn_private.qa_link_mode_v1();
create trigger baseline_require_task before insert or update on turn_private.text_content for each row execute function turn_private.require_text_task();
create trigger hide_text_on_user_delete after delete on auth.users for each row execute function turn_private.hide_text_content();
create trigger hide_text_on_thread_delete after delete on public.chat_threads for each row execute function turn_private.hide_text_content();
create trigger hide_text_on_thread_archive after update of status on public.chat_threads for each row when (new.status='archived') execute function turn_private.hide_text_content();
create trigger hide_text_on_turn_delete after delete on public.turns for each row execute function turn_private.hide_text_content();

commit;
