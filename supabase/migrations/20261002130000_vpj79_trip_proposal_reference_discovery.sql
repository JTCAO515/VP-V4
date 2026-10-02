-- Discover only current, owned saved Proposal references. Opening the returned
-- exact revision remains a separate eligibility-checked read; no Proposal action.
create index result_artifacts_trip_proposal_created_v1
  on turn_private.result_artifacts(owner_id,trip_id,created_at desc,id desc)
  where proposal_id is not null and lifecycle='active';

create function public.read_trip_change_proposal_reference_v1(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); candidate record; authorised jsonb; examined integer:=0;
begin
  if p_trip_id is null then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from public.trips where id=p_trip_id and owner_id=u)
    then return jsonb_build_object('kind','empty'); end if;
  if exists(select 1 from privacy_private.trip_deletions where trip_id=p_trip_id)
    then return jsonb_build_object('kind','unavailable'); end if;
  if exists(select 1 from public.trip_archives where trip_id=p_trip_id and owner_id=u)
    then return jsonb_build_object('kind','empty'); end if;
  -- Inspect at most 64 newest saved references. A 65th row is a content-free
  -- sentinel: do not claim empty while unexamined candidates still exist.
  for candidate in select id,current_revision from turn_private.result_artifacts
    where owner_id=u and trip_id=p_trip_id and proposal_id is not null and lifecycle='active'
    order by created_at desc,id desc limit 65 loop
    examined:=examined+1;
    if examined>64 then return jsonb_build_object('kind','unavailable'); end if;
    authorised:=public.read_change_proposal_reference_v1(candidate.id,candidate.current_revision);
    if authorised->>'kind'='result_artifact' and authorised->>'current'='true'
      and authorised->'source'->>'tripId'=p_trip_id::text then
      return jsonb_build_object('kind','result_reference','artifactId',candidate.id,
        'revision',candidate.current_revision,'tripId',p_trip_id);
    end if;
  end loop;
  return jsonb_build_object('kind','empty');
end $$;
revoke all on function public.read_trip_change_proposal_reference_v1(uuid) from public,anon,service_role;
grant execute on function public.read_trip_change_proposal_reference_v1(uuid) to authenticated;
notify pgrst,'reload schema';
