CREATE OR REPLACE FUNCTION export_private.core_profile_page_v1(v jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j export_private.core_jobs_v1;l uuid;g integer;item jsonb;page jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if notification_private.exact(v,array['requestId','leaseId','generation','section','cursor','limit']) is not true
  or notification_private.uuid(v->'requestId') is not true or notification_private.uuid(v->'leaseId') is not true
  or export_private.profile_natural_v1(v->'generation',3) is not true or v->'generation'='0'
  or v->>'section' is distinct from 'snapshot' or v->'cursor' is distinct from 'null'::jsonb
  or export_private.profile_natural_v1(v->'limit',100) is not true or v->'limit'='0' then raise exception 'INVALID_INPUT';end if;
 l:=(v->>'leaseId')::uuid;g:=(v->>'generation')::integer;
 j:=export_private.lock_job_v1((v->>'requestId')::uuid,true);
 if j.request_id is null or export_private.live_lease_v1(j,l,g) is not true then return jsonb_build_object('kind','unavailable');end if;
 if (v->>'limit')::integer>(j.policy_snapshot->>'page_size')::integer then raise exception 'INVALID_INPUT';end if;
 item:=export_private.profile_source_v1(j.owner_id);
 page:=jsonb_build_object('schemaVersion','profile-core-export/1','section','snapshot','sourceDigest',notification_private.hash(jsonb_build_object('snapshot',jsonb_build_array(item))),
  'items',jsonb_build_array(item),'hasMore',false,'nextCursor',null,'sectionComplete',true);
 if octet_length(notification_private.canonical(page))>1000000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;
 -- All original absolute lease clocks are checked again after source locks/read.
 if export_private.live_lease_v1(j,l,g) is not true then return jsonb_build_object('kind','unavailable');end if;
 return page;
end$function$
