# VPJ-56 X1 signed-Archive path — 2026-09-23

Related to #508 / #237. Implementation commit `c8a2b9e2` (later commits in the PR change docs,
evidence and tests only). Local Mac: Xcode 27.0 / 27A266a, `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`,
pinned AMap SDK installed with `node scripts/maps/install-ios-sdk.mjs` (hash-checked).
No Apple account, certificate, profile or API key was used or present (`security find-identity`
reported 0 valid code-signing identities); nothing was uploaded.

| Check | Result |
| --- | --- |
| `python3 -m unittest discover -s scripts/ios -p 'test_*.py'` (23 tests: profile/origin rule, Swift regex parity, build number, fail-closed signing inputs, export options, redaction, Info.plist/profile verification, main refusals) | PASS |
| `node --test tests/unit/governance/native-ios-archive.test.mjs` (workflow manual-only, read-only, repo guard, secrets only in `signed` job via `testflight` environment on `main`, no binary artifact, `native-ios.yml` unchanged, runs the Python tests) | PASS |
| `archive.py --signing api-key` with no signing variables | PASS: exit 2, names the four missing inputs, created no output or products directory, built nothing |
| `archive.py --signing none --check-only` | PASS: toolchain allowlist, clean commit, export-option keys and `app-store-connect` method documented by the installed `xcodebuild -help` |
| `archive.py --signing xcode-account --check-only` with placeholder team `ABCDE12345` | PASS: `ExportOptions.plist` generated and `plutil -lint` OK; evidence copy redacted ([plist](ExportOptions.redacted.plist)) |
| `archive.py --signing none` (unsigned Release archive, `generic/platform=iOS`) | PASS: `** ARCHIVE SUCCEEDED **`, arm64 app with dSYM; merged Info.plist read back equals the profile: `staging`, `https://staging.go2china.space`, `knowledge_intent_v1`, `CFBundleVersion=20260923.133625`, `DTSDKName=iphoneos27.0`, `MinimumOSVersion=17.0` ([manifest](unsigned-build-manifest.json), [commands](unsigned-commands.jsonl)) |
| Signed Archive, `-exportArchive`, Distribution signature/profile checks | UNRUN: needs JT's team and API key or signed-in Xcode account |
| `Native iOS Archive` workflow on the runner | UNRUN: `workflow_dispatch` needs the file on `main`; first run after merge |
| App Store Connect upload, processing, TestFlight install on iPhone, Ask + Trip confirmation on device | UNRUN: operator work (X2), not performed by the repository |

Observed upload risks (not fixed here): no `PrivacyInfo.xcprivacy` in the app or the AMap SDK
while app code uses `UserDefaults` and `ProcessInfo.systemUptime`; CoreLocation is linked through
AMap without a location purpose string; `ITSAppUsesNonExemptEncryption` is not declared;
`amapDisplayKeyConfigured=false` (map address fallback). See runbook §1 and §6.
