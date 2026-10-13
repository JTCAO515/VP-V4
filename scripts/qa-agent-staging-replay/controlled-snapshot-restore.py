"""Scheme B restore adapter. Original restore/capture source bytes stay intact."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


base=load('isolated_restore',HERE/'controlled-restore.py')
contract=load('snapshot_contract',HERE/'snapshot-contract.py')
MODE='shared-readonly-snapshot/1'
RESTORE_CONTRACT='qaw-shared-snapshot-restoration/1'


def verify_manifest(manifest):
    v=manifest.get('verification',{})
    snapshot=v.get('sharedSnapshot',{})
    if manifest.get('captureMode')!=MODE or v.get('contract')!=RESTORE_CONTRACT:
        raise ValueError('SHARED_SNAPSHOT_CONTRACT_REQUIRED')
    if snapshot.get('status')!='ALL_IMPORTS_EXPORTER_ALIVE' or snapshot.get('dispatchAuthority')!='NONE' or snapshot.get('liveRestoreAuthority')!='NONE':
        raise ValueError('SNAPSHOT_AUTHORITY_BOUNDARY_REQUIRED')
    if snapshot.get('catalogBoundary')!='LIVE_BEFORE_AFTER_MATCH' or snapshot.get('pgDumpFiles')!=3 or not isinstance(snapshot.get('sequences'),list):
        raise ValueError('SNAPSHOT_CONSISTENCY_EVIDENCE_REQUIRED')
    if not isinstance(snapshot.get('catalogSha256'),str) or len(snapshot['catalogSha256'])!=64:
        raise ValueError('SNAPSHOT_CATALOG_DIGEST_REQUIRED')
    adapted=copy.deepcopy(manifest);adapted['verification']['contract']='qaw-restore-verification/2'
    base.bundle_preflight(adapted)
    return adapted,snapshot


def restore_bundle(directory,identity,manifest):
    adapted,snapshot=verify_manifest(manifest)
    checks=[];original_class=base.OwnCluster
    class SequenceCheckedCluster(original_class):
        def close(self):
            try:
                if self.created:
                    try:checks.append(contract.verify_restored_sequences(self,snapshot['sequences']))
                    except Exception as e:checks.append({'status':'FAIL_SEQUENCE_SAFETY','reason':str(e) if isinstance(e,ValueError) else 'SEQUENCE_CHECK_UNAVAILABLE'})
            finally:super().close()
    # Only this private module's factory is replaced; no repository source or
    # other caller namespace changes. Cleanup still runs even if checks fail.
    base.OwnCluster=SequenceCheckedCluster
    try:result=base.restore_bundle(directory,identity,adapted)
    finally:base.OwnCluster=original_class
    if result['status']=='PASS_LOCAL_BUNDLE_RESTORE_ONLY':
        if len(checks)!=1 or checks[0]['status']!='PASS_MONOTONE_SEQUENCE_NO_COLLISION':
            result.update(status='FAIL_LOCAL_RESTORE',failedStage='scheme B sequence safety',reason=checks[0].get('reason','SEQUENCE_CHECK_UNAVAILABLE') if checks else 'SEQUENCE_CHECK_UNAVAILABLE')
        else:result['sequenceSafety']=checks[0]
    result['captureMode']=MODE;result['dispatchAuthority']='NONE';result['liveRestoreAuthority']='NONE'
    return result


def code_hash():
    return hashlib.sha256((HERE/'controlled-snapshot-restore.py').read_bytes()+(HERE/'snapshot-contract.py').read_bytes()+base.code_hash().encode()).hexdigest()


def main(args):
    if args in ([],['--dry-run']):return {'status':'DRY_RUN_NO_ARCHIVE_OR_DOCKER_IO','mode':MODE,'codeSha256':code_hash(),'sequenceSafety':'MONOTONE_NO_COLLISION_ONLY','realArchiveRead':False,'actualRestore':'UNRUN'}
    base.plan.require(len(args)==4 and args[0]=='--restore-snapshot-approved','SNAPSHOT_RESTORE_ARGUMENTS_REQUIRED')
    base.plan.require(sys.stdin.isatty() and sys.stdout.isatty(),'HUMAN_TTY_REQUIRED')
    ap,mp,ip=map(Path,args[1:]);approval=json.loads(ap.read_text());manifest=json.loads(mp.read_text());verify_manifest(manifest)
    def validate():
        base.plan.require(approval.get('mode')==MODE and approval.get('codeSha256')==code_hash(),'SNAPSHOT_RESTORE_APPROVAL_CONFLICT')
        expected=['decrypt-approved-bundle','restore-own-isolated-docker','verify-no-content-output','destroy-own-restored-copy','restore-realtime-schema-migrations-ledger','verify-monotone-sequence-no-collision']
        base.plan.require(approval.get('actions')==expected,'SNAPSHOT_RESTORE_SCOPE_REQUIRED')
        proxy={**approval,'codeSha256':base.code_hash(),'actions':expected[:-1]}
        base.validate_approval(proxy,mp,ip)
    validate()
    phrase='JT APPROVED POINT COPY RESTORE NO LIVE AUTHORITY '+base.plan.REF
    base.plan.require(input('Confirm exact scheme B bundle and sequence safety: '+phrase+': ')==phrase,'SNAPSHOT_RESTORE_CONFIRMATION_REQUIRED')
    base.plan.require(json.loads(ap.read_text())==approval,'SNAPSHOT_RESTORE_APPROVAL_CHANGED');validate()
    base.plan.require('FileVault is On.' in base.run(['fdesetup','status']).decode(),'FILEVAULT_REQUIRED')
    return restore_bundle(mp.parent,ip,manifest)


if __name__=='__main__':
    try:
        result=main(sys.argv[1:]);print(json.dumps(result,indent=2));sys.exit(1 if result['status'].startswith('FAIL') else 0)
    except Exception:print('{"status":"REJECTED","reason":"NO_RAW_DIAGNOSTICS"}');sys.exit(1)
