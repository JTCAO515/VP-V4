-- Explicit ordinary-user input only. No work/Task/provider/Memory/Trip writer activation.
create function turn_private.valid_explicit_travel_intake_v1(p jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare v jsonb; k text; n numeric; start_date date; end_date date;
begin
 if p is null or jsonb_typeof(p)<>'object' or p-'schemaVersion'-'city'-'comparisonTarget'-'durationDays'-'partySize'-'interests'-'pace'-'lodgingBudget'-'dates'-'mobilityConstraints'<>'{}'
   or not(p ?& array['schemaVersion','city','comparisonTarget','durationDays','partySize','interests','pace','lodgingBudget','dates','mobilityConstraints'])
   or p->>'schemaVersion'<>'stay-area-intake/1' then return false; end if;
 if p->'city'<>'null'::jsonb and (jsonb_typeof(p->'city')<>'string' or p->>'city'<>btrim(p->>'city') or length(p->>'city') not between 1 and 80) then return false; end if;
 if p->'comparisonTarget'<>'null'::jsonb and (jsonb_typeof(p->'comparisonTarget')<>'string' or p->>'comparisonTarget' not in ('area_transport','lodging_budget_filter')) then return false; end if;
 if p->'pace'<>'null'::jsonb and (jsonb_typeof(p->'pace')<>'string' or p->>'pace' not in ('relaxed','balanced','fast')) then return false; end if;
 foreach k in array array['durationDays','partySize'] loop
  if p->k='null'::jsonb then continue; end if;
  if jsonb_typeof(p->k)<>'number' then return false; end if;
  n:=(p->>k)::numeric;
  if n<>trunc(n) or n<1 or n>(case when k='durationDays' then 30 else 10 end) then return false; end if;
 end loop;
 foreach k in array array['interests','mobilityConstraints'] loop
  if p->k='null'::jsonb then continue; end if;
  if jsonb_typeof(p->k)<>'array' then return false; end if;
  if jsonb_array_length(p->k)>(case when k='interests' then 8 else 6 end)
    or (select count(*) from jsonb_array_elements(p->k))<>(select count(distinct value) from jsonb_array_elements(p->k)) then return false; end if;
  for v in select value from jsonb_array_elements(p->k) loop
   if jsonb_typeof(v)<>'string' then return false; end if;
   if k='interests' and v#>>'{}' not in ('food','photography','culture','nature') then return false; end if;
   if k='mobilityConstraints' and (length(v#>>'{}') not between 1 and 120 or v#>>'{}'<>btrim(v#>>'{}')) then return false; end if;
  end loop;
 end loop;
 v:=p->'lodgingBudget';
 if v<>'null'::jsonb then
  if jsonb_typeof(v)<>'object' or v-'currency'-'perNightMinorUnits'<>'{}' or not(v ?& array['currency','perNightMinorUnits'])
    or jsonb_typeof(v->'currency')<>'string' or v->>'currency' not in ('CNY','USD','EUR','GBP') or jsonb_typeof(v->'perNightMinorUnits')<>'number' then return false; end if;
  n:=(v->>'perNightMinorUnits')::numeric;if n<>trunc(n) or n not between 1 and 10000000 then return false; end if;
 end if;
 v:=p->'dates';
 if v<>'null'::jsonb then
  if jsonb_typeof(v)<>'object' or v-'startDate'-'endDate'<>'{}' or not(v ?& array['startDate','endDate'])
    or jsonb_typeof(v->'startDate')<>'string' or jsonb_typeof(v->'endDate')<>'string'
    or v->>'startDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v->>'endDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  start_date:=(v->>'startDate')::date;end_date:=(v->>'endDate')::date;
  if start_date::text<>v->>'startDate' or end_date::text<>v->>'endDate' or end_date<start_date or end_date-start_date>30 then return false; end if;
 end if;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then return false;
end $$;
revoke all on function turn_private.valid_explicit_travel_intake_v1(jsonb) from public,anon,authenticated,service_role;

create table turn_private.assistant_travel_intakes (
 message_id uuid primary key references turn_private.assistant_messages(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 conversation_id uuid not null references turn_private.assistant_conversations(id) on delete cascade,
 goal_id uuid not null references turn_private.assistant_goals(id) on delete cascade,
 policy_id uuid not null references turn_private.text_policies(id), consent_id uuid not null,
 message_sequence bigint not null, goal_version integer not null,
 intake_revision integer not null check(intake_revision between 1 and 1000),
 idempotency_key uuid not null, request_digest text not null check(request_digest~'^[a-f0-9]{64}$'),
 intake jsonb not null check(turn_private.valid_explicit_travel_intake_v1(intake)),
 memory_basis jsonb not null check(jsonb_typeof(memory_basis)='array' and jsonb_array_length(memory_basis)<=3),
 created_at timestamptz not null default clock_timestamp(),
 unique(owner_id,idempotency_key),unique(goal_id,intake_revision)
);
create index assistant_travel_intakes_goal_latest on turn_private.assistant_travel_intakes(goal_id,intake_revision desc);
create index assistant_travel_intakes_owner_export on turn_private.assistant_travel_intakes(owner_id,message_id);
alter table turn_private.assistant_travel_intakes enable row level security;
revoke all on turn_private.assistant_travel_intakes from public,anon,authenticated,service_role;
create function turn_private.immutable_travel_intake_v1() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_INTAKE'; end $$;
create trigger immutable_travel_intake_v1 before update on turn_private.assistant_travel_intakes for each row execute function turn_private.immutable_travel_intake_v1();
revoke all on function turn_private.immutable_travel_intake_v1() from public,anon,authenticated,service_role;

create function turn_private.explicit_intake_memory_binding_v1(u uuid,basis jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; profile public.memory_profiles%rowtype; bindings jsonb:='[]'; ids uuid[]:=array[]::uuid[]; selected_id uuid; selected_consent uuid;
begin
 if basis is null or jsonb_typeof(basis)<>'array' or jsonb_array_length(basis)>3 then return null; end if;
 for item in select value from jsonb_array_elements(basis) order by value->>'id' loop
  if jsonb_typeof(item)<>'object' or item-'id'-'revision'<>'{}' or not(item ?& array['id','revision'])
    or jsonb_typeof(item->'id')<>'string' or jsonb_typeof(item->'revision')<>'number'
    or item->>'revision'!~'^[1-9][0-9]{0,14}$' then return null; end if;
  selected_id:=(item->>'id')::uuid;if selected_id=any(ids) then return null; end if;ids:=array_append(ids,selected_id);
  -- Match existing Memory create/Undo order: profile, then consent. Withdrawal locks consent only.
  select * into profile from public.memory_profiles where memory_profiles.id=selected_id and owner_id=u for share;
  if not found or profile.revision<>(item->>'revision')::bigint or profile.state not in ('explicit','confirmed') or profile.summary is null then return null; end if;
  perform 1 from public.memory_consents where memory_consents.id=profile.consent_id and owner_id=u and status='granted' for share;
  if not found or not exists(select 1 from public.memory_receipts where memory_receipts.id=profile.source_receipt_id and owner_id=u and memory_id=profile.id) then return null; end if;
  -- Hash covers the authoritative profile; no Memory text is copied or returned.
  bindings:=bindings||jsonb_build_array(jsonb_build_object('id',profile.id,'revision',profile.revision,'state',profile.state,
    'consentId',profile.consent_id,'sourceReceiptId',profile.source_receipt_id,'summaryDigest',encode(pg_catalog.sha256(convert_to(profile.summary,'UTF8')),'hex')));
 end loop;
 return bindings;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;
revoke all on function turn_private.explicit_intake_memory_binding_v1(uuid,jsonb) from public,anon,authenticated,service_role;

create function turn_private.assistant_travel_current_basis_v1(u uuid,source uuid)
returns text language plpgsql security definer set search_path='' as $$
declare row turn_private.assistant_travel_intakes%rowtype; memories jsonb;
begin
 select * into row from turn_private.assistant_travel_intakes where message_id=source and owner_id=u;
 if not found then return null; end if;
 perform 1 from turn_private.assistant_conversations a join turn_private.assistant_goals g on g.conversation_id=a.id and g.owner_id=u
  join turn_private.assistant_messages m on m.id=row.message_id and m.owner_id=u and m.goal_id=g.id and m.conversation_id=a.id
  join turn_private.text_consents c on c.owner_id=u and c.policy_id=a.policy_id and c.consent_id=a.consent_id and c.revoked_at is null
  where a.id=row.conversation_id and a.owner_id=u and g.id=row.goal_id and not g.trip_terminal
   and g.scope_version=row.goal_version and m.scope_version=row.goal_version and m.sequence=row.message_sequence
   and m.policy_id=row.policy_id and m.consent_id=row.consent_id and a.policy_id=row.policy_id and a.consent_id=row.consent_id
   and turn_private.text_policy_current(row.policy_id)
   and row.intake_revision=(select latest.intake_revision from turn_private.assistant_travel_intakes latest where latest.goal_id=g.id order by latest.intake_revision desc limit 1)
   and m.sequence=(select latest.sequence from turn_private.assistant_messages latest where latest.goal_id=g.id order by latest.sequence desc limit 1);
 if not found then return null; end if;
 memories:=turn_private.explicit_intake_memory_binding_v1(u,row.memory_basis);if memories is null then return null; end if;
 return encode(pg_catalog.sha256(convert_to(jsonb_build_object('schemaVersion','assistant-travel-current-basis/1','ownerId',u,
  'conversationId',row.conversation_id,'goalId',row.goal_id,'goalVersion',row.goal_version,'messageId',row.message_id,
  'messageSequence',row.message_sequence,'intakeRevision',row.intake_revision,'policyId',row.policy_id,'consentId',row.consent_id,
  'intake',row.intake,'memoryBindings',memories)::text,'UTF8')),'hex');
end $$;
revoke all on function turn_private.assistant_travel_current_basis_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function public.submit_assistant_travel_intake_v1(
 p_conversation_id uuid,p_goal_id uuid,p_message_id uuid,p_parent_message_id uuid,p_expected_goal_version integer,
 p_expected_intake_revision integer,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,p_relationship text,p_intake jsonb,p_memory_basis jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); prior turn_private.assistant_travel_intakes%rowtype;
 c turn_private.text_consents%rowtype; digest text; next_revision integer; accepted jsonb; current_digest text;
begin
 if not turn_private.valid_explicit_travel_intake_v1(p_intake) or p_relationship not in ('goal_start','follow_up','amendment')
   or p_expected_intake_revision is null or p_expected_intake_revision not between 0 and 999 then raise exception 'INVALID_INPUT'; end if;
 if not turn_private.text_policy_current(p_policy_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
 select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
 if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
 digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_conversation_id,p_goal_id,p_message_id,p_parent_message_id,p_expected_goal_version,
  p_expected_intake_revision,p_idempotency_key,p_policy_id,p_locale,p_text,p_relationship,p_intake,p_memory_basis)::text,'UTF8')),'hex');
 -- Same lock prefix/order as the legacy writer; calling it is reentrant in this transaction.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-message:'||u::text||':'||p_idempotency_key::text,0));
 select * into prior from turn_private.assistant_travel_intakes where owner_id=u and idempotency_key=p_idempotency_key;
 if found then
  if prior.request_digest<>digest or prior.message_id<>p_message_id then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
  perform 1 from turn_private.assistant_conversations where id=prior.conversation_id and owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  current_digest:=turn_private.assistant_travel_current_basis_v1(u,prior.message_id);
  accepted:=jsonb_build_object('kind','accepted','conversationId',prior.conversation_id,'goalId',prior.goal_id,'messageId',prior.message_id,
   'messageSequence',prior.message_sequence,'goalVersion',prior.goal_version,'intakeRevision',prior.intake_revision,'reused',true,'current',current_digest is not null,'readyForProvider',false);
  if current_digest is not null then accepted:=accepted||jsonb_build_object('contextDigest',current_digest); end if;
  return accepted;
 end if;
 if exists(select 1 from turn_private.assistant_messages where owner_id=u and idempotency_key=p_idempotency_key) then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
 if p_relationship='goal_start' then
  if p_expected_intake_revision<>0 then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 else
  perform 1 from turn_private.assistant_conversations where id=p_conversation_id and owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id for update;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  perform 1 from turn_private.assistant_goals where id=p_goal_id and conversation_id=p_conversation_id and owner_id=u
    and scope_version=p_expected_goal_version and not trip_terminal and scope_version<10000 for update;
  if not found then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  if p_parent_message_id is distinct from (select id from turn_private.assistant_messages where goal_id=p_goal_id order by sequence desc limit 1) then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 end if;
 select coalesce(max(intake_revision),0)+1 into next_revision from turn_private.assistant_travel_intakes where goal_id=p_goal_id;
 if next_revision<>p_expected_intake_revision+1 or (p_relationship='follow_up' and p_expected_intake_revision<>0) then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 accepted:=public.submit_assistant_message_v1(p_conversation_id,p_message_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_relationship,p_goal_id,
  p_expected_goal_version,null,p_parent_message_id,null);
 -- Deliberately after message admission: any typed/Memory failure rolls back ALL message/goal changes.
 if turn_private.explicit_intake_memory_binding_v1(u,p_memory_basis) is null then raise exception 'MEMORY_CONFLICT'; end if;
 insert into turn_private.assistant_travel_intakes(message_id,owner_id,conversation_id,goal_id,policy_id,consent_id,message_sequence,goal_version,intake_revision,
  idempotency_key,request_digest,intake,memory_basis)
 values(p_message_id,u,p_conversation_id,p_goal_id,p_policy_id,c.consent_id,(accepted->>'sequence')::bigint,(accepted->>'scopeVersion')::integer,next_revision,
  p_idempotency_key,digest,p_intake,p_memory_basis);
 current_digest:=turn_private.assistant_travel_current_basis_v1(u,p_message_id);
 if current_digest is null then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 return jsonb_build_object('kind','accepted','conversationId',p_conversation_id,'goalId',p_goal_id,'messageId',p_message_id,
  'messageSequence',(accepted->>'sequence')::bigint,'goalVersion',(accepted->>'scopeVersion')::integer,'intakeRevision',next_revision,
  'contextDigest',current_digest,'reused',false,'current',true,'readyForProvider',false);
end $$;
revoke all on function public.submit_assistant_travel_intake_v1(uuid,uuid,uuid,uuid,integer,integer,uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.submit_assistant_travel_intake_v1(uuid,uuid,uuid,uuid,integer,integer,uuid,uuid,text,text,text,jsonb,jsonb) to authenticated;

create function public.read_assistant_travel_intake_v1(p_policy_id uuid,p_conversation_id uuid,p_goal_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); row turn_private.assistant_travel_intakes%rowtype; digest text; questions jsonb:='[]'; unknowns jsonb:='[]'; k text; readiness jsonb;
begin
 if p_policy_id is null or p_conversation_id is null or p_goal_id is null then raise exception 'INVALID_INPUT'; end if;
 perform 1 from turn_private.assistant_conversations a join turn_private.assistant_goals g on g.conversation_id=a.id and g.owner_id=u
  join turn_private.text_consents c on c.owner_id=u and c.policy_id=a.policy_id and c.consent_id=a.consent_id and c.revoked_at is null
  where a.id=p_conversation_id and a.owner_id=u and g.id=p_goal_id and a.policy_id=p_policy_id and turn_private.text_policy_current(p_policy_id) for share of a,g,c;
 if not found then return jsonb_build_object('kind','unavailable','reason','blocked'); end if;
 select * into row from turn_private.assistant_travel_intakes where goal_id=p_goal_id and owner_id=u order by intake_revision desc limit 1;
 if not found then return jsonb_build_object('kind','unavailable','reason','intake_unrecorded'); end if;
 digest:=turn_private.assistant_travel_current_basis_v1(u,row.message_id);
 if digest is null then return jsonb_build_object('kind','unavailable','reason','stale_basis'); end if;
 foreach k in array array['city','comparisonTarget','durationDays','partySize','interests','pace','lodgingBudget','dates','mobilityConstraints'] loop
  if row.intake->k='null'::jsonb then unknowns:=unknowns||to_jsonb(k); end if;
 end loop;
 if row.intake->'city'='null'::jsonb then questions:=questions||'"city"'::jsonb; end if;
 if row.intake->'comparisonTarget'='null'::jsonb then questions:=questions||'"comparison_target"'::jsonb; end if;
 if questions<>'[]' then readiness:=jsonb_build_object('kind','waiting_user','questions',questions);
 elsif row.intake->>'city'<>'shanghai' then readiness:=jsonb_build_object('kind','unavailable','reason','city_not_covered');
 elsif row.intake->>'comparisonTarget'='lodging_budget_filter' then
  readiness:=case when row.intake->'lodgingBudget'='null'::jsonb then jsonb_build_object('kind','waiting_user','questions',jsonb_build_array('lodging_budget'))
   else jsonb_build_object('kind','unavailable','reason','budget_filter_not_integrated') end;
 else readiness:=jsonb_build_object('kind','ready','scope','transport_screening','unknown',unknowns); end if;
 return jsonb_build_object('kind','travel_intake','schemaVersion','assistant-travel-current-basis/1','conversationId',row.conversation_id,'goalId',row.goal_id,
  'goalVersion',row.goal_version,'messageId',row.message_id,'messageSequence',row.message_sequence,'intakeRevision',row.intake_revision,
  'sourceKind','explicit_current_input','intake',row.intake,'memoryBasis',row.memory_basis,'contextDigest',digest,'readiness',readiness,'readyForProvider',false);
end $$;
revoke all on function public.read_assistant_travel_intake_v1(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.read_assistant_travel_intake_v1(uuid,uuid,uuid) to authenticated;

create function public.read_assistant_travel_intake_write_basis_v1(p_policy_id uuid,p_conversation_id uuid,p_goal_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype;
 goal turn_private.assistant_goals%rowtype; message turn_private.assistant_messages%rowtype; revision integer;
begin
 if p_policy_id is null or p_conversation_id is null or p_goal_id is null then raise exception 'INVALID_INPUT'; end if;
 if not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','unavailable','reason','blocked'); end if;
 select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
 if not found then return jsonb_build_object('kind','unavailable','reason','blocked'); end if;
 perform 1 from turn_private.assistant_conversations where id=p_conversation_id and owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id for share;
 if not found then return jsonb_build_object('kind','unavailable','reason','blocked'); end if;
 select * into goal from turn_private.assistant_goals where id=p_goal_id and conversation_id=p_conversation_id and owner_id=u and not trip_terminal and scope_version<10000 for share;
 if not found then return jsonb_build_object('kind','unavailable','reason','blocked'); end if;
 select * into message from turn_private.assistant_messages where goal_id=goal.id and owner_id=u and conversation_id=p_conversation_id order by sequence desc limit 1;
 if not found or message.policy_id<>p_policy_id or message.consent_id<>c.consent_id then return jsonb_build_object('kind','unavailable','reason','blocked'); end if;
 select coalesce(max(intake_revision),0) into revision from turn_private.assistant_travel_intakes where goal_id=goal.id and owner_id=u;
 return jsonb_build_object('kind','travel_intake_write_basis','conversationId',p_conversation_id,'goalId',goal.id,'goalVersion',goal.scope_version,
  'parentMessageId',message.id,'messageSequence',message.sequence,'intakeRevision',revision,'policyId',p_policy_id,'readyForProvider',false);
end $$;
revoke all on function public.read_assistant_travel_intake_write_basis_v1(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.read_assistant_travel_intake_write_basis_v1(uuid,uuid,uuid) to authenticated;

create function public.assistant_travel_intake_export_owner_v1(p_owner uuid,p_after_id uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb; more boolean; last_id uuid;
begin
 if (select auth.role()) is distinct from 'service_role' or p_owner is null then raise exception 'FORBIDDEN'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT'; end if;
 if p_after_id is not null and not exists(select 1 from turn_private.assistant_travel_intakes where owner_id=p_owner and message_id=p_after_id) then raise exception 'INVALID_EXPORT_CURSOR'; end if;
 with candidates as (select message_id,intake_revision,goal_id,conversation_id,message_sequence,goal_version,intake,memory_basis,created_at
  from turn_private.assistant_travel_intakes where owner_id=p_owner and (p_after_id is null or message_id>p_after_id) order by message_id limit p_limit+1),
 delivered as (select * from candidates order by message_id limit p_limit)
 select coalesce((select jsonb_agg(to_jsonb(d) order by message_id) from delivered d),'[]'),(select count(*)>p_limit from candidates),
  (select message_id from delivered order by message_id desc limit 1) into items,more,last_id;
 return jsonb_build_object('schemaVersion','assistant-travel-intake-export/1','items',items,'hasMore',more,'nextCursor',case when more then last_id else null end,'sectionComplete',not more);
end $$;
revoke all on function public.assistant_travel_intake_export_owner_v1(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.assistant_travel_intake_export_owner_v1(uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
