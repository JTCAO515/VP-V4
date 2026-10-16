"""Independent synthetic-only typed session + caller-owned backend fence.
No existing-server attach, operator entry, data archive, identity or core hook.
"""
from datetime import datetime,timezone,timedelta
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import stat
import struct
import subprocess
import tempfile
import threading
import time

HERE=Path(__file__).resolve().parent

def load(name):
    spec=importlib.util.spec_from_file_location(name,HERE/(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

proxy=load('typed-pg-diagnostic-proxy')
deadline=load('diagnostic-window-deadline')
PG=Path('/opt/homebrew/opt/postgresql@17/bin')


def require(ok,reason):
    if not ok:raise ValueError(reason)


class BackendBinding:
    __slots__=('facts','_cancel_key')
    def __init__(self,facts,cancel_key):self.facts=facts;self._cancel_key=cancel_key
    def __getitem__(self,key):return self.facts[key]
    def __repr__(self):return '<OwnedBackendBinding redacted>'
    def cancel_packet(self):
        require(self._cancel_key is not None,'BACKEND_CANCEL_CAPABILITY_CLOSED')
        return struct.pack('!IIII',16,80877102,self.facts['pid'],self._cancel_key)
    def clear(self):self._cancel_key=None


class OwnedSyntheticServer:
    """Capability can only be created with a NEW private PG17 child process.
    It cannot attach to a supplied PID/data-dir/socket or shared/system PG.
    """
    def __init__(self):
        self.nonce=secrets.token_hex(16);self.key=secrets.token_bytes(32)
        self.tmp=tempfile.TemporaryDirectory(prefix='qaw-session-',dir='/private/tmp')
        self.root=Path(self.tmp.name);self.root.chmod(0o700)
        self.data=self.root/'data';self.sock=self.root/'sock';self.sock.mkdir(mode=0o700)
        self.marker=self.root/'owner.json';self.marker.write_text(json.dumps({'nonce':self.nonce}));self.marker.chmod(0o600)
        self.env={k:os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ}
        self.env.update(LC_ALL='C',PGSSLMODE='disable',PGGSSENCMODE='disable',PGCONNECT_TIMEOUT='2',PGPASSFILE=str(self.root/'no-passfile'),PGSERVICEFILE=str(self.root/'no-service-file'))
        self._process=None;self.identity=None;self.bindings=[];self.registrations={};self.closed=False;self.cleanup_confirmed=False
        self.lifecycle_lock=threading.RLock();self.active_session=None
        self.query_timeout=3
        try:
            require(subprocess.run([str(PG/'postgres'),'--version'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=3).stdout.startswith(b'postgres (PostgreSQL) 17.'),'OWN_PG17_REQUIRED')
            subprocess.run([str(PG/'initdb'),'-D',str(self.data),'-A','trust','-U','qaw_diag_owner','--locale=C','-E','UTF8','--no-instructions'],env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True,timeout=20)
            self._process=subprocess.Popen([str(PG/'postgres'),'-D',str(self.data),'-c','listen_addresses=','-c','unix_socket_directories='+str(self.sock),'-c','unix_socket_permissions=0700','-c','logging_collector=off','-c','log_min_messages=panic','-c','log_min_error_statement=panic','-c','log_statement=none'],env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(100):
                r=subprocess.run([str(PG/'pg_isready'),'-h',str(self.sock),'-U','qaw_diag_owner'],env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=2)
                if r.returncode==0:break
                require(self._process.poll() is None,'OWN_SERVER_START_FAILED');time.sleep(.03)
            else:raise ValueError('OWN_SERVER_NOT_READY')
            self.identity=self._read_identity();self.verify()
        except BaseException:
            self._construction_cleanup();raise
    def is_live(self):
        with self.lifecycle_lock:return self._process is not None and self._process.poll() is None
    def __repr__(self):return '<OwnedSyntheticServer capability>'
    def _construction_cleanup(self):
        try:
            if self._process is not None and self._process.poll() is None:
                self._process.send_signal(signal.SIGQUIT);self._process.wait(timeout=5)
            self.tmp.cleanup()
        except BaseException:
            self.tmp._finalizer.detach()
            raise ValueError('OWN_CONSTRUCTION_CLEANUP_UNKNOWN_PRIVATE_DIR_RETAINED') from None
    def command(self,socket_dir=None):
        destination=Path(socket_dir or self.sock)
        require(destination.resolve().is_relative_to(self.root) and not destination.is_symlink(),'OWN_SOCKET_PATH_REQUIRED')
        return [str(PG/'psql'),'-X','-w','-At','-h',str(destination),'-p','5432','-U','qaw_diag_owner','-d','postgres','-v','ON_ERROR_STOP=1']
    def _sql(self,sql,timeout=None,limit=None):
        cap=timeout or self.query_timeout
        if limit is not None:
            require(limit>time.monotonic(),'OWN_CONTROL_DEADLINE')
            cap=min(cap,limit-time.monotonic())
        result=subprocess.run(self.command(),input=sql.encode(),env=self.env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=cap)
        require(result.returncode==0,'OWN_CONTROL_QUERY_FAILED')
        return result.stdout.decode().strip()
    def _read_identity(self,limit=None):
        return json.loads(self._sql("select pg_catalog.jsonb_build_object('systemId',(select system_identifier::text from pg_catalog.pg_control_system()),'postmasterStart',pg_catalog.pg_postmaster_start_time()::text,'dataDir',pg_catalog.current_setting('data_directory'),'version',pg_catalog.current_setting('server_version_num')::integer);",limit=limit))
    def verify(self,limit=None):
        with self.lifecycle_lock:return self._verify(limit)
    def _verify(self,limit=None):
        require(not self.closed and self._process is not None and self._process.poll() is None,'OWN_SERVER_NOT_LIVE')
        for directory in (self.root,self.data,self.sock):
            st=directory.lstat();require(not directory.is_symlink() and stat.S_ISDIR(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700,'OWN_SERVER_DIRECTORY_CONFLICT')
        st=self.marker.lstat();require(stat.S_ISREG(st.st_mode) and not self.marker.is_symlink() and st.st_uid==os.getuid() and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600,'OWN_SERVER_NONCE_CONFLICT')
        require(json.loads(self.marker.read_text())=={'nonce':self.nonce},'OWN_SERVER_NONCE_CONFLICT')
        require(int((self.data/'postmaster.pid').read_text().splitlines()[0])==self._process.pid,'OWN_POSTMASTER_PID_CONFLICT')
        actual=self._read_identity(limit)
        require(actual==self.identity and actual['dataDir']==str(self.data) and 170000<=actual['version']<180000,'OWN_SERVER_IDENTITY_CONFLICT')
    def setup_synthetic(self,sql):self.verify();return self._sql(sql)
    def backend(self,pid,limit=None):
        require(type(pid) is int and pid>0 and pid!=self._process.pid,'BACKEND_PID_INVALID')
        raw=self._sql("select coalesce((select pg_catalog.jsonb_build_object('pid',pid,'started',backend_start::text,'databaseOid',datid,'roleOid',usesysid,'state',state) from pg_catalog.pg_stat_activity where pid="+str(pid)+"),'null'::jsonb);",limit=limit)
        return json.loads(raw)
    def bind(self,pid,cancel_key,limit=None):
        with self.lifecycle_lock:return self._bind(pid,cancel_key,limit)
    def _bind(self,pid,cancel_key,limit):
        self.verify(limit);row=self.backend(pid,limit)
        require(row is not None and row['started'] and row['databaseOid'] and row['roleOid'],'BACKEND_BINDING_UNAVAILABLE')
        binding=BackendBinding({'nonce':self.nonce,'serverIdentity':dict(self.identity),'pid':pid,'started':row['started'],'databaseOid':row['databaseOid'],'roleOid':row['roleOid']},cancel_key)
        self.bindings.append(binding);self.registrations[id(binding)]=self.binding_digest(binding);return binding
    def binding_digest(self,binding):
        return hmac.new(self.key,json.dumps(binding.facts,sort_keys=True).encode()+binding.cancel_packet(),hashlib.sha256).digest()
    def matching_backend(self,binding,limit=None):
        with self.lifecycle_lock:return self._matching_backend(binding,limit)
    def _matching_backend(self,binding,limit):
        require(binding in self.bindings and self.registrations.get(id(binding))==self.binding_digest(binding),'BACKEND_CAPABILITY_CHANGED')
        self.verify(limit)
        require(binding['nonce']==self.nonce and binding['serverIdentity']==self.identity,'BACKEND_SERVER_BINDING_CONFLICT')
        row=self.backend(binding['pid'],limit)
        if row is None:return None
        require(all(row[k]==binding[k] for k in ('pid','started','databaseOid','roleOid')),'BACKEND_LIFETIME_CONFLICT')
        return row
    def token(self,binding):
        material=json.dumps({k:binding[k] for k in ('nonce','serverIdentity','pid','started')},sort_keys=True).encode()
        return hmac.new(self.key,material,hashlib.sha256).hexdigest()
    def fence(self,binding,cleanup_seconds=3):
        with self.lifecycle_lock:return self._fence(binding,cleanup_seconds)
    def _fence(self,binding,cleanup_seconds):
        """CancelRequest authenticates PID+private backend secret, never PID-only
        terminate. If a resistant backend remains, only this exclusive owned
        postmaster child may be stopped. Identity mismatch never triggers kill.
        """
        limit=time.monotonic()+cleanup_seconds;result={'backendStopped':'UNKNOWN','cancelSent':False,'serverStopped':False,'ownershipVerified':False}
        try:
            row=self.matching_backend(binding,limit);result['ownershipVerified']=True;result['bindingToken']=self.token(binding)
            if row is None:result['backendStopped']=True;return result
            cancel=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
            try:
                cancel.settimeout(min(1,max(.01,limit-time.monotonic())));cancel.connect(str(self.sock/'.s.PGSQL.5432'))
                cancel.sendall(binding.cancel_packet())
            finally:cancel.close()
            result['cancelSent']=True
            for _ in range(8):
                if time.monotonic()>=limit:break
                if self.matching_backend(binding,limit) is None:result['backendStopped']=True;return result
                time.sleep(.025)
            # No PID-only signal to a backend: avoid PID reuse races. The held
            # Popen child is this factory's own exclusive postmaster, not an
            # attached/shared PID. Verify nonce + full server epoch again first.
            self.verify(limit);self._process.send_signal(signal.SIGQUIT)
            self._process.wait(timeout=max(.01,limit-time.monotonic()));self.closed=True;result['serverStopped']=True
            while time.monotonic()<limit:
                try:os.kill(binding['pid'],0)
                except ProcessLookupError:result['backendStopped']=True;return result
                time.sleep(.025)
            return result
        except Exception:
            return result
    def close(self):
        with self.lifecycle_lock:
            try:return self._close_checked()
            except BaseException:
                self.tmp._finalizer.detach()
                raise ValueError('OWN_SERVER_CLEANUP_UNKNOWN_PRIVATE_DIR_RETAINED') from None
    def _close_checked(self):
        if not self.closed and self._process is not None and self._process.poll() is None:
            self.verify();self._process.send_signal(signal.SIGQUIT);self._process.wait(timeout=5);self.closed=True
        end=time.monotonic()+2
        for binding in self.bindings:
            while True:
                try:os.kill(binding['pid'],0)
                except ProcessLookupError:break
                if time.monotonic()>=end:
                    self.tmp._finalizer.detach()
                    raise ValueError('OWN_BACKEND_EXIT_UNCONFIRMED_DATA_DIR_RETAINED')
                time.sleep(.025)
        for binding in self.bindings:binding.clear()
        self.key=b'';self.tmp.cleanup();self.cleanup_confirmed=True;self.active_session=None

class BoundProxy(proxy.OwnedUnixProxy):
    def __init__(self,owner,listen_dir,budget):
        owner.verify();super().__init__(owner.sock,listen_dir,seconds=min(30,budget.timeout(30)))
        self.owner=owner;self.budget=budget;self.binding=None
    def remaining(self):
        try:return self.budget.timeout(None)
        except ValueError:raise TimeoutError() from None
    def backend(self,tag,payload):
        if tag==b'K':
            require(self.binding is None and len(payload)==8,'BACKEND_KEY_FRAME_INVALID')
            pid,key=struct.unpack('!II',payload);self.binding=self.owner.bind(pid,key,limit=time.monotonic()+self.remaining())
        super().backend(tag,payload)
    def frontend(self,tag,payload):
        if tag==b'Q':require(self.binding is not None,'BACKEND_BINDING_REQUIRED_BEFORE_QUERY')
        super().frontend(tag,payload)


class DiagnosticSession:
    def __init__(self,owner,seconds=3):
        owner.verify()
        self.owner=owner;self.session_token=secrets.token_hex(16)
        with owner.lifecycle_lock:
            require(owner.active_session is None,'OWN_SERVER_SESSION_ALREADY_ACTIVE')
            owner.active_session=self.session_token
        self.directory=Path(tempfile.mkdtemp(prefix='session-',dir=owner.root));self.directory.chmod(0o700)
        end=datetime.now(timezone.utc)+timedelta(seconds=seconds)
        self.budget=deadline.Budget(time.monotonic()+seconds,reserve=0,wall_end=end)
        try:self.proxy=BoundProxy(owner,self.directory,self.budget)
        except BaseException:
            owner.active_session=None;raise
        self.thread=threading.Thread(target=self.proxy.run)
    def start(self):self.thread.start();require(self.proxy.ready.wait(2),'SESSION_PROXY_NOT_READY')
    def finish(self):
        self.thread.join(timeout=max(.1,self.budget.remaining()+1))
        require(not self.thread.is_alive(),'SESSION_PROXY_NOT_STOPPED')
        result=dict(self.proxy.result)
        if self.budget.expired or self.budget.remaining()<=0:
            result['protocolCaptureStatus']=result['status'];result['status']='INCOMPLETE_DEADLINE'
        if self.proxy.binding is None:
            result['backendFence']={'backendStopped':'UNKNOWN','cancelSent':False,'serverStopped':False,'ownershipVerified':False}
        else:result['backendFence']=self.owner.fence(self.proxy.binding,cleanup_seconds=self.budget.cleanup_timeout(3))
        result['proxyOnlyBackendStatus']=result.pop('backendCommandStopped')
        result['backendCommandStopped']=result['backendFence']['backendStopped']
        if result['backendCommandStopped'] is not True:
            result.setdefault('protocolCaptureStatus',result['status']);result['status']='INCOMPLETE_BACKEND_FENCE'
        else:
            with self.owner.lifecycle_lock:
                require(self.owner.active_session==self.session_token,'OWN_SESSION_BINDING_CONFLICT')
                self.owner.active_session=None
        return result
    def run_synthetic(self,sql):
        self.start();child=None
        try:
            child=deadline.Subprocess(subprocess,self.budget).Popen(self.owner.command(self.directory),env=self.owner.env,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            child.communicate(input=sql.encode(),timeout=self.budget.timeout(None))
        except (subprocess.TimeoutExpired,ValueError):
            if child is not None:self.budget.stop_process(child)
        finally:
            if child is not None and child.poll() is None:self.budget.stop_process(child)
        return self.finish()


if __name__=='__main__':raise SystemExit('SYNTHETIC_LIBRARY_ONLY_NO_OPERATOR_ENTRY')
