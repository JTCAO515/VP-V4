-- Called solely inside the existing service-role claimer after lock_turn.
create or replace function place_actions_private.ask_claim_current_v1(tid uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 return place_actions_private.ask_root_current_v1(tid) is not null;
exception when raise_exception then return false;end $$;
revoke all on function place_actions_private.ask_claim_current_v1(uuid) from public,anon,authenticated,service_role;

create or replace function place_actions_private.ask_complete_v1(tid uuid,token uuid,intent text,scope text,needs_text text,place_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb:=place_actions_private.ask_bound_v1(tid,token);needs jsonb;q text;result jsonb;begin
 if p is null then return jsonb_build_object('kind','blocked');end if;
 if intent not in('place_address','place_opening_hours','place_address_and_hours') or scope not in('single','additional_needs') or needs_text is null or octet_length(needs_text)>12000 then raise exception 'INVALID_INPUT';end if;
 needs:=needs_text::jsonb;select input_text into q from turn_private.text_content where turn_id=tid;
 if jsonb_typeof(needs) is distinct from 'array' or jsonb_array_length(needs)>6 or (scope='additional_needs')<>(jsonb_array_length(needs)>0)
 or exists(select 1 from jsonb_array_elements(needs)x where jsonb_typeof(x) is distinct from 'string' or length(x#>>'{}') not between 1 and 240 or strpos(q,x#>>'{}')=0)
 or (select count(distinct x) from jsonb_array_elements(needs)x)<>jsonb_array_length(needs) then raise exception 'INVALID_INPUT';end if;
 -- Canonical subject comes only from the original reviewed mapping, never place_name.
 result:=turn_private.complete_selected_grounded_work(tid,token,intent,scope,p->'basis'->>'subjectId');
 if result->>'kind'='finished' then update turn_private.grounded_turns set place_name=null,place_resolution='matched',unanswered_needs=needs where turn_id=tid;end if;
 return result;
end $$;
revoke all on function place_actions_private.ask_complete_v1(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
