-- #221 delivery. All new authorities remain disabled and ungranted.
-- No network, Task execution, source publication, target enrollment or credential setup.
create schema notification_private;
revoke all on schema notification_private from public,anon,authenticated,service_role;
create table notification_private.settings(
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 environment text check(environment in('sandbox','production')),topic text,
 check(not enabled or environment is not null and topic is not null and length(topic) between 1 and 200)
);
insert into notification_private.settings(singleton) values(true);
create table notification_private.devices(
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,epoch bigint not null,revision integer not null check(revision>0),
 token text not null check(token ~ '^[a-f0-9]+$' and length(token) between 2 and 512 and length(token)%2=0),
 environment text not null check(environment in('sandbox','production')),topic text not null,
 permission text not null check(permission in('authorized','denied','not_determined')),
 time_zone text not null,active boolean not null,updated_at timestamptz not null default clock_timestamp(),
 unique(environment,topic,token)
);
create index notification_devices_owner on notification_private.devices(owner_id,id);
create table notification_private.reminders(
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,
 user_reminder_id uuid unique references public.travel_reminders(id) on delete cascade,
 operation_id uuid not null,session_id uuid not null,epoch bigint not null,base_version integer not null,
 purpose text not null check(purpose in('user_set_travel','accepted_task_result','qualified_watch')),
 source jsonb not null,reason text,due_at timestamptz not null,expires_at timestamptz not null,
 time_zone text not null,quiet_hours jsonb not null,consent_at timestamptz not null,
 status text not null default 'saved' check(status in('saved','cancelled','completed')),revision integer not null default 1,
 created_at timestamptz not null default clock_timestamp(),check(expires_at>due_at),
 check((purpose='user_set_travel' and reason is not null and user_reminder_id=id) or (purpose<>'user_set_travel' and reason is null and user_reminder_id is null))
);
create index notification_reminders_trip on notification_private.reminders(trip_id,owner_id);
create table notification_private.watches(
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,session_id uuid not null,epoch bigint not null,
 base_version integer not null,source jsonb not null,baseline_digest text not null,
 expires_at timestamptz not null,time_zone text not null,quiet_hours jsonb not null,
 consent_at timestamptz not null,status text not null default 'active' check(status in('active','cancelled')),
 stop_reason text check(stop_reason in('user','source_unavailable','recheck')),revision integer not null default 1,next_check_at timestamptz not null default clock_timestamp()
);
create index notification_watches_due on notification_private.watches(next_check_at,id) where status='active';
create index notification_watches_trip on notification_private.watches(trip_id,owner_id);
create table notification_private.dismissals(
 owner_id uuid not null references auth.users(id) on delete cascade,trip_id uuid not null references public.trips(id) on delete cascade,
 next_step_id uuid not null,source_kind text not null,source_id uuid not null,semantic_digest text not null,
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,trip_id,source_kind,source_id,semantic_digest)
);
create index notification_dismissals_trip on notification_private.dismissals(trip_id);
create table notification_private.outbox(
 id uuid primary key default gen_random_uuid(),reminder_id uuid unique not null references notification_private.reminders(id) on delete cascade,
 device_id uuid references notification_private.devices(id) on delete cascade,device_revision integer,
 recheck_receipt_id uuid,recheck_review_digest text,
 state text not null default 'scheduled' check(state in('scheduled','suppressed','attempting','accepted','unknown','error')),
 outcome jsonb,watch_id uuid references notification_private.watches(id) on delete cascade,semantic_digest text,
 created_at timestamptz not null default clock_timestamp(),unique(watch_id,semantic_digest)
);
create index notification_outbox_scheduled on notification_private.outbox(created_at,id) where state='scheduled';
create index notification_outbox_device on notification_private.outbox(device_id);
create table notification_private.attempts(
 notification_id uuid primary key references notification_private.outbox(id) on delete cascade,
 attempt_id uuid unique not null,device_id uuid not null references notification_private.devices(id) on delete cascade,
 device_revision integer not null,state text not null check(state in('attempting','accepted','unknown','error')),
 outcome jsonb,authorized_at timestamptz not null,lease_expires_at timestamptz not null,
 check(lease_expires_at<=authorized_at+interval '5 seconds')
);
create index notification_attempts_device on notification_private.attempts(device_id);
create table notification_private.operations(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,
 trip_id uuid not null references public.trips(id) on delete cascade,action text not null,
 request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,operation_id)
);
create index notification_operations_trip on notification_private.operations(trip_id);
do $$declare t text;begin foreach t in array array['settings','devices','reminders','watches','dismissals','outbox','attempts','operations'] loop
 execute format('alter table notification_private.%I enable row level security',t);
 execute format('revoke all on notification_private.%I from public,anon,authenticated,service_role',t);
end loop;end $$;
create function notification_private.exact(v jsonb,k text[]) returns boolean language sql immutable set search_path='' as $$select coalesce(jsonb_typeof(v)='object' and v ?& k and v-k='{}',false)$$;
create function notification_private.uuid(v jsonb) returns boolean language sql immutable set search_path='' as $$select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',false)$$;
create function notification_private.integer(v jsonb) returns boolean language sql immutable set search_path='' as $$select coalesce(jsonb_typeof(v)='number' and v#>>'{}' ~ '^(0|[1-9][0-9]{0,9})$' and (v#>>'{}')::numeric<=2147483647,false)$$;
-- Matches recursive ASCII sorted compact UTF8 JSON used by TS/Native. No request body stored.
create function notification_private.canonical(v jsonb) returns text language plpgsql immutable set search_path='' as $$declare x text;begin
 if jsonb_typeof(v)='object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||notification_private.canonical(value),',' order by key collate "C"),'')||'}' into x from jsonb_each(v);return x;
 elsif jsonb_typeof(v)='array' then select '['||coalesce(string_agg(notification_private.canonical(value),',' order by ord),'')||']' into x from jsonb_array_elements(v) with ordinality q(value,ord);return x;
 else return v::text;end if;end $$;
create function notification_private.hash(v jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(notification_private.canonical(v),'UTF8')),'hex')$$;
create function notification_private.opaque(v text) returns uuid language sql immutable set search_path='' as $$select (substr(v,1,8)||'-'||substr(v,9,4)||'-'||substr(v,13,4)||'-'||substr(v,17,4)||'-'||substr(v,21,12))::uuid$$;
create function notification_private.stamp(v timestamptz) returns text language sql stable set search_path='' set timezone='UTC' as $$select to_char(v at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')$$;
create function notification_private.time(v jsonb) returns timestamptz language plpgsql immutable set search_path='' set timezone='UTC' as $$begin
 return place_actions_private.time_v1(v);end $$;
create function notification_private.quiet(v jsonb) returns boolean language sql immutable set search_path='' as $$select notification_private.exact(v,array['startMinute','endMinute']) and notification_private.integer(v->'startMinute') and notification_private.integer(v->'endMinute') and (v->>'startMinute')::numeric<1440 and (v->>'endMinute')::numeric<1440$$;
create function notification_private.in_quiet(q jsonb,z text,at_time timestamptz) returns boolean language plpgsql stable set search_path='' as $$declare m integer;a integer:=(q->>'startMinute')::integer;b integer:=(q->>'endMinute')::integer;begin
 m:=extract(hour from at_time at time zone z)::integer*60+extract(minute from at_time at time zone z)::integer;
 return case when a=b then false when a<b then m>=a and m<b else m>=a or m<b end;
end $$;
create function notification_private.source_valid(v jsonb) returns boolean language sql immutable set search_path='' as $$select coalesce(notification_private.exact(v,array['kind','sourceId','revision','contentDigest']) and v->>'kind' in('current_trip','user_reminder','task_result','qualified_watch') and notification_private.uuid(v->'sourceId') and notification_private.integer(v->'revision') and jsonb_typeof(v->'contentDigest')='string' and v->>'contentDigest' ~ '^[a-f0-9]{64}$',false)$$;
create function notification_private.actor() returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=auth.uid();s uuid;begin
 if auth.role() is distinct from 'authenticated' or auth.jwt()->>'is_anonymous' is distinct from 'false' or u is null then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 perform 1 from auth.users where id=u for key share;
 perform 1 from identity_private.mobile_accounts where owner_id=u for update;
 perform 1 from auth.sessions where id=s and user_id=u for share;if not found then raise exception 'UNAUTHENTICATED';end if;
 perform public.native_session_v2('session');
 if not exists(select 1 from identity_private.mobile_accounts a join identity_private.mobile_attempts m on m.owner_id=a.owner_id and m.session_id=a.session_id and m.epoch=a.epoch where a.owner_id=u and a.session_id=s) then raise exception 'SESSION_REPLACED';end if;
 return u;
exception when invalid_text_representation then raise exception 'UNAUTHENTICATED';end $$;
create function notification_private.trip_live(t public.trips) returns boolean language plpgsql stable security definer set search_path='' as $$declare ends timestamptz;begin
 if exists(select 1 from public.trip_archives where trip_id=t.id) or exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) then return false;end if;
 if not exists(select 1 from public.trip_days where trip_id=t.id) or exists(select 1 from public.trip_days d where trip_id=t.id and (time_zone is null or not exists(select 1 from pg_timezone_names where name=d.time_zone))) then return false;end if;
 select max((trip_date+1)::timestamp at time zone time_zone) into ends from public.trip_days where trip_id=t.id;
 return ends>clock_timestamp();end $$;
