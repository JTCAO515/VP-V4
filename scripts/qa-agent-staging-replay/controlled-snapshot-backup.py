"""Scheme B candidate: separate opt-in gate, original strict capture unchanged.
No real operation unless JT explicitly approves exact mode/scopes/boundaries and
an operator confirms at a TTY. Root's technical choice alone is not authority.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import uuid
from datetime import timedelta
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


cap=load('strict_capture',HERE/'controlled-backup.py')
protocol=load('snapshot_protocol',HERE/'shared-snapshot.py')
contract=load('snapshot_contract',HERE/'snapshot-contract.py')
plan=cap.plan
MODE='shared-readonly-snapshot/1'
BOUNDARIES=['application_ddl_and_migrations','managed_realtime_migrations','roles_and_memberships','acl_and_policy_ddl','extension_and_ledger_schema']
ACTIONS=sorted(cap.APPROVAL_ACTIONS+['hold-bounded-readonly-exporter','allow-concurrent-dml-at-fixed-snapshot','validate-monotone-sequences-no-live-restore'])


def code_hash():
    files=['controlled-snapshot-backup.py','shared-snapshot.py','snapshot-contract.py']
    return hashlib.sha256(b''.join((HERE/f).read_bytes() for f in files)+cap.code_hash().encode()).hexdigest()


def validate_gate(a,official,instant):
    plan.require(a.get('mode')==MODE and a.get('codeSha256')==code_hash(),'SNAPSHOT_MODE_APPROVAL_REQUIRED')
    plan.require(a.get('approvedBy')=='JT' and sorted(a.get('actions',[]))==ACTIONS,'SNAPSHOT_EXPLICIT_AUTHORITY_REQUIRED')
    plan.require(a.get('pointOnlyNoLiveRestoreOrDispatch') is True,'SNAPSHOT_LIVE_AUTHORITY_FORBIDDEN')
    plan.require(isinstance(a.get('exporterLifetimeSeconds'),int) and 30<=a['exporterLifetimeSeconds']<=600,'SNAPSHOT_EXPORTER_BOUND_REQUIRED')
    decision=a.get('decisionEvidence',{})
    plan.require(decision.get('chosenBy')=='Main' and decision.get('scheme')=='B' and isinstance(decision.get('evidenceRef'),str) and decision['evidenceRef'].strip() and re.fullmatch('[a-f0-9]{64}',decision.get('evidenceSha256','')),'SNAPSHOT_ROOT_DECISION_EVIDENCE_REQUIRED')
    confirmations=a.get('catalogBoundaryConfirmations',{})
    plan.require(set(confirmations)==set(BOUNDARIES),'SNAPSHOT_CATALOG_OWNER_EVIDENCE_REQUIRED')
    for confirmation in confirmations.values():
        plan.require(confirmation.get('confirmed') is True and isinstance(confirmation.get('owner'),str) and confirmation['owner'].strip()
                     and isinstance(confirmation.get('evidenceRef'),str) and confirmation['evidenceRef'].strip() and re.fullmatch('[a-f0-9]{64}',confirmation.get('evidenceSha256',''))
                     and cap.stamp(confirmation['validFrom'])<=instant and cap.stamp(confirmation['validUntil'])>=cap.stamp(a['windowEnd']),
                     'SNAPSHOT_CATALOG_OWNER_EVIDENCE_REQUIRED')
    # Validate the same fixed target/UUID/destination/time rules directly.
    # Never fabricate the original all-DML-quiescence boolean for this mode.
    plan.require(a.get('target')==plan.REF and a.get('organization')==plan.ORGANIZATION,'APPROVAL_TARGET_CONFLICT')
    plan.require(str(uuid.UUID(a.get('approvalId','')))==a['approvalId'],'ONE_TIME_APPROVAL_ID_REQUIRED')
    start,end=cap.stamp(a['windowStart']),cap.stamp(a['windowEnd'])
    plan.require(start<=instant and instant+timedelta(minutes=20)<=end and end-start<=timedelta(hours=4),'MAINTENANCE_WINDOW_INVALID')
    plan.require(end<cap.stamp(a['retainUntil']) and bool(a.get('restoreDestination')),'RETENTION_AND_RESTORE_DESTINATION_REQUIRED')
    plan.require(a.get('archiveDirectory')==plan.ARCHIVE_ROOT and a.get('identityDirectory')==plan.IDENTITY_ROOT,'APPROVAL_DESTINATION_CONFLICT')
    plan.require(official.get('link_id')==plan.ACCOUNT['link_id'] and official.get('project')==plan.REF,'OFFICIAL_ACCOUNT_EVIDENCE_REQUIRED')
    plan.require(timedelta(0)<=instant-cap.stamp(official['observedAt'])<=timedelta(minutes=5),'FRESH_OFFICIAL_EVIDENCE_REQUIRED')
    plan.validate_versions(official['versions'])
    pinned=json.loads((cap.ROOT/'artifacts/QAWEB/staging-replay/probe-official-metadata.json').read_text())
    for field in ('schemas','event_triggers'):plan.require(official[field]==pinned[field],'UNKNOWN_TARGET_CATALOG_REVIEW_REQUIRED')
    plan.require(not os.path.lexists(Path(plan.ARCHIVE_ROOT)/('approval-'+a['approvalId']+'.used.json')),'APPROVAL_ALREADY_USED')


def psql_command(port):
    return [plan.PG_ROOT+'/psql','-X','-q','-At','-w','-v','ON_ERROR_STOP=1','-h','db.'+plan.REF+'.supabase.co','-p',str(port),'-U','cli_login_postgres','-d','postgres']


def live_evidence(argv,env):
    session=protocol.PsqlSession(argv,env,lifetime=30).start()
    try:
        transport=json.loads(session.query("select jsonb_build_object('sessionUser',session_user,'ssl',(select ssl from pg_stat_ssl where pid=pg_backend_pid()));")[0])
        lines=session.query('begin read only;set local role postgres;'+contract.metadata_sql()+contract.STRUCTURE_SQL+'rollback;')
        metadata=json.loads(lines[0]);metadata['tls']={'ssl':transport['ssl'],'visibilityBasis':'same_connection_session_user_before_SET_ROLE'}
        return metadata,contract.catalog_evidence(metadata,lines[1])
    finally:session.close()


def capture_group(argv,env,dumps,directory,identity,recipient,lifetime,role='postgres',between_dumps=None,after_point_ready=None):
    """Shared engine, exercised by own TLS fixture; dumps supplied as fixed scope."""
    expected_files=['data14.dump.age.partial','schema-all.dump.age.partial',cap.platform_ledger.ARCHIVE,'roles.sql.age.partial']
    plan.require([name for name,_ in dumps]==expected_files,'SNAPSHOT_FOUR_SCOPE_FILES_REQUIRED')
    before_meta,before=live_evidence(argv,env)
    exporter=protocol.Exporter(argv,env,lifetime,role).start();entries=[]
    try:
        plan.require(exporter.transportProof=={'sessionUser':'cli_login_postgres','ssl':True},'SNAPSHOT_EXPORTER_TLS_IDENTITY_REQUIRED')
        point=json.loads(exporter.imported(contract.metadata_sql())[0])
        point['tls']={'ssl':True,'visibilityBasis':'exporter_transport_session_user_before_SET_ROLE'}
        source_evidence=contract.catalog_evidence(point,exporter.imported(contract.STRUCTURE_SQL)[0])
        contract.assert_evidence_stable(before,source_evidence)
        plan.require(point['storage_objects']==point['storage_buckets']==0,'STORAGE_BYTES_RECOVERY_PLAN_REQUIRED')
        expected=contract.expectations(exporter,point)
        sequences=contract.sequence_expectations(exporter)
        if after_point_ready:after_point_ready(exporter)
        for index,(filename,dump) in enumerate(dumps):
            destination=directory/filename
            if filename!='roles.sql.age.partial':
                protocol.seal_guarded(dump+[exporter.dump_argument()],env,recipient,destination,exporter)
            else:
                protocol.seal_guarded(dump,env,recipient,destination,exporter,snapshot_required=False)
            listing=cap.validate_ciphertext(identity,destination,custom=filename!='roles.sql.age.partial')
            exporter.checkpoint()
            if filename==cap.platform_ledger.ARCHIVE:cap.platform_ledger.validate_toc(listing)
            if filename=='data14.dump.age.partial':
                for r in point['relations']:
                    kind={'r':'TABLE DATA','S':'SEQUENCE SET','m':'MATERIALIZED VIEW DATA'}.get(r['kind'])
                    if kind:plan.require(kind+' '+r['schema']+' '+r['name']+' ' in listing,'SNAPSHOT_DATA_TOC_MISSING')
            if filename=='schema-all.dump.age.partial':
                for event in point['event_triggers'] or []:plan.require('EVENT TRIGGER - '+event['name']+' ' in listing,'SNAPSHOT_EVENT_TOC_MISSING')
            digest=hashlib.sha256()
            with destination.open('rb') as f:
                for chunk in iter(lambda:f.read(1024*1024),b''):digest.update(chunk)
            entries.append({'file':filename,'bytes':destination.stat().st_size,'sha256':digest.hexdigest(),'fullIntegrity':'PASS'})
            if between_dumps:between_dumps(index,exporter)
        exporter.checkpoint()
        after_meta,after=live_evidence(argv,env)
        contract.assert_evidence_stable(before,after);exporter.checkpoint()
        expected['contract']='qaw-shared-snapshot-restoration/1'
        expected['sharedSnapshot']={'status':'ALL_IMPORTS_EXPORTER_ALIVE','idSha256':hashlib.sha256(exporter.snapshot.encode()).hexdigest(),
            'exportRecordedAt':exporter.exportRecordedAt,'catalogBoundary':'LIVE_BEFORE_AFTER_MATCH',
            'catalogSha256':contract.verify.fingerprint(before),'pgDumpFiles':3,'imports':exporter.imports,'sequences':sequences,
            'dispatchAuthority':'NONE','liveRestoreAuthority':'NONE','laterDmlIncluded':False,'sequenceStateIsNotMvcc':True}
        return {'status':'ENCRYPTED_CAPTURE_INTEGRITY_PASS_RESTORE_UNRUN','target':plan.REF,'captureMode':MODE,'entries':entries,
                'verification':expected,'sequenceSafety':'REQUIRES_ISOLATED_RESTORE_CHECK','liveRestoreAuthority':'NONE','dispatchAuthority':'NONE'}
    finally:exporter.close()


def execute(a,official):
    # This path is not run during candidate preparation/local proof.
    plan.require('FileVault is On.' in cap.probe.checked(['fdesetup','status']),'FILEVAULT_REQUIRED')
    for tool in ('pg_dump','pg_dumpall','pg_restore','psql'):
        plan.require(re.search(r'\b17\.',cap.probe.checked([plan.PG_ROOT+'/'+tool,'--version'])),'PG17_REQUIRED')
    projects=json.loads(cap.probe.checked(['supabase','projects','list','--output-format','json']))['projects']
    matching=[p for p in projects if p.get('id')==plan.REF and p.get('organization_id')==plan.ORGANIZATION and p.get('name')=='VP - V4' and p.get('status')=='ACTIVE_HEALTHY' and p.get('database',{}).get('version')=='17.6.1.155']
    plan.require(len(matching)==1,'CLI_PROJECT_CONFLICT')
    password=cap.probe.parse_credentials(cap.probe.checked(['supabase','db','dump','--linked','--project-ref',plan.REF,'--dry-run']))
    relay=cap.load('snapshot_relay',HERE/'backup-relay.py');archive_dir=None
    with tempfile.TemporaryDirectory(prefix='snapshot-ca-',dir=cap.ROOT/'artifacts/QAWEB/staging-replay') as tmp:
        with cap.probe.urllib.request.urlopen(plan.CA_URL,timeout=15) as response:ca_bytes=response.read(32769)
        plan.require(hashlib.sha256(ca_bytes).hexdigest()==plan.CA_HASH,'CA_PIN_CONFLICT')
        ca=Path(tmp)/'root.crt';ca.write_bytes(ca_bytes)
        with relay.direct_relay() as (address,port):
            env={k:os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ}
            env.update(PGPASSWORD=password,PGHOSTADDR=address,PGSSLMODE='verify-full',PGSSLROOTCERT=str(ca),PGCONNECT_TIMEOUT='8',
                       PGGSSENCMODE='disable',PGOPTIONS='-c default_transaction_read_only=on',LC_ALL='C');password=None
            try:
                argv=psql_command(port);metadata,_=live_evidence(argv,env)
                plan.require(metadata['session_user']=='cli_login_postgres' and metadata['current_user']=='postgres' and metadata['read_only']=='on' and metadata['tls']['ssl'],'SNAPSHOT_ROLE_TLS_READONLY_REQUIRED')
                plan.validate_versions(metadata['versions'])
                for field in ('versions','schemas','event_triggers'):plan.require(metadata[field]==official[field],'FRESH_OFFICIAL_METADATA_CONFLICT')
                plan.require(all(r['select'] for r in metadata['relations']),'ROLE_CANNOT_READ_ALL_SCOPED_RELATIONS')
                # Verify snapshot expectations BEFORE key creation via a short
                # probe exporter; the capture exporter later gets its own point.
                probe_exporter=protocol.Exporter(argv,env,30).start()
                try:
                    point=json.loads(probe_exporter.imported(contract.metadata_sql())[0])
                    plan.require(point['storage_objects']==point['storage_buckets']==0,'STORAGE_BYTES_RECOVERY_PLAN_REQUIRED')
                    contract.expectations(probe_exporter,point);contract.sequence_expectations(probe_exporter)
                finally:probe_exporter.close()
                plan.require(cap.now()+timedelta(minutes=12)<cap.stamp(a['windowEnd']),'SNAPSHOT_WINDOW_TOO_SHORT')
                marker=cap.now().strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
                archive_root=cap.secure_directory(plan.ARCHIVE_ROOT)
                cap.exclusive_json(archive_root/('approval-'+a['approvalId']+'.used.json'),{'approvalId':a['approvalId'],'mode':MODE,'codeSha256':code_hash()})
                archive_dir=archive_root/marker;archive_dir.mkdir(mode=0o700)
                key_dir=cap.secure_directory(plan.IDENTITY_ROOT)/marker;key_dir.mkdir(mode=0o700)
                cap.exclusive_json(archive_dir/'STARTED.json',{'status':'INCOMPLETE_DO_NOT_RESTORE','mode':MODE,'approval':a})
                identity=key_dir/'recovery.agekey';cap.probe.checked(['age-keygen','-o',str(identity)]);os.chmod(identity,0o600)
                recipient=cap.probe.checked(['age-keygen','-y',str(identity)]).strip();plan.require(recipient.startswith('age1'),'AGE_RECIPIENT_INVALID')
                connect=['-h','db.'+plan.REF+'.supabase.co','-p',str(port),'-U','cli_login_postgres','--role=postgres']
                dumps=[('data14.dump.age.partial',[plan.PG_ROOT+'/pg_dump','-Fc','--strict-names','-d','postgres',*connect,*['--schema='+s for s in plan.SCHEMAS]]),
                       ('schema-all.dump.age.partial',[plan.PG_ROOT+'/pg_dump','-Fc','--schema-only','-d','postgres',*connect]),
                       (cap.platform_ledger.ARCHIVE,[plan.PG_ROOT+'/pg_dump','-Fc','--data-only','--strict-names','--table='+cap.platform_ledger.RELATION,'-d','postgres',*connect]),
                       ('roles.sql.age.partial',[plan.PG_ROOT+'/pg_dumpall','--roles-only','--no-role-passwords',*connect])]
                result=capture_group(argv,env,dumps,archive_dir,identity,recipient,a['exporterLifetimeSeconds'])
                result.update(retainUntil=a['retainUntil'],restoreDestination=a['restoreDestination'],codeSha256=code_hash())
                cap.exclusive_json(archive_dir/'CAPTURED_RESTORE_UNRUN.json',result);return result
            except BaseException:
                if archive_dir:cap.exclusive_json(archive_dir/'FAILED_QUARANTINE.json',{'status':'FAILED_DO_NOT_RESTORE','mode':MODE})
                raise
            finally:env.pop('PGPASSWORD',None)


def main(args):
    if args in ([],['--dry-run']):return {'status':'DRY_RUN_NO_TARGET_IO','mode':MODE,'codeSha256':code_hash(),'originalStrictCaptureHash':cap.code_hash(),'actionsRequiringJTApproval':ACTIONS,'catalogBoundaryTypes':BOUNDARIES,'realCapture':'UNRUN','sequenceSafety':'REQUIRES_ISOLATED_RESTORE'}
    plan.require(len(args)==3 and args[0]=='--snapshot-execute','SNAPSHOT_ARGUMENTS_REQUIRED')
    plan.require(sys.stdin.isatty() and sys.stdout.isatty(),'HUMAN_TTY_REQUIRED')
    ap,op=map(Path,args[1:]);a=json.loads(ap.read_text());official=json.loads(op.read_text());validate_gate(a,official,cap.now())
    phrase='JT APPROVED SCHEME B POINT COPY NO LIVE AUTHORITY '+plan.REF
    plan.require(input('Confirm exact scheme B authority and DDL/DCL owner evidence: '+phrase+': ')==phrase,'SNAPSHOT_CONFIRMATION_REQUIRED')
    aa=json.loads(ap.read_text());oo=json.loads(op.read_text());validate_gate(aa,oo,cap.now())
    plan.require(aa==a and oo==official,'SNAPSHOT_CONFIRMED_INPUT_CHANGED')
    return execute(a,official)


if __name__=='__main__':
    try:print(json.dumps(main(sys.argv[1:]),indent=2))
    except BaseException:print('{"status":"FAILED_OR_REJECTED","reason":"NO_RAW_DIAGNOSTICS"}');sys.exit(1)
