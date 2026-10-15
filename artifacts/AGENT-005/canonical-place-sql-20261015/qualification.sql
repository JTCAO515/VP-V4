-- The helper is private and called only after original owner/session/worker locks.
-- This reads the original mapping/source chain, never names or model output.
create or replace function place_actions_private.ask_basis_v1(u uuid,s uuid,e jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb;rows jsonb;subject text;city text;scene text;begin
 if not place_actions_private.ask_expectation_shape_v1(e) then raise exception 'INVALID_INPUT';end if;
 v:=place_actions_private.ask_context_v1(u,s,(e->>'tripId')::uuid,jsonb_build_object('action','context','expectedTripVersion',e->'headVersion','selection',jsonb_set(e-array['tripId','headVersion','mappingDigest','contextDigest','referenceId','locale'],'{canonicalPoiId}',to_jsonb(lower(e->>'canonicalPoiId'))),'locale',e->'locale'));
 if v->>'kind' is distinct from 'place_action_context' or v->'mappingDigest' is distinct from e->'mappingDigest'
 or v->'contextDigest' is distinct from e->'contextDigest' or (v->>'referenceId')::uuid is distinct from (e->>'referenceId')::uuid
 then raise exception 'MAPPING_CHANGED';end if;
 if v->>'sourceCandidatesStatus' is distinct from 'complete' or jsonb_array_length(v->'sourceCandidates')=0 then raise exception 'PLACE_ASK_SOURCE_UNAVAILABLE';end if;
 rows:=v->'sourceCandidates';
 if exists(select 1 from jsonb_array_elements(rows)x where x->>'locale' is distinct from e->>'locale'
 or x->>'city' not in('shanghai','beijing','guangzhou','chongqing') or nullif(x->'claim'->>'subjectId','') is null or nullif(x->>'scene','') is null)
 or (select count(distinct jsonb_build_array(x->'claim'->'subjectId',x->'city',x->'scene',x->'locale')) from jsonb_array_elements(rows)x)<>1 then raise exception 'PLACE_ASK_SELECTION_AMBIGUOUS';end if;
 select x->'claim'->>'subjectId',x->>'city',x->>'scene' into subject,city,scene from jsonb_array_elements(rows)x limit 1;
 return jsonb_build_object('subjectId',subject,'city',city,'scene',scene,'sourceDigest',place_actions_private.hash_v1(rows));
end $$;
revoke all on function place_actions_private.ask_basis_v1(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
