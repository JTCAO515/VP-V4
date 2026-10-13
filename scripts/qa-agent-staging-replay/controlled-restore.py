"""Default offline dry-run; explicitly approved ciphertext -> own no-network PG.
No DSN, shared container, mount, port, target connection or plaintext data file.
Unknown/mismatched bootstrap dependencies fail closed; no repair/skip-errors mode.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


capture=load('capture',HERE/'controlled-backup.py')
verify=load('verify',HERE/'restore-verification.py')
plan=capture.plan
IMAGE='public.ecr.aws/supabase/postgres:17.6.1.155'
IMAGE_ID='sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b'
FILES={'data14.dump.age.partial','schema-all.dump.age.partial','roles.sql.age.partial'}


def run(args,data=None,timeout=60):
    r=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if r.returncode:
        code=re.search(rb'ERROR:\s+([0-9A-Z]{5})\b',r.stderr)
        category=next((label for token,label in [(b'permission denied to create role','CREATE_ROLE'),(b'permission denied to alter role','ALTER_ROLE'),(b'permission denied to grant role','GRANT_ROLE'),(b'permission denied to set role','SET_ROLE'),(b'permission denied to change default privileges','DEFAULT_PRIVILEGES'),(b'must be member of role','ROLE_MEMBERSHIP')] if token in r.stderr),None)
        raise ValueError(category or ('LOCAL_SQLSTATE_'+code[1].decode() if code else 'LOCAL_COMMAND_FAILED'))
    return r.stdout


def pipeline(producer,consumer,collect=False):
    a=b=None
    try:
        a=subprocess.Popen(producer,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        b=subprocess.Popen(consumer,stdin=a.stdout,stdout=subprocess.PIPE if collect else subprocess.DEVNULL,stderr=subprocess.PIPE)
        a.stdout.close()
        output,diagnostic=b.communicate(timeout=600)
        if b.returncode:
            code=re.search(rb'ERROR:\s+([0-9A-Z]{5})\b',diagnostic or b'')
            category=next((label for token,label in [(b'already exists','RESTORE_OBJECT_EXISTS'),(b'does not exist','RESTORE_OBJECT_MISSING'),(b'permission denied','RESTORE_PERMISSION_DENIED'),(b'unrecognized configuration parameter','RESTORE_PARAMETER_UNSUPPORTED'),(b'unsupported version','RESTORE_ARCHIVE_VERSION_UNSUPPORTED')] if token in (diagnostic or b'')),None)
            raise ValueError(category or ('RESTORE_SQLSTATE_'+code[1].decode() if code else 'LOCAL_RESTORE_CONSUMER_FAILED'))
        # Every archive has already passed full authenticated decryption above.
        # Section-only pg_restore may finish early and close age's pipe.
        plan.require(a.wait(timeout=15) in (0,-13),'LOCAL_DECRYPT_PRODUCER_FAILED')
        return output
    finally:
        for p in (b,a):
            if p and p.poll() is None:p.kill();p.wait()


class OwnCluster:
    def __init__(self, bootstrap_admin=None):
        self.nonce=uuid.uuid4().hex;self.name='qaw-restore-'+self.nonce[:12]
        self.admin=bootstrap_admin or 'qaw_restore_'+self.nonce[:12]
        plan.require(re.fullmatch('[a-zA-Z_][a-zA-Z_0-9]{0,62}',self.admin),'UNSUPPORTED_BOOTSTRAP_IDENTIFIER')
        self.context=None;self.created=False
    def docker(self,args,data=None):return run(['docker','--context',self.context]+args,data)
    def command(self,program):
        return ['docker','--context',self.context,'exec','-i',self.name,program,'-h','/tmp/restore-socket','-U',self.admin,'-d','postgres']
    def sql(self,text):
        return run(self.command('psql')+['-X','-q','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],text.encode()).decode().strip()
    def start(self):
        plan.require('DOCKER_HOST' not in os.environ and 'DOCKER_CONTEXT' not in os.environ,'DOCKER_OVERRIDE_REJECTED')
        self.context=run(['docker','context','show']).decode().strip()
        endpoint=json.loads(run(['docker','context','inspect',self.context]))[0]['Endpoints']['docker']['Host']
        plan.require(endpoint.startswith('unix://'),'LOCAL_DOCKER_REQUIRED')
        plan.require(self.docker(['image','inspect',IMAGE,'--format','{{.Id}}']).decode().strip()==IMAGE_ID,'IMAGE_PIN_CONFLICT')
        absent=subprocess.run(['docker','--context',self.context,'inspect',self.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
        plan.require(absent.returncode!=0,'REFUSE_EXISTING_CONTAINER')
        self.docker(['run','--pull=never','--rm','-d','--network','none','--name',self.name,'--label','qaw.restore.owner='+self.nonce,
                     '--memory','2g','--cpus','2','--pids-limit','256','--cap-drop','ALL','--security-opt','no-new-privileges',
                     '--user','postgres','--entrypoint','/bin/sh',IMAGE,'-c',
                     'umask 077; mkdir /tmp/restore-socket; initdb -U '+self.admin+' -D /tmp/restore-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/restore-db -c listen_addresses= -c unix_socket_directories=/tmp/restore-socket -c unix_socket_permissions=0700'])
        self.created=True
        info=json.loads(self.docker(['inspect',self.name]))[0]
        plan.require(info['HostConfig']['NetworkMode']=='none' and not info['Mounts'] and not info['HostConfig']['PortBindings'],'ISOLATION_FAILED')
        for _ in range(100):
            r=subprocess.run(['docker','--context',self.context,'exec',self.name,'pg_isready','-h','/tmp/restore-socket','-U',self.admin],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
            if r.returncode==0:return
            time.sleep(.1)
        raise ValueError('LOCAL_POSTGRES_NOT_READY')
    def close(self):
        if self.created:
            label=self.docker(['inspect',self.name,'--format','{{index .Config.Labels "qaw.restore.owner"}}']).decode().strip()
            plan.require(label==self.nonce,'CLEANUP_OWNER_CONFLICT')
            self.docker(['rm','-f',self.name]);self.created=False


def bundle_preflight(manifest):
    plan.require(manifest.get('status')=='ENCRYPTED_CAPTURE_INTEGRITY_PASS_RESTORE_UNRUN' and manifest.get('target')==plan.REF,'CAPTURE_MANIFEST_REQUIRED')
    entries=manifest.get('entries',[])
    plan.require(len(entries)==3 and {e['file'] for e in entries}==FILES,'EXACT_THREE_ARCHIVES_REQUIRED')
    expected=manifest.get('verification')
    plan.require(expected and expected.get('contract')=='qaw-restore-verification/1','RESTORE_EXPECTATIONS_MISSING')
    plan.require(expected.get('dataSchemas')==list(plan.SCHEMAS),'FOURTEEN_SCHEMA_CONFLICT')
    plan.require(expected.get('counts') and expected.get('metadata') and expected.get('databaseFacts') and expected.get('databaseOwner') and expected.get('bootstrapRole'),'BOOTSTRAP_EVIDENCE_MISSING')
    non_builtin=[e for e in expected['metadata']['extensions'] if e['name']!='plpgsql']
    plan.require(not non_builtin,'MANAGED_EXTENSION_BOOTSTRAP_NOT_YET_ACCEPTED')
    for e in entries:
        plan.require(re.fullmatch('[a-f0-9]{64}',e.get('sha256','')) and isinstance(e.get('bytes'),int) and e['bytes']>0,'ARCHIVE_MANIFEST_INVALID')
    return expected


def file_hash(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def restore_bundle(directory,identity,manifest):
    # Main calls only after operator approval; synthetic proof supplies only its
    # temporary self-generated bundle. Do not infer permission from this API.
    expected=bundle_preflight(manifest)
    directory=Path(directory);identity=Path(identity)
    plan.require(identity.is_file() and not identity.is_symlink() and identity.stat().st_mode&0o077==0 and identity.stat().st_uid==os.getuid(),'IDENTITY_FILE_UNSAFE')
    entries={e['file']:e for e in manifest['entries']}
    for name,e in entries.items():
        p=directory/name
        plan.require(p.is_file() and not p.is_symlink() and p.stat().st_mode&0o077==0 and p.stat().st_uid==os.getuid() and p.stat().st_size==e['bytes'] and file_hash(p)==e['sha256'],'ARCHIVE_INTEGRITY_OR_PATH_CONFLICT')
        capture.validate_ciphertext(identity,p,custom=name!='roles.sql.age.partial')
    decrypt=lambda name:['age','-d','-i',str(identity),str(directory/name)]
    source_sql=pipeline(decrypt('schema-all.dump.age.partial'),[plan.PG_ROOT+'/pg_restore','--schema-only','--file=-'],collect=True).decode()
    source_schema=verify.normalize_schema(source_sql)
    db=OwnCluster(expected['bootstrapRole']);stage='bootstrap';report={'status':'FAIL_LOCAL_RESTORE','targetWritten':False,'contentOutput':False}
    try:
        db.start()
        facts=json.loads(db.sql("select jsonb_build_object('encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype,'localeProvider',datlocprovider) from pg_database where datname=current_database();"))
        plan.require(facts==expected['databaseFacts'],'UNKNOWN_DATABASE_LOCALE_BOOTSTRAP')
        available=json.loads(db.sql("select jsonb_agg(jsonb_build_object('name',name,'version',version)) from pg_available_extension_versions;"))
        for e in expected['metadata']['extensions']:
            plan.require({'name':e['name'],'version':e['version']} in available,'UNAVAILABLE_PLATFORM_EXTENSION')
        bootstrap=next(r for r in expected['metadata']['roles'] if r['name']==db.admin)
        plan.require(bootstrap['superuser'],'UNSUPPORTED_BOOTSTRAP_PRIVILEGES')
        stage='global roles'
        # PostgreSQL's original OID10 role is a special implicit role grantor.
        # Recreate its exact identity at initdb; reconcile only its CREATE, not
        # memberships, ALTER attributes or any unknown statement/error.
        role_sql=run(decrypt('roles.sql.age.partial')).decode()
        plan.require(len(role_sql)<2*1024*1024,'ROLE_DDL_LIMIT_EXCEEDED')
        bootstrap_creates={'CREATE ROLE '+db.admin+';','CREATE ROLE '+verify.quote(db.admin)+';'}
        lines=role_sql.splitlines()
        plan.require(sum(line in bootstrap_creates for line in lines)==1,'BOOTSTRAP_ROLE_CREATE_CONFLICT')
        db.sql('\n'.join(line for line in lines if line not in bootstrap_creates))
        stage='database ownership bootstrap'
        database_owner=expected['databaseOwner']
        db.sql('alter database postgres owner to '+verify.quote(database_owner)+';')
        stage='builtin extension ownership bootstrap'
        builtin=next(e for e in expected['metadata']['extensions'] if e['name']=='plpgsql')
        owner=builtin['owner']
        owner_role=next(r for r in expected['metadata']['roles'] if r['name']==owner)
        plan.require(owner_role['superuser'],'BUILTIN_EXTENSION_OWNER_BOOTSTRAP_UNSUPPORTED')
        plan.require(owner==db.admin,'UNKNOWN_BUILTIN_EXTENSION_OWNER')
        # Restore all remaining schema statements without owner/ACL filtering.
        # pg_dump can omit CREATE for the initdb-provided public schema.
        # Drop that empty local bootstrap schema only when archive recreates it.
        if re.search(r'^CREATE SCHEMA public;',source_sql,re.M):
            db.sql('drop schema public cascade;')
        stage='schema pre-data'
        pipeline(decrypt('schema-all.dump.age.partial'),db.command('pg_restore')+['--exit-on-error','--section=pre-data'])
        stage='fourteen-schema data'
        pipeline(decrypt('data14.dump.age.partial'),db.command('pg_restore')+['--exit-on-error','--data-only'])
        stage='schema post-data'
        pipeline(decrypt('schema-all.dump.age.partial'),db.command('pg_restore')+['--exit-on-error','--section=post-data'])
        stage='schema owner ACL policy trigger verification'
        restored_sql=run(db.command('pg_dump')+['--schema-only']).decode()
        restored_schema=verify.normalize_schema(restored_sql)
        plan.require(restored_schema==source_schema,'SCHEMA_OWNER_ACL_OR_PLATFORM_MISMATCH')
        stage='catalog roles and counts'
        metadata=json.loads(db.sql((HERE/'metadata-probe.sql').read_text()))
        plan.require(verify.role_snapshot(metadata)==verify.role_snapshot(expected['metadata']),'ROLE_MEMBERSHIP_MISMATCH')
        plan.require(metadata['schemas']==expected['metadata']['schemas'] and metadata['extensions']==expected['metadata']['extensions'] and metadata['event_triggers']==expected['metadata']['event_triggers'],'PLATFORM_CATALOG_MISMATCH')
        counts=json.loads(db.sql(verify.counts_sql(expected['metadata']['relations'])))
        plan.require(counts==expected['counts'],'RESTORED_COUNTS_MISMATCH')
        for name,e in entries.items():
            plan.require(file_hash(directory/name)==e['sha256'],'ARCHIVE_CHANGED_DURING_RESTORE')
        report.update(status='PASS_LOCAL_BUNDLE_RESTORE_ONLY',schemaDigest=verify.fingerprint(restored_schema),countRelations=len(counts),
                      globalRoles='PASS',ownerAclSchema='PASS',platformCatalog='PASS',counts='PASS',
                      platformServices='UNRUN_GOTRUE_STORAGE_REALTIME',migrationUpgrade='UNRUN',userAcceptance='UNRUN')
    except Exception as e:
        report.update(failedStage=stage,reason=str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z_0-9]+',str(e)) else 'RESTORE_FAILED_DETAILS_SUPPRESSED')
    finally:
        try:db.close();report['cleanup']='PASS'
        except Exception:report.update(status='FAIL_LOCAL_RESTORE',cleanup='FAIL')
    return report


def code_hash():
    names=['controlled-restore.py','restore-verification.py','controlled-backup.py','metadata-probe.sql']
    return hashlib.sha256(b''.join((HERE/n).read_bytes() for n in names)+capture.code_hash().encode()).hexdigest()


def validate_approval(a,manifest_path,identity_path):
    plan.require(a.get('target')==plan.REF and a.get('codeSha256')==code_hash(),'RESTORE_APPROVAL_CONFLICT')
    plan.require(a.get('actions')==['decrypt-approved-bundle','restore-own-isolated-docker','verify-no-content-output','destroy-own-restored-copy'],'RESTORE_SCOPE_CONFLICT')
    plan.require(a.get('manifestPath')==str(manifest_path.resolve()) and a.get('identityPath')==str(identity_path.resolve()),'RESTORE_INPUT_CONFLICT')
    instant=datetime.now(timezone.utc)
    plan.require(capture.stamp(a['windowStart'])<=instant and instant+timedelta(minutes=30)<=capture.stamp(a['windowEnd']),'RESTORE_WINDOW_EXPIRED')
    plan.require(a.get('manifestSha256')==file_hash(manifest_path),'RESTORE_MANIFEST_CHANGED')


def main(args):
    if args in ([],['--dry-run']):
        return {'status':'DRY_RUN_NO_ARCHIVE_OR_DOCKER_IO','codeSha256':code_hash(),'requiredBundle':sorted(FILES),
                'requiredContract':'qaw-restore-verification/1','image':IMAGE,'imageId':IMAGE_ID,
                'unknownManagedBootstrap':'FAIL_CLOSED','realArchiveRead':False,'actualRestore':'UNRUN'}
    plan.require(len(args)==4 and args[0]=='--restore-approved','RESTORE_ARGUMENTS_INVALID')
    plan.require(sys.stdin.isatty() and sys.stdout.isatty(),'HUMAN_TTY_REQUIRED')
    approval_path,manifest_path,identity_path=map(Path,args[1:])
    a=json.loads(approval_path.read_text());validate_approval(a,manifest_path,identity_path)
    manifest=json.loads(manifest_path.read_text());bundle_preflight(manifest)
    phrase='JT APPROVED LOCAL ISOLATED RESTORE '+plan.REF
    plan.require(input('Confirm exact bundle/identity and destroy-on-exit local restore: '+phrase+': ')==phrase,'RESTORE_CONFIRMATION_REQUIRED')
    plan.require(json.loads(approval_path.read_text())==a,'RESTORE_APPROVAL_CHANGED')
    validate_approval(a,manifest_path,identity_path)
    plan.require('FileVault is On.' in run(['fdesetup','status']).decode(),'FILEVAULT_REQUIRED')
    return restore_bundle(manifest_path.parent,identity_path,manifest)


if __name__=='__main__':
    try:
        result=main(sys.argv[1:]);print(json.dumps(result,indent=2))
        sys.exit(1 if result['status'].startswith('FAIL') else 0)
    except Exception:
        print('{"status":"REJECTED","reason":"NO_RAW_DIAGNOSTICS"}');sys.exit(1)
