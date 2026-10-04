-- #214: owner/current Trip user-reported references. No supplier/Trip writer.
-- Default closed. Historical rows deliberately contain no sensitive payload.
create schema reservation_private;
revoke all on schema reservation_private from public,anon,authenticated,service_role;
create function reservation_private.exact_v1(v jsonb,keys text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and v ?& keys and v-keys='{}',false)
$$;
create function reservation_private.uuid_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
$$;
create function reservation_private.integer_v1(v jsonb,lo numeric,hi numeric) returns boolean language plpgsql immutable set search_path='' as $$begin
 return coalesce(jsonb_typeof(v)='number' and (v#>>'{}')::numeric between lo and hi and trunc((v#>>'{}')::numeric)=(v#>>'{}')::numeric,false);
exception when others then return false;end $$;
create function reservation_private.text_v1(v jsonb,n integer) returns boolean language sql immutable set search_path='' as $$
 select coalesce(v='null'::jsonb or jsonb_typeof(v)='string' and char_length(v#>>'{}')<=n and v#>>'{}' ~ '[^[:space:]]' and v#>>'{}' !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]',false)
$$;
create function reservation_private.timestamp_v1(v text) returns timestamptz language plpgsql immutable set search_path='' set timezone='UTC' as $$
declare local_time timestamp;offset_n integer;result timestamptz;
begin
 if v is null then return null;end if;
 if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then return null;end if;
 local_time:=substring(v,1,19)::timestamp;
 if to_char(local_time,'YYYY-MM-DD"T"HH24:MI:SS')<>substring(v,1,19) then return null;end if;
 if right(v,1)='Z' then result:=left(v,length(v)-1)::timestamp at time zone 'UTC';else
 if substring(v from length(v)-4 for 2)::integer>23 or right(v,2)::integer>59 then return null;end if;
 offset_n:=substring(v from length(v)-4 for 2)::integer*60+right(v,2)::integer;
 if substring(v from length(v)-5 for 1)='-' then offset_n:=-offset_n;end if;
 result:=(left(v,length(v)-6)::timestamp at time zone 'UTC')-offset_n*interval '1 minute';end if;
 return date_trunc('milliseconds',result);
exception when others then return null;end $$;
create function reservation_private.valid_fields_v1(v jsonb) returns boolean language plpgsql stable set search_path='' set timezone='UTC' as $$
declare k text;lo timestamptz;hi timestamptz;
begin
 if not reservation_private.exact_v1(v,array['kind','supplier','externalReference','title','startsAt','endsAt','timeZone','address','terms','status']) then return false;end if;
 if coalesce(v->>'kind','') not in ('lodging','transport','activity','other') or coalesce(v->>'supplier','') not in ('booking','trip','official','other') or coalesce(v->>'status','') not in ('reserved','amended','cancelled','unknown') then return false;end if;
 if v->'title'='null'::jsonb or not reservation_private.text_v1(v->'title',160) or not reservation_private.text_v1(v->'externalReference',120) or not reservation_private.text_v1(v->'address',500) or not reservation_private.text_v1(v->'terms',2000) or not reservation_private.text_v1(v->'timeZone',80) then return false;end if;
 foreach k in array array['startsAt','endsAt'] loop
 if v->k<>'null'::jsonb and (jsonb_typeof(v->k)<>'string' or reservation_private.timestamp_v1(v->>k) is null) then return false;end if;end loop;
 lo:=reservation_private.timestamp_v1(v->>'startsAt');hi:=reservation_private.timestamp_v1(v->>'endsAt');if lo is not null and hi is not null and hi<=lo then return false;end if;
 if v->'timeZone'<>'null'::jsonb and not exists(select 1 from pg_catalog.pg_timezone_names where name=v->>'timeZone') then return false;end if;
 return true;
end $$;
create function reservation_private.valid_source_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when v->>'kind'='user_reported' then reservation_private.exact_v1(v,array['kind','localMaterialId','localContentHash','locator'])
 and (v->'localMaterialId'='null'::jsonb or reservation_private.uuid_v1(v->'localMaterialId'))
 and (v->'localContentHash'='null'::jsonb or jsonb_typeof(v->'localContentHash')='string' and v->>'localContentHash' ~ '^[0-9a-f]{64}$') and reservation_private.text_v1(v->'locator',500)
 when v->>'kind'='artifact_reference' then reservation_private.exact_v1(v,array['kind','artifactId','artifactRevision','sourceReceiptId','sourceDigest','locator'])
 and reservation_private.uuid_v1(v->'artifactId') and reservation_private.integer_v1(v->'artifactRevision',1,1000) and reservation_private.uuid_v1(v->'sourceReceiptId')
 and jsonb_typeof(v->'sourceDigest')='string' and v->>'sourceDigest' ~ '^[0-9a-f]{64}$' and v->'locator'<>'null'::jsonb and reservation_private.text_v1(v->'locator',500)
 else false end
$$;
create function reservation_private.valid_command_v1(v jsonb) returns boolean language sql stable set search_path='' as $$
 select reservation_private.exact_v1(v,array['operationId','referenceId','expectedTripVersion','expectedRevision','fields','source','explicitlyConfirmed'])
 and reservation_private.uuid_v1(v->'operationId') and reservation_private.uuid_v1(v->'referenceId') and reservation_private.integer_v1(v->'expectedTripVersion',0,999999999)
 and reservation_private.integer_v1(v->'expectedRevision',0,9007199254740990) and v->'explicitlyConfirmed'='true'::jsonb
 and reservation_private.valid_fields_v1(v->'fields') and reservation_private.valid_source_v1(v->'source')
$$;
create function reservation_private.ms_v1(v timestamptz) returns text language sql immutable set search_path='' as $$select to_char(v at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')$$;
create function reservation_private.digest_v1(v jsonb) returns text language sql immutable set search_path='' as $$ select encode(sha256(convert_to(v::text,'UTF8')),'hex') $$;
create function reservation_private.identity_v1(v jsonb) returns text language plpgsql immutable set search_path='' set timezone='UTC' as $$
declare normalized jsonb:='{}';k text;s text;
begin
 if v->>'supplier' in ('booking','trip') and v->'externalReference'<>'null'::jsonb then return reservation_private.digest_v1(jsonb_build_array('supplier_code',v->>'supplier',regexp_replace(v->>'externalReference','^[[:space:]]+|[[:space:]]+$','','g')));end if;
 for k,s in select key,value#>>'{}' from jsonb_each(v) loop
 if k in ('startsAt','endsAt') then normalized:=normalized||jsonb_build_object(k,reservation_private.ms_v1(reservation_private.timestamp_v1(s)));
 else normalized:=normalized||jsonb_build_object(k,case when s is null then null else regexp_replace(regexp_replace(s,'^[[:space:]]+|[[:space:]]+$','','g'),'[[:space:]]+',' ','g') end);end if;end loop;
 return reservation_private.digest_v1(jsonb_build_array('complete_fields',normalized));
end $$;
create table reservation_private.current_v1(
 owner_id uuid not null references auth.users(id) on delete cascade,reference_id uuid not null,trip_id uuid not null references public.trips(id) on delete cascade,
 trip_version integer not null check(trip_version between 0 and 999999999),revision bigint not null check(revision between 1 and 9007199254740990),
 fields jsonb not null,source jsonb not null check(source->>'kind'='user_reported'),
 identity_digest text not null check(identity_digest ~ '^[0-9a-f]{64}$'),content_digest text not null check(content_digest ~ '^[0-9a-f]{64}$'),confirmed_at timestamptz not null,
 primary key(owner_id,reference_id),unique(owner_id,reference_id,trip_id),unique(owner_id,trip_id,identity_digest)
);
create index reservation_current_trip on reservation_private.current_v1(trip_id,owner_id,reference_id);
create table reservation_private.events_v1(
 owner_id uuid not null references auth.users(id) on delete cascade,reference_id uuid not null,trip_id uuid not null references public.trips(id) on delete cascade,
 revision bigint not null,operation_id uuid not null,trip_version integer not null,status text not null check(status in ('reserved','amended','cancelled','unknown')),
 evidence_tier text not null default 'user_reported' check(evidence_tier='user_reported'),source_kind text not null default 'user_reported' check(source_kind='user_reported'),
 content_digest text not null check(content_digest ~ '^[0-9a-f]{64}$'),confirmed_at timestamptz not null,
 primary key(owner_id,reference_id,revision),foreign key(owner_id,reference_id,trip_id) references reservation_private.current_v1(owner_id,reference_id,trip_id) on delete cascade
);
create index reservation_event_trip on reservation_private.events_v1(trip_id);
create table reservation_private.operations_v1(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,trip_id uuid not null references public.trips(id) on delete cascade,reference_id uuid not null,
 operation_text text not null,reference_text text not null,
 command_digest text not null check(command_digest ~ '^[0-9a-f]{64}$'),expected_trip_version integer not null,expected_revision bigint not null,applied_revision bigint not null,
 check(operation_text::uuid=operation_id and reference_text::uuid=reference_id),
 primary key(owner_id,operation_id),foreign key(owner_id,reference_id,trip_id) references reservation_private.current_v1(owner_id,reference_id,trip_id) on delete cascade
);
create index reservation_operation_reference on reservation_private.operations_v1(owner_id,reference_id,applied_revision);
create index reservation_operation_trip on reservation_private.operations_v1(trip_id);
do $$ declare t text;begin foreach t in array array['current_v1','events_v1','operations_v1'] loop
 execute format('alter table reservation_private.%I enable row level security',t);execute format('revoke all on reservation_private.%I from public,anon,authenticated,service_role',t);end loop;end $$;
create function reservation_private.immutable_v1() returns trigger language plpgsql set search_path='' as $$begin raise exception 'RESERVATION_ACK_IMMUTABLE';end $$;
create trigger reservation_event_immutable before update on reservation_private.events_v1 for each row execute function reservation_private.immutable_v1();
create trigger reservation_operation_immutable before update on reservation_private.operations_v1 for each row execute function reservation_private.immutable_v1();
create function reservation_private.actor_v1() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid;
begin
 if u is null or auth.role() is distinct from 'authenticated' or auth.jwt()->>'is_anonymous' is distinct from 'false' then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 -- Prelock NOWAIT before the original actor's account lock; retain its live-session gate.
 perform 1 from identity_private.mobile_accounts where owner_id=u for update nowait;
 u:=turn_private.text_owner();s:=(auth.jwt()->>'session_id')::uuid;
 if exists(select 1 from identity_private.mobile_attempts where session_id=s) or exists(select 1 from identity_private.mobile_login_proofs where session_id=s) then perform public.native_session_v2('session');end if;
 return u;
end $$;
create function reservation_private.trip_v1(u uuid,trip uuid) returns integer language plpgsql security definer set search_path='' as $$
declare head integer;
begin
 select head_version into head from public.trips where id=trip and owner_id=u for share nowait;if not found then return null;end if;
 if exists(select 1 from public.trip_archives where trip_id=trip) or exists(select 1 from privacy_private.trip_deletions where trip_id=trip) then return null;end if;
 return head;
end $$;
create function reservation_private.current_wire_v1(c reservation_private.current_v1,head integer) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('kind','reservation_reference/1','referenceId',c.reference_id,'tripId',c.trip_id,'tripVersion',head,'revision',c.revision,'fields',c.fields,'evidenceTier','user_reported','source',c.source,'sourceQualification','untrusted','confirmedBy','explicit_user','confirmedAt',reservation_private.ms_v1(c.confirmed_at),'contentDigest',c.content_digest,'sourceVersion',null,'planningUse','confirmed_reference_only','tripMutation','none')
$$;
create function reservation_private.command_v1(c reservation_private.current_v1,o reservation_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('operationId',o.operation_text,'referenceId',o.reference_text,'expectedTripVersion',o.expected_trip_version,'expectedRevision',o.expected_revision,'fields',c.fields,'source',c.source,'explicitlyConfirmed',true)
$$;
create function reservation_private.confirmation_v1(c reservation_private.current_v1,o reservation_private.operations_v1,cmd jsonb) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('kind','reservation_confirmation/1','operationId',o.operation_id,'tripId',o.trip_id,'referenceId',o.reference_id,'resultRevision',o.applied_revision,'commandDigest',o.command_digest,'command',cmd,'receipt',reservation_private.current_wire_v1(c,c.trip_version))
$$;
create function public.confirm_reservation_reference_v1(p_trip_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid;head integer;ref uuid;op uuid;expected bigint;digest text;identity text;cmd jsonb;c reservation_private.current_v1%rowtype;o reservation_private.operations_v1%rowtype;
begin
 if p_trip_id is null or reservation_private.valid_command_v1(p_input) is distinct from true then raise exception 'INVALID_INPUT';end if;
 u:=reservation_private.actor_v1();head:=reservation_private.trip_v1(u,p_trip_id);if head is null then return jsonb_build_object('kind','unavailable');end if;
 if p_input->'source'->>'kind'='artifact_reference' then raise exception 'RESERVATION_SOURCE_UNAVAILABLE';end if;
 ref:=(p_input->>'referenceId')::uuid;op:=(p_input->>'operationId')::uuid;expected:=(p_input->>'expectedRevision')::bigint;
 cmd:=p_input||jsonb_build_object('expectedTripVersion',(p_input->>'expectedTripVersion')::integer,'expectedRevision',expected);
 digest:=reservation_private.digest_v1(jsonb_build_array(u,p_trip_id,cmd));
 select * into c from reservation_private.current_v1 where owner_id=u and reference_id=ref for update nowait;
 select * into o from reservation_private.operations_v1 where owner_id=u and operation_id=op;
 if found then
 if o.trip_id<>p_trip_id or o.reference_id<>ref or o.command_digest<>digest or c.trip_id is distinct from p_trip_id or c.revision is distinct from o.applied_revision then return jsonb_build_object('kind','conflict');end if;
 if reservation_private.digest_v1(jsonb_build_array(u,p_trip_id,reservation_private.command_v1(c,o)))<>digest then return jsonb_build_object('kind','unavailable');end if;
 return reservation_private.confirmation_v1(c,o,cmd);end if;
 if head<>(p_input->>'expectedTripVersion')::integer or coalesce(c.revision,0)<>expected or c.trip_id is not null and c.trip_id<>p_trip_id then return jsonb_build_object('kind','conflict');end if;
 if expected>=9007199254740990 then raise exception 'INVALID_INPUT';end if;
 identity:=reservation_private.identity_v1(p_input->'fields');
 if exists(select 1 from reservation_private.current_v1 where owner_id=u and trip_id=p_trip_id and identity_digest=identity and reference_id<>ref) then return jsonb_build_object('kind','conflict');end if;
 if c.reference_id is null then
 insert into reservation_private.current_v1(owner_id,reference_id,trip_id,trip_version,revision,fields,source,identity_digest,content_digest,confirmed_at)
 values(u,ref,p_trip_id,head,1,p_input->'fields',p_input->'source',identity,reservation_private.digest_v1(jsonb_build_array(p_input->'fields',p_input->'source')),clock_timestamp()) returning * into c;
 else
 update reservation_private.current_v1 set trip_version=head,revision=revision+1,fields=p_input->'fields',source=p_input->'source',identity_digest=identity,content_digest=reservation_private.digest_v1(jsonb_build_array(p_input->'fields',p_input->'source')),confirmed_at=clock_timestamp() where owner_id=u and reference_id=ref returning * into c;end if;
 insert into reservation_private.events_v1(owner_id,reference_id,trip_id,revision,operation_id,trip_version,status,content_digest,confirmed_at) values(u,ref,p_trip_id,c.revision,op,head,c.fields->>'status',c.content_digest,c.confirmed_at);
 insert into reservation_private.operations_v1(owner_id,operation_id,trip_id,reference_id,operation_text,reference_text,command_digest,expected_trip_version,expected_revision,applied_revision) values(u,op,p_trip_id,ref,p_input->>'operationId',p_input->>'referenceId',digest,head,expected,c.revision) returning * into o;
 return reservation_private.confirmation_v1(c,o,cmd);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');
end $$;
create function public.read_reservation_references_v1(p_trip_id uuid,p_expected_trip_version integer,p_reference_id uuid default null,p_after_reference_id uuid default null,p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;head integer;c reservation_private.current_v1%rowtype;items jsonb;more boolean;cursor uuid;
begin
 if p_trip_id is null or p_expected_trip_version is null or p_expected_trip_version not between 0 and 999999999 or p_limit is null or p_limit not between 1 and 20 or p_reference_id is not null and (p_after_reference_id is not null or p_limit<>20) then raise exception 'INVALID_INPUT';end if;
 u:=reservation_private.actor_v1();head:=reservation_private.trip_v1(u,p_trip_id);if head is null then return jsonb_build_object('kind','unavailable');end if;
 if head<>p_expected_trip_version then return jsonb_build_object('kind','conflict');end if;
 if p_reference_id is not null then
 select * into c from reservation_private.current_v1 where owner_id=u and trip_id=p_trip_id and reference_id=p_reference_id for share nowait;
 if not found then return jsonb_build_object('kind','unavailable');end if;return reservation_private.current_wire_v1(c,head);end if;
 if p_after_reference_id is not null and not exists(select 1 from reservation_private.current_v1 where owner_id=u and trip_id=p_trip_id and reference_id=p_after_reference_id) then raise exception 'INVALID_RESERVATION_CURSOR';end if;
 with candidates as(select * from reservation_private.current_v1 where owner_id=u and trip_id=p_trip_id and (p_after_reference_id is null or reference_id>p_after_reference_id) order by reference_id limit p_limit+1),delivered as(select * from candidates order by reference_id limit p_limit)
 select coalesce((select jsonb_agg(reservation_private.current_wire_v1(d,head) order by d.reference_id) from delivered d),'[]'),(select count(*)>p_limit from candidates),(select reference_id from delivered order by reference_id desc limit 1) into items,more,cursor;
 return jsonb_build_object('kind','reservation_references/1','tripId',p_trip_id,'tripVersion',head,'items',items,'hasMore',more,'nextCursor',case when more then cursor else null end);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');
end $$;
create function public.read_reservation_operation_v1(p_trip_id uuid,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;head integer;c reservation_private.current_v1%rowtype;o reservation_private.operations_v1%rowtype;cmd jsonb;applied boolean;
begin
 if p_trip_id is null or p_operation_id is null then raise exception 'INVALID_INPUT';end if;
 u:=reservation_private.actor_v1();head:=reservation_private.trip_v1(u,p_trip_id);if head is null then return jsonb_build_object('kind','unavailable');end if;
 select * into o from reservation_private.operations_v1 where owner_id=u and trip_id=p_trip_id and operation_id=p_operation_id;if not found then return jsonb_build_object('kind','unavailable');end if;
 select * into c from reservation_private.current_v1 where owner_id=u and trip_id=p_trip_id and reference_id=o.reference_id for share nowait;if not found then return jsonb_build_object('kind','unavailable');end if;
 applied:=c.revision=o.applied_revision;
 if applied then cmd:=reservation_private.command_v1(c,o);if reservation_private.digest_v1(jsonb_build_array(u,p_trip_id,cmd))<>o.command_digest then return jsonb_build_object('kind','unavailable');end if;end if;
 return jsonb_build_object('kind','reservation_operation/1','operationId',o.operation_id,'tripId',o.trip_id,'referenceId',o.reference_id,'appliedRevision',o.applied_revision,'currentRevision',c.revision,'commandDigest',o.command_digest,'command',cmd,'result',case when applied then 'applied' else 'superseded' end,'receipt',case when applied then reservation_private.current_wire_v1(c,c.trip_version) else null end,'current',reservation_private.current_wire_v1(c,head),'tripMutation','none');
exception when lock_not_available then return jsonb_build_object('kind','unavailable');
end $$;
-- Archive/deletion writers already hold account/Trip authority. FK deletion is
-- physical erasure; triggers clear personal references at admission/archive.
create function reservation_private.cleanup_trip_v1() returns trigger language plpgsql security definer set search_path='' as $$begin
 delete from reservation_private.current_v1 where trip_id=new.trip_id;return new;end $$;
create trigger reservation_archive_cleanup after insert on public.trip_archives for each row execute function reservation_private.cleanup_trip_v1();
create trigger reservation_delete_cleanup after insert on privacy_private.trip_deletions for each row execute function reservation_private.cleanup_trip_v1();
-- Metadata preparation ONLY: existing D2 inventory is not enlarged/enrolled.
create function reservation_private.export_metadata_v1(p_request_id uuid,p_lease_id uuid,p_generation integer,p_after_reference_id uuid default null,p_limit integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$
declare j export_private.core_jobs_v1%rowtype;items jsonb;more boolean;cursor uuid;truncated boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if p_request_id is null or p_lease_id is null or p_generation is null or p_generation not between 1 and 3 or p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
 j:=export_private.lock_job_v1(p_request_id,true);if j.request_id is null or export_private.live_lease_v1(j,p_lease_id,p_generation) is distinct from true then return jsonb_build_object('kind','unavailable');end if;
 if p_after_reference_id is not null and not exists(select 1 from reservation_private.current_v1 where owner_id=j.owner_id and reference_id=p_after_reference_id) then raise exception 'INVALID_EXPORT_CURSOR';end if;
 with candidates as(select c.* from reservation_private.current_v1 c join public.trips t on t.id=c.trip_id and t.owner_id=c.owner_id where c.owner_id=j.owner_id and not exists(select 1 from public.trip_archives a where a.trip_id=c.trip_id) and not exists(select 1 from privacy_private.trip_deletions d where d.trip_id=c.trip_id) and (p_after_reference_id is null or c.reference_id>p_after_reference_id) order by c.reference_id limit p_limit+1),delivered as(select * from candidates order by reference_id limit p_limit)
 select coalesce((select jsonb_agg(jsonb_build_object('current',reservation_private.current_wire_v1(d,d.trip_version),'events',(select coalesce(jsonb_agg(e.body order by e.revision),'[]') from(select ev.revision,jsonb_build_object('revision',ev.revision,'operationId',ev.operation_id,'tripVersion',ev.trip_version,'status',ev.status,'evidenceTier',ev.evidence_tier,'sourceKind',ev.source_kind,'contentDigest',ev.content_digest,'confirmedAt',reservation_private.ms_v1(ev.confirmed_at)) body from reservation_private.events_v1 ev where ev.owner_id=d.owner_id and ev.reference_id=d.reference_id order by ev.revision limit 100) e),'operations',(select coalesce(jsonb_agg(o.body order by o.applied_revision),'[]') from(select op.applied_revision,jsonb_build_object('operationId',op.operation_id,'referenceId',op.reference_id,'tripId',op.trip_id,'appliedRevision',op.applied_revision) body from reservation_private.operations_v1 op where op.owner_id=d.owner_id and op.reference_id=d.reference_id order by op.applied_revision limit 100)o),'historical',true) order by d.reference_id) from delivered d),'[]'),(select count(*)>p_limit from candidates),(select reference_id from delivered order by reference_id desc limit 1),exists(select 1 from delivered d where (select count(*) from reservation_private.events_v1 e where e.owner_id=d.owner_id and e.reference_id=d.reference_id)>100 or (select count(*) from reservation_private.operations_v1 o where o.owner_id=d.owner_id and o.reference_id=d.reference_id)>100) into items,more,cursor,truncated;
 return jsonb_build_object('schemaVersion','reservation-export/1','items',items,'hasMore',more,'nextCursor',case when more then cursor else null end,'sectionComplete',not more and not truncated,'enrolled',false,'inventoryStatus','partial');
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;
revoke all on all functions in schema reservation_private from public,anon,authenticated,service_role;
revoke all on function public.confirm_reservation_reference_v1(uuid,jsonb),public.read_reservation_references_v1(uuid,integer,uuid,uuid,integer),public.read_reservation_operation_v1(uuid,uuid) from public,anon,authenticated,service_role;
