-- VPJ-31 B1/B2: references only, explicit per-field Case consent.
-- Append-only package; default disabled, no enrollment or public EXECUTE grants.
create schema service_brief_private;
revoke all on schema service_brief_private from public,anon,authenticated,service_role;

create table service_brief_private.settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into service_brief_private.settings(singleton) values(true);
create table service_brief_private.briefs (
 case_id uuid primary key references service_cases_private.cases(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null default 0 check(revision between 0 and 9007199254740990),
 recipient_id uuid, grant_revision integer not null,
 state text not null check(state in('shared','withdrawn','deleted','invalidated')),
 selected_keys jsonb not null default '[]', sources jsonb, source_digest text,
 updated_at timestamptz not null default clock_timestamp(), expires_at timestamptz,
 check(state<>'shared' or (recipient_id is not null and sources is not null and source_digest is not null and expires_at is not null)),
 check(state='shared' or (sources is null and source_digest is null and selected_keys='[]' and expires_at is null))
);
create index service_brief_owner on service_brief_private.briefs(owner_id,case_id);
create table service_brief_private.previews (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references service_cases_private.cases(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, session_id uuid not null,
 revision bigint not null, recipient_id uuid not null, grant_revision integer not null,
 sources jsonb not null, source_digest text not null,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 check(expires_at>created_at and expires_at-created_at<=interval '5 minutes')
);
create index service_brief_preview_case on service_brief_private.previews(case_id);
create index service_brief_preview_owner on service_brief_private.previews(owner_id,id);
create table service_brief_private.audit (
 event_id uuid primary key default gen_random_uuid(), case_id uuid not null references service_cases_private.cases(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, revision bigint not null,
 actor_id uuid not null, action text not null check(action in('previewed','shared','withdrawn','deleted','read','invalidated')),
 recipient_id uuid, grant_revision integer not null, field_keys jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create index service_brief_audit_case on service_brief_private.audit(case_id,created_at,event_id);
create index service_brief_audit_owner on service_brief_private.audit(owner_id,event_id);
create table service_brief_private.operations (
 actor_id uuid not null references auth.users(id) on delete cascade, session_id uuid not null,
 surface text not null check(surface='owner'), operation_id uuid not null,
 case_id uuid, request_digest text not null, request_bytes bytea, receipt jsonb,
 erased boolean not null default false, created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,session_id,surface,operation_id),
 check(request_digest ~ '^[a-f0-9]{64}$'),
 check((erased and case_id is null and request_bytes is null and receipt is null) or
 (not erased and case_id is not null and request_bytes is not null and receipt is not null))
);
create index service_brief_operation_case on service_brief_private.operations(case_id);
-- Lease stores timing/fingerprint only; exports are freshly projected on each call.
create table service_brief_private.export_leases (
 owner_id uuid not null references auth.users(id) on delete cascade, session_id uuid not null, request_id uuid not null,
 captured_at timestamptz not null, expires_at timestamptz not null, source_digest text not null,
 primary key(owner_id,session_id,request_id), check(expires_at-captured_at<=interval '30 seconds')
);
do $$declare t text;begin
 foreach t in array array['settings','briefs','previews','audit','operations','export_leases'] loop
 execute format('alter table service_brief_private.%I enable row level security',t);
 execute format('revoke all on service_brief_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function service_brief_private.hash(v jsonb) returns text language sql immutable set search_path='' as $$
 select encode(pg_catalog.sha256(convert_to(v::text,'UTF8')),'hex')
$$;
create function service_brief_private.valid_sources(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare m jsonb; ids text[]:=array[]::text[];
begin
 if not service_operations_private.exact(v,array['profilePace','memories','intakeMessageId']) or jsonb_typeof(v->'profilePace') is distinct from 'boolean'
 or (v->'intakeMessageId'<>'null'::jsonb and not service_operations_private.uuid(v->'intakeMessageId')) or jsonb_typeof(v->'memories') is distinct from 'array' then return false;end if;
 if jsonb_array_length(v->'memories')>3 then return false;end if;
 for m in select value from jsonb_array_elements(v->'memories') loop
 if not service_operations_private.exact(m,array['id','revision']) or not service_operations_private.uuid(m->'id') or not service_operations_private.integer(m->'revision',1,9007199254740990) or m->>'id'=any(ids) then return false;end if;
 ids:=array_append(ids,m->>'id');end loop;
 return true;
end $$;
create function service_brief_private.valid(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare a text:=v->>'action'; keys text[]:=array['action','caseId','recipientId','grantRevision']; k jsonb;
begin
 if a='read_preview' then return service_operations_private.exact(v,array['action','previewId']) and service_operations_private.uuid(v->'previewId');end if;
 if a in('audit','source_options','locate') then return service_operations_private.exact(v,array['action','caseId']) and service_operations_private.uuid(v->'caseId');end if;
 if a='export' then return service_operations_private.exact(v,array['action','requestId','confirmed']) and service_operations_private.uuid(v->'requestId') and v->'confirmed'='true'::jsonb;end if;
 if a='read_operation' then return service_operations_private.exact(v,array['action','operationId']) and service_operations_private.uuid(v->'operationId');end if;
 if not service_operations_private.uuid(v->'caseId') or not service_operations_private.uuid(v->'recipientId') or not service_operations_private.integer(v->'grantRevision',0,2147483647) then return false;end if;
 if a='preview' then return service_operations_private.exact(v,keys||array['sources']) and service_brief_private.valid_sources(v->'sources');end if;
 keys:=keys||array['expectedRevision'];
 if not service_operations_private.integer(v->'expectedRevision',0,9007199254740990) then return false;end if;
 if a='read' then return service_operations_private.exact(v,keys);end if;
 keys:=keys||array['operationId','confirmed'];
 if not service_operations_private.uuid(v->'operationId') or v->'confirmed' is distinct from 'true'::jsonb then return false;end if;
 if a in('withdraw','delete') then return service_operations_private.exact(v,keys);end if;
 if a is distinct from 'share' or not service_operations_private.exact(v,keys||array['previewId','sourceDigest','selectedKeys','noticeVersion'])
 or not service_operations_private.uuid(v->'previewId') or jsonb_typeof(v->'sourceDigest') is distinct from 'string' or v->>'sourceDigest'!~'^[a-f0-9]{64}$'
 or v->>'noticeVersion' is distinct from 'case-minimal-brief/1' or jsonb_typeof(v->'selectedKeys') is distinct from 'array' then return false;end if;
 if jsonb_array_length(v->'selectedKeys') not between 1 and 7 or (select count(distinct value) from jsonb_array_elements(v->'selectedKeys'))<>jsonb_array_length(v->'selectedKeys') then return false;end if;
 for k in select value from jsonb_array_elements(v->'selectedKeys') loop
 if jsonb_typeof(k)<>'string' or k#>>'{}' !~ '^(problem|travel_pace|budget|requirements|response_detail|memory:[0-9a-f-]{36})$'
 or (k#>>'{}' like 'memory:%' and not service_operations_private.uuid(to_jsonb(substr(k#>>'{}',8)))) then return false;end if;
 end loop;return true;
end $$;

create function service_brief_private.actor() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sess uuid:=(auth.jwt()->>'session_id')::uuid;
begin
 if u is null or sess is null or auth.jwt()->>'role' is distinct from 'authenticated' or auth.jwt()->>'is_anonymous' is distinct from 'false' then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.users where id=u for share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from identity_private.mobile_accounts where owner_id=u for update nowait;
 if not found then raise exception 'SESSION_REPLACED';end if;
 perform identity_private.guard_mobile_rpc_v2();
 perform 1 from auth.sessions where id=sess and user_id=u for share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 return u;
end $$;
create function service_brief_private.qualify(c service_cases_private.cases,u uuid,surface text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare s service_operations_private.services;
begin
 if surface='owner' then if c.owner_id is distinct from u then raise exception 'CASE_FORBIDDEN';end if;
 elsif surface='staff' then
 if c.recipient_id is distinct from u or c.owner_id=u then raise exception 'CASE_FORBIDDEN';end if;
 perform 1 from service_cases_private.staff where actor_id=u and service_cases_private.staff.active for share nowait;if not found then raise exception 'CASE_FORBIDDEN';end if;
 select * into s from service_operations_private.services where case_id=c.id for share nowait;
 if s.case_id is not null then
 if s.grant_revision<>c.revision then raise exception 'CASE_FORBIDDEN';end if;
 perform 1 from service_operations_private.operators where actor_id=u and enabled for share nowait;if not found then raise exception 'CASE_FORBIDDEN';end if;
 if s.staff_id is not null then
 if s.staff_id<>u then raise exception 'CASE_FORBIDDEN';end if;
 perform 1 from service_operations_private.shifts where id=s.shift_id and actor_id=u and enabled and starts_at<=clock_timestamp() and ends_at>clock_timestamp() and ends_at=s.shift_ends_at for share nowait;if not found then raise exception 'CASE_FORBIDDEN';end if;
 if s.status in('accepted','assigned','waiting_external') then
 perform 1 from service_operations_private.slots where shift_id=s.shift_id and case_id=c.id for share nowait;if not found then raise exception 'CASE_FORBIDDEN';end if;
 end if;end if;
 end if;
 else raise exception 'CASE_FORBIDDEN';end if;
 if p_active and (c.revoked or c.recipient_id is null or c.recipient_id=c.owner_id or c.expires_at<=clock_timestamp()) then raise exception 'BRIEF_FORBIDDEN';end if;
 if p_active then perform 1 from service_cases_private.staff where actor_id=c.recipient_id and service_cases_private.staff.active for share nowait;if not found then raise exception 'CASE_FORBIDDEN';end if;end if;
end $$;

create function service_brief_private.event(c service_cases_private.cases,r bigint,u uuid,a text,keys jsonb) returns void language sql volatile set search_path='' as $$
 insert into service_brief_private.audit(case_id,owner_id,revision,actor_id,action,recipient_id,grant_revision,field_keys)
 values(c.id,c.owner_id,r,u,a,c.recipient_id,c.revision,keys)
$$;
create function service_brief_private.erase(cid uuid,owner uuid,remove_audit boolean default false) returns void language plpgsql set search_path='' as $$
begin
 delete from service_brief_private.previews where case_id=cid;
 update service_brief_private.operations set erased=true,case_id=null,request_bytes=null,receipt=null
 where case_id=cid and not erased and not(receipt->>'action'='delete' and receipt->>'outcome'='applied');
 if remove_audit then delete from service_brief_private.audit where case_id=cid;end if;
 -- Lease fingerprints must fail after erasure; keeping the original lease prevents rebinding its ID.
end $$;
create function service_brief_private.invalidate(cid uuid,owner uuid,actor uuid) returns void language plpgsql set search_path='' as $$
declare c service_cases_private.cases;b service_brief_private.briefs;
begin
 select * into c from service_cases_private.cases where id=cid for update nowait;if not found then return;end if;
 select * into b from service_brief_private.briefs where case_id=cid for update nowait;
 if b.state='shared' then
 update service_brief_private.briefs set revision=revision+1,state='invalidated',sources=null,source_digest=null,selected_keys='[]',expires_at=null,updated_at=clock_timestamp() where case_id=cid returning * into b;
 perform service_brief_private.event(c,b.revision,actor,'invalidated','[]');
 end if;
 perform service_brief_private.erase(cid,owner);
end $$;

-- Prelock every Memory dependency before invoking the unchanged basis helper,
-- whose legacy profile/consent FOR SHARE locks can then be acquired reentrantly.
create function service_brief_private.lock_memories(owner uuid,refs jsonb) returns void language plpgsql set search_path='' as $$
declare m jsonb;p public.memory_profiles;
begin
 for m in select value from jsonb_array_elements(refs) order by value->>'id' loop
 select * into p from public.memory_profiles where id=(m->>'id')::uuid and owner_id=owner for share nowait;
 if found then
 perform 1 from public.memory_consents where id=p.consent_id for share nowait;
 perform 1 from public.memory_receipts where id=p.source_receipt_id for share nowait;
 end if;
 end loop;
end $$;
create function service_brief_private.memory_field(owner uuid,mid uuid,rev bigint) returns jsonb language plpgsql set search_path='' as $$
declare p public.memory_profiles;c public.memory_consents;r public.memory_receipts;basis text;
begin
 select * into p from public.memory_profiles where id=mid and owner_id=owner for share nowait;
 if not found or p.revision<>rev or p.revision<=0 or p.state not in('explicit','confirmed') or p.constraint_kind<>'preference' or p.summary is null then return null;end if;
 select * into c from public.memory_consents where id=p.consent_id and owner_id=owner and status='granted' for share nowait;if not found then return null;end if;
 select * into r from public.memory_receipts where id=p.source_receipt_id and owner_id=owner and memory_id=p.id for share nowait;if not found then return null;end if;
 basis:=service_brief_private.hash(jsonb_build_array(to_jsonb(p),to_jsonb(c),to_jsonb(r)));
 return jsonb_build_object('key','memory:'||p.id,'field','preference','state','available','value',p.summary,'provenance','explicit',
 'source',jsonb_build_object('kind','memory','id',p.id,'revision',p.revision,'updatedAt',service_operations_private.ms(p.updated_at),'receiptId',r.id,'consentId',c.id,'basisDigest',basis));
end $$;
create function service_brief_private.profile_field(owner uuid) returns jsonb language plpgsql set search_path='' as $$
declare p public.user_profiles;
begin
 select * into p from public.user_profiles where owner_id=owner for share nowait;
 if not found or p.pace_state<>'explicit' or p.pace_notice is distinct from 'local-planning-cross-trip-v1' or p.pace_operation is null or p.travel_pace not in('relaxed','balanced','packed') then return null;end if;
 return jsonb_build_object('key','travel_pace','field','travel_pace','state','available','value',p.travel_pace,'provenance','explicit',
 'source',jsonb_build_object('kind','profile_pace','id',owner,'revision',p.pace_revision,'updatedAt',service_operations_private.ms(p.updated_at),'receiptId',p.pace_operation,'consentId',null,'basisDigest',service_brief_private.hash(to_jsonb(p))));
end $$;
create function service_brief_private.intake_source(c service_cases_private.cases,mid uuid) returns jsonb language plpgsql set search_path='' as $$
declare s service_operations_private.services;i turn_private.assistant_travel_intakes;
 t public.trips;a turn_private.assistant_conversations;g turn_private.assistant_goals;
 l turn_private.assistant_goal_trip_links;r turn_private.assistant_goal_trip_receipts;
 p turn_private.text_policies;cons turn_private.text_consents;m turn_private.assistant_messages;d text;
begin
 select * into s from service_operations_private.services where case_id=c.id and owner_id=c.owner_id and grant_revision=c.revision for share nowait;
 if not found or s.trip_id is null then return null;end if;
 select * into t from public.trips where id=s.trip_id and owner_id=c.owner_id and head_version=s.trip_version for share nowait;
 if not found or exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) or exists(select 1 from public.trip_archives where trip_id=t.id) then return null;end if;
 select * into i from turn_private.assistant_travel_intakes where message_id=mid and owner_id=c.owner_id for share nowait;if not found then return null;end if;
 select * into a from turn_private.assistant_conversations where id=i.conversation_id and owner_id=c.owner_id for share nowait;if not found then return null;end if;
 select * into g from turn_private.assistant_goals where id=i.goal_id and conversation_id=a.id and owner_id=c.owner_id and not trip_terminal and scope_version=i.goal_version for share nowait;if not found then return null;end if;
 select * into l from turn_private.assistant_goal_trip_links where goal_id=g.id and conversation_id=a.id and owner_id=c.owner_id and trip_id=t.id and trip_head_version=t.head_version and goal_scope_version=g.scope_version and not terminal_unlinked and source_kind='native_user_confirmed' for share nowait;if not found then return null;end if;
 select * into r from turn_private.assistant_goal_trip_receipts where operation_id=l.operation_id and owner_id=c.owner_id and goal_id=g.id and conversation_id=a.id and trip_id=t.id and trip_head_version=t.head_version and after_link_version=l.link_version and after_goal_scope_version=l.goal_scope_version and action='link' and source_kind='native_user_confirmed' and source_message_id is not distinct from l.source_message_id for share nowait;
 if not found then return null;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=c.owner_id and session_id=r.session_id for share nowait;if not found then return null;end if;
 perform 1 from auth.sessions where id=r.session_id and user_id=c.owner_id for share nowait;if not found then return null;end if;
 if l.source_message_id is not null then
 perform 1 from turn_private.assistant_messages where id=l.source_message_id and owner_id=c.owner_id and conversation_id=a.id and goal_id=g.id and scope_version=l.goal_scope_version-1 and policy_id=a.policy_id and consent_id=a.consent_id for share nowait;if not found then return null;end if;
 end if;
 select * into m from turn_private.assistant_messages where id=i.message_id and owner_id=c.owner_id for share nowait;if not found then return null;end if;
 select * into p from turn_private.text_policies where id=i.policy_id for share nowait;if not found then return null;end if;
 select * into cons from turn_private.text_consents where owner_id=c.owner_id and policy_id=i.policy_id and consent_id=i.consent_id and revoked_at is null for share nowait;if not found then return null;end if;
 perform service_brief_private.lock_memories(c.owner_id,i.memory_basis);
 d:=turn_private.assistant_travel_current_basis_v1(c.owner_id,i.message_id);if d is null then return null;end if;
 return jsonb_build_object('intake',i.intake,'source',jsonb_build_object('kind','intake','id',i.message_id,'revision',i.intake_revision,'updatedAt',service_operations_private.ms(i.created_at),'receiptId',i.idempotency_key,'consentId',i.consent_id,
 'basisDigest',service_brief_private.hash(jsonb_build_array(d,to_jsonb(s),to_jsonb(t),to_jsonb(a),to_jsonb(g),to_jsonb(l),to_jsonb(r),to_jsonb(p),to_jsonb(cons),to_jsonb(m)))));
end $$;
-- Only an unambiguous CURRENT intake for the actual Case Trip is selectable.
create function service_brief_private.current_intake(c service_cases_private.cases) returns jsonb language plpgsql set search_path='' as $$
declare mid uuid;v jsonb;out jsonb;n integer:=0;
begin
 for mid in select i.message_id from turn_private.assistant_travel_intakes i
 join turn_private.assistant_goal_trip_links l on l.goal_id=i.goal_id and l.owner_id=i.owner_id
 join service_operations_private.services s on s.trip_id=l.trip_id and s.case_id=c.id and s.owner_id=i.owner_id
 join turn_private.assistant_goals g on g.id=i.goal_id and g.scope_version=i.goal_version and l.goal_scope_version=g.scope_version
 where i.owner_id=c.owner_id and not l.terminal_unlinked
 and i.intake_revision=(select max(i2.intake_revision) from turn_private.assistant_travel_intakes i2 where i2.goal_id=i.goal_id)
 order by i.message_id loop
 v:=service_brief_private.intake_source(c,mid);
 if v is not null then n:=n+1;out:=v;if n>1 then return null;end if;end if;
 end loop;
 return out;
end $$;
create function service_brief_private.intake_fields(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare out jsonb:='[]';i jsonb:=v->'intake';s jsonb:=v->'source';k text;requirements jsonb:='{}';has_value boolean:=false;
begin
 if v is null then return '[]';end if;
 if i->'pace'<>'null'::jsonb then out:=out||jsonb_build_array(jsonb_build_object('key','travel_pace','field','travel_pace','state','available','value',i->'pace','provenance','explicit','source',s));end if;
 if i->'lodgingBudget'<>'null'::jsonb then out:=out||jsonb_build_array(jsonb_build_object('key','budget','field','budget','state','available','value',i->'lodgingBudget','provenance','explicit','source',s));end if;
 foreach k in array array['city','durationDays','partySize','interests','dates','mobilityConstraints'] loop
 requirements:=requirements||jsonb_build_object(k,i->k);if i->k<>'null'::jsonb then has_value:=true;end if;
 end loop;
 if has_value then out:=out||jsonb_build_array(jsonb_build_object('key','requirements','field','requirements','state','available','value',requirements,'provenance','explicit','source',s));end if;
 return out;
end $$;
create function service_brief_private.fields(c service_cases_private.cases,refs jsonb) returns jsonb language plpgsql set search_path='' as $$
declare out jsonb;m jsonb;f jsonb;p jsonb;i jsonb;ints jsonb;k text;
begin
 out:=jsonb_build_array(jsonb_build_object('key','problem','field','problem','state','available','value',c.problem,'provenance','explicit',
 'source',jsonb_build_object('kind','case','id',c.id,'revision',c.revision,'updatedAt',service_operations_private.ms(coalesce((select max(created_at) from service_cases_private.audit where case_id=c.id and revision=c.revision),c.created_at)),
 'receiptId',null,'consentId',null,'basisDigest',service_brief_private.hash(to_jsonb(c)))));
 if (refs->>'profilePace')::boolean then p:=service_brief_private.profile_field(c.owner_id);end if;
 if refs->'intakeMessageId'<>'null'::jsonb then
 i:=service_brief_private.current_intake(c);
 if i->'source'->'id' is distinct from refs->'intakeMessageId' then i:=null;end if;
 end if;
 ints:=service_brief_private.intake_fields(i);
 foreach k in array array['travel_pace','budget','requirements'] loop
 select value into f from jsonb_array_elements(ints) where value->>'key'=k;
 if f is null and k='travel_pace' then f:=p;end if;
 out:=out||jsonb_build_array(coalesce(f,jsonb_build_object('key',k,'field',k,'state','unknown')));
 end loop;
 for m in select value from jsonb_array_elements(refs->'memories') order by value->>'id' loop
 f:=service_brief_private.memory_field(c.owner_id,(m->>'id')::uuid,(m->>'revision')::bigint);
 out:=out||jsonb_build_array(coalesce(f,jsonb_build_object('key','memory:'||(m->>'id'),'field','preference','state','unknown')));
 end loop;
 return out||jsonb_build_array(jsonb_build_object('key','response_detail','field','response_detail','state','unknown'));
end $$;
create function service_brief_private.selected(fields jsonb,keys jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(value order by value->>'key'),'[]') from jsonb_array_elements(fields) where keys ? (value->>'key')
$$;
create function service_brief_private.selected_refs(fields jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('profilePace',exists(select 1 from jsonb_array_elements(fields) where value->'source'->>'kind'='profile_pace'),
 'memories',coalesce((select jsonb_agg(jsonb_build_object('id',value->'source'->'id','revision',value->'source'->'revision') order by value->'source'->>'id') from jsonb_array_elements(fields) where value->'source'->>'kind'='memory'),'[]'),
 'intakeMessageId',(select value->'source'->'id' from jsonb_array_elements(fields) where value->'source'->>'kind'='intake' limit 1))
$$;

-- Determine actual reference edges, including intake's original dependency graph.
create function service_brief_private.affected(owner uuid,refs jsonb,tab text,row_data jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare i turn_private.assistant_travel_intakes;mid uuid:=nullif(refs->>'intakeMessageId','')::uuid;rid text:=row_data->>'id';
begin
 if tab='session' then return true;end if;
 if tab='user_profiles' then return coalesce((refs->>'profilePace')::boolean,false);end if;
 if tab='memory_profiles' and exists(select 1 from jsonb_array_elements(refs->'memories') x where x->>'id'=rid) then return true;end if;
 if tab='memory_receipts' and exists(select 1 from jsonb_array_elements(refs->'memories') x where x->>'id'=row_data->>'memory_id') then return true;end if;
 if tab='memory_consents' and exists(select 1 from jsonb_array_elements(refs->'memories') x join public.memory_profiles p on p.id=(x->>'id')::uuid where p.consent_id=rid::uuid) then return true;end if;
 if mid is null then return false;end if;
 select * into i from turn_private.assistant_travel_intakes where message_id=mid and owner_id=owner;
 if not found then return true;end if;
 if tab in('services','trips','trip_archives','trip_deletions') then return true;end if;
 if tab='text_policies' then return i.policy_id::text=rid;end if;
 if tab='text_consents' then return i.policy_id::text=row_data->>'policy_id' and i.owner_id::text=row_data->>'owner_id';end if;
 if tab='assistant_conversations' then return i.conversation_id::text=rid;end if;
 if tab in('assistant_messages','assistant_travel_intakes','assistant_goal_trip_links','assistant_goal_trip_receipts') then return i.goal_id::text=row_data->>'goal_id';end if;
 if tab='assistant_goals' then return i.goal_id::text=rid;end if;
 if tab='memory_profiles' then return exists(select 1 from jsonb_array_elements(i.memory_basis) x where x->>'id'=rid);end if;
 if tab='memory_receipts' then return exists(select 1 from jsonb_array_elements(i.memory_basis) x where x->>'id'=row_data->>'memory_id');end if;
 if tab='memory_consents' then return exists(select 1 from jsonb_array_elements(i.memory_basis) x join public.memory_profiles p on p.id=(x->>'id')::uuid where p.consent_id=rid::uuid);end if;
 return false;
end $$;
create function service_brief_private.source_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;prev jsonb;owner uuid;cid uuid;tab text:=TG_TABLE_NAME;
begin
 if TG_OP='UPDATE' and to_jsonb(NEW) is not distinct from to_jsonb(OLD) then return NEW;end if;
 row_data:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
 prev:=case when TG_OP='INSERT' then row_data else to_jsonb(OLD) end;
 -- Scope the old and new owners/edges on ownership or graph changes.
 for cid in
 select distinct edges.case_id from (
 select b.case_id,b.owner_id,b.sources from service_brief_private.briefs b where b.state='shared'
 union all select p.case_id,p.owner_id,p.sources from service_brief_private.previews p
 ) edges
 where ((tab='text_policies' or edges.owner_id::text in(row_data->>'owner_id',prev->>'owner_id'))
 and (service_brief_private.affected(edges.owner_id,edges.sources,tab,row_data) or service_brief_private.affected(edges.owner_id,edges.sources,tab,prev)))
 and (tab not in('trips','trip_archives','trip_deletions') or exists(select 1 from service_operations_private.services s where s.case_id=edges.case_id and s.trip_id::text in(coalesce(row_data->>'trip_id',row_data->>'id'),coalesce(prev->>'trip_id',prev->>'id'))))
 and (tab<>'services' or edges.case_id::text in(row_data->>'case_id',prev->>'case_id'))
 order by edges.case_id loop
 select owner_id into owner from service_cases_private.cases where id=cid;
 perform service_brief_private.invalidate(cid,owner,owner);
 end loop;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
exception when lock_not_available then raise exception 'BRIEF_BUSY';
end $$;
create function service_brief_private.case_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then perform service_brief_private.erase(OLD.id,OLD.owner_id,true);return OLD;end if;
 if NEW is distinct from OLD then perform service_brief_private.invalidate(OLD.id,OLD.owner_id,OLD.owner_id);end if;
 return NEW;
exception when lock_not_available then raise exception 'BRIEF_BUSY';
end $$;
create trigger service_brief_case_changed after update on service_cases_private.cases for each row execute function service_brief_private.case_changed();
create trigger service_brief_case_deleted before delete on service_cases_private.cases for each row execute function service_brief_private.case_changed();
-- BEFORE keeps original graph rows available for erasure and all rollback atomic.
do $$declare ns text;tab text;begin
 for ns,tab in select * from (values
 ('public','user_profiles'),('public','memory_profiles'),('public','memory_consents'),('public','memory_receipts'),
 ('turn_private','assistant_travel_intakes'),('turn_private','assistant_messages'),('turn_private','assistant_goals'),
 ('turn_private','assistant_conversations'),('turn_private','assistant_goal_trip_links'),('turn_private','assistant_goal_trip_receipts'),
 ('turn_private','text_policies'),('turn_private','text_consents'),('public','trips'),('public','trip_archives'),
 ('privacy_private','trip_deletions'),('service_operations_private','services')) v(ns,tab) loop
 execute format('create trigger service_brief_source_changed before insert or update or delete on %I.%I for each row execute function service_brief_private.source_changed()',ns,tab);
 end loop;
end $$;
create function service_brief_private.session_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid;cid uuid;
begin
 owner:=(case when TG_TABLE_NAME='mobile_accounts' then to_jsonb(OLD)->>'owner_id' else to_jsonb(OLD)->>'user_id' end)::uuid;
 if TG_OP='UPDATE' and TG_TABLE_NAME='mobile_accounts' and to_jsonb(NEW)->'session_id' is not distinct from to_jsonb(OLD)->'session_id' and to_jsonb(NEW)->'epoch'=to_jsonb(OLD)->'epoch' then return NEW;end if;
 for cid in select id from service_cases_private.cases where owner_id=owner order by id for update nowait loop
 perform service_brief_private.invalidate(cid,owner,owner);
 end loop;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
exception when lock_not_available then raise exception 'BRIEF_BUSY';
end $$;
create trigger service_brief_mobile_session before update or delete on identity_private.mobile_accounts for each row execute function service_brief_private.session_changed();
create trigger service_brief_auth_session before delete on auth.sessions for each row execute function service_brief_private.session_changed();

create function service_brief_private.binding(c service_cases_private.cases) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('schemaVersion','traveler-brief/1','caseId',c.id,'ownerId',c.owner_id,'recipientId',c.recipient_id,'grantRevision',c.revision,'purpose','case_assistance','category',c.category)
$$;
create function service_brief_private.audit_json(e service_brief_private.audit) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('eventId',e.event_id,'revision',e.revision,'actorId',e.actor_id,'action',e.action,'recipientId',e.recipient_id,'grantRevision',e.grant_revision,'fieldKeys',e.field_keys,'createdAt',service_operations_private.ms(e.created_at))
$$;
create function service_brief_private.current_fields(c service_cases_private.cases,b service_brief_private.briefs) returns jsonb language plpgsql set search_path='' as $$
declare f jsonb;
begin
 if b.state is distinct from 'shared' or b.recipient_id is distinct from c.recipient_id or b.grant_revision<>c.revision or b.expires_at<=clock_timestamp() then raise exception 'BRIEF_FORBIDDEN';end if;
 f:=service_brief_private.selected(service_brief_private.fields(c,b.sources),b.selected_keys);
 if jsonb_array_length(f)<>jsonb_array_length(b.selected_keys) or exists(select 1 from jsonb_array_elements(f) where value->>'state'<>'available')
 or service_brief_private.hash(service_brief_private.binding(c)||jsonb_build_object('fields',f))<>b.source_digest then raise exception 'BRIEF_STALE';end if;
 return f;
end $$;
create function service_brief_private.export_rows(owner uuid) returns table(key text,domain text,value jsonb) language sql stable set search_path='' as $$
 select 'brief:'||b.case_id,'brief',jsonb_build_object('caseId',b.case_id,'revision',b.revision,'recipientId',b.recipient_id,'grantRevision',b.grant_revision,'state',b.state,'selectedKeys',b.selected_keys,'sourceDigest',b.source_digest,'sources',b.sources,'updatedAt',service_operations_private.ms(b.updated_at),'expiresAt',service_operations_private.ms(b.expires_at)) from service_brief_private.briefs b where b.owner_id=owner
 union all select 'preview:'||p.id,'preview',jsonb_build_object('previewId',p.id,'caseId',p.case_id,'revision',p.revision,'recipientId',p.recipient_id,'grantRevision',p.grant_revision,'sourceDigest',p.source_digest,'sources',p.sources,'createdAt',service_operations_private.ms(p.created_at),'expiresAt',service_operations_private.ms(p.expires_at)) from service_brief_private.previews p where p.owner_id=owner
 union all select 'audit:'||e.event_id,'audit',jsonb_build_object('caseId',e.case_id,'event',service_brief_private.audit_json(e)) from service_brief_private.audit e where e.owner_id=owner
 union all select 'operation:'||service_brief_private.hash(jsonb_build_array(o.session_id,o.operation_id)),'operation',jsonb_build_object('operationId',o.operation_id,'caseId',o.case_id,'sessionId',o.session_id,'requestDigest',o.request_digest,'requestBytes',case when o.erased then null else convert_from(o.request_bytes,'UTF8') end,'receipt',o.receipt,'erased',o.erased,'createdAt',service_operations_private.ms(o.created_at)) from service_brief_private.operations o where o.actor_id=owner
$$;
create function service_brief_private.export(owner uuid,sess uuid,req uuid) returns jsonb language plpgsql set search_path='' as $$
declare c service_cases_private.cases;b service_brief_private.briefs;p service_brief_private.previews;f jsonb;rows jsonb;out jsonb;lease service_brief_private.export_leases;dig text;basis jsonb:='[]';n integer;
begin
 -- All Cases first, before any Brief/source; privacy export never grants staff data.
 perform 1 from service_cases_private.cases where owner_id=owner order by id for update nowait;
 for c in select * from service_cases_private.cases where owner_id=owner order by id loop
 select * into b from service_brief_private.briefs where case_id=c.id for update nowait;
 if b.state='shared' then
 if c.revoked or c.expires_at<=clock_timestamp() or b.expires_at<=clock_timestamp() then
 perform service_brief_private.invalidate(c.id,owner,owner);
 else
 perform service_brief_private.qualify(c,owner,'owner',true);
 f:=service_brief_private.current_fields(c,b);basis:=basis||jsonb_build_array(f);
 end if;end if;
 for p in select * from service_brief_private.previews where case_id=c.id order by id for update nowait loop
 if p.expires_at<=clock_timestamp() or c.revoked or c.expires_at<=clock_timestamp() then delete from service_brief_private.previews where id=p.id;
 else
 perform service_brief_private.qualify(c,owner,'owner',true);
 f:=service_brief_private.fields(c,p.sources);
 if p.grant_revision<>c.revision or p.recipient_id<>c.recipient_id or p.source_digest<>service_brief_private.hash(service_brief_private.binding(c)||jsonb_build_object('fields',f)) then raise exception 'BRIEF_STALE';end if;
 basis:=basis||jsonb_build_array(f);
 end if;
 end loop;
 end loop;
 select count(*) into n from (select 1 from service_brief_private.export_rows(owner) limit 10001) q;if n>10000 then raise exception 'BRIEF_LIMIT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'domain',domain,'value',value) order by key),'[]') into rows from service_brief_private.export_rows(owner);
 -- Hash current full rights as well as data; never retain the projected values.
 dig:=service_brief_private.hash(jsonb_build_array(rows,basis));
 perform pg_advisory_xact_lock(hashtextextended('traveler-brief-export:'||owner||':'||sess||':'||req,0));
 select * into lease from service_brief_private.export_leases where owner_id=owner and session_id=sess and request_id=req for update;
 if found then
 if lease.expires_at<=clock_timestamp() or lease.source_digest<>dig then raise exception 'BRIEF_STALE';end if;
 else
 insert into service_brief_private.export_leases values(owner,sess,req,clock_timestamp(),clock_timestamp()+interval '30 seconds',dig) returning * into lease;
 end if;
 out:=jsonb_build_object('schemaVersion','traveler-brief-data/1','kind','bundle','requestId',req,'ownerId',owner,'sessionId',sess,'capturedAt',service_operations_private.ms(lease.captured_at),'expiresAt',service_operations_private.ms(lease.expires_at),'sourceDigest',dig,
 'corePackageEnrollment','not_enrolled','allUserDataCompleted',false,'coverage',jsonb_build_object('brief','complete','previews','complete','audit','complete','operations','complete','sourceValues','not_copied','attachments','unavailable'),'rows',rows);
 if octet_length(convert_to(jsonb_build_object('data',out)::text,'UTF8'))>524288 then raise exception 'BRIEF_LIMIT';end if;
 if lease.expires_at<=clock_timestamp() then raise exception 'BRIEF_STALE';end if;
 return out;
end $$;

create function service_brief_private.memory_options(owner uuid) returns jsonb language plpgsql set search_path='' as $$
declare m public.memory_profiles;f jsonb;out jsonb:='[]';
begin
 for m in select p.* from public.memory_profiles p
 join public.memory_consents c on c.id=p.consent_id and c.owner_id=p.owner_id and c.status='granted'
 join public.memory_receipts r on r.id=p.source_receipt_id and r.owner_id=p.owner_id and r.memory_id=p.id
 where p.owner_id=owner and p.revision>0 and p.state in('explicit','confirmed') and p.constraint_kind='preference' and p.summary is not null
 order by p.updated_at desc,p.id limit 3 loop
 f:=service_brief_private.memory_field(owner,m.id,m.revision);if f is not null then out:=out||jsonb_build_array(f);end if;
 end loop;
 return out;
end $$;
create function service_brief_private.operation_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if NEW.actor_id<>OLD.actor_id or NEW.session_id<>OLD.session_id or NEW.surface<>OLD.surface or NEW.operation_id<>OLD.operation_id
 or NEW.request_digest<>OLD.request_digest or NEW.created_at<>OLD.created_at or OLD.erased
 or not NEW.erased or NEW.case_id is not null or NEW.request_bytes is not null or NEW.receipt is not null then raise exception 'IMMUTABLE_BRIEF_OPERATION';end if;
 return NEW;
end $$;
create trigger service_brief_operation_guard before update on service_brief_private.operations for each row execute function service_brief_private.operation_guard();

create function public.service_case_brief_v1(p_input jsonb,p_request_bytes text,p_surface text)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare u uuid;sess uuid;a text;v jsonb;raw bytea;op uuid;cid uuid;dig text;abandon boolean:=false;business boolean;
 c service_cases_private.cases;b service_brief_private.briefs;p service_brief_private.previews;o service_brief_private.operations;
 f jsonb;out jsonb;chosen jsonb;refs jsonb;mems jsonb;profile jsonb;intake jsonb;m jsonb;events jsonb;rev bigint;ts timestamptz;expiry timestamptz;n integer;
begin
 u:=service_brief_private.actor();sess:=(auth.jwt()->>'session_id')::uuid;
 if p_surface is null or p_surface not in('owner','staff') or p_request_bytes is null or octet_length(convert_to(p_request_bytes,'UTF8')) not between 2 and 48000 then raise exception 'INVALID_INPUT';end if;
 begin v:=p_request_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 if v is distinct from p_input then raise exception 'INVALID_INPUT';end if;
 a:=v->>'action';raw:=convert_to(p_request_bytes,'UTF8');
 if a='abandon' then
 if not service_operations_private.exact(v,array['action','operationId','mutationBytes']) or not service_operations_private.uuid(v->'operationId') or jsonb_typeof(v->'mutationBytes') is distinct from 'string' then raise exception 'INVALID_INPUT';end if;
 begin v:=(p_input->>'mutationBytes')::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 if v->'operationId' is distinct from p_input->'operationId' or coalesce(v->>'action','') not in('share','withdraw','delete') then raise exception 'INVALID_INPUT';end if;
 raw:=convert_to(p_input->>'mutationBytes','UTF8');abandon:=true;
 end if;
 if octet_length(raw)>24000 or service_brief_private.valid(v) is distinct from true then raise exception 'INVALID_INPUT';end if;
 if p_surface='staff' and a not in('read','locate') then raise exception 'CASE_FORBIDDEN';end if;
 business:=a in('source_options','preview','share','read_preview','locate','read');
 if business and not exists(select 1 from service_brief_private.settings where enabled) then raise exception 'BRIEF_DISABLED';end if;
 if a='export' then return service_brief_private.export(u,sess,(v->>'requestId')::uuid);end if;
 if v ? 'operationId' then
 op:=(v->>'operationId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('traveler-brief:'||u||':'||sess||':'||p_surface||':'||op,0));
 select * into o from service_brief_private.operations where actor_id=u and session_id=sess and surface=p_surface and operation_id=op;
 if o.erased then raise exception 'BRIEF_OPERATION_ERASED';end if;
 end if;
 if a='read_operation' then
 if o.operation_id is null then return jsonb_build_object('receipt',null);end if;
 -- Content-free deletion recovery needs only the original authenticated session.
 if o.receipt->>'action'='delete' and o.receipt->>'outcome'='applied' then return jsonb_build_object('receipt',o.receipt);end if;
 cid:=o.case_id;
 elsif a='read_preview' then
 select * into p from service_brief_private.previews where id=(v->>'previewId')::uuid and owner_id=u and session_id=sess;
 if not found then raise exception 'BRIEF_NOT_FOUND';end if;cid:=p.case_id;
 else cid:=(v->>'caseId')::uuid;
 end if;
 -- Case -> Brief -> source NOWAIT. Source writers use the reverse order and
 -- their BEFORE triggers use Case NOWAIT, so neither side can form a deadlock.
 select * into c from service_cases_private.cases where id=cid for update nowait;
 if not found then
 if o.receipt->>'action'='delete' and o.receipt->>'outcome'='applied' then
 dig:=encode(pg_catalog.sha256(raw),'hex');if dig<>o.request_digest then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;return o.receipt;
 end if;raise exception 'CASE_FORBIDDEN';end if;
 perform service_brief_private.qualify(c,u,p_surface,business);
 select * into b from service_brief_private.briefs where case_id=cid for update nowait;
 rev:=coalesce(b.revision,0);
 if op is not null then
 select * into o from service_brief_private.operations where actor_id=u and session_id=sess and surface=p_surface and operation_id=op for update;
 if o.erased then raise exception 'BRIEF_OPERATION_ERASED';end if;
 end if;
 if a='read_operation' or o.operation_id is not null then
 if a<>'read_operation' then
 dig:=encode(pg_catalog.sha256(raw),'hex');if o.request_digest<>dig then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 end if;
 if o.receipt->>'action'='delete' and o.receipt->>'outcome'='applied' then
 if a='read_operation' then return jsonb_build_object('receipt',o.receipt);else return o.receipt;end if;
 end if;
 if c.recipient_id::text is distinct from convert_from(o.request_bytes,'UTF8')::jsonb->>'recipientId' or c.revision<>(o.receipt->>'grantRevision')::integer then raise exception 'BRIEF_FORBIDDEN';end if;
 if o.receipt->>'action'='share' and o.receipt->>'outcome'='applied' then
 perform service_brief_private.qualify(c,u,'owner',true);
 if b.revision<>(o.receipt->>'revision')::bigint then raise exception 'BRIEF_STALE';end if;
 perform service_brief_private.current_fields(c,b);
 end if;
 if a='read_operation' then return jsonb_build_object('receipt',o.receipt);else return o.receipt;end if;
 end if;
 if a='audit' then
 select count(*) into n from service_brief_private.audit where case_id=cid;if n>200 then raise exception 'BRIEF_LIMIT';end if;
 select coalesce(jsonb_agg(service_brief_private.audit_json(e) order by e.created_at,e.event_id),'[]') into events from service_brief_private.audit e where e.case_id=cid;
 return jsonb_build_object('schemaVersion','traveler-brief/1','kind','audit','caseId',cid,'ownerId',u,'revision',rev,'events',events,'complete',true);
 end if;
 if a='source_options' then
 profile:=service_brief_private.profile_field(u);mems:=service_brief_private.memory_options(u);intake:=service_brief_private.current_intake(c);
 if intake is not null then intake:=jsonb_build_object('messageId',intake->'source'->'id','revision',intake->'source'->'revision','updatedAt',intake->'source'->'updatedAt','fields',service_brief_private.intake_fields(intake));end if;
 if c.expires_at<=clock_timestamp() then raise exception 'BRIEF_FORBIDDEN';end if;
 return jsonb_build_object('schemaVersion','traveler-brief/1','kind','source_options','caseId',cid,'ownerId',u,'recipientId',c.recipient_id,'grantRevision',c.revision,'expiresAt',service_operations_private.ms(c.expires_at),'profilePace',profile,'memories',mems,'memoryScope','latest_three_preferences','intake',intake);
 end if;
 if a='locate' then
 perform service_brief_private.current_fields(c,b);
 if p_surface='staff' then perform service_brief_private.event(c,rev,u,'read',b.selected_keys);end if;
 return service_brief_private.binding(c)||jsonb_build_object('kind','locator','revision',rev,'expiresAt',service_operations_private.ms(b.expires_at));
 end if;
 if a='read_preview' then
 select * into p from service_brief_private.previews where id=(v->>'previewId')::uuid and owner_id=u and session_id=sess for update nowait;
 if not found or p.expires_at<=clock_timestamp() or p.grant_revision<>c.revision or p.recipient_id<>c.recipient_id or p.revision<>rev then raise exception 'BRIEF_STALE';end if;
 f:=service_brief_private.fields(c,p.sources);dig:=service_brief_private.hash(service_brief_private.binding(c)||jsonb_build_object('fields',f));
 if dig<>p.source_digest then raise exception 'BRIEF_STALE';end if;
 return service_brief_private.binding(c)||jsonb_build_object('kind','preview','previewId',p.id,'revision',p.revision,'sourceDigest',dig,'createdAt',service_operations_private.ms(p.created_at),'expiresAt',service_operations_private.ms(p.expires_at),'fields',f,'noticeVersion','case-minimal-brief/1');
 end if;
 if c.recipient_id::text is distinct from v->>'recipientId' or c.revision::text is distinct from v->>'grantRevision' then raise exception 'BRIEF_CONFLICT';end if;
 if a='preview' then
 refs:=v->'sources';mems:=service_brief_private.memory_options(u);
 for m in select value from jsonb_array_elements(refs->'memories') loop
 if not exists(select 1 from jsonb_array_elements(mems) candidate where candidate->'source'->'id'=m->'id' and candidate->'source'->'revision'=m->'revision') then raise exception 'BRIEF_STALE';end if;
 end loop;
 if refs->'intakeMessageId'<>'null'::jsonb and service_brief_private.current_intake(c)->'source'->'id' is distinct from refs->'intakeMessageId' then raise exception 'BRIEF_STALE';end if;
 f:=service_brief_private.fields(c,refs);dig:=service_brief_private.hash(service_brief_private.binding(c)||jsonb_build_object('fields',f));
 ts:=clock_timestamp();expiry:=least(c.expires_at,ts+interval '5 minutes');if expiry<=ts then raise exception 'BRIEF_FORBIDDEN';end if;
 select count(*) into n from service_brief_private.previews where owner_id=u;if n>=200 then raise exception 'BRIEF_LIMIT';end if;
 insert into service_brief_private.previews(case_id,owner_id,session_id,revision,recipient_id,grant_revision,sources,source_digest,created_at,expires_at)
 values(cid,u,sess,rev,c.recipient_id,c.revision,refs,dig,ts,expiry) returning * into p;
 perform service_brief_private.event(c,rev,u,'previewed','[]');
 return service_brief_private.binding(c)||jsonb_build_object('kind','preview','previewId',p.id,'revision',rev,'sourceDigest',dig,'createdAt',service_operations_private.ms(p.created_at),'expiresAt',service_operations_private.ms(p.expires_at),'fields',f,'noticeVersion','case-minimal-brief/1');
 end if;
 if rev<>(v->>'expectedRevision')::bigint then raise exception 'BRIEF_CONFLICT';end if;
 if a='read' then
 f:=service_brief_private.current_fields(c,b);
 if p_surface='staff' then perform service_brief_private.event(c,rev,u,'read',b.selected_keys);end if;
 return service_brief_private.binding(c)||jsonb_build_object('kind','brief','revision',rev,'updatedAt',service_operations_private.ms(b.updated_at),'expiresAt',service_operations_private.ms(b.expires_at),'sourceDigest',b.source_digest,'fields',f,'noticeVersion','case-minimal-brief/1');
 end if;
 dig:=encode(pg_catalog.sha256(raw),'hex');ts:=clock_timestamp();
 if not abandon then
 if rev>=9007199254740990 then raise exception 'BRIEF_LIMIT';end if;
 if a='share' then
 select * into p from service_brief_private.previews where id=(v->>'previewId')::uuid and owner_id=u and session_id=sess and case_id=cid for update nowait;
 if not found or p.expires_at<=ts or p.recipient_id<>c.recipient_id or p.grant_revision<>c.revision or p.revision<>rev or p.source_digest<>v->>'sourceDigest' then raise exception 'BRIEF_STALE';end if;
 f:=service_brief_private.fields(c,p.sources);
 if service_brief_private.hash(service_brief_private.binding(c)||jsonb_build_object('fields',f))<>p.source_digest then raise exception 'BRIEF_STALE';end if;
 chosen:=service_brief_private.selected(f,v->'selectedKeys');
 if jsonb_array_length(chosen)<>jsonb_array_length(v->'selectedKeys') or exists(select 1 from jsonb_array_elements(chosen) where value->>'state'<>'available') then raise exception 'BRIEF_FORBIDDEN';end if;
 refs:=service_brief_private.selected_refs(chosen);
 perform service_brief_private.erase(cid,u);
 insert into service_brief_private.briefs(case_id,owner_id,revision,recipient_id,grant_revision,state,selected_keys,sources,source_digest,updated_at,expires_at)
 values(cid,u,rev+1,c.recipient_id,c.revision,'shared',v->'selectedKeys',refs,service_brief_private.hash(service_brief_private.binding(c)||jsonb_build_object('fields',chosen)),ts,c.expires_at)
 on conflict(case_id) do update set revision=excluded.revision,recipient_id=excluded.recipient_id,grant_revision=excluded.grant_revision,state=excluded.state,selected_keys=excluded.selected_keys,sources=excluded.sources,source_digest=excluded.source_digest,updated_at=excluded.updated_at,expires_at=excluded.expires_at;
 perform service_brief_private.event(c,rev+1,u,'shared',v->'selectedKeys');
 elsif v->>'action' in('withdraw','delete') then
 perform service_brief_private.erase(cid,u,v->>'action'='delete');
 insert into service_brief_private.briefs(case_id,owner_id,revision,recipient_id,grant_revision,state,updated_at)
 values(cid,u,rev+1,c.recipient_id,c.revision,case when v->>'action'='delete' then 'deleted' else 'withdrawn' end,ts)
 on conflict(case_id) do update set revision=excluded.revision,recipient_id=excluded.recipient_id,grant_revision=excluded.grant_revision,state=excluded.state,selected_keys='[]',sources=null,source_digest=null,updated_at=excluded.updated_at,expires_at=null;
 if v->>'action'='withdraw' then perform service_brief_private.event(c,rev+1,u,'withdrawn','[]');end if;
 else raise exception 'INVALID_INPUT';end if;
 rev:=rev+1;
 end if;
 out:=jsonb_build_object('schemaVersion','traveler-brief/1','kind','receipt','operationId',op,'requestDigest',dig,'action',v->>'action','outcome',case when abandon then 'cancelled' else 'applied' end,'caseId',cid,'revision',rev,'grantRevision',c.revision,'createdAt',service_operations_private.ms(ts));
 insert into service_brief_private.operations(actor_id,session_id,surface,operation_id,case_id,request_digest,request_bytes,receipt,created_at) values(u,sess,p_surface,op,cid,dig,raw,out,ts);
 return out;
exception when lock_not_available then raise exception 'BRIEF_BUSY';
end $$;
revoke all on all functions in schema service_brief_private from public,anon,authenticated,service_role;
revoke all on function public.service_case_brief_v1(jsonb,text,text) from public,anon,authenticated,service_role;
