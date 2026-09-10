-- Empty, private registry. Applying this migration grants no provider/data policy.
-- Activate only a separately reviewed notice/recipient/region agreement.
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
-- No cascading FK on retained content. Permanent hiding prevents revival if IDs
-- are recreated. This applies only to newly consented records, never old data.
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
create index text_content_owner on turn_private.text_content(owner_id);
create index text_content_thread on turn_private.text_content(thread_id);
-- A DB authorization is bound to one lease and provider, and may be consumed once.
create table turn_private.text_dispatches (
  lease_token uuid primary key,
  turn_id uuid not null,
  consent_id uuid not null,
  policy_id uuid not null,
  dispatched_at timestamptz not null default clock_timestamp()
);

create function turn_private.immutable_text_policy()
returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='DELETE' or (to_jsonb(NEW)-'revoked_at') is distinct from (to_jsonb(OLD)-'revoked_at')
     or OLD.revoked_at is not null or NEW.revoked_at is null or NEW.revoked_at>clock_timestamp() then raise exception 'IMMUTABLE_POLICY'; end if;
  return NEW;
end $$;
create trigger immutable_text_policy before update or delete on turn_private.text_policies for each row execute function turn_private.immutable_text_policy();

-- UTF-16 limits match the versioned JavaScript envelope, including astral chars.
create function turn_private.valid_text(p_text text,p_max integer)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(length(btrim(p_text,E' \t\n\r\f\v'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0 and
    (select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0) from regexp_split_to_table(p_text,'') c)<=p_max,false)
$$;
alter table turn_private.text_content add constraint bounded_text_content check(turn_private.valid_text(input_text,4000) and (output_text is null or turn_private.valid_text(output_text,8000)));

-- Fail fast on deletion locks: rollback/retry, never cancel a busy candidate.
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

-- Account/session/Turn/thread -> work -> policy/consent. Owner mutations also hold
-- account; global policy revocation takes only policy, never a Turn lock.
create function turn_private.lock_text_work(p_turn uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; c turn_private.text_content%rowtype;
begin
  select * into w from turn_private.work where turn_id=p_turn;
  if not found or p_token is null or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return false; end if;
  select * into w from turn_private.work where turn_id=p_turn for update;
  if not found or w.state<>'leased' or w.lease_token is distinct from p_token or w.expires_at<=clock_timestamp()
    or not exists(select 1 from public.turns where id=p_turn and status not in ('completed','proposal_ready','unavailable','failed','cancelled')) then return false; end if;
  select * into c from turn_private.text_content where turn_id=p_turn and owner_id=w.owner_id and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) then return false; end if;
  perform 1 from turn_private.text_consents where owner_id=c.owner_id and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null for share;
  return found and w.expires_at>clock_timestamp();
end $$;

create function public.read_text_work(p_turn_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype; p turn_private.text_policies%rowtype;
begin
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  select * into p from turn_private.text_policies where id=c.policy_id;
  return jsonb_build_object('kind','input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint);
end $$;

create function public.authorize_text_dispatch(p_turn_id uuid,p_lease_token uuid,p_policy_id uuid,p_provider text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype;
begin
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  if c.policy_id is distinct from p_policy_id or not exists(select 1 from turn_private.text_policies where id=p_policy_id and provider=p_provider) then return jsonb_build_object('kind','blocked'); end if;
  insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,c.consent_id,c.policy_id) on conflict do nothing;
  if not found then return jsonb_build_object('kind','blocked'); end if;
  return jsonb_build_object('kind','authorized');
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

create function public.complete_text_work(p_turn_id uuid,p_lease_token uuid,p_kind text,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;
begin
  if p_kind is null or p_kind not in ('answered','partial','clarification','blocked','technical_failure') or not turn_private.valid_text(p_text,8000) then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  if p_kind in ('answered','partial','clarification') and not exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token and turn_id=p_turn_id) then return jsonb_build_object('kind','blocked'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id;
  update turn_private.text_content set output_kind=p_kind,output_text=p_text where turn_id=p_turn_id;
  perform turn_private.terminal(p_turn_id,case when p_kind='blocked' then 'unavailable' when p_kind='technical_failure' then 'failed' else 'completed' end,w.attempt);
  return jsonb_build_object('kind','finished');
end $$;

create function public.read_text_turn(p_turn_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_content%rowtype;
begin
  if not turn_private.lock_turn(p_turn_id,u,(auth.jwt()->>'session_id')::uuid) then return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id and owner_id=u and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null) then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','text','schemaVersion','text-turn-v1','turnId',c.turn_id,'locale',c.locale,'input',c.input_text,'outcome',c.output_kind,'output',c.output_text);
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
create trigger hide_text_on_user_delete after delete on auth.users for each row execute function turn_private.hide_text_content();
create trigger hide_text_on_thread_delete after delete on public.chat_threads for each row execute function turn_private.hide_text_content();
create trigger hide_text_on_turn_delete after delete on public.turns for each row execute function turn_private.hide_text_content();

-- No direct table access, including service_role. Service uses bounded RPCs only.
alter table turn_private.text_policies enable row level security;
alter table turn_private.text_consents enable row level security;
alter table turn_private.text_content enable row level security;
alter table turn_private.text_dispatches enable row level security;
revoke all on all tables in schema turn_private from public,anon,authenticated,service_role;
revoke all on all functions in schema turn_private from public,anon,authenticated,service_role;
revoke all on function public.accept_text_policy(uuid,text),public.withdraw_text_policy(uuid),public.start_text_turn(uuid,uuid,uuid,uuid,text,text),public.read_text_turn(uuid) from public,anon,service_role;
grant execute on function public.accept_text_policy(uuid,text),public.withdraw_text_policy(uuid),public.start_text_turn(uuid,uuid,uuid,uuid,text,text),public.read_text_turn(uuid) to authenticated;
revoke all on function public.read_text_work(uuid,uuid),public.authorize_text_dispatch(uuid,uuid,uuid,text),public.complete_text_work(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.read_text_work(uuid,uuid),public.authorize_text_dispatch(uuid,uuid,uuid,text),public.complete_text_work(uuid,uuid,text,text) to service_role;
