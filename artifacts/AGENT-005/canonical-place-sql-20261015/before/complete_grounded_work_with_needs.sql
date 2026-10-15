CREATE OR REPLACE FUNCTION public.complete_grounded_work_with_needs(p_turn_id uuid, p_lease_token uuid, p_intent text, p_request_scope text, p_unanswered_needs text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare needs jsonb; source_text text; item jsonb; result jsonb;
begin
 if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and guide_private.bound_v1(p_turn_id,p_lease_token) is null then return jsonb_build_object('kind','blocked');end if;
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode in('planning_intake_comparison_v2','scoped_trip_edit_v1','travel_directions_v1')) then return jsonb_build_object('kind','stale'); end if;
 if p_unanswered_needs is null or octet_length(p_unanswered_needs)>12000 then raise exception 'INVALID_INPUT'; end if;
 needs:=p_unanswered_needs::jsonb;
 if jsonb_typeof(needs)<>'array' then raise exception 'INVALID_INPUT'; end if;
 if jsonb_array_length(needs)>6 or p_request_scope is null
  or ((p_request_scope='additional_needs') <> (jsonb_array_length(needs)>0)) then raise exception 'INVALID_INPUT'; end if;
 if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
 select input_text into source_text from turn_private.text_content where turn_id=p_turn_id;
 if source_text is null then return jsonb_build_object('kind','blocked'); end if;
 for item in select value from jsonb_array_elements(needs) loop
  if jsonb_typeof(item)<>'string' then raise exception 'INVALID_INPUT'; end if;
  if (item#>>'{}') !~ '[^[:space:]]' or length(item#>>'{}')>240
   or strpos(source_text,item#>>'{}')=0 then raise exception 'INVALID_INPUT'; end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(needs))<>jsonb_array_length(needs) then raise exception 'INVALID_INPUT'; end if;
 -- The existing completion owns dispatch, current evidence, deadline recheck,
 -- immutable result and terminal event. Both writes commit or roll back together.
 result:=public.complete_grounded_work(p_turn_id,p_lease_token,p_intent,p_request_scope);
 if result->>'kind'='finished' then
  update turn_private.grounded_turns set unanswered_needs=case when request_scope='additional_needs' then needs else '[]'::jsonb end
   where turn_id=p_turn_id;
 end if;
 return result;
end $function$
