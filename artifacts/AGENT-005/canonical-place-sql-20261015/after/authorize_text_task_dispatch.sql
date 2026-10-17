CREATE OR REPLACE FUNCTION public.authorize_text_task_dispatch(p_turn_id uuid, p_lease_token uuid, p_policy_id uuid, p_provider text, p_context_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb; c turn_private.text_content%rowtype;
begin
 if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) then return jsonb_build_object('kind','blocked');end if;
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode in('planning_intake_comparison_v2','scoped_trip_edit_v1','travel_directions_v1')) then return jsonb_build_object('kind','blocked'); end if;
  payload:=public.read_text_work(p_turn_id,p_lease_token);
  if payload->>'kind' is distinct from 'task_input' or payload->>'policyId' is distinct from p_policy_id::text
    or payload->>'provider' is distinct from p_provider or payload->>'contextDigest' is distinct from p_context_digest then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,c.consent_id,c.policy_id) on conflict do nothing;
  if not found then return jsonb_build_object('kind','blocked'); end if;
  return jsonb_build_object('kind','authorized');
end $function$
;
