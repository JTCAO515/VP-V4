create function public.privacy_trip_service_task_v1(p_trip_id uuid,p_target text,p_action text,p_input_bytes text,p_expected_epoch bigint) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();v jsonb;g jsonb;request uuid;root uuid;allowed boolean:=false;r jsonb;
begin
 perform turn_private.require_trip_runtime_v1();
 if auth.role() is distinct from 'authenticated' or p_target is null or p_action is null or p_input_bytes is null or p_expected_epoch is null or p_target not in('turn','conversation') or p_action not in('preview','erase','recover') or p_trip_id is null or octet_length(p_input_bytes)>16384 then raise exception 'INVALID_INPUT';end if;
 begin v:=p_input_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 if v->>'schemaVersion' is distinct from (case p_target when 'turn' then 'turn-trip-data/1' else 'conversation-trip-data/1' end) then raise exception 'TRIP_PRIVACY_VERSION_REQUIRED';end if;
 request:=(v->>'requestId')::uuid;
 if p_action='recover' then
 if p_target='turn' then select coalesce(graph,decision->'graph')->'tripPrivacyTripIds' ? p_trip_id::text into allowed from turn_data_private.operations_v1 where request_id=request and owner_id=u;
 else select coalesce(graph,decision->'graph')->'tripPrivacyTripIds' ? p_trip_id::text into allowed from conversation_data_private.operations_v1 where request_id=request and owner_id=u;end if;
 else
 if p_target='turn' then
 root:=(v->>'turnId')::uuid;
 select exists(select 1 from turn_private.service_task_turns l join turn_private.service_tasks s on s.id=l.task_id join public.chat_threads h on h.id=s.thread_id and h.owner_id=u where l.turn_id=root and l.owner_id=u and s.owner_id=u and s.expected_result='trip_modification' and h.trip_id=p_trip_id) into allowed;
 else
 root:=(v->>'rootId')::uuid;
 select exists(select 1 from turn_private.assistant_messages m join turn_private.service_tasks s on s.id=m.task_id join public.chat_threads h on h.id=s.thread_id and h.owner_id=u where m.owner_id=u and s.owner_id=u and s.expected_result='trip_modification' and h.trip_id=p_trip_id and(case v->>'rootKind' when 'conversation' then m.conversation_id=root when 'thread' then s.thread_id=root else false end)) into allowed;
 end if;
 end if;
 if allowed is distinct from true then raise exception 'FORBIDDEN';end if;
 if p_target='turn' then r:=turn_private.trip_privacy_t_api_v1(p_action,p_input_bytes,p_expected_epoch);
 else r:=turn_private.trip_privacy_c_api_v1(p_action,p_input_bytes,p_expected_epoch);end if;
 return r;
end $$;
revoke all on function public.privacy_trip_service_task_v1(uuid,text,text,text,bigint) from public,anon,service_role;
grant execute on function public.privacy_trip_service_task_v1(uuid,text,text,text,bigint) to authenticated;
