CREATE OR REPLACE FUNCTION export_private.profile_decision_valid_v1(v jsonb, s text, c bigint, e bigint, now_n bigint, selected integer)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$declare k text;begin
 if notification_private.exact(v,array['requestDigest','decidedAt','beforeProfileRevision','afterProfileRevision','beforePaceRevision','afterPaceRevision','erasedFields','briefCasesInvalidated','retainedCopies','clearedPreviews','retainedFences','sourceProfile','paceConsent','account','sourceTrip','explicitMemory','financialProvider','externalCopies']) is not true
  or jsonb_typeof(v->'requestDigest') is distinct from 'string' or v->>'requestDigest' !~ '^[a-f0-9]{64}$'
  or export_private.profile_natural_v1(v->'decidedAt') is not true or (v->>'decidedAt')::numeric<c or (v->>'decidedAt')::numeric>=e or (v->>'decidedAt')::numeric>now_n
  or export_private.profile_ids_v1(v->'briefCasesInvalidated') is not true or export_private.profile_copies_valid_v1(v->'retainedCopies') is not true
  or export_private.profile_natural_v1(v->'clearedPreviews') is not true or export_private.profile_natural_v1(v->'retainedFences') is not true
  or v->>'account' is distinct from 'not_modified' or v->>'sourceTrip' is distinct from 'not_modified' or v->>'explicitMemory' is distinct from 'not_modified'
  or v->>'financialProvider' is distinct from 'not_modified' or v->>'externalCopies' is distinct from 'not_erased' then return false;end if;
 if s='profile-sensitive-data/1' then
  foreach k in array array['beforeProfileRevision','afterProfileRevision','beforePaceRevision','afterPaceRevision'] loop if export_private.profile_natural_v1(v->k,9007199254740990) is not true then return false;end if;end loop;
  return coalesce(v->>'sourceProfile'='cleared' and v->>'paceConsent'='revoked' and (v->>'afterProfileRevision')::numeric=(v->>'beforeProfileRevision')::numeric+1
   and (v->>'afterPaceRevision')::numeric=(v->>'beforePaceRevision')::numeric+1 and v->'erasedFields'=profile_data_private.boundaries_v1(s)->'eraseFields'
   and v->'clearedPreviews'='0' and v->'retainedFences'='1' and v->'retainedCopies'->'briefPreviews'='[]' and v->'retainedCopies'->'sharedBriefs'='[]',false);
 end if;
 return coalesce(s='profile-delete-progress/1' and v->>'sourceProfile'='not_modified' and v->>'paceConsent'='not_modified'
  and v->'beforeProfileRevision'='null' and v->'afterProfileRevision'='null' and v->'beforePaceRevision'='null' and v->'afterPaceRevision'='null'
  and v->'erasedFields'='[]' and v->'briefCasesInvalidated'='[]' and v->'retainedCopies'=profile_data_private.empty_copies_v1()
  and (v->>'clearedPreviews')::numeric<=selected and (v->>'retainedFences')::numeric=selected,false);
exception when others then return false;end$function$

