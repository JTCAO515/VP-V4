import importlib.util
import hashlib
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
        self.assertEqual((len(plan['baselineVersions']),len(plan['expectedVersions']),len(plan['reviewedMissing'])),(75,162,87))
        self.assertEqual(plan['sourceHead'],'4abeeb41e87f2ac36f0efdb9ba94780ce0049a13')
        self.assertEqual(plan['mode'],h.CANDIDATE_MODE)
        self.assertTrue(plan['sourceMetadataMigrationHashesEqualPinnedHead'])
        self.assertEqual(plan['sourceMetadataEvidenceSha256'],'9428747d5e6506f98706716c0693b26ce794a6c503a018c62fdaa2a06912bb6e')
        self.assertEqual(plan['priorSourceMetadataEvidence']['coverage'],'old161 only; not complete162')
        self.assertTrue(plan['sourceMetadataCommon161HashesUnchanged'])
        self.assertEqual(plan['sourceSha256']['20261016040522_qa_runtime_binding.sql'],'a83928dacb9a7177c07b8d7f29bade5505414faa097fd072d90a2c6c77b2403c')
        for item in sources:
            if item['version'] in plan['reviewedMissing']:h.migration_transaction(item)
        self.assertFalse(plan['newWindowApproved']);self.assertEqual(plan['targetApplyAuthority'],'NONE')

    def test_legacy_manifest_remains_155_and_same_baseline(self):
        old,_=h.load_plan();new=json.loads(CANDIDATE.read_text())
        self.assertEqual(old['manifestSha256'],h.MANIFEST_HASH);self.assertEqual(old['mode'],h.MODE)
        self.assertEqual((len(old['expectedVersions']),len(old['reviewedMissing'])),(155,80))
        self.assertEqual(old['baselineVersions'],new['baselineVersions'])

    def test_wrong_source_count_or_target_only_reject_before_blob_reads(self):
        base=json.loads(CANDIDATE.read_text())
        for field,value in [('sourceHead','0'*40),('expectedCount',161),('missingCount',86),('targetOnlyVersions',['20261016050000']),('expectedVersions',base['expectedVersions'][:-1])]:
            with tempfile.TemporaryDirectory(dir=CANDIDATE.parent,prefix='candidate-shape-test-') as tmp:
                p=Path(tmp)/'candidate.json';changed={**base,field:value};p.write_text(json.dumps(changed))
                # Test-only re-pin makes the internal contract (not just bytes)
                # independently reject an invalid future candidate.
                with self.subTest(field=field),patch.object(h,'CANDIDATE_MANIFEST_HASH',hashlib.sha256(p.read_bytes()).hexdigest()),patch.object(h,'git_read',side_effect=AssertionError('NO BLOB READ')):
                    with self.assertRaises(ValueError):h.load_plan(p)

    def test_candidate_mutation_and_source_drift_reject(self):
        with tempfile.TemporaryDirectory(dir=CANDIDATE.parent,prefix='candidate-pin-test-') as tmp:
            p=Path(tmp)/'changed.json';p.write_bytes(CANDIDATE.read_bytes()+b' ')
            with patch.object(h,'git_read',side_effect=AssertionError('NO SOURCE LOAD')):
                with self.assertRaisesRegex(ValueError,'REPLAY_MANIFEST_DRIFT'):h.load_plan(p)
        with patch.object(h,'git_read',return_value=b'changed sql'):
            with self.assertRaisesRegex(ValueError,'REPLAY_SOURCE_HASH_DRIFT'):h.load_plan(CANDIDATE)


if __name__=='__main__':unittest.main(verbosity=2)
