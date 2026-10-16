"""Non-activated host library. No CLI bootstrap, source execution or resume API.
A reviewed operator binds exact paths/configuration in the original START process.
Only the original strict entry may invoke a copy. stdin never supplies paths/code.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import stat
from types import SimpleNamespace

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('live_controller_entry',HERE/'entry.py')
entry=importlib.util.module_from_spec(spec);spec.loader.exec_module(entry)
REPAIR_FILES=('host-permission-diagnostics.py','container-diagnostic/restore/bridge.py')
MAX_COMMAND=1024
MAX_DESCRIPTOR=32768


def require(ok):
    if not ok:raise ValueError('CONTROLLER_INELIGIBLE')

def digest(raw):return hashlib.sha256(raw).hexdigest()
def clone(value):return json.loads(json.dumps(value))
def hash_value(value):return type(value) is str and re.fullmatch('[0-9a-f]{64}',value) is not None


class Controller:
    def __init__(self,core,budget,header,args,configuration,source_profile,repair_packet,repair_start,repair_descriptor):
        # Budget already exists from controlled START in this process. Never
        # deserialize a Budget, sample another START or register a new window.
        self._entry=entry
        selected_folder={'jt-next-bounded-scope/v2':'directive-scope-v2','jt-delegated-bestj-20261017/v1':'delegated-scope-v1'}.get(source_profile.get('version')) if isinstance(source_profile,dict) else None
        if selected_folder is not None:
            spec=importlib.util.spec_from_file_location('controller_scope_v2_entry',HERE.parent/selected_folder/'entry.py')
            selected=importlib.util.module_from_spec(spec);spec.loader.exec_module(selected)
            selected.profile.require_binding();self._entry=selected
        self._entry.profile.provenance.verify_start_provenance(budget)
        facade=SimpleNamespace(diagnostic_deadline=core.diagnostic_deadline,directiveStartBudget=budget,base=core.base)
        self._entry.profile.start_budget(facade,header)
        require(header.get('attempt')==1 and len(args)==4)
        self._core=core;self._budget=budget;self._original=budget;self._pid=os.getpid()
        self._window=header['windowId'];self._args=tuple(map(str,args))
        self._configuration=clone(configuration);self._profile=clone(source_profile)
        require(configuration['windowBindingSha256']==source_profile['windowBindingSha256'])
        self._root=HERE.parent
        self._repair_packet=str(repair_packet);self._repair_start=str(repair_start)
        self._descriptor=Path(repair_descriptor)
        # Only prebound metadata paths under the original operator metadata root.
        metadata_root=Path(args[0]).parent
        require(all(Path(p).parent==metadata_root and Path(p).is_absolute() for p in (repair_packet,repair_start,repair_descriptor)))
        require(len({str(args[0]),self._repair_packet,self._repair_start,str(self._descriptor)})==4)
        self._core_hash=core.code_hash()
        self._fixed={name:digest((HERE/name).read_bytes()) for name in ('entry.py','profile.py','start-provenance.py','live-controller.py')}
        self._selected_folder=selected_folder
        self._v2_fixed={name:digest((HERE.parent/self._selected_folder/name).read_bytes()) for name in ('entry.py','profile.py','bootstrap.py','pending-binding.json')} if self._entry is not entry else {}
        self._repair_original={name:digest((self._root/name).read_bytes()) for name in REPAIR_FILES}
        lock=json.loads((self._root/'container-diagnostic/restore/source-lock.json').read_text())
        require(type(lock) is dict and all(type(name) is str and not Path(name).is_absolute() and '..' not in Path(name).parts for name in lock))
        self._lock_names=set(lock)
        self._frozen_inputs={name:digest((self._root/name).read_bytes()) for name in lock if name not in REPAIR_FILES}
        self.state='READY';self.invocations=0;self.cleanup='NOT_REQUIRED';self.last_outcome='NOT_RUN'
    def _check(self):
        require(os.getpid()==self._pid and self._budget is self._original)
        self._entry.profile.provenance.verify_start_provenance(self._budget)
        require(self._core.code_hash()==self._core_hash)
        require(all(digest((HERE/name).read_bytes())==value for name,value in self._fixed.items()))
        require(all(digest((HERE.parent/self._selected_folder/name).read_bytes())==value for name,value in self._v2_fixed.items()))
        require(all(digest((self._root/name).read_bytes())==value for name,value in self._frozen_inputs.items()))
    def snapshot(self):
        # No paths, error details, caller-provided strings or raw entry results.
        return {'version':'live-controller/1','state':self.state,'entryInvocations':self.invocations,'controllerCleanup':self.cleanup,'lastEntryOutcome':self.last_outcome}
    def _close(self,state):
        self.state=state
        if os.getpid()!=self._pid or self._budget is not self._original:
            self.cleanup='UNKNOWN_OWNER';return self.snapshot()
        try:self.cleanup='PASS' if self._budget.cleanup_all() else 'UNKNOWN'
        except BaseException:self.cleanup='UNKNOWN'
        if self.cleanup!='PASS':self.state='CLOSED_UNKNOWN'
        return self.snapshot()
    def _repair(self,expected):
        require(hash_value(expected))
        fd=os.open(self._descriptor,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(fd,'rb') as stream:
            st=os.fstat(stream.fileno())
            require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and st.st_size<=MAX_DESCRIPTOR)
            raw=stream.read(MAX_DESCRIPTOR+1)
        require(len(raw)<=MAX_DESCRIPTOR and digest(raw)==expected)
        value=json.loads(raw)
        require(type(value) is dict and set(value)=={'configuration','sourceProfile','sourceSha256'})
        cfg=value['configuration'];profile=value['sourceProfile'];pins=value['sourceSha256']
        require(type(pins) is dict and set(pins)==set(REPAIR_FILES))
        require(all(hash_value(pin) and digest((self._root/name).read_bytes())==pin for name,pin in pins.items()))
        require(pins!=self._repair_original)
        lock=json.loads((self._root/'container-diagnostic/restore/source-lock.json').read_text())
        require(set(lock)==self._lock_names and all(lock[name]==pin for name,pin in pins.items()) and all(lock[name]==pin for name,pin in self._frozen_inputs.items()))
        # Scope, authority, human record and window are unchanged. Only reviewed
        # source locks and the prebound attempt2 START metadata location differ.
        require(set(profile)==set(self._profile))
        for key in self._profile:
            if key not in ('sourceLockSha256','profileLockSha256','startFile'):
                require(profile[key]==self._profile[key])
        require(profile['startFile']==self._repair_start)
        require(type(cfg) is dict and set(cfg)==set(self._configuration))
        require(cfg['mode']==self._configuration['mode'] and cfg['windowBindingSha256']==self._configuration['windowBindingSha256'])
        # No causal/cleanup/approval booleans accepted or synthesized here.
        # The strict entry re-reads packet, review, failed result, used marker,
        # source locks, window, original Budget, and all remaining gates.
        return [self._repair_packet,*self._args[1:]],cfg,profile
    def _invoke(self,args,config,profile):
        self._check();self.invocations+=1;self.state='RUNNING'
        try:
            result=self._entry.run(self._core,args,config,profile,start_budget=self._budget)
        except BaseException:
            return self._close('REFUSED_OR_INTERRUPTED')
        claim=result.get('diagnosticWindowClaim') if isinstance(result,dict) else None
        if not isinstance(claim,dict) or claim.get('windowId')!=self._window or claim.get('attempt')!=self.invocations:
            return self._close('CLOSED_UNKNOWN')
        if result.get('cleanup')!='PASS':return self._close('CLOSED_UNKNOWN')
        status=result.get('status')
        if not isinstance(status,str) or not status.startswith(('PASS_','FAIL_')):return self._close('CLOSED_UNKNOWN')
        self.last_outcome='FAIL' if status.startswith('FAIL_') else 'PASS'
        if self.invocations==1 and self.last_outcome=='FAIL':
            self.state='HOLD';return self.snapshot()
        return self._close('COMPLETE')
    def handle(self,command):
        if self.state not in ('READY','HOLD'):return self.snapshot()
        try:
            self._check()
            require(type(command) is dict and type(command.get('action')) is str)
            action=command['action']
            if action=='status' and set(command)=={'action'}:return self.snapshot()
            if action=='abort' and set(command)=={'action'}:return self._close('ABORTED')
            if action=='run_first' and set(command)=={'action'} and self.state=='READY' and self.invocations==0:
                require(all(digest((self._root/name).read_bytes())==pin for name,pin in self._repair_original.items()))
                return self._invoke(self._args,self._configuration,self._profile)
            if action=='repair' and set(command)=={'action','sha256'} and self.state=='HOLD' and self.invocations==1:
                args,cfg,profile=self._repair(command['sha256']);self._check()
                return self._invoke(args,cfg,profile)
            raise ValueError('CONTROLLER_COMMAND_REJECTED')
        except self._core.diagnostic_deadline.WindowExpired:return self._close('EXPIRED')
        except BaseException:return self._close('REFUSED_OR_INTERRUPTED')
    def tick(self):return self.handle({'action':'status'})


def serve(controller,input_fd,output):
    """A normal long-lived exec process; subsequent tool writes reuse its stdin.
    Waits consume the original deadline. EOF/interrupt/oversize close, never resume.
    """
    pending=bytearray()
    def emit(value):output.write(json.dumps(value)+'\n');output.flush()
    emit(controller.snapshot())
    try:
        while controller.state in ('READY','HOLD'):
            state=controller.tick()
            if controller.state not in ('READY','HOLD'):emit(state);break
            ready,_,_=select.select([input_fd],[],[],.1)
            if not ready:continue
            part=os.read(input_fd,MAX_COMMAND+1)
            if not part:emit(controller._close('EOF_CLOSED'));break
            pending.extend(part)
            if len(pending)>MAX_COMMAND:emit(controller._close('REFUSED_OR_INTERRUPTED'));break
            while b'\n' in pending and controller.state in ('READY','HOLD'):
                line,_,rest=pending.partition(b'\n');pending=bytearray(rest)
                try:command=json.loads(line)
                except Exception:emit(controller._close('REFUSED_OR_INTERRUPTED'));break
                emit(controller.handle(command))
    except BaseException:emit(controller._close('REFUSED_OR_INTERRUPTED'))
    finally:
        pending.clear()
        if controller.state in ('READY','HOLD','RUNNING'):controller._close('REFUSED_OR_INTERRUPTED')

if __name__=='__main__':raise SystemExit('CANDIDATE_LIBRARY_ONLY_NO_OPERATOR_CONFIGURATION')
