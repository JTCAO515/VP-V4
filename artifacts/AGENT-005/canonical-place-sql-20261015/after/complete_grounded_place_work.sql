CREATE OR REPLACE FUNCTION public.complete_grounded_place_work(p_turn_id uuid, p_lease_token uuid, p_intent text, p_request_scope text, p_unanswered_needs text, p_place_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare source_text text; city text; needs jsonb; item jsonb; selected jsonb; result jsonb; final_intent text; final_scope text;
begin
 if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) then return place_actions_private.ask_complete_v1(p_turn_id,p_lease_token,p_intent,p_request_scope,p_unanswered_needs,p_place_name);end if;
 if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) and place_actions_private.ask_bound_v1(p_turn_id,p_lease_token) is null then return jsonb_build_object('kind','blocked');end if;
 if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and guide_private.bound_v1(p_turn_id,p_lease_token) is null then return jsonb_build_object('kind','blocked');end if;
 if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) then return guide_private.place_complete_v1(p_turn_id,p_lease_token,p_intent,p_request_scope,p_unanswered_needs,p_place_name);end if;
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode in('planning_intake_comparison_v2','scoped_trip_edit_v1','travel_directions_v1')) then return jsonb_build_object('kind','stale'); end if;
 if p_intent is null or p_intent not in ('place_address','place_opening_hours','place_address_and_hours')
  or p_request_scope is null or p_request_scope not in ('single','additional_needs')
  or p_place_name is null or length(p_place_name) not between 1 and 160 or p_place_name~'[[:cntrl:]]'
  or p_unanswered_needs is null or octet_length(p_unanswered_needs)>12000 then raise exception 'INVALID_INPUT'; end if;
 needs:=p_unanswered_needs::jsonb;
 if jsonb_typeof(needs) is distinct from 'array' then raise exception 'INVALID_INPUT'; end if;
 if jsonb_array_length(needs)>6 or ((p_request_scope='additional_needs')<>(jsonb_array_length(needs)>0)) then raise exception 'INVALID_INPUT'; end if;
 if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
 select c.input_text,g.city into source_text,city from turn_private.text_content c
 join turn_private.grounded_turns g on g.turn_id=c.turn_id and g.owner_id=c.owner_id where c.turn_id=p_turn_id and g.completed_at is null;
 if not found then return jsonb_build_object('kind','blocked'); end if;
 if strpos(source_text,p_place_name)=0 then raise exception 'INVALID_INPUT'; end if;
 for item in select value from jsonb_array_elements(needs) loop
  if jsonb_typeof(item)<>'string' or (item#>>'{}')!~'[^[:space:]]' or length(item#>>'{}')>240
   or strpos(source_text,item#>>'{}')=0 then raise exception 'INVALID_INPUT'; end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(needs))<>jsonb_array_length(needs) then raise exception 'INVALID_INPUT'; end if;
 -- Same lock order as Ops: name barrier before publication row locks.
 perform pg_catalog.pg_advisory_xact_lock_shared(160047,1);
 begin
  selected:=knowledge_review_private.place_subject(p_place_name,city);
 exception when raise_exception then
  if SQLERRM<>'KNOWLEDGE_DISABLED' then raise; end if;
  return public.complete_grounded_work(p_turn_id,p_lease_token,'technical_failure','unknown');
 end;
 final_intent:=case selected->>'kind' when 'matched' then p_intent when 'ambiguous' then 'clarification' else 'unsupported' end;
 final_scope:=case when selected->>'kind'='matched' then p_request_scope else 'unknown' end;
 result:=turn_private.complete_selected_grounded_work(p_turn_id,p_lease_token,final_intent,final_scope,selected->>'subjectId');
 if result->>'kind'='finished' then
  update turn_private.grounded_turns set place_name=case when intent<>'technical_failure' then p_place_name end,
   place_resolution=case when intent<>'technical_failure' then selected->>'kind' end,
   unanswered_needs=case when request_scope='additional_needs' then needs else '[]'::jsonb end where turn_id=p_turn_id;
 end if;
 return result;
end $function$
;
