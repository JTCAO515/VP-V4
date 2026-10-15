-- IOS-001 / #203: append original qualified goal-return reader after current QA.
-- Original executable body preserved; no retained rows or existing functions changed.
create function turn_private.goal_return_reference_v1(
 p_policy_id uuid,p_conversation_id uuid,p_goal_id uuid,p_goal_version integer,
 p_parent_message_id uuid,p_input_sequence bigint,p_mobile_epoch bigint
) returns jsonb language plpgsql security definer
set search_path='' set statement_timeout='5s' set lock_timeout='250ms' as $$
declare u uuid:=turn_private.text_owner(); s uuid:=(auth.jwt()->>'session_id')::uuid;
 c turn_private.assistant_conversations%rowtype; g turn_private.assistant_goals%rowtype;
 m turn_private.assistant_messages%rowtype; a turn_private.result_artifacts%rowtype;
 r turn_private.result_revisions%rowtype; selected_id uuid; selected_rev integer;
 selected_event bigint:=0; head_events bigint[]; head_event bigint; scanned integer:=0;
 comparison_a turn_private.result_artifacts%rowtype; comparison_r turn_private.result_revisions%rowtype;
 basis_a turn_private.result_artifacts; basis_r turn_private.result_revisions;
 source_n turn_private.assistant_messages%rowtype; basis_n record; task_n turn_private.service_tasks%rowtype; memory_n jsonb; memory_consent uuid;
 readback jsonb; denied jsonb:=jsonb_build_object('kind','unavailable');
