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
