CREATE OR REPLACE FUNCTION turn_data_private.export_row_v1(rel text, v jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare c record;out_n jsonb:=place_actions_private.ask_source_row_v1(rel,v);begin
 for c in select attname from pg_attribute where attrelid=rel::regclass and attnum>0 and not attisdropped and atttypid in('int8'::regtype,'xid8'::regtype) loop
  if v->c.attname<>'null'::jsonb then out_n:=jsonb_set(out_n,array[c.attname::text],to_jsonb(v->>c.attname));end if;
 end loop;return out_n;
end$function$
;