begin
 if auth.role() is distinct from 'authenticated' or p_policy_id is null or p_conversation_id is null
  or p_goal_id is null or p_parent_message_id is null or p_goal_version is null
  or p_goal_version not between 1 and 10000 or p_input_sequence is null
  or p_input_sequence not between 1 and 1000000 or p_mobile_epoch is null
  or p_mobile_epoch not between 1 and 9007199254740991 then return denied;end if;
 if not exists(select 1 from identity_private.mobile_accounts where owner_id=u and session_id=s and epoch=p_mobile_epoch)
  or not exists(select 1 from identity_private.mobile_attempts where owner_id=u and session_id=s and epoch=p_mobile_epoch)
  then raise exception 'SESSION_REPLACED';end if;
 if not turn_private.text_policy_current(p_policy_id) then return denied;end if;
 select * into c from turn_private.assistant_conversations where id=p_conversation_id and owner_id=u for update nowait;
 if not found or c.policy_id<>p_policy_id or not exists(select 1 from turn_private.text_consents
  where owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id and revoked_at is null) then return denied;end if;
 select * into g from turn_private.assistant_goals where id=p_goal_id and owner_id=u and conversation_id=c.id for update nowait;
 if not found or g.scope_version<>p_goal_version or g.trip_terminal then return denied;end if;
 -- Goal UPDATE conflicts with the existing immediate goal FK KEY SHARE;
 -- membership and latest-message inserts cannot commit after this fence.
 -- Subsequent READ COMMITTED commands obtain fresh snapshots after the fence.
 -- Every new explicit lock is NOWAIT: late Trip locks cannot reverse-wait.
 -- Latest authoritative goal input, independent of UUID or client timestamps.
 select * into m from turn_private.assistant_messages where owner_id=u and goal_id=g.id and conversation_id=c.id
  order by sequence desc limit 1 for share nowait;
 if not found or m.id<>p_parent_message_id or m.sequence<>p_input_sequence or m.scope_version<>p_goal_version
  or m.policy_id<>p_policy_id or m.consent_id<>c.consent_id then return denied;end if;
 -- Completeness first: all goal members, including withdrawn/stale/non-decision.
 -- Existing goal FK has no dedicated result index: measured deadline/cap stays
 -- fail-closed. An index is a separate catalog proposal, not silently added.
 for a in select * from turn_private.result_artifacts where goal_id=g.id
  order by id limit 65 for update nowait loop
  scanned:=scanned+1;if scanned>64 or a.owner_id is distinct from u then return denied;end if;
  select * into r from turn_private.result_revisions where artifact_id=a.id and owner_id=u and revision=a.current_revision;
  if not found then return denied;end if;
  select array_agg(x.id order by x.id) into head_events from (
   select id from turn_private.result_events where artifact_id=a.id and revision=r.revision
    and event_type in('ready','revised') order by id limit 2
  ) x;
  if coalesce(cardinality(head_events),0)<>1 then return denied;end if;
  head_event:=head_events[1];
  if not exists(select 1 from turn_private.result_events where id=head_event and owner_id=u) then return denied;end if;
  if r.content->>'schemaVersion'='decision/1' then
   if head_event=selected_event then return denied;end if;
   if head_event>selected_event then selected_event:=head_event;selected_id:=a.id;selected_rev:=r.revision;end if;
  end if;
 end loop;
 if selected_id is null then return denied;end if;
 -- No older choice fallback if the canonical newest decision is unusable.
 -- Protect all positive mutable qualification dependencies of decision and its
 -- referenced comparison, before the final original qualification statement.
 select * into a from turn_private.result_artifacts where id=selected_id and owner_id=u;
 select * into r from turn_private.result_revisions where artifact_id=a.id and revision=selected_rev and owner_id=u;
 select * into comparison_a from turn_private.result_artifacts
  where id=(r.content->'comparisonRef'->>'artifactId')::uuid and owner_id=u for update nowait;
 if not found then return denied;end if;
 select * into comparison_r from turn_private.result_revisions where artifact_id=comparison_a.id
  and revision=(r.content->'comparisonRef'->>'revision')::integer and owner_id=u;
 if not found then return denied;end if;
 for basis_n in select a as artifact_n,r as revision_n union all select comparison_a,comparison_r loop
  basis_a:=basis_n.artifact_n; basis_r:=basis_n.revision_n;
  perform 1 from turn_private.assistant_goals where id=basis_a.goal_id and owner_id=u for share nowait;
  select * into source_n from turn_private.assistant_messages where id=basis_a.input_message_id and owner_id=u for share nowait;
  if not found then return denied;end if;
  select * into task_n from turn_private.service_tasks where id=basis_a.task_id and owner_id=u for share nowait;
  if not found then return denied;end if;
  perform 1 from turn_private.text_content where owner_id=u
   and turn_id in(task_n.goal_turn_id,basis_r.task_turn_id) order by turn_id for share nowait;
  perform 1 from public.turns where owner_id=u and id=basis_r.task_turn_id for share nowait;
  perform 1 from turn_private.text_consents where owner_id=u and
   (policy_id=task_n.policy_id and consent_id=task_n.consent_id or policy_id=source_n.policy_id and consent_id=source_n.consent_id)
   order by policy_id,consent_id for share nowait;
  if basis_a.trip_id is not null then
   perform 1 from public.trips where id=basis_a.trip_id and owner_id=u for share nowait;
   perform 1 from turn_private.assistant_goal_trip_links where goal_id=basis_a.goal_id and owner_id=u for share nowait;
   perform 1 from turn_private.assistant_goal_trip_receipts where operation_id=basis_r.trip_link_operation_id and owner_id=u for share nowait;
  end if;
  for memory_n in select value from jsonb_array_elements(basis_r.memory_basis) loop
   select consent_id into memory_consent from public.memory_profiles where id=(memory_n->>'id')::uuid and owner_id=u for share nowait;
   if not found then return denied;end if;
   perform 1 from public.memory_consents where id=memory_consent and owner_id=u for share nowait;
  end loop;
 end loop;
 -- Final existing reader is the qualification linearization statement. All
 -- mutable positive sources and the full membership/head set are now fenced.
 readback:=public.read_result_artifact_v2(selected_id,selected_rev);
 if readback->>'kind' is distinct from 'result_artifact' or readback->>'current' is distinct from 'true'
  or readback->>'lifecycle' is distinct from 'active' or readback->'content'->>'schemaVersion' is distinct from 'decision/1'
  or readback->'content'->>'state' is distinct from 'chosen'
  or readback->'source'->>'goalId' is distinct from p_goal_id::text
  or readback->'source'->>'goalVersion' is distinct from p_goal_version::text
  or readback->'source'->>'inputMessageId' is distinct from p_parent_message_id::text
  or readback->'source'->>'inputSequence' is distinct from p_input_sequence::text then return denied;end if;
 if not exists(select 1 from identity_private.mobile_accounts where owner_id=u and session_id=s and epoch=p_mobile_epoch)
  or not exists(select 1 from identity_private.mobile_attempts where owner_id=u and session_id=s and epoch=p_mobile_epoch)
  then raise exception 'SESSION_REPLACED';end if;
 return jsonb_build_object('kind','goal_return' ,'schemaVersion','goal-return/1',
  'scope',jsonb_build_object('conversationId',c.id,'goalId',g.id,'goalVersion',g.scope_version,'parentMessageId',m.id,'inputSequence',m.sequence),
  'lastDecision',jsonb_build_object('artifactId',selected_id,'revision',selected_rev,'eventId',selected_event::text),
  'nextStep',jsonb_build_object('kind','unknown'));
exception when lock_not_available then return denied;
 when invalid_text_representation or numeric_value_out_of_range then return denied;
end $$;
revoke all on function turn_private.goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint) from public,anon,authenticated,service_role;

-- Public Native read-only wrapper; authenticated EXECUTE only.
create function public.read_goal_return_reference_v1(
 p_policy_id uuid,p_conversation_id uuid,p_goal_id uuid,p_goal_version integer,
 p_parent_message_id uuid,p_input_sequence bigint,p_mobile_epoch bigint
) returns jsonb language sql security definer set search_path='' set statement_timeout='5s' set lock_timeout='250ms' as $$
 select turn_private.goal_return_reference_v1(p_policy_id,p_conversation_id,p_goal_id,p_goal_version,p_parent_message_id,p_input_sequence,p_mobile_epoch)
$$;
revoke all on function public.read_goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint) from public,anon,service_role;
grant execute on function public.read_goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint) to authenticated;

alter function turn_private.goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint) owner to postgres;
alter function public.read_goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint) owner to postgres;
