-- Only a currently qualified selected proof may add the existing GroundedResult
-- to an ordinary Task read/history row. Plain NULL rows retain their old bytes.
create or replace function place_actions_private.ask_text_projection_v1(tid uuid,history_row boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;p jsonb;begin
 if not exists(select 1 from turn_private.grounded_turns where turn_id=tid and selected_place_request is not null) then return null;end if;
 q:=public.read_grounded_turn(tid);
 if q->>'kind' is distinct from 'grounded_turn' or coalesce(q->'result'->>'projection','') not in('pending','current') then return null;end if;
 select selected_place_request into p from turn_private.grounded_turns where turn_id=tid and owner_id=auth.uid();
 if not place_actions_private.ask_proof_shape_v1(p) then return null;end if;
 if history_row then
  return jsonb_build_object('turnId',q->'turnId','threadId',q->'threadId','locale',q->'locale','input',q->'input','outcome',q->'outcome','output',q->'output','status',q->'status','createdAt',q->'createdAt','result',q->'result','canonicalPlaceProof',p);
 end if;
 return jsonb_build_object('kind','text','schemaVersion','text-turn-v1','turnId',q->'turnId','locale',q->'locale','input',q->'input','outcome',q->'outcome','output',q->'output','result',q->'result','canonicalPlaceProof',p);
end $$;
revoke all on function place_actions_private.ask_text_projection_v1(uuid,boolean) from public,anon,authenticated,service_role;
