"""Synthetic-only prototype: transparent local Unix PG protocol error observer.
No operational CLI/core seam. No raw SQL/error/object/value logging. Caller must
own/fence the server: socket close alone does not prove a running query stopped.
"""
import hashlib
import hmac
import os
from pathlib import Path
import secrets
import select
import socket
import stat
import struct
import threading
import time

PUBLIC_STATES=frozenset({'P0001','42501','42601','42703','42704','42710','42P01','42P07','42883','23502','23503','23505','23514','57014','57P01','08006','28000','28P01'})
MAX_FRAME=4*1024*1024


def require(ok):
    if not ok:raise ValueError('TYPED_PG_PROXY_CONTRACT_REJECTED')


def error_code(payload):
    """Only protocol ErrorResponse C; never M/DETAIL/CONTEXT/object values."""
    i=0;codes=[]
    while i<len(payload):
        tag=payload[i];i+=1
        if tag==0:
            require(i==len(payload) and len(codes)==1)
            code=codes[0]
            require(len(code)==5 and all(c in b'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' for c in code))
            value=code.decode('ascii')
            return value if value in PUBLIC_STATES else None
        end=payload.find(b'\0',i);require(end>=i)
        if tag==ord('C'):codes.append(payload[i:end])
        i=end+1
    raise ValueError('TYPED_PG_PROXY_CONTRACT_REJECTED')


def private_dir(path):
    p=Path(path);s=p.lstat()
    require(not p.is_symlink() and p.resolve()==p and stat.S_ISDIR(s.st_mode)
            and s.st_uid==os.getuid() and stat.S_IMODE(s.st_mode)==0o700)
    return p


class OwnedUnixProxy:
    def __init__(self,upstream_dir,listen_dir,seconds=5,port=5432):
        self.upstream=private_dir(upstream_dir)/('.s.PGSQL.'+str(port))
        st=self.upstream.lstat();require(stat.S_ISSOCK(st.st_mode) and st.st_uid==os.getuid())
        self.listen=private_dir(listen_dir)/('.s.PGSQL.'+str(port))
        require(not self.listen.exists() and 0<seconds<=30)
        self.end=time.monotonic()+seconds;self.key=secrets.token_bytes(32)
        self.first=None;self.queue=[];self.sequence=0;self.phase='STARTUP';self.sock=None;self.connections=[]
        self.ready=threading.Event();self.done=threading.Event();self.result=None;self.inode=None
    def remaining(self):
        remaining=self.end-time.monotonic()
        if remaining<=0:raise TimeoutError()
        return remaining
    def recv_exact(self,sock,size):
        out=bytearray()
        while len(out)<size:
            readable,_,_=select.select([sock],[],[],min(self.remaining(),.1))
            if not readable:continue
            data=sock.recv(size-len(out))
            if not data:raise EOFError()
            out.extend(data)
        return bytes(out)
    def send(self,sock,data):
        sock.settimeout(min(self.remaining(),.25));sock.sendall(data)
    def frontend(self,tag,payload):
        if tag==b'Q':
            require(payload.endswith(b'\0'));self.sequence+=1
            self.queue.append({'queryUnit':self.sequence,'queryToken':hmac.new(self.key,b'Q'+payload,hashlib.sha256).hexdigest()})
        elif tag in (b'P',b'B',b'E'):
            # This prototype correlates simple Query only; do not pretend to
            # map extended prepared/bind execution or parse its values.
            self.queue=[];self.phase='EXTENDED_UNCORRELATED'
    def backend(self,tag,payload):
        if tag==b'E' and self.first is None:
            code=error_code(payload)
            self.first={'sqlstate':code,'provenance':'PG_BACKEND_ERROR_RESPONSE_C_FIELD_ALLOWLIST',
                        'commandClass':'UNKNOWN_NOT_IN_ERROR_RESPONSE','objectClass':'UNKNOWN_NOT_CAPTURED',
                        **(self.queue[0] if self.queue else {'queryUnit':None,'queryToken':None})}
        elif tag==b'Z':
            if self.queue:self.queue.pop(0)
            self.phase='READY'
    def frames(self,buf,direction):
        while len(buf)>=5:
            size=struct.unpack('!I',buf[1:5])[0];require(4<=size<=MAX_FRAME)
            total=1+size
            if len(buf)<total:return
            tag=bytes(buf[:1]);payload=bytes(buf[5:total]);del buf[:total]
            if direction=='frontend':self.frontend(tag,payload)
            else:self.backend(tag,payload)
    def run(self):
        status='INCOMPLETE_PROXY_FAILURE'
        try:
            self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.bind(str(self.listen));os.chmod(self.listen,0o600)
            self.inode=self.listen.stat().st_ino;self.sock.listen(1);self.sock.settimeout(self.remaining());self.ready.set()
            client,_=self.sock.accept();self.connections.append(client)
            server=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.connections.append(server);server.settimeout(self.remaining());server.connect(str(self.upstream))
            head=self.recv_exact(client,4);size=struct.unpack('!I',head)[0];require(8<=size<=MAX_FRAME)
            startup=self.recv_exact(client,size-4)
            # Local plaintext protocol3 only; encryption would invalidate typed
            # framing, so this prototype fails closed instead of guessing.
            require(struct.unpack('!I',startup[:4])[0]==196608)
            self.send(server,head+startup)
            buffers={client:bytearray(),server:bytearray()}
            while True:
                readable,_,_=select.select([client,server],[],[],min(self.remaining(),.1))
                for source in readable:
                    data=source.recv(65536)
                    if not data:raise EOFError()
                    buffers[source].extend(data)
                    self.frames(buffers[source],'frontend' if source is client else 'backend')
                    self.send(server if source is client else client,data)
        except EOFError:status='CAPTURED_TYPED_FIRST_ERROR' if self.first else 'NO_TYPED_ERROR_OBSERVED'
        except (TimeoutError,socket.timeout):status='INCOMPLETE_DEADLINE'
        except Exception:status='INCOMPLETE_PROXY_FAILURE'
        finally:
            self.ready.set()
            for conn in self.connections:
                try:conn.close()
                except Exception:pass
            if self.sock:self.sock.close()
            if self.inode is not None:
                try:
                    st=self.listen.lstat()
                    if st.st_ino==self.inode and stat.S_ISSOCK(st.st_mode):self.listen.unlink()
                except FileNotFoundError:pass
            self.key=b'';self.queue=[]
            self.result={'status':status,'firstError':self.first,'rawSqlStderrObjectNamesOrUserValuesOutput':False,
                         'socketClosed':True,'backendCommandStopped':'UNKNOWN_REQUIRES_CALLER_OWNED_SERVER_FENCE'}
            self.done.set()
        return self.result


if __name__=='__main__':raise SystemExit('PROTOTYPE_LIBRARY_ONLY_NO_OPERATOR_ENTRY')
