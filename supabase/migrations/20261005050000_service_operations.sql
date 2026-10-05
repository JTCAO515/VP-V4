-- VPJ-32: explicit Case grants, measured operator capacity, exact-byte receipts.
-- No enrollment, public EXECUTE grant, supplier action or Trip writer.
create schema service_operations_private;
revoke all on schema service_operations_private from public,anon,authenticated,service_role;
create table service_operations_private.settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into service_operations_private.settings(singleton) values(true);
create table service_operations_private.operators (
 actor_id uuid primary key references service_cases_private.staff(actor_id) on delete cascade,
 enabled boolean not null default false
);
create table service_operations_private.shifts (
 id uuid primary key, actor_id uuid not null references service_operations_private.operators(actor_id) on delete cascade,
 starts_at timestamptz not null, ends_at timestamptz not null, enabled boolean not null default false,
 check(ends_at>starts_at and ends_at-starts_at<=interval '8 hours'), unique(id,actor_id)
);
create index service_operations_shift_actor on service_operations_private.shifts(actor_id,starts_at,ends_at);
create table service_operations_private.services (
 case_id uuid primary key references service_cases_private.cases(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null default 1 check(revision>0), grant_revision integer not null,
 status text not null check(status in('queued','accepted','assigned','waiting_external','resolved','unresolved','cancelled')),
 urgency text not null check(urgency in('normal','urgent')),
 trip_id uuid, trip_version integer, proposal_id uuid,
 staff_id uuid, staff_label text, shift_id uuid, accepted_at timestamptz, shift_ends_at timestamptz,
 evidence jsonb not null default '[]', updated_at timestamptz not null default clock_timestamp(),
 check((trip_id is null and trip_version is null) or (trip_id is not null and trip_version>=0)),
 check(status not in('accepted','assigned','waiting_external','resolved','unresolved') or
 (staff_id is not null and staff_label is not null and accepted_at is not null and shift_ends_at>accepted_at))
);
create index service_operations_owner on service_operations_private.services(owner_id,case_id);
create table service_operations_private.slots (
 shift_id uuid not null references service_operations_private.shifts(id) on delete cascade,
 slot integer not null check(slot between 1 and 100), case_id uuid unique references service_cases_private.cases(id) on delete set null,
 primary key(shift_id,slot)
);
create table service_operations_private.minutes (
 case_id uuid not null references service_operations_private.services(case_id) on delete cascade,
 operation_id uuid not null, staff_id uuid not null, shift_id uuid not null,
 started_at timestamptz not null, ended_at timestamptz not null,
 check(ended_at>started_at and ended_at-started_at<=interval '8 hours'), primary key(case_id,operation_id)
);
create index service_operations_minutes_staff on service_operations_private.minutes(staff_id,started_at,ended_at);
create table service_operations_private.audit (
 case_id uuid not null references service_operations_private.services(case_id) on delete cascade,
 revision integer not null, actor_id uuid not null, action text not null, status text not null,
 created_at timestamptz not null default clock_timestamp(), primary key(case_id,revision)
);
create table service_operations_private.operations (
 actor_id uuid not null references auth.users(id) on delete cascade, session_id uuid not null,
 surface text not null check(surface in('owner','staff')), operation_id uuid not null,
 owner_id uuid not null references auth.users(id) on delete cascade,
 case_id uuid, grant_revision integer not null,
 request_bytes bytea, request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'), receipt jsonb,
 erased boolean not null default false, created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,session_id,surface,operation_id),
 check((erased and request_bytes is null and receipt is null and case_id is null) or
 (not erased and request_bytes is not null and receipt is not null and case_id is not null))
);
create index service_operations_operations_case on service_operations_private.operations(case_id);
do $$declare t text;begin
 foreach t in array array['settings','operators','shifts','services','slots','minutes','audit','operations'] loop
 execute format('alter table service_operations_private.%I enable row level security',t);
 execute format('revoke all on service_operations_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function service_operations_private.exact(v jsonb,keys text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and v ?& keys and v-keys='{}',false)
$$;
create function service_operations_private.uuid(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',false)
$$;
create function service_operations_private.integer(v jsonb,min_value bigint,max_value bigint) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='number' and v#>>'{}' ~ '^(0|[1-9][0-9]{0,15})$' and (v#>>'{}')::numeric between min_value and max_value,false)
$$;
create function service_operations_private.ms(v timestamptz) returns bigint language sql immutable set search_path='' as $$ select floor(extract(epoch from v)*1000)::bigint $$;
create function service_operations_private.valid(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare a text:=v->>'action';keys text[]:=array['action','operationId','caseId','expectedRevision','grantRevision'];e jsonb;
begin
 if a='workspace' then return service_operations_private.exact(v,array['action']);end if;
 if a='read' then return service_operations_private.exact(v,array['action','caseId']) and service_operations_private.uuid(v->'caseId');end if;
 if a='read_operation' then return service_operations_private.exact(v,array['action','operationId']) and service_operations_private.uuid(v->'operationId');end if;
 if not service_operations_private.uuid(v->'operationId') or not service_operations_private.uuid(v->'caseId') or not service_operations_private.integer(v->'expectedRevision',0,2147483647) or not service_operations_private.integer(v->'grantRevision',0,2147483647) then return false;end if;
 if a in('cancel','accept','assign') then return service_operations_private.exact(v,keys);end if;
 if a='request' then
  return service_operations_private.exact(v,keys||array['urgency','trip']) and v->>'urgency' in('normal','urgent') and
  (service_operations_private.exact(v->'trip',array['kind']) and v->'trip'->>'kind'='unknown' or
   service_operations_private.exact(v->'trip',array['kind','tripId','headVersion']) and v->'trip'->>'kind'='bound' and service_operations_private.uuid(v->'trip'->'tripId') and service_operations_private.integer(v->'trip'->'headVersion',0,2147483647));
 end if;
 if a='select_proposal' then return service_operations_private.exact(v,keys||array['proposal']) and service_operations_private.exact(v->'proposal',array['proposalId','tripId','baseVersion']) and service_operations_private.uuid(v->'proposal'->'proposalId') and service_operations_private.uuid(v->'proposal'->'tripId') and service_operations_private.integer(v->'proposal'->'baseVersion',0,2147483647);end if;
 if a is distinct from 'update' or not service_operations_private.exact(v,keys||array['status','evidence','minutes','proposal']) or coalesce(v->>'status','') not in('waiting_external','resolved','unresolved') or v->'proposal' is distinct from 'null'::jsonb or jsonb_typeof(v->'evidence') is distinct from 'array' then return false;end if;
 if jsonb_array_length(v->'evidence')>10 then return false;end if;
 for e in select value from jsonb_array_elements(v->'evidence') loop
  if not service_operations_private.exact(e,array['kind','note','reference','observedAt']) or coalesce(e->>'kind','') not in('tutorial','contacted_provider','external_resolution') or jsonb_typeof(e->'note') is distinct from 'string' or place_actions_private.utf16_length_v1(e->>'note') not between 1 and 1000 or length(btrim(e->>'note'))=0 or jsonb_typeof(e->'reference') is distinct from 'string' or place_actions_private.utf16_length_v1(e->>'reference') not between 1 and 300 or length(btrim(e->>'reference'))=0 or not service_operations_private.integer(e->'observedAt',1,8639999999999999) then return false;end if;
 end loop;
 if v->'minutes' is distinct from 'null'::jsonb and (not service_operations_private.exact(v->'minutes',array['startedAt','endedAt']) or not service_operations_private.integer(v->'minutes'->'startedAt',1,8639999999999999) or not service_operations_private.integer(v->'minutes'->'endedAt',1,8639999999999999)) then return false;end if;
 if v->'minutes' is distinct from 'null'::jsonb and ((v->'minutes'->>'endedAt')::numeric<=(v->'minutes'->>'startedAt')::numeric or (v->'minutes'->>'endedAt')::numeric-(v->'minutes'->>'startedAt')::numeric>28800000) then return false;end if;
 return v->>'status'<>'resolved' or exists(select 1 from jsonb_array_elements(v->'evidence')x where x->>'kind' in('tutorial','external_resolution'));
end $$;

create function service_operations_private.immutable_operation() returns trigger language plpgsql set search_path='' as $$
begin
 if NEW.erased and not OLD.erased and NEW.request_bytes is null and NEW.receipt is null and NEW.case_id is null
 and (to_jsonb(NEW)-array['erased','request_bytes','receipt','case_id'])=(to_jsonb(OLD)-array['erased','request_bytes','receipt','case_id']) then return NEW;end if;
 raise exception 'CASE_OPERATION_IMMUTABLE';
end $$;
create trigger service_operation_immutable before update on service_operations_private.operations for each row execute function service_operations_private.immutable_operation();

create function service_operations_private.erase_case(p_case uuid,p_cancel boolean,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare s service_operations_private.services;
begin
 update service_operations_private.operations set erased=true,request_bytes=null,receipt=null,case_id=null where case_id=p_case and not erased;
 update service_operations_private.slots set case_id=null where case_id=p_case;
 update service_operations_private.services set trip_id=null,trip_version=null,proposal_id=null,
 status=case when p_cancel and status not in('resolved','unresolved','cancelled') then 'cancelled' else status end,
 revision=revision+1,updated_at=clock_timestamp() where case_id=p_case returning * into s;
 if found then insert into service_operations_private.audit(case_id,revision,actor_id,action,status) values(s.case_id,s.revision,coalesce(p_actor,s.owner_id),'grant_withdrawn',s.status);end if;
end $$;
create function service_operations_private.grant_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then perform service_operations_private.erase_case(OLD.id,false,OLD.owner_id);return OLD;end if;
 if NEW.revision<>OLD.revision and (NEW.revoked or NEW.recipient_id is distinct from OLD.recipient_id or NEW.revision<>OLD.revision) then
 perform service_operations_private.erase_case(NEW.id,true,NEW.owner_id);end if;
 return NEW;
end $$;
create trigger service_operations_grant_changed after update on service_cases_private.cases for each row execute function service_operations_private.grant_changed();
create trigger service_operations_case_delete before delete on service_cases_private.cases for each row execute function service_operations_private.grant_changed();

create function service_operations_private.shift_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from service_operations_private.operators where actor_id=NEW.actor_id for update;
 if NEW.enabled and exists(select 1 from service_operations_private.shifts where actor_id=NEW.actor_id and id<>NEW.id and enabled and tstzrange(starts_at,ends_at,'[)') && tstzrange(NEW.starts_at,NEW.ends_at,'[)')) then raise exception 'CASE_SHIFT_OVERLAP';end if;
 return NEW;
end $$;
create trigger service_operations_shift_guard before insert or update on service_operations_private.shifts for each row execute function service_operations_private.shift_guard();

create function service_operations_private.staff_qualified(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from service_cases_private.staff where actor_id=p_actor and active for share;
 if not found then raise exception 'CASE_FORBIDDEN';end if;
 perform 1 from service_operations_private.operators where actor_id=p_actor and enabled for update;
 if not found then raise exception 'CASE_FORBIDDEN';end if;
end $$;
create function service_operations_private.occupied(p_case uuid,p_shift uuid) returns boolean language sql volatile set search_path='' as $$
 select exists(select 1 from service_operations_private.services s join service_cases_private.cases c on c.id=s.case_id
 join service_operations_private.shifts h on h.id=s.shift_id join service_operations_private.operators o on o.actor_id=h.actor_id
 join service_cases_private.staff f on f.actor_id=o.actor_id
 where s.case_id=p_case and s.shift_id=p_shift and s.status in('accepted','assigned','waiting_external') and c.revision=s.grant_revision and not c.revoked and c.expires_at>clock_timestamp() and c.recipient_id=s.staff_id and f.active and o.enabled and h.enabled and h.starts_at<=clock_timestamp() and h.ends_at>clock_timestamp())
$$;
create function service_operations_private.capacity(p_recipient uuid default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare state text;
begin
 if not exists(select 1 from service_operations_private.shifts h join service_operations_private.operators o on o.actor_id=h.actor_id join service_cases_private.staff f on f.actor_id=o.actor_id where h.enabled and o.enabled and f.active and h.starts_at<=clock_timestamp() and h.ends_at>clock_timestamp() and (p_recipient is null or h.actor_id=p_recipient) and exists(select 1 from service_operations_private.slots where shift_id=h.id)) then state:='unknown';
 elsif exists(select 1 from service_operations_private.slots l join service_operations_private.shifts h on h.id=l.shift_id join service_operations_private.operators o on o.actor_id=h.actor_id join service_cases_private.staff f on f.actor_id=o.actor_id where h.enabled and o.enabled and f.active and h.starts_at<=clock_timestamp() and h.ends_at>clock_timestamp() and (p_recipient is null or h.actor_id=p_recipient) and not service_operations_private.occupied(l.case_id,h.id)) then state:='available';else state:='full';end if;
 return jsonb_build_object('state',state,'checkedAt',service_operations_private.ms(clock_timestamp()));
end $$;

create function service_operations_private.qualify(c service_cases_private.cases,s service_operations_private.services,u uuid,surface text) returns void language plpgsql security definer set search_path='' as $$
begin
 if surface='owner' then if c.owner_id is distinct from u then raise exception 'CASE_FORBIDDEN';end if;
 else
  perform service_operations_private.staff_qualified(u);
  if c.recipient_id is distinct from u or c.revoked or c.expires_at<=clock_timestamp() or (s.case_id is not null and s.grant_revision<>c.revision) then raise exception 'CASE_FORBIDDEN';end if;
  if s.staff_id is not null then
   if s.staff_id<>u then raise exception 'CASE_FORBIDDEN';end if;
   perform 1 from service_operations_private.shifts where id=s.shift_id and actor_id=u and enabled and starts_at<=clock_timestamp() and ends_at>clock_timestamp() and ends_at=s.shift_ends_at for share nowait;
   if not found then raise exception 'CASE_FORBIDDEN';end if;
   if s.status in('accepted','assigned','waiting_external') then
    perform 1 from service_operations_private.slots where shift_id=s.shift_id and case_id=s.case_id for share;
    if not found then raise exception 'CASE_FORBIDDEN';end if;
   end if;
  end if;
 end if;
end $$;
create function service_operations_private.projection(c service_cases_private.cases,s service_operations_private.services,surface text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trip jsonb:='{"kind":"unknown"}';proposal jsonb;minutes_total bigint;
begin
 if surface='owner' then
 if s.trip_id is not null and exists(select 1 from public.trips t where t.id=s.trip_id and t.owner_id=s.owner_id and t.head_version=s.trip_version and not exists(select 1 from privacy_private.trip_deletions d where d.trip_id=t.id)) then
 trip:=jsonb_build_object('kind','bound','tripId',s.trip_id,'headVersion',s.trip_version);
 if s.proposal_id is not null and exists(select 1 from public.trip_proposals p where p.id=s.proposal_id and p.owner_id=s.owner_id and p.trip_id=s.trip_id and p.base_trip_version=s.trip_version and p.status='pending' and p.expires_at>clock_timestamp()) then proposal:=jsonb_build_object('proposalId',s.proposal_id,'tripId',s.trip_id,'baseVersion',s.trip_version);end if;
 end if;
 end if;
 select floor(coalesce(sum(extract(epoch from ended_at-started_at)),0)/60)::bigint into minutes_total from service_operations_private.minutes where case_id=s.case_id;
 if minutes_total>2147483647 then raise exception 'CASE_WORKSPACE_LIMIT';end if;
 return jsonb_build_object('caseId',c.id,'revision',s.revision,'grantRevision',c.revision,'status',s.status,'category',c.category,'problem',c.problem,
 'grantState',case when c.revoked then 'revoked' when c.expires_at<=clock_timestamp() then 'expired' else 'active' end,'expiresAt',service_operations_private.ms(c.expires_at),'updatedAt',service_operations_private.ms(s.updated_at),'urgency',s.urgency,'capacity',service_operations_private.capacity(c.recipient_id),
 'staff',case when s.staff_id is null then null else jsonb_build_object('actorId',s.staff_id,'label',s.staff_label,'acceptedAt',service_operations_private.ms(s.accepted_at),'shiftEndsAt',service_operations_private.ms(s.shift_ends_at)) end,
 'brief','{"kind":"unknown"}'::jsonb,'sources','{"kind":"unknown"}'::jsonb,'trip',trip,'evidence',s.evidence,'manualMinutes',minutes_total,'manualMinutesScope','recorded_only','proposal',proposal);
end $$;

create function public.service_case_operations_v1(p_input jsonb,p_request_bytes text,p_surface text)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare u uuid;session uuid;a text;v jsonb;raw bytea;op uuid;cid uuid;dig text;abandon boolean:=false;
 c service_cases_private.cases;s service_operations_private.services;o service_operations_private.operations;
 h service_operations_private.shifts;l service_operations_private.slots;out jsonb;items jsonb:='[]';n integer:=0;
 t public.trips;proposal public.trip_proposals;started timestamptz;ended timestamptz;k record;
begin
 u:=service_cases_private.actor();session:=(auth.jwt()->>'session_id')::uuid;
 if p_surface is null or p_surface not in('owner','staff') or p_request_bytes is null or octet_length(convert_to(p_request_bytes,'UTF8')) not between 2 and 48000 then raise exception 'INVALID_INPUT';end if;
 begin v:=p_request_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 if v is distinct from p_input then raise exception 'INVALID_INPUT';end if;
 if not exists(select 1 from service_operations_private.settings where enabled) then raise exception 'SERVICE_OPERATIONS_DISABLED';end if;
 a:=p_input->>'action';
 if a<>'abandon' and octet_length(convert_to(p_request_bytes,'UTF8'))>24000 then raise exception 'INVALID_INPUT';end if;
 if a='abandon' then
  if not service_operations_private.exact(p_input,array['action','operationId','mutationBytes']) or not service_operations_private.uuid(p_input->'operationId') or jsonb_typeof(p_input->'mutationBytes') is distinct from 'string' then raise exception 'INVALID_INPUT';end if;
  begin v:=(p_input->>'mutationBytes')::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
  if v->'operationId' is distinct from p_input->'operationId' or coalesce(v->>'action','') not in('request','cancel','accept','assign','update','select_proposal') then raise exception 'INVALID_INPUT';end if;
  raw:=convert_to(p_input->>'mutationBytes','UTF8');abandon:=true;
 else raw:=convert_to(p_request_bytes,'UTF8');end if;
 if octet_length(raw)>24000 or service_operations_private.valid(v) is distinct from true then raise exception 'INVALID_INPUT';end if;
 if p_surface='owner' and v->>'action' in('accept','assign','update') or p_surface='staff' and v->>'action' in('request','cancel','select_proposal') then raise exception 'CASE_FORBIDDEN';end if;
 if a='workspace' then
  -- Lock Cases in stable order before membership/slots; old grant RPC uses this order.
  for c in select c0.* from service_cases_private.cases c0 join service_operations_private.services s0 on s0.case_id=c0.id
   where (p_surface='owner' and c0.owner_id=u) or (p_surface='staff' and c0.recipient_id=u and not c0.revoked and c0.expires_at>clock_timestamp() and c0.revision=s0.grant_revision)
   order by c0.id limit 51 for update of c0 loop
   n:=n+1;if n>50 then raise exception 'CASE_WORKSPACE_LIMIT';end if;
   select * into s from service_operations_private.services where case_id=c.id for update;
   perform service_operations_private.qualify(c,s,u,p_surface);
   items:=items||jsonb_build_array(service_operations_private.projection(c,s,p_surface));
  end loop;
  if p_surface='staff' then perform service_operations_private.staff_qualified(u);end if;
  -- Do not leak a grant that expired during the bounded projection loop.
  if p_surface='staff' and exists(select 1 from jsonb_array_elements(items)x where (x->>'expiresAt')::bigint<=service_operations_private.ms(clock_timestamp())) then raise exception 'CASE_FORBIDDEN';end if;
  return jsonb_build_object('actorId',u,'surface',p_surface,'cases',items,'capacity',service_operations_private.capacity(case when p_surface='staff' then u else null end),'complete',true);
 end if;
 if v ? 'operationId' then
  op:=(v->>'operationId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('service-operations:'||u||':'||session||':'||p_surface||':'||op,0));
  select * into o from service_operations_private.operations where actor_id=u and session_id=session and surface=p_surface and operation_id=op;
 end if;
 if a='read_operation' then
  if o.operation_id is null then if p_surface='staff' then perform service_operations_private.staff_qualified(u);end if;return jsonb_build_object('receipt',null);end if;
  if o.erased then if p_surface='staff' then raise exception 'CASE_FORBIDDEN';else raise exception 'CASE_OPERATION_ERASED';end if;end if;
  cid:=o.case_id;
 else cid:=(v->>'caseId')::uuid;end if;
 select * into c from service_cases_private.cases where id=cid for update;
 if not found then raise exception 'CASE_FORBIDDEN';end if;
 select * into s from service_operations_private.services where case_id=cid for update;
 perform service_operations_private.qualify(c,s,u,p_surface);
 if p_surface='owner' and not c.revoked and c.expires_at<=clock_timestamp() and exists(select 1 from service_operations_private.operations where case_id=cid and not erased) then
  perform service_operations_private.erase_case(cid,true,u);select * into s from service_operations_private.services where case_id=cid;
 end if;
 if op is not null then select * into o from service_operations_private.operations where actor_id=u and session_id=session and surface=p_surface and operation_id=op;end if;
 if a='read_operation' then
  if p_surface='staff' and o.grant_revision<>c.revision then raise exception 'CASE_FORBIDDEN';end if;
  if o.erased then raise exception 'CASE_OPERATION_ERASED';end if;
  return jsonb_build_object('receipt',o.receipt);
 end if;
 if a='read' then
  if s.case_id is null then raise exception 'CASE_NOT_FOUND';end if;
  return service_operations_private.projection(c,s,p_surface);
 end if;
 dig:=encode(extensions.digest(raw,'sha256'),'hex');
 if o.operation_id is not null then
  if o.request_digest<>dig or not o.erased and o.request_bytes is distinct from raw then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
  if o.erased then raise exception 'CASE_OPERATION_ERASED';end if;
  if p_surface='staff' and o.grant_revision<>c.revision then raise exception 'CASE_FORBIDDEN';end if;
  return o.receipt;
 end if;
 a:=v->>'action';
 if abandon then
  -- The same operation lock chooses applied receipt or permanent pre-apply fence.
  out:=jsonb_build_object('operationId',op,'requestDigest',dig,'action',a,'outcome','cancelled','caseId',cid,'revision',coalesce(s.revision,0),'grantRevision',c.revision,'createdAt',service_operations_private.ms(clock_timestamp()));
 else
  if coalesce(s.revision,0)<>(v->>'expectedRevision')::integer or c.revision<>(v->>'grantRevision')::integer then raise exception 'CASE_CONFLICT';end if;
  if a='request' then
   if s.case_id is not null or c.revoked or c.expires_at<=clock_timestamp() then raise exception 'CASE_FORBIDDEN';end if;
   if v->'trip'->>'kind'='bound' then
    select * into t from public.trips where id=(v->'trip'->>'tripId')::uuid and owner_id=u for share nowait;
    if not found or t.head_version<>(v->'trip'->>'headVersion')::integer or exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) then raise exception 'CASE_TRIP_UNAVAILABLE';end if;
   end if;
   insert into service_operations_private.services(case_id,owner_id,grant_revision,status,urgency,trip_id,trip_version)
    values(cid,u,c.revision,'queued',v->>'urgency',t.id,t.head_version) returning * into s;
  elsif a='cancel' then
   if s.case_id is null then raise exception 'CASE_NOT_FOUND';end if;
   if s.status in('resolved','unresolved','cancelled') then raise exception 'CASE_CONFLICT';end if;
   -- Existing Case row and grant audit remain the source of revocation authority.
   update service_cases_private.cases set revoked=true,revision=revision+1 where id=cid returning * into c;
   insert into service_cases_private.audit(case_id,revision,action,actor_id,recipient_id,expires_at) values(cid,c.revision,'revoked',u,c.recipient_id,c.expires_at);
   select * into s from service_operations_private.services where case_id=cid;
  elsif a in('accept','assign','update') then
   if s.case_id is null then raise exception 'CASE_NOT_FOUND';end if;
   perform service_operations_private.staff_qualified(u);
   if a='accept' then
    if s.status<>'queued' then raise exception 'CASE_CONFLICT';end if;
    select * into h from service_operations_private.shifts where actor_id=u and enabled and starts_at<=clock_timestamp() and ends_at>clock_timestamp() order by starts_at,id limit 1 for share nowait;
    if not found then raise exception 'CASE_CAPACITY_UNAVAILABLE';end if;
    -- Lock the whole shift's slots in order so two different Cases cannot oversubscribe.
    perform 1 from service_operations_private.slots where shift_id=h.id order by slot for update;
    update service_operations_private.slots set case_id=null where shift_id=h.id and case_id is not null and not service_operations_private.occupied(case_id,h.id);
    select * into l from service_operations_private.slots where shift_id=h.id and case_id is null order by slot limit 1;
    if not found or h.ends_at<=clock_timestamp() then raise exception 'CASE_CAPACITY_UNAVAILABLE';end if;
    update service_operations_private.slots set case_id=cid where shift_id=h.id and slot=l.slot;
    update service_operations_private.services set status='accepted',staff_id=u,staff_label=(select label from service_cases_private.staff where actor_id=u),shift_id=h.id,accepted_at=clock_timestamp(),shift_ends_at=h.ends_at,revision=revision+1,updated_at=clock_timestamp() where case_id=cid returning * into s;
   else
    if s.staff_id is distinct from u or s.status not in('accepted','assigned','waiting_external') then raise exception 'CASE_CONFLICT';end if;
    select * into h from service_operations_private.shifts where id=s.shift_id and actor_id=u and enabled and starts_at<=clock_timestamp() and ends_at>clock_timestamp() for share nowait;
    if not found or h.ends_at is distinct from s.shift_ends_at then raise exception 'CASE_FORBIDDEN';end if;
    perform 1 from service_operations_private.slots where shift_id=h.id and case_id=cid for update;
    if not found then raise exception 'CASE_FORBIDDEN';end if;
    if a='assign' then
     if s.status<>'accepted' then raise exception 'CASE_CONFLICT';end if;
     update service_operations_private.services set status='assigned',revision=revision+1,updated_at=clock_timestamp() where case_id=cid returning * into s;
    else
     if s.status not in('assigned','waiting_external') or v->>'status'='waiting_external' and s.status<>'assigned' then raise exception 'CASE_CONFLICT';end if;
     if jsonb_array_length(s.evidence)+jsonb_array_length(v->'evidence')>100 then raise exception 'CASE_WORKSPACE_LIMIT';end if;
     if exists(select 1 from jsonb_array_elements(v->'evidence')x where (x->>'observedAt')::bigint>service_operations_private.ms(clock_timestamp()) or (x->>'observedAt')::bigint<service_operations_private.ms(s.accepted_at)) then raise exception 'INVALID_INPUT';end if;
     if v->'minutes' is distinct from 'null'::jsonb then
      started:=to_timestamp((v->'minutes'->>'startedAt')::numeric/1000);ended:=to_timestamp((v->'minutes'->>'endedAt')::numeric/1000);
      if started<s.accepted_at or started<h.starts_at or ended>h.ends_at or ended>clock_timestamp() or exists(select 1 from service_operations_private.minutes m where m.staff_id=u and tstzrange(m.started_at,m.ended_at,'[)') && tstzrange(started,ended,'[)')) then raise exception 'CASE_MINUTES_INVALID';end if;
      -- One operator lock serializes intervals across their Cases, after the common Case lock.
      perform 1 from service_operations_private.operators where actor_id=u for update;
      if exists(select 1 from service_operations_private.minutes m where m.staff_id=u and tstzrange(m.started_at,m.ended_at,'[)') && tstzrange(started,ended,'[)')) then raise exception 'CASE_MINUTES_INVALID';end if;
      insert into service_operations_private.minutes(case_id,operation_id,staff_id,shift_id,started_at,ended_at) values(cid,op,u,h.id,started,ended);
     end if;
     update service_operations_private.services set status=v->>'status',evidence=evidence||(v->'evidence'),revision=revision+1,updated_at=clock_timestamp() where case_id=cid returning * into s;
     if s.status in('resolved','unresolved') then update service_operations_private.slots set case_id=null where case_id=cid;end if;
    end if;
   end if;
  elsif a='select_proposal' then
   if s.case_id is null or s.trip_id is null or c.revoked or c.expires_at<=clock_timestamp() or s.grant_revision<>c.revision or s.status not in('assigned','waiting_external','resolved','unresolved') then raise exception 'CASE_FORBIDDEN';end if;
   if (v->'proposal'->>'tripId')::uuid<>s.trip_id or (v->'proposal'->>'baseVersion')::integer<>s.trip_version then raise exception 'CASE_TRIP_UNAVAILABLE';end if;
   -- NOWAIT keeps original Proposal->Trip writer lock order safe; no new writer.
   select * into proposal from public.trip_proposals where id=(v->'proposal'->>'proposalId')::uuid and owner_id=u for share nowait;
   if not found or proposal.trip_id<>s.trip_id or proposal.base_trip_version<>s.trip_version or proposal.status<>'pending' or proposal.expires_at<=clock_timestamp() then raise exception 'CASE_TRIP_UNAVAILABLE';end if;
   select * into t from public.trips where id=s.trip_id and owner_id=u for share nowait;
   if not found or t.head_version<>s.trip_version or exists(select 1 from public.trip_archives where trip_id=t.id) or exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) then raise exception 'CASE_TRIP_UNAVAILABLE';end if;
   update service_operations_private.services set proposal_id=proposal.id,revision=revision+1,updated_at=clock_timestamp() where case_id=cid returning * into s;
  else raise exception 'INVALID_INPUT';end if;
  if a<>'cancel' then insert into service_operations_private.audit(case_id,revision,actor_id,action,status) values(cid,s.revision,u,a,s.status);end if;
  if p_surface='staff' and c.expires_at<=clock_timestamp() then raise exception 'CASE_FORBIDDEN';end if;
  out:=jsonb_build_object('operationId',op,'requestDigest',dig,'action',a,'outcome','applied','caseId',cid,'revision',s.revision,'grantRevision',c.revision,'createdAt',service_operations_private.ms(clock_timestamp()));
 end if;
 insert into service_operations_private.operations(actor_id,session_id,surface,operation_id,owner_id,case_id,grant_revision,request_bytes,request_digest,receipt)
 values(u,session,p_surface,op,c.owner_id,cid,c.revision,raw,dig,out);
 return out;
exception when lock_not_available then raise exception 'CASE_BUSY';end $$;

-- Default-denied bounded maintenance. Physical TTL cleanup and release can run
-- without impersonating an owner; data remains inaccessible before this sweep.
create function service_operations_private.expire_cases(p_limit integer) returns integer language plpgsql security definer set search_path='' as $$
declare c service_cases_private.cases;n integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
 for c in select c0.* from service_cases_private.cases c0 join service_operations_private.services s on s.case_id=c0.id
 where c0.expires_at<=clock_timestamp() and not c0.revoked
 and (s.trip_id is not null or s.status in('queued','accepted','assigned','waiting_external') or exists(select 1 from service_operations_private.operations o where o.case_id=c0.id and not o.erased))
 order by c0.id limit p_limit for update of c0 skip locked loop
 perform service_operations_private.erase_case(c.id,true,c.owner_id);n:=n+1;
 end loop;return n;
end $$;

-- Trip erasure withdraws the bound source and erases its sensitive evidence and
-- operation bytes. The Case and its independent problem remain owned service data.
-- Archive has no trigger and cannot delete an unfinished service.
create function service_operations_private.trip_deleted() returns trigger language plpgsql security definer set search_path='' as $$
declare c service_cases_private.cases;s service_operations_private.services;
begin
 for c in select c0.* from service_cases_private.cases c0 join service_operations_private.services s0 on s0.case_id=c0.id
 where s0.trip_id=NEW.trip_id and s0.owner_id=NEW.owner_id order by c0.id for update of c0 nowait loop
  update service_cases_private.cases set revoked=true,revision=revision+1 where id=c.id returning * into c;
  insert into service_cases_private.audit(case_id,revision,action,actor_id,recipient_id,expires_at) values(c.id,c.revision,'revoked',c.owner_id,c.recipient_id,c.expires_at);
  update service_operations_private.services set evidence='[]',status=case when status='resolved' then 'unresolved' else status end,revision=revision+1,updated_at=clock_timestamp() where case_id=c.id returning * into s;
  insert into service_operations_private.audit(case_id,revision,actor_id,action,status) values(s.case_id,s.revision,c.owner_id,'trip_source_deleted',s.status);
 end loop;return NEW;
end $$;
create trigger service_operations_trip_deleted after insert on privacy_private.trip_deletions for each row execute function service_operations_private.trip_deleted();

-- Same versioned service data scope for export and explicit owner deletion.
create function service_operations_private.delete_case_v1(p_case uuid,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=service_cases_private.actor();c service_cases_private.cases;
begin
 select * into c from service_cases_private.cases where id=p_case and owner_id=u for update;
 if not found then raise exception 'CASE_FORBIDDEN';end if;
 if p_revision is null or c.revision<>p_revision then raise exception 'CASE_CONFLICT';end if;
 -- BEFORE DELETE scrubs operation refs; dependent service/minutes/audit/grants
 -- cascade in this transaction. Minimal actor/session/op/digest tombstones survive.
 delete from service_cases_private.cases where id=p_case and owner_id=u;
 return jsonb_build_object('schemaVersion','service-case-data/1','kind','deleted','allUserDataCompleted',false);
end $$;

create table service_operations_private.export_progress (
 request_id uuid not null references export_private.core_jobs_v1(request_id) on delete cascade,
 generation integer not null, lease_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
 source_revision text not null, next_key text, last_key text, last_page jsonb,
 pages integer not null default 0, rows integer not null default 0, terminal boolean not null default false,
 primary key(request_id,generation)
);
alter table service_operations_private.export_progress enable row level security;
revoke all on service_operations_private.export_progress from public,anon,authenticated,service_role;
create function service_operations_private.export_rows(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare rows jsonb;
begin
 select coalesce(jsonb_agg(x.row order by x.key),'[]') into rows from(
 select 'case:'||c.id key,jsonb_build_object('key','case:'||c.id,'domain','case','value',jsonb_build_object('caseId',c.id,'category',c.category,'problem',c.problem,'revision',c.revision,'recipientId',c.recipient_id,'expiresAt',c.expires_at,'revoked',c.revoked,'createdAt',c.created_at)) row from service_cases_private.cases c where owner_id=p_owner
 union all select 'grant:'||a.case_id||':'||a.revision,jsonb_build_object('key','grant:'||a.case_id||':'||a.revision,'domain','grant_audit','value',jsonb_build_object('caseId',a.case_id,'revision',a.revision,'action',a.action,'actorId',a.actor_id,'recipientId',a.recipient_id,'expiresAt',a.expires_at,'createdAt',a.created_at)) from service_cases_private.audit a join service_cases_private.cases c on c.id=a.case_id where c.owner_id=p_owner
 union all select 'service:'||s.case_id,jsonb_build_object('key','service:'||s.case_id,'domain','service','value',jsonb_build_object('caseId',s.case_id,'revision',s.revision,'grantRevision',s.grant_revision,'status',s.status,'urgency',s.urgency,'tripId',s.trip_id,'tripVersion',s.trip_version,'proposalId',s.proposal_id,'staffId',s.staff_id,'staffLabel',s.staff_label,'acceptedAt',s.accepted_at,'shiftEndsAt',s.shift_ends_at,'evidence',s.evidence,'updatedAt',s.updated_at)) from service_operations_private.services s where owner_id=p_owner
 union all select 'minute:'||m.case_id||':'||m.operation_id,jsonb_build_object('key','minute:'||m.case_id||':'||m.operation_id,'domain','minutes','value',jsonb_build_object('caseId',m.case_id,'operationId',m.operation_id,'staffId',m.staff_id,'startedAt',m.started_at,'endedAt',m.ended_at)) from service_operations_private.minutes m join service_operations_private.services s on s.case_id=m.case_id where s.owner_id=p_owner
 union all select 'audit:'||a.case_id||':'||a.revision,jsonb_build_object('key','audit:'||a.case_id||':'||a.revision,'domain','service_audit','value',jsonb_build_object('caseId',a.case_id,'revision',a.revision,'actorId',a.actor_id,'action',a.action,'status',a.status,'createdAt',a.created_at)) from service_operations_private.audit a join service_operations_private.services s on s.case_id=a.case_id where s.owner_id=p_owner
 union all select 'op:'||encode(extensions.digest(convert_to(o.actor_id||':'||o.session_id||':'||o.surface||':'||o.operation_id,'UTF8'),'sha256'),'hex'),jsonb_build_object('key','op:'||encode(extensions.digest(convert_to(o.actor_id||':'||o.session_id||':'||o.surface||':'||o.operation_id,'UTF8'),'sha256'),'hex'),'domain','operation','value',jsonb_build_object('operationId',o.operation_id,'actorId',o.actor_id,'surface',o.surface,'caseId',o.case_id,'grantRevision',o.grant_revision,'requestDigest',o.request_digest,'receipt',o.receipt,'createdAt',o.created_at,'erased',o.erased,'requestBytes',case when o.erased then null else convert_from(o.request_bytes,'UTF8') end)) from service_operations_private.operations o where owner_id=p_owner
 union all select 'data-op:'||encode(extensions.digest(convert_to(d.session_id||':'||d.operation_id,'UTF8'),'sha256'),'hex'),jsonb_build_object('key','data-op:'||encode(extensions.digest(convert_to(d.session_id||':'||d.operation_id,'UTF8'),'sha256'),'hex'),'domain','operation','value',d.receipt) from service_operations_private.data_operations d where actor_id=p_owner
 order by key limit 10001) x;
 if jsonb_array_length(rows)>10000 then raise exception 'CASE_WORKSPACE_LIMIT';end if;return rows;
end $$;
create function public.service_case_export_v1(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare j export_private.core_jobs_v1;p service_operations_private.export_progress;req uuid;l uuid;g integer;rows jsonb;rev text;page jsonb;more boolean;after_key text;last_key text;limit_n integer;keys text[];
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 keys:=case p_action when 'enroll' then array['requestId','leaseId','generation'] when 'coverage' then array['requestId','leaseId','generation'] when 'page' then array['requestId','leaseId','generation','cursor','limit'] end;
 if keys is null or not service_operations_private.exact(p_input,keys) or not service_operations_private.uuid(p_input->'requestId') or not service_operations_private.uuid(p_input->'leaseId') or not service_operations_private.integer(p_input->'generation',1,3) then raise exception 'INVALID_INPUT';end if;
 req:=(p_input->>'requestId')::uuid;l:=(p_input->>'leaseId')::uuid;g:=(p_input->>'generation')::integer;
 j:=export_private.lock_job_v1(req,true);
 if j.request_id is null or not export_private.live_lease_v1(j,l,g) then return jsonb_build_object('kind','unavailable');end if;
 -- Case locks precede any source/metadata aggregation; all exported domains share
 -- the same digest and exact job+generation+lease, including revoked tombstones.
 perform 1 from service_cases_private.cases where owner_id=j.owner_id order by id for share nowait;
 rows:=service_operations_private.export_rows(j.owner_id);
 rev:=encode(extensions.digest(convert_to(jsonb_build_object('scope','service-case-data/1','owner',j.owner_id,'request',req,'generation',g,'lease',l,'rows',rows)::text,'UTF8'),'sha256'),'hex');
 select * into p from service_operations_private.export_progress where request_id=req and generation=g for update nowait;
 if p_action='enroll' then
  if p.request_id is not null and (p.lease_id<>l or p.source_revision<>rev) then return jsonb_build_object('kind','stale');end if;
  insert into service_operations_private.export_progress(request_id,generation,lease_id,owner_id,source_revision) values(req,g,l,j.owner_id,rev) on conflict do nothing;
  return jsonb_build_object('schemaVersion','service-case-data/1','kind','enrolled','requestId',req,'leaseId',l,'generation',g,'sourceRevision',rev);
 end if;
 if p.request_id is null or p.lease_id<>l or p.source_revision<>rev then return jsonb_build_object('schemaVersion','service-case-data/1','kind','coverage','coverage','partial','reason','NOT_ENROLLED_OR_SOURCE_CHANGED','allUserDataCompleted',false);end if;
 if p_action='coverage' then return jsonb_build_object('schemaVersion','service-case-data/1','kind','coverage','requestId',req,'leaseId',l,'generation',g,'sourceRevision',rev,'coverage',case when p.terminal then 'complete' else 'partial' end,'pages',p.pages,'rows',p.rows,'allUserDataCompleted',false);end if;
 if not service_operations_private.integer(p_input->'limit',1,100) then raise exception 'INVALID_INPUT';end if;
 limit_n:=(p_input->>'limit')::integer;
 if p_input->'cursor' is distinct from 'null'::jsonb then
  if not service_operations_private.exact(p_input->'cursor',array['sourceRevision','afterKey']) or p_input->'cursor'->>'sourceRevision' is distinct from rev or jsonb_typeof(p_input->'cursor'->'afterKey') is distinct from 'string' then raise exception 'INVALID_INPUT';end if;
  after_key:=p_input->'cursor'->>'afterKey';
 end if;
 if p.pages>0 and after_key is not distinct from p.last_key then return p.last_page;end if;
 if p.terminal or after_key is distinct from p.next_key then return jsonb_build_object('kind','stale');end if;
 if p.pages>=(j.policy_snapshot->>'max_pages')::integer then return jsonb_build_object('kind','unavailable');end if;
 select coalesce(jsonb_agg(x order by x->>'key'),'[]') into page from(select value x from jsonb_array_elements(rows) where after_key is null or value->>'key'>after_key order by value->>'key' limit limit_n) q;
 last_key:=page->-1->>'key';more:=last_key is not null and exists(select 1 from jsonb_array_elements(rows)x where x->>'key'>last_key);
 page:=jsonb_build_object('schemaVersion','service-case-data/1','kind','page','requestId',req,'leaseId',l,'generation',g,'sourceRevision',rev,'items',page,'hasMore',more,'nextCursor',case when more then jsonb_build_object('sourceRevision',rev,'afterKey',last_key) else null end,'allUserDataCompleted',false);
 update service_operations_private.export_progress set pages=pages+1,rows=export_progress.rows+jsonb_array_length(page->'items'),last_key=after_key,next_key=case when more then last_key else null end,last_page=page,terminal=not more where request_id=req and generation=g;
 return page;
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;

revoke all on all functions in schema service_operations_private from public,anon,authenticated,service_role;
revoke all on function public.service_case_operations_v1(jsonb,text,text),public.service_case_export_v1(text,jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';

-- Main #224 closed owner erasure wire: receipt survives only as an irreversible
-- digest + actor/session/operation tuple. Case/Trip/problem/raw bytes are absent.
create table service_operations_private.data_operations (
 actor_id uuid not null references auth.users(id) on delete cascade,session_id uuid not null,
 operation_id uuid not null,request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
 receipt jsonb not null,primary key(actor_id,session_id,operation_id)
);
alter table service_operations_private.data_operations enable row level security;
revoke all on service_operations_private.data_operations from public,anon,authenticated,service_role;
create function service_operations_private.data_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'CASE_OPERATION_IMMUTABLE';end $$;
create trigger service_data_operation_immutable before update on service_operations_private.data_operations for each row execute function service_operations_private.data_immutable();
create function service_operations_private.expire_owner_cases(p_owner uuid) returns void language plpgsql security definer set search_path='' as $$
declare c service_cases_private.cases;
begin
 for c in select c0.* from service_cases_private.cases c0 join service_operations_private.services s on s.case_id=c0.id
 where c0.owner_id=p_owner and c0.expires_at<=clock_timestamp() and not c0.revoked
 and (s.trip_id is not null or s.status in('queued','accepted','assigned','waiting_external') or exists(select 1 from service_operations_private.operations o where o.case_id=c0.id and not o.erased))
 order by c0.id limit 10001 for update of c0 loop perform service_operations_private.erase_case(c.id,true,p_owner);end loop;
end $$;
create function public.service_case_data_v1(p_input jsonb,p_request_bytes text) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=service_cases_private.actor();session uuid:=(auth.jwt()->>'session_id')::uuid;v jsonb;a text;raw bytea;op uuid;dig text;
 prior service_operations_private.data_operations;c service_cases_private.cases;out jsonb;rows jsonb;captured bigint;dig_source text;abandon boolean:=false;
begin
 if p_request_bytes is null or octet_length(convert_to(p_request_bytes,'UTF8')) not between 2 and 48000 then raise exception 'INVALID_INPUT';end if;
 begin v:=p_request_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 if v is distinct from p_input then raise exception 'INVALID_INPUT';end if;
 a:=p_input->>'action';raw:=convert_to(p_request_bytes,'UTF8');
 if a='export' then
  if not service_operations_private.exact(v,array['action','requestId','confirmed']) or not service_operations_private.uuid(v->'requestId') or v->'confirmed' is distinct from 'true'::jsonb or octet_length(raw)>24000 then raise exception 'INVALID_INPUT';end if;
  -- All Case sources are locked before one UNION snapshot of all six domains.
  if exists(select 1 from service_cases_private.cases where owner_id=u order by id offset 10000 limit 1) then raise exception 'CASE_WORKSPACE_LIMIT';end if;
  perform 1 from service_cases_private.cases where owner_id=u order by id limit 10001 for update;
  perform service_operations_private.expire_owner_cases(u);
  rows:=service_operations_private.export_rows(u);captured:=service_operations_private.ms(clock_timestamp());
  dig_source:=encode(extensions.digest(convert_to(jsonb_build_object('scope','service-case-data/1','requestId',v->'requestId','ownerId',u,'sessionId',session,'rows',rows)::text,'UTF8'),'sha256'),'hex');
  out:=jsonb_build_object('schemaVersion','service-case-data/1','kind','bundle','requestId',v->'requestId','ownerId',u,'sessionId',session,'capturedAt',captured,'expiresAt',captured+30000,'sourceDigest',dig_source,'corePackageEnrollment','not_enrolled','allUserDataCompleted',false,
  'coverage',jsonb_build_object('case','complete','grant_audit','complete','service','complete','minutes','complete','service_audit','complete','operation','complete','brief','unavailable','attachments','unavailable'),'rows',rows);
  if octet_length(convert_to(out::text,'UTF8'))>524288 then raise exception 'CASE_WORKSPACE_LIMIT';end if;
  return out;
 end if;
 if a='read_operation' then
  if not service_operations_private.exact(v,array['action','operationId']) or not service_operations_private.uuid(v->'operationId') then raise exception 'INVALID_INPUT';end if;
 elsif a='abandon' then
  if not service_operations_private.exact(v,array['action','operationId','mutationBytes']) or not service_operations_private.uuid(v->'operationId') or jsonb_typeof(v->'mutationBytes') is distinct from 'string' then raise exception 'INVALID_INPUT';end if;
  raw:=convert_to(v->>'mutationBytes','UTF8');
  begin v:=(v->>'mutationBytes')::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
  if v->'operationId' is distinct from p_input->'operationId' then raise exception 'INVALID_INPUT';end if;abandon:=true;
 end if;
 if a<>'read_operation' and (not service_operations_private.exact(v,array['action','operationId','caseId','grantRevision','confirmed']) or v->>'action' is distinct from 'delete' or not service_operations_private.uuid(v->'operationId') or not service_operations_private.uuid(v->'caseId') or not service_operations_private.integer(v->'grantRevision',0,2147483647) or v->'confirmed' is distinct from 'true'::jsonb) then raise exception 'INVALID_INPUT';end if;
 if octet_length(raw)>24000 then raise exception 'INVALID_INPUT';end if;
 op:=(v->>'operationId')::uuid;dig:=encode(extensions.digest(raw,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('service-data:'||u||':'||session||':'||op,0));
 select * into prior from service_operations_private.data_operations where actor_id=u and session_id=session and operation_id=op;
 if a='read_operation' then return jsonb_build_object('receipt',prior.receipt);end if;
 if prior.operation_id is not null then
  if prior.request_digest<>dig then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;return prior.receipt;
 end if;
 select * into c from service_cases_private.cases where id=(v->>'caseId')::uuid and owner_id=u for update;
 if not found then raise exception 'CASE_FORBIDDEN';end if;
 if not abandon then
  if c.revision<>(v->>'grantRevision')::integer then raise exception 'CASE_CONFLICT';end if;
  perform service_operations_private.delete_case_v1(c.id,c.revision);
 end if;
 out:=jsonb_build_object('schemaVersion','service-case-data/1','kind','receipt','operationId',op,'requestDigest',dig,'outcome',case when abandon then 'cancelled' else 'deleted' end,'createdAt',service_operations_private.ms(clock_timestamp()),'allUserDataCompleted',false);
 insert into service_operations_private.data_operations(actor_id,session_id,operation_id,request_digest,receipt) values(u,session,op,dig,out);
 return out;
exception when lock_not_available then raise exception 'CASE_BUSY';end $$;
revoke all on function public.service_case_data_v1(jsonb,text),service_operations_private.data_immutable(),service_operations_private.expire_owner_cases(uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
