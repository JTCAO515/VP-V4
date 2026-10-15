create or replace function place_actions_private.ask_schema_v1() returns boolean language sql stable set search_path='' as $$
 select coalesce(exists(select 1 from pg_attribute a where a.attrelid='turn_private.grounded_turns'::regclass and a.attname='selected_place_request' and a.attnum>0 and not a.attisdropped and a.atttypid='jsonb'::regtype and not a.attnotnull and not a.atthasdef and a.attgenerated='' and a.attidentity='')
 and (select pg_get_constraintdef(k.oid) from pg_constraint k where k.conrelid='turn_private.grounded_turns'::regclass and k.conname='grounded_selected_place_request_shape') = 'CHECK (((selected_place_request IS NULL) OR place_actions_private.ask_proof_shape_v1(selected_place_request)))',false)
$$;
revoke all on function place_actions_private.ask_schema_v1() from public,anon,authenticated,service_role;
