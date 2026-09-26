-- D1: a service-only, content-free queue reader. The executor owns the row lock
-- and atomic erase; competing workers may read one ID and safely replay it.
create index trip_deletions_queued_order
  on privacy_private.trip_deletions(requested_at, request_id)
  where state = 'queued';

create function public.next_trip_deletion_v1()
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'FORBIDDEN';
  end if;
  return (
    select request_id from privacy_private.trip_deletions
    where state = 'queued' order by requested_at, request_id limit 1
  );
end $$;
revoke all on function public.next_trip_deletion_v1() from public, anon, authenticated;
grant execute on function public.next_trip_deletion_v1() to service_role;
