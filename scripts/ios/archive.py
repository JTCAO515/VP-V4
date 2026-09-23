#!/usr/bin/env python3
"""Native Archive: Release archive of one commit, optional App Store Connect export.

Modes (``--signing``):
  none           Unsigned device Archive. Proves the Release/device build, version and
                 installed Staging configuration; produces nothing installable or uploadable.
  api-key        Signed Archive plus ``app-store-connect`` export with automatic signing,
                 authenticated by an App Store Connect API key read from the environment.
  xcode-account  Same, authenticated by the Apple ID already signed in to this Mac's Xcode
                 and the identities in its login keychain.

Signing material is never read from the repository or arguments. Missing material refuses
the signed run (fail-closed) before any build; there is no unsigned fallback. Nothing is
uploaded to App Store Connect. Products (xcarchive/ipa) stay in ``--products``, outside the
evidence directory, so CI evidence uploads never contain an installable or signed binary.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ci import PROJECT, XCODE_VERSIONS  # noqa: E402  Reuse the existing pinned toolchain allowlist.

SCHEME = "VisePanda"
PBXPROJ = Path(PROJECT) / "project.pbxproj"
AMAP_FRAMEWORKS = ("ios/VisePanda/.local/amap/MAMapKit.framework",
                   "ios/VisePanda/.local/amap/AMapFoundationKit.framework")
PROFILE_BUILD_SETTINGS = ("VP_NATIVE_ENVIRONMENT", "VP_NATIVE_STAGING_API_ORIGIN", "VP_NATIVE_TASK_CONTEXT")
INFO_KEYS = {"VP_NATIVE_ENVIRONMENT": "VisePandaNativeEnvironment",
             "VP_NATIVE_STAGING_API_ORIGIN": "VisePandaStagingAPIOrigin",
             "VP_NATIVE_TASK_CONTEXT": "VisePandaNativeTaskContext"}
# Must stay identical to NativeSession.resolveEndpoint; a unit test compares the literals.
STAGING_HOST_PATTERN = r"^vp-v4-[a-z0-9]+-jtcao515s-projects\.vercel\.app$"
STAGING_CUSTOM_HOST = "staging.go2china.space"
TASK_CONTEXTS = frozenset({"", "task_history_v1", "knowledge_intent_v1"})
EXPORT_METHOD = "app-store-connect"
MINIMUM_UPLOAD_SDK_MAJOR = 26  # Apple: uploads from 2026-04-28 need the iOS 26 SDK or later.
SIGNING_MODES = ("none", "api-key", "xcode-account")


class Refusal(RuntimeError):
    """A precondition failed before any build; exit 2 so callers can tell it from a build failure."""


def load_profile(path):
    profile = json.loads(Path(path).read_text())
    expected = {"schemaVersion", "name", "purpose", "bundleIdentifier", "marketingVersion", "buildSettings"}
    if not isinstance(profile, dict) or set(profile) != expected or profile["schemaVersion"] != 1:
        raise Refusal("Distribution profile must have exactly the schema-1 keys " + ", ".join(sorted(expected)))
    settings = profile["buildSettings"]
    if not isinstance(settings, dict) or set(settings) != set(PROFILE_BUILD_SETTINGS):
        raise Refusal("Distribution profile buildSettings must be exactly " + ", ".join(PROFILE_BUILD_SETTINGS))
    if any(not isinstance(value, str) for value in settings.values()):
        raise Refusal("Distribution profile build settings must be strings")
    if settings["VP_NATIVE_ENVIRONMENT"] != "staging":
        raise Refusal("Only the staging environment is distributable; NativeSession has no production origin")
    if not staging_origin_allowed(settings["VP_NATIVE_STAGING_API_ORIGIN"]):
        raise Refusal("VP_NATIVE_STAGING_API_ORIGIN is not an origin NativeSession accepts")
    if settings["VP_NATIVE_TASK_CONTEXT"] not in TASK_CONTEXTS:
        raise Refusal("VP_NATIVE_TASK_CONTEXT is not a NativeAskMode raw value")
    if not re.fullmatch(r"[A-Za-z0-9.-]+", profile["bundleIdentifier"]):
        raise Refusal("Invalid bundle identifier")
    if not re.fullmatch(r"[0-9]+(\.[0-9]+){0,2}", profile["marketingVersion"]):
        raise Refusal("Invalid marketing version")
    return profile


def staging_origin_allowed(raw):
    """Mirror of NativeSession.resolveEndpoint for the installed Staging origin."""
    match = re.fullmatch(r"https://([a-z0-9.-]+)/?", raw)
    if not match:
        return False
    host = match.group(1)
    return host == STAGING_CUSTOM_HOST or re.search(STAGING_HOST_PATTERN, host) is not None


def project_values(pbxproj_text):
    """Return the app target's MARKETING_VERSION and PRODUCT_BUNDLE_IDENTIFIER across configurations."""
    marketing = set(re.findall(r"MARKETING_VERSION = ([^;]+);", pbxproj_text))
    bundles = set(re.findall(r"PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);", pbxproj_text))
    return marketing, bundles


