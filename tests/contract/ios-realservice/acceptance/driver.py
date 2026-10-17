#!/usr/bin/env python3
"""Default-safe NativeQA acceptance preparation. Real mode is validation-only in this revision."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import uuid
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PRODUCT_REVISION = "cf33285eceb4cb340a9fe70e975c643c023f5035"
PROJECT_REF = "dzqdzetcctkhbrhlxxgn"
FORBIDDEN_RESOURCES = {"8F6CA72C-73C0-45C0-8606-0543B1F725BD", "22BA88CC-D299-49FC-8EA7-F5CBE980202D", "0B61CBDA-D714-42F8-B9AF-974B922F9971"}
STAGES = ["native_profile_login", "explicit_notice_consent", "original_question_submit", "bounded_response_read",
          "saved_session_read", "original_request_bytes", "process_exit", "reopen_same_session"]


def duplicate_reject(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("DUPLICATE_KEYS")
        result[key] = value
    return result


def load_json(path: Path, maximum=16384):
    with path.open("rb") as handle:
        data = handle.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError("INPUT_TOO_LARGE")
    return json.loads(data, object_pairs_hook=duplicate_reject)


def exact(value, fields):
    return isinstance(value, dict) and set(value) == set(fields)


def is_uuid(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}", value) is not None


def secret_field(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if re.search(r"password|token|cookie|secret|credential|service.?role|api.?key", key, re.I) or secret_field(item):
                return True
    if isinstance(value, list):
        return any(secret_field(item) for item in value)
    return False


def validate_scope(value, now=None):
    """Checks candidate metadata only. A file saying approved never grants execution authority."""
    now = now or datetime.now(timezone.utc)
    errors = []
    if secret_field(value):
        return ["SECRET_FIELDS_FORBIDDEN"]
    fields = {"schema", "product_revision", "project_ref", "native_environment", "origin", "actor_subject",
              "policy_id", "notice_hash", "budget_scope_id", "maximum_questions", "maximum_cost_micros",
              "not_before", "expires_at", "resource_udid", "authorization_reference"}
    if not exact(value, fields):
        return ["SCOPE_FIELDS_INCOMPLETE_OR_EXTRA"]
    if value["schema"] != "ios-nativeqa-canary/1" or value["product_revision"] != PRODUCT_REVISION:
        errors.append("SOURCE_BINDING_MISMATCH")
    if value["project_ref"] != PROJECT_REF or value["native_environment"] != "staging":
        errors.append("TARGET_BINDING_MISMATCH")
    try:
        parsed = urlsplit(value["origin"])
        host_allowed = parsed.hostname == "staging.go2china.space" or re.fullmatch(r"vp-v4-[a-z0-9]+-jtcao515s-projects\.vercel\.app", parsed.hostname or "")
        if parsed.scheme != "https" or not host_allowed or parsed.username or parsed.password or parsed.port is not None or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
            raise ValueError()
    except (TypeError, ValueError):
        errors.append("NATIVE_ORIGIN_NOT_APPROVED")
    for field in ("actor_subject", "policy_id", "budget_scope_id", "resource_udid"):
        if not is_uuid(value[field]):
            errors.append("MISSING_" + field.upper())
    if isinstance(value["resource_udid"], str) and value["resource_udid"].upper() in FORBIDDEN_RESOURCES:
        errors.append("RESOURCE_NOT_OWNED_BY_THIS_DRIVER")
    if not isinstance(value["notice_hash"], str) or not re.fullmatch(r"[a-f0-9]{64}", value["notice_hash"]):
        errors.append("NOTICE_NOT_BOUND")
    if type(value["maximum_questions"]) is not int or value["maximum_questions"] != 1:
        errors.append("QUESTION_BUDGET_NOT_SINGLE")
    if type(value["maximum_cost_micros"]) is not int or not 0 < value["maximum_cost_micros"] <= 1_000_000_000:
        errors.append("COST_LIMIT_MISSING")
    if not isinstance(value["authorization_reference"], str) or not value["authorization_reference"].strip():
        errors.append("EXPLICIT_AUTHORIZATION_REFERENCE_MISSING")
    try:
        start = datetime.fromisoformat(value["not_before"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(value["expires_at"].replace("Z", "+00:00"))
        if start.utcoffset() is None or end.utcoffset() is None or not start <= now < end or not 0 < (end - start).total_seconds() <= 3600:
            raise ValueError()
    except (AttributeError, TypeError, ValueError):
        errors.append("CANARY_WINDOW_NOT_CURRENT_OR_BOUNDED")
    return errors


def report(mode):
    return {"schema": "ios-nativeqa-acceptance/1", "mode": mode.upper().replace("-", "_"), "overall": "UNRUN",
            "product_revision": PRODUCT_REVISION, "synthetic_driver": "UNRUN", "checks": [
                {"stage": stage, "status": "UNRUN", "evidence_kind": "none", "reason": "REAL_CANARY_NOT_EXECUTED"} for stage in STAGES],
            "scope_diagnostics": [], "blockers": [],
            "optional_observations": {"authoritative_task_binding": {"status": "UNRUN", "reason": "NOT_EXPOSED_BY_QA_AGENT_1; SEPARATE_CONTROLLED_METADATA_IF_REQUIRED"}}, "identity": {"session_id": None, "request_id": None, "turn_id": None,
                "service_task_id": None, "original_body_sha256": None, "input_utf8_sha256": None, "answer_utf8_sha256": None},
            "product_effects": {"network_requests": 0, "auth_requests": 0, "consent_posts": 0, "generation_posts": 0, "provider_calls": 0},
            "resources": {"simulators_created": [], "shared_app_or_keychain_access": False, "temporary_test_namespace_cleaned": None}}


def synthetic(result):
    env = {"PATH": "/usr/bin:/bin:/usr/sbin:/sbin"}
    with tempfile.TemporaryDirectory(prefix="nativeqa-acceptance-") as tmp:
        private = Path(tmp)
        os.chmod(private, 0o700)
        env["TMPDIR"] = tmp
        pins = load_json(HERE / "product-sources.json")
        if pins.get("revision") != PRODUCT_REVISION or not isinstance(pins.get("sha256"), dict):
            raise RuntimeError("SOURCE_MANIFEST_INVALID")
        allowed_sources = {
            "ios/VisePanda/VisePanda/App/NativeSession.swift",
            "ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQA/NativeQAContract.swift",
            "ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQA/NativeQACancellationContract.swift",
            "ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQA/NativeQAStore.swift",
        }
        if set(pins["sha256"]) != allowed_sources:
            raise RuntimeError("SOURCE_MANIFEST_FIELDS_INVALID")
        for relative, expected in pins["sha256"].items():
            if not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected):
                raise RuntimeError("SOURCE_MANIFEST_HASH_INVALID")
            if hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() != expected:
                raise RuntimeError("SYNTHETIC_SOURCE_BINDING_MISMATCH")
        session = (ROOT / "ios/VisePanda/VisePanda/App/NativeSession.swift").read_text()
        start = session.index("struct NativeDataScope:")
        end = session.index("\n}", start) + 2
        scope = private / "NativeDataScope.swift"
        scope.write_text("import Foundation\n" + session[start:end] + "\n")
        source = ROOT / "ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQA"
        files = [source / name for name in ("NativeQAContract.swift", "NativeQACancellationContract.swift", "NativeQAStore.swift")]
        executable = private / "synthetic-process"
        build = subprocess.run(["/usr/bin/xcrun", "swiftc", "-swift-version", "6", "-parse-as-library", "-module-cache-path", str(private / "cache"),
                                str(scope), *map(str, files), str(HERE / "SyntheticProcessHarness.swift"), "-o", str(executable)],
                               env=env, capture_output=True, text=True, timeout=120)
        if build.returncode:
            raise RuntimeError("SYNTHETIC_SOURCE_COMPILE_FAILED")
        run_id = str(uuid.uuid4())
        fixture = private / ("synthetic-" + run_id + ".json")
        phases = []
        for phase in ("first", "reopen"):
            run = subprocess.run([str(executable), phase, str(fixture), run_id], env=env, capture_output=True, text=True, timeout=30)
            if run.returncode:
                raise RuntimeError("SYNTHETIC_" + phase.upper() + "_FAILED")
            value = json.loads(run.stdout, object_pairs_hook=duplicate_reject)
            if value.get("schema") != "ios-nativeqa-synthetic-phase/1" or value.get("synthetic") is not True or value.get("run_id") != run_id:
                raise RuntimeError("SYNTHETIC_PHASE_IDENTITY_INVALID")
            phases.append(value)
        first, reopened = phases
        bound_fields = ("session_id", "request_id", "turn_id", "original_body_sha256", "input_utf8_sha256", "answer_utf8_sha256")
        if first["pid"] == reopened["pid"] or any(first[key] != reopened[key] for key in bound_fields) or first["submission_count"] != 1 or reopened["submission_count"] != 1:
            raise RuntimeError("SYNTHETIC_REOPEN_ORIGINAL_BINDING_FAILED")
        result["synthetic_driver"] = "PASS"
        result["synthetic_processes"] = [{"phase": p["phase"], "pid": p["pid"], "submission_count": p["submission_count"]} for p in phases]
        result["identity"].update({key: reopened[key] for key in bound_fields})
        for check in result["checks"]:
            if check["stage"] != "native_profile_login":
                check.update(status="PASS", evidence_kind="synthetic_actual_consumer_process", reason="SYNTHETIC_ONLY_NO_TARGET_ACCEPTANCE")
        result["checks"][0]["reason"] = "PROFILE_CREDENTIALS_LOGIN_MODELED_ONLY_NOT_NATIVESESSION_AUTH"
        result["synthetic_trace"] = reopened["trace"]
        result["blockers"] = ["REAL_PROFILE_AUTH_UNRUN", "REAL_UI_APP_ADAPTER_NOT_REGISTERED"]
    result["resources"]["temporary_test_namespace_cleaned"] = True



def validate_result(value):
    required = {"schema", "mode", "overall", "product_revision", "synthetic_driver", "checks", "scope_diagnostics", "blockers", "optional_observations", "identity", "product_effects", "resources"}
    if not isinstance(value, dict) or not required <= set(value) or set(value) - required - {"synthetic_processes", "synthetic_trace"}:
        raise ValueError("RESULT_FIELDS_INVALID")
    if value["schema"] != "ios-nativeqa-acceptance/1" or value["product_revision"] != PRODUCT_REVISION or value["overall"] not in ("UNRUN", "FAIL"):
        raise ValueError("TARGET_PASS_FORBIDDEN_IN_THIS_REVISION")
    if value["mode"] not in ("DRY_RUN", "REAL", "SYNTHETIC") or value["synthetic_driver"] not in ("PASS", "FAIL", "UNRUN"):
        raise ValueError("RESULT_MODE_INVALID")
    if [item.get("stage") for item in value["checks"]] != STAGES:
        raise ValueError("RESULT_STAGE_SEQUENCE_INVALID")
    for item in value["checks"]:
        if not exact(item, {"stage", "status", "evidence_kind", "reason"}) or item["status"] not in ("PASS", "FAIL", "UNRUN"):
            raise ValueError("RESULT_CHECK_INVALID")
        if item["status"] == "PASS" and (value["mode"] != "SYNTHETIC" or item["evidence_kind"] != "synthetic_actual_consumer_process"):
            raise ValueError("UNSUPPORTED_REAL_PASS")
    expected_effects = {"network_requests", "auth_requests", "consent_posts", "generation_posts", "provider_calls"}
    if not exact(value["product_effects"], expected_effects) or any(type(v) is not int or v != 0 for v in value["product_effects"].values()):
        raise ValueError("REAL_EFFECTS_FORBIDDEN")
    identity_fields = {"session_id", "request_id", "turn_id", "service_task_id", "original_body_sha256", "input_utf8_sha256", "answer_utf8_sha256"}
    if not exact(value["identity"], identity_fields):
        raise ValueError("RESULT_IDENTITY_INVALID")
    for key, item in value["identity"].items():
        if item is not None and (not is_uuid(item) if key.endswith("_id") else not isinstance(item, str) or not re.fullmatch(r"[a-f0-9]{64}", item)):
            raise ValueError("RESULT_IDENTITY_INVALID")
    if value["checks"][0]["status"] != "UNRUN" or value["identity"]["service_task_id"] is not None:
        raise ValueError("UNOBSERVED_AUTH_OR_TASK_ID")
    if value["synthetic_driver"] == "PASS":
        phases = value.get("synthetic_processes", [])
        if len(phases) != 2 or [p["phase"] for p in phases] != ["first", "reopen"] or phases[0]["pid"] == phases[1]["pid"] or any(type(p["pid"]) is not int or p["pid"] <= 0 or p["submission_count"] != 1 for p in phases):
            raise ValueError("PROCESS_REOPEN_BINDING_INVALID")
        if any(value["identity"][key] is None for key in identity_fields - {"service_task_id"}) or value["identity"]["request_id"] != value["identity"]["turn_id"]:
            raise ValueError("PROCESS_ORIGINAL_REQUEST_IDENTITY_MISSING")
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("dry-run", "synthetic", "real"), default="dry-run")
    parser.add_argument("--scope", type=Path, help="Nonsecret future canary metadata; never execution approval by itself")
    parser.add_argument("--report", type=Path, help="Create a new JSON report; refuses overwrite")
    args = parser.parse_args(argv)
    result = report(args.mode)
    exit_code = 0
    if args.mode == "synthetic":
        try:
            synthetic(result)
        except (OSError, ValueError, RuntimeError, subprocess.SubprocessError):
            result["synthetic_driver"] = "FAIL"
            result["overall"] = "FAIL"
            result["blockers"] = ["SYNTHETIC_DRIVER_FAILED_NO_REAL_ACTION_TAKEN"]
            exit_code = 1
    else:
        if args.scope:
            try:
                result["scope_diagnostics"] = validate_scope(load_json(args.scope))
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                result["scope_diagnostics"] = ["SCOPE_UNREADABLE_OR_INVALID"]
        else:
            result["scope_diagnostics"] = ["CANARY_SCOPE_NOT_SUPPLIED"]
        result["blockers"] = ["REAL_EXECUTION_DISABLED_IN_THIS_REVISION", "EXPLICIT_FUTURE_CANARY_AUTHORIZATION_REQUIRED",
                              "REAL_UI_APP_ADAPTER_NOT_REGISTERED"]
        # A structurally valid metadata file is never human approval or a reason to perform IO.
        if args.mode == "real":
            exit_code = 2
    validate_result(result)
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        try:
            with args.report.open("x", encoding="utf-8") as handle:
                handle.write(encoded)
        except OSError:
            parser.error("Report must be a new writable path; existing files are preserved")
    print(encoded, end="")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
