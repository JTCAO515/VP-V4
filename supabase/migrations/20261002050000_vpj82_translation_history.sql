-- Read-only translation-history v2. Original text readers/20-row wire unchanged.
create index text_content_owner_policy_history_v2
  on turn_private.text_content(owner_id,policy_id,created_at desc,turn_id desc);

-- Same ordinary-read basis as list_text_turns; only completed answered tool
-- candidates cross this seam. Canonical input/output/numeric validation remains
-- projectTranslation's responsibility. No arbitrary Ask body is returned.
create function turn_private.saved_translation_candidate_v1(p_turn uuid,p_owner uuid,p_policy uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('turnId',c.turn_id,'locale',c.locale,'input',c.input_text,
    'outcome',c.output_kind,'output',c.output_text,'status',t.status,'createdAt',c.created_at)
  from turn_private.text_content c
  join public.turns t on t.id=c.turn_id and t.owner_id=p_owner and t.thread_id=c.thread_id
  join public.chat_threads h on h.id=c.thread_id and h.owner_id=p_owner and h.status='active'
  join turn_private.text_consents g on g.owner_id=p_owner and g.policy_id=c.policy_id
    and g.consent_id=c.consent_id and g.revoked_at is null
  join turn_private.text_policies p on p.id=c.policy_id and p.context_mode='current_input_v1'
  where c.turn_id=p_turn and c.owner_id=p_owner and c.policy_id=p_policy and c.hidden_at is null
    and turn_private.text_policy_current(p_policy) and t.status='completed' and c.output_kind='answered'
    and pg_catalog.starts_with(c.input_text,E'VisePanda field translation v1\n');
$$;
revoke all on function turn_private.saved_translation_candidate_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.read_saved_translation_v1(p_policy_id uuid,p_turn_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); original jsonb; item jsonb;
begin
  if p_policy_id is null or p_turn_id is null then raise exception 'INVALID_INPUT'; end if;
  -- Reuse the existing exact text reader's owner/session/Turn/thread lock guard.
  original:=public.read_text_turn(p_turn_id);
  if original->>'kind'<>'text' then return jsonb_build_object('kind','unavailable'); end if;
  item:=turn_private.saved_translation_candidate_v1(p_turn_id,u,p_policy_id);
  if item is null then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','translation_candidate','turn',item);
end $$;
revoke all on function public.read_saved_translation_v1(uuid,uuid) from public,anon,service_role;
grant execute on function public.read_saved_translation_v1(uuid,uuid) to authenticated;

create function public.list_saved_translations_v1(p_policy_id uuid,p_cursor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); anchor turn_private.text_content%rowtype;
  anchor_data jsonb; rows jsonb; tail boolean;
begin
  if p_policy_id is null then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id)
    or not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='current_input_v1')
    or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null)
    then return jsonb_build_object('kind','unavailable'); end if;
  if p_cursor is not null then
    anchor_data:=turn_private.saved_translation_candidate_v1(p_cursor,u,p_policy_id);
    if anchor_data is null then return jsonb_build_object('kind','unavailable'); end if;
    select * into anchor from turn_private.text_content where turn_id=p_cursor and owner_id=u and policy_id=p_policy_id;
  end if;
  -- Bound source IDs before hidden/status/translation filters. The 129th row
  -- is a content-free sentinel. Never expose a nontranslation scan anchor.
  with candidates as materialized (
    select c.turn_id,c.created_at from turn_private.text_content c
    where c.owner_id=u and c.policy_id=p_policy_id
      and (c.created_at,c.turn_id)<=(coalesce(anchor.created_at,'infinity'::timestamptz),
        coalesce(anchor.turn_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      and (p_cursor is null or (c.created_at,c.turn_id)<(anchor.created_at,anchor.turn_id))
    order by c.created_at desc,c.turn_id desc limit 129
  ), bounded as materialized (
    select * from candidates order by created_at desc,turn_id desc limit 128
  ), qualified as materialized (
    select b.turn_id,b.created_at,turn_private.saved_translation_candidate_v1(b.turn_id,u,p_policy_id) as item
    from bounded b
  )
  select coalesce((select jsonb_agg(item order by created_at desc,turn_id desc) from qualified where item is not null),'[]'::jsonb),
    (select count(*)>128 from candidates) into rows,tail;
  -- The HTTP projector chooses at most20 fully valid translations and a21st
  -- valid sentinel. Sparse/malformed windows with an unscanned tail fail closed.
  return jsonb_build_object('kind','translation_candidates','turns',rows,
    'anchor',anchor_data,'hasUnscannedTail',tail);
end $$;
revoke all on function public.list_saved_translations_v1(uuid,uuid) from public,anon,service_role;
grant execute on function public.list_saved_translations_v1(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
