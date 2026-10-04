-- #220: durable local recovery association, no second Trip writer or new grant.
create schema recovery_private;
revoke all on schema recovery_private from public,anon,authenticated,service_role;
alter table public.trip_proposals add column local_recovery boolean not null default false;

create function recovery_private.hash_v1(v jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(v::text,'UTF8')),'hex')$$;
create function recovery_private.exact_v1(v jsonb,k text[]) returns boolean language sql immutable set search_path='' as $$select coalesce(jsonb_typeof(v)='object' and v ?& k and (v-k)='{}',false)$$;
create function recovery_private.uuid_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)$$;
create function recovery_private.ids_v1(v jsonb,lo integer,hi integer) returns boolean language plpgsql immutable set search_path='' as $$begin
 if jsonb_typeof(v) is distinct from 'array' then return false;end if;
 return jsonb_array_length(v) between lo and hi and not exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'string' or x#>>'{}' !~ '^[A-Za-z0-9_-]{1,64}$') and (select count(distinct x) from jsonb_array_elements(v)x)=jsonb_array_length(v);
end $$;
create function recovery_private.time_v1(v text) returns timestamptz language plpgsql immutable set search_path='' set timezone='UTC' as $$declare t timestamptz;begin
 if v is null or v !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$' then return null;end if;
 if substring(v,12,2)::integer>23 or substring(v,15,2)::integer>59 or substring(v,18,2)::integer>59 then return null;end if;
 perform substring(v,1,10)::date;t:=v::timestamptz;return t;
