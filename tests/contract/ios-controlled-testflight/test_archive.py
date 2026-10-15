"""Controlled sample build contract negatives; no Xcode account or network access."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("controlled_archive", ROOT / "scripts/ios/controlled-testflight/archive.py")
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


class ControlledArchiveTests(unittest.TestCase):
    def setUp(self):
        self.profile = driver.load_profile(driver.PROFILE)

    def test_backend_profile_negatives(self):
        driver.EVIDENCE_ROOT.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=driver.EVIDENCE_ROOT) as folder:
            path = Path(folder) / "profile.json"
            for key in driver.checks.PROFILE_BUILD_SETTINGS:
                for value in ("staging", "https://staging.go2china.space", None, " "):
                    profile = copy.deepcopy(self.profile)
                    profile["buildSettings"][key] = value
                    path.write_text(json.dumps(profile))
                    with self.subTest(key=key, value=value), self.assertRaises(driver.Refusal):
                        driver.load_profile(path)

    def test_flag_and_identity_negatives(self):
        with tempfile.TemporaryDirectory(dir=driver.EVIDENCE_ROOT) as folder:
            path = Path(folder) / "profile.json"
            for key, values in {"compilationConditions": [[], ["DEBUG"], ["VP_CONTROLLED_SAMPLE", "DEBUG"]],
                                "bundleIdentifier": ["other.app"], "marketingVersion": ["1.0"],
                                "minimumOSVersion": ["16.0"]}.items():
                for value in values:
                    profile = copy.deepcopy(self.profile)
                    profile[key] = value
                    path.write_text(json.dumps(profile))
                    with self.subTest(key=key, value=value), self.assertRaises(driver.Refusal):
                        driver.load_profile(path)

    def test_exact_head_and_dirty_source_refused_before_outputs(self):
        head = "a" * 40
        with patch.object(driver, "run", side_effect=[head + "\n", " M ios/VisePanda/file.swift\n"]):
            with self.assertRaisesRegex(driver.Refusal, "Dirty source"):
                driver.source_snapshot(head)
        with patch.object(driver, "run", return_value=head):
            with self.assertRaisesRegex(driver.Refusal, "HEAD"):
                driver.source_snapshot("b" * 40)

    def test_effective_settings_refuse_nonempty_backend_or_missing_flag(self):
        values = {**self.profile["buildSettings"], "SWIFT_ACTIVE_COMPILATION_CONDITIONS": "VP_CONTROLLED_SAMPLE",
                  "CODE_SIGNING_ALLOWED": "NO", "CURRENT_PROJECT_VERSION": "20261015.120000",
                  "CONFIGURATION": "Release", "PLATFORM_NAME": "iphoneos", "IPHONEOS_DEPLOYMENT_TARGET": "17.0",
                  "PRODUCT_BUNDLE_IDENTIFIER": self.profile["bundleIdentifier"], "MARKETING_VERSION": "0.1.0"}
        entries = [{"target": name, "buildSettings": dict(values)} for name in ("VisePanda", "ShareIntakeExtension")]
        driver.verify_settings(entries, self.profile, "20261015.120000")
        for key, bad in [("SWIFT_ACTIVE_COMPILATION_CONDITIONS", ""), ("CODE_SIGNING_ALLOWED", "YES"),
                         *( (key, "staging") for key in driver.checks.PROFILE_BUILD_SETTINGS)]:
            changed = copy.deepcopy(entries)
            changed[0]["buildSettings"][key] = bad
            with self.subTest(key=key), self.assertRaises(driver.Refusal):
                driver.verify_settings(changed, self.profile, "20261015.120000")
        with self.assertRaisesRegex(driver.Refusal, "omit"):
            driver.verify_settings(entries[:1], self.profile, "20261015.120000")

    def test_fresh_isolated_output_required(self):
        with tempfile.TemporaryDirectory(dir=driver.EVIDENCE_ROOT) as folder:
            base = Path(folder)
            for evidence, products in [(base, base / "products"), (base / "e", base / "e/p"),
                                       (base / "same", base / "same"), (ROOT / "outside", base / "p")]:
                with self.subTest(evidence=evidence), self.assertRaises(driver.Refusal):
                    driver.fresh_paths(evidence, products)
            driver.fresh_paths(base / "evidence", base / "products")

    def test_no_credentials_or_injected_build_environment(self):
        with patch.dict(driver.os.environ, {"VP_NATIVE_ENVIRONMENT": "staging", "VP_ASC_KEY_ID": "fixture",
                                           "XCODE_XCCONFIG_FILE": "unapproved.xcconfig"}, clear=True):
            self.assertEqual(driver.build_environment(), {})

    def test_build_number_validation(self):
        for value in ("abc", "1.2.3.4", "1\n", ""):
            with self.subTest(value=value), self.assertRaises(driver.Refusal):
                driver.checks.validate_build_number(value)


if __name__ == "__main__":
    driver.EVIDENCE_ROOT.mkdir(parents=True, exist_ok=True)
    unittest.main()
