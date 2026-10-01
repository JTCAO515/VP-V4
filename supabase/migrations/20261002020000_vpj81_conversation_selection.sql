-- Bounded owner-only history. Same current policy/consent/session as the existing reader.
-- No table grants, intake, work creation, policy migration, or historical consent recovery.
create function public.list_assistant_conversations_v1(p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype; items jsonb;
begin
  if p_policy_id is null or not turn_private.text_policy_current(p_policy_id) then
    return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.text_consents
    where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('conversationId',x.id,'createdAt',x.created_at,
    'preview',coalesce(m.input_text,'')) order by x.created_at desc,x.id desc),'[]'::jsonb) into items
  from (select id,created_at from turn_private.assistant_conversations
    where owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id
    order by created_at desc,id desc limit 20) x
  left join lateral (
    select left(a.input_text,120) input_text from turn_private.assistant_messages a
    where a.conversation_id=x.id and a.owner_id=u and a.policy_id=p_policy_id and a.consent_id=c.consent_id
      and (a.turn_id is null or exists(select 1 from turn_private.text_content tc
        join public.turns t on t.id=tc.turn_id and t.owner_id=u
        where tc.turn_id=a.turn_id and tc.owner_id=u and tc.hidden_at is null))
    order by a.sequence limit 1
  ) m on true;
  return jsonb_build_object('kind','conversations','conversations',items,'limit',20);
end $$;
revoke all on function public.list_assistant_conversations_v1(uuid) from public,anon,service_role;
grant execute on function public.list_assistant_conversations_v1(uuid) to authenticated;
notify pgrst, 'reload schema';
