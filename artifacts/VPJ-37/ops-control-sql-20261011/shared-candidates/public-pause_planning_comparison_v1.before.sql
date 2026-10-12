CREATE OR REPLACE FUNCTION public.pause_planning_comparison_v1(p_turn_id uuid, p_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w turn_private.work%rowtype;
begin
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode in('planning_intake_comparison_v2','scoped_trip_edit_v1','travel_directions_v1')) then return jsonb_build_object('kind','stale'); end if;
  if (select auth.role())<>'service_role' or p_turn_id is null or p_lease_token is null then raise exception 'INVALID_INPUT'; end if;
  select * into w from turn_private.work where turn_id=p_turn_id;
  if not found or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return jsonb_build_object('kind','stale'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id for update;
  if w.state<>'leased' or w.lease_token is distinct from p_lease_token or w.expires_at<=clock_timestamp()
    or w.execution_mode<>'planning_comparison_v1' then return jsonb_build_object('kind','stale'); end if;
  update turn_private.planning_comparisons set state='paused_unknown' where turn_id=p_turn_id and state='queued';
  update turn_private.work set state='queued',lease_token=null,expires_at=null where turn_id=p_turn_id;
  return jsonb_build_object('kind','paused_unknown');
end $function$
