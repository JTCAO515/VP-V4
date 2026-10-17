"""One fixed directive scope, not a general message/transport allowlist.
Original raw records remain private. No original human ID/author is fabricated.
"""
import hashlib
import html
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
VERSION='jt-delegated-bestj-20261017/v1'
KIND='JT_EXISTING_DELEGATION_PLUS_BESTJ_BOUNDED_DECISION'
APPROVER='BestJ-delegated-JT'
AUTHORITY_DESCRIPTION='JT existing delegation plus new explicit BestJ bounded product decision; not new JT user message'
DECISION_NO='BESTJ-DB-LOCAL-20261017-0305'
PROPOSAL_SHA='3a5ced818a8ab5be839b1f7aa1aa9797104729166e4e5d7ddad119a8eb19a1c0'
BESTJ='01a1330e-5008-7061-909b-8abb26792003'
MAC='01a13313-19fd-77be-959c-9448bfab80ce'
MAIN='01a13311-9212-7db3-8c75-691eac0f03ea'
ROOM='6acd9506863c81958e1176881961131c'
CAPTURE='f97d05db-c706-4ce9-82d8-579cbb0b9310'
MANIFEST='668f0bb3a34319310a7bee2a07e514f47c11442d08cd78fe4e772856c3f61085'
IDENTITY='58aa1f73d84e1c265bf64beffe6718ebd1b981d22165ef133fbc1569816451d7'
IMAGE='sha256:74699ee2438a45c748fb5e82bde5cafa4c8e2c39879d107ac8b6c0d43a0b1451'
DELEGATION_EVENTS=('Sentinel_9fd068e678a0819187991a0a17138244','Sentinel_e4ac0f273c108191a5dfc74e481efce9')
DELEGATION_TEXT_HASHES=('59dbe238111148bf13708fdb6e5c3d7c38305dcb82dd2987f6036be2bd697f49','c85d897f7bf216a626de69b2137595671ca99f8e2384ab0e205c649324f14972')
DELEGATION_RAW_SHA='563828019bc610f95b23a18fd3bace42e37e18ac8e6eca63c1096fb0ff16d5cd'
DELEGATION_CONTEXT_SHA='ba94c99800d029852959c459e4ad7cc55c64133fdf43c08a5d5a2709200ab6dc'
BINDING=json.loads((HERE/'pending-binding.json').read_text())
SCOPE={'minutes':60,'maximumCopies':2,'noOtherPlannedDdlChanges':True,'ordinaryDmlContinues':True,'reuseOriginalCapture':True,'localRehearsalAfterFullRestorePass':True,'newCapture':False,'newIdentity':False,'newLiveGrants':False,'provider':False,'targetE':False}

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def sha(value):return hashlib.sha256(value).hexdigest()
def require(ok,code):
    if not ok:raise ValueError(code)
def is_hash(value):return type(value) is str and re.fullmatch('[a-f0-9]{64}',value) is not None

# Stable across profile/source/window revisions: the same actual directives
# cannot obtain another window merely through a new code or relay hash.
def require_binding(binding=None):
    value=BINDING if binding is None else binding
    require(type(value) is dict and set(value)=={'authorityKind','decisionNo','proposalSha256','decisionNativeId','decisionBodySha256','pins'} and all(x is not None for x in value.values()),'DELEGATED_SCOPE_UNCONFIGURED')
    require(value['authorityKind']==KIND and value['decisionNo']==DECISION_NO and value['proposalSha256']==PROPOSAL_SHA,'DELEGATED_FIXED_DECISION_SCOPE_CONFLICT')
    identifier=value['decisionNativeId']
    require(type(identifier) is str and identifier.startswith('fco_') and 4<len(identifier)<200 and identifier!=DECISION_NO and not any(x.isspace() for x in identifier),'DELEGATED_NATIVE_EVENT_REQUIRED_NOT_HUMAN')
    require(is_hash(value['decisionBodySha256']),'DELEGATED_BODY_PIN_REQUIRED')
    inputs=value['pins']
    require(type(inputs) is dict and set(inputs)=={'baseIndex','contextIndex','ackIndex','macRead','firstHop','firstHopText','secondHop','secondPrompt','mainReceived','mainAck','delegationRaw','delegationContext','proposal'},'DELEGATED_SOURCE_PINS_REQUIRED')
    for pin in inputs.values():require(type(pin) is dict and set(pin)=={'path','bytes','sha256'} and type(pin['path']) is str and Path(pin['path']).is_absolute() and type(pin['bytes']) is int and 0<pin['bytes']<=1048576 and is_hash(pin['sha256']),'DELEGATED_SOURCE_PIN_INVALID')
    require(inputs['delegationRaw']['sha256']==DELEGATION_RAW_SHA and inputs['delegationContext']['sha256']==DELEGATION_CONTEXT_SHA and inputs['proposal']['sha256']==PROPOSAL_SHA,'DELEGATED_ORIGINAL_PROOF_PIN_CONFLICT')
    return value

