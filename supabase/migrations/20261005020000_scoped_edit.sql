-- #198: bounded edits; all capabilities remain disabled until separately enrolled.
-- The original exact-version confirm is the sole Trip writer.
create schema scoped_edit_private;
revoke all on schema scoped_edit_private from public,anon,authenticated,service_role;
alter table public.trip_items add column manual_order integer check(manual_order between 0 and 499);
alter table public.trip_proposals add column scoped_edit boolean not null default false;

create table scoped_edit_private.contexts_v1(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade, base_version integer not null,
 input jsonb not null, snapshot jsonb not null, actor_basis jsonb not null, source_basis jsonb not null,
 locked_ids jsonb not null, fixed_ids jsonb not null, digest text not null,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 check(expires_at<=created_at+interval '10 minutes'), unique(id,owner_id,trip_id)
);
create table scoped_edit_private.operations_v1(
 owner_id uuid not null references auth.users(id) on delete cascade, operation_id uuid not null,
 trip_id uuid not null references public.trips(id) on delete cascade, mutation jsonb not null, digest text not null,
 actor_basis jsonb not null, context_id uuid, receipt jsonb, cancelled boolean not null default false,
 proposal_id uuid references public.trip_proposals(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(), primary key(owner_id,operation_id)
);
-- Permanent until Trip/account erasure. Expiring a context cannot unmark a proposal.
create table scoped_edit_private.lineage_v1(
 proposal_id uuid primary key references public.trip_proposals(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, trip_id uuid not null references public.trips(id) on delete cascade,
 operation_id uuid not null, context_id uuid not null, proposal_digest text not null, proposal_revision integer not null,
 base_version integer not null, patch jsonb not null,
 foreign key(owner_id,operation_id) references scoped_edit_private.operations_v1(owner_id,operation_id) on delete cascade
);
create table scoped_edit_private.locks_v1(
 trip_id uuid not null references public.trips(id) on delete cascade, owner_id uuid not null references auth.users(id) on delete cascade,
 item_id text not null, locked boolean not null, revision bigint not null, primary key(trip_id,item_id)
);
create table scoped_edit_private.lock_epochs_v1(
 trip_id uuid primary key references public.trips(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, revision bigint not null default 0
);
create table scoped_edit_private.proofs_v1(
 transaction_id xid8 not null, proposal_id uuid not null references public.trip_proposals(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, trip_id uuid not null references public.trips(id) on delete cascade,
 context_id uuid not null, expected_content jsonb not null, actor_basis jsonb not null, source_basis jsonb not null,
 checked_at timestamptz not null default clock_timestamp(), primary key(transaction_id,proposal_id)
);
create index scoped_context_trip on scoped_edit_private.contexts_v1(trip_id);
create index scoped_context_expiry on scoped_edit_private.contexts_v1(expires_at,id);
create index scoped_operation_trip on scoped_edit_private.operations_v1(trip_id);
create index scoped_lineage_trip on scoped_edit_private.lineage_v1(trip_id);
create index scoped_lineage_context on scoped_edit_private.lineage_v1(context_id);
create index scoped_proof_trip on scoped_edit_private.proofs_v1(trip_id);
do $$declare t text;begin foreach t in array array['contexts_v1','operations_v1','lineage_v1','locks_v1','lock_epochs_v1','proofs_v1'] loop
 execute format('alter table scoped_edit_private.%I enable row level security',t);
 execute format('revoke all on scoped_edit_private.%I from public,anon,authenticated,service_role',t);
end loop;end $$;
create function scoped_edit_private.hash_v1(v jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(v::text,'UTF8')),'hex')$$;
create function scoped_edit_private.unavailable_v1(reason text) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('kind','unavailable','reason',reason)$$;
create function scoped_edit_private.immutable_v1() returns trigger language plpgsql set search_path='' as $$begin raise exception 'SCOPED_RECORD_IMMUTABLE';end $$;
create trigger scoped_context_immutable before update on scoped_edit_private.contexts_v1 for each row execute function scoped_edit_private.immutable_v1();
create trigger scoped_lineage_immutable before update on scoped_edit_private.lineage_v1 for each row execute function scoped_edit_private.immutable_v1();

-- Keep the installed pure patch validator as the compatibility implementation.
-- No copied writer or historical migration edits.
do $$declare f text;begin
 f:=pg_get_functiondef('public.apply_trip_content_patch(jsonb,jsonb)'::regprocedure);
 f:=replace(f,'public.apply_trip_content_patch','scoped_edit_private.legacy_patch_v1');execute f;
end $$;

create or replace function public.trip_content_snapshot(p_trip_id uuid,p_title text)
returns jsonb language sql stable security invoker set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('title',p_title,'days',coalesce(jsonb_agg(v order by trip_date,day_id),'[]')) from (
 select d.trip_date,d.day_id,jsonb_build_object('id',d.day_id,'date',to_char(d.trip_date,'YYYY-MM-DD'))
 ||case when d.time_zone is null then '{}'::jsonb else jsonb_build_object('timeZone',d.time_zone) end
 ||jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',i.item_id,'dayId',i.day_id,'title',i.title)
 ||case when i.starts_at is null then '{}'::jsonb else jsonb_build_object('startsAt',to_char(i.starts_at,'YYYY-MM-DD"T"HH24:MI:SS')||'+00:00') end
 ||case when i.ends_at is null then '{}'::jsonb else jsonb_build_object('endsAt',to_char(i.ends_at,'YYYY-MM-DD"T"HH24:MI:SS')||'+00:00') end
 ||case when i.manual_order is null then '{}'::jsonb else jsonb_build_object('manualOrder',i.manual_order) end
 order by coalesce(i.manual_order,i.legacy_slot),i.item_id) from
 (select x.*, (row_number() over(order by x.item_id)-1)::integer legacy_slot from public.trip_items x where x.trip_id=d.trip_id and x.day_id=d.day_id) i),'[]')) v
 from public.trip_days d where d.trip_id=p_trip_id) q
$$;

