"""Explicit-operator real UI adapter. Never called by default/dry-run; never automates writes."""
from __future__ import annotations
import base64
import json
from pathlib import Path
import plistlib
import re
import subprocess
import sys

CASE = "VisePandaUITests/NativeQAOperatorAcceptanceUITests/testOperatorLoginQuestionAndProcessReopen"
SHARED_SIMS = {"8F6CA72C-73C0-45C0-8606-0543B1F725BD", "22BA88CC-D299-49FC-8EA7-F5CBE980202D", "0B61CBDA-D714-42F8-B9AF-974B922F9971"}


class UIUnavailable(Exception):
    pass


class UIFailed(UIUnavailable):
    pass


def command(arguments, **kwargs):
    return subprocess.run(arguments, check=True, text=True, capture_output=True, timeout=30, **kwargs).stdout


def read_plist(path):
    with path.open("rb") as stream:
        return plistlib.load(stream)


def resolve_roots(value, root):
    if isinstance(value, str):
        return value.replace("__TESTROOT__", str(root))
    if isinstance(value, list):
        return [resolve_roots(item, root) for item in value]
    if isinstance(value, dict):
        return {key: resolve_roots(item, root) for key, item in value.items()}
    return value


def verify_app_metadata(info, scope):
    if info.get("CFBundleIdentifier") != scope["bundle_identifier"] or info.get("VisePandaNativeEnvironment") != "staging" or info.get("VisePandaNativeTaskContext") != "qa_session_v1" or info.get("VisePandaStagingAPIOrigin", "").rstrip("/") != scope["origin"].rstrip("/"):
        raise UIUnavailable("INSTALLED_OR_PREBUILT_APP_BINDING_MISMATCH")


def prepare_xctestrun(source, destination, scope):
    """Patch only a new private copy. Never changes the shared project or existing runner file."""
    run = resolve_roots(read_plist(source), source.resolve().parent)
    target = run.get("VisePandaUITests")
    if not isinstance(target, dict) or target.get("IsUITestBundle") is not True:
        raise UIUnavailable("REGISTERED_UI_XCTESTRUN_REQUIRED")
    app = target.get("UITargetAppPath")
    if not isinstance(app, str) or "__" in app:
        raise UIUnavailable("UI_APP_PATH_NOT_RESOLVED")
    verify_app_metadata(read_plist(Path(app) / "Info.plist"), scope)
    for key in ("TestBundlePath", "TestHostPath"):
        if not isinstance(target.get(key), str) or not Path(target[key]).exists():
            raise UIUnavailable("PREBUILT_UI_RUNNER_NOT_FOUND")
    # Preserve XCTest's loader wiring; never copy arbitrary account/provider fixture variables.
    original_env = target.get("EnvironmentVariables", {})
    safe_env = {key: value for key, value in original_env.items() if key.startswith(("DYLD_", "XCTest", "XCInject", "OS_ACTIVITY_")) and isinstance(value, str)}
    safe_env.update(VP_NATIVE_QA_UI_EXECUTE="1", VP_NATIVE_QA_UI_SCOPE=base64.b64encode(json.dumps(scope).encode()).decode())
    target["EnvironmentVariables"] = safe_env
    target["UITargetAppEnvironmentVariables"] = {"VP_NATIVE_QA_ACCEPTANCE_RUN_ID": scope["run_id"]}
    target["OnlyTestIdentifiers"] = [CASE.split("/", 1)[1]]
    target.pop("SkipTestIdentifiers", None)
    target["CommandLineArguments"] = []
    target["UITargetAppCommandLineArguments"] = []
    private = {"VisePandaUITests": target}
    if "__xctestrun_metadata__" in run:
        private["__xctestrun_metadata__"] = run["__xctestrun_metadata__"]
    with destination.open("xb") as stream:
        plistlib.dump(private, stream)
    destination.chmod(0o600)


