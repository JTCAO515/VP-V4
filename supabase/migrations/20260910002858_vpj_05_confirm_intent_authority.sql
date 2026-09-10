-- VPJ-05: bind confirmation to the exact persistent proposal and protect server receipts.
-- Historical receipts have no trustworthy proposal link and remain unmodified/unbound.
alter table public.trip_idempotency add column proposal_id uuid;
revoke insert, update, delete on public.trip_idempotency, public.trip_events, public.trip_audit_events from public, anon, authenticated;
revoke update, delete on public.trip_proposals from public, anon, authenticated;
drop policy "trip owner inserts" on public.trips;
create policy "trip owner inserts" on public.trips for insert to authenticated
  with check (owner_id=(select auth.uid()) and head_version=0);
drop policy "proposal owner inserts pending" on public.trip_proposals;
create policy "proposal owner inserts pending" on public.trip_proposals for insert to authenticated
  with check (owner_id=(select auth.uid()) and status='pending' and rollback_snapshot_version is null
    and exists(select 1 from public.trips t where t.id=trip_proposals.trip_id and t.owner_id=(select auth.uid())));

-- The v2 fingerprint field set is frozen. Unrelated future columns do not invalidate retries.
-- Status is deliberately excluded; pending -> applied is part of a legitimate retry.
create function public.read_trip_proposal_v2(p_proposal_id uuid)
returns table(proposal jsonb, digest text) language sql stable security invoker
set search_path='' set timezone='UTC' as $$
  select to_jsonb(p), 'trip-v2:' || encode(sha256(convert_to(jsonb_build_object('id', p.id, 'owner_id', p.owner_id, 'trip_id', p.trip_id, 'revision', p.revision, 'base_trip_version', p.base_trip_version, 'patch', p.patch, 'rollback_snapshot_version', p.rollback_snapshot_version, 'parent_proposal_id', p.parent_proposal_id, 'expires_at', p.expires_at, 'created_at', p.created_at)::text, 'UTF8')), 'hex')
  from public.trip_proposals p where p.id=p_proposal_id and p.owner_id=(select auth.uid());