def authorization(binding=None):
    require_binding(binding)
    # Native delivery IDs, wrappers, body/scope hashes and version/path/window
    # cannot mint another grant for this same issuer decision under this mandate.
    return sha(canonical({'issuer':BESTJ,'decisionNo':DECISION_NO,'delegationEvents':DELEGATION_EVENTS,'humanRoom':ROOM,'capture':CAPTURE}))

def commitment(binding=None):
    value=require_binding(binding)
    return sha(canonical({'issuer':BESTJ,'decisionNo':DECISION_NO,'delegationEvents':DELEGATION_EVENTS,'decisionBodySha256':value['decisionBodySha256'],'proposalSha256':PROPOSAL_SHA,'scope':SCOPE,'manifestSha256':MANIFEST,'identityPathSha256':IDENTITY,'image':IMAGE}))

def read_sources(binding=None):
    value=require_binding(binding);result={}
    for key,pin in value['pins'].items():
        path=Path(pin['path']);parent=path.parent.lstat()
        # Proposal is public source evidence, all native/delegation records are private.
        require(path.resolve()==path and stat.S_ISDIR(parent.st_mode) and parent.st_uid==os.getuid() and (key=='proposal' or stat.S_IMODE(parent.st_mode)==0o700),'DELEGATED_SOURCE_ROOT_UNSAFE')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(fd,'rb') as stream:
            st=os.fstat(stream.fileno());require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and st.st_nlink==1 and (key=='proposal' or stat.S_IMODE(st.st_mode)==0o600) and st.st_size==pin['bytes'],'DELEGATED_SOURCE_FILE_UNSAFE');raw=stream.read(1048577)
        require(len(raw)==pin['bytes'] and sha(raw)==pin['sha256'],'DELEGATED_SOURCE_HASH_CONFLICT');result[key]=raw
    return result

def envelope(record,sender):
    require(sender in (BESTJ,MAC),'DELEGATED_FIXED_TRANSPORT_REQUIRED')
    namespace,name=('cloud_threads','send_message') if sender==BESTJ else ('codex_app','send_message_to_thread')
    require(type(record) is dict and set(record)=={'type','id','namespace','name','output'} and record.get('type')=='functionCallOutput' and record.get('namespace')==namespace and record.get('name')==name and type(record.get('id')) is str,'DELEGATED_NATIVE_RECORD_REQUIRED')
    output=record['output'];require(type(output) is dict and set(output)=={'text','truncated'} and output['truncated'] is False and type(output['text']) is str,'DELEGATED_FULL_NATIVE_OUTPUT_REQUIRED')
    match=re.fullmatch(r'\s*<codex_delegation>\s*<source_thread_id>\s*([0-9a-f-]{36})\s*</source_thread_id>\s*<input>([\s\S]*)</input>\s*</codex_delegation>\s*',output['text'])
    require(match is not None and match[1]==sender,'DELEGATED_NATIVE_SENDER_CONFLICT')
    require(not re.search(r'<\s*/?\s*(?:codex_delegation|source_thread_id|input)\b',match[2],re.I),'DELEGATED_NESTED_OUTER_REJECTED')
    return match[2]

def linked(ref,key,raw):
    require(type(ref) is dict and set(ref)=={'path','sha256','bytes'} and type(ref['path']) is str and ref['sha256']==sha(raw[key]) and type(ref['bytes']) is int and ref['bytes']==len(raw[key]),'DELEGATED_CONTEXT_HASH_LINK_CONFLICT')

