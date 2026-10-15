CREATE OR REPLACE FUNCTION turn_private.lock_turn(p_turn uuid, p_owner uuid, p_session uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.turns%rowtype;
begin
  perform 1 from auth.users where id=p_owner for key share nowait;
  if not found then return false; end if;
  perform 1 from identity_private.mobile_accounts where owner_id=p_owner for update;
  perform 1 from auth.sessions where id=p_session and user_id=p_owner for key share;
  if not found then return false; end if;
  if exists(select 1 from identity_private.mobile_login_proofs where session_id=p_session)
     or exists(select 1 from identity_private.mobile_attempts where session_id=p_session) then
    if not exists(select 1 from identity_private.mobile_accounts where owner_id=p_owner and session_id=p_session) then return false; end if;
  end if;
  select * into t from public.turns where id=p_turn and owner_id=p_owner for update;
  if not found or t.thread_id is null then return false; end if;
  perform 1 from public.chat_threads where id=t.thread_id and owner_id=p_owner and status='active' for update nowait;
  return found;
end $function$
