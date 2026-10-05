-- #365: metadata-only saved state and immutable operation receipts; original Proposal writer only.
-- Target activation is deliberately absent. Rollback disables the two RPCs/consumer flag;
-- preserve confirmed Trip, references and receipts. No external order is reversed.
create schema place_actions_private;
revoke all on schema place_actions_private from public,anon,authenticated,service_role;
create table place_actions_private.saved_places(
 owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,
 canonical_poi_id uuid not null references public.canonical_pois(id) on delete restrict,
 reference_id uuid not null references public.trip_place_references(id) on delete cascade,
 revision integer not null check(revision between 1 and 2147483647),
 status text not null check(status in('saved','unsaved')),
 mapping_digest text not null check(mapping_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,trip_id,canonical_poi_id)
);
create index place_actions_saved_trip on place_actions_private.saved_places(trip_id);
create index place_actions_saved_canonical on place_actions_private.saved_places(canonical_poi_id);
create index place_actions_saved_reference on place_actions_private.saved_places(reference_id);
create table place_actions_private.operations(
 owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,trip_id uuid not null references public.trips(id) on delete cascade,
 canonical_poi_id uuid not null,provider text not null check(provider in('amap','tencent')),provider_poi_id text not null,
 action text not null check(action in('save','unsave','add')),request jsonb not null,
 request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,operation_id)
);
create index place_actions_operations_trip on place_actions_private.operations(trip_id);
alter table place_actions_private.saved_places enable row level security;
alter table place_actions_private.operations enable row level security;
revoke all on all tables in schema place_actions_private from public,anon,authenticated,service_role;
-- Stable server digest: PostgreSQL jsonb text, UTF8 SHA256, no client recomputation.
-- Request comparison additionally uses full JSONB equality, including every original string.
create function place_actions_private.hash_v1(v jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(v::text,'UTF8')),'hex')$$;
create function place_actions_private.actor_v1() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid;s uuid;
begin
 if auth.role() is distinct from 'authenticated' or auth.jwt()->>'is_anonymous' is distinct from 'false' then raise exception 'UNAUTHENTICATED';end if;
 u:=auth.uid();s:=(auth.jwt()->>'session_id')::uuid;
 perform 1 from auth.sessions where id=s and user_id=u for share;if not found then raise exception 'UNAUTHENTICATED';end if;
 u:=turn_private.text_owner();
 if exists(select 1 from identity_private.mobile_attempts where session_id=s) or exists(select 1 from identity_private.mobile_login_proofs where session_id=s) then
  perform public.native_session_v2('session');
  if exists(select 1 from identity_private.mobile_attempts where session_id=s) and not exists(select 1 from identity_private.mobile_attempts x join identity_private.mobile_accounts a on a.owner_id=x.owner_id and a.session_id=x.session_id and a.epoch=x.epoch where x.owner_id=u and x.session_id=s) then raise exception 'SESSION_REPLACED';end if;
 end if;
 return u;
