-- VPJ-07 #195: hosted text worker discovery, operator stop switch and heartbeat.
-- Content-free and service-only. Nothing here leases, dispatches, reserves budget,
-- installs a policy/scope or starts a process; the existing scoped claimers,
-- dispatch authorization and durable budget remain the only authority for work.
-- The switch starts DISABLED, so applying this migration changes no behavior.

create table turn_private.hosted_worker_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  changed_at timestamptz not null default clock_timestamp(),
  reason text check (reason is null or reason ~ '^[A-Za-z0-9 ._:#/-]{1,200}$')
);
insert into turn_private.hosted_worker_control(singleton) values (true);

create table turn_private.hosted_worker_heartbeats (
  worker_id uuid primary key,
  build text not null check (build ~ '^[A-Za-z0-9._-]{1,64}$'),
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  phase text not null check (phase in ('started','polling','idle','disabled','draining','stopped')),
  last_result text check (last_result in ('empty','finished','queued','unavailable','disabled','skipped')),
  polls bigint not null default 0 check (polls >= 0),
  finished bigint not null default 0 check (finished >= 0),
  unavailable bigint not null default 0 check (unavailable >= 0),
  skipped bigint not null default 0 check (skipped >= 0),
  stop_reason text check (stop_reason in ('stopped','expired','unavailable'))
);
alter table turn_private.hosted_worker_control enable row level security;
alter table turn_private.hosted_worker_heartbeats enable row level security;
revoke all on turn_private.hosted_worker_control, turn_private.hosted_worker_heartbeats from public, anon, authenticated, service_role;

-- Upsert one worker's content-free counters and return the current stop switch.
-- Counters only move forward; bounded retention keeps the table small.
create function public.hosted_worker_heartbeat(
  p_worker_id uuid, p_build text, p_started_at timestamptz, p_phase text, p_result text,
  p_polls bigint, p_finished bigint, p_unavailable bigint, p_skipped bigint, p_stop_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.hosted_worker_control%rowtype;
begin
  if p_worker_id is null or p_build is null or p_build !~ '^[A-Za-z0-9._-]{1,64}$'
    or p_started_at is null or p_started_at > clock_timestamp() + interval '5 minutes'
    or p_phase is null or p_phase not in ('started','polling','idle','disabled','draining','stopped')
    or (p_result is not null and p_result not in ('empty','finished','queued','unavailable','disabled','skipped'))
    or (p_stop_reason is not null and p_stop_reason not in ('stopped','expired','unavailable'))
    or (p_phase = 'stopped') <> (p_stop_reason is not null)
    or p_polls is null or p_finished is null or p_unavailable is null or p_skipped is null
    or least(p_polls, p_finished, p_unavailable, p_skipped) < 0 then raise exception 'INVALID_INPUT'; end if;
  insert into turn_private.hosted_worker_heartbeats as h(worker_id,build,started_at,last_seen_at,phase,last_result,polls,finished,unavailable,skipped,stop_reason)
    values (p_worker_id,p_build,p_started_at,clock_timestamp(),p_phase,p_result,p_polls,p_finished,p_unavailable,p_skipped,p_stop_reason)
  on conflict (worker_id) do update set
    last_seen_at = clock_timestamp(), phase = excluded.phase, last_result = coalesce(excluded.last_result, h.last_result),
    polls = greatest(h.polls, excluded.polls), finished = greatest(h.finished, excluded.finished),
    unavailable = greatest(h.unavailable, excluded.unavailable), skipped = greatest(h.skipped, excluded.skipped),
    stop_reason = excluded.stop_reason
  where h.build = excluded.build and h.started_at = excluded.started_at and h.stop_reason is null;
  if not found then raise exception 'INVALID_INPUT'; end if;
  delete from turn_private.hosted_worker_heartbeats where last_seen_at < clock_timestamp() - interval '7 days';
  select * into c from turn_private.hosted_worker_control where singleton;
  return jsonb_build_object('kind','ok','enabled',coalesce(c.enabled,false));
end $$;

-- Owner/policy groups that the EXISTING scoped claimers would consider now, with
-- the owner's candidate budget scopes for the policy's provider. The same
-- policy/consent/visibility predicates as claim_text_mode; every one is checked
-- again under locks by the claimer. Disabled switch => no discovery at all.
create function public.hosted_worker_ready_groups(p_limit integer)
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
    where x.hidden_at is null and p.revoked_at is null and p.effective_at <= clock_timestamp()
      and p.expires_at > clock_timestamp() and p.terms_recheck_at > clock_timestamp() and s.revoked_at is null
      and (q.state = 'queued' or (q.state = 'leased' and q.expires_at <= clock_timestamp()))
    group by q.owner_id, x.policy_id, p.context_mode, p.provider, p.endpoint
    order by min(q.created_at), q.owner_id, x.policy_id
    limit p_limit
  ) g;
  return jsonb_build_object('kind','groups','groups',groups);
