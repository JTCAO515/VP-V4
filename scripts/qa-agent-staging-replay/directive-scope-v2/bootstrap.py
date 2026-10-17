"""Non-activated bounded bootstrap. Only fixed source/record refs, no CLI paths."""
from datetime import datetime,timezone,timedelta
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import uuid

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
REPO=HERE.parents[2]

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
entry=load('pending_v2_entry',HERE/'entry.py')
p=entry.profile
INPUTS=('source','packet','receipt','capturedLocale','freshLocale')

def require(ok):
    if not ok:raise ValueError('BOOTSTRAP_V2_UNCONFIGURED_OR_CONFLICT')
def sha(raw):return hashlib.sha256(raw).hexdigest()

def ready(binding):
    # Called before protected reads, source verification, factory or record IO.
    require(type(binding) is dict and set(binding)=={'sourceHead','driverSha256','recordSetId','inputs','materialRefs','replayPlanPath'})
    require(all(binding[k] is not None for k in binding))
    require(type(binding['sourceHead']) is str and __import__('re').fullmatch('[0-9a-f]{40}',binding['sourceHead']) and p.is_hash(binding['driverSha256']))
    require(type(binding['recordSetId']) is str and __import__('re').fullmatch('[0-9a-f]{32}',binding['recordSetId']))
    require(type(binding['inputs']) is dict and set(binding['inputs'])==set(INPUTS))
    for pin in binding['inputs'].values():require(type(pin) is dict and set(pin)=={'path','sha256'} and type(pin['path']) is str and p.is_hash(pin['sha256']))
    require(type(binding['materialRefs']) is dict and set(binding['materialRefs'])=={'manifest','identity'})
    require(all(type(x) is str and Path(x).is_absolute() for x in (*binding['materialRefs'].values(),binding['replayPlanPath'])))
    p.require_binding()

def read_pin(pin,parent):
    path=Path(pin['path']);require(path.parent==parent and path.resolve()==path)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as stream:
        st=os.fstat(stream.fileno());require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and st.st_size<=1048576)
        raw=stream.read(1048577)
    require(len(raw)<=1048576 and sha(raw)==pin['sha256']);return json.loads(raw)