end $$;
revoke all on all functions in schema place_actions_private from public,anon,authenticated,service_role;
create function place_actions_private.exact_v1(v jsonb,k text[]) returns boolean language sql immutable set search_path='' as $$select coalesce(jsonb_typeof(v)='object' and v ?& k and (v-k)='{}',false)$$;
create function place_actions_private.uuid_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)$$;
create function place_actions_private.revision_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare n numeric;begin
 if jsonb_typeof(v) is distinct from 'number' then return false;end if;n:=(v#>>'{}')::numeric;return n=trunc(n) and n between 0 and 2147483647;
end $$;
create function place_actions_private.utf16_length_v1(v text) returns integer language sql immutable set search_path='' as $$select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0)::integer from regexp_split_to_table(v,'') c$$;
create function place_actions_private.selection_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$select coalesce(
 place_actions_private.exact_v1(v,array['canonicalPoiId','provider','providerPoiId']) and place_actions_private.uuid_v1(v->'canonicalPoiId')
 and v->>'provider' in('amap','tencent') and jsonb_typeof(v->'providerPoiId')='string'
 and v->>'providerPoiId'=btrim(v->>'providerPoiId',E' \t\r\n\v\f'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
 and place_actions_private.utf16_length_v1(v->>'providerPoiId') between 1 and 128,false)$$;
create function place_actions_private.time_v1(v jsonb) returns timestamptz language plpgsql immutable set search_path='' set timezone='UTC' as $$declare s text:=v#>>'{}';off text;begin
 if jsonb_typeof(v) is distinct from 'string' or s !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$' then return null;end if;
 if substring(s,12,2)::integer>23 or substring(s,15,2)::integer>59 or substring(s,18,2)::integer>59 then return null;end if;
 off:=right(s,6);if right(s,1)<>'Z' and (substring(off,2,2)::integer>14 or substring(off,5,2)::integer>59 or substring(off,2,2)::integer=14 and substring(off,5,2)::integer<>0) then return null;end if;
 perform left(s,10)::date;return s::timestamptz;
exception when datetime_field_overflow or invalid_datetime_format then return null;end $$;
create function place_actions_private.valid_v1(v jsonb,context boolean default false) returns boolean language plpgsql immutable set search_path='' as $$
declare k text[]:=array['action','expectedTripVersion','selection'];a text:=v->>'action';st timestamptz;en timestamptz;
begin
 if not place_actions_private.revision_v1(v->'expectedTripVersion') or not place_actions_private.selection_v1(v->'selection') then return false;end if;
 if context then return a='context' and place_actions_private.exact_v1(v,k||array['locale']) and v->>'locale' in('zh','en');end if;
 k:=k||array['expectedMappingDigest','operationId'];
 if jsonb_typeof(v->'expectedMappingDigest') is distinct from 'string' or v->>'expectedMappingDigest' !~ '^[a-f0-9]{64}$' or not place_actions_private.uuid_v1(v->'operationId') then return false;end if;
 if a='save' then return place_actions_private.exact_v1(v,k||array['expectedSaveRevision']) and place_actions_private.revision_v1(v->'expectedSaveRevision');end if;
 if a='unsave' then return place_actions_private.exact_v1(v,k||array['referenceId','expectedSaveRevision']) and place_actions_private.uuid_v1(v->'referenceId') and place_actions_private.revision_v1(v->'expectedSaveRevision') and (v->>'expectedSaveRevision')::numeric>0;end if;
 if a='add' and place_actions_private.exact_v1(v,k||array['dayId','itemId','startsAt','endsAt','locale']) then
  st:=place_actions_private.time_v1(v->'startsAt');en:=place_actions_private.time_v1(v->'endsAt');
  return coalesce(jsonb_typeof(v->'dayId')='string' and v->>'dayId' ~ '^[A-Za-z0-9_-]{1,64}$' and jsonb_typeof(v->'itemId')='string' and v->>'itemId' ~ '^[A-Za-z0-9_-]{1,64}$'
   and st is not null and en>st and en-st<=interval '24 hours' and v->>'locale' in('zh','en'),false);
 end if;return false;
end $$;
-- Identity digest deliberately excludes supplier body/geometry. Names are canonical metadata.
create function place_actions_private.mapping_v1(v jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare p public.canonical_pois%rowtype;m public.provider_poi_mappings%rowtype;b jsonb;
begin
 select * into p from public.canonical_pois where id=(v->>'canonicalPoiId')::uuid for share;if not found then return null;end if;
 select * into m from public.provider_poi_mappings where canonical_poi_id=p.id and provider=v->>'provider' and provider_poi_id=v->>'providerPoiId' for share;
 if not found then return null;end if;
 b:=jsonb_build_object('selection',v,'mappingId',m.id,'matchedAt',m.matched_at,'primaryNameZh',p.primary_name_zh,'primaryNameEn',p.primary_name_en);
 return jsonb_build_object('digest',place_actions_private.hash_v1(b),'zh',p.primary_name_zh,'en',p.primary_name_en);
end $$;
create function place_actions_private.sources_v1(poi uuid,loc text) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare m trip_support_private.entity_mappings%rowtype;b jsonb;c jsonb;scope text;rows jsonb:='[]';n integer:=0;expiry timestamptz:=clock_timestamp()+interval '30 seconds';
begin
 -- The publication reader being disabled is unavailable, not a complete empty result.
 perform 1 from knowledge_review_private.publication_settings where singleton and enabled for share;
 if not found then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
 for m in select * from trip_support_private.entity_mappings where canonical_poi_id=poi and status='approved' and basis_metadata->>'locale'=loc order by id limit 501 for share loop
  n:=n+1;if n>500 then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
  if m.version>2147483647 then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
  b:=trip_support_private.mapping_basis(m.id);if b is null then continue;end if;
  scope:=case b->'payload'->'assertion'->>'predicate' when 'located_at' then 'address_reference' when 'opens_during' then 'opening_window_reference' end;
  c:=trip_support_private.typed_claim(b,scope);if c is null then continue;end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'statementId',m.statement_id,'claimRevision',m.claim_revision,'payloadHash',m.payload_hash,'sourceDigest',m.source_digest,'scope',scope,'claim',c,'city',m.basis_metadata->>'city','scene',m.basis_metadata->>'scene','locale',loc));
  expiry:=least(expiry,(b->'receipt'->>'expiresAt')::timestamptz);
  if jsonb_array_length(rows)>24 then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
 end loop;
 return jsonb_build_object('status','complete','entries',rows,'expiresAt',expiry);
