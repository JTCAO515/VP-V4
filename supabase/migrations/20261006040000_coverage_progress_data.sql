-- VPJ-58 #239 ALL1: selected owner progress metadata only. Default ungranted.
-- No source/business table/old RPC rewrite. Original session/account cascades remain.
create schema coverage_progress_private;
revoke all on schema coverage_progress_private from public,anon,authenticated,service_role;
alter default privileges in schema coverage_progress_private revoke execute on functions from public;
create table coverage_progress_private.requests_v1 (
 request_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 mobile_epoch bigint not null check(mobile_epoch between 1 and 9007199254740991),
 scope text not null check(scope='coverage-progress-data/1'),
 object_ids uuid[] not null check(cardinality(object_ids) between 1 and 20 and not request_id=any(object_ids)),
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 preview_digest text not null check(preview_digest ~ '^[a-f0-9]{64}$'),
 captured_at bigint not null check(captured_at>0),
 expires_at bigint not null check(expires_at=captured_at+30000),
 decision text check(decision in('export','erase')),
 request_digest text check(request_digest ~ '^[a-f0-9]{64}$'),
 decided_at bigint check(decided_at>=captured_at and decided_at<expires_at),
 effects jsonb,
 check((decision is null)=(request_digest is null)),
 check((decision is null)=(decided_at is null)),
 check((decision is not distinct from 'erase')=(effects is not null))
);
create index coverage_progress_owner_v1 on coverage_progress_private.requests_v1(owner_id,request_id);
create index coverage_progress_session_v1 on coverage_progress_private.requests_v1(session_id);
create table coverage_progress_private.pages_v1 (
 request_id uuid primary key references coverage_progress_private.requests_v1(request_id) on delete cascade,
 last_cursor jsonb,next_cursor jsonb,last_limit integer check(last_limit=5),
 pages integer not null default 0 check(pages between 0 and 4),
 rows integer not null default 0 check(rows between 0 and 20),
 bytes integer not null default 0 check(bytes between 0 and 1000000),
 terminal boolean not null default false,
 check((pages=0)=(last_limit is null))
);
alter table coverage_progress_private.requests_v1 enable row level security;
alter table coverage_progress_private.pages_v1 enable row level security;
revoke all on all tables in schema coverage_progress_private from public,anon,authenticated,service_role;