def check_profile_matches_project(profile, pbxproj_text):
    marketing, bundles = project_values(pbxproj_text)
    if marketing != {profile["marketingVersion"]}:
        raise Refusal(f"Profile marketing version {profile['marketingVersion']!r} differs from project {sorted(marketing)!r}")
    if profile["bundleIdentifier"] not in bundles:
        raise Refusal(f"Profile bundle identifier {profile['bundleIdentifier']!r} is not a project target")


def default_build_number(now):
    """Monotonic, stateless CFBundleVersion: UTC date '.' UTC time, e.g. 20260923.153012."""
    return now.astimezone(datetime.timezone.utc).strftime("%Y%m%d.%H%M%S")


def validate_build_number(value):
    if not re.fullmatch(r"[0-9]{1,9}(\.[0-9]{1,9}){0,2}", value) or len(value) > 18:
        raise Refusal("Build number must be one to three period-separated integers (each <= 9 digits, <= 18 chars)")
    return value


def signing_inputs(mode, env):
    """Validate signing material from the environment without echoing any value."""
    if mode == "none":
        return {}
    missing, invalid = [], []

    def need(name, pattern):
        value = env.get(name, "")
        if not value:
            missing.append(name)
        elif not re.fullmatch(pattern, value):
            invalid.append(name)
        return value

    values = {"teamID": need("VP_IOS_TEAM_ID", r"[A-Z0-9]{10}")}
    if mode == "api-key":
        values["keyID"] = need("VP_ASC_KEY_ID", r"[A-Z0-9]{8,12}")
        values["issuerID"] = need("VP_ASC_ISSUER_ID", r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
        content, path = env.get("VP_ASC_KEY_P8", ""), env.get("VP_ASC_KEY_PATH", "")
        if bool(content) == bool(path):
            missing.append("exactly one of VP_ASC_KEY_P8 or VP_ASC_KEY_PATH")
        elif content:
            if "-----BEGIN PRIVATE KEY-----" not in content or "-----END PRIVATE KEY-----" not in content:
                invalid.append("VP_ASC_KEY_P8")
            values["keyContent"] = content
        else:
            key = Path(path).expanduser()
            if not key.is_file():
                invalid.append("VP_ASC_KEY_PATH (not a file)")
            elif key.stat().st_mode & 0o077:
                invalid.append("VP_ASC_KEY_PATH (readable by group/others; chmod 600)")
            values["keyPath"] = str(key)
    if missing or invalid:
        problems = [f"missing {name}" for name in missing] + [f"invalid {name}" for name in invalid]
        raise Refusal("Signed archive refused (fail-closed, nothing built, no unsigned fallback): "
                      + "; ".join(problems) + ". Provide them via CI secrets or the local environment; "
                      "see docs/runbooks/ios-signing-and-testflight.md.")
    return values


def export_options(team_id):
    """ExportOptions for an App Store Connect (TestFlight) ipa. Export only; never uploads."""
    return {"method": EXPORT_METHOD, "destination": "export", "signingStyle": "automatic",
            "teamID": team_id, "uploadSymbols": True, "manageAppVersionAndBuildNumber": False}


def check_export_options_supported(help_text, options):
    """The installed xcodebuild documents every key and the method we rely on."""
    missing = [key for key in options if not re.search(rf"^\s*{re.escape(key)} : ", help_text, re.M)]
    if not re.search(rf"method : String\s.*Available options: [^\n]*\b{EXPORT_METHOD}\b", help_text, re.S):
        missing.append("method " + EXPORT_METHOD)
    if missing:
        raise Refusal("Installed xcodebuild does not document export option(s): " + ", ".join(missing))


def redactor(secrets):
    values = sorted({value for value in secrets if value and len(value) >= 6}, key=len, reverse=True)
    identity = re.compile(r"((?:Apple|iPhone) (?:Distribution|Development)|Developer ID Application): [^\n\"]+")

    def redact(text):
        for value in values:
            text = text.replace(value, "<redacted>")
        return identity.sub(lambda match: match.group(1) + ": <redacted>", text)
    return redact


def sdk_major(dt_sdk_name):
    match = re.fullmatch(r"iphoneos([0-9]+)(\.[0-9]+)*", dt_sdk_name or "")
    return int(match.group(1)) if match else None


def verify_app_info(info, profile, build_number):
    """Compare the archived app's merged Info.plist with the committed profile."""
    problems = []
    expected = {"CFBundleIdentifier": profile["bundleIdentifier"],
                "CFBundleShortVersionString": profile["marketingVersion"],
                "CFBundleVersion": build_number}
    expected.update({INFO_KEYS[name]: value for name, value in profile["buildSettings"].items()})
    for key, value in expected.items():
        if info.get(key) != value:
            problems.append(f"{key}={info.get(key)!r}, expected {value!r}")
    major = sdk_major(info.get("DTSDKName"))
    if major is None or major < MINIMUM_UPLOAD_SDK_MAJOR:
        problems.append(f"DTSDKName={info.get('DTSDKName')!r} is below the iOS {MINIMUM_UPLOAD_SDK_MAJOR} SDK upload floor")
    return problems


def verify_distribution_profile(profile_plist, team_id, bundle_id):
    """An App Store Connect profile: no device list, no debugger, TestFlight-eligible, this app/team."""
    problems = []
    entitlements = profile_plist.get("Entitlements", {})
    if "ProvisionedDevices" in profile_plist or profile_plist.get("ProvisionsAllDevices"):
        problems.append("profile lists devices (development/ad-hoc/enterprise), not App Store Connect")
    if entitlements.get("get-task-allow") is not False:
        problems.append("get-task-allow is not false")
    if entitlements.get("beta-reports-active") is not True:
        problems.append("beta-reports-active is not true (not TestFlight-eligible)")
    if team_id not in profile_plist.get("TeamIdentifier", []):
        problems.append("profile team differs from VP_IOS_TEAM_ID")
    if entitlements.get("application-identifier") != f"{team_id}.{bundle_id}":
        problems.append("application-identifier does not match team/bundle")
    return problems


def is_within(child, parent):
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", required=True, type=Path, help="Fresh evidence directory (safe to upload)")
    parser.add_argument("--products", required=True, type=Path, help="Fresh directory for xcarchive/ipa/DerivedData; never uploaded")
    parser.add_argument("--profile", type=Path, default=Path("ios/VisePanda/Distribution/testflight-staging.json"))
    parser.add_argument("--signing", choices=SIGNING_MODES, required=True)
    parser.add_argument("--build-number", help="Override CFBundleVersion (default: UTC YYYYMMDD.HHMMSS)")
    parser.add_argument("--check-only", action="store_true", help="Validate inputs, toolchain and export options; build nothing")
    parser.add_argument("--allow-dirty", action="store_true", help="Unsigned local diagnosis of uncommitted source only")
    args = parser.parse_args(argv)

    output, products = args.output.resolve(), args.products.resolve()
    if is_within(products, output) or is_within(output, products):
        raise Refusal("--products and --output must be separate trees so evidence never contains a binary")
    if args.allow_dirty and args.signing != "none":
        raise Refusal("--allow-dirty is only for unsigned diagnosis; signed builds need a clean commit")
    for directory in (output, products):
        if directory.exists() and any(directory.iterdir()):
            raise Refusal(f"Use a fresh, empty directory: {directory}")
    developer = os.environ.get("DEVELOPER_DIR")
    if not developer or not Path(developer).is_dir():
        raise Refusal("DEVELOPER_DIR must point to the installed pinned Xcode")

    profile = load_profile(args.profile)
    check_profile_matches_project(profile, PBXPROJ.read_text())
    build_number = validate_build_number(args.build_number or default_build_number(datetime.datetime.now(datetime.timezone.utc)))
    signing = signing_inputs(args.signing, os.environ)
    output.mkdir(parents=True, exist_ok=True)
    products.mkdir(parents=True, exist_ok=True)

    key_dir = None
    if signing.get("keyContent"):
        key_dir = Path(tempfile.mkdtemp(prefix="vp-asc-"))
        key_dir.chmod(0o700)
        key_file = key_dir / "AuthKey.p8"
        descriptor = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            stream.write(signing.pop("keyContent"))
        signing["keyPath"] = str(key_file)
    redact = redactor([signing.get("teamID"), signing.get("keyID"), signing.get("issuerID"), signing.get("keyPath")])

    def run(command, name, allow_failure=False):
        started = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        (output / (name + ".log")).write_text(redact(result.stdout))
        record = {"startedAt": started, "argv": [redact(part) for part in command],
                  "command": redact(shlex.join(command)), "cwd": str(Path.cwd()),
                  "developerDir": developer, "exitCode": result.returncode}
        with (output / "commands.jsonl").open("a") as stream:
            stream.write(json.dumps(record) + "\n")
        print(f"{name}: exit {result.returncode}", flush=True)
        if result.returncode and not allow_failure:
            print(redact(result.stdout[-12000:]), file=sys.stderr)
            raise subprocess.CalledProcessError(result.returncode, redact(shlex.join(command)))
        return result.stdout

    manifest = {"commit": None, "sourceClean": None, "profile": str(args.profile), "profileName": profile["name"],
                "bundleIdentifier": profile["bundleIdentifier"], "marketingVersion": profile["marketingVersion"],
                "buildNumber": build_number, "buildSettings": profile["buildSettings"], "signing": args.signing,
                "exportMethod": None if args.signing == "none" else EXPORT_METHOD,
                "checkOnly": args.check_only, "archived": False, "exported": False, "uploaded": False}

    def save_manifest():
        (output / "build-manifest.json").write_text(redact(json.dumps(manifest, indent=2)) + "\n")

    try:
        version = run(["xcodebuild", "-version"], "xcode-version").strip()
        if version not in XCODE_VERSIONS:
            raise Refusal(f"Expected one of {sorted(XCODE_VERSIONS)!r}, found {version!r}; no automatic fallback")
        manifest["xcode"] = version
        manifest["commit"] = run(["git", "rev-parse", "HEAD"], "commit").strip()
        manifest["sourceClean"] = run(["git", "status", "--porcelain"], "source-status").strip() == ""
        save_manifest()
        if not manifest["sourceClean"] and not args.allow_dirty:
            raise Refusal("Working tree has uncommitted changes; an Archive must map to exactly one commit")
        missing_sdk = [path for path in AMAP_FRAMEWORKS if not Path(path).is_dir()]
        if missing_sdk:
            raise Refusal("Device builds link the pinned AMap SDK; run `node scripts/maps/install-ios-sdk.mjs` first")

        help_text = run(["xcodebuild", "-help"], "xcodebuild-help")
        options = export_options(signing.get("teamID", "TEAMID0000"))
        check_export_options_supported(help_text, options)
        if args.signing != "none":
            options_path = products / "ExportOptions.plist"
            with options_path.open("wb") as stream:
                plistlib.dump(options, stream)
            run(["plutil", "-lint", str(options_path)], "export-options-lint")
            (output / "ExportOptions.redacted.plist").write_bytes(
                plistlib.dumps({**options, "teamID": "<redacted>"}))
        if args.check_only:
            save_manifest()
            return

        archive = products / "VisePanda.xcarchive"
        auth = []
        if args.signing == "api-key":
            auth = ["-authenticationKeyPath", signing["keyPath"], "-authenticationKeyID", signing["keyID"],
                    "-authenticationKeyIssuerID", signing["issuerID"]]
        overrides = [f"{name}={value}" for name, value in profile["buildSettings"].items()]
        overrides.append(f"CURRENT_PROJECT_VERSION={build_number}")
        if args.signing == "none":
            sign = ["CODE_SIGNING_ALLOWED=NO"]
        else:
            sign = ["-allowProvisioningUpdates", *auth, f"DEVELOPMENT_TEAM={signing['teamID']}", "CODE_SIGN_STYLE=Automatic"]
        run(["xcodebuild", "archive", "-project", PROJECT, "-scheme", SCHEME, "-configuration", "Release",
             "-destination", "generic/platform=iOS", "-archivePath", str(archive),
             "-derivedDataPath", str(products / "DerivedData"),
             # A signed run's result bundle records unredacted signing arguments: keep it with the products.
             "-resultBundlePath", str((output if args.signing == "none" else products) / "archive.xcresult"),
             *sign, *overrides], "archive")
        manifest["archived"] = True

        with (archive / "Info.plist").open("rb") as stream:
            archive_info = plistlib.load(stream)
        app = archive / "Products" / archive_info["ApplicationProperties"]["ApplicationPath"]
        with (app / "Info.plist").open("rb") as stream:
            info = plistlib.load(stream)
        manifest["appInfo"] = {key: info.get(key) for key in [
            "CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion", "MinimumOSVersion",
            "DTSDKName", "DTXcode", "DTXcodeBuild", *INFO_KEYS.values()]}
        manifest["amapDisplayKeyConfigured"] = bool(info.get("VisePandaAMapIOSKey"))
        manifest["exportComplianceDeclared"] = "ITSAppUsesNonExemptEncryption" in info
        problems = verify_app_info(info, profile, build_number)
        manifest["infoPlistProblems"] = problems
        manifest["archiveSignature"] = redact(run(["codesign", "-dv", "--verbose=2", str(app)], "archive-signature",
                                                  allow_failure=True)).splitlines()[-6:]
        save_manifest()
        if problems:
            raise Refusal("Archived Info.plist does not match the distribution profile: " + "; ".join(problems))
        if args.signing == "none":
            return

        export = products / "export"
        run(["xcodebuild", "-exportArchive", "-archivePath", str(archive), "-exportPath", str(export),
             "-exportOptionsPlist", str(products / "ExportOptions.plist"), "-allowProvisioningUpdates", *auth], "export")
        ipas = sorted(export.glob("*.ipa"))
        if len(ipas) != 1:
            raise Refusal(f"Expected exactly one exported ipa, found {len(ipas)}")
        manifest["ipaSHA256"] = hashlib.sha256(ipas[0].read_bytes()).hexdigest()
        manifest["ipaBytes"] = ipas[0].stat().st_size
        unpacked = products / "ipa-inspection"
        with zipfile.ZipFile(ipas[0]) as bundle:
            bundle.extractall(unpacked)
        exported_apps = list((unpacked / "Payload").glob("*.app"))
        if len(exported_apps) != 1:
            raise Refusal("Exported ipa must contain exactly one app")
        exported = exported_apps[0]
        with (exported / "Info.plist").open("rb") as stream:
            exported_problems = verify_app_info(plistlib.load(stream), profile, build_number)
        signature = run(["codesign", "-dv", "--verbose=4", str(exported)], "export-signature")
        run(["codesign", "--verify", "--strict", "--deep", str(exported)], "export-signature-verification")
        if "Authority=Apple Distribution" not in signature:
            exported_problems.append("exported app is not signed by an Apple Distribution identity")
        decoded = subprocess.run(["security", "cms", "-D", "-i", str(exported / "embedded.mobileprovision")],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout
        provisioning = plistlib.loads(decoded)
        exported_problems += verify_distribution_profile(provisioning, signing["teamID"], profile["bundleIdentifier"])
        manifest["provisioningProfile"] = {"expires": provisioning.get("ExpirationDate").isoformat()
                                           if provisioning.get("ExpirationDate") else None,
                                           "betaReportsActive": provisioning.get("Entitlements", {}).get("beta-reports-active")}
        manifest["exportProblems"] = exported_problems
        manifest["exported"] = not exported_problems
        shutil.rmtree(unpacked)
        save_manifest()
        if exported_problems:
            raise Refusal("Exported ipa failed distribution checks: " + "; ".join(exported_problems))
        print(f"Exported {ipas[0]} (build {build_number}); not uploaded.", flush=True)
    finally:
        save_manifest()
        if key_dir is not None:
            shutil.rmtree(key_dir, ignore_errors=True)


if __name__ == "__main__":
    try:
        main()
    except Refusal as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