exception when lock_not_available then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end $$;
-- Normalize the original read snapshot timestamps for the existing TripSnapshot wire.
-- The old snapshot formatter emits +00; client contract requires Z or +00:00.
create function place_actions_private.snapshot_v1(t uuid,title text,head integer) returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare snap jsonb:=public.trip_content_snapshot(t,title);d jsonb;i jsonb;days jsonb:='[]';items jsonb;
begin
 for d in select value from jsonb_array_elements(snap->'days') loop
  items:='[]';for i in select value from jsonb_array_elements(d->'items') loop
   if i ? 'startsAt' then i:=jsonb_set(i,'{startsAt}',to_jsonb(recovery_private.ms_v1((i->>'startsAt')::timestamptz)));end if;
   if i ? 'endsAt' then i:=jsonb_set(i,'{endsAt}',to_jsonb(recovery_private.ms_v1((i->>'endsAt')::timestamptz)));end if;
   items:=items||jsonb_build_array(i);
  end loop;days:=days||jsonb_build_array(jsonb_set(d,'{items}',items));
 end loop;
 return jsonb_set(snap,'{days}',days)||jsonb_build_object('version',head);
end $$;
create function public.read_place_action_context_v1(p_trip uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid:=place_actions_private.actor_v1();t public.trips%rowtype;m jsonb;s place_actions_private.saved_places%rowtype;r uuid;saved jsonb;basis jsonb;src jsonb;stamp timestamptz;snapshot jsonb;
begin
 if not place_actions_private.valid_v1(p_input,true) then raise exception 'INVALID_INPUT';end if;
 select * into t from public.trips where id=p_trip and owner_id=u for share;if not found then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from public.trip_archives where trip_id=t.id) or exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) then return jsonb_build_object('kind','unavailable','reason','ARCHIVED');end if;
 if t.head_version<>(p_input->>'expectedTripVersion')::numeric then return jsonb_build_object('kind','unavailable','reason','STALE_TRIP_VERSION');end if;
 if (select count(*) from public.trip_place_references where trip_id=t.id)>100 or (select count(*) from public.trip_days where trip_id=t.id)>100 or (select count(*) from public.trip_items where trip_id=t.id)>500 then return jsonb_build_object('kind','unavailable','reason','CAPACITY');end if;
 m:=place_actions_private.mapping_v1(p_input->'selection');if m is null then return jsonb_build_object('kind','unavailable','reason',case when exists(select 1 from public.canonical_pois where id=(p_input->'selection'->>'canonicalPoiId')::uuid) then 'MAPPING_CHANGED' else 'PLACE_NOT_FOUND' end);end if;
 select * into s from place_actions_private.saved_places where owner_id=u and trip_id=t.id and canonical_poi_id=(p_input->'selection'->>'canonicalPoiId')::uuid for share;
 if found then
  perform 1 from public.trip_place_references where id=s.reference_id and trip_id=t.id and owner_id=u and canonical_poi_id=s.canonical_poi_id and reference_kind='canonical';if not found then raise exception 'PLACE_ACTION_UNAVAILABLE';end if;
  saved:=jsonb_build_object('referenceId',s.reference_id,'revision',s.revision,'status',s.status,'mappingDigest',s.mapping_digest);r:=s.reference_id;
 else select id into r from public.trip_place_references where trip_id=t.id and owner_id=u and reference_kind='canonical' and canonical_poi_id=(p_input->'selection'->>'canonicalPoiId')::uuid order by created_at,id limit 1;end if;
 snapshot:=place_actions_private.snapshot_v1(t.id,t.title,t.head_version);
 if place_actions_private.utf16_length_v1(m->>(p_input->>'locale'))>160 or place_actions_private.utf16_length_v1(t.title)>160 or exists(select 1 from public.trip_items where trip_id=t.id and place_actions_private.utf16_length_v1(title)>160) then return jsonb_build_object('kind','unavailable','reason','CAPACITY');end if;
 src:=place_actions_private.sources_v1((p_input->'selection'->>'canonicalPoiId')::uuid,p_input->>'locale');
 basis:=jsonb_build_object('kind','place_action_context','tripId',t.id,'tripVersion',t.head_version,'selection',p_input->'selection','mappingDigest',m->>'digest','snapshot',snapshot,'displayTitle',m->>(p_input->>'locale'),'referenceId',r,'saved',saved,'sourceCandidates',src->'entries','sourceCandidatesStatus',src->>'status');
 stamp:=clock_timestamp();
 return basis||jsonb_build_object('contextDigest',place_actions_private.hash_v1(jsonb_build_object('owner',u,'session',auth.jwt()->>'session_id','basis',basis)),'evaluatedAt',recovery_private.ms_v1(stamp),'expiresAt',recovery_private.ms_v1(least(stamp+interval '30 seconds',(src->>'expiresAt')::timestamptz)));
