"""One monotonic data deadline, only for the new diagnostic-window path.
Private-module subprocess adapters; nonce-fenced owned cleanup survives expiry.
"""
from contextlib import contextmanager
import copy
from datetime import datetime,timezone
import json
import re
import subprocess
import sys
from time import monotonic

DATA_CLEANUP_RESERVE_SECONDS=120
CLEANUP_BUDGET_SECONDS=60
INFLIGHT_CLOCK_CHECK_SECONDS=0.25


def utc_now():return datetime.now(timezone.utc)


class WindowExpired(ValueError):
    def __init__(self):super().__init__('WINDOW_DATA_DEADLINE_EXPIRED')


def from_window(end,instant,stamp,anchor=None):
    # Anchor must precede the wall sample/validation; their latency never adds
    # time to the already approved absolute window.
    origin=monotonic() if anchor is None else anchor
    return Budget(origin+(stamp(end)-instant).total_seconds(),clock=monotonic,wall_end=stamp(end),wall_clock=utc_now)


class Process:
    def __init__(self,raw,budget):self.raw=raw;self.budget=budget;self.killed=False
    def __getattr__(self,name):return getattr(self.raw,name)
    def kill(self):self.killed=True;return self.raw.kill()
    def wait(self,timeout=None):
        if self.killed:return self.raw.wait(timeout=self.budget.cleanup_timeout(timeout or 5))
        return self._call(self.raw.wait,timeout=timeout)
    def communicate(self,input=None,timeout=None):return self._call(self.raw.communicate,input=input,timeout=timeout)
    def _call(self,method,timeout=None,**kwargs):
        # Retry only communicate/wait's timed observation of the SAME process.
        # Neither the command, SQL nor its input is submitted again. Recheck UTC
        # while it is in flight; an entry-time monotonic timeout alone is unsafe.
        nominal_end=self.budget.clock()+timeout if timeout is not None else float('inf')
        while True:
            nominal_remaining=nominal_end-self.budget.clock()
            try:
                self.budget.check()
                if nominal_remaining<=0:raise subprocess.TimeoutExpired(self.raw.args,timeout)
                cap=min(self.budget.timeout(nominal_remaining),INFLIGHT_CLOCK_CHECK_SECONDS)
                value=method(timeout=cap,**kwargs)
            except subprocess.TimeoutExpired:
                if 'input' in kwargs:kwargs['input']=None
                try:self.budget.check()
                except WindowExpired:self.budget.stop_process(self);raise
                if self.budget.clock()>=nominal_end:
                    self.budget.stop_process(self)
                    raise subprocess.TimeoutExpired(self.raw.args,timeout) from None
                continue
            except WindowExpired:
                self.budget.stop_process(self);raise
            try:self.budget.check()
            except WindowExpired:self.budget.stop_process(self);raise
            return value


class Subprocess:
    def __init__(self,raw,budget):self.raw=raw;self.window_deadline=budget
    def __getattr__(self,name):return getattr(self.raw,name)
    def Popen(self,*args,**kwargs):
        b=self.window_deadline;b.check()
        p=Process(self.raw.Popen(*args,**kwargs),b);b.processes.append(p)
        try:b.check()
        except WindowExpired:b.stop_process(p);raise
        return p
    def run(self,args,input=None,timeout=None,check=False,**kwargs):
        if input is not None:kwargs['stdin']=self.raw.PIPE
        p=self.Popen(args,**kwargs)
        try:
            out,err=p.communicate(input=input,timeout=timeout)
            if check and p.returncode:raise subprocess.CalledProcessError(p.returncode,args,out,err)
            return subprocess.CompletedProcess(args,p.returncode,out,err)
        finally:
            if p.poll() is None:self.window_deadline.stop_process(p)


