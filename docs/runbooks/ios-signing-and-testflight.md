# iOS signing, App Store Connect upload and TestFlight lifecycle

Related to [VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237)'s third acceptance
bullet ("记录实际上传SDK要求和证书轮换/构建失败/撤回路径"). This is a documentation-only
preparation slice: it records the actual, currently published Apple requirements and the
runbook steps an operator with a real Apple Developer Program account follows. It requests,
stores or fabricates no credential, and it does not perform signing, upload or withdrawal.
[docs/contracts/vpj-56.md](../contracts/vpj-56.md) records the unsigned/ad-hoc native CI this
slice builds on; that CI produces no distribution artifact and needs no Apple account.

Signed Archive creation, App Store Connect upload and the first installable TestFlight build
remain named operator work — see `OA-VPJ-56` in [docs/operator-actions.json](../operator-actions.json).
This runbook is the reference that action now points to; it does not close it.

## 1. Minimum SDK / Xcode requirement for upload

Apple's published "Upcoming Requirements" page states that **starting April 28, 2026**, every
app or update uploaded to App Store Connect — including TestFlight-only builds, not only App
Store submissions — must be built with **Xcode 26 or later against the iOS 26 / iPadOS 26 SDK
(or the corresponding tvOS 26 / visionOS 26 / watchOS 26 SDK for those platforms)**. Builds made
with an older SDK are rejected by App Store Connect's ingestion, not by App Review — the upload
itself fails before any human review step.

This repository's self-hosted native CI runner ([docs/contracts/vpj-56.md](../contracts/vpj-56.md))
is already pinned to Xcode 27.0/27A266a, which post-dates this floor, so the unsigned/ad-hoc CI
build already satisfies the SDK requirement; a signed Archive built on the same pinned toolchain
would too. This does not change when the pin itself needs to move again as Apple ships newer
Xcode versions — track that in `docs/contracts/vpj-56.md`, not here.

Source: Apple Developer, "Upcoming SDK minimum requirements"
(<https://developer.apple.com/news/?id=ueeok6yw>), fetched 2026-09-16. The exact date and SDK
floor are Apple's to change; reverify against that page before relying on it for an actual
submission, rather than trusting this snapshot indefinitely.

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
  TestFlight and submission and is what an upload-only CI pipeline needs. An **app-scoped**
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

Nothing in this file grants build/release authority, changes CI signing behavior, or claims a
completed upload. It closes the documentation gap named in VPJ-56's third acceptance bullet;
the first real signed distribution remains a separate, unrun, operator-gated step.
