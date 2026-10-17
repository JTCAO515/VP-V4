CREATE OR REPLACE FUNCTION turn_private.lock_trip_account_v1(u uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform 1 from auth.users where id=u for key share nowait;if not found then return false;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=u for update;return found;
end $function$
