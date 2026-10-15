#!/usr/bin/env python3
"""Build only a clean, labeled local sample. No signing/export/upload modes exist."""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[3]
PROFILE = ROOT / "ios/VisePanda/Distribution/testflight-controlled-sample.json"
ROLLOUT = ROOT / "ios/VisePanda/VisePanda/App/AppShellView.swift"
EVIDENCE_ROOT = ROOT / "artifacts/IOS-TESTFLIGHT/controlled-20261015"
spec = importlib.util.spec_from_file_location("existing_archive_checks", ROOT / "scripts/ios/archive.py")
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)
Refusal = checks.Refusal


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_profile(path):
    profile = json.loads(Path(path).read_text())
    expected = {"schemaVersion", "name", "purpose", "bundleIdentifier", "marketingVersion",
                "minimumOSVersion", "compilationConditions", "buildSettings"}
    if not isinstance(profile, dict) or set(profile) != expected or profile["schemaVersion"] != 1:
        raise Refusal("Expected exactly the controlled sample schema-1 profile")
    if (profile["name"] != "testflight-controlled-sample" or
            profile["bundleIdentifier"] != "space.go2china.VisePanda" or
            profile["marketingVersion"] != "0.1.0" or profile["minimumOSVersion"] != "17.0"):
        raise Refusal("Controlled sample bundle/version/minimum OS mismatch")
    if profile["compilationConditions"] != ["VP_CONTROLLED_SAMPLE"]:
        raise Refusal("Only VP_CONTROLLED_SAMPLE compilation condition is permitted")
    if profile["buildSettings"] != dict.fromkeys(checks.PROFILE_BUILD_SETTINGS, ""):
        raise Refusal("All three backend settings must be present and exactly empty")
    if not isinstance(profile["purpose"], str) or "未连接真实服务" not in profile["purpose"]:
        raise Refusal("Controlled sample must identify its service limitation")
    return profile


