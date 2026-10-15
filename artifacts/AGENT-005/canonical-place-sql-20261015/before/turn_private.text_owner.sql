CREATE OR REPLACE FUNCTION turn_private.text_owner()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  if u is null or s is null then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from auth.users where id=u for key share nowait;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  insert into identity_private.mobile_accounts(owner_id) values(u) on conflict do nothing;
  perform identity_private.guard_mobile_rpc_v2();
  perform 1 from auth.sessions where id=s and user_id=u for key share;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  return u;
end $function$
