alter table public.trip_proposals
  add column parent_proposal_id uuid references public.trip_proposals(id) on delete restrict;

create index trip_proposals_parent_proposal_id_idx on public.trip_proposals(parent_proposal_id);

drop policy "proposal owner resolves own" on public.trip_proposals;
create policy "proposal owner resolves own"
on public.trip_proposals for update to authenticated
using ((select auth.uid()) = owner_id and status = 'pending')
with check ((select auth.uid()) = owner_id and status in ('applied', 'expired', 'conflicted', 'rejected', 'superseded'));

create function public.revise_trip_proposal(
  p_proposal_id uuid,
  p_title text
)
returns table(outcome text, proposal_id uuid, revision integer, base_trip_version integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  parent public.trip_proposals%rowtype;
  child public.trip_proposals%rowtype;
  trip public.trips%rowtype;
begin
  if char_length(btrim(p_title)) not between 1 and 160 then
    return query select 'invalid_patch'::text, null::uuid, null::integer, null::integer;
    return;
  end if;

  select * into parent from public.trip_proposals
    where id = p_proposal_id and owner_id = (select auth.uid()) for update;
  if not found or parent.status <> 'pending' then
    return query select 'proposal_not_confirmable'::text, null::uuid, null::integer, null::integer;
    return;
  end if;
  if parent.expires_at <= now() then
    update public.trip_proposals set status = 'expired' where id = parent.id;
    return query select 'proposal_expired'::text, null::uuid, null::integer, null::integer;
    return;
  end if;

  select * into trip from public.trips
    where id = parent.trip_id and owner_id = (select auth.uid()) for update;
  if not found or trip.head_version <> parent.base_trip_version then
    update public.trip_proposals set status = 'conflicted' where id = parent.id;
    return query select 'version_conflict'::text, null::uuid, null::integer, null::integer;
    return;
  end if;

  insert into public.trip_proposals(
    owner_id, trip_id, revision, base_trip_version, status, patch, expires_at, parent_proposal_id
  ) values (
    parent.owner_id, parent.trip_id, parent.revision + 1, parent.base_trip_version, 'pending',
    jsonb_build_object('title', btrim(p_title)), parent.expires_at, parent.id
  ) returning * into child;

  update public.trip_proposals set status = 'superseded' where id = parent.id;
  return query select 'revised'::text, child.id, child.revision, child.base_trip_version;
end;
$$;

revoke all on function public.revise_trip_proposal(uuid, text) from public;
grant execute on function public.revise_trip_proposal(uuid, text) to authenticated;
