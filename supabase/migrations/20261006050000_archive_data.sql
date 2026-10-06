-- VPJ-58 #239: ordinary-owner selected archive export and its own metadata exit.
-- No source writer/ACL replacement, core export enrollment or target activation.
create schema archive_data_private;
revoke all on schema archive_data_private from public,anon,authenticated,service_role;
alter default privileges in schema archive_data_private revoke execute on functions from public;
create table archive_data_private.requests_v1 (
 request_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 mobile_epoch bigint not null check(mobile_epoch between 1 and 9007199254740991),
 scope text not null check(scope in('archived-trip-data/1','archive-export-progress/1')),
 trip_id uuid,trip_version integer,object_ids uuid[] not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 preview_digest text not null check(preview_digest ~ '^[a-f0-9]{64}$'),
 captured_at bigint not null check(captured_at>0),
 expires_at bigint not null check(expires_at=captured_at+30000),
 request_digest text check(request_digest ~ '^[a-f0-9]{64}$'),
 state text not null default 'previewed' check(state in('previewed','exporting','exported','erased')),
 decided_at bigint check(decided_at>=captured_at and decided_at<expires_at),
 progress_erased boolean not null default false,receipt jsonb,
 check((scope='archived-trip-data/1' and trip_id is not null and trip_version>0 and cardinality(object_ids)=0)
  or (scope='archive-export-progress/1' and trip_id is null and trip_version is null and cardinality(object_ids) between 1 and 20 and not request_id=any(object_ids))),
 check((state='previewed')=(request_digest is null)),
 check((state='previewed')=(decided_at is null)),
 check((state='erased')=(receipt is not null)),
 check(state<>'erased' or scope='archive-export-progress/1')
);
create index archive_data_owner_v1 on archive_data_private.requests_v1(owner_id,request_id);
create index archive_data_session_v1 on archive_data_private.requests_v1(session_id);
create table archive_data_private.progress_v1 (
 request_id uuid not null references archive_data_private.requests_v1(request_id) on delete cascade,
 section text not null check(section in('trip','snapshots','operations','progress')),
 pages integer not null default 0 check(pages between 0 and 201),
 rows integer not null default 0 check(rows between 0 and 10000),
 last_cursor jsonb,next_cursor jsonb,last_limit integer check(last_limit=50),
 terminal boolean not null default false,
 primary key(request_id,section),
 check((pages=0 and rows=0 and last_cursor is null and next_cursor is null and last_limit is null and not terminal)
  or (pages>0 and last_limit=50 and (not terminal or next_cursor is null)))
);
alter table archive_data_private.requests_v1 enable row level security;
alter table archive_data_private.progress_v1 enable row level security;
revoke all on all tables in schema archive_data_private from public,anon,authenticated,service_role;

create function archive_data_private.digest_v1(v text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(v,'UTF8')),'hex')
$$;
create function archive_data_private.deadline_v1(c bigint,e bigint) returns bigint language plpgsql volatile set search_path='' as $$
declare n bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
begin if n<c or n>=e then raise exception 'ARCHIVE_EXPIRED';end if;return n;end$$;
create function archive_data_private.sections_v1(s text) returns text[] language sql immutable set search_path='' as $$
 select case s when 'archived-trip-data/1' then array['trip','snapshots','operations'] else array['progress'] end
$$;
create function archive_data_private.boundaries_v1(s text) returns jsonb language sql immutable set search_path='' as $$
 select case s when 'archived-trip-data/1' then
 '{"exportFields":["archived_trip_id_title_head_confirmation_lifecycle","head_snapshot_safe_days_items","all_available_snapshot_versions_titles_timestamps_safe_content","selected_trip_lifecycle_operation_receipts"],"eraseFields":[],"retained":["original_archive_terminal_business_state","confirmed_trip_proposal_history","original_selected_trip_deletion_receipt","financial_records","operation_fences"],"missing":["snapshot_versions_never_stored","fields_outside_original_safe_content_projection","other_domains_use_existing_module_handlers","raw_pdf_attachment_device_bytes","external_orders_payments_copies","backup_restore_target_acceptance"]}'::jsonb else
 '{"exportFields":["selected_request_all_binding_fields","selected_request_page_progress","selected_request_minimal_erasure_receipt"],"eraseFields":["selected_transient_page_progress"],"retained":["nonreplayable_request_owner_session_epoch_scope_selection_source_preview_request_hash_time_fences","immutable_minimal_erasure_receipt","original_session_account_cascade_semantics"],"missing":["unselected_requests","source_trip_data_separate_original_delete_handler","external_files_copies","backup_restore_target_acceptance"]}'::jsonb end