exception when lock_not_available then raise exception 'PLACE_ACTION_UNAVAILABLE';end $$;
create function public.execute_place_action_v1(p_trip uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid:=place_actions_private.actor_v1();v jsonb:=p_input;a text;op uuid;t public.trips%rowtype;prior place_actions_private.operations%rowtype;s place_actions_private.saved_places%rowtype;m jsonb;r uuid;poi uuid;out jsonb;proposal jsonb;patch jsonb;rev integer;sstatus text;md text;
begin
 if p_input->>'action' in('receipt','abandon') then
  if not place_actions_private.exact_v1(p_input,array['action','request']) then raise exception 'INVALID_INPUT';end if;v:=p_input->'request';
 end if;
 if not place_actions_private.valid_v1(v) then raise exception 'INVALID_INPUT';end if;
 a:=v->>'action';op:=(v->>'operationId')::uuid;poi:=(v->'selection'->>'canonicalPoiId')::uuid;
 if not exists(select 1 from public.trips where id=p_trip and owner_id=u) then raise exception 'FORBIDDEN';end if;
 -- Owner+operation lock precedes Trip lock, including different-trip key races.
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||op::text,0));
 select * into prior from place_actions_private.operations where owner_id=u and operation_id=op;
 if found then
  if prior.trip_id<>p_trip or prior.request is distinct from v then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
  return prior.receipt;
 end if;
 if p_input->>'action'='receipt' then return jsonb_build_object('kind','receipt_absent','tripId',p_trip,'operationId',op);end if;
 if p_input->>'action'='abandon' then
  -- A durable fence before current qualification checks; no save/proposal rollback.
  -- Existing operation above wins, including a successful apply whose ACK was lost.
  out:=jsonb_build_object('kind','place_action_cancelled','tripId',p_trip,'operationId',op,'action',a,'selection',v->'selection','tripVersion',v->'expectedTripVersion','mappingDigest',v->>'expectedMappingDigest','requestDigest',place_actions_private.hash_v1(jsonb_build_object('tripId',p_trip,'request',v)),'historicalOnly',true,'currentEligibilityRequiresRead',true);
  insert into place_actions_private.operations(owner_id,operation_id,trip_id,canonical_poi_id,provider,provider_poi_id,action,request,request_digest,receipt) values(u,op,p_trip,poi,v->'selection'->>'provider',v->'selection'->>'providerPoiId',a,v,out->>'requestDigest',out);
  return out;
 end if;
 select * into t from public.trips where id=p_trip and owner_id=u for update;if not found then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from public.trip_archives where trip_id=t.id) or exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) then raise exception 'PLACE_ACTION_UNAVAILABLE';end if;
 if t.head_version<>(v->>'expectedTripVersion')::numeric then raise exception 'STALE_TRIP_VERSION';end if;
 select * into s from place_actions_private.saved_places where owner_id=u and trip_id=t.id and canonical_poi_id=poi for update;
 if a='unsave' then
  if s.owner_id is null or s.reference_id<>(v->>'referenceId')::uuid or s.revision<>(v->>'expectedSaveRevision')::numeric or s.status<>'saved' then raise exception 'CAS_CONFLICT';end if;
  perform 1 from public.trip_place_references where id=s.reference_id and owner_id=u and trip_id=t.id and reference_kind='canonical' and canonical_poi_id=poi for share;if not found then raise exception 'CAS_CONFLICT';end if;
  if s.revision=2147483647 then raise exception 'CAS_CONFLICT';end if;
  -- Forget is permitted after mapping withdrawal. Compare the saved original basis only.
  if s.mapping_digest is distinct from v->>'expectedMappingDigest' then raise exception 'CAS_CONFLICT';end if;
  update place_actions_private.saved_places set status='unsaved',revision=revision+1,updated_at=clock_timestamp() where owner_id=u and trip_id=t.id and canonical_poi_id=poi returning * into s;
  r:=s.reference_id;md:=s.mapping_digest;rev:=s.revision;sstatus:=s.status;
 else
  m:=place_actions_private.mapping_v1(v->'selection');if m is null or m->>'digest' is distinct from v->>'expectedMappingDigest' then raise exception 'MAPPING_CHANGED';end if;md:=m->>'digest';
  if (select count(*) from public.trip_place_references where trip_id=t.id)>100 or (select count(*) from public.trip_days where trip_id=t.id)>100 or (select count(*) from public.trip_items where trip_id=t.id)>500 then raise exception 'PLACE_ACTION_UNAVAILABLE';end if;
  if a='save' and coalesce(s.revision,0)<>(v->>'expectedSaveRevision')::numeric then raise exception 'CAS_CONFLICT';end if;
  select id into r from public.trip_place_references where trip_id=t.id and owner_id=u and reference_kind='canonical' and canonical_poi_id=poi order by created_at,id limit 1 for share;
  if r is null then
   if (select count(*) from public.trip_place_references where trip_id=t.id)>=100 then raise exception 'PLACE_ACTION_UNAVAILABLE';end if;
   insert into public.trip_place_references(trip_id,owner_id,reference_kind,canonical_poi_id) values(t.id,u,'canonical',poi) returning id into r;
  end if;
  if a='save' then
   if coalesce(s.revision,0)=2147483647 then raise exception 'CAS_CONFLICT';end if;
   insert into place_actions_private.saved_places(owner_id,trip_id,canonical_poi_id,reference_id,revision,status,mapping_digest) values(u,t.id,poi,r,1,'saved',md)
   on conflict(owner_id,trip_id,canonical_poi_id) do update set revision=saved_places.revision+1,status='saved',mapping_digest=excluded.mapping_digest,updated_at=clock_timestamp() returning * into s;
   r:=s.reference_id;rev:=s.revision;sstatus:=s.status;
  else
   if place_actions_private.utf16_length_v1(m->>(v->>'locale'))>160 then raise exception 'PLACE_ACTION_UNAVAILABLE';end if;
   if not exists(select 1 from public.trip_days where trip_id=t.id and day_id=v->>'dayId') or exists(select 1 from public.trip_items where trip_id=t.id and item_id=v->>'itemId') then raise exception 'INVALID_INPUT';end if;
   if (select count(*) from public.trip_items where trip_id=t.id)>=500 then raise exception 'PLACE_ACTION_UNAVAILABLE';end if;
   patch:=jsonb_build_object('expectedVersion',t.head_version,'operations',jsonb_build_array(jsonb_build_object('kind','upsert_item','dayId',v->>'dayId','itemId',v->>'itemId','title',m->>(v->>'locale'),'startsAt',v->>'startsAt','endsAt',v->>'endsAt')));
   select jsonb_build_object('proposalId',x.proposal_id,'revision',x.revision,'baseTripVersion',x.base_trip_version) into proposal from public.create_trip_proposal_patch(t.id,patch) x;
   if proposal is null then raise exception 'PLACE_ACTION_UNAVAILABLE';end if;
  end if;
 end if;
 out:=jsonb_build_object('kind','place_action_receipt','tripId',t.id,'operationId',op,'action',a,'selection',v->'selection','tripVersion',t.head_version,'mappingDigest',md,'requestDigest',place_actions_private.hash_v1(jsonb_build_object('tripId',t.id,'request',v)),'referenceId',r,'savedRevision',rev,'savedStatus',sstatus,'proposal',proposal,'historicalOnly',true,'currentEligibilityRequiresRead',true);
 insert into place_actions_private.operations(owner_id,operation_id,trip_id,canonical_poi_id,provider,provider_poi_id,action,request,request_digest,receipt) values(u,op,t.id,poi,v->'selection'->>'provider',v->'selection'->>'providerPoiId',a,v,out->>'requestDigest',out);
 return out;
