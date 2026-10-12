"""Final static installed-source guard for the exact own verified candidate."""
import json
from pathlib import Path
OUT=Path(__file__).resolve().parent
ALL=json.loads((OUT/'catalog-after-guards.json').read_text())
rels=json.loads((OUT/'installed-table-pins.json').read_text())
external={x['signature'] for x in json.loads((OUT/'shared-candidates/manifest.json').read_text())}
external|={x['signature'] for x in json.loads((OUT/'guard-candidates/manifest.json').read_text())}
external|={'knowledge_review_private.current_actor()','identity_private.guard_mobile_rpc_v2()',
 'identity_private.mobile_access_v2()','turn_private.lock_turn(uuid,uuid,uuid)',
 'turn_private.lock_text_work(uuid,uuid)','public.read_grounded_ai_assist_context_v1(uuid)'}
expected={x['signature']:x for x in ALL if x['signature'].startswith('ops_control_private.')
 or x['signature']=='public.ops_control_operations_v1(jsonb)' or x['signature'] in external}
expected.pop('ops_control_private.installed_supported_v1()',None)
count=sum(x['signature'].startswith('ops_control_private.') and x['signature']!='ops_control_private.installed_supported_v1()' for x in ALL)+1
tables={x['relation']:x for x in rels if x['relation'].startswith('ops_control_private.')
 or x['relation'] in{'public.model_budget_scopes','public.model_budget_provider_limits',
 'public.model_budget_attempts','turn_private.work'}}
quote=lambda v:json.dumps(v,separators=(',',':')).replace("'","''")
source="""create function ops_control_private.installed_supported_v1() returns boolean
language plpgsql stable security definer set search_path='' as $installed$
declare spec record;p pg_proc;actual_n jsonb;begin
 if(select count(*) from pg_proc f join pg_namespace n on n.oid=f.pronamespace
  where n.nspname='ops_control_private')<>%s then return false;end if;
 for spec in select key,value from jsonb_each('%s'::jsonb) loop
  if to_regprocedure(spec.key) is null then return false;end if;
  select * into p from pg_proc where oid=spec.key::regprocedure;
  select jsonb_build_object('signature',spec.key,'definition',pg_get_functiondef(p.oid),'prosrc',p.prosrc,
   'identity',pg_get_function_identity_arguments(p.oid),'arguments',pg_get_function_arguments(p.oid),
   'result',pg_get_function_result(p.oid),'config',p.proconfig,'owner',pg_get_userbyid(p.proowner),
   'acl',p.proacl::text,'securityDefiner',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,
   'parallel',p.proparallel,'kind',p.prokind,'language',(select lanname from pg_language where oid=p.prolang),
   'md5',md5(pg_get_functiondef(p.oid))) into actual_n;
  if actual_n is distinct from spec.value then return false;end if;
 end loop;
 for spec in select key,value from jsonb_each('%s'::jsonb) loop
  if to_regclass(spec.key) is null then return false;end if;
  select jsonb_build_object('relation',spec.key,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
   'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid)) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
   'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',pol.polname,'command',pol.polcmd,'permissive',pol.polpermissive,'roles',pol.polroles::text,'using',pg_get_expr(pol.polqual,pol.polrelid),'check',pg_get_expr(pol.polwithcheck,pol.polrelid)) order by pol.polname),'[]') from pg_policy pol where pol.polrelid=c.oid),
   'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled::text,t.tgfoid::regprocedure::text) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal))
   into actual_n from pg_class c where c.oid=spec.key::regclass;
  if actual_n is distinct from spec.value then return false;end if;
 end loop;
 -- Managed Auth layout stays owned by the existing infrastructure checker. Only
 -- the exact newly added hook is pinned here; no fixture-only Auth table shape.
 if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass
  and tgname='ops_control_actor_erasure_v1' and tgenabled='O'
  and pg_get_triggerdef(oid)='CREATE TRIGGER ops_control_actor_erasure_v1 BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION ops_control_private.erase_actor_v1()') then return false;end if;
 return profile_data_private.schema_v1() and conversation_data_private.schema_supported_v1()
  and result_data_private.schema_supported_v1() and turn_data_private.schema_supported_v1()
  and turn_data_private.runtime_supported_v1() and turn_data_private.write_hooks_valid_v1()
  and turn_data_private.hooks_valid_v1() and export_private.profile_hooks_valid_v1();
end $installed$;
revoke all on function ops_control_private.installed_supported_v1() from public,anon,authenticated,service_role;
"""%(count,quote(expected),quote(tables))
(OUT/'installed-guard.candidate.sql').write_text(source)
(OUT/'installed-source-pins.json').write_text(json.dumps({'privateFunctionCountIncludingGuard':count,
 'functions':expected,'tables':tables,'source':'Exact own after guard catalog; static before product review',
 'managedAuth':'Original checker plus exact new hook; no fixture layout pin'},indent=2)+'\n')
print(json.dumps({'privateFunctionCount':count,'pinnedFunctions':len(expected),'pinnedTables':len(tables)}))
