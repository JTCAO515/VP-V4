-- VPJ-36: bounded Trip core deletion, not all-user-data completion.
-- Existing direct DELETE would bypass reauthentication and the durable tombstone.
revoke delete on public.trips from public,anon,authenticated;
create schema privacy_private;
revoke all on schema privacy_private from public, anon, authenticated;
create table privacy_private.trip_deletions (
  request_id uuid primary key,
  owner_id uuid not null,
  trip_id uuid not null unique,
  expected_version integer not null check(expected_version >= 0),
  state text not null default 'queued' check(state in ('queued','completed')),
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check ((state='completed') = (completed_at is not null))
);
-- Intentionally no FK: this minimal tombstone must outlive the deleted Trip.
alter table privacy_private.trip_deletions enable row level security;
revoke all on privacy_private.trip_deletions from public,anon,authenticated,service_role;

create function privacy_private.trip_deletion_receipt(r privacy_private.trip_deletions)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('version',1,'requestId',r.request_id,'tripId',r.trip_id,
 'scope','trip-core-v1','state',r.state,'requestedAt',r.requested_at,'completedAt',r.completed_at,
 'allUserDataCompleted',false,'backupErasure','not_verified','providerErasure','not_performed',
 'offlineRevocation','on_reconnect_only','exportedFilesRevocable',false)
$$;
revoke all on function privacy_private.trip_deletion_receipt(privacy_private.trip_deletions) from public,anon,authenticated;

create function public.request_trip_deletion_v1(p_request_id uuid,p_trip_id uuid,p_expected_version integer,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r privacy_private.trip_deletions%rowtype; v integer;
begin
 perform identity_private.guard_mobile_rpc_v2();
 if actor is null then raise exception 'FORBIDDEN'; end if;
 if p_request_id is null or p_trip_id is null or p_expected_version is null or p_expected_version<0
   or p_confirmed is distinct from true then raise exception 'INVALID_INPUT'; end if;
 -- Server-side session creation, not JWT iat (refresh) or editable user metadata.
 if not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid
   and s.user_id=actor and s.created_at between clock_timestamp()-interval '5 minutes' and clock_timestamp())
 then raise exception 'REAUTHENTICATION_REQUIRED'; end if;
 select * into r from privacy_private.trip_deletions where request_id=p_request_id;
 if found then
   if r.owner_id<>actor then raise exception 'FORBIDDEN'; end if;
   if r.trip_id<>p_trip_id or r.expected_version<>p_expected_version then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
   return privacy_private.trip_deletion_receipt(r);
 end if;
 select head_version into v from public.trips where id=p_trip_id and owner_id=actor for update;
 if not found then raise exception 'FORBIDDEN'; end if;
 if v<>p_expected_version then raise exception 'STALE_TRIP_VERSION'; end if;
 if exists(select 1 from public.turns where trip_id=p_trip_id)
   or exists(select 1 from public.chat_threads where trip_id=p_trip_id)
 then raise exception 'TRIP_HAS_CHAT_REFERENCES'; end if;
 if exists(select 1 from privacy_private.trip_deletions where trip_id=p_trip_id)
 then raise exception 'DELETION_ALREADY_REQUESTED'; end if;
 insert into privacy_private.trip_deletions(request_id,owner_id,trip_id,expected_version)
 values(p_request_id,actor,p_trip_id,p_expected_version) returning * into r;
 return privacy_private.trip_deletion_receipt(r);
end $$;
revoke all on function public.request_trip_deletion_v1(uuid,uuid,integer,boolean) from public,anon;
grant execute on function public.request_trip_deletion_v1(uuid,uuid,integer,boolean) to authenticated;

create function public.read_trip_deletion_v1(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r privacy_private.trip_deletions%rowtype;
begin
 perform identity_private.guard_mobile_rpc_v2();
 if auth.uid() is null or not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid())
 then raise exception 'FORBIDDEN'; end if;
 select * into r from privacy_private.trip_deletions where request_id=p_request_id and owner_id=auth.uid();
 if not found then raise exception 'FORBIDDEN'; end if;
 return privacy_private.trip_deletion_receipt(r);
