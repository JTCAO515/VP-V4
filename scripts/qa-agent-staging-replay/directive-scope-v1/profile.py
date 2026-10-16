"""One fixed directive scope, not a general message/transport allowlist.
Original raw records remain private. No original human ID/author is fabricated.
"""
import hashlib
import importlib.util
import math
import copy
from contextlib import contextmanager
import fcntl
import weakref
import threading
from datetime import datetime,timezone
import json
import os
from pathlib import Path
import re
import stat
import uuid

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('directive_start_provenance',HERE/'start-provenance.py')
provenance=importlib.util.module_from_spec(spec);spec.loader.exec_module(provenance)
provenance=provenance.shared_runtime()
VERSION='jt-directives-20261016/v1'
BESTJ='01a1330e-5008-7061-909b-8abb26792003'
MAC='01a13313-19fd-77be-959c-9448bfab80ce'
MAIN='01a13311-9212-7db3-8c75-691eac0f03ea'
ROOM='6acd9506863c81958e1176881961131c'
CAPTURE='f97d05db-c706-4ce9-82d8-579cbb0b9310'
MANIFEST='668f0bb3a34319310a7bee2a07e514f47c11442d08cd78fe4e772856c3f61085'
IDENTITY='58aa1f73d84e1c265bf64beffe6718ebd1b981d22165ef133fbc1569816451d7'
IMAGE='sha256:74699ee2438a45c748fb5e82bde5cafa4c8e2c39879d107ac8b6c0d43a0b1451'
DIRECTIVES=('Sentinel_9fd068e678a0819187991a0a17138244','Sentinel_e4ac0f273c108191a5dfc74e481efce9')
CONTEXTS=('Sentinel_429b728c1fc88191b31915a31e3d6dd6','Sentinel_4fbea13acd048191a20431b6fc0316d6')
TEXT_HASHES=('59dbe238111148bf13708fdb6e5c3d7c38305dcb82dd2987f6036be2bd697f49','c85d897f7bf216a626de69b2137595671ca99f8e2384ab0e205c649324f14972')
SCOPE={'minutes':60,'maximumCopies':2,'noOtherPlannedDdlChanges':True,'ordinaryDmlContinues':True,'reuseOriginalCapture':True,'localRehearsalAfterFullRestorePass':True,'newCapture':False,'newIdentity':False,'newLiveGrants':False,'provider':False,'targetE':False}

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def sha(value):return hashlib.sha256(value).hexdigest()
def require(ok,code):
    if not ok:raise ValueError(code)
def is_hash(value):return type(value) is str and re.fullmatch('[a-f0-9]{64}',value) is not None

# Stable across profile/source/window revisions: the same actual directives
# cannot obtain another window merely through a new code or relay hash.
AUTHORIZATION=sha(canonical({'room':ROOM,'sourceThread':BESTJ,'directiveIds':DIRECTIVES,'capture':CAPTURE}))

def contains(tree,item):
    if tree==item:return True
    if isinstance(tree,dict):return any(contains(v,item) for v in tree.values())
    if isinstance(tree,list):return any(contains(v,item) for v in tree)
    return False

def pins():
    value=json.loads((HERE/'evidence-pins.json').read_text())
    require(set(value)=={'version','inputs'} and value['version']==VERSION,'DIRECTIVE_EVIDENCE_VERSION_CONFLICT')
    return value['inputs']

def read_sources():
    result={}
    for key,pin in pins().items():
        path=Path(pin['path']);st=path.lstat();parent=path.parent.lstat()
        require(path.is_absolute() and path.resolve()==path and stat.S_ISDIR(parent.st_mode) and parent.st_uid==os.getuid() and stat.S_IMODE(parent.st_mode)==0o700,'DIRECTIVE_METADATA_ROOT_CONFLICT')
        require(not path.is_symlink() and stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and st.st_size==pin['bytes'],'DIRECTIVE_METADATA_FILE_CONFLICT')
        raw=path.read_bytes();require(sha(raw)==pin['sha256'],'DIRECTIVE_RAW_PIN_CONFLICT');result[key]=raw
    return result