def write_once(path,value,budget):
    p.require_binding()
    budget.check();path=Path(path);parent=path.parent
    st=parent.lstat();require(parent.resolve()==parent and stat.S_ISDIR(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700)
    raw=(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode();require(len(raw)<=1048576)
    directory=os.open(parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        fd=os.open(path.name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=directory)
        with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
        os.fsync(directory)
    finally:os.close(directory)
    budget.check();return sha(raw)

def prepare(binding,private_root):
    ready(binding)
    require(subprocess.check_output(['git','-C',str(REPO),'rev-parse','HEAD'],stderr=subprocess.DEVNULL).decode().strip()==binding['sourceHead'])
    require(not subprocess.check_output(['git','-C',str(REPO),'status','--porcelain'],stderr=subprocess.DEVNULL).strip())
    require(not any(k in os.environ for k in ('DOCKER_HOST','DOCKER_CONTEXT')))
    core=load('bootstrap_restore_core',ROOT/'controlled-snapshot-restore.py');g=core.diagnostic_window
    # Source event binding is configured, but used/active guard still precedes
    # source/operator bodies. No old-event fallback or ledger reset exists.
    require(not os.path.lexists(g.ARCHIVES/g.active_name()) and not os.path.lexists(g.ARCHIVES/p.authority_name()))
    evidence=p.verify_sources()
    private_root=Path(private_root);st=private_root.lstat()
    require(private_root.resolve()==private_root and stat.S_ISDIR(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700)
    values={key:read_pin(pin,private_root) for key,pin in binding['inputs'].items()}
    source=values['source'];packet=values['packet'];receipt=values['receipt']
    require(set(source)=={'version','authorizationDigest','humanRecord','startFile','identityPathSha256','preservedPins','sourceLockSha256','profileLockSha256','windowBindingSha256','runtimeImage','captureId','manifestSha256','scope','localOnly'})
    require(source['windowBindingSha256'] is None and source['startFile'] is None and source['humanRecord']=={'path':None,'sha256':None})
    require(all(receipt.get(key) is None for key in ('windowId','windowStart','windowEnd','windowStartMonotonic','codeSha256','humanAuthorizationSha256')))
    require(source['version']==p.VERSION and source['authorizationDigest']==p.authorization() and source['scope']==p.SCOPE and source['captureId']==p.CAPTURE and source['manifestSha256']==p.MANIFEST and source['runtimeImage']==p.IMAGE and source['identityPathSha256']==p.IDENTITY and source['localOnly'] is True)
    p.verify_locks(source)
    require(packet['attempt']==1 and packet['maximumCopies']==2 and packet['target']==g.TARGET and packet['parentCaptureId']==p.CAPTURE and packet['manifestSha256']==p.MANIFEST and packet['actions']==g.ACTIONS and packet['retainUntil']==g.RETAIN and packet['reviewedSourceCommit']==binding['sourceHead'])
    require(all(packet.get(key) is None for key in ('windowId','windowStart','windowEnd','windowStartMonotonic')))
    require(receipt['issuedBy']=='Main' and receipt['status']=='MAIN_REVIEWED_DIAGNOSTIC_WINDOW_START' and receipt['reviewedSourceCommit']==binding['sourceHead'])
    require(receipt['attempt']==1 and receipt['target']==core.diagnostic_window.TARGET and receipt['parentCaptureId']==p.CAPTURE and receipt['manifestSha256']==p.MANIFEST and receipt['identityPathSha256']==p.IDENTITY and receipt['maximumCopies']==2 and receipt['actions']==g.ACTIONS and receipt['preservedEvidenceDigest']==p.sha(p.canonical(source['preservedPins'])))
    refs=binding['materialRefs'];require(sha(refs['identity'].encode())==p.IDENTITY and packet['manifestPath']==refs['manifest'] and packet['identityPath']==refs['identity'])
    require(Path(refs['manifest']).resolve().is_relative_to(g.ARCHIVES))
    # Original seven explicit historical metadata pins only, no scans.
    require(set(source['preservedPins'])==g.PRESERVED_KEYS)
    for pin in source['preservedPins'].values():g.read_private(pin['path'],pin['sha256'])
    core.replay.load_plan(binding['replayPlanPath'])
    require('FileVault is On.' in subprocess.check_output(['fdesetup','status'],stderr=subprocess.DEVNULL).decode())
    image=json.loads(subprocess.check_output(['docker','image','inspect',p.IMAGE],stderr=subprocess.DEVNULL))[0]
    require(image['Id']==p.IMAGE and not image['Config'].get('Volumes'))
    old=values['capturedLocale'];fresh=values['freshLocale']
    fields=('sourceProject','database','owner','serverVersion','encoding','collate','ctype','localeProvider','locale','icuRules','collationVersion','actualCollationVersion','captureManifestSha256','captureApprovalId')
    require(all(old.get(k)==fresh.get(k) for k in fields) and fresh['sourceProject']==g.TARGET and fresh['captureManifestSha256']==p.MANIFEST and fresh['captureApprovalId']==p.CAPTURE and fresh['targetWritten'] is False and fresh['userRowsRead'] is False)
    age=datetime.now(timezone.utc)-core.base.capture.stamp(fresh['observedAt']);require(timedelta(0)<=age<=timedelta(minutes=4))
    facts={k:fresh[k] for k in ('encoding','collate','ctype','localeProvider')}
    core.locale_profile.validate({'databaseFacts':facts,'icuLocale':fresh['locale'],'icuRules':fresh['icuRules'],'collationVersion':fresh['collationVersion'],'actualCollationVersion':fresh['actualCollationVersion']},facts)
    stem='directive-v2-';tag=binding['recordSetId']
    dest={key:g.ROOT/(stem+key+'-'+tag+'.json') for key in ('human','locale','start','packet','second-start','second-packet','repair')}
    dest['second-start']=g.ROOT/(stem+'start-'+tag+'-2.json')
    dest['second-packet']=g.ROOT/(stem+'packet-'+tag+'-2.json')
    dest['header']=p.header_path(dest['packet'])
    require(all(not os.path.lexists(path) for path in dest.values()))
    return core,values,evidence,dest

def build_controller(binding,private_root):
    ready(binding)
    core,values,evidence,dest=prepare(binding,private_root)
    # Actual START is sampled only here after full configured preflight.
    require(not os.path.lexists(core.diagnostic_window.ARCHIVES/core.diagnostic_window.active_name()) and not os.path.lexists(core.diagnostic_window.ARCHIVES/p.authority_name()))
    budget,mono,instant=entry.new_start_budget()
    require(budget.wall_end<core.base.capture.stamp(core.diagnostic_window.RETAIN))
    packet=values['packet'];source=values['source'];receipt=values['receipt']
    packet.update(approvedBy='JT',proposalOnly=False,noNewCaptureKeyGrantProviderOrE=True,windowId=str(uuid.uuid4()),windowStart=instant.isoformat(),windowEnd=budget.wall_end.isoformat(),windowStartMonotonic=mono)
    window=p.window_binding(packet);source.update(windowBindingSha256=window,startFile=str(dest['start']))
    human={'status':'DIRECTIVE_SCOPE_QUALIFIED_NOT_EXECUTED','profileVersion':p.VERSION,'fileDoesNotSelfAuthorize':True,'sourceEvidence':evidence,'windowId':packet['windowId'],'windowBindingSha256':window,'target':core.diagnostic_window.TARGET,'parentCaptureId':p.CAPTURE,'manifestSha256':p.MANIFEST,'identityPathSha256':p.IDENTITY,'scope':p.SCOPE,'localOnly':True,'runtimeImage':p.IMAGE}
    human_sha=write_once(dest['human'],human,budget);source['humanRecord']={'path':str(dest['human']),'sha256':human_sha}
    config={'mode':'same-copy-typed-postdata/2','sourceLockSha256':source['sourceLockSha256'],'windowBindingSha256':window}
    code=entry.qualified_hash(core,config,source)
    locale_sha=write_once(dest['locale'],values['freshLocale'],budget)
    receipt.update(humanAuthorizationSha256=human_sha,windowId=packet['windowId'],windowStart=packet['windowStart'],windowEnd=packet['windowEnd'],windowStartMonotonic=mono,actualExecutorStartMonotonic=mono,codeSha256=code,localeSupplementSha256=locale_sha,noActualAttemptInFlight=True,sameCapturePointLocaleUnchanged=True,privateDriverSha256=binding['driverSha256'])
    start_sha=write_once(dest['start'],receipt,budget)
    packet.update(codeSha256=code,humanAuthorizationSha256=human_sha,localeSupplementPath=str(dest['locale']),localeSupplementSha256=locale_sha,mainStartReceiptSha256=start_sha)
    packet_sha=write_once(dest['packet'],packet,budget)
    write_once(dest['header'],p.execution_header(packet,packet_sha,p.IDENTITY),budget)
    controller=load('bootstrap_live_controller',ROOT/'directive-scope-v1/live-controller.py')
    return controller,controller.Controller(core,budget,p.execution_header(packet,packet_sha,p.IDENTITY),[str(dest['packet']),packet['manifestPath'],packet['identityPath'],binding['replayPlanPath']],config,source,dest['second-packet'],dest['second-start'],dest['repair'])

def run(binding,private_root):
    ready(binding)
    module,controller=build_controller(binding,private_root)
    module.serve(controller,sys.stdin.fileno(),sys.stdout)

if __name__=='__main__':raise SystemExit('PENDING_SCOPE_NO_CONFIGURED_OPERATOR')
