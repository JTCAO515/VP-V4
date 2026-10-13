"""Own TLS/temporary-login fixture: only affected scheme B concurrency negatives."""
import copy
import importlib.util
import json
import io
import tarfile
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
import traceback
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


snap=load('snapshot_capture',HERE/'controlled-snapshot-backup.py')
restore=load('snapshot_restore',HERE/'controlled-snapshot-restore.py')
r=restore.base
report={'status':'FAIL_SYNTHETIC_SNAPSHOT_ONLY','targetRead':False,'realCredentialsOrKeys':False,'stages':[]}
started=time.monotonic()


class TlsFixture(r.OwnCluster):
    def docker(self,args,data=None):
        args=list(args)
        if args[0]!='run':return super().docker(args,data)
        args.remove('--rm');payload=args[-1]
        setup="while [ ! -f /tmp/ssl-ready ]; do sleep .05; done; printf 'local all all trust\\nhostssl all cli_login_postgres 127.0.0.1/32 scram-sha-256\\nhostssl all cli_login_postgres ::1/128 scram-sha-256\\n' > /tmp/restore-db/pg_hba.conf; "
        args[-1]=payload.replace('exec postgres -D /tmp/restore-db -c listen_addresses=',setup+'exec postgres -D /tmp/restore-db -c ssl=on -c ssl_cert_file=/tmp/snapshot.crt -c ssl_key_file=/tmp/snapshot.key -c listen_addresses=localhost')
        result=super().docker(args,data);self.created=True
        with tempfile.TemporaryDirectory(dir=r.ROOT/'artifacts/QAWEB/staging-replay',prefix='fixture-tls-') as tmp:
            d=Path(tmp);config=d/'openssl.cnf'
            config.write_text('[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=v3\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:TRUE\n')
            r.run(['/usr/bin/openssl','req','-x509','-nodes','-newkey','rsa:2048','-days','1','-config',str(config),'-keyout',str(d/'key'),'-out',str(d/'cert')])
            super().docker(['exec','-i',self.name,'/bin/sh','-c','umask 077; cat > /tmp/snapshot.key'],(d/'key').read_bytes())
            super().docker(['exec','-i',self.name,'/bin/sh','-c','umask 077; cat > /tmp/snapshot.crt'],(d/'cert').read_bytes())
            super().docker(['exec',self.name,'/bin/sh','-c','touch /tmp/ssl-ready'])
        return result


