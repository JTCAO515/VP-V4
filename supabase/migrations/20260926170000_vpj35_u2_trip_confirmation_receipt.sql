-- VPJ-35 U2: an owner-readable, current-version Trip result receipt.
-- This does not associate a Trip with a ServiceTask or enable capacity charging.
-- A future settlement must check this receipt while holding the task and Trip
-- locks in the same transaction; a client-visible confirmation response alone
-- is not a settlement authority.
create index trip_idempotency_proposal_receipt_idx on public.trip_idempotency(proposal_id,owner_id)
  where proposal_id is not null;
create function public.read_trip_confirmation_receipt_v1(p_proposal_id uuid)
returns table(proposal_id uuid, trip_id uuid, resulting_version integer)
language sql stable security invoker set search_path='' as $$
  select p.id, p.trip_id, e.resulting_version
  from public.trip_proposals p
  join public.trip_events e on e.proposal_id=p.id and e.owner_id=p.owner_id
    and e.trip_id=p.trip_id and e.event_type='proposal_applied'
  join public.trip_idempotency i on i.proposal_id=p.id and i.owner_id=p.owner_id
    and i.outcome='applied' and i.resulting_version=e.resulting_version
  join public.trip_version_snapshots s on s.trip_id=p.trip_id and s.owner_id=p.owner_id
    and s.version=e.resulting_version and s.content is not null
  join public.trips t on t.id=p.trip_id and t.owner_id=p.owner_id
    and t.head_version=e.resulting_version
  where p.id=p_proposal_id and p.owner_id=(select auth.uid()) and p.status='applied'
    and e.resulting_version=p.base_trip_version+1;
$$;
revoke all on function public.read_trip_confirmation_receipt_v1(uuid) from public,anon,service_role;
grant execute on function public.read_trip_confirmation_receipt_v1(uuid) to authenticated;
notify pgrst,'reload schema';
