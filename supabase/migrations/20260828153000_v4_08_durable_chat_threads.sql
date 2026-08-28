-- V4-08: durable, owner-scoped chat thread state. This stores no raw prompt,
-- provider output, model reasoning, or unvalidated payload.
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_threads_owner_created_idx on public.chat_threads(owner_id, created_at desc);
alter table public.chat_threads enable row level security;
revoke all on public.chat_threads from anon;
grant select, insert, update on public.chat_threads to authenticated;
grant select, insert, update, delete on public.chat_threads to service_role;
create policy "chat thread owner selects" on public.chat_threads for select to authenticated using ((select auth.uid()) = owner_id);
create policy "chat thread owner inserts" on public.chat_threads for insert to authenticated with check (
  (select auth.uid()) = owner_id and (trip_id is null or exists (select 1 from public.trips where id = trip_id and owner_id = (select auth.uid())))
);
create policy "chat thread owner archives" on public.chat_threads for update to authenticated using ((select auth.uid()) = owner_id) with check (
  (select auth.uid()) = owner_id and (trip_id is null or exists (select 1 from public.trips where id = trip_id and owner_id = (select auth.uid())))
);

alter table public.turns add column if not exists thread_id uuid references public.chat_threads(id) on delete cascade;
alter table public.turns add column if not exists updated_at timestamptz not null default now();
alter table public.turns drop constraint if exists turns_status_check;
alter table public.turns add constraint turns_status_check check (status in ('accepted', 'planning', 'retrieving', 'generating', 'validating', 'completed', 'proposal_ready', 'unavailable', 'failed', 'cancelled'));
create index if not exists turns_thread_created_idx on public.turns(thread_id, created_at);
revoke insert on public.turns from authenticated;
drop policy if exists "turn owner inserts" on public.turns;

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

create index chat_turn_events_thread_turn_sequence_idx on public.chat_turn_events(thread_id, turn_id, sequence);
alter table public.chat_turn_events enable row level security;
revoke all on public.chat_turn_events from anon;
grant select on public.chat_turn_events to authenticated;
grant select, insert, update, delete on public.chat_turn_events to service_role;
create policy "chat event owner selects" on public.chat_turn_events for select to authenticated using ((select auth.uid()) = owner_id);

create table public.chat_turn_idempotency (
  owner_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  digest text not null check (char_length(digest) between 1 and 160),
  turn_id uuid not null references public.turns(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, thread_id, idempotency_key)
);

alter table public.chat_turn_idempotency enable row level security;
revoke all on public.chat_turn_idempotency from anon;
grant select on public.chat_turn_idempotency to authenticated;
grant select, insert, update, delete on public.chat_turn_idempotency to service_role;
create policy "chat idempotency owner selects" on public.chat_turn_idempotency for select to authenticated using ((select auth.uid()) = owner_id);

