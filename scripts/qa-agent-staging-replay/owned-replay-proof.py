"""One affected proof: actual75 source + fake retained data -> sealed restore ->80 hook."""
import importlib.util
import json
import hashlib
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


restore=load('restore',HERE/'controlled-snapshot-restore.py')
snap=load('capture',HERE/'controlled-snapshot-backup.py');r=restore.base
icu_profile={'databaseFacts':{'encoding':'UTF8','collate':'en_US.UTF-8','ctype':'en_US.UTF-8','localeProvider':'i'},'icuLocale':'en-US','icuRules':None,'collationVersion':'153.121','actualCollationVersion':'153.121'} if sys.argv[1:]==['--synthetic-icu-only'] else None
report={'status':'FAIL_LOCAL_RESTORE_REPLAY_PROOF','targetRead':False,'realArchiveRead':False,'stages':[]};started=time.monotonic()


class TlsFixture(r.OwnCluster):
    def docker(self,args,data=None):
        args=list(args)
        if args[0]!='run':return super().docker(args,data)
        if icu_profile is not None:args=restore.locale_profile.patch_owned_run(args,icu_profile)
        args.remove('--rm')
        setup="while [ ! -f /tmp/ssl-ready ]; do sleep .05; done; printf 'local all all trust\\nhostssl all cli_login_postgres 127.0.0.1/32 scram-sha-256\\nhostssl all cli_login_postgres ::1/128 scram-sha-256\\n' > /tmp/restore-db/pg_hba.conf; "
        args[-1]=args[-1].replace('exec postgres -D /tmp/restore-db -c listen_addresses=',setup+'exec postgres -D /tmp/restore-db -c ssl=on -c ssl_cert_file=/tmp/snapshot.crt -c ssl_key_file=/tmp/snapshot.key -c listen_addresses=localhost')
        result=super().docker(args,data);self.created=True
        with tempfile.TemporaryDirectory(dir=r.ROOT/'artifacts/QAWEB/staging-replay',prefix='replay-tls-') as tmp:
            d=Path(tmp);(d/'openssl.cnf').write_text('[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=v3\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:TRUE\n')
            r.run(['/usr/bin/openssl','req','-x509','-nodes','-newkey','rsa:2048','-days','1','-config',str(d/'openssl.cnf'),'-keyout',str(d/'key'),'-out',str(d/'cert')])
            for source_file,dest in [('key','snapshot.key'),('cert','snapshot.crt')]:super().docker(['exec','-i',self.name,'sh','-c','umask 077; cat > /tmp/'+dest],(d/source_file).read_bytes())
            super().docker(['exec',self.name,'touch','/tmp/ssl-ready'])
        return result