exception when lock_not_available then raise exception 'PLACE_ACTION_UNAVAILABLE';end $$;
create function place_actions_private.immutable_v1() returns trigger language plpgsql set search_path='' as $$begin raise exception 'PLACE_ACTION_RECEIPT_IMMUTABLE';end $$;
create trigger immutable_place_action_operation before update on place_actions_private.operations for each row execute function place_actions_private.immutable_v1();
-- Private, separately versioned export seam. Existing core-export-d2/1 is not enrolled
-- and remains partial. No old issued package or source revision is silently replaced.
create function place_actions_private.export_metadata_v1(p_request uuid,p_lease uuid,p_generation integer,p_cursor jsonb,p_limit integer) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare j export_private.core_jobs_v1;all_rows jsonb;page jsonb;source_revision text;after_key text;last_key text;more boolean;
begin
 if p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('kind','unavailable');end if;
 j:=export_private.lock_job_v1(p_request,true);if j is null or not export_private.live_lease_v1(j,p_lease,p_generation) then return jsonb_build_object('kind','unavailable');end if;
 -- A consistent metadata snapshot, bounded before aggregation. Cursor binds both domains.
 select coalesce(jsonb_agg(x.row order by x.key),'[]'::jsonb) into all_rows from(
  select 'saved:'||s.trip_id||':'||s.canonical_poi_id key,jsonb_build_object('key','saved:'||s.trip_id||':'||s.canonical_poi_id,'domain','saved','tripId',s.trip_id,'canonicalPoiId',s.canonical_poi_id,'referenceId',s.reference_id,'revision',s.revision,'status',s.status,'mappingDigest',s.mapping_digest,'createdAt',s.created_at,'updatedAt',s.updated_at) row from place_actions_private.saved_places s where s.owner_id=j.owner_id
  union all
  select 'operation:'||o.operation_id,jsonb_build_object('key','operation:'||o.operation_id,'domain','operation','tripId',o.trip_id,'operationId',o.operation_id,'request',o.request,'requestDigest',o.request_digest,'receipt',o.receipt,'createdAt',o.created_at) from place_actions_private.operations o where o.owner_id=j.owner_id
  order by key limit 10001
 ) x;
 if jsonb_array_length(all_rows)>10000 then return jsonb_build_object('kind','unavailable');end if;
 source_revision:=place_actions_private.hash_v1(jsonb_build_object('schemaVersion','place-actions-metadata/1','owner',j.owner_id,'request',j.request_id,'generation',j.generation,'rows',all_rows));
 if p_cursor is not null then
  if not place_actions_private.exact_v1(p_cursor,array['sourceRevision','afterKey']) or p_cursor->>'sourceRevision' is distinct from source_revision or jsonb_typeof(p_cursor->'afterKey') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(all_rows) x where x->>'key'=p_cursor->>'afterKey') then return jsonb_build_object('kind','stale');end if;
  after_key:=p_cursor->>'afterKey';
 end if;
 select coalesce(jsonb_agg(x order by x->>'key'),'[]'::jsonb) into page from(select value x from jsonb_array_elements(all_rows) where after_key is null or value->>'key'>after_key order by value->>'key' limit p_limit) q;
 last_key:=page->-1->>'key';more:=last_key is not null and exists(select 1 from jsonb_array_elements(all_rows)x where x->>'key'>last_key);
 return jsonb_build_object('kind','metadata','schemaVersion','place-actions-metadata/1','requestId',p_request,'generation',p_generation,'sourceRevision',source_revision,'items',page,'hasMore',more,'nextCursor',case when more then jsonb_build_object('sourceRevision',source_revision,'afterKey',last_key) else null end,'allUserDataCompleted',false);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;
-- Default deny: no target role, key, ACL enrollment or consumer activation.
revoke all on all functions in schema place_actions_private from public,anon,authenticated,service_role;
revoke all on function public.read_place_action_context_v1(uuid,jsonb),public.execute_place_action_v1(uuid,jsonb) from public,anon,authenticated,service_role;
