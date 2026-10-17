"""Pure UI evidence/plist oracle tests with synthetic inputs; never runs xcodebuild or simctl."""
import copy
import importlib.util
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch
from test_driver import candidate

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("nativeqa_real_ui", HERE / "real_ui.py")
ui = importlib.util.module_from_spec(spec); spec.loader.exec_module(ui)


def completed_observation(scope):
    return {"schema": "nativeqa-operator-ui/1", "status": "COMPLETE", "run_id": scope["run_id"], "product_revision": scope["product_revision"],
            "profile_login_fields_observed": True, "accepted_service_ui_observed": True, "approved_draft_observed": True,
            "fresh_session_observed": True, "process_exit_observed": True, "automatic_form_submission_actions": 0,
            "input_hash_source": "accessibility_label_utf8", "answer_hash_source": "accessibility_label_utf8", "service_task_id": None,
            "observed_question_count": 1, "response_status_label": "Answer saved", "actor_subject": scope["actor_subject"],
            "reopened_actor_subject": scope["actor_subject"], "session_id": "00000000-0000-4000-8000-000000000010",
            "reopened_session_id": "00000000-0000-4000-8000-000000000010", "request_id": "00000000-0000-4000-8000-000000000011",
            "turn_id": "00000000-0000-4000-8000-000000000011", "reopened_request_id": "00000000-0000-4000-8000-000000000011",
            "input_utf8_sha256": scope["question_utf8_sha256"], "reopened_input_utf8_sha256": scope["question_utf8_sha256"],
            "answer_utf8_sha256": "c" * 64, "reopened_answer_utf8_sha256": "c" * 64, "original_body_sha256": None}


class RealUIOracleTests(unittest.TestCase):
    def setUp(self):
        self.scope = candidate()
        self.summary = {"totalTestCount": 1, "passedTests": 1, "failedTests": 0, "skippedTests": 0}

    def test_complete_ui_flow_does_not_require_body_or_task_hook(self):
        value = completed_observation(self.scope)
        self.assertEqual(ui.verify_observation(value, self.scope, self.summary), value)
        self.assertIsNone(value["original_body_sha256"])

    def test_scope_json_alone_or_zero_selected_tests_cannot_pass(self):
        with self.assertRaises(ui.UIUnavailable): ui.verify_observation(self.scope, self.scope, self.summary)
        for field, replacement in [("totalTestCount", 0), ("skippedTests", 1), ("failedTests", 1), ("passedTests", 0)]:
            summary = dict(self.summary); summary[field] = replacement
            with self.assertRaises(ui.UIUnavailable): ui.verify_observation(completed_observation(self.scope), self.scope, summary)

    def test_actual_failure_and_skipped_or_unrun_are_distinct(self):
        failed = dict(self.summary); failed["failedTests"] = 1; failed["passedTests"] = 0
        with self.assertRaises(ui.UIFailed): ui.verify_observation(completed_observation(self.scope), self.scope, failed)
        skipped = dict(self.summary); skipped["skippedTests"] = 1; skipped["passedTests"] = 0
        try:
            ui.verify_observation(completed_observation(self.scope), self.scope, skipped)
        except ui.UIFailed:
            self.fail("A skipped case is UNRUN, not an actual failed canary")
        except ui.UIUnavailable:
            pass
        else:
            self.fail("A skipped case must not pass")

    def test_wrong_actor_request_session_bytes_or_missing_checkpoints_reject(self):
        for field, value in [("actor_subject", "foreign"), ("reopened_request_id", "00000000-0000-4000-8000-000000000012"),
                             ("reopened_session_id", "00000000-0000-4000-8000-000000000012"), ("reopened_answer_utf8_sha256", "d" * 64),
                             ("approved_draft_observed", False), ("fresh_session_observed", False), ("automatic_form_submission_actions", 1),
                             ("observed_question_count", 2), ("response_status_label", "Partial answer")]:
            observed = completed_observation(self.scope); observed[field] = value
            with self.assertRaises(ui.UIUnavailable): ui.verify_observation(observed, self.scope, self.summary)

    def test_optional_body_hash_requires_exact_observation_provenance(self):
        value = completed_observation(self.scope); value["original_body_sha256"] = "e" * 64
        with self.assertRaises(ui.UIUnavailable): ui.verify_observation(value, self.scope, self.summary)
        value["original_body_hash_source"] = "scoped_pre_submission_typed_command_observer"
        self.assertEqual(ui.verify_observation(value, self.scope, self.summary), value)

    def test_prebuilt_copy_drops_credentials_and_keeps_original_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); app = root / "QA.app"; app.mkdir()
            info = {"CFBundleIdentifier": self.scope["bundle_identifier"], "VisePandaNativeEnvironment": "staging",
                    "VisePandaNativeTaskContext": "qa_session_v1", "VisePandaStagingAPIOrigin": self.scope["origin"]}
            (app / "Info.plist").write_bytes(plistlib.dumps(info))
            (root / "Runner.app").mkdir(); (root / "Tests.xctest").mkdir()
            source = root / "Original.xctestrun"
            original = {"VisePandaUITests": {"IsUITestBundle": True, "UITargetAppPath": "__TESTROOT__/QA.app",
                        "TestHostPath": "__TESTROOT__/Runner.app", "TestBundlePath": "__TESTROOT__/Tests.xctest",
                        "EnvironmentVariables": {"DYLD_FRAMEWORK_PATH": "safe-loader", "PASSWORD": "SYNTHETIC-NOT-A-REAL-SECRET"}},
                        "UnrelatedTests": {"IsUITestBundle": False}}
            source.write_bytes(plistlib.dumps(original)); before = source.read_bytes()
            copied = root / "Private.xctestrun"; ui.prepare_xctestrun(source, copied, self.scope)
            value = plistlib.loads(copied.read_bytes())
            self.assertEqual(source.read_bytes(), before); self.assertNotIn("UnrelatedTests", value)
            env = value["VisePandaUITests"]["EnvironmentVariables"]
            self.assertNotIn("PASSWORD", env); self.assertEqual(env["VP_NATIVE_QA_UI_EXECUTE"], "1")
            self.assertEqual(value["VisePandaUITests"]["OnlyTestIdentifiers"], [ui.CASE.split("/", 1)[1]])

    def test_live_adapter_without_required_runner_inputs_does_not_call_tools(self):
        with patch.object(ui, "command", side_effect=AssertionError("No tool execution allowed")):
            with self.assertRaises(ui.UIUnavailable): ui.run(self.scope, None, None)


if __name__ == "__main__":
    unittest.main()