def verify_sources(raw=None,binding=None):
    value=require_binding(binding);raw=read_sources(value) if raw is None else raw
    require(type(raw) is dict and set(raw)==set(value['pins']),'DELEGATED_SOURCE_SET_CONFLICT')
    for key,pin in value['pins'].items():require(type(raw[key]) is bytes and len(raw[key])==pin['bytes'] and sha(raw[key])==pin['sha256'],'DELEGATED_SOURCE_HASH_CONFLICT')
    parsed={key:json.loads(data) for key,data in raw.items() if key not in ('firstHopText','secondPrompt')}
    legacy=parsed['delegationRaw'];payload=legacy['structuredContent'];context=parsed['delegationContext']
    require(legacy.get('isError') is False and payload.get('partial') is False and json.loads(legacy['content'][0]['text'])==payload,'DELEGATED_FULL_ORIGINAL_SDK_REQUIRED')
    messages=[*payload['before'],payload['message'],*payload['after']];by_id={x['message_id']:x for x in messages}
    users=[by_id[identifier] for identifier in DELEGATION_EVENTS]
    require(len(messages)==5 and users[0]['author']==users[1]['author']=='user' and users[0]['author_id']==users[1]['author_id'] and bool(users[0]['author_id']),'DELEGATED_ORIGINAL_ACTOR_CONFLICT')
    require(all(sha(message['content']['text'].encode())==digest for message,digest in zip(users,DELEGATION_TEXT_HASHES)),'DELEGATED_ORIGINAL_TEXT_CONFLICT')
    require(context['record.kind']=='full_context_two_hop_evidence_index' and context['parentProvidedRoom']==ROOM and context['humanRawKind']=='parent_reported_official_user_message_read_raw','DELEGATED_ORIGINAL_ROOM_CONTEXT_CONFLICT')
    linked(context['files']['parentProvidedApiRaw'],'delegationRaw',raw)
    first=parsed['firstHop'];body=envelope(first,BESTJ)
    require(first['id']==value['decisionNativeId'] and first['output']['text'].encode()==raw['firstHopText'],'DELEGATED_NATIVE_EVENT_OR_TEXT_CONFLICT')
    require(sha(body.encode())==value['decisionBodySha256'] and body.count(DECISION_NO)==1 and PROPOSAL_SHA in body and all(identifier in body for identifier in DELEGATION_EVENTS),'DELEGATED_AUTHORED_DECISION_BODY_CONFLICT')
    snapshot=parsed['macRead'];require(snapshot['thread']['id']==MAC and snapshot['thread']['kind']=='codex','DELEGATED_MAC_RECEIVER_CONFLICT')
    matches=[item for turn in snapshot['turns'] for item in turn['items'] if type(item) is dict and item.get('id')==first['id']]
    require(len(matches)==1 and matches[0]==first,'DELEGATED_DIRECT_MAC_ITEM_REQUIRED')
    index=parsed['baseIndex'];complete=parsed['contextIndex'];ack=parsed['ackIndex']
    require(index['record.kind']=='delegated_bestj_product_decision_two_hop_evidence' and index['decisionId']==DECISION_NO and index['authorityType']==AUTHORITY_DESCRIPTION and index['sourceThread']==BESTJ and index['relayThread']==MAC and index['targetThread']==MAIN and index['proposalSha256']==PROPOSAL_SHA and index['humanDelegationRefs']==list(DELEGATION_EVENTS),'DELEGATED_INDEX_SCOPE_CONFLICT')
    require(complete['record.kind']=='delegated_bestj_product_decision_context_index' and complete['decisionId']==DECISION_NO and complete['authorityType']==AUTHORITY_DESCRIPTION and complete['secondHopNativeCallId']=='NOT_EXPOSED' and complete['sourceThreadId']==BESTJ and complete['relayThreadId']==MAC and complete['targetThreadId']==MAIN and complete['firstHopNativeRecordId']==first['id'] and complete['proposalSha256']==PROPOSAL_SHA and complete['parentProvidedRoom']==context['parentProvidedRoom'] and complete['humanRawKind']==context['humanRawKind'],'DELEGATED_CONTEXT_SCOPE_CONFLICT')
    for label,key in (('officialMacRead','macRead'),('firstHop','firstHop'),('firstHopExactText','firstHopText'),('secondHop','secondHop'),('secondHopExactPrompt','secondPrompt')):
        linked(index['files'][label],key,raw);linked(complete['files'][label],key,raw)
    linked(complete['originalHumanRaw'],'delegationRaw',raw);linked(complete['originalHumanContextIndex'],'delegationContext',raw);linked(complete['mainReceiveAndConsumptionIndex'],'ackIndex',raw)
    second=parsed['secondHop'];require(second['record.kind']=='runtime_tool_arguments_and_result_capture' and second.get('nativeCallId')=='NOT_EXPOSED_BY_ORCHESTRATOR; not fabricated' and second['tool']=='codex_app.send_message_to_thread' and second['sourceThreadId']==MAC and second['arguments']['threadId']==MAIN,'DELEGATED_SECOND_NATIVE_CONFLICT')
    require(second['arguments']['prompt'].encode()==raw['secondPrompt'] and first['output']['text'] in second['arguments']['prompt'],'DELEGATED_VERBATIM_FIRST_HOP_REQUIRED')
    result=second['result'];require(result['isError'] is False and json.loads(result['content'][0]['text'])['threadId']==MAIN,'DELEGATED_SECOND_RESULT_CONFLICT')
    received=parsed['mainReceived'];received_body=envelope(received,MAC)
    require(received['id']==complete['mainReceivedNativeRecordId'] and received['id']!=first['id'] and received_body==html.escape(second['arguments']['prompt'],quote=False),'DELEGATED_MAIN_RECEIVE_CONFLICT')
    require(ack['record.kind']=='official_Main_received_and_consumed_decision_records' and ack['decisionId']==DECISION_NO and ack['readTool']=='codex_app.read_thread' and ack['threadId']==MAIN and ack['actualStartClaimed'] is False,'DELEGATED_MAIN_ACK_CONTEXT_CONFLICT')
    linked(ack['received'],'mainReceived',raw);linked(ack['consumptionAck'],'mainAck',raw)
    proposal=parsed['proposal'];require(proposal['minutes']==60 and proposal['maximumAttempts']==2 and proposal['automaticRetry'] is False and proposal['material']['captureId']==CAPTURE and proposal['material']['manifestSha256']==MANIFEST and proposal['material']['retainedAgeArchives']==4,'DELEGATED_PROPOSAL_SCOPE_CONFLICT')
    return {'authorityKind':KIND,'authorizationDigest':authorization(value),'commitmentSha256':commitment(value),'businessDecisionNo':DECISION_NO,'issuerThreadId':BESTJ,'nativeDecisionEventId':first['id'],'decisionBodySha256':value['decisionBodySha256'],'proposalSha256':PROPOSAL_SHA,'delegationEventIds':list(DELEGATION_EVENTS),'delegationRawSha256':DELEGATION_RAW_SHA,'humanRoom':ROOM,'newHumanEvent':None,'roomProvenance':'ORIGINAL_PARENT_PROVIDED_CONTEXT_NOT_NATIVE_API_FIELD','secondNativeCallId':'NOT_EXPOSED_NOT_FABRICATED','sourceBundleSha256':sha(canonical({key:sha(data) for key,data in raw.items()}))}

