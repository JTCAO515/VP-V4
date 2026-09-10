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
XCODE = "Xcode 26.6\nBuild version 17F113"
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-5"
DEVICE = "iPhone 17 Pro"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--preflight", action="store_true", help="Inspect toolchain and devices only")
    parser.add_argument("--local-text-environment", type=Path, help="Explicit synthetic loopback test profile; no credentials accepted")
    args = parser.parse_args()
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
    if version != XCODE:
        raise RuntimeError(f"Expected {XCODE!r}, found {version!r}; no automatic fallback")
    run(["xcodebuild", "-list", "-project", PROJECT], "project")
    devices = json.loads(run(["xcrun", "simctl", "list", "devices", "available", "--json"], "devices"))
    matches = [d for d in devices["devices"].get(RUNTIME, [])
               if d.get("isAvailable") and d["name"] == DEVICE]
    if not matches:
        raise RuntimeError(f"Required installed {DEVICE} / {RUNTIME} is absent; no download or fallback")
    udid = matches[0]["udid"]
    metadata = {"commit": run(["git", "rev-parse", "HEAD"], "commit").strip(),
                "xcode": version, "runtime": RUNTIME, "deviceName": DEVICE, "deviceUDID": udid,
                "runnerImageVersion": os.environ.get("ImageVersion"), "preflightOnly": args.preflight,
                "distributionSigned": False, "genericBuildSigning": "disabled",
                "simulatorTestSigning": "ad-hoc", "simulatorTestSigningVerified": False,
                "localTextIntegration": text_environment is not None}
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
        run(["xcodebuild", "test-without-building", *test_selection,
             "-destination", f"platform=iOS Simulator,id={udid}",
             "CODE_SIGNING_ALLOWED=YES", "CODE_SIGN_IDENTITY=-",
             "-parallel-testing-enabled", "NO",
             "-resultBundlePath", str(output / "tests.xcresult")], "tests")
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
