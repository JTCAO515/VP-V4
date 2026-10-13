-- Candidate only. Main owns formal migration, worker v3 wiring and metadata pins.
create function public.qa_ready_groups_v2(p_limit integer,p_model text,p_price_version text,p_endpoint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.hosted_worker_control%rowtype;groups_n jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 or p_model is null or p_model !~ '^[A-Za-z0-9._-]{1,100}$'
 or p_price_version is null or p_price_version !~ '^[A-Za-z0-9._-]{1,100}$' or p_endpoint is null or length(p_endpoint)>512
 or p_endpoint !~ '^https://[^/?#@]+/[^?#]*$' then raise exception 'INVALID_INPUT';end if;
 select * into c from turn_private.hosted_worker_control where singleton;
 if not found or not c.enabled then return jsonb_build_object('kind','disabled');end if;
 select coalesce(jsonb_agg(jsonb_build_object('ownerId',g.owner_id,'policyId',g.policy_id,'contextMode',g.context_mode,
 'provider',g.provider,'endpoint',g.endpoint,'scopes',g.scopes) order by g.oldest,g.owner_id,g.policy_id),'[]'::jsonb) into groups_n
 from(
  select w.*,b.scopes from(
   select q.owner_id,x.policy_id,p.context_mode,p.provider,p.endpoint,min(q.created_at) oldest
   from turn_private.work q join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
   join turn_private.text_policies p on p.id=x.policy_id
   join turn_private.text_consents a on a.owner_id=x.owner_id and a.policy_id=x.policy_id and a.consent_id=x.consent_id
   where q.execution_mode='text' and p.context_mode='qa_session_history_v1' and p.provider='qwen' and p.endpoint=p_endpoint
    and x.hidden_at is null and p.revoked_at is null and p.effective_at<=clock_timestamp()
    and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp() and a.revoked_at is null
    and(q.state='queued' or(q.state='leased' and q.expires_at<=clock_timestamp()))
    and not exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id)
    and not exists(select 1 from public.model_budget_attempts t join public.model_budget_scopes s on s.id=t.scope_id
     where s.owner_id=q.owner_id and t.status<>'released' and(t.task_id=q.turn_id or t.attempt_id=q.lease_token))
   group by q.owner_id,x.policy_id,p.context_mode,p.provider,p.endpoint
  )w cross join lateral(
   -- Match first, then keep at most two witnesses: zero is unavailable, two is
   -- ambiguous. Nonmatching first-five scopes cannot hide a later exact match.
   select count(*) scope_n,coalesce(jsonb_agg(jsonb_build_object('scopeId',e.id,'model',e.model,'priceVersion',e.price_version) order by e.id),'[]'::jsonb) scopes
   from(select s.id,l.model,l.price_version from public.model_budget_scopes s
    join public.model_budget_provider_limits l on l.scope_id=s.id and l.provider='qwen'
    where s.owner_id=w.owner_id and s.enabled and not s.frozen and s.expires_at>clock_timestamp() and l.enabled
     and l.model=p_model and l.price_version=p_price_version order by s.id limit 2)e
  )b where b.scope_n=1
  order by w.oldest,w.owner_id,w.policy_id limit p_limit
 )g;
 return jsonb_build_object('kind','groups','groups',groups_n);
end $$;
revoke all on function public.qa_ready_groups_v2(integer,text,text,text) from public,anon,authenticated;
grant execute on function public.qa_ready_groups_v2(integer,text,text,text) to service_role;