create function notification_private.immutable_receipt() returns trigger language plpgsql set search_path='' as $$begin raise exception 'NOTIFICATION_RECEIPT_IMMUTABLE';end $$;
create trigger notification_receipt_immutable before update on notification_private.operations for each row execute function notification_private.immutable_receipt();
revoke all on all functions in schema notification_private from public,anon,authenticated,service_role;
-- Bounded notification-only qualification. Same real publication/source/mapping guards
-- as #207, without calling an ordinary-user RPC or replacing service JWT claims.
create function notification_private.mapping(p_mapping uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m trip_support_private.entity_mappings%rowtype;poi public.canonical_pois%rowtype;st knowledge_review_private.statements%rowtype;pub knowledge_review_private.publications%rowtype;c knowledge_review_private.candidates%rowtype;mr bigint;refs jsonb;
begin
 select * into m from trip_support_private.entity_mappings where id=p_mapping for share nowait;if not found or m.status<>'approved' then return null;end if;
 select * into poi from public.canonical_pois where id=m.canonical_poi_id for share nowait;if not found or trip_support_private.hash(to_jsonb(poi))<>m.canonical_hash then return null;end if;
 select revision into mr from knowledge_review_private.members where actor_id=m.reviewer_id and active for share nowait;if mr is distinct from m.reviewer_member_revision then return null;end if;
 perform 1 from knowledge_review_private.publication_settings where singleton and enabled for share nowait;if not found then return null;end if;
 select * into st from knowledge_review_private.statements where statement_id=m.statement_id for share nowait;if not found or st.revision<>m.claim_revision or trip_support_private.hash(st.payload)<>m.payload_hash then return null;end if;
 select * into pub from knowledge_review_private.publications where candidate_id=st.candidate_id for share nowait;if not found or pub.state<>'published' or pub.expires_at<=clock_timestamp() then return null;end if;
 select * into c from knowledge_review_private.candidates where id=st.candidate_id for share nowait;if not found or c.status<>'reviewed' then return null;end if;
 if m.basis_metadata->>'city' not in('shanghai','beijing','guangzhou','chongqing') or m.basis_metadata->>'scene' not in('arrival','airport_transport','payment','connectivity','public_transport','taxi','rail','attraction','accommodation','emergency') or m.basis_metadata->>'locale' not in('zh','en')
  or not(st.payload->'scope'->'cities' ? (m.basis_metadata->>'city')) or st.payload->'scope'->>'scene' is distinct from m.basis_metadata->>'scene' then return null;end if;
 -- Preserve ordinary reader's bounded published scope; no new content universe.
 if pub.fact_id not in(select pp.fact_id from knowledge_review_private.publications pp join knowledge_review_private.statements ss using(candidate_id) join knowledge_review_private.candidates cc on cc.id=pp.candidate_id where pp.state='published' and pp.expires_at>clock_timestamp() and cc.status='reviewed' and ss.payload->'scope'->'cities' ? (m.basis_metadata->>'city') and ss.payload->'scope'->>'scene'=m.basis_metadata->>'scene' order by pp.fact_id limit 50) then return null;end if;
 perform 1 from knowledge_review_private.source_revisions rr join knowledge_review_private.statement_sources ss on ss.source_revision_id=rr.id where ss.candidate_id=st.candidate_id order by rr.id for share of rr,ss nowait;
 select coalesce(jsonb_agg(jsonb_build_object('sourceRevisionId',rr.id,'revisionLabel',rr.revision_label,'snippetHash',rr.snippet_hash,'submittedBy',rr.submitted_by) order by rr.id),'[]') into refs from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions rr on rr.id=ss.source_revision_id where ss.candidate_id=st.candidate_id and rr.withdrawn_at is null;
 if jsonb_array_length(refs) not between 1 and 8 or jsonb_array_length(refs)<>(select count(*) from knowledge_review_private.statement_sources where candidate_id=st.candidate_id) or refs is distinct from m.source_refs or trip_support_private.hash(refs)<>m.source_digest then return null;end if;
 return jsonb_build_object('mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'canonicalPoiId',m.canonical_poi_id,'statementId',st.statement_id,'claimRevision',st.revision,'payloadHash',m.payload_hash,'payload',st.payload,'sourceRefs',refs,'sourceDigest',m.source_digest,'receipt',jsonb_build_object('kind','fact','factId',pub.fact_id,'version',pub.version,'reviewedAt',c.reviewed_at,'expiresAt',notification_private.stamp(pub.expires_at)));
exception when lock_not_available then return null;end $$;
-- Authoritative selectors. A DTO never supplies content, consent or eligibility.
create function notification_private.source(u uuid,t public.trips,k text,sid uuid,allow_recheck boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;semantic text;rev integer;expiry timestamptz;ur public.travel_reminders%rowtype;
 a turn_private.result_artifacts%rowtype;r turn_private.result_revisions%rowtype;
 s trip_support_private.item_supports%rowtype;p trip_support_private.preparations%rowtype;b jsonb;item jsonb;ev record;
begin
 if t.owner_id is distinct from u or not notification_private.trip_live(t) or not exists(select 1 from identity_private.mobile_accounts ma join auth.sessions au on au.id=ma.session_id and au.user_id=ma.owner_id join identity_private.mobile_attempts mt on mt.owner_id=ma.owner_id and mt.session_id=ma.session_id and mt.epoch=ma.epoch where ma.owner_id=u) then return null;end if;
 select max((trip_date+1)::timestamp at time zone time_zone) into expiry from public.trip_days where trip_id=t.id;
 if k='current_trip' then
  if sid<>t.id then return null;end if;
  select content into v from public.trip_version_snapshots where trip_id=t.id and owner_id=u and version=t.head_version for share nowait;
  if v is null then return null;end if;semantic:=notification_private.hash(v-'version');rev:=t.head_version;
 elsif k='user_reminder' then
  select * into ur from public.travel_reminders where id=sid and owner_id=u and trip_id=t.id for share nowait;
  if not found or place_actions_private.utf16_length_v1(ur.reason)>240 or ur.status<>'saved' or ur.base_version<>t.head_version or ur.expires_at<=clock_timestamp()
   or not exists(select 1 from identity_private.mobile_accounts where owner_id=u and session_id=ur.session_id) then return null;end if;
  semantic:=notification_private.hash(jsonb_build_object('reason',ur.reason,'dueAt',notification_private.stamp(ur.due_at),'timeZone',ur.time_zone,'purpose',ur.purpose));
  rev:=ur.base_version;expiry:=least(expiry,ur.expires_at);
 elsif k='task_result' then
  select * into a from turn_private.result_artifacts where id=sid and owner_id=u and trip_id=t.id and lifecycle='active' for share nowait;if not found then return null;end if;
  select * into r from turn_private.result_revisions where artifact_id=a.id and revision=a.current_revision and owner_id=u for share nowait;if not found then return null;end if;
  -- Fence original Memory/source/Task writers; acquisition contention is unavailable.
  perform 1 from turn_private.service_tasks where id=a.task_id and owner_id=u for share nowait;
  perform 1 from turn_private.assistant_goals where id=a.goal_id and owner_id=u for share nowait;
  perform 1 from turn_private.assistant_messages where id=a.input_message_id and owner_id=u for share nowait;
  perform 1 from turn_private.text_consents where owner_id=u for share nowait;
  perform 1 from turn_private.text_policies where id in(select policy_id from turn_private.assistant_messages where id=a.input_message_id union select policy_id from turn_private.service_tasks where id=a.task_id) for share nowait;
  perform 1 from turn_private.assistant_goal_trip_links where goal_id=a.goal_id for share nowait;
  perform 1 from turn_private.assistant_goal_trip_receipts where operation_id=r.trip_link_operation_id for share nowait;
  perform 1 from turn_private.work where turn_id=r.task_turn_id for share nowait;
  perform 1 from turn_private.planning_comparisons where turn_id=r.task_turn_id for share nowait;
  perform 1 from turn_private.text_content where turn_id=r.task_turn_id and owner_id=u for share nowait;
  perform 1 from public.turns where id=r.task_turn_id and owner_id=u for share nowait;
  perform 1 from public.memory_profiles where owner_id=u and id in(select (x->>'id')::uuid from jsonb_array_elements(r.memory_basis)x) for share nowait;
  perform 1 from public.memory_consents where owner_id=u for share nowait;
  if turn_private.result_state_v2(a,r)->>'current' is distinct from 'true' or exists(select 1 from turn_private.assistant_goals where id=a.goal_id and trip_terminal) or exists(select 1 from turn_private.work where turn_id=r.task_turn_id and state in('cancelled','quarantined')) or exists(select 1 from turn_private.planning_comparisons where turn_id=r.task_turn_id and state='paused_unknown') then return null;end if;
  semantic:=notification_private.hash(r.content);rev:=r.revision;
  -- Bound notification shelf life to every explicit result evidence expiry.
  if r.evidence_basis<>'[]'::jsonb then
   perform 1 from knowledge_review_private.publications kp join knowledge_review_private.statements st on st.candidate_id=kp.candidate_id where st.statement_id in(select (x->>'assertionId')::uuid from jsonb_array_elements(r.evidence_basis)x) for share of kp,st nowait;
   perform 1 from knowledge_review_private.candidates c join knowledge_review_private.statements st on st.candidate_id=c.id where st.statement_id in(select (x->>'assertionId')::uuid from jsonb_array_elements(r.evidence_basis)x) for share of c nowait;
   perform 1 from knowledge_review_private.source_revisions sr join knowledge_review_private.statement_sources ss on ss.source_revision_id=sr.id join knowledge_review_private.statements st on st.candidate_id=ss.candidate_id where st.statement_id in(select (x->>'assertionId')::uuid from jsonb_array_elements(r.evidence_basis)x) for share of sr,ss nowait;
   if exists(select 1 from knowledge_review_private.source_revisions sr join knowledge_review_private.statement_sources ss on ss.source_revision_id=sr.id join knowledge_review_private.statements st on st.candidate_id=ss.candidate_id where sr.withdrawn_at is not null and st.statement_id in(select (x->>'assertionId')::uuid from jsonb_array_elements(r.evidence_basis)x)) then return null;end if;
   -- Recheck after locking: a revocation committed between the initial read and
   -- these exact source locks must not obtain a handoff grant.
   if turn_private.result_state_v2(a,r)->>'current' is distinct from 'true' then return null;end if;
   select least(expiry,min(kp.expires_at)) into expiry from knowledge_review_private.publications kp join knowledge_review_private.statements st on st.candidate_id=kp.candidate_id where st.statement_id in(select (x->>'assertionId')::uuid from jsonb_array_elements(r.evidence_basis)x);
  end if;
 elsif k='qualified_watch' then
  select * into s from trip_support_private.item_supports where id=sid and owner_id=u and trip_id=t.id for share nowait;
  if not found or s.status not in('reference_current','recheck_required') or s.applicability<>'matched' or s.version>2147483647 then return null;end if;
  select * into p from trip_support_private.preparations where id=s.receipt_id and owner_id=u and trip_id=t.id for share nowait;
  if not found or p.status<>'consumed' or p.expires_at<=clock_timestamp() then return null;end if;
  if s.status='recheck_required' then
   if not allow_recheck then return null;end if;
   select sr.id receipt_id,io.digest,ss.signal_kind,io.acked_at,ss.id set_id into ev
    from trip_support_private.support_receipts sr join trip_support_private.impact_claims ic on ic.effect_receipt=sr.id and ic.support_id=s.id and ic.state_after=s.version and ic.provenance_version=s.provenance_version
    join knowledge_review_private.source_impact_outbox io on io.id=ic.delivery_id and io.attempt=ic.attempt and io.lease_token=ic.lease_token and io.receipt_id=sr.id and io.state='acked' and io.consumer='trip_item_support'
    join knowledge_review_private.source_impact_sets ss on ss.id=io.set_id and ss.version=io.review_version and ss.digest=io.digest
    where sr.support_id=s.id and sr.version=s.version and sr.action='recheck' and sr.source_digest=s.source_digest
    order by io.id limit 1 for share of sr,ic,io,ss nowait;
   if not found or not knowledge_review_private.impact_review_current(ev.set_id) then return null;end if;
   select content into v from public.trip_version_snapshots where trip_id=t.id and owner_id=u and version=t.head_version for share nowait;
   item:=trip_support_private.item(v,s.day_id,s.item_id);if item is null or trip_support_private.hash(item)<>s.item_digest then return null;end if;
   expiry:=least(expiry,p.expires_at,ev.acked_at+interval '24 hours');if expiry<=clock_timestamp() then return null;end if;
   semantic:=notification_private.hash(jsonb_build_object('status','recheck_required','scope',s.scope,'itemDigest',s.item_digest,'signalKind',ev.signal_kind));
   return jsonb_build_object('source',jsonb_build_object('kind',k,'sourceId',sid,'revision',s.version,'contentDigest',semantic),'expiresAt',notification_private.stamp(expiry),'recheckReceiptId',ev.receipt_id,'recheckReviewDigest',ev.digest);
  end if;
  perform 1 from trip_support_private.entity_mappings where id=p.mapping_id for share nowait;
  b:=notification_private.mapping(p.mapping_id);
  if b is null or b->>'mappingVersion' is distinct from p.mapping_version::text or b->>'sourceDigest' is distinct from s.source_digest or b->>'payloadHash' is distinct from s.payload_hash then return null;end if;
  select content into v from public.trip_version_snapshots where trip_id=t.id and owner_id=u and version=t.head_version for share nowait;
  item:=trip_support_private.item(v,s.day_id,s.item_id);
  if item is null or trip_support_private.hash(item)<>s.item_digest then return null;end if;
  v:=trip_support_private.typed_claim(b,s.scope);if v is null then return null;end if;
  -- Semantic digest intentionally excludes receipt/ref UUID, retrievedAt, version and clock.
  semantic:=notification_private.hash(jsonb_build_object('status',s.status,'scope',s.scope,'applicability',s.applicability,'claimRevision',s.claim_revision,'payloadHash',s.payload_hash,'itemDigest',s.item_digest,'claim',v));
  rev:=s.version;expiry:=least(expiry,p.expires_at,notification_private.time(b->'receipt'->'expiresAt'));
 else return null;end if;
 if expiry is null or expiry<=clock_timestamp() then return null;end if;
 return jsonb_build_object('source',jsonb_build_object('kind',k,'sourceId',sid,'revision',rev,'contentDigest',semantic),'expiresAt',notification_private.stamp(expiry));
exception when lock_not_available then return null;end $$;
create function notification_private.next_steps(u uuid,t public.trips) returns jsonb language plpgsql security definer set search_path='' as $$
declare x record;b jsonb;sid uuid;rows jsonb:='[]';n integer:=0;complete boolean:=true;why text;
begin
 if not notification_private.trip_live(t) then return jsonb_build_object('items',rows,'complete',true);end if;
 if not exists(select 1 from public.trip_version_snapshots where trip_id=t.id and owner_id=u and version=t.head_version) then complete:=false;end if;
 if not exists(select 1 from knowledge_review_private.publication_settings where enabled) then complete:=false;end if;
 for x in select 'current_trip'::text kind,t.id id union all
  select 'user_reminder',id from public.travel_reminders where owner_id=u and trip_id=t.id and status='saved'
  union all select 'task_result',id from turn_private.result_artifacts where owner_id=u and trip_id=t.id and lifecycle='active'
  union all select 'qualified_watch',ss.id from trip_support_private.item_supports ss where ss.owner_id=u and ss.trip_id=t.id and (ss.status='reference_current' or ss.status='recheck_required' and exists(select 1 from notification_private.reminders rr join notification_private.outbox ob on ob.reminder_id=rr.id where rr.owner_id=u and rr.trip_id=t.id and rr.source->>'sourceId'=ss.id::text and ob.recheck_receipt_id is not null and notification_private.current(rr,t)))
  order by kind,id limit 101 loop
  n:=n+1;if n>100 then complete:=false;exit;end if;
  b:=notification_private.source(u,t,x.kind,x.id,x.kind='qualified_watch' and exists(select 1 from notification_private.reminders rr join notification_private.outbox ob on ob.reminder_id=rr.id where rr.source->>'sourceId'=x.id::text and rr.owner_id=u and rr.trip_id=t.id and ob.recheck_receipt_id is not null and notification_private.current(rr,t)));if b is null then complete:=false;continue;end if;
  sid:=notification_private.opaque(notification_private.hash(jsonb_build_object('owner',u,'trip',t.id,'kind',x.kind,'sourceId',x.id,'semantic',b->'source'->>'contentDigest')));
  if exists(select 1 from notification_private.dismissals where owner_id=u and trip_id=t.id and source_kind=x.kind and source_id=x.id and semantic_digest=b->'source'->>'contentDigest') then continue;end if;
  why:=null;if x.kind='user_reminder' then select reason into why from public.travel_reminders where id=x.id;end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',sid,'source',b->'source','reasonCode',case x.kind when 'current_trip' then 'review_trip' when 'user_reminder' then 'user_requested' when 'task_result' then 'result_ready' else case when exists(select 1 from notification_private.reminders rr join notification_private.outbox ob on ob.reminder_id=rr.id where rr.source=b->'source' and rr.owner_id=u and rr.trip_id=t.id and ob.watch_id is not null and notification_private.current(rr,t)) then 'watch_changed' else 'watch_available' end end,'reason',why,'expiresAt',b->>'expiresAt'));
 end loop;
 return jsonb_build_object('items',rows,'complete',complete);
end $$;
create function notification_private.view(u uuid,t public.trips,ack jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare steps jsonb;reminders jsonb;watches jsonb;device jsonb;n integer;w integer;enabled boolean;
begin
 steps:=notification_private.next_steps(u,t);
 select count(*) into n from notification_private.reminders where owner_id=u and trip_id=t.id;
 select count(*) into w from notification_private.watches where owner_id=u and trip_id=t.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'operationId',r.operation_id,'baseVersion',r.base_version,'purpose',r.purpose,'source',r.source,'reason',r.reason,'dueAt',notification_private.stamp(r.due_at),'expiresAt',notification_private.stamp(r.expires_at),'timeZone',r.time_zone,'quietHours',r.quiet_hours,'status',coalesce(ur.status,r.status),'deliveryState',case when o.state='attempting' and exists(select 1 from notification_private.attempts aa where aa.notification_id=o.id and aa.lease_expires_at<=clock_timestamp()) then 'unknown' else o.state end,'outcome',case when o.state='attempting' and exists(select 1 from notification_private.attempts aa where aa.notification_id=o.id and aa.lease_expires_at<=clock_timestamp()) then '{"kind":"unknown","code":"ACK_UNKNOWN"}'::jsonb else o.outcome end) order by r.id),'[]') into reminders
 from (select * from notification_private.reminders where owner_id=u and trip_id=t.id order by id limit 100)r join notification_private.outbox o on o.reminder_id=r.id left join public.travel_reminders ur on ur.id=r.user_reminder_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'source',source,'expiresAt',notification_private.stamp(expires_at),'status',status,'timeZone',time_zone,'quietHours',quiet_hours) order by id),'[]') into watches from(select * from notification_private.watches where owner_id=u and trip_id=t.id order by id limit 50)q;
 select jsonb_build_object('deviceId',id,'revision',revision,'permission',permission,'active',active) into device from notification_private.devices where owner_id=u and session_id=(auth.jwt()->>'session_id')::uuid order by updated_at desc,id limit 1;
 select settings.enabled into enabled from notification_private.settings where singleton;
 return jsonb_build_object('version',2,'tripId',t.id,'tripVersion',t.head_version,'transport',case when enabled then 'configured' else 'disabled' end,'watchAvailability','qualified_only','nextSteps',steps->'items','reminders',reminders,'watches',watches,'device',device,'complete',steps->>'complete'='true' and n<=100 and w<=50 and not exists(select 1 from public.travel_reminders legacy where legacy.owner_id=u and legacy.trip_id=t.id and not exists(select 1 from notification_private.reminders nr where nr.user_reminder_id=legacy.id)),'mutationReceipt',ack);
