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
