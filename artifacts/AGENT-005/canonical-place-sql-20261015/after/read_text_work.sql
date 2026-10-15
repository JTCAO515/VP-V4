CREATE OR REPLACE FUNCTION public.read_text_work(p_turn_id uuid, p_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c turn_private.text_content%rowtype; p turn_private.text_policies%rowtype; history jsonb; payload jsonb;
begin
 if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) then return jsonb_build_object('kind','blocked');end if;
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode in('planning_intake_comparison_v2','scoped_trip_edit_v1','travel_directions_v1')) then return jsonb_build_object('kind','blocked'); end if;
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode='planning_comparison_v1')
    then return jsonb_build_object('kind','blocked'); end if;
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  select * into p from turn_private.text_policies where id=c.policy_id;
  if p.context_mode='knowledge_intent_v1' then return jsonb_build_object('kind','blocked'); end if;
  if p.context_mode='task_history_v1' then
    history:=turn_private.task_history(p_turn_id);
    if history is null then return jsonb_build_object('kind','blocked'); end if;
    payload:=jsonb_build_object('kind','task_input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint,'history',history);
    return payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(payload::text,'UTF8')),'hex'));
  end if;
  return jsonb_build_object('kind','input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint);
end $function$
;