source=TlsFixture('supabase_admin');password=None;startup_ready=False
try:
    if sys.argv[1:]!=['--synthetic-only']:raise ValueError('SYNTHETIC_ONLY')
    source.start();startup_ready=True
    source.sql('create role postgres login createrole bypassrls;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role dashboard_user nologin;create role supabase_realtime_admin nologin;create role fixture_reader nologin;')
    password=secrets.token_urlsafe(24)
    source.sql("create role cli_login_postgres login password '"+password+"';grant postgres to cli_login_postgres;")
    roles=json.loads(source.sql("select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper)) from pg_roles;"))
    r.managed.prepare(source,{'bootstrapRole':'supabase_admin','metadata':{'extensions':r.managed.EXTENSIONS,'roles':roles,'schema_acl':[{'schema':'extensions','owner':'postgres'},{'schema':'vault','owner':'supabase_admin'}]}},r.verify.quote,r.verify.literal)
    source.sql('alter database postgres owner to postgres;grant usage on schema vault to postgres;grant select on vault.secrets to postgres;')
    for schema in r.plan.SCHEMAS:
        source.sql('create schema if not exists '+r.verify.quote(schema)+' authorization postgres;'+('' if schema=='public' else 'create table '+r.verify.quote(schema)+'.fixture(id int primary key);insert into '+r.verify.quote(schema)+'.fixture values(1);alter table '+r.verify.quote(schema)+'.fixture owner to postgres;'))
    source.sql("create table public.fixture(id bigint generated always as identity primary key,payload text);alter table public.fixture owner to postgres;insert into public.fixture(payload) values('fixture-before');create table public.fixture_policy(id int primary key,revoked boolean);insert into public.fixture_policy values(1,false);alter table public.fixture_policy owner to postgres;create table supabase_migrations.schema_migrations(version text primary key);alter table supabase_migrations.schema_migrations owner to postgres;")
    source.sql('create table storage.objects(id int primary key);alter table storage.objects owner to postgres;create table storage.buckets(id int primary key);alter table storage.buckets owner to postgres;')
    versions=json.loads((r.ROOT/'artifacts/QAWEB/staging-replay/observed.json').read_text())['applied']
    source.sql('insert into supabase_migrations.schema_migrations values '+','.join('('+r.verify.literal(v)+')' for v in versions)+';')
    source.sql("create schema realtime authorization supabase_realtime_admin;create table realtime.schema_migrations(version bigint primary key,inserted_at timestamp(0) without time zone);alter table realtime.schema_migrations owner to supabase_admin;insert into realtime.schema_migrations select n,'2026-01-01'::timestamp from generate_series(1,89)n;create table realtime.messages(id bigint) partition by range(id);alter table realtime.messages owner to supabase_realtime_admin;create table realtime.subscription(id bigint);alter table realtime.subscription owner to supabase_realtime_admin;grant usage on schema realtime to postgres;grant select on all tables in schema realtime to postgres;")
    # All fixture versions/rows are synthetic. This does not recreate target75
    # business schema or read any actual ledger values; prior proofs are reused.
    env={k:os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ};env['PGPASSWORD']=password;password=None
    prefix=['docker','--context',source.context,'exec','-i','-e','PGPASSWORD',source.name,'env','PGSSLMODE=verify-full','PGSSLROOTCERT=/tmp/snapshot.crt']
    connection=['-h','localhost','-U','cli_login_postgres','-d','postgres']
    argv=prefix+['psql',*connection,'-X','-q','-At','-w','-v','ON_ERROR_STOP=1']
    report['currentStage']='TLS metadata transport'
    live,baseline=snap.live_evidence(argv,env)
    if live['tls']['ssl'] is not True or live['session_user']!='cli_login_postgres' or live['current_user']!='postgres':raise ValueError('TLS_TEMPORARY_ROLE_PROOF_FAILED')
    report['transport']={'ssl':True,'sessionUser':'cli_login_postgres','effectiveRole':'postgres','passwordInArgv':False}
    report['stages'].append('PASS verify-full TLS and synthetic temporary CLI role without secret argv/output')
    wrong=prefix+['psql','-h','127.0.0.1','-U','cli_login_postgres','-d','postgres','-w','-Atc','select 1;']
    denied=subprocess.run(wrong,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
    if denied.returncode==0:raise ValueError('TLS_HOSTNAME_NEGATIVE_FAILED')
    report['stages'].append('PASS incorrect certificate hostname rejected')
    dumps=[('data14.dump.age.partial',prefix+['pg_dump',*connection,'--role=postgres','-Fc',*['--schema='+s for s in r.plan.SCHEMAS]]),
           ('schema-all.dump.age.partial',prefix+['pg_dump',*connection,'--role=postgres','-Fc','--schema-only']),
           (r.ledger.ARCHIVE,prefix+['pg_dump',*connection,'--role=postgres','-Fc','--data-only','--table='+r.ledger.RELATION]),
           ('roles.sql.age.partial',prefix+['pg_dumpall','-h','localhost','-U','cli_login_postgres','--role=postgres','--roles-only','--no-role-passwords'])]
    # Fixture postgres cannot read complete global catalogs without the exact
    # inherited privileges used in roles-only; metadata uses pg_roles, no hashes.
    with tempfile.TemporaryDirectory(dir=r.ROOT/'artifacts/QAWEB/staging-replay',prefix='snapshot-proof-') as tmp:
        d=Path(tmp);identity=d/'synthetic.agekey';r.run(['age-keygen','-o',str(identity)]);os.chmod(identity,0o600)
        recipient=r.run(['age-keygen','-y',str(identity)]).decode().strip()
        def concurrent(index,exporter):
            if index==0:
                source.sql("update public.fixture set payload='fixture-after';insert into public.fixture(payload) values('fixture-later');update public.fixture_policy set revoked=true;update realtime.schema_migrations set inserted_at=inserted_at+interval '1 hour' where version=1;")
                if exporter.imported('select revoked from public.fixture_policy;')!=['f'] or source.sql('select revoked from public.fixture_policy;')!='t':raise ValueError('LATER_REVOCATION_MIXED_WITH_SNAPSHOT')
        good_dir=d/'good';good_dir.mkdir(mode=0o700)
        report['currentStage']='concurrent DML capture'
        manifest=snap.capture_group(argv,env,dumps,good_dir,identity,recipient,60,between_dumps=concurrent,after_point_ready=lambda exporter:source.sql("insert into public.fixture(payload) values('fixture-before-dump-later');"))
        if manifest['verification']['counts']['public.fixture']!=1 or source.sql('select count(*) from public.fixture;')!='3':raise ValueError('CONCURRENT_DML_SNAPSHOT_FAILED')
        if manifest['verification']['platformSupplement']['sha256Rows']==source.sql(r.ledger.digest_sql()):raise ValueError('LATER_LEDGER_DATA_USED_AS_SNAPSHOT')
        positive=restore.restore_bundle(good_dir,identity,manifest)
        report['restore']=positive
        if positive['status']!='PASS_LOCAL_BUNDLE_RESTORE_ONLY' or positive['sequenceSafety']['sequences']!=1 or positive['sequenceSafety']['advancedBeyondSnapshotRowBound']!=1:raise ValueError('SNAPSHOT_RESTORE_FAILED')
        report['stages'].append('PASS three pg_dump+counts+ledger digest share one point despite concurrent rows/revocation/ledger updates')
        report['stages'].append('PASS later sequence advance restores above snapshot row bound; no exact-MVCC sequence claim')
        report['stages'].append('PASS point copy grants no live restore or dispatch authority')
        def role_change(index,exporter):
            if index==0:source.sql('alter role fixture_reader createrole;')
        role_dir=d/'role-drift';role_dir.mkdir(mode=0o700)
        try:snap.capture_group(argv,env,dumps,role_dir,identity,recipient,60,between_dumps=role_change)
        except ValueError as e:
            if str(e)!='SNAPSHOT_CATALOG_BOUNDARY_CHANGED':raise
        else:raise ValueError('ROLE_DDL_DRIFT_ACCEPTED')
        source.sql('alter role fixture_reader nocreaterole;')
        def ddl_change(index,exporter):
            if index==0:source.sql('alter table public.fixture add column schema_drift integer;')
        ddl_dir=d/'ddl-drift';ddl_dir.mkdir(mode=0o700)
        try:snap.capture_group(argv,env,dumps,ddl_dir,identity,recipient,60,between_dumps=ddl_change)
        except ValueError:pass
        else:raise ValueError('TABLE_DDL_DRIFT_ACCEPTED')
        source.sql('alter table public.fixture drop column schema_drift;')
        report['stages'].append('PASS table DDL drift refuses whole group; no stable-catalog assertion from old snapshot')
        def kill_between(index,exporter):
            if index==0:exporter.process.kill();exporter.process.wait()
        lost_dir=d/'lost-between';lost_dir.mkdir(mode=0o700)
        try:snap.capture_group(argv,env,dumps,lost_dir,identity,recipient,60,between_dumps=kill_between)
        except ValueError:pass
        else:raise ValueError('EXPORTER_LOSS_BETWEEN_DUMPS_ACCEPTED')
        if (lost_dir/'schema-all.dump.age.partial').exists():raise ValueError('SECOND_DUMP_STARTED_AFTER_EXPORTER_LOSS')
        report['stages'].append('PASS exporter lost after first dump: later files never start; partial group cannot pass')
        report['stages'].append('PASS independent global-role drift fails whole group; imported old catalog is not sufficient')
        def rewind(index,exporter):
            if index==0:source.sql("select setval('public.fixture_id_seq',1,false);")
        unsafe_dir=d/'unsafe-sequence';unsafe_dir.mkdir(mode=0o700)
        # Reset during the capture AFTER the point/max is selected: sequence
        # state is outside MVCC even though all three row snapshots match.
        source.sql("select setval('public.fixture_id_seq',3,true);")
        bad=snap.capture_group(argv,env,dumps,unsafe_dir,identity,recipient,60,after_point_ready=lambda exporter:source.sql("select setval('public.fixture_id_seq',1,false);"))
        unsafe=restore.restore_bundle(unsafe_dir,identity,bad)
        if unsafe.get('reason')!='RESTORED_SEQUENCE_NEXT_VALUE_UNSAFE' or unsafe.get('cleanup')!='PASS':raise ValueError('UNSAFE_SEQUENCE_ACCEPTED')
        report['stages'].append('PASS rewound nextval would collide: restore refuses and cleans owned copy')
        exporter=snap.protocol.Exporter(argv,env,60).start();exporter.process.kill();exporter.process.wait()
        try:exporter.imported('select 1;')
        except ValueError:pass
        else:raise ValueError('LOST_EXPORTER_ACCEPTED')
        finally:exporter.close()
        report['stages'].append('PASS lost exporter refuses subsequent imports; no live-data fallback')
        exporter=snap.protocol.Exporter(argv,env,60).start();exporter.started-=61
        try:exporter.imported('select 1;')
        except ValueError as e:
            if str(e)!='SNAPSHOT_DEADLINE_EXPIRED':raise
        else:raise ValueError('EXPIRED_EXPORTER_ACCEPTED')
        finally:exporter.close()
        report['stages'].append('PASS expired exporter refuses before import')
    report['stages'].append('PASS synthetic key/ciphertexts removed')
    report['status']='PASS_LOCAL_SHARED_SNAPSHOT_ONLY'
except Exception as e:
    report['reason']=str(e) if isinstance(e,ValueError) else 'LOCAL_SNAPSHOT_DIAGNOSTIC_SUPPRESSED'
    location=traceback.extract_tb(e.__traceback__)[-1]
    report['safeExceptionLocation']={'type':type(e).__name__,'file':Path(location.filename).name,'line':location.lineno}
    if source.created and not startup_ready:
        # Startup-only, before role password or fake application data creation.
        try:
            log=source.docker(['cp',source.name+':/tmp/tls.log','-'])
            with tarfile.open(fileobj=io.BytesIO(log),mode='r:*') as archive:
                content=archive.extractfile(archive.getmembers()[0]).read().decode()
            report['fixtureStartupDiagnostic']='REDACTED_UNEXPECTED_KEY_BLOCK' if 'PRIVATE KEY' in content else content[-3000:]
        except Exception:report['fixtureStartupDiagnostic']='UNAVAILABLE'
finally:
    if 'env' in locals():env.pop('PGPASSWORD',None)
    try:source.close();report['cleanup']='PASS'
    except Exception:report.update(status='FAIL_SYNTHETIC_SNAPSHOT_ONLY',cleanup='FAIL')
    report['elapsedSeconds']=round(time.monotonic()-started,3)
    print(json.dumps(report,indent=2));sys.exit(0 if report['status'].startswith('PASS') else 1)