def native_first(record):
    require(record.get('type')=='functionCallOutput' and record.get('namespace')=='cloud_threads' and record.get('name')=='send_message' and record.get('output',{}).get('truncated') is False,'DIRECTIVE_NATIVE_FIRST_HOP_REQUIRED')
    return {'semanticProjection':'official_thread_delivery','nativeName':'cloud_threads.send_message','recordKind':'functionCallOutput','recordId':record['id']}

def verify_sources(raw=None):
    raw=read_sources() if raw is None else raw
    expected=pins();require(type(raw) is dict and set(raw)==set(expected),'DIRECTIVE_SOURCE_SET_REQUIRED')
    for key,pin in expected.items():require(type(raw[key]) is bytes and len(raw[key])==pin['bytes'] and sha(raw[key])==pin['sha256'],'DIRECTIVE_RAW_PIN_CONFLICT')
    parsed=lambda key:json.loads(raw[key])
    api=parsed('context.parentProvidedApiRaw');payload=api['structuredContent']
    require(api.get('isError') is False and payload.get('partial') is False and json.loads(api['content'][0]['text'])==payload,'DIRECTIVE_FULL_RAW_REQUIRED')
    messages=[*payload['before'],payload['message'],*payload['after']]
    by_id={m['message_id']:m for m in messages}
    require(len(messages)==5 and all(k in by_id for k in (*DIRECTIVES,*CONTEXTS)),'DIRECTIVE_CONTEXT_SET_REQUIRED')
    first,last=(by_id[k] for k in DIRECTIVES)
    require(first['author']==last['author']=='user' and first['author_id']==last['author_id'] and bool(first['author_id']),'DIRECTIVE_ACTOR_CONFLICT')
    for message,digest in zip((first,last),TEXT_HASHES):require(sha(message['content']['text'].encode())==digest,'DIRECTIVE_TEXT_CONFLICT')
    full_ref=lambda identifier:ROOM+'~'+ROOM+'~CalpicoMessage~'+identifier
    require(first['reply_to_id']==first['reply_root_message_id']==full_ref(CONTEXTS[0]),'DIRECTIVE_REPORT_REPLY_CONFLICT')
    require(last['reply_to_id'] is None and last['reply_root_message_id'] is None,'DIRECTIVE_NULL_RELATION_CONFLICT')
    require(by_id[CONTEXTS[0]]['author']==by_id[CONTEXTS[1]]['author']=='aeon' and by_id[CONTEXTS[1]]['reply_to_id']==full_ref(DIRECTIVES[0]),'DIRECTIVE_ASSISTANT_CONTEXT_CONFLICT')
    complete_index=parsed('context.indexComplete')
    # The room is separate delivery context, never inserted into the API raw.
    require(complete_index['parentProvidedRoom']==ROOM,'DIRECTIVE_ROOM_CONFLICT')
    require(complete_index['humanRawKind']=='parent_reported_official_user_message_read_raw' and complete_index['secondHopNativeIdNotYetExposed'] is True,'DIRECTIVE_RAW_PROVENANCE_CONFLICT')
    scope_first=parsed('scope.incoming');scope_second=parsed('scope.outgoing')
    context_first=parsed('context.bestjMacRecord');context_second=parsed('context.secondHopRuntimeCapture')
    first_hops=[]
    for prefix,record,read_key,text_key in [('scope',scope_first,'scope.officialRead','scope.incomingExactText'),('context',context_first,'context.officialMacRead','context.bestjMacExactText')]:
        view=native_first(record);snapshot=parsed(read_key)
        require(snapshot['thread']['id']==MAC and contains(snapshot,record) and record['output']['text'].encode()==raw[text_key] and BESTJ in record['output']['text'],'DIRECTIVE_FIRST_HOP_SOURCE_CONFLICT')
        first_hops.append({**view,'rawSha256':sha(raw['scope.incoming' if prefix=='scope' else 'context.bestjMacRecord'])})
    require(scope_second['type']=='mcpToolCall' and scope_second['server']=='codex_app' and scope_second['tool']=='send_message_to_thread' and scope_second['status']=='completed','DIRECTIVE_SCOPE_SECOND_HOP_CONFLICT')
    require(contains(parsed('scope.officialRead'),scope_second) and scope_second['arguments']['threadId']==MAIN and scope_second['arguments']['prompt'].encode()==raw['scope.outgoingExactPrompt'],'DIRECTIVE_SCOPE_TARGET_CONFLICT')
    require(context_second['record.kind']=='runtime_tool_arguments_and_result_capture' and context_second['tool']=='codex_app.send_message_to_thread' and context_second['sourceThreadId']==MAC,'DIRECTIVE_CONTEXT_SECOND_HOP_CONFLICT')
    require(context_second['arguments']['threadId']==MAIN and context_second['arguments']['prompt'].encode()==raw['context.secondHopPrompt'] and context_second['result']==parsed('context.secondHopResult'),'DIRECTIVE_CONTEXT_TARGET_CONFLICT')
    result=context_second['result'];require(result['isError'] is False and json.loads(result['content'][0]['text'])['threadId']==MAIN,'DIRECTIVE_CONTEXT_RESULT_CONFLICT')
    def view(m,kind):return {'messageId':m['message_id'],'kind':kind,'authorRole':m['author'],'textSha256':sha(m['content']['text'].encode()),'sentAt':m['sent_at'],'replyTo':m['reply_to_id'],'replyRoot':m['reply_root_message_id']}
    return {'version':VERSION,'upstreamReadProvenance':'parent_reported_official_user_message_read_raw_not_mac_or_owner_independent_read','authorizationDigest':AUTHORIZATION,'room':ROOM,'actorBinding':'exact full API raw pin; private actor id is not emitted','apiRawSha256':sha(raw['context.parentProvidedApiRaw']),'allReturnedMessagesBound':len(messages),'directives':[view(first,'user_directive_explicit_report_reply'),view(last,'user_directive_no_explicit_reply')],'contexts':[view(by_id[CONTEXTS[0]],'progress_report_not_approval_question'),view(by_id[CONTEXTS[1]],'assistant_acknowledgement')],'nativeFirstHops':first_hops,'nativeSecondHops':[{'nativeName':'codex_app.send_message_to_thread','recordKind':'mcpToolCall','rawSha256':sha(raw['scope.outgoing']),'resultPayloadExposed':False},{'nativeName':'codex_app.send_message_to_thread','recordKind':'runtime_tool_arguments_and_result_capture','rawSha256':sha(raw['context.secondHopRuntimeCapture']),'nativeCallIdStatus':'NOT_EXPOSED','resultPayloadExposed':True}],'sourceBundleSha256':sha(canonical({k:sha(v) for k,v in raw.items()}))}

