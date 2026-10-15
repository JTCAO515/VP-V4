# Controlled sample unsigned device Archive

Related to #237 / #508. Local packaging scope complete; no Issue closure, signing, account,
export, upload, invitation or App Store release action was performed by this owner.

## Exact source and result

- Base checkpoint: `ff936a93140032f7972a703ad6f74ae9a98ed367` (Main's controlled Root plus accepted PR716 source).
- Stable driver: `fe6643b8a24f378b410fa2e5646379b12a1eb415`; Xcode JSON projection fix: `66890359f84e67bc26572f25ac45dcf5bd0c65c7`.
- Actual tested source: `66890359f84e67bc26572f25ac45dcf5bd0c65c7`, clean before/after; all 666 input hashes unchanged.
- Archive and postchecks: **PASS**, 2026-10-15 12:05:36–12:07:58 UTC.
- Bundle `space.go2china.VisePanda`, version `0.1.0 (20261015.120536)`.
- Actual `DTSDKName=iphoneos27.0`, Xcode `27A266a`, minimum OS `17.0`, Release / generic iOS device / arm64 compilation.
- Merged `VisePandaNativeEnvironment`, `VisePandaStagingAPIOrigin`, `VisePandaNativeTaskContext`: all exactly empty.
- `VP_CONTROLLED_SAMPLE` effective on app and ShareIntakeExtension. Extension retained with matching build number.
- No `_CodeSignature`, embedded provisioning profile or Mach-O `LC_CODE_SIGNATURE` in app/extension. **Unsigned; not installable or uploadable.**

Machine-readable success: [manifest](evidence-20261015T1303-b9e2/manifest.json).
It records exact input/profile/SDK hashes, effective build settings, actual compiled rollout
results, merged metadata, privacy manifest summary/hash, permission strings and executable hashes.
Xcode omits explicitly empty user settings from its JSON projection; the manifest records that
omission and the final merged Info.plist independently proves all three empty values.

Local-only Archive (not committed):
`/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/testflight-sample-package-20261015/artifacts/IOS-TESTFLIGHT/controlled-20261015/products-20261015T1303-b9e2/VisePanda.xcarchive`.
The sibling products tree also retains `archive.log`, `archive.xcresult`, isolated DerivedData
and Foundation compilation checks. Products are separate from the committed evidence tree.

## Validation and retained failure

- **PASS**: `python3 tests/contract/ios-controlled-testflight/test_archive.py` (7 tests), Python syntax, diff whitespace checks.
- **PASS**: actual declaration extracted from AppShell, compiled with Foundation and executed in four modes: controlled Release, ordinary Release, ordinary Debug, controlled Debug. Seven argument cases include legacy/real-service escapes and the experience opt-in. Controlled builds return true in every case; ordinary defaults remain unchanged. This checks the actual product definition, not a copied algorithm.
- **PASS**: both original installer SHA pins and all 282 extracted framework files match the pinned official SDK archives in this owner's worktree.
- **PASS**: app privacy manifest and existing approved required-reason categories, localized en/zh-Hans location purpose strings, merged location/microphone/speech strings; empty AMap credential.
- **PASS**: separate disposable Git fixture exercised actual clean input hashing and dirty-source refusal; invalid nonempty backend and missing flag profiles refused. [Results](negative-20261015-b9e2/results.json).
- **FAIL retained, repaired**: first `fe6643b8` preflight treated Xcode's absent JSON empty-value entries as mismatches; Archive never started. [Original manifest](evidence-20261015T1251-a7c9/manifest.json). Diagnosed with actual selected settings, fixed in `66890359`, then ran the successful Archive above in fresh outputs. No blind build retry.
- **Observed warnings**: pinned AMap SDK umbrella header omissions (6 warning occurrences), unavailable vendor build-machine debug object paths during dsymutil (4091), existing trailing closure warnings (14), duplicate project group membership (4), and skipped App Intents metadata extraction (2). Archive still succeeded. No SDK, product or project source was modified to suppress these warnings; complete raw log remains in the local products tree.
- **PASS**: `node scripts/docs-check.mjs`.
- **FAIL, unrelated inherited diff**: default `node scripts/check-artifact-growth.mjs` compared the old local `origin/main` merge-base and counted 5.56 MB from prior AGENT/IOS/QA work. No threshold or shared evidence was changed. The actual Main checkpoint-to-delivery evidence size is checked separately with the script's documented `VP_CI_BASE` / `VP_CI_HEAD` inputs.
- **PASS, scoped artifact growth**: `VP_CI_BASE=ff936a93140032f7972a703ad6f74ae9a98ed367 VP_CI_HEAD=9a6f30fa4624a4f4abfb033b706c6c0772fc8e40 node scripts/check-artifact-growth.mjs`: +0.21 MB, below the unchanged 5 MB limit.

Reproduction is documented in [the driver README](../../../../scripts/ios/controlled-testflight/README.md).
Use a clean exact commit and fresh output nonce; no signing/export/upload mode exists.

## Limits and ownership

**UNRUN in this line**: simulator UI, physical device, ASR behavior, provider, GoTrue, database,
signed Archive/export, upload, external review and public link. Main independently owns the
Release Simulator evidence and all signing/account/profile/agreement/TestFlight actions.
No signature/profile gap was worked around and the ShareIntakeExtension was not removed.
SDK/tool availability and a compiled local sample do not demonstrate real-service acceptance.

Actual local tools: Xcode 27.0 / `27A266a`, Python 3.9.6 and Node available; full filesystem
and network access, approval policy never. No credentials or real user data were read by this line.
Requested model/effort: Sol6.1 / medium; effective model/effort not exposed, **UNKNOWN**.
Official `list_threads` readback confirms this chat `01a13f55-8f6b-7620-9554-82f0de225d6b`
belongs to VP-V10 project ID `4f2191db-3e04-4042-94b5-ec94ff67b427`.

## Fixed review follow-up: SDK and extension postchecks

Validator source `2976e8594d4d243eef6e21873df2e2e34a7d9238` closes the two reviewed gaps:
successful future runs revalidate both pinned SDK ZIPs and every extracted framework file
before success, compare with the prebuild result, and record `sdkAfter`. Archived extension
metadata now checks its exact bundle identifier, marketing/build versions, minimum OS,
device platform/SDK, empty-or-absent backend keys and absent/empty AMap credential, recording
`extensionInfo`. Build commands and product inputs are unchanged.

- **PASS**: 9 contract tests, including extension wrong ID/version/minimum OS/platform/SDK,
  each nonempty backend key and AMap credential; real disposable SDK ZIP and extracted-file
  mutations after a passing precheck are refused by the postcheck.
- **PASS**: new validator and post-SDK check on the preserved actual `66890359` Archive and
  owner's SDK. App/extension executable and Info.plist hashes exactly match the original
  success manifest, which remains unchanged. The extension has the expected identifier,
  version `0.1.0 (20261015.120536)`, iOS 17 minimum, device SDK 27; all four backend/AMap
  metadata keys are absent, as permitted. [Detailed postcheck result](postcheck-review-2976e859.json).
- The 666 original inputs were compared: only the driver and its tests differ. No Archive
  rebuild occurred and no new-head compilation or runtime acceptance is claimed.
