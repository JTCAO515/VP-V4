-- Private witness of exactly original selected source, no public count fields.
create function turn_private.assistant_delivery_source_v1(p_owner uuid,p_graph jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows_n jsonb;n integer;
begin
 if not turn_data_private.runtime_supported_v1() then raise exception 'ASSISTANT_EVENT_SCHEMA_UNSUPPORTED';end if;
 select coalesce(jsonb_agg(jsonb_build_object('conversationId',conversation_id,'sequence',sequence,
  'digest',result_data_private.digest_v1(to_jsonb(e)::text)) order by conversation_id,sequence),'[]'::jsonb),count(*)
 into rows_n,n from (
  select * from turn_private.assistant_events_v1 x where owner_id=p_owner and source_kind<>'retired'
   and (coalesce(p_graph->'turnIds','[]'::jsonb) ? x.turn_id::text
    or coalesce(p_graph->'artifactIds','[]'::jsonb) ? x.artifact_id::text)
   order by conversation_id,sequence limit 4101
 ) e;
 if n>4100 or octet_length(rows_n::text)>65536 then raise exception 'ASSISTANT_EVENT_SCOPE_TOO_LARGE';end if;
 return jsonb_build_object('rows',rows_n);
end $$;

create function turn_private.lock_assistant_delivery_v1(p_owner uuid,p_graph jsonb,p_witness jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare x record;
begin
 -- Original caller has already locked all original selected parent/source rows.
 -- No subsequent original Task/Turn/source lock is acquired by this helper.
 for x in select distinct (value->>'conversationId')::uuid id from jsonb_array_elements(p_witness->'rows') order by id loop
  perform 1 from turn_private.assistant_event_heads_v1 where conversation_id=x.id and owner_id=p_owner for update nowait;
  if not found then raise exception 'ASSISTANT_EVENT_SOURCE_CHANGED';end if;
 end loop;
 if turn_private.assistant_delivery_source_v1(p_owner,p_graph) is distinct from p_witness then raise exception 'ASSISTANT_EVENT_SOURCE_CHANGED';end if;
 perform 1 from turn_private.assistant_events_v1 e where owner_id=p_owner and exists(select 1 from jsonb_array_elements(p_witness->'rows') witness_row
  where (witness_row->>'conversationId')::uuid=e.conversation_id and (witness_row->>'sequence')::bigint=e.sequence)
  order by conversation_id,sequence for update nowait;
end $$;

create function turn_private.retire_assistant_delivery_v1(p_owner uuid,p_graph jsonb,p_witness jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare x jsonb;
begin
 perform turn_private.lock_assistant_delivery_v1(p_owner,p_graph,p_witness);
 for x in select value from jsonb_array_elements(p_witness->'rows') order by (value->>'conversationId')::uuid,(value->>'sequence')::bigint loop
  perform turn_private.retire_assistant_event_v1((x->>'conversationId')::uuid,(x->>'sequence')::bigint);
 end loop;
end $$;
revoke all on function turn_private.assistant_delivery_source_v1(uuid,jsonb),turn_private.lock_assistant_delivery_v1(uuid,jsonb,jsonb),
 turn_private.retire_assistant_delivery_v1(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