$$;
create function archive_data_private.input_v1(v jsonb,a text) returns boolean language plpgsql immutable set search_path='' as $$
declare k text[]:=array['action','scope'];original jsonb;
begin
 if a='list' then k:=k||array['cursor','limit'];else
  k:=k||array['requestId','tripId','tripVersion','objectIds'];
  if a in('export','erase','validate') then k:=k||array['previewDigest','confirmed'];
  elsif a='recover' then k:=k||array['mutationBytes'];
  elsif a='page' then k:=k||array['sourceDigest','previewDigest','section','cursor','limit'];
  elsif a='proof' then k:=k||array['sourceDigest','previewDigest'];
  elsif a<>'preview' then return false;end if;
 end if;
 if notification_private.exact(v,k) is not true or jsonb_typeof(v->'action') is distinct from 'string' or v->>'action' is distinct from a
 or (jsonb_typeof(v->'scope')='string' and v->>'scope' in('archived-trip-data/1','archive-export-progress/1')) is not true then return false;end if;
 if a<>'list' then
  if notification_private.uuid(v->'requestId') is not true then return false;end if;
  if v->>'scope'='archived-trip-data/1' then
   if notification_private.uuid(v->'tripId') is not true or jsonb_typeof(v->'tripVersion') is distinct from 'number'
    or (v->>'tripVersion') !~ '^[1-9][0-9]*$' or (v->>'tripVersion')::numeric>2147483647
    or v->'objectIds' is distinct from '[]'::jsonb then return false;end if;
  elsif v->'tripId' is distinct from 'null'::jsonb or v->'tripVersion' is distinct from 'null'::jsonb
   or coverage_progress_private.ids_v1(v->'objectIds') is not true or v->'objectIds' ? (v->>'requestId') then return false;end if;
 end if;
 if a in('export','erase','validate','page','proof') and (jsonb_typeof(v->'previewDigest')='string' and v->>'previewDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 if a in('export','erase','validate') and v->'confirmed' is distinct from 'true'::jsonb then return false;end if;
 if a='erase' and v->>'scope'<>'archive-export-progress/1' then return false;end if;
 if a in('page','proof') and (jsonb_typeof(v->'sourceDigest')='string' and v->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 if a='page' and (jsonb_typeof(v->'section')='string' and v->>'section'=any(archive_data_private.sections_v1(v->>'scope'))) is not true then return false;end if;
 if a in('list','page') then
  if v->'limit' is distinct from to_jsonb(case a when 'list' then 20 else 50 end) then return false;end if;
  if v->'cursor'<>'null'::jsonb then
   if notification_private.exact(v->'cursor',array['sourceDigest',case a when 'list' then 'afterId' else 'afterKey' end]) is not true
    or (jsonb_typeof(v->'cursor'->'sourceDigest')='string' and v->'cursor'->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
   if a='list' then if notification_private.uuid(v->'cursor'->'afterId') is not true then return false;end if;
   elsif v->>'section'='snapshots' then
    if jsonb_typeof(v->'cursor'->'afterKey') is distinct from 'string' or v->'cursor'->>'afterKey' !~ '^[0-9]{10}$'
     or (v->'cursor'->>'afterKey')::bigint>2147483647 then return false;end if;
   elsif notification_private.uuid(v->'cursor'->'afterKey') is not true then return false;end if;
  end if;
 end if;
 if a='recover' then
  if jsonb_typeof(v->'mutationBytes') is distinct from 'string' or octet_length(v->>'mutationBytes')>8192 then return false;end if;
  original:=(v->>'mutationBytes')::jsonb;
  if archive_data_private.input_v1(original,'erase') is not true
   or original-array['action','previewDigest','confirmed'] is distinct from v-array['action','mutationBytes'] then return false;end if;
 end if;return true;
exception when others then return false;end$$;
create function archive_data_private.binding_v1(r archive_data_private.requests_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schemaVersion','archive-data/1','scope',r.scope,'requestId',r.request_id,'tripId',r.trip_id,
 'tripVersion',r.trip_version,'objectIds',r.object_ids,'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,
 'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,'capturedAt',r.captured_at,'expiresAt',r.expires_at,
 'boundaries',archive_data_private.boundaries_v1(r.scope),'allUserDataCompleted',false)
$$;
create function archive_data_private.receipt_v1(r archive_data_private.requests_v1) returns jsonb language sql stable set search_path='' as $$
 select archive_data_private.binding_v1(r)||jsonb_build_object('kind','receipt','requestDigest',r.request_digest,'state','erased',
 'decidedAt',r.decided_at,'effects',(r.receipt-array['requestDigest','decidedAt'])||jsonb_build_object('retainedFences',cardinality(r.object_ids)))
$$;
create function archive_data_private.immutable_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if to_jsonb(new)-array['state','request_digest','decided_at','progress_erased','receipt'] is distinct from
  to_jsonb(old)-array['state','request_digest','decided_at','progress_erased','receipt']
  or old.progress_erased and not new.progress_erased
  or old.state<>'previewed' and (new.request_digest,new.decided_at,new.receipt) is distinct from (old.request_digest,old.decided_at,old.receipt)
  or new.state<>old.state and not ((old.state='previewed' and new.state in('exporting','erased')) or (old.state='exporting' and new.state='exported'))
 then raise exception 'ARCHIVE_CONFLICT';end if;return new;
end$$;


-- Flat projection of ALL new persisted fields, with no recursive selection/body.
create function archive_data_private.progress_item_v1(r archive_data_private.requests_v1) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('objectId',r.request_id,'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,
 'originalScope',r.scope,'tripId',r.trip_id,'tripVersion',r.trip_version,'objectIds',r.object_ids,'sourceDigest',r.source_digest,
 'previewDigest',r.preview_digest,'requestDigest',r.request_digest,'state',r.state,'capturedAt',r.captured_at,'expiresAt',r.expires_at,
 'decidedAt',r.decided_at,'progressErased',r.progress_erased,'receipt',r.receipt,'progress',
 (select coalesce(jsonb_agg(jsonb_build_object('section',p.section,'pages',p.pages,'rows',p.rows,'lastCursor',p.last_cursor,
 'nextCursor',p.next_cursor,'lastLimit',p.last_limit,'terminal',p.terminal) order by array_position(archive_data_private.sections_v1(r.scope),p.section)),'[]')
 from archive_data_private.progress_v1 p where p.request_id=r.request_id))
$$;

-- Locks follow original account/owner -> proposal -> Trip -> snapshots order.
-- Every source is re-collected on every live request; no saved body or stale URL.
create function archive_data_private.archive_source_v1(u uuid,tid uuid,ver integer) returns jsonb
language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare t public.trips%rowtype;a public.trip_archives%rowtype;h public.trip_version_snapshots%rowtype;confirmation record;
 snap public.trip_version_snapshots%rowtype;op trip_lifecycle_private.operations_v1%rowtype;
 trips_n jsonb;snapshots_n jsonb:='[]';operations_n jsonb:='[]';fingerprints jsonb:='[]';result_n jsonb;
 count_n integer:=0;bytes_n bigint:=0;projection jsonb;provenance jsonb:='[]';
begin
 -- Owner filter precedes any foreign tuple lock or error distinction.
 if not exists(select 1 from public.trips where id=tid and owner_id=u) then raise exception 'ARCHIVE_SOURCE_UNAVAILABLE';end if;
 perform 1 from public.trip_proposals p where trip_id=tid and owner_id=u and exists(select 1 from public.trip_events e
  where e.proposal_id=p.id and e.trip_id=tid and e.owner_id=u and e.resulting_version=ver) order by id for share nowait;
 select * into t from public.trips where id=tid and owner_id=u for share nowait;
 select * into a from public.trip_archives where trip_id=tid and owner_id=u for share nowait;
 if a.trip_id is null or t.id is null or a.archived_version<>t.head_version or t.head_version<1
  or exists(select 1 from privacy_private.trip_deletions where trip_id=tid)
  then raise exception 'ARCHIVE_SOURCE_UNAVAILABLE';end if;
 if t.head_version<>ver then raise exception 'STALE_TRIP_VERSION';end if;
 if (select count(*) from (select version from public.trip_version_snapshots where trip_id=tid limit 10001) q)>10000
  or (select count(*) from (select operation_id from trip_lifecycle_private.operations_v1 where owner_id=u and trip_id=tid limit 10001) q)>10000
  then raise exception 'ARCHIVE_CAPACITY';end if;
 perform 1 from trip_lifecycle_private.states_v1 where trip_id=tid and owner_id=u for share nowait;
 if exists(select 1 from trip_lifecycle_private.states_v1 where trip_id=tid and (owner_id<>u or state<>'archived'))
  then raise exception 'ARCHIVE_SOURCE_UNAVAILABLE';end if;
 select * into h from public.trip_version_snapshots where trip_id=tid and owner_id=u and version=ver for share nowait;
 if h.trip_id is null or h.title is distinct from t.title or h.content is null then raise exception 'ARCHIVE_SOURCE_UNAVAILABLE';end if;
 perform 1 from public.trip_events where trip_id=tid and owner_id=u and resulting_version=ver order by id for share nowait;
 perform 1 from public.trip_idempotency r where owner_id=u and resulting_version=ver and proposal_id in(select id from public.trip_proposals where trip_id=tid and owner_id=u) order by idempotency_key for share nowait;
 -- The original core confirmation query, not an inferred event or archive flag.
 for confirmation in select jsonb_build_object('event',to_jsonb(e),'proposal',to_jsonb(p),'idempotency',to_jsonb(r)) item
  from public.trip_events e join public.trip_proposals p on p.id=e.proposal_id and p.owner_id=e.owner_id
  join public.trip_idempotency r on r.proposal_id=p.id and r.owner_id=p.owner_id and r.resulting_version=e.resulting_version
  where e.trip_id=t.id and e.owner_id=t.owner_id and e.resulting_version=t.head_version and p.status='applied' and p.base_trip_version+1=t.head_version
  order by e.id,r.idempotency_key limit 10001 loop
  count_n:=count_n+1;bytes_n:=bytes_n+octet_length(confirmation.item::text);
  if count_n>10000 or bytes_n>1000000 then raise exception 'ARCHIVE_CAPACITY';end if;
  provenance:=provenance||jsonb_build_array(confirmation.item);
 end loop;
 trips_n:=jsonb_build_array(jsonb_build_object('tripId',t.id,'title',t.title,'headVersion',t.head_version,
 'confirmationState',case when t.head_version=0 then 'initial' when jsonb_array_length(provenance)>0 then 'confirmed' else 'unknown' end,
 'content',export_private.trip_content_v1(h.content),'lifecycle',jsonb_build_object('tripId',t.id,'title',t.title,'headVersion',t.head_version,
 'state','archived','archivedVersion',a.archived_version,'archivedAt',to_char(a.archived_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))));
 count_n:=0;
 for snap in select * from public.trip_version_snapshots where trip_id=tid order by version limit 10001 for share nowait loop
  count_n:=count_n+1;
  if count_n>10000 then raise exception 'ARCHIVE_CAPACITY';end if;
  if snap.owner_id<>u or snap.version<0 or snap.version>ver then raise exception 'ARCHIVE_SOURCE_UNAVAILABLE';end if;
  bytes_n:=bytes_n+octet_length(to_jsonb(snap)::text);
  if bytes_n>1000000 then raise exception 'ARCHIVE_CAPACITY';end if;
  projection:=case when snap.content is null then null else export_private.trip_content_v1(snap.content) end;
  snapshots_n:=snapshots_n||jsonb_build_array(jsonb_build_object('tripId',tid,'version',snap.version,'title',snap.title,
  'createdAt',to_char(snap.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'content',projection));
  fingerprints:=fingerprints||jsonb_build_array(notification_private.hash(to_jsonb(snap)));
 end loop;
 count_n:=0;
 for op in select * from trip_lifecycle_private.operations_v1 where owner_id=u and trip_id=tid order by operation_id limit 10001 for share nowait loop
  count_n:=count_n+1;if count_n>10000 then raise exception 'ARCHIVE_CAPACITY';end if;
  if op.erased_reason is not null or op.receipt is null or op.receipt->>'tripId' is distinct from tid::text
   or op.receipt->>'ownerId' is distinct from u::text or op.receipt->>'operationId' is distinct from op.operation_id::text
   or op.receipt->>'sessionId' is distinct from op.session_id::text then raise exception 'ARCHIVE_SOURCE_UNAVAILABLE';end if;
  bytes_n:=bytes_n+octet_length(to_jsonb(op)::text);if bytes_n>1000000 then raise exception 'ARCHIVE_CAPACITY';end if;
  operations_n:=operations_n||jsonb_build_array(jsonb_build_object('operationId',op.operation_id,'sessionId',op.session_id,'receipt',op.receipt,'erasedReason',op.erased_reason));
  fingerprints:=fingerprints||jsonb_build_array(notification_private.hash(to_jsonb(op)));
 end loop;
 result_n:=jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('section','trip','items',trips_n),
 jsonb_build_object('section','snapshots','items',snapshots_n),jsonb_build_object('section','operations','items',operations_n)),
 'snapshotVersionGaps',ver::bigint+1-jsonb_array_length(snapshots_n),'fingerprint',notification_private.hash(jsonb_build_object(
 'trip',to_jsonb(t),'archive',to_jsonb(a),'snapshotsOperations',fingerprints,'confirmation',provenance)));
 if octet_length(notification_private.canonical(result_n))>1000000 then raise exception 'ARCHIVE_CAPACITY';end if;
 return result_n;
exception when raise_exception then
 if sqlerrm='SOURCE_UNAVAILABLE' then raise exception 'ARCHIVE_SOURCE_UNAVAILABLE';end if;raise;
end$$;

create function archive_data_private.source_v1(u uuid,s text,tid uuid,ver integer,ids uuid[]) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r archive_data_private.requests_v1%rowtype;id_n uuid;items jsonb:='[]';flat jsonb;
begin
 if s='archived-trip-data/1' then return archive_data_private.archive_source_v1(u,tid,ver);end if;
 foreach id_n in array ids loop
  select * into r from archive_data_private.requests_v1 where owner_id=u and request_id=id_n for share nowait;
  if not found then raise exception 'ARCHIVE_SOURCE_UNAVAILABLE';end if;
  perform 1 from archive_data_private.progress_v1 where request_id=id_n order by section for share nowait;
  flat:=archive_data_private.progress_item_v1(r);items:=items||jsonb_build_array(flat);
  if octet_length(notification_private.canonical(items))>1000000 then raise exception 'ARCHIVE_CAPACITY';end if;
 end loop;
 return jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('section','progress','items',items)),
 'snapshotVersionGaps',0,'fingerprint',notification_private.hash(items));
