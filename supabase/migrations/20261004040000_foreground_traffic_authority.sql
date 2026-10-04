-- #366. Empty installed authority, no grants/roles/seeds/provider activation.
create schema traffic_private;
revoke all on schema traffic_private from public,anon,authenticated,service_role;
create table traffic_private.producers_v1(
 role_oid oid primary key,account_scope text not null,enabled boolean not null default false,
 revoked_at timestamptz,expires_at timestamptz not null,
 check(account_scope ~ '^[a-z][a-z0-9_-]{0,127}$')
);
create table traffic_private.policies_v1(
 id uuid primary key,revision bigint not null check(revision>0),account_scope text not null,
 source_version text not null,mode text not null check(mode in('walking','transit','driving')),
 policy jsonb not null,retention_seconds integer not null check(retention_seconds between 1 and 300),
 source_expires_at timestamptz not null,enabled boolean not null default false,revoked_at timestamptz,
 check(account_scope ~ '^[a-z][a-z0-9_-]{0,127}$' and source_version ~ '^[a-z][a-z0-9_-]{0,127}$')
);
create unique index traffic_one_policy_v1 on traffic_private.policies_v1(account_scope,mode) where enabled and revoked_at is null;
create table traffic_private.scopes_v1(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,trip_id uuid not null references public.trips(id) on delete cascade,
 day_id text not null,item_id text not null,epoch bigint not null default 0,stopped boolean not null default false,
 window_started_at timestamptz not null default clock_timestamp(),comparisons integer not null default 0,
 last_begin_at timestamptz,unknown_until timestamptz,
 unique(owner_id,session_id,trip_id,day_id,item_id),check(epoch>=0 and comparisons between 0 and 3)
);
create table traffic_private.dispatches_v1(
 id uuid primary key default gen_random_uuid(),operation_id uuid not null,scope_id uuid not null references traffic_private.scopes_v1(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,session_id uuid not null references auth.sessions(id) on delete cascade,
 native_epoch bigint,trip_id uuid not null references public.trips(id) on delete cascade,
 origin_reference uuid not null references public.trip_place_references(id) on delete cascade,
 destination_reference uuid not null references public.trip_place_references(id) on delete cascade,
 scope jsonb not null,endpoints jsonb not null,stop_epoch bigint not null,policy_id uuid not null references traffic_private.policies_v1(id) on delete cascade,
 policy_revision bigint not null,policy_fingerprint text not null,source_version text not null,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 state text not null default 'begun' check(state in('begun','dispatched','complete','unknown')),
 request_count integer not null default 0 check(request_count between 0 and 5),
 unique(owner_id,operation_id)
);
create table traffic_private.receipts_v1(
 id uuid primary key default gen_random_uuid(),dispatch_id uuid unique not null references traffic_private.dispatches_v1(id) on delete cascade,
 fetched_at timestamptz not null,expires_at timestamptz not null,selected jsonb not null,alternatives jsonb not null,
 previous_receipt_id uuid,change_kind text not null check(change_kind in('unchanged','route_estimate_changed','route_condition_changed')),
 duration_delta_seconds integer,check(jsonb_array_length(alternatives)<=2)
);
create index traffic_dispatch_scope_v1 on traffic_private.dispatches_v1(scope_id,created_at);
create index traffic_dispatch_expiry_v1 on traffic_private.dispatches_v1(expires_at,id);
create index traffic_receipt_expiry_v1 on traffic_private.receipts_v1(expires_at,id);
do $$declare n text;begin foreach n in array array['producers_v1','policies_v1','scopes_v1','dispatches_v1','receipts_v1'] loop
 execute format('alter table traffic_private.%I enable row level security',n);
 execute format('revoke all on traffic_private.%I from public,anon,authenticated,service_role',n);end loop;end $$;

create function traffic_private.exact_v1(v jsonb,keys text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and (select array_agg(k order by k) from jsonb_object_keys(v) k)=(select array_agg(k order by k) from unnest(keys) k),false)
$$;
create function traffic_private.fingerprint_v1(v jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(v::text,'UTF8')),'hex')$$;
create function traffic_private.actor_v1(p_actor jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;s uuid;a identity_private.mobile_accounts%rowtype;ep bigint;expected bigint;
begin
 if p_actor is null then u:=auth.uid();s:=(auth.jwt()->>'session_id')::uuid;
 else
  if traffic_private.producer_v1() is null or not traffic_private.exact_v1(p_actor,array['subject','sessionId','mobileEpoch']) then return null;end if;
  u:=(p_actor->>'subject')::uuid;s:=(p_actor->>'sessionId')::uuid;
  if p_actor->'mobileEpoch' is distinct from 'null'::jsonb and (jsonb_typeof(p_actor->'mobileEpoch') is distinct from 'number' or p_actor->>'mobileEpoch' !~ '^[1-9][0-9]{0,15}$') then return null;end if;expected:=(p_actor->>'mobileEpoch')::bigint;
 end if;
 if u is null or s is null then return null;end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then return null;end if;
 perform 1 from auth.sessions where id=s and user_id=u for share nowait;if not found then return null;end if;
 select * into a from identity_private.mobile_accounts where owner_id=u for update nowait;
 if exists(select 1 from identity_private.mobile_attempts where session_id=s) or exists(select 1 from identity_private.mobile_login_proofs where session_id=s) then
  if a.session_id is distinct from s or a.epoch is null or a.epoch not between 1 and 9007199254740991 then return null;end if;ep:=a.epoch;
 end if;
 if p_actor is not null and ep is distinct from expected then return null;end if;
 return jsonb_build_object('ownerId',u,'sessionId',s,'nativeEpoch',ep);
exception when lock_not_available or invalid_text_representation then return null;end $$;
create function traffic_private.producer_v1() returns text language plpgsql security definer set search_path='' as $$
declare r text:=coalesce(nullif(current_setting('role',true),'none'),session_user::text);p traffic_private.producers_v1%rowtype;
begin
 if r in('anon','authenticated','authenticator') then return null;end if;
 select p1.* into p from traffic_private.producers_v1 p1 join pg_roles r1 on r1.oid=p1.role_oid where r1.rolname=r for share of p1 nowait;
 if not found or not p.enabled or p.revoked_at is not null or p.expires_at<=clock_timestamp() then return null;end if;return p.account_scope;
exception when lock_not_available then return null;end $$;
create function traffic_private.scope_v1(v jsonb,p_actor jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;t public.trips%rowtype;sc traffic_private.scopes_v1%rowtype;item jsonb;
begin
 if not traffic_private.exact_v1(v,array['tripId','expectedHeadVersion','dayId','itemId','originPlaceReferenceId','destinationPlaceReferenceId','mode','departure'])
 or v->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or v->>'itemId' !~ '^[A-Za-z0-9_-]{1,64}$'
 or v->>'mode' not in('walking','transit','driving') or v->>'departure' is distinct from 'now'
 or jsonb_typeof(v->'expectedHeadVersion') is distinct from 'number' or v->>'expectedHeadVersion' !~ '^(0|[1-9][0-9]{0,9})$'
 or v->>'originPlaceReferenceId' is null or v->>'destinationPlaceReferenceId' is null then return null;end if;
 a:=traffic_private.actor_v1(p_actor);if a is null then return null;end if;
 select * into t from public.trips where id=(v->>'tripId')::uuid and owner_id=(a->>'ownerId')::uuid for share nowait;
 if not found or t.head_version is distinct from (v->>'expectedHeadVersion')::integer or exists(select 1 from public.trip_archives where trip_id=t.id) then return null;end if;
 item:=trip_support_private.item(public.trip_content_snapshot(t.id,t.title),v->>'dayId',v->>'itemId');if item is null then return null;end if;
 if not pg_try_advisory_xact_lock(hashtextextended('traffic-scope:'||jsonb_build_array(a->>'ownerId',a->>'sessionId',t.id,v->>'dayId',v->>'itemId')::text,0)) then return null;end if;
 insert into traffic_private.scopes_v1(owner_id,session_id,trip_id,day_id,item_id) values((a->>'ownerId')::uuid,(a->>'sessionId')::uuid,t.id,v->>'dayId',v->>'itemId') on conflict do nothing;
 select * into sc from traffic_private.scopes_v1 where owner_id=(a->>'ownerId')::uuid and session_id=(a->>'sessionId')::uuid and trip_id=t.id and day_id=v->>'dayId' and item_id=v->>'itemId' for update nowait;
 return a||jsonb_build_object('scopeId',sc.id,'stopEpoch',sc.epoch,'stopped',sc.stopped,'item',item);
exception when lock_not_available or invalid_text_representation or numeric_value_out_of_range then return null;end $$;
create function traffic_private.endpoints_v1(v jsonb,p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare ref public.trip_place_references%rowtype;c public.canonical_pois%rowtype;m public.provider_poi_mappings%rowtype;ref_id uuid;answer jsonb:='{}';side text;
begin
 foreach side in array array['origin','destination'] loop
  ref_id:=(v->>(side||'PlaceReferenceId'))::uuid;
  select * into ref from public.trip_place_references where id=ref_id and trip_id=(v->>'tripId')::uuid and owner_id=p_owner for share nowait;
  if not found or ref.reference_kind<>'canonical' or ref.freshness<>'current' then return null;end if;
  select * into c from public.canonical_pois where id=ref.canonical_poi_id for share nowait;if not found then return null;end if;
  select * into m from public.provider_poi_mappings where canonical_poi_id=c.id and provider='amap' for share nowait;if not found then return null;end if;
  answer:=answer||jsonb_build_object(side,jsonb_build_object('referenceId',ref_id,'canonicalPoiId',c.id,'mappingId',m.id,'canonicalFingerprint',traffic_private.fingerprint_v1(to_jsonb(c)),'mappingFingerprint',traffic_private.fingerprint_v1(to_jsonb(m)),'providerPoiId',m.provider_poi_id));
 end loop;return answer;
exception when lock_not_available or invalid_text_representation then return null;end $$;
-- Mirrors PolicyReceiptV1 currentness/actions/purposes/retention; no legal facts generated.
create function traffic_private.policy_v1(p_id uuid,p_revision bigint,p_mode text,p_tmc boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare p traffic_private.policies_v1%rowtype;v jsonb;field text;action text;purpose text;deadline timestamptz;n timestamptz:=clock_timestamp();account text;
begin
 select * into p from traffic_private.policies_v1 where id=p_id for share nowait;
 if not found or p.revision is distinct from p_revision or p.mode is distinct from p_mode or not p.enabled or p.revoked_at is not null then return null;end if;
 v:=p.policy;
 if not traffic_private.exact_v1(v,array['policyId','sourceId','licenceVersion','dataClass','grants','effectiveAt','expiresAt','termsRecheckAt','trialEndsAt','derivative','shareAlike','combination','redistribution','training','retention'])
 or v->>'dataClass' is distinct from 'c0_public' or v->>'retention' is distinct from 'durable' or v->>'derivative' is distinct from 'allowed'
 or v->>'combination' not in('allowed','denied') or v->>'redistribution' not in('allowed','denied') or v->>'training' not in('allowed','denied') or v->>'shareAlike' not in('required','not_required')
 or v->>'policyId' !~ '^[a-z][a-z0-9_-]{0,127}$' or v->>'sourceId' !~ '^[a-z][a-z0-9_-]{0,127}$' or v->>'licenceVersion' !~ '^[a-z][a-z0-9_-]{0,127}$'
 or jsonb_typeof(v->'grants') is distinct from 'array' or jsonb_array_length(v->'grants')>100 or (v->>'effectiveAt')::timestamptz>n then return null;end if;
 deadline:=least(p.source_expires_at,(v->>'expiresAt')::timestamptz,(v->>'termsRecheckAt')::timestamptz,coalesce((v->>'trialEndsAt')::timestamptz,'infinity'::timestamptz));
 if deadline is null or deadline<=n or v->>'expiresAt' is null or v->>'termsRecheckAt' is null or v->>'effectiveAt' is null then return null;end if;
 foreach field in array array['duration','distance','derived_change','receipt_metadata']||case when p_tmc then array['tmc'] else array[]::text[] end loop
  foreach action in array array['display','cache','persist'] loop
   purpose:=case when action='persist' then 'trip_planning' else 'explore' end;
   if not exists(select 1 from jsonb_array_elements(v->'grants') g where traffic_private.exact_v1(g,array['field','region','action','purpose']) and g->>'field'=field and g->>'region'='cn' and g->>'action'=action and g->>'purpose'=purpose) then return null;end if;
  end loop;
 end loop;
 return jsonb_build_object('policyId',p.id,'policyRevision',p.revision,'policy',v,'sourceVersion',p.source_version,'accountScope',p.account_scope,'deadline',least(deadline,n+p.retention_seconds*interval '1 second'),'fingerprint',traffic_private.fingerprint_v1(to_jsonb(p)));
exception when lock_not_available or invalid_text_representation or datetime_field_overflow then return null;end $$;
create function public.foreground_traffic_policy_v1(p_scope jsonb,p_actor jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare account text;ctx jsonb;p traffic_private.policies_v1%rowtype;qualified jsonb;endpoints jsonb;
begin
 account:=traffic_private.producer_v1();if account is null then return jsonb_build_object('kind','unavailable');end if;
 ctx:=traffic_private.scope_v1(p_scope,p_actor);if ctx is null then return jsonb_build_object('kind','unavailable');end if;
 select * into p from traffic_private.policies_v1 where account_scope=account and mode=p_scope->>'mode' and enabled and revoked_at is null;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 qualified:=traffic_private.policy_v1(p.id,p.revision,p.mode,false);if qualified is null then return jsonb_build_object('kind','unavailable');end if;
 endpoints:=traffic_private.endpoints_v1(p_scope,(ctx->>'ownerId')::uuid);if endpoints is null then return jsonb_build_object('kind','unavailable');end if;
 return (qualified-'deadline'-'fingerprint')||jsonb_build_object('kind','policy','stopEpoch',ctx->'stopEpoch','stopped',ctx->'stopped','endpoints',endpoints);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;
create function traffic_private.dispatch_current_v1(p_id uuid,p_actor jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare d traffic_private.dispatches_v1%rowtype;ctx jsonb;p jsonb;e jsonb;a jsonb;
begin
 a:=traffic_private.actor_v1(p_actor);if a is null then return null;end if;
 select * into d from traffic_private.dispatches_v1 where id=p_id and owner_id=(a->>'ownerId')::uuid;if not found then return null;end if;
 ctx:=traffic_private.scope_v1(d.scope,p_actor);if ctx is null or ctx->>'sessionId' is distinct from d.session_id::text or ctx->>'nativeEpoch' is distinct from d.native_epoch::text or ctx->'stopped'='true'::jsonb or (ctx->>'stopEpoch')::bigint<>d.stop_epoch then return null;end if;
 p:=traffic_private.policy_v1(d.policy_id,d.policy_revision,d.scope->>'mode',false);
 if p is null or p->>'fingerprint'<>d.policy_fingerprint or p->>'sourceVersion'<>d.source_version then return null;end if;
 e:=traffic_private.endpoints_v1(d.scope,(ctx->>'ownerId')::uuid);if e is null or e is distinct from d.endpoints then return null;end if;
 select * into d from traffic_private.dispatches_v1 where id=p_id for update nowait;if not found or d.expires_at<=clock_timestamp() then return null;end if;
 return ctx||jsonb_build_object('dispatch',to_jsonb(d),'policy',p);
exception when lock_not_available then return null;end $$;
create function traffic_private.valid_summary_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;
begin
 if not traffic_private.exact_v1(v,array['mode','durationSeconds','distanceMeters','tmc']) or v->>'mode' not in('walking','transit','driving') then return false;end if;
 foreach k in array array['durationSeconds','distanceMeters'] loop
  if jsonb_typeof(v->k) is distinct from 'number' or v->>k !~ '^(0|[1-9][0-9]{0,8})$' or (v->>k)::bigint>100000000 then return false;end if;
 end loop;
 if v->'tmc' is distinct from 'null'::jsonb then
  if v->>'mode'<>'driving' or not traffic_private.exact_v1(v->'tmc',array['unknown','smooth','slow','congested','severely_congested']) then return false;end if;
  foreach k in array array['unknown','smooth','slow','congested','severely_congested'] loop
   if jsonb_typeof(v->'tmc'->k) is distinct from 'number' or (v->'tmc'->>k)::numeric not between 0 and 100000000 then return false;end if;
  end loop;
 end if;return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;end $$;
create function traffic_private.quota_v1(p_actor jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;u uuid;n timestamptz:=clock_timestamp();minute_at timestamptz;day_at timestamptz;mh integer;dh integer;
begin
 a:=traffic_private.actor_v1(p_actor);if a is null then return jsonb_build_object('allowed',false);end if;u:=(a->>'ownerId')::uuid;
 minute_at:=to_timestamp(floor(extract(epoch from n)/60)*60);day_at:=to_timestamp(floor(extract(epoch from n)/86400)*86400);
 insert into place_quota_private.usage(actor_id,bucket,window_seconds,window_start,hits) values(u,'places',60,minute_at,0),(u,'places',86400,day_at,0) on conflict do nothing;
 select case when window_start=minute_at then hits else 0 end into mh from place_quota_private.usage where actor_id=u and bucket='places' and window_seconds=60 for update nowait;
 select case when window_start=day_at then hits else 0 end into dh from place_quota_private.usage where actor_id=u and bucket='places' and window_seconds=86400 for update nowait;
 if mh>=30 or dh>=500 then return jsonb_build_object('allowed',false);end if;
 update place_quota_private.usage set window_start=minute_at,hits=mh+1 where actor_id=u and bucket='places' and window_seconds=60;
 update place_quota_private.usage set window_start=day_at,hits=dh+1 where actor_id=u and bucket='places' and window_seconds=86400;
 return jsonb_build_object('allowed',true);
end $$;
create function public.foreground_traffic_producer_v1(p_action text,p_input jsonb,p_actor jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare account text;ctx jsonb;p jsonb;e jsonb;sc traffic_private.scopes_v1%rowtype;d traffic_private.dispatches_v1%rowtype;r traffic_private.receipts_v1%rowtype;prior traffic_private.receipts_v1%rowtype;prior_d traffic_private.dispatches_v1%rowtype;quota jsonb;n timestamptz;fetched timestamptz;summary jsonb;change text:='unchanged';delta integer;previous uuid;valid_tmc boolean;
begin
 account:=traffic_private.producer_v1();if account is null or pg_column_size(p_input)>16384 then return jsonb_build_object('kind','unavailable');end if;
 if p_action='begin' then
  if not traffic_private.exact_v1(p_input,array['operationId','scope','policyId','policyRevision','stopEpoch','operation','endpoints']) or p_input->>'operation' not in('check','refresh') then return jsonb_build_object('kind','unavailable');end if;
  ctx:=traffic_private.scope_v1(p_input->'scope',p_actor);if ctx is null or ctx->'stopEpoch' is distinct from p_input->'stopEpoch' or jsonb_typeof(p_input->'policyRevision') is distinct from 'number' or p_input->>'policyRevision' !~ '^[1-9][0-9]{0,15}$' then return jsonb_build_object('kind','unavailable');end if;
  p:=traffic_private.policy_v1((p_input->>'policyId')::uuid,(p_input->>'policyRevision')::bigint,p_input->'scope'->>'mode',false);
  if p is null or p->>'accountScope'<>account then return jsonb_build_object('kind','unavailable');end if;
  e:=traffic_private.endpoints_v1(p_input->'scope',(ctx->>'ownerId')::uuid);if e is null or e is distinct from p_input->'endpoints' then return jsonb_build_object('kind','unavailable');end if;
  select * into d from traffic_private.dispatches_v1 where owner_id=(ctx->>'ownerId')::uuid and operation_id=(p_input->>'operationId')::uuid for update nowait;
  if found then return jsonb_build_object('kind','unknown');end if;
  select * into sc from traffic_private.scopes_v1 where id=(ctx->>'scopeId')::uuid;
  n:=clock_timestamp();
  if sc.stopped and p_input->>'operation'<>'check' then return jsonb_build_object('kind','unavailable');end if;
  if sc.unknown_until>n or exists(select 1 from traffic_private.dispatches_v1 where scope_id=sc.id and state in('begun','dispatched') and expires_at>n) then return jsonb_build_object('kind','unknown');end if;
  if sc.window_started_at+interval '5 minutes'<=n then sc.window_started_at:=n;sc.comparisons:=0;end if;
  if sc.comparisons>=3 or sc.last_begin_at+interval '60 seconds'>n then return jsonb_build_object('kind','limited');end if;
  update traffic_private.scopes_v1 set stopped=false,window_started_at=sc.window_started_at,comparisons=sc.comparisons+1,last_begin_at=n,unknown_until=null where id=sc.id;
  insert into traffic_private.dispatches_v1(operation_id,scope_id,owner_id,session_id,native_epoch,trip_id,origin_reference,destination_reference,scope,endpoints,stop_epoch,policy_id,policy_revision,policy_fingerprint,source_version,expires_at)
  values((p_input->>'operationId')::uuid,sc.id,(ctx->>'ownerId')::uuid,(ctx->>'sessionId')::uuid,(ctx->>'nativeEpoch')::bigint,(p_input->'scope'->>'tripId')::uuid,(p_input->'scope'->>'originPlaceReferenceId')::uuid,(p_input->'scope'->>'destinationPlaceReferenceId')::uuid,p_input->'scope',e,sc.epoch,(p->>'policyId')::uuid,(p->>'policyRevision')::bigint,p->>'fingerprint',p->>'sourceVersion',least((p->>'deadline')::timestamptz,n+interval '300 seconds')) returning * into d;
  return jsonb_build_object('kind','dispatch','dispatchId',d.id,'stopEpoch',d.stop_epoch);
 elsif p_action not in('request','complete','unknown') or not traffic_private.exact_v1(p_input,case p_action when 'request' then array['dispatchId','requestIndex'] when 'complete' then array['dispatchId','fetchedAt','selected','alternatives','previousReceiptId'] else array['dispatchId'] end) then return jsonb_build_object('kind','unavailable');end if;
 ctx:=traffic_private.dispatch_current_v1((p_input->>'dispatchId')::uuid,p_actor);if ctx is null or ctx->'policy'->>'accountScope'<>account then return jsonb_build_object('kind','unavailable');end if;
 select * into d from traffic_private.dispatches_v1 where id=(p_input->>'dispatchId')::uuid;
 if d.state in('complete','unknown') then return jsonb_build_object('kind','unknown');end if;
 if p_action='request' then
  if jsonb_typeof(p_input->'requestIndex') is distinct from 'number' or p_input->>'requestIndex' !~ '^[1-5]$' or (p_input->>'requestIndex')::integer<>d.request_count+1 then return jsonb_build_object('kind','unavailable');end if;
  quota:=traffic_private.quota_v1(p_actor);if quota->'allowed' is distinct from 'true'::jsonb then return jsonb_build_object('kind','limited');end if;
  update traffic_private.dispatches_v1 set request_count=request_count+1,state='dispatched' where id=d.id;
  return jsonb_build_object('kind','request','dispatchId',d.id,'requestIndex',d.request_count+1);
 elsif p_action='unknown' then
  update traffic_private.dispatches_v1 set state='unknown' where id=d.id;
  update traffic_private.scopes_v1 set unknown_until=window_started_at+interval '5 minutes' where id=d.scope_id;
  delete from traffic_private.receipts_v1 where dispatch_id=d.id;return jsonb_build_object('kind','unknown');
 end if;
 if d.state<>'dispatched' or d.request_count<1 or not traffic_private.valid_summary_v1(p_input->'selected') or p_input->'selected'->>'mode' is distinct from d.scope->>'mode'
 or jsonb_typeof(p_input->'alternatives') is distinct from 'array' or jsonb_array_length(p_input->'alternatives')>2 then return jsonb_build_object('kind','unavailable');end if;
 for summary in select * from jsonb_array_elements(p_input->'alternatives') loop
  if not traffic_private.valid_summary_v1(summary) or summary->>'mode'<>d.scope->>'mode' then return jsonb_build_object('kind','unavailable');end if;
 end loop;
 if p_input->'selected'->'tmc' is distinct from 'null'::jsonb or exists(select 1 from jsonb_array_elements(p_input->'alternatives') x where x->'tmc' is distinct from 'null'::jsonb) then
  if traffic_private.policy_v1(d.policy_id,d.policy_revision,d.scope->>'mode',true) is null then return jsonb_build_object('kind','unavailable');end if;
 end if;
 fetched:=(p_input->>'fetchedAt')::timestamptz;n:=clock_timestamp();if fetched is null or fetched<d.created_at or fetched>n or d.expires_at<=n then return jsonb_build_object('kind','unavailable');end if;
 previous:=(p_input->>'previousReceiptId')::uuid;
 if previous is not null then
  select * into prior from traffic_private.receipts_v1 where id=previous for share nowait;
  if not found or prior.expires_at<=n then return jsonb_build_object('kind','unavailable');end if;
  select * into prior_d from traffic_private.dispatches_v1 where id=prior.dispatch_id for share nowait;
  if not found or prior_d.owner_id<>d.owner_id or prior_d.session_id<>d.session_id or prior_d.scope is distinct from d.scope or prior_d.endpoints is distinct from d.endpoints or prior_d.stop_epoch<>d.stop_epoch or prior_d.policy_fingerprint<>d.policy_fingerprint or prior_d.source_version<>d.source_version then return jsonb_build_object('kind','unavailable');end if;
  delta:=(p_input->'selected'->>'durationSeconds')::integer-(prior.selected->>'durationSeconds')::integer;
  if p_input->'selected'->'tmc' is distinct from 'null'::jsonb and prior.selected->'tmc' is distinct from 'null'::jsonb and p_input->'selected'->'tmc' is distinct from prior.selected->'tmc' then change:='route_condition_changed';elsif delta<>0 then change:='route_estimate_changed';end if;
 end if;
 insert into traffic_private.receipts_v1(dispatch_id,fetched_at,expires_at,selected,alternatives,previous_receipt_id,change_kind,duration_delta_seconds)
 values(d.id,fetched,least(d.expires_at,fetched+interval '300 seconds'),p_input->'selected',p_input->'alternatives',previous,change,delta) returning * into r;
 update traffic_private.dispatches_v1 set state='complete' where id=d.id;
 return jsonb_build_object('kind','receipt','receipt',traffic_private.receipt_wire_v1(d,r,false));
exception when lock_not_available or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then return jsonb_build_object('kind','unavailable');end $$;

create function traffic_private.association_v1(d traffic_private.dispatches_v1,ctx jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare s trip_support_private.item_supports%rowtype;r trip_support_private.preparations%rowtype;m trip_support_private.entity_mappings%rowtype;b jsonb;n integer:=0;
begin
 for s in select * from trip_support_private.item_supports where owner_id=d.owner_id and trip_id=d.trip_id and day_id=d.scope->>'dayId' and item_id=d.scope->>'itemId' and scope='address_reference' and applicability='matched' and status='reference_current' order by id for share nowait loop
  select * into r from trip_support_private.preparations where id=s.receipt_id for share nowait;
  if not found or r.place_reference_id<>d.destination_reference or r.expires_at<=clock_timestamp() or s.item_digest<>trip_support_private.hash(ctx->'item') then continue;end if;
  select * into m from trip_support_private.entity_mappings where id=r.mapping_id for share nowait;
  if not found or m.canonical_poi_id::text<>d.endpoints->'destination'->>'canonicalPoiId' then continue;end if;
  perform 1 from knowledge_review_private.source_revisions where id in(select (x->>'sourceRevisionId')::uuid from jsonb_array_elements(s.source_refs) x) order by id for share nowait;
  b:=trip_support_private.mapping_basis(m.id);
  if b is null or b->>'mappingVersion' is distinct from r.mapping_version::text or b->>'sourceDigest' is distinct from s.source_digest or b->'sourceRefs' is distinct from s.source_refs or b->>'claimRevision' is distinct from s.claim_revision::text or b->>'payloadHash' is distinct from s.payload_hash or trip_support_private.typed_claim(b,'address_reference') is null then continue;end if;
  n:=n+1;if n>1 then return false;end if;
 end loop;return n=1;
exception when lock_not_available then return false;end $$;
create function traffic_private.receipt_wire_v1(d traffic_private.dispatches_v1,r traffic_private.receipts_v1,qualified boolean) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('receiptId',r.id,'dispatchId',d.id,'scope',d.scope,'stopEpoch',d.stop_epoch,'policyId',d.policy_id,'policyRevision',d.policy_revision,'sourceVersion',d.source_version,'fetchedAt',r.fetched_at,'providerObservedAt',null,'expiresAt',r.expires_at,'selected',r.selected,'alternatives',r.alternatives,'previousReceiptId',r.previous_receipt_id,'changeKind',r.change_kind,'durationDeltaSeconds',r.duration_delta_seconds,'routeChangeCaveat',true,'r2Qualified',qualified)$$;
create function public.read_foreground_traffic_v1(p_receipt uuid,p_scope jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r traffic_private.receipts_v1%rowtype;d traffic_private.dispatches_v1%rowtype;ctx jsonb;qualified boolean;
begin
 select * into r from traffic_private.receipts_v1 where id=p_receipt;if not found then return jsonb_build_object('kind','unavailable');end if;
 ctx:=traffic_private.dispatch_current_v1(r.dispatch_id);if ctx is null then return jsonb_build_object('kind','unavailable');end if;
 select * into d from traffic_private.dispatches_v1 where id=r.dispatch_id;
 if d.scope is distinct from p_scope or d.state<>'complete' then return jsonb_build_object('kind','unavailable');end if;
 select * into r from traffic_private.receipts_v1 where id=p_receipt for share nowait;
 if not found or r.expires_at<=clock_timestamp() then return jsonb_build_object('kind','unavailable');end if;
 qualified:=traffic_private.association_v1(d,ctx);
 return jsonb_build_object('kind','receipt','receipt',traffic_private.receipt_wire_v1(d,r,qualified));
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;
create function public.stop_foreground_traffic_v1(p_scope jsonb,p_expected_stop_epoch bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb;ep bigint;
begin
 ctx:=traffic_private.scope_v1(p_scope);if ctx is null or p_expected_stop_epoch is null or (ctx->>'stopEpoch')::bigint<>p_expected_stop_epoch then return jsonb_build_object('kind','unavailable');end if;
 update traffic_private.scopes_v1 set epoch=epoch+1,stopped=true where id=(ctx->>'scopeId')::uuid returning epoch into ep;
 delete from traffic_private.dispatches_v1 where scope_id=(ctx->>'scopeId')::uuid;
 return jsonb_build_object('kind','stopped','stopEpoch',ep);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;
create function traffic_private.qualify_recovery_v1(p_receipt uuid,p_scope jsonb,p_policy_id uuid,p_policy_revision bigint,p_stop_epoch bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;r jsonb;
begin
 result:=public.read_foreground_traffic_v1(p_receipt,p_scope);r:=result->'receipt';
 if result->>'kind' is distinct from 'receipt' or r->'r2Qualified' is distinct from 'true'::jsonb or r->>'changeKind' not in('route_estimate_changed','route_condition_changed')
 or r->>'policyId' is distinct from p_policy_id::text or r->>'policyRevision' is distinct from p_policy_revision::text or r->>'stopEpoch' is distinct from p_stop_epoch::text or (r->>'expiresAt')::timestamptz<=clock_timestamp() then return jsonb_build_object('kind','unavailable');end if;
 return jsonb_build_object('kind','qualified','receiptId',p_receipt,'policyId',p_policy_id,'policyRevision',p_policy_revision,'stopEpoch',p_stop_epoch,'expiresAt',r->'expiresAt');
end $$;
create function traffic_private.policy_changed_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from traffic_private.dispatches_v1 where policy_id=OLD.id;return case when TG_OP='DELETE' then OLD else NEW end;end $$;
create trigger traffic_policy_invalidate_v1 before update or delete on traffic_private.policies_v1 for each row execute function traffic_private.policy_changed_v1();
create function traffic_private.producer_changed_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from traffic_private.dispatches_v1 where policy_id in(select id from traffic_private.policies_v1 where account_scope=OLD.account_scope);return case when TG_OP='DELETE' then OLD else NEW end;end $$;
create trigger traffic_producer_invalidate_v1 before update or delete on traffic_private.producers_v1 for each row execute function traffic_private.producer_changed_v1();
create function traffic_private.purge_expired_v1(p_limit integer) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_limit is null or p_limit not between 1 and 500 then return 0;end if;
 delete from traffic_private.dispatches_v1 where id in(select id from traffic_private.dispatches_v1 where expires_at<=clock_timestamp() order by expires_at,id limit p_limit for update skip locked);get diagnostics n=row_count;
 return n;
end $$;
create function traffic_private.export_metadata_v1(p_request uuid,p_lease uuid,p_generation integer,p_after uuid,p_limit integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare j export_private.core_jobs_v1;rows jsonb;more boolean;
begin
 if p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('kind','unavailable');end if;
 j:=export_private.lock_job_v1(p_request,true);if j is null or not export_private.live_lease_v1(j,p_lease,p_generation) then return jsonb_build_object('kind','unavailable');end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'scope',x.scope,'sourceVersion',x.source_version,'policyId',x.policy_id,'policyRevision',x.policy_revision,'createdAt',x.created_at,'expiresAt',x.expires_at,'outcome',x.state) order by x.id),'[]'::jsonb) into rows from
 (select * from traffic_private.dispatches_v1 where owner_id=j.owner_id and session_id=j.session_id and (p_after is null or id>p_after) and expires_at>clock_timestamp() order by id limit p_limit) x;
 more:=exists(select 1 from traffic_private.dispatches_v1 where owner_id=j.owner_id and session_id=j.session_id and expires_at>clock_timestamp() and id>(rows->-1->>'id')::uuid);
 return jsonb_build_object('kind','metadata','requestId',p_request,'generation',p_generation,'items',rows,'hasMore',more,'nextCursor',case when more then rows->-1->'id' else null end,'allUserDataCompleted',false);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;
-- No ordinary role or service role can call these newly added authorities.
do $$declare f record;begin for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='traffic_private' or n.nspname='public' and p.proname in('foreground_traffic_policy_v1','foreground_traffic_producer_v1','read_foreground_traffic_v1','stop_foreground_traffic_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.name);end loop;end $$;
