create function public.qa_authorize_dispatch_v1(p_turn_id uuid,p_lease_token uuid,p_scope_id uuid,p_policy_id uuid,p_provider text,p_context_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb;fresh_n jsonb;r jsonb;task_n uuid;
begin
 payload:=public.qa_read_work_v1(p_turn_id,p_lease_token);
 if payload->>'kind' is distinct from 'qa_input' or payload->>'policyId' is distinct from p_policy_id::text or payload->>'provider' is distinct from p_provider or payload->>'contextDigest' is distinct from p_context_digest then return jsonb_build_object('kind','blocked');end if;
 task_n:=(payload->>'serviceTaskId')::uuid;
 if not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id
 join turn_private.service_tasks s on s.id=a.task_id and s.budget_scope_id=a.scope_id and s.owner_id=b.owner_id
 where a.scope_id=p_scope_id and a.attempt_id=p_lease_token and a.task_id=task_n and a.provider=p_provider and a.status='reserved'
 and b.owner_id=(select owner_id from turn_private.text_content where turn_id=p_turn_id))
 or exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token) then return jsonb_build_object('kind','blocked');end if;
 -- The original budget RPC may wait on its scope row. Roll back THIS dispatch
 -- if the lease or any locked source expires while that lock is awaited.
 begin
  r:=public.dispatch_model_budget(p_scope_id,(select owner_id from turn_private.text_content where turn_id=p_turn_id),p_lease_token);
  if r->>'kind' is distinct from 'dispatched' then return jsonb_build_object('kind','blocked');end if;
  fresh_n:=public.qa_read_work_v1(p_turn_id,p_lease_token);
  if fresh_n->>'kind' is distinct from 'qa_input' or fresh_n->>'policyId' is distinct from p_policy_id::text
   or fresh_n->>'provider' is distinct from p_provider or fresh_n->>'contextDigest' is distinct from p_context_digest
   then raise exception using errcode='PQA01',message='QA_DISPATCH_SOURCE_EXPIRED';end if;
  insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,(fresh_n->>'consentId')::uuid,p_policy_id);
 exception when sqlstate 'PQA01' then
  return jsonb_build_object('kind','blocked');
 end;
 return jsonb_build_object('kind','authorized');
end $$;
