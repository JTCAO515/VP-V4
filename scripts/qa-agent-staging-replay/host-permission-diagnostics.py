"""Bounded host-only client hints, never PostgreSQL error facts or SQL output."""
import importlib.util
import os
from pathlib import Path
import select
import threading

spec=importlib.util.spec_from_file_location('permission_client_hints',Path(__file__).with_name('safe-restore-diagnostics.py'))
hints=importlib.util.module_from_spec(spec);spec.loader.exec_module(hints)
LIMIT=65536
CLIENT_ERROR_CATEGORIES=frozenset({'RESTORE_PERMISSION_DENIED','RESTORE_PARAMETER_UNSUPPORTED','RESTORE_OBJECT_EXISTS','RESTORE_OBJECT_MISSING','RESTORE_ARCHIVE_VERSION_UNSUPPORTED'})


def summarize(raw,complete,overflow,first_error,client_failed=True):
    typed=isinstance(first_error,dict) and first_error.get('provenance')=='PG_BACKEND_ERROR_RESPONSE_C_FIELD_ALLOWLIST'
    result={'version':'host-permission-hints/2',
            'typedPermissionClass':'INSUFFICIENT_PRIVILEGE' if typed and first_error.get('sqlstate')=='42501' else 'UNKNOWN',
            'failurePrivilegeContext':'UNKNOWN_NOT_OBSERVED_AT_FAILURE',
            'commandClass':'UNKNOWN_NOT_OBSERVED',
            'clientHintProvenance':'STDERR_ONLY_UNSTRUCTURED_HINTS_NOT_PG_ERROR_FACTS',
            'clientHintsCorrelatedToTypedError':False,
            'clientHintStatus':'UNKNOWN_INCOMPLETE','clientFrameClass':'NOT_PARSED','clientErrorCategory':'UNKNOWN','objectClass':None,'permissionObjectClass':None,'tocEntryId':None}
    if not client_failed:result['clientHintStatus']='NOT_FAILED_NO_CLIENT_HINT';return result
    if overflow:result['clientHintStatus']='UNKNOWN_TRUNCATED';return result
    if not complete:return result
    if len(raw)>LIMIT:result['clientHintStatus']='UNKNOWN_TRUNCATED';return result
    result['clientHintStatus']='UNKNOWN_FRAME'
    if not raw:result['clientFrameClass']='EMPTY';return result
    try:text=raw.decode('utf-8')
    except UnicodeDecodeError:result['clientFrameClass']='INVALID_ENCODING';return result
    message,_,_=hints.error_frame(text)
    if message is None:result['clientFrameClass']='REJECTED';return result
    parsed=hints.diagnostic(raw,['--section=post-data'])
    has_toc=parsed['tocEntryId'] is not None
    result['clientFrameClass']='VALID_ERROR_WITH_TOC' if has_toc else 'VALID_ERROR_WITHOUT_TOC'
    category=parsed['category'] if parsed['category'] in CLIENT_ERROR_CATEGORIES else 'UNKNOWN'
    result['clientErrorCategory']=category
    # A TOC-free but wholly validated client error can carry a finite hint.
    # This never identifies a command/object or correlates it to the typed .C.
    if not has_toc and category=='UNKNOWN':
        result['clientHintStatus']='UNKNOWN_ERROR_CLASS_NO_TOC';return result
    result.update(clientHintStatus='CLIENT_FRAME_HINT_AVAILABLE' if has_toc else 'CLIENT_FRAME_HINT_AVAILABLE_NO_TOC',objectClass=parsed['objectClass'],
                  permissionObjectClass=parsed['permissionObjectClass'],tocEntryId=parsed['tocEntryId'])
    return result


class BoundedStderr:
    """Drain a pipe without disk spill or unbounded retention; stop is bounded."""
    def __init__(self,stream):
        self.stream=stream;self.raw=bytearray();self.overflow=False;self.complete=False
        self.stop=threading.Event();self.thread=threading.Thread(target=self._read,daemon=True)
        self.thread.start()
    def _read(self):
        try:
            fd=self.stream.fileno();os.set_blocking(fd,False)
            while not self.stop.is_set():
                ready,_,_=select.select([fd],[],[],.05)
                if not ready:continue
                try:part=os.read(fd,4096)
                except BlockingIOError:continue
                if not part:self.complete=True;return
                left=LIMIT-len(self.raw)
                self.raw.extend(part[:left])
                if len(part)>left:self.overflow=True
        except Exception:self.complete=False
    def finish(self,first_error,client_failed=True):
        # Producer has stopped before this call. Give an EOF-ready reader one
        # bounded observation slice, then stop even if an inherited fd remains.
        self.thread.join(.1);self.stop.set();self.thread.join(.1)
        try:
            if self.thread.is_alive():return summarize(b'',False,False,first_error,client_failed)
            return summarize(bytes(self.raw),self.complete,self.overflow,first_error,client_failed)
        finally:
            if not self.thread.is_alive():self.raw.clear();self.stream.close()
