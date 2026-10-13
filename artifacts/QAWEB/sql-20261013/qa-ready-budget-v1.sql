-- Candidate append after the association fix: ordinary discovery matches claim.
do $$begin if (select md5(prosrc) from pg_proc where oid='public.qa_ready_groups_v1(integer)'::regprocedure) is distinct from '3c7ce052508da60575c5db8c234d0b37' then raise exception 'QA_DISCOVERY_SOURCE_CONFLICT';end if;end$$;
create or replace function public.qa_ready_groups_v1(p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.hosted_worker_control%rowtype; groups jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'INVALID_INPUT'; end if;
  select * into c from turn_private.hosted_worker_control where singleton;
  if not found or not c.enabled then return jsonb_build_object('kind','disabled'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'ownerId', g.owner_id, 'policyId', g.policy_id, 'contextMode', g.context_mode,
      'provider', g.provider, 'endpoint', g.endpoint,
      'scopes', (select coalesce(jsonb_agg(jsonb_build_object('scopeId', b.scope_id, 'model', b.model, 'priceVersion', b.price_version) order by b.scope_id), '[]'::jsonb)
        from (select s.id as scope_id, l.model, l.price_version from public.model_budget_scopes s
          join public.model_budget_provider_limits l on l.scope_id = s.id and l.provider = g.provider
          where s.owner_id = g.owner_id and s.enabled and not s.frozen and s.expires_at > clock_timestamp() and l.enabled
          order by s.id limit 5) b)
    ) order by g.oldest, g.owner_id, g.policy_id), '[]'::jsonb)
  into groups
  from (
    select q.owner_id, x.policy_id, p.context_mode, p.provider, p.endpoint, min(q.created_at) as oldest
    from turn_private.work q
    join turn_private.text_content x on x.turn_id = q.turn_id and x.owner_id = q.owner_id
    join turn_private.text_policies p on p.id = x.policy_id
    join turn_private.text_consents s on s.owner_id = x.owner_id and s.policy_id = x.policy_id and s.consent_id = x.consent_id
    where q.execution_mode='text' and p.context_mode='qa_session_history_v1'
      and not exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id)
      and not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id where b.owner_id=q.owner_id and a.status<>'released' and (a.task_id=q.turn_id or a.attempt_id=q.lease_token))
      and x.hidden_at is null and p.revoked_at is null and p.effective_at <= clock_timestamp()
      and p.expires_at > clock_timestamp() and p.terms_recheck_at > clock_timestamp() and s.revoked_at is null
      and (q.state = 'queued' or (q.state = 'leased' and q.expires_at <= clock_timestamp()))
    group by q.owner_id, x.policy_id, p.context_mode, p.provider, p.endpoint
    order by min(q.created_at), q.owner_id, x.policy_id
    limit p_limit
  ) g;
  return jsonb_build_object('kind','groups','groups',groups);
end $$;
