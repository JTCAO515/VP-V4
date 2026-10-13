"""Exact five-extension bootstrap, only for a newly created owned offline cluster.
Source: previously authorized target catalog metadata, not user rows. No generic
extension allowlist, permission suppression or target-role operation exists.
"""
import re

EXTENSIONS=[
    {'name':'pg_stat_statements','version':'1.11','schema':'extensions','owner':'postgres'},
    {'name':'pgcrypto','version':'1.3','schema':'extensions','owner':'postgres'},
    {'name':'plpgsql','version':'1.0','schema':'pg_catalog','owner':'supabase_admin'},
    {'name':'supabase_vault','version':'0.3.1','schema':'vault','owner':'supabase_admin'},
    {'name':'uuid-ossp','version':'1.1','schema':'extensions','owner':'postgres'},
]


def classify(expected):
    extensions=expected['metadata']['extensions']
    if len(extensions)==1 and extensions[0]['name']=='plpgsql' and extensions[0]['version']=='1.0':
        return 'builtin-plpgsql/1'
    if sorted(extensions,key=lambda e:e['name'])!=EXTENSIONS or expected.get('bootstrapRole')!='supabase_admin':
        raise ValueError('MANAGED_EXTENSION_PROFILE_CONFLICT')
    roles={r['name']:r for r in expected['metadata']['roles']}
    if not roles['supabase_admin']['superuser'] or roles['postgres']['superuser']:
        raise ValueError('MANAGED_ROLE_PROFILE_CONFLICT')
    return 'supabase-17.6.1.155-five-extensions/1'


def prepare(db,expected,quote,literal):
    profile=classify(expected)
    if profile=='builtin-plpgsql/1':return set()
    if not db.created or db.admin!='supabase_admin':raise ValueError('OWN_MANAGED_BOOTSTRAP_REQUIRED')
    roles={r['name']:r for r in expected['metadata']['roles']}
    schemas={s['schema']:s for s in expected['metadata']['schema_acl']}
    prepared=set()
    for name in ('extensions','vault'):
        if name not in schemas:raise ValueError('MANAGED_SCHEMA_OWNER_MISSING')
        db.sql('create schema '+quote(name)+' authorization '+quote(schemas[name]['owner'])+';')
        prepared.add(name)
    for e in EXTENSIONS:
        if e['name']=='plpgsql':continue
        # This is solely the disposable no-network bootstrap. Temporarily allow
        # the archived owner to install its extension, then restore original
        # privilege in the SAME transaction before any application data restore.
        owner=e['owner']; elevated=not roles[owner]['superuser']
        sql='begin;'
        if elevated:sql+='alter role '+quote(owner)+' superuser;'
        sql+='set local role '+quote(owner)+';create extension '+quote(e['name'])+' with schema '+quote(e['schema'])+' version '+literal(e['version'])+';reset role;'
        if elevated:sql+='alter role '+quote(owner)+' nosuperuser;'
        sql+='commit;'
        db.sql(sql)
    return prepared


def predata_list(toc,prepared_schemas):
    # All other entries, comments, ACLs, memberships and errors remain intact.
    # Exact known CREATE schema/extension entries are already constructed above
    # with archived owner, version and original final role privileges.
    extensions={e['name'] for e in EXTENSIONS if e['name']!='plpgsql'}
    lines=[];skipped=[]
    for line in toc.splitlines():
        match=re.match(r'^\d+; \d+ \d+ (SCHEMA|EXTENSION) - ([a-zA-Z_0-9-]+) ',line)
        if match and ((match[1]=='SCHEMA' and match[2] in prepared_schemas) or
                      (match[1]=='EXTENSION' and prepared_schemas and match[2] in extensions)):
            lines.append('; explicitly precreated '+line);skipped.append(match[1]+':'+match[2])
        else:lines.append(line)
    if prepared_schemas and not {'SCHEMA:extensions','SCHEMA:vault'}.issubset(skipped):
        raise ValueError('MANAGED_SCHEMA_TOC_CONFLICT')
    return '\n'.join(lines)+'\n',skipped
