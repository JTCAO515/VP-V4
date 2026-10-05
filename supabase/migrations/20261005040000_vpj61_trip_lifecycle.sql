-- VPJ-61 #240: explicit owner lifecycle, original-byte receipts and capacity.
-- Sole append-only slot. Private tables have no ordinary grants; activation is external.
-- No date inference, Trip content rewrite, Memory consent creation or service mutation.
create schema trip_lifecycle_private;
revoke all on schema trip_lifecycle_private from public, anon, authenticated, service_role;

create table trip_lifecycle_private.owner_heads_v1 (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check(revision between 0 and 9007199254740990),
 last_xid xid8
);
create table trip_lifecycle_private.states_v1 (
 trip_id uuid primary key references public.trips(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 state text not null check(state in ('draft','active','retained','archived'))
);
create unique index lifecycle_one_active_v1 on trip_lifecycle_private.states_v1(owner_id) where state='active';
create index lifecycle_owner_states_v1 on trip_lifecycle_private.states_v1(owner_id,state,trip_id);
create table trip_lifecycle_private.operations_v1 (
 owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,
 session_id uuid,
 request_bytes text,
 request_digest text,
 trip_id uuid,
 previous_active_trip_id uuid,
 receipt jsonb,
 erased_reason text check(erased_reason in ('FORBIDDEN','MEMORY_CONFLICT')),
 primary key(owner_id,operation_id),
 check((erased_reason is null and session_id is not null and request_bytes is not null and request_digest is not null and request_digest ~ '^[a-f0-9]{64}$' and receipt is not null)
   or (erased_reason is not null and session_id is null and request_bytes is null and request_digest is null and receipt is null and trip_id is null and previous_active_trip_id is null))
);
create index lifecycle_op_trip_v1 on trip_lifecycle_private.operations_v1(owner_id,trip_id);
create index lifecycle_op_previous_v1 on trip_lifecycle_private.operations_v1(owner_id,previous_active_trip_id);
create table trip_lifecycle_private.memory_edges_v1 (
 owner_id uuid not null,
 operation_id uuid not null,
 memory_id uuid not null,
 consent_id uuid not null,
 source_receipt_id uuid not null,
 primary key(owner_id,operation_id,memory_id),
 foreign key(owner_id,operation_id) references trip_lifecycle_private.operations_v1(owner_id,operation_id) on delete cascade
);
create index lifecycle_memory_edges_v1 on trip_lifecycle_private.memory_edges_v1(owner_id,memory_id);
create index lifecycle_consent_edges_v1 on trip_lifecycle_private.memory_edges_v1(owner_id,consent_id);
create index lifecycle_source_edges_v1 on trip_lifecycle_private.memory_edges_v1(owner_id,source_receipt_id);
-- Composite FK prevents an internal row from binding someone else's Trip.
alter table public.trips add constraint lifecycle_trip_owner_v1 unique(id,owner_id);
alter table trip_lifecycle_private.states_v1 add constraint lifecycle_state_owner_v1
 foreign key(trip_id,owner_id) references public.trips(id,owner_id) on delete cascade;
do $$declare n text;begin
 foreach n in array array['owner_heads_v1','states_v1','operations_v1','memory_edges_v1'] loop
  execute format('alter table trip_lifecycle_private.%I enable row level security',n);
  execute format('revoke all on trip_lifecycle_private.%I from public,anon,authenticated,service_role',n);
 end loop;
end $$;

-- Old RPCs already hold account/proposal/Trip locks in differing orders. Every
-- additional lock here uses try/NOWAIT: never wait while holding the inverse edge.
-- 55P03 stays an unknown/retryable transport result, never a durable decline.
create function trip_lifecycle_private.immutable_operation_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- The sole permitted UPDATE is one-way erasure. Original receipt/digest/bytes
 -- cannot be replaced, including after a business decline or abandon.
 if old.erased_reason is not null or new.erased_reason is null
 or (new.owner_id,new.operation_id) is distinct from (old.owner_id,old.operation_id)
 or new.session_id is not null or new.request_bytes is not null or new.request_digest is not null
 or new.trip_id is not null or new.previous_active_trip_id is not null or new.receipt is not null then
  raise exception 'LIFECYCLE_OPERATION_REUSE';
 end if;
 return new;
end $$;
create trigger lifecycle_immutable_operation_v1 before update on trip_lifecycle_private.operations_v1
 for each row execute function trip_lifecycle_private.immutable_operation_v1();

create function trip_lifecycle_private.lock_owner_v1(u uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34)) then
  raise lock_not_available using message='LIFECYCLE_LOCK_CONFLICT';
 end if;
 perform 1 from auth.users where id=u for key share nowait;
 if not found then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from identity_private.mobile_accounts where owner_id=u for update nowait;
 insert into trip_lifecycle_private.owner_heads_v1(owner_id) values(u) on conflict do nothing;
 perform 1 from trip_lifecycle_private.owner_heads_v1 where owner_id=u for update nowait;
