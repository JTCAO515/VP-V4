"""Scheme B: snapshot expectations, independently stable catalog and sequence safety."""
import importlib.util
import json
from pathlib import Path
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('capture',HERE/'controlled-backup.py')
capture=importlib.util.module_from_spec(spec);spec.loader.exec_module(capture)
verify=capture.verification


def metadata_sql():
    sql=(HERE/'metadata-probe.sql').read_text()
    sql=sql[sql.index('select jsonb_build_object('):sql.rindex('rollback;')]
    return sql.replace(" 'session_user'"," 'storage_objects',(select count(*) from storage.objects),'storage_buckets',(select count(*) from storage.buckets),'versions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),\n 'session_user'",1)


def catalog(metadata):
    # No application-table contents or session/SSL state: DML may proceed.
    keys=['versions','schemas','schema_acl','roles','memberships','default_acl','relations','platform_relations','function_acl','extensions','event_triggers']
    return {k:metadata[k] for k in keys}


def assert_catalog_stable(before,after):
    if catalog(before)!=catalog(after):raise ValueError('SNAPSHOT_CATALOG_BOUNDARY_CHANGED')


def expectations(exporter,metadata):
    capture.platform_ledger.validate_relations(metadata['platform_relations'])
    lines=exporter.imported(verify.counts_sql(metadata['relations'])+verify.counts_sql(metadata['platform_relations']))
    counts,platform_counts=map(json.loads,lines)
    capture.platform_ledger.validate(platform_counts,metadata['platform_relations'])
    lines=exporter.imported(capture.platform_ledger.digest_sql()+"select jsonb_build_object('encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype,'localeProvider',datlocprovider,'owner',pg_get_userbyid(datdba),'bootstrapRole',(select rolname from pg_roles where oid=10)) from pg_database where datname=current_database();")
    facts=json.loads(lines[1]);owner=facts.pop('owner');bootstrap=facts.pop('bootstrapRole')
    result={'contract':'qaw-restore-verification/2','dataSchemas':list(capture.plan.SCHEMAS),'metadata':metadata,
            'counts':counts,'platformCounts':platform_counts,'platformSupplement':capture.platform_ledger.descriptor(lines[0]),
            'databaseFacts':facts,'databaseOwner':owner,'bootstrapRole':bootstrap}
    capture.managed_profile.classify(result);return result


SEQUENCE_SQL="""select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',s.relname,'increment',q.seqincrement,'min',q.seqmin,'max',q.seqmax,'cycle',q.seqcycle,'tableSchema',tn.nspname,'table',t.relname,'column',a.attname,'columnType',format_type(a.atttypid,a.atttypmod)) order by n.nspname,s.relname),'[]'::jsonb) from pg_class s join pg_namespace n on n.oid=s.relnamespace join pg_sequence q on q.seqrelid=s.oid left join pg_depend d on d.classid='pg_class'::regclass and d.objid=s.oid and d.refclassid='pg_class'::regclass and d.deptype in ('a','i') left join pg_class t on t.oid=d.refobjid left join pg_namespace tn on tn.oid=t.relnamespace left join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid where n.nspname in (%s);"""


def sequence_expectations(exporter):
    sql=SEQUENCE_SQL % ','.join(verify.literal(s) for s in capture.plan.SCHEMAS)
    specs=json.loads(exporter.imported(sql)[0])
    for item in specs:
        if item['cycle'] or item['increment']<=0 or item['tableSchema'] not in capture.plan.SCHEMAS or item['columnType'] not in ('bigint','integer','smallint'):
            raise ValueError('UNSUPPORTED_SEQUENCE_SAFETY_PROFILE')
        maximum=exporter.imported('select max('+verify.quote(item['column'])+') from '+verify.quote(item['tableSchema'])+'.'+verify.quote(item['table'])+';')
        item['snapshotMax']=None if not maximum else int(maximum[0])
    return specs


def verify_restored_sequences(db,specs):
    actual=json.loads(db.sql(SEQUENCE_SQL % ','.join(verify.literal(s) for s in capture.plan.SCHEMAS)))
    if actual!=[{k:v for k,v in spec.items() if k!='snapshotMax'} for spec in specs]:raise ValueError('RESTORED_SEQUENCE_DEFINITION_CHANGED')
    advanced=0
    for spec in specs:
        seq=verify.quote(spec['schema'])+'.'+verify.quote(spec['name'])
        row=json.loads(db.sql('select jsonb_build_object(\'last\',last_value,\'called\',is_called) from '+seq+';'))
        maximum=db.sql('select max('+verify.quote(spec['column'])+') from '+verify.quote(spec['tableSchema'])+'.'+verify.quote(spec['table'])+';')
        maximum=None if maximum=='' else int(maximum)
        if maximum!=spec['snapshotMax']:raise ValueError('RESTORED_SEQUENCE_ROW_BOUND_CHANGED')
        nxt=row['last']+spec['increment'] if row['called'] else row['last']
        if maximum is not None and nxt>maximum+spec['increment']:advanced+=1
        if nxt<spec['min'] or nxt>spec['max'] or (maximum is not None and nxt<=maximum):raise ValueError('RESTORED_SEQUENCE_NEXT_VALUE_UNSAFE')
    return {'status':'PASS_MONOTONE_SEQUENCE_NO_COLLISION','sequences':len(specs),'advancedBeyondSnapshotRowBound':advanced,'exactSnapshotSequenceState':False}

# Read-only catalog aggregate. Definitions are hashed server-side; no source
# functions/default expressions/user content are returned or logged.
STRUCTURE_SQL="""select encode(sha256(convert_to(jsonb_build_object(
'relations',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'options',c.reloptions,'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,(select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d where d.adrelid=c.oid and d.adnum=a.attnum)) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid),'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text) from pg_index i where i.indrelid=c.oid),'policies',(select jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,p.polroles::text,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid),'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','S') and n.nspname !~ '^pg_' and n.nspname<>'information_schema'),
'functions',(select coalesce(jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid))) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and n.nspname !~ '^pg_' and n.nspname<>'information_schema'),
'sequences',(select coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,q.seqincrement,q.seqmin,q.seqmax,q.seqcache,q.seqcycle) order by n.nspname,c.relname),'[]'::jsonb) from pg_sequence q join pg_class c on c.oid=q.seqrelid join pg_namespace n on n.oid=c.relnamespace))::text,'UTF8')),'hex');"""


def catalog_evidence(metadata,structure_digest):
    # Strip effective-reader booleans, retain owner/ACL/role/catalog facts.
    result=catalog(metadata)
    result['schema_acl']=[{k:v for k,v in r.items() if k!='usage'} for r in result['schema_acl']]
    result['relations']=[{k:v for k,v in r.items() if k!='select'} for r in result['relations']]
    result['structureDigest']=structure_digest
    return result


def assert_evidence_stable(before,after):
    if before!=after:raise ValueError('SNAPSHOT_CATALOG_BOUNDARY_CHANGED')
