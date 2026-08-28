-- V4-17: owner-scoped privacy request/receipt boundary. It accepts a closed
-- all-data export or delete request, but no database row is exported or erased
-- by this migration. A separately accepted executor must perform that work.
create table public.privacy_requests (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('export', 'delete')),
  scope_version text not null check (scope_version = 'all-user-data-v1'),
  status text not null check (status = 'requested'),
  execution_state text not null check (execution_state = 'not_started'),
  created_at timestamptz not null default now()
);

create index privacy_requests_owner_created_idx on public.privacy_requests(owner_id, created_at desc);
alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from anon;
grant select on public.privacy_requests to authenticated;
grant select, insert, update, delete on public.privacy_requests to service_role;
create policy "privacy request owner selects" on public.privacy_requests for select to authenticated using ((select auth.uid()) = owner_id);

create table public.privacy_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null references public.privacy_requests(id) on delete cascade,
  event_type text not null check (event_type = 'requested'),
  created_at timestamptz not null default now(),
  unique (request_id, event_type)
);

create index privacy_receipts_owner_created_idx on public.privacy_receipts(owner_id, created_at desc);
alter table public.privacy_receipts enable row level security;
revoke all on public.privacy_receipts from anon;
grant select on public.privacy_receipts to authenticated;
grant select, insert, update, delete on public.privacy_receipts to service_role;
create policy "privacy receipt owner selects" on public.privacy_receipts for select to authenticated using ((select auth.uid()) = owner_id);

create function public.request_privacy_action(p_request_id uuid, p_action text)
returns table(request_id uuid, action text, status text, execution_state text, created_at timestamptz, reused boolean)
language plpgsql security definer set search_path = public, auth
as $$
declare prior public.privacy_requests%rowtype;
declare inserted_count integer;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  if p_action not in ('export', 'delete') then raise exception 'INVALID_PRIVACY_REQUEST'; end if;
  insert into public.privacy_requests(id, owner_id, action, scope_version, status, execution_state)
    values (p_request_id, (select auth.uid()), p_action, 'all-user-data-v1', 'requested', 'not_started')
    on conflict (id) do nothing;
  get diagnostics inserted_count = row_count;
  select * into prior from public.privacy_requests where id = p_request_id for update;
  if not found or prior.owner_id <> (select auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if prior.action <> p_action then raise exception 'PRIVACY_REQUEST_ID_REUSE'; end if;
  insert into public.privacy_receipts(owner_id, request_id, event_type)
    values ((select auth.uid()), p_request_id, 'requested')
    on conflict (request_id, event_type) do nothing;
  return query select prior.id, prior.action, prior.status, prior.execution_state, prior.created_at, inserted_count = 0;
end;
$$;

revoke all on function public.request_privacy_action(uuid, text) from public;
grant execute on function public.request_privacy_action(uuid, text) to authenticated;
