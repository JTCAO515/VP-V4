-- New immutable policy mode; no policy, consent, recipient or budget is activated.
alter table turn_private.text_policies add column context_mode text not null default 'current_input_v1'
  check(context_mode in ('current_input_v1','task_history_v1'));

-- Caller already holds the owner/account/thread lock. Follow at most four links;
-- retained hidden text or a missing/deleted ancestor invalidates the entire input.
create function turn_private.task_history(p_turn uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype; l turn_private.service_task_turns%rowtype;
  c turn_private.text_content%rowtype; cursor_id uuid:=p_turn; seen uuid[]:='{}'; result jsonb:='[]'; state text;
begin
  select t.* into s from turn_private.service_tasks t join turn_private.service_task_turns x on x.task_id=t.id where x.turn_id=p_turn;
  if not found then return null; end if;
  loop
    if cursor_id is null or cursor_id=any(seen) or cardinality(seen)>=4 then return null; end if;
    seen:=array_append(seen,cursor_id);
    select * into l from turn_private.service_task_turns where turn_id=cursor_id and task_id=s.id and owner_id=s.owner_id;
    if not found then return null; end if;
    select * into c from turn_private.text_content where turn_id=cursor_id and owner_id=s.owner_id and thread_id=s.thread_id
      and policy_id=s.policy_id and consent_id=s.consent_id and hidden_at is null;
    if not found then return null; end if;
    select status into state from public.turns where id=cursor_id and owner_id=s.owner_id and thread_id=s.thread_id;
    if not found then return null; end if;
    if cursor_id<>p_turn then
      if state not in ('completed','failed') or c.output_kind not in ('clarification','technical_failure') or c.output_text is null then return null; end if;
      result:=jsonb_build_array(jsonb_build_object('role','user','content',c.input_text),
        jsonb_build_object('role','assistant','content',c.output_text))||result;
    end if;
    if l.parent_turn_id is null then
      if cursor_id<>s.goal_turn_id or l.relationship<>'new_goal' then return null; end if;
      return result;
    end if;
    cursor_id:=l.parent_turn_id;
  end loop;
end $$;
revoke all on function turn_private.task_history(uuid) from public,anon,authenticated,service_role;

create function turn_private.bound_task_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare prior jsonb;
begin
  if exists(select 1 from turn_private.service_tasks s join turn_private.text_policies p on p.id=s.policy_id
    where s.id=NEW.task_id and p.context_mode='task_history_v1') and NEW.parent_turn_id is not null then
    prior:=turn_private.task_history(NEW.parent_turn_id);
    if prior is null then raise exception 'DATA_POLICY_BLOCKED'; end if;
    if jsonb_array_length(prior)>=6 then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  end if;
  return NEW;
end $$;
revoke all on function turn_private.bound_task_history() from public,anon,authenticated,service_role;
create trigger bound_task_history before insert on turn_private.service_task_turns for each row execute function turn_private.bound_task_history();

create or replace function turn_private.lock_text_work(p_turn uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; c turn_private.text_content%rowtype;
begin
  select * into w from turn_private.work where turn_id=p_turn;
  if not found or p_token is null or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return false; end if;
  select * into w from turn_private.work where turn_id=p_turn for update;
  if not found or w.state<>'leased' or w.lease_token is distinct from p_token or w.expires_at<=clock_timestamp()
    or not exists(select 1 from public.turns where id=p_turn and status not in ('completed','proposal_ready','unavailable','failed','cancelled')) then return false; end if;
  select * into c from turn_private.text_content where turn_id=p_turn and owner_id=w.owner_id and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) then return false; end if;
  if exists(select 1 from turn_private.service_task_turns where turn_id=p_turn)
    and not exists(select 1 from turn_private.service_task_turns l
      join turn_private.service_tasks s on s.id=l.task_id and s.owner_id=c.owner_id and s.thread_id=c.thread_id
      join turn_private.text_content g on g.turn_id=s.goal_turn_id and g.hidden_at is null
      join public.turns t on t.id=g.turn_id and t.owner_id=c.owner_id
      where l.turn_id=p_turn and s.policy_id=c.policy_id and s.consent_id=c.consent_id)
    then return false; end if;
  perform 1 from turn_private.text_consents where owner_id=c.owner_id and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null for share;
  return found and w.expires_at>clock_timestamp() and (
    (select context_mode from turn_private.text_policies where id=c.policy_id)='current_input_v1'
    or turn_private.task_history(p_turn) is not null);
end $$;


create or replace function public.read_text_work(p_turn_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype; p turn_private.text_policies%rowtype; history jsonb; payload jsonb;
begin
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  select * into p from turn_private.text_policies where id=c.policy_id;
  if p.context_mode='task_history_v1' then
    history:=turn_private.task_history(p_turn_id);
    if history is null then return jsonb_build_object('kind','blocked'); end if;
    payload:=jsonb_build_object('kind','task_input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint,'history',history);
    return payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(payload::text,'UTF8')),'hex'));
  end if;
  return jsonb_build_object('kind','input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint);
end $$;

create or replace function public.authorize_text_dispatch(p_turn_id uuid,p_lease_token uuid,p_policy_id uuid,p_provider text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype;
begin
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  if c.policy_id is distinct from p_policy_id or not exists(select 1 from turn_private.text_policies where id=p_policy_id and provider=p_provider and context_mode='current_input_v1') then return jsonb_build_object('kind','blocked'); end if;
  insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,c.consent_id,c.policy_id) on conflict do nothing;
  if not found then return jsonb_build_object('kind','blocked'); end if;
  return jsonb_build_object('kind','authorized');
end $$;


-- Digest binds fresh authorization to exactly the history read for this dispatch.
create function public.authorize_text_task_dispatch(p_turn_id uuid,p_lease_token uuid,p_policy_id uuid,p_provider text,p_context_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb; c turn_private.text_content%rowtype;
begin
  payload:=public.read_text_work(p_turn_id,p_lease_token);
  if payload->>'kind' is distinct from 'task_input' or payload->>'policyId' is distinct from p_policy_id::text
    or payload->>'provider' is distinct from p_provider or payload->>'contextDigest' is distinct from p_context_digest then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,c.consent_id,c.policy_id) on conflict do nothing;
  if not found then return jsonb_build_object('kind','blocked'); end if;
  return jsonb_build_object('kind','authorized');
end $$;
revoke all on function public.authorize_text_task_dispatch(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.authorize_text_task_dispatch(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.claim_turn_work()
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; w turn_private.work%rowtype; turn_state text;
begin
  -- Advisory locks keep competing claimers off one candidate without reversing
  -- the account/Turn lock order used by cancellation and admission. Once any
  -- entity lock is acquired, handle only that candidate and return. Continuing
  -- would accumulate locks across owners and allow opposite-order deadlocks.
  -- An empty result may mean one stale candidate was cleaned; callers poll again.
  for candidate in select turn_id,owner_id,session_id from turn_private.work q
    where (state='queued' or (state='leased' and expires_at<=clock_timestamp()))
      and not exists(select 1 from turn_private.text_content c join turn_private.text_policies p on p.id=c.policy_id
        where c.turn_id=q.turn_id and p.context_mode='task_history_v1') order by created_at,turn_id limit 100 loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null where turn_id=candidate.turn_id and state in ('queued','leased');
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id for update;
    if not found or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp()) then return jsonb_build_object('kind','empty'); end if;
    select status into turn_state from public.turns where id=w.turn_id;
    if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then perform turn_private.terminal(w.turn_id,'cancelled',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); return jsonb_build_object('kind','empty'); end if;
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond' where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $$;

create function turn_private.claim_text_mode(p_owner_id uuid,p_policy_id uuid,p_context_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; w turn_private.work%rowtype; c turn_private.text_content%rowtype; turn_state text;
begin
  if p_owner_id is null or p_policy_id is null then raise exception 'INVALID_INPUT'; end if;
  -- An unlocked filter avoids taking policy/consent locks before the established
  -- owner -> account/session -> Turn/thread -> work -> policy/consent order.
  -- Everything relevant to dispatch is checked again after those locks.
  for candidate in
    select q.turn_id,q.owner_id,q.session_id from turn_private.work q
    join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
    join turn_private.text_policies p on p.id=x.policy_id
    join turn_private.text_consents s on s.owner_id=x.owner_id and s.policy_id=x.policy_id and s.consent_id=x.consent_id
    where q.owner_id=p_owner_id and x.policy_id=p_policy_id and x.hidden_at is null and p.context_mode=p_context_mode
      and p.revoked_at is null and p.effective_at<=clock_timestamp()
      and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp() and s.revoked_at is null
      and (q.state='queued' or (q.state='leased' and q.expires_at<=clock_timestamp()))
    order by q.created_at,q.turn_id limit 100
  loop
    -- Same advisory key as the legacy global claimer: concurrent versions cannot
    -- lease the same candidate. Return after taking any entity lock.
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null
        where turn_id=candidate.turn_id and state in ('queued','leased');
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id and owner_id=p_owner_id for update;
    if not found or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp()) then return jsonb_build_object('kind','empty'); end if;
    select * into c from turn_private.text_content where turn_id=w.turn_id and owner_id=p_owner_id and policy_id=p_policy_id and hidden_at is null;
    if not found or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','empty'); end if;
    perform 1 from turn_private.text_consents where owner_id=p_owner_id and policy_id=p_policy_id and consent_id=c.consent_id and revoked_at is null for share;
    if not found or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','empty'); end if;
    select status into turn_state from public.turns where id=w.turn_id;
    if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then perform turn_private.terminal(w.turn_id,'cancelled',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); return jsonb_build_object('kind','empty'); end if;
    -- A slow policy/consent lock cannot revive an already leased item. Its state
    -- and expiry were locked above; only queued/expired work receives a new token.
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond'
      where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $$;


revoke all on function turn_private.claim_text_mode(uuid,uuid,text) from public,anon,authenticated,service_role;
create or replace function public.claim_text_work(p_owner_id uuid,p_policy_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select turn_private.claim_text_mode(p_owner_id,p_policy_id,'current_input_v1')
$$;
create function public.claim_text_task_work(p_owner_id uuid,p_policy_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select turn_private.claim_text_mode(p_owner_id,p_policy_id,'task_history_v1')
$$;
revoke all on function public.claim_text_task_work(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_text_task_work(uuid,uuid) to service_role;

-- Only the explicit v3 consumer requests this shape; old v1/v2 remain unchanged.
create function public.read_text_task_policy(p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='task_history_v1') then return jsonb_build_object('kind','unavailable'); end if;
  return public.read_text_policy(p_policy_id);
end $$;
revoke all on function public.read_text_task_policy(uuid) from public,anon,service_role;
grant execute on function public.read_text_task_policy(uuid) to authenticated;
notify pgrst,'reload schema';

-- A context policy cannot admit an unassociated legacy Turn.
create function turn_private.require_text_task()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode='task_history_v1')
    and not exists(select 1 from turn_private.service_task_turns l join turn_private.service_tasks s on s.id=l.task_id
      where l.turn_id=NEW.turn_id and l.owner_id=NEW.owner_id and s.owner_id=NEW.owner_id and s.thread_id=NEW.thread_id
        and s.policy_id=NEW.policy_id and s.consent_id=NEW.consent_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  return NEW;
end $$;
revoke all on function turn_private.require_text_task() from public,anon,authenticated,service_role;
create trigger require_text_task before insert on turn_private.text_content for each row execute function turn_private.require_text_task();
