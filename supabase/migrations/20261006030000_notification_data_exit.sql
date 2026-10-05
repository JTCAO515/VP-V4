-- VPJ-58 notification owner exit, wire v2. Append-only; default OFF/ungranted.
-- Drain elapsed time is attested by the trusted monotonic server controller,
-- never measured by SQL wall time or accepted from an owner DTO.
create schema notification_exit_private;
revoke all on schema notification_exit_private from public,anon,authenticated,service_role;
alter default privileges in schema notification_exit_private revoke execute on functions from public;
create table notification_exit_private.settings(singleton boolean primary key default true check(singleton),enabled boolean not null default false,drain_enabled boolean not null default false);
insert into notification_exit_private.settings(singleton) values(true);
create table notification_exit_private.requests(
 request_id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,mobile_epoch bigint not null check(mobile_epoch between 1 and 9007199254740991),
 scope text not null check(scope in('notification-trip-data/1','notification-device-data/1','notification-exit-progress/1')),
 object_ids uuid[] not null check(cardinality(object_ids) between 1 and 20),
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),preview_digest text not null check(preview_digest ~ '^[a-f0-9]{64}$'),
 captured_at bigint not null,expires_at bigint not null check(expires_at=captured_at+30000),
 request_digest text check(request_digest ~ '^[a-f0-9]{64}$'),
 state text not null default 'previewed' check(state in('previewed','exporting','exported','fenced','erased','expired')),
 committed_at bigint check(committed_at>=captured_at and committed_at<expires_at),decided_at bigint check(decided_at>=committed_at),
 pages integer not null default 0 check(pages between 0 and 4),rows integer not null default 0 check(rows between 0 and 20),
 progress_erased boolean not null default false,effects jsonb,
 drain_generation bigint not null default 0 check(drain_generation between 0 and 9007199254740991),
 drain_nonce text check(drain_nonce ~ '^[a-f0-9]{64}$'),
 check((state in('fenced','erased'))=(committed_at is not null)),
 check((state='erased')=(decided_at is not null)),check((committed_at is not null)=(effects is not null))
);
create index notification_exit_requests_owner on notification_exit_private.requests(owner_id,request_id);
create table notification_exit_private.pages(
 request_id uuid not null references notification_exit_private.requests(request_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,page_number integer not null check(page_number between 1 and 4),
 after_id uuid not null,rows integer not null check(rows between 1 and 5),request_digest text not null,source_digest text not null,
 created_at timestamptz not null default clock_timestamp(),primary key(request_id,page_number)
);
-- No Trip/device/source FK: minimal identities survive every source cascade.
create table notification_exit_private.fences(
 owner_id uuid not null references auth.users(id) on delete cascade,kind text not null check(kind in('reminder','watch','dismissal','operation','outbox','outbox_parent','watch_semantic','attempt','device','exit_request')),
 object_id uuid not null,trip_id uuid,request_id uuid not null,request_digest text,erased_at bigint not null,
 primary key(owner_id,kind,object_id)
);
create index notification_exit_fences_trip on notification_exit_private.fences(owner_id,trip_id,kind,object_id);
create index notification_exit_fences_request on notification_exit_private.fences(owner_id,request_id);
do $$declare n text;begin foreach n in array array['settings','requests','pages','fences'] loop
 execute format('alter table notification_exit_private.%I enable row level security',n);
 execute format('revoke all on notification_exit_private.%I from public,anon,authenticated,service_role',n);
end loop;end$$;
create function notification_exit_private.ms(v timestamptz) returns bigint language sql immutable set search_path='' as $$select floor(extract(epoch from v)*1000)::bigint$$;
create function notification_exit_private.digest(v text) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(v,'UTF8')),'hex')$$;
create function notification_exit_private.ids(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare x jsonb;prior text;begin
 if jsonb_typeof(v) is distinct from 'array' then return false;end if;
 if jsonb_array_length(v) not between 1 and 20 then return false;end if;
 for x in select value from jsonb_array_elements(v) loop
 if notification_private.uuid(x) is not true or prior is not null and x#>>'{}'<=prior then return false;end if;prior:=x#>>'{}';end loop;return true;
end$$;
create function notification_exit_private.input(v jsonb,a text) returns boolean language plpgsql immutable set search_path='' as $$declare k text[];original jsonb;begin
 k:=array['action','scope'];
 if a='list' then k:=k||array['cursor','limit'];else
 k:=k||array['requestId','objectIds'];
 if a in('export','erase') then k:=k||array['previewDigest','confirmed'];
 elsif a='recover' then k:=k||array['mutationBytes'];
 elsif a='page' then k:=k||array['sourceDigest','previewDigest','cursor','limit'];
 elsif a='proof' then k:=k||array['sourceDigest','previewDigest'];
 elsif a<>'preview' then return false;end if;end if;
 if notification_private.exact(v,k) is not true or v->>'action' is distinct from a or
 (v->>'scope' in('notification-trip-data/1','notification-device-data/1','notification-exit-progress/1')) is not true then return false;end if;
 if a<>'list' and (notification_private.uuid(v->'requestId') is not true or notification_exit_private.ids(v->'objectIds') is not true
 or v->>'scope'='notification-exit-progress/1' and v->'objectIds' ? (v->>'requestId')) then return false;end if;
 if a in('erase','export','page','proof') and (jsonb_typeof(v->'previewDigest')='string' and v->>'previewDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 if a in('erase','export') and v->'confirmed' is distinct from 'true'::jsonb then return false;end if;
 if a in('page','proof') and (jsonb_typeof(v->'sourceDigest')='string' and v->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 if a in('list','page') then
 if v->'limit' is distinct from to_jsonb(case a when 'list' then 20 else 5 end) then return false;end if;
 if v->'cursor'<>'null'::jsonb and (notification_private.exact(v->'cursor',array['sourceDigest','afterId']) is not true or notification_private.uuid(v->'cursor'->'afterId') is not true
 or (jsonb_typeof(v->'cursor'->'sourceDigest')='string' and v->'cursor'->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true) then return false;end if;
 end if;
 if a='recover' then
 if jsonb_typeof(v->'mutationBytes') is distinct from 'string' or octet_length(v->>'mutationBytes')>8192 then return false;end if;
 original:=(v->>'mutationBytes')::jsonb;
 if notification_exit_private.input(original,'erase') is not true or original-array['action','previewDigest','confirmed'] is distinct from v-array['action','mutationBytes'] then return false;end if;
 end if;return true;
exception when others then return false;end$$;
-- Authority first, original root order, no NOWAIT/advisory/role substitution.
create function notification_exit_private.authorize(u uuid,s uuid,e bigint) returns void language plpgsql security definer set search_path='' as $$declare actual bigint;ts timestamptz;begin
 perform 1 from auth.users where id=u for key share;if not found then raise exception 'UNAUTHENTICATED';end if;
 select epoch into actual from identity_private.mobile_accounts where owner_id=u and session_id=s for update;
 if not found or e is distinct from actual then raise exception 'SESSION_REPLACED';end if;
 perform 1 from auth.sessions where id=s and user_id=u for share;if not found then raise exception 'SESSION_REPLACED';end if;
 if not exists(select 1 from identity_private.mobile_attempts where owner_id=u and session_id=s and epoch=e) then raise exception 'SESSION_REPLACED';end if;
 ts:=clock_timestamp();
 if not exists(select 1 from auth.sessions where id=s and user_id=u and created_at between ts-interval '5 minutes' and ts) then raise exception 'REAUTHENTICATION_REQUIRED';end if;
end$$;
create function notification_exit_private.has_fence(u uuid,k text,id_n uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from notification_exit_private.fences where owner_id=u and kind=k and object_id=id_n)$$;
create function notification_exit_private.pair_id(u uuid,w uuid,d text) returns uuid language sql immutable set search_path='' as $$select notification_private.opaque(notification_private.hash(jsonb_build_array(u,w,d)))$$;
create function notification_exit_private.dismiss_id(u uuid,t uuid,k text,id_n uuid,d text) returns uuid language sql immutable set search_path='' as $$select notification_private.opaque(notification_private.hash(jsonb_build_array(u,t,k,id_n,d)))$$;
-- Original UPDATE writers already hold the owner/mobile roots (raw DML is
-- revoked). INSERT also acquires those roots before any fence read, including
-- the legacy source table. Reentrant locks preserve existing producer ordering.
create function notification_exit_private.producer_guard() returns trigger language plpgsql security definer set search_path='' as $$declare u uuid;r notification_private.reminders%rowtype;k text;id_n uuid;begin
 if TG_TABLE_NAME in('outbox','attempts') then
 if TG_TABLE_NAME='outbox' then select * into r from notification_private.reminders where id=NEW.reminder_id;
 else select rr.* into r from notification_private.reminders rr join notification_private.outbox o on o.reminder_id=rr.id where o.id=NEW.notification_id;end if;
 u:=r.owner_id;if u is null then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 else u:=NEW.owner_id;end if;
 if TG_OP='INSERT' then
 perform 1 from auth.users where id=u for key share;
 perform 1 from identity_private.mobile_accounts where owner_id=u for update;
 perform 1 from auth.sessions ss join identity_private.mobile_accounts ma on ma.owner_id=u and ma.session_id=ss.id where ss.user_id=u for share of ss;
 end if;
 if TG_TABLE_NAME='outbox' then
 if notification_exit_private.has_fence(u,'outbox',NEW.id) or notification_exit_private.has_fence(u,'outbox_parent',NEW.reminder_id)
 or NEW.device_id is not null and notification_exit_private.has_fence(u,'device',NEW.device_id)
 or NEW.watch_id is not null and notification_exit_private.has_fence(u,'watch_semantic',notification_exit_private.pair_id(u,NEW.watch_id,NEW.semantic_digest))
 then raise exception 'NOTIFICATION_DATA_ERASED_ID';end if;
 elsif TG_TABLE_NAME='attempts' then
 if notification_exit_private.has_fence(u,'attempt',NEW.attempt_id) or notification_exit_private.has_fence(u,'outbox',NEW.notification_id)
 or notification_exit_private.has_fence(u,'device',NEW.device_id) then raise exception 'NOTIFICATION_DATA_ERASED_ID';end if;
 else
 k:=case TG_TABLE_NAME when 'devices' then 'device' when 'watches' then 'watch' when 'operations' then 'operation' when 'dismissals' then 'dismissal' else 'reminder' end;
 if TG_TABLE_NAME='operations' then id_n:=NEW.operation_id;elsif TG_TABLE_NAME='dismissals' then id_n:=notification_exit_private.dismiss_id(u,NEW.trip_id,NEW.source_kind,NEW.source_id,NEW.semantic_digest);else id_n:=NEW.id;end if;
 if notification_exit_private.has_fence(u,k,id_n) then raise exception 'NOTIFICATION_DATA_ERASED_ID';end if;
 if TG_TABLE_NAME='reminders' then if notification_exit_private.has_fence(u,'operation',NEW.operation_id) then raise exception 'NOTIFICATION_DATA_ERASED_ID';end if;end if;
 end if;return NEW;
end$$;
create trigger notification_exit_devices_guard before insert or update on notification_private.devices for each row execute function notification_exit_private.producer_guard();
create trigger notification_exit_reminders_guard before insert or update on notification_private.reminders for each row execute function notification_exit_private.producer_guard();
create trigger notification_exit_watches_guard before insert or update on notification_private.watches for each row execute function notification_exit_private.producer_guard();
create trigger notification_exit_dismissals_guard before insert or update on notification_private.dismissals for each row execute function notification_exit_private.producer_guard();
create trigger notification_exit_operations_guard before insert or update on notification_private.operations for each row execute function notification_exit_private.producer_guard();
create trigger notification_exit_outbox_guard before insert or update on notification_private.outbox for each row execute function notification_exit_private.producer_guard();
create trigger notification_exit_attempts_guard before insert or update on notification_private.attempts for each row execute function notification_exit_private.producer_guard();
create trigger notification_exit_legacy_guard before insert or update on public.travel_reminders for each row execute function notification_exit_private.producer_guard();
create function notification_exit_private.boundaries(scope_n text) returns jsonb language sql immutable set search_path='' as $$select case scope_n
 when 'notification-trip-data/1' then '{"exportFields":["reminders_all_fields","watches_all_fields","dismissals_all_fields","outbox_all_fields","attempts_all_fields","operations_all_fields","travel_reminders_all_fields","retained_object_operation_dispatch_fences"],"eraseFields":["selected_trip_notification_rows","selected_trip_user_reminder_rows"],"retained":["nonreplayable_object_operation_dispatch_fences","minimal_exit_receipts","original_trip_and_business_results","device_bindings"],"missing":["provider_accepted_copies_not_recallable","provider_ack_unknown","device_delivered_notifications","device_local_journals","external_export_files","backup_restore_target_acceptance"]}'::jsonb
 when 'notification-device-data/1' then '{"exportFields":["devices_all_fields_including_push_token","associated_outbox_all_fields","associated_attempts_all_fields","retained_device_dispatch_fences"],"eraseFields":["selected_device_bindings","associated_attempt_rows","associated_outbox_rows"],"retained":["nonreplayable_device_dispatch_fences","minimal_exit_receipts","trip_reminder_watch_source_rows"],"missing":["provider_accepted_copies_not_recallable","provider_ack_unknown","device_os_permission","device_push_token_system_copy","device_delivered_notifications","device_local_journals","external_export_files","backup_restore_target_acceptance"]}'::jsonb
 when 'notification-exit-progress/1' then '{"exportFields":["selected_exit_request_metadata","selected_exit_page_progress","minimal_exit_receipts","retained_object_operation_device_dispatch_fences"],"eraseFields":["selected_transient_page_progress"],"retained":["nonreplayable_request_object_operation_device_dispatch_fences","source_preview_request_digests","minimal_exit_receipts"],"missing":["other_unselected_exit_requests","external_export_files","backup_restore_target_acceptance"]}'::jsonb
end$$;
create function notification_exit_private.binding(r notification_exit_private.requests) returns jsonb language sql stable set search_path='' as $$select
 jsonb_build_object('schemaVersion','notification-data/1','scope',r.scope,'requestId',r.request_id,'objectIds',r.object_ids,'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,
 'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,'capturedAt',r.captured_at,'expiresAt',r.expires_at,'boundaries',notification_exit_private.boundaries(r.scope),'allUserDataCompleted',false)$$;
create function notification_exit_private.receipt(r notification_exit_private.requests) returns jsonb language sql stable set search_path='' as $$select
 notification_exit_private.binding(r)||jsonb_build_object('kind',case r.state when 'erased' then 'receipt' else 'draining' end,'state',r.state,'requestDigest',r.request_digest,'committedAt',r.committed_at)
 ||case r.state when 'erased' then jsonb_build_object('decidedAt',r.decided_at,'effects',r.effects) else '{}'::jsonb end where r.state in('fenced','erased')$$;
create function notification_exit_private.row_json(v jsonb) returns jsonb language plpgsql stable set search_path='' as $$declare k text;begin
 foreach k in array array['due_at','expires_at','consent_at','created_at','next_check_at','updated_at','authorized_at','lease_expires_at'] loop
 if v ? k and v->k<>'null'::jsonb then v:=jsonb_set(v,array[k],to_jsonb(notification_private.stamp((v->>k)::timestamptz)));end if;end loop;return v;
end$$;
create function notification_exit_private.fence_json(f notification_exit_private.fences) returns jsonb language sql immutable set search_path='' as $$select
 jsonb_build_object('kind',f.kind,'objectId',f.object_id,'tripId',f.trip_id,'requestId',f.request_id,'requestDigest',f.request_digest,'erasedAt',f.erased_at)$$;
create function notification_exit_private.fences_for(u uuid,scope_n text,id_n uuid) returns jsonb language sql stable security definer set search_path='' as $$select
 coalesce(jsonb_agg(notification_exit_private.fence_json(f) order by f.kind collate "C",f.object_id),'[]') from notification_exit_private.fences f
 where f.owner_id=u and case scope_n when 'notification-trip-data/1' then f.trip_id=id_n
 when 'notification-device-data/1' then (f.kind='device' and f.object_id=id_n) or exists(select 1 from notification_exit_private.requests r where r.owner_id=u and r.request_id=f.request_id and r.scope=scope_n and id_n=any(r.object_ids))
 else f.request_id=id_n or f.kind='exit_request' and f.object_id=id_n end$$;
-- Trip roots (including device-associated Trips) precede all original rows.
create function notification_exit_private.lock_sources(u uuid,scope_n text,ids uuid[]) returns void language plpgsql security definer set search_path='' as $$declare trips_n uuid[];begin
 if scope_n='notification-trip-data/1' then trips_n:=ids;
 elsif scope_n='notification-device-data/1' then
 select coalesce(array_agg(distinct trip_id order by trip_id),'{}') into trips_n from (
 select r.trip_id from notification_private.reminders r join notification_private.outbox o on o.reminder_id=r.id where r.owner_id=u and o.device_id=any(ids)
 union select trip_id from notification_private.operations where owner_id=u and action in('register_device','revoke_device') and (receipt->>'resultId')::uuid=any(ids)) q;
 else
 select coalesce(array_agg(distinct id_n order by id_n),'{}') into trips_n from notification_exit_private.requests r cross join lateral unnest(r.object_ids) id_n where r.owner_id=u and r.request_id=any(ids) and r.scope='notification-trip-data/1';
 -- Progress only mutates its own pages; original devices/reminders are not touched.
 end if;
 perform 1 from public.trips where owner_id=u and id=any(trips_n) order by id for update;
 perform 1 from notification_private.devices where owner_id=u order by id for update;
 perform 1 from notification_private.reminders where owner_id=u and trip_id=any(trips_n) order by id for update;
 perform 1 from notification_private.watches where owner_id=u and trip_id=any(trips_n) order by id for update;
 perform 1 from notification_private.outbox o join notification_private.reminders r on r.id=o.reminder_id where r.owner_id=u and r.trip_id=any(trips_n) order by o.id for update of o;
 perform 1 from notification_private.attempts a join notification_private.outbox o on o.id=a.notification_id join notification_private.reminders r on r.id=o.reminder_id where r.owner_id=u and r.trip_id=any(trips_n) order by a.notification_id for update of a;
 perform 1 from notification_private.dismissals where owner_id=u and trip_id=any(trips_n) order by trip_id,source_kind,source_id,semantic_digest for update;
 perform 1 from notification_private.operations where owner_id=u and trip_id=any(trips_n) order by operation_id for update;
 perform 1 from public.travel_reminders where owner_id=u and trip_id=any(trips_n) order by id for update;
end$$;
create function notification_exit_private.sources(u uuid,scope_n text,ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare id_n uuid;items jsonb:='[]';internals jsonb:='[]';obj jsonb;f jsonb;t public.trips%rowtype;d notification_private.devices%rowtype;r notification_exit_private.requests%rowtype;
 name_n text;arr jsonb;count_n integer;raw_n jsonb;trip_meta jsonb;
begin
 foreach id_n in array ids loop
 f:=notification_exit_private.fences_for(u,scope_n,id_n);
 obj:=jsonb_build_object('objectId',id_n,'fences',f);count_n:=jsonb_array_length(f);raw_n:='[]';trip_meta:='[]';
 if scope_n='notification-trip-data/1' then
 select * into t from public.trips where id=id_n and owner_id=u;
 if t.id is null and jsonb_array_length(f)=0 then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 trip_meta:=jsonb_build_array(to_jsonb(t),(select to_jsonb(a) from public.trip_archives a where a.trip_id=id_n and a.owner_id=u),
 (select to_jsonb(a) from privacy_private.trip_deletions a where a.trip_id=id_n and a.owner_id=u));
 -- Reject corrupt cross-owner edges before projection, even when the joining
 -- owner qualifier would otherwise silently omit the row.
 if exists(select 1 from notification_private.outbox o join notification_private.reminders rr on rr.id=o.reminder_id left join notification_private.watches w on w.id=o.watch_id
 where rr.owner_id=u and rr.trip_id=id_n and o.watch_id is not null and (w.owner_id is distinct from u or w.trip_id is distinct from id_n))
 or exists(select 1 from notification_private.reminders rr left join public.travel_reminders ur on ur.id=rr.user_reminder_id where rr.owner_id=u and rr.trip_id=id_n and rr.user_reminder_id is not null and (ur.owner_id is distinct from u or ur.trip_id is distinct from id_n))
 then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 foreach name_n in array array['reminders','watches','dismissals','outbox','attempts','operations','travelReminders'] loop
 if name_n in('reminders','watches','operations','dismissals') then
 execute format('select coalesce(jsonb_agg(to_jsonb(q) order by %s),''[]'') from notification_private.%I q where owner_id=$1 and trip_id=$2',
 case name_n when 'operations' then 'operation_id' when 'dismissals' then 'source_kind collate "C",source_id,semantic_digest collate "C"' else 'id' end,name_n) into arr using u,id_n;
 elsif name_n='travelReminders' then select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') into arr from public.travel_reminders q where q.owner_id=u and q.trip_id=id_n;
 elsif name_n='outbox' then select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]') into arr from notification_private.outbox o join notification_private.reminders rr on rr.id=o.reminder_id where rr.owner_id=u and rr.trip_id=id_n;
 else select coalesce(jsonb_agg(to_jsonb(a) order by a.notification_id),'[]') into arr from notification_private.attempts a join notification_private.outbox o on o.id=a.notification_id join notification_private.reminders rr on rr.id=o.reminder_id where rr.owner_id=u and rr.trip_id=id_n;
 end if;
 raw_n:=raw_n||jsonb_build_array(arr);count_n:=count_n+jsonb_array_length(arr);
 select coalesce(jsonb_agg(notification_exit_private.row_json(value) order by ord),'[]') into arr from jsonb_array_elements(arr) with ordinality q(value,ord);
 obj:=obj||jsonb_build_object(name_n,arr);
 end loop;
 elsif scope_n='notification-device-data/1' then
 select * into d from notification_private.devices where id=id_n and owner_id=u;
 if d.id is null and not notification_exit_private.has_fence(u,'device',id_n) then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 if exists(select 1 from notification_private.outbox o join notification_private.reminders rr on rr.id=o.reminder_id where o.device_id=id_n and rr.owner_id<>u)
 then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]') into arr from notification_private.outbox o join notification_private.reminders rr on rr.id=o.reminder_id where rr.owner_id=u and o.device_id=id_n;
 raw_n:=jsonb_build_array(to_jsonb(d),arr);count_n:=count_n+jsonb_array_length(arr)+case when d.id is null then 0 else 1 end;
 select coalesce(jsonb_agg(notification_exit_private.row_json(value) order by ord),'[]') into arr from jsonb_array_elements(arr) with ordinality q(value,ord);
 obj:=obj||jsonb_build_object('device',case when d.id is null then null else notification_exit_private.row_json(to_jsonb(d)) end,'outbox',arr);
 select coalesce(jsonb_agg(to_jsonb(a) order by a.notification_id),'[]') into arr from notification_private.attempts a join notification_private.outbox o on o.id=a.notification_id join notification_private.reminders rr on rr.id=o.reminder_id where rr.owner_id=u and o.device_id=id_n;
 raw_n:=raw_n||jsonb_build_array(arr);count_n:=count_n+jsonb_array_length(arr);
 select coalesce(jsonb_agg(notification_exit_private.row_json(value) order by ord),'[]') into arr from jsonb_array_elements(arr) with ordinality q(value,ord);
 obj:=obj||jsonb_build_object('attempts',arr);
 select coalesce(jsonb_agg(to_jsonb(op) order by operation_id),'[]') into arr from notification_private.operations op where op.owner_id=u and op.action in('register_device','revoke_device') and (op.receipt->>'resultId')::uuid=id_n;
 -- These retained registration/revocation receipts are also actual source rows
 -- and each generates a permanent operation fence on device erasure.
 count_n:=count_n+jsonb_array_length(arr);raw_n:=raw_n||jsonb_build_array(arr);
 -- Include associated Trip head/archive/delete CAS metadata, without exporting it.
 select coalesce(jsonb_agg(jsonb_build_array(to_jsonb(tt),(select to_jsonb(aa) from public.trip_archives aa where aa.trip_id=tt.id and aa.owner_id=u),(select to_jsonb(dd) from privacy_private.trip_deletions dd where dd.trip_id=tt.id and dd.owner_id=u)) order by tt.id),'[]') into trip_meta from public.trips tt where tt.owner_id=u and tt.id in(select rr.trip_id from notification_private.reminders rr join notification_private.outbox o on o.reminder_id=rr.id where rr.owner_id=u and o.device_id=id_n);
 else
 select * into r from notification_exit_private.requests where owner_id=u and request_id=id_n for update;
 if not found then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 select coalesce(jsonb_agg(notification_exit_private.row_json(to_jsonb(p)) order by page_number),'[]') into arr from notification_exit_private.pages p where p.owner_id=u and p.request_id=id_n;
 count_n:=count_n+1+jsonb_array_length(arr);raw_n:=jsonb_build_array(to_jsonb(r)-array['drain_nonce'],arr);
 obj:=obj||jsonb_build_object('scope',r.scope,'objectIds',r.object_ids,'originalSessionId',r.session_id,'originalMobileEpoch',r.mobile_epoch,
 'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,'requestDigest',r.request_digest,'state',r.state,'capturedAt',r.captured_at,'expiresAt',r.expires_at,
 'committedAt',r.committed_at,'decidedAt',r.decided_at,'pages',r.pages,'rows',r.rows,'progressErased',r.progress_erased,'pageProgress',arr,'effects',r.effects,
 'drain',jsonb_build_object('state',case r.state when 'fenced' then 'pending' when 'erased' then case when r.scope='notification-exit-progress/1' then 'none' else 'complete' end else 'none' end,
 'generation',r.drain_generation,'waitMs',case when r.scope<>'notification-exit-progress/1' and r.committed_at is not null then 5000 else 0 end,'finishedAt',case when r.state='erased' and r.scope<>'notification-exit-progress/1' then r.decided_at else null end),
 'receipt',case r.state when 'erased' then notification_exit_private.receipt(r) else null end);
 end if;
 if scope_n<>'notification-exit-progress/1' and exists(select 1 from notification_private.outbox o join notification_private.reminders rr on rr.id=o.reminder_id left join notification_private.devices dd on dd.id=o.device_id where rr.owner_id=u and (scope_n='notification-trip-data/1' and rr.trip_id=id_n or scope_n='notification-device-data/1' and o.device_id=id_n) and o.device_id is not null and dd.owner_id is distinct from u) then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 if count_n>10000 then raise exception 'NOTIFICATION_DATA_CAPACITY';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(obj->'attempts','[]')) aa left join lateral (select oo from jsonb_array_elements(obj->'outbox') oo where oo->>'id'=aa->>'notification_id') q on true where q.oo is null or q.oo->>'device_id' is distinct from aa->>'device_id' or q.oo->>'device_revision' is distinct from aa->>'device_revision') then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 items:=items||jsonb_build_array(obj);internals:=internals||jsonb_build_array(jsonb_build_array(raw_n,f,trip_meta));
 end loop;
 return jsonb_build_object('items',items,'sourceDigest',notification_private.hash(jsonb_build_array(u,scope_n,ids,internals)));
end$$;
create function notification_exit_private.add_fence(u uuid,k text,id_n uuid,t uuid,req uuid,d text,ms_n bigint) returns integer language plpgsql security definer set search_path='' as $$declare n integer;begin
 insert into notification_exit_private.fences(owner_id,kind,object_id,trip_id,request_id,request_digest,erased_at) values(u,k,id_n,t,req,d,ms_n) on conflict do nothing;
 get diagnostics n=row_count;return n;
end$$;
create function notification_exit_private.erase_sources(r notification_exit_private.requests,items jsonb,at_ms bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare obj jsonb;x jsonb;name_n text;k text;id_n uuid;trip_n uuid;n integer;nf integer:=0;effects_n jsonb;
 outbox_ids uuid[]:='{}';attempt_ids uuid[]:='{}';device_ids uuid[]:='{}';ops uuid[]:='{}';provider_accepted integer:=0;provider_unknown integer:=0;grants integer:=0;
begin
 effects_n:='{"reminders":0,"watches":0,"dismissals":0,"outbox":0,"attempts":0,"operations":0,"travelReminders":0,"devices":0,"pageProgress":0,"fences":0,"providerAccepted":0,"providerUnknown":0,"activeGrants":0,"drainedThrough":0,"drainProof":null,"tripMutation":"none","businessResults":"not_modified","providerCopies":"not_recalled","deviceCopies":"not_erased"}';
 for obj in select value from jsonb_array_elements(items) loop
 trip_n:=case when r.scope='notification-trip-data/1' then (obj->>'objectId')::uuid else null end;
 if r.scope='notification-exit-progress/1' then
 nf:=nf+notification_exit_private.add_fence(r.owner_id,'exit_request',(obj->>'objectId')::uuid,null,r.request_id,r.request_digest,at_ms);
 else
 if r.scope='notification-device-data/1' then
 device_ids:=device_ids||(obj->>'objectId')::uuid;
 nf:=nf+notification_exit_private.add_fence(r.owner_id,'device',(obj->>'objectId')::uuid,null,r.request_id,r.request_digest,at_ms);
 for x in select to_jsonb(op) from notification_private.operations op where op.owner_id=r.owner_id and op.action in('register_device','revoke_device') and (op.receipt->>'resultId')::uuid=(obj->>'objectId')::uuid loop
 nf:=nf+notification_exit_private.add_fence(r.owner_id,'operation',(x->>'operation_id')::uuid,(x->>'trip_id')::uuid,r.request_id,x->>'request_digest',at_ms);end loop;
 end if;
 foreach name_n in array array['reminders','watches','dismissals','operations','travelReminders','outbox','attempts'] loop
 for x in select value from jsonb_array_elements(coalesce(obj->name_n,'[]')) loop
 if name_n in('reminders','travelReminders') then k:='reminder';id_n:=(x->>'id')::uuid;
 elsif name_n='watches' then k:='watch';id_n:=(x->>'id')::uuid;
 elsif name_n='dismissals' then k:='dismissal';id_n:=notification_exit_private.dismiss_id(r.owner_id,(x->>'trip_id')::uuid,x->>'source_kind',(x->>'source_id')::uuid,x->>'semantic_digest');
 elsif name_n='operations' then k:='operation';id_n:=(x->>'operation_id')::uuid;
 elsif name_n='outbox' then k:='outbox';id_n:=(x->>'id')::uuid;outbox_ids:=outbox_ids||id_n;
 else k:='attempt';id_n:=(x->>'attempt_id')::uuid;attempt_ids:=attempt_ids||(x->>'notification_id')::uuid;
 provider_accepted:=provider_accepted+case when x->>'state'='accepted' then 1 else 0 end;
 provider_unknown:=provider_unknown+case when x->>'state' in('unknown','attempting') then 1 else 0 end;
 grants:=grants+case when x->>'state'='attempting' and (x->>'lease_expires_at')::timestamptz>to_timestamp(at_ms::numeric/1000) then 1 else 0 end;
 end if;
 if r.scope='notification-device-data/1' and name_n in('outbox','attempts') then
 select rr.trip_id into trip_n from notification_private.reminders rr join notification_private.outbox o on o.reminder_id=rr.id where rr.owner_id=r.owner_id and o.id=case name_n when 'outbox' then (x->>'id')::uuid else (x->>'notification_id')::uuid end;
 end if;
 nf:=nf+notification_exit_private.add_fence(r.owner_id,k,id_n,trip_n,r.request_id,case name_n when 'operations' then x->>'request_digest' else null end,at_ms);
 if name_n='outbox' then
 nf:=nf+notification_exit_private.add_fence(r.owner_id,'outbox_parent',(x->>'reminder_id')::uuid,trip_n,r.request_id,null,at_ms);
 if x->'watch_id'<>'null'::jsonb then nf:=nf+notification_exit_private.add_fence(r.owner_id,'watch_semantic',notification_exit_private.pair_id(r.owner_id,(x->>'watch_id')::uuid,x->>'semantic_digest'),trip_n,r.request_id,null,at_ms);end if;
 end if;
 end loop;end loop;end if;
 end loop;
 nf:=nf+notification_exit_private.add_fence(r.owner_id,'exit_request',r.request_id,null,r.request_id,r.request_digest,at_ms);
 -- Sensitive effects occur only after permanent producer/dispatch fences.
 if r.scope='notification-exit-progress/1' then
 delete from notification_exit_private.pages where owner_id=r.owner_id and request_id=any(r.object_ids);get diagnostics n=row_count;
 effects_n:=jsonb_set(effects_n,'{pageProgress}',to_jsonb(n));
 update notification_exit_private.requests set progress_erased=true where owner_id=r.owner_id and request_id=any(r.object_ids);
 else
 delete from notification_private.attempts where notification_id=any(attempt_ids);get diagnostics n=row_count;effects_n:=jsonb_set(effects_n,'{attempts}',to_jsonb(n));
 delete from notification_private.outbox where id=any(outbox_ids);get diagnostics n=row_count;effects_n:=jsonb_set(effects_n,'{outbox}',to_jsonb(n));
 if r.scope='notification-device-data/1' then
 delete from notification_private.devices where owner_id=r.owner_id and id=any(device_ids);get diagnostics n=row_count;effects_n:=jsonb_set(effects_n,'{devices}',to_jsonb(n));
 else
 delete from notification_private.dismissals where owner_id=r.owner_id and trip_id=any(r.object_ids);get diagnostics n=row_count;effects_n:=jsonb_set(effects_n,'{dismissals}',to_jsonb(n));
 delete from notification_private.operations where owner_id=r.owner_id and trip_id=any(r.object_ids);get diagnostics n=row_count;effects_n:=jsonb_set(effects_n,'{operations}',to_jsonb(n));
 delete from notification_private.reminders where owner_id=r.owner_id and trip_id=any(r.object_ids);get diagnostics n=row_count;effects_n:=jsonb_set(effects_n,'{reminders}',to_jsonb(n));
 delete from notification_private.watches where owner_id=r.owner_id and trip_id=any(r.object_ids);get diagnostics n=row_count;effects_n:=jsonb_set(effects_n,'{watches}',to_jsonb(n));
 delete from public.travel_reminders where owner_id=r.owner_id and trip_id=any(r.object_ids);get diagnostics n=row_count;effects_n:=jsonb_set(effects_n,'{travelReminders}',to_jsonb(n));
 end if;end if;
 return effects_n||jsonb_build_object('fences',nf,'providerAccepted',provider_accepted,'providerUnknown',provider_unknown,'activeGrants',grants);
end$$;
create function notification_exit_private.inventory(u uuid,scope_n text) returns uuid[] language plpgsql stable security definer set search_path='' as $$declare ids uuid[];begin
 if scope_n='notification-trip-data/1' then
 select coalesce(array_agg(id_n order by id_n),'{}') into ids from (
 select trip_id id_n from notification_private.reminders where owner_id=u union select trip_id from notification_private.watches where owner_id=u
 union select trip_id from notification_private.dismissals where owner_id=u union select trip_id from notification_private.operations where owner_id=u
 union select trip_id from public.travel_reminders where owner_id=u union select trip_id from notification_exit_private.fences where owner_id=u and trip_id is not null) q;
 elsif scope_n='notification-device-data/1' then
 select coalesce(array_agg(id_n order by id_n),'{}') into ids from (select id id_n from notification_private.devices where owner_id=u union select object_id from notification_exit_private.fences where owner_id=u and kind='device') q;
 else select coalesce(array_agg(request_id order by request_id),'{}') into ids from notification_exit_private.requests where owner_id=u;end if;
 if cardinality(ids)>10000 then raise exception 'NOTIFICATION_DATA_CAPACITY';end if;return ids;
end$$;
create function notification_exit_private.request_guard() returns trigger language plpgsql set search_path='' as $$begin
 if to_jsonb(NEW)-array['request_digest','state','committed_at','decided_at','pages','rows','progress_erased','effects','drain_generation','drain_nonce'] is distinct from
 to_jsonb(OLD)-array['request_digest','state','committed_at','decided_at','pages','rows','progress_erased','effects','drain_generation','drain_nonce']
 or OLD.request_digest is not null and NEW.request_digest is distinct from OLD.request_digest
 or OLD.committed_at is not null and NEW.committed_at is distinct from OLD.committed_at
 or OLD.decided_at is not null and (to_jsonb(NEW)-'progress_erased') is distinct from (to_jsonb(OLD)-'progress_erased')
 or OLD.state='fenced' and NEW.state not in('fenced','erased') or OLD.state='erased' and NEW.state<>'erased'
 or OLD.progress_erased and not NEW.progress_erased or NEW.drain_generation<OLD.drain_generation
 then raise exception 'NOTIFICATION_DATA_REQUEST_IMMUTABLE';end if;return NEW;
end$$;
create trigger notification_exit_request_guard before update on notification_exit_private.requests for each row execute function notification_exit_private.request_guard();
create function public.privacy_notification_data_v1(p_action text,p_input_bytes text,p_expected_epoch bigint) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid:=auth.uid();s uuid;v jsonb;a text;scope_n text;req uuid;ids uuid[];r notification_exit_private.requests%rowtype;
 at_ms bigint;src jsonb;items jsonb;binding_n jsonb;result_n jsonb;dg text;cmd_dg text;cursor_n jsonb;after_n uuid;last_n uuid;more_n boolean;
 page_n jsonb;count_n integer;label_n text;state_n text;obj jsonb;t public.trips%rowtype;page_index integer;prior_page notification_exit_private.pages%rowtype;
begin
 if u is null or auth.role() is distinct from 'authenticated' or auth.jwt()->>'role' is distinct from 'authenticated'
 or auth.jwt()->>'is_anonymous' is distinct from 'false' or notification_private.uuid(auth.jwt()->'session_id') is not true then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 perform notification_exit_private.authorize(u,s,p_expected_epoch);
 perform identity_private.guard_mobile_rpc_v2();
 perform public.native_session_v2('session');
 if identity_private.mobile_access_v2() is not true then raise exception 'SESSION_REPLACED';end if;
 if not exists(select 1 from notification_exit_private.settings where singleton and enabled) then raise exception 'NOTIFICATION_DATA_DISABLED';end if;
 if p_action is null or p_input_bytes is null or octet_length(p_input_bytes)>(case p_action when 'recover' then 16384 else 8192 end) then raise exception 'INVALID_INPUT';end if;
 begin v:=p_input_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 a:=case p_action when 'export_start' then 'export' else p_action end;
 if notification_exit_private.input(v,a) is not true then raise exception 'INVALID_INPUT';end if;
 scope_n:=v->>'scope';at_ms:=notification_exit_private.ms(clock_timestamp());
 if a='list' then ids:=notification_exit_private.inventory(u,scope_n);
 else req:=(v->>'requestId')::uuid;select array_agg(x::uuid order by x) into ids from jsonb_array_elements_text(v->'objectIds') x;end if;
 perform notification_exit_private.lock_sources(u,scope_n,ids);
 if a<>'list' then
 select * into r from notification_exit_private.requests where owner_id=u and request_id=req for update;
 if found then
 if r.session_id<>s or r.mobile_epoch<>p_expected_epoch or r.scope<>scope_n or r.object_ids<>ids then raise exception 'NOTIFICATION_DATA_REQUEST_CONFLICT';end if;
 end if;
 end if;
 if a='recover' then
 cmd_dg:=notification_exit_private.digest(v->>'mutationBytes');
 if r.request_id is not null and r.state in('fenced','erased') then
 if r.request_digest is distinct from cmd_dg or r.preview_digest is distinct from ((v->>'mutationBytes')::jsonb->>'previewDigest') then raise exception 'NOTIFICATION_DATA_REQUEST_CONFLICT';end if;
 return notification_exit_private.receipt(r);end if;
 return jsonb_build_object('schemaVersion','notification-data/1','kind','unknown','scope',scope_n,'requestId',req,'objectIds',ids,'ownerId',u,'sessionId',s,'mobileEpoch',p_expected_epoch,'requestDigest',cmd_dg,'allUserDataCompleted',false);
 end if;
 cmd_dg:=notification_exit_private.digest(p_input_bytes);
 if a='erase' and r.state in('fenced','erased') then
 if r.request_digest is distinct from cmd_dg or r.preview_digest is distinct from v->>'previewDigest' then raise exception 'NOTIFICATION_DATA_REQUEST_CONFLICT';end if;return notification_exit_private.receipt(r);end if;
 src:=notification_exit_private.sources(u,scope_n,ids);items:=src->'items';dg:=src->>'sourceDigest';
 if a='list' then
 page_n:='[]';cursor_n:=nullif(v->'cursor','null'::jsonb);after_n:=(cursor_n->>'afterId')::uuid;
 if cursor_n is not null and (cursor_n->>'sourceDigest' is distinct from dg or not after_n=any(ids)) then raise exception 'NOTIFICATION_DATA_CURSOR_CONFLICT';end if;
 for obj in select value from jsonb_array_elements(items) where after_n is null or value->>'objectId'>after_n::text order by value->>'objectId' limit 20 loop
 label_n:=null;state_n:='active';
 if scope_n='notification-trip-data/1' then
 select * into t from public.trips where owner_id=u and id=(obj->>'objectId')::uuid;
 if t.id is null or exists(select 1 from privacy_private.trip_deletions where owner_id=u and trip_id=t.id) then state_n:='retained';
 else label_n:=case when reservation_private.utf16_length_v1(t.title)<=1000 then t.title else null end;
 state_n:=case when exists(select 1 from public.trip_archives where owner_id=u and trip_id=t.id) then 'archived' else 'active' end;end if;
 select sum(jsonb_array_length(obj->k)) into count_n from unnest(array['reminders','watches','dismissals','outbox','attempts','operations','travelReminders','fences']) k;
 elsif scope_n='notification-device-data/1' then
 state_n:=case when obj->'device'='null'::jsonb then 'erased' else 'active' end;
 count_n:=jsonb_array_length(obj->'outbox')+jsonb_array_length(obj->'attempts')+jsonb_array_length(obj->'fences')+case when obj->'device'='null'::jsonb then 0 else 1 end;
 else state_n:=case when obj->>'state'='erased' then 'erased' else 'retained' end;count_n:=1+jsonb_array_length(obj->'pageProgress')+jsonb_array_length(obj->'fences');end if;
 page_n:=page_n||jsonb_build_array(jsonb_build_object('objectId',obj->'objectId','label',label_n,'state',state_n,'rows',count_n));end loop;
 count_n:=jsonb_array_length(page_n);last_n:=(page_n->(count_n-1)->>'objectId')::uuid;more_n:=exists(select 1 from unnest(ids) id_n where id_n>last_n);
 result_n:=jsonb_build_object('schemaVersion','notification-data/1','kind','list','scope',scope_n,'ownerId',u,'sessionId',s,'mobileEpoch',p_expected_epoch,'sourceDigest',dg,'capturedAt',at_ms,'expiresAt',at_ms+30000,'items',page_n,'hasMore',more_n,'nextCursor',case when more_n then jsonb_build_object('sourceDigest',dg,'afterId',last_n) else null end,'allUserDataCompleted',false);
 else
 if a='preview' and r.request_id is null then
 r.request_id:=req;r.owner_id:=u;r.session_id:=s;r.mobile_epoch:=p_expected_epoch;r.scope:=scope_n;r.object_ids:=ids;r.source_digest:=dg;r.captured_at:=at_ms;r.expires_at:=at_ms+30000;
 r.preview_digest:=repeat('0',64);
 r.preview_digest:=notification_private.hash(jsonb_build_array(notification_exit_private.binding(r)-'previewDigest',items));
 insert into notification_exit_private.requests(request_id,owner_id,session_id,mobile_epoch,scope,object_ids,source_digest,preview_digest,captured_at,expires_at)
 values(req,u,s,p_expected_epoch,scope_n,ids,dg,r.preview_digest,at_ms,at_ms+30000) on conflict do nothing;
 select * into r from notification_exit_private.requests where request_id=req and owner_id=u for update;
 if not found then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 elsif r.request_id is null then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 if r.source_digest is distinct from dg then raise exception 'NOTIFICATION_DATA_SOURCE_CHANGED';end if;
 if notification_exit_private.ms(clock_timestamp())>=r.expires_at then raise exception 'NOTIFICATION_DATA_EXPIRED';end if;
 if a<>'preview' and r.preview_digest is distinct from v->>'previewDigest' then raise exception 'NOTIFICATION_DATA_REQUEST_CONFLICT';end if;
 if a in('page','proof') and dg is distinct from v->>'sourceDigest' then raise exception 'NOTIFICATION_DATA_SOURCE_CHANGED';end if;
 binding_n:=notification_exit_private.binding(r);
 -- Entire final compact bundle including proof must fit BEFORE any proof/erase.
 if octet_length(notification_private.canonical(binding_n||jsonb_build_object('kind','bundle','requestDigest',coalesce(r.request_digest,cmd_dg),'items',items,'proof',jsonb_build_object('coverage','complete','pages',ceil(cardinality(ids)::numeric/5)::integer,'rows',cardinality(ids)))))>1000000 then raise exception 'NOTIFICATION_DATA_CAPACITY';end if;
 if a='preview' then
 if r.state<>'previewed' then raise exception 'NOTIFICATION_DATA_REQUEST_CONFLICT';end if;
 result_n:=binding_n||jsonb_build_object('kind','preview','items',items,'requiresExplicitConfirmation',true);
 elsif a='export' then
 if r.state not in('previewed','exporting','exported') or r.progress_erased or r.request_digest is not null and r.request_digest<>cmd_dg then raise exception 'NOTIFICATION_DATA_REQUEST_CONFLICT';end if;
 if r.request_digest is null then update notification_exit_private.requests set request_digest=cmd_dg,state='exporting' where request_id=req returning * into r;end if;
 result_n:=binding_n||jsonb_build_object('kind','started','requestDigest',r.request_digest,'limits',jsonb_build_object('pageSize',5,'maxPages',4,'maxRows',20,'maxBytes',1000000));
 elsif a='page' then
 if r.state not in('exporting','exported') or r.progress_erased then raise exception 'NOTIFICATION_DATA_REQUEST_CONFLICT';end if;
 cursor_n:=nullif(v->'cursor','null'::jsonb);after_n:=(cursor_n->>'afterId')::uuid;
 if cursor_n is not null and (cursor_n->>'sourceDigest' is distinct from dg or not after_n=any(ids)) then raise exception 'NOTIFICATION_DATA_CURSOR_CONFLICT';end if;
 if after_n is null then page_index:=1;else
 page_index:=array_position(ids,after_n);
 if page_index%5<>0 or page_index>=cardinality(ids) then raise exception 'NOTIFICATION_DATA_CURSOR_CONFLICT';end if;page_index:=page_index/5+1;end if;
 select coalesce(jsonb_agg(value order by ord),'[]') into page_n from jsonb_array_elements(items) with ordinality q(value,ord) where ord>(page_index-1)*5 and ord<=page_index*5;
 count_n:=jsonb_array_length(page_n);last_n:=(page_n->(count_n-1)->>'objectId')::uuid;more_n:=page_index*5<cardinality(ids);
 select * into prior_page from notification_exit_private.pages where request_id=req and page_number=page_index;
 if prior_page.request_id is null then
 if r.pages<>page_index-1 then raise exception 'NOTIFICATION_DATA_CURSOR_CONFLICT';end if;
 insert into notification_exit_private.pages(request_id,owner_id,page_number,after_id,rows,request_digest,source_digest) values(req,u,page_index,last_n,count_n,r.request_digest,dg);
 update notification_exit_private.requests set pages=page_index,rows=rows+count_n where request_id=req returning * into r;
 elsif prior_page.after_id<>last_n or prior_page.rows<>count_n or prior_page.request_digest<>r.request_digest or prior_page.source_digest<>dg then raise exception 'NOTIFICATION_DATA_CURSOR_CONFLICT';end if;
 result_n:=binding_n||jsonb_build_object('kind','page','requestDigest',r.request_digest,'items',page_n,'hasMore',more_n,'nextCursor',case when more_n then jsonb_build_object('sourceDigest',dg,'afterId',last_n) else null end,'sectionComplete',not more_n,'pageNumber',page_index);
 elsif a='proof' then
 if r.state not in('exporting','exported') or r.progress_erased or r.rows<>cardinality(ids) or r.pages<>ceil(cardinality(ids)::numeric/5)::integer
 or (select count(*) from notification_exit_private.pages where request_id=req and owner_id=u)<>r.pages then raise exception 'NOTIFICATION_DATA_INCOMPLETE';end if;
 update notification_exit_private.requests set state='exported' where request_id=req;
 result_n:=binding_n||jsonb_build_object('kind','proof','requestDigest',r.request_digest,'coverage','complete','pages',r.pages,'rows',r.rows);
 elsif a='erase' then
 if r.state<>'previewed' or r.request_digest is not null or r.progress_erased then raise exception 'NOTIFICATION_DATA_REQUEST_CONFLICT';end if;
 -- One current timestamp, inside the original immutable TTL; no extension.
 at_ms:=notification_exit_private.ms(clock_timestamp());
 if at_ms<r.captured_at or at_ms>=r.expires_at then raise exception 'NOTIFICATION_DATA_EXPIRED';end if;
 r.request_digest:=cmd_dg;r.committed_at:=at_ms;r.effects:=notification_exit_private.erase_sources(r,items,at_ms);
 update notification_exit_private.requests set request_digest=cmd_dg,committed_at=at_ms,effects=r.effects,
 state=case scope_n when 'notification-exit-progress/1' then 'erased' else 'fenced' end,
 decided_at=case scope_n when 'notification-exit-progress/1' then at_ms else null end where request_id=req returning * into r;
 if notification_exit_private.ms(clock_timestamp())>=r.expires_at then raise exception 'NOTIFICATION_DATA_EXPIRED';end if;
 result_n:=notification_exit_private.receipt(r);
 else raise exception 'INVALID_INPUT';end if;
 end if;
 if octet_length(notification_private.canonical(result_n))>1000000 then raise exception 'NOTIFICATION_DATA_CAPACITY';end if;
 if a in('list','preview','export','page','proof') and notification_exit_private.ms(clock_timestamp())>=coalesce(r.expires_at,at_ms+30000) then raise exception 'NOTIFICATION_DATA_EXPIRED';end if;
 return result_n;
end$$;
-- Existing service credentials only. SQL trusts this authenticated controller's
-- monotonic wait; generation/nonce CAS binds it to a committed owner fence.
create function public.privacy_notification_data_drain_v1(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid;s uuid;e bigint;req uuid;ids uuid[];r notification_exit_private.requests%rowtype;k text[];at_ms bigint;proof jsonb;
begin
 perform notification_private.service();
 k:=array['ownerId','sessionId','mobileEpoch','requestId','scope','objectIds','requestDigest'];if p_action='finish' then k:=k||array['generation','nonce'];elsif p_action is distinct from 'begin' then raise exception 'INVALID_INPUT';end if;
 if notification_private.exact(p_input,k) is not true or notification_private.uuid(p_input->'ownerId') is not true or notification_private.uuid(p_input->'sessionId') is not true
 or (jsonb_typeof(p_input->'mobileEpoch')='number' and p_input->>'mobileEpoch' ~ '^[1-9][0-9]{0,15}$' and (p_input->>'mobileEpoch')::numeric<=9007199254740991) is not true then raise exception 'INVALID_INPUT';end if;
 u:=(p_input->>'ownerId')::uuid;s:=(p_input->>'sessionId')::uuid;e:=(p_input->>'mobileEpoch')::bigint;
 perform notification_exit_private.authorize(u,s,e);
 if not exists(select 1 from notification_exit_private.settings where singleton and enabled and drain_enabled) then raise exception 'NOTIFICATION_DATA_DISABLED';end if;
 if notification_private.uuid(p_input->'requestId') is not true or notification_exit_private.ids(p_input->'objectIds') is not true
 or (p_input->>'scope' in('notification-trip-data/1','notification-device-data/1')) is not true
 or (jsonb_typeof(p_input->'requestDigest')='string' and p_input->>'requestDigest' ~ '^[a-f0-9]{64}$') is not true then raise exception 'INVALID_INPUT';end if;
 req:=(p_input->>'requestId')::uuid;select array_agg(x::uuid order by x) into ids from jsonb_array_elements_text(p_input->'objectIds') x;
 perform notification_exit_private.lock_sources(u,p_input->>'scope',ids);
 select * into r from notification_exit_private.requests where owner_id=u and request_id=req for update;
 if not found then raise exception 'NOTIFICATION_DATA_SOURCE_UNAVAILABLE';end if;
 if r.session_id<>s or r.mobile_epoch<>e or r.scope<>p_input->>'scope' or r.object_ids<>ids or r.request_digest is distinct from p_input->>'requestDigest'
 or r.state not in('fenced','erased') or r.committed_at is null or r.effects is null
 or not notification_exit_private.has_fence(u,'exit_request',req) then raise exception 'NOTIFICATION_DATA_REQUEST_CONFLICT';end if;
 if p_action='finish' and ((jsonb_typeof(p_input->'generation')='number' and p_input->>'generation' ~ '^[1-9][0-9]{0,15}$') is not true or (jsonb_typeof(p_input->'nonce')='string' and p_input->>'nonce' ~ '^[a-f0-9]{64}$') is not true) then raise exception 'INVALID_INPUT';end if;
 if r.state='erased' then
 -- Lost ACK reads the immutable receipt. Finish still cannot replay another
 -- generation/nonce after terminal completion.
 if p_action='finish' and (p_input->>'generation' is distinct from r.drain_generation::text or p_input->>'nonce' is distinct from r.drain_nonce) then raise exception 'NOTIFICATION_DATA_DRAIN_CONFLICT';end if;
 return notification_exit_private.receipt(r);end if;
 if p_action='begin' then
 update notification_exit_private.requests set drain_generation=drain_generation+1,drain_nonce=encode(extensions.gen_random_bytes(32),'hex') where request_id=req returning * into r;
 return jsonb_build_object('kind','drain_challenge','protocol','monotonic-drain/1','ownerId',u,'sessionId',s,'mobileEpoch',e,'requestId',req,'requestDigest',r.request_digest,'generation',r.drain_generation,'nonce',r.drain_nonce,'waitMs',5000);
 end if;
 if (jsonb_typeof(p_input->'generation')='number' and p_input->>'generation' ~ '^[1-9][0-9]{0,15}$') is not true or
 (jsonb_typeof(p_input->'nonce')='string' and p_input->>'nonce' ~ '^[a-f0-9]{64}$') is not true then raise exception 'INVALID_INPUT';end if;
 if p_input->>'generation' is distinct from r.drain_generation::text or p_input->>'nonce' is distinct from r.drain_nonce then raise exception 'NOTIFICATION_DATA_DRAIN_CONFLICT';end if;
 at_ms:=notification_exit_private.ms(clock_timestamp());if at_ms<r.committed_at then raise exception 'NOTIFICATION_DATA_DRAIN_CONFLICT';end if;
 proof:=jsonb_build_object('protocol','monotonic-drain/1','generation',r.drain_generation,'waitMs',5000,'finishedAt',at_ms);
 update notification_exit_private.requests set state='erased',decided_at=at_ms,effects=effects||jsonb_build_object('drainedThrough',at_ms,'drainProof',proof) where request_id=req returning * into r;
 return notification_exit_private.receipt(r);
end$$;

-- Exact append-only seams. Fail migration on unexpected installed source; retain
-- signatures, security configuration and ACL through CREATE OR REPLACE.
do $seams$declare d text;old_n text;new_n text;begin
 d:=pg_get_functiondef('public.travel_reminders_v1(uuid,text,jsonb)'::regprocedure);
 old_n:=$old$  perform identity_private.guard_mobile_rpc_v2();$old$;new_n:=$new$  perform 1 from auth.users where id=u for key share;
  perform identity_private.guard_mobile_rpc_v2();
  perform 1 from auth.sessions where id=s and user_id=u for share;$new$;
 if length(d)-length(replace(d,old_n,''))<>length(old_n) then raise exception 'NOTIFICATION_DATA_SEAM_MISMATCH: public.travel_reminders_v1(uuid,text,jsonb)';end if;
 execute replace(d,old_n,new_n);
 d:=pg_get_functiondef('public.travel_reminders_v2(uuid,text,jsonb)'::regprocedure);
 old_n:=$old$ select * into prior from notification_private.operations where owner_id=u and operation_id=op for update;$old$;new_n:=$new$ if notification_exit_private.has_fence(u,'operation',op) or notification_exit_private.has_fence(u,'device',rid) or notification_exit_private.has_fence(u,'reminder',rid) or notification_exit_private.has_fence(u,'watch',rid) then raise exception 'NOTIFICATION_DATA_ERASED_ID';end if;
 select * into prior from notification_private.operations where owner_id=u and operation_id=op for update;$new$;
 if length(d)-length(replace(d,old_n,''))<>length(old_n) then raise exception 'NOTIFICATION_DATA_SEAM_MISMATCH: public.travel_reminders_v2(uuid,text,jsonb)';end if;
 execute replace(d,old_n,new_n);
 d:=pg_get_functiondef('public.dispatch_travel_notification_v2(uuid,text,jsonb)'::regprocedure);
 old_n:=$old$ if p_action not in('begin','finish','read')$old$;new_n:=$new$ if p_action='begin' then return jsonb_build_object('kind','blocked');end if;
 if p_action not in('begin_fenced','finish','read')$new$;
 if length(d)-length(replace(d,old_n,''))<>length(old_n) then raise exception 'NOTIFICATION_DATA_SEAM_MISMATCH: public.dispatch_travel_notification_v2(uuid,text,jsonb)';end if;
 execute replace(d,old_n,new_n);
 d:=pg_get_functiondef('public.dispatch_travel_notification_v2(uuid,text,jsonb)'::regprocedure);
 d:=replace(d,'p_action=''begin''','p_action=''begin_fenced''');d:=replace(d,'p_action<>''begin''','p_action<>''begin_fenced''');
 -- Restore the unique early old-action block (first occurrence only).
 old_n:='if p_action=''begin_fenced'' then return jsonb_build_object(''kind'',''blocked'');end if;';
 if position(old_n in d)=0 then raise exception 'NOTIFICATION_DATA_SEAM_MISMATCH: legacy begin';end if;
 d:=overlay(d placing replace(old_n,'begin_fenced','begin') from position(old_n in d) for length(old_n));execute d;
 d:=pg_get_functiondef('public.dispatch_travel_notification_v2(uuid,text,jsonb)'::regprocedure);
 old_n:=$old$ select * into o from notification_private.outbox where id=p_notification;$old$;new_n:=$new$ select * into o from notification_private.outbox where id=p_notification;
 if r.id is null or o.id is null or notification_exit_private.has_fence(r.owner_id,'reminder',r.id) or notification_exit_private.has_fence(r.owner_id,'operation',r.operation_id) or notification_exit_private.has_fence(r.owner_id,'outbox',p_notification) or notification_exit_private.has_fence(r.owner_id,'outbox_parent',r.id) or notification_exit_private.has_fence(r.owner_id,'attempt',aid) then return jsonb_build_object('kind','blocked');end if;$new$;
 if length(d)-length(replace(d,old_n,''))<>length(old_n) then raise exception 'NOTIFICATION_DATA_SEAM_MISMATCH: public.dispatch_travel_notification_v2(uuid,text,jsonb)';end if;
 execute replace(d,old_n,new_n);
 d:=pg_get_functiondef('public.dispatch_travel_notification_v2(uuid,text,jsonb)'::regprocedure);
 old_n:=$old$ ts:=clock_timestamp();$old$;new_n:=$new$ if notification_exit_private.has_fence(r.owner_id,'device',d.id) then return jsonb_build_object('kind','blocked');end if;
 ts:=clock_timestamp();
 if floor(extract(epoch from least(ts+interval '5 seconds',r.expires_at)-ts)*1000) not between 1 and 5000 then return jsonb_build_object('kind','blocked');end if;$new$;
 if length(d)-length(replace(d,old_n,''))<>length(old_n) then raise exception 'NOTIFICATION_DATA_SEAM_MISMATCH: public.dispatch_travel_notification_v2(uuid,text,jsonb)';end if;
 execute replace(d,old_n,new_n);
 d:=pg_get_functiondef('public.dispatch_travel_notification_v2(uuid,text,jsonb)'::regprocedure);
 old_n:=$old$'authorizedAt',notification_private.stamp(ts),'leaseExpiresAt'$old$;new_n:=$new$'leaseBudgetMs',floor(extract(epoch from least(ts+interval '5 seconds',r.expires_at)-ts)*1000)::integer,'authorizedAt',notification_private.stamp(ts),'leaseExpiresAt'$new$;
 if length(d)-length(replace(d,old_n,''))<>length(old_n) then raise exception 'NOTIFICATION_DATA_SEAM_MISMATCH: public.dispatch_travel_notification_v2(uuid,text,jsonb)';end if;
 execute replace(d,old_n,new_n);
 d:=pg_get_functiondef('public.poll_travel_notifications_v2(integer)'::regprocedure);
 old_n:=$old$     if not exists(select 1 from notification_private.outbox where watch_id=w.id and semantic_digest=b->'source'->>'contentDigest') and ex>clock_timestamp() then$old$;new_n:=$new$     if not notification_exit_private.has_fence(w.owner_id,'watch_semantic',notification_exit_private.pair_id(w.owner_id,w.id,b->'source'->>'contentDigest')) and not exists(select 1 from notification_private.outbox where watch_id=w.id and semantic_digest=b->'source'->>'contentDigest') and ex>clock_timestamp() then$new$;
 if length(d)-length(replace(d,old_n,''))<>length(old_n) then raise exception 'NOTIFICATION_DATA_SEAM_MISMATCH: public.poll_travel_notifications_v2(integer)';end if;
 execute replace(d,old_n,new_n);
 d:=pg_get_functiondef('public.poll_travel_notifications_v2(integer)'::regprocedure);
 old_n:=$old$ if o.state<>'scheduled' then$old$;new_n:=$new$ if r.id is null or o.id is null or notification_exit_private.has_fence(r.owner_id,'outbox',o.id) or notification_exit_private.has_fence(r.owner_id,'outbox_parent',r.id) then return jsonb_build_object('kind','idle');end if;
 if o.state<>'scheduled' then$new$;
 if length(d)-length(replace(d,old_n,''))<>length(old_n) then raise exception 'NOTIFICATION_DATA_SEAM_MISMATCH: public.poll_travel_notifications_v2(integer)';end if;
 execute replace(d,old_n,new_n);
end$seams$;
revoke all on all functions in schema notification_exit_private from public,anon,authenticated,service_role;
revoke all on function public.privacy_notification_data_v1(text,text,bigint),public.privacy_notification_data_drain_v1(text,jsonb) from public,anon,authenticated,service_role;
-- No original RPC grant/role/settings change; target activation remains UNRUN.
