-- PRIVATE CANDIDATE, not product append. Default denied until source + lifecycle
-- composition is reviewed. No original business writer or grant is changed.
create schema journey_measurement_private;
revoke all on schema journey_measurement_private from public,anon,authenticated,service_role;
alter default privileges in schema journey_measurement_private revoke execute on functions from public;
alter default privileges in schema journey_measurement_private revoke all on tables from public,anon,authenticated,service_role;

create table journey_measurement_private.configuration_v1 (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 notice_version text not null check(notice_version='journey-experience-measurement/2026-10-12'),
 schema_version text not null check(schema_version='journey-experience-measurement/1'),
 purpose text not null check(purpose='journey_experience_measurement'),
 lifecycle_composition text,
 cleanup_at timestamptz,
 check(lifecycle_composition is null or lifecycle_composition ~ '^[a-f0-9]{64}$')
);
-- No configured row, no enabled policy, no existing-user consent.
create table journey_measurement_private.consents_v1 (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 consent_id uuid not null unique,
 operation_id uuid not null,
 request_metadata_digest text not null check(request_metadata_digest ~ '^[a-f0-9]{64}$'),
 session_id uuid not null,
 mobile_epoch bigint not null check(mobile_epoch between 1 and 9007199254740991),
 notice_version text not null check(notice_version='journey-experience-measurement/2026-10-12'),
 entries text[] not null check(cardinality(entries) between 1 and 3 and entries <@ array['e1','e2','e3']::text[]),
 accepted_at timestamptz not null,
 expires_at timestamptz not null,
 revoked_at timestamptz,
 check(expires_at=accepted_at+interval '30 days'),
 check(revoked_at is null or revoked_at>=accepted_at)
);
create table journey_measurement_private.admissions_v1 (
 owner_id uuid not null references auth.users(id) on delete cascade,
 admission_id uuid not null,
 request_metadata_digest text not null check(request_metadata_digest ~ '^[a-f0-9]{64}$'),
 consent_id uuid not null references journey_measurement_private.consents_v1(consent_id) on delete cascade,
 entry text not null check(entry in('e1','e2','e3')),
 source_kind text not null check(source_kind in('service_task','native_entry')),
 source_id uuid not null,
 source_revision integer,
 source_ref jsonb not null,
 clock_origin jsonb not null,
 task_id uuid references turn_private.service_tasks(id) on delete cascade,
 goal_id uuid references turn_private.assistant_goals(id) on delete cascade,
 accepted_at timestamptz,
 received_at timestamptz not null,
 expires_at timestamptz not null,
 session_id uuid not null,
 mobile_epoch bigint not null,
 first_ever text not null check(first_ever in('proven','unknown')),
 primary key(owner_id,admission_id),
 unique(owner_id,consent_id,entry,source_kind,source_id,source_ref),
 check(expires_at=received_at+interval '30 days'),
 check(accepted_at<=received_at),
 check((source_kind='service_task' and task_id=source_id and source_revision is null)
  or (source_kind='native_entry' and accepted_at is null))
);
create index journey_measurement_admission_expiry_v1 on journey_measurement_private.admissions_v1(expires_at);
create table journey_measurement_private.reports_v1 (
 owner_id uuid not null,
 report_id uuid not null,
 request_metadata_digest text not null check(request_metadata_digest ~ '^[a-f0-9]{64}$'),
 admission_id uuid not null,
 signal jsonb not null check(jsonb_typeof(signal)='object' and octet_length(signal::text)<=2048),
 clock jsonb not null check(jsonb_typeof(clock)='object' and octet_length(clock::text)<=256),
 received_at timestamptz not null,
 expires_at timestamptz not null,
 primary key(owner_id,report_id),
 foreign key(owner_id,admission_id) references journey_measurement_private.admissions_v1(owner_id,admission_id) on delete cascade,
 check(expires_at<=received_at+interval '30 days')
);
create index journey_measurement_report_admission_v1 on journey_measurement_private.reports_v1(owner_id,admission_id);
create index journey_measurement_report_expiry_v1 on journey_measurement_private.reports_v1(expires_at);
create table journey_measurement_private.erasure_receipts_v1 (
 owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,
 consent_id uuid,
 state text not null check(state in('preview','incomplete','erased')),
 source_digest text,
 preview_digest text,
 request_metadata_digest text,
 erased_rows integer not null default 0 check(erased_rows between 0 and 10000),
 decided_at timestamptz not null,
 expires_at timestamptz not null,
 primary key(owner_id,operation_id),
 check(expires_at=decided_at+interval '30 days')
);
-- Inventory of derived managed copies, not a second D2/artifact engine. No
-- original data or crypto material is duplicated; unknown external ACK is kept
-- explicit. Source expiration may not be extended by making a copy.
create table journey_measurement_private.copy_obligations_v1 (
 owner_id uuid not null references auth.users(id) on delete cascade,
 copy_id uuid not null,
 generation integer not null check(generation between 1 and 3),
 kind text not null check(kind in('core_export','independent_journal','external_download')),
 core_request_id uuid,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 state text not null check(state in('pending','erased','unknown')),
 received_at timestamptz not null,
 expires_at timestamptz not null,
 primary key(owner_id,copy_id,generation),
 check(expires_at<=received_at+interval '30 days'),
 check((kind='core_export' and core_request_id=copy_id) or (kind<>'core_export' and core_request_id is null))
);
create index journey_measurement_copy_expiry_v1 on journey_measurement_private.copy_obligations_v1(expires_at);
create table journey_measurement_private.recovery_controls_v1 (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 control_id uuid not null unique,
 reconciliation_generation bigint not null check(reconciliation_generation between 1 and 9007199254740991),
 erasure_floor bigint not null check(erasure_floor between 0 and 9007199254740991),
 covered_from_at timestamptz not null,
 covered_through_at timestamptz not null,
 coverage_complete boolean not null default false,
 authority_received_at timestamptz not null,
 expires_at timestamptz not null,
 check(covered_from_at<=covered_through_at),
 check(expires_at<=authority_received_at+interval '30 days')
);
create table journey_measurement_private.journals_v1 (
 owner_id uuid not null references auth.users(id) on delete cascade,
 journal_id uuid not null,
 event_kind text not null check(event_kind in('withdrawal','erasure','source_expiry','copy_obligation','copy_ack')),
 authority_id uuid not null,
 floor bigint not null check(floor between 0 and 9007199254740991),
 authority_received_at timestamptz not null,
 expires_at timestamptz not null,
 primary key(owner_id,journal_id),
 unique(owner_id,event_kind,authority_id),
 check(expires_at<=authority_received_at+interval '30 days')
);
create index journey_measurement_journal_expiry_v1 on journey_measurement_private.journals_v1(expires_at);
alter table journey_measurement_private.configuration_v1 enable row level security;
alter table journey_measurement_private.consents_v1 enable row level security;
alter table journey_measurement_private.admissions_v1 enable row level security;
alter table journey_measurement_private.reports_v1 enable row level security;
alter table journey_measurement_private.erasure_receipts_v1 enable row level security;
alter table journey_measurement_private.copy_obligations_v1 enable row level security;
alter table journey_measurement_private.recovery_controls_v1 enable row level security;
alter table journey_measurement_private.journals_v1 enable row level security;
revoke all on all tables in schema journey_measurement_private from public,anon,authenticated,service_role;

