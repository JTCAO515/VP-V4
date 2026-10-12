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
