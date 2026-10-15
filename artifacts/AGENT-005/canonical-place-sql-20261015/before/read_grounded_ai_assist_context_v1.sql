CREATE OR REPLACE FUNCTION public.read_grounded_ai_assist_context_v1(p_turn_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=turn_private.text_owner(); g turn_private.grounded_turns%rowtype; c turn_private.text_content%rowtype; qualified jsonb;
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
  -- Reuse the original current owner/session/consent/source read and its
  -- existing Guide-marked binding guard; do not mint a subject from a name,
  -- a client canonical ID, or model output at this integration point.
  if g.intent in ('place_address','place_opening_hours','place_address_and_hours') then
    qualified := public.read_grounded_turn(p_turn_id);
    if qualified->>'kind' is distinct from 'grounded_turn'
      or qualified->>'turnId' is distinct from p_turn_id::text
      or qualified->>'locale' is distinct from c.locale
      or qualified->>'input' is distinct from c.input_text
      or qualified->'result'->>'projection' is distinct from 'current'
      or qualified->'result'->>'city' is distinct from g.city
      or qualified->'result'->>'intent' is distinct from g.intent
      or qualified->'result'->>'originalOutcome' is distinct from 'blocked'
      or qualified->'result'->>'placeResolution' is distinct from 'matched'
      or qualified->'result'->>'placeSubjectId' is distinct from g.place_subject_id
      or g.place_subject_id is null then return jsonb_build_object('kind','unavailable'); end if;
  end if;
  return jsonb_build_object('kind','context','turnId',c.turn_id,'city',g.city,'locale',c.locale,
    'intent',g.intent,'inputText',c.input_text,'placeName',g.place_name,
    'placeSubjectId',g.place_subject_id,'placeResolution',g.place_resolution);
end $function$
