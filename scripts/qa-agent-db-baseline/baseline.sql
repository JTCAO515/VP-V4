-- SYNTHETIC OWN EMPTY PG ONLY; NOT A DEPLOYMENT MIGRATION.
begin;
create schema identity_private; create schema turn_private; revoke all on schema identity_private,turn_private from public;

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

create function turn_private.valid_text(p_text text,p_max integer)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(length(btrim(p_text,E' \t\n\r\f\v'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0 and
    (select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0) from regexp_split_to_table(p_text,'') c)<=p_max,false)
$$;

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

create or replace function public.read_text_turn(p_turn_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_content%rowtype;
begin
  if exists(select 1 from turn_private.text_content guarded_content join turn_private.text_policies guarded_policy on guarded_policy.id=guarded_content.policy_id where guarded_content.turn_id=p_turn_id and guarded_policy.context_mode='knowledge_intent_v1') then return jsonb_build_object('kind','unavailable'); end if;
  if not turn_private.lock_turn(p_turn_id,u,(auth.jwt()->>'session_id')::uuid) then return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id and owner_id=u and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null) then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','text','schemaVersion','text-turn-v1','turnId',c.turn_id,'locale',c.locale,'input',c.input_text,'outcome',c.output_kind,'output',c.output_text);
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

commit;
