CREATE OR REPLACE FUNCTION export_private.core_turn_page_v1(v jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j export_private.core_jobs_v1;l uuid;g integer;src jsonb;page jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if notification_private.exact(v,array['requestId','leaseId','generation','section','cursor','limit']) is not true or notification_private.uuid(v->'requestId') is not true or notification_private.uuid(v->'leaseId') is not true or export_private.profile_natural_v1(v->'generation',3) is not true or v->'generation'='0' or v->>'section' is distinct from 'snapshot' or v->'cursor' is distinct from 'null'::jsonb or export_private.profile_natural_v1(v->'limit',100) is not true or v->'limit'='0' then raise exception 'INVALID_INPUT';end if;
 l:=(v->>'leaseId')::uuid;g:=(v->>'generation')::integer;j:=export_private.lock_job_v1((v->>'requestId')::uuid,true);
 if j.request_id is null or export_private.live_lease_v1(j,l,g) is not true then return jsonb_build_object('kind','unavailable');end if;
 if (v->>'limit')::integer>(j.policy_snapshot->>'page_size')::integer then raise exception 'INVALID_INPUT';end if;
 src:=turn_data_private.export_source_v1(j.owner_id);
 page:=jsonb_build_object('schemaVersion',case when (select count(distinct group_n.value->>'relation') from jsonb_array_elements(src->'snapshot'->'sources') as group_n(value) where group_n.value->>'relation'=any(array['scoped_edit_private.contexts_v1','scoped_edit_private.work_v1','scoped_edit_private.requests_v1','scoped_edit_private.operations_v1','scoped_edit_private.lineage_v1']))=5 then 'turn-trip-core-export/1' else 'turn-core-export/1' end,'section','snapshot','sourceDigest',src->'sourceDigest','items',jsonb_build_array(src->'snapshot'),'hasMore',false,'nextCursor',null,'sectionComplete',true);
 if octet_length(notification_private.canonical(page))>1000000 then raise exception 'TURN_CAPACITY';end if;
 if export_private.live_lease_v1(j,l,g) is not true then return jsonb_build_object('kind','unavailable');end if;return page;
end$function$
