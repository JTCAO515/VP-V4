create function public.scoped_trip_edit_budget_v1(p_binding jsonb,p_effect text,p_reserved_micros bigint,p_actual_micros bigint,p_outcome text) returns jsonb language plpgsql security definer set search_path='' as $$declare j scoped_edit_private.work_v1%rowtype;cfg scoped_edit_private.worker_settings_v1%rowtype;begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into j from scoped_edit_private.work_v1 where binding=p_binding;
 if not found then return jsonb_build_object('kind','blocked');end if;
 select * into cfg from scoped_edit_private.worker_settings_v1 where policy_id=j.policy_id;
 if p_effect='finish' then
 -- Accounting must close for the bound attempt even after source revocation.
 if p_outcome='settle' and (j.known_usage is null or j.known_actual_micros is distinct from p_actual_micros) then return jsonb_build_object('kind','blocked');end if;
 return public.finish_model_budget(j.scope_id,j.owner_id,j.attempt_id,p_outcome,p_actual_micros);
 end if;
 if public.authorize_scoped_trip_edit_effect_v1(p_binding,p_effect)->>'kind' is distinct from 'authorized' then return jsonb_build_object('kind','blocked');end if;
 if p_effect='reserve' and p_reserved_micros=cfg.reserved_micros then return public.reserve_model_budget(j.scope_id,j.owner_id,j.task_id,j.attempt_id,'qwen',cfg.model,cfg.price_version,p_reserved_micros);end if;
 if p_effect='dispatch' then return public.dispatch_model_budget(j.scope_id,j.owner_id,j.attempt_id);end if;
 return jsonb_build_object('kind','blocked');
end $$;
