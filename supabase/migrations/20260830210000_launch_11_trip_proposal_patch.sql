-- LAUNCH-11: owner-scoped manual TripPatch proposals. Application remains confirm-only.
create function public.create_trip_proposal_patch(p_trip_id uuid, p_patch jsonb)
returns table(proposal_id uuid, revision integer, base_trip_version integer)
language plpgsql security definer set search_path = public as $$
declare trip public.trips%rowtype; next_revision integer; created public.trip_proposals%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into trip from public.trips where id = p_trip_id and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_patch) <> 'object' or p_patch->>'expectedVersion' !~ '^\d{1,9}$' or (p_patch->>'expectedVersion')::integer <> trip.head_version then raise exception 'STALE_TRIP_VERSION'; end if;
  perform public.apply_trip_content_patch(public.trip_content_snapshot(trip.id, trip.title), p_patch);
  if exists(select 1 from public.trip_proposals where trip_id = trip.id and status = 'pending') then raise exception 'PROPOSAL_NOT_CONFIRMABLE'; end if;
  select coalesce(max(revision), 0) + 1 into next_revision from public.trip_proposals where trip_id = trip.id;
  insert into public.trip_proposals(owner_id, trip_id, revision, base_trip_version, status, patch, expires_at)
    values (trip.owner_id, trip.id, next_revision, trip.head_version, 'pending', p_patch, now() + interval '24 hours') returning * into created;
  return query select created.id, created.revision, created.base_trip_version;
end;
$$;
revoke all on function public.create_trip_proposal_patch(uuid, jsonb) from public;
grant execute on function public.create_trip_proposal_patch(uuid, jsonb) to authenticated;
