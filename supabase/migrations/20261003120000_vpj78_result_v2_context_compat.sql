-- #560 batch compatibility; preserve applied090 and result-domain110 ownership.
-- Exact v2 domain reader owns all five type qualification/current/historical rules.
do $$
declare definition text;old_fragment text;new_fragment text;
begin
 if to_regprocedure('public.read_result_artifact_v2(uuid,integer)') is null then raise exception 'RESULT_V2_DOMAIN_DEPENDENCY_MISSING';end if;
 definition:=pg_get_functiondef('turn_private.qualify_assistant_selected_sources_v2(uuid,jsonb,text,boolean)'::regprocedure);
 old_fragment:='if artifact.proposal_id is null then r:=public.read_result_artifacts_v1(artifact.id,artifact.current_revision);else r:=public.read_change_proposal_reference_v1(artifact.id,artifact.current_revision);end if;';
 new_fragment:='r:=public.read_result_artifact_v2(artifact.id,artifact.current_revision);';
 if strpos(definition,old_fragment)=0 then raise exception 'SELECTED_SOURCE_QUALIFIER_BODY_UNEXPECTED';end if;
 execute replace(definition,old_fragment,new_fragment);
 definition:=pg_get_functiondef('public.read_assistant_message_sources_v2(uuid,uuid,uuid,uuid,integer)'::regprocedure);
 old_fragment:='if coalesce((captured->''artifact''->>''proposal'')::boolean,false) then art:=public.read_change_proposal_reference_v1((input_refs->''artifact''->>''artifactId'')::uuid,(input_refs->''artifact''->>''revision'')::integer);else art:=public.read_result_artifacts_v1((input_refs->''artifact''->>''artifactId'')::uuid,(input_refs->''artifact''->>''revision'')::integer);end if;';
 new_fragment:='art:=public.read_result_artifact_v2((input_refs->''artifact''->>''artifactId'')::uuid,(input_refs->''artifact''->>''revision'')::integer);';
 if strpos(definition,old_fragment)=0 then raise exception 'SELECTED_SOURCE_CONTEXT_BODY_UNEXPECTED';end if;
 execute replace(definition,old_fragment,new_fragment);
end $$;
-- CREATE OR REPLACE preserves originalACL; repeat boundaries explicitly.
revoke all on function turn_private.qualify_assistant_selected_sources_v2(uuid,jsonb,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.read_assistant_message_sources_v2(uuid,uuid,uuid,uuid,integer) from public,anon,service_role;
grant execute on function public.read_assistant_message_sources_v2(uuid,uuid,uuid,uuid,integer) to authenticated;
notify pgrst,'reload schema';
