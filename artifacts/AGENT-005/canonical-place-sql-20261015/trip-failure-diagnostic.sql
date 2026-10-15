-- Diagnostic only: this block cannot turn a failed original guard into success.
do $guards$
declare vector jsonb;detail jsonb;runtime_source text;expected_names jsonb;actual_names jsonb;expected_triggers jsonb;actual_triggers jsonb;manifest jsonb;entry record;field_name text;actual_meta jsonb;differences jsonb:='[]'::jsonb;expected_hash text;actual_hash text;
begin
 if place_actions_private.ask_schema_v1() is not true or profile_data_private.schema_v1() is not true or result_data_private.infrastructure_supported_v1() is not true or result_data_private.schema_supported_v1() is not true or turn_data_private.schema_supported_v1() is not true or turn_data_private.runtime_supported_v1() is not true or conversation_data_private.schema_supported_v1() is not true or export_private.profile_hooks_valid_v1() is not true or turn_data_private.write_hooks_valid_v1() is not true or turn_data_private.hooks_valid_v1() is not true or turn_private.trip_service_task_runtime_v1() is not true then
  vector:=jsonb_build_object('selected_schema',place_actions_private.ask_schema_v1(),'profile_schema',profile_data_private.schema_v1(),'result_infrastructure',result_data_private.infrastructure_supported_v1(),'result_schema',result_data_private.schema_supported_v1(),'turn_schema',turn_data_private.schema_supported_v1(),'turn_runtime',turn_data_private.runtime_supported_v1(),'conversation_schema',conversation_data_private.schema_supported_v1(),'export_hooks',export_private.profile_hooks_valid_v1(),'turn_write_hooks',turn_data_private.write_hooks_valid_v1(),'turn_hooks',turn_data_private.hooks_valid_v1(),'trip_runtime',turn_private.trip_service_task_runtime_v1());
  begin
   -- Match the original runtime function's fixed empty-path deparse context.
   perform pg_catalog.set_config('search_path','',true);
   -- The original after-pin above already fixes this authored manifest source.
   select prosrc into runtime_source from pg_proc where oid='turn_private.trip_service_task_runtime_v1()'::regprocedure;
   expected_names:=replace((regexp_match(runtime_source,$rx$if names is distinct from '([^
]+)'::jsonb$rx$))[1],chr(39)||chr(39),chr(39))::jsonb;
   expected_triggers:=replace((regexp_match(runtime_source,$rx$if actual is distinct from '([^
]+)'::jsonb$rx$))[1],chr(39)||chr(39),chr(39))::jsonb;
   manifest:=replace((regexp_match(runtime_source,$rx$jsonb_each\('([^
]+)'::jsonb\) loop$rx$))[1],chr(39)||chr(39),chr(39))::jsonb;
 select jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text collate "C") into actual_names from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in('turn_private','scoped_edit_private');
 select jsonb_agg(jsonb_build_object('relation',tgrelid::regclass::text,'name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled::text,'function',tgfoid::regprocedure::text) order by tgrelid::regclass::text collate "C",tgname collate "C") into actual_triggers from pg_catalog.pg_trigger where not tgisinternal and tgname in('settle_trip_service_task','trip_proposal_terminal','trip_worker_terminal','trip_objective_text_erased','trip_objective_message_erased','trip_objective_trip_erased','trip_objective_account_erased','guard_text_capacity_scope','guard_metered_task_type','guard_metered_thread_trip','scoped_confirm_event','scoped_proposal_guard','trip_privacy_source_fence');
   if current_setting('session_replication_role')<>'origin' then
    detail:=jsonb_build_object('stage','replication_role','field','session_replication_role','expected_hash',encode(sha256(convert_to(to_jsonb('origin'::text)::text,'UTF8')),'hex'),'actual_hash',encode(sha256(convert_to(to_jsonb(current_setting('session_replication_role'))::text,'UTF8')),'hex'));
   elsif actual_names is distinct from expected_names then
    detail:=jsonb_build_object('stage','namespace_inventory','expected_count',jsonb_array_length(expected_names),'actual_count',jsonb_array_length(actual_names),'expected_hash',encode(sha256(convert_to(expected_names::text,'UTF8')),'hex'),'actual_hash',encode(sha256(convert_to(actual_names::text,'UTF8')),'hex'));
   elsif actual_triggers is distinct from expected_triggers then
    detail:=jsonb_build_object('stage','trigger_inventory','expected_count',jsonb_array_length(expected_triggers),'actual_count',jsonb_array_length(actual_triggers),'expected_hash',encode(sha256(convert_to(expected_triggers::text,'UTF8')),'hex'),'actual_hash',encode(sha256(convert_to(actual_triggers::text,'UTF8')),'hex'));
   else
    for entry in select key signature,value expected from jsonb_each(manifest) order by key loop
     select jsonb_build_object('source',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'definition',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'secdef',p.prosecdef,'acl',p.proacl::text,'config',p.proconfig,'kind',p.prokind::text,'language',l.lanname) into actual_meta from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(entry.signature);
     for field_name in select jsonb_object_keys(entry.expected) order by 1 loop
      if actual_meta->field_name is distinct from entry.expected->field_name then
       expected_hash:=case when field_name in('source','definition') then entry.expected->>field_name else encode(sha256(convert_to((entry.expected->field_name)::text,'UTF8')),'hex') end;
       actual_hash:=case when field_name in('source','definition') then actual_meta->>field_name else encode(sha256(convert_to((actual_meta->field_name)::text,'UTF8')),'hex') end;
       differences:=differences||jsonb_build_array(jsonb_build_object('signature',entry.signature,'field',field_name,'expected_hash',expected_hash,'actual_hash',actual_hash));
       exit when jsonb_array_length(differences)>=3;
      end if;
     end loop;
     exit when jsonb_array_length(differences)>=3;
    end loop;
    detail:=jsonb_build_object('stage',case when jsonb_array_length(differences)>0 then 'function_metadata' else 'base_guard_or_unclassified' end,'differences',differences);
   end if;
  exception when others then
   detail:=jsonb_build_object('stage','diagnostic_unavailable','sqlstate',SQLSTATE);
  end;
  raise exception 'CANONICAL_PLACE_LIFECYCLE_GUARD_MISMATCH %',jsonb_build_object('postgres',current_setting('server_version'),'guards',vector,'trip_failure',detail);
 end if;
end $guards$;
