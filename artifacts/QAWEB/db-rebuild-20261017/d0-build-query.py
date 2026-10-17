"""Build finite catalog-only query; never connect to a database."""
import json, subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
PIN='7f0352ac99affbb00c67e77ca1ff1b7196b769af'
def fixed(path):
 return subprocess.check_output(['git','show',PIN+':scripts/qa-agent-db-baseline/'+path])
objects=[{'kind':o['kind'],'name':o['name']} for o in json.loads(fixed('reuse-map.json'))['sourceObjects']]
assert len(objects)==77 and len({o['name'] for o in objects})==77
assert all('public.'+p['name'] in {o['name'] for o in objects} for p in json.loads(fixed('port-coverage.json'))['ports'])
objects += [{'kind':'table','name':'auth.'+n} for n in ('users','sessions')]+[{'kind':'function','name':'auth.'+n} for n in ('uid','jwt','role')]
values=','.join("('%s','%s','%s')"%(o['kind'],*o['name'].split('.')) for o in objects)
query="""BEGIN READ ONLY;
WITH wanted(kind,ns,name) AS (VALUES VALUES_LIST), objects AS (
SELECT w.kind,w.ns||'.'||w.name AS name,
CASE WHEN w.kind='function' THEN (
 SELECT jsonb_agg(jsonb_build_object(
 'signature',pg_catalog.pg_get_function_identity_arguments(p.oid),
 'argumentNames',p.proargnames,'result',pg_catalog.pg_get_function_result(p.oid),
 'owner',pg_catalog.pg_get_userbyid(p.proowner),'language',l.lanname,
 'kind',p.prokind,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
 'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,
 'bodyHash',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
 'binaryHash',encode(sha256(convert_to(p.probin,'UTF8')),'hex'),
 'defaultsHash',encode(sha256(convert_to(pg_catalog.pg_get_expr(p.proargdefaults,0),'UTF8')),'hex'),
 'searchPath',(select jsonb_agg(x order by x) from unnest(p.proconfig) x where x like 'search_path=%'),
 'acl',(select jsonb_agg(jsonb_build_array(case when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end,pg_catalog.pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) order by a.grantee,a.grantor,a.privilege_type) from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a)
 ) order by pg_catalog.pg_get_function_identity_arguments(p.oid))
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE n.nspname=w.ns AND p.proname=w.name
) ELSE (
 SELECT jsonb_agg(jsonb_build_object(
 'kind',c.relkind,'owner',pg_catalog.pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'acl',(select jsonb_agg(jsonb_build_array(case when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end,pg_catalog.pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) order by a.grantee,a.grantor,a.privilege_type) from pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a),
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'ordinal',a.attnum,'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'defaultHash',encode(sha256(convert_to(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'UTF8')),'hex'),'acl',a.attacl::text) order by a.attnum) from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(jsonb_build_object('name',k.conname,'type',k.contype,'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred,'definitionHash',encode(sha256(convert_to(pg_catalog.pg_get_constraintdef(k.oid),'UTF8')),'hex')) order by k.conname) from pg_catalog.pg_constraint k where k.conrelid=c.oid),
 'policies',(select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(select jsonb_agg(case when r=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(r) end order by r) from unnest(p.polroles) r),'qualHash',encode(sha256(convert_to(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'UTF8')),'hex'),'checkHash',encode(sha256(convert_to(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'UTF8')),'hex')) order by p.polname) from pg_catalog.pg_policy p where p.polrelid=c.oid),
 'triggers',(select jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'internal',t.tgisinternal,'definitionHash',encode(sha256(convert_to(pg_catalog.pg_get_triggerdef(t.oid),'UTF8')),'hex')) order by t.tgname) from pg_catalog.pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
 'indexes',(select jsonb_agg(jsonb_build_object('name',ic.relname,'valid',i.indisvalid,'ready',i.indisready,'definitionHash',encode(sha256(convert_to(pg_catalog.pg_get_indexdef(i.indexrelid),'UTF8')),'hex')) order by ic.relname) from pg_catalog.pg_index i join pg_catalog.pg_class ic on ic.oid=i.indexrelid where i.indrelid=c.oid)
 )) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=w.ns AND c.relname=w.name
) END AS definitions FROM wanted w
)
SELECT jsonb_build_object('transactionReadOnly',current_setting('transaction_read_only'),'serverVersion',current_setting('server_version'),'observedAtUTC',to_char(current_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'objects',(select jsonb_agg(to_jsonb(o) order by o.name) from objects o),'ledger',(select jsonb_build_object('exists',true,'canSelect',pg_catalog.has_table_privilege(current_user,c.oid,'SELECT')) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='supabase_migrations' and c.relname='schema_migrations')) AS snapshot;
ROLLBACK;
""".replace('VALUES_LIST',values)
(HERE/'d0-catalog.sql').write_text(query)
(HERE/'d0-allowlist.json').write_text(json.dumps({'source':PIN,'objects':objects},indent=2)+'\n')
print(json.dumps({'objects':len(objects),'queryBytes':len(query),'businessRpcCalls':0,'applicationTableReads':0}))
