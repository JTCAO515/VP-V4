# VPJ-34 Q2 verification — 2026-09-26

Base: GitHub `main` `cfaa5b187df4f361f94f92637e0a205041ddd023`.
Scope: #503, parent #226 remains OPEN. This is code preparation and local checks,
not an official Sandbox purchase or deployed acceptance.

## Result and checks

- Implemented: official Apple Sandbox JWS verification plus current Apple API
  readback, account-token/SKU/environment binding, service-role-only grant
  ledger with 720h periods and frozen VPJ-33 capacity snapshot, native purchase
  entry and native/Web readback from one RLS table. Default activation is off.
- PASS: `./node_modules/.bin/tsc --noEmit`.
- PASS: `node scripts/lint.mjs` (388 source files).
- PASS: `node --test tests/static-output.test.mjs tests/design/web-06-foundation.test.mjs` (22/22).
- PASS: final `node scripts/run-ci-suite.mjs contract` (679/679, zero skipped).
- PASS: `node --experimental-strip-types --test tests/contract/entitlements/storekit-runtime-target.test.mjs tests/contract/entitlements/storekit-sandbox.test.mjs` (4/4, including future Production-config rejection).
- PASS: `node --test tests/security/assets/web-04-asset-policy.test.mjs` (4/4, after SBOM update).
- PASS: `node scripts/generate-design-tokens.mjs` and `./node_modules/.bin/next build --webpack`.
- PASS: `node scripts/docs-check.mjs` and `git diff --check`.
- PASS: `swiftc -frontend -parse` on the two changed Swift files. This is syntax only.
- PASS: unrestricted Xcode 27 Debug generic iOS Simulator build after the
  owner-switch state fix, plus iPhone 15 Pro iOS 17.5 targeted
  `NativeSessionIntegrationTests.testJourneyPassStateIsHiddenAcrossAccountOrSessionGeneration`
  (1/1 in xcresult). The build includes the final
  `VerificationResult.jwsRepresentation` source (`-derivedDataPath
  /private/tmp/vpj34-main-build CODE_SIGNING_ALLOWED=NO`), run by the main
  coordination task. First unrestricted run found a StoreKit API typo, which
  was corrected before this PASS. No device purchase or UI run is implied.
- FAIL, environment-limited: the initial build inside this sandbox could not
  run SwiftUI/Observation macro plugins (`swift-plugin-server` malformed
  response; CoreSimulatorService unavailable).
- FAIL, environment-limited: full `test:security` had five remaining tests
  unable to bind `127.0.0.1` or launch hosted worker in this sandbox. Two
  SBOM asset failures caused by the new dependency were fixed and its affected
  tests passed on rerun. This is not a security-suite PASS.
- PASS: unrestricted `node scripts/ci-suites/db-integration.mjs --lane
  supabase-rls`, rerun after the final service-role ACL change: 11 files,
  17/17 tests, zero skipped, including the new ledger RLS/idempotency/
  concurrency/revocation/erasure and direct-INSERT-denial test. The first lane
  setup failed while Docker was stopped; reruns after Docker startup passed.
  This disposable database is not the shared Staging environment.
- FAIL, environment-limited: local `initdb` inside this sandbox failed at
  `shmget: Operation not permitted` before the unrestricted DB run above.
- UNRUN: official Apple Sandbox transaction, durable Staging migration,
  native plus Web readback and TestFlight/device observation.
- PASS: included public `AppleRootCA-G3.cer` SHA-256
  `63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179`
  matches a fresh download from Apple's PKI certificate authority page;
  subject and issuer are Apple Root CA - G3.

## Target-environment inputs

VPJ-33 catalog still has `storeKitProductId=null`, `saleState=development_only`
and `purchasable=false`. To run the official Sandbox path, identify and approve
the App Store Connect non-renewing Sandbox SKU for bundle
`space.go2china.VisePanda`, prepare a permitted Sandbox tester/device, install
the Staging migration in the approved database window, and configure the
server-only Apple App Store Server API credentials and bounded Staging service
key listed in `docs/contracts/vpj-34.md`. Then enable only the Staging feature
flag and observe one transaction ID, one owner, one trusted purchase time,
one 720h period and matching native/Web grant IDs. Keep local `.storekit` tests
separate from this evidence. Production payments and Paid Apps Agreement are
outside this slice.

Rollback: disable `VISEPANDA_STOREKIT_SANDBOX_ENABLED` and remove the consumer
entry if needed. Keep the append-only migration and transaction tombstones;
never revive erased or revoked grants.
