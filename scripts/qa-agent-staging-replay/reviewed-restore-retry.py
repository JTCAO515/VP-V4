"""One explicit reviewed locale-repair retry, same capture/UUID/identity/window.
No marker deletion, new capture, identity creation or automatic retry loop.
"""
import hashlib
from datetime import timedelta
from pathlib import Path


def require(ok,reason):
    if not ok:raise ValueError(reason)


def main_private(authority,path,digest):
    p=Path(path)
    require(p.parent==authority.ROOT,'RETRY_MAIN_PRIVATE_EVIDENCE_REQUIRED')
    data,actual=authority.read_private(p)
    require(actual==digest,'RETRY_EVIDENCE_HASH_CHANGED')
    return data


def validate(authority,packet,manifest,locale_module,instant,stamp):
    start,digest=authority.read_private(authority.START_FILE)
    require(digest==packet['mainStartReceiptSha256'],'RETRY_START_CHANGED')
    retry=start.get('retry',{})
    require(retry.get('status')=='MAIN_REVIEWED_LOCALE_REPAIR_RETRY' and retry.get('attempt')==1
            and retry.get('previousOwnedCloneAbsent') is True and retry.get('noActualAttemptInFlight') is True,'EXPLICIT_REVIEWED_RETRY_REQUIRED')
    original_id=authority.canonical_approval_id(packet.get('approvalId'))
    require(retry.get('originalApprovalId')==original_id and retry.get('manifestSha256')==packet['manifestSha256']
            and retry.get('identityPathSha256')==hashlib.sha256(packet['identityPath'].encode()).hexdigest()
            and retry.get('reviewedRepairCommit')==start['reviewedSourceCommit'],'RETRY_CAPTURE_IDENTITY_REPAIR_BINDING_REQUIRED')
    marker=authority.CLAIM_ROOT/('approval-'+original_id+'.restore-replay.used.json')
    claim,claim_hash=authority.read_private(marker)
    require(claim_hash==retry.get('originalClaimSha256') and claim.get('status')=='CONSUMED_BEFORE_ARCHIVE_READ'
            and claim.get('stage')=='restore-replay' and claim.get('approvalId')==original_id
            and claim.get('target')==authority.TARGET and claim.get('manifestSha256')==packet['manifestSha256'],'ORIGINAL_CONSUMED_CLAIM_REQUIRED')
    failure=main_private(authority,retry['priorFailureResultPath'],retry['priorFailureResultSha256'])
    require(failure.get('status')=='FAIL_LOCAL_RESTORE' and failure.get('cleanup')=='PASS'
            and failure.get('reason')=='UNSUPPORTED_DATABASE_LOCALE_PROFILE' and 'replay' not in failure
            and failure.get('oneTimeRestoreClaim')==claim,'RETRY_PRIOR_LOCALE_FAILURE_CLEANUP_REQUIRED')
    old=main_private(authority,retry['originalStartRecordPath'],retry['originalStartRecordSha256'])
    require(retry['originalStartRecordSha256']==failure['directHumanAuthorization']['mainStartReceiptSha256']
            and old.get('target')==authority.TARGET and old.get('approvalId')==original_id
            and old.get('humanAuthorizationRecordSha256')==authority.AUTHORITY_SHA256
            and old.get('codeHashes',{}).get('restore-replay')==claim['codeSha256']
            and packet['windowStart']==old['validFrom'] and packet['windowEnd']==old['validUntil'],'RETRY_ORIGINAL_WINDOW_START_REQUIRED')
    require(retry.get('localeSupplementSha256')==packet.get('localeSupplementSha256'),'RETRY_LOCALE_SUPPLEMENT_BINDING_REQUIRED')
    supplement=main_private(authority,packet['localeSupplementPath'],packet['localeSupplementSha256'])
    require(timedelta(0)<=instant-stamp(supplement['observedAt'])<=timedelta(minutes=5),'RETRY_FRESH_LOCALE_SUPPLEMENT_REQUIRED')
    facts=manifest['verification']['databaseFacts']
    require(supplement.get('captureManifestSha256')==packet['manifestSha256'] and supplement.get('captureApprovalId')==original_id
            and supplement.get('evidenceKind')=='readonly-database-locale-after-capture-same-approved-window'
            and supplement.get('targetWritten') is False and supplement.get('userRowsRead') is False,'RETRY_LOCALE_CAPTURE_BINDING_REQUIRED')
    require(supplement.get('sourceProject')==authority.TARGET and supplement.get('database')=='postgres'
            and supplement.get('owner')==manifest['verification']['databaseOwner']
            and supplement.get('serverVersion')=='17.6'
            and {k:supplement.get(k) for k in facts}==facts,'RETRY_SOURCE_LOCALE_FACTS_CHANGED')
    require(retry.get('sameCapturedDatabaseLocaleUnchanged') is True,'RETRY_CAPTURE_LOCALE_CONTINUITY_REQUIRED')
    profile={'databaseFacts':facts,'icuLocale':supplement.get('locale'),'icuRules':supplement.get('icuRules'),
             'collationVersion':supplement.get('collationVersion'),'actualCollationVersion':supplement.get('actualCollationVersion')}
    locale_module.validate(profile,facts)
    return profile
