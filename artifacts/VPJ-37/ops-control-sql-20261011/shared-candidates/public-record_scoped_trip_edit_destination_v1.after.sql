CREATE OR REPLACE FUNCTION public.record_scoped_trip_edit_destination_v1(p_binding jsonb, p_destination jsonb, p_request_id text DEFAULT NULL::text, p_request_digest text DEFAULT NULL::text, p_payload_digest text DEFAULT NULL::text, p_payload_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ops_decision jsonb; j scoped_edit_private.work_v1%rowtype;r scoped_edit_private.requests_v1%rowtype;cfg scoped_edit_private.worker_settings_v1%rowtype;tp turn_private.text_policies%rowtype;payload jsonb;input jsonb;user_payload jsonb;expected_digest text;phase text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding;
 if not found then return jsonb_build_object('kind','pending');end if;
 select * into cfg from scoped_edit_private.worker_settings_v1 where policy_id=j.policy_id;select * into tp from turn_private.text_policies where id=j.policy_id;
 phase:=p_destination->>'phase';
 if not recovery_private.exact_v1(p_destination,array['schemaVersion','invocationId','provider','model','endpoint','configurationId','configurationVersion','phase','observedAt'])
 or p_destination->>'schemaVersion' is distinct from 'provider-destination/1' or not recovery_private.uuid_v1(p_destination->'invocationId')
 or p_destination->>'provider' is distinct from 'qwen' or p_destination->>'model' is distinct from cfg.model or p_destination->>'endpoint' is distinct from tp.endpoint
 or p_destination->>'configurationId' is distinct from cfg.configuration_id::text or p_destination->'configurationVersion' is distinct from to_jsonb(cfg.configuration_version)
 or coalesce(phase,'') not in('configured','attempted','response_buffered') or recovery_private.time_v1(p_destination->>'observedAt') is null
 or recovery_private.time_v1(p_destination->>'observedAt')>clock_timestamp()+interval '30 seconds' or recovery_private.time_v1(p_destination->>'observedAt')<clock_timestamp()-interval '1 minute'
 or p_request_id is distinct from j.attempt_id::text or coalesce(p_request_digest,'') !~ '^[a-f0-9]{64}$' or coalesce(p_payload_digest,'') !~ '^[a-f0-9]{64}$'
 or p_payload_text is null or pg_column_size(p_payload_text)>65536 or encode(sha256(convert_to(p_payload_text,'UTF8')),'hex') is distinct from p_payload_digest then raise exception 'INVALID_DESTINATION';end if;
 if phase in('configured','attempted') then ops_decision:=ops_control_private.work_decision_v1(j.turn_id,(p_binding->>'leaseToken')::uuid,'model');if ops_decision->>'kind' is distinct from 'allowed' then if ops_decision ? 'code' then return ops_decision;end if;return jsonb_build_object('kind','pending');end if;end if;
expected_digest:=encode(sha256(convert_to('["scoped-trip-edit-request/1",'||replace((jsonb_build_array(p_binding->'ownerId',p_binding->'taskId',p_binding->'turnId',p_binding->'operationId',p_binding->'contextId',p_binding->'contextDigest',p_binding->'sourceDigest',p_binding->'tripId',p_binding->'baseVersion',p_binding->'policyId',p_binding->'scopeId',p_binding->'attemptId',p_binding->'provider',p_binding->'model',p_binding->'priceVersion'))::text,', ',',')||',"'||p_payload_digest||'"]','UTF8')),'hex');
 if p_request_digest<>expected_digest then raise exception 'INVALID_DESTINATION';end if;
 select * into r from scoped_edit_private.requests_v1 where turn_id=j.turn_id for update;
 if found then
 if (r.binding-'leaseToken')<>(p_binding-'leaseToken') or r.request_id<>p_request_id or r.request_digest<>p_request_digest or r.payload_digest<>p_payload_digest
 or (r.destination-array['phase','observedAt'])<>(p_destination-array['phase','observedAt'])
 or not(r.destination->>'phase'=phase or r.destination->>'phase'='configured' and phase='attempted' or r.destination->>'phase'='attempted' and phase='response_buffered') then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 -- Once configured, the same request identity is only an audit observation.
 update scoped_edit_private.requests_v1 set destination=p_destination where turn_id=j.turn_id;
 else
 if phase<>'configured' or public.authorize_scoped_trip_edit_effect_v1(p_binding,'dispatch')->>'kind' is distinct from 'authorized' then return jsonb_build_object('kind','pending');end if;
 input:=public.read_scoped_trip_edit_work_v1(j.turn_id,(p_binding->>'leaseToken')::uuid);
 begin payload:=p_payload_text::jsonb;user_payload:=(payload->'messages'->1->>'content')::jsonb;exception when others then raise exception 'INVALID_DESTINATION';end;
 if not recovery_private.exact_v1(payload,array['model','messages','stream','max_tokens','enable_thinking','response_format']) or payload->>'model'<>cfg.model or payload->'stream' is distinct from 'false'::jsonb or payload->'enable_thinking' is distinct from 'false'::jsonb
 or payload->'max_tokens' is distinct from to_jsonb(cfg.max_output_tokens) or payload->'response_format' is distinct from '{"type":"json_object"}'::jsonb or jsonb_array_length(payload->'messages')<>2
 or not recovery_private.exact_v1(payload->'messages'->0,array['role','content']) or payload->'messages'->0->>'role' is distinct from 'system'
 or not recovery_private.exact_v1(payload->'messages'->1,array['role','content']) or payload->'messages'->1->>'role' is distinct from 'user'
 or encode(sha256(convert_to(payload->'messages'->0->>'content','UTF8')),'hex') is distinct from '1a360f47407d9507f311fd9f25a3645d4e6b29de034a0682761a47409b873f7c'
 or user_payload is distinct from jsonb_build_object('ask',input->'text','locale',input->'locale','trip',input->'context'->'snapshot','scope',input->'context'->'scope','lockedItemIds',input->'context'->'lockedItemIds','fixedItemIds',input->'context'->'fixedItemIds','profile',input->'profile','memory',input->'memory') then raise exception 'INVALID_DESTINATION';end if;
 insert into scoped_edit_private.requests_v1(turn_id,owner_id,trip_id,binding,request_id,request_digest,payload_digest,destination) values(j.turn_id,j.owner_id,j.trip_id,p_binding,p_request_id,p_request_digest,p_payload_digest,p_destination);
 end if;
 return jsonb_build_object('kind','destination_recorded','attemptId',j.attempt_id,'invocationId',p_destination->'invocationId','phase',phase);
end $function$
