"""Real strict restore of self-generated archives into fresh offline copies."""
from datetime import datetime,timezone,timedelta
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
core=load('real_core',ROOT/'controlled-snapshot-restore.py');r=core.base
protocol=load('own_exporter',ROOT/'shared-snapshot.py')

def budget(seconds=20):
    # Preserve the original120s cleanup reserve; only fixture data time varies.
    return core.diagnostic_deadline.Budget(time.monotonic()+120+seconds,wall_end=datetime.now(timezone.utc)+timedelta(seconds=120+seconds))

def configuration():
    return {'mode':'same-copy-typed-postdata/1','sourceLockSha256':hashlib.sha256((HERE/'source-lock.json').read_bytes()).hexdigest(),'windowBindingSha256':hashlib.sha256(b'SYNTHETIC-ONLY-NO-ACTUAL-WINDOW').hexdigest()}

class StrictSyntheticRestore(unittest.TestCase):
    def fixture(self,mode='normal'):
        source=r.OwnCluster('supabase_admin');source.start()
        source_id=json.loads(source.docker(['inspect',source.name]))[0]['Id']
        def cleanup_source():
            info=json.loads(source.docker(['inspect',source.name]))[0]
            self.assertEqual(info['Id'],source_id);self.assertEqual(info['Config']['Labels']['qaw.restore.owner'],source.nonce)
            source.close()
        self.addCleanup(cleanup_source)
        source.sql('create role postgres login createrole bypassrls;create role supabase_realtime_admin nologin;alter database postgres owner to postgres;')
        for schema in r.plan.SCHEMAS:
            q=r.verify.quote(schema);source.sql('create schema if not exists '+q+';create table '+q+'.synthetic(id int primary key,value text);insert into '+q+".synthetic values(1,'synthetic-only');")
        source.sql("create table storage.objects(id int);create table storage.buckets(id int);create table supabase_migrations.schema_migrations(version text);create schema vault;create table vault.secrets(id int);create schema realtime authorization supabase_realtime_admin;create table realtime.schema_migrations(version bigint primary key,inserted_at timestamp(0) without time zone);insert into realtime.schema_migrations select n,'2026-01-01'::timestamp from generate_series(1,89)n;create table realtime.messages(id bigint) partition by range(id);alter table realtime.messages owner to supabase_realtime_admin;create table realtime.subscription(id bigint);alter table realtime.subscription owner to supabase_realtime_admin;")
        if mode!='normal':
            source.sql("alter database postgres set qaw.synthetic_source='yes';")
            body={'error':"raise exception using errcode='P0001',message='42501 SYNTHETIC_SECRET';",'timeout':'perform pg_sleep(60);return i;','resistant':'loop begin perform pg_sleep(60);exception when query_canceled then null;end;end loop;'}[mode]
            source.sql("create function public.synthetic_guard(i int) returns int immutable language plpgsql as $$begin if current_setting('qaw.synthetic_source',true)='yes' then return i;end if;if session_user<>'supabase_admin' or current_setting('application_name')<>'pg_restore' then raise exception using errcode='42501',message='context changed';end if;"+body+"end$$;create index synthetic_guard_idx on public.synthetic(public.synthetic_guard(id));")
        temp=tempfile.TemporaryDirectory(prefix='qaw-core-synthetic-');self.addCleanup(temp.cleanup);directory=Path(temp.name)
        key=directory/'synthetic.agekey';r.run(['age-keygen','-o',str(key)]);key.chmod(0o600);recipient=r.run(['age-keygen','-y',str(key)]).decode().strip()
        exporter=protocol.PsqlSession(source.command('psql')+['-X','-q','-At','-v','ON_ERROR_STOP=1']).start()
        try:
            exporter.query('begin isolation level repeatable read read only;')
            snapshot=exporter.query('select pg_export_snapshot();')[0]
            metadata=json.loads(exporter.query(core.contract.metadata_sql())[0])
            counts=json.loads(exporter.query(r.verify.counts_sql(metadata['relations']))[0]);platform=json.loads(exporter.query(r.verify.counts_sql(metadata['platform_relations']))[0])
            facts=json.loads(exporter.query("select jsonb_build_object('encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype,'localeProvider',datlocprovider) from pg_database where datname=current_database();")[0])
            logical=exporter.query(r.ledger.digest_sql())[0]
            expected={'contract':core.RESTORE_CONTRACT,'dataSchemas':list(r.plan.SCHEMAS),'metadata':metadata,'counts':counts,'platformCounts':platform,'platformSupplement':r.ledger.descriptor(logical),'databaseFacts':facts,'databaseOwner':'postgres','bootstrapRole':source.admin}
            cmds={'data14.dump.age.partial':source.command('pg_dump')+['-Fc',*['--schema='+s for s in r.plan.SCHEMAS],'--snapshot='+snapshot], 'schema-all.dump.age.partial':source.command('pg_dump')+['-Fc','--schema-only','--snapshot='+snapshot],r.ledger.ARCHIVE:source.command('pg_dump')+['-Fc','--data-only','--table='+r.ledger.RELATION,'--snapshot='+snapshot], 'roles.sql.age.partial':['docker','--context',source.context,'exec',source.name,'pg_dumpall','--roles-only','--no-role-passwords','-h','/tmp/restore-socket','-U',source.admin]}
            entries=[]
            for name,command in cmds.items():
                r.capture.seal_pipeline(command,os.environ.copy(),recipient,directory/name)
                entries.append({'file':name,'bytes':(directory/name).stat().st_size,'sha256':r.file_hash(directory/name)})
                exporter.guard()
            after=json.loads(source.sql(core.contract.metadata_sql()));core.contract.assert_catalog_stable(metadata,after)
            expected['sharedSnapshot']={'status':'ALL_IMPORTS_EXPORTER_ALIVE','idSha256':hashlib.sha256(snapshot.encode()).hexdigest(),'catalogBoundary':'LIVE_BEFORE_AFTER_MATCH','catalogSha256':r.verify.fingerprint(core.contract.catalog(metadata)),'pgDumpFiles':3,'sequences':[],'dispatchAuthority':'NONE','liveRestoreAuthority':'NONE'}
            manifest={'status':'ENCRYPTED_CAPTURE_INTEGRITY_PASS_RESTORE_UNRUN','target':r.plan.REF,'captureMode':core.MODE,'entries':entries,'verification':expected}
        finally:exporter.close()
        return directory,key,manifest
    def run_restore(self,mode='normal',seconds=20,typed=True):
        directory,key,manifest=self.fixture(mode);b=budget(seconds);initial=(b.window_end,b.data_end,b.wall_end,b.reserve)
        result=core.restore_bundle(directory,key,manifest,window_budget=b,typed_diagnostic=configuration() if typed else None)
        self.assertEqual((b.window_end,b.data_end,b.wall_end,b.reserve),initial)
        # Summaries contain statuses only, never source SQL/names/error messages.
        self.assertNotIn('SYNTHETIC_SECRET',json.dumps(result))
        self.assertEqual(result['cleanup'],'PASS',result)
        self.assertEqual(len(result['windowDeadline']['containers']),1)
        self.assertTrue(result['windowDeadline']['containers'][0]['idRemovalConfirmed'])
        return result
    def test_complete_same_copy_strict_restore(self):
        result=self.run_restore();self.assertEqual(result['status'],'PASS_LOCAL_BUNDLE_RESTORE_ONLY',result)
        record=result['safeRestoreDiagnostics'][0];self.assertIs(record['backendCommandStopped'],True);self.assertIsNone(record['firstError'])
        self.assertEqual(record['stage'],'SCHEMA_POST_DATA')
        self.assertIn('SCHEMA_PRE_DATA',result['stageProgress']['completedIoStages']);self.assertIn('SCOPED_DATA',result['stageProgress']['completedIoStages'])
    def test_real_pg_restore_typed_postdata_failure(self):
        result=self.run_restore('error');self.assertEqual(result['status'],'FAIL_LOCAL_RESTORE',result)
        record=result['safeRestoreDiagnostics'][0]
        self.assertEqual(record['firstError']['sqlstate'],'P0001');self.assertEqual(record['firstError']['provenance'],'PG_BACKEND_ERROR_RESPONSE_C_FIELD_ALLOWLIST');self.assertIs(record['backendCommandStopped'],True)
    def test_original_absolute_deadline_stops_actual_restore_backend(self):
        result=self.run_restore('timeout',seconds=8)
        self.assertTrue(result['status'].startswith('FAIL'));record=result['safeRestoreDiagnostics'][0]
        self.assertEqual(record['status'],'INCOMPLETE_DEADLINE');self.assertIs(record['backendCommandStopped'],True)
    def test_cancel_resistant_restore_backend_requires_owned_fallback(self):
        result=self.run_restore('resistant',seconds=8);self.assertTrue(result['status'].startswith('FAIL'))
        record=result['safeRestoreDiagnostics'][0];self.assertIs(record['backendCommandStopped'],True);self.assertIs(record['backendFence']['serverStopped'],True)
    def test_normal_non_diagnostic_restore_unchanged(self):
        result=self.run_restore(typed=False);self.assertEqual(result['status'],'PASS_LOCAL_BUNDLE_RESTORE_ONLY',result)
        self.assertNotIn('safeRestoreDiagnostics',result)

if __name__=='__main__':unittest.main(verbosity=2)
