CREATE OR REPLACE FUNCTION public.list_text_turns(p_policy_id uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=turn_private.text_owner(); rows jsonb;
begin
  if exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='knowledge_intent_v1') then return jsonb_build_object('kind','unavailable'); end if;
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','unavailable'); end if;
  select coalesce(jsonb_agg(row.value order by row.created_at desc,row.turn_id),'[]'::jsonb) into rows from (
    select c.created_at,c.turn_id,jsonb_build_object('turnId',c.turn_id,'threadId',c.thread_id,'locale',c.locale,
      'input',c.input_text,'outcome',c.output_kind,'output',c.output_text,'status',t.status,'createdAt',c.created_at) as value
    from turn_private.text_content c
      join public.turns t on t.id=c.turn_id and t.owner_id=u
      join public.chat_threads h on h.id=c.thread_id and h.owner_id=u and h.status='active'
      join turn_private.text_consents g on g.owner_id=u and g.policy_id=c.policy_id and g.consent_id=c.consent_id and g.revoked_at is null
    where c.owner_id=u and c.policy_id=p_policy_id and c.hidden_at is null
    order by c.created_at desc,c.turn_id limit p_limit
  ) row;
  return jsonb_build_object('kind','history','turns',rows);
end $function$
