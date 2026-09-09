import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts/experiments/docling"))
from evaluate import location_matches, score


class ScoringBoundaryTests(unittest.TestCase):
    def test_correct_text_with_unrelated_position_fails_location_gate(self):
        expected = {"page": 1, "bbox": [0.1, 0.1, 0.4, 0.15]}
        field = {"raw_candidates": [{"sources": [{"page": 1, "bbox": [0.6, 0.6, 0.9, 0.65]}]}]}
        self.assertFalse(location_matches(field, expected))

    def test_whole_page_box_is_not_accepted_as_field_provenance(self):
        expected = {"page": 1, "bbox": [0.1, 0.1, 0.4, 0.15]}
        field = {"raw_candidates": [{"sources": [{"page": 1, "bbox": [0, 0, 1, 1]}]}]}
        self.assertFalse(location_matches(field, expected))
        field["raw_candidates"][0]["sources"][0]["bbox"] = [0.09, 0.09, 0.41, 0.16]
        self.assertTrue(location_matches(field, expected))

    def test_setup_probe_cannot_be_used_as_adoption_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "summary.json"
            path.write_text(json.dumps({"mode": "setup_probe", "records": []}))
            with self.assertRaisesRegex(ValueError, "setup probe"):
                score(path, Path(directory) / "absent-guards.json")


if __name__ == "__main__":
    unittest.main()
