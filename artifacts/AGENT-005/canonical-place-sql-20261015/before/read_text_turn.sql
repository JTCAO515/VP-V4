CREATE OR REPLACE FUNCTION public.read_text_turn(p_turn_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=turn_private.text_owner(); c turn_private.text_content%rowtype;
begin
  if exists(select 1 from turn_private.text_content guarded_content join turn_private.text_policies guarded_policy on guarded_policy.id=guarded_content.policy_id where guarded_content.turn_id=p_turn_id and guarded_policy.context_mode='knowledge_intent_v1') then return jsonb_build_object('kind','unavailable'); end if;
  if not turn_private.lock_turn(p_turn_id,u,(auth.jwt()->>'session_id')::uuid) then return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id and owner_id=u and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null) then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','text','schemaVersion','text-turn-v1','turnId',c.turn_id,'locale',c.locale,'input',c.input_text,'outcome',c.output_kind,'output',c.output_text);
end $function$
