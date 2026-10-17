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
spec=importlib.util.spec_from_file_location('directive_start_provenance',HERE.parent/'directive-scope-v1/start-provenance.py')
provenance=importlib.util.module_from_spec(spec);spec.loader.exec_module(provenance)
provenance=provenance.shared_runtime()
VERSION='jt-next-bounded-scope/v2'
BESTJ='01a1330e-5008-7061-909b-8abb26792003'
MAC='01a13313-19fd-77be-959c-9448bfab80ce'
MAIN='01a13311-9212-7db3-8c75-691eac0f03ea'
ROOM='6acd9506863c81958e1176881961131c'
CAPTURE='f97d05db-c706-4ce9-82d8-579cbb0b9310'
MANIFEST='668f0bb3a34319310a7bee2a07e514f47c11442d08cd78fe4e772856c3f61085'
IDENTITY='58aa1f73d84e1c265bf64beffe6718ebd1b981d22165ef133fbc1569816451d7'
IMAGE='sha256:74699ee2438a45c748fb5e82bde5cafa4c8e2c39879d107ac8b6c0d43a0b1451'
OLD_EVENTS=frozenset({'Sentinel_9fd068e678a0819187991a0a17138244','Sentinel_e4ac0f273c108191a5dfc74e481efce9','Sentinel_90d9e98b22488191ac8a1eb87cff898e'})
BINDING=json.loads((HERE/'pending-binding.json').read_text())
SCOPE={'minutes':60,'maximumCopies':2,'noOtherPlannedDdlChanges':True,'ordinaryDmlContinues':True,'reuseOriginalCapture':True,'localRehearsalAfterFullRestorePass':True,'newCapture':False,'newIdentity':False,'newLiveGrants':False,'provider':False,'targetE':False}

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def sha(value):return hashlib.sha256(value).hexdigest()
def require(ok,code):
    if not ok:raise ValueError(code)
def is_hash(value):return type(value) is str and re.fullmatch('[a-f0-9]{64}',value) is not None

# Stable across profile/source/window revisions: the same actual directives
# cannot obtain another window merely through a new code or relay hash.
def authorization():
    require_binding()
    return sha(canonical({'room':ROOM,'sourceThread':BESTJ,'directiveIds':[BINDING['directiveId']],'capture':CAPTURE}))

def contains(tree,item):
    if tree==item:return True
    if isinstance(tree,dict):return any(contains(v,item) for v in tree.values())
    if isinstance(tree,list):return any(contains(v,item) for v in tree)
    return False

def require_binding():
    require(type(BINDING) is dict and set(BINDING)=={'directiveId','directiveTextSha256','actorSha256','sentAt','pins'},'SCOPE_V2_UNCONFIGURED')
    require(all(BINDING[k] is not None for k in BINDING),'SCOPE_V2_UNCONFIGURED')
    identifier=BINDING['directiveId']
    require(type(identifier) is str and re.fullmatch('Sentinel_[0-9a-f]{32}',identifier) and identifier not in OLD_EVENTS,'SCOPE_V2_OLD_OR_INVALID_EVENT')
    require(is_hash(BINDING['directiveTextSha256']) and is_hash(BINDING['actorSha256']),'SCOPE_V2_REAL_HASH_REQUIRED')
    try:sent=datetime.fromisoformat(BINDING['sentAt'].replace('Z','+00:00'))
    except Exception:raise ValueError('SCOPE_V2_REAL_TIME_REQUIRED') from None
    require(sent.tzinfo is not None and datetime.fromisoformat('2026-10-16T12:48:08.407846+00:00')<sent<=datetime.now(timezone.utc),'SCOPE_V2_REAL_TIME_REQUIRED')
    inputs=BINDING['pins']
    require(type(inputs) is dict and set(inputs)=={'upstreamRead','upstreamContext','macRead','firstHop','secondHop'},'SCOPE_V2_REAL_PINS_REQUIRED')
    for pin in inputs.values():
        require(type(pin) is dict and set(pin)=={'path','bytes','sha256'} and type(pin['path']) is str and Path(pin['path']).is_absolute() and type(pin['bytes']) is int and 0<pin['bytes']<=1048576 and is_hash(pin['sha256']),'SCOPE_V2_REAL_PIN_REQUIRED')

