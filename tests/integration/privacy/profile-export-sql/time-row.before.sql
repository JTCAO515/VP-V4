CREATE OR REPLACE FUNCTION export_private.profile_row_valid_v1(v jsonb, u uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$declare p jsonb;s jsonb;req jsonb;undo_n jsonb;mask jsonb;present jsonb;begin
 if notification_private.exact(v,array['ownerId','profile','summary','savedFields','createdAt','updatedAt']) is not true or v->>'ownerId' is distinct from u::text then return false;end if;
 p:=v->'profile';s:=v->'summary';req:=p->'paceRequest';undo_n:=p->'paceUndo';
 if notification_private.exact(p,array['displayName','travelPace','locale','currency','distanceUnit','temperatureUnit','defaultDepartureTime','paceNotice','paceOperation','paceRequest','paceUndo']) is not true
  or export_private.profile_summary_valid_v1(s) is not true or jsonb_typeof(v->'savedFields') is distinct from 'array'
  or jsonb_typeof(v->'createdAt') is distinct from 'string' or jsonb_typeof(v->'updatedAt') is distinct from 'string'
  or v->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$' or v->>'updatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'
  or (v->>'createdAt')::timestamptz>(v->>'updatedAt')::timestamptz then return false;end if;
 select coalesce(jsonb_agg(value order by ord),'[]') into mask from jsonb_array_elements('["display_name","travel_pace","locale","currency","distance_unit","temperature_unit","default_departure_time"]') with ordinality f(value,ord) where v->'savedFields' ? (value#>>'{}');
 if mask is distinct from v->'savedFields' then return false;end if;
 present:=mask||case when p->'paceNotice'<>'null' then '["pace_notice"]'::jsonb else '[]'::jsonb end||case when p->'paceOperation'<>'null' then '["pace_operation"]'::jsonb else '[]'::jsonb end||case when req<>'null' then '["pace_request"]'::jsonb else '[]'::jsonb end||case when undo_n<>'null' then '["pace_undo"]'::jsonb else '[]'::jsonb end;
 if s->'presentFields' is distinct from present or s->'hasPaceRequest' is distinct from to_jsonb(req<>'null') or s->'hasPaceUndo' is distinct from to_jsonb(undo_n<>'null') then return false;end if;
 if coalesce((p->'displayName'='null' or jsonb_typeof(p->'displayName')='string' and char_length(p->>'displayName') between 1 and 80)
  and p->>'travelPace' in('relaxed','balanced','packed') and p->>'locale' in('zh','en','es','ru','ar') and p->>'currency' in('CNY','USD','EUR','RUB','SAR')
  and p->>'distanceUnit' in('kilometre','mile') and p->>'temperatureUnit' in('celsius','fahrenheit') and jsonb_typeof(p->'defaultDepartureTime')='string'
  and p->>'defaultDepartureTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?$'
  and (case when s->>'paceState' in('explicit','paused') then p->>'paceNotice'='local-planning-cross-trip-v1' else p->'paceNotice'='null' end)
  and (p->'paceOperation'='null' or notification_private.uuid(p->'paceOperation')) and (req='null')=(p->'paceOperation'='null'),false) is not true then return false;end if;
 if req<>'null' then
  if notification_private.exact(req,case when req->>'action'='save' then array['action','operationId','expectedRevision','travelPace','noticeVersion'] else array['action','operationId','expectedRevision'] end) is not true
   or jsonb_typeof(req->'operationId') is distinct from 'string' or req->>'operationId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or lower(req->>'operationId') is distinct from p->>'paceOperation' or export_private.profile_natural_v1(req->'expectedRevision',9007199254740990) is not true
   or (req->>'expectedRevision')::numeric+1<>(s->>'paceRevision')::numeric or coalesce(req->>'action' in('save','pause','revoke','undo'),false) is not true
   or req->>'action'='save' and coalesce(req->>'travelPace' in('relaxed','balanced','packed') and req->>'noticeVersion'='local-planning-cross-trip-v1',false) is not true then return false;end if;
 end if;
 if undo_n<>'null' then
  if req->>'action' is distinct from 'save' or notification_private.exact(undo_n,array['travelPace','state','noticeVersion']) is not true
   or coalesce(undo_n->>'travelPace' in('relaxed','balanced','packed') and undo_n->>'state' in('unset','explicit','paused','revoked')
    and (undo_n->'noticeVersion'='null' or undo_n->>'noticeVersion'='local-planning-cross-trip-v1')
    and (undo_n->>'state' not in('explicit','paused') or undo_n->>'noticeVersion'='local-planning-cross-trip-v1'),false) is not true then return false;end if;
 end if;return true;
exception when others then return false;end$function$
