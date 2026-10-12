create function identity_private.mobile_access_v2()
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); s uuid := (auth.jwt()->>'session_id')::uuid; a identity_private.mobile_accounts%rowtype;
begin
  if s is not null and u is not null and not exists(select 1 from auth.sessions where id=s and user_id=u) then return false; end if;
  if not exists(select 1 from identity_private.mobile_attempts where session_id=s) and not exists(select 1 from identity_private.mobile_login_proofs where session_id=s) then return true; end if;
  select * into a from identity_private.mobile_accounts where owner_id=u;
  return coalesce(a.session_id=s and exists(select 1 from auth.sessions where id=s and user_id=u),false);
end $$;