PROFILE_FILES=('directive-scope-v1/start-provenance.py','directive-scope-v1/profile.py','directive-scope-v1/entry.py','directive-scope-v1/evidence-pins.json','container-diagnostic/restore/source-lock.json')

def verify_locks(profile):
    base=HERE.parent
    raw=(HERE/'source-lock.json').read_bytes()
    require(sha(raw)==profile['profileLockSha256'],'DIRECTIVE_PROFILE_LOCK_CONFLICT')
    lock=json.loads(raw);require(set(lock)==set(PROFILE_FILES),'DIRECTIVE_PROFILE_SOURCE_SET_CONFLICT')
    for name,digest in lock.items():require(sha((base/name).read_bytes())==digest,'DIRECTIVE_PROFILE_SOURCE_CHANGED')
    raw=(base/'container-diagnostic/restore/source-lock.json').read_bytes()
    require(sha(raw)==profile['sourceLockSha256'],'DIRECTIVE_BASE_SOURCE_LOCK_CONFLICT')
    for name,digest in json.loads(raw).items():require(sha((base/name).read_bytes())==digest,'DIRECTIVE_BASE_SOURCE_CHANGED')

def fingerprint(profile):
    verify_locks(profile)
    return sha(canonical(profile))

def qualified_code_hash(base_code_hash,configuration,source_profile):
    require(is_hash(base_code_hash),'DIRECTIVE_BASE_CODE_HASH_REQUIRED')
    require(type(configuration) is dict and set(configuration)=={'mode','sourceLockSha256','windowBindingSha256'} and configuration['mode']=='same-copy-typed-postdata/1','DIRECTIVE_TYPED_CONFIGURATION_REQUIRED')
    require(configuration['sourceLockSha256']==source_profile['sourceLockSha256'] and configuration['windowBindingSha256']==source_profile['windowBindingSha256'],'DIRECTIVE_CONFIGURATION_BINDING_CONFLICT')
    return sha(base_code_hash.encode()+(HERE/'entry.py').read_bytes()+fingerprint(source_profile).encode()+canonical(configuration))