create function coverage_progress_private.digest_v1(v text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(v,'UTF8')),'hex')
$$;
create function coverage_progress_private.ids_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare x jsonb;prior text;
begin
 if jsonb_typeof(v) is distinct from 'array' then return false;end if;
 if jsonb_array_length(v) not between 1 and 20 then return false;end if;
 for x in select value from jsonb_array_elements(v) loop
  if notification_private.uuid(x) is not true or (prior is not null and x#>>'{}'<=prior) then return false;end if;
  prior:=x#>>'{}';
 end loop;return true;
end$$;
create function coverage_progress_private.input_v1(v jsonb,a text) returns boolean language plpgsql immutable set search_path='' as $$
declare k text[];original jsonb;
begin
 k:=array['action','scope'];
 if a='list' then k:=k||array['cursor','limit'];else
  k:=k||array['requestId','objectIds'];
  if a in('export','erase') then k:=k||array['previewDigest','confirmed'];
  elsif a='recover' then k:=k||array['mutationBytes'];
  elsif a='page' then k:=k||array['sourceDigest','previewDigest','cursor','limit'];
  elsif a='proof' then k:=k||array['sourceDigest','previewDigest'];
  elsif a<>'preview' then return false;end if;
 end if;
 if notification_private.exact(v,k) is not true or v->>'action' is distinct from a
 or v->>'scope' is distinct from 'coverage-progress-data/1' then return false;end if;
 if a<>'list' and (notification_private.uuid(v->'requestId') is not true
 or coverage_progress_private.ids_v1(v->'objectIds') is not true or v->'objectIds' ? (v->>'requestId')) then return false;end if;
 if a in('export','erase','page','proof') and (jsonb_typeof(v->'previewDigest')='string'
 and v->>'previewDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 if a in('export','erase') and v->'confirmed' is distinct from 'true'::jsonb then return false;end if;
 if a in('page','proof') and (jsonb_typeof(v->'sourceDigest')='string'
 and v->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 if a in('list','page') then
  if v->'limit' is distinct from to_jsonb(case a when 'list' then 20 else 5 end) then return false;end if;
  if v->'cursor'<>'null'::jsonb and (notification_private.exact(v->'cursor',array['sourceDigest','afterId']) is not true
   or notification_private.uuid(v->'cursor'->'afterId') is not true or (jsonb_typeof(v->'cursor'->'sourceDigest')='string'
   and v->'cursor'->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true) then return false;end if;
 end if;
 if a='recover' then
  if jsonb_typeof(v->'mutationBytes') is distinct from 'string' or octet_length(v->>'mutationBytes')>8192 then return false;end if;
  original:=(v->>'mutationBytes')::jsonb;
  if coverage_progress_private.input_v1(original,'erase') is not true
   or original-array['action','previewDigest','confirmed'] is distinct from v-array['action','mutationBytes'] then return false;end if;
 end if;return true;
exception when others then return false;end$$;
create function coverage_progress_private.boundaries_v1() returns jsonb language sql immutable set search_path='' as $$
 select '{"exportFields":["selected_collector_all_request_fields","selected_collector_all_section_fields","selected_collector_all_fence_fields","selected_exit_all_request_fields","selected_exit_all_page_fields","minimal_exit_receipt"],"eraseFields":["selected_collector_transient_requests_and_sections","selected_exit_transient_page_progress"],"retained":["original_request_id_owner_session_scope_expiry_fences","nonreplayable_exit_bindings_selection_digests_decision_receipts","original_session_account_cascade_semantics"],"missing":["unselected_progress_records","source_data_in_separate_domains","external_export_files","backup_restore_target_acceptance"]}'::jsonb
$$;
create function coverage_progress_private.binding_v1(r coverage_progress_private.requests_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schemaVersion','coverage-progress-data/1','scope',r.scope,'requestId',r.request_id,
 'objectIds',r.object_ids,'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,
 'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,'capturedAt',r.captured_at,'expiresAt',r.expires_at,
 'boundaries',coverage_progress_private.boundaries_v1(),'allUserDataCompleted',false)
$$;
create function coverage_progress_private.receipt_v1(r coverage_progress_private.requests_v1) returns jsonb language sql stable set search_path='' as $$
 select coverage_progress_private.binding_v1(r)||jsonb_build_object('kind','receipt','state','erased',
 'requestDigest',r.request_digest,'committedAt',r.decided_at,'decidedAt',r.decided_at,'effects',r.effects)
$$;
-- Immutable fences have exactly one irreversible decision; page counters live separately.
create function coverage_progress_private.immutable_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if to_jsonb(NEW)-array['decision','request_digest','decided_at','effects'] is distinct from
 to_jsonb(OLD)-array['decision','request_digest','decided_at','effects']
 or OLD.decision is not null and NEW is distinct from OLD then raise exception 'COVERAGE_PROGRESS_REQUEST_CONFLICT';end if;
 return NEW;
end$$;
create trigger coverage_progress_immutable_v1 before update on coverage_progress_private.requests_v1
 for each row execute function coverage_progress_private.immutable_v1();

-- Complete owner inventory sentinel before hash/return. No persisted list state.
create function coverage_progress_private.inventory_v1(u uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb;
begin
 select coalesce(jsonb_agg(item order by id),'[]') into items from (
  select id,jsonb_build_object('objectId',id,'domain',domain,'state',state,'rows',rows_n) item from (
   select f.request_id id,'collector' domain,case when r.request_id is null then 'retained' else 'active' end state,
   (select count(*) from coverage_export_private.sections_v1 p where p.request_id=f.request_id) rows_n
   from coverage_export_private.request_fences_v1 f left join coverage_export_private.requests_v1 r
    on r.request_id=f.request_id and r.owner_id=u where f.owner_id=u
   union all select r.request_id,'exit',case when r.decision='erase' then 'erased'
    when p.request_id is not null then 'active' else 'retained' end,case when p.request_id is null then 0 else 1 end
   from coverage_progress_private.requests_v1 r left join coverage_progress_private.pages_v1 p using(request_id) where r.owner_id=u
  ) roots order by id limit 10001
 ) bounded;
 if jsonb_array_length(items)>10000 then raise exception 'COVERAGE_PROGRESS_CAPACITY';end if;
 if (select count(distinct value->>'objectId') from jsonb_array_elements(items))<>jsonb_array_length(items)
 then raise exception 'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE';end if;
 if exists(select 1 from jsonb_array_elements(items) x where (x->>'rows')::integer>3)
 then raise exception 'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE';end if;
 if octet_length(notification_private.canonical(items))>1000000 then raise exception 'COVERAGE_PROGRESS_CAPACITY';end if;
 return items;
end$$;
-- Every persisted field is projected once; no recursive selected-row traversal.
create function coverage_progress_private.items_v1(u uuid,ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare id_n uuid;f coverage_export_private.request_fences_v1%rowtype;r coverage_export_private.requests_v1%rowtype;
 e coverage_progress_private.requests_v1%rowtype;p coverage_progress_private.pages_v1%rowtype;
 item jsonb;request_n jsonb;sections_n jsonb;items jsonb:='[]';
begin
 foreach id_n in array ids loop
  select * into f from coverage_export_private.request_fences_v1 where owner_id=u and request_id=id_n;
  if found then
   if exists(select 1 from coverage_progress_private.requests_v1 where owner_id=u and request_id=id_n)
   then raise exception 'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE';end if;
   select * into r from coverage_export_private.requests_v1 where owner_id=u and request_id=id_n;
   request_n:=null;sections_n:='[]';
   if found then
    if r.session_id<>f.session_id or r.scope<>f.scope or r.expires_at<>f.expires_at then raise exception 'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE';end if;
    request_n:=jsonb_build_object('requestId',r.request_id,'ownerId',r.owner_id,'sessionId',r.session_id,
     'mobileEpoch',r.mobile_epoch,'scope',r.scope,'sourceDigest',r.source_digest,'capturedAt',r.captured_at,'expiresAt',r.expires_at);
    select coalesce(jsonb_agg(jsonb_build_object('requestId',request_id,'section',section,'lastCursor',last_cursor,
     'nextCursor',next_cursor,'lastLimit',last_limit,'pages',pages,'rows',rows,'bytes',bytes,'terminal',terminal) order by section),'[]')
    into sections_n from coverage_export_private.sections_v1 where request_id=id_n;
    if (select array_agg(value->>'section' order by value->>'section') from jsonb_array_elements(sections_n))
     is distinct from (case r.scope when 'notification-metadata/1' then array['notifications'] else array['operations','trips'] end)
    then raise exception 'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE';end if;
   end if;
   item:=jsonb_build_object('objectId',id_n,'domain','collector','request',request_n,'sections',sections_n,
    'fence',jsonb_build_object('requestId',f.request_id,'ownerId',f.owner_id,'sessionId',f.session_id,'scope',f.scope,'expiresAt',f.expires_at));
  else
   select * into e from coverage_progress_private.requests_v1 where owner_id=u and request_id=id_n;
   if not found then raise exception 'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE';end if;
   select * into p from coverage_progress_private.pages_v1 where request_id=id_n;
   item:=jsonb_build_object('objectId',id_n,'domain','exit','request',jsonb_build_object('requestId',e.request_id,
    'ownerId',e.owner_id,'sessionId',e.session_id,'mobileEpoch',e.mobile_epoch,'scope',e.scope,'objectIds',e.object_ids,
    'sourceDigest',e.source_digest,'previewDigest',e.preview_digest,'capturedAt',e.captured_at,'expiresAt',e.expires_at,
    'decision',e.decision,'requestDigest',e.request_digest,'decidedAt',e.decided_at,'effects',e.effects),
    'progress',case when p.request_id is null then null else jsonb_build_object('requestId',p.request_id,
     'lastCursor',p.last_cursor,'nextCursor',p.next_cursor,'lastLimit',p.last_limit,'pages',p.pages,'rows',p.rows,
     'bytes',p.bytes,'terminal',p.terminal) end);
  end if;
  items:=items||jsonb_build_array(item);
  if octet_length(notification_private.canonical(items))>1000000 then raise exception 'COVERAGE_PROGRESS_CAPACITY';end if;
 end loop;return items;
end$$;

-- Cursor CAS includes actual metadata, even if summary counts do not change.
-- Each bounded flat row is hashed only after its byte cap; no persisted snapshots.
create function coverage_progress_private.inventory_fingerprint_v1(u uuid,inventory jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare obj jsonb;flat jsonb;fingerprints jsonb:='[]';
begin
 for obj in select value from jsonb_array_elements(inventory) loop
  flat:=coverage_progress_private.items_v1(u,array[(obj->>'objectId')::uuid]);
  fingerprints:=fingerprints||jsonb_build_array(jsonb_build_object('objectId',obj->'objectId','digest',notification_private.hash(flat)));
 end loop;return fingerprints;
end$$;

create function public.privacy_coverage_progress_v1(p_action text,p_input_bytes text,p_expected_epoch bigint) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();s uuid;epoch_n bigint;at_time timestamptz;now_ms bigint;
 v jsonb;a text;req uuid;ids uuid[];lock_id uuid;r coverage_progress_private.requests_v1%rowtype;
 p coverage_progress_private.pages_v1%rowtype;items jsonb;inventory jsonb;binding_n jsonb;result_n jsonb;
 digest_n text;cmd_digest text;cursor_n jsonb;after_n uuid;last_n uuid;more_n boolean;page_n jsonb;next_n jsonb;
 n integer;page_bytes integer;replay boolean:=false;cr integer;cs integer;ep integer;complete boolean;
begin
 -- No candidate/CAS/cleanup/write precedes current ordinary signed authority.
 if u is null or auth.role() is distinct from 'authenticated' or auth.jwt()->>'role' is distinct from 'authenticated'
 or auth.jwt()->>'is_anonymous' is distinct from 'false' or notification_private.uuid(auth.jwt()->'session_id') is not true
 then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34))
 then raise lock_not_available using message='COVERAGE_PROGRESS_LOCK_CONFLICT';end if;
 perform 1 from auth.users where id=u for key share nowait;
 if not found then raise exception 'UNAUTHENTICATED';end if;
 select epoch into epoch_n from identity_private.mobile_accounts where owner_id=u and session_id=s for update nowait;
 if not found or epoch_n is distinct from p_expected_epoch then raise exception 'SESSION_REPLACED';end if;
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
 if (a='export' and p_action<>'export_start') or coverage_progress_private.input_v1(v,a) is not true then raise exception 'INVALID_INPUT';end if;
 if a='list' then
  inventory:=coverage_progress_private.inventory_v1(u);
  digest_n:=notification_private.hash(jsonb_build_object('schemaVersion','coverage-progress-data/1','scope',v->'scope',
   'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,'items',inventory,
   'metadata',coverage_progress_private.inventory_fingerprint_v1(u,inventory)));
  cursor_n:=nullif(v->'cursor','null'::jsonb);after_n:=(cursor_n->>'afterId')::uuid;
  if cursor_n is not null then
   if cursor_n->>'sourceDigest' is distinct from digest_n then raise exception 'COVERAGE_PROGRESS_SOURCE_CHANGED';end if;
   if not exists(select 1 from jsonb_array_elements(inventory) x where x->>'objectId'=after_n::text)
   then raise exception 'COVERAGE_PROGRESS_CURSOR_CONFLICT';end if;
  end if;
  select coalesce(jsonb_agg(value order by value->>'objectId'),'[]') into page_n from (
   select value from jsonb_array_elements(inventory) where after_n is null or value->>'objectId'>after_n::text
   order by value->>'objectId' limit 20
  ) q;
  n:=jsonb_array_length(page_n);last_n:=(page_n->(n-1)->>'objectId')::uuid;
  more_n:=exists(select 1 from jsonb_array_elements(inventory) x where x->>'objectId'>last_n::text);
  result_n:=jsonb_build_object('schemaVersion','coverage-progress-data/1','kind','list','scope',v->'scope',
   'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,'sourceDigest',digest_n,'capturedAt',now_ms,'expiresAt',now_ms+30000,
   'items',page_n,'hasMore',more_n,'nextCursor',case when more_n then jsonb_build_object('sourceDigest',digest_n,'afterId',last_n) else null end,
   'allUserDataCompleted',false);
 else
  req:=(v->>'requestId')::uuid;
  select array_agg(x::uuid order by x) into ids from jsonb_array_elements_text(v->'objectIds') x;
  -- Owner-filtered recovery lookup BEFORE selected/request locking: foreign and
  -- absent IDs share the exact unknown projection, including lock timing.
  select * into r from coverage_progress_private.requests_v1 where owner_id=u and request_id=req;
  if a='recover' and r.request_id is null then
   return jsonb_build_object('schemaVersion','coverage-progress-data/1','kind','unknown','scope',v->'scope',
    'requestId',req,'objectIds',ids,'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,
    'requestDigest',coverage_progress_private.digest_v1(v->>'mutationBytes'),'allUserDataCompleted',false);
  end if;
  for lock_id in select id from unnest(ids||req) id order by id loop
   if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('coverage-request:'||lock_id::text,0))
   then raise lock_not_available using message='COVERAGE_PROGRESS_LOCK_CONFLICT';end if;
  end loop;
  -- Original fences -> requests/sections -> new requests/pages. Metadata only.
  if a not in('recover') and not (a='erase' and r.decision is not distinct from 'erase') then
   perform 1 from coverage_export_private.request_fences_v1 where owner_id=u and request_id=any(ids||req) order by request_id for update nowait;
   perform 1 from coverage_export_private.requests_v1 where owner_id=u and request_id=any(ids) order by request_id for update nowait;
   perform 1 from coverage_export_private.sections_v1 sec join coverage_export_private.requests_v1 x using(request_id)
    where x.owner_id=u and sec.request_id=any(ids) order by sec.request_id,sec.section for update of sec nowait;
   perform 1 from coverage_progress_private.requests_v1 where owner_id=u and request_id=any(ids||req) order by request_id for update nowait;
   perform 1 from coverage_progress_private.pages_v1 pg join coverage_progress_private.requests_v1 x using(request_id)
    where x.owner_id=u and pg.request_id=any(ids||req) order by pg.request_id for update of pg nowait;
  end if;
  select * into r from coverage_progress_private.requests_v1 where owner_id=u and request_id=req for update nowait;
  if found and (r.session_id<>s or r.mobile_epoch<>epoch_n or r.scope<>v->>'scope' or r.object_ids<>ids)
  then raise exception 'COVERAGE_PROGRESS_REQUEST_CONFLICT';end if;
  cmd_digest:=coverage_progress_private.digest_v1(case a when 'recover' then v->>'mutationBytes' else p_input_bytes end);
  if a='recover' or a='erase' and r.decision='erase' then
   if r.request_id is not null then
    if (r.request_digest is not null and r.request_digest is distinct from cmd_digest)
     or r.preview_digest is distinct from (case a when 'recover' then (v->>'mutationBytes')::jsonb->>'previewDigest' else v->>'previewDigest' end)
    then raise exception 'COVERAGE_PROGRESS_REQUEST_CONFLICT';end if;
    if r.decision='erase' then return coverage_progress_private.receipt_v1(r);end if;
   end if;
   if a='recover' then return jsonb_build_object('schemaVersion','coverage-progress-data/1','kind','unknown','scope',v->'scope',
    'requestId',req,'objectIds',ids,'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,'requestDigest',cmd_digest,'allUserDataCompleted',false);end if;
  end if;
  if r.request_id is not null and (now_ms<r.captured_at or now_ms>=r.expires_at) then raise exception 'COVERAGE_PROGRESS_EXPIRED';end if;
  if a='preview' and r.request_id is null then
   if exists(select 1 from coverage_export_private.request_fences_v1 where request_id=req)
    or exists(select 1 from coverage_export_private.requests_v1 where request_id=req)
    or exists(select 1 from coverage_progress_private.requests_v1 where request_id=req)
   then raise exception 'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE';end if;
  elsif r.request_id is null then raise exception 'COVERAGE_PROGRESS_SOURCE_UNAVAILABLE';end if;
  items:=coverage_progress_private.items_v1(u,ids);
  digest_n:=notification_private.hash(jsonb_build_object('schemaVersion','coverage-progress-data/1','scope',v->'scope',
   'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,'objectIds',ids,'items',items));
  if a='preview' and r.request_id is null then
   r.request_id:=req;r.owner_id:=u;r.session_id:=s;r.mobile_epoch:=epoch_n;r.scope:=v->>'scope';r.object_ids:=ids;
   r.source_digest:=digest_n;r.captured_at:=now_ms;r.expires_at:=now_ms+30000;r.preview_digest:=repeat('0',64);
   r.preview_digest:=notification_private.hash(coverage_progress_private.binding_v1(r)-'previewDigest');
   insert into coverage_progress_private.requests_v1(request_id,owner_id,session_id,mobile_epoch,scope,object_ids,
    source_digest,preview_digest,captured_at,expires_at) values(req,u,s,epoch_n,r.scope,ids,digest_n,r.preview_digest,now_ms,now_ms+30000);
  end if;
  if r.source_digest is distinct from digest_n then raise exception 'COVERAGE_PROGRESS_SOURCE_CHANGED';end if;
  if a<>'preview' and r.preview_digest is distinct from v->>'previewDigest' then raise exception 'COVERAGE_PROGRESS_REQUEST_CONFLICT';end if;
  if a in('page','proof') and digest_n is distinct from v->>'sourceDigest' then raise exception 'COVERAGE_PROGRESS_SOURCE_CHANGED';end if;
  binding_n:=coverage_progress_private.binding_v1(r);
  -- Bound the WHOLE final wrapper before decision or paging. Never truncate.
  if octet_length(notification_private.canonical(jsonb_build_object('data',binding_n||jsonb_build_object('kind','bundle',
   'requestDigest',coalesce(r.request_digest,cmd_digest),'items',items,'proof',jsonb_build_object('coverage','complete',
   'pages',ceil(cardinality(ids)::numeric/5)::integer,'rows',cardinality(ids))))))>1000000 then raise exception 'COVERAGE_PROGRESS_CAPACITY';end if;
  if a='preview' then
   if r.decision is not null then raise exception 'COVERAGE_PROGRESS_REQUEST_CONFLICT';end if;
   result_n:=binding_n||jsonb_build_object('kind','preview','items',items,'requiresExplicitConfirmation',true);
  elsif a='export' then
   if r.decision is not null and (r.decision<>'export' or r.request_digest<>cmd_digest)
   then raise exception 'COVERAGE_PROGRESS_REQUEST_CONFLICT';end if;
   if r.decision is null then
    update coverage_progress_private.requests_v1 set decision='export',request_digest=cmd_digest,decided_at=now_ms where request_id=req returning * into r;
    insert into coverage_progress_private.pages_v1(request_id) values(req);
   elsif not exists(select 1 from coverage_progress_private.pages_v1 where request_id=req)
   then raise exception 'COVERAGE_PROGRESS_REQUEST_CONFLICT';end if;
   result_n:=binding_n||jsonb_build_object('kind','started','requestDigest',r.request_digest,
    'limits',jsonb_build_object('pageSize',5,'maxPages',4,'maxRows',20,'maxBytes',1000000));
  elsif a in('page','proof') then
   if r.decision is distinct from 'export' then raise exception 'COVERAGE_PROGRESS_REQUEST_CONFLICT';end if;
   select * into p from coverage_progress_private.pages_v1 where request_id=req;
   if not found then raise exception 'COVERAGE_PROGRESS_REQUEST_CONFLICT';end if;
   complete:=p.terminal and p.rows=cardinality(ids) and p.pages=ceil(cardinality(ids)::numeric/5)::integer;
   if a='proof' then
    result_n:=binding_n||jsonb_build_object('kind','proof','requestDigest',r.request_digest,
     'coverage',case when complete then 'complete' else 'partial' end,'pages',p.pages,'rows',p.rows);
   else
    cursor_n:=nullif(v->'cursor','null'::jsonb);after_n:=(cursor_n->>'afterId')::uuid;
    if cursor_n is not null and (cursor_n->>'sourceDigest' is distinct from digest_n or not after_n=any(ids))
    then raise exception 'COVERAGE_PROGRESS_CURSOR_CONFLICT';end if;
    if p.pages>0 and p.last_cursor is not distinct from cursor_n then replay:=true;
    elsif p.terminal or p.next_cursor is distinct from cursor_n then raise exception 'COVERAGE_PROGRESS_CURSOR_CONFLICT';end if;
    select coalesce(jsonb_agg(value order by value->>'objectId'),'[]') into page_n from (
     select value from jsonb_array_elements(items) where after_n is null or value->>'objectId'>after_n::text order by value->>'objectId' limit 5
    ) q;
    n:=jsonb_array_length(page_n);last_n:=(page_n->(n-1)->>'objectId')::uuid;
    more_n:=exists(select 1 from unnest(ids) id where id>last_n);
    next_n:=case when more_n then jsonb_build_object('sourceDigest',digest_n,'afterId',last_n) else null end;
    page_bytes:=octet_length(notification_private.canonical(page_n));
    if not replay then
     if p.pages>=4 or p.rows+n>20 or p.bytes+page_bytes>1000000 then raise exception 'COVERAGE_PROGRESS_CAPACITY';end if;
     update coverage_progress_private.pages_v1 set last_cursor=cursor_n,next_cursor=next_n,last_limit=5,
      pages=pages+1,rows=rows+n,bytes=bytes+page_bytes,terminal=not more_n where request_id=req returning * into p;
    end if;
    result_n:=binding_n||jsonb_build_object('kind','page','requestDigest',r.request_digest,'items',page_n,'hasMore',more_n,
     'nextCursor',next_n,'sectionComplete',not more_n,'pageNumber',p.pages);
   end if;
  elsif a='erase' then
   if r.decision is not null then raise exception 'COVERAGE_PROGRESS_REQUEST_CONFLICT';end if;
   select count(*) into cs from coverage_export_private.sections_v1 sec join coverage_export_private.requests_v1 x using(request_id)
    where x.owner_id=u and sec.request_id=any(ids);
   delete from coverage_export_private.requests_v1 where owner_id=u and request_id=any(ids);get diagnostics cr=row_count;
   delete from coverage_progress_private.pages_v1 pg using coverage_progress_private.requests_v1 x
    where x.request_id=pg.request_id and x.owner_id=u and pg.request_id=any(ids);get diagnostics ep=row_count;
   update coverage_progress_private.requests_v1 set decision='erase',request_digest=cmd_digest,decided_at=now_ms,
    effects=jsonb_build_object('collectorRequests',cr,'collectorSections',cs,'exitPages',ep,'retainedFences',cardinality(ids),
     'sourceData','not_modified','sessionAccountFences','retained','externalCopies','not_erased') where request_id=req returning * into r;
   result_n:=coverage_progress_private.receipt_v1(r);
  else raise exception 'INVALID_INPUT';end if;
 end if;
 if octet_length(notification_private.canonical(jsonb_build_object('data',result_n)))>1000000 then raise exception 'COVERAGE_PROGRESS_CAPACITY';end if;
 return result_n;
exception when lock_not_available then raise lock_not_available using message='COVERAGE_PROGRESS_LOCK_CONFLICT';end$$;
revoke all on all functions in schema coverage_progress_private from public,anon,authenticated,service_role;
revoke all on function public.privacy_coverage_progress_v1(text,text,bigint) from public,anon,authenticated,service_role;
