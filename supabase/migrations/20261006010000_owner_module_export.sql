-- VPJ-58 ALL1: ordinary-owner notification/lifecycle metadata export only.
-- No old worker/artifact enrollment, source deletion or target RPC activation.
create schema coverage_export_private;
revoke all on schema coverage_export_private from public,anon,authenticated,service_role;

-- Source-free, short-lived progress. No source rows, Trip bodies or credentials.
create table coverage_export_private.requests_v1 (
 request_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 mobile_epoch bigint not null check(mobile_epoch between 1 and 9007199254740990),
 scope text not null check(scope in ('notification-metadata/1','trip-lifecycle-metadata/1')),
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 captured_at bigint not null,
 expires_at bigint not null check(expires_at=captured_at+30000)
);
create index coverage_expiry_v1 on coverage_export_private.requests_v1(owner_id,expires_at);
create index coverage_session_v1 on coverage_export_private.requests_v1(session_id);
create table coverage_export_private.sections_v1 (
 request_id uuid not null references coverage_export_private.requests_v1(request_id) on delete cascade,
 section text not null check(section in ('notifications','trips','operations')),
 last_cursor jsonb,next_cursor jsonb,last_limit integer,
 pages integer not null default 0 check(pages between 0 and 400),
 rows integer not null default 0 check(rows between 0 and 10000),
 bytes integer not null default 0 check(bytes between 0 and 1000000),
 terminal boolean not null default false,
 primary key(request_id,section)
);
alter table coverage_export_private.requests_v1 enable row level security;
alter table coverage_export_private.sections_v1 enable row level security;
revoke all on all tables in schema coverage_export_private from public,anon,authenticated,service_role;

-- Minimal immutable request-key fence survives expiry cleanup until session/account
-- revocation. Without this fence an expired confirmed request could restart its TTL.
create table coverage_export_private.request_fences_v1 (
 request_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 scope text not null check(scope in ('notification-metadata/1','trip-lifecycle-metadata/1')),
 expires_at bigint not null
);
create index coverage_fence_owner_v1 on coverage_export_private.request_fences_v1(owner_id);
create index coverage_fence_session_v1 on coverage_export_private.request_fences_v1(session_id);
alter table coverage_export_private.request_fences_v1 enable row level security;
revoke all on coverage_export_private.request_fences_v1 from public,anon,authenticated,service_role;

-- Closed safe notification projection copied from the accepted original union.
-- The original service-only function, ACL and lease semantics remain untouched.
create function coverage_export_private.notifications_v1(u uuid,at_time timestamptz)
returns jsonb language sql stable security definer set search_path='' set timezone='UTC' as $$
 select coalesce(jsonb_agg(x.row order by x.key collate "C"),'[]') from (select * from (
  select 'reminder:'||r.id key,jsonb_build_object('key','reminder:'||r.id,'domain','reminder','tripId',r.trip_id,'id',r.id,'baseVersion',r.base_version,'purpose',r.purpose,'source',r.source,'reason',r.reason,'dueAt',notification_private.stamp(r.due_at),'expiresAt',notification_private.stamp(r.expires_at),'timeZone',r.time_zone,'quietHours',r.quiet_hours,'consentAt',notification_private.stamp(r.consent_at),'status',coalesce(ur.status,r.status),'deliveryState',case when o.state='attempting' and exists(select 1 from notification_private.attempts aa where aa.notification_id=o.id and aa.lease_expires_at<=at_time) then 'unknown' else o.state end,'outcome',case when o.state='attempting' and exists(select 1 from notification_private.attempts aa where aa.notification_id=o.id and aa.lease_expires_at<=at_time) then '{"kind":"unknown","code":"ACK_UNKNOWN"}'::jsonb else o.outcome end) row
   from notification_private.reminders r join notification_private.outbox o on o.reminder_id=r.id left join public.travel_reminders ur on ur.id=r.user_reminder_id where r.owner_id=u
  union all select 'watch:'||id,jsonb_build_object('key','watch:'||id,'domain','watch','tripId',trip_id,'id',id,'source',source,'baselineDigest',baseline_digest,'expiresAt',notification_private.stamp(expires_at),'timeZone',time_zone,'quietHours',quiet_hours,'consentAt',notification_private.stamp(consent_at),'status',status) from notification_private.watches where owner_id=u
  union all select 'dismissal:'||next_step_id,jsonb_build_object('key','dismissal:'||next_step_id,'domain','dismissal','tripId',trip_id,'id',next_step_id,'sourceKind',source_kind,'sourceId',source_id,'semanticDigest',semantic_digest) from notification_private.dismissals where owner_id=u
  union all select 'operation:'||operation_id,jsonb_build_object('key','operation:'||operation_id,'domain','operation','tripId',trip_id,'operationId',operation_id,'action',action,'requestDigest',request_digest,'receipt',receipt) from notification_private.operations where owner_id=u
  union all select 'device:'||id,jsonb_build_object('key','device:'||id,'domain','device','deviceId',id,'revision',revision,'permission',permission,'active',active,'environment',environment,'timeZone',time_zone) from notification_private.devices where owner_id=u
 ) candidates order by key collate "C" limit 10001

 ) x;
