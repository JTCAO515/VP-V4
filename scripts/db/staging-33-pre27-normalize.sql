-- PROPOSED; requires explicit same-Staging permission authorization before remote execution.
-- Administrative compatibility preflight, not migration-history repair. All checks precede all revokes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
declare e record; f record; actual_count integer;
begin
  if current_user <> 'postgres' then raise exception 'VPJ02_UNREVIEWED_MAINTENANCE_ROLE'; end if;
  if to_regnamespace('identity_private') is not null then raise exception 'VPJ02_ALREADY_UPGRADED'; end if;
  if exists((select version,name from supabase_migrations.schema_migrations except select * from (values ('20260824101500','v4_baseline'),('20260824104424','plat_conf_connection_probes'),('20260824104547','plat_conf_ops_probe'),('20260824105759','plat_conf_worker_probe_grant'),('20260825052328','ai14_actor_rls_fault_probes'),('20260825153534','ai14_reviewer_separation_probe'),('20260825153613','ai14_reviewer_select_probe'),('20260825160314','ai10_durable_trip_proposals'),('20260825160458','ai10_confirm_outcomes'),('20260825161535','ai10_confirm_fault_triggers'),('20260827030717','ai13b_proposal_revision_lineage'),('20260828153000','v4_08_durable_chat_threads'),('20260828160000','v4_09_chat_feedback'),('20260828170000','v4_10_trip_version_snapshots'),('20260828180000','v4_11_trip_place_references'),('20260828190000','v4_12_trip_action_references'),('20260828193000','v4_13_memory_profile'),('20260828194000','v4_15_memory_consumer_receipts'),('20260828200000','v4_16_user_profiles'),('20260828210000','v4_17_privacy_lifecycle'),('20260829191000','v4_14_server_minted_memory_consent'),('20260830100000','launch_03_trip_content_snapshots'),('20260830210000','launch_11_trip_proposal_patch'),('20260830211000','launch_11_trip_proposal_patch_revision'),('20260909033302','vpj_02_repair_local_rpc_runtime'),('20260909184816','vpj_59_durable_model_budget')) expected(version,name))
    union all (select * from (values ('20260824101500','v4_baseline'),('20260824104424','plat_conf_connection_probes'),('20260824104547','plat_conf_ops_probe'),('20260824105759','plat_conf_worker_probe_grant'),('20260825052328','ai14_actor_rls_fault_probes'),('20260825153534','ai14_reviewer_separation_probe'),('20260825153613','ai14_reviewer_select_probe'),('20260825160314','ai10_durable_trip_proposals'),('20260825160458','ai10_confirm_outcomes'),('20260825161535','ai10_confirm_fault_triggers'),('20260827030717','ai13b_proposal_revision_lineage'),('20260828153000','v4_08_durable_chat_threads'),('20260828160000','v4_09_chat_feedback'),('20260828170000','v4_10_trip_version_snapshots'),('20260828180000','v4_11_trip_place_references'),('20260828190000','v4_12_trip_action_references'),('20260828193000','v4_13_memory_profile'),('20260828194000','v4_15_memory_consumer_receipts'),('20260828200000','v4_16_user_profiles'),('20260828210000','v4_17_privacy_lifecycle'),('20260829191000','v4_14_server_minted_memory_consent'),('20260830100000','launch_03_trip_content_snapshots'),('20260830210000','launch_11_trip_proposal_patch'),('20260830211000','launch_11_trip_proposal_patch_revision'),('20260909033302','vpj_02_repair_local_rpc_runtime'),('20260909184816','vpj_59_durable_model_budget')) expected(version,name) except select version,name from supabase_migrations.schema_migrations))
    then raise exception 'VPJ02_MIGRATION26_MISMATCH'; end if;
  for e in select * from (values
    ('public.cancel_chat_turn(uuid)','1047fd7accd4b7d031caab4a67f49acb'),
    ('public.confirm_and_apply_trip_proposal(uuid, text, text)','2223a4a456f540165527a74c53227c20'),
    ('public.create_explicit_memory_profile(uuid, uuid, uuid, text, text)','fb56ebf5702edce2354a5e3da994de11'),
    ('public.create_memory_retrieval_consent()','096c3dff64c238aca0ab97fc59ab1e6b'),
    ('public.create_trip_proposal_patch(uuid, jsonb)','a1573ec20d80b9a7f325789a726aa9e1'),
    ('public.create_trip_rollback_proposal(uuid, integer)','a83551ae0bb597826ef9045d5b1438fc'),
    ('public.grant_memory_retrieval_consent(uuid)','59286a2b6580cce68d774cad65e4ca01'),
    ('public.record_turn_feedback(uuid, text, text)','12581f7a8040230dc69cae741e27717e'),
    ('public.request_privacy_action(uuid, text)','e85e9b071c7cda38295e0323b03ead9d'),
    ('public.revise_trip_proposal(uuid, text)','2fea11769e534fde8dd144da879c6e08'),
    ('public.revise_trip_proposal_patch(uuid, jsonb)','4393d84571ea21a626a04556d61d2141'),
    ('public.revoke_memory_retrieval_consent(uuid)','590a4ceb93e0cc7c05fa47d4688df80b'),
    ('public.save_user_profile(text, text, text, text, text, text, time without time zone)','deb86f1261ef54d7de33a7dcecfd85f4'),
    ('public.start_chat_turn(uuid, uuid, uuid, text)','48f5cc4d47632ba5c60c83d30788bf35'),
    ('public.transition_memory_profile(uuid, text)','a169637ebc8adf63a33134a42ebb6932')
  ) expected(signature,source_md5) loop
    select p.prosrc,p.prosecdef,p.oid into f from pg_proc p where p.oid=to_regprocedure(e.signature);
    if not found or not f.prosecdef or md5(f.prosrc)<>e.source_md5 or not has_function_privilege('authenticated',f.oid,'EXECUTE') then raise exception 'VPJ02_FROZEN_RPC_DRIFT'; end if;
  end loop;
  for e in select * from (values
    ('public.append_chat_turn_event(uuid,text,text,text)','87b75d363d22ee004c3d8a34da97ca60','record','{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.capture_initial_trip_version()','cd64e5a9c72ddc91461765abe18258f1','trigger','{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.rls_auto_enable()','99be20677b456ea8d3be47bdd44fb369','event_trigger','{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
  ) expected(signature,source_md5,return_type,acl) loop
    select p.oid,p.prosrc,p.prosecdef,p.prorettype::regtype::text as return_type,p.proacl::text as acl,r.rolname,l.lanname
      into f from pg_proc p join pg_roles r on r.oid=p.proowner join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(e.signature);
    if not found or not f.prosecdef or f.rolname<>'postgres' or f.lanname<>'plpgsql' or f.return_type<>e.return_type
      or md5(f.prosrc)<>e.source_md5 or (f.acl is null or not (f.acl::aclitem[] @> e.acl::aclitem[] and f.acl::aclitem[] <@ e.acl::aclitem[])) then raise exception 'VPJ02_EXTRA_RPC_DRIFT'; end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE'))<>18 then raise exception 'VPJ02_UNREVIEWED_DEFINER_INVENTORY'; end if;
end;
$preflight$;
revoke execute on function public.append_chat_turn_event(uuid,text,text,text) from public,anon,authenticated;
revoke execute on function public.capture_initial_trip_version() from public,anon,authenticated;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
do $verify$ begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE'))<>15 then raise exception 'VPJ02_NORMALIZATION_FAILED'; end if;
  if not has_function_privilege('service_role','public.append_chat_turn_event(uuid,text,text,text)','EXECUTE') or not has_function_privilege('postgres','public.append_chat_turn_event(uuid,text,text,text)','EXECUTE')
    or has_function_privilege('anon','public.append_chat_turn_event(uuid,text,text,text)','EXECUTE') or has_function_privilege('authenticated','public.append_chat_turn_event(uuid,text,text,text)','EXECUTE') then raise exception 'VPJ02_PRIVILEGE_POSTCONDITION'; end if;
  if not has_function_privilege('service_role','public.capture_initial_trip_version()','EXECUTE') or not has_function_privilege('postgres','public.capture_initial_trip_version()','EXECUTE')
    or has_function_privilege('anon','public.capture_initial_trip_version()','EXECUTE') or has_function_privilege('authenticated','public.capture_initial_trip_version()','EXECUTE') then raise exception 'VPJ02_PRIVILEGE_POSTCONDITION'; end if;
  if not has_function_privilege('service_role','public.rls_auto_enable()','EXECUTE') or not has_function_privilege('postgres','public.rls_auto_enable()','EXECUTE')
    or has_function_privilege('anon','public.rls_auto_enable()','EXECUTE') or has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE') then raise exception 'VPJ02_PRIVILEGE_POSTCONDITION'; end if;
end; $verify$;
commit;
