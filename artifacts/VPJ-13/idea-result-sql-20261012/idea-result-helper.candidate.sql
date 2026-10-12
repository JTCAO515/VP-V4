-- Private candidate only; no service/public RPC grant or retained state.
create function turn_private.journey_idea_result_content_v1(
 p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,
 p_scope uuid,p_attempt uuid,p_output_digest text,p_usage_digest text,p_locale text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;model jsonb;projection jsonb;place jsonb;content jsonb;selection text;
begin
 q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);
 if q is null then return null;end if;
 -- The caller supplies only an expected receipt tuple, never selection authority.
 -- This existing reader requalifies the durable origin, original attempt lease,
 -- execution profile, actual settled usage and current source/work lease.
 model:=public.read_planning_intake_model_output_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest,p_scope,
  (q->'execution'->>'textPolicyId')::uuid,q->'execution'->>'priceVersion');
 if model->>'state' is distinct from 'settled' or model->'binding'->>'attempt' is distinct from p_attempt::text
  or model->'output'->>'outputDigest' is distinct from p_output_digest
  or model->'output'->>'usageDigest' is distinct from p_usage_digest then return null;end if;
 select observation into place from turn_private.planning_v2_place_checkpoints where turn_id=p_turn and state='completed' for share nowait;
 if not found then return null;end if;
 -- Reuse all original factual construction and qualification, including locale,
 -- observation freshness, independent planning purpose and unknown fields.
 projection:=turn_private.project_planning_qualified_comparison_v1(p_owner,p_turn,p_lease,p_intake_digest,p_planning_digest,place,p_locale);
 if projection is null then return null;end if;
 content:=projection->'content';selection:=model->'output'->'output'->>'highlight';
 if selection='peoples_square' then
  content:=jsonb_set(content,'{options}',jsonb_build_array(content->'options'->1,content->'options'->0));
 elsif selection is null or selection not in ('jingan','none') then return null;end if;
 return content;
exception when lock_not_available then return null;
end $$;
revoke all on function turn_private.journey_idea_result_content_v1(uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
