# #629 reviewed authenticated function ACL oracle update

2026-10-03. Originalhead5b3 CI job111113126397 failed exactauthenticatedlist because two intentionallyGRANTed/reviewed ordinaryv6functions were absent from the testoracle. Original21PASS/2FAIL (one nested parentfailure) retained in original-fail-summary andimmutableGitHublog; not erased, not a permissions relaxation.

Only add exact public.read_assistant_message_sources_v2(uuid,uuid,uuid,uuid,integer) and public.submit_assistant_message_sources_v2(uuid,uuid,uuid,uuid,text,text,text,uuid,integer,uuid,uuid,uuid,jsonb) to AUTHENTICATED list. No regex/schema/anon/private/service broadgrants. Existing service export has no globalserviceallowlist in this test, so add its exactexisting [anonfalse/authfalse/servicetrue] assertion plus allAPI-private-table denial. Migration/ACL/sourceproduction logic unchanged.

PASS affected actualfunctionACLfile11/11,0skip1422ms onnewowneddisposableSupabasestack with allactualcheckoutmigrations; schema/functionroles/notarget changed. Onlythisfile run, nofullRLSmatrix rerun. Stackcleanedbyexistingrunnerafterhook, no provider/fees/native/120branchchanges. DiffPASS. FormalnewheadCI/Mainreview remains separate. #559 staysClosed.