create function journey_measurement_private.exact_v1(v jsonb,keys_n text[]) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and v ?& keys_n and not exists(select 1 from jsonb_object_keys(v) k where not k=any(keys_n)),false)
$$;
create function journey_measurement_private.uuid_v1(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',false)
$$;
create function journey_measurement_private.integer_v1(v jsonb,lo bigint,hi bigint) returns boolean
language plpgsql immutable set search_path='' as $$
begin return jsonb_typeof(v)='number' and (v::text)::numeric=trunc((v::text)::numeric) and (v::text)::numeric between lo and hi;
exception when others then return false;end $$;
create function journey_measurement_private.unique_json_v1(v json) returns boolean
language plpgsql immutable set search_path='' as $$
declare value_n json;count_n integer;distinct_n integer;
begin
 if json_typeof(v)='object' then
  select count(*),count(distinct key) into count_n,distinct_n from json_each(v);
  if count_n<>distinct_n then return false;end if;
  for value_n in select value from json_each(v) loop if journey_measurement_private.unique_json_v1(value_n) is not true then return false;end if;end loop;
 elsif json_typeof(v)='array' then
  for value_n in select value from json_array_elements(v) loop if journey_measurement_private.unique_json_v1(value_n) is not true then return false;end if;end loop;
 end if;
 return true;
exception when others then return false;
end $$;
create function journey_measurement_private.source_shape_v1(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare a jsonb:=v->'anchor';
begin
 if v->>'kind'='service_task' then
  return journey_measurement_private.exact_v1(v,array['kind','id','revision']) and journey_measurement_private.uuid_v1(v->'id') and v->'revision'='null'::jsonb;
 end if;
 if v->>'kind' is distinct from 'native_entry' or journey_measurement_private.exact_v1(v,array['kind','logicalId','entry','anchor']) is not true
  or journey_measurement_private.uuid_v1(v->'logicalId') is not true then return false;end if;
 if v->>'entry'='e2' then
  return journey_measurement_private.exact_v1(a,array['kind','tripId','tripVersion','medium'])
   and a->>'kind'='trip' and journey_measurement_private.uuid_v1(a->'tripId')
   and journey_measurement_private.integer_v1(a->'tripVersion',0,2147483647)
   and a->>'medium' in('pdf','screenshot');
 elsif v->>'entry'='e3' then
  return journey_measurement_private.exact_v1(a,array['kind','conversationId','goalId','goalVersion','parentMessageId','inputSequence'])
   and a->>'kind'='goal' and journey_measurement_private.uuid_v1(a->'conversationId')
   and journey_measurement_private.uuid_v1(a->'goalId') and journey_measurement_private.uuid_v1(a->'parentMessageId')
   and journey_measurement_private.integer_v1(a->'goalVersion',1,10000)
   and journey_measurement_private.integer_v1(a->'inputSequence',1,1000000)
   and v->'logicalId'=a->'goalId';
 end if;
 return false;
end $$;
create function journey_measurement_private.signal_shape_v1(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text:=v->>'kind';keys_n text[];
begin
 keys_n:=case k when 'accepted' then array['kind'] when 'zero_questions' then array['kind']
 when 'server_ready' then array['kind','artifact'] when 'presented' then array['kind','artifact','outcome']
 when 'writer' then array['kind','artifact','writer','operationId'] when 'declined' then array['kind','artifact','reason']
 when 'terminal' then array['kind','outcome'] when 'question' then array['kind','field','basis','questionId'] else null end;
 if keys_n is null or journey_measurement_private.exact_v1(v,keys_n) is not true then return false;end if;
 if v ? 'artifact' and (journey_measurement_private.exact_v1(v->'artifact',array['id','revision']) is not true
  or journey_measurement_private.uuid_v1(v->'artifact'->'id') is not true
  or journey_measurement_private.integer_v1(v->'artifact'->'revision',1,1000) is not true) then return false;end if;
 if k in('presented','terminal') and coalesce(v->>'outcome','') not in('completed','partial','blocked','technical_failure','unknown') then return false;end if;
 if k='declined' and coalesce(v->>'reason','') not in('not_useful','changed_need','other','unspecified') then return false;end if;
 if k='writer' and (coalesce(v->>'writer','') not in('directions_selected','directions_saved','decision_chosen','trip_confirmed')
  or journey_measurement_private.uuid_v1(v->'operationId') is not true) then return false;end if;
 if k='question' and (coalesce(v->>'field','') not in('city','comparisonTarget','durationDays','partySize','interests','pace','lodgingBudget','dates','mobilityConstraints')
  or coalesce(v->>'basis','') not in('already_known_applicable','genuinely_missing','user_changed','source_conflict','unknown')
  or journey_measurement_private.uuid_v1(v->'questionId') is not true) then return false;end if;
 return true;
end $$;
create function journey_measurement_private.clock_shape_v1(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(v->>'kind'='unknown' and journey_measurement_private.exact_v1(v,array['kind'])
 or v->>'kind'='local_elapsed' and journey_measurement_private.exact_v1(v,array['kind','processId','elapsedMs'])
 and journey_measurement_private.uuid_v1(v->'processId') and journey_measurement_private.integer_v1(v->'elapsedMs',0,2147483647),false)
$$;

alter table journey_measurement_private.reports_v1 add constraint measurement_signal_closed_v1
 check(journey_measurement_private.signal_shape_v1(signal) is true);
alter table journey_measurement_private.reports_v1 add constraint measurement_clock_closed_v1
 check(journey_measurement_private.clock_shape_v1(clock) is true);
create function journey_measurement_private.immutable_v1() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_MEASUREMENT_SOURCE';end $$;
create trigger journey_measurement_consent_immutable_v1 before update on journey_measurement_private.consents_v1
 for each row execute function journey_measurement_private.immutable_v1();
create trigger journey_measurement_admission_immutable_v1 before update on journey_measurement_private.admissions_v1
 for each row execute function journey_measurement_private.immutable_v1();
create trigger journey_measurement_report_immutable_v1 before update on journey_measurement_private.reports_v1
 for each row execute function journey_measurement_private.immutable_v1();

-- This check has no permissive fallback. Exact lifecycle composition and its
-- independent restore-floor hook are an integration dependency, never a flag
-- callers or service_role may assert. No configured row is installed here.
create function journey_measurement_private.ready_v1() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare supported_n boolean;
begin
 if to_regprocedure('journey_measurement_private.module_supported_v1()') is null then return false;end if;
 execute 'select journey_measurement_private.module_supported_v1()' into supported_n;
 if supported_n is not true or profile_data_private.schema_v1() is not true then return false;end if;
 if not exists(select 1 from journey_measurement_private.configuration_v1 c where c.enabled
  and c.cleanup_at>statement_timestamp()-interval '24 hours' and c.cleanup_at<=statement_timestamp()
  and c.lifecycle_composition is not null)
  or to_regprocedure('journey_measurement_private.installed_lifecycle_supported_v1()') is null then return false;end if;
 execute 'select journey_measurement_private.installed_lifecycle_supported_v1()' into supported_n;
 return supported_n is true;
exception when others then return false;
end $$;

create function journey_measurement_private.actor_v1(epoch_n bigint) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor_n jsonb;
begin
 -- Reuse ordinary Native session authority, not an email/research cohort or
 -- service-role owner parameter. Original native RPC checks replaced sessions.
 actor_n:=pdf_intake_private.actor_v1(epoch_n);
 if actor_n->>'subject' is distinct from auth.uid()::text then raise exception 'UNAUTHENTICATED';end if;
 if not pg_try_advisory_xact_lock(hashtextextended(auth.uid()::text,34)) then raise exception 'MEASUREMENT_CONFLICT';end if;
 return actor_n;
end $$;

-- E1 admission intentionally does not require result/finished/success. Genuine
-- other entry admission authorities must be composed before they are enabled.
create function journey_measurement_private.acceptance_v1(u uuid,entry_n text,source_n jsonb) returns timestamptz
language plpgsql volatile security definer set search_path='' as $$
declare t turn_private.service_tasks%rowtype;i turn_private.assistant_directions_intakes_v1%rowtype;
 m turn_private.assistant_messages%rowtype;g turn_private.assistant_goals%rowtype;
 a turn_private.assistant_conversations%rowtype;w turn_private.work%rowtype;
begin
 if journey_measurement_private.source_shape_v1(source_n) is not true then return null;end if;
 if entry_n<>'e1' or source_n->>'kind'<>'service_task' then return null;end if;
 select * into t from turn_private.service_tasks where id=(source_n->>'id')::uuid and owner_id=u for share nowait;
 if not found then return null;end if;
 select * into i from turn_private.assistant_directions_intakes_v1 where task_id=t.id and owner_id=u for share nowait;
 if not found or i.task_turn_id is distinct from t.goal_turn_id then return null;end if;
 select * into m from turn_private.assistant_messages where id=i.message_id and owner_id=u;
 select * into g from turn_private.assistant_goals where id=i.goal_id and owner_id=u;
 select * into a from turn_private.assistant_conversations where id=i.conversation_id and owner_id=u;
 select * into w from turn_private.work where turn_id=i.task_turn_id and owner_id=u;
 -- Same original source qualification, intentionally without work success/
 -- result availability or cancelled/quarantined outcome filters.
 if m.id is null or g.id is null or a.id is null or w.turn_id is null
  or m.conversation_id<>a.id or m.goal_id<>g.id or g.conversation_id<>a.id
  or m.task_id is distinct from t.id or m.sequence<>i.message_sequence
  or g.scope_version<>i.goal_version or m.scope_version<>i.goal_version or g.trip_terminal
  or a.policy_id<>i.policy_id or m.policy_id<>i.policy_id or t.policy_id<>i.policy_id
  or a.consent_id<>i.consent_id or m.consent_id<>i.consent_id or t.consent_id<>i.consent_id
  or w.execution_mode<>'travel_directions_v1'
  or not exists(select 1 from turn_private.text_content c where c.turn_id=i.task_turn_id and c.owner_id=u and c.hidden_at is null and c.policy_id=i.policy_id and c.consent_id=i.consent_id)
  or not exists(select 1 from turn_private.service_task_turns l where l.turn_id=i.task_turn_id and l.task_id=t.id and l.owner_id=u)
  or not turn_private.text_policy_current(i.policy_id)
  or not exists(select 1 from turn_private.text_consents c where c.owner_id=u and c.policy_id=i.policy_id and c.consent_id=i.consent_id and c.revoked_at is null)
  or not turn_private.planning_policy_current(i.planning_policy_id)
  or not exists(select 1 from turn_private.planning_policies p where p.id=i.planning_policy_id and p.text_policy_id=i.policy_id)
  or not exists(select 1 from turn_private.planning_consents c where c.owner_id=u and c.policy_id=i.planning_policy_id and c.consent_id=i.planning_consent_id and c.revoked_at is null)
  or turn_private.explicit_intake_memory_binding_v1(u,i.memory_basis) is null
  or not exists(select 1 from auth.sessions s where s.id=w.session_id and s.user_id=u)
  or exists(select 1 from identity_private.mobile_accounts account_row where account_row.owner_id=u and account_row.session_id is distinct from w.session_id)
 then return null;end if;
 return t.created_at;
end $$;

-- This is authority for authenticated Native acceptance reporting only;
-- it grants no document/Trip/result/write authority and checks no success result.
create function journey_measurement_private.native_anchor_v1(u uuid,entry_n text,source_n jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare anchor_n jsonb:=source_n->'anchor';t public.trips%rowtype;
 c turn_private.assistant_conversations%rowtype;g turn_private.assistant_goals%rowtype;m turn_private.assistant_messages%rowtype;
begin
 if journey_measurement_private.source_shape_v1(source_n) is not true or source_n->>'kind'<>'native_entry' or source_n->>'entry'<>entry_n then return false;end if;
 if entry_n='e2' then
  t:=recovery_private.trip_v1(u,(anchor_n->>'tripId')::uuid);
  if t.id is null then return false;end if;
  perform 1 from public.trips where id=t.id and owner_id=u and head_version=(anchor_n->>'tripVersion')::integer for share nowait;
  return found;
 elsif entry_n='e3' then
  select * into c from turn_private.assistant_conversations where id=(anchor_n->>'conversationId')::uuid and owner_id=u for share nowait;
  if not found or not turn_private.text_policy_current(c.policy_id)
   or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null) then return false;end if;
  select * into g from turn_private.assistant_goals where id=(anchor_n->>'goalId')::uuid and owner_id=u and conversation_id=c.id for share nowait;
  if not found or g.trip_terminal or g.scope_version<>(anchor_n->>'goalVersion')::integer then return false;end if;
  select * into m from turn_private.assistant_messages where owner_id=u and conversation_id=c.id and goal_id=g.id order by sequence desc limit 1 for share nowait;
  return coalesce(m.id=(anchor_n->>'parentMessageId')::uuid and m.sequence=(anchor_n->>'inputSequence')::bigint
   and m.scope_version=g.scope_version and m.policy_id=c.policy_id and m.consent_id=c.consent_id,false);
 end if;
 return false;
end $$;

create function journey_measurement_private.consent_current_v1(u uuid,consent_n uuid,entry_n text) returns boolean
language sql volatile security definer set search_path='' as $$
 select journey_measurement_private.ready_v1() and exists(select 1 from journey_measurement_private.consents_v1 c
 where c.owner_id=u and c.consent_id=consent_n and c.revoked_at is null
 and c.accepted_at<=clock_timestamp() and c.expires_at>clock_timestamp() and entry_n=any(c.entries)
 and c.session_id::text=auth.jwt()->>'session_id'
 and exists(select 1 from identity_private.mobile_accounts a where a.owner_id=u and a.session_id=c.session_id and a.epoch=c.mobile_epoch))
$$;
create function journey_measurement_private.admission_current_v1(a journey_measurement_private.admissions_v1) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare source_n jsonb;accepted_n timestamptz;
begin
 source_n:=a.source_ref;
 if a.source_kind='native_entry' then
  return a.expires_at>clock_timestamp() and a.session_id::text=auth.jwt()->>'session_id'
   and journey_measurement_private.consent_current_v1(a.owner_id,a.consent_id,a.entry)
   and journey_measurement_private.native_anchor_v1(a.owner_id,a.entry,source_n);
 end if;
 accepted_n:=journey_measurement_private.acceptance_v1(a.owner_id,a.entry,source_n);
 return coalesce(a.expires_at>clock_timestamp() and a.session_id::text=auth.jwt()->>'session_id'
  and journey_measurement_private.consent_current_v1(a.owner_id,a.consent_id,a.entry)
  and accepted_n=a.accepted_at,false);
end $$;

create function journey_measurement_private.artifact_current_v1(a journey_measurement_private.admissions_v1,ref_n jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare artifact_n turn_private.result_artifacts%rowtype;r turn_private.result_revisions%rowtype;
begin
 select * into artifact_n from turn_private.result_artifacts where owner_id=a.owner_id and id=(ref_n->>'id')::uuid and lifecycle='active' for share nowait;
 if not found or artifact_n.current_revision is distinct from (ref_n->>'revision')::integer then return false;end if;
 if a.entry='e1' and artifact_n.task_id is distinct from a.task_id then return false;end if;
 if a.entry='e3' and (artifact_n.goal_id is distinct from (a.source_ref->'anchor'->>'goalId')::uuid
  or artifact_n.input_message_id is distinct from (a.source_ref->'anchor'->>'parentMessageId')::uuid) then return false;end if;
 if a.entry='e2' then return false;end if; -- not a fabricated Trip/PDF result association
 select * into r from turn_private.result_revisions where artifact_id=artifact_n.id and owner_id=a.owner_id and revision=artifact_n.current_revision for share nowait;
 if not found or turn_private.result_state_v2(artifact_n,r)->>'current' is distinct from 'true' then return false;end if;
 if a.entry='e3' and (r.goal_version is distinct from (a.source_ref->'anchor'->>'goalVersion')::integer
  or r.input_sequence is distinct from (a.source_ref->'anchor'->>'inputSequence')::bigint) then return false;end if;
 -- Useful directions/decision bodies must pass their original closed validators;
 -- an arbitrary pointer, registration, OCR or empty result is not a first value.
 return coalesce(turn_private.valid_travel_directions_v1(r.content) or turn_private.valid_comparison_v1(r.content)
  or r.content->>'schemaVersion'='decision/1' and r.content->>'state' in('pending','chosen'),false);
end $$;

create function journey_measurement_private.writer_current_v1(a journey_measurement_private.admissions_v1,s jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare o turn_private.directions_operations_v1%rowtype;r turn_private.result_revisions%rowtype;
 previous_n turn_private.result_revisions%rowtype;artifact_n turn_private.result_artifacts%rowtype;
begin
 if journey_measurement_private.artifact_current_v1(a,s->'artifact') is not true then return false;end if;
 select * into artifact_n from turn_private.result_artifacts where id=(s->'artifact'->>'id')::uuid and owner_id=a.owner_id;
 select * into r from turn_private.result_revisions where artifact_id=artifact_n.id and owner_id=a.owner_id and revision=(s->'artifact'->>'revision')::integer;
 if s->>'writer' in('directions_selected','directions_saved') then
  select * into o from turn_private.directions_operations_v1 where owner_id=a.owner_id and operation_id=(s->>'operationId')::uuid for share nowait;
  return coalesce(not o.erased and o.artifact_id=artifact_n.id and o.result_revision=r.revision
   and (a.entry='e1' or o.created_at>=a.received_at)
   and o.expected_revision+1=o.result_revision and o.task_turn_id=r.task_turn_id
   and o.action=case s->>'writer' when 'directions_selected' then 'choose' else 'save' end
   and o.receipt=jsonb_build_object('kind',case o.action when 'choose' then 'selected' else 'saved' end,
    'artifactId',artifact_n.id,'revision',r.revision,'reused',false)
   and o.output_content_digest=encode(sha256(convert_to(r.content::text,'UTF8')),'hex')
   and r.content->'selectedDirectionId'<>'null'::jsonb
   and (o.action='choose' and r.content->'draft'='null'::jsonb or o.action='save' and r.content->'draft'<>'null'::jsonb),false);
 elsif s->>'writer'='decision_chosen' then
  select * into previous_n from turn_private.result_revisions where artifact_id=r.artifact_id and revision=r.revision-1 and owner_id=a.owner_id;
  return coalesce(r.idempotency_key=(s->>'operationId')::uuid and (a.entry='e1' or r.created_at>=a.received_at) and r.content->>'schemaVersion'='decision/1'
   and r.content->>'state'='chosen' and previous_n.content->>'schemaVersion'='decision/1'
   and r.content->'comparisonRef'=previous_n.content->'comparisonRef' and r.content->>'chosenOptionId' is not null,false);
 end if;
 -- Trip confirmation needs its exact original Proposal+event/source adapter,
 -- not a selected direction or caller success bit. No unsupported mapping.
 return false;
end $$;

create function journey_measurement_private.cap_v1(u uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare count_n bigint;bytes_n bigint;
begin
 select count(*),coalesce(sum(octet_length(a::text)),0) into count_n,bytes_n
 from (select to_jsonb(a) a from journey_measurement_private.admissions_v1 a where owner_id=u
 union all select to_jsonb(r) from journey_measurement_private.reports_v1 r where owner_id=u
 union all select to_jsonb(c) from journey_measurement_private.consents_v1 c where owner_id=u
 union all select to_jsonb(e) from journey_measurement_private.erasure_receipts_v1 e where owner_id=u
 union all select to_jsonb(c) from journey_measurement_private.copy_obligations_v1 c where owner_id=u
 union all select to_jsonb(c) from journey_measurement_private.recovery_controls_v1 c where owner_id=u
 union all select to_jsonb(c) from journey_measurement_private.journals_v1 c where owner_id=u) q;
 if count_n>10000 or bytes_n>1000000 then raise exception 'MEASUREMENT_CAPACITY';end if;
end $$;

-- Profile D2 suffix source candidate. Caller is only a private reviewed core
-- lease wrapper; no public owner parameter or second export engine is added.
create function journey_measurement_private.export_source_v1(u uuid,excluded_copy uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c jsonb;a jsonb;r jsonb;e jsonb;copies_n jsonb;controls_n jsonb;journals_n jsonb;value_n jsonb;n timestamptz:=clock_timestamp();
begin
 if u is null or not exists(select 1 from auth.users where id=u) then raise exception 'MEASUREMENT_SOURCE_UNAVAILABLE';end if;
 if not pg_try_advisory_xact_lock(hashtextextended(u::text,34)) then raise exception 'MEASUREMENT_CONFLICT';end if;
 perform journey_measurement_private.cap_v1(u);
 select coalesce(jsonb_agg(to_jsonb(x) order by consent_id),'[]') into c from journey_measurement_private.consents_v1 x where owner_id=u and expires_at>n;
 select coalesce(jsonb_agg(to_jsonb(x) order by admission_id),'[]') into a from journey_measurement_private.admissions_v1 x where owner_id=u and expires_at>n;
 select coalesce(jsonb_agg(to_jsonb(x) order by report_id),'[]') into r from journey_measurement_private.reports_v1 x where owner_id=u and expires_at>n;
 select coalesce(jsonb_agg(to_jsonb(x) order by operation_id),'[]') into e from journey_measurement_private.erasure_receipts_v1 x where owner_id=u and expires_at>n;
 select coalesce(jsonb_agg(to_jsonb(x) order by copy_id,generation),'[]') into copies_n from journey_measurement_private.copy_obligations_v1 x where owner_id=u and expires_at>n and copy_id is distinct from excluded_copy;
 select coalesce(jsonb_agg(to_jsonb(x) order by control_id),'[]') into controls_n from journey_measurement_private.recovery_controls_v1 x where owner_id=u and expires_at>n;
 select coalesce(jsonb_agg(to_jsonb(x) order by journal_id),'[]') into journals_n from journey_measurement_private.journals_v1 x where owner_id=u and expires_at>n and authority_id is distinct from excluded_copy;
 value_n:=jsonb_build_object('schemaVersion','journey-experience-measurement/1','ownerId',u,
  'consents',c,'admissions',a,'reports',r,'erasureReceipts',e,'copyObligations',copies_n,'recoveryControls',controls_n,'journals',journals_n,
  'sourceRows',jsonb_build_object('consents',jsonb_array_length(c),'admissions',jsonb_array_length(a),
   'reports',jsonb_array_length(r),'erasureReceipts',jsonb_array_length(e),'copyObligations',jsonb_array_length(copies_n),'recoveryControls',jsonb_array_length(controls_n),'journals',jsonb_array_length(journals_n)));
 if octet_length(value_n::text)>1000000 then raise exception 'MEASUREMENT_CAPACITY';end if;
 return value_n;
end $$;

create function journey_measurement_private.export_source_v1(u uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 select journey_measurement_private.export_source_v1(u,null)
$$;

create function journey_measurement_private.record_core_copy_v1(committed export_private.core_jobs_v1,item jsonb) returns void
language plpgsql volatile security definer set search_path='' as $$
declare j export_private.core_jobs_v1;m jsonb;parent_expiry timestamptz;rows_n integer;
begin
 select * into j from export_private.core_jobs_v1 where request_id=committed.request_id for share nowait;
 if not found or to_jsonb(j) is distinct from to_jsonb(committed) or j.state not in('ready_partial','ready_complete')
  or not exists(select 1 from export_private.core_artifacts_v1 where request_id=j.request_id and owner_id=j.owner_id)
  then raise exception 'MEASUREMENT_COPY_UNQUALIFIED';end if;
 m:=item->'journeyMeasurement';
 if m is distinct from journey_measurement_private.export_source_v1(j.owner_id,j.request_id) then raise exception 'MEASUREMENT_COPY_UNQUALIFIED';end if;
 select coalesce(sum(value::text::integer),0) into rows_n from jsonb_each(m->'sourceRows');
 if rows_n=0 then return;end if;
 select min((v->>'expires_at')::timestamptz) into parent_expiry from (
  select value v from jsonb_array_elements(m->'consents') union all select value from jsonb_array_elements(m->'admissions')
  union all select value from jsonb_array_elements(m->'reports') union all select value from jsonb_array_elements(m->'erasureReceipts')
  union all select value from jsonb_array_elements(m->'copyObligations')
 ) parents;
 -- A copied inventory row must not be part of its own circular source digest.
 -- Original managed profile digest/provenance stays the full snapshot identity.
 if parent_expiry is null or parent_expiry<=clock_timestamp() or j.artifact_expires_at>parent_expiry then raise exception 'MEASUREMENT_COPY_EXPIRY';end if;
 insert into journey_measurement_private.copy_obligations_v1 values(j.owner_id,j.request_id,j.generation,'core_export',j.request_id,
  notification_private.hash(jsonb_build_object('snapshot',jsonb_build_array(item))),'pending',j.completed_at,j.artifact_expires_at);
 perform journey_measurement_private.cap_v1(j.owner_id);
end $$;

-- Only own registered new-domain managed copies are erased. This uses the
-- existing Core expiry effect, with original NOWAIT/fence checks intact. No
-- receipt from an old Profile/Turn erasure is borrowed as this domain's proof.
create function journey_measurement_private.erase_core_copies_v1(u uuid,deadline_n timestamptz default null,max_rows_n integer default 100) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare c journey_measurement_private.copy_obligations_v1%rowtype;j export_private.core_jobs_v1%rowtype;removed_n integer:=0;
begin
 for c in select * from journey_measurement_private.copy_obligations_v1 where owner_id=u and state<>'erased' and (deadline_n is null or expires_at<=deadline_n) order by copy_id,generation limit least(100,greatest(0,max_rows_n)) for update nowait loop
  if c.kind<>'core_export' then
   if deadline_n is not null then continue;end if;raise exception 'MEASUREMENT_EXTERNAL_COPY_UNKNOWN';end if;
  select * into j from export_private.core_jobs_v1 where request_id=c.core_request_id and owner_id=u for update nowait;
  if not found then raise exception 'MEASUREMENT_COPY_UNQUALIFIED';end if;
  if j.generation<>c.generation or not exists(select 1 from export_private.profile_snapshot_provenance_v1 p
   where p.request_id=j.request_id and p.generation=j.generation and p.owner_id=u and p.source_digest=c.source_digest)
   then raise exception 'MEASUREMENT_COPY_UNQUALIFIED';end if;
  delete from export_private.core_tickets_v1 where request_id=j.request_id;
  delete from export_private.core_artifacts_v1 where request_id=j.request_id and owner_id=u;
  update export_private.core_jobs_v1 set state='expired',lease_id=null,lease_expires_at=null,artifact_digest=null,
   artifact_bytes=null,artifact_expires_at=null,modules='[]' where request_id=j.request_id and owner_id=u;
  if exists(select 1 from export_private.core_artifacts_v1 where request_id=j.request_id)
   or exists(select 1 from export_private.core_tickets_v1 where request_id=j.request_id)
   or exists(select 1 from export_private.core_jobs_v1 where request_id=j.request_id and state<>'expired') then raise exception 'MEASUREMENT_COPY_UNKNOWN';end if;
  delete from journey_measurement_private.copy_obligations_v1 where owner_id=u and copy_id=c.copy_id and generation=c.generation;
  removed_n:=removed_n+1;
 end loop;
 return removed_n;
end $$;

create function journey_measurement_private.erase_v1(u uuid,operation_n uuid,consent_n uuid,request_digest_n text) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare parent_expiry_n timestamptz;rows_n integer;copy_rows_n integer:=0;state_n text:='erased';now_n timestamptz:=clock_timestamp();old_n journey_measurement_private.erasure_receipts_v1%rowtype;
begin
 select * into old_n from journey_measurement_private.erasure_receipts_v1 where owner_id=u and operation_id=operation_n for update;
 if found and old_n.state='erased' then
  if old_n.expires_at<=now_n or old_n.consent_id is distinct from consent_n or old_n.request_metadata_digest is distinct from request_digest_n then raise exception 'MEASUREMENT_CONFLICT';end if;
  return old_n.erased_rows;
 end if;
 select (select count(*) from journey_measurement_private.admissions_v1 where owner_id=u)
  +(select count(*) from journey_measurement_private.reports_v1 where owner_id=u)
  +(select count(*) from journey_measurement_private.consents_v1 where owner_id=u) into rows_n;
 if rows_n>10000 then raise exception 'MEASUREMENT_CAPACITY';end if;
 parent_expiry_n:=least(now_n+interval '30 days',coalesce((select expires_at from journey_measurement_private.consents_v1 where owner_id=u),now_n+interval '30 days'));
 delete from journey_measurement_private.consents_v1 where owner_id=u;
 delete from journey_measurement_private.journals_v1 where owner_id=u and authority_id<>operation_n;
 perform journey_measurement_private.record_floor_v1(u,operation_n,'erasure',now_n,parent_expiry_n);
 begin copy_rows_n:=journey_measurement_private.erase_core_copies_v1(u);
 exception when query_canceled or lock_not_available or raise_exception then state_n:='incomplete';end;
 if exists(select 1 from journey_measurement_private.copy_obligations_v1 where owner_id=u and state<>'erased') then state_n:='incomplete';end if;
 if old_n.state='incomplete' then rows_n:=old_n.erased_rows;end if;
 rows_n:=rows_n+copy_rows_n;
 -- Erase receipts contain no source content or task IDs. A new consent has a
 -- new accepted_at; old authority acceptance and queued consent IDs fail shut.
 insert into journey_measurement_private.erasure_receipts_v1(owner_id,operation_id,consent_id,state,request_metadata_digest,erased_rows,decided_at,expires_at)
 values(u,operation_n,consent_n,state_n,request_digest_n,rows_n,now_n,now_n+interval '30 days')
 on conflict(owner_id,operation_id) do update set state=excluded.state,request_metadata_digest=excluded.request_metadata_digest,erased_rows=excluded.erased_rows;
 perform journey_measurement_private.cap_v1(u);
 return rows_n;
end $$;

create function journey_measurement_private.aggregate_v1(u uuid,consent_n uuid,entry_n text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a journey_measurement_private.admissions_v1%rowtype;counts_n jsonb;
 all_n integer:=0;available_n integer:=0;first_n integer:=0;activated_n integer:=0;
 declined_n integer:=0;presented_n integer:=0;failure_n integer:=0;uncompleted_n integer:=0;unobservable_n integer:=0;
 repeated_n integer:=0;judgable_n integer:=0;unknownq_n integer:=0;zero_n integer:=0;
 completed_n integer:=0;partial_n integer:=0;blocked_n integer:=0;r record;member_n record;missing_n integer:=0;
begin
 if journey_measurement_private.consent_current_v1(u,consent_n,entry_n) is not true then raise exception 'MEASUREMENT_CONSENT_REQUIRED';end if;
 perform journey_measurement_private.cap_v1(u);
 -- All admitted sources are enumerated. No result join filters the denominator.
 for a in select * from journey_measurement_private.admissions_v1 where owner_id=u and consent_id=consent_n and entry=entry_n and expires_at>clock_timestamp() order by admission_id loop
  all_n:=all_n+1;
  if journey_measurement_private.admission_current_v1(a) is not true then unobservable_n:=unobservable_n+1;continue;end if;
  select count(*) filter(where signal->>'kind'='presented') presented,
   count(*) filter(where signal->>'kind'='declined') declined,
   count(*) filter(where signal->>'kind'='writer') writers,
   count(*) filter(where signal->>'kind'='terminal' and signal->>'outcome'='technical_failure') failures,
   count(*) filter(where signal->>'kind'='terminal' and signal->>'outcome'='completed') completed,
   count(*) filter(where signal->>'outcome'='partial') partial,
   count(*) filter(where signal->>'outcome'='blocked') blocked,
   count(*) filter(where signal->>'kind'='zero_questions') zeros,
   count(*) filter(where signal->>'kind'='question') questions
   into r from journey_measurement_private.reports_v1 where owner_id=u and admission_id=a.admission_id and expires_at>clock_timestamp();
  if r.presented>0 then
   available_n:=available_n+1;if a.first_ever='proven' then first_n:=first_n+1;end if;
  else unobservable_n:=unobservable_n+1;end if;
  if r.writers>0 and r.presented>0 then activated_n:=activated_n+1;end if;
  presented_n:=presented_n+r.presented;declined_n:=declined_n+r.declined;failure_n:=failure_n+r.failures;
  if r.completed>0 then completed_n:=completed_n+1;else uncompleted_n:=uncompleted_n+1;end if;
  if r.partial>0 then partial_n:=partial_n+1;end if;if r.blocked>0 then blocked_n:=blocked_n+1;end if;
  if r.zeros>0 and r.questions=0 then zero_n:=zero_n+1;end if;
  -- Closed question hints are not actual persistent question authority. Until
  -- that source is composed they are unknown, never measured zeros/repeats.
  unknownq_n:=unknownq_n+r.questions;
 end loop;
 if entry_n='e1' then
  -- Enumerate original qualified acceptance, including missing telemetry, before
  -- any result join. No measurement ticket/report is needed to enter this N.
  for member_n in select t.id,t.created_at from turn_private.service_tasks t
   join turn_private.assistant_directions_intakes_v1 i on i.task_id=t.id and i.owner_id=t.owner_id
   join journey_measurement_private.consents_v1 c on c.owner_id=t.owner_id and c.consent_id=consent_n
   where t.owner_id=u and t.created_at>=c.accepted_at and t.created_at<=clock_timestamp()
    and not exists(select 1 from journey_measurement_private.admissions_v1 a where a.owner_id=u and a.consent_id=consent_n and a.entry='e1' and a.task_id=t.id and a.expires_at>clock_timestamp())
   order by t.id limit 10001 loop
   if journey_measurement_private.acceptance_v1(u,'e1',jsonb_build_object('kind','service_task','id',member_n.id,'revision',null)) is not null then
    all_n:=all_n+1;missing_n:=missing_n+1;unobservable_n:=unobservable_n+1;uncompleted_n:=uncompleted_n+1;
    if all_n>10000 then raise exception 'MEASUREMENT_CAPACITY';end if;
   end if;
  end loop;
 end if;
 counts_n:=jsonb_build_object('allTasks',all_n,'availableTasks',available_n,'firstValueTasks',first_n,
  'activatedTasks',activated_n,'declinedOpportunities',declined_n,'presentedOpportunities',presented_n,
  'technicalFailures',failure_n,'uncompletedTasks',uncompleted_n,'unobservableTasks',unobservable_n,
  'unknownFirstEverTasks',missing_n+(select count(*) from journey_measurement_private.admissions_v1 where owner_id=u and consent_id=consent_n and entry=entry_n and expires_at>clock_timestamp() and first_ever='unknown'),'repeatQuestions',repeated_n,'judgableQuestions',judgable_n,
  'unknownQuestions',unknownq_n,'zeroQuestionTasks',zero_n,'unknownTimeTasks',all_n,
  'completedTasks',completed_n,'partialTasks',partial_n,'blockedTasks',blocked_n);
 return counts_n;
end $$;

create function public.native_journey_measurement_v1(p_action text,p_input_bytes text,p_expected_epoch bigint) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' set lock_timeout='250ms' as $$
declare v jsonb;keys_n text[];actor_n jsonb;u uuid;session_n uuid;now_n timestamptz:=clock_timestamp();
 base_n jsonb;consent_n journey_measurement_private.consents_v1%rowtype;
 admission_n journey_measurement_private.admissions_v1%rowtype;report_n journey_measurement_private.reports_v1%rowtype;
 erase_n journey_measurement_private.erasure_receipts_v1%rowtype;
 accepted_n timestamptz;source_n jsonb;s jsonb;reused_n boolean:=false;id_n uuid;rows_n integer;source_digest_n text;preview_digest_n text;
begin
 if p_input_bytes is null or octet_length(p_input_bytes)>8192 then raise exception 'INVALID_INPUT';end if;
 begin if journey_measurement_private.unique_json_v1(p_input_bytes::json) is not true then raise exception 'INVALID_INPUT';end if;v:=p_input_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 keys_n:=case p_action when 'policy' then array[]::text[] when 'consent' then array['operationId','noticeVersion','entries']
 when 'withdraw' then array['operationId','consentId'] when 'admit' then array['operationId','consentId','entry','source','clockOrigin']
 when 'receive' then array['consentId','admissionId','reportId','source','entry','signal','clock']
 when 'aggregate' then array['consentId','entry'] when 'preview' then array['operationId']
 when 'erase' then array['operationId','sourceDigest','previewDigest'] when 'recover' then array['operationId','mutationBytes'] else null end;
 if keys_n is null or journey_measurement_private.exact_v1(v,array['schemaVersion','purpose','action']||keys_n) is not true
  or v->>'schemaVersion' is distinct from 'journey-experience-measurement/1' or v->>'purpose' is distinct from 'journey_experience_measurement'
  or v->>'action' is distinct from p_action then raise exception 'INVALID_INPUT';end if;
 foreach source_digest_n in array array['operationId','consentId','admissionId','reportId'] loop
  if v ? source_digest_n and journey_measurement_private.uuid_v1(v->source_digest_n) is not true then raise exception 'INVALID_INPUT';end if;
 end loop;
 actor_n:=journey_measurement_private.actor_v1(p_expected_epoch);u:=auth.uid();session_n:=(actor_n->>'sessionId')::uuid;
 base_n:=jsonb_build_object('schemaVersion','journey-experience-measurement/1','purpose','journey_experience_measurement',
  'ownerId',u,'sessionId',session_n,'mobileEpoch',p_expected_epoch);
 select * into consent_n from journey_measurement_private.consents_v1 where owner_id=u for update;
 if p_action='policy' then
  return base_n||jsonb_build_object('kind','policy','enabled',journey_measurement_private.ready_v1(),
   'noticeVersion','journey-experience-measurement/2026-10-12','capabilities',array['receive','aggregate','export','erase','restoreFence','purge'],
   'capturedAt',floor(extract(epoch from now_n)*1000)::bigint,'expiresAt',floor(extract(epoch from now_n)*1000)::bigint+20000,
   'consent',case when consent_n.revoked_at is null and consent_n.expires_at>now_n and consent_n.session_id=session_n and consent_n.mobile_epoch=p_expected_epoch
    then jsonb_build_object('id',consent_n.consent_id,'entries',consent_n.entries,'noticeVersion',consent_n.notice_version,
     'receivedAt',floor(extract(epoch from consent_n.accepted_at)*1000)::bigint,'expiresAt',floor(extract(epoch from consent_n.expires_at)*1000)::bigint) else null end);
 end if;
 if p_action in('withdraw','erase','recover','preview') then
  if p_action='withdraw' then
   if consent_n.consent_id is distinct from (v->>'consentId')::uuid then
    select * into erase_n from journey_measurement_private.erasure_receipts_v1 where owner_id=u and operation_id=(v->>'operationId')::uuid and consent_id=(v->>'consentId')::uuid and state in('incomplete','erased') and expires_at>now_n;
    if not found then raise exception 'MEASUREMENT_CONFLICT';end if;
   end if;
   rows_n:=journey_measurement_private.erase_v1(u,(v->>'operationId')::uuid,(v->>'consentId')::uuid,encode(sha256(convert_to(p_input_bytes,'UTF8')),'hex'));
  elsif p_action='preview' then
   source_n:=journey_measurement_private.export_source_v1(u);source_digest_n:=encode(sha256(convert_to(source_n::text,'UTF8')),'hex');
   preview_digest_n:=encode(sha256(convert_to(jsonb_build_array(u,session_n,p_expected_epoch,v->>'operationId',source_digest_n)::text,'UTF8')),'hex');
   select sum(value::text::integer) into rows_n from jsonb_each(source_n->'sourceRows');
   insert into journey_measurement_private.erasure_receipts_v1(owner_id,operation_id,consent_id,state,source_digest,preview_digest,decided_at,expires_at)
   values(u,(v->>'operationId')::uuid,consent_n.consent_id,'preview',source_digest_n,preview_digest_n,now_n,now_n+interval '30 days') on conflict do nothing;
   select * into erase_n from journey_measurement_private.erasure_receipts_v1 where owner_id=u and operation_id=(v->>'operationId')::uuid;
   if erase_n.state<>'preview' or erase_n.source_digest<>source_digest_n or erase_n.preview_digest<>preview_digest_n or erase_n.decided_at+interval '30 seconds'<=now_n then raise exception 'MEASUREMENT_CONFLICT';end if;
   return base_n||jsonb_build_object('kind','preview','operationId',v->'operationId','scope','journey-experience-measurement/1',
    'sourceDigest',source_digest_n,'previewDigest',preview_digest_n,'capturedAt',floor(extract(epoch from erase_n.decided_at)*1000)::bigint,
    'expiresAt',floor(extract(epoch from erase_n.decided_at)*1000)::bigint+30000,'rows',rows_n);
  else
   if p_action='recover' then
    if jsonb_typeof(v->'mutationBytes') is distinct from 'string' or octet_length(v->>'mutationBytes')>4096 then raise exception 'INVALID_INPUT';end if;
    begin source_n:=(v->>'mutationBytes')::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
    if journey_measurement_private.exact_v1(source_n,array['schemaVersion','purpose','action','operationId','sourceDigest','previewDigest']) is not true
     or source_n->>'action'<>'erase' or source_n->'operationId'<>v->'operationId' or source_n->'schemaVersion'<>v->'schemaVersion' or source_n->'purpose'<>v->'purpose' then raise exception 'INVALID_INPUT';end if;
    v:=source_n;
   end if;
   select * into erase_n from journey_measurement_private.erasure_receipts_v1 where owner_id=u and operation_id=(v->>'operationId')::uuid for update;
   if not found or erase_n.source_digest is distinct from v->>'sourceDigest' or erase_n.preview_digest is distinct from v->>'previewDigest'
    or erase_n.expires_at<=now_n then raise exception 'MEASUREMENT_CONFLICT';end if;
   if erase_n.state='preview' then
    source_n:=journey_measurement_private.export_source_v1(u);
    -- The preview itself is excluded from source digest at CAS (it was not
    -- present at initial snapshot). Erasure receipt is an owner operation.
    source_n:=jsonb_set(source_n,'{erasureReceipts}',coalesce((select jsonb_agg(x) from jsonb_array_elements(source_n->'erasureReceipts') x where x->>'operation_id'<>v->>'operationId'),'[]'));
    source_n:=jsonb_set(source_n,'{sourceRows,erasureReceipts}',to_jsonb(jsonb_array_length(source_n->'erasureReceipts')));
    if erase_n.decided_at+interval '30 seconds'<=now_n or encode(sha256(convert_to(source_n::text,'UTF8')),'hex')<>erase_n.source_digest then raise exception 'MEASUREMENT_CONFLICT';end if;
   end if;
   rows_n:=journey_measurement_private.erase_v1(u,(v->>'operationId')::uuid,erase_n.consent_id,encode(sha256(convert_to(case when p_action='recover' then p_input_bytes::jsonb->>'mutationBytes' else p_input_bytes end,'UTF8')),'hex'));
  end if;
  select * into erase_n from journey_measurement_private.erasure_receipts_v1 where owner_id=u and operation_id=(v->>'operationId')::uuid;
  return base_n||jsonb_build_object('kind','erasure','operationId',v->'operationId','scope','journey-experience-measurement/1',
   'state','erased','erasedRows',rows_n,'consentRevoked',true,'fenceRecorded',true,
   'requestDigest',erase_n.request_metadata_digest,'decidedAt',floor(extract(epoch from erase_n.decided_at)*1000)::bigint,
   'expiresAt',floor(extract(epoch from erase_n.expires_at)*1000)::bigint,
   'lifecycle',jsonb_build_object('state',case when erase_n.state='erased' then 'complete' else 'incomplete' end,
    'controls','bounded_retained','copyState',case when erase_n.state='erased' then 'acknowledged' else 'unknown' end,
    'copyObligations',(select count(*) from journey_measurement_private.copy_obligations_v1 where owner_id=u),
    'copyAcks',0),'allUserDataCompleted',false);
 end if;
 if journey_measurement_private.ready_v1() is not true then raise exception 'MEASUREMENT_UNAVAILABLE';end if;
 if p_action='consent' then
  if v->>'noticeVersion' is distinct from 'journey-experience-measurement/2026-10-12'
   or jsonb_typeof(v->'entries') is distinct from 'array' or jsonb_array_length(v->'entries') not between 1 and 3
   or exists(select 1 from jsonb_array_elements_text(v->'entries') x where x not in('e1','e2','e3'))
   or v->'entries' is distinct from (select jsonb_agg(distinct x order by x) from jsonb_array_elements_text(v->'entries') x) then raise exception 'INVALID_INPUT';end if;
  if consent_n.operation_id=(v->>'operationId')::uuid then
   if consent_n.revoked_at is not null or consent_n.expires_at<=now_n or to_jsonb(consent_n.entries)<>v->'entries'
    or consent_n.session_id<>session_n or consent_n.mobile_epoch<>p_expected_epoch
    or consent_n.request_metadata_digest<>encode(sha256(convert_to(p_input_bytes,'UTF8')),'hex') then raise exception 'MEASUREMENT_CONFLICT';end if;
   reused_n:=true;
  else
   delete from journey_measurement_private.consents_v1 where owner_id=u;
   insert into journey_measurement_private.consents_v1 values(u,gen_random_uuid(),(v->>'operationId')::uuid,encode(sha256(convert_to(p_input_bytes,'UTF8')),'hex'),session_n,p_expected_epoch,
    'journey-experience-measurement/2026-10-12',array(select jsonb_array_elements_text(v->'entries')),now_n,now_n+interval '30 days',null) returning * into consent_n;
  end if;
  return base_n||jsonb_build_object('kind','consent','operationId',v->'operationId','consentId',consent_n.consent_id,
   'noticeVersion',consent_n.notice_version,'entries',consent_n.entries,'receivedAt',floor(extract(epoch from consent_n.accepted_at)*1000)::bigint,
   'expiresAt',floor(extract(epoch from consent_n.expires_at)*1000)::bigint,'reused',reused_n);
 end if;
 if coalesce(v->>'entry','') not in('e1','e2','e3') or journey_measurement_private.consent_current_v1(u,(v->>'consentId')::uuid,v->>'entry') is not true then raise exception 'MEASUREMENT_CONSENT_REQUIRED';end if;
 if p_action='aggregate' then
  return base_n||jsonb_build_object('kind','aggregate','consentId',v->'consentId','entry',v->'entry','sample','qualified_opt_in_authorities',
   'capturedAt',floor(extract(epoch from now_n)*1000)::bigint,'expiresAt',floor(extract(epoch from now_n)*1000)::bigint+20000,
   'counts',journey_measurement_private.aggregate_v1(u,(v->>'consentId')::uuid,v->>'entry'));
 end if;
 if journey_measurement_private.source_shape_v1(v->'source') is not true then raise exception 'INVALID_INPUT';end if;
 if p_action='admit' then
  if not (journey_measurement_private.exact_v1(v->'clockOrigin',array['kind']) and v->'clockOrigin'->>'kind'='unknown'
   or journey_measurement_private.exact_v1(v->'clockOrigin',array['kind','processId']) and v->'clockOrigin'->>'kind'='native_monotonic'
    and journey_measurement_private.uuid_v1(v->'clockOrigin'->'processId')) then raise exception 'INVALID_INPUT';end if;
  if v->>'entry'='e1' then
   accepted_n:=journey_measurement_private.acceptance_v1(u,v->>'entry',v->'source');
   if accepted_n is null or accepted_n<consent_n.accepted_at or accepted_n>now_n then raise exception 'MEASUREMENT_SOURCE_UNAVAILABLE';end if;
  elsif journey_measurement_private.native_anchor_v1(u,v->>'entry',v->'source') is not true then raise exception 'MEASUREMENT_SOURCE_UNAVAILABLE';end if;
  select * into admission_n from journey_measurement_private.admissions_v1 where owner_id=u and consent_id=consent_n.consent_id and entry=v->>'entry' and source_kind=v->'source'->>'kind' and source_id=coalesce(v->'source'->>'id',v->'source'->>'logicalId')::uuid and source_ref=v->'source';
  if found then
   if admission_n.admission_id=(v->>'operationId')::uuid and admission_n.request_metadata_digest<>encode(sha256(convert_to(p_input_bytes,'UTF8')),'hex') then raise exception 'MEASUREMENT_CONFLICT';end if;
   if admission_n.clock_origin is distinct from v->'clockOrigin' or admission_n.source_revision is distinct from (v->'source'->>'revision')::integer then raise exception 'MEASUREMENT_CONFLICT';end if;
   reused_n:=true;
  else
   insert into journey_measurement_private.admissions_v1 values(u,(v->>'operationId')::uuid,encode(sha256(convert_to(p_input_bytes,'UTF8')),'hex'),consent_n.consent_id,v->>'entry',v->'source'->>'kind',
    coalesce(v->'source'->>'id',v->'source'->>'logicalId')::uuid,(v->'source'->>'revision')::integer,v->'source',v->'clockOrigin',
    case when v->>'entry'='e1' then (v->'source'->>'id')::uuid else null end,
    case when v->>'entry'='e3' then (v->'source'->'anchor'->>'goalId')::uuid else null end,
    accepted_n,now_n,now_n+interval '30 days',session_n,p_expected_epoch,
    case when v->>'entry'<>'e1' or exists(select 1 from turn_private.result_artifacts x where x.owner_id=u and x.task_id=(v->'source'->>'id')::uuid) then 'unknown' else 'proven' end) returning * into admission_n;
  end if;
  if journey_measurement_private.admission_current_v1(admission_n) is not true then raise exception 'MEASUREMENT_SOURCE_UNAVAILABLE';end if;
  perform journey_measurement_private.cap_v1(u);
  return base_n||jsonb_build_object('kind','admission','operationId',v->'operationId','consentId',consent_n.consent_id,'admissionId',admission_n.admission_id,
   'entry',admission_n.entry,'source',v->'source','clockOrigin',admission_n.clock_origin,'authority',case when admission_n.entry='e1' then 'service_task' else 'authenticated_native_acceptance_report' end,'admittedAt',floor(extract(epoch from admission_n.accepted_at)*1000)::bigint,'firstEver',admission_n.first_ever,
   'receivedAt',floor(extract(epoch from admission_n.received_at)*1000)::bigint,'expiresAt',floor(extract(epoch from admission_n.expires_at)*1000)::bigint,'reused',reused_n);
 end if;
 if journey_measurement_private.signal_shape_v1(v->'signal') is not true or journey_measurement_private.clock_shape_v1(v->'clock') is not true then raise exception 'INVALID_INPUT';end if;
 select * into admission_n from journey_measurement_private.admissions_v1 where owner_id=u and admission_id=(v->>'admissionId')::uuid for update;
 if not found or admission_n.consent_id is distinct from (v->>'consentId')::uuid or admission_n.entry<>v->>'entry'
  or admission_n.source_ref<>v->'source'
  or journey_measurement_private.admission_current_v1(admission_n) is not true then raise exception 'MEASUREMENT_SOURCE_UNAVAILABLE';end if;
 if v->'clock'->>'kind'='local_elapsed' and (admission_n.clock_origin->>'kind'<>'native_monotonic' or admission_n.clock_origin->'processId' is distinct from v->'clock'->'processId') then raise exception 'MEASUREMENT_CLOCK_UNKNOWN';end if;
 s:=v->'signal';
 if s ? 'artifact' and journey_measurement_private.artifact_current_v1(admission_n,s->'artifact') is not true then raise exception 'MEASUREMENT_SOURCE_UNAVAILABLE';end if;
 if s->>'kind'='writer' and journey_measurement_private.writer_current_v1(admission_n,s) is not true then raise exception 'MEASUREMENT_SOURCE_UNAVAILABLE';end if;
 if s->>'kind'='declined' and not exists(select 1 from journey_measurement_private.reports_v1 where owner_id=u and admission_id=admission_n.admission_id
  and signal->>'kind'='presented' and signal->'artifact'=s->'artifact' and expires_at>now_n) then raise exception 'MEASUREMENT_NOT_PRESENTED';end if;
 if s->>'kind'='zero_questions' then raise exception 'MEASUREMENT_QUESTION_AUTHORITY_UNAVAILABLE';end if;
 -- At most one semantic presentation/decline/writer/question per original
 -- opportunity. Transport reportId aliases cannot inflate these denominators.
 if exists(select 1 from journey_measurement_private.reports_v1 x where x.owner_id=u and x.admission_id=admission_n.admission_id
  and x.report_id<>(v->>'reportId')::uuid and x.signal->>'kind'=s->>'kind'
  and (s->>'kind' in('presented','server_ready','declined') and x.signal->'artifact'=s->'artifact'
   or s->>'kind'='writer' and x.signal->'operationId'=s->'operationId'
   or s->>'kind'='question' and x.signal->'questionId'=s->'questionId'
   or s->>'kind'='terminal' and x.signal->'outcome'=s->'outcome'
   or s->>'kind'='accepted')) then raise exception 'MEASUREMENT_CONFLICT';end if;
 select * into report_n from journey_measurement_private.reports_v1 where owner_id=u and report_id=(v->>'reportId')::uuid;
 if found then
  if report_n.admission_id<>admission_n.admission_id or report_n.signal<>s or report_n.clock<>v->'clock'
   or report_n.request_metadata_digest<>encode(sha256(convert_to(p_input_bytes,'UTF8')),'hex') then raise exception 'MEASUREMENT_CONFLICT';end if;
  reused_n:=true;
 else
  insert into journey_measurement_private.reports_v1 values(u,(v->>'reportId')::uuid,encode(sha256(convert_to(p_input_bytes,'UTF8')),'hex'),admission_n.admission_id,s,v->'clock',now_n,
   least(now_n+interval '30 days',admission_n.expires_at,consent_n.expires_at)) returning * into report_n;
 end if;
 perform journey_measurement_private.cap_v1(u);
 return base_n||jsonb_build_object('kind','received','reportId',report_n.report_id,'admissionId',admission_n.admission_id,'consentId',consent_n.consent_id,
  'state','recorded','receivedAt',floor(extract(epoch from report_n.received_at)*1000)::bigint,'expiresAt',floor(extract(epoch from report_n.expires_at)*1000)::bigint,'reused',reused_n);
end $$;
revoke all on function public.native_journey_measurement_v1(text,text,bigint) from public,anon,service_role;
grant execute on function public.native_journey_measurement_v1(text,text,bigint) to authenticated;

-- Physical expiry is separate from read expiry. Service consumer may invoke
-- only this fixed bounded SQL entry point; it cannot enroll or collect data.
create function public.purge_journey_measurement_v1(p_limit integer) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' set lock_timeout='250ms' as $$
declare owner_n uuid;count_n integer;total_n integer:=0;n timestamptz:=clock_timestamp();more_n boolean;
begin
 if auth.role() is distinct from 'service_role' or p_limit is null or p_limit not between 1 and 1000 then raise exception 'FORBIDDEN';end if;
 -- Children first, with one total row budget. Never hide cascade removals from
 -- the consumer's count or call a partial sweep fresh/caught-up.
 with ids as(select r.owner_id,r.report_id from journey_measurement_private.reports_v1 r
  join journey_measurement_private.admissions_v1 a using(owner_id,admission_id)
  join journey_measurement_private.consents_v1 c on c.consent_id=a.consent_id
  where r.expires_at<=n or a.expires_at<=n or c.expires_at<=n or c.revoked_at is not null
   or a.source_kind='service_task' and journey_measurement_private.acceptance_v1(a.owner_id,a.entry,a.source_ref) is null
   or a.source_kind='native_entry' and journey_measurement_private.native_anchor_v1(a.owner_id,a.entry,a.source_ref) is not true
  order by r.expires_at,r.owner_id,r.report_id limit p_limit for update of r skip locked)
 delete from journey_measurement_private.reports_v1 r using ids where r.owner_id=ids.owner_id and r.report_id=ids.report_id;
 get diagnostics count_n=row_count;total_n:=total_n+count_n;
 with ids as(select a.owner_id,a.admission_id from journey_measurement_private.admissions_v1 a
  join journey_measurement_private.consents_v1 c on c.consent_id=a.consent_id
  where (a.expires_at<=n or c.expires_at<=n or c.revoked_at is not null
   or a.source_kind='service_task' and journey_measurement_private.acceptance_v1(a.owner_id,a.entry,a.source_ref) is null
   or a.source_kind='native_entry' and journey_measurement_private.native_anchor_v1(a.owner_id,a.entry,a.source_ref) is not true)
   and not exists(select 1 from journey_measurement_private.reports_v1 r where r.owner_id=a.owner_id and r.admission_id=a.admission_id)
  order by a.expires_at,a.owner_id,a.admission_id limit greatest(0,p_limit-total_n) for update of a skip locked)
 delete from journey_measurement_private.admissions_v1 a using ids where a.owner_id=ids.owner_id and a.admission_id=ids.admission_id;
 get diagnostics count_n=row_count;total_n:=total_n+count_n;
 with ids as(select c.owner_id from journey_measurement_private.consents_v1 c where (expires_at<=n or revoked_at is not null)
  and not exists(select 1 from journey_measurement_private.admissions_v1 a where a.consent_id=c.consent_id)
  order by expires_at,owner_id limit greatest(0,p_limit-total_n) for update skip locked)
 delete from journey_measurement_private.consents_v1 c using ids where c.owner_id=ids.owner_id;
 get diagnostics count_n=row_count;total_n:=total_n+count_n;
 with ids as(select owner_id,operation_id from journey_measurement_private.erasure_receipts_v1 where expires_at<=n
  order by expires_at,owner_id,operation_id limit greatest(0,p_limit-total_n) for update skip locked)
 delete from journey_measurement_private.erasure_receipts_v1 a using ids where a.owner_id=ids.owner_id and a.operation_id=ids.operation_id;
 get diagnostics count_n=row_count;total_n:=total_n+count_n;
 with ids as(select owner_id,journal_id from journey_measurement_private.journals_v1 where expires_at<=n
  order by expires_at,owner_id,journal_id limit greatest(0,p_limit-total_n) for update skip locked)
 delete from journey_measurement_private.journals_v1 a using ids where a.owner_id=ids.owner_id and a.journal_id=ids.journal_id;
 get diagnostics count_n=row_count;total_n:=total_n+count_n;
 with ids as(select owner_id from journey_measurement_private.recovery_controls_v1 where expires_at<=n
  order by expires_at,owner_id limit greatest(0,p_limit-total_n) for update skip locked)
 delete from journey_measurement_private.recovery_controls_v1 a using ids where a.owner_id=ids.owner_id;
 get diagnostics count_n=row_count;total_n:=total_n+count_n;
 for owner_n in select distinct owner_id from journey_measurement_private.copy_obligations_v1
  where expires_at<=n and kind='core_export' order by owner_id limit greatest(0,p_limit-total_n) loop
  begin
   count_n:=journey_measurement_private.erase_core_copies_v1(owner_n,n,p_limit-total_n);
   total_n:=total_n+count_n;
  exception when query_canceled or lock_not_available or raise_exception then
   update journey_measurement_private.configuration_v1 set lifecycle_composition=null;
  end;
 end loop;
 -- Unknown/expired externally acquired copies are never counted as erased.
 -- Retention still removes their local inventory; whole lifecycle remains
 -- denied until original Core independently reconciles outstanding payload.
 if exists(select 1 from journey_measurement_private.copy_obligations_v1 where expires_at<=n and kind<>'core_export') then
  update journey_measurement_private.configuration_v1 set lifecycle_composition=null;
 end if;
 with ids as(select owner_id,copy_id,generation from journey_measurement_private.copy_obligations_v1
  where expires_at<=n and kind<>'core_export' order by expires_at,owner_id,copy_id,generation
  limit greatest(0,p_limit-total_n) for update skip locked)
 delete from journey_measurement_private.copy_obligations_v1 a using ids where a.owner_id=ids.owner_id and a.copy_id=ids.copy_id and a.generation=ids.generation;
 get diagnostics count_n=row_count;total_n:=total_n+count_n;
 more_n:=exists(select 1 from journey_measurement_private.reports_v1 where expires_at<=n)
  or exists(select 1 from journey_measurement_private.consents_v1 where expires_at<=n or revoked_at is not null)
  or exists(select 1 from journey_measurement_private.erasure_receipts_v1 where expires_at<=n)
  or exists(select 1 from journey_measurement_private.journals_v1 where expires_at<=n)
  or exists(select 1 from journey_measurement_private.recovery_controls_v1 where expires_at<=n)
  or exists(select 1 from journey_measurement_private.copy_obligations_v1 where expires_at<=n)
  or exists(select 1 from journey_measurement_private.admissions_v1 a where a.expires_at<=n
   or a.source_kind='service_task' and journey_measurement_private.acceptance_v1(a.owner_id,a.entry,a.source_ref) is null
   or a.source_kind='native_entry' and journey_measurement_private.native_anchor_v1(a.owner_id,a.entry,a.source_ref) is not true);
 if not more_n then update journey_measurement_private.configuration_v1 set cleanup_at=n;
 else update journey_measurement_private.configuration_v1 set cleanup_at=null;end if;
 return jsonb_build_object('schemaVersion','journey-experience-measurement/1','purpose','journey_experience_measurement',
  'kind','purged','erasedRows',total_n,'hasMore',more_n);
end $$;
revoke all on function public.purge_journey_measurement_v1(integer) from public,anon,authenticated;
grant execute on function public.purge_journey_measurement_v1(integer) to service_role;
revoke all on all functions in schema journey_measurement_private from public,anon,authenticated,service_role;
