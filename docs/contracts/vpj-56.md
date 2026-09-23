# VPJ-56 native CI v2 — unsigned build and ad-hoc tests

Related to #237. This Class A preparation slice consumes the native project merged
in PR258; it does not complete VPJ-01 device acceptance or VPJ-56 signed distribution.
[Scope](../../artifacts/VPJ-56/scope.md) records frozen inputs and ownership.

`.github/workflows/native-ios.yml` runs on relevant pull requests and workflow_dispatch.
It has contents:read only, no persisted checkout credential and no production secrets.
The existing Quality PR workflow and branch protections remain independent.

Runner labels: `[self-hosted, macOS, ARM64, vp-v4-ios]`; the registered Mac
`vp-v4-ios-local` (runner ID21) was verified online with these exact labels before
changing the workflow. The job ID remains `simulator`. Selected Xcode:
`/Applications/Xcode.app/Contents/Developer`, exact 26.6 / 17F113 or 27.0 / 27A266a.
The 2026-09-15 pin moved to27.0 after one Mac upgraded, but PR478 run35655888102
on2026-09-22 observed26.6 on the actual selected runner and failed before tests.
Both previously validated installations are now explicitly accepted; unknown
version/build pairs still fail, with no automatic upgrade or executable fallback.
The selected version is recorded in each job's environment evidence.
Runtime: installed iOS 26.5; device: iPhone 17 Pro. The script discovers its actual
UDID and records the complete executable command. Missing tools/runtime fail without
upgrading, downloading a runtime or substituting another device.

The Mac's runner PATH resolves Python3.14.7 and Xcode27.0/27A266a; iOS26.5/23F77
and the required reference device were verified locally. Each actual job must still pass
the script's strict preflight; host inspection alone is not runner-job acceptance.
ImageVersion can be absent on this self-hosted machine; Xcode/runtime and commit remain
recorded. The former hosted-image evidence remains historical, not current runner proof.

Native tests execute on this Mac rather than consuming GitHub-hosted macOS runner
minutes. Linux Quality/Budget workflows are unchanged. The owner must keep the Mac
and runner online in a usable logged-in macOS session. When it is offline, the job waits
for a matching runner; there is no hosted-macOS fallback or manufactured success status.
Existing branch protection is not modified. A passing `simulator` check on the exact PR
head is still required before the authorized merge.
The Native command uses an explicitly quoted shell-script placeholder because this
runner's installation path contains spaces. Bash still exits on failures and failed
pipelines; this changes path handling, not test execution or acceptance.

The job builds an unsigned Simulator app, extracts bundle identifier/marketing/build
versions, then runs every test in the shared scheme with a local ad-hoc signature
(`CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`), without test filters or retries.
The ad-hoc test host can exercise the real Keychain; an unsigned host returns
`errSecMissingEntitlement` (-34018) before the new account-race assertions can run.
This was reproduced on the same source/device with unsigned failure and ad-hoc success.
The script verifies the resulting ad-hoc signature and records it separately from
distribution signing. It uses no Apple certificate, account, provisioning update or profile.
Compilation and testing are separate stages. After `build-for-testing`, the runner creates
one owned temporary Simulator of the same pinned iPhone17Pro/iOS26.5 type and waits for
`simctl bootstatus -b` before `test-without-building`. It deletes only that created device
in cleanup, including after test failure; it never erases or reuses a user's existing device.
This isolates the machine's existing device state and separates boot from compilation after
observed audit-service timeouts and App-launch/background-assertion failures. These remain
recorded infrastructure failures; the change does not filter, retry or weaken tests.
The existing UI suite audits structure at maximum
Dynamic Type; it is not complete VoiceOver, contrast, dark-mode or physical-device acceptance.
All fixture/unavailable capability boundaries remain in force.

Artifacts are retained 3 days, including command argv/cwd/DEVELOPER_DIR/timestamp/exit,
logs, environment, bundle versions, build.xcresult and tests.xcresult when produced.
Upload runs on failure too; unavailable outputs are not fabricated. DerivedData, apps,
keychains and signing stores are excluded. Workflow cancellation may prevent final upload.

Run locally using the same Xcode version:
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer python3 scripts/ios/ci.py --output /tmp/vpj-56-new-run`.
Use a fresh output path; `--preflight` inspects only toolchain/project/devices and records
that limited outcome. It does not claim build or test success.

If the runner is unavailable, restore its availability or make an explicitly reviewed
self-hosted configuration correction; do not silently revert to billed hosted macOS.
Certificate rotation, Archive signing,
App Store Connect upload/SDK requirements, TestFlight install and withdrawal procedures
remain named operator work before signed distribution; no credentials are requested here.
The current requirements and procedure for that operator work — upload SDK/target/privacy
manifest requirements, App Store Connect API key scope, certificate/profile rotation and
build-failure/withdrawal paths — are in
[docs/runbooks/ios-signing-and-testflight.md](../runbooks/ios-signing-and-testflight.md).

## Archive path (X1, #508)

`scripts/ios/archive.py` and the manual-only `.github/workflows/native-ios-archive.yml` add a
Release device Archive on the same runner and Xcode allowlist. This does not change the
`simulator` job, its triggers or its evidence. Unsigned mode needs no Apple material. Signed modes
read the team ID and App Store Connect API key only from the environment (the `testflight`
GitHub Environment on `main`) or use the Mac's own Xcode account/login keychain, refuse before
building when anything is missing, export an `app-store-connect` ipa and never upload. The
installed backend comes only from `ios/VisePanda/Distribution/testflight-staging.json`, checked
against `NativeSession` and read back from the archived Info.plist. `CFBundleVersion` defaults to
UTC `YYYYMMDD.HHMMSS`. Evidence uploads exclude every archive, ipa and signed result bundle and
redact signing identifiers. Governance test `tests/unit/governance/native-ios-archive.test.mjs`
runs the Python unit tests in Quality PR. See the runbook §0 and §6 and
[X1 verification](../../artifacts/VPJ-56/signed-archive-20260923/verification.md).