def run(command, *, env=None, log=None):
    if log:
        with Path(log).open("w") as stream:
            result = subprocess.run(command, cwd=ROOT, env=env, stdout=stream, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError(f"{command[0]} exited {result.returncode}; see {log}")
        return ""
    return subprocess.run(command, cwd=ROOT, env=env, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).stdout


def source_snapshot(expected_head):
    head = run(["git", "rev-parse", "HEAD"]).strip()
    if head != expected_head or not re.fullmatch(r"[0-9a-f]{40}", expected_head):
        raise Refusal("Exact source HEAD differs from --expected-head")
    if run(["git", "status", "--porcelain", "--untracked-files=all"]).strip():
        raise Refusal("Dirty source refused; commit intended inputs before building")
    paths = run(["git", "ls-files", "ios/VisePanda", "scripts/ios", "scripts/maps/install-ios-sdk.mjs",
                 "tests/contract/ios-controlled-testflight"]).splitlines()
    hashes = {path: digest(ROOT / path) for path in paths if (ROOT / path).is_file()}
    return {"head": head, "clean": True, "inputHashes": hashes,
            "inputSetSHA256": hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()}


def build_environment():
    # No inherited credentials, xcconfig overrides, provider endpoints or signing env.
    return {key: os.environ[key] for key in ("PATH", "HOME", "TMPDIR", "DEVELOPER_DIR") if key in os.environ}


def verify_sdk():
    installer = ROOT / "scripts/maps/install-ios-sdk.mjs"
    pins = re.findall(r"\['([^']+\.zip)', '(https://a\.amap\.com/[^']+)', '([0-9a-f]{64})'\]", installer.read_text())
    if len(pins) != 2:
        raise Refusal("Cannot read the two existing official SDK pins")
    summary = {}
    for name, _url, expected in pins:
        path = ROOT / "ios/VisePanda/.local/amap" / name
        if not path.is_file() or digest(path) != expected:
            raise Refusal("Missing or mismatched pinned SDK archive: " + name)
        # Verify extracted inputs too: a valid zip alone does not pin the linked binaries/resources.
        count = 0
        with zipfile.ZipFile(path) as archive:
            for item in archive.infolist():
                if item.is_dir() or ".framework/" not in item.filename or item.filename.startswith("__MACOSX/"):
                    continue
                relative = Path(item.filename)
                if relative.is_absolute() or ".." in relative.parts:
                    raise Refusal("Unsafe SDK archive member")
                extracted = path.parent / relative
                if not extracted.is_file() or digest(extracted) != hashlib.sha256(archive.read(item)).hexdigest():
                    raise Refusal("Extracted SDK differs from pinned archive: " + item.filename)
                count += 1
        if not count:
            raise Refusal("Pinned SDK archive has no framework inputs")
        summary[name] = {"sha256": expected, "verifiedFrameworkFiles": count}
    return summary


def overrides(profile, number):
    return [*(f"{key}={value}" for key, value in profile["buildSettings"].items()),
            "SWIFT_ACTIVE_COMPILATION_CONDITIONS=VP_CONTROLLED_SAMPLE", "CODE_SIGNING_ALLOWED=NO",
            "CODE_SIGNING_REQUIRED=NO", "CODE_SIGN_IDENTITY=", "DEVELOPMENT_TEAM=",
            "PROVISIONING_PROFILE_SPECIFIER=", "AMAP_IOS_DISPLAY_KEY=",
            f"CURRENT_PROJECT_VERSION={number}"]


def verify_settings(entries, profile, number):
    seen = set()
    summary = {}
    for entry in entries:
        target, settings = entry["target"], entry["buildSettings"]
        seen.add(target)
        expected = {**profile["buildSettings"], "SWIFT_ACTIVE_COMPILATION_CONDITIONS": "VP_CONTROLLED_SAMPLE",
                    "CODE_SIGNING_ALLOWED": "NO", "CURRENT_PROJECT_VERSION": number,
                    "CONFIGURATION": "Release", "PLATFORM_NAME": "iphoneos",
                    "IPHONEOS_DEPLOYMENT_TARGET": "17.0"}
        for key, value in expected.items():
            # xcodebuild omits explicitly empty user settings from its JSON projection.
            observed = settings.get(key, "") if key in checks.PROFILE_BUILD_SETTINGS else settings.get(key)
            if observed != value:
                raise Refusal(f"Effective {target} setting mismatch: {key}")
        if target == "VisePanda" and (settings.get("PRODUCT_BUNDLE_IDENTIFIER") != profile["bundleIdentifier"] or
                                      settings.get("MARKETING_VERSION") != profile["marketingVersion"]):
            raise Refusal("Effective app bundle/version mismatch")
        summary[target] = {key: settings.get(key, "") if key in checks.PROFILE_BUILD_SETTINGS else settings.get(key)
                           for key in [*expected, "SDKROOT", "SDK_VERSION",
                                                            "PRODUCT_BUNDLE_IDENTIFIER", "MARKETING_VERSION"]}
        summary[target]["emptyBackendSettingsOmittedByXcode"] = [key for key in checks.PROFILE_BUILD_SETTINGS if key not in settings]
    if not {"VisePanda", "ShareIntakeExtension"} <= seen:
        raise Refusal("Build settings omit the app or ShareIntakeExtension")
    return summary


def rollout_source():
    text = ROLLOUT.read_text()
    start = text.index("enum NativeFrontendRollout {")
    # Extract the actual declaration, rejecting an incomplete extraction.
    depth = 0
    for index in range(start, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    raise Refusal("Cannot extract actual NativeFrontendRollout declaration")


def verify_rollout(products, env):
    folder = products / "rollout"
    folder.mkdir()
    source = folder / "main.swift"
    source.write_text("import Foundation\n" + rollout_source() + '''
let cases: [[String]] = [[], ["-VisePandaLegacyShell"], ["-V10RealServiceFrontend"],
    ["-V10FrontendExperience"], ["-VisePandaNativeAPI"], ["-VisePandaFourTabShell"],
    ["-V10FrontendExperience", "-V10RealServiceFrontend"]]
print(cases.map { NativeFrontendRollout.enabled(arguments: $0) ? "true" : "false" }.joined(separator: ","))
''')
    expected = {"sample-release": (["VP_CONTROLLED_SAMPLE"], [True] * 7),
                "release": ([], [False, False, False, True, False, False, False]),
                "debug": (["DEBUG"], [True, False, False, True, False, False, False]),
                "sample-debug": (["DEBUG", "VP_CONTROLLED_SAMPLE"], [True] * 7)}
    results = {}
    for name, (conditions, values) in expected.items():
        binary = folder / name
        run(["xcrun", "swiftc", "-O", "-module-cache-path", str(folder / "ModuleCache"),
             *(arg for flag in conditions for arg in ("-D", flag)), str(source), "-o", str(binary)], env=env)
        observed = run([str(binary)], env=env).strip().split(",")
        if observed != [str(value).lower() for value in values]:
            raise Refusal(f"Actual rollout compilation failed: {name}")
        results[name] = {"conditions": conditions, "results": observed, "status": "PASS"}
    return {"sourceSHA256": digest(ROLLOUT), "declarationSHA256": hashlib.sha256(rollout_source().encode()).hexdigest(),
            "cases": [[], ["-VisePandaLegacyShell"], ["-V10RealServiceFrontend"], ["-V10FrontendExperience"],
                      ["-VisePandaNativeAPI"], ["-VisePandaFourTabShell"],
                      ["-V10FrontendExperience", "-V10RealServiceFrontend"]], "compiled": results}


def verify_product(archive, profile, number):
    app = archive / "Products/Applications/VisePanda.app"
    with (app / "Info.plist").open("rb") as stream:
        info = plistlib.load(stream)
    problems = checks.verify_app_info(info, profile, number)
    privacy_problems, privacy = checks.verify_app_privacy(app)
    problems += privacy_problems
    if info.get("MinimumOSVersion") != "17.0" or info.get("DTPlatformName") != "iphoneos":
        problems.append("Expected an iOS device product with minimum OS 17.0")
    if info.get("VisePandaAMapIOSKey"):
        problems.append("Controlled sample must not contain an AMap credential")
    bundles = [app, *sorted((app / "PlugIns").glob("*.appex"))]
    if not any(bundle.name == "ShareIntakeExtension.appex" for bundle in bundles):
        problems.append("ShareIntakeExtension is missing")
    binaries = {}
    for bundle in bundles:
        if (bundle / "_CodeSignature").exists() or (bundle / "embedded.mobileprovision").exists():
            problems.append(f"Unexpected signing material in {bundle.name}")
        with (bundle / "Info.plist").open("rb") as stream:
            bundle_info = plistlib.load(stream)
        if bundle_info.get("CFBundleVersion") != number:
            problems.append(f"Build number mismatch in {bundle.name}")
        executable = bundle / bundle_info["CFBundleExecutable"]
        load_commands = run(["xcrun", "otool", "-l", str(executable)])
        if "LC_CODE_SIGNATURE" in load_commands:
            problems.append(f"Unexpected Mach-O code signature in {bundle.name}")
        binaries[str(bundle.relative_to(archive))] = {"executableSHA256": digest(executable),
                                                    "infoSHA256": digest(bundle / "Info.plist")}
    if problems:
        raise Refusal("Archived product checks failed: " + "; ".join(problems))
    return {"appInfo": {key: info.get(key) for key in ["CFBundleIdentifier", "CFBundleShortVersionString",
             "CFBundleVersion", "MinimumOSVersion", "DTSDKName", "DTXcode", "DTXcodeBuild", "DTPlatformName",
             "ITSAppUsesNonExemptEncryption", *checks.INFO_KEYS.values()]},
            "privacyManifest": privacy, "purposeStrings": {key: value for key, value in info.items()
                                                         if key.endswith("UsageDescription")}, "bundles": binaries}


def fresh_paths(evidence, products):
    evidence, products = evidence.resolve(), products.resolve()
    for path in (evidence, products):
        if not path.is_relative_to(EVIDENCE_ROOT.resolve()) or path == EVIDENCE_ROOT.resolve():
            raise Refusal("Outputs must be fresh child directories of controlled-20261015")
        if path.exists():
            raise Refusal("Output already exists; use a new nonce, never overwrite evidence/products")
    if evidence == products or evidence in products.parents or products in evidence.parents:
        raise Refusal("Evidence and unsigned products must be separate sibling trees")
    return evidence, products


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-head", required=True)
    parser.add_argument("--profile", type=Path, default=PROFILE)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--products", type=Path, required=True)
    parser.add_argument("--build-number", default=checks.default_build_number(datetime.datetime.now(datetime.timezone.utc)))
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    profile = load_profile(args.profile)
    if args.profile.resolve() != PROFILE:
        raise Refusal("Only the committed controlled sample profile is accepted")
    number = checks.validate_build_number(args.build_number)
    snapshot = source_snapshot(args.expected_head)
    checks.check_profile_matches_project(profile, (ROOT / checks.PBXPROJ).read_text())
    evidence, products = fresh_paths(args.evidence, args.products)
    env = build_environment()
    version = run(["xcodebuild", "-version"], env=env).strip()
    if version not in checks.XCODE_VERSIONS:
        raise Refusal("Xcode toolchain is not in the repository allowlist")
    if any(not (ROOT / path).is_dir() for path in checks.AMAP_FRAMEWORKS):
        raise Refusal("Install the pinned official SDK with scripts/maps/install-ios-sdk.mjs")
    sdk = verify_sdk()
    evidence.mkdir(parents=True)
    products.mkdir(parents=True)
    manifest = {"schemaVersion": 1, "status": "RUNNING", "source": snapshot,
                "profileSHA256": digest(PROFILE), "profile": profile, "buildNumber": number,
                "xcode": version, "signing": "none", "installable": False, "uploadable": False,
                "exported": False, "uploaded": False, "archiveStatus": "UNRUN",
                "products": str(products), "evidence": str(evidence),
                "runtime": {name: "UNRUN" for name in ("simulatorUI", "physicalDevice", "ASR", "provider", "GoTrue", "database")},
                "startedUTC": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    def save():
        (evidence / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    save()
    try:
        base = ["xcodebuild", "-project", checks.PROJECT, "-scheme", "VisePanda", "-configuration", "Release",
                "-destination", "generic/platform=iOS", "-derivedDataPath", str(products / "DerivedData"),
                "-disableAutomaticPackageResolution", *overrides(profile, number)]
        settings = json.loads(run([*base, "-showBuildSettings", "-json"], env=env))
        extension_settings = json.loads(run(["xcodebuild", "-project", checks.PROJECT,
            "-target", "ShareIntakeExtension", "-configuration", "Release", "-sdk", "iphoneos",
            *overrides(profile, number), "-showBuildSettings", "-json"], env=env))
        settings.extend(extension_settings)
        manifest["effectiveBuildSettings"] = verify_settings(settings, profile, number)
        manifest["rollout"] = verify_rollout(products, env)
        manifest["sdkArchiveHashes"] = sdk
        save()
        if not args.check_only:
            archive = products / "VisePanda.xcarchive"
            command = [*base, "archive", "-archivePath", str(archive), "-resultBundlePath", str(products / "archive.xcresult")]
            manifest["archiveCommand"] = command
            manifest["archiveStatus"] = "RUNNING"
            save()
            run(command, env=env, log=products / "archive.log")
            manifest["archiveStatus"] = "BUILT"
            manifest.update(verify_product(archive, profile, number))
            manifest["archiveStatus"] = "PASS"
            manifest["archivePath"] = str(archive)
        final = source_snapshot(args.expected_head)
        if final != snapshot:
            raise Refusal("Source inputs changed during build")
        manifest["sourceAfter"] = {"head": final["head"], "clean": final["clean"], "inputSetSHA256": final["inputSetSHA256"]}
        manifest["status"] = "PASS"
    except Exception as error:
        manifest["status"] = "FAIL"
        manifest["failure"] = str(error)
        raise
    finally:
        manifest["finishedUTC"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        save()
    print(evidence / "manifest.json")


if __name__ == "__main__":
    try:
        main()
    except (Refusal, RuntimeError, subprocess.CalledProcessError, ValueError) as error:
        print(f"Controlled sample refused/failed: {error}", file=sys.stderr)
        sys.exit(2)
