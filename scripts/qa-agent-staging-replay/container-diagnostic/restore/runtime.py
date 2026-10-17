"""One factory-owned copy and an immutable absolute-budget view; no SQL RPC."""
from datetime import datetime
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import socket
import sys
import time

ROOT=Path('/opt/qaw')
spec=importlib.util.spec_from_file_location('owned',ROOT/'owned-pg-diagnostic-session.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
CONTROL='/tmp/qaw-restore-control'

def absolute_view(envelope):
    m.require(type(envelope) is dict and set(envelope)=={'clock','windowEnd','wallEnd','reserve','cleanupSeconds','budgetId','windowBinding'},'ABSOLUTE_SNAPSHOT_FIELDS_REQUIRED')
    m.require(envelope['clock']=='ORIGINAL_ABSOLUTE_BUDGET' and all(type(envelope[k]) in (int,float) and math.isfinite(envelope[k]) for k in ('windowEnd','reserve','cleanupSeconds')) and envelope['reserve']>=0 and envelope['cleanupSeconds']>0,'ABSOLUTE_SNAPSHOT_INVALID')
    m.require(all(isinstance(envelope[k],str) and len(envelope[k])==64 and all(c in '0123456789abcdef' for c in envelope[k]) for k in ('budgetId','windowBinding')),'ABSOLUTE_SNAPSHOT_BINDING_REQUIRED')
    wall=datetime.fromisoformat(envelope['wallEnd']);m.require(wall.tzinfo is not None,'ABSOLUTE_UTC_REQUIRED')
    budget=m.deadline.Budget(envelope['windowEnd'],reserve=envelope['reserve'],wall_end=wall,cleanup_seconds=envelope['cleanupSeconds'])
    budget.check();return budget

def main():
    nonce=os.environ['QAW_COPY_NONCE'];admin=os.environ['QAW_BOOTSTRAP_ADMIN'];locales=tuple(json.loads(os.environ['QAW_LOCALE_OPTIONS']))
    m.require(len(nonce)==32 and all(c in '0123456789abcdef' for c in nonce),'COPY_NONCE_REQUIRED')
    owner=None;budget=None;envelope=None;session=None;session_id=None;finished=False;last_cleanup=None
    token=hashlib.sha256((nonce+m.secrets.token_hex(32)).encode()).hexdigest()
    control=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);control.bind(CONTROL);os.chmod(CONTROL,0o600);control.listen(1)
    try:
        while True:
            channel,_=control.accept()
            with channel:
                channel.settimeout(5);raw=b''
                while not raw.endswith(b'\n'):
                    part=channel.recv(4096);m.require(part,'CONTROL_EOF');raw+=part;m.require(len(raw)<8192,'CONTROL_LIMIT')
                request=json.loads(raw)
                if request.get('nonce')!=nonce:
                    channel.sendall(b'{"error":"COPY_NONCE_CONFLICT"}\n');continue
                op=request.get('op');stop=False
                try:
                    if op=='hello':
                        result={'monotonic':time.monotonic(),'helperSha256':hashlib.sha256((ROOT/'owned-pg-diagnostic-session.py').read_bytes()).hexdigest(),'version':None if owner is None else owner.identity['version'],'bootstrapHash':hashlib.sha256(admin.encode()).hexdigest()}
                    elif op=='initialize':
                        m.require(envelope is None and owner is None,'FACTORY_INITIALIZATION_REPLAY_FORBIDDEN')
                        envelope=dict(request['budget']);budget=absolute_view(envelope)
                        # Parent original Budget supervises this whole RPC and
                        # fences this immutable container if init ACK is lost.
                        owner=m.OwnedSyntheticServer(bootstrap_admin=admin,locale_options=locales)
                        budget.check()
                        alias=Path('/tmp/restore-socket');m.require(not alias.exists(),'RESTORE_SOCKET_ALREADY_EXISTS');alias.symlink_to(owner.sock,target_is_directory=True)
                        result={'initialized':True}
                    elif op=='open':
                        m.require(owner is not None and session is None,'DIAGNOSTIC_ALREADY_OPEN_OR_NOT_INITIALIZED')
                        m.require(request['budget']==envelope,'ABSOLUTE_SNAPSHOT_REPLAY_OR_CHANGE')
                        budget.check();session=m.DiagnosticSession(owner,budget=budget);session.start();session_id=m.secrets.token_hex(16)
                        result={'session':session_id,'socket':str(session.directory)}
                    elif op=='finish':
                        m.require(session is not None and not finished and request['session']==session_id,'DIAGNOSTIC_SESSION_CONFLICT')
                        cleanup=request['cleanupEnd']
                        m.require(type(cleanup) in (int,float) and math.isfinite(cleanup) and cleanup>time.monotonic() and (last_cleanup is None or cleanup<=last_cleanup),'CLEANUP_DEADLINE_CONFLICT')
                        last_cleanup=cleanup;budget.cleanup_end=cleanup;finished=True
                        result=session.finish()
                    elif op=='close':
                        m.require(owner is not None,'FACTORY_NOT_INITIALIZED')
                        if session is not None:m.require(finished and owner.active_session is None,'BACKEND_STOP_UNCONFIRMED')
                        owner.close();result={'cleanup':owner.cleanup_confirmed,'rootRemoved':not owner.root.exists()};stop=True
                    else:raise ValueError('CONTROL_OPERATION_REQUIRED')
                    result['copyToken']=token;channel.sendall((json.dumps(result)+'\n').encode())
                    if stop:return
                except BaseException:
                    # UNKNOWN retains state. No automatic alternate owner/fence.
                    channel.sendall(b'{"error":"OWNED_RUNTIME_OPERATION_FAILED"}\n')
    finally:control.close()

if __name__=='__main__':
    try:main()
    except BaseException:sys.exit(1)
