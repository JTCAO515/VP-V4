"""Review candidate: dry-run by default. Real backup requires an operator TTY gate.
NEVER run --execute on inferred/delegated approval. JT must approve this exact
code/scope, then the human operator provides the confirmation interactively.
No target restore, GRANT, mutation, password logging or plaintext dump file.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone, timedelta
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


probe = load('probe', HERE / 'metadata-probe.py')
verification = load('verification', HERE / 'restore-verification.py')
managed_profile = load('managed_profile', HERE / 'managed-profile.py')
platform_ledger = load('platform_ledger', HERE / 'platform-ledger.py')
plan = probe.plan
APPROVAL_ACTIONS = sorted(['read-target-data14', 'set-role-postgres-for-read-only-backup',
                           'create-local-age-recovery-identity', 'retain-encrypted-database-copy',
                           'capture-global-roles-without-passwords-and-full-schema',platform_ledger.ACTION])


def now():
    return datetime.now(timezone.utc)


def stamp(value):
    x = datetime.fromisoformat(value.replace('Z', '+00:00'))
    plan.require(x.tzinfo is not None, 'TIMESTAMP_TIMEZONE_REQUIRED')
    return x


def code_hash():
    names = ['controlled-backup.py', 'metadata-probe.py', 'metadata-probe.sql', 'backup-candidate.py', 'backup-relay.py','restore-verification.py','managed-profile.py','platform-ledger.py']
    return hashlib.sha256(b''.join((name + '\n').encode() + (HERE / name).read_bytes() for name in names)+(ROOT/'artifacts/QAWEB/staging-replay/probe-official-metadata.json').read_bytes()).hexdigest()


def validate_approval(a, instant):
    plan.require(str(uuid.UUID(a.get('approvalId',''))) == a['approvalId'], 'ONE_TIME_APPROVAL_ID_REQUIRED')
    plan.require(a.get('target') == plan.REF and a.get('organization') == plan.ORGANIZATION, 'APPROVAL_TARGET_CONFLICT')
    plan.require(a.get('codeSha256') == code_hash(), 'APPROVAL_CODE_CONFLICT')
    plan.require(sorted(a.get('actions', [])) == APPROVAL_ACTIONS, 'APPROVAL_SCOPE_INCOMPLETE')
    plan.require(a.get('approvedBy') == 'JT' and a.get('writersAndMigratorsQuiesced') is True, 'OPERATOR_SCOPE_REQUIRED')
    start, end = stamp(a['windowStart']), stamp(a['windowEnd'])
    plan.require(start <= instant and instant + timedelta(minutes=20) <= end and end-start <= timedelta(hours=4), 'MAINTENANCE_WINDOW_INVALID')
    plan.require(end < stamp(a['retainUntil']) and bool(a.get('restoreDestination')), 'RETENTION_AND_RESTORE_DESTINATION_REQUIRED')
    plan.require(a.get('archiveDirectory') == plan.ARCHIVE_ROOT and a.get('identityDirectory') == plan.IDENTITY_ROOT, 'APPROVAL_DESTINATION_CONFLICT')
    # A JSON claim is NOT authenticated JT consent. A human must additionally
    # confirm actual approval at a TTY; agent-created approval files are prohibited.


def secure_directory(path):
    path = Path(path)
    home = Path('/Users/jtsm5p')
    plan.require(path.is_relative_to(home), 'DESTINATION_OUTSIDE_APPROVED_HOME')
    current = home
    for part in path.relative_to(home).parts:
        current = current / part
        if not current.exists() and not current.is_symlink():
            current.mkdir(mode=0o700)
        st = current.lstat()
        plan.require(not current.is_symlink() and current.is_dir() and st.st_uid == os.getuid() and not st.st_mode & 0o022, 'DESTINATION_UNSAFE')
    plan.require(path.stat().st_mode & 0o077 == 0, 'DESTINATION_NOT_PRIVATE')
    return path


def exclusive_json(path, value):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
        json.dump(value, f, indent=2); f.flush(); os.fsync(f.fileno())


def seal_pipeline(argv, env, recipient, archive):
    """Dump stdout only enters age stdin; never Python memory or plaintext disk."""
    producer = consumer = None
    try:
        with os.fdopen(os.open(archive, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as f:
            producer = subprocess.Popen(argv, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            consumer = subprocess.Popen(['age', '-r', recipient], stdin=producer.stdout, stdout=f, stderr=subprocess.DEVNULL)
            producer.stdout.close()
            b = consumer.wait(timeout=600); a = producer.wait(timeout=15)
            plan.require(a == 0 and b == 0, 'DUMP_OR_ENCRYPTION_FAILED')
            f.flush(); os.fsync(f.fileno())
    finally:
        for process in (consumer, producer):
            if process and process.poll() is None:
                process.kill(); process.wait()


def validate_ciphertext(identity, archive, custom=True):
    decrypt = ['age', '-d', '-i', str(identity), str(archive)]
    r = subprocess.run(decrypt, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600)
    plan.require(r.returncode == 0, 'FULL_CIPHERTEXT_INTEGRITY_FAILED')
    if not custom:
        return None
    process = subprocess.Popen(decrypt, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        listing = subprocess.run([plan.PG_ROOT + '/pg_restore', '-l'], stdin=process.stdout,
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60)
        process.stdout.close(); status = process.wait(timeout=15)
        plan.require(listing.returncode == 0 and status in (0, -13), 'TOC_READ_FAILED')
        return listing.stdout.decode()
    finally:
        if process.poll() is None:
            process.kill(); process.wait()


def metadata(env, port):
    sql = (HERE / 'metadata-probe.sql').read_text().replace('begin read only;', 'begin read only;set local role postgres;')
    sql = sql.replace(" 'session_user'", " 'storage_objects',(select count(*) from storage.objects),'storage_buckets',(select count(*) from storage.buckets),'versions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),\n 'session_user'", 1)
    raw = probe.checked([plan.PG_ROOT + '/psql', '-X', '-q', '-At', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate',
                         '-h', 'db.'+plan.REF+'.supabase.co', '-p', str(port), '-U', 'cli_login_postgres', '-d', 'postgres'],
                        env=env, stdin=sql, timeout=30)
    m = json.loads(raw)
    plan.require(m['session_user'] == 'cli_login_postgres' and m['current_user'] == 'postgres', 'EFFECTIVE_ROLE_CONFLICT')
    plan.require(m['read_only'] == 'on' and m['tls']['ssl'], 'READ_ONLY_TLS_REQUIRED')
    plan.validate_versions(m['versions'])
    plan.require(m['storage_objects']==0 and m['storage_buckets']==0, 'STORAGE_BYTES_RECOVERY_PLAN_REQUIRED')
    plan.require(all(x['select'] for x in m['relations']), 'ROLE_CANNOT_READ_ALL_SCOPED_RELATIONS')
    return m


def restore_expectations(env, port, metadata):
    # Reject unknown namespaces/structure before even composing an outside14
    # count query. Do not read ledger fields until the exact count gate passes.
    platform_ledger.validate_relations(metadata['platform_relations'])
    command=[plan.PG_ROOT+'/psql','-X','-q','-At','-w','-v','ON_ERROR_STOP=1','-h','db.'+plan.REF+'.supabase.co','-p',str(port),'-U','cli_login_postgres','-d','postgres']
    prefix="begin read only;set local role postgres;set local statement_timeout='10s';"
    sql=prefix+verification.counts_sql(metadata['relations'])+verification.counts_sql(metadata['platform_relations'])+'rollback;'
    raw=probe.checked(command,env=env,stdin=sql,timeout=30)
    counts,platform_counts=map(json.loads,raw.splitlines())
    platform_ledger.validate(platform_counts,metadata['platform_relations'])
    sql=prefix+platform_ledger.digest_sql()
    sql+="select jsonb_build_object('encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype,'localeProvider',datlocprovider,'owner',pg_get_userbyid(datdba),'bootstrapRole',(select rolname from pg_roles where oid=10)) from pg_database where datname=current_database();rollback;"
    raw=probe.checked(command,env=env,stdin=sql,timeout=30)
    digest_line,fact_line=raw.splitlines();facts=json.loads(fact_line)
    owner=facts.pop('owner'); bootstrap=facts.pop('bootstrapRole')
    expected={'contract':'qaw-restore-verification/2','dataSchemas':list(plan.SCHEMAS),
            'metadata':metadata,'counts':counts,'platformCounts':platform_counts,'platformSupplement':platform_ledger.descriptor(digest_line),'databaseFacts':facts,'databaseOwner':owner,'bootstrapRole':bootstrap}
    managed_profile.classify(expected)
    return expected


def execute(a, official):
    # Only main() after the interactive gate calls this function.
    plan.require('FileVault is On.' in probe.checked(['fdesetup', 'status']), 'FILEVAULT_REQUIRED')
    for name in ('pg_dump', 'pg_dumpall', 'pg_restore'):
        plan.require(re.search(r'\b17\.', probe.checked([plan.PG_ROOT+'/'+name, '--version'])), 'PG17_REQUIRED')
    probe.checked(['age', '--version']); probe.checked(['age-keygen', '--version'])
    inventory = json.loads(probe.checked(['supabase', 'projects', 'list', '--output-format', 'json']))['projects']
    matches = [p for p in inventory if p.get('id') == plan.REF and p.get('organization_id') == plan.ORGANIZATION
               and p.get('name') == 'VP - V4' and p.get('status') == 'ACTIVE_HEALTHY'
               and p.get('database', {}).get('version') == '17.6.1.155']
    plan.require(len(matches) == 1, 'CLI_PROJECT_CONFLICT')
    password = probe.parse_credentials(probe.checked(['supabase', 'db', 'dump', '--linked', '--project-ref', plan.REF, '--dry-run']))
    stage = 'metadata'; archive_dir = None
    relay = load('backup_relay', HERE / 'backup-relay.py')
    with tempfile.TemporaryDirectory(prefix='backup-ca-', dir=ROOT / 'artifacts/QAWEB/staging-replay') as tmp:
        with probe.urllib.request.urlopen(plan.CA_URL, timeout=15) as response:
            ca_bytes = response.read(32769)
        plan.require(hashlib.sha256(ca_bytes).hexdigest() == plan.CA_HASH, 'CA_PIN_CONFLICT')
        ca = Path(tmp)/'root.crt'; ca.write_bytes(ca_bytes)
        with relay.direct_relay() as (address, port):
            env = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR') if k in os.environ}
            env.update(PGPASSWORD=password, PGHOSTADDR=address, PGSSLMODE='verify-full', PGSSLROOTCERT=str(ca),
                       PGCONNECT_TIMEOUT='8', PGGSSENCMODE='disable', PGOPTIONS='-c default_transaction_read_only=on', LC_ALL='C')
            password = None
            try:
                before = metadata(env, port)
                for field in ('versions','schemas','event_triggers'):
                    plan.require(before[field] == official[field], 'FRESH_OFFICIAL_METADATA_CONFLICT')
                plan.require(set(plan.SCHEMAS).issubset(before['schemas']), 'SCHEMA_COVERAGE_CONFLICT')
                expected_restore=restore_expectations(env,port,before)
                marker = now().strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
                archive_root=secure_directory(plan.ARCHIVE_ROOT)
                exclusive_json(archive_root/('approval-'+a['approvalId']+'.used.json'), {'approvalId':a['approvalId'],'consumedAt':now().isoformat(),'codeSha256':code_hash()})
                archive_dir = archive_root/marker; archive_dir.mkdir(mode=0o700)
                key_dir = secure_directory(plan.IDENTITY_ROOT)/marker; key_dir.mkdir(mode=0o700)
                exclusive_json(archive_dir/'STARTED.json', {'status':'INCOMPLETE_DO_NOT_RESTORE','approval':a,'createdAt':now().isoformat()})
                identity = key_dir/'recovery.agekey'
                stage = 'key creation'
                probe.checked(['age-keygen','-o',str(identity)]); os.chmod(identity,0o600)
                recipient = probe.checked(['age-keygen','-y',str(identity)]).strip()
                plan.require(recipient.startswith('age1'), 'AGE_RECIPIENT_INVALID')
                connect = ['-h','db.'+plan.REF+'.supabase.co','-p',str(port),'-U','cli_login_postgres','--role=postgres']
                entries = [
                    ('data14.dump.age', [plan.PG_ROOT+'/pg_dump','-Fc','--strict-names','-d','postgres',*connect,*['--schema='+s for s in plan.SCHEMAS]], True),
                    ('schema-all.dump.age', [plan.PG_ROOT+'/pg_dump','-Fc','--schema-only','-d','postgres',*connect], True),
                    ('platform-ledger.dump.age', [plan.PG_ROOT+'/pg_dump','-Fc','--data-only','--strict-names','--table='+platform_ledger.RELATION,'-d','postgres',*connect], True),
                    ('roles.sql.age', [plan.PG_ROOT+'/pg_dumpall','--roles-only','--no-role-passwords',*connect], False),
                ]
                results = []
                for name, command, custom in entries:
                    plan.require(now()+timedelta(minutes=11) < stamp(a['windowEnd']), 'WINDOW_TOO_SHORT_STOP')
                    stage = 'encrypt '+name
                    archive = archive_dir/(name+'.partial')
                    seal_pipeline(command, env, recipient, archive)
                    listing = validate_ciphertext(identity, archive, custom)
                    if name == 'data14.dump.age':
                        for schema in plan.SCHEMAS:
                            plan.require('SCHEMA - '+schema+' ' in listing, 'TOC_SCHEMA_MISSING')
                        for r in before['relations']:
                            data_kind={'r':'TABLE DATA','S':'SEQUENCE SET','m':'MATERIALIZED VIEW DATA'}.get(r['kind'])
                            if data_kind:
                                plan.require(data_kind+' '+r['schema']+' '+r['name']+' ' in listing, 'TOC_RELATION_DATA_MISSING')
                    if name == 'platform-ledger.dump.age':
                        platform_ledger.validate_toc(listing)
                    if name == 'schema-all.dump.age':
                        for e in before['event_triggers']:
                            plan.require('EVENT TRIGGER - '+e['name']+' ' in listing, 'TOC_EVENT_TRIGGER_MISSING')
                    digest = hashlib.sha256()
                    with archive.open('rb') as f:
                        for chunk in iter(lambda:f.read(1024*1024), b''): digest.update(chunk)
                    results.append({'file':archive.name,'bytes':archive.stat().st_size,'sha256':digest.hexdigest(),'fullIntegrity':'PASS','toc':'PASS' if custom else 'UNRUN_ROLE_SEMANTIC_RESTORE'})
                stage = 'post-dump metadata'
                plan.require(now()+timedelta(minutes=2)<stamp(a['windowEnd']),'WINDOW_EXPIRED_BEFORE_POSTCHECK')
                after = metadata(env, port)
                plan.require(before == after, 'METADATA_CHANGED_QUARANTINE')
                plan.require(restore_expectations(env,port,after)==expected_restore,'COUNTS_CHANGED_QUARANTINE')
                # Do not label this as a recoverable backup: actual-data restore and
                # global-role/platform bootstrap are independently unverified.
                manifest = {'status':'ENCRYPTED_CAPTURE_INTEGRITY_PASS_RESTORE_UNRUN','target':plan.REF,'entries':results,
                            'retainUntil':a['retainUntil'],'restoreDestination':a['restoreDestination'],
                            'ownersAclPreserved':True,'globalRolePasswords':'INTENTIONALLY_EXCLUDED_USE_APPROVED_IDENTITY_RECOVERY',
                            'actualDataRestore':'UNRUN','roleSemanticRestore':'UNRUN','codeSha256':code_hash(),
                            'verification':expected_restore}
                exclusive_json(archive_dir/'CAPTURED_RESTORE_UNRUN.json',manifest)
                return manifest
            except BaseException:
                if archive_dir:
                    exclusive_json(archive_dir/'FAILED_QUARANTINE.json',{'status':'FAILED_DO_NOT_RESTORE','stage':stage})
                # Keep ciphertext and recovery identity protected for operator
                # disposition; never delete keys automatically or log raw errors.
                raise
            finally:
                env.pop('PGPASSWORD',None)


def validate_operator_gate(approval, official, instant):
    # Read-only check: never create directories or consume the one-time marker.
    # Keep the original >=20-minute entry margin (stricter than capture's11min).
    validate_approval(approval, instant)
    plan.require(official.get('link_id')==plan.ACCOUNT['link_id'] and official.get('project')==plan.REF,'OFFICIAL_ACCOUNT_EVIDENCE_REQUIRED')
    plan.require(timedelta(0)<=instant-stamp(official['observedAt'])<=timedelta(minutes=5),'FRESH_OFFICIAL_EVIDENCE_REQUIRED')
    plan.validate_versions(official['versions'])
    pinned=json.loads((ROOT/'artifacts/QAWEB/staging-replay/probe-official-metadata.json').read_text())
    for field in ('schemas','event_triggers'):
        plan.require(official[field]==pinned[field], 'UNKNOWN_TARGET_CATALOG_REVIEW_REQUIRED')
    marker=Path(plan.ARCHIVE_ROOT)/('approval-'+approval['approvalId']+'.used.json')
    plan.require(not os.path.lexists(marker), 'APPROVAL_ALREADY_USED')


def main(args):
    if args in ([], ['--dry-run']):
        return {'status':'DRY_RUN_NO_TARGET_IO','codeSha256':code_hash(),'target':plan.REF,'actionsRequiringJTApproval':APPROVAL_ACTIONS,
                'execution':'--execute <approval.json> <fresh-official-metadata.json>, human TTY confirmation required',
                'schemaCount':14,'platformSupplement':platform_ledger.RELATION,'newPersistentKeys':False,'targetRead':False,'actualRestore':'UNRUN'}
    plan.require(len(args)==3 and args[0]=='--execute','INVALID_EXECUTION_ARGUMENTS')
    plan.require(sys.stdin.isatty() and sys.stdout.isatty(),'HUMAN_TTY_REQUIRED')
    approval=json.loads(Path(args[1]).read_text())
    official=json.loads(Path(args[2]).read_text())
    validate_operator_gate(approval,official,now())
    phrase='JT APPROVED '+plan.REF+' POSTGRES READ BACKUP NEW AGE KEY REALTIME LEDGER'
    print('Operator: verify JT explicitly approved this exact code, scopes, retention and quiesced maintenance window. JSON is not authenticated consent.')
    plan.require(input('Type '+phrase+': ') == phrase,'OPERATOR_CONFIRMATION_REQUIRED')
    # input() may have blocked indefinitely. Re-read the local evidence, then
    # revalidate at one fresh instant before any credential/target/file creation.
    confirmed_approval=json.loads(Path(args[1]).read_text())
    confirmed_official=json.loads(Path(args[2]).read_text())
    validate_operator_gate(confirmed_approval,confirmed_official,now())
    plan.require(confirmed_approval==approval and confirmed_official==official,
                 'CONFIRMED_INPUT_CHANGED_RESTART_REQUIRED')
    return execute(approval,official)


if __name__=='__main__':
    try:
        print(json.dumps(main(sys.argv[1:]),indent=2))
    except BaseException:
        print('{"status":"FAILED_OR_REJECTED","details":"SUPPRESSED_NO_SECRET_OUTPUT"}')
        sys.exit(1)