def require_pass_summary(summary, returncode=0):
    """Known execution failure outranks every optional/missing observation artifact."""
    if isinstance(summary, dict) and type(summary.get("failedTests")) is int and summary["failedTests"] > 0:
        raise UIFailed("REAL_UI_CASE_FAILED")
    if returncode != 0:
        raise UIFailed("XCODEBUILD_UI_CASE_NOT_SUCCESSFUL")
    expected = {"totalTestCount": 1, "passedTests": 1, "failedTests": 0, "skippedTests": 0}
    if not isinstance(summary, dict) or any(type(summary.get(key)) is not int or summary[key] != count for key, count in expected.items()):
        raise UIUnavailable("EXACT_UI_CASE_DID_NOT_PASS")


def verify_observation(value, scope, summary):
    """Evidence oracle only. Input metadata cannot trigger UI/auth/network operations."""
    require_pass_summary(summary)
    allowed = {"schema", "run_id", "product_revision", "status", "automatic_form_submission_actions", "input_hash_source", "answer_hash_source", "service_task_id", "original_body_sha256", "profile_login_fields_observed", "actor_subject", "accepted_service_ui_observed", "approved_draft_observed", "request_id", "turn_id", "input_utf8_sha256", "response_status_label", "answer_utf8_sha256", "session_id", "fresh_session_observed", "original_body_hash_source", "process_exit_observed", "reopened_actor_subject", "reopened_session_id", "reopened_request_id", "reopened_input_utf8_sha256", "reopened_answer_utf8_sha256", "observed_question_count"}
    if not isinstance(value, dict) or not set(value) <= allowed or value.get("service_task_id") is not None:
        raise UIUnavailable("UI_OBSERVATION_FIELDS_INVALID")
    if value.get("input_hash_source") != "accessibility_label_utf8" or value.get("answer_hash_source") != "accessibility_label_utf8":
        raise UIUnavailable("UI_HASH_PROVENANCE_INVALID")
    if value.get("schema") != "nativeqa-operator-ui/1" or value.get("status") != "COMPLETE" or value.get("run_id") != scope["run_id"] or value.get("product_revision") != scope["product_revision"]:
        raise UIUnavailable("UI_OBSERVATION_SOURCE_OR_RUN_MISMATCH")
    for key in ("profile_login_fields_observed", "accepted_service_ui_observed", "approved_draft_observed", "fresh_session_observed", "process_exit_observed"):
        if value.get(key) is not True:
            raise UIUnavailable("UI_FLOW_CHECKPOINT_MISSING")
    if type(value.get("automatic_form_submission_actions")) is not int or value["automatic_form_submission_actions"] != 0 or type(value.get("observed_question_count")) is not int or value["observed_question_count"] != 1 or value.get("response_status_label") != "Answer saved":
        raise UIUnavailable("UI_FLOW_NOT_SINGLE_SAVED_ANSWER")
    if value.get("actor_subject") != scope["actor_subject"] or value.get("reopened_actor_subject") != scope["actor_subject"]:
        raise UIUnavailable("UI_ACTOR_BINDING_MISMATCH")
    uuid_pattern = r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
    for key in ("session_id", "request_id"):
        if not isinstance(value.get(key), str) or not re.fullmatch(uuid_pattern, value[key]) or value.get("reopened_" + key) != value[key]:
            raise UIUnavailable("UI_REOPEN_IDENTITY_MISMATCH")
    if value.get("turn_id") != value["request_id"]:
        raise UIUnavailable("UI_TURN_REQUEST_MISMATCH")
    for key in ("input_utf8_sha256", "answer_utf8_sha256"):
        if not isinstance(value.get(key), str) or not re.fullmatch(r"[a-f0-9]{64}", value[key]) or value.get("reopened_" + key) != value[key]:
            raise UIUnavailable("UI_REOPEN_CONTENT_MISMATCH")
    if value["input_utf8_sha256"] != scope["question_utf8_sha256"]:
        raise UIUnavailable("UI_APPROVED_QUESTION_MISMATCH")
    body = value.get("original_body_sha256")
    if body is not None and (not isinstance(body, str) or not re.fullmatch(r"[a-f0-9]{64}", body) or value.get("original_body_hash_source") != "scoped_pre_submission_typed_command_observer"):
        raise UIUnavailable("ORIGINAL_BODY_OBSERVATION_INVALID")
    return value