end $$;
create function trip_lifecycle_private.bump_v1(u uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform trip_lifecycle_private.lock_owner_v1(u);
 update trip_lifecycle_private.owner_heads_v1 set revision=revision+1,last_xid=pg_current_xact_id()
 where owner_id=u and last_xid is distinct from pg_current_xact_id();
end $$;
create function trip_lifecycle_private.actor_v1() returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid;
begin
 if u is null or auth.jwt()->>'role' is distinct from 'authenticated'
 or auth.jwt()->>'is_anonymous' is distinct from 'false'
 or coalesce(auth.jwt()->>'session_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 perform trip_lifecycle_private.lock_owner_v1(u);
 -- Account precedes sessions: mobile replacement holds the account then deletes
 -- the prior session. Holding session before account would reverse that order.
 perform 1 from auth.sessions where id=s and user_id=u for key share nowait;
 if not found then raise exception 'SESSION_REPLACED';end if;
 if not identity_private.mobile_access_v2() then raise exception 'SESSION_REPLACED';end if;
 return u;
end $$;
create function trip_lifecycle_private.capacity_v1(u uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('draftCount',(select count(*) from trip_lifecycle_private.states_v1 where owner_id=u and state='draft'),
 'draftLimit',3,'activeTripId',(select trip_id from trip_lifecycle_private.states_v1 where owner_id=u and state='active'),
 'activeLimit',1,'legacyCount',(select count(*) from public.trips t where t.owner_id=u
 and not exists(select 1 from trip_lifecycle_private.states_v1 s where s.trip_id=t.id)
 and not exists(select 1 from public.trip_archives a where a.trip_id=t.id)
 and not exists(select 1 from privacy_private.trip_deletions d where d.trip_id=t.id)));
$$;
-- Direct Data API writes get the account/owner lock BEFORE tuple locks. Old RPC
-- writers reacquire it harmlessly. Trusted worker paths use row NOWAIT fences.
create function trip_lifecycle_private.prelock_statement_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then perform trip_lifecycle_private.lock_owner_v1(auth.uid());end if;
 return null;
end $$;
create trigger lifecycle_prelock_v1 before insert or update or delete on public.trips
 for each statement execute function trip_lifecycle_private.prelock_statement_v1();
create trigger lifecycle_archive_prelock_v1 before insert or update or delete on public.trip_archives
 for each statement execute function trip_lifecycle_private.prelock_statement_v1();

create function trip_lifecycle_private.trip_change_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare u uuid;c jsonb;
begin
 u:=case when tg_op='DELETE' then old.owner_id else new.owner_id end;
 if tg_op='UPDATE' and new.owner_id is distinct from old.owner_id then raise exception 'FORBIDDEN';end if;
 -- Root account deletion must cascade without resurrecting an owner head.
 if not exists(select 1 from auth.users where id=u) then return old;end if;
 perform trip_lifecycle_private.lock_owner_v1(u);
 if tg_op='DELETE' then
  update trip_lifecycle_private.operations_v1 set session_id=null,request_bytes=null,request_digest=null,trip_id=null,
   previous_active_trip_id=null,receipt=null,erased_reason='FORBIDDEN'
  where owner_id=u and (trip_id=old.id or previous_active_trip_id=old.id);
  delete from trip_lifecycle_private.memory_edges_v1 e where e.owner_id=u and exists(
   select 1 from trip_lifecycle_private.operations_v1 o where o.owner_id=e.owner_id and o.operation_id=e.operation_id and o.erased_reason is not null);
 end if;
 if tg_op='DELETE' or (tg_op='UPDATE' and (new.title,new.head_version) is distinct from (old.title,old.head_version)) then
  perform trip_lifecycle_private.bump_v1(u);
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
-- a-prefix precedes original native_mobile_write_v2, avoiding its blocking lock
-- for trusted row-first operations. No JWT or mutable transaction flag used.
create trigger a_lifecycle_trip_change_v1 before insert or update or delete on public.trips
 for each row execute function trip_lifecycle_private.trip_change_v1();
create function trip_lifecycle_private.trip_inserted_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into trip_lifecycle_private.states_v1(trip_id,owner_id,state) values(new.id,new.owner_id,'draft');
 return new;
end $$;
create trigger lifecycle_trip_inserted_v1 after insert on public.trips
 for each row execute function trip_lifecycle_private.trip_inserted_v1();
-- AFTER ROW registration fires only for inserted rows, before AFTER STATEMENT.
-- Validate the complete actual statement after all those rows are drafts. A
-- failed capacity/legacy/RLS/FK check rolls back Trips, snapshots, states and head
-- bumps together. No transaction flag or role/JWT claim distinguishes new rows.
create function trip_lifecycle_private.validate_insert_statement_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare u uuid;c jsonb;
begin
 for u in select distinct owner_id from lifecycle_inserted_trips order by owner_id loop
  perform trip_lifecycle_private.lock_owner_v1(u);
  c:=trip_lifecycle_private.capacity_v1(u);
  if (c->>'legacyCount')::bigint>0 then raise exception 'LEGACY_RECONCILIATION_REQUIRED';end if;
  if (c->>'draftCount')::integer>3 then raise exception 'TRIP_CAPACITY';end if;
  perform trip_lifecycle_private.bump_v1(u);
 end loop;
 return null;
end $$;
create trigger lifecycle_insert_capacity_v1 after insert on public.trips
 referencing new table as lifecycle_inserted_trips for each statement
 execute function trip_lifecycle_private.validate_insert_statement_v1();

create function trip_lifecycle_private.archived_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform trip_lifecycle_private.lock_owner_v1(new.owner_id);
 if not exists(select 1 from public.trips where id=new.trip_id and owner_id=new.owner_id) then raise exception 'FORBIDDEN';end if;
 insert into trip_lifecycle_private.states_v1(trip_id,owner_id,state) values(new.trip_id,new.owner_id,'archived')
 on conflict(trip_id) do update set state='archived';
 perform trip_lifecycle_private.bump_v1(new.owner_id);
 return new;
end $$;
create trigger lifecycle_archived_v1 after insert on public.trip_archives
 for each row execute function trip_lifecycle_private.archived_v1();

-- Erase selected references, original bytes and the full receipt when an original
-- Memory writer forgets/deletes/revokes a source. A tombstone cannot replay.
create function trip_lifecycle_private.scrub_memory_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb;u uuid;ids uuid[];
begin
 r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;u:=(r->>'owner_id')::uuid;
 if not exists(select 1 from auth.users where id=u) then return old;end if;
 if tg_op<>'DELETE' and ((tg_table_name='memory_profiles' and r->>'state' not in ('deleted','rejected'))
 or (tg_table_name='memory_consents' and r->>'status'<>'revoked')) then return new;end if;
 perform trip_lifecycle_private.lock_owner_v1(u);
 select array_agg(operation_id) into ids from trip_lifecycle_private.memory_edges_v1 e where e.owner_id=u
 and ((tg_table_name='memory_profiles' and e.memory_id=(r->>'id')::uuid)
 or (tg_table_name='memory_consents' and e.consent_id=(r->>'id')::uuid)
 or (tg_table_name='memory_receipts' and e.source_receipt_id=(r->>'id')::uuid));
 update trip_lifecycle_private.operations_v1 set session_id=null,request_bytes=null,request_digest=null,trip_id=null,
 previous_active_trip_id=null,receipt=null,erased_reason='MEMORY_CONFLICT'
 where owner_id=u and operation_id=any(ids);
 delete from trip_lifecycle_private.memory_edges_v1 where owner_id=u and operation_id=any(ids);
 if cardinality(ids)>0 then perform trip_lifecycle_private.bump_v1(u);end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger lifecycle_forget_memory_v1 after update or delete on public.memory_profiles
 for each row execute function trip_lifecycle_private.scrub_memory_v1();
create trigger lifecycle_revoke_consent_v1 after update or delete on public.memory_consents
 for each row execute function trip_lifecycle_private.scrub_memory_v1();
create trigger lifecycle_erase_receipt_v1 after delete on public.memory_receipts
 for each row execute function trip_lifecycle_private.scrub_memory_v1();

create function trip_lifecycle_private.uuid_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',false);
$$;
create function trip_lifecycle_private.integer_v1(v jsonb,maximum bigint) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='number' and v#>>'{}' ~ '^(0|[1-9][0-9]{0,15})$' then (v#>>'{}')::numeric<=maximum else false end;
$$;
create function trip_lifecycle_private.command_v1(v jsonb) returns void language plpgsql set search_path='' as $$
declare keys text[];a text;r jsonb;refs jsonb;units integer;
begin
 if jsonb_typeof(v) is distinct from 'object' then raise exception 'INVALID_INPUT';end if;
 a:=v->>'action';keys:=array['action','operationId','expectedRevision','expectedActiveTripId','expectedSessionId','confirmed','tripId'];
 keys:=keys||case a when 'create' then array['title'] when 'activate' then array['expectedHeadVersion']
 when 'reconcile' then array['expectedHeadVersion','state'] when 'archive' then array['expectedHeadVersion','preference'] else null end;
 if keys is null or not(v ?& keys) or v-keys<>'{}' or v->'confirmed' is distinct from 'true'::jsonb
 or not trip_lifecycle_private.uuid_v1(v->'operationId') or not trip_lifecycle_private.uuid_v1(v->'tripId')
 or not trip_lifecycle_private.uuid_v1(v->'expectedSessionId') or not trip_lifecycle_private.integer_v1(v->'expectedRevision',9007199254740990)
 or (v->'expectedActiveTripId'<>'null'::jsonb and not trip_lifecycle_private.uuid_v1(v->'expectedActiveTripId')) then raise exception 'INVALID_INPUT';end if;
 if a='create' then
  if jsonb_typeof(v->'title') is distinct from 'string' or char_length(v->>'title')<1
  or v->>'title'<>btrim(v->>'title',E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)) then raise exception 'INVALID_INPUT';end if;
  select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) into units from regexp_split_to_table(v->>'title','') ch;
  if units>160 then raise exception 'INVALID_INPUT';end if;
  return;
 end if;
 if not trip_lifecycle_private.integer_v1(v->'expectedHeadVersion',2147483647) then raise exception 'INVALID_INPUT';end if;
 if a='reconcile' and (jsonb_typeof(v->'state') is distinct from 'string' or v->>'state' not in ('draft','retained')) then raise exception 'INVALID_INPUT';end if;
 if a<>'archive' then return;end if;
 if (v->>'expectedHeadVersion')::integer<1 or jsonb_typeof(v->'preference') is distinct from 'object' then raise exception 'INVALID_INPUT';end if;
 if v->'preference'='{"action":"skip"}'::jsonb then return;end if;
 if v->'preference'->>'action' is distinct from 'keep' or not(v->'preference' ?& array['action','memoryRefs'])
 or (v->'preference')-array['action','memoryRefs']<>'{}' or jsonb_typeof(v->'preference'->'memoryRefs') is distinct from 'array' then raise exception 'INVALID_INPUT';end if;
 refs:=v->'preference'->'memoryRefs';
 if jsonb_array_length(refs) not between 1 and 100 or (select count(distinct x->>'memoryId') from jsonb_array_elements(refs) x)<>jsonb_array_length(refs) then raise exception 'INVALID_INPUT';end if;
 for r in select value from jsonb_array_elements(refs) loop
  if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['memoryId','revision','sourceReceiptId','consentId'])
  or r-array['memoryId','revision','sourceReceiptId','consentId']<>'{}' or not trip_lifecycle_private.uuid_v1(r->'memoryId')
  or not trip_lifecycle_private.uuid_v1(r->'sourceReceiptId') or not trip_lifecycle_private.uuid_v1(r->'consentId')
  or not trip_lifecycle_private.integer_v1(r->'revision',9007199254740990) or (r->>'revision')::bigint<1 then raise exception 'INVALID_INPUT';end if;
 end loop;
