#!/usr/bin/env python3
"""Unsigned native CI; fail closed when the pinned toolchain/runtime is unavailable."""
import argparse
import datetime
import json
import os
from pathlib import Path
import plistlib
import shlex
import subprocess
import sys

PROJECT = "ios/VisePanda/VisePanda.xcodeproj"
XCODE = "Xcode 26.6\nBuild version 17F113"
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-5"
DEVICE = "iPhone 17 Pro"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--preflight", action="store_true", help="Inspect toolchain and devices only")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if (output / "commands.jsonl").exists():
        raise RuntimeError("Use a fresh output directory to avoid mixing runs")
    developer = os.environ.get("DEVELOPER_DIR")
    if not developer or not Path(developer).is_dir():
        raise RuntimeError("DEVELOPER_DIR must point to the installed pinned Xcode")

    def run(command, name):
        started = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        (output / (name + ".log")).write_text(result.stdout)
        record = {"startedAt": started, "argv": command, "command": shlex.join(command),
                  "cwd": str(Path.cwd()), "developerDir": developer, "exitCode": result.returncode}
        with (output / "commands.jsonl").open("a") as stream:
            stream.write(json.dumps(record) + "\n")
        print(f"{name}: exit {result.returncode}", flush=True)
        if result.returncode:
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
                "signed": False}
    (output / "environment.json").write_text(json.dumps(metadata, indent=2) + "\n")
    if args.preflight:
        return
    # DerivedData stays outside the uploaded evidence; never upload an app or signing store.
    derived = output.parent / (output.name + "-derived")
    common = ["-project", PROJECT, "-scheme", "VisePanda", "-derivedDataPath", str(derived),
              "CODE_SIGNING_ALLOWED=NO"]
    run(["xcodebuild", "build", *common, "-destination", "generic/platform=iOS Simulator",
         "-resultBundlePath", str(output / "build.xcresult")], "build")
    info_path = derived / "Build/Products/Debug-iphonesimulator/VisePanda.app/Info.plist"
    with info_path.open("rb") as stream:
        info = plistlib.load(stream)
    (output / "bundle-version.json").write_text(json.dumps({key: info[key] for key in
        ["CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion"]}, indent=2) + "\n")
    run(["xcodebuild", "test", *common, "-destination", f"platform=iOS Simulator,id={udid}",
         "-parallel-testing-enabled", "NO", "-resultBundlePath", str(output / "tests.xcresult")], "tests")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
