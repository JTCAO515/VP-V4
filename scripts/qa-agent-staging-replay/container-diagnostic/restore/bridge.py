"""Optional pinned same-copy post-data routing. No operator or attach entrypoint."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import weakref

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
spec=importlib.util.spec_from_file_location('absolute_deadline',ROOT/'diagnostic-window-deadline.py');deadline=importlib.util.module_from_spec(spec);spec.loader.exec_module(deadline);deadline=deadline.shared_runtime()
MODE='same-copy-typed-postdata/1'
SOURCE_FILES=('controlled-snapshot-restore.py','diagnostic-window-deadline.py','owned-pg-diagnostic-session.py','typed-pg-diagnostic-proxy.py','owned-locale-profile.py','reviewed-diagnostic-window.py','container-diagnostic/restore/bridge.py','container-diagnostic/restore/runtime.py','container-diagnostic/restore/client.py','container-diagnostic/restore/Dockerfile','container-diagnostic/restore/runtime-pins.json')
_PLANS=weakref.WeakKeyDictionary()
_COPIES=weakref.WeakKeyDictionary()

def require(ok,code):
    if not ok:raise ValueError(code)

def _plan(plan):
    require(type(plan) is Plan and plan in _PLANS,'TYPED_PLAN_PROVENANCE_REQUIRED')
    require(not any(k in plan.__dict__ for k,v in vars(Plan).items() if callable(v)),'TYPED_PLAN_METHOD_REPLACED')
    return _PLANS[plan]

def _copy(plan,db):
    p=_plan(plan);require(type(db) is p['copyClass'],'TYPED_COPY_PROVENANCE_REQUIRED')
    r=_COPIES.get(db)
    require(r is not None and r['plan'] is plan,'TYPED_COPY_PROVENANCE_REQUIRED')
    require((db.name,db.nonce,db.admin,db.locale)==r['settings'],'TYPED_COPY_SETTINGS_CONFLICT')
    b=r['budget'];require((b.window_end,b.data_end,b.wall_end,b.reserve,b.cleanup_seconds,b.clock,b.wall_clock)==p['budgetFields'],'TYPED_ORIGINAL_BUDGET_CHANGED')
    return r

def _envelope(r):
    p=_plan(r['plan'])
    return {**r['budget'].export_for_remote(r['remote'],r['received']),'budgetId':p['budgetId'],'windowBinding':p['windowBinding']}

def _run(r,args,data=None,cleanup=False,upper=15):
    b=r['budget']
    if cleanup:
        result=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=b.cleanup_timeout(upper))
    else:
        result=deadline.Subprocess(subprocess,b).run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=b.timeout(upper))
    require(result.returncode==0,'TYPED_CONTROL_FAILED')
    return result.stdout

def _docker(r,args,data=None,cleanup=False,upper=15):
    require(r['context'] is not None,'TYPED_CONTEXT_REQUIRED')
    return _run(r,['docker','--context',r['context']]+args,data,cleanup,upper)

def _verify(r,cleanup=False):
    require(r['id'] is not None and re.fullmatch('[a-f0-9]{64}',r['id']),'TYPED_LAUNCH_ACK_REQUIRED')
    endpoint=json.loads(_run(r,['docker','context','inspect',r['context']],cleanup=cleanup))[0]['Endpoints']['docker']['Host']
    require(endpoint==r['endpoint'] and endpoint.startswith('unix://'),'TYPED_ENDPOINT_CONFLICT')
    info=json.loads(_docker(r,['inspect',r['id']],cleanup=cleanup))[0]
    require(info['Id']==r['id'] and info['Name']=='/'+r['settings'][0] and info['Image']==r['image'],'TYPED_COPY_IDENTITY_CONFLICT')
    require(info['Config']['Labels'].get('qaw.restore.owner')==r['settings'][1],'TYPED_COPY_NONCE_CONFLICT')
    h=info['HostConfig']
    require(h['NetworkMode']=='none' and not info['Mounts'] and not h['PortBindings'] and not h['Privileged'] and h['CapDrop']==['ALL'] and h['Init'],'TYPED_COPY_ISOLATION_CONFLICT')
    require(r['epoch'] is None or info['State']['StartedAt']==r['epoch'],'TYPED_COPY_EPOCH_CONFLICT')
    return info

def _rpc(r,op,cleanup=False,**fields):
    _verify(r,cleanup)
    packet={'op':op,'nonce':r['settings'][1],**fields}
    output=_docker(r,['exec','-i',r['id'],'python3','-I','/opt/qaw/client.py'],json.dumps(packet).encode()+b'\n',cleanup,65)
    require(len(output)<=65536,'TYPED_REPLY_LIMIT')
    reply=json.loads(output);require('error' not in reply,'TYPED_RUNTIME_REFUSED')
    token=reply.pop('copyToken',None)
    require(isinstance(token,str) and re.fullmatch('[a-f0-9]{64}',token),'TYPED_COPY_TOKEN_REQUIRED')
    if r['token'] is None:r['token']=token
    else:require(token==r['token'],'TYPED_COPY_TOKEN_CONFLICT')
    _verify(r,cleanup)
    return reply

class _Cleanup:
    def __init__(self,plan,db):self.plan=plan;self.db=db
    def cleanup(self,budget):
        r=_copy(self.plan,self.db);require(r['budget'] is budget,'TYPED_BUDGET_REPLACED')
        if r['removed']:return
        if not r['issued']:
            require(not self.db.created and not getattr(self.db,'_deadline_run_issued',False),'TYPED_UNISSUED_COPY_CONFLICT');return
        require(not r['unknown'],'TYPED_BACKEND_OR_IDENTITY_UNKNOWN_RETAINED')
        if r['session'] is not None:require(r['stopped'] is True,'TYPED_BACKEND_STOP_UNCONFIRMED')
        if r['initialized']:
            reply=_rpc(r,'close',cleanup=True)
            require(reply=={'cleanup':True,'rootRemoved':True},'TYPED_ROOT_CLEANUP_UNCONFIRMED')
        # The runtime has exited only after a verified factory close. Keep the
        # container (no --rm) until its exact immutable ID is removed/read back.
        _verify(r,cleanup=True)
        require(_docker(r,['rm','-f',r['id']],cleanup=True).decode().strip()==r['id'],'TYPED_REMOVE_ACK_CONFLICT')
        require(not _docker(r,['ps','-a','-q','--no-trunc','--filter','id='+r['id']],cleanup=True).strip(),'TYPED_REMOVAL_UNCONFIRMED')
        r['removed']=True;self.db.created=False;self.db._deadline_id_removal_confirmed=True

class Plan:
    def __init__(self,configuration,budget):
        require(type(self) is Plan,'TYPED_PLAN_EXACT_TYPE_REQUIRED')
        require(type(configuration) is dict and set(configuration)=={'mode','sourceLockSha256','windowBindingSha256'} and configuration['mode']==MODE,'TYPED_EXPLICIT_CONFIGURATION_REQUIRED')
        require(isinstance(configuration['windowBindingSha256'],str) and re.fullmatch('[a-f0-9]{64}',configuration['windowBindingSha256']),'TYPED_WINDOW_BINDING_REQUIRED')
        lock_bytes=(HERE/'source-lock.json').read_bytes()
        require(hashlib.sha256(lock_bytes).hexdigest()==configuration['sourceLockSha256'],'TYPED_SOURCE_LOCK_CONFLICT')
        lock=json.loads(lock_bytes);require(set(lock)==set(SOURCE_FILES),'TYPED_SOURCE_SET_CONFLICT')
        for name,digest in lock.items():require(hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,'TYPED_SOURCE_PIN_CONFLICT')
        require(budget is not None and budget.wall_end is not None and callable(getattr(budget,'export_for_remote',None)),'TYPED_ORIGINAL_ABSOLUTE_BUDGET_REQUIRED');budget.check()
        pins=json.loads((HERE/'runtime-pins.json').read_text())
        require(pins['helperCommit']=='4a3879517d26d86126a1ce45076e090060fcc691' and re.fullmatch('sha256:[0-9a-f]{64}',pins['imageId']),'TYPED_RUNTIME_PIN_REQUIRED')
        for name,digest in pins['sourceSha256'].items():require(hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,'TYPED_IMAGE_SOURCE_CHANGED')
        _PLANS[self]={'pins':pins,'budget':budget,'copyClass':None,'created':False,'windowBinding':configuration['windowBindingSha256'],'budgetId':secrets.token_hex(32),'budgetFields':(budget.window_end,budget.data_end,budget.wall_end,budget.reserve,budget.cleanup_seconds,budget.clock,budget.wall_clock)}
    def bind_class(self,copy_class):
        p=_plan(self);require(p['copyClass'] is None,'TYPED_FACTORY_ALREADY_BOUND');p['copyClass']=copy_class
    def new_copy(self,db):
        p=_plan(self);require(type(db) is p['copyClass'] and not p['created'] and not db.created and db.context is None,'TYPED_NEW_FACTORY_COPY_REQUIRED')
        require(re.fullmatch('[0-9a-f]{32}',db.nonce) and db.name=='qaw-restore-'+db.nonce[:12],'TYPED_FACTORY_NONCE_REQUIRED')
        p['created']=True
        r={'plan':self,'budget':p['budget'],'settings':(db.name,db.nonce,db.admin,db.locale),'context':None,'endpoint':None,'image':p['pins']['imageId'],'id':None,'epoch':None,'token':None,'remote':None,'received':None,'session':None,'stopped':None,'unknown':False,'removed':False,'issued':False,'initialized':False}
        _COPIES[db]=r;p['budget'].register_diagnostic_copy(db,_Cleanup(self,db))
    def launch(self,db,args,launch):
        r=_copy(self,db);require(not r['issued'],'TYPED_DUPLICATE_LAUNCH_FORBIDDEN');r['issued']=True
        require(args[0]=='run' and '--name' in args and args[args.index('--name')+1]==db.name and 'qaw.restore.owner='+db.nonce in args,'TYPED_LAUNCH_BINDING_REQUIRED')
        require(args[-3]=='public.ecr.aws/supabase/postgres:17.6.1.155' and args[-2]=='-c','TYPED_ORIGINAL_LAUNCH_REQUIRED')
        command=args[-1];prefix='umask 077; mkdir /tmp/restore-socket; initdb -U '+db.admin+' -D /tmp/restore-db -A trust '
        suffix=' -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/restore-db -c listen_addresses= -c unix_socket_directories=/tmp/restore-socket -c unix_socket_permissions=0700'
        require(command.startswith(prefix) and command.endswith(suffix),'TYPED_ORIGINAL_INITDB_REQUIRED')
        locales=shlex.split(command[len(prefix):-len(suffix)])
        require(len(locales) in (1,5) and all(re.fullmatch('--[a-z-]+=[a-zA-Z0-9_.@-]+',x) for x in locales),'TYPED_VALIDATED_LOCALE_REQUIRED')
        r['context']=db.context;r['endpoint']=json.loads(_run(r,['docker','context','inspect',db.context]))[0]['Endpoints']['docker']['Host']
        require(r['endpoint'].startswith('unix://'),'TYPED_LOCAL_DOCKER_REQUIRED')
        image=json.loads(_docker(r,['image','inspect',r['image']]))[0]
        require(image['Id']==r['image'] and not image['Config'].get('Volumes'),'TYPED_IMAGE_PREFLIGHT_FAILED')
        routed=list(args[:-3]);routed.remove('--rm')
        routed[routed.index('--entrypoint')+1]='/usr/bin/python3'
        routed+=['--init','-e','QAW_COPY_NONCE='+db.nonce,'-e','QAW_BOOTSTRAP_ADMIN='+db.admin,'-e','QAW_LOCALE_OPTIONS='+json.dumps(locales),r['image'],'-I','-u','/opt/qaw/runtime.py']
        value=launch(routed);identifier=value.decode().strip();require(re.fullmatch('[a-f0-9]{64}',identifier),'TYPED_LAUNCH_ACK_REQUIRED')
        r['id']=identifier;r['epoch']=_verify(r)['State']['StartedAt']
        # Control socket readiness probe does not issue any SQL or create PG.
        _docker(r,['exec',r['id'],'python3','-I','-c',"import os,time;\nwhile not os.path.exists('/tmp/qaw-restore-control'):time.sleep(.01)"])
        hello=_rpc(r,'hello');r['remote']=hello['monotonic'];r['received']=r['budget'].clock()
        initialized=_rpc(r,'initialize',budget=_envelope(r))
        require(initialized.get('initialized') is True,'TYPED_FACTORY_INITIALIZATION_FAILED');r['initialized']=True
        return value
    def ready(self,db):
        r=_copy(self,db);hello=_rpc(r,'hello');received=r['budget'].clock();pins=_plan(self)['pins']
        require(hello['helperSha256']==pins['helperSha256'] and hello['version']==170006 and hello['bootstrapHash']==hashlib.sha256(db.admin.encode()).hexdigest(),'TYPED_RUNTIME_CAPABILITY_CONFLICT')
        require(r['initialized'],'TYPED_FACTORY_INITIALIZATION_REQUIRED')
    def pipeline(self,db,producer,consumer,collect,records):
        r=_copy(self,db);b=r['budget'];require(not collect and r['session'] is None,'TYPED_POSTDATA_SINGLE_SESSION_REQUIRED')
        require(consumer==db.command('pg_restore')+['--exit-on-error','--section=post-data'],'TYPED_ORIGINAL_PG_RESTORE_REQUIRED')
        envelope=_envelope(r)
        try:opened=_rpc(r,'open',budget=envelope)
        except Exception:
            r['unknown']=True;raise ValueError('TYPED_SESSION_OPEN_UNKNOWN') from None
        require(set(opened)=={'session','socket'} and re.fullmatch('[0-9a-f]{32}',opened['session']) and re.fullmatch('/private/tmp/qaw-session-[a-zA-Z0-9_-]+/session-[a-zA-Z0-9_-]+',opened['socket']),'TYPED_SESSION_REPLY_CONFLICT')
        r['session']=opened['session'];routed=list(consumer);routed[routed.index('-h')+1]=opened['socket']
        a=c=None;failed=False
        try:
            processes=deadline.Subprocess(subprocess,b)
            a=processes.Popen(producer,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            c=processes.Popen(routed,stdin=a.stdout,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);a.stdout.close()
            c.communicate(timeout=b.timeout(None))
            if c.returncode:failed=True
            if a.wait(timeout=b.timeout(15)) not in (0,-13):failed=True
        finally:
            for child in (c,a):
                if child is not None and child.poll() is None:b.stop_process(child)
            try:
                b.cleanup_timeout(b.cleanup_seconds)
                result=_rpc(r,'finish',cleanup=True,session=r['session'],cleanupEnd=b.export_cleanup_for_remote(r['remote'],r['received']))
                r['stopped']=result.get('backendCommandStopped')
                records.append({'stage':'SCHEMA_POST_DATA',**result})
                require(r['stopped'] is True,'TYPED_BACKEND_STOP_UNKNOWN')
            except Exception:
                r['unknown']=True;raise ValueError('TYPED_BACKEND_FENCE_UNKNOWN') from None
        if failed:raise ValueError('TYPED_POSTDATA_FAILED')
        return None
