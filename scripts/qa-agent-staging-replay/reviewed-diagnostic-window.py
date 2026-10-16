"""Unconfigured future diagnostic window; new direct consent required before IO.
No old authorization/retry/marker mutation, target writes, capture or key creation.
"""
import hashlib
import importlib.util
from types import SimpleNamespace
import json
import os
from pathlib import Path
import re
import stat
import uuid
from datetime import timedelta

ROOT=Path('/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main')
ARCHIVES=Path('/Users/jtsm5p/.codex/secure-backups/qaw005-fixed-staging/archives')
HUMAN_FILE=ROOT/'diagnostic-window-human-authorization-20261016.json'
START_FILE=ROOT/'diagnostic-window-main-start-20261016.json'
TARGET='dzqdzetcctkhbrhlxxgn'
CAPTURE_ID='f97d05db-c706-4ce9-82d8-579cbb0b9310'
MANIFEST_SHA='668f0bb3a34319310a7bee2a07e514f47c11442d08cd78fe4e772856c3f61085'
RETAIN='2026-10-20T23:59:59+08:00'
# Deliberately unset. Only a later genuine JT reply + Main pin/source review can
# configure these; no proposal, old5637 approval or owner-generated JSON enables.
HUMAN_SHA256=None
QUESTION_ITEM_ID=None
QUESTION_MESSAGE_ID=None
ANSWER_MESSAGE_ID=None
IDENTITY_PATH_SHA256=None
PRESERVED_PINS=None
PRESERVED_KEYS={'captureClaim','restoreClaim','retry1Claim','initialFailure','retry1Failure','originalStart','retry1Start'}
ACTIONS=['reuse-original-four-ciphertexts','restore-one-owned-offline-copy','verify-schema-owner-acl-roles-counts','collect-diagnostic-hints-and-separate-caller-enums','destroy-owned-copy','local-candidate-rehearsal-only-after-full-restore-pass']
MAIN_THREAD_ID='01a13311-9212-7db3-8c75-691eac0f03ea'
BESTJ_THREAD_ID='01a1330e-5008-7061-909b-8abb26792003'
MAC_RELAY_THREAD_ID='01a13313-19fd-77be-959c-9448bfab80ce'
DIRECT_MAIN_SOURCE='Direct current Main conversation request_user_input_async reply'
BESTJ_ROOM_ID='6acd9506863c81958e1176881961131c'
BESTJ_QUESTION_MESSAGE_ID='Sentinel_90d9e98b22488191ac8a1eb87cff898e'
BESTJ_MESSAGE_SOURCE='Direct JT reply to fixed BestJ user_message.send_message question via official BestJ-to-Mac-to-Main relay'
BESTJ_RELAY_SOURCE='Direct JT request_user_input_async reply in fixed BestJ main chat via official BestJ-to-Mac-to-Main relay'
OLD_HUMAN_SHA='5637fbd49d992ba58f004a2a0f39fc56f5315cfbc96a8c44175f0c875367737c'


_DIRECTIVE_PROFILE=None
_DIRECTIVE_PROFILE_V2=None
_DELEGATED_PROFILE=None