source=TlsFixture('supabase_admin')
try:
    if sys.argv[1:] not in (['--synthetic-only'],['--synthetic-icu-only']):raise ValueError('SYNTHETIC_ONLY')
    plan,sql_sources=restore.replay.load_plan();source.start()
    if icu_profile is not None:report['icuProfile']=restore.locale_profile.verify_owned(source,icu_profile)
    source.sql('create role postgres login createrole bypassrls;alter database postgres owner to postgres;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role dashboard_user nologin;create role supabase_realtime_admin nologin;')
    roles=json.loads(source.sql("select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper)) from pg_roles;"))
    r.managed.prepare(source,{'bootstrapRole':'supabase_admin','metadata':{'extensions':r.managed.EXTENSIONS,'roles':roles,'schema_acl':[{'schema':'extensions','owner':'postgres'},{'schema':'vault','owner':'supabase_admin'}]}},r.verify.quote,r.verify.literal)
    bootstrap=restore.replay.git_read('scripts/qa-agent-independent-init/local-pg-bootstrap.sql').decode()
    for line in ['create role anon nologin;','create role authenticated nologin;','create role service_role nologin bypassrls;']:
        if bootstrap.count(line)!=1:raise ValueError('FIXTURE_BOOTSTRAP_ROLE_CONFLICT')
        bootstrap=bootstrap.replace(line,'-- existing owned fixture role')
    source.sql('set role postgres;'+bootstrap+'alter table auth.users add column is_anonymous boolean default false;create schema storage;create table storage.objects(id int);create table storage.buckets(id int);create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text);alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;reset role;')
    report['currentStage']='reconstruct actual75 original schema in own fixture'
    for item in sql_sources:
        if item['version'] in plan['baseline75']:source.sql('set role postgres;'+restore.replay.migration_transaction(item)+'reset role;')
    source.sql((r.ROOT/'tests/fixtures/v5-staging-migration/baseline.sql').read_text())
    report['stages'].append('PASS exact75 original-source baseline with fake auth/trip/revoked-consent/budget rows')
    source.sql("create schema realtime authorization supabase_realtime_admin;create table realtime.schema_migrations(version bigint primary key,inserted_at timestamp(0) without time zone);alter table realtime.schema_migrations owner to supabase_admin;insert into realtime.schema_migrations select n,'2026-01-01'::timestamp from generate_series(1,89)n;create table realtime.messages(id bigint) partition by range(id);alter table realtime.messages owner to supabase_realtime_admin;create table realtime.subscription(id bigint);alter table realtime.subscription owner to supabase_realtime_admin;grant usage on schema realtime,vault to postgres;grant select on all tables in schema realtime,vault to postgres;")
    password=secrets.token_urlsafe(24);source.sql("create role cli_login_postgres login password '"+password+"';grant postgres to cli_login_postgres;")
    env={k:os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ};env['PGPASSWORD']=password;password=None
    prefix=['docker','--context',source.context,'exec','-i','-e','PGPASSWORD',source.name,'env','PGSSLMODE=verify-full','PGSSLROOTCERT=/tmp/snapshot.crt']
    conn=['-h','localhost','-U','cli_login_postgres','-d','postgres']
    argv=prefix+['psql',*conn,'-X','-q','-At','-w','-v','ON_ERROR_STOP=1']
    dumps=[('data14.dump.age.partial',prefix+['pg_dump',*conn,'--role=postgres','-Fc',*['--schema='+s for s in r.plan.SCHEMAS]]),('schema-all.dump.age.partial',prefix+['pg_dump',*conn,'--role=postgres','-Fc','--schema-only']),
           (r.ledger.ARCHIVE,prefix+['pg_dump',*conn,'--role=postgres','-Fc','--data-only','--table='+r.ledger.RELATION]),('roles.sql.age.partial',prefix+['pg_dumpall','-h','localhost','-U','cli_login_postgres','--role=postgres','--roles-only','--no-role-passwords'])]
    with tempfile.TemporaryDirectory(dir=r.ROOT/'artifacts/QAWEB/staging-replay',prefix='replay-hook-proof-') as tmp:
        d=Path(tmp);key=d/'synthetic.agekey';r.run(['age-keygen','-o',str(key)]);os.chmod(key,0o600)
        recipient=r.run(['age-keygen','-y',str(key)]).decode().strip()
        manifest=snap.capture_group(argv,env,dumps,d,key,recipient,120)
        report['stages'].append('PASS four encrypted archives share75/ledger snapshot; no target/archive input')
        report['currentStage']='owned restore and80 replay before cleanup'
        original_normalize=r.verify.normalize_schema;schema_samples=[]
        def diagnostic_schema(sql):
            normalized=original_normalize(sql);schema_samples.append(dict(normalized))
            if len(schema_samples)==2:
                first,last=schema_samples
                report['schemaDifferenceHeaders']=[{'header':k,'beforeSha256':hashlib.sha256(first.get(k,'').encode()).hexdigest(),'afterSha256':hashlib.sha256(last.get(k,'').encode()).hexdigest()} for k in sorted(set(first)|set(last)) if first.get(k)!=last.get(k)]
                key='-- Name: turn_feedback; Type: TABLE; Schema: public; Owner: postgres'
                if first.get(key)!=last.get(key):
                    report['syntheticFeedbackDdlChangedLines']={'before':[line for line in first[key].splitlines() if line not in last[key].splitlines()],'after':[line for line in last[key].splitlines() if line not in first[key].splitlines()]}
            return normalized
        original_acl_repair=restore.compat.restore_archived_owner_maintain
        def diagnostic_acl(db,metadata):
            report['archivedAclDifferences']=[]
            for row in metadata['relations']:
                if row['kind'] not in ('r','p','v','m'):continue
                relation=r.verify.quote(row['schema'])+'.'+r.verify.quote(row['name'])
                actual=db.sql("select coalesce(relacl::text,'NULL') from pg_class where oid='"+relation+"'::regclass;")
                expected=row['acl'] if row['acl'] is not None else 'NULL'
                if actual!=expected:report['archivedAclDifferences'].append({'relation':row['schema']+'.'+row['name'],'owner':row['owner'],'expected':expected,'actual':actual})
            return original_acl_repair(db,metadata)
        restore.compat.restore_archived_owner_maintain=diagnostic_acl
        r.verify.normalize_schema=diagnostic_schema
        try:result=restore.restore_bundle(d,key,manifest,r.ROOT/'artifacts/QAWEB/staging-replay/reviewed-replay-manifest.json',icu_profile)
        finally:r.verify.normalize_schema=original_normalize;restore.compat.restore_archived_owner_maintain=original_acl_repair
        report['restoreReplay']=result
        if result['status']!='PASS_LOCAL_BUNDLE_RESTORE_ONLY' or result.get('replay',{}).get('status')!='PASS_OWNED_RESTORED_REPLAY_ONLY' or result['cleanup']!='PASS':raise ValueError('OWNED_RESTORE_REPLAY_PROOF_FAILED')
        report['stages'].append('PASS actual local restore -> old data/roles/ACL/count/sequence -> exact80 ->10gates/v2ACL/data/history ->owned cleanup')
    report['stages'].append('PASS synthetic keys/ciphertexts removed; real shared data and live80 remain UNRUN')
    report['status']='PASS_LOCAL_OWNED_RESTORE_REPLAY_ONLY'
except Exception as e:
    report['reason']=str(e) if isinstance(e,ValueError) else 'LOCAL_REPLAY_DIAGNOSTIC_SUPPRESSED'
finally:
    if 'env' in locals():env.pop('PGPASSWORD',None)
    try:source.close();report['sourceCleanup']='PASS'
    except Exception:report.update(status='FAIL_LOCAL_RESTORE_REPLAY_PROOF',sourceCleanup='FAIL')
    report['elapsedSeconds']=round(time.monotonic()-started,3)
    print(json.dumps(report,indent=2));sys.exit(0 if report['status'].startswith('PASS') else 1)
