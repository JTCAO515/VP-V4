CREATE OR REPLACE FUNCTION export_private.profile_normalize_integers_v1(v jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$declare k text;x jsonb;out_n jsonb;begin
 if jsonb_typeof(v)='object' then
  out_n:='{}';
  for k,x in select key,value from jsonb_each(v) loop
   if jsonb_typeof(x)='number' then
    if k not in('expectedRevision','mobileEpoch','capturedAt','expiresAt','decidedAt','profileRevision','paceRevision','profileErasureFloor','paceErasureFloor',
     'beforeProfileRevision','afterProfileRevision','beforePaceRevision','afterPaceRevision','clearedPreviews','retainedFences','profiles','watermarks','operations') then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
    x:=export_private.profile_integer_v1(x,case when k in('expectedRevision','profileRevision','paceRevision','profileErasureFloor','paceErasureFloor','beforeProfileRevision','afterProfileRevision','beforePaceRevision','afterPaceRevision') then 9007199254740990 else 9007199254740991 end);
   else x:=export_private.profile_normalize_integers_v1(x);end if;
   out_n:=out_n||jsonb_build_object(k,x);
  end loop;
  return out_n;
 elsif jsonb_typeof(v)='array' then
  out_n:='[]';for x in select value from jsonb_array_elements(v) loop out_n:=out_n||jsonb_build_array(export_private.profile_normalize_integers_v1(x));end loop;return out_n;
 elsif jsonb_typeof(v)='number' then raise exception 'PROFILE_SOURCE_UNAVAILABLE';
 else return v;end if;
end$function$