$$;
revoke all on function public.read_trip_proposal_v2(uuid) from public, anon;
grant execute on function public.read_trip_proposal_v2(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.confirm_and_apply_trip_proposal(p_proposal_id uuid, p_idempotency_key text, p_digest text)
 RETURNS TABLE(outcome text, resulting_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET timezone TO 'UTC'
AS $function$
declare proposal public.trip_proposals%rowtype; trip public.trips%rowtype; previous public.trip_idempotency%rowtype; target public.trip_version_snapshots%rowtype; next_content jsonb; next_title text; next_version integer; expected_digest text;
begin PERFORM identity_private.guard_mobile_rpc_v2();
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 160
    or p_digest is null or char_length(p_digest) not between 1 and 160 then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text || ':' || p_idempotency_key, 0));
  select * into proposal from public.trip_proposals where id=p_proposal_id and owner_id=(select auth.uid()) for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  expected_digest := 'trip-v2:' || encode(sha256(convert_to(jsonb_build_object('id', proposal.id, 'owner_id', proposal.owner_id, 'trip_id', proposal.trip_id, 'revision', proposal.revision, 'base_trip_version', proposal.base_trip_version, 'patch', proposal.patch, 'rollback_snapshot_version', proposal.rollback_snapshot_version, 'parent_proposal_id', proposal.parent_proposal_id, 'expires_at', proposal.expires_at, 'created_at', proposal.created_at)::text, 'UTF8')), 'hex');
  if p_digest <> expected_digest then raise exception 'CONFIRMATION_DIGEST_MISMATCH'; end if;
  select * into previous from public.trip_idempotency where owner_id=(select auth.uid()) and idempotency_key=p_idempotency_key;
  if found then
    if previous.proposal_id is distinct from proposal.id or previous.digest <> expected_digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    return query select 'already_applied'::text, previous.resulting_version; return;
  end if;
  if proposal.status <> 'pending' then return query select 'proposal_not_confirmable'::text, null::integer; return; end if;
  if proposal.expires_at <= now() then update public.trip_proposals set status = 'expired' where id = proposal.id; return query select 'proposal_expired'::text, null::integer; return; end if;
  select * into trip from public.trips where id = proposal.trip_id and owner_id = (select auth.uid()) for update;
  if not found or trip.head_version <> proposal.base_trip_version then update public.trip_proposals set status = 'conflicted' where id = proposal.id; return query select 'version_conflict'::text, null::integer; return; end if;
  if proposal.rollback_snapshot_version is not null then
    select * into target from public.trip_version_snapshots where trip_id = trip.id and owner_id = trip.owner_id and version = proposal.rollback_snapshot_version;
    if not found then raise exception 'ROLLBACK_NOT_AVAILABLE'; end if;
    next_content := target.content;
  else
    if proposal.patch ? 'operations' and ((proposal.patch->>'expectedVersion') !~ '^\d{1,9}$' or (proposal.patch->>'expectedVersion')::integer <> proposal.base_trip_version) then raise exception 'INVALID_PATCH'; end if;
    next_content := public.apply_trip_content_patch(public.trip_content_snapshot(trip.id, trip.title), proposal.patch);
  end if;
  next_title := next_content->>'title'; next_version := trip.head_version + 1;
  update public.trips set title = next_title, head_version = next_version, updated_at = now() where id = trip.id and head_version = proposal.base_trip_version;
  delete from public.trip_days where trip_id = trip.id;
  insert into public.trip_days(trip_id, owner_id, day_id, trip_date, time_zone) select trip.id, trip.owner_id, value->>'id', (value->>'date')::date, value->>'timeZone' from jsonb_array_elements(next_content->'days');
  insert into public.trip_items(trip_id, day_id, owner_id, item_id, title, starts_at, ends_at) select trip.id, day.value->>'id', trip.owner_id, item.value->>'id', item.value->>'title', nullif(item.value->>'startsAt', '')::timestamptz, nullif(item.value->>'endsAt', '')::timestamptz from jsonb_array_elements(next_content->'days') day, jsonb_array_elements(day.value->'items') item;
  insert into public.trip_version_snapshots(trip_id, owner_id, version, title, content) values (trip.id, trip.owner_id, next_version, next_title, next_content);
  insert into public.trip_events(trip_id, owner_id, resulting_version, proposal_id, event_type) values (trip.id, trip.owner_id, next_version, proposal.id, 'proposal_applied');
  update public.trip_proposals set status = 'applied' where id = proposal.id;
  insert into public.trip_idempotency(owner_id, idempotency_key, digest, outcome, resulting_version, proposal_id) values (trip.owner_id, p_idempotency_key, expected_digest, 'applied', next_version, proposal.id);
  insert into public.trip_audit_events(owner_id, action, trip_id, proposal_id) values (trip.owner_id, 'proposal_applied', trip.id, proposal.id);
  return query select 'applied'::text, next_version;
end;
$function$;

-- Rejection is the only ordinary-client lifecycle mutation; it cannot mark a plan applied.
create function public.reject_trip_proposal_v2(p_proposal_id uuid)
returns table(proposal_id uuid,status text) language plpgsql security definer set search_path='' as $$
declare p public.trip_proposals%rowtype;
begin
  perform identity_private.guard_mobile_rpc_v2();
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into p from public.trip_proposals where id=p_proposal_id and owner_id=(select auth.uid()) for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if p.status='rejected' then return query select p.id,'rejected'::text; return; end if;
  if p.status <> 'pending' then raise exception 'PROPOSAL_NOT_CONFIRMABLE'; end if;
  update public.trip_proposals set status='rejected' where id=p.id;
  return query select p.id,'rejected'::text;
end $$;
revoke all on function public.reject_trip_proposal_v2(uuid) from public,anon;
grant execute on function public.reject_trip_proposal_v2(uuid) to authenticated;

notify pgrst, 'reload schema';
