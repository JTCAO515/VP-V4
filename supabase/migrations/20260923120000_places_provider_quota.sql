-- Per-actor quota for routes that spend paid map/place provider quota
-- (app/api/places/**, app/api/places/native/v1/**, app/api/maps/_AMapService/**).
-- Stores only actor id, bucket and fixed-window counters: no query text, coordinates or IPs.
-- Thresholds are supplied by the server (lib/server/maps/place-quota.ts) and range-checked here;
-- a caller invoking the RPC directly can only ever spend its own auth.uid() counters.
create schema place_quota_private;
revoke all on schema place_quota_private from public, anon, authenticated, service_role;

create table place_quota_private.usage (
  actor_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (bucket in ('places', 'map_proxy')),
  window_seconds integer not null check (window_seconds in (60, 86400)),
  window_start timestamptz not null,
  hits integer not null check (hits >= 0),
  primary key (actor_id, bucket, window_seconds)
);
alter table place_quota_private.usage enable row level security;
revoke all on table place_quota_private.usage from public, anon, authenticated, service_role;

create function public.consume_place_quota_v1(p_bucket text, p_minute_limit integer, p_day_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_minute timestamptz := to_timestamp(floor(extract(epoch from v_now) / 60) * 60);
  v_day timestamptz := to_timestamp(floor(extract(epoch from v_now) / 86400) * 86400);
  v_minute_hits integer;
  v_day_hits integer;
  v_retry numeric;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if p_bucket is null or p_bucket not in ('places', 'map_proxy')
     or p_minute_limit is null or p_minute_limit < 1 or p_minute_limit > 1000
     or p_day_limit is null or p_day_limit < 1 or p_day_limit > 100000 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  insert into place_quota_private.usage (actor_id, bucket, window_seconds, window_start, hits)
  values (v_actor, p_bucket, 60, v_minute, 0), (v_actor, p_bucket, 86400, v_day, 0)
  on conflict (actor_id, bucket, window_seconds) do nothing;

  -- Fixed lock order (minute, then day) for every caller; concurrent requests serialize per actor.
  select case when u.window_start = v_minute then u.hits else 0 end into v_minute_hits
    from place_quota_private.usage u
   where u.actor_id = v_actor and u.bucket = p_bucket and u.window_seconds = 60 for update;
  select case when u.window_start = v_day then u.hits else 0 end into v_day_hits
    from place_quota_private.usage u
   where u.actor_id = v_actor and u.bucket = p_bucket and u.window_seconds = 86400 for update;

  -- A rejected request consumes nothing.
  if v_day_hits >= p_day_limit then
    v_retry := extract(epoch from (v_day + interval '1 day' - v_now));
  elsif v_minute_hits >= p_minute_limit then
    v_retry := extract(epoch from (v_minute + interval '1 minute' - v_now));
  end if;
  if v_retry is not null then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', greatest(1, ceil(v_retry))::integer);
  end if;

  update place_quota_private.usage u set window_start = v_minute, hits = v_minute_hits + 1
   where u.actor_id = v_actor and u.bucket = p_bucket and u.window_seconds = 60;
  update place_quota_private.usage u set window_start = v_day, hits = v_day_hits + 1
   where u.actor_id = v_actor and u.bucket = p_bucket and u.window_seconds = 86400;
  return jsonb_build_object('allowed', true);
end $$;

revoke all on function public.consume_place_quota_v1(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.consume_place_quota_v1(text, integer, integer) to authenticated;
