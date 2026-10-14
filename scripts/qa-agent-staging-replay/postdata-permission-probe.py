"""Owned synthetic post-data ACL/event-trigger permission reproduction, no archives."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('restore',HERE/'controlled-restore.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
source=r.OwnCluster('supabase_admin');copy=r.OwnCluster('supabase_admin')
d=importlib.util.spec_from_file_location('diag',HERE/'safe-restore-diagnostics.py');diag=importlib.util.module_from_spec(d);d.loader.exec_module(diag)
report={'status':'FAIL_LOCAL_POSTDATA_PROBE','realArchiveRead':False,'targetWritten':False}
try:
    if sys.argv[1:]!=['--synthetic-only']:raise ValueError('SYNTHETIC_ONLY')
    source.start();copy.start()
    roles='create role postgres login nosuperuser inherit createdb createrole replication bypassrls;create role supabase_auth_admin login nosuperuser noinherit createrole;create role supabase_storage_admin login nosuperuser noinherit createrole;create role supabase_realtime_admin nologin nosuperuser noinherit;'
    roles+='grant supabase_auth_admin to postgres;'
    source.sql(roles);copy.sql(roles)
    source.sql("create schema auth authorization supabase_auth_admin;create table auth.fixture_user(id integer primary key);alter table auth.fixture_user owner to supabase_auth_admin;create table public.fixture_table(id integer primary key);alter table public.fixture_table owner to postgres;alter default privileges for role supabase_auth_admin in schema auth grant select on tables to postgres;create function public.fixture_notify() returns void language plpgsql as $$begin perform pg_notify('synthetic-only','reload schema');end$$;revoke all on function public.fixture_notify() from public;grant execute on function public.fixture_notify() to postgres;create function public.fixture_ddl_watch() returns event_trigger language plpgsql security definer as $$begin perform public.fixture_notify();end$$;alter function public.fixture_ddl_watch() owner to postgres;create event trigger fixture_watch on ddl_command_end execute function public.fixture_ddl_watch();")
    archive=r.run(source.command('pg_dump')+['-Fc','--schema-only'])
    for section in ['pre-data','post-data']:
        result=subprocess.run(copy.command('pg_restore')+['--verbose','--exit-on-error','--section='+section],input=archive,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        report[section]={'exitCode':result.returncode}
        if section=='post-data':
            # Debug harness has only hardcoded fake objects. Keep raw SQL/error
            # private in memory; expose categorical signal and safe TOC only.
            report['permissionDenied']=b'permission denied for function fixture_notify' in result.stderr
            report['tocEventBeforeAcl']=b'EVENT TRIGGER fixture_watch' in result.stderr
            report['diagnosticSha256']=__import__('hashlib').sha256(result.stderr).hexdigest()
            # Synthetic debugging only, no raw output from a real archive.
            report['baselinePostDataLastObjectClass']=diag.diagnostic(result.stderr,copy.command('pg_restore')+['--section=post-data'])['objectClass']
        elif result.returncode:raise ValueError('FIXTURE_PREDATA_FAILED')
    if report['post-data']['exitCode']!=0:raise ValueError('KNOWN_ROLE_ACL_BASELINE_FAILED')
    report['eventBeforeAclHypothesis']='REJECTED_BASELINE_POSTDATA_SUCCEEDED'
    copy.close();copy=r.OwnCluster('supabase_admin');copy.start();copy.sql(roles)
    archive=r.run(source.command('pg_dump')+['-Fc','--schema-only'])
    r.run(copy.command('pg_restore')+['--exit-on-error','--section=pre-data'],archive)
    records=[]
    try:
        diag.pipeline(source.command('pg_dump')+['-Fc','--schema-only'],copy.command('pg_restore')+['--role=postgres','--exit-on-error','--section=post-data'],False,records)
        raise ValueError('LIMITED_CALLER_NEGATIVE_NOT_REPRODUCED')
    except ValueError as e:
        if str(e)!='RESTORE_PERMISSION_DENIED':raise
    report['limitedCallerNegative']=records
    if not records or records[0]['objectClass']!='CONSTRAINT' or records[0]['permissionObjectClass']!='SCHEMA':raise ValueError('SAFE_DIAGNOSTIC_WRONG_OBJECT_CLASS')
    report['baselineKnownRoleAttrsDefaultAclAndSchema']='PASS_OWN_SUPERUSER_CALLER'
    report['actualFailedObjectOrEffectiveCaller']='UNKNOWN_NOT_ESTABLISHED_BY_SOURCE_ROLE_FLAGS'
    report['status']='PASS_LOCAL_DIAGNOSTIC_SIGNAL_ONLY_NOT_ACTUAL_ROOT_CAUSE'
except Exception as e:report['reason']=str(e) if isinstance(e,ValueError) else 'LOCAL_PROBE_FAILED'
finally:
    for db in [copy,source]:
        try:db.close()
        except Exception:report['cleanup']='FAIL'
    report.setdefault('cleanup','PASS');print(json.dumps(report,indent=2));sys.exit(0 if report['status'].startswith('PASS') else 1)
