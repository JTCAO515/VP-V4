create function turn_private.read_planning_qualified_intake_v1(p_owner uuid,p_turn uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;j turn_private.planning_comparisons%rowtype;b turn_private.planning_intake_bindings%rowtype;
 i turn_private.assistant_travel_intakes%rowtype;m turn_private.assistant_messages%rowtype;g turn_private.assistant_goals%rowtype;
 t turn_private.text_policies%rowtype;d text;basis text;qualified jsonb;payload jsonb;unknowns jsonb:='[]';k text;
begin
 select * into w from turn_private.work where turn_id=p_turn and owner_id=p_owner;
 if not found or w.execution_mode<>'planning_intake_comparison_v2' then return jsonb_build_object('kind','blocked'); end if;
 if p_lease is null then
  if w.state<>'queued' then return jsonb_build_object('kind','blocked'); end if;
 else
  if not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return jsonb_build_object('kind','blocked'); end if;
  select * into w from turn_private.work where turn_id=p_turn for update;
  if w.state<>'leased' or w.lease_token is distinct from p_lease or w.expires_at<=clock_timestamp() then return jsonb_build_object('kind','blocked'); end if;
 end if;
 if not exists(select 1 from public.turns where id=p_turn and owner_id=p_owner and status='accepted') then return jsonb_build_object('kind','blocked'); end if;
 select * into j from turn_private.planning_comparisons where turn_id=p_turn and owner_id=p_owner and state='queued';
 select * into b from turn_private.planning_intake_bindings where turn_id=p_turn and owner_id=p_owner;
 select * into i from turn_private.assistant_travel_intakes where message_id=b.message_id and owner_id=p_owner;
 select * into m from turn_private.assistant_messages where id=j.message_id and owner_id=p_owner;
 select * into g from turn_private.assistant_goals where id=j.goal_id and owner_id=p_owner;
 select * into t from turn_private.text_policies where id=i.policy_id;
 if j.turn_id is null or b.turn_id is null or i.message_id is null or m.id is null or g.id is null or t.id is null
  or j.message_id<>i.message_id or j.task_id<>m.task_id or j.goal_id<>i.goal_id or j.goal_version<>i.goal_version
  or b.intake_revision<>i.intake_revision or not turn_private.planning_policy_current(j.planning_policy_id)
  or not exists(select 1 from turn_private.planning_consents c where c.owner_id=p_owner and c.policy_id=j.planning_policy_id and c.consent_id=j.planning_consent_id and c.revoked_at is null)
  then return jsonb_build_object('kind','blocked'); end if;
 basis:=turn_private.planning_action_basis(p_turn,p_owner,j.message_id,j.memory_basis);
 d:=turn_private.assistant_travel_current_basis_v1(p_owner,i.message_id);
 if basis is null or d is null or d<>b.new_digest then return jsonb_build_object('kind','blocked'); end if;
 foreach k in array array['city','comparisonTarget','durationDays','partySize','interests','pace','lodgingBudget','dates','mobilityConstraints'] loop
  if i.intake->k='null'::jsonb then unknowns:=unknowns||to_jsonb(k); end if;
 end loop;
 if i.intake->>'city' is distinct from 'shanghai' or i.intake->>'comparisonTarget' is distinct from 'area_transport' then return jsonb_build_object('kind','blocked'); end if;
 qualified:=jsonb_build_object('version',5,'kind','travel_intake','schemaVersion','assistant-travel-current-basis/1','conversationId',i.conversation_id,'goalId',i.goal_id,'goalVersion',i.goal_version,
  'messageId',i.message_id,'messageSequence',i.message_sequence,'intakeRevision',i.intake_revision,'sourceKind','explicit_current_input','intake',i.intake,'memoryBasis',i.memory_basis,'contextDigest',d,
  'readiness',jsonb_build_object('kind','ready','scope','transport_screening','unknown',unknowns),'readyForProvider',false);
 payload:=jsonb_build_object('kind','planning_intake_input','schemaVersion','planning-intake-context/2','ownerId',p_owner,'turnId',p_turn,'taskId',j.task_id,'artifactId',j.artifact_id,
  'planningPolicyId',j.planning_policy_id,'provider',t.provider,'endpoint',t.endpoint,'goalText',g.current_text,'delegation',m.input_text,'planningActionBasis',basis,'qualifiedIntake',qualified,'intakeContextDigest',d,
  'executionAvailable',false,'readyForProvider',false);
 return payload||jsonb_build_object('planningContextDigest',encode(pg_catalog.sha256(convert_to(payload::text,'UTF8')),'hex'));
end $$;
