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
source=r.OwnCluster()
try:
    if sys.argv[1:]!=['--synthetic-only']:raise ValueError('SYNTHETIC_ONLY')
    source.start()
    source.sql('create role postgres nologin;create role qaw_owner nologin;create role qaw_reader nologin;grant qaw_reader to qaw_owner with admin option;')
    for schema in r.plan.SCHEMAS:
        source.sql('create schema if not exists '+r.verify.quote(schema)+';create table '+r.verify.quote(schema)+'.synthetic(id int primary key,value text);insert into '+r.verify.quote(schema)+".synthetic values(1,'synthetic-only');alter table "+r.verify.quote(schema)+'.synthetic owner to qaw_owner;grant select on '+r.verify.quote(schema)+'.synthetic to qaw_reader;')
    source.sql("create function public.synthetic_event() returns event_trigger language plpgsql as $$begin null;end$$;create event trigger synthetic_event on ddl_command_end execute function public.synthetic_event();")
    metadata=json.loads(source.sql((HERE/'metadata-probe.sql').read_text()))
    counts=json.loads(source.sql(r.verify.counts_sql(metadata['relations'])))
    facts=json.loads(source.sql("select jsonb_build_object('encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype,'localeProvider',datlocprovider) from pg_database where datname=current_database();"))
    expected={'contract':'qaw-restore-verification/1','dataSchemas':list(r.plan.SCHEMAS),'metadata':metadata,'counts':counts,'databaseFacts':facts,'databaseOwner':source.admin,'bootstrapRole':source.admin}
    with tempfile.TemporaryDirectory(dir=r.ROOT/'artifacts/QAWEB/staging-replay',prefix='restore-entry-proof-') as tmp:
        d=Path(tmp);key=d/'synthetic.agekey'
        r.run(['age-keygen','-o',str(key)]);os.chmod(key,0o600)
        recipient=r.run(['age-keygen','-y',str(key)]).decode().strip()
        commands={
            'data14.dump.age.partial':source.command('pg_dump')+['-Fc',*['--schema='+s for s in r.plan.SCHEMAS]],
            'schema-all.dump.age.partial':source.command('pg_dump')+['-Fc','--schema-only'],
            'roles.sql.age.partial':['docker','--context',source.context,'exec',source.name,'pg_dumpall','--roles-only','--no-role-passwords','-h','/tmp/restore-socket','-U',source.admin],
        }
        entries=[]
        for name,command in commands.items():
            r.capture.seal_pipeline(command,os.environ.copy(),recipient,d/name)
            entries.append({'file':name,'bytes':(d/name).stat().st_size,'sha256':r.file_hash(d/name)})
        manifest={'status':'ENCRYPTED_CAPTURE_INTEGRITY_PASS_RESTORE_UNRUN','target':r.plan.REF,'entries':entries,'verification':expected}
        success=r.restore_bundle(d,key,manifest)
        report['restore']=success
        if success['status']!='PASS_LOCAL_BUNDLE_RESTORE_ONLY':raise ValueError('VALID_BUNDLE_RESTORE_FAILED')
        report['stages'].append('PASS actual three-ciphertext restore,14 counts,roles/memberships,full schema owner ACL triggers/platform catalog')
        wrong=copy.deepcopy(manifest);wrong['verification']['counts']['public.synthetic']=2
        denied=r.restore_bundle(d,key,wrong)
        if denied.get('reason')!='RESTORED_COUNTS_MISMATCH' or denied.get('cleanup')!='PASS':raise ValueError('COUNT_NEGATIVE_FAILED')
        report['stages'].append('PASS wrong expected count rejected after isolated restore with cleanup')
        unsupported=copy.deepcopy(manifest)
        unsupported['verification']['metadata']['extensions'].append({'name':'unknown_managed_extension','version':'0','owner':'postgres','schema':'public'})
        try:r.bundle_preflight(unsupported)
        except ValueError as e:
            if str(e)!='MANAGED_EXTENSION_BOOTSTRAP_NOT_YET_ACCEPTED':raise
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
    print(json.dumps(report,indent=2))
    sys.exit(0 if report['status'].startswith('PASS') else 1)
