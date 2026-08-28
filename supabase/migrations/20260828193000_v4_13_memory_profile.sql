-- V4-13: owner-scoped Memory Profile lifecycle. This migration stores only a bounded
-- canonical summary and lifecycle receipts; it does not store raw prompts, model output,
-- user artifacts, provider payloads, or a retrievable copy of a deleted memory.
create table public.memory_consents (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('granted', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memory_consents_owner_idx on public.memory_consents(owner_id, updated_at desc);
alter table public.memory_consents enable row level security;
revoke all on public.memory_consents from anon;
grant select on public.memory_consents to authenticated;
grant select, insert, update, delete on public.memory_consents to service_role;
create policy "memory consent owner selects" on public.memory_consents for select to authenticated using ((select auth.uid()) = owner_id);

create table public.memory_profiles (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_receipt_id uuid not null,
  consent_id uuid not null references public.memory_consents(id) on delete restrict,
  state text not null check (state in ('explicit', 'confirmed', 'inferred', 'rejected', 'paused', 'deleted')),
  constraint_kind text not null check (constraint_kind in ('preference', 'hard_constraint')),
  summary text check (summary is null or char_length(summary) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'deleted' and summary is null) or (state <> 'deleted' and summary is not null)),
  check (constraint_kind <> 'hard_constraint' or state <> 'inferred')
);

create index memory_profiles_owner_retrieval_idx on public.memory_profiles(owner_id, constraint_kind, updated_at desc);
alter table public.memory_profiles enable row level security;
revoke all on public.memory_profiles from anon;
grant select on public.memory_profiles to authenticated;
grant select, insert, update, delete on public.memory_profiles to service_role;
create policy "memory profile owner selects" on public.memory_profiles for select to authenticated using ((select auth.uid()) = owner_id);

create table public.memory_receipts (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null references public.memory_profiles(id) on delete cascade,
  event_state text not null check (event_state in ('explicit', 'confirmed', 'inferred', 'rejected', 'paused', 'deleted')),
  source_kind text not null check (source_kind in ('user_confirmed', 'bounded_turn', 'user_artifact', 'system')),
  created_at timestamptz not null default now()
);

create index memory_receipts_owner_memory_idx on public.memory_receipts(owner_id, memory_id, created_at);
alter table public.memory_receipts enable row level security;
revoke all on public.memory_receipts from anon;
grant select on public.memory_receipts to authenticated;
grant select, insert, update, delete on public.memory_receipts to service_role;
create policy "memory receipt owner selects" on public.memory_receipts for select to authenticated using ((select auth.uid()) = owner_id);

alter table public.memory_profiles add constraint memory_profile_source_receipt_fk
  foreign key (source_receipt_id) references public.memory_receipts(id) deferrable initially deferred;

create function public.grant_memory_retrieval_consent(p_consent_id uuid)
returns table(consent_id uuid, status text, reused boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare previous public.memory_consents%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.memory_consents where id = p_consent_id and owner_id = (select auth.uid()) for update;
  if found then
    if previous.status = 'granted' then return query select previous.id, previous.status, true; return; end if;
    update public.memory_consents set status = 'granted', updated_at = now() where id = previous.id;
    return query select previous.id, 'granted'::text, false;
    return;
  end if;
  insert into public.memory_consents(id, owner_id, status) values (p_consent_id, (select auth.uid()), 'granted');
  return query select p_consent_id, 'granted'::text, false;
end;
$$;

create function public.revoke_memory_retrieval_consent(p_consent_id uuid)
returns table(consent_id uuid, status text, reused boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare previous public.memory_consents%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.memory_consents where id = p_consent_id and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if previous.status = 'revoked' then return query select previous.id, previous.status, true; return; end if;
  update public.memory_consents set status = 'revoked', updated_at = now() where id = previous.id;
  return query select previous.id, 'revoked'::text, false;
end;
$$;

create function public.create_explicit_memory_profile(
  p_memory_id uuid,
  p_receipt_id uuid,
  p_consent_id uuid,
  p_constraint_kind text,
  p_summary text
)
returns table(memory_id uuid, state text, reused boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare previous public.memory_profiles%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  if p_constraint_kind not in ('preference', 'hard_constraint') or p_summary is null or char_length(p_summary) not between 1 and 500 then raise exception 'INVALID_MEMORY'; end if;
  if not exists (select 1 from public.memory_consents where id = p_consent_id and owner_id = (select auth.uid()) and status = 'granted') then raise exception 'CONSENT_REQUIRED'; end if;
  select * into previous from public.memory_profiles where id = p_memory_id and owner_id = (select auth.uid()) for update;
  if found then
    if previous.source_receipt_id = p_receipt_id and previous.consent_id = p_consent_id and previous.constraint_kind = p_constraint_kind and previous.summary = p_summary and previous.state = 'explicit' then
      return query select previous.id, previous.state, true;
      return;
    end if;
    raise exception 'MEMORY_ID_REUSE';
  end if;
  if exists (select 1 from public.memory_profiles where id = p_memory_id)
    or exists (select 1 from public.memory_receipts where id = p_receipt_id) then
    raise exception 'FORBIDDEN';
  end if;
  insert into public.memory_profiles(id, owner_id, source_receipt_id, consent_id, state, constraint_kind, summary)
    values (p_memory_id, (select auth.uid()), p_receipt_id, p_consent_id, 'explicit', p_constraint_kind, p_summary);
  insert into public.memory_receipts(id, owner_id, memory_id, event_state, source_kind)
    values (p_receipt_id, (select auth.uid()), p_memory_id, 'explicit', 'user_confirmed');
  return query select p_memory_id, 'explicit'::text, false;
end;
$$;

create function public.transition_memory_profile(p_memory_id uuid, p_next_state text)
returns table(memory_id uuid, state text, reused boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare previous public.memory_profiles%rowtype;
declare receipt_id uuid := gen_random_uuid();
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.memory_profiles where id = p_memory_id and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if p_next_state not in ('confirmed', 'rejected', 'paused', 'deleted', 'explicit') then raise exception 'INVALID_MEMORY_STATE'; end if;
  if previous.state = p_next_state then return query select previous.id, previous.state, true; return; end if;
  if previous.state in ('rejected', 'deleted') then raise exception 'TERMINAL_MEMORY'; end if;
  if previous.state = 'inferred' and p_next_state not in ('confirmed', 'rejected', 'paused', 'deleted') then raise exception 'INVALID_MEMORY_TRANSITION'; end if;
  if previous.state in ('explicit', 'confirmed') and p_next_state not in ('paused', 'rejected', 'deleted') then raise exception 'INVALID_MEMORY_TRANSITION'; end if;
  if previous.state = 'paused' and p_next_state not in ('explicit', 'confirmed', 'rejected', 'deleted') then raise exception 'INVALID_MEMORY_TRANSITION'; end if;
  update public.memory_profiles
    set state = p_next_state,
        summary = case when p_next_state = 'deleted' then null else summary end,
        updated_at = now()
    where id = previous.id;
  insert into public.memory_receipts(id, owner_id, memory_id, event_state, source_kind)
    values (receipt_id, (select auth.uid()), previous.id, p_next_state, 'user_confirmed');
  return query select previous.id, p_next_state, false;
end;
$$;

create function public.read_retrievable_memory_profiles()
returns setof public.memory_profiles
language sql
stable
security invoker
set search_path = public, auth
as $$
  select memory.*
  from public.memory_profiles memory
  join public.memory_consents consent on consent.id = memory.consent_id and consent.owner_id = memory.owner_id
  where memory.owner_id = (select auth.uid())
    and consent.status = 'granted'
    and memory.state in ('explicit', 'confirmed')
  order by case memory.constraint_kind when 'hard_constraint' then 0 else 1 end, memory.updated_at desc, memory.id;
$$;

revoke all on function public.grant_memory_retrieval_consent(uuid) from public;
grant execute on function public.grant_memory_retrieval_consent(uuid) to authenticated;
revoke all on function public.revoke_memory_retrieval_consent(uuid) from public;
grant execute on function public.revoke_memory_retrieval_consent(uuid) to authenticated;
revoke all on function public.create_explicit_memory_profile(uuid, uuid, uuid, text, text) from public;
grant execute on function public.create_explicit_memory_profile(uuid, uuid, uuid, text, text) to authenticated;
revoke all on function public.transition_memory_profile(uuid, text) from public;
grant execute on function public.transition_memory_profile(uuid, text) to authenticated;
revoke all on function public.read_retrievable_memory_profiles() from public;
grant execute on function public.read_retrievable_memory_profiles() to authenticated;
