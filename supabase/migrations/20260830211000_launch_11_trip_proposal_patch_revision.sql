-- LAUNCH-11: immutable full-patch revision. The parent is never overwritten.
create function public.revise_trip_proposal_patch(p_proposal_id uuid, p_patch jsonb)
returns table(outcome text, proposal_id uuid, revision integer, base_trip_version integer)
language plpgsql security invoker set search_path = public as $$
declare parent public.trip_proposals%rowtype; trip public.trips%rowtype; child public.trip_proposals%rowtype;
begin
  select * into parent from public.trip_proposals where id = p_proposal_id and owner_id = (select auth.uid()) for update;
  if not found or parent.status <> 'pending' then return query select 'proposal_not_confirmable'::text, null::uuid, null::integer, null::integer; return; end if;
  if parent.expires_at <= now() then update public.trip_proposals set status = 'expired' where id = parent.id; return query select 'proposal_expired'::text, null::uuid, null::integer, null::integer; return; end if;
  select * into trip from public.trips where id = parent.trip_id and owner_id = (select auth.uid()) for update;
  if not found or trip.head_version <> parent.base_trip_version then update public.trip_proposals set status = 'conflicted' where id = parent.id; return query select 'version_conflict'::text, null::uuid, null::integer, null::integer; return; end if;
  if jsonb_typeof(p_patch) <> 'object' or p_patch->>'expectedVersion' !~ '^\d{1,9}$' or (p_patch->>'expectedVersion')::integer <> trip.head_version then return query select 'invalid_patch'::text, null::uuid, null::integer, null::integer; return; end if;
  perform public.apply_trip_content_patch(public.trip_content_snapshot(trip.id, trip.title), p_patch);
  insert into public.trip_proposals(owner_id, trip_id, revision, base_trip_version, status, patch, expires_at, parent_proposal_id)
    values (parent.owner_id, parent.trip_id, parent.revision + 1, parent.base_trip_version, 'pending', p_patch, parent.expires_at, parent.id) returning * into child;
  update public.trip_proposals set status = 'superseded' where id = parent.id;
  return query select 'revised'::text, child.id, child.revision, child.base_trip_version;
end;
$$;
revoke all on function public.revise_trip_proposal_patch(uuid, jsonb) from public;
grant execute on function public.revise_trip_proposal_patch(uuid, jsonb) to authenticated;