def require_configured(profile,root,keys):
    require(type(profile) is dict and set(profile)=={'version','authorizationDigest','humanRecord','startFile','identityPathSha256','preservedPins','sourceLockSha256','profileLockSha256','windowBindingSha256','runtimeImage','captureId','manifestSha256','scope','localOnly'},'DIRECTIVE_PROFILE_CONFIGURATION_REQUIRED')
    require(profile['version']==VERSION and profile['authorizationDigest']==AUTHORIZATION and profile['captureId']==CAPTURE and profile['manifestSha256']==MANIFEST and profile['identityPathSha256']==IDENTITY and profile['runtimeImage']==IMAGE and profile['localOnly'] is True and canonical(profile['scope'])==canonical(SCOPE),'DIRECTIVE_FIXED_SCOPE_CONFLICT')
    for key in ('sourceLockSha256','profileLockSha256','windowBindingSha256'):require(is_hash(profile[key]),'DIRECTIVE_QUALIFIED_SOURCE_REQUIRED')
    verify_locks(profile)
    pin=profile['humanRecord'];require(type(pin) is dict and set(pin)=={'path','sha256'} and is_hash(pin['sha256']),'DIRECTIVE_HUMAN_RECORD_PIN_REQUIRED')
    for path,prefix in ((pin['path'],'directive-v1-human-'),(profile['startFile'],'directive-v1-start-')):
        require(type(path) is str,'DIRECTIVE_NEW_RECORD_PATH_REQUIRED')
        p=Path(path);require(p.parent==root and p.name.startswith(prefix) and p.suffix=='.json','DIRECTIVE_NEW_RECORD_PATH_REQUIRED')
    preserved=profile['preservedPins'];require(type(preserved) is dict and set(preserved)==keys,'DIRECTIVE_PRESERVED_PINS_REQUIRED')
    for pin in preserved.values():require(type(pin) is dict and set(pin)=={'path','sha256'} and is_hash(pin['sha256']),'DIRECTIVE_PRESERVED_PIN_CONFLICT')

def binding(profile,name,root,keys):
    require_configured(profile,root,keys)
    return {'HUMAN_FILE':Path(profile['humanRecord']['path']),'HUMAN_SHA256':profile['humanRecord']['sha256'],'START_FILE':Path(profile['startFile']),'IDENTITY_PATH_SHA256':IDENTITY,'PRESERVED_PINS':profile['preservedPins']}[name]

def validate_record(human,profile):
    require(type(human) is dict and set(human)=={'status','profileVersion','fileDoesNotSelfAuthorize','sourceEvidence','windowId','windowBindingSha256','target','parentCaptureId','manifestSha256','identityPathSha256','scope','localOnly','runtimeImage'},'DIRECTIVE_QUALIFICATION_RECORD_REQUIRED')
    require(human['status']=='DIRECTIVE_SCOPE_QUALIFIED_NOT_EXECUTED' and human['profileVersion']==VERSION and human['fileDoesNotSelfAuthorize'] is True and human['localOnly'] is True,'DIRECTIVE_RECORD_KIND_CONFLICT')
    require(human['target']=='dzqdzetcctkhbrhlxxgn' and human['parentCaptureId']==CAPTURE and human['manifestSha256']==MANIFEST and human['identityPathSha256']==IDENTITY,'DIRECTIVE_RECORD_MATERIAL_CONFLICT')
    require(human['windowBindingSha256']==profile['windowBindingSha256'] and human['runtimeImage']==IMAGE and canonical(human['scope'])==canonical(SCOPE),'DIRECTIVE_RECORD_SCOPE_CONFLICT')
    require(canonical(human['sourceEvidence'])==canonical(verify_sources()),'DIRECTIVE_SOURCE_PROJECTION_CONFLICT')

