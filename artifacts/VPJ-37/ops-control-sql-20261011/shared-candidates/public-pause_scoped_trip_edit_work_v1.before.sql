CREATE OR REPLACE FUNCTION public.pause_scoped_trip_edit_work_v1(p_binding jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare j scoped_edit_private.work_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;o scoped_edit_private.operations_v1%rowtype;r jsonb;begin
 if auth.role() is distinct from 'service_role' or coalesce(p_reason,'') not in('unsupported_request','no_change','safety_refused','provider_unavailable','accounting_unknown','stale_basis') then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding for update;if not found then return jsonb_build_object('kind','pending');end if;
 select * into c from scoped_edit_private.contexts_v1 where id=j.context_id;select * into o from scoped_edit_private.operations_v1 where owner_id=j.owner_id and operation_id=j.operation_id;
 if not found or c.id is null or not scoped_edit_private.service_current_v1(c) or not scoped_edit_private.worker_policy_v1(j.owner_id,j.policy_id,j.scope_id) then return jsonb_build_object('kind','pending');end if;
 if coalesce(p_reason,'') not in('unsupported_request','no_change','safety_refused') then
 -- Unknown failures remain recoverable under the original lease/attempt, not declined.
 return jsonb_build_object('kind','pending');end if;
 if not exists(select 1 from public.model_budget_attempts where scope_id=j.scope_id and attempt_id=j.attempt_id and task_id=j.task_id and status='settled' and actual_micros=j.known_actual_micros)
 or p_reason='safety_refused' and (j.known_outcome is distinct from 'safety_blocked' or j.output is not null)
 or p_reason<>'safety_refused' and (j.output->>'kind' is distinct from 'cannot_edit' or j.output->>'reason' is distinct from p_reason or j.known_outcome is distinct from 'protocol_validated') then return jsonb_build_object('kind','pending');end if;
 if o.receipt->>'kind'='scoped_edit_declined/1' then
 if o.receipt->>'reason'<>p_reason then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 return jsonb_build_object('kind','declined','binding',p_binding,'receipt',o.receipt||'{"reused":true}'::jsonb);end if;
 if j.completion is not null or o.cancelled or o.proposal_id is not null then return jsonb_build_object('kind','pending');end if;
 r:=jsonb_build_object('kind','scoped_edit_declined/1','operationId',j.operation_id,'tripId',j.trip_id,'contextId',c.id,'contextDigest',c.digest,'baseVersion',c.base_version,'reason',p_reason,'reused',false);
 update scoped_edit_private.operations_v1 set receipt=r where owner_id=j.owner_id and operation_id=j.operation_id;
 update scoped_edit_private.work_v1 set paused_reason=p_reason where turn_id=j.turn_id;
 perform turn_private.terminal(j.turn_id,'completed',(select attempt from turn_private.work where turn_id=j.turn_id));
 return jsonb_build_object('kind','declined','binding',p_binding,'receipt',r);
end $function$