def fixed_actor_pin():
    pin=json.loads((HERE.parent/'directive-scope-v1/evidence-pins.json').read_text())['inputs']['context.parentProvidedApiRaw']
    require(pin['sha256']=='563828019bc610f95b23a18fd3bace42e37e18ac8e6eca63c1096fb0ff16d5cd','SCOPE_V2_ORIGINAL_ACTOR_PIN_CONFLICT')
    return pin

def pins():
    require_binding();return {**BINDING['pins'],'actorReference':fixed_actor_pin()}

def read_sources():
    require_binding();result={}
    for key,pin in pins().items():
        path=Path(pin['path']);parent=path.parent.lstat()
        require(path.resolve()==path and stat.S_ISDIR(parent.st_mode) and parent.st_uid==os.getuid() and stat.S_IMODE(parent.st_mode)==0o700,'DIRECTIVE_METADATA_ROOT_CONFLICT')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(fd,'rb') as f:
            st=os.fstat(f.fileno());require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and st.st_size==pin['bytes'],'DIRECTIVE_METADATA_FILE_CONFLICT')
            raw=f.read(1048577)
        require(len(raw)==pin['bytes'] and sha(raw)==pin['sha256'],'DIRECTIVE_RAW_PIN_CONFLICT');result[key]=raw
    return result

def native_first_input(first,snapshot,context,raw):
    # Match the complete native envelope, not a quoted/nested occurrence. The
    # sender lives in the outer source_thread_id; text inside input is payload.
    text=first['output'].get('text')
    require(type(text) is str,'SCOPE_V2_NATIVE_OUTER_REQUIRED')
    match=re.fullmatch(r'\s*<codex_delegation>\s*<source_thread_id>\s*([0-9a-f-]{36})\s*</source_thread_id>\s*<input>([\s\S]*)</input>\s*</codex_delegation>\s*',text)
    require(match is not None,'SCOPE_V2_NATIVE_OUTER_REQUIRED')
    body=match[2]
    require(not re.search(r'<\s*/?\s*(?:codex_delegation|source_thread_id|input)\b',body,re.I),'SCOPE_V2_NESTED_DELIVERY_REJECTED')
    require(match[1]==BESTJ,'SCOPE_V2_NATIVE_SOURCE_THREAD_CONFLICT')
    require(type(snapshot.get('thread')) is dict and snapshot['thread'].get('id')==MAC and snapshot['thread'].get('kind')=='codex' and type(snapshot.get('turns')) is list,'DIRECTIVE_FIRST_HOP_SOURCE_CONFLICT')
    items=[]
    for turn in snapshot['turns']:
        require(type(turn) is dict and type(turn.get('items')) is list,'DIRECTIVE_FIRST_HOP_SOURCE_CONFLICT')
        items.extend(turn['items'])
    matches=[item for item in items if type(item) is dict and item.get('id')==first['id']]
    require(len(matches)==1 and matches[0]==first,'DIRECTIVE_NATIVE_RECEIPT_NOT_DIRECT_ITEM')
    # Human room is separate parent-provided context, not the Codex thread ID
    # and not a token quoted in the message payload. Keep its evidence level.
    require(type(context) is dict and context.get('record.kind')=='full_context_two_hop_evidence_index' and context.get('humanRawKind')=='parent_reported_official_user_message_read_raw' and context.get('parentProvidedRoom')==ROOM,'SCOPE_V2_ROOM_CONTEXT_CONFLICT')
    files=context.get('files');require(type(files) is dict,'SCOPE_V2_CONTEXT_LINK_REQUIRED')
    for label,key in (('parentProvidedApiRaw','upstreamRead'),('bestjMacRecord','firstHop'),('officialMacRead','macRead')):
        ref=files.get(label)
        require(type(ref) is dict and set(ref)=={'path','sha256','bytes'} and type(ref['path']) is str and ref['sha256']==sha(raw[key]) and type(ref['bytes']) is int and ref['bytes']==len(raw[key]),'SCOPE_V2_CONTEXT_LINK_REQUIRED')
    return body