create function public.start_chat_turn(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_digest text)
returns table(turn_id uuid, reused boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  thread public.chat_threads%rowtype;
  previous public.chat_turn_idempotency%rowtype;
begin
  if p_digest <> 'chat-state-control-v1' then raise exception 'invalid state control digest'; end if;
  select * into thread from public.chat_threads where id = p_thread_id and owner_id = (select auth.uid()) for update;
  if not found or thread.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.chat_turn_idempotency
    where owner_id = (select auth.uid()) and thread_id = p_thread_id and idempotency_key = p_idempotency_key for update;
  if found then
    if previous.digest <> p_digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    return query select previous.turn_id, true;
    return;
  end if;
  insert into public.turns(id, owner_id, thread_id, trip_id, status)
    values (p_turn_id, thread.owner_id, thread.id, thread.trip_id, 'accepted');
  insert into public.chat_turn_events(owner_id, thread_id, turn_id, event_id, sequence, schema_version, event_type, state)
    values (thread.owner_id, thread.id, p_turn_id, 'accepted', 1, 'turn-sse-v1', 'accepted', 'accepted');
  insert into public.chat_turn_idempotency(owner_id, thread_id, idempotency_key, digest, turn_id)
    values (thread.owner_id, thread.id, p_idempotency_key, p_digest, p_turn_id);
  update public.chat_threads set updated_at = now() where id = thread.id;
  return query select p_turn_id, false;
end;
$$;

create function public.append_chat_turn_event(p_turn_id uuid, p_event_id text, p_event_type text, p_state text)
returns table(sequence integer, state text)
language plpgsql
security definer
set search_path = public
as $$
declare
  turn_row public.turns%rowtype;
  prior_sequence integer;
  prior_state text;
  next_sequence integer;
  terminal_states text[] := array['completed', 'proposal_ready', 'unavailable', 'failed', 'cancelled'];
  states text[] := array['accepted', 'planning', 'retrieving', 'generating', 'validating', 'completed', 'proposal_ready', 'unavailable', 'failed', 'cancelled'];
begin
  select * into turn_row from public.turns where id = p_turn_id and owner_id = (select auth.uid()) for update;
  if not found or turn_row.thread_id is null or not exists (
    select 1 from public.chat_threads where id = turn_row.thread_id and owner_id = (select auth.uid()) and status = 'active'
  ) then raise exception 'FORBIDDEN'; end if;
  if turn_row.status = any(terminal_states) then raise exception 'terminal turn cannot emit events'; end if;
  if (p_event_type = 'terminal') <> (p_state = any(terminal_states)) then raise exception 'invalid terminal event'; end if;
  select sequence, state into prior_sequence, prior_state from public.chat_turn_events where turn_id = p_turn_id order by sequence desc limit 1;
  if prior_sequence is null then raise exception 'turn is missing accepted event'; end if;
  if array_position(states, p_state) < array_position(states, prior_state) then raise exception 'turn state must be monotonic'; end if;
  next_sequence := prior_sequence + 1;
  insert into public.chat_turn_events(owner_id, thread_id, turn_id, event_id, sequence, schema_version, event_type, state)
    values (turn_row.owner_id, turn_row.thread_id, p_turn_id, p_event_id, next_sequence, 'turn-sse-v1', p_event_type, p_state);
  update public.turns set status = p_state, updated_at = now() where id = p_turn_id;
  update public.chat_threads set updated_at = now() where id = turn_row.thread_id;
  return query select next_sequence, p_state;
end;
$$;

revoke all on function public.start_chat_turn(uuid, uuid, uuid, text) from public;
grant execute on function public.start_chat_turn(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.append_chat_turn_event(uuid, text, text, text) from public;
grant execute on function public.append_chat_turn_event(uuid, text, text, text) to service_role;

create function public.cancel_chat_turn(p_turn_id uuid)
returns table(sequence integer, state text)
language plpgsql
security definer
set search_path = public
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
  select sequence into cancel_sequence from public.chat_turn_events where turn_id = p_turn_id and state = 'cancelled' limit 1;
  if cancel_sequence is not null then return query select cancel_sequence, 'cancelled'::text; return; end if;
  if turn_row.status in ('completed', 'proposal_ready', 'unavailable', 'failed') then raise exception 'terminal turn cannot emit events'; end if;
  select sequence into prior_sequence from public.chat_turn_events where turn_id = p_turn_id order by sequence desc limit 1;
  insert into public.chat_turn_events(owner_id, thread_id, turn_id, event_id, sequence, schema_version, event_type, state)
    values (turn_row.owner_id, turn_row.thread_id, p_turn_id, 'cancelled', prior_sequence + 1, 'turn-sse-v1', 'terminal', 'cancelled');
  update public.turns set status = 'cancelled', updated_at = now() where id = p_turn_id;
  update public.chat_threads set updated_at = now() where id = turn_row.thread_id;
  return query select prior_sequence + 1, 'cancelled'::text;
end;
$$;

revoke all on function public.cancel_chat_turn(uuid) from public;
grant execute on function public.cancel_chat_turn(uuid) to authenticated;