def window_binding(packet):
    # Stable across causal source repairs in the SAME window. Per-attempt source
    # and profile locks are separately bound by qualified_hash and Main START.
    identifier=packet.get('windowId')
    require(type(packet.get('windowStartMonotonic')) in (int,float) and math.isfinite(packet['windowStartMonotonic']),'DIRECTIVE_START_MONOTONIC_REQUIRED')
    require(type(identifier) is str and str(uuid.UUID(identifier))==identifier and uuid.UUID(identifier).int!=0 and identifier!=CAPTURE and type(packet.get('windowStart')) is str and type(packet.get('windowEnd')) is str,'DIRECTIVE_ACTUAL_WINDOW_FIELDS_REQUIRED')
    return sha(canonical({'authorizationDigest':AUTHORIZATION,'windowId':packet.get('windowId'),'windowStart':packet.get('windowStart'),'windowEnd':packet.get('windowEnd'),'windowStartMonotonic':packet.get('windowStartMonotonic'),'captureId':CAPTURE,'manifestSha256':MANIFEST,'identityPathSha256':IDENTITY,'runtimeImage':IMAGE,'maximumCopies':2,'localOnly':True}))

def check_packet(profile,packet,code_hash,instant,stamp,identity_digest):
    require(is_hash(code_hash) and identity_digest==IDENTITY,'DIRECTIVE_PACKET_IDENTITY_REQUIRED')
    require(packet.get('target')=='dzqdzetcctkhbrhlxxgn' and packet.get('parentCaptureId')==CAPTURE and packet.get('manifestSha256')==MANIFEST and packet.get('codeSha256')==code_hash,'DIRECTIVE_PACKET_BINDING_CONFLICT')
    require(type(packet.get('attempt')) is int and packet['attempt'] in (1,2) and type(packet.get('maximumCopies')) is int and packet['maximumCopies']==2,'DIRECTIVE_PACKET_COUNT_CONFLICT')
    require(window_binding(packet)==profile['windowBindingSha256'],'DIRECTIVE_WINDOW_BINDING_CONFLICT')
    begin,end=stamp(packet['windowStart']),stamp(packet['windowEnd'])
    require(begin.tzinfo is not None and end.tzinfo is not None and (end-begin).total_seconds()==3600 and begin<=instant and (end-instant).total_seconds()>=1800,'DIRECTIVE_WINDOW_EXPIRED')


def preclaim(profile,packet,code_hash,identity_digest):
    check_packet(profile,packet,code_hash,datetime.now(timezone.utc),lambda v:datetime.fromisoformat(v.replace('Z','+00:00')),identity_digest)

def authority_name():return 'diagnostic-authority-'+AUTHORIZATION+'.used.json'
def authority_record(profile,packet):
    return {'status':'AUTHORIZATION_BOUND_BEFORE_ARCHIVE_READ','authorizationDigest':AUTHORIZATION,'humanRecordSha256':profile['humanRecord']['sha256'],'windowId':packet['windowId'],'windowStart':packet['windowStart'],'windowEnd':packet['windowEnd'],'windowStartMonotonic':packet['windowStartMonotonic'],'parentCaptureId':CAPTURE,'manifestSha256':MANIFEST,'identityPathSha256':IDENTITY,'maximumCopies':2,'runtimeImage':IMAGE,'windowBindingSha256':profile['windowBindingSha256']}

