-- VPJ-76 (#360) slice 7: a real integration point into grounded-turn/1,
-- deliberately the narrowest one possible. grounded-turn/1's answer never
-- comes from an LLM -- resolve_question() matches fixed
-- {subjectId,predicate,objectId} claims against published statements with
-- zero generation, by design (see docs/contracts/wiki-agentic-search.md,
-- "Slice 7"). This does not touch resolve_question() or
-- complete_selected_grounded_work() at all. It only exposes a read-only
-- context RPC that:
--   (a) reuses the exact same owner/session/policy authorization chain
--       read_grounded_turn() already uses (turn_private.text_owner(),
--       turn_private.lock_turn(), turn_private.text_policy_current()) --
--       no new authorization model,
--   (b) refuses to return anything unless the turn's authoritative
--       original_outcome is already 'blocked' (resolve_question found
--       zero eligible content for every required claim) -- this can never
--       be used to bypass or second-guess an answered/partial result,
--   (c) writes nothing. The caller (a later TS integration, not built in
--       this migration) uses this context to run the agentic search loop
--       and returns its result live; nothing about grounded_turns or any
--       published statement changes because this RPC was called.

create function public.read_grounded_ai_assist_context_v1(p_turn_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); g turn_private.grounded_turns%rowtype; c turn_private.text_content%rowtype;
begin
  if not turn_private.lock_turn(p_turn_id,u,(auth.jwt()->>'session_id')::uuid) then return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id and owner_id=u and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) then return jsonb_build_object('kind','unavailable'); end if;
  select * into g from turn_private.grounded_turns where turn_id=p_turn_id and owner_id=u;
  if not found or g.completed_at is null then return jsonb_build_object('kind','unavailable'); end if;
  -- The one real gate: AI-assisted search is offered only as a supplement
  -- when the authoritative structured answer genuinely found nothing for
  -- every required claim. It is never offered as a bypass when the
  -- resolver's own judgement was answered or partial.
  if g.original_outcome <> 'blocked' then return jsonb_build_object('kind','not_applicable'); end if;
  return jsonb_build_object('kind','context','turnId',c.turn_id,'city',g.city,'locale',c.locale,
    'intent',g.intent,'inputText',c.input_text,'placeName',g.place_name);
end $$;
revoke all on function public.read_grounded_ai_assist_context_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_grounded_ai_assist_context_v1(uuid) to authenticated;
