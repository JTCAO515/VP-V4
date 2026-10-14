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
replay=load('owned_replay',HERE/'owned-replay-hook.py')
compat=load('replay_compat',HERE/'replay-restore-compat.py')
authority=load('direct_authority',HERE/'direct-human-authority.py')
locale_profile=load('owned_locale',HERE/'owned-locale-profile.py')
retry_contract=load('reviewed_retry',HERE/'reviewed-restore-retry.py')
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


def restore_bundle(directory,identity,manifest,replay_manifest=None,icu_profile=None):
    adapted,snapshot=verify_manifest(manifest)
    if replay_manifest is not None:
        plan,_=replay.load_plan(replay_manifest)
        if adapted['verification']['metadata'].get('versions')!=plan['baseline75']:
            raise ValueError('REPLAY_CAPTURE_BASELINE_NOT_EXACT_75')
    if icu_profile is not None:
        locale_profile.validate(icu_profile,adapted['verification']['databaseFacts'])
    original_class=base.OwnCluster;original_normalize=base.verify.normalize_schema;copies=[]
    class VerifiedOwnedCopy(original_class):
        def __init__(self,*args,**kwargs):
            if icu_profile is None:super().__init__(*args,**kwargs)
            else:
                # The strict constructor only accepts libc. Bootstrap through
                # the explicit ICU adapter, without declaring the source libc.
                super().__init__(args[0],None)
            copies.append(self)
        def docker(self,args,data=None):
            if icu_profile is not None:args=locale_profile.patch_owned_run(args,icu_profile)
            return super().docker(args,data)
        def start(self):
            super().start()
            if icu_profile is not None:self.icuBootstrap=locale_profile.verify_owned(self,icu_profile)
        def close(self):
            # Private restore phase defers cleanup only until this synchronous
            # adapter verifies sequences/replays. Never return this handle.
            pass
    result={'status':'FAIL_LOCAL_RESTORE','cleanup':'PENDING_OWNED_COPY'}
    base.OwnCluster=VerifiedOwnedCopy
    if replay_manifest is not None:
        base.verify.normalize_schema=lambda sql:compat.normalized(original_normalize(sql))
    try:
        result=base.restore_bundle(directory,identity,adapted)
        result['cleanup']='PENDING_OWNED_COPY'
        if result['status']=='PASS_LOCAL_BUNDLE_RESTORE_ONLY':
            if len(copies)!=1 or not copies[0].created:raise ValueError('OWNED_RESTORED_COPY_REQUIRED')
            db=copies[0]
            if icu_profile is not None:result['icuBootstrap']=db.icuBootstrap
            if replay_manifest is not None:
                result['restoreCompatibility']=compat.reinstate(db)
                result['archivedAclCompatibility']=compat.restore_archived_owner_maintain(db,adapted['verification']['metadata'])
                result['defaultAclCompatibility']=compat.verify_restore_default_acl(db,adapted['verification']['metadata'])
            result['sequenceSafety']=contract.verify_restored_sequences(db,snapshot['sequences'])
            if replay_manifest is not None:
                outcome=replay.replay_owned(db,replay_manifest);result['replay']=outcome
                if outcome['status']!='PASS_OWNED_RESTORED_REPLAY_ONLY':
                    result.update(status='FAIL_LOCAL_RESTORE_REPLAY',failedStage='owned replay before cleanup',reason=outcome['reason'])
        result['captureMode']=MODE;result['dispatchAuthority']='NONE';result['liveRestoreAuthority']='NONE'
    except Exception as e:
        result.update(status='FAIL_LOCAL_RESTORE',reason=str(e) if isinstance(e,ValueError) else 'RESTORE_ADAPTER_FAILED_DETAILS_SUPPRESSED')
    finally:
        base.OwnCluster=original_class;base.verify.normalize_schema=original_normalize
        try:
            for db in copies:original_class.close(db)
            result['cleanup']='PASS'
        except Exception:result.update(status='FAIL_LOCAL_RESTORE',cleanup='FAIL')
    return result


def code_hash():
    return hashlib.sha256((HERE/'controlled-snapshot-restore.py').read_bytes()+(HERE/'snapshot-contract.py').read_bytes()+(HERE/'owned-replay-hook.py').read_bytes()+(HERE/'replay-restore-compat.py').read_bytes()+(HERE/'direct-human-authority.py').read_bytes()+(HERE/'owned-locale-profile.py').read_bytes()+(HERE/'reviewed-restore-retry.py').read_bytes()+replay.MANIFEST_HASH.encode()+base.code_hash().encode()).hexdigest()


