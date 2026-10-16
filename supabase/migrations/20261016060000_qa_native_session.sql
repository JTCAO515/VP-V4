-- Native QA: ordinary JWT/RLS + original mobile epoch lock and original QA
-- operation in one transaction. No new identity, queue, table or provider grant.
begin;
create function public.qa_native_session_v1(p_action text,p_mobile_epoch bigint,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor_n jsonb;claims_n jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 u uuid:=coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),claims_n->>'sub')::uuid;
 sid uuid:=(claims_n->>'session_id')::uuid;
 expected_n text[];keys_n text[];row_n public.chat_threads%rowtype;r jsonb;rows_n jsonb;
begin
 if p_mobile_epoch is null or p_mobile_epoch<1 or p_action is null or p_payload is null
 or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 then raise exception 'INVALID_INPUT';end if;
 if u is null or sid is null then raise exception 'UNAUTHENTICATED';end if;
 expected_n:=case p_action
  when 'list' then array[]::text[] when 'create' then array[]::text[]
  when 'read' then array['p_thread_id']
  when 'qa_read_policy_v1' then array['p_policy_id']
  when 'qa_accept_policy_v1' then array['p_policy_id','p_notice_hash']
  when 'qa_list_sessions_v1' then array['p_limit']
  when 'qa_read_session_v1' then array['p_thread_id']
  when 'read_text_turn' then array['p_turn_id']
  when 'qa_submit_message_v1' then array['p_thread_id','p_turn_id','p_idempotency_key','p_policy_id','p_locale','p_text','p_task_id','p_relationship']
  when 'qa_cancellation_v1' then array['p_action','p_thread_id','p_request_id']
  else null end;
 if expected_n is null then raise exception 'INVALID_INPUT';end if;
 select coalesce(array_agg(k order by k),array[]::text[]) into keys_n from jsonb_object_keys(p_payload) k;
 if keys_n is distinct from (select coalesce(array_agg(k order by k),array[]::text[]) from unnest(expected_n) k)
 or exists(select 1 from jsonb_each(p_payload) v where (v.key='p_limit' and (jsonb_typeof(v.value)<>'number' or v.value::text !~ '^[0-9]+$'))
 or (v.key<>'p_limit' and jsonb_typeof(v.value)<>'string')) then raise exception 'INVALID_INPUT';end if;
 -- Cancellation's existing capacity lock precedes its account/session lock.
 if p_action='qa_cancellation_v1' then
  if p_payload->>'p_action' not in ('read','cancel') then raise exception 'INVALID_INPUT';end if;
  if p_payload->>'p_action'='cancel' then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34));
  end if;
 end if;
 -- The original function validates ordinary authenticated/nonanonymous JWT,
 -- live Auth session and active mobile session under the shared account lock.
 -- This lock remains held through the operation below, not an HTTP precheck.
 actor_n:=public.native_session_v2('session');
 if actor_n->>'version' is distinct from '2' or actor_n->>'subject' is distinct from u::text
 or actor_n->>'sessionId' is distinct from sid::text
 or actor_n->>'mobileEpoch' is distinct from p_mobile_epoch::text then raise exception 'SESSION_REPLACED';end if;
 u:=(actor_n->>'subject')::uuid;
 case p_action
 when 'list' then
  r:=public.qa_list_sessions_v1(20);
  if r->>'kind' is distinct from 'sessions' then return r;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'status',h.status,'createdAt',h.created_at,'updatedAt',h.updated_at) order by h.updated_at desc,h.id),'[]'::jsonb)
   into rows_n from public.chat_threads h where h.owner_id=u and h.status='active' and h.trip_id is null
   and exists(select 1 from jsonb_array_elements(r->'sessions') s where s->>'threadId'=h.id::text);
  return jsonb_build_object('kind','threads','threads',rows_n);
 when 'create' then
  insert into public.chat_threads(owner_id,trip_id) values(u,null) returning * into row_n;
  return jsonb_build_object('kind','thread','thread',jsonb_build_object('id',row_n.id,'status',row_n.status,'createdAt',row_n.created_at,'updatedAt',row_n.updated_at));
 when 'read' then
  select * into row_n from public.chat_threads where id=(p_payload->>'p_thread_id')::uuid and owner_id=u and status='active' and trip_id is null;
  if not found then raise exception 'FORBIDDEN';end if;
  r:=public.qa_read_session_v1((p_payload->>'p_thread_id')::uuid);
  if r->>'kind' is distinct from 'session' then return r;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'createdAt',t.created_at) order by t.created_at,t.id),'[]'::jsonb)
   into rows_n from public.turns t where t.thread_id=row_n.id and t.owner_id=u;
  return jsonb_build_object('kind','thread_read','thread',jsonb_build_object('id',row_n.id,'status',row_n.status,'createdAt',row_n.created_at,'updatedAt',row_n.updated_at),'turns',rows_n);
 when 'qa_read_policy_v1' then return public.qa_read_policy_v1((p_payload->>'p_policy_id')::uuid);
 when 'qa_accept_policy_v1' then return public.qa_accept_policy_v1((p_payload->>'p_policy_id')::uuid,p_payload->>'p_notice_hash');
 when 'qa_list_sessions_v1' then return public.qa_list_sessions_v1((p_payload->>'p_limit')::integer);
 when 'qa_read_session_v1' then return public.qa_read_session_v1((p_payload->>'p_thread_id')::uuid);
 when 'read_text_turn' then return public.read_text_turn((p_payload->>'p_turn_id')::uuid);
 when 'qa_submit_message_v1' then return public.qa_submit_message_v1((p_payload->>'p_thread_id')::uuid,(p_payload->>'p_turn_id')::uuid,
  (p_payload->>'p_idempotency_key')::uuid,(p_payload->>'p_policy_id')::uuid,p_payload->>'p_locale',p_payload->>'p_text',
  (p_payload->>'p_task_id')::uuid,p_payload->>'p_relationship');
 when 'qa_cancellation_v1' then return public.qa_cancellation_v1(p_payload->>'p_action',(p_payload->>'p_thread_id')::uuid,(p_payload->>'p_request_id')::uuid);
 end case;
 raise exception 'INVALID_INPUT';
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_INPUT';
end $$;
alter function public.qa_native_session_v1(text,bigint,jsonb) owner to postgres;
revoke all on function public.qa_native_session_v1(text,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.qa_native_session_v1(text,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