PROFILE_FILES=('directive-scope-v1/entry.py','directive-scope-v1/profile.py','directive-scope-v1/evidence-pins.json','delegated-scope-v1/profile.py','delegated-scope-v1/entry.py','delegated-scope-v1/bootstrap.py','delegated-scope-v1/pending-binding.json','directive-scope-v1/live-controller.py','directive-scope-v1/start-provenance.py','container-diagnostic/restore/source-lock.json')

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
    require(type(profile) is dict and set(profile)=={'authorityKind','version','authorizationDigest','humanRecord','startFile','identityPathSha256','preservedPins','sourceLockSha256','profileLockSha256','windowBindingSha256','runtimeImage','captureId','manifestSha256','scope','localOnly'},'DIRECTIVE_PROFILE_CONFIGURATION_REQUIRED')
    require(profile['authorityKind']==KIND and profile['version']==VERSION and profile['authorizationDigest']==authorization() and profile['captureId']==CAPTURE and profile['manifestSha256']==MANIFEST and profile['identityPathSha256']==IDENTITY and profile['runtimeImage']==IMAGE and profile['localOnly'] is True and canonical(profile['scope'])==canonical(SCOPE),'DIRECTIVE_FIXED_SCOPE_CONFLICT')
    for key in ('sourceLockSha256','profileLockSha256','windowBindingSha256'):require(is_hash(profile[key]),'DIRECTIVE_QUALIFIED_SOURCE_REQUIRED')
    verify_locks(profile)
    pin=profile['humanRecord'];require(type(pin) is dict and set(pin)=={'path','sha256'} and is_hash(pin['sha256']),'DIRECTIVE_HUMAN_RECORD_PIN_REQUIRED')
    for path,prefix in ((pin['path'],'delegated-v1-authority-'),(profile['startFile'],'delegated-v1-start-')):
        require(type(path) is str,'DIRECTIVE_NEW_RECORD_PATH_REQUIRED')
        p=Path(path);require(p.parent==root and p.name.startswith(prefix) and p.suffix=='.json','DIRECTIVE_NEW_RECORD_PATH_REQUIRED')
    preserved=profile['preservedPins'];require(type(preserved) is dict and set(preserved)==keys,'DIRECTIVE_PRESERVED_PINS_REQUIRED')
    for pin in preserved.values():require(type(pin) is dict and set(pin)=={'path','sha256'} and is_hash(pin['sha256']),'DIRECTIVE_PRESERVED_PIN_CONFLICT')

