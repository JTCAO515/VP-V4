CREATE OR REPLACE FUNCTION public.authorize_text_dispatch(p_turn_id uuid, p_lease_token uuid, p_policy_id uuid, p_provider text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ops_decision jsonb; c turn_private.text_content%rowtype;
begin
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode in('planning_intake_comparison_v2','scoped_trip_edit_v1','travel_directions_v1')) then return jsonb_build_object('kind','blocked'); end if;
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode='planning_comparison_v1')
    then return jsonb_build_object('kind','blocked'); end if;
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  if c.policy_id is distinct from p_policy_id or not exists(select 1 from turn_private.text_policies where id=p_policy_id and provider=p_provider and context_mode='current_input_v1') then return jsonb_build_object('kind','blocked'); end if;
  ops_decision:=ops_control_private.work_decision_v1(p_turn_id,p_lease_token,'model');if ops_decision->>'kind' is distinct from 'allowed' then if ops_decision ? 'code' then return ops_decision;end if;return jsonb_build_object('kind','blocked');end if;
insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,c.consent_id,c.policy_id) on conflict do nothing;
  if not found then return jsonb_build_object('kind','blocked'); end if;
  return jsonb_build_object('kind','authorized');
end $function$