def check_authority_claim(gate,profile,packet):
    expected=authority_record(profile,packet);path=gate.ARCHIVES/authority_name()
    if packet['attempt']==1:require(not os.path.lexists(path),'DIRECTIVE_AUTHORIZATION_ALREADY_BOUND')
    else:
        prior,_=gate.read_private(path);require(canonical(prior)==canonical(expected),'DIRECTIVE_AUTHORIZATION_WINDOW_CONFLICT')

def bind_authority_claim(gate,profile,packet,fd):
    if packet['attempt']==1:gate.exclusive(fd,authority_name(),authority_record(profile,packet))
    else:check_authority_claim(gate,profile,packet)

# Only this fixed schema may be read before operator/material qualification.
HEADER_VERSION='directive-execution-header/v2'
HEADER_PACKET_FIELDS=('approvedBy','proposalOnly','windowId','windowStart','windowEnd','windowStartMonotonic','attempt','maximumCopies','target','parentCaptureId','manifestSha256','codeSha256','humanAuthorizationSha256','reviewedSourceCommit','parentFailureSha256','mainStartReceiptSha256','actions','retainUntil','noNewCaptureKeyGrantProviderOrE')

def execution_header(packet,packet_sha,identity_digest):
    require(is_hash(packet_sha) and is_hash(identity_digest),'DIRECTIVE_HEADER_HASH_REQUIRED')
    return {**{k:packet[k] for k in HEADER_PACKET_FIELDS},'version':HEADER_VERSION,'authorizationDigest':AUTHORIZATION,'packetSha256':packet_sha,'identityPathSha256':identity_digest}

def header_path(packet_path):return Path(packet_path).with_suffix('.execution-header.json')

def _read_header(path):
    try:
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(fd,'rb') as f:
            st=os.fstat(f.fileno())
            require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and 0<st.st_size<8192,'DIRECTIVE_HEADER_FILE_UNSAFE')
            value=json.loads(f.read(8192))
    except (OSError,json.JSONDecodeError):raise ValueError('DIRECTIVE_HEADER_UNAVAILABLE') from None
    require(type(value) is dict and set(value)==set(HEADER_PACKET_FIELDS)|{'version','authorizationDigest','packetSha256','identityPathSha256'},'DIRECTIVE_HEADER_FIELDS_REQUIRED')
    return value

def _early_ledger(gate,profile,header):
    require(not os.path.lexists(gate.ARCHIVES/gate.active_name()),'DIRECTIVE_CAPTURE_ALREADY_ACTIVE')
    check_authority_claim(gate,profile,header)
    require(not os.path.lexists(gate.ARCHIVES/gate.filename(header['windowId'],header['attempt'],'used')),'DIAGNOSTIC_ALREADY_ACTIVE_OR_CONSUMED')
    if header['attempt']==2:
        prior,_=gate.read_private(gate.ARCHIVES/gate.filename(header['windowId'],1,'result'),header['parentFailureSha256'])
        require(prior.get('status')=='ATTEMPT_FINISHED' and prior.get('attempt')==1 and prior.get('windowId')==header['windowId'] and prior.get('windowStart')==header['windowStart'] and prior.get('windowEnd')==header['windowEnd'] and prior.get('parentCaptureId')==CAPTURE and prior.get('manifestSha256')==MANIFEST and prior.get('identityPathSha256')==IDENTITY and prior.get('humanAuthorizationSha256')==profile['humanRecord']['sha256'] and prior.get('outcome',{}).get('cleanup')=='PASS' and prior.get('outcome',{}).get('status','').startswith('FAIL_'),'DIRECTIVE_SECOND_WINDOW_NOT_ELIGIBLE')
        used,_=gate.read_private(gate.ARCHIVES/gate.filename(header['windowId'],1,'used'))
        require(used=={'status':'CONSUMED_BEFORE_ARCHIVE_READ',**{k:prior.get(k) for k in gate.binding_keys(header,header['codeSha256'],profile)}},'DIAGNOSTIC_PRIOR_CONSUMPTION_CHAIN_REQUIRED')
        require(prior.get('codeSha256')!=header['codeSha256'] and prior.get('reviewedSourceCommit')!=header['reviewedSourceCommit'],'DIAGNOSTIC_SAME_SOURCE_REPEAT_FORBIDDEN')

