-- Owner-facing reads and atomic standalone Ask admission. No policy is installed.
create function public.read_text_policy(p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); p turn_private.text_policies%rowtype; c turn_private.text_consents%rowtype;
begin
  if not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','unavailable'); end if;
  select * into p from turn_private.text_policies where id=p_policy_id;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id;
  return jsonb_build_object('kind','policy','policy',jsonb_build_object(
    'id',p.id,'provider',p.provider,'recipient',p.recipient,'sourceRegion',p.source_region,
    'processingRegion',p.processing_region,'storageRegion',p.storage_region,'termsVersion',p.terms_version,
    'noticeVersion',p.notice_version,'noticeHash',p.notice_hash,'noticeZh',p.notice_zh,'noticeEn',p.notice_en,
    'retention',p.retention,'expiresAt',least(p.expires_at,p.terms_recheck_at),
    'consentState',case when c.consent_id is null then 'not_accepted' when c.revoked_at is not null then 'withdrawn' else 'accepted' end));
end $$;

create function public.submit_text_turn(p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); result jsonb;
begin
  if p_thread_id is null then raise exception 'INVALID_INPUT'; end if;
  insert into public.chat_threads(id,owner_id) values(p_thread_id,u) on conflict do nothing;
  result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
  -- Raise to roll back the new thread as well as input admission on denial.
  if result->>'kind'<>'accepted' then raise exception 'DATA_POLICY_BLOCKED'; end if;
  return result;
end $$;

create function public.list_text_turns(p_policy_id uuid,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); rows jsonb;
begin
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
end $$;

revoke all on function public.read_text_policy(uuid),public.submit_text_turn(uuid,uuid,uuid,uuid,text,text),public.list_text_turns(uuid,integer) from public,anon,service_role;
grant execute on function public.read_text_policy(uuid),public.submit_text_turn(uuid,uuid,uuid,uuid,text,text),public.list_text_turns(uuid,integer) to authenticated;
notify pgrst, 'reload schema';