def _directive_profile(source_profile=None):
    if isinstance(source_profile,dict) and source_profile.get('version')=='jt-delegated-bestj-20261017/v1':
        global _DELEGATED_PROFILE
        if _DELEGATED_PROFILE is None:
            path=Path(__file__).resolve().parent/'delegated-scope-v1/profile.py'
            spec=importlib.util.spec_from_file_location('delegated_bestj_scope',path)
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);_DELEGATED_PROFILE=module
        _DELEGATED_PROFILE.require_binding()
        return _DELEGATED_PROFILE
    if isinstance(source_profile,dict) and source_profile.get('version')=='jt-next-bounded-scope/v2':
        global _DIRECTIVE_PROFILE_V2
        if _DIRECTIVE_PROFILE_V2 is None:
            path=Path(__file__).resolve().parent/'directive-scope-v2/profile.py'
            spec=importlib.util.spec_from_file_location('strict_directive_scope_v2',path)
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);_DIRECTIVE_PROFILE_V2=module
        _DIRECTIVE_PROFILE_V2.require_binding()
        return _DIRECTIVE_PROFILE_V2
    global _DIRECTIVE_PROFILE
    if _DIRECTIVE_PROFILE is None:
        path=Path(__file__).resolve().parent/'directive-scope-v1/profile.py'
        spec=importlib.util.spec_from_file_location('strict_directive_scope_v1',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        _DIRECTIVE_PROFILE=module
    return _DIRECTIVE_PROFILE

def _approval_label(source_profile):
    if isinstance(source_profile,dict) and source_profile.get('version')=='jt-delegated-bestj-20261017/v1':return _directive_profile(source_profile).APPROVER
    return 'JT'

def _source_binding(source_profile,name):
    if source_profile is None:return globals()[name]
    return _directive_profile(source_profile).binding(source_profile,name,ROOT,PRESERVED_KEYS)

def _claim_environment():
    return SimpleNamespace(ARCHIVES=ARCHIVES,read_private=read_private,exclusive=exclusive)


def require(ok,reason):
    if not ok:raise ValueError(reason)


def sha(value):return hashlib.sha256(value).hexdigest()


def is_hash(value):return isinstance(value,str) and re.fullmatch('[a-f0-9]{64}',value) is not None


def canonical_uuid(value):
    try:v=uuid.UUID(value) if isinstance(value,str) else None
    except ValueError:v=None
    require(v is not None and v.int!=0 and str(v)==value,'DIAGNOSTIC_CANONICAL_UUID_REQUIRED')
    return value


def async_reference_configured():
    return (QUESTION_MESSAGE_ID is None and ANSWER_MESSAGE_ID is None
            and isinstance(QUESTION_ITEM_ID,list) and len(QUESTION_ITEM_ID)==3
            and QUESTION_ITEM_ID[0]=='request_user_input_async' and isinstance(QUESTION_ITEM_ID[1],str)
            and bool(QUESTION_ITEM_ID[1]) and QUESTION_ITEM_ID[1]!='call_xeZ1HzPXM8vRQalSkY7wGJHz'
            and type(QUESTION_ITEM_ID[2]) is int and QUESTION_ITEM_ID[2]==0)


def message_reference_configured():
    return (QUESTION_ITEM_ID is None and QUESTION_MESSAGE_ID==BESTJ_QUESTION_MESSAGE_ID
            and isinstance(ANSWER_MESSAGE_ID,str) and re.fullmatch(r'Sentinel_[a-f0-9]{32}',ANSWER_MESSAGE_ID) is not None
            and ANSWER_MESSAGE_ID!=QUESTION_MESSAGE_ID)


def require_configured(source_profile=None):
    if source_profile is not None:
        _directive_profile(source_profile).require_configured(source_profile,ROOT,PRESERVED_KEYS);return
    require(is_hash(HUMAN_SHA256) and HUMAN_SHA256!=OLD_HUMAN_SHA
            and (async_reference_configured() or message_reference_configured()) and is_hash(IDENTITY_PATH_SHA256)
            and isinstance(PRESERVED_PINS,dict) and set(PRESERVED_PINS)==PRESERVED_KEYS,
            'NEW_DIAGNOSTIC_HUMAN_PINS_UNCONFIGURED')
    for pin in PRESERVED_PINS.values():
        require(isinstance(pin,dict) and set(pin)=={'path','sha256'} and is_hash(pin['sha256']),'DIAGNOSTIC_PRESERVED_PIN_REQUIRED')


def read_private(path,expected=None,max_bytes=65536):
    p=Path(path);st=p.lstat()
    require(not p.is_symlink() and stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid()
            and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600,'DIAGNOSTIC_PRIVATE_FILE_REQUIRED')
    raw=p.read_bytes();require(len(raw)<max_bytes,'DIAGNOSTIC_PRIVATE_FILE_TOO_LARGE')
    digest=sha(raw)
    if expected is not None:require(digest==expected,'DIAGNOSTIC_EVIDENCE_SHA_CHANGED')
    return json.loads(raw),digest


def main_evidence(path,digest):
    require(Path(path).parent==ROOT and Path(path).suffix=='.json','DIAGNOSTIC_MAIN_EVIDENCE_SCOPE_REQUIRED')
    return read_private(path,digest)[0]


def preserved_digest(source_profile=None):return sha(json.dumps(_source_binding(source_profile,'PRESERVED_PINS'),sort_keys=True,separators=(',',':')).encode())


def check_preserved(source_profile=None):
    PRESERVED_PINS=_source_binding(source_profile,'PRESERVED_PINS')
    data={}
    for key,pin in PRESERVED_PINS.items():
        p=Path(pin['path'])
        marker_names={'captureClaim':'approval-'+CAPTURE_ID+'.used.json','restoreClaim':'approval-'+CAPTURE_ID+'.restore-replay.used.json','retry1Claim':'approval-'+CAPTURE_ID+'.restore-replay-retry-1.used.json'}
        require((key in marker_names and p==ARCHIVES/marker_names[key]) or (key not in marker_names and p.parent==ROOT and p.suffix=='.json'),'DIAGNOSTIC_PRESERVED_PATH_REQUIRED')
        data[key]=read_private(pin['path'],pin['sha256'])[0]
    for key in ('initialFailure','retry1Failure'):
        require(data[key].get('status')=='FAIL_LOCAL_RESTORE' and data[key].get('cleanup')=='PASS','DIAGNOSTIC_ORIGINAL_FAILURE_REQUIRED')
    original=data['originalStart'];retry_start=data['retry1Start']
    require(original.get('status')=='MAIN_REVIEWED_EXECUTION_START' and retry_start.get('status')=='MAIN_REVIEWED_EXECUTION_START'
            and original.get('approvalId')==retry_start.get('approvalId')==CAPTURE_ID
            and original.get('target')==retry_start.get('target')==TARGET
            and original.get('humanAuthorizationRecordSha256')==retry_start.get('humanAuthorizationRecordSha256')==OLD_HUMAN_SHA
            and original.get('validFrom')==retry_start.get('validFrom') and original.get('validUntil')==retry_start.get('validUntil'),
            'DIAGNOSTIC_ORIGINAL_START_CHAIN_REQUIRED')
    capture=data['captureClaim']
    require(capture.get('approvalId')==CAPTURE_ID and capture.get('mode')=='shared-readonly-snapshot/1'
            and capture.get('codeSha256')==original.get('codeHashes',{}).get('capture') and is_hash(capture.get('codeSha256')),
            'DIAGNOSTIC_ORIGINAL_CAPTURE_CLAIM_REQUIRED')
    for label,stage,failure,start_label,start_stage in [('restoreClaim','restore-replay','initialFailure','originalStart','restore-replay'),('retry1Claim','restore-replay-retry-1','retry1Failure','retry1Start','restore-replay-retry')]:
        c=data[label];f=data[failure]
        require(c.get('status')=='CONSUMED_BEFORE_ARCHIVE_READ' and c.get('approvalId')==CAPTURE_ID and c.get('stage')==stage
                and c.get('target')==TARGET and c.get('manifestSha256')==MANIFEST_SHA and is_hash(c.get('codeSha256'))
                and c['codeSha256']==data[start_label].get('codeHashes',{}).get(start_stage)
                and f.get('oneTimeRestoreClaim')==c
                and f.get('directHumanAuthorization',{}).get('mainStartReceiptSha256')==PRESERVED_PINS[start_label]['sha256'],
                'DIAGNOSTIC_ORIGINAL_CONSUMED_CHAIN_REQUIRED')
    return data


def bindings(packet,code_hash,source_profile=None):
    IDENTITY_PATH_SHA256=_source_binding(source_profile,'IDENTITY_PATH_SHA256')
    HUMAN_SHA256=_source_binding(source_profile,'HUMAN_SHA256')
    return {'windowId':packet['windowId'],'windowStart':packet['windowStart'],'windowEnd':packet['windowEnd'],'attempt':packet['attempt'],'parentCaptureId':CAPTURE_ID,
            'manifestSha256':MANIFEST_SHA,'identityPathSha256':IDENTITY_PATH_SHA256,
            'codeSha256':code_hash,'reviewedSourceCommit':packet['reviewedSourceCommit'],
            'parentFailureSha256':packet['parentFailureSha256'],'humanAuthorizationSha256':HUMAN_SHA256,'mainStartReceiptSha256':packet['mainStartReceiptSha256']}


def failure_fingerprint(result):
    r=result['outcome']
    return sha(json.dumps({k:r.get(k) for k in ('status','failedStage','reason','safeRestoreDiagnostics','prePostDataCaller')},sort_keys=True,separators=(',',':')).encode())


def filename(window,attempt,suffix):return 'diagnostic-window-'+window+'.attempt-'+str(attempt)+'.'+suffix+'.json'


def validate_bestj_message_source(human):
    require(message_reference_configured() and 'questionItemId' not in human and 'originalQuestionItemId' not in human
            and human.get('questionMessageId')==QUESTION_MESSAGE_ID and human.get('answerMessageId')==ANSWER_MESSAGE_ID
            and human.get('roomId')==BESTJ_ROOM_ID,'DIAGNOSTIC_BESTJ_MESSAGE_REFERENCES_REQUIRED')
    require(human.get('sourceThreadId')==BESTJ_THREAD_ID and human.get('relayThreadId')==MAC_RELAY_THREAD_ID
            and human.get('relayTargetThreadId')==MAIN_THREAD_ID and human.get('authorizer')=='JT'
            and human.get('relayIsAuthorization') is False,'DIAGNOSTIC_FIXED_BESTJ_HUMAN_SOURCE_REQUIRED')
    receipts=human.get('officialRelayEvidence')
    require(isinstance(receipts,list) and len(receipts)==2,'DIAGNOSTIC_OFFICIAL_RELAY_EVIDENCE_REQUIRED')
    upstream=None
    for receipt,(sender,target) in zip(receipts,((BESTJ_THREAD_ID,MAC_RELAY_THREAD_ID),(MAC_RELAY_THREAD_ID,MAIN_THREAD_ID))):
        require(isinstance(receipt,dict) and set(receipt)=={'path','sha256'} and is_hash(receipt['sha256']),
                'DIAGNOSTIC_OFFICIAL_RELAY_EVIDENCE_REQUIRED')
        evidence=main_evidence(receipt['path'],receipt['sha256'])
        require('questionItemId' not in evidence and 'originalQuestionItemId' not in evidence
                and evidence.get('origin')=='official_received_codex_delegation' and evidence.get('toolName')=='send_message_to_thread'
                and evidence.get('sourceThreadId')==sender and evidence.get('targetThreadId')==target
                and evidence.get('originalHumanSourceThreadId')==BESTJ_THREAD_ID
                and evidence.get('originalQuestionTransport')=='user_message.send_message'
                and evidence.get('originalRoomId')==BESTJ_ROOM_ID
                and evidence.get('originalQuestionMessageId')==QUESTION_MESSAGE_ID
                and evidence.get('originalAnswerMessageId')==ANSWER_MESSAGE_ID
                and evidence.get('originalHumanQuestion')==human['humanQuestion']
                and evidence.get('originalHumanAnswer')==human['humanAnswer']
                and evidence.get('authorizer')=='JT' and evidence.get('relayIsAuthorization') is False
                and evidence.get('upstreamRelayEvidenceSha256')==upstream,
                'DIAGNOSTIC_OFFICIAL_RELAY_FULL_HUMAN_REPLY_REQUIRED')
        upstream=receipt['sha256']


def validate_human_source(human,source_profile=None):
    if source_profile is not None:
        _directive_profile(source_profile).validate_record(human,source_profile);return
    require(human.get('status')=='DIRECT_HUMAN_DIAGNOSTIC_WINDOW_APPROVED_NOT_EXECUTED'
            and isinstance(human.get('humanQuestion'),str) and bool(human['humanQuestion'].strip())
            and isinstance(human.get('humanAnswer'),str) and bool(human['humanAnswer'].strip())
            and human.get('fileDoesNotSelfAuthorize') is True,'NEW_DIRECT_DIAGNOSTIC_HUMAN_RECORD_REQUIRED')
    if human.get('source')==BESTJ_MESSAGE_SOURCE:
        validate_bestj_message_source(human)
        return
    require(async_reference_configured() and human.get('questionItemId')==QUESTION_ITEM_ID,'DIAGNOSTIC_ASYNC_REFERENCES_REQUIRED')
    if human.get('source')==DIRECT_MAIN_SOURCE:
        # Preserve the existing Main direct-reply record schema. If thread
        # metadata is supplied, it cannot contradict this exact direct source.
        require(human.get('sourceThreadId',MAIN_THREAD_ID)==MAIN_THREAD_ID
                and human.get('relayTargetThreadId',MAIN_THREAD_ID)==MAIN_THREAD_ID
                and human.get('authorizer','JT')=='JT' and human.get('relayIsAuthorization',False) is False
                and 'relayThreadId' not in human and 'officialRelayEvidence' not in human,
                'DIAGNOSTIC_DIRECT_MAIN_SOURCE_CONFLICT')
        return
    require(human.get('source')==BESTJ_RELAY_SOURCE and human.get('sourceThreadId')==BESTJ_THREAD_ID
            and human.get('relayThreadId')==MAC_RELAY_THREAD_ID and human.get('relayTargetThreadId')==MAIN_THREAD_ID
            and human.get('authorizer')=='JT' and human.get('relayIsAuthorization') is False,
            'DIAGNOSTIC_FIXED_BESTJ_HUMAN_SOURCE_REQUIRED')
    receipts=human.get('officialRelayEvidence')
    require(isinstance(receipts,list) and len(receipts)==2,'DIAGNOSTIC_OFFICIAL_RELAY_EVIDENCE_REQUIRED')
    # These are Main's fixed actual official-message evidence records, not a
    # platform signature/API. No tool-issued message ID is invented. Missing
    # original reply evidence must leave real source pins unconfigured.
    upstream=None
    for receipt,(sender,target) in zip(receipts,((BESTJ_THREAD_ID,MAC_RELAY_THREAD_ID),(MAC_RELAY_THREAD_ID,MAIN_THREAD_ID))):
        require(isinstance(receipt,dict) and set(receipt)=={'path','sha256'} and is_hash(receipt['sha256']),
                'DIAGNOSTIC_OFFICIAL_RELAY_EVIDENCE_REQUIRED')
        evidence=main_evidence(receipt['path'],receipt['sha256'])
        require(evidence.get('origin')=='official_received_codex_delegation' and evidence.get('toolName')=='send_message_to_thread'
                and evidence.get('sourceThreadId')==sender and evidence.get('targetThreadId')==target
                and evidence.get('originalHumanSourceThreadId')==BESTJ_THREAD_ID
                and evidence.get('originalQuestionItemId')==QUESTION_ITEM_ID
                and evidence.get('originalHumanQuestion')==human['humanQuestion']
                and evidence.get('originalHumanAnswer')==human['humanAnswer']
                and evidence.get('authorizer')=='JT' and evidence.get('relayIsAuthorization') is False
                and evidence.get('upstreamRelayEvidenceSha256')==upstream,
                'DIAGNOSTIC_OFFICIAL_RELAY_FULL_HUMAN_REPLY_REQUIRED')
        upstream=receipt['sha256']


def validate(packet,code_hash,instant,stamp,locale_module,manifest=None,source_profile=None):
    require_configured(source_profile)
    HUMAN_FILE=_source_binding(source_profile,'HUMAN_FILE');HUMAN_SHA256=_source_binding(source_profile,'HUMAN_SHA256')
    START_FILE=_source_binding(source_profile,'START_FILE');IDENTITY_PATH_SHA256=_source_binding(source_profile,'IDENTITY_PATH_SHA256')
    PRESERVED_PINS=_source_binding(source_profile,'PRESERVED_PINS')
    if source_profile is not None:_directive_profile(source_profile).check_packet(source_profile,packet,code_hash,instant,stamp,sha(packet.get('identityPath','').encode()))
    human,_=read_private(HUMAN_FILE,HUMAN_SHA256)
    validate_human_source(human,source_profile)
    expected_scope={'minutes':60,'maximumCopies':2,'noOtherPlannedDdlChanges':True,'ordinaryDmlContinues':True,
                    'reuseOriginalCapture':True,'localRehearsalAfterFullRestorePass':True,'newCapture':False,'newIdentity':False,'newLiveGrants':False,'provider':False,'targetE':False}
    require(human.get('scope')==expected_scope and all(type(human['scope'][k]) is type(v) for k,v in expected_scope.items()) and human.get('target')==TARGET and human.get('parentCaptureId')==CAPTURE_ID
            and human.get('manifestSha256')==MANIFEST_SHA and human.get('identityPathSha256')==IDENTITY_PATH_SHA256,
            'NEW_DIAGNOSTIC_HUMAN_SCOPE_REQUIRED')
    require(packet.get('approvedBy')==_approval_label(source_profile) and packet.get('proposalOnly') is False,'DIAGNOSTIC_APPROVED_PACKET_REQUIRED')
    window=canonical_uuid(packet.get('windowId'))
    require(window!=CAPTURE_ID and human.get('windowId')==window and packet.get('humanAuthorizationSha256')==HUMAN_SHA256,
            'NEW_DIAGNOSTIC_WINDOW_BINDING_REQUIRED')
    require(type(packet.get('attempt')) is int and packet['attempt'] in (1,2) and type(packet.get('maximumCopies')) is int and packet['maximumCopies']==2,
            'DIAGNOSTIC_COPY_CAP_REQUIRED')
    require(packet.get('target')==TARGET and packet.get('parentCaptureId')==CAPTURE_ID and packet.get('manifestSha256')==MANIFEST_SHA
            and packet.get('codeSha256')==code_hash and is_hash(code_hash)
            and sha(packet.get('identityPath','').encode())==IDENTITY_PATH_SHA256,'DIAGNOSTIC_ORIGINAL_BUNDLE_BINDING_REQUIRED')
    require(packet.get('retainUntil')==RETAIN and packet.get('noNewCaptureKeyGrantProviderOrE') is True and packet.get('actions')==ACTIONS,'DIAGNOSTIC_EXCLUSIONS_REQUIRED')
    begin,end=stamp(packet['windowStart']),stamp(packet['windowEnd'])
    require(end-begin==timedelta(hours=1) and begin<=instant and instant+timedelta(minutes=30)<=end
            and end<stamp(RETAIN),'DIAGNOSTIC_WINDOW_EXPIRED_OR_UNAPPROVED')
    start,start_sha=read_private(START_FILE,packet['mainStartReceiptSha256'])
    require(start.get('status')=='MAIN_REVIEWED_DIAGNOSTIC_WINDOW_START' and start.get('issuedBy')=='Main'
            and start.get('humanAuthorizationSha256')==HUMAN_SHA256 and start.get('windowId')==window
            and start.get('attempt')==packet['attempt'] and start.get('target')==TARGET
            and start.get('codeSha256')==code_hash and start.get('parentCaptureId')==CAPTURE_ID
            and start.get('manifestSha256')==MANIFEST_SHA and start.get('identityPathSha256')==IDENTITY_PATH_SHA256
            and start.get('maximumCopies')==2 and start.get('actions')==ACTIONS and start.get('noActualAttemptInFlight') is True
            and start.get('preservedEvidenceDigest')==preserved_digest(source_profile)
            and start.get('windowStart')==packet['windowStart'] and start.get('windowEnd')==packet['windowEnd']
            and start.get('reviewedSourceCommit')==packet.get('reviewedSourceCommit')
            and re.fullmatch('[a-f0-9]{40}',packet.get('reviewedSourceCommit','')),'DIAGNOSTIC_MAIN_START_REQUIRED')
    if source_profile is not None:require(start.get('windowStartMonotonic')==packet['windowStartMonotonic'],'DIRECTIVE_START_RECEIPT_CLOCK_CONFLICT')
    preserved=check_preserved(source_profile)
    require(begin>=stamp(preserved['originalStart']['validUntil']),'DIAGNOSTIC_MUST_BE_NEW_WINDOW')
    if packet['attempt']==1:
        require(packet.get('parentFailureSha256')==PRESERVED_PINS['retry1Failure']['sha256'],'DIAGNOSTIC_PARENT_FAILURE_REQUIRED')
    else:
        prior,prior_sha=read_private(ARCHIVES/filename(window,1,'result'),packet['parentFailureSha256'])
        require(prior.get('status')=='ATTEMPT_FINISHED' and prior.get('windowId')==window and prior.get('attempt')==1
                and prior.get('parentCaptureId')==CAPTURE_ID and prior.get('manifestSha256')==MANIFEST_SHA
                and prior.get('identityPathSha256')==IDENTITY_PATH_SHA256
                and prior.get('windowStart')==packet['windowStart'] and prior.get('windowEnd')==packet['windowEnd']
                and prior.get('outcome',{}).get('cleanup')=='PASS'
                and prior['outcome'].get('status','').startswith('FAIL_'),'DIAGNOSTIC_SECOND_REQUIRES_REAL_FAILED_CLEANUP')
        prior_claim,_=read_private(ARCHIVES/filename(window,1,'used'))
        require(prior_claim=={'status':'CONSUMED_BEFORE_ARCHIVE_READ',**{key:prior.get(key) for key in bindings(packet,code_hash,source_profile)}},
                'DIAGNOSTIC_PRIOR_CONSUMPTION_CHAIN_REQUIRED')
        require(prior.get('codeSha256')!=code_hash and prior.get('reviewedSourceCommit')!=packet['reviewedSourceCommit'],
                'DIAGNOSTIC_SAME_SOURCE_REPEAT_FORBIDDEN')
        repair=start.get('repair',{})
        require(repair.get('status')=='MAIN_DIAGNOSED_FIXED_REVIEWED_PRIOR_FAILURE'
                and repair.get('priorResultSha256')==prior_sha and repair.get('priorFailureFingerprint')==failure_fingerprint(prior)
                and repair.get('reviewedRepairCommit')==packet['reviewedSourceCommit']
                and repair.get('newEvidenceDiagnosesPriorFailure') is True and repair.get('independentSourceReviewPassed') is True,
                'DIAGNOSTIC_FIXED_FAILURE_REVIEW_REQUIRED')
        evidence=main_evidence(repair['diagnosisEvidencePath'],repair['diagnosisEvidenceSha256'])
        tests=main_evidence(repair['testsEvidencePath'],repair['testsEvidenceSha256'])
        require(evidence.get('status')=='MAIN_PRIOR_FAILURE_DIAGNOSED' and evidence.get('priorResultSha256')==prior_sha
                and evidence.get('priorFailureFingerprint')==failure_fingerprint(prior) and is_hash(evidence.get('newEvidenceSha256'))
                and evidence['newEvidenceSha256']!=prior_sha and evidence.get('causeIdentified') is True,
                'DIAGNOSTIC_NEW_CAUSAL_EVIDENCE_REQUIRED')
        require(tests.get('status')=='PASS_REQUIRED_REPAIR_TESTS' and tests.get('codeSha256')==code_hash
                and tests.get('reviewedSourceCommit')==packet['reviewedSourceCommit']
                and tests.get('diagnosisEvidenceSha256')==repair['diagnosisEvidenceSha256'],'DIAGNOSTIC_REPAIR_TESTS_REQUIRED')
    supplement=main_evidence(packet['localeSupplementPath'],packet['localeSupplementSha256'])
    require(start.get('localeSupplementSha256')==packet['localeSupplementSha256']
            and start.get('sameCapturePointLocaleUnchanged') is True
            and timedelta(0)<=instant-stamp(supplement['observedAt'])<=timedelta(minutes=5)
            and supplement.get('sourceProject')==TARGET and supplement.get('database')=='postgres' and supplement.get('owner')=='postgres'
            and supplement.get('serverVersion')=='17.6' and supplement.get('captureManifestSha256')==MANIFEST_SHA
            and supplement.get('captureApprovalId')==CAPTURE_ID and supplement.get('targetWritten') is False
            and supplement.get('userRowsRead') is False,'DIAGNOSTIC_FRESH_READONLY_LOCALE_REQUIRED')
    facts={k:supplement.get(k) for k in ('encoding','collate','ctype','localeProvider')}
    if manifest is not None:require(facts==manifest['verification']['databaseFacts'],'DIAGNOSTIC_CAPTURE_LOCALE_CHANGED')
    profile={'databaseFacts':facts,'icuLocale':supplement.get('locale'),'icuRules':supplement.get('icuRules'),
             'collationVersion':supplement.get('collationVersion'),'actualCollationVersion':supplement.get('actualCollationVersion')}
    locale_module.validate(profile,facts)
    return profile


def open_root():
    require(ARCHIVES.resolve()==ARCHIVES,'DIAGNOSTIC_CLAIM_ROOT_UNSAFE')
    fd=os.open(ARCHIVES,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);st=os.fstat(fd)
    if not(stat.S_ISDIR(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700):
        os.close(fd);raise ValueError('DIAGNOSTIC_CLAIM_ROOT_UNSAFE')
    return fd


def exclusive(fd,name,record):
    try:handle=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=fd)
    except FileExistsError:raise ValueError('DIAGNOSTIC_ALREADY_ACTIVE_OR_CONSUMED') from None
    with os.fdopen(handle,'w') as f:
        json.dump(record,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
    os.fsync(fd)


def active_name():return 'diagnostic-parent-'+CAPTURE_ID+'.active.json'


def claim(packet,code_hash,source_profile=None):
    require_configured(source_profile)
    if source_profile is not None:
        canonical_uuid(packet.get('windowId'))
        _directive_profile(source_profile).preclaim(source_profile,packet,code_hash,sha(packet.get('identityPath','').encode()))
    fd=open_root()
    try:
        window=canonical_uuid(packet['windowId']);attempt=packet['attempt']
        require(type(attempt) is int and attempt in (1,2),'DIAGNOSTIC_COPY_CAP_REQUIRED')
        require(not os.path.lexists(ARCHIVES/filename(window,attempt,'used')),'DIAGNOSTIC_ALREADY_ACTIVE_OR_CONSUMED')
        if source_profile is not None:_directive_profile(source_profile).check_authority_claim(_claim_environment(),source_profile,packet)
        record={'status':'CONSUMED_BEFORE_ARCHIVE_READ',**bindings(packet,code_hash,source_profile)}
        # One active copy across this original capture, including different
        # window IDs. Crash/write failure retains lock and claim; no stale reset.
        exclusive(fd,active_name(),record)
        if source_profile is not None:_directive_profile(source_profile).bind_authority_claim(_claim_environment(),source_profile,packet,fd)
        exclusive(fd,filename(window,attempt,'used'),record)
        return record
    finally:os.close(fd)


def finish(packet,code_hash,outcome,source_profile=None):
    if source_profile is not None:require_configured(source_profile)
    fd=open_root()
    try:
        active,_=read_private(ARCHIVES/active_name())
        require(active=={'status':'CONSUMED_BEFORE_ARCHIVE_READ',**bindings(packet,code_hash,source_profile)},'DIAGNOSTIC_ACTIVE_BINDING_CHANGED')
        record={'status':'ATTEMPT_FINISHED',**bindings(packet,code_hash,source_profile),'outcome':outcome}
        exclusive(fd,filename(packet['windowId'],packet['attempt'],'result'),record)
        # Never delete a consumption marker. Only the current active-copy guard
        # may be released after a recorded, completed PASS cleanup.
        if outcome.get('cleanup')=='PASS' and (outcome.get('status','').startswith('FAIL_') or outcome.get('status')=='PASS_LOCAL_BUNDLE_RESTORE_ONLY'):
            os.unlink(active_name(),dir_fd=fd);os.fsync(fd)
        return record
    finally:os.close(fd)


def caller_snapshot(db):
    # Separate metadata-only connection. This does NOT observe pg_restore's
    # mid-command/SecurityDefiner caller or read any role config/object/user rows.
    value=json.loads(db.sql("select pg_catalog.jsonb_build_object('roleClass',case when current_user='supabase_admin' then 'bootstrap' when current_user='postgres' then 'postgres' else 'unknown' end,'effectiveSuperuser',(select rolsuper from pg_catalog.pg_roles where rolname=current_user),'sessionUserIsBootstrap',session_user='supabase_admin');"))
    require(set(value)=={'roleClass','effectiveSuperuser','sessionUserIsBootstrap'} and value['roleClass'] in ('bootstrap','postgres','unknown')
            and type(value['effectiveSuperuser']) is bool and type(value['sessionUserIsBootstrap']) is bool,'DIAGNOSTIC_CALLER_ENUM_REQUIRED')
    return {'scope':'SEPARATE_PRE_POSTDATA_CONNECTION_NOT_PG_RESTORE_RUNTIME_CALLER',**value}


def run(core,args,source_profile=None):
    if source_profile is None:return _run_after_preflight(core,args)
    environment=SimpleNamespace(ROOT=ROOT,ARCHIVES=ARCHIVES,RETAIN=RETAIN,ACTIONS=ACTIONS,PRESERVED_KEYS=PRESERVED_KEYS,read_private=read_private,open_root=open_root,active_name=active_name,filename=filename,canonical_uuid=canonical_uuid,binding_keys=bindings)
    with _directive_profile(source_profile).run_preflight(environment,core,args,source_profile) as lease:
        return _run_after_preflight(core,args,source_profile,lease)


def _run_after_preflight(core,args,source_profile=None,lease=None):
    require_configured(source_profile)
    header=None
    if source_profile is not None:header=_directive_profile(source_profile).lease_header(lease,core,args,source_profile)
    HUMAN_FILE=_source_binding(source_profile,'HUMAN_FILE');HUMAN_SHA256=_source_binding(source_profile,'HUMAN_SHA256')
    # All private input reads remain after profile qualification.
    ap,mp,ip,plan=map(Path,args)
    require(ap.parent==ROOT and ap.suffix=='.json','DIAGNOSTIC_PACKET_METADATA_PATH_REQUIRED')
    if source_profile is None:
        require(mp.suffix=='.json' and mp.resolve().is_relative_to(ARCHIVES),'DIAGNOSTIC_MANIFEST_METADATA_PATH_REQUIRED')
        read_private(HUMAN_FILE,HUMAN_SHA256)
        packet,packet_sha=read_private(ap)
    else:
        packet,packet_sha=read_private(ap,header['packetSha256'])
        _directive_profile(source_profile).bind_header(header,packet,packet_sha,sha(packet.get('identityPath','').encode()),args)
        require(mp.suffix=='.json' and mp.resolve().is_relative_to(ARCHIVES),'DIAGNOSTIC_MANIFEST_METADATA_PATH_REQUIRED')
        read_private(HUMAN_FILE,HUMAN_SHA256)
    anchor=core.diagnostic_deadline.monotonic()
    instant=core.base.capture.now()
    if source_profile is None:validate(packet,core.code_hash(),instant,core.base.capture.stamp,core.locale_profile)
    else:validate(packet,core.code_hash(),instant,core.base.capture.stamp,core.locale_profile,source_profile=source_profile)
    if source_profile is None:budget=core.diagnostic_deadline.from_window(packet['windowEnd'],instant,core.base.capture.stamp,anchor=anchor)
    else:budget=_directive_profile(source_profile).lease_budget(lease,core,args,source_profile)
    manifest,digest=read_private(mp,MANIFEST_SHA,max_bytes=4*1024*1024)
    require(packet.get('manifestPath')==str(mp.resolve()) and packet.get('identityPath')==str(ip.resolve()),'DIAGNOSTIC_PATH_BINDING_REQUIRED')
    core.verify_manifest(manifest);candidate,_=core.replay.load_plan(plan)
    require(candidate['mode']==core.replay.CANDIDATE_MODE,'DIAGNOSTIC_CURRENT_CANDIDATE_REQUIRED')
    require(packet.get('replayMode')==core.replay.CANDIDATE_MODE and packet.get('replayManifestSha256')==core.replay.CANDIDATE_MANIFEST_HASH,
            'DIAGNOSTIC_REPLAY_PIN_REQUIRED')
    # All original restore contract/hash/window/input/sequence guards preserved.
    proxy={**packet,'codeSha256':core.base.code_hash(),'actions':['decrypt-approved-bundle','restore-own-isolated-docker','verify-no-content-output','destroy-own-restored-copy','restore-realtime-schema-migrations-ledger']}
    core.base.validate_approval(proxy,mp,ip)
    require('FileVault is On.' in core.base.run(['fdesetup','status']).decode(),'FILEVAULT_REQUIRED')
    if source_profile is None:profile=validate(packet,core.code_hash(),core.base.capture.now(),core.base.capture.stamp,core.locale_profile,manifest)
    else:profile=validate(packet,core.code_hash(),core.base.capture.now(),core.base.capture.stamp,core.locale_profile,manifest,source_profile)
    read_private(ap,packet_sha)
    core.base.validate_approval(proxy,mp,ip)
    budget.check()
    record=claim(packet,core.code_hash(),source_profile)
    if source_profile is not None:_directive_profile(source_profile).release_preflight(lease)
    # Failure, including a Python exception, consumes this attempt. Unknown
    # cleanup leaves active guard in place; never auto-start another copy.
    try:outcome=core.restore_bundle(mp.parent,ip,manifest,plan,profile,observe_caller=True,window_budget=budget)
    except Exception:outcome={'status':'FAIL_DIAGNOSTIC_EXCEPTION','cleanup':'UNKNOWN','reason':'DETAILS_SUPPRESSED'}
    finish(packet,core.code_hash(),outcome,source_profile)
    return {**outcome,'diagnosticWindowClaim':record,'targetEAuthority':'NONE','newCaptureOrIdentityCreated':False}