end $$;
revoke all on function public.read_trip_deletion_v1(uuid) from public,anon;
grant execute on function public.read_trip_deletion_v1(uuid) to authenticated;

-- All new core writes and chat/Turn links serialize against admission. No client bypass.
create function privacy_private.guard_trip_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; previous uuid;
begin
 if tg_op='UPDATE' then
   if tg_table_name='trips' then previous:=old.id; else previous:=old.trip_id; end if;
 end if;
 if tg_table_name='trips' then target:=new.id; else target:=new.trip_id; end if;
 perform 1 from public.trips where id=any(array[target,previous]) order by id for update;
 if exists(select 1 from privacy_private.trip_deletions where trip_id=any(array[target,previous]))
 then raise exception 'TRIP_DELETION_PENDING_OR_COMPLETED'; end if;
 return new;
end $$;
revoke all on function privacy_private.guard_trip_write() from public,anon,authenticated;
do $$ declare tab text; begin
 foreach tab in array array['trips','trip_proposals','trip_events','trip_audit_events','trip_version_snapshots',
 'trip_days','trip_items','trip_place_references','trip_action_references','trip_archives','turns','chat_threads'] loop
 execute format('create trigger privacy_trip_write before insert or update on public.%I for each row execute function privacy_private.guard_trip_write()',tab);
 end loop;
end $$;

-- Explicit one-request worker. A transaction failure leaves queued and retries safely.
create function public.execute_trip_deletion_v1(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r privacy_private.trip_deletions%rowtype; target uuid; removed integer;
begin
 -- Legacy writers can lock Proposal/child rows before Trip. Bound contention;
 -- a 55P03 rollback leaves queued for the worker's bounded retry, never deadlocks.
 perform pg_catalog.set_config('lock_timeout','500ms',true);
 select trip_id into target from privacy_private.trip_deletions where request_id=p_request_id;
 if not found then raise exception 'INVALID_INPUT'; end if;
 perform 1 from public.trips where id=target for update;
 select * into r from privacy_private.trip_deletions where request_id=p_request_id for update;
 if r.state='completed' then return privacy_private.trip_deletion_receipt(r); end if;
 perform 1 from public.trips where id=r.trip_id and owner_id=r.owner_id for update;
 if not found then raise exception 'TRIP_DELETION_SOURCE_MISSING'; end if;
 if exists(select 1 from public.turns where trip_id=r.trip_id)
   or exists(select 1 from public.chat_threads where trip_id=r.trip_id)
 then raise exception 'TRIP_HAS_CHAT_REFERENCES'; end if;
 delete from public.trip_events where trip_id=r.trip_id;
 delete from public.trip_audit_events where trip_id=r.trip_id;
 delete from public.trip_idempotency i using public.trip_proposals p where i.proposal_id=p.id and p.trip_id=r.trip_id;
 -- Parent lineage is RESTRICT. Remove leaves first; never disable triggers/FKs.
 loop
   delete from public.trip_proposals p where p.trip_id=r.trip_id
     and not exists(select 1 from public.trip_proposals child where child.parent_proposal_id=p.id);
   get diagnostics removed=row_count;
   exit when removed=0;
 end loop;
 if exists(select 1 from public.trip_proposals where trip_id=r.trip_id) then raise exception 'TRIP_LINEAGE_BLOCKED'; end if;
 delete from public.trips where id=r.trip_id and owner_id=r.owner_id;
 update privacy_private.trip_deletions set state='completed',completed_at=clock_timestamp()
 where request_id=p_request_id returning * into r;
 return privacy_private.trip_deletion_receipt(r);
end $$;
revoke all on function public.execute_trip_deletion_v1(uuid) from public,anon,authenticated;
grant execute on function public.execute_trip_deletion_v1(uuid) to service_role;