create or replace function public.apply_trip_content_patch(p_current jsonb,p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; stripped jsonb; ops jsonb; d jsonb; i jsonb; old_i jsonb; o jsonb; reordered jsonb; items jsonb; days jsonb:='[]'; slot integer;old_slot integer;current jsonb:=p_current;current_op jsonb;one_patch jsonb;
begin
 if not (p_patch ? 'operations') then return scoped_edit_private.legacy_patch_v1(p_current,p_patch);end if;
 if jsonb_typeof(p_patch->'operations') is distinct from 'array' or jsonb_array_length(p_patch->'operations') not between 1 and 128
 or not recovery_private.exact_v1(p_patch,array['expectedVersion','operations']) then raise exception 'INVALID_PATCH';end if;
 for current_op in select value from jsonb_array_elements(p_patch->'operations') loop
 days:='[]';one_patch:=jsonb_build_object('expectedVersion',p_patch->'expectedVersion','operations',jsonb_build_array(current_op));
 ops:=case when current_op->>'kind'='reorder_items' then '[]'::jsonb else jsonb_build_array(current_op) end;
 -- Existing validator enforces the closed ordinary operation language.
 stripped:=jsonb_build_object('expectedVersion',p_patch->'expectedVersion','operations',case when jsonb_array_length(ops)=0 then jsonb_build_array(jsonb_build_object('kind','set_title','title',p_current->'title')) else ops end);
 result:=scoped_edit_private.legacy_patch_v1(current,stripped);
 for d in select value from jsonb_array_elements(result->'days') loop
 items:='[]';
 for i in select value from jsonb_array_elements(d->'items') loop
 select x into old_i from jsonb_array_elements(current->'days')dd,jsonb_array_elements(dd->'items')x where dd->>'id'=d->>'id' and x->>'id'=i->>'id';
 if old_i ? 'manualOrder' then i:=i||jsonb_build_object('manualOrder',old_i->'manualOrder');end if;
 items:=items||jsonb_build_array(i);
 end loop;
 select coalesce(jsonb_agg(value order by coalesce((value->>'manualOrder')::integer,(ordinality-1)::integer),value->>'id'),'[]') into items from jsonb_array_elements(items) with ordinality;
 select x into o from jsonb_array_elements(one_patch->'operations')x where x->>'kind'='reorder_items' and x->>'dayId'=d->>'id';
 if found then
 if (select count(*) from jsonb_array_elements(one_patch->'operations')x where x->>'kind'='reorder_items' and x->>'dayId'=d->>'id')<>1
 or not recovery_private.exact_v1(o,array['kind','dayId','itemIds']) or not recovery_private.ids_v1(o->'itemIds',1,500)
 or jsonb_array_length(o->'itemIds')<>jsonb_array_length(items)
 or exists(select 1 from jsonb_array_elements_text(o->'itemIds')x where not exists(select 1 from jsonb_array_elements(items)y where y->>'id'=x)) then raise exception 'INVALID_PATCH';end if;
 reordered:='[]';slot:=0;
 for o in select value from jsonb_array_elements(o->'itemIds') loop
 select value,(ordinality-1)::integer into i,old_slot from jsonb_array_elements(items) with ordinality where value->'id'=o;
 -- Unmoved absent metadata stays absent. Untouched/protected fields can remain exact.
 if old_slot<>slot or i ? 'manualOrder' then i:=i||jsonb_build_object('manualOrder',slot);end if;
 reordered:=reordered||jsonb_build_array(i);slot:=slot+1;
 end loop;
 if (select jsonb_agg(rr.value->'id' order by coalesce((rr.value->>'manualOrder')::integer,legacy.slot),rr.value->>'id') from jsonb_array_elements(reordered) rr cross join lateral (select (count(*)-1)::integer slot from jsonb_array_elements(reordered)xx where xx.value->>'id'<=rr.value->>'id') legacy) is distinct from (select jsonb_agg(value->'id') from jsonb_array_elements(reordered)value) then raise exception 'INVALID_ORDER';end if;items:=reordered;
 end if;
 days:=days||jsonb_build_array(jsonb_set(d,'{items}',items));
 end loop;
 if exists(select 1 from jsonb_array_elements(one_patch->'operations')x where x->>'kind'='reorder_items' and not exists(select 1 from jsonb_array_elements(result->'days')dd where dd.value->>'id'=x->>'dayId')) then raise exception 'INVALID_PATCH';end if;
 current:=jsonb_set(result,'{days}',days);end loop;return current;
end $$;

-- Profile/Memory/consent state is sealed as metadata; no inferred summary egress.
create function scoped_edit_private.memory_basis_v1(u uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare v jsonb;begin
 perform 1 from public.memory_profiles where owner_id=u for share nowait;
 perform 1 from public.memory_consents where owner_id=u for share nowait;
 select jsonb_build_object('profiles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'state',state,'updatedAt',updated_at,'receipt',source_receipt_id,'consent',consent_id) order by id) from public.memory_profiles where owner_id=u),'[]'),
 'consents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'updatedAt',updated_at) order by id) from public.memory_consents where owner_id=u),'[]')) into v;return v;
end $$;
create function scoped_edit_private.source_v1(u uuid,t uuid,head integer,p_bindings jsonb default '[]'::jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare profile jsonb;memory jsonb;orders jsonb;bindings jsonb:='[]';record jsonb;b jsonb;lr bigint;raw jsonb;
begin
 profile:=recovery_private.profile_v1(u);memory:=scoped_edit_private.memory_basis_v1(u);orders:=recovery_private.reservations_v1(u,t,head);
 if orders->>'kind' is distinct from 'basis' then return null;end if;
 for record in select value from jsonb_array_elements(orders->'records') loop
 if record->'fields'->>'status'='unknown' then return null;end if;
 if record->'fields'->>'status' in('reserved','amended') then
 -- Only a previously explicit preservation binding from #220 is authoritative.
 select x into b from jsonb_array_elements(p_bindings)x where (x->>'referenceId')::uuid=(record->>'referenceId')::uuid and x->'referenceRevision'=record->'revision' and exists(select 1 from public.trip_items where trip_id=t and owner_id=u and item_id=x->>'itemId');
 if not found then
 select x into b from recovery_private.contexts_v1 c,jsonb_array_elements(c.input->'reservationBindings')x
 where c.owner_id=u and c.trip_id=t and (x->>'referenceId')::uuid=(record->>'referenceId')::uuid and x->'revision'=record->'revision'
 and exists(select 1 from public.trip_items i where i.trip_id=t and i.owner_id=u and i.day_id=x->>'dayId' and i.item_id=x->>'itemId')
 order by c.created_at desc limit 1;
 end if;
 if not found then return null;end if;
 bindings:=bindings||jsonb_build_array(jsonb_build_object('itemId',b->'itemId','sourceKind','user_confirmed_reservation','referenceId',record->'referenceId','referenceRevision',record->'revision'));
 end if;end loop;
 select revision into lr from scoped_edit_private.lock_epochs_v1 where trip_id=t and owner_id=u for share;
 raw:=jsonb_build_object('profile',profile,'memory',memory,'reservations',orders->'items','fixedBindings',bindings,'lockRevision',coalesce(lr,0));
 return jsonb_build_object('profileUpdatedAt',profile->'updatedAt','memoryBasisDigest',scoped_edit_private.hash_v1(memory),'reservationBasisDigest',scoped_edit_private.hash_v1(orders->'items'),
 'sourceDigest',scoped_edit_private.hash_v1(raw),'lockRevision',coalesce(lr,0),'fixedBindings',bindings);
end $$;
create function scoped_edit_private.scope_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(recovery_private.exact_v1(v,array['dayIds','itemIds']) and recovery_private.ids_v1(v->'dayIds',0,7) and recovery_private.ids_v1(v->'itemIds',0,64) and jsonb_array_length(v->'dayIds')+jsonb_array_length(v->'itemIds')>0,false)
$$;
create function scoped_edit_private.valid_mutation_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare e jsonb:=v->'edit';b jsonb:=v->'basis';begin
 if not recovery_private.uuid_v1(v->'operationId') or v->>'operationId'<>lower(v->>'operationId')
 or not recovery_private.exact_v1(b,array['contextId','contextDigest','baseVersion']) or not recovery_private.uuid_v1(b->'contextId') or b->>'contextId'<>lower(b->>'contextId')
 or coalesce(b->>'contextDigest','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(b->'baseVersion') is distinct from 'number' or coalesce(b->>'baseVersion','') !~ '^(0|[1-9][0-9]{0,8})$' then return false;end if;
 if v->>'action'='ask' then return recovery_private.exact_v1(v,array['action','operationId','basis','text']) and jsonb_typeof(v->'text')='string' and char_length(btrim(v->>'text')) between 1 and 4000;end if;
 if v->>'action'='lock' then return recovery_private.exact_v1(v,array['action','operationId','basis','itemId','locked']) and jsonb_typeof(v->'itemId')='string' and v->>'itemId' ~ '^[A-Za-z0-9_-]{1,64}$' and jsonb_typeof(v->'locked')='boolean';end if;
 if v->>'action' is distinct from 'manual' or not recovery_private.exact_v1(v,array['action','operationId','basis','edit']) then return false;end if;
 if e->>'kind'='reorder_items' then return recovery_private.exact_v1(e,array['kind','dayId','itemIds']) and jsonb_typeof(e->'dayId')='string' and e->>'dayId' ~ '^[A-Za-z0-9_-]{1,64}$' and recovery_private.ids_v1(e->'itemIds',1,64);end if;
 if jsonb_typeof(e->'itemId') is distinct from 'string' or coalesce(e->>'itemId','') !~ '^[A-Za-z0-9_-]{1,64}$' then return false;end if;
 if e->>'kind'='move_item' then return recovery_private.exact_v1(e,array['kind','itemId','toDayId']) and jsonb_typeof(e->'toDayId')='string' and e->>'toDayId' ~ '^[A-Za-z0-9_-]{1,64}$';end if;
 if e->>'kind'='set_time' then return recovery_private.exact_v1(e,array['kind','itemId','startsAt','endsAt']) and (e->'startsAt'='null' or recovery_private.time_v1(e->>'startsAt') is not null) and (e->'endsAt'='null' or recovery_private.time_v1(e->>'endsAt') is not null) and (e->'startsAt'='null' or e->'endsAt'='null' or recovery_private.time_v1(e->>'endsAt')>recovery_private.time_v1(e->>'startsAt'));end if;
 return false;
end $$;
create function scoped_edit_private.context_wire_v1(c scoped_edit_private.contexts_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('kind','scoped_edit_context/1','contextId',c.id,'contextDigest',c.digest,'tripId',c.trip_id,'baseVersion',c.base_version,'scope',c.input->'scope',
 'snapshot',c.snapshot||jsonb_build_object('version',c.base_version),'orderedItemIdsByDay',(select coalesce(jsonb_agg(jsonb_build_object('dayId',d->'id','itemIds',(select coalesce(jsonb_agg(i->'id'),'[]') from jsonb_array_elements(d->'items')i))),'[]') from jsonb_array_elements(c.snapshot->'days')d),
 'lockedItemIds',c.locked_ids,'fixedItemIds',c.fixed_ids,'sourceBasis',c.source_basis,'expiresAt',recovery_private.ms_v1(c.expires_at))
$$;
create function public.prepare_scoped_trip_edit_v1(p_trip_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid;t public.trips%rowtype;c scoped_edit_private.contexts_v1%rowtype;snap jsonb;actor jsonb;source jsonb;locked jsonb;fixed jsonb;selected integer;ts timestamptz;b jsonb;orders jsonb;
begin
 if p_trip_id is null or not recovery_private.exact_v1(p_input,array['expectedHeadVersion','scope','locale','reservationBindings']) or not scoped_edit_private.scope_v1(p_input->'scope')
 or coalesce(p_input->>'locale','') not in('zh','en') or jsonb_typeof(p_input->'expectedHeadVersion') is distinct from 'number' or coalesce(p_input->>'expectedHeadVersion','') !~ '^(0|[1-9][0-9]{0,8})$' then raise exception 'INVALID_INPUT';end if;
 if jsonb_typeof(p_input->'reservationBindings') is distinct from 'array' or jsonb_array_length(p_input->'reservationBindings')>100 then raise exception 'INVALID_INPUT';end if;
 for b in select value from jsonb_array_elements(p_input->'reservationBindings') loop
 if not recovery_private.exact_v1(b,array['itemId','referenceId','referenceRevision']) or not recovery_private.uuid_v1(b->'referenceId') or jsonb_typeof(b->'itemId') is distinct from 'string' or b->>'itemId' !~ '^[A-Za-z0-9_-]{1,64}$' or jsonb_typeof(b->'referenceRevision') is distinct from 'number' or coalesce(b->>'referenceRevision','') !~ '^[1-9][0-9]{0,8}$' then raise exception 'INVALID_INPUT';end if;end loop;
 if (select count(distinct x->>'referenceId') from jsonb_array_elements(p_input->'reservationBindings')x)<>jsonb_array_length(p_input->'reservationBindings') then raise exception 'INVALID_INPUT';end if;
 u:=recovery_private.actor_v1();t:=recovery_private.trip_v1(u,p_trip_id);if t.id is null or t.head_version<>(p_input->>'expectedHeadVersion')::integer then return scoped_edit_private.unavailable_v1('stale_basis');end if;
 actor:=recovery_private.actor_basis_v1();if actor is null then return scoped_edit_private.unavailable_v1('stale_basis');end if;
 if exists(select 1 from jsonb_array_elements_text(p_input->'scope'->'dayIds')x where not exists(select 1 from public.trip_days where trip_id=t.id and day_id=x))
 or exists(select 1 from jsonb_array_elements_text(p_input->'scope'->'itemIds')x where not exists(select 1 from public.trip_items where trip_id=t.id and item_id=x)) then return scoped_edit_private.unavailable_v1('invalid_scope');end if;
 select count(*) into selected from public.trip_items where trip_id=t.id and ((p_input->'scope'->'dayIds') @> jsonb_build_array(day_id) or (p_input->'scope'->'itemIds') @> jsonb_build_array(item_id));
 if selected>64 then return scoped_edit_private.unavailable_v1('invalid_scope');end if;
 snap:=public.trip_content_snapshot(t.id,t.title);
 if (select count(*) from public.trip_items where trip_id=t.id)>500 or (select count(*) from public.trip_days where trip_id=t.id)>366 or pg_column_size(snap)>262144 then return scoped_edit_private.unavailable_v1('invalid_scope');end if;
 orders:=recovery_private.reservations_v1(u,t.id,t.head_version);if orders->>'kind' is distinct from 'basis' then return scoped_edit_private.unavailable_v1('provider_unavailable');end if;
 if exists(select 1 from jsonb_array_elements(p_input->'reservationBindings')x where not exists(select 1 from jsonb_array_elements(orders->'records')r where r->'referenceId'=x->'referenceId' and r->'revision'=x->'referenceRevision' and r->'fields'->>'status' in('reserved','amended')) or not exists(select 1 from public.trip_items where trip_id=t.id and item_id=x->>'itemId')) then return scoped_edit_private.unavailable_v1('stale_basis');end if;
 source:=scoped_edit_private.source_v1(u,t.id,t.head_version,p_input->'reservationBindings');if source is null then
 if exists(select 1 from jsonb_array_elements(orders->'records')r where r->'fields'->>'status'='unknown') then return scoped_edit_private.unavailable_v1('provider_unavailable');end if;
 return jsonb_build_object('kind','scoped_edit_binding_required/1','tripId',t.id,'baseVersion',t.head_version,'scope',p_input->'scope','reservations',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(orders->'records')r where r->'fields'->>'status' in('reserved','amended')));end if;
 select coalesce(jsonb_agg(item_id order by item_id),'[]') into locked from scoped_edit_private.locks_v1 l where l.trip_id=t.id and l.owner_id=u and l.locked and exists(select 1 from public.trip_items where trip_id=t.id and item_id=l.item_id);
 select coalesce(jsonb_agg(distinct x->'itemId'),'[]') into fixed from jsonb_array_elements(source->'fixedBindings')x;
 ts:=clock_timestamp();
 insert into scoped_edit_private.contexts_v1(owner_id,trip_id,base_version,input,snapshot,actor_basis,source_basis,locked_ids,fixed_ids,digest,created_at,expires_at)
 values(u,t.id,t.head_version,p_input,snap,actor,source,locked,fixed,scoped_edit_private.hash_v1(jsonb_build_array(u,t.id,t.head_version,p_input,snap,actor,source,locked,fixed,ts)),ts,ts+interval '9 minutes') returning * into c;
 return scoped_edit_private.context_wire_v1(c);
exception when lock_not_available then return scoped_edit_private.unavailable_v1('stale_basis');end $$;
create function scoped_edit_private.current_v1(c scoped_edit_private.contexts_v1) returns boolean language plpgsql security definer set search_path='' as $$declare t public.trips%rowtype;src jsonb;begin
 t:=recovery_private.trip_v1(recovery_private.actor_v1(),c.trip_id);
 if t.id is null or t.owner_id<>c.owner_id or t.head_version<>c.base_version or c.expires_at<=clock_timestamp() or recovery_private.actor_basis_v1() is distinct from c.actor_basis
 or public.trip_content_snapshot(t.id,t.title) is distinct from c.snapshot then return false;end if;
 src:=scoped_edit_private.source_v1(c.owner_id,c.trip_id,t.head_version,c.input->'reservationBindings');return src is not null and src=c.source_basis;
end $$;

-- Every nonselected or protected item keeps all fields and its absolute day slot.
create function scoped_edit_private.guard_candidate_v1(c scoped_edit_private.contexts_v1,n jsonb,absolute_slots boolean default false) returns boolean language plpgsql immutable set search_path='' as $$declare d jsonb;i jsonb;nd jsonb;ni jsonb;pos bigint;npos bigint;selected boolean;selected_ids jsonb;before_protected jsonb;after_protected jsonb;begin
 select coalesce(jsonb_agg(ii->'id'),'[]') into selected_ids from jsonb_array_elements(c.snapshot->'days')dd,jsonb_array_elements(dd->'items')ii where c.input->'scope'->'dayIds' @> jsonb_build_array(dd->'id') or c.input->'scope'->'itemIds' @> jsonb_build_array(ii->'id');
 if n->'title' is distinct from c.snapshot->'title' or jsonb_array_length(n->'days')<>jsonb_array_length(c.snapshot->'days') then return false;end if;
 for d in select value from jsonb_array_elements(c.snapshot->'days') loop
 select value into nd from jsonb_array_elements(n->'days') where value->'id'=d->'id';if not found or (d-'items')<>(nd-'items') then return false;end if;
 for i,pos in select value,ordinality from jsonb_array_elements(d->'items') with ordinality loop
 selected:=selected_ids @> jsonb_build_array(i->'id');
 if not selected or c.locked_ids @> jsonb_build_array(i->'id') or c.fixed_ids @> jsonb_build_array(i->'id') then
 select value,ordinality into ni,npos from jsonb_array_elements(nd->'items') with ordinality where value->'id'=i->'id';
 if not found or i is distinct from ni or absolute_slots and pos<>npos then return false;end if;
 end if;end loop;
 select coalesce(jsonb_agg(it.value->'id' order by it.ordinality),'[]') into before_protected from jsonb_array_elements(d->'items') with ordinality it where not(selected_ids @> jsonb_build_array(it.value->'id')) or c.locked_ids @> jsonb_build_array(it.value->'id') or c.fixed_ids @> jsonb_build_array(it.value->'id');
 select coalesce(jsonb_agg(it.value->'id' order by it.ordinality),'[]') into after_protected from jsonb_array_elements(nd->'items') with ordinality it where (not(selected_ids @> jsonb_build_array(it.value->'id')) or c.locked_ids @> jsonb_build_array(it.value->'id') or c.fixed_ids @> jsonb_build_array(it.value->'id')) and exists(select 1 from jsonb_array_elements(c.snapshot->'days')dd,jsonb_array_elements(dd->'items')ii where ii->'id'=it.value->'id');
 if before_protected is distinct from after_protected then return false;end if;end loop;
 for d in select value from jsonb_array_elements(n->'days') loop
 for i in select value from jsonb_array_elements(d->'items') loop
 if not exists(select 1 from jsonb_array_elements(c.snapshot->'days')dd,jsonb_array_elements(dd->'items')ii where ii->'id'=i->'id') and not (c.input->'scope'->'dayIds' @> jsonb_build_array(d->'id')) then return false;end if;
 end loop;end loop;return true;
end $$;
create function scoped_edit_private.manual_patch_v1(c scoped_edit_private.contexts_v1,e jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare ops jsonb;i jsonb;d jsonb;ids jsonb;movable jsonb;cursor integer:=0;cur_item jsonb;begin
 if e->>'kind'='reorder_items' then
 select value into d from jsonb_array_elements(c.snapshot->'days') where value->>'id'=e->>'dayId';if not found then raise exception 'INVALID_SCOPE';end if;
 select coalesce(jsonb_agg(x->'id'),'[]') into movable from jsonb_array_elements(d->'items')x where (c.input->'scope'->'dayIds' @> jsonb_build_array(d->'id') or c.input->'scope'->'itemIds' @> jsonb_build_array(x->'id')) and not(c.locked_ids @> jsonb_build_array(x->'id') or c.fixed_ids @> jsonb_build_array(x->'id'));
 if jsonb_array_length(movable)<>jsonb_array_length(e->'itemIds') or not (movable @> (e->'itemIds') and (e->'itemIds') @> movable) then raise exception 'PROTECTED_ITEM';end if;
 ids:='[]';for cur_item in select value from jsonb_array_elements(d->'items') loop
 if movable @> jsonb_build_array(cur_item->'id') then ids:=ids||jsonb_build_array(e->'itemIds'->cursor);cursor:=cursor+1;else ids:=ids||jsonb_build_array(cur_item->'id');end if;
 end loop;ops:=jsonb_build_array(jsonb_build_object('kind','reorder_items','dayId',d->'id','itemIds',ids));
 else
 select ii into i from jsonb_array_elements(c.snapshot->'days')dd,jsonb_array_elements(dd->'items')ii where ii->>'id'=e->>'itemId';
 if not found or not(c.input->'scope'->'dayIds' @> jsonb_build_array(i->'dayId') or c.input->'scope'->'itemIds' @> jsonb_build_array(i->'id')) or c.locked_ids @> jsonb_build_array(i->'id') or c.fixed_ids @> jsonb_build_array(i->'id') then raise exception 'PROTECTED_ITEM';end if;
 if e->>'kind'='move_item' then
 if e->'toDayId'=i->'dayId' or not exists(select 1 from jsonb_array_elements(c.snapshot->'days')dd where dd.value->'id'=e->'toDayId') then raise exception 'INVALID_SCOPE';end if;
 ops:=jsonb_build_array(jsonb_build_object('kind','delete_item','dayId',i->'dayId','itemId',i->'id'),jsonb_build_object('kind','upsert_item','dayId',e->'toDayId','itemId',i->'id','title',i->'title')||(i-array['id','dayId','title','manualOrder']));
 else ops:=jsonb_build_array(jsonb_build_object('kind','upsert_item','dayId',i->'dayId','itemId',i->'id','title',i->'title')||case when e->'startsAt'='null' then '{}'::jsonb else jsonb_build_object('startsAt',e->'startsAt') end||case when e->'endsAt'='null' then '{}'::jsonb else jsonb_build_object('endsAt',e->'endsAt') end);
 end if;end if;
 return jsonb_build_object('expectedVersion',c.base_version,'operations',ops);
end $$;
create function scoped_edit_private.diff_v1(c scoped_edit_private.contexts_v1,n jsonb) returns jsonb language sql immutable set search_path='' as $$
 with old as(select i.value->>'id' id,i.value i,i.ordinality slot from jsonb_array_elements(c.snapshot->'days')d,jsonb_array_elements(d->'items') with ordinality i),new as(select i.value->>'id' id,i.value i,i.ordinality slot from jsonb_array_elements(n->'days')d,jsonb_array_elements(d->'items') with ordinality i),pairs as(select coalesce(o.id,v.id) id,o.i before,v.i after,o.slot os,v.slot ns from old o full join new v using(id))
 select jsonb_build_object('changes',coalesce((select jsonb_agg(jsonb_build_object('kind',case when before is null then 'added' when after is null then 'removed' when before->'dayId'<>after->'dayId' then 'moved' when before-'manualOrder'=after-'manualOrder' then 'reordered' when before->'title'<>after->'title' then 'replaced' else 'changed' end,'itemId',id,'before',before,'after',after) order by id) from pairs where before is distinct from after),'[]'),
 'preservedItemIds',coalesce((select jsonb_agg(to_jsonb(id) order by id) from pairs where before=after),'[]'),'transferImpact','pending','walkingImprovement','unverified','externalOrderEffect','none')
$$;

create function scoped_edit_private.publish_v1(c scoped_edit_private.contexts_v1,op uuid,patch jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.trip_proposals%rowtype;n jsonb;dig text;r jsonb;begin
 n:=public.apply_trip_content_patch(c.snapshot,patch);
 if patch->'expectedVersion'<>to_jsonb(c.base_version) or not scoped_edit_private.guard_candidate_v1(c,n,false) then raise exception 'PROTECTED_ITEM';end if;
 if n=c.snapshot then raise exception 'NO_CHANGE';end if;
 select proposal_id into p.id from public.create_trip_proposal_patch(c.trip_id,patch);
 update public.trip_proposals set scoped_edit=true,expires_at=c.expires_at where id=p.id returning * into p;
 select digest into dig from public.read_trip_proposal_v2(p.id);
 r:=jsonb_build_object('kind','scoped_edit_proposal/1','operationId',op,'tripId',c.trip_id,'contextId',c.id,'contextDigest',c.digest,'proposalId',p.id,'proposalRevision',p.revision,'proposalDigest',dig,'baseVersion',c.base_version,'expiresAt',recovery_private.ms_v1(c.expires_at),'returnScope',c.input->'scope','diff',scoped_edit_private.diff_v1(c,n),'reused',false);
 update scoped_edit_private.operations_v1 set receipt=r,proposal_id=p.id where owner_id=c.owner_id and operation_id=op;
 insert into scoped_edit_private.lineage_v1 values(p.id,c.owner_id,c.trip_id,op,c.id,dig,p.revision,c.base_version,patch);
 return r;
end $$;
create function public.submit_scoped_trip_edit_v1(p_trip_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid;t public.trips%rowtype;op uuid;c scoped_edit_private.contexts_v1%rowtype;o scoped_edit_private.operations_v1%rowtype;r jsonb;lr bigint;locked boolean;
begin
 if p_trip_id is null or not scoped_edit_private.valid_mutation_v1(p_input) then raise exception 'INVALID_INPUT';end if;
 u:=auth.uid();if u is null or auth.role() is distinct from 'authenticated' then raise exception 'UNAUTHENTICATED';end if;op:=(p_input->>'operationId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('scoped:'||u::text||':'||op::text,0));u:=recovery_private.actor_v1();
 t:=recovery_private.trip_v1(u,p_trip_id);if t.id is null then return scoped_edit_private.unavailable_v1('stale_basis');end if;
 select * into o from scoped_edit_private.operations_v1 where owner_id=u and operation_id=op;
 if found then
 if o.trip_id<>t.id or o.mutation<>p_input or o.actor_basis is distinct from recovery_private.actor_basis_v1() then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 if o.cancelled then return scoped_edit_private.unavailable_v1('cancelled');end if;
 return o.receipt||'{"reused":true}'::jsonb;
 end if;
 select * into c from scoped_edit_private.contexts_v1 where id=(p_input->'basis'->>'contextId')::uuid and owner_id=u and trip_id=t.id;
 if not found or c.digest<>p_input->'basis'->>'contextDigest' or c.base_version<>(p_input->'basis'->>'baseVersion')::integer or not scoped_edit_private.current_v1(c) then return scoped_edit_private.unavailable_v1('stale_basis');end if;
 insert into scoped_edit_private.operations_v1(owner_id,operation_id,trip_id,mutation,digest,actor_basis,context_id) values(u,op,t.id,p_input,scoped_edit_private.hash_v1(p_input),c.actor_basis,c.id);
 if p_input->>'action'='manual' and p_input->'edit'->>'kind'='reorder_items' and not scoped_edit_private.guard_candidate_v1(c,public.apply_trip_content_patch(c.snapshot,scoped_edit_private.manual_patch_v1(c,p_input->'edit')),true) then raise exception 'PROTECTED_ITEM';end if;
 if p_input->>'action'='manual' then return scoped_edit_private.publish_v1(c,op,scoped_edit_private.manual_patch_v1(c,p_input->'edit'));end if;
 if p_input->>'action'='lock' then
 if not exists(select 1 from public.trip_items where trip_id=t.id and owner_id=u and item_id=p_input->>'itemId') or not(c.input->'scope'->'itemIds' @> jsonb_build_array(p_input->'itemId') or exists(select 1 from public.trip_items where trip_id=t.id and item_id=p_input->>'itemId' and c.input->'scope'->'dayIds' @> jsonb_build_array(day_id))) then raise exception 'INVALID_SCOPE';end if;
 locked:=(p_input->>'locked')::boolean;
 insert into scoped_edit_private.lock_epochs_v1(trip_id,owner_id,revision) values(t.id,u,1) on conflict(trip_id) do update set revision=scoped_edit_private.lock_epochs_v1.revision+1 returning revision into lr;
 insert into scoped_edit_private.locks_v1 values(t.id,u,p_input->>'itemId',locked,lr) on conflict(trip_id,item_id) do update set locked=excluded.locked,revision=excluded.revision;
 r:=jsonb_build_object('kind','scoped_edit_lock/1','operationId',op,'tripId',t.id,'baseVersion',t.head_version,'lockRevision',lr,'itemId',p_input->'itemId','locked',locked,'reused',false);
 else
 -- Admission is deliberately unavailable until exact source/recipient policy is enrolled.
 -- Never reinterpret user text as a manual patch or dispatch a provider here.
 r:=jsonb_build_object('kind','scoped_edit_pending/1','operationId',op,'tripId',t.id,'contextId',c.id,'contextDigest',c.digest,'baseVersion',c.base_version,'reason','provider_unavailable','reused',false);
 end if;
 update scoped_edit_private.operations_v1 set receipt=r where owner_id=u and operation_id=op;return r;
exception when lock_not_available then return scoped_edit_private.unavailable_v1('stale_basis');end $$;

create function public.read_scoped_trip_edit_operation_v1(p_trip_id uuid,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid;t public.trips%rowtype;o scoped_edit_private.operations_v1%rowtype;p public.trip_proposals%rowtype;c scoped_edit_private.contexts_v1%rowtype;s text;v integer;begin
 if p_trip_id is null or p_operation_id is null then raise exception 'INVALID_INPUT';end if;
 u:=recovery_private.actor_v1();t:=recovery_private.trip_v1(u,p_trip_id);if t.id is null then return scoped_edit_private.unavailable_v1('stale_basis');end if;
 select * into o from scoped_edit_private.operations_v1 where owner_id=u and operation_id=p_operation_id and trip_id=t.id;
 if not found or o.actor_basis is distinct from recovery_private.actor_basis_v1() then return jsonb_build_object('kind','scoped_edit_operation/1','operationId',p_operation_id,'tripId',t.id,'mutation',null,'receipt',null,'state','unknown','resultingVersion',null);end if;
 if o.cancelled then s:='cancelled';elsif o.receipt->>'kind'='scoped_edit_declined/1' then s:='declined';else s:='pending';end if;
 if not o.cancelled and o.context_id is not null then select * into c from scoped_edit_private.contexts_v1 where id=o.context_id;
 if not found or c.base_version<>t.head_version then s:='stale';elsif c.expires_at<=clock_timestamp() then s:='expired';elsif not scoped_edit_private.current_v1(c) then s:='stale';end if;end if;
 if o.proposal_id is not null then select * into p from public.trip_proposals where id=o.proposal_id;
 s:=case p.status when 'applied' then 'applied' when 'rejected' then 'rejected' when 'expired' then 'expired' when 'conflicted' then 'stale' else case when p.expires_at<=clock_timestamp() then 'expired' when p.base_trip_version<>t.head_version then 'stale' else s end end;
 if s='applied' then select resulting_version into v from public.trip_events where proposal_id=p.id and event_type='proposal_applied';end if;
 end if;
 return jsonb_build_object('kind','scoped_edit_operation/1','operationId',o.operation_id,'tripId',o.trip_id,'mutation',o.mutation,'receipt',case when o.receipt is null then null else o.receipt||'{"reused":true}'::jsonb end,'state',s,'resultingVersion',v);
end $$;
create function public.abandon_scoped_trip_edit_operation_v1(p_trip_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid;t public.trips%rowtype;o scoped_edit_private.operations_v1%rowtype;op uuid;m jsonb:=p_input->'mutation';begin
 if p_trip_id is null or not recovery_private.exact_v1(p_input,array['action','operationId','mutation']) or p_input->>'action' is distinct from 'abandon' or p_input->'operationId' is distinct from m->'operationId' or not scoped_edit_private.valid_mutation_v1(m) then raise exception 'INVALID_INPUT';end if;
 u:=auth.uid();if u is null or auth.role() is distinct from 'authenticated' then raise exception 'UNAUTHENTICATED';end if;op:=(p_input->>'operationId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('scoped:'||u::text||':'||op::text,0));u:=recovery_private.actor_v1();t:=recovery_private.trip_v1(u,p_trip_id);if t.id is null then return scoped_edit_private.unavailable_v1('stale_basis');end if;
 select * into o from scoped_edit_private.operations_v1 where owner_id=u and operation_id=op;
 if found then if o.trip_id<>t.id or o.mutation<>m or o.actor_basis is distinct from recovery_private.actor_basis_v1() then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 else insert into scoped_edit_private.operations_v1(owner_id,operation_id,trip_id,mutation,digest,actor_basis,context_id,cancelled) values(u,op,t.id,m,scoped_edit_private.hash_v1(m),recovery_private.actor_basis_v1(),null,true) returning * into o;end if;
 return jsonb_build_object('kind','scoped_edit_abandon/1','operationId',op,'tripId',t.id,'state',case when o.cancelled then 'cancelled' else 'committed' end,'receipt',o.receipt);
end $$;

-- No successor/revision may shed the permanent lineage marker.
create function scoped_edit_private.proposal_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_OP='INSERT' then
 if NEW.scoped_edit or exists(select 1 from public.trip_proposals p where p.id=NEW.parent_proposal_id and (p.scoped_edit or exists(select 1 from scoped_edit_private.lineage_v1 where proposal_id=p.id))) then raise exception 'SCOPED_SUCCESSOR_FORBIDDEN';end if;
 else
 if OLD.scoped_edit and (not NEW.scoped_edit or (to_jsonb(NEW)-'status') is distinct from (to_jsonb(OLD)-'status')) then raise exception 'SCOPED_PROPOSAL_IMMUTABLE';end if;
 end if;return NEW;
end $$;
create trigger scoped_proposal_guard before insert or update on public.trip_proposals for each row execute function scoped_edit_private.proposal_guard_v1();
create function scoped_edit_private.prewrite_v1(pid uuid,dig text) returns void language plpgsql security definer set search_path='' as $$declare p public.trip_proposals%rowtype;l scoped_edit_private.lineage_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;o scoped_edit_private.operations_v1%rowtype;n jsonb;actual text;begin
 select * into p from public.trip_proposals where id=pid;
 if not p.scoped_edit and not exists(select 1 from scoped_edit_private.lineage_v1 where proposal_id=pid) then return;end if;
 select * into l from scoped_edit_private.lineage_v1 where proposal_id=pid;
 select * into c from scoped_edit_private.contexts_v1 where id=l.context_id;
 select * into o from scoped_edit_private.operations_v1 where owner_id=l.owner_id and operation_id=l.operation_id;
 select digest into actual from public.read_trip_proposal_v2(pid);
 if c.id is null or o.proposal_id is distinct from pid or o.cancelled or p.owner_id is distinct from auth.uid() or p.owner_id<>c.owner_id or p.trip_id<>c.trip_id
 or p.parent_proposal_id is not null or p.rollback_snapshot_version is not null or p.patch is distinct from l.patch or p.revision<>l.proposal_revision or p.base_trip_version<>l.base_version
 or actual is distinct from dig or actual is distinct from l.proposal_digest or p.expires_at is distinct from c.expires_at or p.status<>'pending' or not scoped_edit_private.current_v1(c) then raise exception 'SCOPED_CONFIRM_GUARD';end if;
 n:=public.apply_trip_content_patch(c.snapshot,l.patch);if not scoped_edit_private.guard_candidate_v1(c,n,false) then raise exception 'SCOPED_CONFIRM_GUARD';end if;
 insert into scoped_edit_private.proofs_v1(transaction_id,proposal_id,owner_id,trip_id,context_id,expected_content,actor_basis,source_basis) values(pg_current_xact_id(),pid,c.owner_id,c.trip_id,c.id,n,c.actor_basis,c.source_basis);
end $$;
create function scoped_edit_private.confirm_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$declare p public.trip_proposals%rowtype;l scoped_edit_private.lineage_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;proof scoped_edit_private.proofs_v1%rowtype;t public.trips%rowtype;src jsonb;dig text;begin
 select * into p from public.trip_proposals where id=NEW.proposal_id;
 if not p.scoped_edit and not exists(select 1 from scoped_edit_private.lineage_v1 where proposal_id=p.id) then return null;end if;
 select * into l from scoped_edit_private.lineage_v1 where proposal_id=p.id;select * into c from scoped_edit_private.contexts_v1 where id=l.context_id;
 select * into proof from scoped_edit_private.proofs_v1 where transaction_id=pg_current_xact_id() and proposal_id=p.id;
 t:=recovery_private.trip_v1(recovery_private.actor_v1(),p.trip_id);select digest into dig from public.read_trip_proposal_v2(p.id);
 src:=scoped_edit_private.source_v1(p.owner_id,p.trip_id,t.head_version,c.input->'reservationBindings');
 if c.id is null or proof.proposal_id is null or t.id is null or p.status<>'applied' or NEW.owner_id is distinct from c.owner_id or NEW.trip_id is distinct from c.trip_id
 or t.head_version<>c.base_version+1 or NEW.resulting_version<>t.head_version or p.patch is distinct from l.patch or p.revision<>l.proposal_revision or dig is distinct from l.proposal_digest
 or c.expires_at<=clock_timestamp() or proof.actor_basis is distinct from recovery_private.actor_basis_v1() or src is distinct from c.source_basis or proof.source_basis is distinct from src
 or public.trip_content_snapshot(t.id,t.title) is distinct from proof.expected_content then raise exception 'SCOPED_CONFIRM_GUARD';end if;
 delete from scoped_edit_private.proofs_v1 where transaction_id=proof.transaction_id and proposal_id=proof.proposal_id;return null;
end $$;
create constraint trigger scoped_confirm_event after insert on public.trip_events deferrable initially deferred for each row execute function scoped_edit_private.confirm_guard_v1();

-- Exact hook + projection-column extension. Removing these changes restores byte-identical body/ACL.
do $hook$declare f record;anchor text:='  update public.trips set title = next_title, head_version = next_version, updated_at = now() where id = trip.id and head_version = proposal.base_trip_version;';hook text:='  PERFORM scoped_edit_private.prewrite_v1(proposal.id,expected_digest);'||chr(10);
 old_insert text:='insert into public.trip_items(trip_id, day_id, owner_id, item_id, title, starts_at, ends_at) select trip.id, day.value->>''id'', trip.owner_id, item.value->>''id'', item.value->>''title'', nullif(item.value->>''startsAt'', '''')::timestamptz, nullif(item.value->>''endsAt'', '''')::timestamptz';new_insert text;changed text;
begin
 select p.prosrc,pg_get_functiondef(p.oid) definition,p.proacl,p.prosecdef into f from pg_proc p where p.oid='public.confirm_and_apply_trip_proposal(uuid,text,text)'::regprocedure;
 if not f.prosecdef or position(hook in f.prosrc)>0 or (length(f.prosrc)-length(replace(f.prosrc,anchor,'')))/length(anchor)<>1 or position(old_insert in f.prosrc)=0 then raise exception 'SCOPED_WRITER_HOOK_DRIFT';end if;
 new_insert:=replace(old_insert,'starts_at, ends_at)','starts_at, ends_at, manual_order)')||', nullif(item.value->>''manualOrder'', '''')::integer';
 changed:=replace(replace(f.definition,anchor,hook||anchor),old_insert,new_insert);
 if replace(replace(changed,hook,''),new_insert,old_insert) is distinct from f.definition then raise exception 'SCOPED_WRITER_HOOK_DRIFT';end if;
 execute changed;
 if (select p.proacl from pg_proc p where p.oid='public.confirm_and_apply_trip_proposal(uuid,text,text)'::regprocedure) is distinct from f.proacl
 or (select replace(replace(p.prosrc,hook,''),new_insert,old_insert) from pg_proc p where p.oid='public.confirm_and_apply_trip_proposal(uuid,text,text)'::regprocedure) is distinct from f.prosrc then raise exception 'SCOPED_WRITER_HOOK_DRIFT';end if;
end $hook$;

create function scoped_edit_private.cleanup_trip_v1() returns trigger language plpgsql security definer set search_path='' as $$begin
 delete from scoped_edit_private.proofs_v1 where trip_id=NEW.trip_id;delete from scoped_edit_private.contexts_v1 where trip_id=NEW.trip_id;
 delete from scoped_edit_private.operations_v1 where trip_id=NEW.trip_id;delete from scoped_edit_private.locks_v1 where trip_id=NEW.trip_id;delete from scoped_edit_private.lock_epochs_v1 where trip_id=NEW.trip_id;return NEW;
end $$;
create trigger scoped_archive_cleanup after insert on public.trip_archives for each row execute function scoped_edit_private.cleanup_trip_v1();
create trigger scoped_delete_cleanup after insert on privacy_private.trip_deletions for each row execute function scoped_edit_private.cleanup_trip_v1();
create function scoped_edit_private.cleanup_expired_v1(p_limit integer default 100) returns integer language plpgsql security definer set search_path='' as $$declare n integer;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
 with dead as(select id from scoped_edit_private.contexts_v1 where expires_at<=clock_timestamp() order by expires_at,id limit p_limit for update skip locked)
 delete from scoped_edit_private.contexts_v1 c using dead where c.id=dead.id;get diagnostics n=ROW_COUNT;return n;
end $$;
create function scoped_edit_private.export_records_v1(u uuid) returns table(record_key text,record jsonb) language sql stable security definer set search_path='' as $$
 with live as(select t.id from public.trips t where t.owner_id=u and not exists(select 1 from public.trip_archives where trip_id=t.id) and not exists(select 1 from privacy_private.trip_deletions where trip_id=t.id))
 select 'context:'||c.id,jsonb_build_object('section','contexts','contextId',c.id,'tripId',c.trip_id,'baseVersion',c.base_version,'scope',c.input->'scope','contextDigest',c.digest,'expiresAt',recovery_private.ms_v1(c.expires_at),'sourceBasis',c.source_basis,'lockedItemIds',c.locked_ids,'fixedItemIds',c.fixed_ids,'historical',true) from scoped_edit_private.contexts_v1 c join live on live.id=c.trip_id where c.owner_id=u
 union all select 'operation:'||o.operation_id,jsonb_build_object('section','operations','operationId',o.operation_id,'tripId',o.trip_id,'contextId',o.context_id,'action',o.mutation->'action','mutationDigest',o.digest,'cancelled',o.cancelled,'proposalId',o.proposal_id,'historical',true) from scoped_edit_private.operations_v1 o join live on live.id=o.trip_id where o.owner_id=u
 union all select 'lock:'||l.trip_id||':'||l.item_id,jsonb_build_object('section','locks','tripId',l.trip_id,'itemId',l.item_id,'locked',l.locked,'revision',l.revision,'historical',true) from scoped_edit_private.locks_v1 l join live on live.id=l.trip_id where l.owner_id=u
 union all select 'lineage:'||l.proposal_id,jsonb_build_object('section','lineage','tripId',l.trip_id,'proposalId',l.proposal_id,'operationId',l.operation_id,'contextId',l.context_id,'proposalDigest',l.proposal_digest,'proposalRevision',l.proposal_revision,'baseVersion',l.base_version,'historical',true) from scoped_edit_private.lineage_v1 l join live on live.id=l.trip_id where l.owner_id=u
$$;
create function scoped_edit_private.export_metadata_v1(p_request_id uuid,p_lease_id uuid,p_generation integer,p_after_record_key text default null,p_limit integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$declare j export_private.core_jobs_v1%rowtype;items jsonb;more boolean;cursor text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if p_request_id is null or p_lease_id is null or p_generation is null or p_generation not between 1 and 3 or p_limit is null or p_limit not between 1 and 100 or p_after_record_key is not null and char_length(p_after_record_key)>150 then raise exception 'INVALID_INPUT';end if;
 j:=export_private.lock_job_v1(p_request_id,true);if j.request_id is null or export_private.live_lease_v1(j,p_lease_id,p_generation) is distinct from true then return jsonb_build_object('kind','unavailable');end if;
 if p_after_record_key is not null and not exists(select 1 from scoped_edit_private.export_records_v1(j.owner_id) where record_key=p_after_record_key) then raise exception 'INVALID_EXPORT_CURSOR';end if;
 with candidates as(select * from scoped_edit_private.export_records_v1(j.owner_id) where p_after_record_key is null or record_key>p_after_record_key order by record_key limit p_limit+1),delivered as(select * from candidates order by record_key limit p_limit)
 select coalesce((select jsonb_agg(record order by record_key) from delivered),'[]'),(select count(*)>p_limit from candidates),(select record_key from delivered order by record_key desc limit 1) into items,more,cursor;
 return jsonb_build_object('schemaVersion','scoped-edit-export/1','items',items,'hasMore',more,'nextCursor',case when more then cursor else null end,'sectionComplete',not more,'enrolled',false,'inventoryStatus','partial');
end $$;

-- Original work queue extension; settings are private, empty and default disabled.
alter table turn_private.work drop constraint work_execution_mode_check;
alter table turn_private.work add constraint work_execution_mode_check check(execution_mode in('text','planning_comparison_v1','planning_intake_comparison_v2','scoped_trip_edit_v1'));
create table scoped_edit_private.worker_settings_v1(
 policy_id uuid primary key references turn_private.text_policies(id),planning_policy_id uuid not null references turn_private.planning_policies(id),
 enabled boolean not null default false,notice_hash text not null,scope_id uuid not null references public.model_budget_scopes(id),
 model text not null check(model='qwen3.7-plus-2026-05-26'),price_version text not null,reserved_micros bigint not null check(reserved_micros between 1 and 2147483647),
 timeout_ms integer not null check(timeout_ms between 1000 and 60000),max_output_tokens integer not null check(max_output_tokens between 1 and 4096),
 allow_profile boolean not null default false,allow_memory boolean not null default false,
 configuration_id uuid not null,configuration_version integer not null check(configuration_version>0),source_use text not null check(source_use='scoped_trip_edit_v1'),expires_at timestamptz not null
);
create table scoped_edit_private.work_v1(
 turn_id uuid primary key references turn_private.work(turn_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,trip_id uuid not null references public.trips(id) on delete cascade,
 task_id uuid not null references turn_private.service_tasks(id) on delete cascade,operation_id uuid not null,
 context_id uuid not null,policy_id uuid not null references scoped_edit_private.worker_settings_v1(policy_id),scope_id uuid not null,
 attempt_id uuid not null unique default gen_random_uuid(),binding jsonb,output jsonb,usage jsonb,actual_micros bigint,
 paused_reason text,completion jsonb,
 foreign key(owner_id,operation_id) references scoped_edit_private.operations_v1(owner_id,operation_id) on delete cascade,
 check((output is null)=(usage is null)),check((output is null)=(actual_micros is null))
);
create index scoped_work_trip on scoped_edit_private.work_v1(trip_id);
create table scoped_edit_private.requests_v1(
 turn_id uuid primary key references scoped_edit_private.work_v1(turn_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,trip_id uuid not null references public.trips(id) on delete cascade,
 binding jsonb not null,request_id text not null,request_digest text not null,payload_digest text not null,
 -- Only the canonical request digest is retained; no provider/user raw payload copy.
 destination jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index scoped_request_trip on scoped_edit_private.requests_v1(trip_id);
alter table scoped_edit_private.worker_settings_v1 enable row level security;
alter table scoped_edit_private.work_v1 enable row level security;
alter table scoped_edit_private.requests_v1 enable row level security;
revoke all on scoped_edit_private.worker_settings_v1,scoped_edit_private.work_v1,scoped_edit_private.requests_v1 from public,anon,authenticated,service_role;

create function scoped_edit_private.worker_policy_v1(u uuid,pid uuid,sid uuid) returns boolean language plpgsql security definer set search_path='' as $$declare cfg scoped_edit_private.worker_settings_v1%rowtype;tp turn_private.text_policies%rowtype;pp turn_private.planning_policies%rowtype;begin
 select * into cfg from scoped_edit_private.worker_settings_v1 where policy_id=pid for share;
 select * into tp from turn_private.text_policies where id=pid for share;
 select * into pp from turn_private.planning_policies where id=cfg.planning_policy_id for share;
 if not exists(select 1 from turn_private.hosted_worker_control where singleton and enabled) or cfg.policy_id is null or not cfg.enabled or cfg.scope_id<>sid or cfg.expires_at<=clock_timestamp() or cfg.notice_hash is distinct from pp.notice_hash
 or pp.text_policy_id is distinct from tp.id or pp.revoked_at is not null or pp.effective_at>clock_timestamp() or pp.expires_at<=clock_timestamp()
 or not turn_private.text_policy_current(pid) or tp.provider<>'qwen' or tp.context_mode<>'current_input_v1'
 or not(tp.endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' or tp.endpoint ~ '^https://[a-z0-9][a-z0-9-]*[.]cn-beijing[.]maas[.]aliyuncs[.]com/compatible-mode/v1/chat/completions$')
 or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=pid and revoked_at is null)
 or not exists(select 1 from turn_private.planning_consents where owner_id=u and policy_id=pp.id and revoked_at is null)
 or not exists(select 1 from public.model_budget_scopes where id=sid and owner_id=u and enabled and not frozen and expires_at>clock_timestamp())
 or not exists(select 1 from public.model_budget_provider_limits where scope_id=sid and provider='qwen' and model=cfg.model and price_version=cfg.price_version and enabled)
 then return false;end if;
 -- Explicit gate for source egress. Existing current-input consent alone is insufficient.
 if not cfg.allow_profile and exists(select 1 from public.user_profiles where owner_id=u and pace_state='explicit') then return false;end if;
 if not cfg.allow_memory and exists(select 1 from public.memory_profiles where owner_id=u and state in('explicit','confirmed') and summary is not null) then return false;end if;
 return true;
end $$;
create function scoped_edit_private.service_current_v1(c scoped_edit_private.contexts_v1) returns boolean language plpgsql security definer set search_path='' as $$declare actor jsonb;src jsonb;t public.trips%rowtype;sid uuid;begin
 if auth.role() is distinct from 'service_role' then return false;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=c.owner_id for update;
 sid:=(c.actor_basis->>'sessionId')::uuid;
 perform 1 from auth.sessions where id=sid and user_id=c.owner_id for key share;if not found then return false;end if;
 select jsonb_build_object('ownerId',s.user_id,'sessionId',s.id,'sessionCreatedAt',s.created_at,'epoch',a.epoch,'mobileSessionId',a.session_id) into actor from auth.sessions s join identity_private.mobile_accounts a on a.owner_id=s.user_id where s.id=sid and s.user_id=c.owner_id;
 if actor is distinct from c.actor_basis or exists(select 1 from identity_private.mobile_attempts where session_id=sid) and actor->>'mobileSessionId' is distinct from sid::text then return false;end if;
 select * into t from public.trips where id=c.trip_id and owner_id=c.owner_id for update;
 if not found or t.head_version<>c.base_version or c.expires_at<=clock_timestamp() or exists(select 1 from public.trip_archives where trip_id=t.id) or exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) or public.trip_content_snapshot(t.id,t.title) is distinct from c.snapshot then return false;end if;
 -- The original reservations reader is user-only. Read already-qualified exact rows
 -- under share locks here, and seal the same record fingerprint without adopting JWTs.
 src:=scoped_edit_private.worker_source_v1(c);
 return src is not null and src=c.source_basis;
end $$;
create function scoped_edit_private.worker_source_v1(c scoped_edit_private.contexts_v1) returns jsonb language plpgsql security definer set search_path='' as $$declare orders jsonb;memory jsonb;profile jsonb;raw jsonb;bindings jsonb:=c.source_basis->'fixedBindings';lr bigint;begin
 if to_regclass('reservation_private.current_v1') is null then return null;end if;
 perform 1 from reservation_private.current_v1 where owner_id=c.owner_id and trip_id=c.trip_id for share;
 select coalesce(jsonb_agg(jsonb_build_object('referenceId',reference_id,'revision',revision,'contentDigest',content_digest,'status',fields->'status','evidenceTier','user_reported') order by reference_id),'[]') into orders from reservation_private.current_v1 where owner_id=c.owner_id and trip_id=c.trip_id;
 if exists(select 1 from reservation_private.current_v1 r where r.owner_id=c.owner_id and r.trip_id=c.trip_id and (r.fields->>'status'='unknown' or r.fields->>'status' in('reserved','amended') and not exists(select 1 from jsonb_array_elements(bindings)b where b->>'referenceId'=r.reference_id::text and b->'referenceRevision'=to_jsonb(r.revision)))) then return null;end if;
 profile:=recovery_private.profile_v1(c.owner_id);memory:=scoped_edit_private.memory_basis_v1(c.owner_id);
 select revision into lr from scoped_edit_private.lock_epochs_v1 where trip_id=c.trip_id for share;
 raw:=jsonb_build_object('profile',profile,'memory',memory,'reservations',orders,'fixedBindings',bindings,'lockRevision',coalesce(lr,0));
 return jsonb_build_object('profileUpdatedAt',profile->'updatedAt','memoryBasisDigest',scoped_edit_private.hash_v1(memory),'reservationBasisDigest',scoped_edit_private.hash_v1(orders),'sourceDigest',scoped_edit_private.hash_v1(raw),'lockRevision',coalesce(lr,0),'fixedBindings',bindings);
end $$;
create function scoped_edit_private.enqueue_v1(c scoped_edit_private.contexts_v1,op uuid) returns boolean language plpgsql security definer set search_path='' as $$declare cfg scoped_edit_private.worker_settings_v1%rowtype;new_turn_id uuid:=gen_random_uuid();task_id uuid:=gen_random_uuid();thread_id uuid:=gen_random_uuid();o scoped_edit_private.operations_v1%rowtype;r jsonb;begin
 select * into o from scoped_edit_private.operations_v1 where owner_id=c.owner_id and operation_id=op;
 select * into cfg from scoped_edit_private.worker_settings_v1 where scoped_edit_private.worker_policy_v1(c.owner_id,policy_id,scope_id) order by policy_id limit 1;
 if not found then return false;end if;
 -- Source TTL is bounded by all enrolled policy deadlines, not just context expiry.
 if c.expires_at>least(cfg.expires_at,(select least(expires_at,terms_recheck_at) from turn_private.text_policies where id=cfg.policy_id),(select expires_at from turn_private.planning_policies where id=cfg.planning_policy_id)) then return false;end if;
 r:=public.submit_service_task_turn(thread_id,new_turn_id,op,cfg.policy_id,c.input->>'locale',o.mutation->>'text',task_id,1,'new_goal',null);
 if r->>'kind' is distinct from 'accepted' then return false;end if;
 update turn_private.work set execution_mode='scoped_trip_edit_v1' where turn_private.work.turn_id=new_turn_id;
 insert into scoped_edit_private.work_v1(turn_id,owner_id,trip_id,task_id,operation_id,context_id,policy_id,scope_id) values(new_turn_id,c.owner_id,c.trip_id,task_id,op,c.id,cfg.policy_id,cfg.scope_id);
 return true;
end $$;
-- Replace the default pending admission with original ServiceTask admission when qualified.
do $$declare f text;begin f:=pg_get_functiondef('public.submit_scoped_trip_edit_v1(uuid,jsonb)'::regprocedure);
 f:=replace(f,'''reason'',''provider_unavailable'',''reused'',false);','''reason'',case when scoped_edit_private.enqueue_v1(c,op) then ''queued'' else ''provider_unavailable'' end,''reused'',false);');execute f;end $$;

create function public.hosted_scoped_trip_edit_target_v1(p_owner_id uuid,p_policy_id uuid,p_scope_id uuid,p_price_version text,p_reserved_micros bigint) returns jsonb language plpgsql security definer set search_path='' as $$declare cfg scoped_edit_private.worker_settings_v1%rowtype;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into cfg from scoped_edit_private.worker_settings_v1 where policy_id=p_policy_id;
 if cfg.policy_id is null or cfg.price_version is distinct from p_price_version or cfg.reserved_micros is distinct from p_reserved_micros or not scoped_edit_private.worker_policy_v1(p_owner_id,p_policy_id,p_scope_id) then return jsonb_build_object('kind','pending');end if;
 if exists(select 1 from scoped_edit_private.work_v1 j join turn_private.work w using(turn_id) where j.owner_id=p_owner_id and j.policy_id=p_policy_id and j.scope_id=p_scope_id and j.paused_reason is null and (w.state='queued' or w.state='leased' and w.expires_at<=clock_timestamp())) then return jsonb_build_object('kind','ready');end if;
 return jsonb_build_object('kind','idle');
end $$;
create function public.claim_scoped_trip_edit_work_v1(p_owner_id uuid,p_policy_id uuid,p_scope_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare w turn_private.work%rowtype;j scoped_edit_private.work_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;cfg scoped_edit_private.worker_settings_v1%rowtype;b jsonb;begin
 if auth.role() is distinct from 'service_role' or p_owner_id is null or p_policy_id is null or p_scope_id is null then raise exception 'FORBIDDEN';end if;
 if not scoped_edit_private.worker_policy_v1(p_owner_id,p_policy_id,p_scope_id) then return jsonb_build_object('kind','pending');end if;
 for j in select * from scoped_edit_private.work_v1 where owner_id=p_owner_id and policy_id=p_policy_id and scope_id=p_scope_id and paused_reason is null order by turn_id loop
 select * into c from scoped_edit_private.contexts_v1 where id=j.context_id;if not found or not scoped_edit_private.service_current_v1(c) then continue;end if;
 if not turn_private.lock_turn(j.turn_id,j.owner_id,(c.actor_basis->>'sessionId')::uuid) then continue;end if;
 select * into w from turn_private.work where turn_id=j.turn_id and execution_mode='scoped_trip_edit_v1' and (state='queued' or state='leased' and expires_at<=clock_timestamp()) for update skip locked;
 if not found or w.attempt>=w.max_attempts then continue;end if;
 select * into cfg from scoped_edit_private.worker_settings_v1 where policy_id=j.policy_id;
 update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=least(clock_timestamp()+lease_ms*interval '1 millisecond',c.expires_at) where turn_id=w.turn_id returning * into w;
 b:=jsonb_build_object('ownerId',j.owner_id,'taskId',j.task_id,'turnId',j.turn_id,'leaseToken',w.lease_token,'operationId',j.operation_id,'contextId',c.id,'contextDigest',c.digest,'sourceDigest',c.source_basis->'sourceDigest','tripId',c.trip_id,'baseVersion',c.base_version,'policyId',j.policy_id,'scopeId',j.scope_id,'attemptId',j.attempt_id,'provider','qwen','model',cfg.model,'priceVersion',cfg.price_version);
 update scoped_edit_private.work_v1 set binding=b,completion=case when completion is null then null else completion||jsonb_build_object('binding',b) end where turn_id=j.turn_id;
 return jsonb_build_object('kind','leased','ownerId',j.owner_id,'turnId',j.turn_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
 end loop;return jsonb_build_object('kind','idle');
end $$;
create function scoped_edit_private.work_current_v1(b jsonb) returns boolean language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;begin
 if auth.role() is distinct from 'service_role' or not recovery_private.uuid_v1(b->'turnId') then return false;end if;
 select * into j from scoped_edit_private.work_v1 where turn_id=(b->>'turnId')::uuid;
 if not found or j.binding is distinct from b or j.paused_reason is not null or not scoped_edit_private.worker_policy_v1(j.owner_id,j.policy_id,j.scope_id) then return false;end if;
 select * into c from scoped_edit_private.contexts_v1 where id=j.context_id;
 if not found or not scoped_edit_private.service_current_v1(c) or not turn_private.lock_text_work(j.turn_id,(b->>'leaseToken')::uuid) then return false;end if;
 if not exists(select 1 from turn_private.work where turn_id=j.turn_id and execution_mode='scoped_trip_edit_v1') or not exists(select 1 from turn_private.service_tasks where id=j.task_id and owner_id=j.owner_id and policy_id=j.policy_id and last_turn_id=j.turn_id)
 or not exists(select 1 from scoped_edit_private.operations_v1 where owner_id=j.owner_id and operation_id=j.operation_id and not cancelled and proposal_id is null) then return false;end if;return true;
end $$;
create function public.read_scoped_trip_edit_work_v1(p_turn_id uuid,p_lease_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;cfg scoped_edit_private.worker_settings_v1%rowtype;tp turn_private.text_policies%rowtype;profile jsonb;mem jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where turn_id=p_turn_id;
 if j.binding->>'leaseToken' is distinct from p_lease_token::text or not scoped_edit_private.work_current_v1(j.binding) then return jsonb_build_object('kind','pending');end if;
 select * into c from scoped_edit_private.contexts_v1 where id=j.context_id;select * into cfg from scoped_edit_private.worker_settings_v1 where policy_id=j.policy_id;select * into tp from turn_private.text_policies where id=j.policy_id;
 select jsonb_build_object('travelPace',travel_pace,'revision',pace_revision) into profile from public.user_profiles where owner_id=j.owner_id and pace_state='explicit' and pace_notice='local-planning-cross-trip-v1' and cfg.allow_profile;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'revision',p.revision,'summary',p.summary,'constraintKind',p.constraint_kind) order by p.id),'[]') into mem from public.memory_profiles p join public.memory_consents mc on mc.id=p.consent_id and mc.owner_id=p.owner_id and mc.status='granted' where p.owner_id=j.owner_id and p.state in('explicit','confirmed') and p.summary is not null and cfg.allow_memory;
 if jsonb_array_length(mem)>64 then return jsonb_build_object('kind','pending');end if;
 return jsonb_build_object('kind','scoped_edit_input/1','binding',j.binding,'context',scoped_edit_private.context_wire_v1(c),'text',(select input_text from turn_private.text_content where turn_id=j.turn_id),'locale',c.input->'locale','profile',profile,'memory',mem,'endpoint',tp.endpoint,'reservedMicros',cfg.reserved_micros,'timeoutMs',cfg.timeout_ms,'maxOutputTokens',cfg.max_output_tokens);
end $$;
create function public.authorize_scoped_trip_edit_effect_v1(p_binding jsonb,p_effect text) returns jsonb language plpgsql security definer set search_path='' as $$declare a public.model_budget_attempts%rowtype;begin
 if p_effect not in('reserve','dispatch','publish') or not scoped_edit_private.work_current_v1(p_binding) then return jsonb_build_object('kind','pending');end if;
 select * into a from public.model_budget_attempts where scope_id=(p_binding->>'scopeId')::uuid and attempt_id=(p_binding->>'attemptId')::uuid;
 if found and (a.task_id<>(p_binding->>'taskId')::uuid or a.provider<>p_binding->>'provider' or a.model<>p_binding->>'model' or a.price_version<>p_binding->>'priceVersion') then return jsonb_build_object('kind','pending');end if;
 if p_effect='reserve' and a.status is not null and a.status<>'reserved' or p_effect='dispatch' and coalesce(a.status,'') not in('reserved','dispatched') or p_effect='publish' and (a.status is distinct from 'settled' or not exists(select 1 from scoped_edit_private.work_v1 where binding=p_binding and output is not null and actual_micros=a.actual_micros)) then return jsonb_build_object('kind','pending');end if;
 return jsonb_build_object('kind','authorized','effect',p_effect,'binding',p_binding);
end $$;
create function public.scoped_trip_edit_budget_v1(p_binding jsonb,p_effect text,p_reserved_micros bigint,p_actual_micros bigint,p_outcome text) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;cfg scoped_edit_private.worker_settings_v1%rowtype;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding;
 if not found then return jsonb_build_object('kind','blocked');end if;
 select * into cfg from scoped_edit_private.worker_settings_v1 where policy_id=j.policy_id;
 if p_effect='finish' then
 -- Accounting must close for the bound attempt even after source revocation.
 if p_outcome='settle' and (j.known_usage is null or j.known_actual_micros is distinct from p_actual_micros) then return jsonb_build_object('kind','blocked');end if;
 return public.finish_model_budget(j.scope_id,j.owner_id,j.attempt_id,p_outcome,p_actual_micros);
 end if;
 if public.authorize_scoped_trip_edit_effect_v1(p_binding,p_effect)->>'kind' is distinct from 'authorized' then return jsonb_build_object('kind','blocked');end if;
 if p_effect='reserve' and p_reserved_micros=cfg.reserved_micros then return public.reserve_model_budget(j.scope_id,j.owner_id,j.task_id,j.attempt_id,'qwen',cfg.model,cfg.price_version,p_reserved_micros);end if;
 if p_effect='dispatch' then return public.dispatch_model_budget(j.scope_id,j.owner_id,j.attempt_id);end if;
 return jsonb_build_object('kind','blocked');
end $$;
create function scoped_edit_private.valid_candidate_edit_v1(e jsonb) returns boolean language plpgsql immutable set search_path='' as $$begin
 if e->>'kind' in('move_item','set_time','reorder_items') then return scoped_edit_private.valid_mutation_v1(jsonb_build_object('action','manual','operationId','10000000-0000-0000-0000-000000000000','basis',jsonb_build_object('contextId','10000000-0000-0000-0000-000000000000','contextDigest',repeat('a',64),'baseVersion',0),'edit',e));end if;
 if e->>'kind'='remove_item' then return recovery_private.exact_v1(e,array['kind','itemId']) and jsonb_typeof(e->'itemId')='string' and e->>'itemId' ~ '^[A-Za-z0-9_-]{1,64}$';end if;
 if e->>'kind'='replace_item' then return recovery_private.exact_v1(e,array['kind','itemId','sourceItemId']) and jsonb_typeof(e->'itemId')='string' and e->>'itemId' ~ '^[A-Za-z0-9_-]{1,64}$' and jsonb_typeof(e->'sourceItemId')='string' and e->>'sourceItemId' ~ '^[A-Za-z0-9_-]{1,64}$';end if;
 return coalesce(e->>'kind'='add_item' and recovery_private.exact_v1(e,array['kind','sourceItemId','toDayId']) and jsonb_typeof(e->'sourceItemId')='string' and e->>'sourceItemId' ~ '^[A-Za-z0-9_-]{1,64}$' and jsonb_typeof(e->'toDayId')='string' and e->>'toDayId' ~ '^[A-Za-z0-9_-]{1,64}$',false);
end $$;
create function scoped_edit_private.candidate_patch_v1(c scoped_edit_private.contexts_v1,ask_op uuid,cid uuid,edits jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare step scoped_edit_private.contexts_v1:=c;e jsonb;i jsonb;src jsonb;ops jsonb:='[]';patch jsonb;n jsonb;new_id text;idx integer:=0;original_ids jsonb;begin
 if jsonb_typeof(edits) is distinct from 'array' or jsonb_array_length(edits) not between 1 and 16 then raise exception 'INVALID_CANDIDATE';end if;
 select coalesce(jsonb_agg(ii->'id'),'[]') into original_ids from jsonb_array_elements(c.snapshot->'days')dd,jsonb_array_elements(dd->'items')ii where c.input->'scope'->'dayIds' @> jsonb_build_array(dd->'id') or c.input->'scope'->'itemIds' @> jsonb_build_array(ii->'id');
 for e in select value from jsonb_array_elements(edits) loop
 if not scoped_edit_private.valid_candidate_edit_v1(e) then raise exception 'INVALID_CANDIDATE';end if;
 -- Per-step selection contains surviving ORIGINAL IDs only. New IDs grant no authority.
 step.input:=jsonb_set(step.input,'{scope}',jsonb_build_object('dayIds','[]'::jsonb,'itemIds',(select coalesce(jsonb_agg(ii->'id'),'[]') from jsonb_array_elements(step.snapshot->'days')dd,jsonb_array_elements(dd->'items')ii where original_ids @> jsonb_build_array(ii->'id'))));
 if e->>'kind' in('move_item','set_time','reorder_items') then patch:=scoped_edit_private.manual_patch_v1(step,e);
 else
 select ii into i from jsonb_array_elements(step.snapshot->'days')dd,jsonb_array_elements(dd->'items')ii where ii->>'id'=e->>'itemId';
 if e->>'kind' in('remove_item','replace_item') and (i is null or not(original_ids @> jsonb_build_array(i->'id')) or c.locked_ids @> jsonb_build_array(i->'id') or c.fixed_ids @> jsonb_build_array(i->'id')) then raise exception 'PROTECTED_ITEM';end if;
 if e->>'kind'='remove_item' then patch:=jsonb_build_object('expectedVersion',c.base_version,'operations',jsonb_build_array(jsonb_build_object('kind','delete_item','itemId',i->'id','dayId',i->'dayId')));
 else
 select ii into src from jsonb_array_elements(c.snapshot->'days')dd,jsonb_array_elements(dd->'items')ii where ii->>'id'=e->>'sourceItemId';if not found then raise exception 'INVALID_SOURCE_ITEM';end if;
 if e->>'kind'='replace_item' then
 if i->'title'=src->'title' then raise exception 'NO_CHANGE';end if;
 patch:=jsonb_build_object('expectedVersion',c.base_version,'operations',jsonb_build_array(jsonb_build_object('kind','upsert_item','itemId',i->'id','dayId',i->'dayId','title',src->'title')||(i-array['id','dayId','title','manualOrder'])));
 else
 if not (c.input->'scope'->'dayIds' @> jsonb_build_array(e->'toDayId')) then raise exception 'ADD_OUTSIDE_SCOPE';end if;
 new_id:='edit-'||substr(encode(sha256(convert_to('["scoped-trip-edit-item/1","'||c.id::text||'","'||ask_op::text||'","'||cid::text||'",'||idx::text||']','UTF8')),'hex'),1,32);
 if exists(select 1 from jsonb_array_elements(step.snapshot->'days')dd,jsonb_array_elements(dd->'items')ii where ii->>'id'=new_id) then raise exception 'ID_CONFLICT';end if;
 patch:=jsonb_build_object('expectedVersion',c.base_version,'operations',jsonb_build_array(jsonb_build_object('kind','upsert_item','itemId',new_id,'dayId',e->'toDayId','title',src->'title')));
 end if;end if;end if;
 n:=public.apply_trip_content_patch(step.snapshot,patch);
 if e->>'kind'='reorder_items' and not scoped_edit_private.guard_candidate_v1(step,n,true) then raise exception 'PROTECTED_ITEM';end if;
 if not scoped_edit_private.guard_candidate_v1(c,n,false) then raise exception 'PROTECTED_ITEM';end if;
 ops:=ops||(patch->'operations');step.snapshot:=n;idx:=idx+1;
 end loop;
 patch:=jsonb_build_object('expectedVersion',c.base_version,'operations',ops);
 if public.apply_trip_content_patch(c.snapshot,patch) is distinct from step.snapshot or step.snapshot=c.snapshot then raise exception 'INVALID_CANDIDATE';end if;
 return patch;
end $$;

create function public.record_scoped_trip_edit_output_v1(p_binding jsonb,p_output jsonb,p_usage jsonb,p_actual_micros bigint) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;e jsonb;begin
 if not scoped_edit_private.work_current_v1(p_binding) then return jsonb_build_object('kind','pending');end if;
 if not scoped_edit_private.valid_usage_v1(p_usage) or p_actual_micros is null or p_actual_micros not between 0 and 1000000000000 or not recovery_private.exact_v1(p_usage,array['inputTokens','outputTokens','totalTokens','cachedInputTokens','uncachedInputTokens','reasoningTokens','cost']) or p_usage->>'cost' is distinct from 'unknown' or coalesce(p_usage->>'inputTokens','') !~ '^[0-9]{1,7}$' or coalesce(p_usage->>'outputTokens','') !~ '^[0-9]{1,4}$' or coalesce(p_usage->>'totalTokens','') !~ '^[0-9]{1,7}$' or (p_usage->>'inputTokens')::integer+(p_usage->>'outputTokens')::integer<>(p_usage->>'totalTokens')::integer or (p_usage->>'outputTokens')::integer>4096 then raise exception 'INVALID_OUTPUT';end if;
 if p_output->>'kind'='candidate' then
 if not recovery_private.exact_v1(p_output,array['kind','edits']) or jsonb_typeof(p_output->'edits') is distinct from 'array' or jsonb_array_length(p_output->'edits') not between 1 and 16 then raise exception 'INVALID_OUTPUT';end if;
 for e in select value from jsonb_array_elements(p_output->'edits') loop
 if not scoped_edit_private.valid_candidate_edit_v1(e) then raise exception 'INVALID_OUTPUT';end if;end loop;
 elsif not recovery_private.exact_v1(p_output,array['kind','reason']) or p_output->>'kind' is distinct from 'cannot_edit' or p_output->>'reason' not in('unsupported_request','no_change') then raise exception 'INVALID_OUTPUT';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding for update;
 if j.known_outcome is not null and j.known_outcome<>'protocol_validated' then raise exception 'INVALID_OUTPUT';end if;
 if j.output is not null then if j.output<>p_output or j.usage<>p_usage or j.actual_micros<>p_actual_micros then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 else
 if not exists(select 1 from public.model_budget_attempts where scope_id=j.scope_id and attempt_id=j.attempt_id and task_id=j.task_id and status='dispatched') then return jsonb_build_object('kind','pending');end if;
 perform public.record_scoped_trip_edit_usage_v1(p_binding,p_usage,p_actual_micros);
 update scoped_edit_private.work_v1 set output=p_output,usage=p_usage,actual_micros=p_actual_micros where turn_id=j.turn_id;
 end if;
 return public.read_scoped_trip_edit_output_v1(p_binding);
end $$;
create function public.read_scoped_trip_edit_output_v1(p_binding jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;a public.model_budget_attempts%rowtype;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding;
 if not found then return jsonb_build_object('kind','pending');end if;
 if j.output is null then
 if exists(select 1 from public.model_budget_attempts where scope_id=j.scope_id and attempt_id=j.attempt_id and status in('dispatched','pending','settled')) then return jsonb_build_object('kind','pending');end if;
 return jsonb_build_object('kind','missing');end if;
 select * into a from public.model_budget_attempts where scope_id=j.scope_id and attempt_id=j.attempt_id and task_id=j.task_id;
 return jsonb_build_object('kind','saved_output','binding',p_binding,'output',j.output,'usage',j.usage,'actualMicros',j.actual_micros,'accounting',case when a.status='settled' and a.actual_micros=j.actual_micros then 'settled' else 'pending' end);
end $$;
create function public.pause_scoped_trip_edit_work_v1(p_binding jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;begin
 if auth.role() is distinct from 'service_role' or p_reason not in('unsupported_request','no_change','provider_unavailable','accounting_unknown','stale_basis') then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding for update;if not found then return jsonb_build_object('kind','pending');end if;
 update scoped_edit_private.work_v1 set paused_reason=p_reason where turn_id=j.turn_id;
 update turn_private.work set state='quarantined',lease_token=null,expires_at=null where turn_id=j.turn_id and lease_token=(p_binding->>'leaseToken')::uuid;
 return jsonb_build_object('kind','pending');
end $$;

alter table scoped_edit_private.work_v1 add column candidate_id uuid unique;
alter table scoped_edit_private.work_v1 add column candidate_patch jsonb;
create function public.complete_scoped_trip_edit_work_v1(p_binding jsonb,p_patch jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;step scoped_edit_private.contexts_v1%rowtype;e jsonb;patch jsonb;derived jsonb;ops jsonb:='[]';n jsonb;r jsonb;cid uuid;begin
 if public.authorize_scoped_trip_edit_effect_v1(p_binding,'publish')->>'kind' is distinct from 'authorized' then return jsonb_build_object('kind','pending');end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding for update;
 if j.completion is not null then return j.completion||jsonb_build_object('binding',p_binding);end if;
 if j.output->>'kind' is distinct from 'candidate' then return jsonb_build_object('kind','pending');end if;
 select * into c from scoped_edit_private.contexts_v1 where id=j.context_id;
 derived:=scoped_edit_private.candidate_patch_v1(c,j.operation_id,j.attempt_id,j.output->'edits');
 if p_patch is distinct from derived then raise exception 'INVALID_CANDIDATE';end if;
 step:=c;step.snapshot:=public.apply_trip_content_patch(c.snapshot,derived);
 cid:=j.attempt_id;r:=jsonb_build_object('kind','scoped_edit_candidates/1','operationId',j.operation_id,'tripId',j.trip_id,'contextId',c.id,'contextDigest',c.digest,'baseVersion',c.base_version,'expiresAt',recovery_private.ms_v1(c.expires_at),'returnScope',c.input->'scope','candidates',jsonb_build_array(jsonb_build_object('candidateId',cid,'edits',j.output->'edits','diff',scoped_edit_private.diff_v1(c,step.snapshot))),'reused',false);
 update scoped_edit_private.operations_v1 set receipt=r where owner_id=j.owner_id and operation_id=j.operation_id;
 update scoped_edit_private.work_v1 set candidate_id=cid,candidate_patch=derived,completion=jsonb_build_object('kind','candidate_saved','binding',p_binding,'receipt',r) where turn_id=j.turn_id;
 -- Original generation terminal is independent from the user's later Trip confirmation.
 perform turn_private.terminal(j.turn_id,'completed',(select attempt from turn_private.work where turn_id=j.turn_id));
 return jsonb_build_object('kind','candidate_saved','binding',p_binding,'receipt',r);
end $$;
create function public.read_scoped_trip_edit_completion_v1(p_binding jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;o scoped_edit_private.operations_v1%rowtype;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding;if not found then return jsonb_build_object('kind','pending');end if;
 select * into c from scoped_edit_private.contexts_v1 where id=j.context_id;
 if not found or not scoped_edit_private.service_current_v1(c) or not scoped_edit_private.worker_policy_v1(j.owner_id,j.policy_id,j.scope_id) then return jsonb_build_object('kind','pending');end if;
 select * into o from scoped_edit_private.operations_v1 where owner_id=j.owner_id and operation_id=j.operation_id;
 if o.receipt->>'kind'='scoped_edit_declined/1' then return jsonb_build_object('kind','declined','binding',p_binding,'receipt',o.receipt||'{"reused":true}'::jsonb);end if;
 if j.completion is null then return jsonb_build_object('kind','missing');end if;
 return j.completion||jsonb_build_object('binding',p_binding,'receipt',(j.completion->'receipt')||'{"reused":true}'::jsonb);
end $$;
create function scoped_edit_private.select_v1(c scoped_edit_private.contexts_v1,op uuid,m jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;o scoped_edit_private.operations_v1%rowtype;a public.model_budget_attempts%rowtype;begin
 select * into o from scoped_edit_private.operations_v1 where owner_id=c.owner_id and operation_id=(m->>'askOperationId')::uuid and trip_id=c.trip_id and context_id=c.id;
 if not found or o.cancelled or o.mutation->>'action'<>'ask' or o.actor_basis<>c.actor_basis then raise exception 'INVALID_CANDIDATE';end if;
 select * into j from scoped_edit_private.work_v1 where owner_id=c.owner_id and operation_id=o.operation_id and context_id=c.id and candidate_id=(m->>'candidateId')::uuid for update;
 if not found or j.completion is null or j.candidate_patch is null then raise exception 'INVALID_CANDIDATE';end if;
 select * into a from public.model_budget_attempts where scope_id=j.scope_id and attempt_id=j.attempt_id and task_id=j.task_id;
 if a.status is distinct from 'settled' or a.actual_micros is distinct from j.actual_micros then raise exception 'INVALID_CANDIDATE';end if;
 if exists(select 1 from scoped_edit_private.operations_v1 other where other.owner_id=c.owner_id and other.mutation->>'action'='select_candidate' and other.mutation->>'askOperationId'=o.operation_id::text and other.proposal_id is not null) then raise exception 'CANDIDATE_ALREADY_SELECTED';end if;
 return scoped_edit_private.publish_v1(c,op,j.candidate_patch);
end $$;
do $$declare f text;begin
 f:=pg_get_functiondef('scoped_edit_private.valid_mutation_v1(jsonb)'::regprocedure);
 f:=replace(f,' if v->>''action''=''ask'' then',' if v->>''action''=''select_candidate'' then return recovery_private.exact_v1(v,array[''action'',''operationId'',''basis'',''askOperationId'',''candidateId'']) and recovery_private.uuid_v1(v->''askOperationId'') and recovery_private.uuid_v1(v->''candidateId'') and v->>''operationId''<>v->>''askOperationId'';end if;'||chr(10)||' if v->>''action''=''ask'' then');execute f;
 f:=pg_get_functiondef('public.submit_scoped_trip_edit_v1(uuid,jsonb)'::regprocedure);
 f:=replace(f,' if p_input->>''action''=''manual'' then',' if p_input->>''action''=''select_candidate'' then return scoped_edit_private.select_v1(c,op,p_input);end if;'||chr(10)||' if p_input->>''action''=''manual'' then');execute f;
end $$;

create function public.record_scoped_trip_edit_destination_v1(p_binding jsonb,p_destination jsonb,p_request_id text default null,p_request_digest text default null,p_payload_digest text default null,p_payload_text text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j scoped_edit_private.work_v1%rowtype;r scoped_edit_private.requests_v1%rowtype;cfg scoped_edit_private.worker_settings_v1%rowtype;tp turn_private.text_policies%rowtype;payload jsonb;input jsonb;user_payload jsonb;expected_digest text;phase text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding;
 if not found then return jsonb_build_object('kind','pending');end if;
 select * into cfg from scoped_edit_private.worker_settings_v1 where policy_id=j.policy_id;select * into tp from turn_private.text_policies where id=j.policy_id;
 phase:=p_destination->>'phase';
 if not recovery_private.exact_v1(p_destination,array['schemaVersion','invocationId','provider','model','endpoint','configurationId','configurationVersion','phase','observedAt'])
 or p_destination->>'schemaVersion' is distinct from 'provider-destination/1' or not recovery_private.uuid_v1(p_destination->'invocationId')
 or p_destination->>'provider' is distinct from 'qwen' or p_destination->>'model' is distinct from cfg.model or p_destination->>'endpoint' is distinct from tp.endpoint
 or p_destination->>'configurationId' is distinct from cfg.configuration_id::text or p_destination->'configurationVersion' is distinct from to_jsonb(cfg.configuration_version)
 or coalesce(phase,'') not in('configured','attempted','response_buffered') or recovery_private.time_v1(p_destination->>'observedAt') is null
 or recovery_private.time_v1(p_destination->>'observedAt')>clock_timestamp()+interval '30 seconds' or recovery_private.time_v1(p_destination->>'observedAt')<clock_timestamp()-interval '1 minute'
 or p_request_id is distinct from j.attempt_id::text or coalesce(p_request_digest,'') !~ '^[a-f0-9]{64}$' or coalesce(p_payload_digest,'') !~ '^[a-f0-9]{64}$'
 or p_payload_text is null or pg_column_size(p_payload_text)>65536 or encode(sha256(convert_to(p_payload_text,'UTF8')),'hex') is distinct from p_payload_digest then raise exception 'INVALID_DESTINATION';end if;
 expected_digest:=encode(sha256(convert_to('["scoped-trip-edit-request/1",'||replace((jsonb_build_array(p_binding->'ownerId',p_binding->'taskId',p_binding->'turnId',p_binding->'operationId',p_binding->'contextId',p_binding->'contextDigest',p_binding->'sourceDigest',p_binding->'tripId',p_binding->'baseVersion',p_binding->'policyId',p_binding->'scopeId',p_binding->'attemptId',p_binding->'provider',p_binding->'model',p_binding->'priceVersion'))::text,', ',',')||',"'||p_payload_digest||'"]','UTF8')),'hex');
 if p_request_digest<>expected_digest then raise exception 'INVALID_DESTINATION';end if;
 select * into r from scoped_edit_private.requests_v1 where turn_id=j.turn_id for update;
 if found then
 if (r.binding-'leaseToken')<>(p_binding-'leaseToken') or r.request_id<>p_request_id or r.request_digest<>p_request_digest or r.payload_digest<>p_payload_digest
 or (r.destination-array['phase','observedAt'])<>(p_destination-array['phase','observedAt'])
 or not(r.destination->>'phase'=phase or r.destination->>'phase'='configured' and phase='attempted' or r.destination->>'phase'='attempted' and phase='response_buffered') then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 -- Once configured, the same request identity is only an audit observation.
 update scoped_edit_private.requests_v1 set destination=p_destination where turn_id=j.turn_id;
 else
 if phase<>'configured' or public.authorize_scoped_trip_edit_effect_v1(p_binding,'dispatch')->>'kind' is distinct from 'authorized' then return jsonb_build_object('kind','pending');end if;
 input:=public.read_scoped_trip_edit_work_v1(j.turn_id,(p_binding->>'leaseToken')::uuid);
 begin payload:=p_payload_text::jsonb;user_payload:=(payload->'messages'->1->>'content')::jsonb;exception when others then raise exception 'INVALID_DESTINATION';end;
 if not recovery_private.exact_v1(payload,array['model','messages','stream','max_tokens','enable_thinking','response_format']) or payload->>'model'<>cfg.model or payload->'stream' is distinct from 'false'::jsonb or payload->'enable_thinking' is distinct from 'false'::jsonb
 or payload->'max_tokens' is distinct from to_jsonb(cfg.max_output_tokens) or payload->'response_format' is distinct from '{"type":"json_object"}'::jsonb or jsonb_array_length(payload->'messages')<>2
 or not recovery_private.exact_v1(payload->'messages'->0,array['role','content']) or payload->'messages'->0->>'role' is distinct from 'system'
 or not recovery_private.exact_v1(payload->'messages'->1,array['role','content']) or payload->'messages'->1->>'role' is distinct from 'user'
 or encode(sha256(convert_to(payload->'messages'->0->>'content','UTF8')),'hex') is distinct from '1a360f47407d9507f311fd9f25a3645d4e6b29de034a0682761a47409b873f7c'
 or user_payload is distinct from jsonb_build_object('ask',input->'text','locale',input->'locale','trip',input->'context'->'snapshot','scope',input->'context'->'scope','lockedItemIds',input->'context'->'lockedItemIds','fixedItemIds',input->'context'->'fixedItemIds','profile',input->'profile','memory',input->'memory') then raise exception 'INVALID_DESTINATION';end if;
 insert into scoped_edit_private.requests_v1(turn_id,owner_id,trip_id,binding,request_id,request_digest,payload_digest,destination) values(j.turn_id,j.owner_id,j.trip_id,p_binding,p_request_id,p_request_digest,p_payload_digest,p_destination);
 end if;
 return jsonb_build_object('kind','destination_recorded','attemptId',j.attempt_id,'invocationId',p_destination->'invocationId','phase',phase);
end $$;

create function public.read_scoped_trip_edit_proposal_current_v1(p_proposal_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid;p public.trip_proposals%rowtype;l scoped_edit_private.lineage_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;d text;ok boolean:=false;begin
 u:=recovery_private.actor_v1();select * into p from public.trip_proposals where id=p_proposal_id and owner_id=u;
 if not found or not p.scoped_edit then return scoped_edit_private.unavailable_v1('unsupported');end if;
 select * into l from scoped_edit_private.lineage_v1 where proposal_id=p.id;select * into c from scoped_edit_private.contexts_v1 where id=l.context_id;
 select digest into d from public.read_trip_proposal_v2(p.id);
 if c.id is not null and l.proposal_digest=d and l.proposal_revision=p.revision and l.patch=p.patch and l.base_version=p.base_trip_version and p.status='pending' then ok:=scoped_edit_private.current_v1(c);end if;
 return jsonb_build_object('kind','scoped_edit_current/1','proposalId',p_proposal_id,'current',ok);
exception when lock_not_available then return jsonb_build_object('kind','scoped_edit_current/1','proposalId',p_proposal_id,'current',false);end $$;

alter table scoped_edit_private.work_v1 add column known_usage jsonb;
alter table scoped_edit_private.work_v1 add column known_actual_micros bigint check(known_actual_micros between 0 and 1000000000000);
create function scoped_edit_private.valid_usage_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare k text;begin
 if not recovery_private.exact_v1(v,array['inputTokens','outputTokens','totalTokens','cachedInputTokens','uncachedInputTokens','reasoningTokens','cost']) or v->>'cost' is distinct from 'unknown' then return false;end if;
 foreach k in array array['inputTokens','outputTokens','totalTokens'] loop if jsonb_typeof(v->k) is distinct from 'number' or coalesce(v->>k,'') !~ '^[0-9]{1,7}$' then return false;end if;end loop;
 if (v->>'inputTokens')::integer>1048576 or (v->>'outputTokens')::integer>4096 or (v->>'inputTokens')::integer+(v->>'outputTokens')::integer<>(v->>'totalTokens')::integer then return false;end if;
 foreach k in array array['cachedInputTokens','uncachedInputTokens','reasoningTokens'] loop if v->k<>'null'::jsonb and (jsonb_typeof(v->k) is distinct from 'number' or coalesce(v->>k,'') !~ '^[0-9]{1,7}$') then return false;end if;end loop;
 if coalesce((v->>'cachedInputTokens')::integer,0)>(v->>'inputTokens')::integer or coalesce((v->>'uncachedInputTokens')::integer,0)>(v->>'inputTokens')::integer or coalesce((v->>'reasoningTokens')::integer,0)>(v->>'outputTokens')::integer then return false;end if;
 return true;
end $$;
create function public.record_scoped_trip_edit_usage_v1(p_binding jsonb,p_usage jsonb,p_actual_micros bigint,p_outcome text default 'protocol_validated') returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if coalesce(p_outcome,'') not in('protocol_validated','safety_blocked') or not scoped_edit_private.valid_usage_v1(p_usage) or p_actual_micros is null or p_actual_micros not between 0 and 1000000000000 then raise exception 'INVALID_USAGE';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding for update;if not found then return jsonb_build_object('kind','pending');end if;
 if not exists(select 1 from public.model_budget_attempts where scope_id=j.scope_id and attempt_id=j.attempt_id and task_id=j.task_id and provider=p_binding->>'provider' and model=p_binding->>'model' and price_version=p_binding->>'priceVersion' and status in('dispatched','pending','settled')) then return jsonb_build_object('kind','pending');end if;
 if j.known_usage is not null and (j.known_usage<>p_usage or j.known_actual_micros<>p_actual_micros or j.known_outcome is distinct from p_outcome) then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 update scoped_edit_private.work_v1 set known_usage=p_usage,known_actual_micros=p_actual_micros,known_outcome=p_outcome where turn_id=j.turn_id;
 return jsonb_build_object('kind','usage_saved');
end $$;
create function public.read_scoped_trip_edit_usage_v1(p_binding jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding;if not found then return jsonb_build_object('kind','pending');end if;
 if j.known_usage is null then return jsonb_build_object('kind','missing');end if;
 return jsonb_build_object('kind','saved_usage','binding',p_binding,'usage',j.known_usage,'actualMicros',j.known_actual_micros,'outcome',j.known_outcome);
end $$;
-- Empty registry can be enrolled only through separate operator authority. Enabling
-- a row cannot rewrite its destination, source permissions, deadline or price.
create function scoped_edit_private.settings_immutable_v1() returns trigger language plpgsql set search_path='' as $$begin
 if TG_OP='DELETE' or (to_jsonb(NEW)-'enabled') is distinct from (to_jsonb(OLD)-'enabled') then raise exception 'SCOPED_SETTINGS_IMMUTABLE';end if;return NEW;
end $$;
create trigger scoped_settings_immutable before update or delete on scoped_edit_private.worker_settings_v1 for each row execute function scoped_edit_private.settings_immutable_v1();

alter table scoped_edit_private.work_v1 add column known_outcome text check(known_outcome in('protocol_validated','safety_blocked'));
create or replace function public.pause_scoped_trip_edit_work_v1(p_binding jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;o scoped_edit_private.operations_v1%rowtype;r jsonb;begin
 if auth.role() is distinct from 'service_role' or coalesce(p_reason,'') not in('unsupported_request','no_change','safety_refused','provider_unavailable','accounting_unknown','stale_basis') then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding for update;if not found then return jsonb_build_object('kind','pending');end if;
 select * into c from scoped_edit_private.contexts_v1 where id=j.context_id;select * into o from scoped_edit_private.operations_v1 where owner_id=j.owner_id and operation_id=j.operation_id;
 if not found or c.id is null or not scoped_edit_private.service_current_v1(c) or not scoped_edit_private.worker_policy_v1(j.owner_id,j.policy_id,j.scope_id) then return jsonb_build_object('kind','pending');end if;
 if coalesce(p_reason,'') not in('unsupported_request','no_change','safety_refused') then
 -- Unknown failures remain recoverable under the original lease/attempt, not declined.
 return jsonb_build_object('kind','pending');end if;
 if not exists(select 1 from public.model_budget_attempts where scope_id=j.scope_id and attempt_id=j.attempt_id and task_id=j.task_id and status='settled' and actual_micros=j.known_actual_micros)
 or p_reason='safety_refused' and (j.known_outcome is distinct from 'safety_blocked' or j.output is not null)
 or p_reason<>'safety_refused' and (j.output->>'kind' is distinct from 'cannot_edit' or j.output->>'reason' is distinct from p_reason or j.known_outcome is distinct from 'protocol_validated') then return jsonb_build_object('kind','pending');end if;
 if o.receipt->>'kind'='scoped_edit_declined/1' then
 if o.receipt->>'reason'<>p_reason then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 return jsonb_build_object('kind','declined','binding',p_binding,'receipt',o.receipt||'{"reused":true}'::jsonb);end if;
 if j.completion is not null or o.cancelled or o.proposal_id is not null then return jsonb_build_object('kind','pending');end if;
 r:=jsonb_build_object('kind','scoped_edit_declined/1','operationId',j.operation_id,'tripId',j.trip_id,'contextId',c.id,'contextDigest',c.digest,'baseVersion',c.base_version,'reason',p_reason,'reused',false);
 update scoped_edit_private.operations_v1 set receipt=r where owner_id=j.owner_id and operation_id=j.operation_id;
 update scoped_edit_private.work_v1 set paused_reason=p_reason where turn_id=j.turn_id;
 perform turn_private.terminal(j.turn_id,'completed',(select attempt from turn_private.work where turn_id=j.turn_id));
 return jsonb_build_object('kind','declined','binding',p_binding,'receipt',r);
end $$;

-- New functions have no executable default capability, including trusted service seams.
do $$declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='scoped_edit_private' or n.nspname='public' and p.proname in('prepare_scoped_trip_edit_v1','submit_scoped_trip_edit_v1','read_scoped_trip_edit_operation_v1','abandon_scoped_trip_edit_operation_v1','hosted_scoped_trip_edit_target_v1','claim_scoped_trip_edit_work_v1','read_scoped_trip_edit_work_v1','authorize_scoped_trip_edit_effect_v1','scoped_trip_edit_budget_v1','record_scoped_trip_edit_output_v1','read_scoped_trip_edit_output_v1','record_scoped_trip_edit_destination_v1','pause_scoped_trip_edit_work_v1','complete_scoped_trip_edit_work_v1','read_scoped_trip_edit_completion_v1','read_scoped_trip_edit_proposal_current_v1','record_scoped_trip_edit_usage_v1','read_scoped_trip_edit_usage_v1') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);end loop;end $$;
notify pgrst,'reload schema';