# Process-local continuity only. Serialized monotonic numbers never establish
# an origin in another interpreter (notably macOS Python < 3.10). Keep weak
# ownership plus PID so neither reconstruction nor fork inherits eligibility.
_START_OWNERS={}
_START_OWNER_LOCK=threading.RLock()
_LEASES=weakref.WeakKeyDictionary()
class _RunLease:
    __slots__=('__weakref__',)

def start_budget(core,header,expected_object=None):
    d=core.diagnostic_deadline;b=getattr(core,'directiveStartBudget',None)
    require(type(b) is d.Budget,'DIRECTIVE_START_BUDGET_REQUIRED')
    if expected_object is not None:require(b is expected_object,'DIRECTIVE_START_BUDGET_REPLACED')
    anchor=header['windowStartMonotonic']
    require(type(anchor) in (int,float) and math.isfinite(anchor) and anchor<=d.monotonic(),'DIRECTIVE_START_MONOTONIC_CONFLICT')
    require(b.clock is d.monotonic and b.wall_clock is d.utc_now,'DIRECTIVE_START_CLOCK_CONFLICT')
    require(b.window_end==anchor+3600 and b.data_end==b.window_end-d.DATA_CLEANUP_RESERVE_SECONDS and b.reserve==d.DATA_CLEANUP_RESERVE_SECONDS and b.cleanup_seconds==d.CLEANUP_BUDGET_SECONDS and b.wall_end==core.base.capture.stamp(header['windowEnd']),'DIRECTIVE_START_DEADLINE_CONFLICT')
    original_anchor,original_instant=provenance.verify_start_provenance(b)
    require(anchor==original_anchor and header.get('windowStart')==original_instant.isoformat(),'DIRECTIVE_START_ORIGIN_BINDING_CONFLICT')
    window=header.get('windowId');attempt=header.get('attempt')
    require(type(window) is str and attempt in (1,2),'DIRECTIVE_CLOCK_WINDOW_REQUIRED')
    with _START_OWNER_LOCK:
        owner=_START_OWNERS.get(window)
        if owner is None:
            require(attempt==1,'DIRECTIVE_ORIGINAL_CLOCK_OWNER_UNAVAILABLE')
        else:
            require(owner[0]==os.getpid() and owner[1]() is b,
                    'DIRECTIVE_ORIGINAL_CLOCK_OWNER_CONFLICT')
        b.check()
        if owner is None:_START_OWNERS[window]=(os.getpid(),weakref.ref(b))
    return b

def lease_budget(lease,core,args,profile):
    header=lease_header(lease,core,args,profile)
    return start_budget(core,header,_LEASES[lease]['budget'])

def lease_header(lease,core,args,profile):
    require(type(lease) is _RunLease,'DIRECTIVE_PREFLIGHT_LEASE_REQUIRED')
    state=_LEASES.get(lease)
    require(state is not None and state['fd'] is not None and state['args']==tuple(map(str,args)) and state['profile']==fingerprint(profile) and state['code']==core.code_hash(),'DIRECTIVE_PREFLIGHT_LEASE_CONFLICT')
    start_budget(core,state['header'],state['budget'])
    return copy.deepcopy(state['header'])

def release_preflight(lease):
    require(type(lease) is _RunLease and lease in _LEASES,'DIRECTIVE_PREFLIGHT_LEASE_REQUIRED')
    state=_LEASES[lease];fd=state['fd']
    if fd is not None:
        state['fd']=None
        try:fcntl.flock(fd,fcntl.LOCK_UN)
        finally:os.close(fd)

