-- Ordinary selected-source message/context. No new service task, billing or domain schema.
create table turn_private.assistant_message_source_receipts (
 message_id uuid primary key references turn_private.assistant_messages(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_key uuid not null,request_digest text not null,
 input_sources jsonb not null,captured_sources jsonb not null,
 accepted_receipt jsonb not null,created_at timestamptz not null default clock_timestamp(),
 unique(owner_id,request_key)
);
alter table turn_private.assistant_message_source_receipts enable row level security;
revoke all on turn_private.assistant_message_source_receipts from public,anon,authenticated,service_role;
create function turn_private.reject_assistant_source_receipt_update_v2() returns trigger language plpgsql set search_path='' as $$begin raise exception 'IMMUTABLE_SOURCE_RECEIPT';end $$;
create trigger immutable_assistant_source_receipt before update on turn_private.assistant_message_source_receipts for each row execute function turn_private.reject_assistant_source_receipt_update_v2();
revoke all on function turn_private.reject_assistant_source_receipt_update_v2() from public,anon,authenticated,service_role;

create function turn_private.valid_assistant_selected_sources_v2(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare e jsonb;ids uuid[]:=array[]::uuid[];
begin
 if v is null or jsonb_typeof(v)<>'object' or v-array['artifact','trip','evidence']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(v))<>3 then return false;end if;
 if v->'artifact' is distinct from 'null'::jsonb then
  e:=v->'artifact';if jsonb_typeof(e) is distinct from 'object' or e-array['artifactId','revision']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(e))<>2 or jsonb_typeof(e->'artifactId') is distinct from 'string' or (e->>'revision') !~ '^([1-9][0-9]{0,2}|1000)$' or jsonb_typeof(e->'revision') is distinct from 'number' then return false;end if;
  perform (e->>'artifactId')::uuid;
 end if;
 if v->'trip' is distinct from 'null'::jsonb then
  e:=v->'trip';if jsonb_typeof(e) is distinct from 'object' or e-array['tripId','headVersion']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(e))<>2 or jsonb_typeof(e->'tripId') is distinct from 'string' or (e->>'headVersion') !~ '^(0|[1-9][0-9]{0,8})$' or jsonb_typeof(e->'headVersion') is distinct from 'number' then return false;end if;perform (e->>'tripId')::uuid;
 end if;
 if jsonb_typeof(v->'evidence') is distinct from 'array' or jsonb_array_length(v->'evidence')>3 then return false;end if;
 for e in select value from jsonb_array_elements(v->'evidence') loop
  if jsonb_typeof(e)<>'object' or e-array['factId','assertionId','assertionRevision','city','scene']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(e))<>5 or jsonb_typeof(e->'factId') is distinct from 'string' or jsonb_typeof(e->'assertionId') is distinct from 'string' or jsonb_typeof(e->'assertionRevision') is distinct from 'number' or (e->>'assertionRevision') !~ '^[1-9][0-9]{0,8}$' or jsonb_typeof(e->'city') is distinct from 'string' or jsonb_typeof(e->'scene') is distinct from 'string' then return false;end if;
  if (e->>'factId')::uuid=any(ids) then return false;end if;ids:=array_append(ids,(e->>'factId')::uuid);perform (e->>'assertionId')::uuid;
 end loop;
 return true;
exception when data_exception then return false;end $$;
revoke all on function turn_private.valid_assistant_selected_sources_v2(jsonb) from public,anon,authenticated,service_role;

