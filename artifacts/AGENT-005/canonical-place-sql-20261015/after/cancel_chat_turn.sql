CREATE OR REPLACE FUNCTION public.cancel_chat_turn(p_turn_id uuid)
 RETURNS TABLE(sequence integer, state text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare task uuid; task_owner uuid; cancelled record;
begin
 if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and owner_id=auth.uid() and selected_place_request is not null) then
  perform turn_private.text_owner();
  if not turn_private.lock_trip_account_v1(auth.uid()) then raise exception 'UNAUTHENTICATED';end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,34));
 end if;
  select l.task_id,l.owner_id into task,task_owner from turn_private.service_task_turns l
    where l.turn_id=p_turn_id and l.owner_id=(select auth.uid());
  if task is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(task_owner::text,34)); end if;
  select * into cancelled from turn_private.cancel_chat_turn_unmetered(p_turn_id);
  if task is not null and cancelled.state='cancelled' then
    update turn_private.service_task_capacity c set state='released',released_at=pg_catalog.clock_timestamp()
      where c.task_id=task and c.owner_id=task_owner and c.state='reserved';
  end if;
  return query select cancelled.sequence::integer,cancelled.state::text;
end $function$
;