$$;

create function coverage_export_private.sources_v1(u uuid,scope_n text,at_time timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare sections jsonb;items jsonb;ops jsonb;
begin
 if scope_n='notification-metadata/1' then
  items:=coverage_export_private.notifications_v1(u,at_time);
  if jsonb_array_length(items)>10000 then raise exception 'COVERAGE_CAPACITY';end if;
  -- Ambiguous original keys can never be silently counted as full coverage.
  if (select count(distinct x->>'key') from jsonb_array_elements(items) x)<>jsonb_array_length(items)
  then raise exception 'COVERAGE_SOURCE_INVALID';end if;
  sections:=jsonb_build_object('notifications',items);
 elsif scope_n='trip-lifecycle-metadata/1' then
  select coalesce(jsonb_agg(item order by id),'[]') into items from trip_lifecycle_private.trips_v1(u,null,10001);
  select coalesce(jsonb_agg(item order by id),'[]') into ops from (
   select operation_id id,jsonb_build_object('operationId',operation_id,'sessionId',session_id,'receipt',receipt,'erasedReason',erased_reason) item
   from trip_lifecycle_private.operations_v1 where owner_id=u order by operation_id limit 10001
  ) q;
  if jsonb_array_length(items)>10000 or jsonb_array_length(ops)>10000 then raise exception 'COVERAGE_CAPACITY';end if;
  sections:=jsonb_build_object('trips',items,'operations',ops);
 else raise exception 'INVALID_INPUT';end if;
 -- Sentinel and byte bounds precede hashing or return of source data.
 if octet_length(notification_private.canonical(sections))>1000000 then raise exception 'COVERAGE_CAPACITY';end if;
 return sections;
end $$;

create function public.privacy_coverage_module_export_v1(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare
 u uuid:=auth.uid();s uuid;epoch_n bigint;at_time timestamptz;now_ms bigint;
 action_n text;req uuid;scope_n text;keys text[];section_n text;limit_n integer;cursor_n jsonb;
 r coverage_export_private.requests_v1%rowtype;f coverage_export_private.request_fences_v1%rowtype;
 progress coverage_export_private.sections_v1%rowtype;
 sections jsonb;section_names text[];sources jsonb;items jsonb;page jsonb;digest_n text;binding jsonb;
 after_key text;key_name text;last_key text;more boolean;next_n jsonb;n integer;page_bytes integer;
 max_size integer;max_pages integer;max_rows integer;total_pages integer;total_rows integer;total_bytes integer;
 replay boolean:=false;complete boolean;
begin
 -- Current real SQL actor first; no DTO actor, UUID lookup, cleanup or source
 -- feedback precedes live session/epoch and the accepted 5-minute reauth rule.
 if u is null or auth.role() is distinct from 'authenticated'
 or auth.jwt()->>'role' is distinct from 'authenticated'
 or auth.jwt()->>'is_anonymous' is distinct from 'false'
 or trip_lifecycle_private.uuid_v1(auth.jwt()->'session_id') is not true then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34))
 then raise lock_not_available using message='COVERAGE_LOCK_CONFLICT';end if;
 perform 1 from auth.users where id=u for key share nowait;
 if not found then raise exception 'UNAUTHENTICATED';end if;
 select epoch into epoch_n from identity_private.mobile_accounts where owner_id=u and session_id=s for update nowait;
 if not found then raise exception 'SESSION_REPLACED';end if;
 perform 1 from auth.sessions where id=s and user_id=u for key share nowait;
 if not found then raise exception 'SESSION_REPLACED';end if;
 perform identity_private.guard_mobile_rpc_v2();
 if identity_private.mobile_access_v2() is not true or not exists(
  select 1 from identity_private.mobile_attempts where owner_id=u and session_id=s and epoch=epoch_n)
 then raise exception 'SESSION_REPLACED';end if;
 -- One wall clock capture per call. Start expiry uses this exact captured millisecond.
 at_time:=clock_timestamp();now_ms:=floor(extract(epoch from at_time)*1000)::bigint;
 if not exists(select 1 from auth.sessions where id=s and user_id=u
  and created_at between at_time-interval '5 minutes' and at_time)
 then raise exception 'REAUTHENTICATION_REQUIRED';end if;

 action_n:=p_input->>'action';scope_n:=p_input->>'scope';
 keys:=case action_n when 'start' then array['action','requestId','scope','confirmed']
 when 'page' then array['action','requestId','scope','section','cursor','limit']
 when 'proof' then array['action','requestId','scope'] else null end;
 if keys is null or notification_private.exact(p_input,keys) is not true
 or trip_lifecycle_private.uuid_v1(p_input->'requestId') is not true
 or (jsonb_typeof(p_input->'scope')='string' and scope_n in('notification-metadata/1','trip-lifecycle-metadata/1')) is not true
 or (action_n='start' and p_input->'confirmed' is distinct from 'true'::jsonb)
 then raise exception 'INVALID_INPUT';end if;
 req:=(p_input->>'requestId')::uuid;
 section_names:=case scope_n when 'notification-metadata/1' then array['notifications'] else array['trips','operations'] end;
 max_size:=case scope_n when 'notification-metadata/1' then 100 else 50 end;
 max_pages:=case scope_n when 'notification-metadata/1' then 100 else 400 end;
 max_rows:=case scope_n when 'notification-metadata/1' then 10000 else 20000 end;
 if action_n='page' then
  section_n:=p_input->>'section';cursor_n:=nullif(p_input->'cursor','null'::jsonb);
  if (jsonb_typeof(p_input->'section')='string' and section_n=any(section_names)) is not true
  or trip_lifecycle_private.integer_v1(p_input->'limit',max_size) is not true then raise exception 'INVALID_INPUT';end if;
  limit_n:=(p_input->>'limit')::integer;
  if limit_n<1 then raise exception 'INVALID_INPUT';end if;
  if cursor_n is not null then
   keys:=array['sourceDigest',case scope_n when 'notification-metadata/1' then 'afterKey' else 'afterId' end];
   if notification_private.exact(cursor_n,keys) is not true
   or (jsonb_typeof(cursor_n->'sourceDigest')='string' and cursor_n->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true
   or (scope_n='notification-metadata/1' and (jsonb_typeof(cursor_n->'afterKey')='string'
     and cursor_n->>'afterKey' ~ '^(reminder|watch|dismissal|operation|device):[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') is not true)
   or (scope_n='trip-lifecycle-metadata/1' and trip_lifecycle_private.uuid_v1(cursor_n->'afterId') is not true)
   then raise exception 'INVALID_INPUT';end if;
  end if;
 end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('coverage-request:'||req::text,0))
 then raise lock_not_available using message='COVERAGE_LOCK_CONFLICT';end if;
 select * into f from coverage_export_private.request_fences_v1 where request_id=req for update nowait;
 if found then
  if f.owner_id is distinct from u then raise exception 'FORBIDDEN';end if;
  if f.scope is distinct from scope_n then raise exception 'COVERAGE_REQUEST_CONFLICT';end if;
  if f.session_id is distinct from s then raise exception 'SESSION_REPLACED';end if;
  if f.expires_at<=now_ms then raise exception 'COVERAGE_EXPIRED';end if;
 elsif action_n<>'start' then raise exception 'FORBIDDEN';end if;
 select * into r from coverage_export_private.requests_v1 where request_id=req for update nowait;
 if found and (r.owner_id is distinct from u or r.session_id is distinct from s or r.mobile_epoch is distinct from epoch_n)
 then raise exception 'SESSION_REPLACED';end if;
 if r.request_id is not null and r.expires_at<=now_ms then raise exception 'COVERAGE_EXPIRED';end if;

 -- Existing account/owner lock order. All row-first writer conflicts fail NOWAIT.
 -- Do not create or advance any source revision, service job or worker lease.
 perform 1 from trip_lifecycle_private.owner_heads_v1 where owner_id=u for share nowait;
 if scope_n='notification-metadata/1' then
  perform 1 from notification_private.reminders where owner_id=u order by id for share nowait;
  perform 1 from notification_private.watches where owner_id=u order by id for share nowait;
  perform 1 from notification_private.dismissals where owner_id=u order by next_step_id for share nowait;
  perform 1 from notification_private.operations where owner_id=u order by operation_id for share nowait;
  perform 1 from notification_private.devices where owner_id=u order by id for share nowait;
  perform 1 from notification_private.outbox o join notification_private.reminders x on x.id=o.reminder_id where x.owner_id=u order by o.id for share of o nowait;
  perform 1 from notification_private.attempts a join notification_private.outbox o on o.id=a.notification_id join notification_private.reminders x on x.id=o.reminder_id where x.owner_id=u order by a.notification_id for share of a nowait;
  perform 1 from public.travel_reminders where owner_id=u order by id for share nowait;
 else
  perform 1 from public.trips where owner_id=u order by id for share nowait;
  perform 1 from public.trip_archives where owner_id=u order by trip_id for share nowait;
  perform 1 from trip_lifecycle_private.states_v1 where owner_id=u order by trip_id for share nowait;
  perform 1 from trip_lifecycle_private.operations_v1 where owner_id=u order by operation_id for share nowait;
 end if;
 sources:=coverage_export_private.sources_v1(u,scope_n,at_time);
 digest_n:=notification_private.hash(jsonb_build_object('schemaVersion','coverage-module-export/1',
  'requestId',req,'scope',scope_n,'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,'sections',sources));
 if r.request_id is not null and r.source_digest is distinct from digest_n then raise exception 'COVERAGE_SOURCE_CHANGED';end if;
 if action_n='start' and r.request_id is null then
  insert into coverage_export_private.request_fences_v1 values(req,u,s,scope_n,now_ms+30000);
  insert into coverage_export_private.requests_v1 values(req,u,s,epoch_n,scope_n,digest_n,now_ms,now_ms+30000) returning * into r;
  insert into coverage_export_private.sections_v1(request_id,section) select req,unnest(section_names);
 end if;
 if r.request_id is null then raise exception 'FORBIDDEN';end if;
 -- Expired source-free progress only; immutable fences block renewal. Authority,
 -- requested binding and source were verified before these cleanup effects.
 delete from coverage_export_private.requests_v1 where owner_id=u and expires_at<=now_ms;
 binding:=jsonb_build_object('schemaVersion','coverage-module-export/1','requestId',req,'scope',scope_n,
  'ownerId',u,'sessionId',s,'mobileEpoch',epoch_n,'sourceDigest',digest_n,
  'capturedAt',r.captured_at,'expiresAt',r.expires_at,'allUserDataCompleted',false);
 if action_n='start' then return binding||jsonb_build_object('kind','started','sections',to_jsonb(section_names),
  'limits',jsonb_build_object('pageSize',max_size,'maxPages',max_pages,'maxRows',max_rows,'maxBytes',1000000));end if;
 select coalesce(sum(pages),0),coalesce(sum(rows),0),coalesce(sum(bytes),0),coalesce(bool_and(terminal),false)
 into total_pages,total_rows,total_bytes,complete from coverage_export_private.sections_v1 where request_id=req;
 complete:=complete and (select count(*)=cardinality(section_names) and bool_and(section=any(section_names))
  from coverage_export_private.sections_v1 where request_id=req);
 if total_pages>max_pages or total_rows>max_rows or total_bytes>1000000 then raise exception 'COVERAGE_CAPACITY';end if;
 if action_n='proof' then return binding||jsonb_build_object('kind','proof','coverage',case when complete then 'complete' else 'partial' end,'pages',total_pages,'rows',total_rows);end if;
 select * into progress from coverage_export_private.sections_v1 where request_id=req and section=section_n for update nowait;
 if not found then raise exception 'FORBIDDEN';end if;
 if progress.pages>0 and progress.last_cursor is not distinct from cursor_n then
  if progress.last_limit is distinct from limit_n then raise exception 'COVERAGE_CURSOR_CONFLICT';end if;replay:=true;
 elsif progress.terminal or progress.next_cursor is distinct from cursor_n then raise exception 'COVERAGE_CURSOR_CONFLICT';end if;
 items:=sources->section_n;
 key_name:=case section_n when 'notifications' then 'key' when 'trips' then 'tripId' else 'operationId' end;
 if cursor_n is not null then
  after_key:=case section_n when 'notifications' then cursor_n->>'afterKey' else cursor_n->>'afterId' end;
  if cursor_n->>'sourceDigest' is distinct from digest_n or not exists(select 1 from jsonb_array_elements(items) x where x->>key_name=after_key)
  then raise exception 'COVERAGE_CURSOR_CONFLICT';end if;
 end if;
 select coalesce(jsonb_agg(x order by x->>key_name collate "C"),'[]') into page from (
  select value x from jsonb_array_elements(items) where after_key is null or value->>key_name collate "C">after_key collate "C"
  order by value->>key_name collate "C" limit limit_n
 ) q;
 n:=jsonb_array_length(page);last_key:=page->-1->>key_name;
 more:=last_key is not null and exists(select 1 from jsonb_array_elements(items) x where x->>key_name collate "C">last_key collate "C");
 next_n:=case when more then jsonb_build_object('sourceDigest',digest_n,case section_n when 'notifications' then 'afterKey' else 'afterId' end,last_key) else null end;
 -- Counts measure delivered row bytes once, without array delimiters per page.
 select coalesce(sum(octet_length(notification_private.canonical(value))),0) into page_bytes from jsonb_array_elements(page);
 if not replay then
  if total_pages+1>max_pages or total_rows+n>max_rows or progress.rows+n>10000 or total_bytes+page_bytes>1000000
  then raise exception 'COVERAGE_CAPACITY';end if;
  update coverage_export_private.sections_v1 set last_cursor=cursor_n,next_cursor=next_n,last_limit=limit_n,
   pages=pages+1,rows=rows+n,bytes=bytes+page_bytes,terminal=not more where request_id=req and section=section_n
   returning * into progress;
 end if;
 return binding||jsonb_build_object('kind','page','section',section_n,'items',page,'hasMore',more,'nextCursor',next_n,
  'sectionComplete',not more,'pageNumber',progress.pages);
end $$;
revoke all on all functions in schema coverage_export_private from public,anon,authenticated,service_role;
revoke all on function public.privacy_coverage_module_export_v1(jsonb) from public,anon,authenticated,service_role;