-- IDs/versions/current dependencies only. Body projections are read on demand, not stored here.
create function turn_private.qualify_assistant_selected_sources_v2(u uuid,s jsonb,p_locale text,p_require_current boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb:='null';t jsonb:='null';ev jsonb:='[]';e jsonb;row jsonb;knowledge jsonb;r jsonb;artifact turn_private.result_artifacts%rowtype;trip public.trips%rowtype;m jsonb;deps jsonb:='[]';profile public.memory_profiles%rowtype;cons public.memory_consents%rowtype;
begin
 if u is distinct from auth.uid() or not turn_private.valid_assistant_selected_sources_v2(s) or p_locale not in ('zh','en') then raise exception 'INVALID_INPUT';end if;
 -- Match existing Trip mutation order: actor (caller) -> Trip -> goal/message.
 if s->'trip' is distinct from 'null'::jsonb then
  select * into trip from public.trips where id=(s->'trip'->>'tripId')::uuid and owner_id=u for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED';end if;
  if trip.head_version<>(s->'trip'->>'headVersion')::integer or exists(select 1 from public.trip_archives where trip_id=trip.id and owner_id=u) or exists(select 1 from privacy_private.trip_deletions where trip_id=trip.id) then raise exception 'SERVICE_TASK_CONFLICT';end if;
  t:=jsonb_build_object('tripId',trip.id,'headVersion',trip.head_version,'purpose','current_trip_reference');
 end if;
 if s->'artifact' is distinct from 'null'::jsonb then
  select * into artifact from turn_private.result_artifacts where id=(s->'artifact'->>'artifactId')::uuid and owner_id=u;
  if artifact.trip_id is not null then perform 1 from public.trips where id=artifact.trip_id and owner_id=u for share;end if;
  select * into artifact from turn_private.result_artifacts where id=(s->'artifact'->>'artifactId')::uuid and owner_id=u for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED';end if;
  if artifact.current_revision<>(s->'artifact'->>'revision')::integer then raise exception 'SERVICE_TASK_CONFLICT';end if;
  if artifact.proposal_id is null then r:=public.read_result_artifacts_v1(artifact.id,artifact.current_revision);else r:=public.read_change_proposal_reference_v1(artifact.id,artifact.current_revision);end if;
  if r->>'kind' is distinct from 'result_artifact' or r->'historicalReadable' is distinct from 'true'::jsonb or r->>'lifecycle'<>'active' then raise exception 'DATA_POLICY_BLOCKED';end if;
  if p_require_current and r->'current' is distinct from 'true'::jsonb then raise exception 'SERVICE_TASK_CONFLICT';end if;
  -- Pin actual domain dependency versions; no Memory text or management list.
  for m in select value from jsonb_array_elements(r->'basis'->'memories') loop
   select * into profile from public.memory_profiles where id=(m->>'id')::uuid and owner_id=u for share;
   if not found or profile.revision<>(m->>'revision')::bigint or profile.state not in ('explicit','confirmed') then raise exception 'SERVICE_TASK_CONFLICT';end if;
   select * into cons from public.memory_consents where id=profile.consent_id and owner_id=u for share;
   if not found or cons.status<>'granted' then raise exception 'DATA_POLICY_BLOCKED';end if;
   deps:=deps||jsonb_build_object('id',profile.id,'revision',profile.revision,'consentId',cons.id,'state',profile.state);
  end loop;
  if r->'source'->>'tripId' is not null then
   perform 1 from public.trips x where x.id=(r->'source'->>'tripId')::uuid and x.owner_id=u and x.head_version=(r->'source'->>'tripVersion')::integer for share;
   if not found or exists(select 1 from public.trip_archives where trip_id=(r->'source'->>'tripId')::uuid) or exists(select 1 from privacy_private.trip_deletions where trip_id=(r->'source'->>'tripId')::uuid) then raise exception 'SERVICE_TASK_CONFLICT';end if;
  end if;
  if not exists(select 1 from turn_private.service_tasks x where x.id=(r->'source'->>'taskId')::uuid and x.owner_id=u and x.last_turn_id=(r->'source'->>'taskTurnId')::uuid) then raise exception 'SERVICE_TASK_CONFLICT';end if;
  a:=jsonb_build_object('artifactId',artifact.id,'revision',artifact.current_revision,'originGoalId',r->'source'->'goalId','originGoalVersion',r->'source'->'goalVersion','source',r->'source','memoryVersions',deps,'proposal',artifact.proposal_id is not null,'purpose','selected_result_reference','captured',true);
 end if;
 for e in select value from jsonb_array_elements(s->'evidence') loop
  knowledge:=public.knowledge_read_v1(jsonb_build_object('city',e->>'city','scene',e->>'scene','locale',p_locale));
  select value into row from jsonb_array_elements(knowledge->'statements') where value->>'factId'=((e->>'factId')::uuid)::text and value->>'assertionId'=((e->>'assertionId')::uuid)::text and value->'assertionRevision'=e->'assertionRevision';
  if row is null then raise exception 'SERVICE_TASK_CONFLICT';end if;
  ev:=ev||jsonb_build_object('factId',row->'factId','assertionId',row->'assertionId','assertionRevision',row->'assertionRevision','city',e->'city','scene',e->'scene','publishedAt',row->'publishedAt','expiresAt',row->'expiresAt','sourceRevisionIds',(select coalesce(jsonb_agg(value->'sourceRevisionId' order by value->>'sourceRevisionId'),'[]') from jsonb_array_elements(row->'sources')),'recipient','first_party');
 end loop;
 return jsonb_build_object('artifact',a,'trip',t,'evidence',ev);
end $$;
revoke all on function turn_private.qualify_assistant_selected_sources_v2(uuid,jsonb,text,boolean) from public,anon,authenticated,service_role;

create function public.submit_assistant_message_sources_v2(
 p_conversation_id uuid,p_message_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,p_relationship text,p_goal_id uuid,p_expected_goal_version integer,p_task_id uuid,p_parent_message_id uuid,p_turn_id uuid,p_selected_sources jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();prior turn_private.assistant_message_source_receipts%rowtype;d text;captured jsonb;accepted jsonb;result jsonb;
begin
 if p_task_id is not null or not turn_private.valid_assistant_selected_sources_v2(p_selected_sources) then raise exception 'INVALID_INPUT';end if;
 d:=encode(sha256(convert_to(jsonb_build_array(p_conversation_id,p_message_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_relationship,p_goal_id,p_expected_goal_version,p_task_id,p_parent_message_id,p_turn_id,p_selected_sources)::text,'UTF8')),'hex');
 select * into prior from turn_private.assistant_message_source_receipts where owner_id=u and request_key=p_idempotency_key;
 if found then
  if prior.request_digest<>d then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
  if not turn_private.text_policy_current(p_policy_id) or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null) then raise exception 'DATA_POLICY_BLOCKED';end if;
  return prior.accepted_receipt||jsonb_build_object('reused',true);
 end if;
 captured:=turn_private.qualify_assistant_selected_sources_v2(u,p_selected_sources,p_locale,true);
 -- Same transaction calls the unchanged admission exactly once; source failure rolls all back.
 accepted:=public.submit_assistant_message_v1(p_conversation_id,p_message_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_relationship,p_goal_id,p_expected_goal_version,p_task_id,p_parent_message_id,p_turn_id);
 if accepted->>'kind' is distinct from 'accepted' or accepted->'reused' is distinct from 'false'::jsonb then raise exception 'SERVICE_TASK_CONFLICT';end if;
 if p_relationship='amendment' and captured->'artifact'->>'originGoalId'=p_goal_id::text and (captured->'artifact'->>'originGoalVersion')::integer=p_expected_goal_version then
  captured:=jsonb_set(captured,'{artifact,purpose}','"previous_result_reference"');
 end if;
 result:=accepted||jsonb_build_object('selectedSources',captured,'readyForProvider',false);
 insert into turn_private.assistant_message_source_receipts(message_id,owner_id,request_key,request_digest,input_sources,captured_sources,accepted_receipt) values(p_message_id,u,p_idempotency_key,d,p_selected_sources,captured,result);
 return result;
end $$;
revoke all on function public.submit_assistant_message_sources_v2(uuid,uuid,uuid,uuid,text,text,text,uuid,integer,uuid,uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.submit_assistant_message_sources_v2(uuid,uuid,uuid,uuid,text,text,text,uuid,integer,uuid,uuid,uuid,jsonb) to authenticated;

create function public.read_assistant_message_sources_v2(p_policy_id uuid,p_conversation_id uuid,p_message_id uuid,p_goal_id uuid,p_expected_goal_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();m turn_private.assistant_messages%rowtype;g turn_private.assistant_goals%rowtype;c turn_private.assistant_conversations%rowtype;receipt turn_private.assistant_message_source_receipts%rowtype;input_refs jsonb:='{"artifact":null,"trip":null,"evidence":[]}';captured jsonb;fresh jsonb;art jsonb;trip public.trips%rowtype;knowledge jsonb;e jsonb;ev jsonb:='[]';row jsonb;tasks jsonb:='[]';history jsonb;
begin
 if p_conversation_id is null or p_message_id is null or p_goal_id is null or p_expected_goal_version is null then raise exception 'INVALID_INPUT';end if;
 select * into c from turn_private.assistant_conversations where id=p_conversation_id and owner_id=u and policy_id=p_policy_id;
 if not found or not turn_private.text_policy_current(p_policy_id) or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id and revoked_at is null) then raise exception 'DATA_POLICY_BLOCKED';end if;
 select * into m from turn_private.assistant_messages where id=p_message_id and owner_id=u and conversation_id=c.id and goal_id=p_goal_id;
 select * into g from turn_private.assistant_goals where id=p_goal_id and owner_id=u and conversation_id=c.id;
 if m.id is null or g.id is null or m.policy_id<>p_policy_id or m.consent_id<>c.consent_id or g.scope_version<>p_expected_goal_version or m.scope_version<>p_expected_goal_version then raise exception 'SERVICE_TASK_CONFLICT';end if;
 select * into receipt from turn_private.assistant_message_source_receipts where message_id=m.id and owner_id=u;
 if found then input_refs:=receipt.input_sources;captured:=receipt.captured_sources;else captured:=input_refs;end if;
 fresh:=turn_private.qualify_assistant_selected_sources_v2(u,input_refs,m.locale,coalesce(captured->'artifact'->>'purpose','')<>'previous_result_reference');
 if captured->'artifact' is distinct from 'null'::jsonb then
  if captured->'artifact'->>'purpose'='previous_result_reference' then
   if m.relationship<>'amendment' or captured->'artifact'->>'originGoalId'<>g.id::text or (captured->'artifact'->>'originGoalVersion')::integer<>g.scope_version-1 then raise exception 'SERVICE_TASK_CONFLICT';end if;
   fresh:=jsonb_set(fresh,'{artifact,purpose}','"previous_result_reference"');
  end if;
  if fresh->'artifact' is distinct from captured->'artifact' then raise exception 'SERVICE_TASK_CONFLICT';end if;
  if coalesce((captured->'artifact'->>'proposal')::boolean,false) then art:=public.read_change_proposal_reference_v1((input_refs->'artifact'->>'artifactId')::uuid,(input_refs->'artifact'->>'revision')::integer);else art:=public.read_result_artifacts_v1((input_refs->'artifact'->>'artifactId')::uuid,(input_refs->'artifact'->>'revision')::integer);end if;
 end if;
 if fresh->'trip' is distinct from captured->'trip' or fresh->'evidence' is distinct from captured->'evidence' then raise exception 'SERVICE_TASK_CONFLICT';end if;
 if input_refs->'trip' is distinct from 'null'::jsonb then select * into trip from public.trips where id=(input_refs->'trip'->>'tripId')::uuid and owner_id=u;end if;
 for e in select value from jsonb_array_elements(input_refs->'evidence') loop
  knowledge:=public.knowledge_read_v1(jsonb_build_object('city',e->>'city','scene',e->>'scene','locale',m.locale));
  select value into row from jsonb_array_elements(knowledge->'statements') where value->>'factId'=((e->>'factId')::uuid)::text and value->>'assertionId'=((e->>'assertionId')::uuid)::text and value->'assertionRevision'=e->'assertionRevision';
  if row is null then raise exception 'SERVICE_TASK_CONFLICT';end if;
  ev:=ev||jsonb_build_object('reference',e,'text',row->'text','conditions',row->'conditions','exclusions',row->'exclusions','version',fresh->'evidence'->(jsonb_array_length(ev)),'recipient','first_party');
 end loop;
 -- Metadata summary only. No task transcript, raw Memory or copied result/Trip body.
 select coalesce(jsonb_agg(v),'[]') into tasks from (select jsonb_build_object('taskId',t.id,'scopeVersion',t.scope_version,'lastTurnId',t.last_turn_id,'status',v.status) v
  from turn_private.service_tasks t join public.turns v on v.id=t.last_turn_id and v.owner_id=u
  where t.owner_id=u and exists(select 1 from turn_private.assistant_messages a where a.owner_id=u and a.conversation_id=c.id and a.goal_id=g.id and a.task_id=t.id)
  and turn_private.text_policy_current(t.policy_id) and exists(select 1 from turn_private.text_consents x where x.owner_id=u and x.policy_id=t.policy_id and x.consent_id=t.consent_id and x.revoked_at is null)
  and exists(select 1 from turn_private.text_content x where x.turn_id=t.last_turn_id and x.owner_id=u and x.hidden_at is null)
  order by t.created_at desc limit 3) q;
 select coalesce(jsonb_agg(v order by seq),'[]') into history from (select sequence seq,jsonb_build_object('messageId',a.id,'sequence',a.sequence,'scopeVersion',a.scope_version,'relationship',a.relationship,'text',left(a.input_text,600)) v
  from turn_private.assistant_messages a where a.owner_id=u and a.conversation_id=c.id and a.goal_id=g.id and a.policy_id=c.policy_id and a.consent_id=c.consent_id and a.id<>m.id
  and (a.turn_id is null or exists(select 1 from turn_private.text_content x where x.turn_id=a.turn_id and x.owner_id=u and x.hidden_at is null)) order by sequence desc limit 3) q;
 return jsonb_build_object('kind','selected_source_context','conversationId',c.id,'goal',jsonb_build_object('id',g.id,'scopeVersion',g.scope_version,'text',g.current_text),
  'message',jsonb_build_object('id',m.id,'sequence',m.sequence,'goalId',m.goal_id,'scopeVersion',m.scope_version,'text',m.input_text,'taskId',m.task_id),
  'capturedSources',captured,'artifact',coalesce(art,'null'::jsonb),'trip',case when trip.id is null then 'null'::jsonb else jsonb_build_object('tripId',trip.id,'headVersion',trip.head_version,'title',left(trip.title,160)) end,
  'evidence',ev,'tasks',tasks,'history',history,'readyForProvider',false,'recipient','first_party');
end $$;
revoke all on function public.read_assistant_message_sources_v2(uuid,uuid,uuid,uuid,integer) from public,anon,service_role;
grant execute on function public.read_assistant_message_sources_v2(uuid,uuid,uuid,uuid,integer) to authenticated;

create function public.assistant_message_source_export_owner_v2(p_owner uuid,p_after_message uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb;more boolean;last_id uuid;
begin
 if auth.role() is distinct from 'service_role' or p_owner is null then raise exception 'FORBIDDEN';end if;
 if p_limit is null or p_limit not between 1 and 100 or (p_after_message is not null and not exists(select 1 from turn_private.assistant_message_source_receipts where owner_id=p_owner and message_id=p_after_message)) then raise exception 'INVALID_INPUT';end if;
 with candidates as(select * from turn_private.assistant_message_source_receipts where owner_id=p_owner and (p_after_message is null or message_id>p_after_message) order by message_id limit p_limit+1),delivered as(select * from candidates order by message_id limit p_limit)
 select coalesce((select jsonb_agg(jsonb_build_object('messageId',d.message_id,'inputReferences',d.input_sources,'capturedReferences',d.captured_sources,'createdAt',d.created_at) order by d.message_id) from delivered d),'[]'),(select count(*)>p_limit from candidates),(select message_id from delivered order by message_id desc limit 1) into items,more,last_id;
 return jsonb_build_object('schemaVersion','assistant-message-sources-export/2','items',items,'hasMore',more,'nextCursor',case when more then last_id else null end,'sectionComplete',not more);
end $$;
revoke all on function public.assistant_message_source_export_owner_v2(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.assistant_message_source_export_owner_v2(uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