end $$;

-- Operator stop/start. Stopping prevents new discovery on the next poll; an
-- in-flight lease still finishes or expires under the existing lease fence.
create function public.set_hosted_worker_enabled(p_enabled boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_enabled is null or p_reason is null or p_reason !~ '^[A-Za-z0-9 ._:#/-]{1,200}$' then raise exception 'INVALID_INPUT'; end if;
  update turn_private.hosted_worker_control set enabled = p_enabled, changed_at = clock_timestamp(), reason = p_reason where singleton;
  return jsonb_build_object('kind','ok','enabled',p_enabled);
end $$;

-- Content-free operations view: switch, recent workers and queue depth/age.
create function public.read_hosted_worker_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.hosted_worker_control%rowtype; workers jsonb; queue jsonb;
begin
  select * into c from turn_private.hosted_worker_control where singleton;
  select coalesce(jsonb_agg(to_jsonb(h) order by h."lastSeenAt" desc), '[]'::jsonb) into workers
    from (select worker_id as "workerId", build, started_at as "startedAt", last_seen_at as "lastSeenAt", phase,
      last_result as "lastResult", polls, finished, unavailable, skipped, stop_reason as "stopReason"
      from turn_private.hosted_worker_heartbeats order by last_seen_at desc limit 20) h;
  select jsonb_build_object(
      'ready', count(*) filter (where state = 'queued' or (state = 'leased' and expires_at <= clock_timestamp())),
      'leased', count(*) filter (where state = 'leased' and expires_at > clock_timestamp()),
      'oldestReadySeconds', coalesce(floor(extract(epoch from clock_timestamp() - min(created_at) filter (where state = 'queued' or (state = 'leased' and expires_at <= clock_timestamp()))))::bigint, 0))
    into queue from turn_private.work where state in ('queued','leased');
  return jsonb_build_object('kind','status','enabled',coalesce(c.enabled,false),'changedAt',c.changed_at,'reason',c.reason,
    'workers',workers,'queue',queue);
end $$;

revoke all on function public.hosted_worker_heartbeat(uuid,text,timestamptz,text,text,bigint,bigint,bigint,bigint,text) from public, anon, authenticated;
revoke all on function public.hosted_worker_ready_groups(integer) from public, anon, authenticated;
revoke all on function public.set_hosted_worker_enabled(boolean,text) from public, anon, authenticated;
revoke all on function public.read_hosted_worker_status() from public, anon, authenticated;
grant execute on function public.hosted_worker_heartbeat(uuid,text,timestamptz,text,text,bigint,bigint,bigint,bigint,text) to service_role;
grant execute on function public.hosted_worker_ready_groups(integer) to service_role;
grant execute on function public.set_hosted_worker_enabled(boolean,text) to service_role;
grant execute on function public.read_hosted_worker_status() to service_role;
notify pgrst, 'reload schema';
