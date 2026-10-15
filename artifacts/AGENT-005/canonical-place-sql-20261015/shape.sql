create or replace function place_actions_private.ask_uuid_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
$$;
revoke all on function place_actions_private.ask_uuid_v1(jsonb) from public,anon,authenticated,service_role;
create or replace function place_actions_private.ask_expectation_shape_v1(e jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if not place_actions_private.exact_v1(e,array['tripId','headVersion','canonicalPoiId','provider','providerPoiId','mappingDigest','contextDigest','referenceId','locale'])
 or not place_actions_private.ask_uuid_v1(e->'tripId') or not place_actions_private.ask_uuid_v1(e->'canonicalPoiId') or not place_actions_private.revision_v1(e->'headVersion')
 or not place_actions_private.selection_v1(jsonb_set(e-array['tripId','headVersion','mappingDigest','contextDigest','referenceId','locale'],'{canonicalPoiId}',to_jsonb(lower(e->>'canonicalPoiId'))))
 or coalesce(e->>'locale','') not in('zh','en') or jsonb_typeof(e->'mappingDigest') is distinct from 'string' or e->>'mappingDigest' !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(e->'contextDigest') is distinct from 'string' or e->>'contextDigest' !~ '^[a-f0-9]{64}$'
 or (e->'referenceId'<>'null'::jsonb and not place_actions_private.ask_uuid_v1(e->'referenceId')) then return false;end if;
 return true;
end $$;
revoke all on function place_actions_private.ask_expectation_shape_v1(jsonb) from public,anon,authenticated,service_role;