@contextmanager
def run_preflight(gate,core,args,profile):
    # All public execution entry points delegate here. The facade's hashes do
    # not assert source verification: real pinned source validation is mandatory.
    require('DOCKER_HOST' not in os.environ and 'DOCKER_CONTEXT' not in os.environ,'DOCKER_OVERRIDE_REJECTED')
    require(getattr(core,'diagnostic_deadline',None) is not None,'DIRECTIVE_START_PROVENANCE_REQUIRED')
    provenance.verify_start_provenance(getattr(core,'directiveStartBudget',None))
    require_configured(profile,gate.ROOT,gate.PRESERVED_KEYS)
    require(getattr(core,'directiveSourceFingerprint',None)==fingerprint(profile),'DIRECTIVE_QUALIFIED_ENTRY_REQUIRED')
    expected=qualified_code_hash(getattr(core,'directiveBaseCodeHash',None),getattr(core,'directiveTypedConfiguration',None),profile)
    require(core.code_hash()==expected,'DIRECTIVE_QUALIFIED_CODE_HASH_CONFLICT')
    verify_sources()
    require(len(args)==4,'DIRECTIVE_EXECUTION_ARGUMENTS_REQUIRED')
    ap,mp,ip,plan=map(Path,args)
    require(ap.parent==gate.ROOT and ap.name.startswith('directive-v1-packet-') and ap.suffix=='.json','DIRECTIVE_PACKET_METADATA_PATH_REQUIRED')
    header=_read_header(header_path(ap))
    require(header['version']==HEADER_VERSION and header['authorizationDigest']==AUTHORIZATION and is_hash(header['packetSha256']),'DIRECTIVE_HEADER_BINDING_CONFLICT')
    require(header['approvedBy']=='JT' and header['proposalOnly'] is False and header['humanAuthorizationSha256']==profile['humanRecord']['sha256'] and header['actions']==gate.ACTIONS and header['retainUntil']==gate.RETAIN and header['noNewCaptureKeyGrantProviderOrE'] is True,'DIRECTIVE_HEADER_SCOPE_CONFLICT')
    for key in ('parentFailureSha256','mainStartReceiptSha256'):require(is_hash(header[key]),'DIRECTIVE_HEADER_HASH_REQUIRED')
    require(type(header['reviewedSourceCommit']) is str and re.fullmatch('[a-f0-9]{40}',header['reviewedSourceCommit']),'DIRECTIVE_HEADER_SOURCE_REQUIRED')
    gate.canonical_uuid(header['windowId'])
    instant=core.base.capture.now();stamp=core.base.capture.stamp
    check_packet(profile,header,expected,instant,stamp,header['identityPathSha256'])
    require(stamp(header['windowEnd'])<stamp(gate.RETAIN),'DIRECTIVE_WINDOW_EXPIRED')
    budget=start_budget(core,header)
    root_fd=gate.open_root();lock_fd=None;lease=None
    try:
        # Coordination only: empty persistent lock inode, no START/window/claim
        # record. No consumed marker is created or rolled back by this lock.
        name='diagnostic-parent-'+CAPTURE+'.preflight.lock'
        lock_fd=os.open(name,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600,dir_fd=root_fd)
        st=os.fstat(lock_fd)
        require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and st.st_size==0,'DIRECTIVE_PREFLIGHT_LOCK_UNSAFE')
        try:fcntl.flock(lock_fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('DIRECTIVE_PREFLIGHT_BUSY') from None
        _early_ledger(gate,profile,header)
        lease=_RunLease();_LEASES[lease]={'fd':lock_fd,'header':header,'args':tuple(map(str,args)),'profile':fingerprint(profile),'code':expected,'budget':budget};lock_fd=None
        yield lease
    finally:
        if lease is not None:release_preflight(lease)
        if lock_fd is not None:os.close(lock_fd)
        os.close(root_fd)

def bind_header(header,packet,packet_sha,identity_digest,args):
    require(canonical(execution_header(packet,packet_sha,identity_digest))==canonical(header),'DIRECTIVE_HEADER_PACKET_CONFLICT')
    require(packet.get('manifestPath')==str(Path(args[1])) and packet.get('identityPath')==str(Path(args[2])),'DIRECTIVE_HEADER_ARGUMENT_CONFLICT')
