"""Independent synthetic-only typed session + caller-owned backend fence.
No existing-server attach, operator entry, data archive, identity or core hook.
"""
from datetime import datetime,timezone,timedelta
import hashlib
import hmac
import importlib.util
import json
import os
import re
from pathlib import Path
import secrets
import signal
import shutil
import socket
import stat
import struct
import subprocess
import tempfile
import threading
import time
import weakref

HERE=Path(__file__).resolve().parent

def load(name):
    spec=importlib.util.spec_from_file_location(name,HERE/(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

proxy=load('typed-pg-diagnostic-proxy')
deadline=load('diagnostic-window-deadline').shared_runtime()
PG=Path('/opt/homebrew/opt/postgresql@17/bin')


def require(ok,reason):
    if not ok:raise ValueError(reason)


def checked_budget(budget):
    require(type(budget) is deadline.Budget and budget.wall_end is not None,'OWN_ABSOLUTE_BUDGET_REQUIRED')
    budget.check();return budget


# Factory receipts are independent of writable owner attributes. This is an API
# capability boundary, not a sandbox against arbitrary module/code mutation.
_FACTORY_RECEIPTS=weakref.WeakKeyDictionary()


def _factory_receipt(owner):
    require(type(owner) is OwnedSyntheticServer,'OWN_FACTORY_EXACT_TYPE_REQUIRED')
    receipt=_FACTORY_RECEIPTS.get(owner)
    require(receipt is not None,'OWN_FACTORY_RECEIPT_REQUIRED')
    require(not any(name in owner.__dict__ for name,value in vars(OwnedSyntheticServer).items() if callable(value)), 'OWN_FACTORY_METHOD_REPLACED')
    require(owner._process is receipt['process'] and owner.lifecycle_lock is receipt['lock'],'OWN_FACTORY_PROCESS_REPLACED')
    require((owner.root,owner.data,owner.sock,owner.marker,owner.nonce)==receipt['resources'],'OWN_FACTORY_RESOURCES_CHANGED')
    require(json.dumps(owner.identity,sort_keys=True)==receipt['identity'],'OWN_FACTORY_IDENTITY_CHANGED')
    require((owner.admin,owner.locale_options)==receipt['settings'],'OWN_FACTORY_SETTINGS_CHANGED')
    return receipt


def _filesystem_identity(path):
    st=path.lstat()
    return (st.st_dev,st.st_ino,st.st_uid,st.st_mode)


def _verify_factory_root(receipt):
    root,_,_,marker,nonce=receipt['resources']
    require(_filesystem_identity(root)==receipt['rootIdentity'] and not root.is_symlink(),'OWN_ROOT_IDENTITY_CONFLICT')
    require(_filesystem_identity(marker)==receipt['markerIdentity'] and not marker.is_symlink(),'OWN_MARKER_IDENTITY_CONFLICT')
    require(marker.stat().st_nlink==1 and json.loads(marker.read_text())=={'nonce':nonce},'OWN_SERVER_NONCE_CONFLICT')


def _remove_factory_root(owner):
    receipt=_factory_receipt(owner)
    with receipt['lock']:
        child=receipt['process']
        require(child is None or child.poll() is not None,'OWN_CHILD_EXIT_UNCONFIRMED')
        if child is not None:child.wait(timeout=1)
        root=receipt['resources'][0]
        if receipt['removed']:
            require(not root.exists(),'OWN_REMOVED_ROOT_REPLACED');return
        _verify_factory_root(receipt)
        # No TemporaryDirectory cleanup/finalizer can reach this deletion.
        shutil.rmtree(root)
        require(not root.exists(),'OWN_ROOT_REMOVAL_UNCONFIRMED')
        receipt['removed']=True


def _stop_factory_child(owner,timeout,construction=False,limit=None):
    receipt=_factory_receipt(owner)
    with receipt['lock']:
        receipt=_factory_receipt(owner)
        child=receipt['process']
        if child is not None and child.poll() is None:
            # During startup identity may not yet be available. Only the exact
            # Popen returned to this factory can be reclaimed in that phase.
            if not construction or owner.identity is not None:OwnedSyntheticServer._verify(owner,limit)
            else:
                require(json.loads(owner.marker.read_text())=={'nonce':owner.nonce},'OWN_SERVER_NONCE_CONFLICT')
                pidfile=owner.data/'postmaster.pid'
                if pidfile.exists():require(int(pidfile.read_text().splitlines()[0])==child.pid,'OWN_POSTMASTER_PID_CONFLICT')
            child.send_signal(signal.SIGQUIT)
            child.wait(timeout=timeout)


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
    def __init__(self,bootstrap_admin='qaw_diag_owner',locale_options=('--locale=C',)):
        require(type(self) is OwnedSyntheticServer,'OWN_FACTORY_EXACT_TYPE_REQUIRED')
        require(self not in _FACTORY_RECEIPTS,'OWN_FACTORY_ALREADY_CREATED')
        require(isinstance(bootstrap_admin,str) and re.fullmatch('[a-zA-Z_][a-zA-Z_0-9]{0,62}',bootstrap_admin),'OWN_BOOTSTRAP_ROLE_REQUIRED')
        require(type(locale_options) is tuple and len(locale_options) in (1,5),'OWN_LOCALE_OPTIONS_REQUIRED')
        keys=tuple(option.split('=',1)[0] for option in locale_options)
        require(keys in (('--locale',),('--locale','--lc-collate','--lc-ctype','--locale-provider','--icu-locale')) and all(re.fullmatch(r'--[a-z-]+=[a-zA-Z0-9_.@-]+',option) for option in locale_options),'OWN_LOCALE_OPTIONS_REQUIRED')
        self.admin=bootstrap_admin;self.locale_options=locale_options
        self.nonce=secrets.token_hex(16);self.key=secrets.token_bytes(32)
        # mkdtemp has no recursive-deletion finalizer or public cleanup handle.
        self.root=Path(tempfile.mkdtemp(prefix='qaw-session-',dir='/private/tmp'));self.root.chmod(0o700)
        self.data=self.root/'data';self.sock=self.root/'sock';self.sock.mkdir(mode=0o700)
        self.marker=self.root/'owner.json';self.marker.write_text(json.dumps({'nonce':self.nonce}));self.marker.chmod(0o600)
        self.env={k:os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ}
        self.env.update(LC_ALL='C',PGSSLMODE='disable',PGGSSENCMODE='disable',PGCONNECT_TIMEOUT='2',PGPASSFILE=str(self.root/'no-passfile'),PGSERVICEFILE=str(self.root/'no-service-file'))
        self._process=None;self.identity=None;self.bindings=[];self.registrations={};self.closed=False;self.cleanup_confirmed=False
        self.lifecycle_lock=threading.RLock();self.active_session=None
        self.query_timeout=3
        receipt={'process':None,'lock':self.lifecycle_lock,'resources':(self.root,self.data,self.sock,self.marker,self.nonce),'identity':'null','rootIdentity':_filesystem_identity(self.root),'markerIdentity':_filesystem_identity(self.marker),'removed':False,'settings':(self.admin,self.locale_options)}
        _FACTORY_RECEIPTS[self]=receipt
        try:
            require(subprocess.run([str(PG/'postgres'),'--version'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=3).stdout.startswith(b'postgres (PostgreSQL) 17.'),'OWN_PG17_REQUIRED')
            subprocess.run([str(PG/'initdb'),'-D',str(self.data),'-A','trust','-U',self.admin,*self.locale_options,'-E','UTF8','--no-instructions'],env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True,timeout=20)
            child=subprocess.Popen([str(PG/'postgres'),'-D',str(self.data),'-c','listen_addresses=','-c','unix_socket_directories='+str(self.sock),'-c','unix_socket_permissions=0700','-c','logging_collector=off','-c','log_min_messages=panic','-c','log_min_error_statement=panic','-c','log_statement=none'],env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            receipt['process']=child
            self._process=child
            for _ in range(100):
                r=subprocess.run([str(PG/'pg_isready'),'-h',str(self.sock),'-U',self.admin],env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=2)
                if r.returncode==0:break
                require(self._process.poll() is None,'OWN_SERVER_START_FAILED');time.sleep(.03)
            else:raise ValueError('OWN_SERVER_NOT_READY')
            self.identity=OwnedSyntheticServer._read_identity(self)
            receipt['identity']=json.dumps(self.identity,sort_keys=True)
            OwnedSyntheticServer.verify(self)
        except BaseException:
            OwnedSyntheticServer._construction_cleanup(self);raise
    def is_live(self):
        with self.lifecycle_lock:return self._process is not None and self._process.poll() is None
    def __repr__(self):return '<OwnedSyntheticServer capability>'
    def _construction_cleanup(self):
        try:
            _stop_factory_child(self,5,construction=True)
            _remove_factory_root(self)
        except BaseException:
            raise ValueError('OWN_CONSTRUCTION_CLEANUP_UNKNOWN_PRIVATE_DIR_RETAINED') from None
    def command(self,socket_dir=None):
        destination=Path(socket_dir or self.sock)
        require(destination.resolve().is_relative_to(self.root) and not destination.is_symlink(),'OWN_SOCKET_PATH_REQUIRED')
        return [str(PG/'psql'),'-X','-w','-At','-h',str(destination),'-p','5432','-U',self.admin,'-d','postgres','-v','ON_ERROR_STOP=1']
    def _sql(self,sql,timeout=None,limit=None,budget=None):
        if budget is not None:checked_budget(budget)
        cap=timeout or self.query_timeout
        if limit is not None:
            require(limit>time.monotonic(),'OWN_CONTROL_DEADLINE')
            cap=min(cap,limit-time.monotonic())
        runner=subprocess if budget is None else deadline.Subprocess(subprocess,budget)
        result=runner.run(self.command(),input=sql.encode(),env=self.env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=cap)
        require(result.returncode==0,'OWN_CONTROL_QUERY_FAILED')
        return result.stdout.decode().strip()
    def _read_identity(self,limit=None,budget=None):
        return json.loads(self._sql("select pg_catalog.jsonb_build_object('systemId',(select system_identifier::text from pg_catalog.pg_control_system()),'postmasterStart',pg_catalog.pg_postmaster_start_time()::text,'dataDir',pg_catalog.current_setting('data_directory'),'version',pg_catalog.current_setting('server_version_num')::integer);",limit=limit,budget=budget))
    def verify(self,limit=None,budget=None):
        if budget is not None:checked_budget(budget)
        with self.lifecycle_lock:return self._verify(limit,budget)
    def _verify(self,limit=None,budget=None):
        if budget is not None:checked_budget(budget)
        _factory_receipt(self)
        require(not self.closed and self._process is not None and self._process.poll() is None,'OWN_SERVER_NOT_LIVE')
        for directory in (self.root,self.data,self.sock):
            st=directory.lstat();require(not directory.is_symlink() and stat.S_ISDIR(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700,'OWN_SERVER_DIRECTORY_CONFLICT')
        st=self.marker.lstat();require(stat.S_ISREG(st.st_mode) and not self.marker.is_symlink() and st.st_uid==os.getuid() and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600,'OWN_SERVER_NONCE_CONFLICT')
        require(json.loads(self.marker.read_text())=={'nonce':self.nonce},'OWN_SERVER_NONCE_CONFLICT')
        require(int((self.data/'postmaster.pid').read_text().splitlines()[0])==self._process.pid,'OWN_POSTMASTER_PID_CONFLICT')
        actual=self._read_identity(limit,budget)
        require(actual==self.identity and actual['dataDir']==str(self.data) and 170000<=actual['version']<180000,'OWN_SERVER_IDENTITY_CONFLICT')
    def setup_synthetic(self,sql):self.verify();return self._sql(sql)
    def backend(self,pid,limit=None,budget=None):
        require(type(pid) is int and pid>0 and pid!=self._process.pid,'BACKEND_PID_INVALID')
        raw=self._sql("select coalesce((select pg_catalog.jsonb_build_object('pid',pid,'started',backend_start::text,'databaseOid',datid,'roleOid',usesysid,'state',state) from pg_catalog.pg_stat_activity where pid="+str(pid)+"),'null'::jsonb);",limit=limit,budget=budget)
        return json.loads(raw)
    def bind(self,pid,cancel_key,limit=None,budget=None):
        if budget is not None:checked_budget(budget)
        with self.lifecycle_lock:return self._bind(pid,cancel_key,limit,budget)
    def _bind(self,pid,cancel_key,limit,budget=None):
        self.verify(limit,budget);row=self.backend(pid,limit,budget)
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
            _factory_receipt(self)
            row=OwnedSyntheticServer.matching_backend(self,binding,limit);result['ownershipVerified']=True;result['bindingToken']=self.token(binding)
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
            OwnedSyntheticServer.verify(self,limit)
            _stop_factory_child(self,max(.01,limit-time.monotonic()),limit=limit);self.closed=True;result['serverStopped']=True
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
                raise ValueError('OWN_SERVER_CLEANUP_UNKNOWN_PRIVATE_DIR_RETAINED') from None
    def _close_checked(self):
        _factory_receipt(self)
        if self._process is not None and self._process.poll() is None:
            _stop_factory_child(self,5);self.closed=True
        end=time.monotonic()+2
        for binding in self.bindings:
            while True:
                try:os.kill(binding['pid'],0)
                except ProcessLookupError:break
                if time.monotonic()>=end:
                    raise ValueError('OWN_BACKEND_EXIT_UNCONFIRMED_DATA_DIR_RETAINED')
                time.sleep(.025)
        for binding in self.bindings:binding.clear()
        _remove_factory_root(self)
        self.key=b''
        self.cleanup_confirmed=True;self.active_session=None

class BoundProxy(proxy.OwnedUnixProxy):
    def __init__(self,owner,listen_dir,budget):
        checked_budget(budget)
        _factory_receipt(owner);OwnedSyntheticServer.verify(owner,limit=time.monotonic()+budget.timeout(3),budget=budget)
        super().__init__(owner.sock,listen_dir,seconds=min(30,budget.timeout(30)))
        self.owner=owner;self.budget=budget;self.binding=None
    def remaining(self):
        try:return self.budget.timeout(None)
        except ValueError:raise TimeoutError() from None
    def backend(self,tag,payload):
        if tag==b'K':
            require(self.binding is None and len(payload)==8,'BACKEND_KEY_FRAME_INVALID')
            pid,key=struct.unpack('!II',payload);self.binding=self.owner.bind(pid,key,limit=time.monotonic()+self.remaining(),budget=self.budget)
        super().backend(tag,payload)
    def frontend(self,tag,payload):
        if tag==b'Q':require(self.binding is not None,'BACKEND_BINDING_REQUIRED_BEFORE_QUERY')
        super().frontend(tag,payload)


class DiagnosticSession:
    def __init__(self,owner,seconds=3,budget=None):
        if budget is not None:checked_budget(budget)
        _factory_receipt(owner)
        OwnedSyntheticServer.verify(owner,limit=None if budget is None else time.monotonic()+budget.timeout(3),budget=budget)
        self.owner=owner;self.session_token=secrets.token_hex(16)
        with owner.lifecycle_lock:
            require(owner.active_session is None,'OWN_SERVER_SESSION_ALREADY_ACTIVE')
            owner.active_session=self.session_token
        self.directory=Path(tempfile.mkdtemp(prefix='session-',dir=owner.root));self.directory.chmod(0o700)
        if budget is None:
            end=datetime.now(timezone.utc)+timedelta(seconds=seconds)
            self.budget=deadline.Budget(time.monotonic()+seconds,reserve=0,wall_end=end)
        else:self.budget=budget
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
