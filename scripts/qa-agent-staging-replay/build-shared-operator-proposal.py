"""Offline proposal builder. Never grants authority or invokes target/network tools."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import subprocess
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
MAIN=Path('/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/qaw005-main-20261013')


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


capture=module('capture',HERE/'controlled-snapshot-backup.py')
restore=module('restore',HERE/'controlled-snapshot-restore.py')


def build(main_head):
    if not re.fullmatch('[a-f0-9]{40}',main_head):raise ValueError('IMMUTABLE_MAIN_HEAD_REQUIRED')
    snapshot=json.loads((ROOT/'artifacts/QAWEB/staging-replay/observed.json').read_text())
    applied=snapshot['applied'];capture.plan.validate_versions(applied)
    def git_read(*args):
        r=subprocess.run(['git','-C',str(MAIN),*args],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=10)
        if r.returncode:raise ValueError('IMMUTABLE_MAIN_OBJECT_UNAVAILABLE')
        return r.stdout
    if git_read('rev-parse',main_head+'^{commit}').decode().strip()!=main_head:raise ValueError('MAIN_COMMIT_PIN_INVALID')
    paths=git_read('ls-tree','-r','--name-only',main_head,'supabase/migrations').decode().splitlines()
    catalog=[];blobs={}
    for relative in sorted(path for path in paths if path.endswith('.sql')):
        p=Path(relative);version=p.name.split('_')[0]
        if not re.fullmatch('[0-9]{14}',version):raise ValueError('MIGRATION_FILENAME_INVALID')
        blob=git_read('show',main_head+':'+relative);blobs[p.name]=blob
        catalog.append({'version':version,'file':p.name,'sha256':hashlib.sha256(blob).hexdigest()})
    if len(catalog)!=155 or not set(applied).issubset({m['version'] for m in catalog}):raise ValueError('CATALOG_NOT_EXPECTED_155')
    missing=[m for m in catalog if m['version'] not in set(applied)]
    if len(missing)!=80:raise ValueError('MISSING_SET_NOT_80')
    if any((ROOT/'supabase/migrations'/m['file']).read_bytes()!=blobs[m['file']] for m in catalog if m['version'] in applied):
        raise ValueError('APPLIED_SOURCE_DRIFT')
    whole=hashlib.sha256(json.dumps(catalog,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    capture_draft={'proposalOnly':True,'mode':capture.MODE,'approvedBy':None,'approvalId':None,
        'target':capture.plan.REF,'organization':capture.plan.ORGANIZATION,'codeSha256':capture.code_hash(),
        'actions':[],'requestedActions':capture.ACTIONS,'pointOnlyNoLiveRestoreOrDispatch':True,'exporterLifetimeSeconds':600,
        'windowStart':None,'windowEnd':None,'recommendedWindowMinutes':60,'retainUntil':'2026-10-20T23:59:59+08:00',
        'archiveDirectory':capture.plan.ARCHIVE_ROOT,'identityDirectory':capture.plan.IDENTITY_ROOT,
        'restoreDestination':'one owned local no-network/no-port/no-mount PostgreSQL17.6.1.155 Docker container; destroy on exit',
        'decisionEvidence':{'chosenBy':'Main','scheme':'B','evidenceRef':None,'evidenceSha256':None},
        'catalogBoundaryConfirmations':{kind:{'confirmed':False,'owner':None,'evidenceRef':None,'evidenceSha256':None,'validFrom':None,'validUntil':None} for kind in capture.BOUNDARIES}}
    restore_actions=['decrypt-approved-bundle','restore-own-isolated-docker','verify-no-content-output','destroy-own-restored-copy','restore-realtime-schema-migrations-ledger','verify-monotone-sequence-no-collision']
    return {'schemaVersion':'qaw-shared-operator-proposal/1','status':'PROPOSAL_UNAPPROVED','grantsExecutionAuthority':False,
        'direction':{'selectedTarget':capture.plan.REF,'sharedTestAndProductionDataAcknowledgedByJT':True,
                     'basis':'Root relay of latest JT shared-direction choice; direction is not an operational side-effect grant',
                     'newProjectOrNewPlatformApiKeyRequested':False},
        'sourcePins':{'candidateCodeCommit':'7e27e7af3cfaf60a958c999222d825061ac7e00d','deliveryBoundaryCommit':'e76add0b82c90eac92aa94c5069bbbdb223c6406',
            'mainSourceHeadObserved':main_head,'mainSourceMustRemainImmutableAtExecution':True,
            'currentQaMigrationSha256':next(m['sha256'] for m in catalog if m['version']=='20261013050429'),
            'catalog155Sha256':whole,'applied75VersionSha256':capture.plan.VERSION_HASH,'appliedSnapshotIsHistoricalFreshRecheckRequired':True,
            'localCaptureCodeSha256':capture.code_hash(),'localRestoreCodeSha256':restore.code_hash(),
            'image':'public.ecr.aws/supabase/postgres:17.6.1.155','imageId':restore.base.IMAGE_ID,
            'catalog':catalog,'missing80OriginalOrder':missing},
        'coverage':{'dataSchemas':list(capture.plan.SCHEMAS),'supplementalTable':'realtime.schema_migrations','observedLedgerCount':89,
            'ledgerValuesRead':False,'fourArchives':sorted(restore.base.FILES),'globalRolePasswordsExcluded':True,
            'ownerAclPreserved':True,'platformServiceDataMustStayZeroExceptApprovedLedger':True},
        'approvalGroups':[
            {'id':'privileged_capture','approved':False,'request':'Use existing same-account CLI context and SET LOCAL ROLE postgres only for fixed-target readonly exporter/catalog/14-schema+ledger encrypted capture; no GRANT or new platform key.'},
            {'id':'local_recovery_identity','approved':False,'request':'Create one fresh local AGE recovery identity and retain it separately under the fixed private FileVault identity directory.'},
            {'id':'real_data_offline_restore_replay','approved':False,'request':'Decrypt the approved shared real-data bundle only into own local offline Docker; verify schema/roles/owner/ACL/count/ledger/sequence safety and replay exact missing80 locally before any target upgrade.'},
            {'id':'ddl_dcl_stability_and_service_impact','approved':False,'request':'Coordinate the existing owners/control procedures for DDL, roles, ACL/policy definition, extension/Realtime migration stability and approved QA worker/entry pause; shared Production may be affected. No blanket DB permission or WAF rewrite.'},
            {'id':'conditional_shared80_upgrade','approved':False,'request':'Apply exactly pinned missing80 original files/order on the same shared target only after fresh target checks and real restore+80 rehearsal PASS, inside the approved window; each file is its own transaction.'}],
        'captureApprovalDraft':capture_draft,
        'restoreApprovalDraft':{'proposalOnly':True,'approvedBy':None,'mode':capture.MODE,'target':capture.plan.REF,'codeSha256':restore.code_hash(),
            'actions':[],'requestedActions':restore_actions,'manifestPath':None,'manifestSha256':None,'identityPath':None,'windowStart':None,'windowEnd':None},
        'targetUpgradeApprovalDraft':{'proposalOnly':True,'approvedBy':None,'actions':[],
            'requestedActions':['apply-exact-missing80-on-shared-target','keep-qa-worker-and-entry-off-until-separate-activation-gates'],
            'target':capture.plan.REF,'mainSourceHead':main_head,'catalog155Sha256':whole,'missing80':[m['version'] for m in missing],
            'requiresRealRestoreAnd80RehearsalPass':True,'windowStart':None,'windowEnd':None},
        'remainingOperatorInputs':['genuine centralized JT grants for selected groups','one-time approval UUID','actual safe-boundary window timestamps',
            'fresh official<=5min project/version/schema/role/ACL/extension/ledger metadata','actual owner evidence refs+hashes and confirmed validity intervals',
            'actual ciphertext manifest/key paths and manifest hash after capture','real-data local restore+80 replay evidence before target DDL'],
        'currentEvidence':{'localSharedSnapshotProof':'shared-snapshot-proof-11.json PASS_LOCAL_SHARED_SNAPSHOT_ONLY',
            'localModeGateTests':'shared-snapshot-mode-tests.log 10 PASS','fiveExtensionAnd33PriorProofs':'reuse unchanged scoped evidence',
            'ownActual75To155ProofQaSourcePin':'835cb185a1027949da9670c75f72e6cd62b49c25fd5ae0dcf88f8c87e0a477ba',
            'currentMainSourceValidation':'Main owns exact-current-head review/CI/smoke; this builder does not rerun or upgrade old evidence',
            'realDataRestorePlus80Rehearsal':'UNRUN','actualRoleDdlSequenceBoundary':'UNRUN','quietness':False,'actualSideEffectsPerformed':False},
        'failureBoundary':{'currentTransactionRollbackOnly':True,'successfullyAppliedMigrationsRemainAppendOnly':True,
            'qaEntryWorkerStayOff':True,'automaticLiveSnapshotRestore':False,'overwriteNewerLiveWrites':False,
            'fullLiveDatabaseRestoreRequiresSeparateExplicitApproval':True,'failedCiphertextAndIdentity':'protected quarantine for operator disposition'},
        'credentials':{'existingJtPlacedKeys':'reuse by authorized owner; no value read/search/reimport by this proposal task',
            'futureCliEphemeralPassword':'official existing CLI context, child-process memory only; no new permanent API key/permission',
            'providerCredentialsOrFees':'outside this packet'},
        'notAuthority':['new database/project/quota','new persistent API key','RLS bypass permission changes','provider calls/fees',
            'production deployment/domain change','automatic full live restore','discarding successful migration history','treating snapshot consent as current dispatch authority'],
        'toolingLimits':{'captureAndOwnedRestoreCandidates':'implemented/default dry-run/local PASS',
            'existingRestoreDestroysCopyOnExit':True,'actualData80ReplayBeforeCleanup':'Main must bind its accepted migration rehearsal seam; existing synthetic replay is not an actual-data runner',
            'noTarget80RunnerExecutedOrAuthorizedHere':True}}


if __name__=='__main__':
    if len(sys.argv)!=3 or sys.argv[1]!='--proposal-only':raise SystemExit('USAGE: --proposal-only <read-only-verified Main HEAD>; no execution mode')
    print(json.dumps(build(sys.argv[2]),indent=2))
