CREATE OR REPLACE FUNCTION turn_data_private.hooks_valid_v1()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin return turn_data_private.runtime_supported_v1() and turn_data_private.write_hooks_valid_v1() and turn_data_private.schema_supported_v1();end$function$