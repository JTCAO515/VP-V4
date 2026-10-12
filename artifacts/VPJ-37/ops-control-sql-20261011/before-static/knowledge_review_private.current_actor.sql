create function knowledge_review_private.current_actor()
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  if u is null or s is null then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from knowledge_review_private.settings where singleton and enabled for share;
  if not found then raise exception 'OPS_DISABLED'; end if;
  -- Lock auth root before mobile/session rows, following the current identity contract.
  perform 1 from auth.users where id=u for key share nowait;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  insert into identity_private.mobile_accounts(owner_id) values(u) on conflict do nothing;
  perform identity_private.guard_mobile_rpc_v2();
  perform 1 from auth.sessions where id=s and user_id=u for key share;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from knowledge_review_private.members where actor_id=u and active for share;
  if not found then raise exception 'OPS_FORBIDDEN'; end if;
  return u;
end $$;