def verify_sources(raw=None):
    require_binding();expected=pins();raw=read_sources() if raw is None else raw
    require(type(raw) is dict and set(raw)==set(expected),'DIRECTIVE_SOURCE_SET_REQUIRED')
    for key,pin in expected.items():require(type(raw[key]) is bytes and len(raw[key])==pin['bytes'] and sha(raw[key])==pin['sha256'],'DIRECTIVE_RAW_PIN_CONFLICT')
    parsed={key:json.loads(value) for key,value in raw.items()}
    api=parsed['upstreamRead'];payload=api['structuredContent']
    require(api.get('isError') is False and payload.get('partial') is False and json.loads(api['content'][0]['text'])==payload,'DIRECTIVE_FULL_RAW_REQUIRED')
    original=parsed['actorReference'];old=original['structuredContent']
    require(original.get('isError') is False and old.get('partial') is False and json.loads(original['content'][0]['text'])==old,'SCOPE_V2_ORIGINAL_ACTOR_RAW_REQUIRED')
    old_messages=[*old['before'],old['message'],*old['after']]
    old_users=[m for m in old_messages if m.get('message_id') in OLD_EVENTS and m.get('author')=='user']
    require(len(old_users)==2 and old_users[0]['author_id']==old_users[1]['author_id'] and sha(old_users[0]['author_id'].encode())==BINDING['actorSha256'],'SCOPE_V2_ORIGINAL_ACTOR_CONFLICT')
    message=payload['message']
    require(message['message_id']==BINDING['directiveId'] and message['author']=='user' and sha(message['author_id'].encode())==BINDING['actorSha256'] and message['sent_at']==BINDING['sentAt'],'SCOPE_V2_ACTOR_EVENT_CONFLICT')
    require(sha(message['content']['text'].encode())==BINDING['directiveTextSha256'],'DIRECTIVE_TEXT_CONFLICT')
    first=parsed['firstHop'];snapshot=parsed['macRead']
    require(type(first) is dict and set(first)=={'type','id','namespace','name','output'} and type(first.get('output')) is dict and set(first['output'])=={'text','truncated'},'DIRECTIVE_NATIVE_FIRST_HOP_REQUIRED')
    require(first.get('type')=='functionCallOutput' and first.get('namespace')=='cloud_threads' and first.get('name')=='send_message' and type(first.get('id')) is str and bool(first['id']) and first.get('output',{}).get('truncated') is False,'DIRECTIVE_NATIVE_FIRST_HOP_REQUIRED')
    text=native_first_input(first,snapshot,parsed['upstreamContext'],raw)
    require(all(value in text for value in (BINDING['directiveId'],sha(raw['upstreamRead']))),'SCOPE_V2_FIRST_EVIDENCE_LINK_REQUIRED')
    second=parsed['secondHop']
    require(second.get('record.kind')=='runtime_tool_arguments_and_result_capture' and second.get('tool')=='codex_app.send_message_to_thread' and second.get('sourceThreadId')==MAC,'DIRECTIVE_CONTEXT_SECOND_HOP_CONFLICT')
    require(second['arguments']['threadId']==MAIN and all(value in second['arguments']['prompt'] for value in (BINDING['directiveId'],sha(raw['firstHop']))),'DIRECTIVE_CONTEXT_TARGET_CONFLICT')
    result=second['result'];require(result['isError'] is False and json.loads(result['content'][0]['text'])['threadId']==MAIN,'DIRECTIVE_CONTEXT_RESULT_CONFLICT')
    return {'version':VERSION,'authorizationDigest':authorization(),'room':ROOM,'eventId':BINDING['directiveId'],'actorSha256':BINDING['actorSha256'],'eventTextSha256':BINDING['directiveTextSha256'],'sentAt':BINDING['sentAt'],'provenance':'PARENT_REPORTED_OFFICIAL_READ_RAW_WITH_PINNED_NATIVE_RELAY_NOT_INDEPENDENT_UPSTREAM_READ','sourceBundleSha256':sha(canonical({key:sha(value) for key,value in raw.items()}))}