end $$;
-- Closed input validation is also enforced for direct SQL callers.
create function notification_private.valid(a text,x jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare due timestamptz;ex timestamptz;
begin
 if not notification_private.uuid(x->'operationId') then return false;end if;
 if a in('cancel','complete','unwatch') then return notification_private.exact(x,array['operationId','id']) and notification_private.uuid(x->'id');
 elsif a='dismiss' then return notification_private.exact(x,array['operationId','nextStepId','source']) and notification_private.uuid(x->'nextStepId') and notification_private.source_valid(x->'source');
 elsif a='register_device' then return coalesce(notification_private.exact(x,array['operationId','deviceId','token','environment','permission','timeZone']) and notification_private.uuid(x->'deviceId') and jsonb_typeof(x->'token')='string' and x->>'token' ~ '^[a-f0-9]+$' and length(x->>'token') between 2 and 512 and length(x->>'token')%2=0 and x->>'environment' in('sandbox','production') and x->>'permission'='authorized' and jsonb_typeof(x->'timeZone')='string',false);
 elsif a='revoke_device' then return notification_private.exact(x,array['operationId','deviceId','permission']) and notification_private.uuid(x->'deviceId') and x->>'permission' in('authorized','denied','not_determined');
 elsif a not in('schedule','watch') then return false;end if;
 if not notification_private.uuid(x->'id') or not notification_private.integer(x->'baseVersion') or not notification_private.source_valid(x->'source') or not notification_private.quiet(x->'quietHours') or x->'consent' is distinct from 'true'::jsonb or jsonb_typeof(x->'timeZone') is distinct from 'string' then return false;end if;
 ex:=notification_private.time(x->'expiresAt');if ex is null then return false;end if;
 if a='watch' then return notification_private.exact(x,array['operationId','id','baseVersion','source','expiresAt','timeZone','quietHours','consent']) and x->'source'->>'kind'='qualified_watch';end if;
 due:=notification_private.time(x->'dueAt');if due is null or ex<=due or ex>due+interval '24 hours' then return false;end if;
 return coalesce(notification_private.exact(x,array['operationId','id','baseVersion','purpose','source','reason','dueAt','expiresAt','timeZone','quietHours','consent']) and
 ((x->>'purpose'='user_set_travel' and x->'source'->>'kind' in('current_trip','user_reminder') and jsonb_typeof(x->'reason')='string' and place_actions_private.utf16_length_v1(x->>'reason') between 1 and 240 and length(btrim(x->>'reason'))>0)
 or (x->>'purpose'='accepted_task_result' and x->'source'->>'kind'='task_result' and x->'reason'='null')
 or (x->>'purpose'='qualified_watch' and x->'source'->>'kind'='qualified_watch' and x->'reason'='null')),false);
exception when invalid_text_representation then return false;end $$;
create function notification_private.lock_scope(u uuid,trip uuid) returns public.trips language plpgsql security definer set search_path='' as $$declare t public.trips%rowtype;begin
 select * into t from public.trips where id=trip and owner_id=u for update;if not found then raise exception 'TRIP_NOT_FOUND';end if;
 perform 1 from notification_private.devices where owner_id=u order by id for update;
 perform 1 from notification_private.reminders where owner_id=u and trip_id=trip order by id for update;
 perform 1 from notification_private.watches where owner_id=u and trip_id=trip order by id for update;
 perform 1 from notification_private.outbox o join notification_private.reminders r on r.id=o.reminder_id where r.owner_id=u and r.trip_id=trip order by o.id for update of o;
 return t;
end $$;
create function public.travel_reminders_v2(p_trip uuid,p_action text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid:=notification_private.actor();t public.trips%rowtype;ma identity_private.mobile_accounts%rowtype;
 a text:=p_action;x jsonb:=p_input;cmd jsonb;op uuid;rid uuid;dg text;prior notification_private.operations%rowtype;ack jsonb;
 b jsonb;steps jsonb;step jsonb;dev notification_private.devices%rowtype;cfg notification_private.settings%rowtype;
 due timestamptz;ex timestamptz;rv integer:=1;ur uuid;is_abandon boolean:=p_action='abandon';
begin
 t:=notification_private.lock_scope(u,p_trip);
 select * into ma from identity_private.mobile_accounts where owner_id=u;
 if a='list' then if x is distinct from '{}'::jsonb then raise exception 'INVALID_INPUT';end if;return notification_private.view(u,t);end if;
 if is_abandon then
  if not notification_private.exact(x,array['command']) or not notification_private.exact(x->'command',array['action','input']) then raise exception 'INVALID_INPUT';end if;
  a:=x->'command'->>'action';x:=x->'command'->'input';
 end if;
 if not coalesce(notification_private.valid(a,x),false) then raise exception 'INVALID_INPUT';end if;
 cmd:=jsonb_build_object('action',a,'input',x);op:=(x->>'operationId')::uuid;
 rid:=coalesce(x->>'id',x->>'deviceId',x->>'nextStepId')::uuid;dg:=notification_private.hash(cmd);
 -- Owner/mobile + Trip serialize every execute, replay and abandon, before source/TTL.
 select * into prior from notification_private.operations where owner_id=u and operation_id=op for update;
 if found then
  if prior.trip_id<>p_trip or prior.action<>a or prior.request_digest<>dg then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
  return notification_private.view(u,t,prior.receipt);
 end if;
 if is_abandon then
  ack:=jsonb_build_object('operationId',op,'action',a,'requestDigest',dg,'resultId',rid,'revision',0,'terminal',true,'outcome','cancelled');
  insert into notification_private.operations(owner_id,operation_id,trip_id,action,request_digest,receipt) values(u,op,p_trip,a,dg,ack);
  return notification_private.view(u,t,ack);
 end if;
 if a in('register_device','revoke_device') then
  select * into dev from notification_private.devices where id=rid for update nowait;
  if found and dev.owner_id<>u then raise exception 'SOURCE_UNAVAILABLE';end if;
  if a='register_device' then
   if not exists(select 1 from pg_timezone_names where name=x->>'timeZone') then raise exception 'INVALID_INPUT';end if;
   select * into cfg from notification_private.settings where singleton for share;
   if not cfg.enabled or cfg.topic is null or cfg.environment is distinct from x->>'environment' then raise exception 'PROVIDER_UNAVAILABLE';end if;
   -- Installation UUID or token cannot capture another account's binding.
   if exists(select 1 from notification_private.devices where environment=cfg.environment and topic=cfg.topic and token=x->>'token' and id<>rid) then raise exception 'SOURCE_UNAVAILABLE';end if;
   rv:=coalesce(dev.revision,0)+1;
   insert into notification_private.devices(id,owner_id,session_id,epoch,revision,token,environment,topic,permission,time_zone,active)
    values(rid,u,ma.session_id,ma.epoch,rv,x->>'token',cfg.environment,cfg.topic,'authorized',x->>'timeZone',true)
    on conflict(id) do update set session_id=excluded.session_id,epoch=excluded.epoch,revision=excluded.revision,token=excluded.token,environment=excluded.environment,topic=excluded.topic,permission=excluded.permission,time_zone=excluded.time_zone,active=true,updated_at=clock_timestamp();
   -- Fence all queued work already bound to this old revision; no attempt is retried.
   update notification_private.outbox set state='suppressed' where device_id=rid and state='scheduled' and device_revision<>rv;
  else
   if dev.id is null then raise exception 'SOURCE_UNAVAILABLE';end if;
   rv:=dev.revision+1;
   update notification_private.devices set revision=rv,active=false,permission=x->>'permission',updated_at=clock_timestamp() where id=rid;
   update notification_private.outbox set state='suppressed' where device_id=rid and state='scheduled';
  end if;
 elsif a in('schedule','watch') then
  if (x->>'baseVersion')::integer<>t.head_version then raise exception 'STALE_TRIP_VERSION';end if;
  if not exists(select 1 from pg_timezone_names where name=x->>'timeZone') or not exists(select 1 from public.trip_days where trip_id=t.id and time_zone=x->>'timeZone') then raise exception 'INVALID_INPUT';end if;
  b:=notification_private.source(u,t,x->'source'->>'kind',(x->'source'->>'sourceId')::uuid);
  if b is null or b->'source' is distinct from x->'source' then raise exception 'SOURCE_UNAVAILABLE';end if;
  ex:=notification_private.time(x->'expiresAt');
  if ex<=clock_timestamp() or ex>notification_private.time(b->'expiresAt') then raise exception 'SOURCE_UNAVAILABLE';end if;
  if a='watch' then
   if exists(select 1 from notification_private.watches where id=rid) or (select count(*) from notification_private.watches where owner_id=u and trip_id=t.id and status='active')>=50 then raise exception 'INVALID_INPUT';end if;
   insert into notification_private.watches(id,owner_id,trip_id,session_id,epoch,base_version,source,baseline_digest,expires_at,time_zone,quiet_hours,consent_at)
   values(rid,u,t.id,ma.session_id,ma.epoch,t.head_version,x->'source',x->'source'->>'contentDigest',ex,x->>'timeZone',x->'quietHours',clock_timestamp());
  else
   due:=notification_private.time(x->'dueAt');
   if due<=clock_timestamp() or due>clock_timestamp()+interval '365 days' or (select count(*) from notification_private.reminders where owner_id=u and trip_id=t.id and status='saved')>=50 or exists(select 1 from notification_private.reminders where id=rid) then raise exception 'INVALID_INPUT';end if;
   if x->>'purpose'='user_set_travel' then
    ur:=rid;
    insert into public.travel_reminders(id,owner_id,trip_id,session_id,base_version,reason,due_at,expires_at,time_zone) values(rid,u,t.id,ma.session_id,t.head_version,x->>'reason',due,ex,x->>'timeZone');
   end if;
   insert into notification_private.reminders(id,owner_id,trip_id,user_reminder_id,operation_id,session_id,epoch,base_version,purpose,source,reason,due_at,expires_at,time_zone,quiet_hours,consent_at)
    values(rid,u,t.id,ur,op,ma.session_id,ma.epoch,t.head_version,x->>'purpose',x->'source',x->>'reason',due,ex,x->>'timeZone',x->'quietHours',clock_timestamp());
   insert into notification_private.outbox(reminder_id) values(rid);
  end if;
 elsif a in('cancel','complete') then
  update notification_private.reminders set status=case a when 'cancel' then 'cancelled' else 'completed' end,revision=revision+1 where id=rid and owner_id=u and trip_id=t.id and status='saved' returning revision into rv;
  if rv is null then select revision into rv from notification_private.reminders where id=rid and owner_id=u and trip_id=t.id;if not found then raise exception 'SOURCE_UNAVAILABLE';end if;end if;
  update public.travel_reminders set status=case a when 'cancel' then 'cancelled' else 'completed' end where id=rid and owner_id=u and trip_id=t.id and status='saved';
  update notification_private.outbox set state='suppressed' where reminder_id=rid and state='scheduled';
 elsif a='unwatch' then
  update notification_private.watches set status='cancelled',stop_reason='user',revision=revision+1 where id=rid and owner_id=u and trip_id=t.id returning revision into rv;
  if rv is null then select revision into rv from notification_private.watches where id=rid and owner_id=u and trip_id=t.id;if not found then raise exception 'SOURCE_UNAVAILABLE';end if;end if;
  update notification_private.reminders r set status='cancelled',revision=revision+1 from notification_private.outbox o where o.reminder_id=r.id and o.watch_id=rid and r.status='saved';
  update notification_private.outbox set state='suppressed' where watch_id=rid and state='scheduled';
 elsif a='dismiss' then
  steps:=notification_private.next_steps(u,t);select value into step from jsonb_array_elements(steps->'items') where value->>'id'=rid::text and value->'source'=x->'source';if step is null then raise exception 'SOURCE_UNAVAILABLE';end if;
  b:=jsonb_build_object('source',step->'source');
  if b is null or b->'source' is distinct from x->'source' or rid<>notification_private.opaque(notification_private.hash(jsonb_build_object('owner',u,'trip',t.id,'kind',x->'source'->>'kind','sourceId',x->'source'->>'sourceId','semantic',b->'source'->>'contentDigest'))) then raise exception 'SOURCE_UNAVAILABLE';end if;
  insert into notification_private.dismissals(owner_id,trip_id,next_step_id,source_kind,source_id,semantic_digest) values(u,t.id,rid,x->'source'->>'kind',(x->'source'->>'sourceId')::uuid,x->'source'->>'contentDigest') on conflict do nothing;
 end if;
 ack:=jsonb_build_object('operationId',op,'action',a,'requestDigest',dg,'resultId',rid,'revision',rv,'terminal',true,'outcome','applied');
 insert into notification_private.operations(owner_id,operation_id,trip_id,action,request_digest,receipt) values(u,op,t.id,a,dg,ack);
 return notification_private.view(u,t,ack);
exception when lock_not_available then raise exception 'SOURCE_UNAVAILABLE';when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range or check_violation or unique_violation then raise exception 'INVALID_INPUT';end $$;
-- Service scope never impersonates the ordinary actor.
create function notification_private.service() returns void language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'service_role' or auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'UNAUTHENTICATED';end if;
end $$;
create function notification_private.current(r notification_private.reminders,t public.trips) returns boolean language plpgsql security definer set search_path='' as $$declare b jsonb;begin
 if r.status<>'saved' or r.base_version<>t.head_version or r.expires_at<=clock_timestamp() or not notification_private.trip_live(t)
  or not exists(select 1 from identity_private.mobile_accounts where owner_id=r.owner_id and session_id=r.session_id and epoch=r.epoch)
  or not exists(select 1 from auth.sessions where id=r.session_id and user_id=r.owner_id)
  or not exists(select 1 from public.trip_days where trip_id=t.id and time_zone=r.time_zone)
  or r.user_reminder_id is not null and not exists(select 1 from public.travel_reminders where id=r.user_reminder_id and status='saved')
  then return false;end if;
 if exists(select 1 from notification_private.outbox o join notification_private.watches w on w.id=o.watch_id where o.reminder_id=r.id and ((w.status<>'active' and not(w.stop_reason='recheck' and o.recheck_receipt_id is not null)) or w.expires_at<=clock_timestamp() or w.session_id<>r.session_id or w.epoch<>r.epoch)) then return false;end if;
 b:=notification_private.source(r.owner_id,t,r.source->>'kind',(r.source->>'sourceId')::uuid,exists(select 1 from notification_private.outbox where reminder_id=r.id and recheck_receipt_id is not null));
 if exists(select 1 from notification_private.outbox where reminder_id=r.id and recheck_receipt_id is not null and (recheck_receipt_id::text is distinct from b->>'recheckReceiptId' or recheck_review_digest is distinct from b->>'recheckReviewDigest')) then return false;end if;
 return b is not null and b->'source'=r.source and notification_private.time(b->'expiresAt')>=r.expires_at;
end $$;
create function notification_private.attempt_receipt(a notification_private.attempts) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('kind','receipt','notificationId',a.notification_id,'attemptId',a.attempt_id,'state',a.state,'outcome',a.outcome)$$;
create function notification_private.outcome(v jsonb,a uuid) returns boolean language plpgsql immutable set search_path='' as $$begin
 if v->>'kind'='accepted' then return notification_private.exact(v,array['kind','apnsId','acceptedAt']) and v->>'apnsId'=a::text and notification_private.time(v->'acceptedAt') is not null;
 elsif v->>'kind'='unknown' then return notification_private.exact(v,array['kind','code']) and v->>'code'='ACK_UNKNOWN';
 elsif v->>'kind'='error' then return notification_private.exact(v,array['kind','code']) and v->>'code' in('TOKEN_REVOKED','PROVIDER_REJECTED','TRANSPORT_UNAVAILABLE');end if;return false;
end $$;
create function public.dispatch_travel_notification_v2(p_notification uuid,p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r notification_private.reminders%rowtype;t public.trips%rowtype;o notification_private.outbox%rowtype;d notification_private.devices%rowtype;a notification_private.attempts%rowtype;cfg notification_private.settings%rowtype;ts timestamptz;aid uuid;
begin
 perform notification_private.service();
 if p_action not in('begin','finish','read') or not notification_private.uuid(p_input->'attemptId') or not notification_private.exact(p_input,case when p_action='finish' then array['attemptId','deviceRevision','outcome'] else array['attemptId'] end) then raise exception 'INVALID_INPUT';end if;
 aid:=(p_input->>'attemptId')::uuid;
 select * into cfg from notification_private.settings where singleton for share;
 -- Disabled never returns a token or grants a lease. Receipt recovery is permitted.
 if p_action='begin' and not cfg.enabled then return jsonb_build_object('kind','blocked');end if;
 select q.* into r from notification_private.reminders q join notification_private.outbox ob on ob.reminder_id=q.id where ob.id=p_notification;if not found then return jsonb_build_object('kind','blocked');end if;
 perform 1 from auth.users where id=r.owner_id for key share;
 perform 1 from identity_private.mobile_accounts where owner_id=r.owner_id for update;
 perform 1 from auth.sessions where id=r.session_id and user_id=r.owner_id for share;
 t:=notification_private.lock_scope(r.owner_id,r.trip_id);
 select * into r from notification_private.reminders where id=r.id;
 select * into o from notification_private.outbox where id=p_notification;
 select * into a from notification_private.attempts where notification_id=o.id for update;
 if a.notification_id is not null then
  select * into d from notification_private.devices where id=a.device_id;
  if a.attempt_id<>aid then return jsonb_build_object('kind','blocked');end if;
  if p_action='finish' then
   if not notification_private.integer(p_input->'deviceRevision') or (p_input->>'deviceRevision')::integer<>a.device_revision or not coalesce(notification_private.outcome(p_input->'outcome',aid),false) then raise exception 'INVALID_INPUT';end if;
   -- First known exact provider outcome wins; cancellation does not erase it.
   if a.outcome is null or a.state='unknown' then
    update notification_private.attempts set state=p_input->'outcome'->>'kind',outcome=p_input->'outcome' where notification_id=o.id returning * into a;
    update notification_private.outbox set state=a.state,outcome=a.outcome where id=o.id;
    if a.outcome->>'code'='TOKEN_REVOKED' then
     update notification_private.devices set active=false,revision=revision+1 where id=a.device_id and revision=a.device_revision;
     update notification_private.outbox set state='suppressed' where device_id=a.device_id and device_revision=a.device_revision and state='scheduled';
    end if;
   elsif a.outcome is distinct from p_input->'outcome' then return jsonb_build_object('kind','blocked');end if;
  elsif a.state='attempting' and a.lease_expires_at<=clock_timestamp() then
   update notification_private.attempts set state='unknown',outcome='{"kind":"unknown","code":"ACK_UNKNOWN"}' where notification_id=o.id returning * into a;
   update notification_private.outbox set state=a.state,outcome=a.outcome where id=o.id;
  end if;
  if p_action='begin' then return jsonb_build_object('kind','blocked');end if;
  if a.state='attempting' then return jsonb_build_object('kind','blocked');end if;
  return notification_private.attempt_receipt(a);
 end if;
 if p_action<>'begin' or o.state<>'scheduled' then return jsonb_build_object('kind','blocked');end if;
 if not notification_private.current(r,t) then update notification_private.outbox set state='suppressed' where id=o.id;return jsonb_build_object('kind','blocked');end if;
 if r.due_at>clock_timestamp() or notification_private.in_quiet(r.quiet_hours,r.time_zone,clock_timestamp()) then return jsonb_build_object('kind','blocked');end if;
 select * into d from notification_private.devices where owner_id=r.owner_id and session_id=r.session_id and epoch=r.epoch and active and permission='authorized' and environment=cfg.environment and topic=cfg.topic and time_zone=r.time_zone order by updated_at desc,id limit 1;
 if not found or o.device_id is not null and (o.device_id<>d.id or o.device_revision<>d.revision) then update notification_private.outbox set state='suppressed' where id=o.id;return jsonb_build_object('kind','blocked');end if;
 ts:=clock_timestamp();
 insert into notification_private.attempts(notification_id,attempt_id,device_id,device_revision,state,authorized_at,lease_expires_at) values(o.id,aid,d.id,d.revision,'attempting',ts,least(ts+interval '5 seconds',r.expires_at));
 update notification_private.outbox set state='attempting',device_id=d.id,device_revision=d.revision where id=o.id;
 return jsonb_build_object('kind','attempt','notificationId',o.id,'attemptId',aid,'deviceRevision',d.revision,'token',d.token,'environment',d.environment,'topic',d.topic,'expiresAt',notification_private.stamp(r.expires_at),'authorizedAt',notification_private.stamp(ts),'leaseExpiresAt',notification_private.stamp(least(ts+interval '5 seconds',r.expires_at)));
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.poll_travel_notifications_v2(p_limit integer default 1) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare cfg notification_private.settings%rowtype;w notification_private.watches%rowtype;t public.trips%rowtype;r notification_private.reminders%rowtype;o notification_private.outbox%rowtype;b jsonb;rid uuid;ex timestamptz;did uuid;drv integer;n integer:=0;
begin
 perform notification_private.service();if p_limit is distinct from 1 then raise exception 'INVALID_INPUT';end if;
 select * into cfg from notification_private.settings where singleton for share;
 if not cfg.enabled then return jsonb_build_object('kind','idle');end if;
 select aa.notification_id into rid from notification_private.attempts aa where aa.state='attempting' and aa.lease_expires_at<=clock_timestamp() order by aa.lease_expires_at,aa.notification_id limit 1;
 if found then
  perform public.dispatch_travel_notification_v2(rid,'read',jsonb_build_object('attemptId',(select attempt_id from notification_private.attempts where notification_id=rid)));
  return jsonb_build_object('kind','idle');
 end if;
 -- Bounded one watch reconciliation; no new fetcher, publication or Task execution.
 select * into w from notification_private.watches where status='active' and next_check_at<=clock_timestamp() order by next_check_at,id limit 1;
 if found then
  perform 1 from auth.users where id=w.owner_id for key share;
  perform 1 from identity_private.mobile_accounts where owner_id=w.owner_id for update;
  perform 1 from auth.sessions where id=w.session_id and user_id=w.owner_id for share;
  t:=notification_private.lock_scope(w.owner_id,w.trip_id);
  select * into w from notification_private.watches where id=w.id;
  if w.status='active' then
   b:=notification_private.source(w.owner_id,t,'qualified_watch',(w.source->>'sourceId')::uuid,true);
   if w.expires_at<=clock_timestamp() or w.base_version<>t.head_version or b is null
    or not exists(select 1 from identity_private.mobile_accounts where owner_id=w.owner_id and session_id=w.session_id and epoch=w.epoch)
    or not exists(select 1 from auth.sessions where id=w.session_id and user_id=w.owner_id)
    or not exists(select 1 from public.trip_days where trip_id=t.id and time_zone=w.time_zone) then
    update notification_private.watches set status='cancelled',stop_reason='source_unavailable',revision=revision+1 where id=w.id;
    update notification_private.outbox set state='suppressed' where watch_id=w.id and state='scheduled';
   else
    if b->'source'->>'contentDigest'<>w.baseline_digest then
     rid:=gen_random_uuid();ex:=least(w.expires_at,notification_private.time(b->'expiresAt'),clock_timestamp()+interval '24 hours');
     if not exists(select 1 from notification_private.outbox where watch_id=w.id and semantic_digest=b->'source'->>'contentDigest') and ex>clock_timestamp() then
      insert into notification_private.reminders(id,owner_id,trip_id,operation_id,session_id,epoch,base_version,purpose,source,due_at,expires_at,time_zone,quiet_hours,consent_at)
       values(rid,w.owner_id,w.trip_id,rid,w.session_id,w.epoch,t.head_version,'qualified_watch',b->'source',clock_timestamp(),ex,w.time_zone,w.quiet_hours,w.consent_at);
      insert into notification_private.outbox(reminder_id,watch_id,semantic_digest,recheck_receipt_id,recheck_review_digest) values(rid,w.id,b->'source'->>'contentDigest',(b->>'recheckReceiptId')::uuid,b->>'recheckReviewDigest');
     end if;
     update notification_private.watches set baseline_digest=b->'source'->>'contentDigest',source=b->'source',revision=revision+1 where id=w.id;
    end if;
    update notification_private.watches set next_check_at=clock_timestamp()+interval '1 minute',status=case when b ? 'recheckReceiptId' then 'cancelled' else status end,stop_reason=case when b ? 'recheckReceiptId' then 'recheck' else stop_reason end where id=w.id;
   end if;
  end if;
  return jsonb_build_object('kind','idle');
 end if;
 -- One oldest due record, re-read after scope serialization. Suppression is terminal.
 select q.* into o from notification_private.outbox q join notification_private.reminders rr on rr.id=q.reminder_id where q.state='scheduled' and rr.due_at<=clock_timestamp() and not notification_private.in_quiet(rr.quiet_hours,rr.time_zone,clock_timestamp()) order by q.created_at,q.id limit 1;
 if not found then return jsonb_build_object('kind','idle');end if;
 select * into r from notification_private.reminders where id=o.reminder_id;
 perform 1 from auth.users where id=r.owner_id for key share;
 perform 1 from identity_private.mobile_accounts where owner_id=r.owner_id for update;
 perform 1 from auth.sessions where id=r.session_id and user_id=r.owner_id for share;
 t:=notification_private.lock_scope(r.owner_id,r.trip_id);
 select * into r from notification_private.reminders where id=r.id;
 select * into o from notification_private.outbox where id=o.id;
 if o.state<>'scheduled' then return jsonb_build_object('kind','idle');end if;
 if not notification_private.current(r,t) then update notification_private.outbox set state='suppressed' where id=o.id;return jsonb_build_object('kind','idle');end if;
 if notification_private.in_quiet(r.quiet_hours,r.time_zone,clock_timestamp()) then return jsonb_build_object('kind','idle');end if;
 select id,revision into did,drv from notification_private.devices where owner_id=r.owner_id and session_id=r.session_id and epoch=r.epoch and permission='authorized' and active and environment=cfg.environment and topic=cfg.topic and time_zone=r.time_zone order by updated_at desc,id limit 1;
 if did is null or o.device_id is not null and (o.device_id<>did or o.device_revision<>drv) then update notification_private.outbox set state='suppressed' where id=o.id;return jsonb_build_object('kind','idle');end if;
 update notification_private.outbox set device_id=did,device_revision=drv where id=o.id;
 return jsonb_build_object('kind','candidate','notificationId',o.id);
exception when lock_not_available then return jsonb_build_object('kind','idle');end $$;
create function public.resolve_travel_notification_v2(p_notification uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid:=notification_private.actor();r notification_private.reminders%rowtype;t public.trips%rowtype;o notification_private.outbox%rowtype;current boolean;
begin
 select rr.* into r from notification_private.reminders rr join notification_private.outbox ob on ob.reminder_id=rr.id where ob.id=p_notification and rr.owner_id=u;
 if not found or r.expires_at<=clock_timestamp() then raise exception 'SOURCE_UNAVAILABLE';end if;
 t:=notification_private.lock_scope(u,r.trip_id);
 select * into r from notification_private.reminders where id=r.id;
 current:=notification_private.current(r,t);
 return jsonb_build_object('version',2,'kind','resolved','notificationId',p_notification,'tripId',r.trip_id,'tripVersion',r.base_version,'source',r.source,'expiresAt',notification_private.stamp(r.expires_at),'current',current);
exception when lock_not_available then raise exception 'SOURCE_UNAVAILABLE';end $$;
-- Epoch/session changes invalidate recipients and queued work without erasing outcomes.
create function notification_private.mobile_changed() returns trigger language plpgsql security definer set search_path='' as $$begin
 if NEW.session_id is distinct from OLD.session_id or NEW.epoch is distinct from OLD.epoch then
  perform 1 from public.trips where owner_id=NEW.owner_id order by id for update;
  perform 1 from notification_private.devices where owner_id=NEW.owner_id order by id for update;
  perform 1 from notification_private.reminders where owner_id=NEW.owner_id order by id for update;
  update notification_private.devices set active=false,revision=revision+1 where owner_id=NEW.owner_id and active;
  update notification_private.watches set status='cancelled',revision=revision+1 where owner_id=NEW.owner_id and status='active';
  update notification_private.outbox o set state='suppressed' from notification_private.reminders r where r.id=o.reminder_id and r.owner_id=NEW.owner_id and o.state='scheduled';
 end if;return NEW;
end $$;
create trigger notification_mobile_changed after update on identity_private.mobile_accounts for each row execute function notification_private.mobile_changed();
-- Versioned private export page. Existing core export packages are unchanged/partial.
create function notification_private.export_metadata_v1(p_request uuid,p_lease uuid,p_generation integer,p_cursor jsonb,p_limit integer) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare j export_private.core_jobs_v1;all_rows jsonb;page jsonb;source_revision text;after_key text;last_key text;more boolean;
begin
 perform notification_private.service();
 if p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('kind','unavailable');end if;
 j:=export_private.lock_job_v1(p_request,true);if j is null or not export_private.live_lease_v1(j,p_lease,p_generation) then return jsonb_build_object('kind','unavailable');end if;
 select coalesce(jsonb_agg(x.row order by x.key),'[]') into all_rows from(
  select 'reminder:'||r.id key,jsonb_build_object('key','reminder:'||r.id,'domain','reminder','tripId',r.trip_id,'id',r.id,'baseVersion',r.base_version,'purpose',r.purpose,'source',r.source,'reason',r.reason,'dueAt',notification_private.stamp(r.due_at),'expiresAt',notification_private.stamp(r.expires_at),'timeZone',r.time_zone,'quietHours',r.quiet_hours,'consentAt',notification_private.stamp(r.consent_at),'status',coalesce(ur.status,r.status),'deliveryState',case when o.state='attempting' and exists(select 1 from notification_private.attempts aa where aa.notification_id=o.id and aa.lease_expires_at<=clock_timestamp()) then 'unknown' else o.state end,'outcome',case when o.state='attempting' and exists(select 1 from notification_private.attempts aa where aa.notification_id=o.id and aa.lease_expires_at<=clock_timestamp()) then '{"kind":"unknown","code":"ACK_UNKNOWN"}'::jsonb else o.outcome end) row
   from notification_private.reminders r join notification_private.outbox o on o.reminder_id=r.id left join public.travel_reminders ur on ur.id=r.user_reminder_id where r.owner_id=j.owner_id
  union all select 'watch:'||id,jsonb_build_object('key','watch:'||id,'domain','watch','tripId',trip_id,'id',id,'source',source,'baselineDigest',baseline_digest,'expiresAt',notification_private.stamp(expires_at),'timeZone',time_zone,'quietHours',quiet_hours,'consentAt',notification_private.stamp(consent_at),'status',status) from notification_private.watches where owner_id=j.owner_id
  union all select 'dismissal:'||next_step_id,jsonb_build_object('key','dismissal:'||next_step_id,'domain','dismissal','tripId',trip_id,'id',next_step_id,'sourceKind',source_kind,'sourceId',source_id,'semanticDigest',semantic_digest) from notification_private.dismissals where owner_id=j.owner_id
  union all select 'operation:'||operation_id,jsonb_build_object('key','operation:'||operation_id,'domain','operation','tripId',trip_id,'operationId',operation_id,'action',action,'requestDigest',request_digest,'receipt',receipt) from notification_private.operations where owner_id=j.owner_id
  union all select 'device:'||id,jsonb_build_object('key','device:'||id,'domain','device','deviceId',id,'revision',revision,'permission',permission,'active',active,'environment',environment,'timeZone',time_zone) from notification_private.devices where owner_id=j.owner_id
  order by key limit 10001
 ) x;
 if jsonb_array_length(all_rows)>10000 then return jsonb_build_object('kind','unavailable');end if;
 source_revision:=notification_private.hash(jsonb_build_object('schemaVersion','notification-metadata/1','owner',j.owner_id,'request',j.request_id,'generation',j.generation,'rows',all_rows));
 if p_cursor is not null then
  if not notification_private.exact(p_cursor,array['sourceRevision','afterKey']) or p_cursor->>'sourceRevision' is distinct from source_revision or jsonb_typeof(p_cursor->'afterKey') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(all_rows) x where x->>'key'=p_cursor->>'afterKey') then return jsonb_build_object('kind','stale');end if;after_key:=p_cursor->>'afterKey';
 end if;
 select coalesce(jsonb_agg(x order by x->>'key'),'[]') into page from(select value x from jsonb_array_elements(all_rows) where after_key is null or value->>'key'>after_key order by value->>'key' limit p_limit) q;
 last_key:=page->-1->>'key';more:=last_key is not null and exists(select 1 from jsonb_array_elements(all_rows)x where x->>'key'>last_key);
 return jsonb_build_object('kind','metadata','schemaVersion','notification-metadata/1','requestId',p_request,'generation',p_generation,'sourceRevision',source_revision,'items',page,'hasMore',more,'nextCursor',case when more then jsonb_build_object('sourceRevision',source_revision,'afterKey',last_key) else null end,'allUserDataCompleted',false);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');end $$;
-- Cascade handler: called only by separately authorized original deletion orchestration.
-- No owner supplied by an ordinary RPC and no automatic executor enrollment.
create function notification_private.delete_for_trip_v1(p_trip uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform notification_private.service();
 if not exists(select 1 from privacy_private.trip_deletions where trip_id=p_trip) then raise exception 'SOURCE_UNAVAILABLE';end if;
 delete from notification_private.operations where trip_id=p_trip;
 delete from notification_private.dismissals where trip_id=p_trip;
 delete from notification_private.reminders where trip_id=p_trip;
 delete from notification_private.watches where trip_id=p_trip;
end $$;
revoke all on all functions in schema notification_private from public,anon,authenticated,service_role;
revoke all on function public.travel_reminders_v2(uuid,text,jsonb),public.poll_travel_notifications_v2(integer),public.dispatch_travel_notification_v2(uuid,text,jsonb),public.resolve_travel_notification_v2(uuid) from public,anon,authenticated,service_role;

create function public.notification_metadata_export_v1(p_request uuid,p_lease uuid,p_generation integer,p_cursor jsonb,p_limit integer) returns jsonb language sql security definer set search_path='' as $$select notification_private.export_metadata_v1(p_request,p_lease,p_generation,p_cursor,p_limit)$$;
revoke all on function public.notification_metadata_export_v1(uuid,uuid,integer,jsonb,integer) from public,anon,authenticated,service_role;
revoke all on all functions in schema notification_private from public,anon,authenticated,service_role;
