CREATE OR REPLACE FUNCTION export_private.profile_summary_valid_v1(v jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$declare expected jsonb;begin
 if notification_private.exact(v,array['profileRevision','paceRevision','profileErasureFloor','paceErasureFloor','paceState','presentFields','hasPaceRequest','hasPaceUndo']) is not true
  or jsonb_typeof(v->'presentFields') is distinct from 'array' then return false;end if;
 select coalesce(jsonb_agg(value order by ord),'[]') into expected from jsonb_array_elements(profile_data_private.boundaries_v1('profile-sensitive-data/1')->'eraseFields') with ordinality f(value,ord) where v->'presentFields' ? (value#>>'{}');
 return coalesce(v->'presentFields'=expected and export_private.profile_natural_v1(v->'profileRevision',9007199254740990)
  and export_private.profile_natural_v1(v->'paceRevision',9007199254740990) and export_private.profile_natural_v1(v->'profileErasureFloor',9007199254740990)
  and export_private.profile_natural_v1(v->'paceErasureFloor',9007199254740990)
  and (v->>'profileErasureFloor')::numeric<=(v->>'profileRevision')::numeric and (v->>'paceErasureFloor')::numeric<=(v->>'paceRevision')::numeric
  and v->>'paceState' in('unset','explicit','paused','revoked') and jsonb_typeof(v->'hasPaceRequest')='boolean' and jsonb_typeof(v->'hasPaceUndo')='boolean',false);
exception when others then return false;end$function$