PROFILE_FILES=('directive-scope-v1/entry.py','directive-scope-v1/profile.py','directive-scope-v1/evidence-pins.json','directive-scope-v2/profile.py','directive-scope-v2/entry.py','directive-scope-v2/bootstrap.py','directive-scope-v2/pending-binding.json','directive-scope-v1/live-controller.py','directive-scope-v1/start-provenance.py','container-diagnostic/restore/source-lock.json')

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
    require(type(configuration) is dict and set(configuration)=={'mode','sourceLockSha256','windowBindingSha256'} and configuration['mode'] in ('same-copy-typed-postdata/1','same-copy-typed-postdata/2'),'DIRECTIVE_TYPED_CONFIGURATION_REQUIRED')
    require(configuration['sourceLockSha256']==source_profile['sourceLockSha256'] and configuration['windowBindingSha256']==source_profile['windowBindingSha256'],'DIRECTIVE_CONFIGURATION_BINDING_CONFLICT')
    return sha(base_code_hash.encode()+(HERE/'entry.py').read_bytes()+fingerprint(source_profile).encode()+canonical(configuration))

def require_configured(profile,root,keys):
    require_binding()
    require(type(profile) is dict and set(profile)=={'version','authorizationDigest','humanRecord','startFile','identityPathSha256','preservedPins','sourceLockSha256','profileLockSha256','windowBindingSha256','runtimeImage','captureId','manifestSha256','scope','localOnly'},'DIRECTIVE_PROFILE_CONFIGURATION_REQUIRED')
    require(profile['version']==VERSION and profile['authorizationDigest']==authorization() and profile['captureId']==CAPTURE and profile['manifestSha256']==MANIFEST and profile['identityPathSha256']==IDENTITY and profile['runtimeImage']==IMAGE and profile['localOnly'] is True and canonical(profile['scope'])==canonical(SCOPE),'DIRECTIVE_FIXED_SCOPE_CONFLICT')
    for key in ('sourceLockSha256','profileLockSha256','windowBindingSha256'):require(is_hash(profile[key]),'DIRECTIVE_QUALIFIED_SOURCE_REQUIRED')
    verify_locks(profile)
    pin=profile['humanRecord'];require(type(pin) is dict and set(pin)=={'path','sha256'} and is_hash(pin['sha256']),'DIRECTIVE_HUMAN_RECORD_PIN_REQUIRED')
    for path,prefix in ((pin['path'],'directive-v2-human-'),(profile['startFile'],'directive-v2-start-')):
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
    return sha(canonical({'authorizationDigest':authorization(),'windowId':packet.get('windowId'),'windowStart':packet.get('windowStart'),'windowEnd':packet.get('windowEnd'),'windowStartMonotonic':packet.get('windowStartMonotonic'),'captureId':CAPTURE,'manifestSha256':MANIFEST,'identityPathSha256':IDENTITY,'runtimeImage':IMAGE,'maximumCopies':2,'localOnly':True}))

