"""Unit tests for scripts/ios/archive.py. Run from the repository root:

    python3 -m unittest discover -s scripts/ios -p 'test_*.py'

They need no Xcode, network, Apple account or signing material.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import stat
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archive  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PROFILE = ROOT / "ios/VisePanda/Distribution/testflight-staging.json"
TEAM = "ABCDE12345"
KEY_ID = "KEY1234567"
ISSUER = "01234567-89ab-cdef-0123-456789abcdef"
P8 = "-----BEGIN PRIVATE KEY-----\nMIGTAgEAsecretmaterial\n-----END PRIVATE KEY-----\n"
HELP = """
	destination : String

		Determines whether the app is exported locally or uploaded to Apple.

	manageAppVersionAndBuildNumber : Bool

	method : String

		Describes how Xcode should export the archive. Available options: app-store-connect, release-testing, enterprise, debugging. Defaults to debugging.

	signingStyle : String

	teamID : String

	uploadSymbols : Bool
"""


def profile_with(**settings):
    data = json.loads(PROFILE.read_text())
    data["buildSettings"].update(settings)
    handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
    json.dump(data, handle)
    handle.close()
    return handle.name


class ProfileTests(unittest.TestCase):
    def test_committed_profile_is_valid_and_matches_project(self):
        profile = archive.load_profile(PROFILE)
        archive.check_profile_matches_project(profile, (ROOT / archive.PBXPROJ).read_text())
        self.assertEqual(profile["buildSettings"], {
            "VP_NATIVE_ENVIRONMENT": "staging",
            "VP_NATIVE_STAGING_API_ORIGIN": "https://staging.go2china.space",
            "VP_NATIVE_TASK_CONTEXT": "knowledge_intent_v1"})

    def test_host_rule_mirrors_native_session_literally(self):
        swift = (ROOT / "ios/VisePanda/VisePanda/App/NativeSession.swift").read_text()
        literals = re.findall(r'#"(\^vp-v4-[^"]+)"#', swift)
        self.assertEqual(literals, [archive.STAGING_HOST_PATTERN])
        self.assertIn(f'host == "{archive.STAGING_CUSTOM_HOST}"', swift)

    def test_origin_rule(self):
        allowed = ["https://staging.go2china.space", "https://staging.go2china.space/",
                   "https://vp-v4-abc123-jtcao515s-projects.vercel.app"]
        refused = ["http://staging.go2china.space", "https://staging.go2china.space:443",
                   "https://staging.go2china.space/api", "https://go2china.space",
                   "https://vp-v4-abc-other-projects.vercel.app", "https://evil.example/staging.go2china.space",
                   "https://user@staging.go2china.space", "https://staging.go2china.space?x=1", ""]
        for origin in allowed:
            self.assertTrue(archive.staging_origin_allowed(origin), origin)
        for origin in refused:
            self.assertFalse(archive.staging_origin_allowed(origin), origin)

    def test_profile_refusals(self):
        for settings in ({"VP_NATIVE_ENVIRONMENT": "production"},
                         {"VP_NATIVE_STAGING_API_ORIGIN": "https://go2china.space"},
                         {"VP_NATIVE_TASK_CONTEXT": "unknown_v9"},
                         {"VP_EXTRA": "1"}):
            with self.subTest(settings=settings), self.assertRaises(archive.Refusal):
                archive.load_profile(profile_with(**settings))

    def test_profile_must_match_project_version(self):
        profile = archive.load_profile(PROFILE)
        with self.assertRaises(archive.Refusal):
            archive.check_profile_matches_project({**profile, "marketingVersion": "9.9.9"},
                                                  (ROOT / archive.PBXPROJ).read_text())


class BuildNumberTests(unittest.TestCase):
    def test_default_is_utc_and_monotonic(self):
        earlier = datetime.datetime(2026, 9, 23, 23, 59, 59, tzinfo=datetime.timezone.utc)
        later = earlier + datetime.timedelta(seconds=1)
        first, second = archive.default_build_number(earlier), archive.default_build_number(later)
        self.assertEqual(first, "20260923.235959")
        self.assertEqual(second, "20260924.000000")
        as_tuple = lambda value: tuple(int(part) for part in value.split("."))
        self.assertLess(as_tuple(first), as_tuple(second))
        archive.validate_build_number(first)
        shanghai = datetime.timezone(datetime.timedelta(hours=8))
        self.assertEqual(archive.default_build_number(earlier.astimezone(shanghai)), first)

    def test_validation(self):
        for good in ("1", "42.7", "20260923.153012", "1.2.3"):
            self.assertEqual(archive.validate_build_number(good), good)
        for bad in ("", "1.2.3.4", "v1", "1..2", "1234567890", "-1", "1.2a"):
            with self.subTest(bad=bad), self.assertRaises(archive.Refusal):
                archive.validate_build_number(bad)


class SigningInputTests(unittest.TestCase):
    def test_unsigned_needs_nothing(self):
        self.assertEqual(archive.signing_inputs("none", {}), {})

    def test_missing_material_fails_closed_and_names_only(self):
        with self.assertRaises(archive.Refusal) as caught:
            archive.signing_inputs("api-key", {"VP_ASC_KEY_ID": KEY_ID})
        message = str(caught.exception)
        for name in ("VP_IOS_TEAM_ID", "VP_ASC_ISSUER_ID", "VP_ASC_KEY_P8"):
            self.assertIn(name, message)
        self.assertNotIn(KEY_ID, message)
        with self.assertRaises(archive.Refusal):
            archive.signing_inputs("xcode-account", {})

    def test_invalid_values_are_not_echoed(self):
        env = {"VP_IOS_TEAM_ID": "team-lower", "VP_ASC_KEY_ID": KEY_ID, "VP_ASC_ISSUER_ID": ISSUER,
               "VP_ASC_KEY_P8": "not a key secretvalue"}
        with self.assertRaises(archive.Refusal) as caught:
            archive.signing_inputs("api-key", env)
        self.assertIn("invalid VP_IOS_TEAM_ID", str(caught.exception))
        self.assertIn("invalid VP_ASC_KEY_P8", str(caught.exception))
        self.assertNotIn("secretvalue", str(caught.exception))
        self.assertNotIn("team-lower", str(caught.exception))

    def test_exactly_one_key_source(self):
        env = {"VP_IOS_TEAM_ID": TEAM, "VP_ASC_KEY_ID": KEY_ID, "VP_ASC_ISSUER_ID": ISSUER,
               "VP_ASC_KEY_P8": P8, "VP_ASC_KEY_PATH": "/tmp/AuthKey.p8"}
        with self.assertRaises(archive.Refusal):
            archive.signing_inputs("api-key", env)

    def test_key_file_must_be_private(self):
        with tempfile.TemporaryDirectory() as directory:
            key = Path(directory) / "AuthKey.p8"
            key.write_text(P8)
            key.chmod(0o644)
            env = {"VP_IOS_TEAM_ID": TEAM, "VP_ASC_KEY_ID": KEY_ID, "VP_ASC_ISSUER_ID": ISSUER, "VP_ASC_KEY_PATH": str(key)}
            with self.assertRaises(archive.Refusal):
                archive.signing_inputs("api-key", env)
            key.chmod(stat.S_IRUSR | stat.S_IWUSR)
            self.assertEqual(archive.signing_inputs("api-key", env)["keyPath"], str(key))

    def test_valid_api_key_and_xcode_account(self):
        values = archive.signing_inputs("api-key", {"VP_IOS_TEAM_ID": TEAM, "VP_ASC_KEY_ID": KEY_ID,
                                                    "VP_ASC_ISSUER_ID": ISSUER, "VP_ASC_KEY_P8": P8})
        self.assertEqual((values["teamID"], values["keyID"], values["issuerID"]), (TEAM, KEY_ID, ISSUER))
        self.assertEqual(archive.signing_inputs("xcode-account", {"VP_IOS_TEAM_ID": TEAM}), {"teamID": TEAM})


class ExportOptionTests(unittest.TestCase):
    def test_options_export_only_for_app_store_connect(self):
        options = archive.export_options(TEAM)
        self.assertEqual(options["method"], "app-store-connect")
        self.assertEqual(options["destination"], "export")  # never "upload"
        self.assertIs(options["manageAppVersionAndBuildNumber"], False)
        self.assertEqual(options["signingStyle"], "automatic")

    def test_supported_by_documented_toolchain_help(self):
        archive.check_export_options_supported(HELP, archive.export_options(TEAM))
        with self.assertRaises(archive.Refusal):
            archive.check_export_options_supported(HELP.replace("app-store-connect", "app-store"), archive.export_options(TEAM))
        with self.assertRaises(archive.Refusal):
            archive.check_export_options_supported(HELP.replace("uploadSymbols", "other"), archive.export_options(TEAM))


class RedactionTests(unittest.TestCase):
    def test_values_and_identities_are_redacted(self):
        redact = archive.redactor([TEAM, KEY_ID, ISSUER, "/private/tmp/vp-asc-x/AuthKey.p8", None, ""])
        text = (f"-authenticationKeyID {KEY_ID} -authenticationKeyIssuerID {ISSUER} "
                f"-authenticationKeyPath /private/tmp/vp-asc-x/AuthKey.p8 DEVELOPMENT_TEAM={TEAM}\n"
                "Authority=Apple Distribution: Some Person (ABCDE12345)\n"
                'Signing Identity:     "Apple Development: Some Person (XYZ)"\n')
        result = redact(text)
        for value in (TEAM, KEY_ID, ISSUER, "AuthKey.p8", "Some Person"):
            self.assertNotIn(value, result)
        self.assertIn("Authority=Apple Distribution: <redacted>", result)


class VerificationTests(unittest.TestCase):
    def setUp(self):
        self.profile = archive.load_profile(PROFILE)
        self.info = {"CFBundleIdentifier": "space.go2china.VisePanda", "CFBundleShortVersionString": "0.1.0",
                     "CFBundleVersion": "20260923.153012", "DTSDKName": "iphoneos27.0",
                     "VisePandaNativeEnvironment": "staging",
                     "VisePandaStagingAPIOrigin": "https://staging.go2china.space",
                     "VisePandaNativeTaskContext": "knowledge_intent_v1",
                     "ITSAppUsesNonExemptEncryption": False,
                     "NSLocationWhenInUseUsageDescription": "Not used."}

    def test_matching_info(self):
        self.assertEqual(archive.verify_app_info(self.info, self.profile, "20260923.153012"), [])

    def test_mismatches_and_old_sdk(self):
        info = {**self.info, "VisePandaStagingAPIOrigin": "", "DTSDKName": "iphoneos18.5"}
        problems = archive.verify_app_info(info, self.profile, "20260923.153013")
        self.assertEqual(len(problems), 3)
        self.assertTrue(any("upload floor" in problem for problem in problems))

    def test_export_compliance_and_purpose_string_required(self):
        info = {key: value for key, value in self.info.items()
                if key not in ("ITSAppUsesNonExemptEncryption", "NSLocationWhenInUseUsageDescription")}
        problems = archive.verify_app_info(info, self.profile, "20260923.153012")
        self.assertEqual(len(problems), 2)
        info = {**self.info, "ITSAppUsesNonExemptEncryption": "NO", "NSLocationWhenInUseUsageDescription": " "}
        self.assertEqual(len(archive.verify_app_info(info, self.profile, "20260923.153012")), 2)

    def test_distribution_profile(self):
        good = {"TeamIdentifier": [TEAM], "Entitlements": {
            "get-task-allow": False, "beta-reports-active": True,
            "application-identifier": f"{TEAM}.space.go2china.VisePanda"}}
        self.assertEqual(archive.verify_distribution_profile(good, TEAM, "space.go2china.VisePanda"), [])
        development = {**good, "ProvisionedDevices": ["x"], "Entitlements": {**good["Entitlements"], "get-task-allow": True}}
        self.assertEqual(len(archive.verify_distribution_profile(development, TEAM, "space.go2china.VisePanda")), 2)
        self.assertEqual(len(archive.verify_distribution_profile(good, "ZZZZZ99999", "space.go2china.VisePanda")), 2)


PRIVACY = ROOT / "ios/VisePanda/VisePanda/Resources/PrivacyInfo.xcprivacy"


def committed_privacy():
    with PRIVACY.open("rb") as stream:
        return plistlib.load(stream)


class PrivacyManifestTests(unittest.TestCase):
    def test_committed_manifest_is_valid_and_declares_expected_reasons(self):
        problems, summary = archive.verify_privacy_manifest(committed_privacy())
        self.assertEqual(problems, [])
        self.assertIs(summary["tracking"], False)
        self.assertEqual(summary["accessedAPITypes"], {
            "NSPrivacyAccessedAPICategoryUserDefaults": ["CA92.1"],
            "NSPrivacyAccessedAPICategorySystemBootTime": ["35F9.1"],
            "NSPrivacyAccessedAPICategoryFileTimestamp": ["C617.1"],
            "NSPrivacyAccessedAPICategoryDiskSpace": ["E174.1"]})
        kinds = {item["NSPrivacyCollectedDataType"]: item for item in summary["collectedDataTypes"]}
        self.assertEqual(set(kinds), {"NSPrivacyCollectedDataType" + name for name in (
            "EmailAddress", "UserID", "OtherUserContent", "CustomerSupport", "DeviceID", "ProductInteraction")})
        self.assertFalse(any(item["tracking"] for item in kinds.values()))
        self.assertTrue(kinds["NSPrivacyCollectedDataTypeEmailAddress"]["linked"])
        self.assertFalse(kinds["NSPrivacyCollectedDataTypeDeviceID"]["linked"])

    def test_committed_manifest_and_strings_are_app_resources(self):
        pbxproj = (ROOT / archive.PBXPROJ).read_text()
        phase = re.search(r"800000000000000000000002 /\* Resources \*/ = \{[^}]*files = \(([^)]*)\)", pbxproj)
        self.assertIsNotNone(phase)
        for name in ("PrivacyInfo.xcprivacy", "InfoPlist.xcstrings"):
            build_file = re.search(r"(\w{24}) /\* " + re.escape(name) + r" in Resources \*/", pbxproj)
            self.assertIsNotNone(build_file, name)
            self.assertIn(build_file.group(1), phase.group(1), name)

    def test_committed_info_plist_and_localized_purpose_string(self):
        with (ROOT / "ios/VisePanda/VisePanda/NativeEnvironment.plist").open("rb") as stream:
            info = plistlib.load(stream)
        self.assertIs(info["ITSAppUsesNonExemptEncryption"], False)
        catalog = json.loads((ROOT / "ios/VisePanda/VisePanda/Resources/InfoPlist.xcstrings").read_text())
        localizations = catalog["strings"]["NSLocationWhenInUseUsageDescription"]["localizations"]
        self.assertEqual(set(localizations), {"en", "zh-Hans"})
        self.assertEqual(localizations["en"]["stringUnit"]["value"], info["NSLocationWhenInUseUsageDescription"])
        self.assertTrue(localizations["zh-Hans"]["stringUnit"]["value"].strip())

    def test_refusals(self):
        base = committed_privacy()
        accessed = base["NSPrivacyAccessedAPITypes"]
        collected = base["NSPrivacyCollectedDataTypes"]
        sdk_only = [{**entry, "NSPrivacyAccessedAPITypeReasons": ["C56D.1"]}
                    if entry["NSPrivacyAccessedAPIType"].endswith("UserDefaults") else entry for entry in accessed]
        cases = {
            "lacks": {key: value for key, value in base.items() if key != "NSPrivacyTracking"},
            "not approved for an app: C56D.1": {**base, "NSPrivacyAccessedAPITypes": sdk_only},
            "unknown required-reason": {**base, "NSPrivacyAccessedAPITypes": accessed + [
                {"NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryMadeUp", "NSPrivacyAccessedAPITypeReasons": ["X.1"]}]},
            "used by the executable": {**base, "NSPrivacyAccessedAPITypes": [
                entry for entry in accessed if not entry["NSPrivacyAccessedAPIType"].endswith("DiskSpace")]},
            "more than once": {**base, "NSPrivacyAccessedAPITypes": accessed + accessed[:1]},
            "no reason codes": {**base, "NSPrivacyAccessedAPITypes": [
                {**accessed[0], "NSPrivacyAccessedAPITypeReasons": []}] + accessed[1:]},
            "marked as tracking": {**base, "NSPrivacyCollectedDataTypes": [
                {**collected[0], "NSPrivacyCollectedDataTypeTracking": True}] + collected[1:]},
            "non-empty while": {**base, "NSPrivacyTrackingDomains": ["tracker.example"]},
            "unknown purposes": {**base, "NSPrivacyCollectedDataTypes": [
                {**collected[0], "NSPrivacyCollectedDataTypePurposes": ["Marketing"]}] + collected[1:]},
            "must have exactly": {**base, "NSPrivacyCollectedDataTypes": [
                {"NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeName"}]},
        }
        for fragment, manifest in cases.items():
            with self.subTest(fragment=fragment):
                problems, _ = archive.verify_privacy_manifest(manifest)
                self.assertTrue(any(fragment in problem for problem in problems), problems)
        self.assertEqual(archive.verify_privacy_manifest([])[0], ["privacy manifest root is not a dictionary"])

    def test_built_app_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory) / "VisePanda.app"
            app.mkdir()
            problems, _ = archive.verify_app_privacy(app)
            self.assertEqual(problems, ["PrivacyInfo.xcprivacy is missing from the app bundle root"])
            (app / "PrivacyInfo.xcprivacy").write_text("not a plist")
            problems, _ = archive.verify_app_privacy(app)
            self.assertEqual(len(problems), 1)
            self.assertIn("not a valid property list", problems[0])
            (app / "PrivacyInfo.xcprivacy").write_bytes(PRIVACY.read_bytes())
            for locale in archive.PURPOSE_STRING_LOCALES:
                (app / f"{locale}.lproj").mkdir()
                (app / f"{locale}.lproj" / "InfoPlist.strings").write_bytes(plistlib.dumps(
                    {"NSLocationWhenInUseUsageDescription": "text"}, fmt=plistlib.FMT_BINARY))
            problems, summary = archive.verify_app_privacy(app)
            self.assertEqual(problems, [])
            self.assertEqual(summary["purposeStringLocales"], {"NSLocationWhenInUseUsageDescription": ["en", "zh-Hans"]})
            self.assertEqual(summary["sha256"], hashlib.sha256(PRIVACY.read_bytes()).hexdigest())
            (app / "zh-Hans.lproj" / "InfoPlist.strings").unlink()
            problems, _ = archive.verify_app_privacy(app)
            self.assertEqual(problems, ["NSLocationWhenInUseUsageDescription is not localized for zh-Hans (InfoPlist.strings)"])


class MainRefusalTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        self.cwd = os.getcwd()
        os.chdir(ROOT)
        self.addCleanup(os.chdir, self.cwd)

    def invoke(self, *extra, env=None):
        environment = {"DEVELOPER_DIR": self.directory.name, **(env or {})}
        with mock.patch.dict(os.environ, environment, clear=True), \
                mock.patch.object(archive.subprocess, "run", side_effect=AssertionError("must not run")) as run:
            with self.assertRaises(archive.Refusal) as caught:
                archive.main(["--output", str(self.base / "evidence"), "--products", str(self.base / "products"), *extra])
            run.assert_not_called()
        return str(caught.exception)

    def test_signed_without_material_builds_nothing(self):
        message = self.invoke("--signing", "api-key")
        self.assertIn("fail-closed", message)
        self.assertFalse((self.base / "evidence").exists())
        self.assertFalse((self.base / "products").exists())

    def test_products_must_not_be_inside_evidence(self):
        with mock.patch.dict(os.environ, {"DEVELOPER_DIR": self.directory.name}, clear=True):
            with self.assertRaises(archive.Refusal):
                archive.main(["--output", str(self.base), "--products", str(self.base / "products"), "--signing", "none"])

    def test_dirty_override_is_unsigned_only(self):
        self.assertIn("unsigned diagnosis", self.invoke("--signing", "xcode-account", "--allow-dirty",
                                                        env={"VP_IOS_TEAM_ID": TEAM}))

    def test_missing_developer_dir(self):
        with mock.patch.dict(os.environ, {}, clear=True), self.assertRaises(archive.Refusal):
            archive.main(["--output", str(self.base / "e"), "--products", str(self.base / "p"), "--signing", "none"])


if __name__ == "__main__":
    unittest.main()
