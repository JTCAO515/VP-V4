"""Explicit library opt-in around the unchanged original window authority gate.
No CLI, environment switch, new approval, claim reset or private-record writer.
"""
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace


def reviewed_code_hash(core,configuration):
    # Approval binds the exact opt-in/source-lock/window binding as well as
    # original core qualification. An old ordinary-mode packet cannot match.
    if type(configuration) is not dict or set(configuration)!={'mode','sourceLockSha256','windowBindingSha256'} or configuration.get('mode')!='same-copy-typed-postdata/1':
        raise ValueError('TYPED_EXPLICIT_CONFIGURATION_REQUIRED')
    return hashlib.sha256(core.code_hash().encode()+Path(__file__).read_bytes()+json.dumps(configuration,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def run(core,args,configuration):
    core.diagnostic_window.require_configured() # before private metadata or IO
    config=json.loads(json.dumps(configuration))
    fixed_hash=reviewed_code_hash(core,config)
    def code_hash():
        if reviewed_code_hash(core,config)!=fixed_hash:raise ValueError('TYPED_REVIEWED_SOURCE_CHANGED')
        return fixed_hash
    def restore(*values,**options):
        if 'typed_diagnostic' in options:raise ValueError('TYPED_MODE_OVERRIDE_FORBIDDEN')
        b=options.get('window_budget')
        if type(b) is not core.diagnostic_deadline.Budget:raise ValueError('TYPED_ORIGINAL_ABSOLUTE_BUDGET_REQUIRED')
        b.check();code_hash()
        return core.restore_bundle(*values,**options,typed_diagnostic=config)
    facade=SimpleNamespace(code_hash=code_hash,base=core.base,locale_profile=core.locale_profile,
        verify_manifest=core.verify_manifest,replay=core.replay,restore_bundle=restore,diagnostic_deadline=core.diagnostic_deadline)
    return core.diagnostic_window.run(facade,args)
