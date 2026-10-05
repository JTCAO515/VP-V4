-- VPJ-58 selected material privacy exit. Default closed; no target enrollment.
-- Original reservation/PDF business writers and applied migrations stay intact.
create schema material_exit_private;
revoke all on schema material_exit_private from public,anon,authenticated,service_role;
alter default privileges in schema material_exit_private revoke execute on functions from public;
create table material_exit_private.requests_v1 (
 request_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 mobile_epoch bigint not null check(mobile_epoch between 1 and 9007199254740991),
-- This source-free request is also the permanent request/object/operation fence.
 -- Retain it across Trip deletion; root account erasure still cascades.
 trip_id uuid not null,
 scope text not null check(scope in ('reservation-reference-data/1','pdf-intake-data/1','material-exit-progress/1')),
 object_ids uuid[] not null check(cardinality(object_ids) between 1 and 20),
 reference_operation_ids uuid[] not null default '{}' check(cardinality(reference_operation_ids)<=2000),
 trip_version integer not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 preview_digest text not null check(preview_digest ~ '^[a-f0-9]{64}$'),
 captured_at bigint not null,expires_at bigint not null check(expires_at>captured_at and expires_at<=captured_at+30000),
 request_digest text check(request_digest ~ '^[a-f0-9]{64}$'),
 decision text check(decision in ('export','erase')),decided_at bigint,
 temporary_records integer,unapplied_proposals integer,
 check((decision is null and request_digest is null and decided_at is null) or
 (decision is not null and request_digest is not null and decided_at between captured_at and expires_at)),
 check(temporary_records is null or temporary_records between 0 and cardinality(object_ids)),
 check(unapplied_proposals is null or unapplied_proposals between 0 and cardinality(object_ids))
);
create index material_request_owner_trip_v1 on material_exit_private.requests_v1(owner_id,trip_id,request_id);
create table material_exit_private.progress_v1 (
 request_id uuid primary key references material_exit_private.requests_v1(request_id) on delete cascade,
 last_cursor uuid,next_cursor uuid,pages integer not null default 0 check(pages between 0 and 4),
 rows integer not null default 0 check(rows between 0 and 20),bytes integer not null default 0 check(bytes between 0 and 1000000),
 terminal boolean not null default false,erased boolean not null default false
);
-- Owner-keyed fences survive source deletion (including a Trip cascade). No body.
create table material_exit_private.reservation_fences_v1 (
 owner_id uuid not null references auth.users(id) on delete cascade,
 object_id uuid not null,kind text not null check(kind in ('reference','operation')),
 request_id uuid not null,primary key(owner_id,kind,object_id)
);
create index material_fence_request_v1 on material_exit_private.reservation_fences_v1(request_id);
do $$declare n text;begin foreach n in array array['requests_v1','progress_v1','reservation_fences_v1'] loop
 execute format('alter table material_exit_private.%I enable row level security',n);
 execute format('revoke all on material_exit_private.%I from public,anon,authenticated,service_role',n);
end loop;end$$;

-- A deleted Trip loses only transient cursor counters; immutable source-free
-- request/receipt and reference/operation fences cannot be reset by recreation.
create function material_exit_private.trip_progress_erase_v1() returns trigger
language plpgsql security definer set search_path='' as $$begin
 update material_exit_private.progress_v1 set last_cursor=null,next_cursor=null,pages=0,rows=0,bytes=0,terminal=false,erased=true
 where request_id in(select request_id from material_exit_private.requests_v1 where trip_id=OLD.id and owner_id=OLD.owner_id);
 return OLD;
end$$;
create trigger material_trip_progress_erase_v1 before delete on public.trips
 for each row execute function material_exit_private.trip_progress_erase_v1();

create function material_exit_private.boundaries_v1(scope_n text) returns jsonb
language sql immutable set search_path='' as $$
 select case scope_n
 when 'reservation-reference-data/1' then '{"exportFields":["current_reference","reference_events","reference_operation_metadata"],"eraseFields":["selected_current_reference","selected_reference_events","selected_reference_operations"],"retained":["nonreplayable_object_operation_fences","original_trip_content","financial_records"],"missing":["original_local_material_bytes","external_order_copies","external_order_cancel_refund","provider_verification"]}'::jsonb
 when 'pdf-intake-data/1' then '{"exportFields":["live_corrected_fields","original_locator_hashes","minimal_pdf_operation_metadata"],"eraseFields":["temporary_input_bytes","temporary_command_fields","unapplied_pdf_proposal_patch"],"retained":["pdf_operation_replay_fences","applied_trip_proposal_history","confirmation_event","financial_records"],"missing":["original_pdf_bytes","full_page_text","device_appgroup_copies","external_files","scheduled_target_retention"]}'::jsonb
 when 'material-exit-progress/1' then '{"exportFields":["selected_exit_request_metadata","selected_exit_page_progress","retained_exit_fence_metadata"],"eraseFields":["selected_transient_exit_page_progress"],"retained":["nonreplayable_request_object_operation_fences","selected_object_ids","request_source_preview_hashes","minimal_erasure_receipt"],"missing":["other_unselected_exit_requests"]}'::jsonb end
