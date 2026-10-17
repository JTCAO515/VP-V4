"""Local policy/result checks. No simulator, network, credentials or real canary."""
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("nativeqa_acceptance_driver", HERE / "driver.py")
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
NOW = datetime(2026, 10, 17, 0, 0, tzinfo=timezone.utc)


def candidate():
    return {"run_id": "00000000-0000-4000-8000-000000000005", "bundle_identifier": "space.go2china.VisePanda", "question_utf8_sha256": "b" * 64, "schema": "ios-nativeqa-canary/1", "product_revision": driver.PRODUCT_REVISION,
            "project_ref": driver.PROJECT_REF, "native_environment": "staging",
            "origin": "https://vp-v4-syntheticonly-jtcao515s-projects.vercel.app",
            "actor_subject": "00000000-0000-4000-8000-000000000001", "policy_id": "00000000-0000-4000-8000-000000000002",
            "notice_hash": "a" * 64, "budget_scope_id": "00000000-0000-4000-8000-000000000003",
            "maximum_questions": 1, "maximum_cost_micros": 1000,
            "not_before": (NOW - timedelta(minutes=1)).isoformat(), "expires_at": (NOW + timedelta(minutes=1)).isoformat(),
            "resource_udid": "00000000-0000-4000-8000-000000000004", "authorization_reference": "SYNTHETIC-METADATA-NOT-APPROVAL"}


class DriverTests(unittest.TestCase):
    def invoke(self, *args):
        return subprocess.run([sys.executable, str(HERE / "driver.py"), *args], text=True, capture_output=True, timeout=10)

    def test_default_is_dry_run_unrun_with_zero_product_effects(self):
        run = self.invoke()
        self.assertEqual(run.returncode, 0)
        value = json.loads(run.stdout)
        self.assertEqual((value["mode"], value["overall"]), ("DRY_RUN", "UNRUN"))
        self.assertTrue(all(item["status"] == "UNRUN" for item in value["checks"]))
        self.assertTrue(all(count == 0 for count in value["product_effects"].values()))
        self.assertFalse(value["resources"]["shared_app_or_keychain_access"])

    def test_real_mode_does_not_execute_from_scope_metadata_alone(self):
        value = candidate()
        current = datetime.now(timezone.utc)
        value.update(not_before=(current - timedelta(seconds=1)).isoformat(), expires_at=(current + timedelta(minutes=5)).isoformat())
        with tempfile.TemporaryDirectory() as tmp:
            scope = Path(tmp) / "candidate.json"
            scope.write_text(json.dumps(value))
            run = self.invoke("--mode", "real", "--scope", str(scope))
        report = json.loads(run.stdout)
        self.assertEqual(run.returncode, 2)
        self.assertEqual(report["scope_diagnostics"], [])
        self.assertEqual(report["overall"], "UNRUN")
        self.assertIn("EXPLICIT_OPERATOR_EXECUTION_NOT_REQUESTED", report["blockers"])
        self.assertTrue(all(count == 0 for count in report["product_effects"].values()))

    def test_missing_scope_never_defaults_to_a_target(self):
        value = json.loads(self.invoke("--mode", "real").stdout)
        self.assertIn("CANARY_SCOPE_NOT_SUPPLIED", value["scope_diagnostics"])
        self.assertIsNone(value["identity"]["session_id"])

    def test_scope_rejects_secrets_without_echoing_them(self):
        value = candidate(); value["password"] = "SYNTHETIC-DO-NOT-ECHO"
        with tempfile.TemporaryDirectory() as tmp:
            scope = Path(tmp) / "candidate.json"; scope.write_text(json.dumps(value))
            run = self.invoke("--mode", "real", "--scope", str(scope))
        self.assertNotIn("SYNTHETIC-DO-NOT-ECHO", run.stdout + run.stderr)
        self.assertEqual(json.loads(run.stdout)["scope_diagnostics"], ["SECRET_FIELDS_FORBIDDEN"])

    def test_scope_rejects_foreign_source_actor_budget_and_shared_resource(self):
        for field, replacement in [("product_revision", "f" * 40), ("actor_subject", ""), ("maximum_questions", True),
                                   ("maximum_questions", 2), ("maximum_cost_micros", 0), ("resource_udid", next(iter(driver.FORBIDDEN_RESOURCES)))]:
            value = candidate(); value[field] = replacement
            self.assertTrue(driver.validate_scope(value, NOW), field)

    def test_scope_requires_exact_nonproduction_origin(self):
        for origin in ["http://vp-v4-syntheticonly-jtcao515s-projects.vercel.app", "https://go2china.space", "https://qatesting.go2china.space",
                       "https://vp-v4-syntheticonly-jtcao515s-projects.vercel.app.evil.test", "https://user@staging.go2china.space",
                       "https://staging.go2china.space:443", "https://staging.go2china.space/path", "https://staging.go2china.space?q=1"]:
            value = candidate(); value["origin"] = origin
            self.assertIn("NATIVE_ORIGIN_NOT_APPROVED", driver.validate_scope(value, NOW), origin)

    def test_scope_rejects_expired_unbounded_or_unapproved_metadata(self):
        for changes in [{"expires_at": (NOW - timedelta(seconds=1)).isoformat()}, {"expires_at": (NOW + timedelta(days=1)).isoformat()},
                        {"authorization_reference": ""}, {"notice_hash": "not-a-hash"}, {"project_ref": "a" * 20}]:
            value = candidate(); value.update(changes)
            self.assertTrue(driver.validate_scope(value, NOW), changes)

    def test_duplicate_or_oversize_scope_is_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            scope = Path(tmp) / "candidate.json"
            for raw in ['{"schema":"one","schema":"two"}', " " * 17000]:
                scope.write_text(raw)
                self.assertEqual(json.loads(self.invoke("--mode", "real", "--scope", str(scope)).stdout)["scope_diagnostics"], ["SCOPE_UNREADABLE_OR_INVALID"])

    def test_result_oracle_rejects_fake_real_pass_or_effects(self):
        for mutation in ("target_pass", "real_check_pass", "effect", "task_id"):
            value = driver.report("real")
            if mutation == "target_pass": value["overall"] = "PASS"
            if mutation == "real_check_pass": value["checks"][2]["status"] = "PASS"
            if mutation == "effect": value["product_effects"]["generation_posts"] = 1
            if mutation == "task_id": value["identity"]["service_task_id"] = "00000000-0000-4000-8000-000000000001"
            with self.assertRaises(ValueError): driver.validate_result(value)

    def test_report_refuses_to_overwrite_existing_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "existing.json"; report.write_text("ORIGINAL")
            run = self.invoke("--report", str(report))
            self.assertNotEqual(run.returncode, 0)
            self.assertEqual(report.read_text(), "ORIGINAL")


if __name__ == "__main__":
    unittest.main()
