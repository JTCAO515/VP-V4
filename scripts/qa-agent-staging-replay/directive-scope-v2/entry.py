"""Explicit v1 directive entry. No runtime patching of legacy globals/validators."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('directive_v2_profile',HERE/'profile.py');profile=importlib.util.module_from_spec(spec);spec.loader.exec_module(profile)

def new_start_budget():
    profile.require_binding();profile.verify_sources()
    return profile.provenance.new_start_budget()


def qualified_hash(core,configuration,source_profile):
    profile.require_configured(source_profile,core.diagnostic_window.ROOT,core.diagnostic_window.PRESERVED_KEYS)
    return profile.qualified_code_hash(core.code_hash(),configuration,source_profile)


def run(core,args,configuration,source_profile,start_budget=None):
    profile.require_binding()
    if 'DOCKER_HOST' in os.environ or 'DOCKER_CONTEXT' in os.environ:raise ValueError('DOCKER_OVERRIDE_REJECTED')
    if type(start_budget) is not core.diagnostic_deadline.Budget:raise ValueError('DIRECTIVE_START_BUDGET_REQUIRED')
    profile.provenance.verify_start_provenance(start_budget)
    config=json.loads(json.dumps(configuration));binding=json.loads(json.dumps(source_profile))
    fixed=qualified_hash(core,config,binding)
    # The gate itself owns the single mandatory run preflight.
    def code_hash():
        if qualified_hash(core,config,binding)!=fixed:raise ValueError('DIRECTIVE_QUALIFIED_SOURCE_CHANGED')
        return fixed
    def restore(*values,**options):
        if 'typed_diagnostic' in options:raise ValueError('DIRECTIVE_MODE_OVERRIDE_FORBIDDEN')
        b=options.get('window_budget')
        if type(b) is not core.diagnostic_deadline.Budget:raise ValueError('DIRECTIVE_ORIGINAL_BUDGET_REQUIRED')
        b.check();code_hash()
        return core.restore_bundle(*values,**options,typed_diagnostic=config)
    facade=SimpleNamespace(code_hash=code_hash,base=core.base,locale_profile=core.locale_profile,verify_manifest=core.verify_manifest,replay=core.replay,restore_bundle=restore,diagnostic_deadline=core.diagnostic_deadline,directiveSourceFingerprint=profile.fingerprint(binding),directiveBaseCodeHash=core.code_hash(),directiveTypedConfiguration=config,directiveStartBudget=start_budget)
    return core.diagnostic_window.run(facade,args,source_profile=binding)
