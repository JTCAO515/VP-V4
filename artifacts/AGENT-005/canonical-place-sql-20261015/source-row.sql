-- The original source tables and PK fences remain the lifecycle authority.
-- NULL on an old row must disappear before old fingerprint/export serialization.
create or replace function place_actions_private.ask_source_row_v1(rel text,v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if rel<>'turn_private.grounded_turns' or not(v ? 'selected_place_request') then return v;end if;
 if v->'selected_place_request'='null'::jsonb then return v-'selected_place_request';end if;
 if not place_actions_private.ask_proof_shape_v1(v->'selected_place_request') then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 return v;
end $$;
revoke all on function place_actions_private.ask_source_row_v1(text,jsonb) from public,anon,authenticated,service_role;

create or replace function place_actions_private.ask_answer_basis_shape_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare x jsonb;begin
 if v='null'::jsonb then return true;end if;
 if not place_actions_private.exact_v1(v,array['publications','claims']) or jsonb_typeof(v->'publications') is distinct from 'array' or jsonb_array_length(v->'publications')>50 or jsonb_typeof(v->'claims') is distinct from 'array' or jsonb_array_length(v->'claims')>6 then return false;end if;
 for x in select value from jsonb_array_elements(v->'publications') loop
  if not place_actions_private.exact_v1(x,array['factId','assertionId','revision','payloadHash']) or not place_actions_private.uuid_v1(x->'factId') or not place_actions_private.uuid_v1(x->'assertionId') or not place_actions_private.revision_v1(x->'revision') or (x->>'revision')::integer<1 or jsonb_typeof(x->'payloadHash') is distinct from 'string' or x->>'payloadHash' !~ '^[a-f0-9]{64}$' then return false;end if;
 end loop;
 for x in select value from jsonb_array_elements(v->'claims') loop
  if not place_actions_private.exact_v1(x,array['id','status','reasons','factIds']) or x->>'id' not in('place_address','opening_hours') or x->>'status' not in('covered','unavailable','unresolved_variants')
  or jsonb_typeof(x->'reasons') is distinct from 'array' or jsonb_typeof(x->'factIds') is distinct from 'array' or jsonb_array_length(x->'reasons')>8 or jsonb_array_length(x->'factIds')>50
  or exists(select 1 from jsonb_array_elements(x->'reasons')r where jsonb_typeof(r) is distinct from 'string' or r#>>'{}' not in('missing','expired','revoked','unreviewed','unresolved_variants'))
  or exists(select 1 from jsonb_array_elements(x->'factIds')f where not place_actions_private.uuid_v1(f) or not exists(select 1 from jsonb_array_elements(v->'publications')p where p->'factId'=f)) then return false;end if;
 end loop;
 return true;
end $$;
revoke all on function place_actions_private.ask_answer_basis_shape_v1(jsonb) from public,anon,authenticated,service_role;
