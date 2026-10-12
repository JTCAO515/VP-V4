create function public.complete_planning_intake_comparison_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_action_key text,p_scope uuid,p_attempt uuid,p_output_digest text,p_usage_digest text,p_content jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;model jsonb;digest text;key text;c turn_private.planning_v2_result_claims%rowtype;job turn_private.planning_comparisons%rowtype;place turn_private.planning_v2_place_checkpoints%rowtype;w turn_private.work%rowtype;cap turn_private.service_task_capacity%rowtype;locale text;published jsonb;receipt jsonb;capacity_required boolean;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;
 model:=public.read_planning_intake_model_output_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest,p_scope,(q->'execution'->>'textPolicyId')::uuid,q->'execution'->>'priceVersion');
 if model->>'state' is distinct from 'settled' or model->'binding'->>'attempt' is distinct from p_attempt::text or model->'output'->>'outputDigest' is distinct from p_output_digest or model->'output'->>'usageDigest' is distinct from p_usage_digest then return jsonb_build_object('kind','blocked');end if;
 select * into place from turn_private.planning_v2_place_checkpoints where turn_id=p_turn for share nowait;
 select m.locale into locale from turn_private.planning_comparisons j join turn_private.assistant_messages m on m.id=j.message_id where j.turn_id=p_turn;
 if not found or place.state<>'completed' or turn_private.valid_planning_qualified_comparison_v1(p_owner,p_turn,p_lease,p_intake_digest,p_planning_digest,place.observation,locale,p_content) is distinct from true then return jsonb_build_object('kind','blocked');end if;
 digest:=turn_private.planning_v2_content_digest(p_content);
 key:=encode(sha256(convert_to('['||turn_private.planning_v2_json_string_v1(p_task::text)||','||turn_private.planning_v2_json_string_v1(p_turn::text)||','||turn_private.planning_v2_json_string_v1(p_intake_digest)||','||turn_private.planning_v2_json_string_v1(p_planning_digest)||',"result.prepare",'||turn_private.planning_v2_json_string_v1(digest)||']','UTF8')),'hex');
 select * into c from turn_private.planning_v2_result_claims where execution_id=(q->>'runId')::uuid for update nowait;
 if not found or c.state<>'started' or c.lease_token<>p_lease or c.action_key is distinct from p_action_key or c.action_key is distinct from key or c.content_digest is distinct from digest then return jsonb_build_object('kind','unknown');end if;
 select * into job from turn_private.planning_comparisons where turn_id=p_turn for update nowait;
 select * into w from turn_private.work where turn_id=p_turn for update nowait;
 select * into cap from turn_private.service_task_capacity where task_id=p_task for update nowait;
 if not found then
  select capacity_enforced into capacity_required from turn_private.service_tasks where id=p_task;
  if capacity_required then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT';end if;
 elsif cap.state<>'reserved' then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT';end if;
 if cap.tier='journey_pass' and not exists(select 1 from public.storekit_grants g where g.environment=cap.grant_environment and g.transaction_id=cap.grant_transaction_id and g.owner_id=p_owner and g.state='active' and g.starts_at<=cap.admitted_at and g.ends_at>clock_timestamp() for share) then raise exception 'SERVICE_TASK_GRANT_UNAVAILABLE';end if;
 insert into turn_private.planning_v2_completion_proofs values((q->>'runId')::uuid,pg_current_xact_id(),p_owner,p_task,p_turn,(model->'binding'->>'lease')::uuid,p_lease,p_intake_digest,p_planning_digest,p_action_key,digest,job.artifact_id,p_scope,p_attempt,p_output_digest,p_usage_digest,p_content,clock_timestamp());
 update turn_private.text_content set output_kind='answered',output_text=p_content->>'summary' where turn_id=p_turn and owner_id=p_owner;
 perform turn_private.terminal(p_turn,'completed',w.attempt);
 update turn_private.service_task_capacity set state='settled',settled_turn_id=p_turn,settled_at=clock_timestamp() where task_id=p_task;
 published:=public.publish_comparison_result_v1(p_owner,job.artifact_id,0,job.publication_key,p_task,job.goal_id,job.message_id,null,null,job.goal_version,job.memory_basis,p_content);
 if published->>'kind' is distinct from 'published' or published->'reused' is distinct from 'false'::jsonb then raise exception 'PLANNING_INCOMPLETE';end if;
 update turn_private.planning_v2_result_claims set state='completed' where execution_id=(q->>'runId')::uuid;
 update turn_private.planning_comparisons set state='completed' where turn_id=p_turn;
 receipt:=jsonb_build_object('kind','published','taskId',p_task,'turnId',p_turn,'artifactId',job.artifact_id,'revision',1);
 insert into turn_private.planning_v2_completed_receipts values((q->>'runId')::uuid,p_owner,p_task,p_turn,job.artifact_id,1,receipt);
 return receipt;
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.complete_planning_intake_comparison_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