end $$;
create function trip_lifecycle_private.qualify_memory_v1(u uuid,refs jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 -- Original canonical Memory command uses consent-before-profile. No new writer.
 perform 1 from public.memory_consents where owner_id=u and id in(select (x->>'consentId')::uuid from jsonb_array_elements(refs) x) order by id for share nowait;
 perform 1 from public.memory_profiles where owner_id=u and id in(select (x->>'memoryId')::uuid from jsonb_array_elements(refs) x) order by id for share nowait;
 perform 1 from public.memory_receipts where owner_id=u and id in(select (x->>'sourceReceiptId')::uuid from jsonb_array_elements(refs) x) order by id for share nowait;
 for r in select value from jsonb_array_elements(refs) loop
  if not exists(select 1 from public.memory_profiles m join public.memory_consents c on c.id=m.consent_id and c.owner_id=m.owner_id
  join public.memory_receipts sr on sr.id=m.source_receipt_id and sr.memory_id=m.id and sr.owner_id=m.owner_id
  where m.owner_id=u and m.id=(r->>'memoryId')::uuid and m.revision=(r->>'revision')::bigint
  and m.source_receipt_id=(r->>'sourceReceiptId')::uuid and m.consent_id=(r->>'consentId')::uuid
  and m.constraint_kind='preference' and m.state in ('explicit','confirmed') and c.status='granted'
  and sr.event_state in ('explicit','confirmed') and sr.source_kind='user_confirmed') then raise exception 'MEMORY_CONFLICT';end if;
 end loop;
end $$;
create function trip_lifecycle_private.trips_v1(u uuid,after_id uuid,limit_n integer)
returns table(id uuid,item jsonb) language sql stable security definer set search_path='' set timezone='UTC' as $$
 select t.id,jsonb_build_object('tripId',t.id,'title',t.title,'headVersion',t.head_version,
 'state',case when a.trip_id is not null then 'archived' else coalesce(s.state,'legacy') end,
 'archivedVersion',a.archived_version,'archivedAt',case when a.archived_at is null then null else to_char(a.archived_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end)
 from public.trips t left join trip_lifecycle_private.states_v1 s on s.trip_id=t.id and s.owner_id=u
 left join public.trip_archives a on a.trip_id=t.id and a.owner_id=u
 where t.owner_id=u and not exists(select 1 from privacy_private.trip_deletions d where d.trip_id=t.id)
 and (after_id is null or t.id>after_id) order by t.id limit limit_n;
$$;
create function public.trip_lifecycle_v1(p_action text,p_input jsonb,p_request_bytes text default null) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare u uuid;s uuid;rev bigint;cap jsonb;op uuid;tid uuid;previous_active uuid;rec trip_lifecycle_private.operations_v1%rowtype;
 t public.trips%rowtype;state_n text;reason text;a text;digest text;refs jsonb:='[]';reply jsonb;arch public.trip_archives%rowtype;
 after_id uuid;items jsonb;more boolean;last_id uuid;requested_state text;parsed jsonb;
begin
 u:=trip_lifecycle_private.actor_v1();s:=(auth.jwt()->>'session_id')::uuid;
 select revision into rev from trip_lifecycle_private.owner_heads_v1 where owner_id=u;
 if jsonb_typeof(p_input) is distinct from 'object' or p_action not in ('read','execute','recover','abandon') then raise exception 'INVALID_INPUT';end if;
 if p_action in ('read','recover') and p_request_bytes is not null then raise exception 'INVALID_INPUT';end if;
 if p_action='read' then
  if p_input<>'{}' then
   if not(p_input ?& array['afterTripId','expectedRevision']) or p_input-array['afterTripId','expectedRevision']<>'{}'
   or not trip_lifecycle_private.uuid_v1(p_input->'afterTripId') or not trip_lifecycle_private.integer_v1(p_input->'expectedRevision',9007199254740990) then raise exception 'INVALID_INPUT';end if;
   if rev<>(p_input->>'expectedRevision')::bigint then raise exception 'LIFECYCLE_CONFLICT';end if;
   after_id:=(p_input->>'afterTripId')::uuid;
   if not exists(select 1 from public.trips where id=after_id and owner_id=u) then raise exception 'LIFECYCLE_CONFLICT';end if;
  end if;
  with candidates as(select * from trip_lifecycle_private.trips_v1(u,after_id,51)),delivered as(select * from candidates order by id limit 50)
  select coalesce((select jsonb_agg(item order by id) from delivered),'[]'),(select count(*)>50 from candidates),
   (select id from delivered order by id desc limit 1) into items,more,last_id;
  return jsonb_build_object('version','trip-lifecycle/1','ownerId',u,'sessionId',s,'revision',rev,
   'capacity',trip_lifecycle_private.capacity_v1(u),'trips',items,'nextTripId',case when more then last_id else null end,'serviceStatus','unavailable');
 end if;
 if p_action='recover' then
  if not(p_input ? 'operationId') or p_input-array['operationId']<>'{}' or not trip_lifecycle_private.uuid_v1(p_input->'operationId') then raise exception 'INVALID_INPUT';end if;
  op:=(p_input->>'operationId')::uuid;
 else
  perform trip_lifecycle_private.command_v1(p_input);
  if p_request_bytes is null or octet_length(convert_to(p_request_bytes,'UTF8')) not between 1 and 32768 then raise exception 'INVALID_INPUT';end if;
  begin parsed:=p_request_bytes::jsonb;exception when invalid_text_representation then raise exception 'INVALID_INPUT';end;
  if parsed is distinct from p_input then raise exception 'INVALID_INPUT';end if;
  if p_input->>'expectedSessionId'<>s::text then raise exception 'SESSION_REPLACED';end if;
  op:=(p_input->>'operationId')::uuid;tid:=(p_input->>'tripId')::uuid;a:=p_input->>'action';
  digest:=encode(sha256(convert_to(p_request_bytes,'UTF8')),'hex');
  if a='archive' and p_input->'preference'->>'action'='keep' then refs:=p_input->'preference'->'memoryRefs';end if;
 end if;
 select * into rec from trip_lifecycle_private.operations_v1 where owner_id=u and operation_id=op;
 if found then
  if rec.session_id<>s then raise exception 'FORBIDDEN';end if;
  if rec.erased_reason is not null then raise exception '%',rec.erased_reason;end if;
  if p_action<>'recover' and rec.request_bytes is distinct from p_request_bytes then raise exception 'LIFECYCLE_OPERATION_REUSE';end if;
  if rec.receipt->>'status'='applied' and jsonb_array_length(rec.receipt->'memoryRefs')>0 then
   perform trip_lifecycle_private.qualify_memory_v1(u,rec.receipt->'memoryRefs');
  end if;
  if p_action='recover' then return jsonb_build_object('version','trip-lifecycle/1','ownerId',u,'sessionId',s,'operationId',op,'receipt',rec.receipt);end if;
  return rec.receipt;
 end if;
 if p_action='recover' then return jsonb_build_object('version','trip-lifecycle/1','ownerId',u,'sessionId',s,'operationId',op,'receipt',null);end if;
 -- Privacy serialization and account locks remain held outside the product
 -- subtransaction; late faults roll back all product mutations before a decline.
 cap:=trip_lifecycle_private.capacity_v1(u);previous_active:=(cap->>'activeTripId')::uuid;
 if exists(select 1 from public.trips where id=tid and owner_id<>u) then raise exception 'FORBIDDEN';end if;
 if a<>'create' and not exists(select 1 from public.trips where id=tid and owner_id=u) then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from privacy_private.trip_deletions where trip_id in(tid,previous_active)) then raise exception 'FORBIDDEN';end if;
 if p_action='abandon' then reason:='USER_ABANDONED';
 else
  begin
   if rev<>(p_input->>'expectedRevision')::bigint or previous_active is distinct from (p_input->>'expectedActiveTripId')::uuid then raise exception 'LIFECYCLE_CONFLICT';end if;
   if a='create' then
    if exists(select 1 from public.trips where id=tid) then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
    insert into public.trips(id,owner_id,title) values(tid,u,p_input->>'title');
    state_n:='draft';
   else
    -- Legacy v1 archive holds its archive advisory before Trip. Try preserves
    -- that ordering without waiting behind an old caller holding account/Trip.
    if a='archive' and not pg_try_advisory_xact_lock(hashtextextended('trip-archive:'||u::text,0)) then raise lock_not_available using message='LIFECYCLE_LOCK_CONFLICT';end if;
    perform 1 from public.trips where owner_id=u and id in(tid,previous_active) order by id for update nowait;
    select * into t from public.trips where id=tid and owner_id=u;
    if t.head_version<>(p_input->>'expectedHeadVersion')::integer then raise exception 'STALE_TRIP_VERSION';end if;
    state_n:=case when exists(select 1 from public.trip_archives where trip_id=tid) then 'archived'
     else coalesce((select state from trip_lifecycle_private.states_v1 where trip_id=tid),'legacy') end;
    if state_n='archived' then raise exception 'PROPOSAL_NOT_CONFIRMABLE';end if;
    if a in ('activate','archive') or (a='reconcile' and p_input->>'state'='retained') then
     if t.head_version<1 or not exists(select 1 from public.trip_version_snapshots where trip_id=tid and owner_id=u and version=t.head_version)
     or not exists(select 1 from public.trip_events where trip_id=tid and owner_id=u and resulting_version=t.head_version and event_type='proposal_applied') then raise exception 'PROPOSAL_NOT_CONFIRMABLE';end if;
    end if;
    if a='reconcile' then
     if state_n<>'legacy' then raise exception 'LIFECYCLE_CONFLICT';end if;
     requested_state:=p_input->>'state';
     if requested_state='draft' and (cap->>'draftCount')::integer>=3 then raise exception 'TRIP_CAPACITY';end if;
     insert into trip_lifecycle_private.states_v1(trip_id,owner_id,state) values(tid,u,requested_state);state_n:=requested_state;
     perform trip_lifecycle_private.bump_v1(u);
    elsif a='activate' then
     if previous_active=tid then raise exception 'LIFECYCLE_CONFLICT';end if;
     if (cap->>'draftCount')::integer+(case when previous_active is not null then 1 else 0 end)-(case when state_n='draft' then 1 else 0 end)>3 then raise exception 'TRIP_CAPACITY';end if;
     update trip_lifecycle_private.states_v1 set state='draft' where owner_id=u and state='active';
     insert into trip_lifecycle_private.states_v1(trip_id,owner_id,state) values(tid,u,'active') on conflict(trip_id) do update set state='active';state_n:='active';
     perform trip_lifecycle_private.bump_v1(u);
    elsif a='archive' then
     perform trip_lifecycle_private.qualify_memory_v1(u,refs);
     perform public.archive_trip_v1(tid,t.head_version,op,true);
     select * into arch from public.trip_archives where trip_id=tid and owner_id=u;state_n:='archived';
    end if;
   end if;
   select revision into rev from trip_lifecycle_private.owner_heads_v1 where owner_id=u;
   reply:=jsonb_build_object('status','applied','version','trip-lifecycle/1','ownerId',u,'sessionId',s,'operationId',op,
    'requestDigest',digest,'action',a,'revision',rev,'tripId',tid,'state',state_n,'capacity',trip_lifecycle_private.capacity_v1(u),
    'archivedVersion',case when a='archive' then arch.archived_version else null end,
    'archivedAt',case when a='archive' then to_char(arch.archived_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') else null end,
    'preference',case when a='archive' then case when jsonb_array_length(refs)>0 then 'kept' else 'skipped' end else 'not_requested' end,'memoryRefs',refs);
  exception when raise_exception then
   if sqlerrm not in ('LIFECYCLE_CONFLICT','TRIP_CAPACITY','LEGACY_RECONCILIATION_REQUIRED','STALE_TRIP_VERSION','PROPOSAL_NOT_CONFIRMABLE','MEMORY_CONFLICT','IDEMPOTENCY_KEY_REUSE') then raise;end if;
   reason:=sqlerrm;
  end;
 end if;
 if reason is not null then
  select revision into rev from trip_lifecycle_private.owner_heads_v1 where owner_id=u;
  reply:=jsonb_build_object('version','trip-lifecycle/1','ownerId',u,'sessionId',s,'operationId',op,'requestDigest',digest,
   'action',a,'tripId',tid,'status','declined','reason',reason,'revision',rev);
 end if;
 insert into trip_lifecycle_private.operations_v1(owner_id,operation_id,session_id,request_bytes,request_digest,trip_id,previous_active_trip_id,receipt)
 values(u,op,s,p_request_bytes,digest,tid,previous_active,reply);
 insert into trip_lifecycle_private.memory_edges_v1(owner_id,operation_id,memory_id,consent_id,source_receipt_id)
 select u,op,(r->>'memoryId')::uuid,(r->>'consentId')::uuid,(r->>'sourceReceiptId')::uuid from jsonb_array_elements(refs) r;
 return reply;
end $$;
-- Deliberate default-deny. Main owns the separate RPC qualification/activation.
revoke all on function public.trip_lifecycle_v1(text,jsonb,text) from public,anon,authenticated,service_role;

-- New, explicitly enrolled export version. Old trip-core-export/1 decoder,
-- completed packages and privacy_core_export_v1 remain untouched.
create table trip_lifecycle_private.export_progress_v2 (
 request_id uuid not null references export_private.core_jobs_v1(request_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 lease_id uuid not null,generation integer not null,source_revision bigint not null,
 section text not null check(section in ('trips','operations')),
 last_cursor uuid,next_cursor uuid,last_limit integer,
 pages integer not null default 0,rows integer not null default 0,terminal boolean not null default false,
 primary key(request_id,generation,section)
);
alter table trip_lifecycle_private.export_progress_v2 enable row level security;
revoke all on trip_lifecycle_private.export_progress_v2 from public,anon,authenticated,service_role;
create function public.trip_lifecycle_export_v2(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare j export_private.core_jobs_v1;req uuid;l uuid;g integer;u uuid;rev bigint;mr bigint;
 progress trip_lifecycle_private.export_progress_v2%rowtype;section_n text;cursor_n uuid;limit_n integer;
 page jsonb;more boolean;last_id uuid;n integer;oldpage jsonb;keys text[];replay boolean:=false;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 keys:=array['requestId','leaseId','generation']||case p_action when 'enroll' then '{}'::text[] when 'proof' then '{}'::text[] when 'page' then array['section','cursor','limit'] else null end;
 if keys is null or jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& keys) or p_input-keys<>'{}'
 or not trip_lifecycle_private.uuid_v1(p_input->'requestId') or not trip_lifecycle_private.uuid_v1(p_input->'leaseId')
 or not trip_lifecycle_private.integer_v1(p_input->'generation',3) or (p_input->>'generation')::integer<1 then raise exception 'INVALID_INPUT';end if;
 req:=(p_input->>'requestId')::uuid;l:=(p_input->>'leaseId')::uuid;g:=(p_input->>'generation')::integer;
 select owner_id into u from export_private.core_jobs_v1 where request_id=req;
 if u is null then return jsonb_build_object('kind','unavailable');end if;
 perform trip_lifecycle_private.lock_owner_v1(u);
 j:=export_private.lock_job_v1(req,true);
 if j.request_id is null or not export_private.live_lease_v1(j,l,g) then return jsonb_build_object('kind','unavailable');end if;
 select revision into rev from trip_lifecycle_private.owner_heads_v1 where owner_id=u;
 insert into export_private.memory_source_revisions_v1(owner_id) values(u) on conflict do nothing;
 select revision into mr from export_private.memory_source_revisions_v1 where owner_id=u for share nowait;
 if j.memory_source_revision is not null and j.memory_source_revision<>mr then return jsonb_build_object('kind','unavailable');end if;
 if p_action='enroll' then
  -- Only a CURRENT running lease can opt into v2, never a completed old bundle.
  if exists(select 1 from trip_lifecycle_private.export_progress_v2 where request_id=req and generation=g and (lease_id<>l or source_revision<>rev)) then raise exception 'EXPORT_SOURCE_CHANGED';end if;
  insert into trip_lifecycle_private.export_progress_v2(request_id,owner_id,lease_id,generation,source_revision,section)
   values(req,u,l,g,rev,'trips'),(req,u,l,g,rev,'operations') on conflict do nothing;
  update export_private.core_jobs_v1 set memory_source_revision=mr where request_id=req;
  return jsonb_build_object('schemaVersion','trip-lifecycle-export/2','requestId',req,'leaseId',l,'generation',g,'sourceRevision',rev,'enrolled',true);
 end if;
 if not exists(select 1 from trip_lifecycle_private.export_progress_v2 where request_id=req and generation=g and lease_id=l and source_revision=rev) then
  return jsonb_build_object('schemaVersion','trip-lifecycle-export-proof/2','requestId',req,'leaseId',l,'generation',g,'coverage','partial','reason','NOT_ENROLLED_OR_SOURCE_CHANGED');
 end if;
 if p_action='proof' then
  return jsonb_build_object('schemaVersion','trip-lifecycle-export-proof/2','requestId',req,'leaseId',l,'generation',g,'sourceRevision',rev,
   'coverage',case when (select count(*) from trip_lifecycle_private.export_progress_v2 where request_id=req and generation=g and lease_id=l and source_revision=rev and terminal)=2 then 'complete' else 'partial' end,
   'pages',(select sum(pages) from trip_lifecycle_private.export_progress_v2 where request_id=req and generation=g),
   'rows',(select sum(rows) from trip_lifecycle_private.export_progress_v2 where request_id=req and generation=g));
 end if;
 section_n:=p_input->>'section';
 if jsonb_typeof(p_input->'section') is distinct from 'string' or section_n not in ('trips','operations') or not trip_lifecycle_private.integer_v1(p_input->'limit',50)
 or (p_input->>'limit')::integer<1 or (p_input->>'limit')::integer>(j.policy_snapshot->>'page_size')::integer
 or (p_input->'cursor'<>'null'::jsonb and not trip_lifecycle_private.uuid_v1(p_input->'cursor')) then raise exception 'INVALID_INPUT';end if;
 cursor_n:=(p_input->>'cursor')::uuid;limit_n:=(p_input->>'limit')::integer;
 select * into progress from trip_lifecycle_private.export_progress_v2 where request_id=req and generation=g and section=section_n for update nowait;
 if progress.lease_id<>l or progress.source_revision<>rev then raise exception 'EXPORT_SOURCE_CHANGED';end if;
 if progress.pages>0 and progress.last_cursor is not distinct from cursor_n then
  if progress.last_limit<>limit_n then raise exception 'EXPORT_SOURCE_CURSOR_CONFLICT';end if;replay:=true;
 elsif progress.terminal or progress.next_cursor is distinct from cursor_n then raise exception 'INVALID_EXPORT_CURSOR';end if;
 if not replay and (select sum(pages) from trip_lifecycle_private.export_progress_v2 where request_id=req and generation=g)>=(j.policy_snapshot->>'max_pages')::integer then raise exception 'EXPORT_PAGE_LIMIT';end if;
 if section_n='trips' then
  -- Use the original content/snapshot export projection. Add lifecycle only in v2.
  oldpage:=public.privacy_core_export_v1('trip_page',jsonb_build_object('requestId',req,'leaseId',l,'generation',g,'afterTripId',cursor_n,'limit',limit_n));
  if oldpage->>'schemaVersion' is distinct from 'trip-core-export/1' then return jsonb_build_object('kind','unavailable');end if;
  select coalesce(jsonb_agg(x||jsonb_build_object('lifecycle',(select item from trip_lifecycle_private.trips_v1(u,null,2147483647) r where r.id=(x->>'tripId')::uuid)) order by x->>'tripId'),'[]') into page from jsonb_array_elements(oldpage->'items') x;
  more:=(oldpage->>'hasMore')::boolean;last_id:=(oldpage->>'nextCursor')::uuid;n:=jsonb_array_length(page);
 else
  with candidates as(select operation_id as id,jsonb_build_object('operationId',operation_id,'sessionId',session_id,'receipt',receipt,'erasedReason',erased_reason) as item
    from trip_lifecycle_private.operations_v1 where owner_id=u and (cursor_n is null or operation_id>cursor_n) order by operation_id limit limit_n+1),delivered as(select * from candidates order by id limit limit_n)
  select coalesce((select jsonb_agg(item order by id) from delivered),'[]'),(select count(*)>limit_n from candidates),
   (select id from delivered order by id desc limit 1),(select count(*) from delivered) into page,more,last_id,n;
 end if;
 page:=jsonb_build_object('schemaVersion','trip-lifecycle-export/2','requestId',req,'leaseId',l,'generation',g,'sourceRevision',rev,
  'section',section_n,'items',page,'hasMore',more,'nextCursor',case when more then last_id else null end,'sectionComplete',not more);
 if not replay then update trip_lifecycle_private.export_progress_v2 set last_cursor=cursor_n,next_cursor=case when more then last_id else null end,
  last_limit=limit_n,pages=pages+1,rows=rows+n,terminal=not more where request_id=req and generation=g and section=section_n;end if;
 return page;
end $$;
revoke all on function public.trip_lifecycle_export_v2(text,jsonb) from public,anon,authenticated,service_role;
-- Admission into either accepted deletion path invalidates lifecycle immediately,
-- including raw bytes/previous Active references, before physical worker cleanup.
create function trip_lifecycle_private.deletion_queued_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=new.owner_id) then return new;end if;
 perform trip_lifecycle_private.lock_owner_v1(new.owner_id);
 update trip_lifecycle_private.operations_v1 set session_id=null,request_bytes=null,request_digest=null,trip_id=null,
  previous_active_trip_id=null,receipt=null,erased_reason='FORBIDDEN'
 where owner_id=new.owner_id and (trip_id=new.trip_id or previous_active_trip_id=new.trip_id);
 delete from trip_lifecycle_private.memory_edges_v1 e where e.owner_id=new.owner_id and exists(
  select 1 from trip_lifecycle_private.operations_v1 o where o.owner_id=e.owner_id and o.operation_id=e.operation_id and o.erased_reason is not null);
 delete from trip_lifecycle_private.states_v1 where trip_id=new.trip_id and owner_id=new.owner_id;
 perform trip_lifecycle_private.bump_v1(new.owner_id);
 return new;
end $$;
create trigger lifecycle_deletion_queued_v1 after insert on privacy_private.trip_deletions
 for each row execute function trip_lifecycle_private.deletion_queued_v1();

-- Revoke PostgreSQL's default PUBLIC execute on every internal helper as well.
do $$declare f record;begin
 for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='trip_lifecycle_private' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 end loop;
end $$;
notify pgrst,'reload schema';

-- Main #240 lease: Trip reference archive-only proof. Original ACLs survive
-- CREATE OR REPLACE; no new GRANT, common basis or exact reader changes.
create or replace function public.read_trip_result_reference_v1(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); a turn_private.result_artifacts%rowtype;
  r turn_private.result_revisions%rowtype; authorised jsonb; candidate record; examined integer:=0;
begin
  if p_trip_id is null then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from public.trips t where t.id=p_trip_id and t.owner_id=u)
    then return jsonb_build_object('kind','empty'); end if;
  if exists(select 1 from privacy_private.trip_deletions d where d.trip_id=p_trip_id)
    then return jsonb_build_object('kind','unavailable'); end if;
  -- VPJ61_ARCHIVE_V1_BEGIN
  if exists(select 1 from public.trip_archives archive where archive.trip_id=p_trip_id and archive.owner_id=u) then
    for candidate in select id,current_revision,proposal_id from turn_private.result_artifacts
      where owner_id=u and trip_id=p_trip_id and lifecycle='active'
      order by created_at desc,id desc limit 65 loop
      examined:=examined+1;if examined>64 then return jsonb_build_object('kind','unavailable');end if;
      authorised:=public.read_result_artifacts_v1(candidate.id,candidate.current_revision);
      if candidate.proposal_id is null and authorised->>'kind'='result_artifact' and authorised->>'artifactId'=candidate.id::text
        and authorised->'revision'=to_jsonb(candidate.current_revision)
        and authorised->'source'->>'tripId'=p_trip_id::text
        and authorised->'historicalReadable'='true'::jsonb and authorised->'current'='false'::jsonb
        and coalesce(turn_private.valid_comparison_v1(authorised->'content'),false) then
        return jsonb_build_object('kind','result_reference','artifactId',candidate.id,'revision',candidate.current_revision,'tripId',p_trip_id,'archiveHistorical',true);
      end if;
    end loop;
    if examined>0 or exists(select 1 from turn_private.result_artifacts where owner_id=u and trip_id=p_trip_id) then return jsonb_build_object('kind','unavailable');end if;
    return jsonb_build_object('kind','empty');
  end if;
  -- VPJ61_ARCHIVE_V1_END
  -- Examine at most 64 newest references. If older candidates exist beyond
  -- that bound, report unavailable rather than falsely claim an empty Trip.
  for candidate in select artifact.id as artifact_id,artifact.current_revision as revision
    from turn_private.result_artifacts artifact
    join turn_private.result_revisions revision on revision.artifact_id=artifact.id
      and revision.revision=artifact.current_revision and revision.owner_id=u
    join turn_private.assistant_goal_trip_links link on link.goal_id=artifact.goal_id
      and link.owner_id=u and link.trip_id=p_trip_id and link.trip_head_version=revision.trip_version
      and link.operation_id=revision.trip_link_operation_id and link.link_version=revision.trip_link_version
      and link.goal_scope_version=revision.goal_version and link.source_kind='native_user_confirmed'
      and not link.terminal_unlinked
    join turn_private.assistant_goals goal on goal.id=artifact.goal_id and goal.owner_id=u
      and goal.scope_version=revision.goal_version
    join public.trips trip on trip.id=p_trip_id and trip.owner_id=u and trip.head_version=revision.trip_version
    where artifact.proposal_id is null and artifact.trip_id=p_trip_id and artifact.owner_id=u and artifact.lifecycle='active'
    order by artifact.created_at desc,artifact.id desc limit 65 loop
    examined:=examined+1;
    if examined>64 then return jsonb_build_object('kind','unavailable'); end if;
    select * into a from turn_private.result_artifacts
      where id=candidate.artifact_id and owner_id=u and lifecycle='active';
    if not found then continue; end if;
    select * into r from turn_private.result_revisions
      where artifact_id=a.id and owner_id=u and revision=candidate.revision;
    if not found or turn_private.result_basis_state(a,r)->>'current'<>'true' then continue; end if;
    authorised:=public.read_result_artifacts_v1(a.id,r.revision);
    if authorised->>'kind'='result_artifact' and authorised->>'current'='true' then
      return jsonb_build_object('kind','result_reference','artifactId',a.id,'revision',r.revision,'tripId',p_trip_id);
    end if;
  end loop;
  return jsonb_build_object('kind','empty');
end $$;
create or replace function public.read_trip_result_reference_v2(p_trip_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();candidate record;authorised jsonb;examined integer:=0;
begin
 if p_trip_id is null then raise exception 'INVALID_INPUT';end if;
 if not exists(select 1 from public.trips where id=p_trip_id and owner_id=u) or exists(select 1 from privacy_private.trip_deletions where trip_id=p_trip_id) then return jsonb_build_object('kind','empty');end if;
 -- VPJ61_ARCHIVE_V2_BEGIN
 if exists(select 1 from public.trip_archives where trip_id=p_trip_id and owner_id=u) then
  for candidate in select id,current_revision,proposal_id from turn_private.result_artifacts
   where owner_id=u and trip_id=p_trip_id and lifecycle='active'
   order by created_at desc,id desc limit 65 loop
   examined:=examined+1;if examined>64 then return jsonb_build_object('kind','unavailable');end if;
   authorised:=public.read_result_artifact_v2(candidate.id,candidate.current_revision);
   if candidate.proposal_id is null and authorised->>'kind'='result_artifact' and authorised->>'artifactId'=candidate.id::text
    and authorised->'revision'=to_jsonb(candidate.current_revision)
    and authorised->'source'->>'tripId'=p_trip_id::text
    and authorised->'historicalReadable'='true'::jsonb and authorised->'current'='false'::jsonb
    and (authorised->'content'->>'schemaVersion' in ('comparison/1','decision/1','practical/1')
     or (authorised->'content'->>'schemaVersion'='journey-draft/1' and authorised->'content'->'source'->>'kind' in ('task_output','trip_snapshot'))) then
    return jsonb_build_object('kind','result_reference','artifactId',candidate.id,'revision',candidate.current_revision,'tripId',p_trip_id,'archiveHistorical',true);
   end if;
  end loop;
  if examined>0 or exists(select 1 from turn_private.result_artifacts where owner_id=u and trip_id=p_trip_id) then return jsonb_build_object('kind','unavailable');end if;
  return jsonb_build_object('kind','empty');
 end if;
 -- VPJ61_ARCHIVE_V2_END
 for candidate in select id,current_revision from turn_private.result_artifacts where owner_id=u and trip_id=p_trip_id and lifecycle='active' order by created_at desc,id desc limit 65 loop
  examined:=examined+1;if examined>64 then return jsonb_build_object('kind','unavailable');end if;
  authorised:=public.read_result_artifact_v2(candidate.id,candidate.current_revision);
  if authorised->>'kind'='result_artifact' and authorised->>'current'='true' and authorised->'source'->>'tripId'=p_trip_id::text then return jsonb_build_object('kind','result_reference','artifactId',candidate.id,'revision',candidate.current_revision,'tripId',p_trip_id);end if;
 end loop;return jsonb_build_object('kind','empty');
end $$;
notify pgrst,'reload schema';
