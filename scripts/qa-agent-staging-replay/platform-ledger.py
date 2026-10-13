"""Candidate supplement for observed Realtime ledger; never authorizes capture.
Only metadata/COUNT was read on target. The89 source rows are still unread and
must later flow directly into age under explicit incremental authorization.
"""
import re

RELATION='realtime.schema_migrations'
ARCHIVE='platform-ledger.dump.age.partial'
COUNT=89
ACTION='capture-realtime-schema-migrations-ledger'
COLUMNS=[{'name':'version','type':'bigint'},
         {'name':'inserted_at','type':'timestamp(0) without time zone'}]
EXPECTED={
    'realtime.messages':('p','supabase_realtime_admin'),
    'realtime.schema_migrations':('r','supabase_admin'),
    'realtime.subscription':('r','supabase_realtime_admin'),
    'vault.secrets':('r','supabase_admin'),
}


def validate(counts,relations):
    if not isinstance(counts,dict) or set(counts)!=set(EXPECTED):raise ValueError('PLATFORM_RELATION_SET_CHANGED')
    if counts[RELATION]!=COUNT:raise ValueError('PLATFORM_LEDGER_COUNT_CHANGED')
    if any(value!=0 for name,value in counts.items() if name!=RELATION):raise ValueError('UNCOVERED_PLATFORM_DATA_NOT_EMPTY')
    validate_relations(relations)


def validate_relations(relations):
    found={r['schema']+'.'+r['name']:r for r in relations}
    if set(found)!=set(EXPECTED):raise ValueError('PLATFORM_RELATION_SET_CHANGED')
    for name,(kind,owner) in EXPECTED.items():
        if found[name].get('kind')!=kind or found[name].get('owner')!=owner:raise ValueError('PLATFORM_RELATION_PROFILE_CHANGED')
    if found[RELATION].get('columns')!=COLUMNS:raise ValueError('PLATFORM_LEDGER_COLUMNS_CHANGED')


def descriptor(digest):
    if not re.fullmatch('[0-9a-f]{64}',digest):raise ValueError('PLATFORM_LEDGER_DIGEST_INVALID')
    return {'relation':RELATION,'archiveFile':ARCHIVE,'rowCount':COUNT,
            'columns':COLUMNS,'owner':'supabase_admin','sha256Rows':digest}


def validate_descriptor(supplement):
    if not isinstance(supplement,dict) or supplement!=descriptor(supplement.get('sha256Rows','')):
        raise ValueError('PLATFORM_LEDGER_SUPPLEMENT_REQUIRED')


def digest_sql():
    # Runs only in a future approved copy/restore, never in this turn's target COUNT.
    return "select encode(sha256(convert_to(coalesce(string_agg(jsonb_build_array(version,inserted_at)::text,E'\\n' order by version),''),'UTF8')),'hex') from realtime.schema_migrations;"


def validate_toc(toc):
    data=[line for line in toc.splitlines() if re.match(r'^\d+; .* (?:TABLE DATA|MATERIALIZED VIEW DATA|SEQUENCE SET|BLOB|BLOBS) ',line)]
    if len(data)!=1 or 'TABLE DATA realtime schema_migrations supabase_admin' not in data[0]:
        raise ValueError('PLATFORM_LEDGER_TOC_CONFLICT')