def main(args):
    if args in ([],['--dry-run']):return {'status':'DRY_RUN_NO_ARCHIVE_OR_DOCKER_IO','mode':MODE,'codeSha256':code_hash(),'sequenceSafety':'MONOTONE_NO_COLLISION_ONLY','realArchiveRead':False,'actualRestore':'UNRUN','optionalReplayMode':replay.MODE,'replayManifestSha256':replay.MANIFEST_HASH}
    retry_mode=len(args)==5 and args[0]=='--restore-replay-retry-from-direct-record'
    record_mode=retry_mode or (len(args)==5 and args[0]=='--restore-replay-from-direct-record')
    stage='restore-replay-retry' if retry_mode else 'restore-replay'
    with_replay=record_mode or (len(args)==5 and args[0]=='--restore-and-replay-approved')
    base.plan.require(with_replay or (len(args)==4 and args[0]=='--restore-snapshot-approved'),'SNAPSHOT_RESTORE_ARGUMENTS_REQUIRED')
    if not record_mode:base.plan.require(sys.stdin.isatty() and sys.stdout.isatty(),'HUMAN_TTY_REQUIRED')
    ap,mp,ip=map(Path,args[1:4]);plan_path=Path(args[4]) if with_replay else None;approval=json.loads(ap.read_text());manifest=json.loads(mp.read_text());verify_manifest(manifest)
    def validate():
        base.plan.require(approval.get('mode')==MODE and approval.get('codeSha256')==code_hash(),'SNAPSHOT_RESTORE_APPROVAL_CONFLICT')
        expected=['decrypt-approved-bundle','restore-own-isolated-docker','verify-no-content-output','destroy-own-restored-copy','restore-realtime-schema-migrations-ledger','verify-monotone-sequence-no-collision']
        if with_replay:
            authority.canonical_approval_id(approval.get('approvalId'))
            replay.load_plan(plan_path)
            base.plan.require(approval.get('replayMode')==replay.MODE and approval.get('replayManifestSha256')==replay.MANIFEST_HASH,'REPLAY_EXPLICIT_PLAN_APPROVAL_REQUIRED')
            base.plan.require(approval.get('actions')==expected+['replay-reviewed-missing80-owned-copy'],'SNAPSHOT_RESTORE_REPLAY_SCOPE_REQUIRED')
        else:base.plan.require(approval.get('actions')==expected,'SNAPSHOT_RESTORE_SCOPE_REQUIRED')
        proxy={**approval,'codeSha256':base.code_hash(),'actions':expected[:-1]}
        base.validate_approval(proxy,mp,ip)
    validate()
    phrase=('JT APPROVED OWNED REAL COPY RESTORE AND REPLAY NO LIVE AUTHORITY ' if with_replay else 'JT APPROVED POINT COPY RESTORE NO LIVE AUTHORITY ')+base.plan.REF
    receipt=None
    if record_mode:receipt=authority.validate_packet(approval,stage,code_hash(),base.capture.now(),base.capture.stamp)
    else:base.plan.require(input('Confirm exact scheme B bundle and sequence safety: '+phrase+': ')==phrase,'SNAPSHOT_RESTORE_CONFIRMATION_REQUIRED')
    base.plan.require(json.loads(ap.read_text())==approval,'SNAPSHOT_RESTORE_APPROVAL_CHANGED');validate()
    base.plan.require('FileVault is On.' in base.run(['fdesetup','status']).decode(),'FILEVAULT_REQUIRED')
    if record_mode:receipt=authority.validate_packet(approval,stage,code_hash(),base.capture.now(),base.capture.stamp)
    icu_profile=retry_contract.validate(authority,approval,manifest,locale_profile,base.capture.now(),base.capture.stamp) if retry_mode else None
    claim=authority.claim_restore_replay(approval,code_hash(),reviewed_retry=retry_mode) if with_replay else None
    result=restore_bundle(mp.parent,ip,manifest,plan_path,icu_profile) if retry_mode else restore_bundle(mp.parent,ip,manifest,plan_path)
    if claim:result['oneTimeRestoreClaim']=claim
    if receipt:result['directHumanAuthorization']=receipt
    return result


if __name__=='__main__':
    try:
        result=main(sys.argv[1:]);print(json.dumps(result,indent=2));sys.exit(1 if result['status'].startswith('FAIL') else 0)
    except Exception:print('{"status":"REJECTED","reason":"NO_RAW_DIAGNOSTICS"}');sys.exit(1)
