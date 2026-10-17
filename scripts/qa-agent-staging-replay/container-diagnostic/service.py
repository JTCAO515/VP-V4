"""Private stdio service; synthetic data only. Reuses pinned factory verbatim."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('owned',ROOT/'owned-pg-diagnostic-session.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def emit(value):
    print(json.dumps(value),flush=True)

def disconnected(owner,sql):
    session=m.DiagnosticSession(owner,seconds=.4);session.start()
    child=subprocess.Popen(owner.command(session.directory),env=owner.env,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    child.communicate(sql.encode(),timeout=3);session.thread.join(timeout=2)
    m.require(not session.thread.is_alive() and session.proxy.binding is not None,'SYNTHETIC_BIND_FAILED')
    return session

def main():
    nonce=os.environ.get('QAW_SYNTHETIC_NONCE','')
    m.require(len(nonce)==32 and all(c in '0123456789abcdef' for c in nonce),'NONCE_REQUIRED')
    owner=m.OwnedSyntheticServer()
    token=hashlib.sha256((nonce+owner.nonce).encode()).hexdigest()
    try:
        emit({'serverToken':token,'packagesSha256':hashlib.sha256((ROOT/'runtime-packages.txt').read_bytes()).hexdigest(),'ready':True,'nonce':nonce,'pgVersion':owner.identity['version'],'helperSha256':hashlib.sha256((ROOT/'owned-pg-diagnostic-session.py').read_bytes()).hexdigest(),'uid':os.getuid(),'runtime':sys.version.split()[0]})
        for line in sys.stdin:
            request=json.loads(line)
            if request.get('nonce')!=nonce:
                emit({'error':'CONTAINER_NONCE_CONFLICT'});continue
            op=request.get('op')
            if op=='run':
                result=m.DiagnosticSession(owner,seconds=request.get('seconds',3)).run_synthetic(request['sql'])
            elif op in ('disconnect','resistant','wrong-backend'):
                if op=='resistant':
                    owner.setup_synthetic("create function public.synthetic_resist_cancel() returns void language plpgsql as $$begin loop begin perform pg_sleep(10);exception when query_canceled then null;end;end loop;end$$;")
                session=disconnected(owner,'select public.synthetic_resist_cancel();' if op=='resistant' else 'select pg_sleep(10);')
                binding=session.proxy.binding
                result={'activeAfterDisconnect':owner.matching_backend(binding) is not None}
                if op=='wrong-backend':
                    before=binding.facts['started'];binding.facts['started']='wrong-synthetic-lifetime'
                    result['rejected']=owner.fence(binding)
                    binding.facts['started']=before
                    result['stillActiveAfterRefusal']=owner.matching_backend(binding) is not None
                result['fence']=owner.fence(binding)
                owner.active_session=None if result['fence']['backendStopped'] is True else owner.active_session
            elif op=='close':
                owner.close();emit({'serverToken':token,'cleanup':owner.cleanup_confirmed,'rootRemoved':not owner.root.exists()});return
            else:raise ValueError('SYNTHETIC_OPERATION_REQUIRED')
            emit({**result,'serverToken':token})
    finally:
        if not owner.cleanup_confirmed:owner.close()

if __name__=='__main__':
    try:main()
    except BaseException:
        emit({'error':'SYNTHETIC_SERVICE_FAILED'});sys.exit(1)
