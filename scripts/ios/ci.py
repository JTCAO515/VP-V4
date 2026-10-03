#!/usr/bin/env python3
"""Native CI: unsigned build, ad-hoc Simulator tests, no distribution credentials."""
import argparse
import datetime
import json
import os
from pathlib import Path
import plistlib
import re
import shlex
import subprocess
import sys
import uuid

PROJECT = "ios/VisePanda/VisePanda.xcodeproj"
# Both known self-hosted installations run the same pinned Simulator runtime.
# Keep exact build identities: an unknown upgrade must still fail preflight.
XCODE_VERSIONS = frozenset({
    "Xcode 26.6\nBuild version 17F113",
    "Xcode 27.0\nBuild version 27A266a",
})
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-5"
DEVICE = "iPhone 17 Pro"


# PR code checks only; human/physical-device/full UI matrices are a later batch.
CRITICAL_TESTS = ["NativeAskStateTests", "NativeKnowledgeTests", "NativeTripStateTests",
                  "NativeProposalReferenceTests", "NativeQualifiedDelegationTests", "NativeQualifiedDelegationTransportTests",
                  "NativeAskPersistenceTests", "NativeTravelIntakeTests", "NativeTravelPaceTests"]
def checked_test_names(file):
    if not file.is_file():
        return []
    source = file.read_text()
    names = re.findall(r"\bclass\s+(\w+)\s*:\s*XCTestCase", source)
    # Swift Testing suites in this repository use their file's declared type name.
    # A classless/free-function/ambiguous suite falls back to the whole unit target.
    if "import Testing" in source and "@Test" in source and re.search(r"\b(?:struct|class|enum)\s+" + re.escape(file.stem) + r"\b", source):
        names.append(file.stem)
    return sorted(set(names))

