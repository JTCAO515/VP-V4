"""QA177 source composition only; no daemon or private authorization inputs."""
from datetime import datetime,timezone,timedelta
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import time
import unittest
from unittest.mock import patch
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
core=load('qa_core',ROOT/'controlled-snapshot-restore.py');bridge=load('qa_bridge',HERE/'bridge.py');entry=load('qa_entry',HERE/'reviewed_entry.py')
def config():return {'mode':bridge.MODE,'sourceLockSha256':hashlib.sha256((HERE/'source-lock.json').read_bytes()).hexdigest(),'windowBindingSha256':'1'*64}
def budget():return core.diagnostic_deadline.Budget(time.monotonic()+180,wall_end=datetime.now(timezone.utc)+timedelta(seconds=180))

class QaGateCompatibility(unittest.TestCase):
    def test_upstream_gate_byte_pin_is_exact_qa177(self):
        self.assertEqual(hashlib.sha256((ROOT/'reviewed-diagnostic-window.py').read_bytes()).hexdigest(),'b284ab78f64e3dd4d80a2c322489e1a235d4794c690630c2ba81e381b6ba5141')
    def test_every_override_presence_rejects_before_any_gate_or_claim(self):
        for key in ('DOCKER_HOST','DOCKER_CONTEXT'):
            for value in ('','SYNTHETIC_OVERRIDE_NOT_CONTACTED'):
                with self.subTest(key=key,value=value),patch.dict(os.environ,{key:value}),patch.object(core.diagnostic_window,'require_configured') as configured,patch.object(core.diagnostic_window,'run') as gate,patch.object(core.diagnostic_window,'read_private') as reads,patch.object(core.diagnostic_window,'claim') as claim,patch.object(Path,'read_bytes') as content:
                    with self.assertRaisesRegex(ValueError,'^DOCKER_OVERRIDE_REJECTED$'):entry.run(core,['NEVER_READ']*4,config.__name__)
                    configured.assert_not_called();gate.assert_not_called();reads.assert_not_called();claim.assert_not_called();content.assert_not_called()
    def test_no_override_preserves_unconfigured_before_input_rejection(self):
        with patch.dict(os.environ):
            os.environ.pop('DOCKER_HOST',None);os.environ.pop('DOCKER_CONTEXT',None)
            with patch.object(core.diagnostic_window,'HUMAN_SHA256',None),patch.object(core.diagnostic_window,'read_private') as reads,patch.object(core.diagnostic_window,'claim') as claim:
                with self.assertRaisesRegex(ValueError,'NEW_DIAGNOSTIC_HUMAN_PINS_UNCONFIGURED'):entry.run(core,['NEVER_READ']*4,config())
                reads.assert_not_called();claim.assert_not_called()
    def test_rebound_sources_pass_with_only_fake_runtime_preflight(self):
        pins=json.loads((HERE/'runtime-pins.json').read_text());b=budget()
        def fake(r,args,*a,**kw):
            if args[-2:]==['context','show']:return b'synthetic-context\n'
            if 'context' in args:return b'[{"Endpoints":{"docker":{"Host":"unix:///synthetic-only"}}}]'
            return json.dumps([{'Id':pins['imageId'],'Architecture':'arm64','Config':{'Volumes':None}}]).encode()
        with patch.object(bridge,'_run',side_effect=fake) as calls:
            plan=bridge.Plan(config(),b)
            self.assertIs(bridge._plan(plan)['budget'],b);self.assertEqual(calls.call_count,3)
    def test_original_gate_receives_scoped_hash_and_original_budget(self):
        c=config();b=budget();original=core.code_hash()
        def gate(facade,args):
            self.assertNotEqual(facade.code_hash(),original)
            return facade.restore_bundle('synthetic','synthetic',{},window_budget=b)
        with patch.object(core.diagnostic_window,'require_configured'),patch.object(core.diagnostic_window,'run',side_effect=gate) as gate_call,patch.object(core,'restore_bundle',return_value={'safe':True}) as restore:
            self.assertEqual(entry.run(core,[],c),{'safe':True});gate_call.assert_called_once()
            self.assertIs(restore.call_args.kwargs['window_budget'],b);self.assertEqual(restore.call_args.kwargs['typed_diagnostic'],c)
    def test_old_lock_configuration_is_not_accepted(self):
        c=config();c['sourceLockSha256']='7e54cf13d678ea98ac81fa99316c3b850b269f6430a091cf3cb0a2c657b9f421'
        with patch.object(bridge,'_run') as io:
            with self.assertRaisesRegex(ValueError,'TYPED_SOURCE_LOCK_CONFLICT'):bridge.Plan(c,budget())
            io.assert_not_called()

if __name__=='__main__':unittest.main(verbosity=2)
