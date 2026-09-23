# iOS signing, App Store Connect upload and TestFlight lifecycle

Related to [VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237) and its slice
[X1 #508](https://github.com/JTCAO515/VP-V4/issues/508). Sections 1–5 were first written in
PR421 (2026-09-16), which merged into the `testing-chat-vpv4` branch rather than `main`; X1
moves them to `main`, re-checks the upload requirements against Apple's page (2026-09-23) and
adds the repository Archive path (§0) and the ordered operator checklist (§6).

This file requests, stores or fabricates no credential. The repository performs signed Archive
and App Store Connect export only when JT's own signing material is present in the CI
environment or on the Mac; it never uploads. The first upload, the TestFlight install and the
observed result remain `OA-VPJ-56` (Class C) in [docs/operator-actions.json](../operator-actions.json).
[docs/contracts/vpj-56.md](../contracts/vpj-56.md) records the unsigned/ad-hoc Simulator CI.

## 0. Repository Archive path

`scripts/ios/archive.py` archives one clean commit with the Release configuration for
`generic/platform=iOS`, reusing `scripts/ios/ci.py`'s exact Xcode allowlist. Modes:

| `--signing` | Signing material | Result |
| --- | --- | --- |
| `none` | none | Unsigned device `.xcarchive`; proves the Release/device build, versions and installed Staging keys. Not installable or uploadable. |
| `api-key` | `VP_IOS_TEAM_ID`, `VP_ASC_KEY_ID`, `VP_ASC_ISSUER_ID`, and exactly one of `VP_ASC_KEY_P8` (key text) / `VP_ASC_KEY_PATH` (private file, mode 600) from the environment | Automatic signing via `-allowProvisioningUpdates` + App Store Connect API key, then `-exportArchive` with `method=app-store-connect`, `destination=export`. |
| `xcode-account` | `VP_IOS_TEAM_ID` from the environment; Apple ID signed in to Xcode → Settings → Accounts and identities in the login keychain | Same signed Archive/export using the Mac's own account. |

- **Fail-closed.** A signed mode with any missing/invalid variable exits 2 before any build and
  names only the missing variables, never values. There is no unsigned fallback. Signed modes
  also refuse a dirty working tree, so each Archive maps to exactly one commit.
- **Installed configuration.** The only source of the app's backend is the committed
  [`ios/VisePanda/Distribution/testflight-staging.json`](../../ios/VisePanda/Distribution/testflight-staging.json):
  `VP_NATIVE_ENVIRONMENT=staging`, `VP_NATIVE_STAGING_API_ORIGIN=https://staging.go2china.space`,
  `VP_NATIVE_TASK_CONTEXT=knowledge_intent_v1`. The script validates the origin with the same rule
  as `NativeSession.resolveEndpoint` (a unit test compares the host regex literal with the Swift
  source), passes the three values as build settings, then reads the archived app's merged
  Info.plist back and refuses on any mismatch. The custom origin is used because a physical
  iPhone timed out on `vercel.app` hosts on 2026-09-12
  ([evidence](../../artifacts/VPJ-04/iphone-custom-domain-20260912/verification.md)); which Preview
  deployment that domain serves is a Vercel-side decision recorded at upload time, not here.
- **Build number.** `CFBundleVersion` defaults to UTC `YYYYMMDD.HHMMSS` (e.g. `20260923.133625`):
  stateless, strictly increasing between runs, and each component far below 32-bit limits.
  `--build-number` overrides it (1–3 period-separated integers). `MARKETING_VERSION` stays the
  project value (`0.1.0`); the profile must match it. Export sets
  `manageAppVersionAndBuildNumber=false` so Xcode cannot silently change the number. Apple rejects
  a re-upload of an already used build number (§4); rerun instead of reusing one.
- **Checks after export.** Exactly one `.ipa`; its app is verified with `codesign --verify
  --strict --deep`, signed by an `Apple Distribution` identity, and its embedded profile has no
  device list, `get-task-allow=false`, `beta-reports-active=true` and the expected
  `TEAM.bundle-id`. The SDK must be iOS 26 or later (§1). Results go to `build-manifest.json`.
- **Evidence vs products.** `--output` holds logs, `commands.jsonl` and `build-manifest.json`
  with the team ID, key ID, issuer ID, key path and certificate holder names redacted.
  `--products` (a separate tree, enforced) holds DerivedData, the `.xcarchive`, the `.ipa` and a
  signed run's result bundle. A key passed as text is written to a 0600 file in a 0700 temp
  directory and deleted when the script exits.
- **Device SDK.** Device builds link the pinned AMap SDK; run `node scripts/maps/install-ios-sdk.mjs`
  first (the workflow does). No AMap display key is configured for this profile, so the map
  shows its address fallback; `build-manifest.json` records `amapDisplayKeyConfigured`.

Local commands (repository root, fresh directories):

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
node scripts/maps/install-ios-sdk.mjs
python3 scripts/ios/archive.py --signing none --output /tmp/vp-archive-ev --products /tmp/vp-archive-out
# Signed with the Mac's own Xcode account and login keychain (JT's Mac only):
VP_IOS_TEAM_ID=<team id> python3 scripts/ios/archive.py --signing xcode-account \
  --output /tmp/vp-signed-ev --products ~/Library/Developer/VisePanda/TestFlight/<name>
python3 -m unittest discover -s scripts/ios -p 'test_*.py'
```

`.github/workflows/native-ios-archive.yml` is manual (`workflow_dispatch`) only, has
`contents: read`, runs only for this repository on the existing `vp-v4-ios` self-hosted Mac and
never changes `native-ios.yml`. Job `unsigned` uses no secrets. Job `signed` runs only when
`signing=api-key` is dispatched on `main`, through the `testflight` GitHub Environment whose four
secrets JT creates; its `.ipa` stays on the runner Mac under
`~/Library/Developer/VisePanda/TestFlight/<run>-<attempt>` (delete old runs manually). Both jobs
upload only the evidence directory (14 days). A dispatch needs the workflow on the default branch,
so it cannot run before this PR merges.

## 1. Minimum SDK / Xcode requirement for upload

Apple's "Upcoming Requirements" page, re-read on 2026-09-23, lists for uploads to App Store
Connect (TestFlight included):

- **Since April 28, 2026**: built with **Xcode 26 or later** against the **iOS 26 SDK** or later.
  Older-SDK uploads fail at ingestion, before any review.
- **Since September 9, 2026**: iOS apps must **target iOS 13 or later** (this app targets 17.0).
- **Since May 1, 2024**: the app's code, including third-party SDKs, must declare approved
  reasons for any "required reason" API in a privacy manifest to upload a new or updated app.

Both Xcode builds in the CI allowlist (26.6/17F113 and 27.0/27A266a) meet the SDK floor; the
2026-09-23 local Archive recorded `DTSDKName=iphoneos27.0`. `archive.py` refuses an app whose
`DTSDKName` is below iOS 26.

**Known upload risk, not yet resolved:** neither the app nor the pinned AMap SDK ships a
`PrivacyInfo.xcprivacy` (checked in the 2026-09-23 Archive). App code uses `UserDefaults` and
`ProcessInfo.systemUptime`, which are required-reason API categories. Expect App Store Connect to
report ITMS-91053 or refuse the build until a privacy manifest with the correct reasons is added
and reviewed. The app also links CoreLocation through AMap without a location purpose string, a
possible ITMS-90683 notice. Neither is fixed by X1; they are named in §6.

Source: Apple Developer, "Upcoming Requirements" (<https://developer.apple.com/news/upcoming-requirements/>),
fetched 2026-09-23; the earlier SDK announcement is <https://developer.apple.com/news/?id=ueeok6yw>.
Reverify before each actual submission.

## 2. Actual upload path and its credential requirements

Two supported ways to get a signed `.ipa`/`.xcarchive` into App Store Connect exist; this
project's CI is script-driven, so the API-key path is the one to prepare for, not interactive
Xcode Organizer upload:

- **App Store Connect API key** (Issuer ID + Key ID + downloaded `.p8` private key). Created
  under App Store Connect → Users and Access → Integrations, by an account holder with
  sufficient role (Admin, or Account Holder). The `.p8` file is shown exactly once at creation
  time and cannot be re-downloaded — losing it means generating a new key, not recovering the
  old one.
- **Key role / scope**: grant the least role that does the job. "App Manager" covers builds,
  TestFlight and submission and is what an upload-only CI pipeline needs. This repository's
  `--signing api-key` mode also lets `xcodebuild -allowProvisioningUpdates` create or download
  certificates and profiles, so its key must be a **team key with the Admin role**; an App
  Manager or app-scoped key makes the signed Archive fail at provisioning, not silently skip it. An **app-scoped**
  key (scoped to specific apps rather than the whole team) cannot manage Certificates,
  Identifiers & Profiles — so if the same automation is also expected to provision/renew
  signing assets automatically (e.g. via `xcodebuild -allowProvisioningUpdates` or
  `fastlane match`), it needs a team-scoped key with a role that includes Certificates access,
  not an app-scoped one.
- **JWT mechanics**: the key signs a JWT with the Key ID in the header and the Issuer ID in the
  `iss` claim; that token has a maximum 20-minute lifetime and is sent as a Bearer token per
  request. Upload tooling (`xcrun altool`, `xcrun notarytool`, `xcodebuild -exportArchive`
  with API-key auth, or `fastlane pilot`/`deliver`) generates this per invocation from the
  three stored values — nothing longer-lived needs to be minted or cached.
- **Storage**: the Issuer ID, Key ID and `.p8` are secrets. They belong in this repository's
  existing secret-injection path (the same class of mechanism already used for
  `VISEPANDA_NATIVE_STAGING_PROOF_KEY` in
  [docs/runbooks/native-staging-s1.md](native-staging-s1.md)) — never committed, never printed
  in CI logs, never requested or pasted in chat. Generating and downloading the key itself is
  JT's action inside the Apple Developer account; this repository only consumes it once it
  exists in the secret store.

Source: fastlane docs, "Using App Store Connect API"
(<https://docs.fastlane.tools/app-store-connect-api/>) and Apple Developer key-scope behavior
as documented by third-party CI integrators (Appcircle, aso.dev), cross-checked against
fastlane's own key-role guidance, fetched 2026-09-16. Exact role names and their granted
permissions are Apple's to change in App Store Connect's UI; reverify against the live
Users and Access page at key-creation time rather than this snapshot.

## 3. Certificate and provisioning profile rotation

- An **Apple Distribution certificate** (the certificate used to sign a release/TestFlight
  build) has a validity window set by Apple at issuance (commonly cited as around one year for
  Distribution certificates, versus a longer window for the Enterprise Program's certificate);
  this repository has not independently confirmed the exact current duration against a live
  Apple Developer account, so treat the precise expiry as **unknown / reverify at issuance**
  rather than assume a fixed number.
- You **cannot renew an expired certificate in place** — Apple's guidance is to revoke it (if
  not already expired) and create a new one, then create new provisioning profiles that
  reference the new certificate. An expiring-soon certificate should be rotated proactively:
  create the replacement certificate and profiles before the old ones lapse, so CI never has a
  gap with no valid signing identity.
- **Effect of expiry/revocation on already-uploaded builds**: apps already live on the App
  Store are unaffected. Builds already sitting in App Store Connect but not yet submitted for
  review, if they were signed with a certificate that is later revoked, may be marked
  **Invalid Binary** and need re-signing and re-upload. You simply cannot sign or upload new
  builds with an expired/revoked certificate until it is rotated.
- **Provisioning profile**: expires independently of the certificate (commonly a shorter
  window) and must reference a currently-valid Distribution certificate; renewing it after a
  certificate rotation is a separate, required step — a profile built against a revoked
  certificate is itself invalid even if its own expiry date hasn't passed.
- Xcode's "automatically manage signing" / cloud-managed certificates can handle rotation
  without a human manually generating each artifact, but this still requires the operator's
  Apple ID/team membership to authorize; it is not something CI can bootstrap unattended
  without that prior authorization existing.

Source: Apple Developer, "Certificates overview"
(<https://developer.apple.com/support/certificates/>) and community-documented renewal
mechanics (Apple Developer Forums threads on distribution certificate/provisioning profile
renewal), fetched 2026-09-16. The exact validity-period durations are Apple's to set and were
not independently re-verified against a live account for this repository; do not treat the
"around one year" figure above as authoritative without checking the actual certificate at
rotation time.

## 4. Build failure and withdrawal paths

- **Processing/Invalid Binary failures** at App Store Connect ingestion (as opposed to App
  Review rejections) are typically caused by: SDK below the current minimum (§1), an
  expired/revoked signing certificate (§3), a duplicate/non-incrementing build number, missing
  export-compliance declaration, or a malformed `Info.plist`/entitlements mismatch against the
  provisioning profile. The fix in every case is a new upload with a new build number — Apple
  does not accept a patched re-upload of the same build number.
- **Withdrawing a build from testing**: an already-distributed TestFlight build can be expired
  (stops new installs/updates for testers, existing installs keep running until their own
  90-day build expiry) from the build's detail page in App Store Connect; this does not delete
  the underlying binary from Apple's systems, it only stops further distribution.
- **Recall from App Review**: a build submitted for review can be removed from the review
  queue before Apple actions it; once "Ready for Sale"/released, withdrawal from the App Store
  itself is a separate, more consequential action than a TestFlight expiry and is out of scope
  for this Issue's TestFlight-only acceptance criterion.
- None of the above requires new source code changes; they are App Store Connect UI/API
  operator actions taken against an already-uploaded build. This repository's CI records the
  exact command, environment and toolchain per run (see
  [docs/contracts/vpj-56.md](../contracts/vpj-56.md)) precisely so a failed upload can be
  correlated back to an exact commit/toolchain without guessing.

## 5. What remains operator-only

This runbook records requirements and procedure; it does not and cannot substitute for:

- Actually holding/using JT's Apple Developer Program membership and Apple ID.
- Generating the App Store Connect API key, Distribution certificate, or provisioning profile.
- Storing the resulting secrets in this repository's secret-injection path.
- Performing the first real signed Archive → upload → TestFlight install, and observing the
  actual result (this is `OA-VPJ-56`'s remaining scope, still Class C / `ready-for-human`).

Nothing in this file grants build/release authority or claims a completed upload.

## 6. Ordered operator checklist for the first TestFlight build (JT)

Each item is done by JT in Apple/GitHub UIs. Never paste any value into chat, an Issue, a PR or
a commit.

1. **Apple Developer Program membership** active for the team that will own
   `space.go2china.VisePanda`; note its 10-character **Team ID** (Membership details).
2. **Bundle ID**: confirm `space.go2china.VisePanda` is registered to that team
   (Certificates, Identifiers & Profiles → Identifiers). It was used for a signed development
   install on 2026-09-12, so it may already exist; automatic signing registers it otherwise.
3. **App Store Connect app record**: Apps → + → New App, platform iOS, bundle ID above, SKU and
   primary language of JT's choosing. Upload fails without this record.
4. **Signing authority**, one of:
   - CI: App Store Connect → Users and Access → Integrations → Team Keys → generate a key with
     the **Admin** role (§2). Download the `.p8` once; note Key ID and Issuer ID.
   - This Mac only: sign in to Xcode → Settings → Accounts with an Admin/Account Holder Apple
     ID of the team, then use `--signing xcode-account`.
   Automatic signing uses Apple's cloud-managed Apple Distribution certificate when the account
   is allowed to; otherwise it creates one. If the Archive step reports that the team has no
   devices for its development profile, register the test iPhone in the portal once.
5. **GitHub Environment `testflight`** (Settings → Environments): deployment branches limited to
   `main`, JT as required reviewer, and environment secrets named exactly
   `VP_IOS_TEAM_ID`, `VP_ASC_KEY_ID`, `VP_ASC_ISSUER_ID`, `VP_ASC_KEY_P8` (entire `.p8` text).
6. **Pre-upload app decisions** (repository changes, need review): a privacy manifest for the
   required-reason APIs (§1); whether to declare `ITSAppUsesNonExemptEncryption` (the build
   currently does not, so App Store Connect asks export compliance per build); location purpose
   string if Apple reports ITMS-90683; Staging server/worker readiness for Ask and Trip
   confirmation on `staging.go2china.space`.
7. **Build**: after merge, Actions → Native iOS Archive → Run workflow on `main` with
   `signing=api-key` (approve the environment), or run `archive.py` locally. Check the uploaded
   `build-manifest.json`: `exported=true`, no problems, expected build number and commit.
8. **Upload** (not done by the repository): from the runner Mac, upload the `.ipa` under
   `~/Library/Developer/VisePanda/TestFlight/<run>-<attempt>/export/` with Transporter, or
   `xcrun altool --upload-app -f <ipa> -t ios --apiKey <Key ID> --apiIssuer <Issuer ID>` with the
   `.p8` in `~/.appstoreconnect/private_keys/`. Wait for processing; answer export compliance.
9. **TestFlight internal group**: TestFlight → Internal Testing → create a group (e.g.
   "VisePanda internal"), add team members with App Store Connect access, add the processed
   build. Internal testing needs no Beta App Review; external groups do.
10. **Install and record** on the physical iPhone via the TestFlight app: bundle/version/build,
    commit, backend origin, device/iOS version and the observed Ask and Trip confirmation
    result, in `artifacts/VPJ-56/` (X2). This proves distribution only, not the complete product.
