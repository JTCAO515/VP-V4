-- QA runtime deployment tuple. Additive ports; original QA/budget/identity remain authoritative.
begin;
create function public.qa_ready_groups_v3(p_limit integer,p_model text,p_price_version text,p_endpoint text,p_owner_id uuid,p_policy_id uuid,p_scope_id uuid,p_notice_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.hosted_worker_control%rowtype;groups_n jsonb;
begin
 if p_owner_id is null or p_policy_id is null or p_scope_id is null or p_notice_hash is null or p_notice_hash !~ '^[a-f0-9]{64}$'
 or p_limit is null or p_limit not between 1 and 50 or p_model is null or p_model !~ '^[A-Za-z0-9._-]{1,100}$'
 or p_price_version is null or p_price_version !~ '^[A-Za-z0-9._-]{1,100}$' or p_endpoint is null or length(p_endpoint)>512
 or p_endpoint !~ '^https://[^/?#@]+/[^?#]*$' then raise exception 'INVALID_INPUT';end if;
 select * into c from turn_private.hosted_worker_control where singleton;
 if not found or not c.enabled then return jsonb_build_object('kind','disabled');end if;
 select coalesce(jsonb_agg(jsonb_build_object('ownerId',g.owner_id,'policyId',g.policy_id,'contextMode',g.context_mode,
 'provider',g.provider,'endpoint',g.endpoint,'noticeHash',g.notice_hash,'scopes',g.scopes) order by g.oldest,g.owner_id,g.policy_id),'[]'::jsonb) into groups_n
 from(
  select w.*,b.scopes from(
   select q.owner_id,x.policy_id,p.context_mode,p.provider,p.endpoint,p.notice_hash,min(q.created_at) oldest
   from turn_private.work q join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
   join turn_private.text_policies p on p.id=x.policy_id
   join turn_private.text_consents a on a.owner_id=x.owner_id and a.policy_id=x.policy_id and a.consent_id=x.consent_id
   where q.owner_id=p_owner_id and x.policy_id=p_policy_id and p.notice_hash=p_notice_hash
    and q.execution_mode='text' and p.context_mode='qa_session_history_v1' and p.provider='qwen' and p.endpoint=p_endpoint
    and x.hidden_at is null and p.revoked_at is null and p.effective_at<=clock_timestamp()
    and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp() and a.revoked_at is null
    and(q.state='queued' or(q.state='leased' and q.expires_at<=clock_timestamp()))
    and not exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id)
    and not exists(select 1 from public.model_budget_attempts t join public.model_budget_scopes s on s.id=t.scope_id
     where s.owner_id=q.owner_id and t.status<>'released' and(t.task_id=q.turn_id or t.attempt_id=q.lease_token))
   group by q.owner_id,x.policy_id,p.context_mode,p.provider,p.endpoint,p.notice_hash
  )w cross join lateral(
   -- Match first, then keep at most two witnesses: zero is unavailable, two is
   -- ambiguous. Nonmatching first-five scopes cannot hide a later exact match.
   select count(*) scope_n,coalesce(jsonb_agg(jsonb_build_object('scopeId',e.id,'model',e.model,'priceVersion',e.price_version) order by e.id),'[]'::jsonb) scopes
   from(select s.id,l.model,l.price_version from public.model_budget_scopes s
    join public.model_budget_provider_limits l on l.scope_id=s.id and l.provider='qwen'
    where s.owner_id=w.owner_id and s.enabled and not s.frozen and s.expires_at>clock_timestamp() and l.enabled
     and l.model=p_model and l.price_version=p_price_version order by s.id limit 2)e
  )b where b.scope_n=1 and (b.scopes->0->>'scopeId')::uuid=p_scope_id
  order by w.oldest,w.owner_id,w.policy_id limit p_limit
 )g;
 return jsonb_build_object('kind','groups','groups',groups_n);
end $$;

create function public.qa_authorize_dispatch_v2(p_turn_id uuid,p_lease_token uuid,p_scope_id uuid,p_policy_id uuid,p_provider text,p_context_digest text,p_owner_id uuid,p_notice_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
 if p_owner_id is null or p_policy_id is null or p_scope_id is null or p_notice_hash is null or p_notice_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
 -- Acquire the original lease/source locks first, preserving v1's lock order.
 payload:=public.qa_read_work_v1(p_turn_id,p_lease_token);
 if payload->>'kind' is distinct from 'qa_input' or payload->>'ownerId' is distinct from p_owner_id::text
 or payload->>'policyId' is distinct from p_policy_id::text then return jsonb_build_object('kind','blocked');end if;
 -- This is the actual immutable policy authority, not a hash echoed by a client.
 perform 1 from turn_private.text_policies where id=p_policy_id and notice_hash=p_notice_hash for share;
 if not found or not exists(select 1 from public.model_budget_scopes where id=p_scope_id and owner_id=p_owner_id) then
  return jsonb_build_object('kind','blocked');end if;
 return public.qa_authorize_dispatch_v1(p_turn_id,p_lease_token,p_scope_id,p_policy_id,p_provider,p_context_digest);
end $$;

alter function public.qa_ready_groups_v3(integer,text,text,text,uuid,uuid,uuid,text) owner to postgres;
alter function public.qa_authorize_dispatch_v2(uuid,uuid,uuid,uuid,text,text,uuid,text) owner to postgres;
revoke all on function public.qa_ready_groups_v3(integer,text,text,text,uuid,uuid,uuid,text),public.qa_authorize_dispatch_v2(uuid,uuid,uuid,uuid,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.qa_ready_groups_v3(integer,text,text,text,uuid,uuid,uuid,text),public.qa_authorize_dispatch_v2(uuid,uuid,uuid,uuid,text,text,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
