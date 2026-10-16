"""Host-only START provenance; never an image/runtime dependency or resume API."""
import hashlib
import importlib.util
import os
from pathlib import Path
import sys
import threading
import weakref
from datetime import timedelta

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('start_deadline',HERE.parent/'diagnostic-window-deadline.py')
deadline=importlib.util.module_from_spec(spec);spec.loader.exec_module(deadline)
deadline=deadline.shared_runtime()

def shared_runtime():
    """One exact START registry for this source path/digest, no source fallback."""
    path=Path(__file__).resolve();digest=hashlib.sha256(path.read_bytes()).hexdigest()
    key='_qaw_start_provenance_'+hashlib.sha256(str(path).encode()).hexdigest()
    spec=importlib.util.spec_from_file_location(key,path)
    candidate=importlib.util.module_from_spec(spec)
    candidate._qaw_source_digest=digest;candidate._qaw_load_lock=threading.RLock();candidate._qaw_ready=False
    module=sys.modules.setdefault(key,candidate)
    if (getattr(getattr(module,'__spec__',None),'origin',None)!=str(path)
            or getattr(module,'_qaw_source_digest',None)!=digest):
        raise ValueError('START_PROVENANCE_SOURCE_IDENTITY_CONFLICT')
    with module._qaw_load_lock:
        if not module._qaw_ready:
            try:spec.loader.exec_module(module);module._qaw_ready=True
            except BaseException:
                if sys.modules.get(key) is module:del sys.modules[key]
                raise
    return module


_START_PROVENANCE=weakref.WeakKeyDictionary()
_START_PROVENANCE_LOCK=threading.RLock()


def new_start_budget():
    """Sample START here; never import caller-supplied historical clock values."""
    anchor=deadline.monotonic();instant=deadline.utc_now();end=instant+timedelta(seconds=3600)
    b=deadline.Budget(anchor+3600,clock=deadline.monotonic,wall_end=end,wall_clock=deadline.utc_now)
    with _START_PROVENANCE_LOCK:
        _START_PROVENANCE[b]=(os.getpid(),anchor,instant,end,b.clock,b.wall_clock)
    return b,anchor,instant


def verify_start_provenance(b):
    # Validate before any entry metadata reads, including on the first attempt.
    # Fork inherits the object/registry but never the creator PID.
    with _START_PROVENANCE_LOCK:origin=_START_PROVENANCE.get(b) if type(b) is deadline.Budget else None
    if origin is None:raise ValueError('DIRECTIVE_START_PROVENANCE_REQUIRED')
    pid,anchor,instant,end,clock,wall_clock=origin
    if pid!=os.getpid():raise ValueError('DIRECTIVE_START_CREATOR_PROCESS_CONFLICT')
    if (b.clock is not clock or b.wall_clock is not wall_clock or
            clock is not deadline.monotonic or wall_clock is not deadline.utc_now or
            b.window_end!=anchor+3600 or b.data_end!=anchor+3600-deadline.DATA_CLEANUP_RESERVE_SECONDS or
            b.wall_end!=end or b.reserve!=deadline.DATA_CLEANUP_RESERVE_SECONDS or
            b.cleanup_seconds!=deadline.CLEANUP_BUDGET_SECONDS):
        raise ValueError('DIRECTIVE_START_PROVENANCE_CONFLICT')
    b.check()
    return anchor,instant