def check_packet(profile,packet,code_hash,instant,stamp,identity_digest):
    require(is_hash(code_hash) and identity_digest==IDENTITY,'DIRECTIVE_PACKET_IDENTITY_REQUIRED')
    require(packet.get('target')=='dzqdzetcctkhbrhlxxgn' and packet.get('parentCaptureId')==CAPTURE and packet.get('manifestSha256')==MANIFEST and packet.get('codeSha256')==code_hash,'DIRECTIVE_PACKET_BINDING_CONFLICT')
    require(type(packet.get('attempt')) is int and packet['attempt'] in (1,2) and type(packet.get('maximumCopies')) is int and packet['maximumCopies']==2,'DIRECTIVE_PACKET_COUNT_CONFLICT')
    require(window_binding(packet)==profile['windowBindingSha256'],'DIRECTIVE_WINDOW_BINDING_CONFLICT')
    begin,end=stamp(packet['windowStart']),stamp(packet['windowEnd'])
    require(begin.tzinfo is not None and end.tzinfo is not None and (end-begin).total_seconds()==3600 and begin<=instant and (end-instant).total_seconds()>=1800,'DIRECTIVE_WINDOW_EXPIRED')


def preclaim(profile,packet,code_hash,identity_digest):
    check_packet(profile,packet,code_hash,datetime.now(timezone.utc),lambda v:datetime.fromisoformat(v.replace('Z','+00:00')),identity_digest)

def authority_name():return 'diagnostic-authority-'+authorization()+'.used.json'
def authority_record(profile,packet):
    return {'status':'AUTHORIZATION_BOUND_BEFORE_ARCHIVE_READ','authorizationDigest':authorization(),'humanRecordSha256':profile['humanRecord']['sha256'],'windowId':packet['windowId'],'windowStart':packet['windowStart'],'windowEnd':packet['windowEnd'],'windowStartMonotonic':packet['windowStartMonotonic'],'parentCaptureId':CAPTURE,'manifestSha256':MANIFEST,'identityPathSha256':IDENTITY,'maximumCopies':2,'runtimeImage':IMAGE,'windowBindingSha256':profile['windowBindingSha256']}

def check_authority_claim(gate,profile,packet):
    expected=authority_record(profile,packet);path=gate.ARCHIVES/authority_name()
    if packet['attempt']==1:require(not os.path.lexists(path),'DIRECTIVE_AUTHORIZATION_ALREADY_BOUND')
    else:
        prior,_=gate.read_private(path);require(canonical(prior)==canonical(expected),'DIRECTIVE_AUTHORIZATION_WINDOW_CONFLICT')

def bind_authority_claim(gate,profile,packet,fd):
    if packet['attempt']==1:gate.exclusive(fd,authority_name(),authority_record(profile,packet))
    else:check_authority_claim(gate,profile,packet)

# Only this fixed schema may be read before operator/material qualification.
HEADER_VERSION='scope-v2-execution-header/1'
HEADER_PACKET_FIELDS=('approvedBy','proposalOnly','windowId','windowStart','windowEnd','windowStartMonotonic','attempt','maximumCopies','target','parentCaptureId','manifestSha256','codeSha256','humanAuthorizationSha256','reviewedSourceCommit','parentFailureSha256','mainStartReceiptSha256','actions','retainUntil','noNewCaptureKeyGrantProviderOrE')

def execution_header(packet,packet_sha,identity_digest):
    require(is_hash(packet_sha) and is_hash(identity_digest),'DIRECTIVE_HEADER_HASH_REQUIRED')
    return {**{k:packet[k] for k in HEADER_PACKET_FIELDS},'version':HEADER_VERSION,'authorizationDigest':authorization(),'packetSha256':packet_sha,'identityPathSha256':identity_digest}

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
    require_binding()
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
    require_binding()
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
    require(ap.parent==gate.ROOT and ap.name.startswith('directive-v2-packet-') and ap.suffix=='.json','DIRECTIVE_PACKET_METADATA_PATH_REQUIRED')
    header=_read_header(header_path(ap))
    require(header['version']==HEADER_VERSION and header['authorizationDigest']==authorization() and is_hash(header['packetSha256']),'DIRECTIVE_HEADER_BINDING_CONFLICT')
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
