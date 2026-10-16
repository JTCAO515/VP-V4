import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('hook',HERE/'owned-replay-hook.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
CANDIDATE=HERE.parents[1]/'artifacts/QAWEB/staging-replay/candidate-replay-manifest-20261016.json'


class Candidate(unittest.TestCase):
    def test_exact_current_source_hashes_versions_and_transactions(self):
        plan,sources=h.load_plan(CANDIDATE)
        self.assertEqual((len(plan['baselineVersions']),len(plan['expectedVersions']),len(plan['reviewedMissing'])),(75,161,86))
        self.assertEqual(plan['sourceHead'],'3d99a8af1805d714b71dce959b0811da468c24ea')
        self.assertEqual(plan['mode'],h.CANDIDATE_MODE)
        for item in sources:
            if item['version'] in plan['reviewedMissing']:h.migration_transaction(item)
        self.assertFalse(plan['newWindowApproved']);self.assertEqual(plan['targetApplyAuthority'],'NONE')

    def test_legacy_manifest_remains_155_and_same_baseline(self):
        old,_=h.load_plan();new=json.loads(CANDIDATE.read_text())
        self.assertEqual(old['manifestSha256'],h.MANIFEST_HASH);self.assertEqual(old['mode'],h.MODE)
        self.assertEqual((len(old['expectedVersions']),len(old['reviewedMissing'])),(155,80))
        self.assertEqual(old['baselineVersions'],new['baselineVersions'])

    def test_candidate_mutation_and_source_drift_reject(self):
        with tempfile.TemporaryDirectory(dir=CANDIDATE.parent,prefix='candidate-pin-test-') as tmp:
            p=Path(tmp)/'changed.json';p.write_bytes(CANDIDATE.read_bytes()+b' ')
            with patch.object(h,'git_read',side_effect=AssertionError('NO SOURCE LOAD')):
                with self.assertRaisesRegex(ValueError,'REPLAY_MANIFEST_DRIFT'):h.load_plan(p)
        with patch.object(h,'git_read',return_value=b'changed sql'):
            with self.assertRaisesRegex(ValueError,'REPLAY_SOURCE_HASH_DRIFT'):h.load_plan(CANDIDATE)


if __name__=='__main__':unittest.main(verbosity=2)
