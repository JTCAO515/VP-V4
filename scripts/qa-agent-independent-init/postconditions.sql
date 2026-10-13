-- CONTENT-FREE READ ONLY, after exact reviewed migration set on new target.
select jsonb_build_object(
 'gates',jsonb_build_object(
 'profile_data_private.schema_v1',profile_data_private.schema_v1(),
 'turn_data_private.hooks_valid_v1',turn_data_private.hooks_valid_v1(),
 'export_private.profile_hooks_valid_v1',export_private.profile_hooks_valid_v1(),
 'turn_data_private.schema_supported_v1',turn_data_private.schema_supported_v1(),
 'turn_data_private.runtime_supported_v1',turn_data_private.runtime_supported_v1(),
 'turn_data_private.write_hooks_valid_v1',turn_data_private.write_hooks_valid_v1(),
 'result_data_private.schema_supported_v1',result_data_private.schema_supported_v1(),
 'turn_private.directions_schema_members_v1',turn_private.directions_schema_members_v1(),
 'conversation_data_private.schema_supported_v1',conversation_data_private.schema_supported_v1(),
 'result_data_private.infrastructure_supported_v1',result_data_private.infrastructure_supported_v1()),
 'qaV2Acl',jsonb_build_object('signature','public.qa_ready_groups_v2(integer,text,text,text)',
 'serviceRole',has_function_privilege('service_role','public.qa_ready_groups_v2(integer,text,text,text)','execute'),
 'anon',has_function_privilege('anon','public.qa_ready_groups_v2(integer,text,text,text)','execute'),
 'authenticated',has_function_privilege('authenticated','public.qa_ready_groups_v2(integer,text,text,text)','execute'),
 'public',(select coalesce(bool_or(grantee=0 and privilege_type='EXECUTE'),false) from aclexplode((select proacl from pg_proc where oid='public.qa_ready_groups_v2(integer,text,text,text)'::regprocedure)))),
 'originalLifecycle',jsonb_build_object(
 'turnExport',to_regprocedure('turn_data_private.export_source_v1(uuid)') is not null,
 'turnDelete',to_regprocedure('public.privacy_turn_data_v1(text,text,bigint)') is not null,
 'conversationDelete',to_regprocedure('public.privacy_conversation_data_v1(text,text,bigint)') is not null),
 'unactivated',jsonb_build_object('authUsers',(select count(*) from auth.users),'authSessions',(select count(*) from auth.sessions),
 'textPolicies',(select count(*) from turn_private.text_policies),'textConsents',(select count(*) from turn_private.text_consents),
 'budgetScopes',(select count(*) from public.model_budget_scopes),'budgetAttempts',(select count(*) from public.model_budget_attempts),
 'hostedEnabled',(select enabled from turn_private.hosted_worker_control where singleton)));