def pr_test_selection(files):
    native = [f for f in files if f.startswith("ios/")]
    if not native:
        return []
    changed_classes = set()
    for f in native:
        if "/VisePandaTests/" in f and f.endswith(".swift"):
            file = Path(f)
            names = checked_test_names(file)
            if not names:
                return ["VisePandaTests"]  # Unknown/deleted/classless test: full unit target, never silently omit it.
            changed_classes.update("VisePandaTests/" + name for name in names)
        elif f.endswith(".swift") and not any(part in f for part in ("/App/", "/Features/", "/DesignSystem/", "/VisePandaUITests/")):
            return ["VisePandaTests"]  # Unknown native source retains all unit code checks.
    risk = bool(changed_classes) or any("/App/" in f or "Models" in f or "/Features/" in f or f.endswith((".pbxproj", ".plist")) for f in native)
    if risk:
        changed_classes.update("VisePandaTests/" + name for name in CRITICAL_TESTS)
    return sorted(changed_classes)



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--preflight", action="store_true", help="Inspect toolchain and devices only")
    parser.add_argument("--local-text-environment", type=Path, help="Explicit synthetic loopback test profile; no credentials accepted")
    parser.add_argument("--build-only", action="store_true", help="Unsigned generic build only; no Simulator/test PASS claim")
    parser.add_argument("--only-testing", action="append", default=[], help="Explicit affected VisePandaTests/Class; no full suite claim")
    parser.add_argument("--pr-base", help="Actual PR base SHA, selects minimal code checks")
    parser.add_argument("--pr-head", help="Actual PR head SHA")
    args = parser.parse_args()
    if args.pr_base is not None or args.pr_head is not None:
        if not all(isinstance(v, str) and re.fullmatch(r"[a-f0-9]{40}", v) for v in (args.pr_base, args.pr_head)):
            raise RuntimeError("Valid actual PR comparison is required; no narrow fallback")
        files = subprocess.check_output(["git", "diff", "--name-only", "--no-renames", "-z", args.pr_base, args.pr_head, "--"], text=True).split("\0")
        args.only_testing = pr_test_selection(files)
        args.build_only = not args.only_testing
    if any(not re.fullmatch(r"VisePandaTests(?:/[A-Za-z_][A-Za-z0-9_]*)?", t) for t in args.only_testing) or (args.build_only and args.only_testing):
        raise RuntimeError("Invalid build/test selection")
    if args.build_only and args.local_text_environment:
        raise RuntimeError("Build-only cannot claim local text integration")
    allowed_tests = {"VisePandaTests/" + name for file in Path("ios/VisePanda/VisePandaTests").glob("*.swift")
                     for name in checked_test_names(file)}
    if any(t != "VisePandaTests" and t not in allowed_tests for t in args.only_testing):
        raise RuntimeError("Selected class/suite is not a real checked-in test")
    text_environment = None
    if args.local_text_environment:
        text_environment = json.loads(args.local_text_environment.read_text())
        expected = {"VP_NATIVE_TEXT_TEST", "VP_NATIVE_TEXT_API_URL", "VP_NATIVE_TEXT_CONTROL_URL",
                    "VP_NATIVE_TEXT_EMAIL", "VP_NATIVE_TEXT_OTHER_EMAIL", "VP_NATIVE_TEXT_UI_EN_EMAIL", "VP_NATIVE_TEXT_UI_ZH_EMAIL"}
        if not isinstance(text_environment, dict) or set(text_environment) != expected:
            raise RuntimeError("Invalid local text test profile keys")
        if text_environment["VP_NATIVE_TEXT_TEST"] != "1" or text_environment["VP_NATIVE_TEXT_API_URL"] != "http://127.0.0.1:59651":
            raise RuntimeError("Only the explicit loopback text test is supported")
        if not re.fullmatch(r"http://127\.0\.0\.1:[0-9]{4,5}/release", text_environment["VP_NATIVE_TEXT_CONTROL_URL"]):
            raise RuntimeError("Invalid local text control URL")
        if any(not isinstance(value, str) or not re.fullmatch(r"vpj07-[a-z-]+-[0-9a-f-]{36}@example\.test", value)
               for key, value in text_environment.items() if key.endswith("EMAIL")):
            raise RuntimeError("Only synthetic test email addresses are accepted")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if (output / "commands.jsonl").exists():
        raise RuntimeError("Use a fresh output directory to avoid mixing runs")
    developer = os.environ.get("DEVELOPER_DIR")
    if not developer or not Path(developer).is_dir():
        raise RuntimeError("DEVELOPER_DIR must point to the installed pinned Xcode")

    def run(command, name, allow_failure=False):
        started = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        (output / (name + ".log")).write_text(result.stdout)
        record = {"startedAt": started, "argv": command, "command": shlex.join(command),
                  "cwd": str(Path.cwd()), "developerDir": developer, "exitCode": result.returncode}
        with (output / "commands.jsonl").open("a") as stream:
            stream.write(json.dumps(record) + "\n")
        print(f"{name}: exit {result.returncode}", flush=True)
        if result.returncode and not allow_failure:
            print(result.stdout[-12000:], file=sys.stderr)
            raise subprocess.CalledProcessError(result.returncode, command)
        return result.stdout

    version = run(["xcodebuild", "-version"], "xcode-version").strip()
    if version not in XCODE_VERSIONS:
        raise RuntimeError(f"Expected one of {sorted(XCODE_VERSIONS)!r}, found {version!r}; no automatic fallback")
    run(["xcodebuild", "-list", "-project", PROJECT], "project")
    matches = []
    udid = None
    if not args.build_only:
        devices = json.loads(run(["xcrun", "simctl", "list", "devices", "available", "--json"], "devices"))
        matches = [d for d in devices["devices"].get(RUNTIME, [])
                   if d.get("isAvailable") and d["name"] == DEVICE]
        if not matches:
            raise RuntimeError(f"Required installed {DEVICE} / {RUNTIME} is absent; no download or fallback")
        udid = matches[0]["udid"]
    metadata = {"commit": run(["git", "rev-parse", "HEAD"], "commit").strip(),
                "xcode": version, "runtime": None if args.build_only else RUNTIME,
                "deviceName": None if args.build_only else DEVICE, "deviceUDID": udid,
                "runnerImageVersion": os.environ.get("ImageVersion"), "preflightOnly": args.preflight,
                "distributionSigned": False, "genericBuildSigning": "disabled",
                "simulatorTestSigning": None if args.build_only else "ad-hoc", "simulatorTestSigningVerified": False,
                "localTextIntegration": text_environment is not None, "buildOnly": args.build_only,
                "selectedTests": args.only_testing, "simulatorTestsRun": False}
    (output / "environment.json").write_text(json.dumps(metadata, indent=2) + "\n")
    if args.preflight:
        return
    # DerivedData stays outside the uploaded evidence; never upload an app or signing store.
    derived = output.parent / (output.name + "-derived")
    common = ["-project", PROJECT, "-scheme", "VisePanda", "-derivedDataPath", str(derived)]
    run(["xcodebuild", "build", *common, "-destination", "generic/platform=iOS Simulator",
         "CODE_SIGNING_ALLOWED=NO", "-resultBundlePath", str(output / "build.xcresult")], "build")
    info_path = derived / "Build/Products/Debug-iphonesimulator/VisePanda.app/Info.plist"
    with info_path.open("rb") as stream:
        info = plistlib.load(stream)
    (output / "bundle-version.json").write_text(json.dumps({key: info[key] for key in
        ["CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion"]}, indent=2) + "\n")
    if args.build_only:
        return  # No runtime/device/signing/test operation or full-test claim.
    run(["xcodebuild", "build-for-testing", *common, "-destination", "generic/platform=iOS Simulator",
         "CODE_SIGNING_ALLOWED=YES", "CODE_SIGN_IDENTITY=-",
         "-resultBundlePath", str(output / "test-build.xcresult")], "test-build")
    # A local ad-hoc signature lets the test host exercise the real Keychain. It is
    # not an Apple Development/Distribution identity and uses no provisioning profile.
    app_path = info_path.parent
    signature = run(["codesign", "-d", "--verbose=2", str(app_path)], "test-signature")
    if ("Signature=adhoc" not in signature or "linker-signed" in signature
            or "Identifier=" + info["CFBundleIdentifier"] not in signature.splitlines()):
        raise RuntimeError("Simulator tests require a complete ad-hoc app signature, not linker-only or Apple signing")
    run(["codesign", "--verify", "--strict", str(app_path)], "test-signature-verification")
    metadata["simulatorTestSigningVerified"] = True
    (output / "environment.json").write_text(json.dumps(metadata, indent=2) + "\n")
    # The image's reference device validates the pinned type/runtime. Test in an
    # owned fresh device, after compilation, so boot readiness is an explicit gate.
    device_type = matches[0].get("deviceTypeIdentifier")
    if device_type != "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro":
        raise RuntimeError("Reference Simulator has an unexpected device type")
    udid = run(["xcrun", "simctl", "create", "VP-CI-" + uuid.uuid4().hex,
                device_type, RUNTIME], "simulator-create").strip()
    uuid.UUID(udid)  # Validate without changing case: Xcode destination matching is case-sensitive.
    metadata.update(deviceUDID=udid, simulatorOwned=True, simulatorDeleted=False)
    (output / "environment.json").write_text(json.dumps(metadata, indent=2) + "\n")
    patched_run = None
    test_selection = common
    try:
        if text_environment is not None:
            candidates = list((derived / "Build/Products").glob("*.xctestrun"))
            if len(candidates) != 1:
                raise RuntimeError("Expected one fresh complete xctestrun")
            with candidates[0].open("rb") as stream:
                test_run = plistlib.load(stream)
            for target in ("VisePandaTests", "VisePandaUITests"):
                if not isinstance(test_run.get(target), dict):
                    raise RuntimeError("Complete native test target missing")
                test_run[target].setdefault("EnvironmentVariables", {}).update(text_environment)
            patched_run = derived / "Build/Products/LocalText.xctestrun"
            with patched_run.open("wb") as stream:
                plistlib.dump(test_run, stream)
            patched_run.chmod(0o600)
            test_selection = ["-xctestrun", str(patched_run)]
        run(["xcrun", "simctl", "bootstatus", udid, "-b"], "simulator-boot")
        test_log = run(["xcodebuild", "test-without-building", *test_selection,
             "-destination", f"platform=iOS Simulator,id={udid}",
             "CODE_SIGNING_ALLOWED=YES", "CODE_SIGN_IDENTITY=-",
             "-parallel-testing-enabled", "NO",
             *["-only-testing:" + name for name in args.only_testing],
             "-resultBundlePath", str(output / "tests.xcresult")], "tests")
        if args.only_testing and not re.search(r"(?:Executed|Test run with) [1-9][0-9]* tests?", test_log):
            raise RuntimeError("Targeted code check executed zero tests; no PASS claim")
        metadata["simulatorTestsRun"] = True
    finally:
        if patched_run is not None:
            patched_run.unlink(missing_ok=True)
        # It may already be shut down; deletion remains strict and only targets ours.
        run(["xcrun", "simctl", "shutdown", udid], "simulator-shutdown", allow_failure=True)
        run(["xcrun", "simctl", "delete", udid], "simulator-delete")
        metadata["simulatorDeleted"] = True
        (output / "environment.json").write_text(json.dumps(metadata, indent=2) + "\n")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
