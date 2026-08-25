create or replace function public.confirm_and_apply_trip_proposal(
  p_proposal_id uuid,
  p_idempotency_key text,
  p_digest text
)
returns table(outcome text, resulting_version integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  proposal public.trip_proposals%rowtype;
  trip public.trips%rowtype;
  previous public.trip_idempotency%rowtype;
  next_title text;
begin
  select * into previous from public.trip_idempotency
    where owner_id = (select auth.uid()) and idempotency_key = p_idempotency_key;
  if found then
    if previous.digest <> p_digest then
      raise exception 'IDEMPOTENCY_KEY_REUSE';
    end if;
    return query select 'already_applied'::text, previous.resulting_version;
    return;
  end if;

  select * into proposal from public.trip_proposals
    where id = p_proposal_id and owner_id = (select auth.uid()) for update;
  if not found or proposal.status <> 'pending' then
    return query select 'proposal_not_confirmable'::text, null::integer;
    return;
  end if;
  if proposal.expires_at <= now() then
    update public.trip_proposals set status = 'expired' where id = proposal.id;
    return query select 'proposal_expired'::text, null::integer;
    return;
  end if;
  if jsonb_typeof(proposal.patch) <> 'object' or jsonb_typeof(proposal.patch->'title') <> 'string' then
    return query select 'invalid_patch'::text, null::integer;
    return;
  end if;
  next_title := proposal.patch->>'title';

  select * into trip from public.trips
    where id = proposal.trip_id and owner_id = (select auth.uid()) for update;
  if not found or trip.head_version <> proposal.base_trip_version then
    update public.trip_proposals set status = 'conflicted' where id = proposal.id;
    return query select 'version_conflict'::text, null::integer;
    return;
  end if;

  update public.trips set title = next_title, head_version = head_version + 1, updated_at = now()
    where id = trip.id and head_version = proposal.base_trip_version
    returning * into trip;
  if not found then
    return query select 'version_conflict'::text, null::integer;
    return;
  end if;

  insert into public.trip_events(trip_id, owner_id, resulting_version, proposal_id, event_type)
    values (trip.id, trip.owner_id, trip.head_version, proposal.id, 'proposal_applied');
  update public.trip_proposals set status = 'applied' where id = proposal.id;
  insert into public.trip_idempotency(owner_id, idempotency_key, digest, outcome, resulting_version)
    values (trip.owner_id, p_idempotency_key, p_digest, 'applied', trip.head_version);
  insert into public.trip_audit_events(owner_id, action, trip_id, proposal_id)
    values (trip.owner_id, 'proposal_applied', trip.id, proposal.id);
  return query select 'applied'::text, trip.head_version;
end;
$$;
