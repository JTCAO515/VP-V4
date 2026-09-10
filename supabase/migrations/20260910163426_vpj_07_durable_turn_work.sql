-- VPJ-07: content-free, explicit service admission. No route or provider is enabled.
create schema turn_private;
revoke all on schema turn_private from public, anon, authenticated;
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
alter table turn_private.work enable row level security;
create index turn_work_ready on turn_private.work(created_at,turn_id) where state in ('queued','leased');

-- Match native cancellation's account -> Turn -> thread lock order. Auth-session
-- deletion is also fenced. Callers never adopt user JWT claims for service work.
create function turn_private.lock_turn(p_turn uuid,p_owner uuid,p_session uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare t public.turns%rowtype;
begin
  perform 1 from identity_private.mobile_accounts where owner_id=p_owner for update;
  perform 1 from auth.sessions where id=p_session and user_id=p_owner for key share;
  if not found then return false; end if;
  if exists(select 1 from identity_private.mobile_login_proofs where session_id=p_session)
     or exists(select 1 from identity_private.mobile_attempts where session_id=p_session) then
    if not exists(select 1 from identity_private.mobile_accounts where owner_id=p_owner and session_id=p_session) then return false; end if;
  end if;
  select * into t from public.turns where id=p_turn and owner_id=p_owner for update;
  if not found or t.thread_id is null then return false; end if;
  perform 1 from public.chat_threads where id=t.thread_id and owner_id=p_owner and status='active' for update;
  return found;
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

-- Existing cancel/append RPCs serialize on the same Turn row. This internal helper
-- emits only terminal metadata, never an answer or a Trip mutation.
create function turn_private.terminal(p_turn uuid,p_state text,p_attempt integer)
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
  update turn_private.work set state=p_state,lease_token=null,expires_at=null where turn_id=p_turn;
end $$;

create function public.claim_turn_work()
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; w turn_private.work%rowtype; turn_state text;
begin
  -- Advisory locks keep competing claimers off one candidate without reversing
  -- the account/Turn lock order used by cancellation and admission. Once any
  -- entity lock is acquired, handle only that candidate and return. Continuing
  -- would accumulate locks across owners and allow opposite-order deadlocks.
  -- An empty result may mean one stale candidate was cleaned; callers poll again.
  for candidate in select turn_id,owner_id,session_id from turn_private.work
    where state='queued' or (state='leased' and expires_at<=clock_timestamp()) order by created_at,turn_id limit 100 loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null where turn_id=candidate.turn_id and state in ('queued','leased');
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id for update;
    if not found or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp()) then return jsonb_build_object('kind','empty'); end if;
    select status into turn_state from public.turns where id=w.turn_id;
    if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then perform turn_private.terminal(w.turn_id,'cancelled',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); return jsonb_build_object('kind','empty'); end if;
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond' where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $$;

create function public.finish_turn_work(p_turn_id uuid,p_lease_token uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; turn_state text;
begin
  if p_outcome is null or p_outcome not in ('completed','provider_failure','validation_failure') then raise exception 'INVALID_INPUT'; end if;
  select * into w from turn_private.work where turn_id=p_turn_id;
  if not found or p_lease_token is null then return jsonb_build_object('kind','stale'); end if;
  if not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return jsonb_build_object('kind','unavailable'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id for update;
  if not found or w.state<>'leased' or w.lease_token is distinct from p_lease_token or w.expires_at<=clock_timestamp() then return jsonb_build_object('kind','stale'); end if;
  select status into turn_state from public.turns where id=w.turn_id;
  if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then
    perform turn_private.terminal(w.turn_id,'cancelled',w.attempt);
    return jsonb_build_object('kind','stale');
  end if;
  if p_outcome='provider_failure' and w.attempt<w.max_attempts then
    update turn_private.work set state='queued',lease_token=null,expires_at=null where turn_id=w.turn_id;
    return jsonb_build_object('kind','queued');
  end if;
  perform turn_private.terminal(w.turn_id,case p_outcome when 'completed' then 'completed' when 'validation_failure' then 'failed' else 'quarantined' end,w.attempt);
  return jsonb_build_object('kind','finished');
end $$;

revoke all on all tables in schema turn_private from public,anon,authenticated,service_role;
revoke all on all functions in schema turn_private from public,anon,authenticated,service_role;
revoke all on function public.enqueue_turn_work(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.claim_turn_work() from public,anon,authenticated;
revoke all on function public.finish_turn_work(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.enqueue_turn_work(uuid,uuid,uuid,integer,integer) to service_role;
grant execute on function public.claim_turn_work() to service_role;
grant execute on function public.finish_turn_work(uuid,uuid,text) to service_role;