class Budget:
    def __init__(self,window_end,clock=monotonic,reserve=DATA_CLEANUP_RESERVE_SECONDS,cleanup_seconds=CLEANUP_BUDGET_SECONDS,wall_end=None,wall_clock=utc_now):
        self.clock=clock;self.window_end=window_end;self.data_end=window_end-reserve
        self.wall_end=wall_end;self.wall_clock=wall_clock;self.reserve=reserve
        self.cleanup_seconds=cleanup_seconds;self.cleanup_end=None
        self.processes=[];self.clusters=[];self.cleanup_ok=True;self.expired=False
        self.progress={'stage':'WINDOW_OPERATION_STARTED','completedIoStages':[],'replay':{}}
    def remaining(self):
        utc_remaining=float('inf') if self.wall_end is None else (self.wall_end-self.wall_clock()).total_seconds()-self.reserve
        return min(self.data_end-self.clock(),utc_remaining)
    def check(self):
        if self.expired or self.remaining()<=0:self.expired=True;raise WindowExpired()
    def timeout(self,upper=None):
        self.check();remaining=self.remaining()
        if remaining<=0:self.expired=True;raise WindowExpired()
        return min(upper,remaining) if upper is not None else remaining
    def cleanup_timeout(self,upper):
        if self.cleanup_end is None:self.cleanup_end=self.clock()+self.cleanup_seconds
        remaining=self.cleanup_end-self.clock()
        if remaining<=0:raise ValueError('OWNED_CLEANUP_BUDGET_EXHAUSTED')
        return min(upper,remaining)
    def stop_process(self,p):
        try:
            if p.raw.poll() is None:p.kill()
            p.raw.wait(timeout=self.cleanup_timeout(5))
        except Exception:self.cleanup_ok=False
    def cleanup_owned(self,db):
        if getattr(db,'_deadline_cleanup_attempted',False):
            if not getattr(db,'_deadline_cleanup_pass',False):raise ValueError('OWNED_DEADLINE_CLEANUP_UNKNOWN')
            return
        db._deadline_cleanup_attempted=True
        if not getattr(db,'_deadline_run_issued',False) and not db.created:
            db._deadline_cleanup_pass=True;return
        try:
            if not db.context:raise ValueError('OWNED_CLEANUP_CONTEXT_UNKNOWN')
            prefix=['docker','--context',db.context]
            def run(args):return self.raw_subprocess.run(prefix+args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=self.cleanup_timeout(15))
            def absent(result,identifier):
                errors=(result.stderr or b'').decode(errors='replace').strip()
                return result.returncode==1 and (result.stdout or b'').strip() in (b'',b'[]') and errors in (
                    'Error: No such object: '+identifier,'Error: No such container: '+identifier,
                    'Error response from daemon: No such container: '+identifier,
                    'error: no such object: '+identifier,'error: no such container: '+identifier,
                    'error response from daemon: no such container: '+identifier)
            info=run(['inspect',db.name])
            confirmed=getattr(db,'_deadline_launch_confirmed',False)
            known_id=getattr(db,'_deadline_container_id',None)
            if absent(info,db.name):
                if not confirmed or not isinstance(known_id,str) or not re.fullmatch('[a-f0-9]{64}',known_id):
                    raise ValueError('OWNED_LAUNCH_UNRESOLVED_ABSENCE')
                if not absent(run(['inspect',known_id]),known_id):raise ValueError('OWNED_CLEANUP_ID_ABSENCE_UNKNOWN')
                db.created=False;db._deadline_cleanup_pass=True;return
            if info.returncode:raise ValueError('OWNED_CLEANUP_INSPECT_UNKNOWN')
            data=json.loads(info.stdout)
            if len(data)!=1:raise ValueError('OWNED_CLEANUP_INSPECT_UNKNOWN')
            item=data[0];container_id=item.get('Id','')
            if item.get('Name')!='/'+db.name or item.get('Config',{}).get('Labels',{}).get('qaw.restore.owner')!=db.nonce or not re.fullmatch('[a-f0-9]{64}',container_id):
                raise ValueError('OWNED_CLEANUP_NONCE_CONFLICT')
            if known_id is not None and known_id!=container_id:raise ValueError('OWNED_CLEANUP_LAUNCH_ID_CONFLICT')
            db._deadline_container_id=container_id
            # Remove by inspected immutable ID, not a potentially replaced name.
            removed=run(['rm','-f',container_id])
            if removed.returncode and not absent(removed,container_id):raise ValueError('OWNED_CLEANUP_REMOVE_UNKNOWN')
            confirm=run(['inspect',container_id])
            if not absent(confirm,container_id):raise ValueError('OWNED_CLEANUP_NOT_CONFIRMED')
            db.created=False;db._deadline_id_removal_confirmed=True
            if not confirmed:raise ValueError('OWNED_LAUNCH_COMPLETION_UNKNOWN_AFTER_FENCE')
            db._deadline_cleanup_pass=True
        except Exception:
            self.cleanup_ok=False;raise ValueError('OWNED_DEADLINE_CLEANUP_UNKNOWN') from None
    def cleanup_all(self):
        for p in reversed(self.processes):
            if p.raw.poll() is None:self.stop_process(p)
        for db in reversed(self.clusters):
            try:self.cleanup_owned(db)
            except Exception:self.cleanup_ok=False
        return self.cleanup_ok
    @contextmanager
    def bind(self,base,replay,diagnostics):
        # Each is a private imported module, never mutate subprocess globally.
        modules=[base,base.capture,replay,diagnostics];previous=[]
        self.raw_subprocess=base.subprocess
        original_cluster=base.OwnCluster;original_hash=base.file_hash;budget=self
        class DeadlineOwned(original_cluster):
            def __init__(self,*args,**kwargs):
                super().__init__(*args,**kwargs);self._deadline_run_issued=False;self._deadline_launch_confirmed=False;self._deadline_container_id=None
                self._window_replay_progress=budget.progress['replay'];budget.clusters.append(self)
            def docker(self,args,data=None):
                if args and args[0]=='run':
                    if '--name' not in args or args[args.index('--name')+1]!=self.name or 'qaw.restore.owner='+self.nonce not in args:
                        raise ValueError('DEADLINE_OWNED_LAUNCH_BINDING_REQUIRED')
                    if self._deadline_run_issued:raise ValueError('DEADLINE_DUPLICATE_LAUNCH_FORBIDDEN')
                    self._deadline_run_issued=True
                    value=super().docker(args,data)
                    identifier=value.decode().strip()
                    if not re.fullmatch('[a-f0-9]{64}',identifier):raise ValueError('OWNED_LAUNCH_ID_UNKNOWN')
                    self._deadline_container_id=identifier;self._deadline_launch_confirmed=True
                    return value
                return super().docker(args,data)
            def close(self):return budget.cleanup_owned(self)
        proxy=Subprocess(self.raw_subprocess,self)
        def file_hash(path):
            # Secret/archive file reads occur in a cancellable owned host child,
            # rather than an uninterruptible Python hash between phase checks.
            program="import hashlib,sys;h=hashlib.sha256();f=open(sys.argv[1],'rb');\nfor b in iter(lambda:f.read(1048576),b''):h.update(b)\nprint(h.hexdigest())"
            result=proxy.run([sys.executable,'-c',program,str(path)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=60)
            digest=(result.stdout or b'').decode().strip()
            if result.returncode or not re.fullmatch('[a-f0-9]{64}',digest):raise ValueError('WINDOW_ARCHIVE_HASH_FAILED')
            return digest
        try:
            for module in modules:
                previous.append((module,module.subprocess));module.subprocess=Subprocess(module.subprocess,self)
            base.OwnCluster=DeadlineOwned;base.file_hash=file_hash
            yield
        finally:
            self.cleanup_all()
            base.OwnCluster=original_cluster;base.file_hash=original_hash
            for module,raw in previous:module.subprocess=raw
    def interrupted_result(self,reason):
        prior=self.progress.get('adapterResult') or self.progress.get('restoreResult') or {}
        value=copy.deepcopy(prior)
        replay=copy.deepcopy(self.progress['replay'])
        value.update(status='FAIL_LOCAL_RESTORE',cleanup='UNKNOWN',reason=reason)
        value['interruption']={'stage':self.progress['stage'],'rollbackInferred':False,'automaticRetryAllowed':False}
        if replay:value['replayProgress']=replay
        for key in ('safeRestoreDiagnostics','prePostDataCaller'):
            if self.progress.get(key):value[key]=copy.deepcopy(self.progress[key])
        return value
    def execute(self,operation,base,replay,diagnostics):
        result=None
        with self.bind(base,replay,diagnostics):
            try:result=operation()
            except KeyboardInterrupt:result=self.interrupted_result('WINDOW_INTERRUPTED')
            except Exception as e:result=self.interrupted_result(str(e) if isinstance(e,WindowExpired) else 'WINDOW_OPERATION_FAILED_DETAILS_SUPPRESSED')
        if not self.cleanup_ok:result.update(status='FAIL_LOCAL_RESTORE',cleanup='FAIL')
        elif result.get('cleanup')=='UNKNOWN':result['cleanup']='PASS'
        if self.progress.get('restoreResult'):result['completedRestoreResult']=copy.deepcopy(self.progress['restoreResult'])
        if self.progress['replay']:result['replayProgress']=copy.deepcopy(self.progress['replay'])
        result['stageProgress']={'stage':self.progress['stage'],'completedIoStages':list(self.progress['completedIoStages'])}
        result['windowDeadline']={'clock':'UTC_AND_MONOTONIC_SHARED_ABSOLUTE_WINDOW','cleanupReserveSeconds':self.window_end-self.data_end,
                                  'dataExpired':self.expired,'ownedCleanupFence':'PASS' if self.cleanup_ok else 'UNKNOWN',
                                  'cleanupMayContinueAfterWindow':True,
                                  'containers':[{'name':db.name,'nonce':db.nonce,'launchIssued':getattr(db,'_deadline_run_issued',False),
                                     'launchConfirmed':getattr(db,'_deadline_launch_confirmed',False),
                                     'containerId':getattr(db,'_deadline_container_id',None),
                                     'idRemovalConfirmed':getattr(db,'_deadline_id_removal_confirmed',False),
                                     'cleanup':'PASS' if getattr(db,'_deadline_cleanup_pass',False) else 'UNKNOWN'} for db in self.clusters]}
        return result
