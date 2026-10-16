"""Factory-only synthetic container adapter; no existing-container attach API."""
import json
import os
from pathlib import Path
import re
import secrets
import select
import subprocess
import threading
import time
import weakref

HERE=Path(__file__).resolve().parent
_RECEIPTS=weakref.WeakKeyDictionary()

def require(ok,message):
    if not ok:raise ValueError(message)

def _call(args):
    return subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=True,timeout=15).stdout

def _docker(receipt,args):
    return _call(['docker','--context',receipt['context']]+args)

def _receipt_for(owner):
    require(type(owner) is SyntheticContainer,'FACTORY_EXACT_TYPE_REQUIRED')
    r=_RECEIPTS.get(owner);require(r is not None,'FACTORY_RECEIPT_REQUIRED')
    require(not any(k in owner.__dict__ for k,v in vars(SyntheticContainer).items() if callable(v)),'FACTORY_METHOD_REPLACED')
    require((owner.container_id,owner.nonce,owner.image)==(r['id'],r['nonce'],r['image']) and owner._process is r['process'],'FACTORY_BINDING_CHANGED')
    return r

def _verify(owner):
    r=_receipt_for(owner)
    endpoint=json.loads(_call(['docker','context','inspect',r['context']]))[0]['Endpoints']['docker']['Host']
    require(endpoint==r['endpoint'] and endpoint.startswith('unix://'),'DOCKER_ENDPOINT_CONFLICT')
    info=json.loads(_docker(r,['inspect',r['id']]))[0]
    require(info['Id']==r['id'] and info['Image']==r['image'],'CONTAINER_IDENTITY_CONFLICT')
    require(info['Config']['Labels'].get('qaw683.synthetic.owner')==r['nonce'],'CONTAINER_OWNER_CONFLICT')
    require(info['HostConfig']['NetworkMode']=='none' and not info['Mounts'] and not info['HostConfig']['PortBindings'],'CONTAINER_ISOLATION_CONFLICT')
    require(not info['HostConfig']['Privileged'] and info['HostConfig']['CapDrop']==['ALL'] and not info['HostConfig'].get('PidMode') and not info['HostConfig'].get('Binds'),'CONTAINER_PRIVILEGE_CONFLICT')
    require(r['epoch'] is None or info['State']['StartedAt']==r['epoch'],'CONTAINER_EPOCH_CONFLICT')
    require(info['HostConfig']['Init'] and info['Config']['User']=='postgres','CONTAINER_RUNTIME_CONFLICT')
    return r

def _read_reply(r,seconds):
    end=time.monotonic()+seconds
    while b'\n' not in r['buffer']:
        remaining=end-time.monotonic();require(remaining>0,'CONTAINER_REPLY_TIMEOUT')
        ready,_,_=select.select([r['process'].stdout],[],[],remaining)
        require(ready,'CONTAINER_REPLY_TIMEOUT')
        chunk=os.read(r['process'].stdout.fileno(),4096);require(chunk,'CONTAINER_REPLY_EOF')
        r['buffer']+=chunk;require(len(r['buffer'])<=65536,'CONTAINER_REPLY_LIMIT')
    line,r['buffer']=r['buffer'].split(b'\n',1)
    result=json.loads(line);require('error' not in result,'CONTAINER_SERVICE_FAILED')
    return result

def _remove_owned(owner):
    r=_verify(owner)
    require(_docker(r,['rm','-f',r['id']]).decode().strip()==r['id'],'CONTAINER_REMOVE_ACK_CONFLICT')
    require(not _docker(r,['ps','-a','-q','--no-trunc','--filter','id='+r['id']]).strip(),'CONTAINER_REMOVAL_UNCONFIRMED')
    if r['process'] is not None:
        r['process'].wait(timeout=10)
        r['process'].stdin.close();r['process'].stdout.close()
    r['removed']=True