$$;
create function material_exit_private.uuid_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(reservation_private.uuid_v1(v) and v#>>'{}'=lower(v#>>'{}'),false)
$$;
create function material_exit_private.ids_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb;prior text;begin
 if jsonb_typeof(v) is distinct from 'array' then return false;end if;
 if jsonb_array_length(v) not between 1 and 20 then return false;end if;
 for item in select value from jsonb_array_elements(v) loop
 if material_exit_private.uuid_v1(item) is not true or prior is not null and item#>>'{}'<=prior then return false;end if;prior:=item#>>'{}';end loop;
 return true;
end$$;
create function material_exit_private.input_v1(v jsonb,action_n text) returns boolean
language plpgsql immutable set search_path='' as $$
declare keys text[];original jsonb;begin
 keys:=array['action','scope','tripId'];
 if action_n='list' then keys:=keys||array['cursor','limit'];
 else keys:=keys||array['requestId','objectIds'];
 if action_n in ('export','erase') then keys:=keys||array['previewDigest','confirmed'];
 elsif action_n='recover' then keys:=keys||array['mutationBytes'];
 elsif action_n='page' then keys:=keys||array['sourceDigest','previewDigest','cursor','limit'];
 elsif action_n='proof' then keys:=keys||array['sourceDigest','previewDigest'];
 elsif action_n<>'preview' then return false;end if;end if;
 if reservation_private.exact_v1(v,keys) is not true or v->>'action' is distinct from action_n
 or (v->>'scope' in ('reservation-reference-data/1','pdf-intake-data/1','material-exit-progress/1')) is not true
 or material_exit_private.uuid_v1(v->'tripId') is not true then return false;end if;
 if action_n<>'list' and (material_exit_private.uuid_v1(v->'requestId') is not true or material_exit_private.ids_v1(v->'objectIds') is not true
 or v->>'scope'='material-exit-progress/1' and v->'objectIds' ? (v->>'requestId')) then return false;end if;
 if action_n in ('export','erase','page','proof') and (jsonb_typeof(v->'previewDigest')='string' and v->>'previewDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 if action_n in ('export','erase') and v->'confirmed' is distinct from 'true'::jsonb then return false;end if;
 if action_n in ('page','proof') and (jsonb_typeof(v->'sourceDigest')='string' and v->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 if action_n in ('list','page') then
 if v->'limit' is distinct from to_jsonb(case when action_n='list' then 20 else 5 end) then return false;end if;
 if v->'cursor'<>'null'::jsonb and (reservation_private.exact_v1(v->'cursor',array['sourceDigest','afterId']) is not true
 or material_exit_private.uuid_v1(v->'cursor'->'afterId') is not true
 or (jsonb_typeof(v->'cursor'->'sourceDigest')='string' and v->'cursor'->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true) then return false;end if;
 end if;
 if action_n='recover' then
 if jsonb_typeof(v->'mutationBytes') is distinct from 'string' or octet_length(v->>'mutationBytes')>8192 then return false;end if;
 original:=(v->>'mutationBytes')::jsonb;
 if material_exit_private.input_v1(original,'erase') is not true or (original-array['action','previewDigest','confirmed']) is distinct from (v-array['action','mutationBytes']) then return false;end if;
 end if;
 return true;
exception when others then return false;end$$;

create function material_exit_private.reservation_guard_v1() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from material_exit_private.reservation_fences_v1 where owner_id=NEW.owner_id and kind='reference' and object_id=NEW.reference_id)
 then raise exception 'MATERIAL_ERASED_ID';end if;
 if TG_TABLE_NAME='operations_v1' then
 if exists(select 1 from material_exit_private.reservation_fences_v1 where owner_id=NEW.owner_id and kind='operation' and object_id=NEW.operation_id) then raise exception 'MATERIAL_ERASED_ID';end if;
 end if;return NEW;
end$$;
create trigger material_reservation_reference_v1 before insert or update on reservation_private.current_v1
 for each row execute function material_exit_private.reservation_guard_v1();
create trigger material_reservation_operation_v1 before insert or update on reservation_private.operations_v1
 for each row execute function material_exit_private.reservation_guard_v1();
create function material_exit_private.request_guard_v1() returns trigger language plpgsql set search_path='' as $$begin
 if (to_jsonb(NEW)-array['request_digest','decision','decided_at','temporary_records','unapplied_proposals','reference_operation_ids']) is distinct from
 (to_jsonb(OLD)-array['request_digest','decision','decided_at','temporary_records','unapplied_proposals','reference_operation_ids'])
 or OLD.decision is not null and NEW is distinct from OLD then raise exception 'MATERIAL_REQUEST_IMMUTABLE';end if;
 return NEW;end$$;
create trigger material_request_immutable_v1 before update on material_exit_private.requests_v1
 for each row execute function material_exit_private.request_guard_v1();

create function material_exit_private.binding_v1(r material_exit_private.requests_v1) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('schemaVersion','material-reference-data/1','scope',r.scope,'requestId',r.request_id,'tripId',r.trip_id,'objectIds',r.object_ids,
 'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,
 'capturedAt',r.captured_at,'expiresAt',r.expires_at,'tripVersion',r.trip_version,'boundaries',material_exit_private.boundaries_v1(r.scope),'allUserDataCompleted',false)
$$;
create function material_exit_private.receipt_v1(r material_exit_private.requests_v1) returns jsonb
language sql stable set search_path='' as $$
 select material_exit_private.binding_v1(r)||jsonb_build_object('kind','receipt','state','erased','requestDigest',r.request_digest,'decidedAt',r.decided_at,
 'effects',jsonb_build_object('objects',cardinality(r.object_ids),'temporaryRecords',r.temporary_records,'unappliedProposals',r.unapplied_proposals,
 'tripMutation','none','externalOrders','not_contacted','financialRecords','not_modified')) where r.decision='erase'
$$;

-- Safe projections only. The erasure CAS separately hashes full sensitive source,
-- command bytes, patch/replay state, source revision and installed confirmation.
create function material_exit_private.sources_v1(u uuid,t public.trips,s uuid,epoch_n bigint,scope_n text,ids uuid[],at_time timestamptz)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare id_n uuid;c reservation_private.current_v1%rowtype;o pdf_intake_private.operations_v1%rowtype;
 r material_exit_private.requests_v1%rowtype;p public.trip_proposals%rowtype;g material_exit_private.progress_v1%rowtype;
 rows_n jsonb:='[]';internal_n jsonb:='[]';row_n jsonb;events_n jsonb;ops_n jsonb;confirmation jsonb;
 revision_n bigint;deadline timestamptz;live_n boolean;
begin
 if scope_n='pdf-intake-data/1' then
 -- Match original confirmation writer: Trip, proposal, original operation, source.
 perform 1 from public.trip_proposals where owner_id=u and trip_id=t.id and id in
 (select proposal_id from pdf_intake_private.operations_v1 where owner_id=u and trip_id=t.id and operation_id=any(ids)) order by id for update nowait;
 end if;
 foreach id_n in array ids loop
 if scope_n='reservation-reference-data/1' then
 select * into c from reservation_private.current_v1 where owner_id=u and trip_id=t.id and reference_id=id_n for update nowait;
 if not found then raise exception 'MATERIAL_SOURCE_MISSING';end if;
 perform 1 from reservation_private.events_v1 where owner_id=u and reference_id=id_n order by revision for share nowait;
 perform 1 from reservation_private.operations_v1 where owner_id=u and reference_id=id_n order by applied_revision for share nowait;
 select coalesce(jsonb_agg(jsonb_build_object('revision',e.revision,'operationId',e.operation_id,'tripVersion',e.trip_version,'status',e.status,
 'evidenceTier',e.evidence_tier,'sourceKind',e.source_kind,'contentDigest',e.content_digest,'confirmedAt',reservation_private.ms_v1(e.confirmed_at)) order by e.revision),'[]')
 into events_n from (select * from reservation_private.events_v1 where owner_id=u and reference_id=id_n order by revision limit 101) e;
 select coalesce(jsonb_agg(jsonb_build_object('operationId',x.operation_id,'referenceId',x.reference_id,'tripId',x.trip_id,'appliedRevision',x.applied_revision) order by x.applied_revision),'[]')
 into ops_n from (select * from reservation_private.operations_v1 where owner_id=u and reference_id=id_n order by applied_revision limit 101) x;
 if jsonb_array_length(events_n)>100 or jsonb_array_length(ops_n)>100 then raise exception 'MATERIAL_CAPACITY';end if;
 if jsonb_array_length(events_n)<>c.revision or jsonb_array_length(ops_n)<>c.revision then raise exception 'MATERIAL_SOURCE_INVALID';end if;
 row_n:=jsonb_build_object('current',reservation_private.current_wire_v1(c,t.head_version),'events',events_n,'operations',ops_n,'historical',true);
 internal_n:=internal_n||jsonb_build_array(jsonb_build_array(to_jsonb(c),events_n,
 (select jsonb_agg(to_jsonb(x) order by applied_revision) from reservation_private.operations_v1 x where owner_id=u and reference_id=id_n)));
 elsif scope_n='pdf-intake-data/1' then
 select * into o from pdf_intake_private.operations_v1 where owner_id=u and trip_id=t.id and operation_id=id_n for update nowait;
 if not found then raise exception 'MATERIAL_SOURCE_MISSING';end if;
 select * into p from public.trip_proposals where id=o.proposal_id;
 confirmation:=pdf_intake_private.confirmation_v1(o);
 if p.status='applied' and confirmation is null then raise exception 'MATERIAL_SOURCE_INVALID';end if;
 live_n:=not o.cancelled and o.expires_at>at_time and o.session_id=s and o.session_epoch=epoch_n and o.command is not null;
 if live_n then deadline:=least(deadline,o.expires_at);end if;
 row_n:=jsonb_build_object('operationId',o.operation_id,'tripId',o.trip_id,'sessionEpoch',o.session_epoch,'requestDigest',o.request_digest,
 'commandDigest',o.command_digest,'previewDigest',o.preview_digest,'proposalId',o.proposal_id,'proposalRevision',o.proposal_revision,'baseTripVersion',o.base_version,
 'expiresAt',export_private.ms_v1(o.expires_at),'cancelled',o.cancelled,'fields',case when live_n then o.command->'fields' else null end,
 'contentHash',case when live_n then o.command->'contentHash' else null end,'rawPdfIncluded',false,'fullTextIncluded',false,
 'evidenceTier','user_checked_local_pdf','sourceAvailability','local_only','orderVerification','unavailable','operation',pdf_intake_private.receipt_v1(o,t));
 internal_n:=internal_n||jsonb_build_array(jsonb_build_array(to_jsonb(o),to_jsonb(p),confirmation,
 (select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id),'[]') from pdf_intake_private.confirm_proofs_v1 x where proposal_id=o.proposal_id)));
 elsif scope_n='material-exit-progress/1' then
 select * into r from material_exit_private.requests_v1 where owner_id=u and trip_id=t.id and request_id=id_n for update nowait;
 if not found then raise exception 'MATERIAL_SOURCE_MISSING';end if;
 select * into g from material_exit_private.progress_v1 where request_id=id_n for update nowait;
 row_n:=jsonb_build_object('objectId',id_n,'tripId',t.id,'originalScope',r.scope,'objectIds',r.object_ids,'referenceOperationIds',r.reference_operation_ids,
 'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,'requestDigest',r.request_digest,
 'state',case when r.decision='erase' then 'erased' when r.expires_at<=floor(extract(epoch from at_time)*1000) then 'expired'
 when r.decision='export' and g.terminal and not g.erased then 'exported' when r.decision='export' then 'exporting' else 'previewed' end,
 'capturedAt',r.captured_at,'expiresAt',r.expires_at,'decidedAt',r.decided_at,'pages',coalesce(g.pages,0),'rows',coalesce(g.rows,0),'progressErased',coalesce(g.erased,false));
 internal_n:=internal_n||jsonb_build_array(jsonb_build_array(to_jsonb(r),to_jsonb(g)));
 else raise exception 'INVALID_INPUT';end if;
 rows_n:=rows_n||jsonb_build_array(row_n);
 end loop;
 if scope_n='pdf-intake-data/1' then
 select revision into revision_n from pdf_intake_private.source_revisions_v1 where owner_id=u for share nowait;
 end if;
 return jsonb_build_object('items',rows_n,'sourceDigest',reservation_private.digest_v1(jsonb_build_array(u,s,epoch_n,t.id,t.head_version,scope_n,ids,internal_n,rows_n,revision_n)),
 'deadline',case when deadline is null then null else floor(extract(epoch from deadline)*1000)::bigint end);
end$$;

create function material_exit_private.list_v1(u uuid,t public.trips,s uuid,epoch_n bigint,scope_n text,at_time timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];id_n uuid;items jsonb:='[]';internal_n jsonb:='[]';row_n jsonb;
 c reservation_private.current_v1%rowtype;o pdf_intake_private.operations_v1%rowtype;r material_exit_private.requests_v1%rowtype;
 g material_exit_private.progress_v1%rowtype;p public.trip_proposals%rowtype;state_n text;
begin
 if scope_n='reservation-reference-data/1' then
 select array_agg(reference_id order by reference_id) into ids from (select reference_id from reservation_private.current_v1 where owner_id=u and trip_id=t.id order by reference_id limit 10001) q;
 elsif scope_n='pdf-intake-data/1' then
 select array_agg(operation_id order by operation_id) into ids from (select operation_id from pdf_intake_private.operations_v1 where owner_id=u and trip_id=t.id order by operation_id limit 10001) q;
 elsif scope_n='material-exit-progress/1' then
 select array_agg(request_id order by request_id) into ids from (select request_id from material_exit_private.requests_v1 where owner_id=u and trip_id=t.id order by request_id limit 10001) q;
 else raise exception 'INVALID_INPUT';end if;
 ids:=coalesce(ids,'{}'::uuid[]);
 if cardinality(ids)>10000 then raise exception 'MATERIAL_CAPACITY';end if;
 if scope_n='pdf-intake-data/1' then
 perform 1 from public.trip_proposals where owner_id=u and trip_id=t.id and id in
 (select proposal_id from pdf_intake_private.operations_v1 where owner_id=u and operation_id=any(ids)) order by id for share nowait;
 end if;
 foreach id_n in array ids loop
 if scope_n='reservation-reference-data/1' then
 select * into c from reservation_private.current_v1 where owner_id=u and trip_id=t.id and reference_id=id_n for share nowait;
 if not found then raise exception 'MATERIAL_SOURCE_MISSING';end if;
 row_n:=jsonb_build_object('objectId',id_n,'revision',c.revision,'label',c.fields->'title','materialExpiresAt',null,'sourceState','active');
 internal_n:=internal_n||jsonb_build_array(to_jsonb(c));
 elsif scope_n='pdf-intake-data/1' then
 select * into o from pdf_intake_private.operations_v1 where owner_id=u and trip_id=t.id and operation_id=id_n for share nowait;
 if not found then raise exception 'MATERIAL_SOURCE_MISSING';end if;
 select * into p from public.trip_proposals where id=o.proposal_id;
 state_n:=pdf_intake_private.receipt_v1(o,t)->>'state';
 row_n:=jsonb_build_object('objectId',id_n,'revision',null,'label',null,'materialExpiresAt',case when o.expires_at is null then null else floor(extract(epoch from o.expires_at)*1000)::bigint end,'sourceState',state_n);
 internal_n:=internal_n||jsonb_build_array(jsonb_build_array(to_jsonb(o),to_jsonb(p),pdf_intake_private.confirmation_v1(o)));
 else
 select * into r from material_exit_private.requests_v1 where owner_id=u and trip_id=t.id and request_id=id_n for share nowait;
 if not found then raise exception 'MATERIAL_SOURCE_MISSING';end if;
 select * into g from material_exit_private.progress_v1 where request_id=id_n for share nowait;
 row_n:=jsonb_build_object('objectId',id_n,'revision',null,'label',null,'materialExpiresAt',null,'sourceState',case when r.decision='erase' then 'erased' else 'retained' end);
 internal_n:=internal_n||jsonb_build_array(jsonb_build_array(to_jsonb(r),to_jsonb(g)));
 end if;
 items:=items||jsonb_build_array(row_n);
 end loop;
 return jsonb_build_object('items',items,'sourceDigest',reservation_private.digest_v1(jsonb_build_array(u,s,epoch_n,t.id,t.head_version,scope_n,internal_n,items)));
end$$;

create function public.privacy_material_reference_v1(p_action text,p_input_bytes text,p_expected_epoch bigint)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();s uuid;epoch_n bigint;at_time timestamptz;now_ms bigint;deadline bigint;
 v jsonb;action_n text;scope_n text;trip_n uuid;req uuid;ids uuid[];id_n uuid;t public.trips%rowtype;
 r material_exit_private.requests_v1%rowtype;g material_exit_private.progress_v1%rowtype;
 sources jsonb;items jsonb;binding jsonb;result_n jsonb;digest_n text;request_digest_n text;cursor_n jsonb;after_n uuid;
 page_n jsonb;last_n uuid;more_n boolean;replay_n boolean:=false;n integer;byte_n integer;complete_n boolean;
 reference_ops uuid[];temporary_n integer:=0;proposals_n integer:=0;affected_n integer;
begin
 -- Account/session authority precedes input IDs, source feedback or any effect.
 if u is null or auth.role() is distinct from 'authenticated' or auth.jwt()->>'role' is distinct from 'authenticated'
 or auth.jwt()->>'is_anonymous' is distinct from 'false'
 or material_exit_private.uuid_v1(auth.jwt()->'session_id') is not true then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34)) then raise lock_not_available using message='MATERIAL_LOCK_CONFLICT';end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 select epoch into epoch_n from identity_private.mobile_accounts where owner_id=u and session_id=s for update nowait;
 if not found or p_expected_epoch is distinct from epoch_n then raise exception 'SESSION_REPLACED';end if;
 perform 1 from auth.sessions where id=s and user_id=u for key share nowait;if not found then raise exception 'SESSION_REPLACED';end if;
 perform identity_private.guard_mobile_rpc_v2();
 if identity_private.mobile_access_v2() is not true or not exists(select 1 from identity_private.mobile_attempts where owner_id=u and session_id=s and epoch=epoch_n)
 then raise exception 'SESSION_REPLACED';end if;
 at_time:=clock_timestamp();now_ms:=floor(extract(epoch from at_time)*1000)::bigint;
 if not exists(select 1 from auth.sessions where id=s and user_id=u and created_at between at_time-interval '5 minutes' and at_time)
 then raise exception 'REAUTHENTICATION_REQUIRED';end if;
 if p_action is null or p_input_bytes is null or octet_length(p_input_bytes)>(case when p_action='recover' then 16384 else 8192 end) then raise exception 'INVALID_INPUT';end if;
 begin v:=p_input_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 action_n:=case when p_action='export_start' then 'export' else p_action end;
 if material_exit_private.input_v1(v,action_n) is not true then raise exception 'INVALID_INPUT';end if;
 scope_n:=v->>'scope';trip_n:=(v->>'tripId')::uuid;
 if action_n<>'list' then
 req:=(v->>'requestId')::uuid;select array_agg(x::uuid order by x) into ids from jsonb_array_elements_text(v->'objectIds') x;
 end if;
 -- Recovery reads committed receipt independent of deleted source/old preview.
 -- No new decision, expiry extension or source mutation occurs on this branch.
 if action_n='recover' then
 perform 1 from public.trips where id=trip_n and owner_id=u for update nowait;
 request_digest_n:=encode(sha256(convert_to(v->>'mutationBytes','UTF8')),'hex');
 select * into r from material_exit_private.requests_v1 where request_id=req for share nowait;
 if found then
 if r.owner_id<>u or r.session_id<>s or r.mobile_epoch<>epoch_n or r.trip_id<>trip_n or r.scope<>scope_n or r.object_ids<>ids
 then raise exception 'MATERIAL_REQUEST_CONFLICT';end if;
 if r.decision is not null then
 if r.decision<>'erase' or r.request_digest is distinct from request_digest_n or r.preview_digest is distinct from ((v->>'mutationBytes')::jsonb->>'previewDigest')
 then raise exception 'MATERIAL_REQUEST_CONFLICT';end if;
 if r.decided_at is null or r.decided_at>r.expires_at then raise exception 'MATERIAL_REQUEST_CONFLICT';end if;
 return material_exit_private.receipt_v1(r);end if;end if;
 return jsonb_build_object('kind','unknown','schemaVersion','material-reference-data/1','scope',scope_n,'requestId',req,'tripId',trip_n,'objectIds',ids,
 'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,'requestDigest',request_digest_n,'allUserDataCompleted',false);
 end if;
 -- Privacy metadata/erasure permits archived owned Trips. Original deletion
 -- tombstone is still a fence; no business live/archive admission is reused.
 select * into t from public.trips where owner_id=u and id=trip_n for update nowait;
 if not found or exists(select 1 from privacy_private.trip_deletions where trip_id=trip_n) then raise exception 'MATERIAL_TRIP_UNAVAILABLE';end if;
 if action_n='list' then
 sources:=material_exit_private.list_v1(u,t,s,epoch_n,scope_n,at_time);items:=sources->'items';digest_n:=sources->>'sourceDigest';
 cursor_n:=nullif(v->'cursor','null'::jsonb);after_n:=(cursor_n->>'afterId')::uuid;
 if cursor_n is not null and (cursor_n->>'sourceDigest' is distinct from digest_n or not exists(select 1 from jsonb_array_elements(items) x where x->>'objectId'=after_n::text)) then raise exception 'MATERIAL_CURSOR_CONFLICT';end if;
 select coalesce(jsonb_agg(x order by x->>'objectId'),'[]') into page_n from (select x from jsonb_array_elements(items) x where after_n is null or x->>'objectId'>after_n::text order by x->>'objectId' limit 20) q;
 n:=jsonb_array_length(page_n);last_n:=(page_n->(n-1)->>'objectId')::uuid;
 more_n:=exists(select 1 from jsonb_array_elements(items) x where last_n is not null and x->>'objectId'>last_n::text);
 result_n:=jsonb_build_object('schemaVersion','material-reference-data/1','kind','list','scope',scope_n,'tripId',trip_n,'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,
 'sourceDigest',digest_n,'capturedAt',now_ms,'expiresAt',now_ms+30000,'items',page_n,'hasMore',more_n,'nextCursor',case when more_n then jsonb_build_object('sourceDigest',digest_n,'afterId',last_n) else null end,'allUserDataCompleted',false);
 if octet_length(result_n::text)>1000000 then raise exception 'MATERIAL_CAPACITY';end if;
 if floor(extract(epoch from clock_timestamp())*1000)>=now_ms+30000 then raise exception 'MATERIAL_EXPIRED';end if;return result_n;
 end if;
 -- Lock all selected sources before the request fence; includes actual PDF patch.
 sources:=material_exit_private.sources_v1(u,t,s,epoch_n,scope_n,ids,at_time);items:=sources->'items';digest_n:=sources->>'sourceDigest';
 select * into r from material_exit_private.requests_v1 where request_id=req for update nowait;
 if found then
 if r.owner_id<>u or r.session_id<>s or r.mobile_epoch<>epoch_n or r.trip_id<>trip_n or r.scope<>scope_n or r.object_ids<>ids
 then raise exception 'MATERIAL_REQUEST_CONFLICT';end if;
 if r.expires_at<=now_ms then raise exception 'MATERIAL_EXPIRED';end if;
 if r.source_digest is distinct from digest_n or r.trip_version<>t.head_version then raise exception 'MATERIAL_SOURCE_CHANGED';end if;
 elsif action_n<>'preview' then raise exception 'MATERIAL_REQUEST_MISSING';end if;
 if action_n='preview' then
 if r.request_id is null then
 deadline:=least(now_ms+30000,(sources->>'deadline')::bigint);
 if deadline<=now_ms then raise exception 'MATERIAL_EXPIRED';end if;
 r.request_id:=req;r.owner_id:=u;r.session_id:=s;r.mobile_epoch:=epoch_n;r.trip_id:=trip_n;r.scope:=scope_n;r.object_ids:=ids;
 r.trip_version:=t.head_version;r.source_digest:=digest_n;r.captured_at:=now_ms;r.expires_at:=deadline;r.reference_operation_ids:='{}';
 r.preview_digest:=reservation_private.digest_v1(jsonb_build_array(material_exit_private.binding_v1(r)-'previewDigest',items));
 insert into material_exit_private.requests_v1 select r.*;
 end if;
 result_n:=material_exit_private.binding_v1(r)||jsonb_build_object('kind','preview','items',items,'requiresExplicitConfirmation',true);
 if octet_length(result_n::text)>1000000 then raise exception 'MATERIAL_CAPACITY';end if;
 if floor(extract(epoch from clock_timestamp())*1000)>=r.expires_at then raise exception 'MATERIAL_EXPIRED';end if;
 return result_n;
 end if;
 if r.preview_digest is distinct from v->>'previewDigest' then raise exception 'MATERIAL_PREVIEW_CONFLICT';end if;
 binding:=material_exit_private.binding_v1(r);
 if action_n in ('export','erase') then
 request_digest_n:=encode(sha256(convert_to(p_input_bytes,'UTF8')),'hex');
 if r.decision is not null and (r.decision<>action_n or r.request_digest is distinct from request_digest_n) then raise exception 'MATERIAL_REQUEST_CONFLICT';end if;
 if action_n='export' then
 if r.decision is null then
 update material_exit_private.requests_v1 set decision='export',request_digest=request_digest_n,decided_at=now_ms where request_id=req returning * into r;
 insert into material_exit_private.progress_v1(request_id) values(req);
 end if;
 result_n:=binding||jsonb_build_object('kind','started','requestDigest',request_digest_n,'limits',jsonb_build_object('pageSize',5,'maxPages',4,'maxRows',20,'maxBytes',1000000));
 -- Count the complete safe bundle before beginning; never truncate histories.
 if octet_length((binding||jsonb_build_object('kind','bundle','requestDigest',request_digest_n,'items',items,'proof',jsonb_build_object('coverage','complete','pages',4,'rows',20)))::text)>1000000 then raise exception 'MATERIAL_CAPACITY';end if;
 if floor(extract(epoch from clock_timestamp())*1000)>=r.expires_at then raise exception 'MATERIAL_EXPIRED';end if;
 return result_n;
 end if;
 if r.decision is not null then raise exception 'MATERIAL_REQUEST_CONFLICT';end if;
 if scope_n='reservation-reference-data/1' then
 select coalesce(array_agg(operation_id order by operation_id),'{}') into reference_ops from reservation_private.operations_v1 where owner_id=u and reference_id=any(ids);
 insert into material_exit_private.reservation_fences_v1(owner_id,kind,object_id,request_id) select u,'reference',x,req from unnest(ids) x;
 insert into material_exit_private.reservation_fences_v1(owner_id,kind,object_id,request_id) select u,'operation',x,req from unnest(reference_ops) x;
 delete from reservation_private.current_v1 where owner_id=u and trip_id=trip_n and reference_id=any(ids);
 get diagnostics affected_n=row_count;if affected_n<>cardinality(ids) then raise exception 'MATERIAL_SOURCE_MISSING';end if;
 temporary_n:=affected_n;
 elsif scope_n='pdf-intake-data/1' then
 foreach id_n in array ids loop
 if exists(select 1 from pdf_intake_private.operations_v1 where owner_id=u and operation_id=id_n and (input_bytes is not null or command is not null)) then temporary_n:=temporary_n+1;end if;
 if exists(select 1 from public.trip_proposals p join pdf_intake_private.operations_v1 o on o.proposal_id=p.id
 where o.owner_id=u and o.operation_id=id_n and p.pdf_intake and p.status<>'applied' and p.patch<>'{}') then proposals_n:=proposals_n+1;end if;
 perform pdf_intake_private.erase_v1(u,id_n,true);
 if exists(select 1 from pdf_intake_private.operations_v1 where owner_id=u and operation_id=id_n and (input_bytes is not null or command is not null or not cancelled))
 or exists(select 1 from public.trip_proposals p join pdf_intake_private.operations_v1 o on o.proposal_id=p.id where o.owner_id=u and o.operation_id=id_n and p.pdf_intake and p.status<>'applied' and p.patch<>'{}') then raise exception 'MATERIAL_ERASE_INCOMPLETE';end if;
 end loop;
 else
 select count(*) into temporary_n from material_exit_private.progress_v1 where request_id=any(ids) and not erased;
 update material_exit_private.progress_v1 set last_cursor=null,next_cursor=null,pages=0,rows=0,bytes=0,terminal=false,erased=true where request_id=any(ids);
 end if;
 -- A slow/late transaction rolls every source effect and fence back.
 now_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if now_ms>=r.expires_at then raise exception 'MATERIAL_EXPIRED';end if;
 update material_exit_private.requests_v1 set decision='erase',request_digest=request_digest_n,decided_at=now_ms,temporary_records=temporary_n,unapplied_proposals=proposals_n,reference_operation_ids=coalesce(reference_ops,'{}') where request_id=req returning * into r;
 return material_exit_private.receipt_v1(r);
 end if;
 if r.source_digest is distinct from v->>'sourceDigest' then raise exception 'MATERIAL_SOURCE_CHANGED';end if;
 if r.decision is distinct from 'export' then raise exception 'MATERIAL_REQUEST_CONFLICT';end if;
 select * into g from material_exit_private.progress_v1 where request_id=req for update nowait;
 if not found or g.erased then raise exception 'MATERIAL_PROGRESS_MISSING';end if;
 if g.pages<>(g.rows+4)/5 or g.rows>cardinality(ids) or g.terminal is distinct from (g.rows=cardinality(ids))
 or g.last_cursor is distinct from (case when g.pages<=1 then null else ids[(g.pages-1)*5] end)
 or g.next_cursor is distinct from (case when g.pages=0 or g.terminal then null else ids[g.rows] end) then raise exception 'MATERIAL_PROGRESS_INVALID';end if;
 if action_n='proof' then
 if floor(extract(epoch from clock_timestamp())*1000)>=r.expires_at then raise exception 'MATERIAL_EXPIRED';end if;
 complete_n:=g.terminal and g.rows=cardinality(ids) and g.pages=(cardinality(ids)+4)/5;
 return binding||jsonb_build_object('kind','proof','requestDigest',r.request_digest,'coverage',case when complete_n then 'complete' else 'partial' end,'pages',g.pages,'rows',g.rows);
 end if;
 cursor_n:=nullif(v->'cursor','null'::jsonb);after_n:=(cursor_n->>'afterId')::uuid;
 if cursor_n is not null and (cursor_n->>'sourceDigest' is distinct from r.source_digest or not after_n=any(ids)) then raise exception 'MATERIAL_CURSOR_CONFLICT';end if;
 if g.pages>0 and g.last_cursor is not distinct from after_n then replay_n:=true;
 elsif g.terminal or g.next_cursor is distinct from after_n then raise exception 'MATERIAL_CURSOR_CONFLICT';end if;
 select coalesce(jsonb_agg(item order by ord),'[]') into page_n from
 (select item,ord from jsonb_array_elements(items) with ordinality x(item,ord) where after_n is null or ids[ord::integer]>after_n order by ord limit 5) q;
 n:=jsonb_array_length(page_n);
 if n=0 then raise exception 'MATERIAL_CURSOR_CONFLICT';end if;
 last_n:=ids[case when after_n is null then n else array_position(ids,after_n)+n end];more_n:=last_n<>ids[cardinality(ids)];
 byte_n:=octet_length(page_n::text);
 if not replay_n then
 if g.pages>=4 or g.rows+n>20 or g.bytes+byte_n>1000000 then raise exception 'MATERIAL_CAPACITY';end if;
 update material_exit_private.progress_v1 set last_cursor=after_n,next_cursor=case when more_n then last_n else null end,
 pages=pages+1,rows=rows+n,bytes=bytes+byte_n,terminal=not more_n where request_id=req returning * into g;
 end if;
 result_n:=binding||jsonb_build_object('kind','page','requestDigest',r.request_digest,'items',page_n,'hasMore',more_n,
 'nextCursor',case when more_n then jsonb_build_object('sourceDigest',r.source_digest,'afterId',last_n) else null end,'sectionComplete',not more_n,'pageNumber',g.pages);
 if octet_length(result_n::text)>1000000 then raise exception 'MATERIAL_CAPACITY';end if;
 if floor(extract(epoch from clock_timestamp())*1000)>=r.expires_at then raise exception 'MATERIAL_EXPIRED';end if;
 return result_n;
end$$;
revoke all on function public.privacy_material_reference_v1(text,text,bigint) from public,anon,authenticated,service_role;
revoke all on all functions in schema material_exit_private from public,anon,authenticated,service_role;
revoke all on all tables in schema material_exit_private from public,anon,authenticated,service_role;
