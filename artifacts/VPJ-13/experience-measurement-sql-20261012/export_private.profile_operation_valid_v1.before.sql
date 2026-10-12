CREATE OR REPLACE FUNCTION export_private.profile_operation_valid_v1(v jsonb, u uuid, now_n bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$declare s text;c bigint;e bigint;selected integer;begin
 if notification_private.exact(v,array['requestId','ownerId','sessionId','mobileEpoch','scope','profileId','objectIds','sourceDigest','previewDigest','capturedAt','expiresAt','requestDigest','state','previewErased','summary','copies','conflicts','decision']) is not true
  or notification_private.uuid(v->'requestId') is not true or v->>'ownerId' is distinct from u::text or notification_private.uuid(v->'sessionId') is not true
  or export_private.profile_natural_v1(v->'mobileEpoch') is not true or v->'mobileEpoch'='0'
  or export_private.profile_natural_v1(v->'capturedAt') is not true or v->'capturedAt'='0' or (v->>'capturedAt')::numeric>now_n
  or export_private.profile_natural_v1(v->'expiresAt') is not true or jsonb_typeof(v->'sourceDigest') is distinct from 'string' or v->>'sourceDigest' !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(v->'previewDigest') is distinct from 'string' or v->>'previewDigest' !~ '^[a-f0-9]{64}$'
  or coalesce(v->>'state' in('previewed','erased'),false) is not true or jsonb_typeof(v->'previewErased') is distinct from 'boolean' then return false;end if;
 c:=(v->>'capturedAt')::bigint;e:=(v->>'expiresAt')::bigint;s:=v->>'scope';
 if e<>c+30000 then return false;end if;
 if s='profile-sensitive-data/1' then
  if v->>'profileId' is distinct from u::text or v->'objectIds' is distinct from '[]'::jsonb then return false;end if;
 elsif s='profile-delete-progress/1' then
  if v->'profileId' is distinct from 'null'::jsonb or export_private.profile_ids_v1(v->'objectIds',20) is not true or jsonb_array_length(v->'objectIds')<1 or v->'objectIds' ? (v->>'requestId') then return false;end if;
 else return false;end if;
 selected:=jsonb_array_length(v->'objectIds');
 if v->'previewErased'='true' then
  if v->'summary' is distinct from 'null'::jsonb or v->'copies' is distinct from 'null'::jsonb or v->'conflicts' is distinct from 'null'::jsonb then return false;end if;
 else
  if (s='profile-sensitive-data/1' and export_private.profile_summary_valid_v1(v->'summary') is not true) or (s='profile-delete-progress/1' and v->'summary' is distinct from 'null'::jsonb)
   or export_private.profile_copies_valid_v1(v->'copies') is not true or export_private.profile_conflicts_valid_v1(v->'conflicts') is not true
   or s='profile-delete-progress/1' and v->'copies' is distinct from profile_data_private.empty_copies_v1() then return false;end if;
 end if;
 if v->>'state'='previewed' then return v->'requestDigest'='null' and v->'decision'='null';end if;
 return coalesce(v->'previewErased'='true' and jsonb_typeof(v->'requestDigest')='string' and v->>'requestDigest' ~ '^[a-f0-9]{64}$'
  and export_private.profile_decision_valid_v1(v->'decision',s,c,e,now_n,selected) and v->'decision'->>'requestDigest'=v->>'requestDigest',false);
exception when others then return false;end$function$