class SyntheticContainer:
    def __init__(self):
        require(type(self) is SyntheticContainer and self not in _RECEIPTS,'FACTORY_EXACT_TYPE_REQUIRED')
        require(not any(k in os.environ for k in ('DOCKER_HOST','DOCKER_CONTEXT')),'DOCKER_OVERRIDE_REJECTED')
        pins=json.loads((HERE/'runtime-pins.json').read_text())
        require(pins['helperCommit']=='edec7a531824a11634851c7a64b2083c1bd27aa4','FROZEN_HELPER_PIN_CONFLICT')
        context=_call(['docker','context','show']).decode().strip()
        endpoint=json.loads(_call(['docker','context','inspect',context]))[0]['Endpoints']['docker']['Host']
        require(endpoint.startswith('unix://'),'LOCAL_DOCKER_REQUIRED')
        image=pins['imageId'];require(re.fullmatch(r'sha256:[0-9a-f]{64}',image),'IMAGE_PIN_INVALID')
        r={'context':context,'endpoint':endpoint,'image':image,'nonce':secrets.token_hex(16),'id':None,'process':None,'removed':False,'buffer':b'','lock':threading.RLock(),'epoch':None,'active':False,'serverToken':None}
        info=json.loads(_docker(r,['image','inspect',image]))[0]
        require(info['Id']==image and info['Architecture']=='arm64' and info['Os']=='linux' and not info['Config'].get('Volumes'),'IMAGE_PREFLIGHT_FAILED')
        self.image=image;self.nonce=r['nonce'];self.container_id=None;self._process=None
        _RECEIPTS[self]=r
        try:
            cid=_docker(r,['create','--pull=never','--init','--network','none','--name','qaw683-'+r['nonce'],'--label','qaw683.synthetic.owner='+r['nonce'],'--memory','1g','--cpus','2','--pids-limit','128','--cap-drop','ALL','--security-opt','no-new-privileges','-i','-e','QAW_SYNTHETIC_NONCE='+r['nonce'],image]).decode().strip()
            require(re.fullmatch('[0-9a-f]{64}',cid),'CONTAINER_CREATE_ID_INVALID')
            r['id']=cid;self.container_id=cid;_verify(self)
            child=subprocess.Popen(['docker','--context',context,'start','-a','-i',cid],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            r['process']=child;self._process=child
            hello=_read_reply(r,30)
            token=hello.pop('serverToken',None);require(isinstance(token,str) and re.fullmatch('[0-9a-f]{64}',token),'SERVER_CAPABILITY_MISSING')
            r['serverToken']=token
            require(hello=={'packagesSha256':pins['packagesSha256'],'ready':True,'nonce':r['nonce'],'pgVersion':170006,'helperSha256':pins['helperSha256'],'uid':100,'runtime':pins['pythonVersion']},'CONTAINER_HANDSHAKE_CONFLICT')
            r['epoch']=json.loads(_docker(r,['inspect',cid]))[0]['State']['StartedAt']
            _verify(self)
        except BaseException:
            if r['id'] is not None:_remove_owned(self)
            raise
    def request(self,op,**kwargs):
        r=_receipt_for(self)
        with r['lock']:
            _verify(self);require(not r['removed'],'CONTAINER_ALREADY_REMOVED')
            require(not r['active'],'CONTAINER_INCOMPLETE_REQUEST_RETAINED')
            require(op in ('run','disconnect','resistant','wrong-backend'),'SYNTHETIC_OPERATION_REQUIRED')
            if op=='run':require(isinstance(kwargs.get('sql'),str) and 0<len(kwargs['sql'])<=65536 and 0<kwargs.get('seconds',3)<=5,'SYNTHETIC_QUERY_BUDGET_REQUIRED')
            r['active']=True
            r['process'].stdin.write((json.dumps({**kwargs,'op':op,'nonce':r['nonce']})+'\n').encode());r['process'].stdin.flush()
            result=_read_reply(r,15);_verify(self)
            require(result.pop('serverToken',None)==r['serverToken'],'SERVER_CAPABILITY_CHANGED')
            r['active']=False;return result
    def close(self):
        r=_receipt_for(self)
        with r['lock']:
            if r['removed']:return {'containerRemoved':True}
            _verify(self)
            cleanup={'backendCleanup':'UNKNOWN'}
            if r['active']:
                _remove_owned(self);return {**cleanup,'containerRemoved':True}
            try:
                r['process'].stdin.write((json.dumps({'op':'close','nonce':r['nonce']})+'\n').encode());r['process'].stdin.flush()
                cleanup=_read_reply(r,10)
                require(cleanup.pop('serverToken',None)==r['serverToken'],'SERVER_CAPABILITY_CHANGED')
            finally:_remove_owned(self)
            return {**cleanup,'containerRemoved':True}

if __name__=='__main__':raise SystemExit('SYNTHETIC_LIBRARY_ONLY_NO_OPERATOR_ENTRY')
