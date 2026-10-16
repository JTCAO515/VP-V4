"""Actual Plan source qualification with synthetic Docker replies; no PG/private IO."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

entry=load('qualification_entry',HERE/'entry.py')
bridge=load('qualification_bridge',ROOT/'container-diagnostic/restore/bridge.py')

class RuntimeQualification(unittest.TestCase):
    def config(self,root=ROOT):
        return {'mode':bridge.MODE,'sourceLockSha256':hashlib.sha256((root/'container-diagnostic/restore/source-lock.json').read_bytes()).hexdigest(),'windowBindingSha256':'1'*64}

    def test_actual_plan_accepts_frozen_repo_inputs_without_pg(self):
        pins=json.loads((bridge.HERE/'runtime-pins.json').read_text())
        budget,_,_=entry.new_start_budget()
        replies=[b'fixture',json.dumps([{'Endpoints':{'docker':{'Host':'unix:///fixture-only'}}}]).encode(),json.dumps([{'Id':pins['imageId'],'Architecture':'arm64','Config':{}}]).encode()]
        with patch.object(bridge,'_run',side_effect=replies) as run:
            plan=bridge.Plan(self.config(),budget)
        self.assertEqual(run.call_count,3)
        self.assertFalse(bridge._plan(plan)['created'])
        self.assertIs(bridge._plan(plan)['budget'],budget)

    def test_source_lock_refresh_cannot_hide_runtime_input_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in bridge.SOURCE_FILES:
                target=root/name;target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes((ROOT/name).read_bytes())
            changed=root/'diagnostic-window-deadline.py'
            changed.write_bytes(changed.read_bytes()+b'\n# synthetic drift\n')
            here=root/'container-diagnostic/restore'
            (here/'source-lock.json').write_text(json.dumps({name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in bridge.SOURCE_FILES}))
            budget,_,_=entry.new_start_budget()
            with patch.object(bridge,'ROOT',root),patch.object(bridge,'HERE',here),patch.object(bridge,'_run') as run:
                with self.assertRaisesRegex(ValueError,'TYPED_IMAGE_SOURCE_CHANGED'):
                    bridge.Plan(self.config(root),budget)
                run.assert_not_called()

    def test_host_module_is_locked_and_mutation_rejected(self):
        profile=entry.profile
        lock=json.loads((HERE/'source-lock.json').read_text())
        self.assertIn('directive-scope-v1/start-provenance.py',lock)
        binding={'profileLockSha256':hashlib.sha256((HERE/'source-lock.json').read_bytes()).hexdigest(),'sourceLockSha256':self.config()['sourceLockSha256']}
        profile.verify_locks(binding)
        original=Path.read_bytes;target=HERE/'start-provenance.py'
        def read(path):return original(path)+(b'\n# synthetic drift\n' if path==target else b'')
        with patch.object(Path,'read_bytes',read):
            with self.assertRaisesRegex(ValueError,'DIRECTIVE_PROFILE_SOURCE_CHANGED'):
                profile.verify_locks(binding)

    def test_entry_and_direct_gate_share_host_provenance(self):
        profile=load('qualification_other_profile',HERE/'profile.py')
        self.assertIs(profile.provenance,entry.profile.provenance)
        budget,anchor,instant=entry.new_start_budget()
        self.assertEqual(profile.provenance.verify_start_provenance(budget),(anchor,instant))
        self.assertIs(profile.provenance.deadline,bridge.deadline)

if __name__=='__main__':unittest.main(verbosity=2)
