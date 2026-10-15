CREATE OR REPLACE FUNCTION public.read_grounded_work(p_turn_id uuid, p_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c turn_private.text_content%rowtype; p turn_private.text_policies%rowtype; g turn_private.grounded_turns%rowtype; payload jsonb;
begin
 if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and guide_private.bound_v1(p_turn_id,p_lease_token) is null then return jsonb_build_object('kind','blocked');end if;
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode in('planning_intake_comparison_v2','scoped_trip_edit_v1','travel_directions_v1')) then return jsonb_build_object('kind','blocked'); end if;
 if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
 select * into c from turn_private.text_content where turn_id=p_turn_id;
 select * into p from turn_private.text_policies where id=c.policy_id and context_mode='knowledge_intent_v1';
 if not found then return jsonb_build_object('kind','blocked'); end if;
 select * into g from turn_private.grounded_turns where turn_id=c.turn_id and owner_id=c.owner_id and locale=c.locale;
 if not found then return jsonb_build_object('kind','blocked'); end if;
 payload:=jsonb_build_object('kind','intent_input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint);
 payload:=payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(jsonb_build_array(payload,g.city,g.scope_version)::text,'UTF8')),'hex')); if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) then return guide_private.input_v1(p_turn_id,p_lease_token,payload);end if;return payload;
end $function$
