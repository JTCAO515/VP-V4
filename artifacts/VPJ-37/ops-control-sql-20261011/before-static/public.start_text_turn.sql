create function public.start_text_turn(p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype; t record; prior turn_private.text_content%rowtype; admitted jsonb;
begin
  if p_turn_id is null or p_idempotency_key is null or p_locale is null or p_locale not in ('zh','en','es','ru','ar') or not turn_private.valid_text(p_text,4000) then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then return jsonb_build_object('kind','blocked'); end if;
  select * into t from public.start_chat_turn(p_thread_id,p_turn_id,p_idempotency_key,'chat-state-control-v1');
  select * into prior from turn_private.text_content where turn_id=t.turn_id;
  if found then
    if prior.owner_id<>u or prior.hidden_at is not null or prior.policy_id<>p_policy_id or prior.consent_id<>c.consent_id or prior.input_text<>p_text or prior.locale<>p_locale then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    return jsonb_build_object('kind','accepted','turnId',t.turn_id,'reused',true);
  end if;
  if t.reused then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
  insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text) values(t.turn_id,u,p_thread_id,p_policy_id,c.consent_id,p_locale,p_text);
  admitted:=public.enqueue_turn_work(t.turn_id,u,(auth.jwt()->>'session_id')::uuid,120000,3);
  if admitted->>'kind'<>'queued' then raise exception 'TURN_UNAVAILABLE'; end if;
  return jsonb_build_object('kind','accepted','turnId',t.turn_id,'reused',false);
end $$;
