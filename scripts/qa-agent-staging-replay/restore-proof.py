"""Synthetic-only acceptance of controlled-restore, never a target backup reader."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('restore',HERE/'controlled-restore.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
report={'status':'FAIL_SYNTHETIC_RESTORE_ENTRY','targetRead':False,'stages':[]}
started=r.time.monotonic()
source=r.OwnCluster('supabase_admin')
try:
    if sys.argv[1:]!=['--synthetic-only']:raise ValueError('SYNTHETIC_ONLY')
    source.start()
    source.sql('create role postgres login createrole bypassrls;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role dashboard_user nologin;create role supabase_realtime_admin nologin;create role qaw_owner nologin;create role qaw_reader nologin;grant qaw_reader to qaw_owner with admin option;')
    fixture_roles=json.loads(source.sql("select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper)) from pg_roles;"))
    r.managed.prepare(source,{'bootstrapRole':'supabase_admin','metadata':{'extensions':r.managed.EXTENSIONS,'roles':fixture_roles,'schema_acl':[{'schema':'extensions','owner':'postgres'},{'schema':'vault','owner':'supabase_admin'}]}},r.verify.quote,r.verify.literal)
    source.sql('alter database postgres owner to postgres;alter role postgres set search_path=public;grant usage on schema extensions to anon,authenticated,service_role;grant usage,create on schema extensions to dashboard_user;grant usage on schema vault to postgres with grant option;grant usage on schema vault to service_role;')
    for schema in r.plan.SCHEMAS:
        source.sql('create schema if not exists '+r.verify.quote(schema)+';create table '+r.verify.quote(schema)+'.synthetic(id int primary key,value text);insert into '+r.verify.quote(schema)+".synthetic values(1,'synthetic-only');alter table "+r.verify.quote(schema)+'.synthetic owner to qaw_owner;grant select on '+r.verify.quote(schema)+'.synthetic to qaw_reader;')
    # These89 rows are generated synthetic versions, NOT the target ledger values.
    source.sql("create schema realtime authorization supabase_realtime_admin;create table realtime.schema_migrations(version bigint primary key,inserted_at timestamp(0) without time zone);alter table realtime.schema_migrations owner to supabase_admin;insert into realtime.schema_migrations select n,'2026-01-01'::timestamp from generate_series(1,89)n;create table realtime.messages(id bigint) partition by range(id);alter table realtime.messages owner to supabase_realtime_admin;create table realtime.subscription(id bigint);alter table realtime.subscription owner to supabase_realtime_admin;")
    source.sql("create function public.synthetic_event() returns event_trigger language plpgsql as $$begin null;end$$;create event trigger synthetic_event on ddl_command_end execute function public.synthetic_event();")
    metadata=json.loads(source.sql((HERE/'metadata-probe.sql').read_text()))
    if metadata['extensions']!=r.managed.EXTENSIONS:raise ValueError('FIXTURE_EXTENSION_OWNER_VERSION_CONFLICT')
    if next(role for role in metadata['roles'] if role['name']=='postgres')['superuser']:raise ValueError('FIXTURE_POSTGRES_PRIVILEGE_NOT_RESTORED')
    counts=json.loads(source.sql(r.verify.counts_sql(metadata['relations'])))
    facts=json.loads(source.sql("select jsonb_build_object('encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype,'localeProvider',datlocprovider) from pg_database where datname=current_database();"))
    platform_counts=json.loads(source.sql(r.verify.counts_sql(metadata['platform_relations'])))
    expected={'contract':'qaw-restore-verification/2','dataSchemas':list(r.plan.SCHEMAS),'metadata':metadata,'counts':counts,'platformCounts':platform_counts,'platformSupplement':r.ledger.descriptor(source.sql(r.ledger.digest_sql())),'databaseFacts':facts,'databaseOwner':'postgres','bootstrapRole':source.admin}
    with tempfile.TemporaryDirectory(dir=r.ROOT/'artifacts/QAWEB/staging-replay',prefix='restore-entry-proof-') as tmp:
        d=Path(tmp);key=d/'synthetic.agekey'
        r.run(['age-keygen','-o',str(key)]);os.chmod(key,0o600)
        recipient=r.run(['age-keygen','-y',str(key)]).decode().strip()
        commands={
            'data14.dump.age.partial':source.command('pg_dump')+['-Fc',*['--schema='+s for s in r.plan.SCHEMAS]],
            'schema-all.dump.age.partial':source.command('pg_dump')+['-Fc','--schema-only'],
            r.ledger.ARCHIVE:source.command('pg_dump')+['-Fc','--data-only','--table='+r.ledger.RELATION],
            'roles.sql.age.partial':['docker','--context',source.context,'exec',source.name,'pg_dumpall','--roles-only','--no-role-passwords','-h','/tmp/restore-socket','-U',source.admin],
        }
        entries=[];capture_start=r.time.monotonic()
        for name,command in commands.items():
            r.capture.seal_pipeline(command,os.environ.copy(),recipient,d/name)
            entries.append({'file':name,'bytes':(d/name).stat().st_size,'sha256':r.file_hash(d/name)})
        report['captureSeconds']=round(r.time.monotonic()-capture_start,3)
        manifest={'status':'ENCRYPTED_CAPTURE_INTEGRITY_PASS_RESTORE_UNRUN','target':r.plan.REF,'entries':entries,'verification':expected}
        restore_start=r.time.monotonic()
        success=r.restore_bundle(d,key,manifest)
        report['restoreSeconds']=round(r.time.monotonic()-restore_start,3)
        report['restore']=success
        if success['status']!='PASS_LOCAL_BUNDLE_RESTORE_ONLY':raise ValueError('VALID_BUNDLE_RESTORE_FAILED')
        report['stages'].append('PASS four-ciphertext restore,14 counts,89 synthetic ledger rows/digest,roles/ACL/platform catalog')
        wrong=copy.deepcopy(manifest);wrong['verification']['counts']['public.synthetic']=2
        denied=r.restore_bundle(d,key,wrong)
        if denied.get('reason')!='RESTORED_COUNTS_MISMATCH' or denied.get('cleanup')!='PASS':raise ValueError('COUNT_NEGATIVE_FAILED')
        report['stages'].append('PASS wrong expected count rejected after isolated restore with cleanup')
        ledger_wrong=copy.deepcopy(manifest);ledger_wrong['verification']['platformSupplement']['sha256Rows']='0'*64
        denied=r.restore_bundle(d,key,ledger_wrong)
        if denied.get('reason')!='PLATFORM_LEDGER_ROWS_MISMATCH' or denied.get('cleanup')!='PASS':raise ValueError('LEDGER_DIGEST_NEGATIVE_FAILED')
        report['stages'].append('PASS wrong logical ledger digest rejected; no substitute seed versions')
        unsupported=copy.deepcopy(manifest)
        unsupported['verification']['metadata']['extensions'].append({'name':'unknown_managed_extension','version':'0','owner':'postgres','schema':'public'})
        try:r.bundle_preflight(unsupported)
        except ValueError as e:
            if str(e)!='MANAGED_EXTENSION_PROFILE_CONFLICT':raise
        else:raise ValueError('UNKNOWN_BOOTSTRAP_ACCEPTED')
        report['stages'].append('PASS unknown managed extension rejected before archive read/container creation')
        old=copy.deepcopy(manifest);del old['verification']
        try:r.bundle_preflight(old)
        except ValueError as e:
            if str(e)!='RESTORE_EXPECTATIONS_MISSING':raise
        else:raise ValueError('OLD_MANIFEST_ACCEPTED')
        report['stages'].append('PASS capture lacking restoration expectations rejected')
        altered=d/'data14.dump.age.partial';data=bytearray(altered.read_bytes());data[-1]^=1;altered.write_bytes(data)
        try:r.restore_bundle(d,key,manifest)
        except ValueError as e:
            if str(e)!='ARCHIVE_INTEGRITY_OR_PATH_CONFLICT':raise
        else:raise ValueError('CORRUPTION_ACCEPTED')
        report['stages'].append('PASS altered ciphertext rejected before container')
    report['stages'].append('PASS synthetic key/ciphertexts removed')
    report['status']='PASS_SYNTHETIC_RESTORE_ENTRY_ONLY'
except Exception as e:
    report['reason']=str(e) if isinstance(e,ValueError) else 'SYNTHETIC_DIAGNOSTIC_SUPPRESSED'
finally:
    try:source.close();report['sourceCleanup']='PASS'
    except Exception:report.update(status='FAIL_SYNTHETIC_RESTORE_ENTRY',sourceCleanup='FAIL')
    report['elapsedSeconds']=round(r.time.monotonic()-started,3)
    print(json.dumps(report,indent=2))
    sys.exit(0 if report['status'].startswith('PASS') else 1)