end$$;

create function archive_data_private.inventory_v1(u uuid,s text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r record;rr archive_data_private.requests_v1%rowtype;flat jsonb;source_n jsonb;items jsonb:='[]';metadata jsonb:='[]';count_n integer:=0;bytes_n bigint:=0;
begin
 if s='archived-trip-data/1' then
  if (select count(*) from (select t.id from public.trips t join public.trip_archives a on a.trip_id=t.id and a.owner_id=u
   where t.owner_id=u and not exists(select 1 from privacy_private.trip_deletions d where d.trip_id=t.id) limit 10001) q)>10000 then raise exception 'ARCHIVE_CAPACITY';end if;
  for r in select t.id,t.head_version from public.trips t join public.trip_archives a on a.trip_id=t.id and a.owner_id=u
   where t.owner_id=u and not exists(select 1 from privacy_private.trip_deletions d where d.trip_id=t.id) order by t.id limit 10001 loop
   count_n:=count_n+1;if count_n>10000 then raise exception 'ARCHIVE_CAPACITY';end if;
   source_n:=archive_data_private.archive_source_v1(u,r.id,r.head_version);
   flat:=source_n->'sections'->0->'items'->0->'lifecycle';
   items:=items||jsonb_build_array(flat);metadata:=metadata||jsonb_build_array(source_n->'fingerprint');
  end loop;
 else
  if (select count(*) from (select request_id from archive_data_private.requests_v1 where owner_id=u limit 10001) q)>10000 then raise exception 'ARCHIVE_CAPACITY';end if;
  for rr in select * from archive_data_private.requests_v1 where owner_id=u order by request_id limit 10001 for share nowait loop
   count_n:=count_n+1;if count_n>10000 then raise exception 'ARCHIVE_CAPACITY';end if;
   flat:=archive_data_private.progress_item_v1(rr);
   bytes_n:=bytes_n+octet_length(notification_private.canonical(flat));if bytes_n>1000000 then raise exception 'ARCHIVE_CAPACITY';end if;
   metadata:=metadata||jsonb_build_array(notification_private.hash(flat));
   items:=items||jsonb_build_array(jsonb_build_object('objectId',rr.request_id,'originalScope',rr.scope,'tripId',rr.trip_id,
   'tripVersion',rr.trip_version,'state',rr.state,'progressErased',rr.progress_erased));
  end loop;
 end if;
 flat:=jsonb_build_object('items',items,'metadata',metadata);
 if octet_length(notification_private.canonical(flat))>1000000 then raise exception 'ARCHIVE_CAPACITY';end if;return flat;
end$$;

create function public.privacy_archive_data_v1(p_action text,p_input_bytes text,p_expected_epoch bigint) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();s uuid;epoch_n bigint;at_time timestamptz;now_ms bigint;
 v jsonb;a text;req uuid;ids uuid[];tid uuid;ver integer;r archive_data_private.requests_v1%rowtype;
 p archive_data_private.progress_v1%rowtype;source_n jsonb;inventory jsonb;items jsonb;binding_n jsonb;result_n jsonb;
 digest_n text;cmd_digest text;cursor_n jsonb;after_n text;last_n text;more_n boolean;page_n jsonb;next_n jsonb;
 n integer;replay boolean:=false;cleared integer;complete boolean;decision_ms bigint;section_n text;
 counts_n jsonb;total_rows integer;total_pages integer;expected_pages integer;section_rows integer;section_pages integer;
begin
 -- Authority/reauthentication precede parsing, lookup, cleanup and ALL writes.
 if u is null or auth.role() is distinct from 'authenticated' or auth.jwt()->>'role' is distinct from 'authenticated'
 or auth.jwt()->>'is_anonymous' is distinct from 'false' or notification_private.uuid(auth.jwt()->'session_id') is not true
 then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34))
 then raise lock_not_available using message='ARCHIVE_CONFLICT';end if;
 perform 1 from auth.users where id=u for key share nowait;
 if not found then raise exception 'UNAUTHENTICATED';end if;
 select epoch into epoch_n from identity_private.mobile_accounts where owner_id=u and session_id=s for update nowait;
 if not found or epoch_n is distinct from p_expected_epoch then raise exception 'SESSION_REPLACED';end if;
 -- Match original lifecycle account -> owner-head -> session order without its INSERT.
 perform 1 from trip_lifecycle_private.owner_heads_v1 where owner_id=u for share nowait;
 perform 1 from auth.sessions where id=s and user_id=u for key share nowait;
 if not found then raise exception 'SESSION_REPLACED';end if;
 perform identity_private.guard_mobile_rpc_v2();
 if identity_private.mobile_access_v2() is not true or not exists(select 1 from identity_private.mobile_attempts
 where owner_id=u and session_id=s and epoch=epoch_n) then raise exception 'SESSION_REPLACED';end if;
 at_time:=clock_timestamp();now_ms:=floor(extract(epoch from at_time)*1000)::bigint;
 if not exists(select 1 from auth.sessions where id=s and user_id=u and created_at between at_time-interval '5 minutes' and at_time)
 then raise exception 'REAUTHENTICATION_REQUIRED';end if;
 if p_action is null or p_input_bytes is null or octet_length(p_input_bytes)>(case p_action when 'recover' then 16384 else 8192 end)
 then raise exception 'INVALID_INPUT';end if;
 begin v:=p_input_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 a:=case p_action when 'export_start' then 'export' else p_action end;
 if (a='export' and p_action<>'export_start') or archive_data_private.input_v1(v,a) is not true then raise exception 'INVALID_INPUT';end if;
 if a='list' then
  inventory:=archive_data_private.inventory_v1(u,v->>'scope');items:=inventory->'items';
  digest_n:=notification_private.hash(jsonb_build_object('schemaVersion','archive-data/1','scope',v->'scope',
  'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,'inventory',inventory));
  cursor_n:=nullif(v->'cursor','null'::jsonb);after_n:=cursor_n->>'afterId';
  if cursor_n is not null then
   if cursor_n->>'sourceDigest' is distinct from digest_n then raise exception 'ARCHIVE_SOURCE_CHANGED';end if;
   if not exists(select 1 from jsonb_array_elements(items) x where coalesce(x->>'objectId',x->>'tripId')=after_n)
   then raise exception 'ARCHIVE_CONFLICT';end if;
  end if;
  select coalesce(jsonb_agg(value order by coalesce(value->>'objectId',value->>'tripId')),'[]') into page_n from (
   select value from jsonb_array_elements(items) where after_n is null or coalesce(value->>'objectId',value->>'tripId')>after_n
   order by coalesce(value->>'objectId',value->>'tripId') limit 20) q;
  n:=jsonb_array_length(page_n);last_n:=coalesce(page_n->(n-1)->>'objectId',page_n->(n-1)->>'tripId');
  more_n:=exists(select 1 from jsonb_array_elements(items) x where coalesce(x->>'objectId',x->>'tripId')>last_n);
  result_n:=jsonb_build_object('schemaVersion','archive-data/1','kind','list','scope',v->'scope','ownerId',u,'sessionId',s,
  'mobileEpoch',epoch_n,'sourceDigest',digest_n,'capturedAt',now_ms,'expiresAt',now_ms+30000,'items',page_n,'hasMore',more_n,
  'nextCursor',case when more_n then jsonb_build_object('sourceDigest',digest_n,'afterId',last_n) else null end,'allUserDataCompleted',false);
 else
  req:=(v->>'requestId')::uuid;tid:=(v->>'tripId')::uuid;ver:=(v->>'tripVersion')::integer;
  select coalesce(array_agg(x::uuid order by x),'{}'::uuid[]) into ids from jsonb_array_elements_text(v->'objectIds') x;
  cmd_digest:=archive_data_private.digest_v1(case a when 'recover' then v->>'mutationBytes' else p_input_bytes end);
  -- Foreign and absent recovery IDs are identical and never lock foreign rows.
  select * into r from archive_data_private.requests_v1 where owner_id=u and request_id=req;
  if a='recover' and r.request_id is null then
   result_n:=jsonb_build_object('schemaVersion','archive-data/1','kind','unknown','scope',v->'scope','requestId',req,
   'tripId',tid,'tripVersion',ver,'objectIds',ids,'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,'requestDigest',cmd_digest,'allUserDataCompleted',false);
   perform archive_data_private.deadline_v1(now_ms,now_ms+30000);return result_n;
  end if;
  if r.request_id is not null and (r.session_id<>s or r.mobile_epoch<>epoch_n or r.scope<>v->>'scope'
   or r.trip_id is distinct from tid or r.trip_version is distinct from ver or r.object_ids<>ids) then raise exception 'ARCHIVE_CONFLICT';end if;
  -- Serialize new keys as well as rows. Account serializes all same-owner sources.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('archive-request:'||req::text,0))
   then raise lock_not_available using message='ARCHIVE_CONFLICT';end if;
  if a='recover' or a='erase' and r.state='erased' then
   select * into r from archive_data_private.requests_v1 where owner_id=u and request_id=req for update nowait;
   if r.request_id is not null and (r.request_digest is not null and r.request_digest is distinct from cmd_digest
    or r.preview_digest is distinct from (case a when 'recover' then (v->>'mutationBytes')::jsonb->>'previewDigest' else v->>'previewDigest' end))
   then raise exception 'ARCHIVE_CONFLICT';end if;
   if r.state='erased' then
    result_n:=archive_data_private.receipt_v1(r);
    if octet_length(notification_private.canonical(jsonb_build_object('data',result_n)))>1000000 then raise exception 'ARCHIVE_CAPACITY';end if;
    perform archive_data_private.deadline_v1(now_ms,now_ms+30000);return result_n;
   end if;
   if a='recover' then
    result_n:=jsonb_build_object('schemaVersion','archive-data/1','kind','unknown','scope',v->'scope','requestId',req,
    'tripId',tid,'tripVersion',ver,'objectIds',ids,'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,'requestDigest',cmd_digest,'allUserDataCompleted',false);
    perform archive_data_private.deadline_v1(now_ms,now_ms+30000);return result_n;
   end if;
  end if;
  if r.request_id is not null then perform archive_data_private.deadline_v1(r.captured_at,r.expires_at);end if;
  if a='preview' and r.request_id is null then
   if exists(select 1 from archive_data_private.requests_v1 where request_id=req) then raise exception 'ARCHIVE_SOURCE_UNAVAILABLE';end if;
   if (select count(*) from (select request_id from archive_data_private.requests_v1 where owner_id=u limit 10000) q)>=10000
    then raise exception 'ARCHIVE_CAPACITY';end if;
   -- Whole retained metadata scope bound before adding another permanent key.
   perform archive_data_private.inventory_v1(u,'archive-export-progress/1');
  elsif r.request_id is null then raise exception 'ARCHIVE_SOURCE_UNAVAILABLE';end if;
  -- Source locks precede new request/progress locks, and no source is mutated.
  source_n:=archive_data_private.source_v1(u,v->>'scope',tid,ver,ids);
  digest_n:=notification_private.hash(jsonb_build_object('schemaVersion','archive-data/1','scope',v->'scope','ownerId',u,
  'sessionId',s,'mobileEpoch',epoch_n,'tripId',tid,'tripVersion',ver,'objectIds',ids,'source',source_n));
  perform archive_data_private.deadline_v1(coalesce(r.captured_at,now_ms),coalesce(r.expires_at,now_ms+30000));
  if a='preview' and r.request_id is null then
   r.request_id:=req;r.owner_id:=u;r.session_id:=s;r.mobile_epoch:=epoch_n;r.scope:=v->>'scope';r.trip_id:=tid;r.trip_version:=ver;r.object_ids:=ids;
   r.source_digest:=digest_n;r.captured_at:=now_ms;r.expires_at:=now_ms+30000;r.state:='previewed';r.progress_erased:=false;r.preview_digest:=repeat('0',64);
   r.preview_digest:=notification_private.hash(archive_data_private.binding_v1(r)-'previewDigest');
   insert into archive_data_private.requests_v1(request_id,owner_id,session_id,mobile_epoch,scope,trip_id,trip_version,object_ids,
   source_digest,preview_digest,captured_at,expires_at) values(req,u,s,epoch_n,r.scope,tid,ver,ids,digest_n,r.preview_digest,now_ms,now_ms+30000);
   perform archive_data_private.inventory_v1(u,'archive-export-progress/1');
  end if;
  select * into r from archive_data_private.requests_v1 where owner_id=u and request_id=req for update nowait;
  if r.source_digest is distinct from digest_n then raise exception 'ARCHIVE_SOURCE_CHANGED';end if;
  if a<>'preview' and r.preview_digest is distinct from v->>'previewDigest' then raise exception 'ARCHIVE_CONFLICT';end if;
  if a in('page','proof') and digest_n is distinct from v->>'sourceDigest' then raise exception 'ARCHIVE_SOURCE_CHANGED';end if;
  binding_n:=archive_data_private.binding_v1(r);counts_n:='{"trip":0,"snapshots":0,"operations":0,"progress":0}';total_rows:=0;expected_pages:=0;
  for section_n in select unnest(archive_data_private.sections_v1(r.scope)) loop
   select x->'items' into items from jsonb_array_elements(source_n->'sections') x where x->>'section'=section_n;
   section_rows:=jsonb_array_length(items);total_rows:=total_rows+section_rows;section_pages:=greatest(1,ceil(section_rows::numeric/50)::integer);
   expected_pages:=expected_pages+section_pages;counts_n:=jsonb_set(counts_n,array[section_n],to_jsonb(section_rows));
   if section_rows>10000 then raise exception 'ARCHIVE_CAPACITY';end if;
  end loop;
  if total_rows>20001 or expected_pages>402 then raise exception 'ARCHIVE_CAPACITY';end if;
  -- Check the actual complete final JSON wrapper BEFORE any confirmation effects.
  if octet_length(notification_private.canonical(jsonb_build_object('data',binding_n||jsonb_build_object('kind','bundle',
  'requestDigest',coalesce(r.request_digest,cmd_digest),'sections',source_n->'sections','proof',jsonb_build_object(
  'coverage','complete','pages',expected_pages,'rows',total_rows)))))>1000000 then raise exception 'ARCHIVE_CAPACITY';end if;
  perform archive_data_private.deadline_v1(r.captured_at,r.expires_at);
  if a='preview' then
   if r.state<>'previewed' then raise exception 'ARCHIVE_CONFLICT';end if;
   result_n:=binding_n||jsonb_build_object('kind','preview','counts',counts_n,'snapshotVersionGaps',source_n->'snapshotVersionGaps');
  elsif a='export' then
   if r.progress_erased or r.state<>'previewed' and (r.state not in('exporting','exported') or r.request_digest<>cmd_digest)
   then raise exception 'ARCHIVE_CONFLICT';end if;
   if r.state='previewed' then
    decision_ms:=archive_data_private.deadline_v1(r.captured_at,r.expires_at);
    update archive_data_private.requests_v1 set state='exporting',request_digest=cmd_digest,decided_at=decision_ms where request_id=req returning * into r;
    insert into archive_data_private.progress_v1(request_id,section) select req,unnest(archive_data_private.sections_v1(r.scope));
   end if;
   if (select count(*) from archive_data_private.progress_v1 where request_id=req)<>cardinality(archive_data_private.sections_v1(r.scope))
   then raise exception 'ARCHIVE_CONFLICT';end if;
   result_n:=binding_n||jsonb_build_object('kind','started','requestDigest',r.request_digest,'sections',archive_data_private.sections_v1(r.scope),
   'limits',jsonb_build_object('pageSize',50,'maxPages',402,'maxRows',20001,'maxBytes',1000000));
  elsif a in('page','proof') then
   if r.state not in('exporting','exported') or r.progress_erased then raise exception 'ARCHIVE_CONFLICT';end if;
   perform 1 from archive_data_private.progress_v1 where request_id=req order by section for update nowait;
   if (select count(*) from archive_data_private.progress_v1 where request_id=req)<>cardinality(archive_data_private.sections_v1(r.scope))
   then raise exception 'ARCHIVE_CONFLICT';end if;
   if a='page' then
    section_n:=v->>'section';select * into p from archive_data_private.progress_v1 where request_id=req and section=section_n;
    select x->'items' into items from jsonb_array_elements(source_n->'sections') x where x->>'section'=section_n;
    cursor_n:=nullif(v->'cursor','null'::jsonb);after_n:=cursor_n->>'afterKey';
    if cursor_n is not null and (cursor_n->>'sourceDigest' is distinct from digest_n or not exists(select 1 from jsonb_array_elements(items) x
     where case section_n when 'trip' then x->>'tripId' when 'snapshots' then lpad(x->>'version',10,'0') when 'operations' then x->>'operationId' else x->>'objectId' end=after_n))
    then raise exception 'ARCHIVE_CONFLICT';end if;
    if p.pages>0 and p.last_cursor is not distinct from cursor_n and p.last_limit=50 then replay:=true;
    elsif p.terminal or p.next_cursor is distinct from cursor_n then raise exception 'ARCHIVE_CONFLICT';end if;
    select coalesce(jsonb_agg(value order by key),'[]') into page_n from (
     select value,case section_n when 'trip' then value->>'tripId' when 'snapshots' then lpad(value->>'version',10,'0') when 'operations' then value->>'operationId' else value->>'objectId' end key
     from jsonb_array_elements(items)) q where after_n is null or key>after_n;
    page_n:=jsonb_path_query_array(page_n,'$[0 to 49]');n:=jsonb_array_length(page_n);
    last_n:=case section_n when 'trip' then page_n->(n-1)->>'tripId' when 'snapshots' then lpad(page_n->(n-1)->>'version',10,'0')
     when 'operations' then page_n->(n-1)->>'operationId' else page_n->(n-1)->>'objectId' end;
    more_n:=exists(select 1 from jsonb_array_elements(items) x where case section_n when 'trip' then x->>'tripId' when 'snapshots' then lpad(x->>'version',10,'0') when 'operations' then x->>'operationId' else x->>'objectId' end>last_n);
    next_n:=case when more_n then jsonb_build_object('sourceDigest',digest_n,'afterKey',last_n) else null end;
    if not replay then
     if p.pages>=201 or p.rows+n>10000 then raise exception 'ARCHIVE_CAPACITY';end if;
     update archive_data_private.progress_v1 set last_cursor=cursor_n,next_cursor=next_n,last_limit=50,
     pages=pages+1,rows=rows+n,terminal=not more_n where request_id=req and section=section_n returning * into p;
    end if;
    result_n:=binding_n||jsonb_build_object('kind','page','requestDigest',r.request_digest,'section',section_n,'items',page_n,
    'hasMore',more_n,'nextCursor',next_n,'sectionComplete',not more_n,'pageNumber',p.pages);
   end if;
   select coalesce(sum(pages),0),coalesce(sum(rows),0),bool_and(terminal and rows=(counts_n->>section)::integer
    and pages=greatest(1,ceil((counts_n->>section)::numeric/50)::integer)) into total_pages,n,complete
   from archive_data_private.progress_v1 where request_id=req;
   complete:=coalesce(complete,false) and n=total_rows and total_pages=expected_pages;
   if total_pages>402 or n>20001 then raise exception 'ARCHIVE_CAPACITY';end if;
   if complete and r.state='exporting' then update archive_data_private.requests_v1 set state='exported' where request_id=req;end if;
   if a='proof' then result_n:=binding_n||jsonb_build_object('kind','proof','requestDigest',r.request_digest,
    'coverage',case when complete then 'complete' else 'partial' end,'pages',total_pages,'rows',n);end if;
  elsif a='validate' then
   if r.state<>'exported' or r.request_digest is null or r.progress_erased then raise exception 'ARCHIVE_CONFLICT';end if;
   -- Return the stored EXACT export-byte hash for the Native original-file binding.
   result_n:=binding_n||jsonb_build_object('kind','validated','requestDigest',r.request_digest,'current',true);
  elsif a='erase' then
   if r.state<>'previewed' then raise exception 'ARCHIVE_CONFLICT';end if;
   perform 1 from archive_data_private.requests_v1 where owner_id=u and request_id=any(ids) order by request_id for update nowait;
   perform 1 from archive_data_private.progress_v1 where request_id=any(ids) order by request_id,section for update nowait;
   delete from archive_data_private.progress_v1 where request_id=any(ids);get diagnostics cleared=row_count;
   update archive_data_private.requests_v1 set progress_erased=true where owner_id=u and request_id=any(ids);
   decision_ms:=archive_data_private.deadline_v1(r.captured_at,r.expires_at);
   update archive_data_private.requests_v1 set state='erased',request_digest=cmd_digest,decided_at=decision_ms,progress_erased=true,
   receipt=jsonb_build_object('requestDigest',cmd_digest,'decidedAt',decision_ms,'clearedProgress',cleared,
   'sourceTrip','not_modified','externalCopies','not_erased') where request_id=req returning * into r;
   result_n:=archive_data_private.receipt_v1(r);
  else raise exception 'INVALID_INPUT';end if;
 end if;
 if octet_length(notification_private.canonical(jsonb_build_object('data',result_n)))>1000000 then raise exception 'ARCHIVE_CAPACITY';end if;
 -- Includes post-effect and post-serialization time; late transactions roll back.
 perform archive_data_private.deadline_v1((result_n->>'capturedAt')::bigint,(result_n->>'expiresAt')::bigint);
 return result_n;
exception when lock_not_available then raise lock_not_available using message='ARCHIVE_CONFLICT';end$$;
revoke all on all functions in schema archive_data_private from public,anon,authenticated,service_role;
revoke all on function public.privacy_archive_data_v1(text,text,bigint) from public,anon,authenticated,service_role;
create trigger archive_data_immutable_v1 before update on archive_data_private.requests_v1
 for each row execute function archive_data_private.immutable_v1();
