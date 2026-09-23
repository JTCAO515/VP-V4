"""Unit tests for scripts/ios/archive.py. Run from the repository root:

    python3 -m unittest discover -s scripts/ios -p 'test_*.py'

They need no Xcode, network, Apple account or signing material.
"""
import datetime
import json
import os
from pathlib import Path
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
                     "VisePandaNativeTaskContext": "knowledge_intent_v1"}

    def test_matching_info(self):
        self.assertEqual(archive.verify_app_info(self.info, self.profile, "20260923.153012"), [])

    def test_mismatches_and_old_sdk(self):
        info = {**self.info, "VisePandaStagingAPIOrigin": "", "DTSDKName": "iphoneos18.5"}
        problems = archive.verify_app_info(info, self.profile, "20260923.153013")
        self.assertEqual(len(problems), 3)
        self.assertTrue(any("upload floor" in problem for problem in problems))

    def test_distribution_profile(self):
        good = {"TeamIdentifier": [TEAM], "Entitlements": {
            "get-task-allow": False, "beta-reports-active": True,
            "application-identifier": f"{TEAM}.space.go2china.VisePanda"}}
        self.assertEqual(archive.verify_distribution_profile(good, TEAM, "space.go2china.VisePanda"), [])
        development = {**good, "ProvisionedDevices": ["x"], "Entitlements": {**good["Entitlements"], "get-task-allow": True}}
        self.assertEqual(len(archive.verify_distribution_profile(development, TEAM, "space.go2china.VisePanda")), 2)
        self.assertEqual(len(archive.verify_distribution_profile(good, "ZZZZZ99999", "space.go2china.VisePanda")), 2)


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
