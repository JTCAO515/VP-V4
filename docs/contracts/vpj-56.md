# VPJ-56 native CI v2 — unsigned build and ad-hoc tests

Related to #237. This Class A preparation slice consumes the native project merged
in PR258; it does not complete VPJ-01 device acceptance or VPJ-56 signed distribution.
[Scope](../../artifacts/VPJ-56/scope.md) records frozen inputs and ownership.

`.github/workflows/native-ios.yml` runs on relevant pull requests and workflow_dispatch.
It has contents:read only, no persisted checkout credential and no production secrets.
The existing Quality PR workflow and branch protections remain independent.

Runner: `macos-26` (standard arm64); selected Xcode:
`/Applications/Xcode_26.6.app/Contents/Developer`, exact 26.6 / 17F113.
Runtime: installed iOS 26.5; device: iPhone 17 Pro. The script discovers its actual
UDID and records the complete executable command. Missing tools/runtime fail without
upgrading, downloading a runtime or substituting another device.

Verified against the official [image catalog](https://github.com/actions/runner-images/blob/57fdccbc4a47d85e23cc79eaeb63cb8ae0e997b5/README.md)
and [macOS 26 arm64 inventory](https://github.com/actions/runner-images/blob/57fdccbc4a47d85e23cc79eaeb63cb8ae0e997b5/images/macos/macos-26-arm64-Readme.md),
image 20260831.0337.3, read 2026-09-09. GitHub updates the OS image behind the stable
label; the exact Xcode build/runtime checks prevent silent toolchain substitution.
ImageVersion and commit are captured for each execution; this is not an immutable VM pin.

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
This isolates the runner-image device state and separates boot from compilation after
observed audit-service timeouts and App-launch/background-assertion failures. These remain
recorded infrastructure failures; the change does not filter, retry or weaken tests.
The existing UI suite audits structure at maximum
Dynamic Type; it is not complete VoiceOver, contrast, dark-mode or physical-device acceptance.
All fixture/unavailable capability boundaries remain in force.

Artifacts are retained 14 days, including command argv/cwd/DEVELOPER_DIR/timestamp/exit,
logs, environment, bundle versions, build.xcresult and tests.xcresult when produced.
Upload runs on failure too; unavailable outputs are not fabricated. DerivedData, apps,
keychains and signing stores are excluded. Workflow cancellation may prevent final upload.

Run locally using the same Xcode version:
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer python3 scripts/ios/ci.py --output /tmp/vpj-56-new-run`.
Use a fresh output path; `--preflight` inspects only toolchain/project/devices and records
that limited outcome. It does not claim build or test success.

Revert this isolated CI change to roll back. Certificate rotation, Archive signing,
App Store Connect upload/SDK requirements, TestFlight install and withdrawal procedures
remain named operator work before signed distribution; no credentials are requested here.