def find_attachment(exported, run_id):
    manifest = json.loads((exported / "manifest.json").read_text())
    matches = []
    for case in manifest:
        for attachment in case.get("attachments", []):
            name = attachment.get("suggestedHumanReadableName", "")
            if ("nativeqa-operator-ui-" + run_id) not in name:
                continue
            filename = attachment.get("exportedFileName")
            if not isinstance(filename, str) or Path(filename).name != filename:
                raise UIUnavailable("UI_ATTACHMENT_PATH_INVALID")
            path = exported / filename
            if path.is_symlink() or path.stat().st_size > 16384:
                raise UIUnavailable("UI_ATTACHMENT_INVALID")
            matches.append(json.loads(path.read_text()))
    if len(matches) != 1:
        raise UIUnavailable("EXACT_UI_OBSERVATION_ATTACHMENT_MISSING")
    return matches[0]


def run(scope, xctestrun, run_dir):
    """Called only after CLI explicit execute + valid scoped metadata. Operator does all writes."""
    if xctestrun is None or run_dir is None:
        raise UIUnavailable("PREBUILT_XCTESTRUN_AND_NEW_PRIVATE_RUN_DIR_REQUIRED")
    udid = scope["resource_udid"]
    if udid.upper() in SHARED_SIMS:
        raise UIUnavailable("RESERVED_SHARED_SIMULATOR")
    devices = json.loads(command(["/usr/bin/xcrun", "simctl", "list", "devices", "available", "-j"]))["devices"]
    matching = [device for group in devices.values() for device in group if device.get("udid", "").upper() == udid.upper()]
    if len(matching) != 1 or matching[0].get("name") != "VP-NativeQA-Acceptance-" + scope["run_id"] or matching[0].get("state") != "Booted":
        raise UIUnavailable("EXCLUSIVE_RUN_NAMED_BOOTED_SIMULATOR_REQUIRED")
    installed = command(["/usr/bin/xcrun", "simctl", "get_app_container", udid, scope["bundle_identifier"], "app"]).strip()
    verify_app_metadata(read_plist(Path(installed) / "Info.plist"), scope)
    run_dir.mkdir(mode=0o700, parents=False, exist_ok=False)
    private_run = run_dir / "OperatorCanary.xctestrun"
    prepare_xctestrun(xctestrun.resolve(), private_run, scope)
    result = run_dir / "OperatorCanary.xcresult"
    print("OPERATOR_REQUIRED: use only the approved ordinary account. Login/MFA/notice/create/send are manual. Follow OPERATOR_REQUIRED checkpoints in the private xcodebuild log.", file=sys.stderr, flush=True)
    with (run_dir / "xcodebuild.log").open("x") as log:
        completed = subprocess.run(["/usr/bin/xcodebuild", "test-without-building", "-xctestrun", str(private_run),
            "-destination", "platform=iOS Simulator,id=" + udid, "-only-testing:" + CASE,
            "-parallel-testing-enabled", "NO", "-test-iterations", "1", "-resultBundlePath", str(result)], stdout=log, stderr=subprocess.STDOUT, timeout=900)
    try:
        summary = json.loads(command(["/usr/bin/xcrun", "xcresulttool", "get", "test-results", "summary", "--path", str(result), "--compact"]))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        # A failed process cannot become UNRUN merely because its result bundle is unavailable.
        if completed.returncode != 0:
            raise UIFailed("XCODEBUILD_UI_CASE_NOT_SUCCESSFUL") from error
        raise UIUnavailable("UI_SUMMARY_UNAVAILABLE") from error
    require_pass_summary(summary, completed.returncode)
    exported = run_dir / "json-attachments"
    command(["/usr/bin/xcrun", "xcresulttool", "export", "attachments", "--path", str(result), "--output-path", str(exported), "--filter", "*.json"])
    value = find_attachment(exported, scope["run_id"])
    observed = verify_observation(value, scope, summary)
    return {"status": "PASS", "evidence_kind": "real_xctest_ui_with_operator_actions", "observation": observed,
            "summary": {key: summary[key] for key in ("totalTestCount", "passedTests", "failedTests", "skippedTests")},
            "private_run_directory": str(run_dir.resolve()), "runner_created_simulator": False}
