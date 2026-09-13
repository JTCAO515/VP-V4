-- Native replay has the same current authority as the grounded answer. The
-- existing Turn lock fences completion/cancellation while this snapshot is read.
create function public.read_grounded_events(p_policy_id uuid,p_turn_id uuid,p_after_sequence bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); value jsonb; rows jsonb; last_sequence integer;
begin
 if p_turn_id is null or p_policy_id is null or p_after_sequence is null
   or p_after_sequence not between 0 and 999999999999999 then raise exception 'INVALID_INPUT'; end if;
 if (public.read_grounded_policy(p_policy_id))->>'kind' is distinct from 'policy' then return jsonb_build_object('kind','unavailable'); end if;
 value:=public.read_grounded_turn(p_turn_id);
 if value->>'kind' is distinct from 'grounded_turn' or not exists(
   select 1 from turn_private.text_content where turn_id=p_turn_id and owner_id=u and policy_id=p_policy_id and hidden_at is null
 ) then return jsonb_build_object('kind','unavailable'); end if;
 select coalesce(max(sequence),0) into last_sequence from public.chat_turn_events where turn_id=p_turn_id and owner_id=u;
 if p_after_sequence>last_sequence then raise exception 'INVALID_INPUT'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('eventId',event_id,'sequence',sequence,'type',event_type,'state',state) order by sequence),'[]'::jsonb)
 into rows from (select event_id,sequence,event_type,state from public.chat_turn_events
   where turn_id=p_turn_id and owner_id=u and thread_id=(value->>'threadId')::uuid and sequence>p_after_sequence
   order by sequence limit 201) e;
 if jsonb_array_length(rows)>200 then raise exception 'EVENT_CAPACITY'; end if;
 return jsonb_build_object('kind','grounded_events','schemaVersion','grounded-events/1','turn',value,'events',rows,'lastSequence',last_sequence);
end $$;
revoke all on function public.read_grounded_events(uuid,uuid,bigint) from public,anon,service_role;
grant execute on function public.read_grounded_events(uuid,uuid,bigint) to authenticated;
notify pgrst,'reload schema';
