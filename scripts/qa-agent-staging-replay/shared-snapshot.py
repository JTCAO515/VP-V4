"""Bounded read-only exporter/import protocol; no target defaults or secret output."""
import os
import json
import re
import selectors
import subprocess
import time
import uuid


class SnapshotFailure(ValueError):pass


class PsqlSession:
    def __init__(self,argv,env=None,lifetime=600):
        self.argv=argv;self.env=env;self.lifetime=lifetime;self.process=None;self.started=None;self.pending=b''
    def start(self):
        self.started=time.monotonic()
        self.process=subprocess.Popen(self.argv,env=self.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                                      stderr=subprocess.DEVNULL,bufsize=0)
        return self
    def guard(self):
        if not self.process or self.process.poll() is not None:raise SnapshotFailure('SNAPSHOT_SESSION_LOST')
        if time.monotonic()-self.started>=self.lifetime:raise SnapshotFailure('SNAPSHOT_DEADLINE_EXPIRED')
    def query(self,sql,timeout=30):
        self.guard();marker='qaw_end_'+uuid.uuid4().hex
        try:self.process.stdin.write((sql+'\n\\echo '+marker+'\n').encode());self.process.stdin.flush()
        except (BrokenPipeError,OSError):raise SnapshotFailure('SNAPSHOT_SESSION_LOST') from None
        result=[];total=0;deadline=min(self.started+self.lifetime,time.monotonic()+timeout)
        with selectors.DefaultSelector() as selector:
            selector.register(self.process.stdout,selectors.EVENT_READ)
            while True:
                remaining=deadline-time.monotonic()
                if remaining<=0:raise SnapshotFailure('SNAPSHOT_QUERY_DEADLINE_EXPIRED')
                while b'\n' not in self.pending:
                    if not selector.select(remaining):raise SnapshotFailure('SNAPSHOT_QUERY_DEADLINE_EXPIRED')
                    chunk=os.read(self.process.stdout.fileno(),65536)
                    if not chunk:raise SnapshotFailure('SNAPSHOT_SESSION_LOST')
                    self.pending+=chunk
                    if len(self.pending)>8*1024*1024:raise SnapshotFailure('SNAPSHOT_METADATA_LIMIT_EXCEEDED')
                    remaining=deadline-time.monotonic()
                    if remaining<=0:raise SnapshotFailure('SNAPSHOT_QUERY_DEADLINE_EXPIRED')
                raw,self.pending=self.pending.split(b'\n',1)
                line=raw.decode().rstrip('\r')
                if line==marker:break
                total+=len(line)
                if total>8*1024*1024:raise SnapshotFailure('SNAPSHOT_METADATA_LIMIT_EXCEEDED')
                if line:result.append(line)
        self.guard();return result
    def close(self):
        if self.process:
            try:
                if self.process.poll() is None:self.process.stdin.write(b'rollback;\n\\q\n');self.process.stdin.flush()
                self.process.wait(timeout=5)
            except (BrokenPipeError,OSError,subprocess.TimeoutExpired):
                if self.process.poll() is None:self.process.kill();self.process.wait()
            finally:
                self.process.stdin.close();self.process.stdout.close()


class Exporter(PsqlSession):
    def __init__(self,argv,env=None,lifetime=600,role='postgres'):
        super().__init__(argv,env,lifetime);self.role=role;self.snapshot=None;self.imports=0;self.exportRecordedAt=None;self.transportProof=None
        if not re.fullmatch('[A-Za-z_][A-Za-z_0-9]{0,62}',role):raise SnapshotFailure('SNAPSHOT_ROLE_INVALID')
    def start(self):
        super().start()
        try:
            self.transportProof=json.loads(self.query("select jsonb_build_object('sessionUser',session_user,'ssl',(select ssl from pg_stat_ssl where pid=pg_backend_pid()));")[0])
            sql="begin isolation level repeatable read read only;set local role \""+self.role+"\";set local statement_timeout='10s';set local idle_in_transaction_session_timeout='"+str(int(self.lifetime*1000))+"ms';select pg_export_snapshot();select clock_timestamp();"
            lines=self.query(sql)
            if len(lines)!=2 or not re.fullmatch('[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+',lines[0]):raise SnapshotFailure('SNAPSHOT_ID_INVALID')
            self.snapshot=lines[0];self.exportRecordedAt=lines[1];return self
        except BaseException:self.close();raise
    def checkpoint(self):
        if self.query('select 1;')!=['1']:raise SnapshotFailure('SNAPSHOT_EXPORTER_UNAVAILABLE')
    def imported(self,sql):
        self.checkpoint()
        importer=PsqlSession(self.argv,self.env,min(30,self.lifetime-(time.monotonic()-self.started))).start()
        try:
            # No table query occurs before the import; connection/effective role
            # matches exporter. Import rejection is never retried with live data.
            prefix="begin isolation level repeatable read read only;set local role \""+self.role+"\";set transaction snapshot '"+self.snapshot+"';set local statement_timeout='10s';"
            result=importer.query(prefix+sql+'rollback;')
            self.imports+=1;self.checkpoint();return result
        finally:importer.close()
    def dump_argument(self):
        self.checkpoint();return '--snapshot='+self.snapshot


def seal_guarded(argv,env,recipient,archive,exporter,deadline_seconds=600,snapshot_required=True):
    """Same dump→age pipe; exporter loss/expiry cancels BOTH child processes."""
    import os
    producer=consumer=None;started=time.monotonic();probe_at=started
    try:
        exporter.checkpoint()
        if snapshot_required and (argv.count('--snapshot='+exporter.snapshot)!=1 or sum(a.startswith('--snapshot=') for a in argv)!=1):raise SnapshotFailure('SNAPSHOT_DUMP_ARGUMENT_REQUIRED')
        with os.fdopen(os.open(archive,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as sealed:
            producer=subprocess.Popen(argv,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            consumer=subprocess.Popen(['age','-r',recipient],stdin=producer.stdout,stdout=sealed,stderr=subprocess.DEVNULL)
            producer.stdout.close()
            while consumer.poll() is None:
                exporter.guard()
                if time.monotonic()-started>=deadline_seconds:raise SnapshotFailure('SNAPSHOT_DUMP_DEADLINE_EXPIRED')
                if time.monotonic()-probe_at>=1:
                    exporter.checkpoint();probe_at=time.monotonic()
                time.sleep(.02)
            if consumer.returncode or producer.wait(timeout=10):raise SnapshotFailure('SNAPSHOT_DUMP_OR_ENCRYPTION_FAILED')
            exporter.checkpoint();sealed.flush();os.fsync(sealed.fileno())
            exporter.imports+=1
    finally:
        for child in (consumer,producer):
            if child and child.poll() is None:child.kill();child.wait()