def binding(profile,name,root,keys):
    require_configured(profile,root,keys)
    return {'HUMAN_FILE':Path(profile['humanRecord']['path']),'HUMAN_SHA256':profile['humanRecord']['sha256'],'START_FILE':Path(profile['startFile']),'IDENTITY_PATH_SHA256':IDENTITY,'PRESERVED_PINS':profile['preservedPins']}[name]

def validate_record(human,profile):
    require(type(human) is dict and set(human)=={'authorityKind','status','profileVersion','fileDoesNotSelfAuthorize','sourceEvidence','windowId','windowBindingSha256','target','parentCaptureId','manifestSha256','identityPathSha256','scope','localOnly','runtimeImage'},'DIRECTIVE_QUALIFICATION_RECORD_REQUIRED')
    require(human['authorityKind']==KIND and human['status']=='DELEGATED_SCOPE_QUALIFIED_NOT_EXECUTED' and human['profileVersion']==VERSION and human['fileDoesNotSelfAuthorize'] is True and human['localOnly'] is True,'DIRECTIVE_RECORD_KIND_CONFLICT')
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
    require(packet.get('authorityKind')==KIND and packet.get('approvedBy')==APPROVER,'DELEGATED_PACKET_KIND_REQUIRED')
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
    return {'status':'AUTHORIZATION_BOUND_BEFORE_ARCHIVE_READ','authorityKind':KIND,'decisionNo':DECISION_NO,'commitmentSha256':commitment(),'decisionBodySha256':BINDING['decisionBodySha256'],'proposalSha256':PROPOSAL_SHA,'authorizationDigest':authorization(),'qualificationRecordSha256':profile['humanRecord']['sha256'],'windowId':packet['windowId'],'windowStart':packet['windowStart'],'windowEnd':packet['windowEnd'],'windowStartMonotonic':packet['windowStartMonotonic'],'parentCaptureId':CAPTURE,'manifestSha256':MANIFEST,'identityPathSha256':IDENTITY,'maximumCopies':2,'runtimeImage':IMAGE,'windowBindingSha256':profile['windowBindingSha256']}

def check_authority_claim(gate,profile,packet):
    expected=authority_record(profile,packet);path=gate.ARCHIVES/authority_name()
    if os.path.lexists(path):
        frozen,_=gate.read_private(path)
        require(frozen.get('commitmentSha256')==commitment(),'DELEGATED_DECISION_BODY_OR_SCOPE_CHANGED')
    if packet['attempt']==1:require(not os.path.lexists(path),'DIRECTIVE_AUTHORIZATION_ALREADY_BOUND')
    else:
        prior,_=gate.read_private(path);require(canonical(prior)==canonical(expected),'DIRECTIVE_AUTHORIZATION_WINDOW_CONFLICT')

def bind_authority_claim(gate,profile,packet,fd):
    if packet['attempt']==1:gate.exclusive(fd,authority_name(),authority_record(profile,packet))
    else:check_authority_claim(gate,profile,packet)

# Only this fixed schema may be read before operator/material qualification.
HEADER_VERSION='delegated-execution-header/v1'
HEADER_PACKET_FIELDS=('authorityKind','approvedBy','proposalOnly','windowId','windowStart','windowEnd','windowStartMonotonic','attempt','maximumCopies','target','parentCaptureId','manifestSha256','codeSha256','humanAuthorizationSha256','reviewedSourceCommit','parentFailureSha256','mainStartReceiptSha256','actions','retainUntil','noNewCaptureKeyGrantProviderOrE')

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
    require(ap.parent==gate.ROOT and ap.name.startswith('delegated-v1-packet-') and ap.suffix=='.json','DIRECTIVE_PACKET_METADATA_PATH_REQUIRED')
    header=_read_header(header_path(ap))
    require(header['version']==HEADER_VERSION and header['authorizationDigest']==authorization() and is_hash(header['packetSha256']),'DIRECTIVE_HEADER_BINDING_CONFLICT')
    require(header['authorityKind']==KIND and header['approvedBy']==APPROVER and header['proposalOnly'] is False and header['humanAuthorizationSha256']==profile['humanRecord']['sha256'] and header['actions']==gate.ACTIONS and header['retainUntil']==gate.RETAIN and header['noNewCaptureKeyGrantProviderOrE'] is True,'DIRECTIVE_HEADER_SCOPE_CONFLICT')
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