exception when others then return null;end $$;
create function recovery_private.ms_v1(v timestamptz) returns text language sql immutable set search_path='' as $$select to_char(v at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')$$;
create function recovery_private.valid_prepare_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare b jsonb;begin
 if not recovery_private.exact_v1(v,array['operationId','expectedHeadVersion','dayId','selectedItemIds','fixedItemIds','reservationBindings','report','locale']) or not recovery_private.uuid_v1(v->'operationId')
 or jsonb_typeof(v->'expectedHeadVersion') is distinct from 'number' or v->>'expectedHeadVersion' !~ '^(0|[1-9][0-9]{0,8})$'
 or jsonb_typeof(v->'dayId') is distinct from 'string' or v->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$'
 or not recovery_private.ids_v1(v->'selectedItemIds',1,8) or not recovery_private.ids_v1(v->'fixedItemIds',0,64)
 or jsonb_typeof(v->'reservationBindings') is distinct from 'array' or jsonb_array_length(v->'reservationBindings')>100
 or not recovery_private.exact_v1(v->'report',array['source','kind','observedAt']) or v->'report'->>'source' is distinct from 'user_report'
 or coalesce(v->'report'->>'kind','') not in('fatigue','delay','closure','high_risk_unwell')
 or recovery_private.time_v1(v->'report'->>'observedAt') is null or coalesce(v->>'locale','') not in('zh','en') then return false;end if;
 for b in select value from jsonb_array_elements(v->'reservationBindings') loop
 if not recovery_private.exact_v1(b,array['referenceId','revision','dayId','itemId']) or not recovery_private.uuid_v1(b->'referenceId')
 or jsonb_typeof(b->'revision') is distinct from 'number' or b->>'revision' !~ '^[1-9][0-9]{0,15}$' or (b->>'revision')::numeric>9007199254740990
 or jsonb_typeof(b->'dayId') is distinct from 'string' or b->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$'
 or jsonb_typeof(b->'itemId') is distinct from 'string' or b->>'itemId' !~ '^[A-Za-z0-9_-]{1,64}$' then return false;end if;end loop;
 return (select count(distinct (x->>'referenceId')::uuid) from jsonb_array_elements(v->'reservationBindings')x)=jsonb_array_length(v->'reservationBindings');
end $$;
create function recovery_private.valid_select_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$select coalesce(recovery_private.exact_v1(v,array['operationId','contextId','contextDigest','candidateId']) and recovery_private.uuid_v1(v->'operationId') and recovery_private.uuid_v1(v->'contextId') and jsonb_typeof(v->'contextDigest')='string' and v->>'contextDigest' ~ '^[a-f0-9]{64}$' and v->>'candidateId' in('omit_one','omit_selected'),false)$$;

create table recovery_private.contexts_v1(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,operation_id uuid not null,
 input jsonb not null,base_version integer not null,snapshot jsonb not null,profile_basis jsonb not null,reservation_basis jsonb not null,
 digest text not null,created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 unique(owner_id,operation_id),unique(id,owner_id,trip_id)
);
create table recovery_private.operations_v1(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,
 trip_id uuid not null references public.trips(id) on delete cascade,context_id uuid not null unique,
 input jsonb not null,receipt jsonb not null,proposal_id uuid not null references public.trip_proposals(id) on delete cascade,
 primary key(owner_id,operation_id),foreign key(context_id,owner_id,trip_id) references recovery_private.contexts_v1(id,owner_id,trip_id) on delete cascade
);
create table recovery_private.lineage_v1(
 proposal_id uuid primary key references public.trip_proposals(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,trip_id uuid not null references public.trips(id) on delete cascade,
 context_id uuid not null,operation_id uuid not null,patch jsonb not null,proposal_digest text not null,
 foreign key(context_id,owner_id,trip_id) references recovery_private.contexts_v1(id,owner_id,trip_id) on delete cascade,
 foreign key(owner_id,operation_id) references recovery_private.operations_v1(owner_id,operation_id) on delete cascade
);
create index recovery_context_trip_v1 on recovery_private.contexts_v1(trip_id);
create index recovery_context_expiry_v1 on recovery_private.contexts_v1(expires_at,id);
create index recovery_operation_trip_v1 on recovery_private.operations_v1(trip_id);
create index recovery_lineage_trip_v1 on recovery_private.lineage_v1(trip_id);
create index recovery_lineage_context_v1 on recovery_private.lineage_v1(context_id);
-- Inserts are confined to owner RPCs. Bodies and original ACKs cannot be renewed.
create function recovery_private.immutable_v1() returns trigger language plpgsql set search_path='' as $$begin raise exception 'RECOVERY_RECORD_IMMUTABLE';end $$;
do $$declare t text;begin foreach t in array array['contexts_v1','operations_v1','lineage_v1'] loop
 execute format('alter table recovery_private.%I enable row level security',t);
 execute format('revoke all on recovery_private.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger recovery_immutable before update on recovery_private.%I for each row execute function recovery_private.immutable_v1()',t);
end loop;end $$;

create function recovery_private.actor_v1() returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=auth.uid();s uuid;begin
 if u is null or auth.role() is distinct from 'authenticated' or auth.jwt()->>'is_anonymous' is distinct from 'false' then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from identity_private.mobile_accounts where owner_id=u for update nowait;
 u:=turn_private.text_owner();s:=(auth.jwt()->>'session_id')::uuid;
 if exists(select 1 from identity_private.mobile_attempts where session_id=s) or exists(select 1 from identity_private.mobile_login_proofs where session_id=s) then perform public.native_session_v2('session');end if;
 return u;
end $$;
create function recovery_private.trip_v1(u uuid,t uuid) returns public.trips language plpgsql security definer set search_path='' as $$declare r public.trips%rowtype;begin
 select * into r from public.trips where owner_id=u and id=t for update nowait;
 if not found or exists(select 1 from public.trip_archives where trip_id=t) or exists(select 1 from privacy_private.trip_deletions where trip_id=t) then return null;end if;return r;
end $$;
create function recovery_private.profile_v1(u uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.user_profiles%rowtype;begin
 select * into p from public.user_profiles where owner_id=u for share nowait;
 return jsonb_build_object('present',found,'travelPace',case when p.pace_state='explicit' and p.pace_notice='local-planning-cross-trip-v1' then p.travel_pace else null end,
 'updatedAt',recovery_private.ms_v1(p.updated_at),'timestamp',p.updated_at,'revision',p.pace_revision,'state',p.pace_state,'notice',p.pace_notice);
end $$;
-- No compile-time dependency on #646. Missing real reader is pending, never [].
create function recovery_private.reservations_v1(u uuid,t uuid,head integer) returns jsonb language plpgsql security definer set search_path='' as $$declare page jsonb;items jsonb:='[]';cursor uuid;count_n integer;begin
 if to_regprocedure('public.read_reservation_references_v1(uuid,integer,uuid,uuid,integer)') is null or to_regclass('reservation_private.current_v1') is null then return jsonb_build_object('kind','pending','reason','RESERVATION_READER_UNAVAILABLE');end if;
 execute 'select count(*) from (select reference_id from reservation_private.current_v1 where owner_id=$1 and trip_id=$2 order by reference_id limit 101 for share nowait) r' into count_n using u,t;
 if count_n>100 then return jsonb_build_object('kind','pending','reason','RESERVATION_SCOPE_INCOMPLETE');end if;
 for n in 1..5 loop
 execute 'select public.read_reservation_references_v1($1,$2,null,$3,20)' into page using t,head,cursor;
 if page->>'kind' is distinct from 'reservation_references/1' or page->>'tripId' is distinct from t::text or page->>'tripVersion' is distinct from head::text or jsonb_typeof(page->'items') is distinct from 'array' then return jsonb_build_object('kind','unavailable');end if;
 items:=items||page->'items';if page->'hasMore'='false'::jsonb then exit;end if;
 if page->'hasMore' is distinct from 'true'::jsonb or not recovery_private.uuid_v1(page->'nextCursor') or cursor is not null and (page->>'nextCursor')::uuid<=cursor then return jsonb_build_object('kind','unavailable');end if;
 cursor:=(page->>'nextCursor')::uuid;
 end loop;
 if page->'hasMore' is distinct from 'false'::jsonb or jsonb_array_length(items)<>count_n then return jsonb_build_object('kind','pending','reason','RESERVATION_SCOPE_INCOMPLETE');end if;
 return jsonb_build_object('kind','basis','records',items,'items',(select coalesce(jsonb_agg(jsonb_build_object('referenceId',x->'referenceId','revision',x->'revision','contentDigest',x->'contentDigest','status',x->'fields'->'status','evidenceTier',x->'evidenceTier') order by x->>'referenceId'),'[]') from jsonb_array_elements(items)x));
end $$;
create function recovery_private.context_wire_v1(c recovery_private.contexts_v1) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('kind','local_recovery_context/1','contextId',c.id,'contextDigest',c.digest,'tripId',c.trip_id,'baseVersion',c.base_version,'expiresAt',recovery_private.ms_v1(c.expires_at),'profileBasis',c.profile_basis-array['present','timestamp','revision','state','notice'],'reservationBasis',c.reservation_basis,'input',c.input)$$;
create function recovery_private.patch_v1(c recovery_private.contexts_v1,choice text) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('expectedVersion',c.base_version,'operations',(select jsonb_agg(jsonb_build_object('kind','delete_item','dayId',c.input->>'dayId','itemId',x.value) order by x.ordinality) from jsonb_array_elements(c.input->'selectedItemIds') with ordinality x where choice='omit_selected' or x.ordinality=1))$$;

create function public.prepare_local_recovery_v1(p_trip_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$declare u uuid;t public.trips%rowtype;c recovery_private.contexts_v1%rowtype;profile jsonb;orders jsonb;snap jsonb;observed timestamptz;b jsonb;record jsonb;item public.trip_items%rowtype;day public.trip_days%rowtype;zone text;start_date date;end_date date;begin
 if p_trip_id is null or not recovery_private.valid_prepare_v1(p_input) then raise exception 'INVALID_INPUT';end if;
 u:=recovery_private.actor_v1();t:=recovery_private.trip_v1(u,p_trip_id);if t.id is null then return jsonb_build_object('kind','unavailable');end if;
 select * into c from recovery_private.contexts_v1 where owner_id=u and operation_id=(p_input->>'operationId')::uuid for update nowait;
 if found and (c.trip_id<>t.id or c.input<>p_input) then return jsonb_build_object('kind','conflict');end if;
 if t.head_version<>(p_input->>'expectedHeadVersion')::integer then return jsonb_build_object('kind','conflict');end if;
 observed:=recovery_private.time_v1(p_input->'report'->>'observedAt');if observed>clock_timestamp() or observed+interval '5 minutes'<=clock_timestamp() or c.id is not null and c.expires_at<=clock_timestamp() then return jsonb_build_object('kind','stale');end if;
 if p_input->'report'->>'kind'='high_risk_unwell' then return jsonb_build_object('kind','pending','reason','HIGH_RISK_UNWELL');end if;
 if exists(select 1 from jsonb_array_elements_text(p_input->'selectedItemIds')x where not exists(select 1 from public.trip_items i where i.trip_id=t.id and i.owner_id=u and i.day_id=p_input->>'dayId' and i.item_id=x))
 or exists(select 1 from jsonb_array_elements_text(p_input->'fixedItemIds')x where not exists(select 1 from public.trip_items i where i.trip_id=t.id and i.owner_id=u and i.item_id=x))
 or exists(select 1 from jsonb_array_elements(p_input->'selectedItemIds')x where p_input->'fixedItemIds' @> jsonb_build_array(x)) then return jsonb_build_object('kind','conflict');end if;
 profile:=recovery_private.profile_v1(u);orders:=recovery_private.reservations_v1(u,t.id,t.head_version);if orders->>'kind' is distinct from 'basis' then return orders;end if;
 if exists(select 1 from jsonb_array_elements(orders->'items')x where x->>'status'='unknown' or coalesce(x->>'status','') not in('reserved','amended','cancelled')) then return jsonb_build_object('kind','pending','reason','RESERVATION_STATUS_UNKNOWN');end if;
 if exists(select 1 from jsonb_array_elements(orders->'items')x where x->>'status' in('reserved','amended') and not exists(select 1 from jsonb_array_elements(p_input->'reservationBindings')b where (b->>'referenceId')::uuid::text=x->>'referenceId' and b->'revision'=x->'revision')) then return jsonb_build_object('kind','pending','reason','RESERVATION_SCOPE_UNMAPPED');end if;
 -- A binding is user-confirmed preservation, never supplier or mapping proof.
 if (select count(distinct jsonb_build_array(x->>'dayId',x->>'itemId')) from jsonb_array_elements(p_input->'reservationBindings')x)<>jsonb_array_length(p_input->'reservationBindings') then return jsonb_build_object('kind','pending','reason','RESERVATION_BINDING_AMBIGUOUS');end if;
 for b in select value from jsonb_array_elements(p_input->'reservationBindings') loop
 select x into record from jsonb_array_elements(orders->'records')x where x->>'referenceId'=(b->>'referenceId')::uuid::text and x->'revision'=b->'revision';
 if not found then return jsonb_build_object('kind','pending','reason','RESERVATION_BINDING_STALE');end if;
 select * into item from public.trip_items i where i.trip_id=t.id and i.owner_id=u and i.day_id=b->>'dayId' and i.item_id=b->>'itemId';
 if not found then return jsonb_build_object('kind','pending','reason','RESERVATION_BINDING_STALE');end if;
 if p_input->'selectedItemIds' @> jsonb_build_array(item.item_id) then return jsonb_build_object('kind','pending','reason','RESERVATION_FIXED_SELECTION');end if;
 select * into day from public.trip_days d where d.trip_id=t.id and d.day_id=item.day_id;
 zone:=record->'fields'->>'timeZone';
 if record->'fields'->>'startsAt' is not null or record->'fields'->>'endsAt' is not null then
 if zone is null or not exists(select 1 from pg_timezone_names where name=zone) then return jsonb_build_object('kind','pending','reason','RESERVATION_DATE_UNRESOLVED');end if;
 start_date:=(recovery_private.time_v1(record->'fields'->>'startsAt') at time zone zone)::date;
 end_date:=(recovery_private.time_v1(record->'fields'->>'endsAt') at time zone zone)::date;
 if start_date is not null and day.trip_date<start_date or end_date is not null and day.trip_date>end_date
 or record->'fields'->>'kind'<>'lodging' and item.starts_at is not null and recovery_private.time_v1(record->'fields'->>'startsAt') is not null and item.starts_at<recovery_private.time_v1(record->'fields'->>'startsAt')
 or record->'fields'->>'kind'<>'lodging' and item.ends_at is not null and recovery_private.time_v1(record->'fields'->>'endsAt') is not null and item.ends_at>recovery_private.time_v1(record->'fields'->>'endsAt') then return jsonb_build_object('kind','pending','reason','RESERVATION_DATE_CONFLICT');end if;
 end if;
 end loop;
 snap:=public.trip_content_snapshot(t.id,t.title);if pg_column_size(snap)>262144 then return jsonb_build_object('kind','pending','reason','RECOVERY_SCOPE_TOO_LARGE');end if;
 if c.id is not null then
 if c.profile_basis<>profile or c.reservation_basis<>orders->'items' or c.snapshot<>snap then return jsonb_build_object('kind','conflict');end if;return recovery_private.context_wire_v1(c);end if;
 insert into recovery_private.contexts_v1(owner_id,trip_id,operation_id,input,base_version,snapshot,profile_basis,reservation_basis,digest,expires_at)
 values(u,t.id,(p_input->>'operationId')::uuid,p_input,t.head_version,snap,profile,orders->'items',recovery_private.hash_v1(jsonb_build_array(u,t.id,p_input,t.head_version,snap,profile,orders->'items')),least(observed+interval '5 minutes',clock_timestamp()+interval '5 minutes')) returning * into c;
 return recovery_private.context_wire_v1(c);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;

create function public.submit_local_recovery_v1(p_trip_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$declare u uuid;t public.trips%rowtype;c recovery_private.contexts_v1%rowtype;o recovery_private.operations_v1%rowtype;profile jsonb;orders jsonb;patch jsonb;p uuid;rev integer;base integer;expiry timestamptz;receipt jsonb;dig text;begin
 if p_trip_id is null or not recovery_private.valid_select_v1(p_input) then raise exception 'INVALID_INPUT';end if;
 u:=recovery_private.actor_v1();t:=recovery_private.trip_v1(u,p_trip_id);if t.id is null then return jsonb_build_object('kind','unavailable');end if;
 select * into o from recovery_private.operations_v1 where owner_id=u and operation_id=(p_input->>'operationId')::uuid;
 if found then if o.trip_id<>t.id or o.input<>p_input then return jsonb_build_object('kind','conflict');end if;return o.receipt||'{"reused":true}';end if;
 select * into c from recovery_private.contexts_v1 where id=(p_input->>'contextId')::uuid and owner_id=u and trip_id=t.id for update nowait;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 if c.digest is distinct from p_input->>'contextDigest' or exists(select 1 from recovery_private.operations_v1 where context_id=c.id) or p_input->>'candidateId'='omit_selected' and jsonb_array_length(c.input->'selectedItemIds')<2 then return jsonb_build_object('kind','conflict');end if;
 if c.expires_at<=clock_timestamp() then return jsonb_build_object('kind','stale');end if;
 if t.head_version<>c.base_version or public.trip_content_snapshot(t.id,t.title)<>c.snapshot then return jsonb_build_object('kind','conflict');end if;
 profile:=recovery_private.profile_v1(u);orders:=recovery_private.reservations_v1(u,t.id,t.head_version);if orders->>'kind' is distinct from 'basis' then return orders;end if;
 if profile<>c.profile_basis or orders->'items'<>c.reservation_basis then return jsonb_build_object('kind','conflict');end if;
 patch:=recovery_private.patch_v1(c,p_input->>'candidateId');
 select proposal_id,revision,base_trip_version into p,rev,base from public.create_trip_proposal_patch(t.id,patch);
 expiry:=date_trunc('milliseconds',least(c.expires_at,clock_timestamp()+interval '30 seconds'));
 update public.trip_proposals set expires_at=expiry,local_recovery=true where id=p;
 select digest into dig from public.read_trip_proposal_v2(p);
 receipt:=jsonb_build_object('kind','local_recovery_proposal/1','operationId',(p_input->>'operationId')::uuid,'contextId',c.id,'contextDigest',c.digest,'candidateId',p_input->>'candidateId','proposalId',p,'proposalRevision',rev,'baseVersion',base,'expiresAt',recovery_private.ms_v1(expiry),'reused',false);
 insert into recovery_private.operations_v1 values(u,(p_input->>'operationId')::uuid,t.id,c.id,p_input,receipt,p);
 insert into recovery_private.lineage_v1 values(p,u,t.id,c.id,(p_input->>'operationId')::uuid,patch,dig);
 return receipt;
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;

-- A persistent marker survives privacy cleanup; a missing binding always rejects.
create function recovery_private.proposal_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$declare parent public.trip_proposals%rowtype;begin
 if TG_OP='UPDATE' then
 if OLD.local_recovery and (to_jsonb(NEW)-'status') is distinct from (to_jsonb(OLD)-'status') then raise exception 'RECOVERY_PROPOSAL_IMMUTABLE';end if;return NEW;end if;
 if NEW.parent_proposal_id is not null then
 select * into parent from public.trip_proposals where id=NEW.parent_proposal_id;
 -- A revision requires a fresh recovery preparation/selection. Keeping a child
 -- would make the immutable original operation ACK name the wrong Proposal.
 if parent.local_recovery then raise exception 'RECOVERY_REVISION_SCOPE';end if;
 end if;return NEW;
end $$;
create trigger recovery_proposal_guard before insert or update on public.trip_proposals for each row execute function recovery_private.proposal_guard_v1();

create function recovery_private.confirm_guard_v1() returns trigger language plpgsql security definer set search_path='' set timezone='UTC' as $$declare p public.trip_proposals%rowtype;b recovery_private.lineage_v1%rowtype;c recovery_private.contexts_v1%rowtype;t public.trips%rowtype;profile jsonb;orders jsonb;dig text;o recovery_private.operations_v1%rowtype;begin
 select * into p from public.trip_proposals where id=NEW.proposal_id;
 if not p.local_recovery then return null;end if;
 select * into b from recovery_private.lineage_v1 where proposal_id=p.id;
 if not found then raise exception 'RECOVERY_CONFIRM_GUARD';end if;
 select * into c from recovery_private.contexts_v1 where id=b.context_id;
 select * into o from recovery_private.operations_v1 where owner_id=b.owner_id and operation_id=b.operation_id;
 t:=recovery_private.trip_v1(recovery_private.actor_v1(),p.trip_id);
 select digest into dig from public.read_trip_proposal_v2(p.id);
 if c.id is null or o.proposal_id is null or t.id is null or b.owner_id is distinct from auth.uid() or p.owner_id<>b.owner_id or NEW.owner_id<>b.owner_id or NEW.trip_id<>b.trip_id or p.trip_id<>b.trip_id or p.patch<>b.patch or dig is distinct from b.proposal_digest
 or p.base_trip_version<>c.base_version or NEW.resulting_version<>c.base_version+1 or t.head_version<>NEW.resulting_version or p.status<>'applied' or p.rollback_snapshot_version is not null
 or p.expires_at<=clock_timestamp() or c.expires_at<=clock_timestamp() or p.expires_at>c.expires_at or p.expires_at is distinct from (o.receipt->>'expiresAt')::timestamptz
 or b.patch<>recovery_private.patch_v1(c,o.input->>'candidateId') or public.trip_content_snapshot(t.id,t.title)<>public.apply_trip_content_patch(c.snapshot,b.patch) then raise exception 'RECOVERY_CONFIRM_GUARD';end if;
 profile:=recovery_private.profile_v1(b.owner_id);orders:=recovery_private.reservations_v1(b.owner_id,b.trip_id,NEW.resulting_version);
 if profile<>c.profile_basis or orders->>'kind' is distinct from 'basis' or orders->'items' is distinct from c.reservation_basis then raise exception 'RECOVERY_CONFIRM_GUARD';end if;
 return null;
end $$;
create constraint trigger recovery_confirmed_event after insert on public.trip_events deferrable initially deferred for each row execute function recovery_private.confirm_guard_v1();

create function public.read_local_recovery_operation_v1(p_trip_id uuid,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$declare u uuid;t public.trips%rowtype;o recovery_private.operations_v1%rowtype;p public.trip_proposals%rowtype;c recovery_private.contexts_v1%rowtype;b recovery_private.lineage_v1%rowtype;state text;version integer;profile jsonb;orders jsonb;begin
 if p_trip_id is null or p_operation_id is null then raise exception 'INVALID_INPUT';end if;
 u:=recovery_private.actor_v1();t:=recovery_private.trip_v1(u,p_trip_id);if t.id is null then return jsonb_build_object('kind','unavailable');end if;
 select * into o from recovery_private.operations_v1 where owner_id=u and trip_id=t.id and operation_id=p_operation_id;if not found then return jsonb_build_object('kind','unavailable');end if;
 -- Read only the original exact Proposal named by this immutable operation ACK.
 select e.resulting_version into version from public.trip_events e join recovery_private.lineage_v1 l on l.proposal_id=e.proposal_id where l.owner_id=u and l.operation_id=o.operation_id and e.proposal_id=o.proposal_id and e.owner_id=u and e.trip_id=t.id and e.event_type='proposal_applied' order by e.resulting_version limit 1;
 if found then state:='applied';else
 select * into p from public.trip_proposals where id=o.proposal_id;
 select * into c from recovery_private.contexts_v1 where id=o.context_id;
 state:=case when p.status='rejected' then 'rejected' when p.expires_at<=clock_timestamp() or c.expires_at<=clock_timestamp() or p.status='expired' then 'expired' when p.status<>'pending' or t.head_version<>p.base_trip_version then 'stale' else 'pending' end;
 if state='pending' then profile:=recovery_private.profile_v1(u);orders:=recovery_private.reservations_v1(u,t.id,t.head_version);if profile<>c.profile_basis or orders->>'kind' is distinct from 'basis' or orders->'items' is distinct from c.reservation_basis then state:='stale';end if;end if;
 end if;
 return jsonb_build_object('kind','local_recovery_operation/1','operationId',o.operation_id,'tripId',o.trip_id,'input',o.input,'receipt',o.receipt||'{"reused":true}','state',state,'resultingVersion',version);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;

create function recovery_private.cleanup_trip_v1() returns trigger language plpgsql security definer set search_path='' as $$begin delete from recovery_private.contexts_v1 where trip_id=NEW.trip_id;return NEW;end $$;
create trigger recovery_archive_cleanup after insert on public.trip_archives for each row execute function recovery_private.cleanup_trip_v1();
create trigger recovery_delete_cleanup after insert on privacy_private.trip_deletions for each row execute function recovery_private.cleanup_trip_v1();
create function recovery_private.cleanup_expired_v1(p_limit integer default 100) returns integer language plpgsql security definer set search_path='' as $$declare n integer;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
 with dead as(select c.id from recovery_private.contexts_v1 c where c.expires_at<=clock_timestamp() and not exists(select 1 from recovery_private.operations_v1 o where o.context_id=c.id) order by c.expires_at,c.id limit p_limit for update skip locked)
 delete from recovery_private.contexts_v1 c using dead where c.id=dead.id;get diagnostics n=ROW_COUNT;return n;
end $$;
create function recovery_private.export_metadata_v1(p_request_id uuid,p_lease_id uuid,p_generation integer,p_after_context_id uuid default null,p_limit integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$declare j export_private.core_jobs_v1%rowtype;items jsonb;more boolean;cursor uuid;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if p_request_id is null or p_lease_id is null or p_generation is null or p_generation not between 1 and 3 or p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
 j:=export_private.lock_job_v1(p_request_id,true);if j.request_id is null or export_private.live_lease_v1(j,p_lease_id,p_generation) is distinct from true then return jsonb_build_object('kind','unavailable');end if;
 if p_after_context_id is not null and not exists(select 1 from recovery_private.contexts_v1 where id=p_after_context_id and owner_id=j.owner_id) then raise exception 'INVALID_EXPORT_CURSOR';end if;
 with candidates as(select c.* from recovery_private.contexts_v1 c join public.trips t on t.id=c.trip_id and t.owner_id=c.owner_id where c.owner_id=j.owner_id and not exists(select 1 from public.trip_archives a where a.trip_id=c.trip_id) and not exists(select 1 from privacy_private.trip_deletions d where d.trip_id=c.trip_id) and (p_after_context_id is null or c.id>p_after_context_id) order by c.id limit p_limit+1),delivered as(select * from candidates order by id limit p_limit)
 select coalesce((select jsonb_agg(jsonb_build_object('contextId',c.id,'tripId',c.trip_id,'baseVersion',c.base_version,'input',c.input,'expiresAt',recovery_private.ms_v1(c.expires_at),'operations',(select coalesce(jsonb_agg(jsonb_build_object('operationId',o.operation_id,'input',o.input,'receipt',o.receipt) order by o.operation_id),'[]') from recovery_private.operations_v1 o where o.context_id=c.id),'historical',true) order by c.id) from delivered c),'[]'),(select count(*)>p_limit from candidates),(select id from delivered order by id desc limit 1) into items,more,cursor;
 return jsonb_build_object('schemaVersion','recovery-export/1','items',items,'hasMore',more,'nextCursor',case when more then cursor else null end,'sectionComplete',not more,'enrolled',false,'inventoryStatus','partial');
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;

revoke all on all functions in schema recovery_private from public,anon,authenticated,service_role;
revoke all on function public.prepare_local_recovery_v1(uuid,jsonb),public.submit_local_recovery_v1(uuid,jsonb),public.read_local_recovery_operation_v1(uuid,uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
