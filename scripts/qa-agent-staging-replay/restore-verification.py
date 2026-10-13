"""Content-free restore expectations. Never emits row values or role passwords."""
import hashlib
import json
import re


def quote(name):
    return '"'+name.replace('"','""')+'"'


def literal(value):
    return "'"+value.replace("'","''")+"'"


def counts_sql(relations):
    pairs=[]
    for r in sorted(relations,key=lambda r:(r['schema'],r['name'])):
        if r['kind'] in ('r','p','m'):
            pairs.extend([literal(r['schema']+'.'+r['name']),
                          '(select count(*) from '+quote(r['schema'])+'.'+quote(r['name'])+')'])
    # jsonb_build_object has a PostgreSQL argument bound; concatenate <=40 pairs.
    chunks=['jsonb_build_object('+','.join(pairs[n:n+80])+')' for n in range(0,len(pairs),80)]
    return 'select '+(' || '.join(chunks) or "'{}'::jsonb")+';'


def normalize_schema(sql):
    blocks=[]
    for block in re.split(r'(?=^-- Name:)',sql,flags=re.M):
        if not block.startswith('-- Name:'):continue
        lines=block.splitlines(); key=lines[0]
        body='\n'.join(line for line in lines[1:] if not re.match(r'^\\(?:un)?restrict [A-Za-z0-9]+$',line)
                       and line not in ('-- PostgreSQL database dump complete','--')).strip()
        if body:blocks.append((key,body))
    if not blocks or len({b[0] for b in blocks})!=len(blocks):raise ValueError('SCHEMA_BLOCKS_INVALID')
    return sorted(blocks)


def fingerprint(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def role_snapshot(metadata, extra_role=None):
    roles=[r for r in metadata['roles'] if r['name']!=extra_role]
    memberships=[r for r in (metadata['memberships'] or []) if r['role']!=extra_role and r['member']!=extra_role]
    return {'roles':sorted(roles,key=lambda r:r['name']),
            'memberships':sorted(memberships,key=lambda r:(r['role'],r['member']))}
